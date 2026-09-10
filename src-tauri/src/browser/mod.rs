//! Embedded browser layer.
//!
//! Everything engine-specific lives behind this module. The rest of the app
//! talks in terms of [`ViewRect`], view ids and [`NavigationState`]; it never
//! touches `tauri::webview` types directly. Swapping the engine (or adding a
//! per-platform one) means reimplementing this module and nothing else.
//!
//! ## Engine
//!
//! Content is rendered by the operating system's own webview via Tauri's
//! multi-webview support: WKWebView on macOS, WebView2 on Windows, WebKitGTK on
//! Linux. Child webviews are real native views layered over the window, not
//! iframes, so sites behave exactly as they do in a browser.
//!
//! ## Two constraints this module exists to absorb
//!
//! 1. **The native session stack is reachable only asynchronously.** Tauri
//!    hands the platform handle to a callback on the UI thread and returns
//!    immediately, so back/forward state cannot be read inline. [`navigation`]
//!    asks the engine and pushes the answer to the chrome as an event;
//!    [`history::SessionHistory`] covers the window before the first answer
//!    arrives.
//! 2. **Child webviews always paint above the chrome webview.** Any UI that
//!    must overlap the content area (command palette, menus, dialogs) requires
//!    hiding the content view first — see [`set_overlay_active`]. `auto_resize`
//!    is deliberately left off because combining it with explicit positioning
//!    is a known upstream bug (tauri-apps/tauri#9611); the frontend drives
//!    geometry instead.

pub mod adblock;
pub mod commands;
pub mod history;
pub mod mouse;
pub mod navigation;
pub mod shield;

use std::collections::HashMap;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{
    webview::{PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, WebviewUrl,
};
use url::Url;

use crate::error::{AppError, AppResult};
use history::SessionHistory;
use shield::ShieldSettings;

/// Label of the webview hosting the application's own UI.
pub const CHROME_WEBVIEW: &str = "chrome";
/// Label of the window everything is parented to.
pub const MAIN_WINDOW: &str = "main";

fn view_label(id: &str) -> String {
    format!("content-{id}")
}

/// User agent for content webviews.
///
/// WKWebView's default string stops after the engine token and never names a
/// browser, so sites that sniff it — Google most visibly — fall back to a
/// stripped-down layout meant for unknown clients. Naming the engine's actual
/// browser fixes that, and is accurate: this really is Safari's engine on
/// macOS and Chromium's on Windows.
fn user_agent() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    {
        Some(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
        )
    }
    #[cfg(target_os = "linux")]
    {
        Some(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
        )
    }
    // WebView2 already reports a full Chromium user agent.
    #[cfg(target_os = "windows")]
    {
        None
    }
}

/// Position and size of the content area, in logical pixels, relative to the
/// window. Supplied by the frontend, which owns layout.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct ViewRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl ViewRect {
    /// Guard against zero/negative sizes, which some platforms reject outright.
    fn sanitised(self) -> Self {
        Self {
            x: self.x.max(0.0),
            y: self.y.max(0.0),
            width: self.width.max(1.0),
            height: self.height.max(1.0),
        }
    }
}

/// What the chrome UI needs to render navigation controls for a view.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationState {
    pub id: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    /// True when the origin is https (or a local dev origin).
    pub secure: bool,
}

struct ContentView {
    /// Modelled history. Only consulted until the engine answers for itself —
    /// see [`navigation`] for why the real stack cannot be read inline.
    history: SessionHistory,
    /// What the engine says about its own back/forward stack, once it has been
    /// asked. Authoritative whenever it is present.
    native: Option<navigation::Flags>,
    title: String,
    loading: bool,
    current: Option<Url>,
}

