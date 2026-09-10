//! Parser for FMHY's wiki markdown.
//!
//! FMHY's markdown follows a tight, regular grammar rather than free-form
//! prose, so a line-oriented parser is both faster and more precise here than a
//! general markdown library:
//!
//! ```text
//! # ► Section              top-level section
//! ## ▷ Subsection          nested section
//! ### Subsection           third level (sometimes carries a link)
//! * ⭐ **[Name](url)**, [2](url) - Tag / Tag / [Discord](url)
//! * **Note** - free text   an editorial note, not a resource
//! * ↪️ **[Name](url)**      a cross-reference to another section
//! ```
//!
//! Details the real corpus forces us to handle (all covered by tests below):
//!
//! * **Invisible characters.** ~2,000 entries contain U+2060 / U+200B inside
//!   link text as a rendering workaround. Left in, they break search and make
//!   titles compare unequal. FMHY's own index strips them; so do we.
//! * **`-` inside link text.** `[The Algorithms - C++](…) - C++ Algorithms`
//!   means the title/description split has to happen *outside* brackets.
//! * **Multiple primary links.** `[A](…), [2](…)` and `[A](…) or [B](…)` are
//!   mirrors of one resource, not separate resources.
//! * **Links inside descriptions.** Trailing `[Discord](…)` / `[GitHub](…)`
//!   parts are supplementary links, and are separated from real tags.

/// Zero-width characters FMHY sprinkles through link text.
const INVISIBLE: [char; 5] = ['\u{2060}', '\u{200B}', '\u{200C}', '\u{200D}', '\u{FEFF}'];

pub fn strip_invisible(input: &str) -> String {
    input.chars().filter(|c| !INVISIBLE.contains(c)).collect()
}

