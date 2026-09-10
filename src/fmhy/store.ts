import { create } from 'zustand'
import { fmhy, type SyncProgress, type SyncSummary } from './api'
import { onEvent } from '../platform'

interface DatasetStore {
  status: SyncSummary | null
  /** null until the first status check resolves, so the UI can avoid flashing. */
  ready: boolean
  syncing: boolean
  progress: SyncProgress | null
  error: string | null

  init: () => Promise<void>
  sync: () => Promise<void>
}

export const useDataset = create<DatasetStore>((set, get) => ({
  status: null,
  ready: false,
  syncing: false,
  progress: null,
  error: null,

  init: async () => {
    const status = await fmhy.status().catch((error) => {
      console.error('[fmhy] status check failed:', error)
      return null
    })
    set({ status, ready: true })

    void onEvent<SyncProgress>('fmhy://sync-progress', (progress) => set({ progress }))
    void onEvent<SyncSummary>('fmhy://synced', (summary) =>
      set({ status: summary, syncing: false, progress: null }),
    )

    // First run: populate automatically rather than making the user find a
    // button before the app can show anything.
    if (!status) void get().sync()
  },

  sync: async () => {
    if (get().syncing) return
    set({ syncing: true, error: null })
    try {
      const summary = await fmhy.sync()
      set({ status: summary, syncing: false, progress: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Surfaced in the UI, and logged because a failed sync leaves the app
      // with nothing to show and is worth seeing in the dev console.
      console.error('[fmhy] sync failed:', message)
      set({ syncing: false, progress: null, error: message })
    }
  },
}))