impl ContentView {
    fn state(&self, id: &str) -> NavigationState {
        let url = self.current.as_ref().map(Url::to_string).unwrap_or_default();
        let secure = self
            .current
            .as_ref()
            .map(|u| u.scheme() == "https")
            .unwrap_or(false);
        let (can_go_back, can_go_forward) = match self.native {
            Some(flags) => (flags.can_go_back, flags.can_go_forward),
            None => (self.history.can_go_back(), self.history.can_go_forward()),
        };
        NavigationState {
            id: id.to_string(),
            url,
            title: self.title.clone(),
            loading: self.loading,
            can_go_back,
            can_go_forward,
            secure,
        }
    }
}

/// Shared browser state, owned by Tauri as managed state.
#[derive(Default)]
pub struct Browser {
    views: Mutex<HashMap<String, ContentView>>,
    /// The view currently allowed to be on screen, if any.
    active: Mutex<Option<String>>,
    /// While true, all content views stay hidden so chrome overlays are visible.
    overlay_active: Mutex<bool>,
}

/// Schemes a content webview is allowed to navigate to on its own.
///
/// Anything else (magnet:, mailto:, custom app handlers — common on the sites
/// FMHY indexes) is blocked and surfaced to the UI, so handing it to the OS is
/// always an explicit user choice rather than something a page can trigger.
fn is_navigable(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "about")
}

impl Browser {
    fn emit_state<R: Runtime>(&self, app: &AppHandle<R>, id: &str) {
        let views = self.views.lock();
        if let Some(view) = views.get(id) {
            let _ = app.emit_to(CHROME_WEBVIEW, "browser://state", view.state(id));
        }
    }

    pub fn state_of(&self, id: &str) -> Option<NavigationState> {
        self.views.lock().get(id).map(|v| v.state(id))
    }
}

/// Create a content webview for `id` and navigate it to `url`.
pub fn create_view<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    url: &str,
    rect: ViewRect,
) -> AppResult<NavigationState> {
    let parsed = Url::parse(url)?;
    if !is_navigable(&parsed) {
        return Err(AppError::Other(format!(
            "refusing to open unsupported scheme: {}",
            parsed.scheme()
        )));
    }

    let window = app
        .get_window(MAIN_WINDOW)
        .ok_or_else(|| AppError::Other("main window missing".into()))?;

    let browser = app.state::<Browser>();
    browser.views.lock().insert(
        id.to_string(),
        ContentView {
            history: SessionHistory::new(),
            native: None,
            title: parsed.host_str().unwrap_or("New tab").to_string(),
            loading: true,
            current: Some(parsed.clone()),
        },
    );

    let rect = rect.sanitised();
    let db = app.state::<crate::db::Db>();
    let settings = shield::stored(&db);
    let privacy = crate::privacy::stored(&db);
    let builder = build_view(app.clone(), id.to_string(), parsed.clone(), settings, privacy);

    let webview = window.add_child(
        builder,
        LogicalPosition::new(rect.x, rect.y),
        LogicalSize::new(rect.width, rect.height),
    )?;

    // Hand the compiled filter rules to the engine for this view. Content
    // blocking is enforced by the platform in its own network path, so this
    // has to happen per webview rather than once globally.
    adblock::attach(&webview);

    // WebKit's edge-swipe back/forward is off by default; every other Mac
    // browser has it, so turn it on.
    navigation::enable_swipe_gestures(&webview);

    browser
        .state_of(id)
        .ok_or_else(|| AppError::UnknownTab(id.to_string()))
}

