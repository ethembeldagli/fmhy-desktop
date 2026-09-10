import { create } from 'zustand'
import {
  canGoBack,
  canGoForward,
  currentRoute,
  routeTitle,
  type Route,
  type Tab,
} from './types'

let tabSeq = 0
const nextId = () => `t${++tabSeq}-${Date.now().toString(36)}`

function makeTab(route: Route = { view: 'home' }): Tab {
  return {
    id: nextId(),
    entries: [route],
    cursor: 0,
    title: routeTitle(route),
    loading: false,
    pinned: false,
    secure: true,
    audible: false,
    webUrl: null,
    webCanGoBack: false,
    webCanGoForward: false,
  }
}

interface ClosedTab {
  tab: Tab
  index: number
}

export type ThemePreference = 'system' | 'light' | 'dark'

interface BrowserStore {
  tabs: Tab[]
  activeTabId: string
  closed: ClosedTab[]
  railCollapsed: boolean
  paletteOpen: boolean
  theme: ThemePreference
  /** FMHY's own content filters, offered in the sidebar legend card. */
  filterStarred: boolean
  filterIndexes: boolean

  activeTab: () => Tab
  newTab: (route?: Route, options?: { background?: boolean }) => string
  closeTab: (id: string) => void
  restoreClosedTab: () => void
  activateTab: (id: string) => void
  activateRelative: (delta: number) => void
  activateIndex: (index: number) => void
  duplicateTab: (id: string) => void
  togglePin: (id: string) => void
  moveTab: (from: number, to: number) => void
  closeOthers: (id: string) => void

  navigate: (route: Route, options?: { tabId?: string; replace?: boolean }) => void
  back: (tabId?: string) => void
  forward: (tabId?: string) => void

  setTabState: (id: string, patch: Partial<Tab>) => void
  toggleRail: () => void
  setPaletteOpen: (open: boolean) => void
  setTheme: (theme: ThemePreference) => void
  setFilter: (key: 'filterStarred' | 'filterIndexes', value: boolean) => void
}

const initial = makeTab()

export const useBrowser = create<BrowserStore>((set, get) => ({
  tabs: [initial],
  activeTabId: initial.id,
  closed: [],
  railCollapsed: false,
  paletteOpen: false,
  theme: 'system',
  filterStarred: false,
  filterIndexes: false,

  activeTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId) ?? tabs[0]!
  },

  newTab: (route = { view: 'home' }, options) => {
    const tab = makeTab(route)
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: options?.background ? s.activeTabId : tab.id,
    }))
    return tab.id
  },

  closeTab: (id) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id)
      if (index === -1) return s

      const tab = s.tabs[index]!
      const tabs = s.tabs.filter((t) => t.id !== id)

      // Never leave the window empty: closing the last tab opens a fresh one.
      if (tabs.length === 0) {
        const replacement = makeTab()
        return {
          tabs: [replacement],
          activeTabId: replacement.id,
          closed: [{ tab, index }, ...s.closed].slice(0, 12),
        }
      }

      // Activate the neighbour to the right, matching platform convention.
      const activeTabId =
        s.activeTabId === id ? (tabs[Math.min(index, tabs.length - 1)]!.id) : s.activeTabId

      return { tabs, activeTabId, closed: [{ tab, index }, ...s.closed].slice(0, 12) }
    }),

  restoreClosedTab: () =>
    set((s) => {
      const [entry, ...rest] = s.closed
      if (!entry) return s
      const tabs = [...s.tabs]
      tabs.splice(Math.min(entry.index, tabs.length), 0, entry.tab)
      return { tabs, closed: rest, activeTabId: entry.tab.id }
    }),

  activateTab: (id) => set({ activeTabId: id }),

  activateRelative: (delta) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === s.activeTabId)
      if (index === -1) return s
      const next = (index + delta + s.tabs.length) % s.tabs.length
      return { activeTabId: s.tabs[next]!.id }
    }),

  activateIndex: (index) =>
    set((s) => {
      // Index 8 is conventionally "last tab", not the ninth.
      const target = index === 8 ? s.tabs.length - 1 : index
      const tab = s.tabs[target]
      return tab ? { activeTabId: tab.id } : s
    }),

  duplicateTab: (id) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id)
      const source = s.tabs[index]
      if (!source) return s
      const copy: Tab = { ...source, id: nextId(), entries: [...source.entries], pinned: false }
      const tabs = [...s.tabs]
      tabs.splice(index + 1, 0, copy)
      return { tabs, activeTabId: copy.id }
    }),

  togglePin: (id) =>
    set((s) => {
      const tabs = s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
      // Pinned tabs cluster at the head of the strip.
      tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned))
      return { tabs }
    }),

  moveTab: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.tabs.length || to >= s.tabs.length) {
        return s
      }
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved!)
      return { tabs }
    }),

  closeOthers: (id) =>
    set((s) => {
      const keep = s.tabs.filter((t) => t.id === id || t.pinned)
      return keep.length ? { tabs: keep, activeTabId: id } : s
    }),

  navigate: (route, options) =>
    set((s) => {
      const id = options?.tabId ?? s.activeTabId
      return {
        tabs: s.tabs.map((tab) => {
          if (tab.id !== id) return tab

          if (options?.replace) {
            const entries = [...tab.entries]
            entries[tab.cursor] = route
            return { ...tab, entries, title: routeTitle(route) }
          }

          // Navigating discards anything ahead of the cursor, as a browser does.
          const entries = [...tab.entries.slice(0, tab.cursor + 1), route]
          return {
            ...tab,
            entries,
            cursor: entries.length - 1,
            title: routeTitle(route),
            loading: route.view === 'web',
          }
        }),
      }
    }),

  back: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (tab.id !== (tabId ?? s.activeTabId) || !canGoBack(tab)) return tab
        const cursor = tab.cursor - 1
        return { ...tab, cursor, title: routeTitle(tab.entries[cursor]!) }
      }),
    })),

  forward: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (tab.id !== (tabId ?? s.activeTabId) || !canGoForward(tab)) return tab
        const cursor = tab.cursor + 1
        return { ...tab, cursor, title: routeTitle(tab.entries[cursor]!) }
      }),
    })),

  setTabState: (id, patch) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setTheme: (theme) => set({ theme }),
  setFilter: (key, value) => set({ [key]: value } as Partial<BrowserStore>),
}))

export { canGoBack, canGoForward, currentRoute }
