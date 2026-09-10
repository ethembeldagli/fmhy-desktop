//! Fetching the FMHY dataset.

use tauri::{AppHandle, Emitter, Runtime};

use super::pages::{page_url, PAGES};
use super::parser::parse_page;
use super::store::{replace_dataset, SyncSummary};
use crate::browser::CHROME_WEBVIEW;
use crate::db::Db;
use crate::error::{AppError, AppResult};

const USER_AGENT: &str = concat!("FMHY-Desktop/", env!("CARGO_PKG_VERSION"), " (unofficial client)");
const TIMEOUT_SECS: u64 = 20;

/// Fetch every page, parse it, and swap the dataset in.
///
/// Pages are fetched concurrently but the write is a single transaction, so a
/// partial failure leaves the previous dataset intact rather than a half-built
/// index. Any page failing aborts the sync for the same reason FMHY's own
/// single-page endpoint refuses to cache a partial result: a missing section is
/// silent corruption.
pub async fn run<R: Runtime>(app: AppHandle<R>, db: &Db) -> AppResult<SyncSummary> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::Other(format!("http client: {e}")))?;

    let total = PAGES.len();
    emit_progress(&app, 0, total, "Fetching FMHY dataset");

    let mut tasks = Vec::with_capacity(total);
    for def in PAGES {
        let client = client.clone();
        let slug = def.slug.to_string();
        tasks.push(tauri::async_runtime::spawn(async move {
            let url = page_url(&slug);
            let response = client
                .get(&url)
                .send()
                .await
                .map_err(|e| AppError::Other(format!("{slug}: {e}")))?;
            if !response.status().is_success() {
                return Err(AppError::Other(format!(
                    "{slug}: upstream returned {}",
                    response.status()
                )));
            }
            let body = response
                .text()
                .await
                .map_err(|e| AppError::Other(format!("{slug}: {e}")))?;
            Ok::<_, AppError>((slug, body))
        }));
    }

    let mut parsed = Vec::with_capacity(total);
    let mut done = 0usize;
    for task in tasks {
        let (slug, body) = task
            .await
            .map_err(|e| AppError::Other(format!("sync task failed: {e}")))??;
        done += 1;
        emit_progress(&app, done, total, &format!("Parsing {slug}"));
        parsed.push(parse_page(&slug, &body));
    }

    // Keep pages in the wiki's own order rather than completion order.
    parsed.sort_by_key(|p| {
        PAGES
            .iter()
            .position(|d| d.slug == p.slug)
            .unwrap_or(usize::MAX)
    });

    emit_progress(&app, total, total, "Building search index");
    let summary = replace_dataset(db, &parsed)?;

    let _ = app.emit_to(CHROME_WEBVIEW, "fmhy://synced", &summary);
    Ok(summary)
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, done: usize, total: usize, label: &str) {
    let _ = app.emit_to(
        CHROME_WEBVIEW,
        "fmhy://sync-progress",
        serde_json::json!({ "done": done, "total": total, "label": label }),
    );
}
