/**
 * In-app updates.
 *
 * Releases are signed with a key that never leaves its owner's machine, and the
 * public half is compiled into the app, so an update that was not signed by
 * that key is rejected before a byte of it is run. The endpoint is the GitHub
 * release itself — there is no update server to trust or keep alive.
 *
 * Nothing installs on its own. The app checks once at startup so it can say an
 * update exists, and every step after that is a button someone pressed: this is
 * a client for someone else's wiki, and an app that quietly replaces itself has
 * no business doing so.
 */

import { create } from 'zustand'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { invoke } from '@tauri-apps/api/core'

export type UpdateStatus =
  | 'idle'
  /** A check is in flight. */
  | 'checking'
  /** Checked, and this is the newest version. */
  | 'current'
  /** A newer version exists and has not been fetched yet. */
  | 'available'
  | 'downloading'
  /** Staged on disk; the app has to restart to run it. */
  | 'ready'
  | 'error'

/**
 * The handle returned by `check()` carries the download, so it is kept here
 * rather than in the store — it is not serialisable state and nothing should
 * be re-rendering off it.
 */
let pending: Update | null = null

interface UpdateState {
  status: UpdateStatus
  /** Version on offer, once one is known. */
  version: string | null
  notes: string | null
  error: string | null
  /** Bytes fetched so far, and the total when the server declared one. */
  received: number
  total: number | null
  /** True once a check has completed, however it went. */
  checked: boolean

  check: (options?: { silent?: boolean }) => Promise<void>
  download: () => Promise<void>
  restart: () => Promise<void>
  dismissError: () => void
}

export const useUpdates = create<UpdateState>((set, get) => ({
  status: 'idle',
  version: null,
  notes: null,
  error: null,
  received: 0,
  total: null,
  checked: false,

  check: async ({ silent = false } = {}) => {
    if (get().status === 'checking' || get().status === 'downloading') return
    set({ status: 'checking', error: null })
    try {
      const update = await check()
      pending = update
      if (update) {
        set({
          status: 'available',
          version: update.version,
          notes: update.body ?? null,
          checked: true,
        })
      } else {
        set({ status: 'current', version: null, notes: null, checked: true })
      }
    } catch (error) {
      pending = null
      // A failed check at startup is not worth interrupting anyone over —
      // being offline is the usual reason — so it is recorded and left alone.
      set({
        status: silent ? 'idle' : 'error',
        error: describe(error),
        checked: true,
      })
    }
  },

  download: async () => {
    if (!pending) return
    set({ status: 'downloading', received: 0, total: null, error: null })
    try {
      await pending.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            set({ total: event.data.contentLength ?? null, received: 0 })
            break
          case 'Progress':
            set((s) => ({ received: s.received + event.data.chunkLength }))
            break
          case 'Finished':
            break
        }
      })
      set({ status: 'ready' })
    } catch (error) {
      set({ status: 'error', error: describe(error) })
    }
  },

  restart: async () => {
    await invoke('restart_app')
  },

  dismissError: () => set({ status: 'idle', error: null }),
}))

/**
 * Turn whatever the updater threw into something worth showing.
 *
 * The one case worth naming outright is Linux: the updater can only replace an
 * AppImage, because a .deb, .rpm or Flatpak install belongs to the package
 * manager that put it there and is not the app's to overwrite.
 */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/appimage/i.test(message)) {
    return 'Updates are only applied automatically to the AppImage build. This copy was installed by a package manager, so update it the same way.'
  }
  if (/signature|verif/i.test(message)) {
    return `The download did not match the expected signature and was discarded. ${message}`
  }
  return message
}

/** Human-readable download progress, or null when the size is unknown. */
export function progressLabel(received: number, total: number | null): string | null {
  if (!total) return null
  const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1)
  return `${mb(received)} of ${mb(total)} MB`
}
