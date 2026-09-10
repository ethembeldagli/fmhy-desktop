import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { useBrowser } from '../../browser/store'
import { fuzzyRank, highlightRuns } from '../../search/fuzzy'
import type { PlatformInfo } from '../../platform'
import { useOverlay } from '../../browser/overlay'
import type { Route } from '../../browser/types'
import { interpretInput } from './Toolbar'
import './CommandPalette.css'

interface Command {
  id: string
  title: string
  subtitle?: string
  icon: IconName
  group: string
  keywords?: string
  shortcut?: string
  run: () => void
}

function Highlighted({ text, positions }: { text: string; positions: number[] }) {
  return (
    <>
      {highlightRuns(text, positions).map((run, i) =>
        run.match ? (
          <span key={i} className="palette__match">
            {run.text}
          </span>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  )
}

export function CommandPalette({ platform }: { platform: PlatformInfo }) {
  const open = useBrowser((s) => s.paletteOpen)
  const setOpen = useBrowser((s) => s.setPaletteOpen)
  const navigate = useBrowser((s) => s.navigate)
  const newTab = useBrowser((s) => s.newTab)
  const closeTab = useBrowser((s) => s.closeTab)
  const activeTabId = useBrowser((s) => s.activeTabId)
  const restoreClosedTab = useBrowser((s) => s.restoreClosedTab)
  const toggleRail = useBrowser((s) => s.toggleRail)
  const setTheme = useBrowser((s) => s.setTheme)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const mod = platform.modKey

  const commands = useMemo<Command[]>(() => {
    const go = (label: string, route: Route, icon: IconName, keywords?: string): Command => ({
      id: `go:${label}`,
      title: label,
      icon,
      group: 'Navigate',
      keywords,
      run: () => navigate(route),
    })

    return [
      go('Home', { view: 'home' }, 'home', 'start dashboard'),
      go('Discover', { view: 'discover' }, 'compass', 'explore new browse'),
      go('Categories', { view: 'categories' }, 'categories', 'sections index wiki'),
      go('Search', { view: 'search' }, 'search', 'find lookup'),
      go('Favorites', { view: 'favorites' }, 'star', 'saved bookmarks starred'),
      go('History', { view: 'history' }, 'clock', 'recent visited'),
      go('Downloads', { view: 'downloads' }, 'download', 'files saved'),
      go('Settings', { view: 'settings' }, 'settings', 'preferences options config'),
      {
        id: 'tab:new',
        title: 'New tab',
        icon: 'plus',
        group: 'Tabs',
        shortcut: `${mod}T`,
        run: () => newTab(),
      },
      {
        id: 'tab:close',
        title: 'Close tab',
        icon: 'close',
        group: 'Tabs',
        shortcut: `${mod}W`,
        run: () => closeTab(activeTabId),
      },
      {
        id: 'tab:restore',
        title: 'Reopen closed tab',
        icon: 'reload',
        group: 'Tabs',
        shortcut: `${mod}⇧T`,
        run: restoreClosedTab,
      },
      {
        id: 'view:sidebar',
        title: 'Toggle sidebar',
        icon: 'panel-left',
        group: 'View',
        shortcut: `${mod}B`,
        run: toggleRail,
      },
      {
        id: 'view:dark',
        title: 'Use dark appearance',
        icon: 'moon',
        group: 'View',
        keywords: 'theme night',
        run: () => setTheme('dark'),
      },
      {
        id: 'view:light',
        title: 'Use light appearance',
        icon: 'sun',
        group: 'View',
        keywords: 'theme day',
        run: () => setTheme('light'),
      },
      {
        id: 'view:system',
        title: 'Match system appearance',
        icon: 'settings',
        group: 'View',
        keywords: 'theme auto',
        run: () => setTheme('system'),
      },
    ]
  }, [navigate, newTab, closeTab, activeTabId, restoreClosedTab, toggleRail, setTheme, mod])

  const results = useMemo(() => {
    if (!query.trim()) {
      return commands.map((item) => ({ item, positions: [] as number[] }))
    }
    return fuzzyRank(
      query.trim(),
      commands,
      (c) => [
        { text: c.title, weight: 1 },
        { text: c.keywords ?? '', weight: 0.5 },
        { text: c.group, weight: 0.3 },
      ],
      30,
    ).map(({ item, positions }) => ({ item, positions }))
  }, [query, commands])

  // Typing something that looks like a destination offers it as the top action.
  const directAction = useMemo(() => {
    const value = query.trim()
    if (!value) return null
    const route = interpretInput(value)
    return route.view === 'web'
      ? { label: `Open ${route.url}`, subtitle: 'Open in a new tab', route, icon: 'globe' as const }
      : { label: `Search FMHY for “${value}”`, subtitle: 'Full-text search', route, icon: 'search' as const }
  }, [query])

  const total = results.length + (directAction ? 1 : 0)

  useEffect(() => setSelected(0), [query])

  // Content webviews paint above the chrome UI, so the page is hidden while
  // the palette is on screen or it would be invisible behind it.
  useOverlay(open)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    listRef.current
      ?.querySelector('.palette__item--selected')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  function activate(index: number) {
    if (directAction && index === 0) {
      navigate(directAction.route)
    } else {
      const entry = results[index - (directAction ? 1 : 0)]
      entry?.item.run()
    }
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault()
      setSelected((s) => (total === 0 ? 0 : (s + 1) % total))
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault()
      setSelected((s) => (total === 0 ? 0 : (s - 1 + total) % total))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      activate(selected)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  let lastGroup = ''

  return (
    <div
      className="palette-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette__field">
          <span className="palette__field-icon">
            <Icon name="search" size={16} />
          </span>
          <input
            className="palette__input"
            autoFocus
            spellCheck={false}
            placeholder="Search FMHY, jump to a page, or run a command"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="palette__esc">esc</span>
        </div>

        <div className="palette__results scroll" ref={listRef}>
          {total === 0 && (
            <div className="palette__empty">
              <div className="palette__empty-title">No matching commands</div>
              <div className="palette__empty-sub">
                Try a different term, or press Enter to search FMHY.
              </div>
            </div>
          )}

          {directAction && (
            <button
              className={`palette__item${selected === 0 ? ' palette__item--selected' : ''}`}
              onPointerEnter={() => setSelected(0)}
              onClick={() => activate(0)}
            >
              <span className="palette__item-icon">
                <Icon name={directAction.icon} size={14} />
              </span>
              <span className="palette__item-body">
                <span className="palette__item-title">{directAction.label}</span>
                <span className="palette__item-sub">{directAction.subtitle}</span>
              </span>
            </button>
          )}

          {results.map(({ item, positions }, i) => {
            const index = i + (directAction ? 1 : 0)
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.id}>
                {showGroup && <div className="palette__group">{item.group}</div>}
                <button
                  className={`palette__item${selected === index ? ' palette__item--selected' : ''}`}
                  onPointerEnter={() => setSelected(index)}
                  onClick={() => activate(index)}
                >
                  <span className="palette__item-icon">
                    <Icon name={item.icon} size={14} />
                  </span>
                  <span className="palette__item-body">
                    <span className="palette__item-title">
                      <Highlighted text={item.title} positions={positions} />
                    </span>
                    {item.subtitle && <span className="palette__item-sub">{item.subtitle}</span>}
                  </span>
                  {item.shortcut && <span className="palette__item-shortcut">{item.shortcut}</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="palette__footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> dismiss
          </span>
        </div>
      </div>
    </div>
  )
}
