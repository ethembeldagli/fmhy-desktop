//! Privacy settings for content webviews.
//!
//! What is actually achievable is bounded by the engine, so this deliberately
//! offers only controls that do something real:
//!
//! * **Private browsing** uses a non-persistent data store, so cookies, cache
//!   and local storage exist only for the session and never reach disk.
//! * **Clear on exit** wipes browsing data when the app closes, for people who
//!   want persistence during a session but nothing left behind after it.
//!
//! Deliberately not offered: anything the webview cannot enforce. A toggle that
//! silently does nothing is worse than its absence.
//!
//! Tracker blocking is handled by the content blocker (EasyPrivacy), and
//! history is local-only with its own pause switch, so neither is repeated here.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

const KEY: &str = "browser.privacy";

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacySettings {
    /// Content webviews use an ephemeral data store; nothing is written to disk.
    pub private_browsing: bool,
    /// Wipe cookies, cache and local storage when the app exits.
    pub clear_on_exit: bool,
}

impl Default for PrivacySettings {
    fn default() -> Self {
        // Persistent by default: sign-ins that vanish every launch would be a
        // surprise. Both switches are one click away.
        Self {
            private_browsing: false,
            clear_on_exit: false,
        }
    }
}

pub fn stored(db: &Db) -> PrivacySettings {
    db.with(|conn| {
        Ok(conn
            .query_row("SELECT value FROM settings WHERE key = ?1", params![KEY], |row| {
                row.get::<_, String>(0)
            })
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default())
    })
    .unwrap_or_default()
}

#[tauri::command]
pub fn privacy_settings(db: State<Db>) -> PrivacySettings {
    stored(&db)
}

/// Changes apply to webviews opened afterwards: a data store is chosen when the
/// webview is created and cannot be swapped underneath a live page.
#[tauri::command]
pub fn set_privacy_settings(db: State<Db>, settings: PrivacySettings) -> AppResult<()> {
    let value = serde_json::to_string(&settings).unwrap_or_default();
    db.with(|conn| {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![KEY, value],
        )?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_keep_sessions_persistent() {
        let settings = PrivacySettings::default();
        assert!(!settings.private_browsing);
        assert!(!settings.clear_on_exit);
    }

    #[test]
    fn settings_round_trip_through_the_database() {
        let db = Db::open_in_memory().unwrap();
        let wanted = PrivacySettings {
            private_browsing: true,
            clear_on_exit: true,
        };
        let value = serde_json::to_string(&wanted).unwrap();
        db.with(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                params![KEY, value],
            )?;
            Ok(())
        })
        .unwrap();

        let read = stored(&db);
        assert!(read.private_browsing);
        assert!(read.clear_on_exit);
    }
}
