import { create } from 'zustand'
import { favorites, type Favorite, type NewFavorite } from './api'

interface FavoritesStore {
  items: Favorite[]
  /** Saved URLs and category slugs, for marking stars cheaply. */
  keys: Set<string>
  load: () => Promise<void>
  toggle: (favorite: NewFavorite) => Promise<void>
  remove: (id: number) => Promise<void>
  isSaved: (key: string | null | undefined) => boolean
}

export const useFavorites = create<FavoritesStore>((set, get) => ({
  items: [],
  keys: new Set(),

  load: async () => {
    const [items, keys] = await Promise.all([favorites.list(), favorites.keys()])
    set({ items, keys: new Set(keys) })
  },

  toggle: async (favorite) => {
    const key = favorite.url ?? favorite.fmhyPath
    // Update optimistically: a star should respond instantly, and the reload
    // below reconciles with what was actually stored.
    if (key) {
      const keys = new Set(get().keys)
      if (keys.has(key)) keys.delete(key)
      else keys.add(key)
      set({ keys })
    }
    await favorites.toggle(favorite)
    await get().load()
  },

  remove: async (id) => {
    await favorites.remove(id)
    await get().load()
  },

  isSaved: (key) => (key ? get().keys.has(key) : false),
}))
