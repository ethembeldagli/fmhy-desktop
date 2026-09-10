import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../platform'

export type FavoriteKind = 'resource' | 'category' | 'external'

export interface Favorite {
  id: number
  kind: FavoriteKind
  title: string
  url: string | null
  fmhyPath: string | null
  note: string | null
  createdAt: number
}

/** The shape the backend accepts when saving; id/createdAt are assigned there. */
export type NewFavorite = Omit<Favorite, 'id' | 'createdAt'>

export const favorites = {
  list: (): Promise<Favorite[]> =>
    isTauri ? invoke<Favorite[]>('favorites_list') : Promise.resolve([]),
  /** Returns true when the item is now saved, false when it was removed. */
  toggle: (favorite: NewFavorite): Promise<boolean> =>
    isTauri ? invoke<boolean>('favorites_toggle', { favorite }) : Promise.resolve(false),
  remove: (id: number): Promise<void> =>
    isTauri ? invoke('favorites_remove', { id }) : Promise.resolve(),
  /**
   * Every saved URL and category slug in one call, so a long list can mark its
   * stars without a query per row.
   */
  keys: (): Promise<string[]> =>
    isTauri ? invoke<string[]>('favorites_keys') : Promise.resolve([]),
}

export function resourceFavorite(title: string, url: string): NewFavorite {
  return { kind: 'resource', title, url, fmhyPath: null, note: null }
}

export function categoryFavorite(title: string, slug: string): NewFavorite {
  return { kind: 'category', title, url: null, fmhyPath: slug, note: null }
}
