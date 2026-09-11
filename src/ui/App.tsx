import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TabStrip } from './shell/TabStrip'
import { Toolbar } from './shell/Toolbar'
import { Rail } from './shell/Rail'
import { CommandPalette } from './shell/CommandPalette'
import { ExternalSchemePrompt } from './shell/ExternalSchemePrompt'
import { FindBar } from './shell/FindBar'
import { ContextMenuProvider } from './components/ContextMenu'
import { Home } from './views/Home'
import { Categories } from './views/Categories'
import { FmhyPage } from './views/FmhyPage'
import { SearchView } from './views/Search'
import { Settings } from './views/Settings'
import { History } from './views/History'
import { Favorites } from './views/Favorites'
import { Downloads } from './views/Downloads'
import { Discover } from './views/Placeholder'
import { useBrowser } from '../browser/store'
import { currentRoute, setPageTitleResolver } from '../browser/types'
import { useContentViews, useNavigation } from '../browser/contentViews'
import { useDataset } from '../fmhy/store'
import { useFavorites } from '../favorites/store'
import { useAdblock } from '../browser/adblockStore'
import { useUpdates } from '../updates/store'
import { pageBySlug } from '../fmhy/catalog'
import { getAppInfo, onEvent, type AppInfo } from '../platform'
import './styles/tokens.css'
import './styles/base.css'
import './App.css'

const THEME_KEY = 'fmhy.theme'
const RAIL_KEY = 'fmhy.rail-collapsed'

function useTheme() {
  const theme = useBrowser((s) => s.theme)
  const setTheme = useBrowser((s) => s.setTheme)

  // Restore the stored preference once, before first paint where possible.
  useLayoutEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') setTheme(stored)
  }, [setTheme])

  useLayoutEffect(() => {
    const root = document.documentElement
    // 'system' removes the attribute so the prefers-color-scheme rules apply.
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])
}

function useShortcuts() {
  const store = useBrowser
  const { goBack, goForward, reload } = useNavigation()
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const s = store.getState()
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      const key = event.key.toLowerCase()
      const shift = event.shiftKey

      // Digits jump straight to a tab; 9 conventionally means "last".
      if (/^[1-9]$/.test(event.key) && !shift) {
        event.preventDefault()
        s.activateIndex(Number(event.key) - 1)
        return
      }

      switch (key) {
        case 'k':
          event.preventDefault()
          s.setPaletteOpen(!s.paletteOpen)
          break
        case 'l':
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('fmhy:focus-address'))
          break
        case 't':
          event.preventDefault()
          if (shift) s.restoreClosedTab()
          else s.newTab()
          break
        case 'w':
          event.preventDefault()
          s.closeTab(s.activeTabId)
          break
        case 'b':
          event.preventDefault()
          s.toggleRail()
          break
        case 'f':
          if (currentRoute(s.activeTab()).view === 'web') {
            event.preventDefault()
            window.dispatchEvent(new CustomEvent('fmhy:find'))
          }
          break
        case 'r':
          event.preventDefault()
          reload(s.activeTab())
          break
        case '[':
          event.preventDefault()
          void goBack(s.activeTab())
          break
        case ']':
          event.preventDefault()
          void goForward(s.activeTab())
          break
        case 'arrowleft':
          if (event.altKey) {
            event.preventDefault()
            s.activateRelative(-1)
          }
          break
        case 'arrowright':
          if (event.altKey) {
            event.preventDefault()
            s.activateRelative(1)
          }
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store, goBack, goForward, reload])
}

/**
 * Back and forward from the mouse's side buttons.
 *
 * The click is caught natively and forwarded here rather than handled in the
 * page, because whenever a site is open it owns the pointer and the chrome
 * never sees the event. Routing it through `useNavigation` is the point: it
 * walks the site's own history first and the app's route stack after, so
 * holding Back eventually comes home to FMHY instead of stalling on a site.
 */
function useMouseNavigation() {
  const store = useBrowser
  const { goBack, goForward } = useNavigation()
  useEffect(() => {
    const unlisten = onEvent<{ back: boolean }>('browser://mouse-nav', ({ back }) => {
      const tab = store.getState().activeTab()
      if (back) void goBack(tab)
      else void goForward(tab)
    })
    return () => {
      void unlisten.then((off) => off())
    }
  }, [store, goBack, goForward])
}

