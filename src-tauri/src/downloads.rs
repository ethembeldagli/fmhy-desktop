//! Files saved from sites opened in the app.
//!
//! The engine reports downloads through its own hook, so this records what
//! actually happened rather than what the UI asked for. Nothing is fetched
//! here — the webview does the transfer.

use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub id: i64,
    pub url: String,
    pub filename: String,
    pub path: Option<String>,
    pub bytes: i64,
    pub total_bytes: Option<i64>,
    /// pending | active | done | failed | cancelled
    pub status: String,
    pub created_at: i64,
}

fn now() -> i64 {
    crate::fmhy::store::now_secs()
}

/// Record a download the engine has started.
pub fn started(db: &Db, url: &str, filename: &str) -> AppResult<i64> {
    db.with(|conn| {
        conn.execute(
            "INSERT INTO download (url, filename, status, created_at)
             VALUES (?1, ?2, 'active', ?3)",
            params![url, filename, now()],
        )?;
        Ok(conn.last_insert_rowid())
    })
}

/// Mark the most recent record for this URL as finished.
pub fn finished(db: &Db, url: &str, path: Option<&str>, success: bool) -> AppResult<()> {
    let status = if success { "done" } else { "failed" };
    let bytes = path
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    db.with(|conn| {
        conn.execute(
            "UPDATE download SET status = ?1, path = ?2, bytes = ?3
              WHERE id = (SELECT id FROM download WHERE url = ?4
                          ORDER BY created_at DESC LIMIT 1)",
            params![status, path, bytes, url],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn downloads_list(db: State<Db>) -> AppResult<Vec<Download>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, url, filename, path, bytes, total_bytes, status, created_at
               FROM download ORDER BY created_at DESC LIMIT 300",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Download {
                id: row.get(0)?,
                url: row.get(1)?,
                filename: row.get(2)?,
                path: row.get(3)?,
                bytes: row.get(4)?,
                total_bytes: row.get(5)?,
                status: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    })
}

#[tauri::command]
pub fn downloads_clear(db: State<Db>) -> AppResult<usize> {
    db.with(|conn| {
        // Only clears the list; files already on disk are left alone.
        Ok(conn.execute("DELETE FROM download", [])?)
    })
}

#[tauri::command]
pub fn downloads_remove(db: State<Db>, id: i64) -> AppResult<()> {
    db.with(|conn| {
        conn.execute("DELETE FROM download WHERE id = ?1", params![id])?;
        Ok(())
    })
}

/// Reveal a finished download in the system file manager.
#[tauri::command]
pub fn downloads_reveal(app: tauri::AppHandle, path: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|error| crate::error::AppError::Other(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_a_download_and_marks_it_finished() {
        let db = Db::open_in_memory().unwrap();
        started(&db, "https://example.test/file.zip", "file.zip").unwrap();
        finished(&db, "https://example.test/file.zip", None, true).unwrap();

        let status: String = db
            .with(|c| Ok(c.query_row("SELECT status FROM download", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(status, "done");
    }

    #[test]
    fn a_failed_download_is_recorded_as_failed() {
        let db = Db::open_in_memory().unwrap();
        started(&db, "https://example.test/x.bin", "x.bin").unwrap();
        finished(&db, "https://example.test/x.bin", None, false).unwrap();

        let status: String = db
            .with(|c| Ok(c.query_row("SELECT status FROM download", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(status, "failed");
    }
}
