//! Handing compiled rules to the platform's content blocker.
//!
//! The engine enforces these itself, in the network path, before a request
//! leaves the process — the same mechanism Safari content blockers use. No
//! extension host is involved, which is what makes it work on the webviews
//! this app already embeds.

/// Identifier the compiled rule list is stored under. WebKit keeps compiled
/// lists on disk keyed by this, so compilation happens once rather than on
/// every launch.
pub const RULE_LIST_ID: &str = "fmhy-content-blocker";

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::c_void;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_foundation::{NSError, NSString};
    use objc2_web_kit::{WKContentRuleList, WKContentRuleListStore, WKWebView};

    use super::RULE_LIST_ID;

    /// Compile rules into WebKit's on-disk store.
    ///
    /// Compilation is asynchronous and can take seconds for a large list, so
    /// this returns immediately and reports through the callback. Must be
    /// called on the main thread.
    pub fn compile(
        _store_dir: &std::path::Path,
        json: &str,
        done: impl Fn(Result<(), String>) + 'static,
    ) {
        let Some(mtm) = MainThreadMarker::new() else {
            done(Err("content blocker must be compiled on the main thread".into()));
            return;
        };
        let Some(store) = (unsafe { WKContentRuleListStore::defaultStore(mtm) }) else {
            done(Err("no default content rule list store".into()));
            return;
        };

        let identifier = NSString::from_str(RULE_LIST_ID);
        let encoded = NSString::from_str(json);

        let handler = RcBlock::new(move |list: *mut WKContentRuleList, error: *mut NSError| {
            if !error.is_null() {
                let message = unsafe { (*error).localizedDescription() }.to_string();
                done(Err(message));
            } else if list.is_null() {
                done(Err("compiler returned no rule list".into()));
            } else {
                done(Ok(()));
            }
        });

        unsafe {
            store.compileContentRuleListForIdentifier_encodedContentRuleList_completionHandler(
                Some(&identifier),
                Some(&encoded),
                Some(&handler),
            );
        }
    }

    /// Attach the compiled list to a webview.
    ///
    /// Looks the list up from the store rather than holding it in memory, so a
    /// webview created long after startup still gets the rules. Must be called
    /// on the main thread; `webview` must be a live `WKWebView`.
    pub unsafe fn attach(webview: *mut c_void) {
        if webview.is_null() {
            return;
        }
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(store) = (unsafe { WKContentRuleListStore::defaultStore(mtm) }) else {
            return;
        };

        // Retain for the duration of the lookup: the callback is asynchronous
        // and the webview must not be freed underneath it.
        let Some(webview) = (unsafe { Retained::retain(webview as *mut WKWebView) }) else {
            return;
        };

        let identifier = NSString::from_str(RULE_LIST_ID);
        let handler = RcBlock::new(move |list: *mut WKContentRuleList, error: *mut NSError| {
            if !error.is_null() || list.is_null() {
                // Not compiled yet, or blocking is off. The page still loads.
                return;
            }
            let list = unsafe { &*list };
            let controller = unsafe { webview.configuration() }.userContentController();
            unsafe { controller.addContentRuleList(list) };
        });

        unsafe {
            store.lookUpContentRuleListForIdentifier_completionHandler(
                Some(&identifier),
                Some(&handler),
            );
        }
    }

    /// Drop every rule list from a webview, so blocking can be turned off
    /// without recreating it.
    pub unsafe fn detach(webview: *mut c_void) {
        if webview.is_null() {
            return;
        }
        let Some(webview) = (unsafe { Retained::retain(webview as *mut WKWebView) }) else {
            return;
        };
        let controller = unsafe { webview.configuration() }.userContentController();
        unsafe { controller.removeAllContentRuleLists() };
    }
}


#[cfg(target_os = "linux")]
mod imp {
    use std::ffi::{c_void, CString};
    use std::path::Path;

    use glib::translate::{FromGlibPtrFull, ToGlibPtr};
    use webkit2gtk::{WebView, WebViewExt};

    use super::RULE_LIST_ID;

    /// Save the rules into WebKitGTK's filter store.
    ///
    /// The store compiles the JSON to its own on-disk format, so this cost is
    /// paid once rather than per launch. `webkit2gtk` exposes no safe bindings
    /// for the store, hence the raw calls.
    pub fn compile(store_dir: &Path, json: &str, done: impl Fn(Result<(), String>) + 'static) {
        if std::fs::create_dir_all(store_dir).is_err() {
            done(Err("could not create filter store directory".into()));
            return;
        }
        let Ok(path) = CString::new(store_dir.to_string_lossy().as_bytes()) else {
            done(Err("filter store path is not valid".into()));
            return;
        };
        let Ok(identifier) = CString::new(RULE_LIST_ID) else {
            done(Err("invalid rule list identifier".into()));
            return;
        };

        let bytes = glib::Bytes::from(json.as_bytes());

        unsafe {
            let store = webkit2gtk_sys::webkit_user_content_filter_store_new(path.as_ptr());
            if store.is_null() {
                done(Err("could not open the filter store".into()));
                return;
            }

            // The closure is handed to C as user_data and reclaimed by the
            // trampoline, which runs exactly once.
            let boxed: Box<Box<dyn Fn(Result<(), String>)>> = Box::new(Box::new(done));

            // `to_glib_none` is generic over the pointer type, so the impl is
            // named explicitly. The stash is bound to keep it alive across the
            // call rather than dropping at the end of the expression.
            let stash = ToGlibPtr::<*const glib::ffi::GBytes>::to_glib_none(&bytes);

            webkit2gtk_sys::webkit_user_content_filter_store_save(
                store,
                identifier.as_ptr(),
                stash.0 as *mut glib::ffi::GBytes,
                std::ptr::null_mut(),
                Some(save_finished),
                Box::into_raw(boxed) as *mut c_void,
            );
        }
    }