/// Wire the engine callbacks that drive the whole navigation model.
fn build_view<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    url: Url,
    shield_settings: ShieldSettings,
    privacy: crate::privacy::PrivacySettings,
) -> WebviewBuilder<R> {
    let nav_app = app.clone();
    let nav_id = id.clone();

    let title_app = app.clone();
    let title_id = id.clone();

    let load_app = app.clone();
    let load_id = id.clone();

    let download_app = app.clone();

    let mut builder = WebviewBuilder::new(view_label(&id), WebviewUrl::External(url))
        // Runs before any page script, so popups and interstitials are
        // neutralised before the page can install them. Content is untrusted:
        // this script exposes no app APIs, and the `default` capability is
        // scoped to the chrome webview so none are reachable anyway.
        .initialization_script(shield::script(shield_settings))
        // Empty on macOS, where the side buttons are caught natively instead.
        .initialization_script(mouse::SCRIPT);

    if let Some(agent) = user_agent() {
        builder = builder.user_agent(agent);
    }

    // A non-persistent data store keeps cookies, cache and local storage in
    // memory only, so nothing survives the session or reaches disk.
    if privacy.private_browsing {
        builder = builder.incognito(true);
    }

    builder
        .on_navigation(move |url| {
            if !is_navigable(url) {
                let _ = nav_app.emit_to(
                    CHROME_WEBVIEW,
                    "browser://external-scheme",
                    serde_json::json!({ "id": nav_id, "url": url.to_string() }),
                );
                return false; // block; the UI asks the user what to do
            }

            let browser = nav_app.state::<Browser>();
            {
                let mut views = browser.views.lock();
                if let Some(view) = views.get_mut(&nav_id) {
                    let is_new = view.history.observe(url);
                    view.current = Some(url.clone());
                    view.loading = true;
                    if is_new {
                        let _ = nav_app.emit_to(
                            CHROME_WEBVIEW,
                            "browser://visited",
                            serde_json::json!({ "id": nav_id, "url": url.to_string() }),
                        );
                    }
                }
            }
            browser.emit_state(&nav_app, &nav_id);
            refresh_nav_flags(&nav_app, &nav_id);
            true
        })
        .on_document_title_changed(move |_, title| {
            let browser = title_app.state::<Browser>();
            let current = {
                let mut views = browser.views.lock();
                match views.get_mut(&title_id) {
                    Some(view) => {
                        view.title = title.clone();
                        view.current.clone()
                    }
                    None => None,
                }
            };
            if let Some(url) = current {
                let db = title_app.state::<crate::db::Db>();
                let _ = crate::history::update_title(&db, url.as_str(), &title);
            }
            browser.emit_state(&title_app, &title_id);
        })
        // Downloads are reported by the engine, which performs the transfer
        // itself; this records them so the Downloads view reflects reality.
        .on_download(move |_, event| {
            let db = download_app.state::<crate::db::Db>();
            match event {
                tauri::webview::DownloadEvent::Requested { url, destination } => {
                    let filename = destination
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "download".to_string());
                    if let Err(error) = crate::downloads::started(&db, url.as_str(), &filename) {
                        eprintln!("downloads: could not record start: {error}");
                    }
                    let _ = download_app.emit_to(
                        CHROME_WEBVIEW,
                        "downloads://changed",
                        serde_json::json!({ "url": url.to_string() }),
                    );
                }
                tauri::webview::DownloadEvent::Finished { url, path, success } => {
                    let path = path.as_ref().map(|p| p.to_string_lossy().to_string());
                    if let Err(error) =
                        crate::downloads::finished(&db, url.as_str(), path.as_deref(), success)
                    {
                        eprintln!("downloads: could not record completion: {error}");
                    }
                    let _ = download_app.emit_to(
                        CHROME_WEBVIEW,
                        "downloads://changed",
                        serde_json::json!({ "url": url.to_string(), "success": success }),
                    );
                }
                _ => {}
            }
            // Let the engine proceed with the transfer.
            true
        })
        .on_page_load(move |_, payload| {
            let browser = load_app.state::<Browser>();
            let finished = matches!(payload.event(), PageLoadEvent::Finished);

            let known_title = {
                let mut views = browser.views.lock();
                match views.get_mut(&load_id) {
                    Some(view) => {
                        view.loading = !finished;
                        view.title.clone()
                    }
                    None => String::new(),
                }
            };

            if finished {
                // History is written on load completion rather than on
                // navigation, so a redirect chain records the page the user
                // actually landed on instead of every hop along the way.
                // Honours the privacy setting internally.
                let url = payload.url();
                let title = if known_title.is_empty() {
                    url.host_str().unwrap_or_default().to_string()
                } else {
                    known_title
                };
                let db = load_app.state::<crate::db::Db>();
                if let Err(error) = crate::history::record_visit(&db, url.as_str(), &title) {
                    eprintln!("history: could not record visit: {error}");
                }
            }

            browser.emit_state(&load_app, &load_id);
            refresh_nav_flags(&load_app, &load_id);
        })
}