fn clean(input: &str) -> String {
    strip_invisible(input)
        .replace("**", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct NamedLink {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    /// A normal resource with a link.
    Resource,
    /// `* **Note** - …`, editorial guidance attached to a section.
    Note,
    /// `* ↪️ …`, a pointer to another part of the wiki.
    Reference,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedEntry {
    pub kind: EntryKind,
    pub title: String,
    pub url: Option<String>,
    /// Descriptive tokens with supplementary links removed.
    pub description: String,
    pub tags: Vec<String>,
    pub starred: bool,
    pub is_index: bool,
    /// Alternate URLs for the same resource.
    pub mirrors: Vec<NamedLink>,
    /// Supplementary links from the description (Discord, GitHub, …).
    pub related: Vec<NamedLink>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSection {
    pub title: String,
    pub depth: u8,
    /// Ancestor titles, outermost first — used for breadcrumbs and search context.
    pub path: Vec<String>,
    pub entries: Vec<ParsedEntry>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPage {
    pub slug: String,
    pub sections: Vec<ParsedSection>,
}

impl ParsedPage {
    pub fn entry_count(&self) -> usize {
        self.sections.iter().map(|s| s.entries.len()).sum()
    }
}

/// Split on `sep`, ignoring occurrences inside `[...]` or `(...)`.
///
/// Markdown links routinely contain both the title separator (` - `) and the
/// tag separator (` / `), so depth tracking is what keeps
/// `[The Algorithms - C++](url)` in one piece.
fn split_top_level(input: &str, sep: &str) -> Vec<String> {
    let chars: Vec<char> = input.chars().collect();
    let sep_chars: Vec<char> = sep.chars().collect();
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut bracket = 0i32;
    let mut paren = 0i32;
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        match c {
            '[' => bracket += 1,
            ']' => bracket = (bracket - 1).max(0),
            '(' if bracket == 0 || paren > 0 || i > 0 && chars[i - 1] == ']' => paren += 1,
            ')' if paren > 0 => paren -= 1,
            _ => {}
        }

        if bracket == 0
            && paren == 0
            && i + sep_chars.len() <= chars.len()
            && chars[i..i + sep_chars.len()] == sep_chars[..]
        {
            parts.push(current.clone());
            current.clear();
            i += sep_chars.len();
            continue;
        }

        current.push(c);
        i += 1;
    }

    parts.push(current);
    parts
}

/// Extract every `[label](url)` pair, in order.
fn extract_links(input: &str) -> Vec<NamedLink> {
    let chars: Vec<char> = input.chars().collect();
    let mut links = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] != '[' {
            i += 1;
            continue;
        }
        // Find the matching ']' allowing nested brackets in the label.
        let mut depth = 1;
        let mut j = i + 1;
        while j < chars.len() && depth > 0 {
            match chars[j] {
                '[' => depth += 1,
                ']' => depth -= 1,
                _ => {}
            }
            if depth > 0 {
                j += 1;
            }
        }
        if j >= chars.len() || chars.get(j + 1) != Some(&'(') {
            i += 1;
            continue;
        }

        let label: String = chars[i + 1..j].iter().collect();

        // Find the matching ')' allowing nested parens in the URL.
        let mut pdepth = 1;
        let mut k = j + 2;
        while k < chars.len() && pdepth > 0 {
            match chars[k] {
                '(' => pdepth += 1,
                ')' => pdepth -= 1,
                _ => {}
            }
            if pdepth > 0 {
                k += 1;
            }
        }
        if k >= chars.len() {
            break;
        }

        let url: String = chars[j + 2..k].iter().collect();
        let url = strip_invisible(&url).trim().to_string();
        if !url.is_empty() {
            links.push(NamedLink {
                label: clean(&label),
                url,
            });
        }
        i = k + 1;
    }

    links
}

/// True when a fragment is only a link (plus separators), i.e. a supplementary
/// link rather than a descriptive tag.
fn is_link_only(fragment: &str) -> bool {
    let mut remainder = fragment.to_string();
    for link in extract_links(fragment) {
        if let Some(start) = remainder.find('[') {
            if let Some(end) = remainder[start..].find(')') {
                remainder.replace_range(start..start + end + 1, "");
                continue;
            }
        }
        let _ = link;
    }
    remainder
        .chars()
        .all(|c| c.is_whitespace() || matches!(c, ',' | '/' | '|' | '·' | '-'))
}

/// Parse one `* …` list item.
pub fn parse_entry(line: &str) -> Option<ParsedEntry> {
    let body = line.trim_start().strip_prefix("* ")?;
    let body = strip_invisible(body);
    let mut rest = body.trim().to_string();

    let mut starred = false;
    let mut is_index = false;
    let mut kind = EntryKind::Resource;

    // Markers are a small fixed set and may be combined, so consume greedily.
    loop {
        let trimmed = rest.trim_start().to_string();
        if let Some(next) = trimmed.strip_prefix('⭐') {
            starred = true;
            rest = next.trim_start_matches('\u{FE0F}').to_string();
        } else if let Some(next) = trimmed.strip_prefix('🌟') {
            starred = true;
            rest = next.trim_start_matches('\u{FE0F}').to_string();
        } else if let Some(next) = trimmed.strip_prefix('🌐') {
            is_index = true;
            rest = next.trim_start_matches('\u{FE0F}').to_string();
        } else if let Some(next) = trimmed.strip_prefix('↪') {
            kind = EntryKind::Reference;
            rest = next.trim_start_matches('\u{FE0F}').to_string();
        } else {
            rest = trimmed;
            break;
        }
    }

    // Split title from description at the first top-level " - ".
    let segments = split_top_level(&rest, " - ");
    let head = segments.first().cloned().unwrap_or_default();
    let description_raw = if segments.len() > 1 {
        segments[1..].join(" - ")
    } else {
        String::new()
    };

    let head_links = extract_links(&head);

    // `**Note**` items carry guidance rather than a resource.
    let head_text = clean(&head);
    if head_links.is_empty() {
        if head_text.is_empty() {
            return None;
        }
        return Some(ParsedEntry {
            kind: EntryKind::Note,
            title: head_text,
            url: None,
            description: clean(&description_raw),
            tags: Vec::new(),
            starred,
            is_index,
            mirrors: Vec::new(),
            related: Vec::new(),
        });
    }

    let primary = head_links[0].clone();
    let mirrors = head_links[1..].to_vec();

    // Descriptions are ` / `-separated; parts that are purely links are
    // supplementary rather than descriptive.
    let mut tags = Vec::new();
    let mut related = Vec::new();
    for part in split_top_level(&description_raw, " / ") {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let links = extract_links(part);
        if !links.is_empty() && is_link_only(part) {
            related.extend(links);
        } else {
            related.extend(links);
            let text = clean(part);
            if !text.is_empty() {
                tags.push(text);
            }
        }
    }

    let title = if primary.label.is_empty() {
        head_text
    } else {
        primary.label.clone()
    };

    Some(ParsedEntry {
        kind,
        title,
        url: Some(primary.url),
        description: tags.join(" / "),
        tags,
        starred,
        is_index,
        mirrors,
        related,
    })
}

/// Heading text minus FMHY's decorative markers.
fn heading_title(raw: &str) -> String {
    let text = raw
        .trim()
        .trim_start_matches('►')
        .trim_start_matches('▷')
        .trim();
    // Some third-level headings are themselves links.
    let links = extract_links(text);
    if !links.is_empty() && text.trim_start().starts_with('[') {
        return links[0].label.clone();
    }
    clean(text)
}

/// Parse a whole page of FMHY markdown.
pub fn parse_page(slug: &str, markdown: &str) -> ParsedPage {
    let mut sections: Vec<ParsedSection> = Vec::new();
    // Titles of the current ancestor chain, indexed by depth.
    let mut ancestors: Vec<String> = Vec::new();

    for raw_line in markdown.lines() {
        let line = raw_line.trim_end();
        let trimmed = line.trim_start();

        let heading = if let Some(rest) = trimmed.strip_prefix("### ") {
            Some((2u8, rest))
        } else if let Some(rest) = trimmed.strip_prefix("## ") {
            Some((1u8, rest))
        } else if let Some(rest) = trimmed.strip_prefix("# ") {
            Some((0u8, rest))
        } else {
            None
        };

        if let Some((depth, rest)) = heading {
            let title = heading_title(rest);
            if title.is_empty() {
                continue;
            }
            ancestors.truncate(depth as usize);
            let path = ancestors.clone();
            ancestors.push(title.clone());
            sections.push(ParsedSection {
                title,
                depth,
                path,
                entries: Vec::new(),
            });
            continue;
        }

        if !trimmed.starts_with("* ") {
            continue;
        }

        // Ignore the navigation banner every page opens with.
        if trimmed.contains("Back to Wiki Index") {
            continue;
        }

        if let Some(entry) = parse_entry(trimmed) {
            if let Some(section) = sections.last_mut() {
                section.entries.push(entry);
            } else {
                // Content before any heading: attach to a synthetic section so
                // nothing is silently dropped.
                sections.push(ParsedSection {
                    title: "Overview".into(),
                    depth: 0,
                    path: Vec::new(),
                    entries: vec![entry],
                });
                ancestors.push("Overview".into());
            }
        }
    }

    // Headings with no entries anywhere beneath them are pure scaffolding.
    ParsedPage {
        slug: slug.to_string(),
        sections,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_starred_entry_with_mirrors_and_related_links() {
        let entry = parse_entry(
            "* ⭐ **[Project X](https://github.com/XTLS/Xray-core)** - Xray Proxy Core / [Telegram](https://t.me/projectXray), [2](https://t.me/projectVless)",
        )
        .unwrap();

        assert!(entry.starred);
        assert_eq!(entry.title, "Project X");
        assert_eq!(entry.url.as_deref(), Some("https://github.com/XTLS/Xray-core"));
        assert_eq!(entry.tags, vec!["Xray Proxy Core"]);
        assert_eq!(entry.related.len(), 2, "Telegram + mirror are supplementary");
        assert_eq!(entry.related[0].label, "Telegram");
    }

    #[test]
    fn dash_inside_link_text_does_not_split_the_title() {
        let entry = parse_entry(
            "* [The Algorithms - C++](https://thealgorithms.github.io/C-Plus-Plus) - C++ Algorithms",
        )
        .unwrap();

        assert_eq!(entry.title, "The Algorithms - C++");
        assert_eq!(entry.description, "C++ Algorithms");
    }

    #[test]
    fn strips_invisible_characters_from_titles() {
        // U+2060 appears in ~2,000 real entries and breaks matching if kept.
        let entry = parse_entry("* [\u{2060}Ransomware.live](https://www.ransomware.live/) - Live Ransomware Monitor").unwrap();
        assert_eq!(entry.title, "Ransomware.live");
        assert!(!entry.title.contains('\u{2060}'));
    }

    #[test]
    fn treats_comma_and_or_links_as_mirrors() {
        let entry = parse_entry(
            "* [Kimi](https://www.kimi.ai/), [2](https://www.kimi.com/) - Kimi K3 / Sign-Up",
        )
        .unwrap();
        assert_eq!(entry.title, "Kimi");
        assert_eq!(entry.url.as_deref(), Some("https://www.kimi.ai/"));
        assert_eq!(entry.mirrors.len(), 1);
        assert_eq!(entry.mirrors[0].url, "https://www.kimi.com/");
        assert_eq!(entry.tags, vec!["Kimi K3", "Sign-Up"]);
    }

    #[test]
    fn or_separated_alternatives_are_mirrors_too() {
        let entry = parse_entry(
            "* [cheat.sh](https://github.com/chubin/cheat.sh) or [Commands.dev](https://www.commands.dev/) - Terminal Commands",
        )
        .unwrap();
        assert_eq!(entry.title, "cheat.sh");
        assert_eq!(entry.mirrors.len(), 1);
        assert_eq!(entry.mirrors[0].label, "Commands.dev");
    }

    #[test]
    fn recognises_notes_and_index_and_reference_markers() {
        let note = parse_entry("* **Note** - Always check extra uBO filters first.").unwrap();
        assert_eq!(note.kind, EntryKind::Note);
        assert!(note.url.is_none());
        assert_eq!(note.description, "Always check extra uBO filters first.");

        let index = parse_entry(
            "* 🌐 **[Awesome AI Web Search](https://github.com/felladrin/awesome-ai-web-search)** - AI Search Engine Index",
        )
        .unwrap();
        assert!(index.is_index);

        let reference =
            parse_entry("* ↪️ **[Spotify Adblockers](https://reddit.com/r/x)**").unwrap();
        assert_eq!(reference.kind, EntryKind::Reference);
        assert_eq!(reference.description, "");
    }

    #[test]
    fn builds_a_section_tree_with_ancestor_paths() {
        let md = "\
# ► AI Chatbots

* [A](https://a.test) - first

## ▷ Official Model Sites

* ⭐ **[B](https://b.test)** - second

### Nested

* [C](https://c.test) - third

# ► Second Top Level

* [D](https://d.test) - fourth
";
        let page = parse_page("ai", md);
        assert_eq!(page.entry_count(), 4);

        let titles: Vec<_> = page.sections.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(
            titles,
            vec!["AI Chatbots", "Official Model Sites", "Nested", "Second Top Level"]
        );

        assert_eq!(page.sections[0].path, Vec::<String>::new());
        assert_eq!(page.sections[1].path, vec!["AI Chatbots"]);
        assert_eq!(page.sections[2].path, vec!["AI Chatbots", "Official Model Sites"]);
        // A new H1 resets the ancestor chain.
        assert_eq!(page.sections[3].path, Vec::<String>::new());
        assert_eq!(page.sections[3].depth, 0);
    }

    #[test]
    fn skips_the_navigation_banner_and_rules() {
        let md = "\
***
***
**[◄◄ Back to Wiki Index](https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/index)**
***

# ► Real Section

* [A](https://a.test) - kept
";
        let page = parse_page("x", md);
        assert_eq!(page.sections.len(), 1);
        assert_eq!(page.entry_count(), 1);
        assert_eq!(page.sections[0].entries[0].title, "A");
    }

    #[test]
    fn entry_without_description_is_valid() {
        let entry = parse_entry("* [Bash Academy](https://guide.bash.academy/)").unwrap();
        assert_eq!(entry.title, "Bash Academy");
        assert_eq!(entry.description, "");
        assert!(entry.tags.is_empty());
    }

    #[test]
    fn heading_that_is_a_link_uses_its_label() {
        let md = "### [Fake Z-Lib Sites](https://reddit.com/x)\n\n* [A](https://a.test) - x\n";
        let page = parse_page("unsafe", md);
        assert_eq!(page.sections[0].title, "Fake Z-Lib Sites");
    }
}

/// Validation against the real corpus.
///
/// Unit tests above use hand-written fixtures, which can only prove the cases
/// we already thought of. This walks every real page and asserts invariants
/// over ~16k entries, which is what actually catches grammar drift upstream.
///
/// Ignored by default because it needs the pages on disk:
/// `FMHY_CORPUS=/path/to/pages cargo test corpus -- --ignored --nocapture`
#[cfg(test)]
mod corpus {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    #[ignore]
    fn parses_the_real_wiki() {
        let Ok(dir) = std::env::var("FMHY_CORPUS") else {
            eprintln!("set FMHY_CORPUS to run");
            return;
        };

        let mut pages = 0;
        let mut totals = BTreeMap::new();
        let mut no_url = Vec::new();
        let mut suspicious = Vec::new();

        let mut files: Vec<_> = std::fs::read_dir(&dir)
            .expect("corpus dir")
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "md"))
            .collect();
        files.sort();

        for path in files {
            let slug = path.file_stem().unwrap().to_string_lossy().to_string();
            let text = std::fs::read_to_string(&path).expect("read page");
            let page = parse_page(&slug, &text);
            pages += 1;

            let entries: Vec<_> = page.sections.iter().flat_map(|s| &s.entries).collect();
            *totals.entry("entries").or_insert(0) += entries.len();
            *totals.entry("sections").or_insert(0) += page.sections.len();

            for entry in entries {
                match entry.kind {
                    EntryKind::Resource => *totals.entry("resources").or_insert(0) += 1,
                    EntryKind::Note => *totals.entry("notes").or_insert(0) += 1,
                    EntryKind::Reference => *totals.entry("references").or_insert(0) += 1,
                }
                if entry.starred {
                    *totals.entry("starred").or_insert(0) += 1;
                }
                if entry.is_index {
                    *totals.entry("index").or_insert(0) += 1;
                }
                *totals.entry("mirrors").or_insert(0) += entry.mirrors.len();
                *totals.entry("related").or_insert(0) += entry.related.len();

                // Invariants that must hold for every parsed entry.
                assert!(!entry.title.is_empty(), "empty title in {slug}: {entry:?}");
                assert!(
                    !entry.title.chars().any(|c| INVISIBLE.contains(&c)),
                    "invisible char survived in {slug}: {:?}",
                    entry.title
                );
                assert!(
                    !entry.title.contains("]("),
                    "unparsed markdown left in title in {slug}: {:?}",
                    entry.title
                );

                if entry.kind == EntryKind::Resource {
                    match &entry.url {
                        None => no_url.push(format!("{slug}: {}", entry.title)),
                        Some(url) => {
                            if !url.starts_with("http") && !url.starts_with('/') && !url.starts_with('#') {
                                suspicious.push(format!("{slug}: {} -> {url}", entry.title));
                            }
                        }
                    }
                }
            }
        }

        println!("\n--- FMHY corpus ---");
        println!("pages parsed: {pages}");
        for (k, v) in &totals {
            println!("  {k:12} {v}");
        }
        if !no_url.is_empty() {
            println!("resources without a url: {}", no_url.len());
            for s in no_url.iter().take(5) {
                println!("    {s}");
            }
        }
        if !suspicious.is_empty() {
            println!("non-http urls: {}", suspicious.len());
            for s in suspicious.iter().take(10) {
                println!("    {s}");
            }
        }

        assert_eq!(pages, 25, "expected all 25 wiki pages");
        assert!(
            totals["entries"] > 14_000,
            "expected >14k entries, got {}",
            totals["entries"]
        );
        assert!(totals["starred"] > 1_500, "starred entries missing");
    }
}
