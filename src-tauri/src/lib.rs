mod appearance;
mod browser;
mod db;
mod downloads;
mod favorites;
mod fmhy;
mod history;
mod menu;
mod error;
mod platform;
mod privacy;

use browser::{Browser, CHROME_WEBVIEW, MAIN_WINDOW};
use db::Db;
use tauri::{
    webview::WebviewBuilder, window::WindowBuilder, Emitter, LogicalPosition, LogicalSize, Manager,
    WebviewUrl, WindowEvent,
};

/// Startup facts the UI needs before its first paint.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: &'static str,
    platform: platform::PlatformInfo,
    search_ready: bool,
}

#[tauri::command]
fn app_info(db: tauri::State<Db>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: platform::info(),
        search_ready: db.has_fts5(),
    }
}

/// Window controls for the platforms where we draw our own titlebar.
#[tauri::command]
fn window_action(window: tauri::Window, action: String) -> Result<(), String> {
    let result = match action.as_str() {
        "minimize" => window.minimize(),
        "maximize" => window.maximize(),
        "unmaximize" => window.unmaximize(),
        "toggle-maximize" => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        "close" => window.close(),
        other => return Err(format!("unknown window action: {other}")),
    };
    result.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            window_action,
            platform::platform_info,
            browser::commands::browser_create,
            browser::commands::browser_navigate,
            browser::commands::browser_reload,
            browser::commands::browser_stop,
            browser::commands::browser_back,
            browser::commands::browser_forward,
            browser::commands::browser_set_rect,
            browser::commands::browser_set_active,
            browser::commands::browser_set_overlay,
            browser::commands::browser_close,
            browser::commands::browser_find,
            browser::commands::browser_set_zoom,
            browser::commands::browser_clear_data,
            fmhy::commands::fmhy_status,
            fmhy::commands::fmhy_sync,
            fmhy::commands::fmhy_pages,
            fmhy::commands::fmhy_page,
            fmhy::commands::fmhy_search,
            downloads::downloads_list,
            downloads::downloads_clear,
            downloads::downloads_remove,
            downloads::downloads_reveal,
            favorites::favorites_list,
            favorites::favorites_add,
            favorites::favorites_remove,
            favorites::favorites_toggle,
            favorites::favorites_keys,
            history::history_list,
            history::history_search,
            history::history_delete,
            history::history_clear,
            history::history_set_recording,
            history::history_recording_enabled,
            privacy::privacy_settings,
            privacy::set_privacy_settings,
            browser::adblock::adblock_status,
            browser::adblock::adblock_set_enabled,
            browser::adblock::adblock_refresh,
            browser::shield::shield_settings,
            browser::shield::set_shield_settings,
            appearance::icon_settings,
            appearance::set_app_icon,
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let db = Db::open(&data_dir.join("fmhy.db"))?;
            if !db.has_fts5() {
                eprintln!("warning: SQLite was built without FTS5; search will be degraded");
            }
            app.manage(db);
            app.manage(Browser::default());
            app.manage(browser::adblock::Adblock::default());

            // A native menu bar is what makes this feel like a desktop app
            // rather than a web page in a frame — Settings on the platform's
            // own shortcut, working text editing, real window management.
            let handle = app.handle();
            app.set_menu(menu::build(handle)?)?;

            build_main_window(handle)?;
            appearance::restore(handle);

            // The mouse's back/forward buttons never reach a webview on their
            // own; this catches them application-wide.
            browser::mouse::install(handle);

            // Filter lists are fetched, converted and compiled in the
            // background: the first run does real work, later ones reuse the
            // cached lists and WebKit's own compiled store.
            let blocker = handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = browser::adblock::rebuild(blocker).await {
                    eprintln!("adblock: initial build failed: {error}");
                }
            });

            Ok(())
        })
        .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            // Wiping on close rather than on quit: by the time the process is
            // exiting the webviews are gone and there is nothing left to clear.
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let app = window.app_handle();
                if privacy::stored(&app.state::<Db>()).clear_on_exit {
                    if let Err(error) = browser::clear_browsing_data(app) {
                        eprintln!("privacy: could not clear browsing data: {error}");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running FMHY Desktop");
}

/// Build the window and its chrome webview.
///
/// The window is created *without* a webview so the chrome UI is a child
/// webview like any content view. That uniformity is what lets content views
/// be layered over the shell later without special-casing the first one.
fn build_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    const W: f64 = 1280.0;
    const H: f64 = 820.0;

    let builder = WindowBuilder::new(app, MAIN_WINDOW)
        .title("FMHY Desktop")
        .inner_size(W, H)
        .min_inner_size(940.0, 620.0)
        .resizable(true)
        // Painted before the UI loads, so startup never flashes white.
        .background_color(tauri::window::Color(14, 13, 18, 255))
        .visible(false);

    // macOS keeps its native traffic lights and lets our tab strip run
    // underneath them; the other platforms get an undecorated window and draw
    // their own controls. Both paths are first-class.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false);

    let window = builder.build()?;

    window.add_child(
        WebviewBuilder::new(CHROME_WEBVIEW, WebviewUrl::App("index.html".into()))
            // The shell handles its own zoom shortcuts; the engine's built-in
            // ones would zoom the chrome UI rather than page content.
            .zoom_hotkeys_enabled(false),
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(W, H),
    )?;

    window.show()?;

    // The chrome webview is sized explicitly rather than with `auto_resize`,
    // which misbehaves when combined with positioned children
    // (tauri-apps/tauri#9611). Resizing here keeps one authority over geometry.
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Resized(_) = event {
            let Some(win) = handle.get_window(MAIN_WINDOW) else {
                return;
            };
            let (Ok(size), Ok(scale)) = (win.inner_size(), win.scale_factor()) else {
                return;
            };
            let logical = size.to_logical::<f64>(scale);
            if let Some(chrome) = handle.get_webview(CHROME_WEBVIEW) {
                let _ = chrome.set_size(LogicalSize::new(logical.width, logical.height));
            }
            // The frontend owns content-view geometry and recomputes it here.
            let _ = handle.emit_to(
                CHROME_WEBVIEW,
                "window://resized",
                serde_json::json!({ "width": logical.width, "height": logical.height }),
            );
        }
    });

    Ok(())
}