/// Ask the engine for its back/forward state and push the answer to the chrome.
///
/// Fire-and-forget: the read happens on the UI thread and re-emits the tab's
/// state only when something actually changed, so this is safe to call from
/// any navigation callback without causing an event storm.
fn refresh_nav_flags<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if !navigation::reports_flags() {
        return;
    }
    let Some(webview) = app.get_webview(&view_label(id)) else {
        return;
    };
    let app = app.clone();
    let id = id.to_string();
    let _ = navigation::read_flags(&webview, move |flags| {
        let browser = app.state::<Browser>();
        let changed = {
            let mut views = browser.views.lock();
            match views.get_mut(&id) {
                Some(view) => {
                    let changed = view.native != Some(flags);
                    view.native = Some(flags);
                    changed
                }
                None => false,
            }
        };
        if changed {
            browser.emit_state(&app, &id);
        }
    });
}

fn with_webview<R: Runtime, T>(
    app: &AppHandle<R>,
    id: &str,
    f: impl FnOnce(tauri::webview::Webview<R>) -> AppResult<T>,
) -> AppResult<T> {
    let webview = app
        .get_webview(&view_label(id))
        .ok_or_else(|| AppError::UnknownTab(id.to_string()))?;
    f(webview)
}

pub fn navigate<R: Runtime>(app: &AppHandle<R>, id: &str, url: &str) -> AppResult<()> {
    let parsed = Url::parse(url)?;
    if !is_navigable(&parsed) {
        return Err(AppError::Other(format!(
            "unsupported scheme: {}",
            parsed.scheme()
        )));
    }
    with_webview(app, id, |wv| Ok(wv.navigate(parsed)?))
}

pub fn reload<R: Runtime>(app: &AppHandle<R>, id: &str) -> AppResult<()> {
    with_webview(app, id, |wv| Ok(wv.reload()?))
}

/// Stop a load. There is no engine-level stop, so this runs `window.stop()`
/// inside the page, which is what the platform webviews honour.
pub fn stop<R: Runtime>(app: &AppHandle<R>, id: &str) -> AppResult<()> {
    with_webview(app, id, |wv| Ok(wv.eval("window.stop && window.stop();")?))
}

pub fn go_back<R: Runtime>(app: &AppHandle<R>, id: &str) -> AppResult<bool> {
    traverse(app, id, true)
}

pub fn go_forward<R: Runtime>(app: &AppHandle<R>, id: &str) -> AppResult<bool> {
    traverse(app, id, false)
}

/// Step one entry through this tab's history.
///
/// Returns whether the tab could move at all. `false` is meaningful: the
/// caller uses it to fall back to the app's own route stack, which is what
/// makes Back eventually leave a site and return to FMHY instead of stalling
/// on a page whose own history is exhausted.
fn traverse<R: Runtime>(app: &AppHandle<R>, id: &str, back: bool) -> AppResult<bool> {
    let browser = app.state::<Browser>();

    // Once the engine has answered for itself, its answer is the only one that
    // counts — it knows about entries a redirect replaced rather than pushed,
    // which is exactly what a bot check or consent interstitial leaves behind.
    let engine_state = {
        let views = browser.views.lock();
        let view = views
            .get(id)
            .ok_or_else(|| AppError::UnknownTab(id.to_string()))?;
        view.native
    };

    if let Some(flags) = engine_state {
        let can = if back {
            flags.can_go_back
        } else {
            flags.can_go_forward
        };
        if !can {
            return Ok(false);
        }
        with_webview(app, id, |wv| navigation::traverse(&wv, back))?;
        return Ok(true);
    }

    // Nothing has loaded yet, so fall back to the modelled stack.
    let target = {
        let mut views = browser.views.lock();
        let view = views
            .get_mut(id)
            .ok_or_else(|| AppError::UnknownTab(id.to_string()))?;
        if back {
            view.history.go_back()
        } else {
            view.history.go_forward()
        }
    };

    let Some(url) = target else { return Ok(false) };
    with_webview(app, id, |wv| Ok(wv.navigate(url)?))?;
    browser.emit_state(app, id);
    Ok(true)
}

