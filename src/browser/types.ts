/**
 * A location a tab can display.
 *
 * FMHY pages and external sites share one route union, so a single tab history
 * can interleave them: opening a resource from a category page is just another
 * entry, and Back returns to the category rather than to some separate mode.
 */
export type Route =
  | { view: 'home' }
  | { view: 'discover' }
  | { view: 'categories'; page?: string; section?: string }
  | { view: 'search'; query?: string }
  | { view: 'favorites' }
  | { view: 'history' }
  | { view: 'downloads' }
  | { view: 'settings'; section?: string }
  | { view: 'web'; url: string }

export type NavView = Route['view']

/** Resolves a category slug to its display title; set by the FMHY layer. */
let resolvePageTitle: (slug: string) => string | undefined = () => undefined

export function setPageTitleResolver(fn: (slug: string) => string | undefined) {
  resolvePageTitle = fn
}

export interface Tab {
  id: string
  entries: Route[]
  cursor: number
  /** Display title; for web tabs this is reported by the engine. */
  title: string
  loading: boolean
  pinned: boolean
  /** Whether the current web origin is https. Meaningless for FMHY routes. */
  secure: boolean
  /** Set when the tab is playing audio, where the engine reports it. */
  audible: boolean
  /**
   * Live state of this tab's content webview, mirrored from the engine.
   *
   * A tab keeps two histories: `entries` records route-level moves (an FMHY
   * page, then a site), while the engine owns navigation *within* a site.
   * Back consults the engine first and falls back to the route stack, so
   * leaving a site is the step after exhausting its own history.
   */
  webUrl: string | null
  webCanGoBack: boolean
  webCanGoForward: boolean
}

export function currentRoute(tab: Tab): Route {
  return tab.entries[tab.cursor] ?? { view: 'home' }
}

export function canGoBack(tab: Tab): boolean {
  return tab.cursor > 0
}

export function canGoForward(tab: Tab): boolean {
  return tab.cursor < tab.entries.length - 1
}

/** Human label for a route, used for tab titles and breadcrumbs. */
export function routeTitle(route: Route): string {
  switch (route.view) {
    case 'home':
      return 'Home'
    case 'discover':
      return 'Discover'
    case 'categories':
      if (!route.page) return 'Categories'
      return route.section ?? resolvePageTitle(route.page) ?? route.page
    case 'search':
      return route.query ? `Search: ${route.query}` : 'Search'
    case 'favorites':
      return 'Favorites'
    case 'history':
      return 'History'
    case 'downloads':
      return 'Downloads'
    case 'settings':
      return 'Settings'
    case 'web':
      return prettyHost(route.url)
  }
}

export function prettyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** True when the route is rendered by our own UI rather than a web engine. */
export function isNativeRoute(route: Route): boolean {
  return route.view !== 'web'
}
