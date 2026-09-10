//! Writing parsed FMHY content into SQLite, and reading it back out.

use rusqlite::{params, Connection, Transaction};
use serde::Serialize;

use super::parser::{EntryKind, ParsedPage};
use super::pages::PAGES;
use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub pages: usize,
    pub sections: usize,
    pub links: usize,
    pub last_synced: i64,
}

fn kind_str(kind: EntryKind) -> &'static str {
    match kind {
        EntryKind::Resource => "resource",
        EntryKind::Note => "note",
        EntryKind::Reference => "reference",
    }
}

/// Replace the entire dataset in one transaction.
///
/// A wholesale rebuild rather than a diff: the dataset is a cache, it is only
/// ~16k rows, and an all-or-nothing swap means a failed sync can never leave a
/// half-populated index behind. User data lives in separate tables and is
/// untouched.
pub fn replace_dataset(db: &Db, parsed: &[ParsedPage]) -> AppResult<SyncSummary> {
    db.with_mut(|conn| {
        let tx = conn.transaction()?;

        // ON DELETE CASCADE clears sections, links and mirrors.
        tx.execute("DELETE FROM fmhy_page", [])?;
        tx.execute("DELETE FROM fmhy_fts", [])?;

        let mut sections_written = 0usize;
        let mut links_written = 0usize;

        for (page_order, page) in parsed.iter().enumerate() {
            let def = PAGES.iter().find(|p| p.slug == page.slug);
            let title = def.map(|d| d.title).unwrap_or(page.slug.as_str());
            let group = def.map(|d| d.group).unwrap_or("Wiki");

            tx.execute(
                "INSERT INTO fmhy_page (slug, title, icon, sort_order) VALUES (?1, ?2, ?3, ?4)",
                params![page.slug, title, group, page_order as i64],
            )?;
            let page_id = tx.last_insert_rowid();

            // Sections arrive in document order; a stack keyed by depth gives
            // each one its parent without a second pass.
            let mut stack: Vec<(u8, i64)> = Vec::new();

            for (section_order, section) in page.sections.iter().enumerate() {
                while stack.last().is_some_and(|(d, _)| *d >= section.depth) {
                    stack.pop();
                }
                let parent_id = stack.last().map(|(_, id)| *id);
                let path = section.path.join(" / ");

                tx.execute(
                    "INSERT INTO fmhy_section (page_id, parent_id, slug, title, depth, sort_order, path)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        page_id,
                        parent_id,
                        slugify(&section.title),
                        section.title,
                        section.depth as i64,
                        section_order as i64,
                        path
                    ],
                )?;
                let section_id = tx.last_insert_rowid();
                stack.push((section.depth, section_id));
                sections_written += 1;

                let breadcrumb = if path.is_empty() {
                    format!("{title} / {}", section.title)
                } else {
                    format!("{title} / {path} / {}", section.title)
                };

                for (entry_order, entry) in section.entries.iter().enumerate() {
                    insert_entry(
                        &tx,
                        section_id,
                        entry_order,
                        entry,
                        &breadcrumb,
                    )?;
                    links_written += 1;
                }
            }
        }

        let now = now_secs();
        tx.execute(
            "UPDATE sync_state SET last_synced = ?1, source = ?2, page_count = ?3, link_count = ?4
              WHERE id = 1",
            params![
                now,
                "raw.githubusercontent.com/fmhy/edit",
                parsed.len() as i64,
                links_written as i64
            ],
        )?;

        tx.commit()?;

        Ok(SyncSummary {
            pages: parsed.len(),
            sections: sections_written,
            links: links_written,
            last_synced: now,
        })
    })
}

fn insert_entry(
    tx: &Transaction,
    section_id: i64,
    order: usize,
    entry: &super::parser::ParsedEntry,
    breadcrumb: &str,
) -> AppResult<()> {
    tx.execute(
        "INSERT INTO fmhy_link (section_id, title, url, description, starred, is_index, sort_order, kind, tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            section_id,
            entry.title,
            entry.url.clone().unwrap_or_default(),
            entry.description,
            entry.starred as i64,
            entry.is_index as i64,
            order as i64,
            kind_str(entry.kind),
            entry.tags.join(" / "),
        ],
    )?;
    let link_id = tx.last_insert_rowid();

    for mirror in &entry.mirrors {
        tx.execute(
            "INSERT INTO fmhy_link_mirror (link_id, label, url, kind) VALUES (?1, ?2, ?3, 'mirror')",
            params![link_id, mirror.label, mirror.url],
        )?;
    }
    for related in &entry.related {
        tx.execute(
            "INSERT INTO fmhy_link_mirror (link_id, label, url, kind) VALUES (?1, ?2, ?3, 'related')",
            params![link_id, related.label, related.url],
        )?;
    }

    // rowid is pinned to the link id so search results join straight back.
    tx.execute(
        "INSERT INTO fmhy_fts (rowid, title, description, section_path, url)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            link_id,
            entry.title,
            entry.description,
            breadcrumb,
            entry.url.clone().unwrap_or_default()
        ],
    )?;

    Ok(())
}

fn slugify(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut last_dash = true;
    for c in input.chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn sync_summary(conn: &Connection) -> AppResult<Option<SyncSummary>> {
    let mut stmt = conn.prepare(
        "SELECT last_synced, page_count, link_count FROM sync_state WHERE id = 1 AND last_synced IS NOT NULL",
    )?;
    let mut rows = stmt.query([])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let last_synced: i64 = row.get(0)?;
    let pages: i64 = row.get(1)?;
    let links: i64 = row.get(2)?;
    let sections: i64 = conn.query_row("SELECT count(*) FROM fmhy_section", [], |r| r.get(0))?;
    Ok(Some(SyncSummary {
        pages: pages as usize,
        sections: sections as usize,
        links: links as usize,
        last_synced,
    }))
}