export function App() {
  const [app, setApp] = useState<AppInfo | null>(null)
  const tab = useBrowser((s) => s.tabs.find((t) => t.id === s.activeTabId)!)
  const railCollapsed = useBrowser((s) => s.railCollapsed)
  const toggleRail = useBrowser((s) => s.toggleRail)
  const viewportRef = useRef<HTMLDivElement>(null)

  useTheme()
  useShortcuts()
  useMouseNavigation()

  // One quiet check at startup, so the app can say an update exists without
  // anyone having gone looking. It downloads nothing and stays silent if the
  // check itself fails — being offline is the usual reason.
  const checkForUpdates = useUpdates((s) => s.check)
  useEffect(() => {
    void checkForUpdates({ silent: true })
  }, [checkForUpdates])

  useEffect(() => {
    void getAppInfo().then(setApp)
    // Tab titles and breadcrumbs show category names, not slugs.
    setPageTitleResolver((slug) => pageBySlug(slug)?.title)
    void useDataset.getState().init()
    // Saved items are needed before the first list renders, so stars are
    // correct on first paint rather than filling in afterwards.
    void useFavorites.getState().load()
    void useAdblock.getState().load()
  }, [])

  useLayoutEffect(() => {
    if (localStorage.getItem(RAIL_KEY) === 'true' && !railCollapsed) toggleRail()
    // Only restores once at mount; later changes are written by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(RAIL_KEY, String(railCollapsed))
  }, [railCollapsed])

  useEffect(() => {
    const open = () => setFindOpen(true)
    window.addEventListener('fmhy:find', open)
    return () => window.removeEventListener('fmhy:find', open)
  }, [])

  /*
   * Native menu items delegate here rather than duplicating behaviour in Rust,
   * so a menu item and its keyboard shortcut always do the same thing.
   */
  useEffect(() => {
    const unlisten = onEvent<string>('menu://action', (action) => {
      const s = useBrowser.getState()
      switch (action) {
        case 'settings':
          s.navigate({ view: 'settings' })
          break
        case 'new-tab':
          s.newTab()
          break
        case 'close-tab':
          s.closeTab(s.activeTabId)
          break
        case 'reopen-tab':
          s.restoreClosedTab()
          break
        case 'toggle-sidebar':
          s.toggleRail()
          break
        case 'command-palette':
          s.setPaletteOpen(!s.paletteOpen)
          break
        case 'find':
          if (currentRoute(s.activeTab()).view === 'web') setFindOpen(true)
          break
        case 'reload':
          reloadRef.current?.(s.activeTab())
          break
        case 'back':
          void backRef.current?.(s.activeTab())
          break
        case 'forward':
          void forwardRef.current?.(s.activeTab())
          break
        case 'go-home':
          s.navigate({ view: 'home' })
          break
        case 'go-search':
          s.navigate({ view: 'search' })
          break
        case 'go-favorites':
          s.navigate({ view: 'favorites' })
          break
        case 'go-history':
          s.navigate({ view: 'history' })
          break
        case 'go-downloads':
          s.navigate({ view: 'downloads' })
          break
      }
    })
    return () => {
      void unlisten.then((off) => off())
    }
  }, [])

  // Native webviews for web tabs: creation, geometry, visibility and the
  // engine -> store event bridge all live in this hook.
  const [externalScheme, setExternalScheme] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const { goBack, goForward, reload } = useNavigation()
  const backRef = useRef(goBack)
  const forwardRef = useRef(goForward)
  const reloadRef = useRef(reload)
  backRef.current = goBack
  forwardRef.current = goForward
  reloadRef.current = reload
  const onExternalScheme = useCallback(
    (event: { url: string }) => setExternalScheme(event.url),
    [],
  )
  useContentViews(viewportRef, onExternalScheme)

  if (!app) {
    return <div className="app__boot">Starting FMHY Desktop…</div>
  }

  const route = currentRoute(tab)

  return (
    <ContextMenuProvider>
      <div className="app">
        <TabStrip platform={app.platform} />
        <Toolbar platform={app.platform} />
        <div className="app__body">
          <Rail />
          <main className="app__main">
            <FindBar
              tabId={tab.id}
              open={findOpen && route.view === 'web'}
              onClose={() => setFindOpen(false)}
            />
            <div className="app__viewport" ref={viewportRef}>
              {route.view === 'home' && <Home platform={app.platform} />}
              {route.view === 'discover' && <Discover />}
              {route.view === 'categories' &&
                (route.page ? <FmhyPage slug={route.page} /> : <Categories />)}
              {route.view === 'search' && <SearchView query={route.query} />}
              {route.view === 'favorites' && <Favorites />}
              {route.view === 'history' && <History platform={app.platform} />}
              {route.view === 'downloads' && <Downloads />}
              {route.view === 'settings' && <Settings app={app} platform={app.platform} />}
              {/*
                * Web routes render into a native child webview positioned over
                * this element, so nothing is drawn here. The message is only
                * visible in the moment before the view is attached.
                */}
              {route.view === 'web' && (
                <div className="app__boot">{tab.loading ? 'Loading…' : ''}</div>
              )}
            </div>
          </main>
        </div>
        <CommandPalette platform={app.platform} />
        <ExternalSchemePrompt url={externalScheme} onDismiss={() => setExternalScheme(null)} />
      </div>
    </ContextMenuProvider>
  )
}
