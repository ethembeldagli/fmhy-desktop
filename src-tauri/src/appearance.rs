//! Application icon appearance.
//!
//! The app ships one icon and keeps it. macOS 26 can derive Dark, Clear and
//! Tinted styles from a layered Icon Composer `.icon`, but every derived style
//! flattens the glow this artwork is built around, so it ships as drawn —
//! there is no preference here on macOS and nothing is swapped at runtime.
//!
//! Windows and Linux draw the window icon themselves against a titlebar whose
//! colour the app does control, so those two carry a choice: light by default,
//! switchable in Settings, remembered locally.

use rusqlite::params;
use serde::Serialize;
use tauri::{image::Image, Manager, Runtime, State, Window};

use crate::browser::MAIN_WINDOW;
use crate::db::Db;
use crate::error::AppResult;

const LIGHT: &[u8] = include_bytes!("../icons/app-light.png");
const DARK: &[u8] = include_bytes!("../icons/app-dark.png");

const KEY: &str = "appearance.app_icon";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IconVariant {
    Light,
    Dark,
}

impl IconVariant {
    fn parse(value: &str) -> Self {
        if value == "dark" {
            Self::Dark
        } else {
            Self::Light
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    fn bytes(self) -> &'static [u8] {
        match self {
            Self::Light => LIGHT,
            Self::Dark => DARK,
        }
    }
}

/// Whether the app manages its own icon on this platform.
pub const fn is_switchable() -> bool {
    !cfg!(target_os = "macos")
}

pub fn stored(db: &Db) -> IconVariant {
    db.with(|conn| {
        Ok(conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![KEY],
                |row| row.get::<_, String>(0),
            )
            .map(|value| IconVariant::parse(&value))
            .unwrap_or(IconVariant::Light))
    })
    .unwrap_or(IconVariant::Light)
}

fn apply<R: Runtime>(window: &Window<R>, variant: IconVariant) -> AppResult<()> {
    if !is_switchable() {
        return Ok(());
    }
    let image = Image::from_bytes(variant.bytes())
        .map_err(|error| crate::error::AppError::Other(format!("icon decode: {error}")))?;
    window.set_icon(image)?;
    Ok(())
}

/// Restore the stored choice at startup.
pub fn restore<R: Runtime>(app: &tauri::AppHandle<R>) {
    if !is_switchable() {
        return;
    }
    let variant = stored(&app.state::<Db>());
    if let Some(window) = app.get_window(MAIN_WINDOW) {
        if let Err(error) = apply(&window, variant) {
            eprintln!("appearance: could not set window icon: {error}");
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconSettings {
    /// False on macOS, where the system controls icon appearance.
    pub switchable: bool,
    pub variant: IconVariant,
}

#[tauri::command]
pub fn icon_settings(db: State<Db>) -> IconSettings {
    IconSettings {
        switchable: is_switchable(),
        variant: stored(&db),
    }
}

#[tauri::command]
pub fn set_app_icon<R: Runtime>(
    window: Window<R>,
    db: State<Db>,
    variant: String,
) -> AppResult<()> {
    if !is_switchable() {
        return Ok(());
    }
    let variant = IconVariant::parse(&variant);
    db.with(|conn| {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![KEY, variant.as_str()],
        )?;
        Ok(())
    })?;
    apply(&window, variant)
}
