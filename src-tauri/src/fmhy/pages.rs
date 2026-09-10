//! The FMHY page list.
//!
//! Mirrors FMHY's own navigation (`docs/.vitepress/shared.ts` in `fmhy/edit`)
//! and their single-page API's file list. Rust owns this because sync needs it;
//! the frontend only adds presentation (icons) keyed by slug.

pub struct PageDef {
    pub slug: &'static str,
    pub title: &'static str,
    pub group: &'static str,
}

pub const PAGES: &[PageDef] = &[
    PageDef { slug: "privacy", title: "Adblocking / Privacy", group: "Wiki" },
    PageDef { slug: "ai", title: "Artificial Intelligence", group: "Wiki" },
    PageDef { slug: "video", title: "Movies / TV / Anime", group: "Wiki" },
    PageDef { slug: "audio", title: "Music / Podcasts / Radio", group: "Wiki" },
    PageDef { slug: "gaming", title: "Gaming / Emulation", group: "Wiki" },
    PageDef { slug: "reading", title: "Books / Comics / Manga", group: "Wiki" },
    PageDef { slug: "downloading", title: "Downloading", group: "Wiki" },
    PageDef { slug: "torrenting", title: "Torrenting", group: "Wiki" },
    PageDef { slug: "educational", title: "Educational", group: "Wiki" },
    PageDef { slug: "mobile", title: "Android / iOS", group: "Wiki" },
    PageDef { slug: "linux-macos", title: "Linux / macOS", group: "Wiki" },
    PageDef { slug: "non-english", title: "Non-English", group: "Wiki" },
    PageDef { slug: "misc", title: "Miscellaneous", group: "Wiki" },
    PageDef { slug: "system-tools", title: "System Tools", group: "Tools" },
    PageDef { slug: "file-tools", title: "File Tools", group: "Tools" },
    PageDef { slug: "internet-tools", title: "Internet Tools", group: "Tools" },
    PageDef { slug: "social-media-tools", title: "Social Media Tools", group: "Tools" },
    PageDef { slug: "text-tools", title: "Text Tools", group: "Tools" },
    PageDef { slug: "gaming-tools", title: "Gaming Tools", group: "Tools" },
    PageDef { slug: "image-tools", title: "Image Tools", group: "Tools" },
    PageDef { slug: "video-tools", title: "Video Tools", group: "Tools" },
    PageDef { slug: "developer-tools", title: "Developer Tools", group: "Tools" },
    PageDef { slug: "storage", title: "Storage", group: "More" },
    PageDef { slug: "beginners-guide", title: "Beginners Guide", group: "More" },
    PageDef { slug: "unsafe", title: "Unsafe Sites", group: "More" },
];

/// Raw markdown for one page.
///
/// Per-page fetching is used rather than FMHY's concatenated `single-page`
/// endpoint because that endpoint joins all 25 files without page markers —
/// its per-file banner appears only 23 times, so page identity cannot be
/// recovered from it reliably, and page identity is exactly what the category
/// UI is built on.
pub fn page_url(slug: &str) -> String {
    format!("https://raw.githubusercontent.com/fmhy/edit/main/docs/{slug}.md")
}
