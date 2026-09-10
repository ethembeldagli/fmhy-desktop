//! Local persistence.
//!
//! Everything the app stores stays on this machine. There is no sync service,
//! no analytics and no remote endpoint that ever receives history, favourites
//! or downloads. The only outbound network traffic the app makes is fetching
//! the public FMHY dataset.

pub mod schema;

use std::path::Path;

use parking_lot::Mutex;
use rusqlite::Connection;

use crate::error::AppResult;

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        Self::configure(&conn)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        let conn = Connection::open_in_memory()?;
        Self::configure(&conn)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn configure(conn: &Connection) -> AppResult<()> {
        // WAL keeps reads (search, history) from blocking on writes.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "temp_store", "MEMORY")?;
        Ok(())
    }

    fn migrate(&self) -> AppResult<()> {
        let mut conn = self.conn.lock();
        let current: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;

        for migration in schema::MIGRATIONS {
            if migration.version <= current {
                continue;
            }
            let tx = conn.transaction()?;
            tx.execute_batch(migration.sql)?;
            // pragma_update cannot run inside the transaction handle, so the
            // version is set via execute_batch on the same connection.
            tx.execute_batch(&format!("PRAGMA user_version = {}", migration.version))?;
            tx.commit()?;
        }
        Ok(())
    }

    pub fn with<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let conn = self.conn.lock();
        f(&conn)
    }

    /// Mutable access, needed for transactions.
    pub fn with_mut<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut conn = self.conn.lock();
        f(&mut conn)
    }

    /// Confirms the SQLite build actually has FTS5 compiled in. Search depends
    /// on it, so failing loudly at startup beats failing on the first query.
    pub fn has_fts5(&self) -> bool {
        self.with(|conn| {
            Ok(conn
                .prepare("SELECT 1 FROM fmhy_fts WHERE fmhy_fts MATCH 'x' LIMIT 1")
                .is_ok())
        })
        .unwrap_or(false)
    }

    pub fn user_version(&self) -> AppResult<i64> {
        self.with(|conn| Ok(conn.pragma_query_value(None, "user_version", |r| r.get(0))?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_to_latest_version() {
        let db = Db::open_in_memory().expect("open");
        let latest = schema::MIGRATIONS.last().unwrap().version;
        assert_eq!(db.user_version().unwrap(), latest);
    }

    #[test]
    fn fts5_is_available() {
        let db = Db::open_in_memory().expect("open");
        assert!(db.has_fts5(), "bundled SQLite must include FTS5");
    }

    #[test]
    fn migration_is_idempotent() {
        let db = Db::open_in_memory().expect("open");
        db.migrate().expect("re-running migrations must be a no-op");
        assert_eq!(
            db.user_version().unwrap(),
            schema::MIGRATIONS.last().unwrap().version
        );
    }

    #[test]
    fn fts_round_trips_a_row() {
        let db = Db::open_in_memory().expect("open");
        db.with(|conn| {
            conn.execute(
                "INSERT INTO fmhy_fts (title, description, section_path, url)
                 VALUES ('Qwen Studio', 'AI chatbot', 'AI / Chatbots', 'https://chat.qwen.ai/')",
                [],
            )?;
            let hits: i64 = conn.query_row(
                "SELECT count(*) FROM fmhy_fts WHERE fmhy_fts MATCH 'chatbot'",
                [],
                |r| r.get(0),
            )?;
            assert_eq!(hits, 1);
            Ok(())
        })
        .expect("fts query");
    }
}
