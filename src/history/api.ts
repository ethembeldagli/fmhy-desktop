import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../platform'

export interface HistoryEntry {
  id: number
  url: string
  title: string
  visitedAt: number
}

export const history = {
  list: (limit = 300): Promise<HistoryEntry[]> =>
    isTauri ? invoke<HistoryEntry[]>('history_list', { limit }) : Promise.resolve([]),
  search: (query: string, limit = 300): Promise<HistoryEntry[]> =>
    isTauri ? invoke<HistoryEntry[]>('history_search', { query, limit }) : Promise.resolve([]),
  remove: (id: number): Promise<void> =>
    isTauri ? invoke('history_delete', { id }) : Promise.resolve(),
  clear: (since?: number): Promise<number> =>
    isTauri ? invoke<number>('history_clear', { since: since ?? null }) : Promise.resolve(0),
  setRecording: (enabled: boolean): Promise<void> =>
    isTauri ? invoke('history_set_recording', { enabled }) : Promise.resolve(),
  recordingEnabled: (): Promise<boolean> =>
    isTauri ? invoke<boolean>('history_recording_enabled') : Promise.resolve(true),
}

/** Day bucket label used to group the list. */
export function dayLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400_000)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function timeLabel(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
