//! Network-level content blocking.
//!
//! Filter lists in Adblock Plus / uBlock Origin syntax are parsed by Brave's
//! engine, converted to WebKit content-blocker rules, and handed to the
//! platform to enforce in its own network path. No browser extension is
//! involved, which is why this works on the webviews the app embeds rather
//! than requiring a Chromium bundle.

pub mod apply;
pub mod convert;
pub mod engine;
pub mod lists;

use parking_lot::Mutex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::browser::CHROME_WEBVIEW;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use lists::ListSource;

const KEY: &str = "browser.adblock";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdblockSettings {
    pub enabled: bool,
    pub sources: Vec<ListSource>,
}

impl Default for AdblockSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            sources: lists::defaults(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdblockStatus {
    /// False where the platform has no content blocker wired up yet.
    pub supported: bool,
    pub enabled: bool,
    /// True once a rule list is compiled and available to webviews.
    pub ready: bool,
    pub rules: usize,
    pub source_filters: usize,
    pub compile_millis: u128,
    pub last_error: Option<String>,
    pub sources: Vec<ListSource>,
}

/// Shared state. Compilation happens once per launch at most.
#[derive(Default)]
pub struct Adblock {
    ready: Mutex<bool>,
    stats: Mutex<Option<engine::CompileStats>>,
    error: Mutex<Option<String>>,
    building: Mutex<bool>,
}

pub fn stored(db: &Db) -> AdblockSettings {
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

fn store(db: &Db, settings: &AdblockSettings) -> AppResult<()> {
    let value = serde_json::to_string(settings).unwrap_or_default();
    db.with(|conn| {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![KEY, value],
        )?;
        Ok(())
    })
}

pub fn status<R: Runtime>(app: &AppHandle<R>) -> AdblockStatus {
    let state = app.state::<Adblock>();
    let settings = stored(&app.state::<Db>());

    // Release every guard before building the struct: holding them inside the
    // literal would outlive `state` itself.
    let stats = state.stats.lock().clone();
    let ready = *state.ready.lock();
    let last_error = state.error.lock().clone();

    AdblockStatus {
        supported: apply::is_supported(),
        enabled: settings.enabled,
        ready,
        rules: stats.as_ref().map(|s| s.rules).unwrap_or(0),
        source_filters: stats.as_ref().map(|s| s.source_filters).unwrap_or(0),
        compile_millis: stats.as_ref().map(|s| s.millis).unwrap_or(0),
        last_error,
        sources: settings.sources,
    }
}

/// Fetch, convert and compile the enabled lists.
///
/// Runs off the UI thread; only the final hand-off to WebKit is marshalled back
/// to the main thread, because that is the only part that requires it.
pub async fn rebuild<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    if !apply::is_supported() {
        return Ok(());
    }

    {
        let state = app.state::<Adblock>();
        let mut building = state.building.lock();
        if *building {
            return Ok(()); // a rebuild is already in flight
        }
        *building = true;
    }

    let finish = |app: &AppHandle<R>| {
        *app.state::<Adblock>().building.lock() = false;
        let _ = app.emit_to(CHROME_WEBVIEW, "adblock://status", status(app));
    };

    let settings = stored(&app.state::<Db>());
    if !settings.enabled {
        *app.state::<Adblock>().ready.lock() = false;
        finish(&app);
        return Ok(());
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Other(format!("app data dir: {error}")))?;
    let dir = data_dir.join("filterlists");
    let store_dir = data_dir.join("filterstore");

    let texts = match lists::load(&dir, &settings.sources).await {
        Ok(texts) if !texts.is_empty() => texts,
        Ok(_) => {
            *app.state::<Adblock>().error.lock() = Some("no filter lists available".into());
            finish(&app);
            return Ok(());
        }
        Err(error) => {
            *app.state::<Adblock>().error.lock() = Some(error.to_string());
            finish(&app);
            return Ok(());
        }
    };

    // Parsing ~80k filters is CPU-bound; keep it off the async runtime's core.
    let compiled = tauri::async_runtime::spawn_blocking(move || engine::compile(&texts))
        .await
        .map_err(|error| AppError::Other(format!("compile task: {error}")))?;

    let (json, stats) = match compiled {
        Ok(pair) => pair,
        Err(error) => {
            *app.state::<Adblock>().error.lock() = Some(error.to_string());
            finish(&app);
            return Ok(());
        }
    };

    let handle = app.clone();
    let result = app.run_on_main_thread(move || {
        let inner = handle.clone();
        apply::compile(&store_dir, &json, move |outcome| {
            let state = inner.state::<Adblock>();
            match outcome {
                Ok(()) => {
                    *state.ready.lock() = true;
                    *state.error.lock() = None;
                }
                Err(message) => {
                    *state.ready.lock() = false;
                    *state.error.lock() = Some(message);
                }
            }
            *state.building.lock() = false;
            let _ = inner.emit_to(CHROME_WEBVIEW, "adblock://status", status(&inner));
        });
    });

    {
        let state = app.state::<Adblock>();
        *state.stats.lock() = Some(stats);
    }

    if let Err(error) = result {
        *app.state::<Adblock>().error.lock() = Some(error.to_string());
        finish(&app);
    }

    Ok(())
}

/// Apply the compiled rules to a freshly created content webview.
pub fn attach<R: Runtime>(webview: &tauri::webview::Webview<R>) {
    #[cfg(target_os = "macos")]
    {
        let _ = webview.with_webview(|platform| unsafe { apply::attach(platform.inner()) });
    }
    #[cfg(target_os = "linux")]
    {
        let _ = webview.with_webview(|platform| apply::attach(&platform.inner()));
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = webview;
    }
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub fn adblock_status<R: Runtime>(app: AppHandle<R>) -> AdblockStatus {
    status(&app)
}

#[tauri::command]
pub async fn adblock_set_enabled<R: Runtime>(app: AppHandle<R>, enabled: bool) -> AppResult<()> {
    {
        let db = app.state::<Db>();
        let mut settings = stored(&db);
        settings.enabled = enabled;
        store(&db, &settings)?;
    }
    rebuild(app).await
}

#[tauri::command]
pub async fn adblock_refresh<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    rebuild(app).await
}
