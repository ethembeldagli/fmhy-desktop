//! FMHY dataset commands, exposed to the chrome webview only.

use tauri::{AppHandle, Runtime, State};

use super::query::{self, PageDetail, PageSummary, SearchHit};
use super::store::{sync_summary, SyncSummary};
use super::sync;
use crate::db::Db;
use crate::error::AppResult;

#[tauri::command]
pub fn fmhy_status(db: State<Db>) -> AppResult<Option<SyncSummary>> {
    db.with(|conn| sync_summary(conn))
}

#[tauri::command]
pub async fn fmhy_sync<R: Runtime>(
    app: AppHandle<R>,
    db: State<'_, Db>,
) -> AppResult<SyncSummary> {
    sync::run(app, &db).await
}

#[tauri::command]
pub fn fmhy_pages(db: State<Db>) -> AppResult<Vec<PageSummary>> {
    db.with(|conn| query::list_pages(conn))
}

#[tauri::command]
pub fn fmhy_page(db: State<Db>, slug: String) -> AppResult<Option<PageDetail>> {
    db.with(|conn| query::page_detail(conn, &slug))
}

#[tauri::command]
pub fn fmhy_search(db: State<Db>, query: String, limit: Option<i64>) -> AppResult<Vec<SearchHit>> {
    db.with(|conn| query::search(conn, &query, limit.unwrap_or(50).clamp(1, 200)))
}
