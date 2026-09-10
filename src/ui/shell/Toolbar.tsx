import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { useBrowser } from '../../browser/store'
import { currentRoute, type Route } from '../../browser/types'
import {
  canGoBackAnywhere,
  canGoForwardAnywhere,
  useNavigation,
} from '../../browser/contentViews'
import { openExternal, type PlatformInfo } from '../../platform'
import { ECOSYSTEM, TOP_NAV, isOffSite } from '../../fmhy/nav'
import { useFavorites } from '../../favorites/store'
import { useAdblock } from '../../browser/adblockStore'
import { categoryFavorite, resourceFavorite } from '../../favorites/api'
import { pageBySlug } from '../../fmhy/catalog'
import { NavDropdown } from './NavDropdown'
import { Emoji } from '../components/Emoji'
import { ServiceIcon } from '../components/ServiceIcon'
import { Mark } from '../components/Mark'
import './Toolbar.css'

/** Turn raw address-bar input into a route: URL if it looks like one, else search. */
export function interpretInput(raw: string): Route {
  const value = raw.trim()
  if (!value) return { view: 'home' }

  if (/^https?:\/\//i.test(value)) return { view: 'web', url: value }

  // A bare hostname: a dotted token with no spaces, e.g. "example.com/path".
  if (!/\s/.test(value) && /^[^\s/]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
    return { view: 'web', url: `https://${value}` }
  }

  return { view: 'search', query: value }
}

function LocationDisplay({ route }: { route: Route }) {
  if (route.view === 'web') {
    try {
      const url = new URL(route.url)
      const path = url.pathname === '/' ? '' : url.pathname
      return (
        <span className="address__display">
          <span className="address__host">{url.host.replace(/^www\./, '')}</span>
          <span className="address__path">
            {path}
            {url.search}
          </span>
        </span>
      )
    } catch {
      return <span className="address__display">{route.url}</span>
    }
  }

  const crumbs = ['FMHY']
  if (route.view === 'categories') {
    crumbs.push('Categories')
    if (route.page) crumbs.push(route.page)
    if (route.section) crumbs.push(route.section)
  } else if (route.view !== 'home') {
    crumbs.push(route.view.charAt(0).toUpperCase() + route.view.slice(1))
  }

  return (
    <span className="address__display">
      {crumbs.map((crumb, i) => (
        <span key={i}>
          {i > 0 && <span className="address__crumb-sep">/</span>}
          <span className={i === crumbs.length - 1 ? 'address__host' : 'address__crumb'}>
            {crumb}
          </span>
        </span>
      ))}
    </span>
  )
}

export function Toolbar({ platform }: { platform: PlatformInfo }) {
  const tab = useBrowser((s) => s.tabs.find((t) => t.id === s.activeTabId)!)
  const navigate = useBrowser((s) => s.navigate)
  const collapsed = useBrowser((s) => s.railCollapsed)
  const toggleRail = useBrowser((s) => s.toggleRail)
  const theme = useBrowser((s) => s.theme)
  const setTheme = useBrowser((s) => s.setTheme)
  const { goBack, goForward, reload } = useNavigation()
  const toggleFavorite = useFavorites((s) => s.toggle)
  const blockStatus = useAdblock((s) => s.status)
  const toggleBlocking = useAdblock((s) => s.toggle)

  const resolvedTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme

  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const stored = currentRoute(tab)
  const route: Route =
    stored.view === 'web' && tab.webUrl ? { view: 'web', url: tab.webUrl } : stored

  // What the star acts on depends on the route: a site, or an FMHY category.
  const favoriteTarget =
    route.view === 'web'
      ? resourceFavorite(tab.title || route.url, route.url)
      : stored.view === 'categories' && stored.page
        ? categoryFavorite(pageBySlug(stored.page)?.title ?? stored.page, stored.page)
        : null
  const favoriteKey = favoriteTarget?.url ?? favoriteTarget?.fmhyPath ?? null
  const isSaved = useFavorites((s) => s.isSaved(favoriteKey))

  useEffect(() => {
    if (focused) inputRef.current?.select()
  }, [focused])

  // Cmd/Ctrl+L is handled globally and routed here as an event, so the
  // shortcut table stays in one place.
  useEffect(() => {
    const focus = () => beginEditing()
    window.addEventListener('fmhy:focus-address', focus)
    return () => window.removeEventListener('fmhy:focus-address', focus)
  })

  function beginEditing() {
    setDraft(route.view === 'web' ? route.url : '')
    setFocused(true)
  }

  function commit() {
    const next = interpretInput(draft)
    setFocused(false)
    if (draft.trim()) navigate(next)
  }

  const secure = route.view === 'web' ? tab.secure : true
  const leadIcon = route.view === 'web' ? (secure ? 'lock' : 'alert') : 'sparkle'
  const leadClass =
    route.view === 'web'
      ? secure
        ? 'address__lead address__lead--secure'
        : 'address__lead address__lead--insecure'
      : 'address__lead'

  return (
    <div className="navbar">
      <div
        className="navbar__brand"
        style={{
          width: collapsed ? 'var(--rail-width-collapsed)' : 'var(--rail-width)',
        }}
      >
        <span className="navbar__mark">
          <Mark size={22} />
        </span>
        {!collapsed && <span className="navbar__wordmark">FMHY</span>}
      </div>

      <div className="navbar__main">
      <div className="navbar__group">
        <button
          className="icon-button"
          disabled={!canGoBackAnywhere(tab)}
          onClick={() => void goBack(tab)}
          title={`Back (${platform.modKey}[)`}
          aria-label="Back"
        >
          <Icon name="arrow-left" size={15} />
        </button>
        <button
          className="icon-button"
          disabled={!canGoForwardAnywhere(tab)}
          onClick={() => void goForward(tab)}
          title={`Forward (${platform.modKey}])`}
          aria-label="Forward"
        >
          <Icon name="arrow-right" size={15} />
        </button>
        <button
          className="icon-button"
          onClick={() => reload(tab)}
          title={`${tab.loading ? 'Stop' : 'Reload'} (${platform.modKey}R)`}
          aria-label={tab.loading ? 'Stop loading' : 'Reload'}
        >
          <Icon name={tab.loading ? 'close' : 'reload'} size={15} />
        </button>
      </div>

      <div className={`address${focused ? ' address--focused' : ''}`} onClick={beginEditing}>
        <span className={leadClass}>
          <Icon name={leadIcon} size={13} />
        </span>

        {focused ? (
          <input
            ref={inputRef}
            className="address__input"
            value={draft}
            autoFocus
            spellCheck={false}
            placeholder="Search FMHY or enter an address"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setFocused(false)
              }
            }}
          />
        ) : (
          <>
            <LocationDisplay route={route} />
            <span className="address__hint">{platform.modKey}L</span>
          </>
        )}
      </div>

      {/* FMHY's own top-navigation links; they open in the app's browser. */}
      <nav className="navbar__links" aria-label="FMHY links">
        {TOP_NAV.map((link) => (
          <button
            key={link.label}
            className="navbar__link"
            onClick={() => navigate({ view: 'web', url: link.url })}
          >
            <Emoji name={link.emoji} size={13} />
            {link.label}
            {isOffSite(link.url) && <span className="navdrop__external">↗</span>}
          </button>
        ))}
        <NavDropdown
          label="Ecosystem"
          emoji="seedling"
          items={ECOSYSTEM}
          onSelect={(url) => navigate({ view: 'web', url })}
        />
      </nav>

      <div className="navbar__group">
        <button
          className={`icon-button${isSaved ? ' icon-button--on' : ''}`}
          disabled={!favoriteTarget}
          onClick={() => favoriteTarget && void toggleFavorite(favoriteTarget)}
          title={isSaved ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isSaved ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Icon name={isSaved ? 'star-filled' : 'star'} size={15} />
        </button>
        <button
          className="icon-button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} appearance`}
          aria-label="Toggle appearance"
        >
          <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} size={15} />
        </button>
        {blockStatus?.supported && (
          <button
            className={`icon-button${blockStatus.enabled ? ' icon-button--shield' : ''}`}
            onClick={() => void toggleBlocking()}
            title={
              blockStatus.enabled
                ? blockStatus.ready
                  ? `Blocking ads and trackers — ${blockStatus.rules.toLocaleString()} rules active`
                  : 'Blocking on — building rule list…'
                : 'Ad and tracker blocking is off'
            }
            aria-label="Toggle ad and tracker blocking"
            aria-pressed={blockStatus.enabled}
          >
            <Icon name="shield" size={15} />
          </button>
        )}
        <button
          className="icon-button"
          onClick={() => navigate({ view: 'settings' })}
          title={`Settings (${platform.modKey},)`}
          aria-label="Settings"
        >
          <Icon name="settings" size={15} />
        </button>
        <button
          className="icon-button"
          onClick={toggleRail}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (${platform.modKey}B)`}
          aria-label="Toggle sidebar"
        >
          <Icon name="panel-left" size={15} />
        </button>

        {/* FMHY links these from its own nav bar; they open outside the app. */}
        <button
          className="icon-button"
          onClick={() => void openExternal('https://github.com/fmhy/edit')}
          title="FMHY on GitHub"
          aria-label="FMHY on GitHub"
        >
          <ServiceIcon name="github" size={15} />
        </button>
        <button
          className="icon-button"
          onClick={() => void openExternal('https://www.reddit.com/r/FREEMEDIAHECKYEAH/')}
          title="r/FREEMEDIAHECKYEAH"
          aria-label="FMHY subreddit"
        >
          <ServiceIcon name="reddit" size={15} />
        </button>
      </div>
      </div>
    </div>
  )
}
