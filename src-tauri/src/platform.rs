use serde::Serialize;

/// How the window frame is drawn. macOS keeps its native traffic lights and
/// overlays them on our tab strip; the other platforms are undecorated and we
/// draw the controls ourselves, so the layout is deliberate on all three.
#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WindowChrome {
    /// Native controls float over our UI (macOS).
    NativeOverlay,
    /// We render our own minimise / maximise / close (Windows, Linux).
    Custom,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: &'static str,
    pub window_chrome: WindowChrome,
    /// Left inset reserved for native controls, in logical pixels.
    pub traffic_light_inset: f64,
    /// Primary modifier label for keyboard hints.
    pub mod_key: &'static str,
}

pub fn info() -> PlatformInfo {
    #[cfg(target_os = "macos")]
    {
        PlatformInfo {
            os: "macos",
            window_chrome: WindowChrome::NativeOverlay,
            traffic_light_inset: 78.0,
            mod_key: "⌘",
        }
    }
    #[cfg(target_os = "windows")]
    {
        PlatformInfo {
            os: "windows",
            window_chrome: WindowChrome::Custom,
            traffic_light_inset: 0.0,
            mod_key: "Ctrl",
        }
    }
    #[cfg(target_os = "linux")]
    {
        PlatformInfo {
            os: "linux",
            window_chrome: WindowChrome::Custom,
            traffic_light_inset: 0.0,
            mod_key: "Ctrl",
        }
    }
}

#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    info()
}
