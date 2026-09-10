import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../platform'

export interface Download {
  id: number
  url: string
  filename: string
  path: string | null
  bytes: number
  totalBytes: number | null
  status: 'pending' | 'active' | 'done' | 'failed' | 'cancelled'
  createdAt: number
}

export const downloads = {
  list: (): Promise<Download[]> =>
    isTauri ? invoke<Download[]>('downloads_list') : Promise.resolve([]),
  remove: (id: number): Promise<void> =>
    isTauri ? invoke('downloads_remove', { id }) : Promise.resolve(),
  clear: (): Promise<number> =>
    isTauri ? invoke<number>('downloads_clear') : Promise.resolve(0),
  reveal: (path: string): Promise<void> =>
    isTauri ? invoke('downloads_reveal', { path }) : Promise.resolve(),
}

export function formatBytes(bytes: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
