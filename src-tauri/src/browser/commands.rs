//! Tauri commands exposed to the chrome webview only.
//!
//! These are reachable from the app UI. They are *not* reachable from content
//! webviews: the `default` capability is scoped to `webviews: ["chrome"]`, so
//! an external site cannot invoke any of them.

use tauri::{AppHandle, Runtime};

use super::{NavigationState, ViewRect};
use crate::error::AppResult;

#[tauri::command]
pub fn browser_create<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    url: String,
    rect: ViewRect,
) -> AppResult<NavigationState> {
    super::create_view(&app, &id, &url, rect)
}

#[tauri::command]
pub fn browser_navigate<R: Runtime>(app: AppHandle<R>, id: String, url: String) -> AppResult<()> {
    super::navigate(&app, &id, &url)
}

#[tauri::command]
pub fn browser_reload<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<()> {
    super::reload(&app, &id)
}

#[tauri::command]
pub fn browser_stop<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<()> {
    super::stop(&app, &id)
}

#[tauri::command]
pub fn browser_back<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<bool> {
    super::go_back(&app, &id)
}

#[tauri::command]
pub fn browser_forward<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<bool> {
    super::go_forward(&app, &id)
}

#[tauri::command]
pub fn browser_set_rect<R: Runtime>(app: AppHandle<R>, id: String, rect: ViewRect) -> AppResult<()> {
    super::set_rect(&app, &id, rect)
}

#[tauri::command]
pub fn browser_set_active<R: Runtime>(app: AppHandle<R>, id: Option<String>) -> AppResult<()> {
    super::set_active(&app, id.as_deref())
}

#[tauri::command]
pub fn browser_set_overlay<R: Runtime>(app: AppHandle<R>, active: bool) -> AppResult<()> {
    super::set_overlay_active(&app, active)
}

#[tauri::command]
pub fn browser_close<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<()> {
    super::close_view(&app, &id)
}

#[tauri::command]
pub fn browser_find<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    query: String,
    forward: bool,
) -> AppResult<()> {
    super::find_in_page(&app, &id, &query, forward)
}

#[tauri::command]
pub fn browser_set_zoom<R: Runtime>(app: AppHandle<R>, id: String, factor: f64) -> AppResult<()> {
    super::set_zoom(&app, &id, factor)
}

#[tauri::command]
pub fn browser_clear_data<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    super::clear_browsing_data(&app)
}
