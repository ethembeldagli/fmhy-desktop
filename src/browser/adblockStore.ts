import { create } from 'zustand'
import { adblock, onEvent, type AdblockStatus } from '../platform'

interface AdblockStore {
  status: AdblockStatus | null
  load: () => Promise<void>
  toggle: () => Promise<void>
}

/**
 * Shared blocking state.
 *
 * Compilation happens in the background, so the status arrives by event rather
 * than being polled — the toolbar indicator and Settings both read this.
 */
export const useAdblock = create<AdblockStore>((set, get) => ({
  status: null,

  load: async () => {
    set({ status: await adblock.status() })
    void onEvent<AdblockStatus>('adblock://status', (status) => set({ status }))
  },

  toggle: async () => {
    const current = get().status
    if (!current?.supported) return
    const enabled = !current.enabled
    set({ status: { ...current, enabled, ready: enabled ? current.ready : false } })
    await adblock.setEnabled(enabled)
  },
}))
