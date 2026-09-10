//! Back and forward through the engine's own session history.
//!
//! This was previously modelled in Rust — a `Vec<Url>` per tab, traversed by
//! re-navigating to a remembered address. That model breaks in exactly the
//! places Back matters most:
//!
//! * A bot check or consent interstitial redirects on the way in, so the
//!   modelled stack fills with hops that redirect *forward* again the instant
//!   they are revisited. Back appears to do nothing at all.
//! * A page that never finished loading still left an entry behind, so Back
//!   arrived at a blank view instead of the page before it.
//! * Re-navigating refetches. Scroll position, form state and anything the
//!   interstitial just set are lost even when it does work.
//!
//! Every engine already maintains the correct stack, including entries a
//! redirect replaced rather than pushed. This module asks it instead.
//!
//! ## The shape everything here fits
//!
//! [`tauri::webview::Webview::with_webview`] hands the platform handle to a
//! callback on the UI thread and returns immediately, so nothing can be read
//! synchronously. Reads therefore report through a callback of their own and
//! the answer is pushed to the chrome as a state event, rather than being
//! returned up the call stack.

use tauri::{Runtime, webview::Webview};

use crate::error::AppResult;

/// What the engine says about its own stack.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Flags {
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

/// Whether [`read_flags`] reports the engine's answer on this platform.
///
/// Where it does not, the caller keeps using its own modelled history, which
/// is less accurate but never claims more than it can deliver.
pub const fn reports_flags() -> bool {
    cfg!(any(target_os = "macos", target_os = "linux", windows))
}

/// Step through the engine's session history.
///
/// Dispatched to the UI thread; the resulting navigation arrives through the
/// ordinary `on_navigation` and `on_page_load` callbacks like any other.
pub fn traverse<R: Runtime>(webview: &Webview<R>, back: bool) -> AppResult<()> {
    webview.with_webview(move |platform| imp::traverse(&platform, back))?;
    Ok(())
}

/// Read the engine's can-go-back/forward flags.
///
/// `done` runs on the UI thread. It is not called at all on a platform where
/// [`reports_flags`] is false.
pub fn read_flags<R: Runtime>(
    webview: &Webview<R>,
    done: impl FnOnce(Flags) + Send + 'static,
) -> AppResult<()> {
    webview.with_webview(move |platform| {
        if let Some(flags) = imp::flags(&platform) {
            done(flags);
        }
    })?;
    Ok(())
}

/// Turn on the platform's own edge-swipe back/forward gesture.
///
/// WebKit's is off by default; enabling it gives the two-finger swipe every
/// other Mac browser has. Windows has no equivalent to switch on.
pub fn enable_swipe_gestures<R: Runtime>(webview: &Webview<R>) {
    let _ = webview.with_webview(|platform| imp::enable_swipe_gestures(&platform));
}

#[cfg(target_os = "macos")]
mod imp {
    use objc2::rc::Retained;
    use objc2_web_kit::WKWebView;
    use tauri::webview::PlatformWebview;

    use super::Flags;

    /// The handle Tauri exposes is a raw pointer; retaining it for the length
    /// of the call keeps the view alive even if the tab is closing.
    fn view(platform: &PlatformWebview) -> Option<Retained<WKWebView>> {
        let ptr = platform.inner();
        if ptr.is_null() {
            return None;
        }
        unsafe { Retained::retain(ptr as *mut WKWebView) }
    }

    pub fn traverse(platform: &PlatformWebview, back: bool) {
        let Some(view) = view(platform) else { return };
        unsafe {
            if back {
                view.goBack();
            } else {
                view.goForward();
            }
        }
    }

    pub fn flags(platform: &PlatformWebview) -> Option<Flags> {
        let view = view(platform)?;
        Some(unsafe {
            Flags {
                can_go_back: view.canGoBack(),
                can_go_forward: view.canGoForward(),
            }
        })
    }

    pub fn enable_swipe_gestures(platform: &PlatformWebview) {
        let Some(view) = view(platform) else { return };
        unsafe { view.setAllowsBackForwardNavigationGestures(true) };
    }
}

#[cfg(target_os = "linux")]
mod imp {
    use tauri::webview::PlatformWebview;
    use webkit2gtk::WebViewExt;

    use super::Flags;

    pub fn traverse(platform: &PlatformWebview, back: bool) {
        let view = platform.inner();
        if back {
            view.go_back();
        } else {
            view.go_forward();
        }
    }

    pub fn flags(platform: &PlatformWebview) -> Option<Flags> {
        let view = platform.inner();
        Some(Flags {
            can_go_back: view.can_go_back(),
            can_go_forward: view.can_go_forward(),
        })
    }

    /// WebKitGTK has no equivalent gesture to enable.
    pub fn enable_swipe_gestures(_platform: &PlatformWebview) {}
}

#[cfg(windows)]
mod imp {
    use tauri::webview::PlatformWebview;

    use super::Flags;

    pub fn traverse(platform: &PlatformWebview, back: bool) {
        let Ok(core) = (unsafe { platform.controller().CoreWebView2() }) else {
            return;
        };
        let _ = unsafe {
            if back {
                core.GoBack()
            } else {
                core.GoForward()
            }
        };
    }

    pub fn flags(platform: &PlatformWebview) -> Option<Flags> {
        let core = unsafe { platform.controller().CoreWebView2() }.ok()?;
        Some(Flags {
            can_go_back: unsafe { core.CanGoBack() }.ok()?.as_bool(),
            can_go_forward: unsafe { core.CanGoForward() }.ok()?.as_bool(),
        })
    }

    /// WebView2 exposes no swipe gesture to enable.
    pub fn enable_swipe_gestures(_platform: &PlatformWebview) {}
}
