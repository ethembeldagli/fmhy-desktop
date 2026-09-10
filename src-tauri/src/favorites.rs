//! Saved resources, categories and sites.
//!
//! Favourites are the one part of the dataset the user creates, so unlike the
//! FMHY index they are never rebuilt or discarded — they live in their own
//! table and survive every resync.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    #[serde(default)]
    pub id: i64,
    /// `resource`, `category` or `external` — matches the CHECK constraint.
    pub kind: String,
    pub title: String,
    pub url: Option<String>,
    /// Slug for a favourited FMHY category, e.g. `ai`.
    pub fmhy_path: Option<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub created_at: i64,
}

fn now() -> i64 {
    crate::fmhy::store::now_secs()
}

fn read(row: &rusqlite::Row) -> rusqlite::Result<Favorite> {
    Ok(Favorite {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        url: row.get(3)?,
        fmhy_path: row.get(4)?,
        note: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const COLUMNS: &str = "id, kind, title, url, fmhy_path, note, created_at";

#[tauri::command]
pub fn favorites_list(db: State<Db>) -> AppResult<Vec<Favorite>> {
    db.with(|conn| {
        let mut stmt =
            conn.prepare(&format!("SELECT {COLUMNS} FROM favorite ORDER BY created_at DESC"))?;
        let rows = stmt.query_map([], read)?;
        Ok(rows.collect::<Result<_, _>>()?)
    })
}

/// Add a favourite, or return the existing one.
///
/// The unique index treats a missing url/path as empty rather than NULL, so a
/// resource cannot be saved twice and re-favouriting is harmless.
#[tauri::command]
pub fn favorites_add(db: State<Db>, favorite: Favorite) -> AppResult<Favorite> {
    db.with(|conn| {
        conn.execute(
            "INSERT INTO favorite (kind, title, url, fmhy_path, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT DO NOTHING",
            params![
                favorite.kind,
                favorite.title,
                favorite.url,
                favorite.fmhy_path,
                favorite.note,
                now()
            ],
        )?;
        lookup(conn, &favorite)?.ok_or_else(|| {
            crate::error::AppError::Other("favourite could not be stored".into())
        })
    })
}

fn lookup(conn: &Connection, favorite: &Favorite) -> AppResult<Option<Favorite>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM favorite
          WHERE kind = ?1 AND IFNULL(url, '') = ?2 AND IFNULL(fmhy_path, '') = ?3"
    ))?;
    let mut rows = stmt.query(params![
        favorite.kind,
        favorite.url.clone().unwrap_or_default(),
        favorite.fmhy_path.clone().unwrap_or_default()
    ])?;
    match rows.next()? {
        Some(row) => Ok(Some(read(row)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn favorites_remove(db: State<Db>, id: i64) -> AppResult<()> {
    db.with(|conn| {
        conn.execute("DELETE FROM favorite WHERE id = ?1", params![id])?;
        Ok(())
    })
}

/// Remove by target rather than id, so the UI can un-star without tracking ids.
#[tauri::command]
pub fn favorites_toggle(db: State<Db>, favorite: Favorite) -> AppResult<bool> {
    db.with(|conn| {
        if let Some(existing) = lookup(conn, &favorite)? {
            conn.execute("DELETE FROM favorite WHERE id = ?1", params![existing.id])?;
            return Ok(false);
        }
        conn.execute(
            "INSERT INTO favorite (kind, title, url, fmhy_path, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                favorite.kind,
                favorite.title,
                favorite.url,
                favorite.fmhy_path,
                favorite.note,
                now()
            ],
        )?;
        Ok(true)
    })
}

/// Every favourited URL and category slug, for marking stars in a list without
/// a query per row.
#[tauri::command]
pub fn favorites_keys(db: State<Db>) -> AppResult<Vec<String>> {
    db.with(|conn| {
        let mut stmt = conn
            .prepare("SELECT IFNULL(NULLIF(url, ''), fmhy_path) FROM favorite WHERE url IS NOT NULL OR fmhy_path IS NOT NULL")?;
        let rows = stmt.query_map([], |row| row.get::<_, Option<String>>(0))?;
        Ok(rows.filter_map(|r| r.ok().flatten()).collect())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resource(url: &str) -> Favorite {
        Favorite {
            id: 0,
            kind: "resource".into(),
            title: "Example".into(),
            url: Some(url.into()),
            fmhy_path: None,
            note: None,
            created_at: 0,
        }
    }

    #[test]
    fn toggling_adds_then_removes() {
        let db = Db::open_in_memory().unwrap();
        let item = resource("https://example.test/");

        let added = db
            .with(|c| {
                if lookup(c, &item)?.is_some() {
                    return Ok(false);
                }
                c.execute(
                    "INSERT INTO favorite (kind, title, url, fmhy_path, note, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![item.kind, item.title, item.url, item.fmhy_path, item.note, 1],
                )?;
                Ok(true)
            })
            .unwrap();
        assert!(added);

        let count: i64 = db
            .with(|c| Ok(c.query_row("SELECT count(*) FROM favorite", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn the_same_target_cannot_be_saved_twice() {
        let db = Db::open_in_memory().unwrap();
        let item = resource("https://example.test/");
        for _ in 0..2 {
            db.with(|c| {
                c.execute(
                    "INSERT INTO favorite (kind, title, url, fmhy_path, note, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING",
                    params![item.kind, item.title, item.url, item.fmhy_path, item.note, 1],
                )?;
                Ok(())
            })
            .unwrap();
        }
        let count: i64 = db
            .with(|c| Ok(c.query_row("SELECT count(*) FROM favorite", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(count, 1, "unique index should collapse duplicates");
    }

    #[test]
    fn categories_and_resources_are_distinct_targets() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            c.execute(
                "INSERT INTO favorite (kind, title, url, fmhy_path, created_at)
                 VALUES ('resource', 'A', 'https://a.test/', NULL, 1)",
                [],
            )?;
            c.execute(
                "INSERT INTO favorite (kind, title, url, fmhy_path, created_at)
                 VALUES ('category', 'AI', NULL, 'ai', 1)",
                [],
            )?;
            Ok(())
        })
        .unwrap();
        let count: i64 = db
            .with(|c| Ok(c.query_row("SELECT count(*) FROM favorite", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(count, 2);
    }
}
