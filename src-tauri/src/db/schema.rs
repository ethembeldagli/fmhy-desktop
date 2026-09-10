//! Schema migrations.
//!
//! Migrations are append-only and applied in order inside a transaction, keyed
//! on `PRAGMA user_version`, so upgrading a user's existing database never
//! needs a destructive rebuild.

pub struct Migration {
    pub version: i64,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        sql: r#"
-- ---------------------------------------------------------------- app state
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

-- ------------------------------------------------------------- FMHY dataset
-- Mirrors FMHY's own structure: page -> section -> link. Populated by the sync
-- layer from the upstream markdown, and fully rebuildable, so it is cache-like
-- and never holds anything the user created.
CREATE TABLE fmhy_page (
    id        INTEGER PRIMARY KEY,
    slug      TEXT NOT NULL UNIQUE,   -- e.g. 'video', 'ai'
    title     TEXT NOT NULL,
    icon      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE fmhy_section (
    id         INTEGER PRIMARY KEY,
    page_id    INTEGER NOT NULL REFERENCES fmhy_page(id) ON DELETE CASCADE,
    parent_id  INTEGER REFERENCES fmhy_section(id) ON DELETE CASCADE,
    slug       TEXT NOT NULL,
    title      TEXT NOT NULL,
    depth      INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    note       TEXT
) STRICT;
CREATE INDEX idx_section_page ON fmhy_section(page_id, sort_order);
CREATE INDEX idx_section_parent ON fmhy_section(parent_id);

CREATE TABLE fmhy_link (
    id          INTEGER PRIMARY KEY,
    section_id  INTEGER NOT NULL REFERENCES fmhy_section(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    description TEXT,
    -- FMHY marks curated picks with a star and index/collection links with a globe.
    starred     INTEGER NOT NULL DEFAULT 0,
    is_index    INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX idx_link_section ON fmhy_link(section_id, sort_order);
CREATE INDEX idx_link_url ON fmhy_link(url);

-- Mirror links (the ', [2](...)' alternates FMHY uses) hang off their primary.
CREATE TABLE fmhy_link_mirror (
    id      INTEGER PRIMARY KEY,
    link_id INTEGER NOT NULL REFERENCES fmhy_link(id) ON DELETE CASCADE,
    label   TEXT NOT NULL,
    url     TEXT NOT NULL
) STRICT;
CREATE INDEX idx_mirror_link ON fmhy_link_mirror(link_id);

-- Full-text index. External-content table so the text is not stored twice;
-- rebuilt wholesale by the sync layer rather than kept in sync by triggers.
CREATE VIRTUAL TABLE fmhy_fts USING fts5(
    title,
    description,
    section_path,
    url,
    tokenize = "unicode61 remove_diacritics 2"
);

-- ------------------------------------------------------------- user content
CREATE TABLE favorite (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('resource', 'category', 'external')),
    title      TEXT NOT NULL,
    url        TEXT,
    fmhy_path  TEXT,
    note       TEXT,
    created_at INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX idx_favorite_target ON favorite(kind, IFNULL(url, ''), IFNULL(fmhy_path, ''));

CREATE TABLE history (
    id         INTEGER PRIMARY KEY,
    url        TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    visited_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_history_visited ON history(visited_at DESC);
CREATE INDEX idx_history_url ON history(url);

CREATE TABLE download (
    id          INTEGER PRIMARY KEY,
    url         TEXT NOT NULL,
    filename    TEXT NOT NULL,
    path        TEXT,
    bytes       INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER,
    status      TEXT NOT NULL CHECK (status IN ('pending','active','done','failed','cancelled')),
    created_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_download_created ON download(created_at DESC);
"#,
    },
    Migration {
        version: 2,
        sql: r#"
-- Facts the parser surfaced once it met the real corpus:
--   * 218 list items are editorial notes, not resources
--   * 378 are cross-references to other sections
--   * descriptions carry ~4k supplementary links (Discord, GitHub, ...) that
--     are distinct from the ~7.4k mirrors of the resource itself
ALTER TABLE fmhy_link ADD COLUMN kind TEXT NOT NULL DEFAULT 'resource';
ALTER TABLE fmhy_link ADD COLUMN tags TEXT NOT NULL DEFAULT '';

-- Distinguish an alternate URL for the same resource from a related link.
ALTER TABLE fmhy_link_mirror ADD COLUMN kind TEXT NOT NULL DEFAULT 'mirror';

-- Breadcrumb path, denormalised so section rendering needs no recursive query.
ALTER TABLE fmhy_section ADD COLUMN path TEXT NOT NULL DEFAULT '';

CREATE TABLE sync_state (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    last_synced  INTEGER,
    source       TEXT,
    page_count   INTEGER NOT NULL DEFAULT 0,
    link_count   INTEGER NOT NULL DEFAULT 0
) STRICT;
INSERT INTO sync_state (id) VALUES (1);
"#,
    },
];
