/**
 * The only module that talks to Tauri directly.
 *
 * Keeping the bridge here means the UI never imports `@tauri-apps/api`, so
 * components stay testable in a plain browser and swapping the host later
 * touches one file.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type WindowChrome = 'nativeOverlay' | 'custom'

export interface PlatformInfo {
  os: 'macos' | 'windows' | 'linux'
  windowChrome: WindowChrome
  /** Left inset reserved for native window controls, in CSS pixels. */
  trafficLightInset: number
  modKey: string
}

export interface AppInfo {
  version: string
  platform: PlatformInfo
  searchReady: boolean
}

/** True when running inside the Tauri shell rather than a plain browser tab. */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const fallback: AppInfo = {
  version: '0.0.0-dev',
  platform: {
    os: navigator.userAgent.includes('Mac')
      ? 'macos'
      : navigator.userAgent.includes('Win')
        ? 'windows'
        : 'linux',
    windowChrome: navigator.userAgent.includes('Mac') ? 'nativeOverlay' : 'custom',
    trafficLightInset: navigator.userAgent.includes('Mac') ? 78 : 0,
    modKey: navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl',
  },
  searchReady: false,
}

export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri) return fallback
  try {
    return await invoke<AppInfo>('app_info')
  } catch {
    return fallback
  }
}

export type WindowActionName =
  | 'minimize'
  | 'maximize'
  | 'unmaximize'
  | 'toggle-maximize'
  | 'close'

export async function windowAction(action: WindowActionName): Promise<void> {
  if (!isTauri) return
  await invoke('window_action', { action })
}

/** Geometry of the content area, in CSS pixels relative to the window. */
export interface ViewRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Content-view controls.
 *
 * These map onto native child webviews in the Rust layer. They are no-ops
 * outside Tauri so the UI can be developed in a normal browser.
 */
export const contentView = {
  async create(id: string, url: string, rect: ViewRect) {
    if (!isTauri) return null
    return invoke('browser_create', { id, url, rect })
  },
  async navigate(id: string, url: string) {
    if (!isTauri) return
    return invoke('browser_navigate', { id, url })
  },
  async reload(id: string) {
    if (!isTauri) return
    return invoke('browser_reload', { id })
  },
  async stop(id: string) {
    if (!isTauri) return
    return invoke('browser_stop', { id })
  },
  async back(id: string) {
    if (!isTauri) return false
    return invoke<boolean>('browser_back', { id })
  },
  async forward(id: string) {
    if (!isTauri) return false
    return invoke<boolean>('browser_forward', { id })
  },
  async setRect(id: string, rect: ViewRect) {
    if (!isTauri) return
    return invoke('browser_set_rect', { id, rect })
  },
  async setActive(id: string | null) {
    if (!isTauri) return
    return invoke('browser_set_active', { id })
  },
  /**
   * Child webviews always paint above the chrome webview, so any overlay that
   * covers the content area must hide it first. See the Rust browser module.
   */
  async setOverlay(active: boolean) {
    if (!isTauri) return
    return invoke('browser_set_overlay', { active })
  },
  async close(id: string) {
    if (!isTauri) return
    return invoke('browser_close', { id })
  },
  async find(id: string, query: string, forward = true) {
    if (!isTauri) return
    return invoke('browser_find', { id, query, forward })
  },
  async setZoom(id: string, factor: number) {
    if (!isTauri) return
    return invoke('browser_set_zoom', { id, factor })
  },
  async clearData() {
    if (!isTauri) return
    return invoke('browser_clear_data')
  },
}

export function onEvent<T>(name: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!isTauri) return Promise.resolve(() => {})
  return listen<T>(name, (event) => handler(event.payload))
}

/** Open a URL in the user's real browser, outside the app. */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}

export interface IconSettings {
  /** False on macOS, where the system controls icon appearance. */
  switchable: boolean
  variant: 'light' | 'dark'
}

/**
 * App-icon appearance.
 *
 * Only meaningful on Windows and Linux. macOS applies the user's system-wide
 * icon style itself, so the app exposes no control there.
 */
export const appIcon = {
  async settings(): Promise<IconSettings> {
    if (!isTauri) return { switchable: false, variant: 'light' }
    return invoke<IconSettings>('icon_settings')
  },
  async set(variant: 'light' | 'dark'): Promise<void> {
    if (!isTauri) return
    await invoke('set_app_icon', { variant })
  },
}

export interface ShieldSettings {
  /** Block window.open that does not follow a genuine click on a link. */
  blockPopups: boolean
  /** Remove full-screen interstitials and restore scrolling. */
  removeOverlays: boolean
  /** Hide common advertising containers. */
  hideAds: boolean
}

/**
 * In-page protection for sites opened in the app.
 *
 * The script runs at document start, so changes take effect for pages opened
 * afterwards rather than the one already on screen.
 */
export const shield = {
  async settings(): Promise<ShieldSettings> {
    if (!isTauri) return { blockPopups: true, removeOverlays: true, hideAds: true }
    return invoke<ShieldSettings>('shield_settings')
  },
  async set(settings: ShieldSettings): Promise<void> {
    if (!isTauri) return
    await invoke('set_shield_settings', { settings })
  },
}

export interface FilterListSource {
  id: string
  title: string
  url: string
  enabled: boolean
}

export interface AdblockStatus {
  /** False where the platform has no content blocker wired up yet. */
  supported: boolean
  enabled: boolean
  /** True once a rule list is compiled and available to webviews. */
  ready: boolean
  rules: number
  sourceFilters: number
  compileMillis: number
  lastError: string | null
  sources: FilterListSource[]
}

/**
 * Network-level content blocking.
 *
 * Rules are compiled from EasyList-style filter lists and enforced by the
 * platform's own content blocker, before requests leave the process.
 */
export const adblock = {
  async status(): Promise<AdblockStatus | null> {
    if (!isTauri) return null
    return invoke<AdblockStatus>('adblock_status')
  },
  async setEnabled(enabled: boolean): Promise<void> {
    if (!isTauri) return
    await invoke('adblock_set_enabled', { enabled })
  },
  async refresh(): Promise<void> {
    if (!isTauri) return
    await invoke('adblock_refresh')
  },
}

export interface PrivacySettings {
  /** Content webviews use an ephemeral store; nothing is written to disk. */
  privateBrowsing: boolean
  /** Wipe cookies, cache and local storage when the app exits. */
  clearOnExit: boolean
}

export const privacy = {
  async settings(): Promise<PrivacySettings> {
    if (!isTauri) return { privateBrowsing: false, clearOnExit: false }
    return invoke<PrivacySettings>('privacy_settings')
  },
  async set(settings: PrivacySettings): Promise<void> {
    if (!isTauri) return
    await invoke('set_privacy_settings', { settings })
  },
}
