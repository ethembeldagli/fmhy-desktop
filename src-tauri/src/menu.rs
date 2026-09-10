//! Native application menu.
//!
//! A desktop app is judged partly on whether it behaves like one, and on macOS
//! that means a real menu bar: Settings on ⌘, Services and Hide in the app
//! menu, standard Edit items so system text shortcuts work, and window
//! management where the OS expects it.
//!
//! Items that map onto app behaviour emit `menu://<id>` to the chrome webview
//! rather than being handled here, so the keyboard shortcuts already defined in
//! the UI stay the single source of truth for what they do.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::browser::CHROME_WEBVIEW;

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        MenuItem::with_id(app, id, label, true, accel)
    };

    let app_menu = Submenu::with_items(
        app,
        "FMHY Desktop",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About FMHY Desktop"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("settings", "Settings…", Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("new-tab", "New Tab", Some("CmdOrCtrl+T"))?,
            &item("close-tab", "Close Tab", Some("CmdOrCtrl+W"))?,
            &item("reopen-tab", "Reopen Closed Tab", Some("CmdOrCtrl+Shift+T"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("Close Window"))?,
        ],
    )?;

    // Standard edit items keep system text shortcuts working in inputs.
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("find", "Find in Page…", Some("CmdOrCtrl+F"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item("reload", "Reload", Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("toggle-sidebar", "Toggle Sidebar", Some("CmdOrCtrl+B"))?,
            &item("command-palette", "Command Palette…", Some("CmdOrCtrl+K"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let go_menu = Submenu::with_items(
        app,
        "Go",
        true,
        &[
            &item("back", "Back", Some("CmdOrCtrl+["))?,
            &item("forward", "Forward", Some("CmdOrCtrl+]"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("go-home", "Home", Some("CmdOrCtrl+Shift+H"))?,
            &item("go-search", "Search", None)?,
            &item("go-favorites", "Favorites", None)?,
            &item("go-history", "History", Some("CmdOrCtrl+Y"))?,
            &item("go-downloads", "Downloads", Some("CmdOrCtrl+Shift+J"))?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &item("help-fmhy", "FMHY Website", None)?,
            &item("help-source", "FMHY Wiki Source", None)?,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &go_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

/// Forward menu activations to the UI, which owns what each one does.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "help-fmhy" => open_external(app, "https://fmhy.net"),
        "help-source" => open_external(app, "https://github.com/fmhy/edit"),
        other => {
            let _ = app.emit_to(CHROME_WEBVIEW, "menu://action", other.to_string());
        }
    }
}

fn open_external<R: Runtime>(app: &AppHandle<R>, url: &str) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url, None::<&str>);
    let _ = app.get_webview(CHROME_WEBVIEW);
}