/// Reposition the content view. Called by the frontend whenever layout changes.
pub fn set_rect<R: Runtime>(app: &AppHandle<R>, id: &str, rect: ViewRect) -> AppResult<()> {
    let rect = rect.sanitised();
    with_webview(app, id, |wv| {
        wv.set_position(LogicalPosition::new(rect.x, rect.y))?;
        wv.set_size(LogicalSize::new(rect.width, rect.height))?;
        Ok(())
    })
}

/// Show exactly one content view and hide the rest.
///
/// Passing `None` hides everything, which is how native FMHY pages get the
/// content area to themselves.
pub fn set_active<R: Runtime>(app: &AppHandle<R>, id: Option<&str>) -> AppResult<()> {
    let browser = app.state::<Browser>();
    *browser.active.lock() = id.map(str::to_string);
    apply_visibility(app)
}

/// Hide content views while a chrome overlay needs the screen.
pub fn set_overlay_active<R: Runtime>(app: &AppHandle<R>, active: bool) -> AppResult<()> {
    let browser = app.state::<Browser>();
    *browser.overlay_active.lock() = active;
    apply_visibility(app)
}

fn apply_visibility<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let browser = app.state::<Browser>();
    let overlay = *browser.overlay_active.lock();
    let active = browser.active.lock().clone();
    let ids: Vec<String> = browser.views.lock().keys().cloned().collect();

    for id in ids {
        let should_show = !overlay && active.as_deref() == Some(id.as_str());
        if let Some(wv) = app.get_webview(&view_label(&id)) {
            let _ = if should_show { wv.show() } else { wv.hide() };
        }
    }
    Ok(())
}

pub fn close_view<R: Runtime>(app: &AppHandle<R>, id: &str) -> AppResult<()> {
    let browser = app.state::<Browser>();
    browser.views.lock().remove(id);
    if browser.active.lock().as_deref() == Some(id) {
        *browser.active.lock() = None;
    }
    if let Some(wv) = app.get_webview(&view_label(id)) {
        wv.close()?;
    }
    Ok(())
}

/// Find-in-page. The platform webviews have no shared find API, so this drives
/// the page's own selection machinery, which works across all three engines.
pub fn find_in_page<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    query: &str,
    forward: bool,
) -> AppResult<()> {
    let script = format!(
        "window.find({}, false, {}, true, false, true, false);",
        serde_json::to_string(query).unwrap_or_else(|_| "\"\"".into()),
        if forward { "false" } else { "true" }
    );
    with_webview(app, id, |wv| Ok(wv.eval(script)?))
}

pub fn set_zoom<R: Runtime>(app: &AppHandle<R>, id: &str, factor: f64) -> AppResult<()> {
    let clamped = factor.clamp(0.25, 5.0);
    with_webview(app, id, |wv| Ok(wv.set_zoom(clamped)?))
}

/// Clear cookies, cache and local storage for every content view.
pub fn clear_browsing_data<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let ids: Vec<String> = app.state::<Browser>().views.lock().keys().cloned().collect();
    for id in ids {
        if let Some(wv) = app.get_webview(&view_label(&id)) {
            wv.clear_all_browsing_data()?;
        }
    }
    Ok(())
}
