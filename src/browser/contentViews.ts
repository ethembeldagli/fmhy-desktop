/**
 * Lifecycle manager for content webviews.
 *
 * One native child webview per tab that has visited a site. The React tree
 * never renders page content — it only decides *where* the webview sits and
 * *which* one is visible, because these are real OS webviews layered over the
 * window rather than elements in the document.
 *
 * Three rules this module enforces:
 *
 * 1. **Exactly one visible view.** Switching tabs, or moving to a native FMHY
 *    route, hides whatever was showing.
 * 2. **Geometry comes from the DOM.** The viewport element is measured and its
 *    rect pushed down; the engine's own auto-resize is not used (see the Rust
 *    browser module for why).
 * 3. **Overlays win.** Child webviews always paint above the chrome webview, so
 *    anything covering the content area hides it first.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useBrowser } from './store'
import { currentRoute, type Tab } from './types'
import { contentView, onEvent, type ViewRect } from '../platform'

interface EngineState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  secure: boolean
}

interface VisitedEvent {
  id: string
  url: string
}

interface ExternalSchemeEvent {
  id: string
  url: string
}

function rectOf(element: HTMLElement | null): ViewRect | null {
  if (!element) return null
  const box = element.getBoundingClientRect()
  if (box.width < 1 || box.height < 1) return null
  return { x: box.left, y: box.top, width: box.width, height: box.height }
}

export function useContentViews(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  onExternalScheme: (event: ExternalSchemeEvent) => void,
) {
  const tabs = useBrowser((s) => s.tabs)
  const activeTabId = useBrowser((s) => s.activeTabId)
  const paletteOpen = useBrowser((s) => s.paletteOpen)
  const setTabState = useBrowser((s) => s.setTabState)

  /** Tab ids that currently own a native webview. */
  const live = useRef(new Set<string>())
  /** URL each view was last told to load, to avoid redundant navigations. */
  const lastUrl = useRef(new Map<string, string>())
  /** Guards against duplicate creation from React's double-invoked effects. */
  const creating = useRef(new Set<string>())

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const route = activeTab ? currentRoute(activeTab) : { view: 'home' as const }
  const activeUrl = route.view === 'web' ? route.url : null

  const pushRect = useCallback(() => {
    const rect = rectOf(viewportRef.current)
    if (!rect || !activeUrl || !activeTabId) return
    if (!live.current.has(activeTabId)) return
    void contentView.setRect(activeTabId, rect)
  }, [viewportRef, activeUrl, activeTabId])

  // Engine -> store. The engine is authoritative for title, loading and
  // security once a tab is showing a site.
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = []

    unlisteners.push(
      onEvent<EngineState>('browser://state', (state) => {
        lastUrl.current.set(state.id, state.url)
        setTabState(state.id, {
          title: state.title || state.url,
          loading: state.loading,
          secure: state.secure,
          webUrl: state.url,
          webCanGoBack: state.canGoBack,
          webCanGoForward: state.canGoForward,
        })
      }),
    )

    unlisteners.push(
      onEvent<VisitedEvent>('browser://visited', () => {
        // History persistence is handled by the history module; the event is
        // emitted here so it stays a single source of navigation truth.
      }),
    )

    unlisteners.push(onEvent<ExternalSchemeEvent>('browser://external-scheme', onExternalScheme))

    return () => {
      unlisteners.forEach((p) => void p.then((off) => off()))
    }
  }, [setTabState, onExternalScheme])

  // Create / navigate / show the view for the active tab.
  useEffect(() => {
    let cancelled = false

    async function apply() {
      if (!activeTabId) return

      if (!activeUrl) {
        // A native FMHY route owns the viewport; nothing should cover it.
        await contentView.setActive(null)
        return
      }

      const rect = rectOf(viewportRef.current)
      if (!rect) return

      if (!live.current.has(activeTabId) && !creating.current.has(activeTabId)) {
        creating.current.add(activeTabId)
        try {
          await contentView.create(activeTabId, activeUrl, rect)
          if (cancelled) return
          live.current.add(activeTabId)
          lastUrl.current.set(activeTabId, activeUrl)
        } catch (error) {
          console.error('[browser] could not create content view:', error)
          setTabState(activeTabId, { loading: false })
          return
        } finally {
          creating.current.delete(activeTabId)
        }
      } else if (live.current.has(activeTabId)) {
        // Only re-navigate when the route actually points somewhere new;
        // in-page navigation already moved the engine.
        if (lastUrl.current.get(activeTabId) !== activeUrl) {
          lastUrl.current.set(activeTabId, activeUrl)
          await contentView.navigate(activeTabId, activeUrl)
        }
        await contentView.setRect(activeTabId, rect)
      }

      if (cancelled) return
      await contentView.setActive(activeTabId)
    }

    void apply()
    return () => {
      cancelled = true
    }
  }, [activeTabId, activeUrl, viewportRef, setTabState])

  // Tear down views for tabs that no longer exist.
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.id))
    for (const id of [...live.current]) {
      if (!open.has(id)) {
        live.current.delete(id)
        lastUrl.current.delete(id)
        void contentView.close(id)
      }
    }
  }, [tabs])

  // Overlays that cover the content area must hide it first.
  useEffect(() => {
    void contentView.setOverlay(paletteOpen)
  }, [paletteOpen])

  // Keep geometry in step with layout: sidebar collapse, window resize, zoom.
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(pushRect)
    observer.observe(element)
    window.addEventListener('resize', pushRect)
    const unlisten = onEvent('window://resized', pushRect)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', pushRect)
      void unlisten.then((off) => off())
    }
  }, [viewportRef, pushRect])

  return { pushRect }
}

/**
 * Back/forward that respects both histories.
 *
 * Within a site the engine's own stack is used; once it is exhausted the route
 * stack takes over, which is what makes "back" eventually return to the FMHY
 * page the site was opened from.
 */
export function useNavigation() {
  const back = useBrowser((s) => s.back)
  const forward = useBrowser((s) => s.forward)
  const navigate = useBrowser((s) => s.navigate)

  const goBack = useCallback(
    async (tab: Tab) => {
      const route = currentRoute(tab)
      if (route.view === 'web' && tab.webCanGoBack) {
        const moved = await contentView.back(tab.id)
        if (moved) return
      }
      back(tab.id)
    },
    [back],
  )

  const goForward = useCallback(
    async (tab: Tab) => {
      const route = currentRoute(tab)
      if (route.view === 'web' && tab.webCanGoForward) {
        const moved = await contentView.forward(tab.id)
        if (moved) return
      }
      forward(tab.id)
    },
    [forward],
  )

  const reload = useCallback(
    (tab: Tab) => {
      const route = currentRoute(tab)
      if (route.view === 'web') {
        if (tab.loading) void contentView.stop(tab.id)
        else void contentView.reload(tab.id)
        return
      }
      navigate(route, { replace: true })
    },
    [navigate],
  )

  return { goBack, goForward, reload }
}

export function canGoBackAnywhere(tab: Tab): boolean {
  return tab.webCanGoBack || tab.cursor > 0
}

export function canGoForwardAnywhere(tab: Tab): boolean {
  return tab.webCanGoForward || tab.cursor < tab.entries.length - 1
}
