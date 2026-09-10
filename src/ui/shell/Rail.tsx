import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Emoji } from '../components/Emoji'
import { useBrowser } from '../../browser/store'
import { currentRoute, type Route } from '../../browser/types'
import {
  EMOJI_LEGEND,
  NAV_GROUPS,
  NAV_LIBRARY,
  NAV_TOP,
  entryRoute,
  type NavEntry,
  type NavGroup,
} from '../../fmhy/nav'
import './Rail.css'

function isActive(route: Route, entry: NavEntry): boolean {
  const target = entryRoute(entry)
  if (target.view !== route.view) return false
  if (route.view === 'categories' && target.view === 'categories') {
    return route.page === target.page
  }
  if (route.view === 'web' && target.view === 'web') {
    return route.url === target.url
  }
  return true
}

export function Rail() {
  const collapsed = useBrowser((s) => s.railCollapsed)
  const navigate = useBrowser((s) => s.navigate)
  const tab = useBrowser((s) => s.tabs.find((t) => t.id === s.activeTabId)!)
  const filterStarred = useBrowser((s) => s.filterStarred)
  const filterIndexes = useBrowser((s) => s.filterIndexes)
  const setFilter = useBrowser((s) => s.setFilter)
  const route = currentRoute(tab)

  const [closed, setClosed] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.filter((g) => g.collapsedByDefault).map((g) => g.title)),
  )

  const toggle = (title: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })

  const renderItem = (entry: NavEntry) => (
    <button
      key={entry.key}
      className={`rail-item${isActive(route, entry) ? ' rail-item--active' : ''}`}
      onClick={() => navigate(entryRoute(entry))}
      title={collapsed ? entry.label : undefined}
      aria-current={isActive(route, entry) ? 'page' : undefined}
    >
      <Emoji name={entry.emoji} size={16} className="rail-item__emoji" />
      {!collapsed && <span className="rail-item__label">{entry.label}</span>}
    </button>
  )

  const renderGroup = (group: NavGroup) => {
    const open = !closed.has(group.title)
    return (
      <div key={group.title} className="rail__section">
        {!collapsed && (
          <button
            className="rail__group"
            onClick={() => toggle(group.title)}
            aria-expanded={open}
          >
            {group.title}
            <span className={`rail__group-chevron${open ? '' : ' rail__group-chevron--collapsed'}`}>
              <Icon name="chevron-down" size={14} />
            </span>
          </button>
        )}
        {(open || collapsed) && group.entries.map(renderItem)}
      </div>
    )
  }

  return (
    <nav className={`rail${collapsed ? ' rail--collapsed' : ''}`} aria-label="Main">
      <div className="rail__nav scroll">
        {NAV_TOP.map(renderItem)}
        {NAV_GROUPS.map(renderGroup)}
        {renderGroup(NAV_LIBRARY)}

        {!collapsed && (
          <div className="legend">
            <div className="legend__title">Emoji Legend</div>
            {EMOJI_LEGEND.map((item) => (
              <div className="legend__row" key={item.label}>
                <span className="legend__emoji">
                  <Emoji name={item.emoji} size={14} />
                </span>
                <span>{item.label}</span>
              </div>
            ))}

            <div className="legend__title legend__title--sub">Options</div>
            <Switch
              label="Toggle Starred"
              checked={filterStarred}
              onChange={(value) => setFilter('filterStarred', value)}
            />
            <Switch
              label="Toggle Indexes"
              checked={filterIndexes}
              onChange={(value) => setFilter('filterIndexes', value)}
            />
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="rail__footer">
          <p className="rail__disclaimer">
            <strong>Unofficial client.</strong> Not affiliated with or endorsed by FMHY.
          </p>
        </div>
      )}
    </nav>
  )
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      className="legend__row legend__row--switch"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="legend__switch-label">{label}</span>
      <span className={`switch${checked ? ' switch--on' : ''}`}>
        <span className="switch__knob" />
      </span>
    </button>
  )
}
