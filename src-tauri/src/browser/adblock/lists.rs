//! Fetching and caching filter lists.
//!
//! Lists are cached on disk and only refetched when stale, so startup does not
//! depend on the network and blocking still works offline. A failed fetch falls
//! back to the cached copy rather than leaving the user unprotected.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Refetch lists older than this. EasyList publishes several times a day, but
/// checking daily is plenty and keeps startup cheap.
const MAX_AGE_SECS: u64 = 60 * 60 * 24;

const USER_AGENT: &str = concat!("FMHY-Desktop/", env!("CARGO_PKG_VERSION"), " (unofficial client)");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ListSource {
    pub id: String,
    pub title: String,
    pub url: String,
    pub enabled: bool,
}

/// Defaults: the standard ad and tracker lists, plus FMHY's own filter list,
/// which is exactly the kind of protection this app should carry.
pub fn defaults() -> Vec<ListSource> {
    vec![
        ListSource {
            id: "easylist".into(),
            title: "EasyList".into(),
            url: "https://easylist.to/easylist/easylist.txt".into(),
            enabled: true,
        },
        ListSource {
            id: "easyprivacy".into(),
            title: "EasyPrivacy".into(),
            url: "https://easylist.to/easylist/easyprivacy.txt".into(),
            enabled: true,
        },
        ListSource {
            id: "fmhy".into(),
            title: "FMHY Filterlist".into(),
            url: "https://raw.githubusercontent.com/fmhy/FMHYFilterlist/main/filterlist.txt".into(),
            enabled: true,
        },
    ]
}

fn cache_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.txt"))
}

fn is_fresh(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    modified
        .elapsed()
        .map(|age| age.as_secs() < MAX_AGE_SECS)
        .unwrap_or(false)
}

/// Load every enabled list, fetching only those missing or stale.
pub async fn load(dir: &Path, sources: &[ListSource]) -> AppResult<Vec<String>> {
    std::fs::create_dir_all(dir)?;

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| AppError::Other(format!("http client: {error}")))?;

    let mut loaded = Vec::new();

    for source in sources.iter().filter(|s| s.enabled) {
        let path = cache_path(dir, &source.id);

        if is_fresh(&path) {
            if let Ok(text) = std::fs::read_to_string(&path) {
                loaded.push(text);
                continue;
            }
        }

        match client.get(&source.url).send().await {
            Ok(response) if response.status().is_success() => match response.text().await {
                Ok(text) => {
                    // Write through so the next launch works offline.
                    let _ = std::fs::write(&path, &text);
                    loaded.push(text);
                }
                Err(error) => {
                    eprintln!("adblock: reading {}: {error}", source.id);
                    if let Ok(text) = std::fs::read_to_string(&path) {
                        loaded.push(text);
                    }
                }
            },
            other => {
                if let Err(error) = other {
                    eprintln!("adblock: fetching {}: {error}", source.id);
                }
                // Stale beats nothing.
                if let Ok(text) = std::fs::read_to_string(&path) {
                    loaded.push(text);
                }
            }
        }
    }

    Ok(loaded)
}
