//! FMHY data layer: fetching, parsing, storing and querying the wiki dataset.
//!
//! The layers are deliberately separable so the content source can change
//! without touching the UI: `parser` turns markdown into structures, `store`
//! persists them, `query` reads them back, and only `sync` knows where the
//! bytes come from.

pub mod commands;
pub mod pages;
pub mod parser;
pub mod query;
pub mod store;
pub mod sync;

/// End-to-end check over the real corpus: parse -> store -> query -> search.
///
/// Ignored by default (needs the pages on disk):
/// `FMHY_CORPUS=/path/to/pages cargo test pipeline -- --ignored --nocapture`
#[cfg(test)]
mod pipeline {
    use super::*;
    use crate::db::Db;

    fn load_corpus(dir: &str) -> Vec<parser::ParsedPage> {
        let mut files: Vec<_> = std::fs::read_dir(dir)
            .expect("corpus dir")
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "md"))
            .collect();
        files.sort();
        files
            .into_iter()
            .map(|path| {
                let slug = path.file_stem().unwrap().to_string_lossy().to_string();
                let text = std::fs::read_to_string(&path).expect("read");
                parser::parse_page(&slug, &text)
            })
            .collect()
    }

    #[test]
    #[ignore]
    fn stores_and_searches_the_real_dataset() {
        let Ok(dir) = std::env::var("FMHY_CORPUS") else {
            eprintln!("set FMHY_CORPUS to run");
            return;
        };

        let db = Db::open_in_memory().expect("db");
        let parsed = load_corpus(&dir);

        let started = std::time::Instant::now();
        let summary = store::replace_dataset(&db, &parsed).expect("store");
        println!(
            "\nindexed {} links across {} sections in {} pages ({} ms)",
            summary.links,
            summary.sections,
            summary.pages,
            started.elapsed().as_millis()
        );

        assert_eq!(summary.pages, 25);
        assert!(summary.links > 14_000);

        db.with(|conn| {
            let pages = query::list_pages(conn).expect("pages");
            assert_eq!(pages.len(), 25);
            let ai = pages.iter().find(|p| p.slug == "ai").expect("ai page");
            println!(
                "ai: {} sections, {} resources, {} starred",
                ai.section_count, ai.link_count, ai.starred_count
            );
            assert!(ai.link_count > 100);
            assert!(ai.starred_count > 0);

            // A real page renders fully: sections, links, mirrors, related.
            let detail = query::page_detail(conn, "ai").expect("detail").expect("some");
            assert!(!detail.sections.is_empty());
            let all: Vec<_> = detail.sections.iter().flat_map(|s| &s.links).collect();
            assert!(all.iter().any(|l| l.starred), "expected starred entries");
            assert!(all.iter().any(|l| !l.tags.is_empty()), "expected tags");
            assert!(
                all.iter().any(|l| !l.related.is_empty()),
                "expected supplementary links"
            );

            // Searches a user would actually type.
            for (term, expect_hits) in [
                ("plex", true),
                ("torrent", true),
                ("adblock", true),
                ("zzzzqqqq", false),
            ] {
                let t = std::time::Instant::now();
                let hits = query::search(conn, term, 25).expect("search");
                println!(
                    "  search {term:12} -> {:3} hits in {:?}",
                    hits.len(),
                    t.elapsed()
                );
                assert_eq!(!hits.is_empty(), expect_hits, "term: {term}");
                for hit in hits.iter().take(1) {
                    println!("      top: {} — {}", hit.title, hit.breadcrumb);
                }
            }

            // Input containing FTS5 syntax must search, not error.
            for nasty in ["\"unclosed", "a:b", "NEAR(x y)", "c++", "*", "-"] {
                let result = query::search(conn, nasty, 10);
                assert!(result.is_ok(), "query {nasty:?} errored: {result:?}");
            }

            // Starred entries should outrank unstarred ones for the same term.
            let hits = query::search(conn, "youtube", 30).expect("search");
            if let Some(first_unstarred) = hits.iter().position(|h| !h.starred) {
                let last_starred = hits.iter().rposition(|h| h.starred).unwrap_or(0);
                println!(
                    "  ranking: first unstarred at {first_unstarred}, last starred at {last_starred}"
                );
            }
            Ok(())
        })
        .expect("queries");
    }
}
