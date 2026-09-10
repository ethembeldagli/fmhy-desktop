//! Local browsing history.
//!
//! Written on the Rust side as navigation happens, so it records what the
//! engine actually loaded rather than what the UI asked for (redirects
//! included). Nothing here is ever transmitted; it exists only in the user's
//! local database and can be cleared entirely.

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

/// Consecutive visits to the same URL inside this window collapse into one
/// row, so a reload or a redirect chain does not flood the list.
const DEDUPE_WINDOW_SECS: i64 = 60 * 30;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub url: String,
    pub title: String,
    pub visited_at: i64,
}

fn now() -> i64 {
    crate::fmhy::store::now_secs()
}

/// Whether history recording is enabled. Defaults to on, and is honoured at
/// the write site so disabling it stops collection rather than merely hiding it.
pub fn recording_enabled(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'privacy.record_history'",
        [],
        |row| row.get::<_, String>(0),
    )
    .map(|value| value != "false")
    .unwrap_or(true)
}

pub fn record_visit(db: &Db, url: &str, title: &str) -> AppResult<()> {
    db.with(|conn| {
        if !recording_enabled(conn) {
            return Ok(());
        }
        let now = now();

        // Collapse a repeat visit to the same URL instead of adding a row.
        let recent: Option<i64> = conn
            .query_row(
                "SELECT id FROM history WHERE url = ?1 AND visited_at > ?2
                  ORDER BY visited_at DESC LIMIT 1",
                params![url, now - DEDUPE_WINDOW_SECS],
                |row| row.get(0),
            )
            .ok();

        match recent {
            Some(id) => {
                conn.execute(
                    "UPDATE history SET visited_at = ?1 WHERE id = ?2",
                    params![now, id],
                )?;
            }
            None => {
                conn.execute(
                    "INSERT INTO history (url, title, visited_at) VALUES (?1, ?2, ?3)",
                    params![url, title, now],
                )?;
            }
        }
        Ok(())
    })
}

/// Fill in the real page title once the document reports it.
pub fn update_title(db: &Db, url: &str, title: &str) -> AppResult<()> {
    if title.trim().is_empty() {
        return Ok(());
    }
    db.with(|conn| {
        conn.execute(
            "UPDATE history SET title = ?1
              WHERE id = (SELECT id FROM history WHERE url = ?2 ORDER BY visited_at DESC LIMIT 1)",
            params![title, url],
        )?;
        Ok(())
    })
}

fn map_rows(stmt: &mut rusqlite::Statement, params: &[&dyn rusqlite::ToSql]) -> AppResult<Vec<HistoryEntry>> {
    let rows = stmt.query_map(params, |row| {
        Ok(HistoryEntry {
            id: row.get(0)?,
            url: row.get(1)?,
            title: row.get(2)?,
            visited_at: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[tauri::command]
pub fn history_list(db: State<Db>, limit: Option<i64>) -> AppResult<Vec<HistoryEntry>> {
    let limit = limit.unwrap_or(300).clamp(1, 2000);
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, url, title, visited_at FROM history ORDER BY visited_at DESC LIMIT ?1",
        )?;
        map_rows(&mut stmt, &[&limit])
    })
}

#[tauri::command]
pub fn history_search(db: State<Db>, query: String, limit: Option<i64>) -> AppResult<Vec<HistoryEntry>> {
    let limit = limit.unwrap_or(300).clamp(1, 2000);
    let needle = format!("%{}%", query.trim());
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, url, title, visited_at FROM history
              WHERE title LIKE ?1 OR url LIKE ?1
              ORDER BY visited_at DESC LIMIT ?2",
        )?;
        map_rows(&mut stmt, &[&needle, &limit])
    })
}

#[tauri::command]
pub fn history_delete(db: State<Db>, id: i64) -> AppResult<()> {
    db.with(|conn| {
        conn.execute("DELETE FROM history WHERE id = ?1", params![id])?;
        Ok(())
    })
}

/// Clear history. `since` limits it to entries newer than that timestamp;
/// omitting it clears everything.
#[tauri::command]
pub fn history_clear(db: State<Db>, since: Option<i64>) -> AppResult<usize> {
    db.with(|conn| {
        let removed = match since {
            Some(cutoff) => conn.execute("DELETE FROM history WHERE visited_at >= ?1", params![cutoff])?,
            None => conn.execute("DELETE FROM history", [])?,
        };
        Ok(removed)
    })
}

#[tauri::command]
pub fn history_set_recording(db: State<Db>, enabled: bool) -> AppResult<()> {
    db.with(|conn| {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('privacy.record_history', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![if enabled { "true" } else { "false" }],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn history_recording_enabled(db: State<Db>) -> AppResult<bool> {
    db.with(|conn| Ok(recording_enabled(conn)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_repeat_visits_and_records_titles() {
        let db = Db::open_in_memory().unwrap();
        record_visit(&db, "https://a.test/", "a.test").unwrap();
        record_visit(&db, "https://a.test/", "a.test").unwrap();
        record_visit(&db, "https://b.test/", "b.test").unwrap();

        let count: i64 = db
            .with(|c| Ok(c.query_row("SELECT count(*) FROM history", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(count, 2, "repeat visit should not add a row");

        update_title(&db, "https://a.test/", "Real Title").unwrap();
        let title: String = db
            .with(|c| {
                Ok(c.query_row(
                    "SELECT title FROM history WHERE url = 'https://a.test/'",
                    [],
                    |r| r.get(0),
                )?)
            })
            .unwrap();
        assert_eq!(title, "Real Title");
    }

    #[test]
    fn recording_can_be_disabled() {
        let db = Db::open_in_memory().unwrap();
        db.with(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('privacy.record_history', 'false')",
                [],
            )?;
            Ok(())
        })
        .unwrap();

        record_visit(&db, "https://private.test/", "x").unwrap();
        let count: i64 = db
            .with(|c| Ok(c.query_row("SELECT count(*) FROM history", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(count, 0, "nothing should be stored while recording is off");
    }
}