    unsafe extern "C" fn save_finished(
        source: *mut glib::gobject_ffi::GObject,
        result: *mut gio::ffi::GAsyncResult,
        user_data: *mut c_void,
    ) {
        let callback: Box<Box<dyn Fn(Result<(), String>)>> =
            unsafe { Box::from_raw(user_data as *mut _) };

        let mut error = std::ptr::null_mut();
        let filter = unsafe {
            webkit2gtk_sys::webkit_user_content_filter_store_save_finish(
                source as *mut _,
                result,
                &mut error,
            )
        };

        if !error.is_null() {
            let message = unsafe { glib::Error::from_glib_full(error) }.to_string();
            callback(Err(message));
        } else if filter.is_null() {
            callback(Err("filter store returned nothing".into()));
        } else {
            callback(Ok(()));
        }
    }

    /// Load the saved filter and apply it to a webview.
    pub fn attach(webview: &WebView) {
        let Some(manager) = webview.user_content_manager() else {
            return;
        };
        let Ok(identifier) = CString::new(RULE_LIST_ID) else {
            return;
        };

        // The store path is derived the same way as at save time.
        let Some(dir) = store_dir() else { return };
        let Ok(path) = CString::new(dir.to_string_lossy().as_bytes()) else {
            return;
        };

        unsafe {
            let store = webkit2gtk_sys::webkit_user_content_filter_store_new(path.as_ptr());
            if store.is_null() {
                return;
            }
            let boxed: Box<webkit2gtk::UserContentManager> = Box::new(manager);
            webkit2gtk_sys::webkit_user_content_filter_store_load(
                store,
                identifier.as_ptr(),
                std::ptr::null_mut(),
                Some(load_finished),
                Box::into_raw(boxed) as *mut c_void,
            );
        }
    }

    unsafe extern "C" fn load_finished(
        source: *mut glib::gobject_ffi::GObject,
        result: *mut gio::ffi::GAsyncResult,
        user_data: *mut c_void,
    ) {
        let manager: Box<webkit2gtk::UserContentManager> =
            unsafe { Box::from_raw(user_data as *mut _) };

        let mut error = std::ptr::null_mut();
        let filter = unsafe {
            webkit2gtk_sys::webkit_user_content_filter_store_load_finish(
                source as *mut _,
                result,
                &mut error,
            )
        };

        // Nothing saved yet, or blocking is off: the page still loads.
        if !error.is_null() || filter.is_null() {
            return;
        }

        unsafe {
            webkit2gtk_sys::webkit_user_content_manager_add_filter(
                manager.to_glib_none().0,
                filter,
            );
        }
    }

    pub fn detach(webview: &WebView) {
        let Some(manager) = webview.user_content_manager() else {
            return;
        };
        unsafe {
            webkit2gtk_sys::webkit_user_content_manager_remove_all_filters(
                manager.to_glib_none().0,
            );
        }
    }

    /// Where the compiled filter lives. Kept beside the app's other data.
    fn store_dir() -> Option<std::path::PathBuf> {
        std::env::var_os("FMHY_FILTER_STORE")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                dirs_next_data_dir().map(|d| d.join("org.unofficial.fmhydesktop/filterstore"))
            })
    }

    fn dirs_next_data_dir() -> Option<std::path::PathBuf> {
        std::env::var_os("XDG_DATA_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/share")))
    }

}

// Windows needs WebView2's request filter, a different mechanism entirely.
// Left as an explicit no-op rather than a silent half-implementation.
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
mod imp {
    use std::ffi::c_void;

    pub fn compile(
        _store_dir: &std::path::Path,
        _json: &str,
        done: impl Fn(Result<(), String>) + 'static,
    ) {
        done(Err("content blocking is not implemented on this platform yet".into()));
    }

    pub unsafe fn attach(_webview: *mut c_void) {}
    pub unsafe fn detach(_webview: *mut c_void) {}
}

/// True where the platform can enforce compiled rules.
///
/// macOS and Linux both consume WebKit content-blocker JSON. Windows needs a
/// different mechanism entirely (WebView2 request filtering) and is not wired
/// up here.
pub const fn is_supported() -> bool {
    cfg!(any(target_os = "macos", target_os = "linux"))
}

pub fn compile(
    store_dir: &std::path::Path,
    json: &str,
    done: impl Fn(Result<(), String>) + 'static,
) {
    imp::compile(store_dir, json, done)
}

/*
 * Attachment is platform-shaped rather than uniform: Tauri hands back a raw
 * WKWebView pointer on macOS and a safe `webkit2gtk::WebView` on Linux, so the
 * two cannot share one signature.
 */

/// # Safety
/// `webview` must be a live `WKWebView` pointer, used on the main thread.
#[cfg(target_os = "macos")]
pub unsafe fn attach(webview: *mut std::ffi::c_void) {
    unsafe { imp::attach(webview) }
}

/// # Safety
/// `webview` must be a live `WKWebView` pointer, used on the main thread.
#[cfg(target_os = "macos")]
pub unsafe fn detach(webview: *mut std::ffi::c_void) {
    unsafe { imp::detach(webview) }
}

#[cfg(target_os = "linux")]
pub fn attach(webview: &webkit2gtk::WebView) {
    imp::attach(webview)
}

#[cfg(target_os = "linux")]
pub fn detach(webview: &webkit2gtk::WebView) {
    imp::detach(webview)
}
