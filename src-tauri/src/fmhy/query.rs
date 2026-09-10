//! Reading the FMHY dataset for the UI.
//!
//! Queries are deliberately shaped so the frontend never loads the whole
//! dataset: a page renders from one page's rows, and search returns a capped,
//! ranked slice out of FTS5.

use rusqlite::{params, Connection, Row};
use serde::Serialize;

use crate::error::AppResult;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSummary {
    pub slug: String,
    pub title: String,
    pub group: String,
    pub section_count: i64,
    pub link_count: i64,
    pub starred_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRow {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub description: String,
    pub tags: Vec<String>,
    pub starred: bool,
    pub is_index: bool,
    pub kind: String,
    pub mirrors: Vec<LinkRef>,
    pub related: Vec<LinkRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRef {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionRow {
    pub id: i64,
    pub title: String,
    pub slug: String,
    pub depth: i64,
    pub path: String,
    pub links: Vec<LinkRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDetail {
    pub slug: String,
    pub title: String,
    pub group: String,
    pub sections: Vec<SectionRow>,
    pub link_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub description: String,
    pub breadcrumb: String,
    pub page_slug: String,
    pub page_title: String,
    pub section_title: String,
    pub starred: bool,
    pub is_index: bool,
}

pub fn list_pages(conn: &Connection) -> AppResult<Vec<PageSummary>> {
    let mut stmt = conn.prepare(
        "SELECT p.slug, p.title, p.icon,
                (SELECT count(*) FROM fmhy_section s WHERE s.page_id = p.id),
                (SELECT count(*) FROM fmhy_link l
                   JOIN fmhy_section s ON s.id = l.section_id
                  WHERE s.page_id = p.id AND l.kind = 'resource'),
                (SELECT count(*) FROM fmhy_link l
                   JOIN fmhy_section s ON s.id = l.section_id
                  WHERE s.page_id = p.id AND l.starred = 1)
           FROM fmhy_page p
          ORDER BY p.sort_order",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PageSummary {
            slug: row.get(0)?,
            title: row.get(1)?,
            group: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            section_count: row.get(3)?,
            link_count: row.get(4)?,
            starred_count: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn link_from_row(row: &Row) -> rusqlite::Result<LinkRow> {
    let tags: String = row.get(4)?;
    Ok(LinkRow {
        id: row.get(0)?,
        title: row.get(1)?,
        url: row.get(2)?,
        description: row.get(3)?,
        tags: tags
            .split(" / ")
            .filter(|t| !t.is_empty())
            .map(str::to_string)
            .collect(),
        starred: row.get::<_, i64>(5)? != 0,
        is_index: row.get::<_, i64>(6)? != 0,
        kind: row.get(7)?,
        mirrors: Vec::new(),
        related: Vec::new(),
    })
}

/// One page with all of its sections and links.
pub fn page_detail(conn: &Connection, slug: &str) -> AppResult<Option<PageDetail>> {
    let page: Option<(i64, String, String)> = conn
        .query_row(
            "SELECT id, title, IFNULL(icon, '') FROM fmhy_page WHERE slug = ?1",
            params![slug],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let Some((page_id, title, group)) = page else {
        return Ok(None);
    };

    let mut sections_stmt = conn.prepare(
        "SELECT id, title, slug, depth, path FROM fmhy_section
          WHERE page_id = ?1 ORDER BY sort_order",
    )?;
    let section_meta: Vec<(i64, String, String, i64, String)> = sections_stmt
        .query_map(params![page_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .collect::<Result<_, _>>()?;

    // All links for the page in one query, then bucketed by section, so a large
    // page costs two statements rather than one per section.
    let mut links_stmt = conn.prepare(
        "SELECT l.id, l.title, l.url, l.description, l.tags, l.starred, l.is_index, l.kind, l.section_id
           FROM fmhy_link l
           JOIN fmhy_section s ON s.id = l.section_id
          WHERE s.page_id = ?1
          ORDER BY s.sort_order, l.sort_order",
    )?;
    let mut by_section: std::collections::HashMap<i64, Vec<LinkRow>> = std::collections::HashMap::new();
    let mut link_ids: Vec<i64> = Vec::new();
    let mut rows = links_stmt.query(params![page_id])?;
    while let Some(row) = rows.next()? {
        let section_id: i64 = row.get(8)?;
        let link = link_from_row(row)?;
        link_ids.push(link.id);
        by_section.entry(section_id).or_default().push(link);
    }

    // Attach mirrors and related links in a single pass.
    let mut refs_stmt = conn.prepare(
        "SELECT m.link_id, m.label, m.url, m.kind
           FROM fmhy_link_mirror m
           JOIN fmhy_link l ON l.id = m.link_id
           JOIN fmhy_section s ON s.id = l.section_id
          WHERE s.page_id = ?1",
    )?;
    let mut ref_map: std::collections::HashMap<i64, (Vec<LinkRef>, Vec<LinkRef>)> =
        std::collections::HashMap::new();
    let mut ref_rows = refs_stmt.query(params![page_id])?;
    while let Some(row) = ref_rows.next()? {
        let link_id: i64 = row.get(0)?;
        let entry = ref_map.entry(link_id).or_default();
        let item = LinkRef {
            label: row.get(1)?,
            url: row.get(2)?,
        };
        if row.get::<_, String>(3)? == "mirror" {
            entry.0.push(item);
        } else {
            entry.1.push(item);
        }
    }

    let mut link_count = 0i64;
    let sections = section_meta
        .into_iter()
        .map(|(id, title, slug, depth, path)| {
            let mut links = by_section.remove(&id).unwrap_or_default();
            for link in &mut links {
                if let Some((mirrors, related)) = ref_map.remove(&link.id) {
                    link.mirrors = mirrors;
                    link.related = related;
                }
            }
            link_count += links.len() as i64;
            SectionRow {
                id,
                title,
                slug,
                depth,
                path,
                links,
            }
        })
        .collect();

    Ok(Some(PageDetail {
        slug: slug.to_string(),
        title,
        group,
        sections,
        link_count,
    }))
}

/// Turn user input into an FTS5 MATCH expression.
///
/// User text is never interpolated raw: FTS5 treats `"`, `*`, `:`, `^`, `-`
/// and `NEAR` as syntax, so a stray character would be a query error rather
/// than a search. Each token is quoted and given a prefix wildcard so results
/// update usefully while typing.
fn to_match_query(input: &str) -> Option<String> {
    let tokens: Vec<String> = input
        .split_whitespace()
        .map(|t| {
            t.chars()
                .filter(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | '\'' | '+'))
                .collect::<String>()
        })
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{}\"*", t.replace('"', "")))
        .collect();

    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" AND "))
    }
}

pub fn search(conn: &Connection, query: &str, limit: i64) -> AppResult<Vec<SearchHit>> {
    let Some(match_query) = to_match_query(query) else {
        return Ok(Vec::new());
    };

    let mut stmt = conn.prepare(
        "SELECT l.id, l.title, l.url, l.description, f.section_path,
                p.slug, p.title, s.title, l.starred, l.is_index
           FROM fmhy_fts f
           JOIN fmhy_link l ON l.id = f.rowid
           JOIN fmhy_section s ON s.id = l.section_id
           JOIN fmhy_page p ON p.id = s.page_id
          WHERE fmhy_fts MATCH ?1
          ORDER BY (l.starred * -2.0) + bm25(fmhy_fts, 12.0, 3.0, 1.0, 2.0)
          LIMIT ?2",
    )?;

    let rows = stmt.query_map(params![match_query, limit], |row| {
        Ok(SearchHit {
            id: row.get(0)?,
            title: row.get(1)?,
            url: row.get(2)?,
            description: row.get(3)?,
            breadcrumb: row.get(4)?,
            page_slug: row.get(5)?,
            page_title: row.get(6)?,
            section_title: row.get(7)?,
            starred: row.get::<_, i64>(8)? != 0,
            is_index: row.get::<_, i64>(9)? != 0,
        })
    })?;

    Ok(rows.collect::<Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_safe_match_queries() {
        assert_eq!(to_match_query("plex"), Some("\"plex\"*".into()));
        assert_eq!(
            to_match_query("free movies"),
            Some("\"free\"* AND \"movies\"*".into())
        );
        assert_eq!(to_match_query("   "), None);
    }

    #[test]
    fn strips_fts_syntax_from_user_input() {
        // These would be syntax errors, not searches, if passed through raw.
        for input in ["\"unclosed", "NEAR(a b)", "a:b", "^start", "a*b", "-minus"] {
            let q = to_match_query(input).expect("should produce a query");
            assert!(!q.contains("NEAR("), "{input} -> {q}");
            assert!(
                q.matches('"').count() % 2 == 0,
                "unbalanced quotes for {input} -> {q}"
            );
        }
    }
}
