import { useRef, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { useBrowser } from '../../browser/store'
import { currentRoute, type Tab } from '../../browser/types'
import { windowAction, type PlatformInfo } from '../../platform'
import { useContextMenu } from '../components/ContextMenu'
import './TabStrip.css'

const routeIcon: Record<string, IconName> = {
  home: 'home',
  discover: 'compass',
  categories: 'categories',
  search: 'search',
  favorites: 'star',
  history: 'clock',
  downloads: 'download',
  settings: 'settings',
  web: 'globe',
}

function tabIcon(tab: Tab): IconName {
  return routeIcon[currentRoute(tab).view] ?? 'globe'
}

export function TabStrip({ platform }: { platform: PlatformInfo }) {
  const tabs = useBrowser((s) => s.tabs)
  const activeTabId = useBrowser((s) => s.activeTabId)
  const activateTab = useBrowser((s) => s.activateTab)
  const closeTab = useBrowser((s) => s.closeTab)
  const newTab = useBrowser((s) => s.newTab)
  const moveTab = useBrowser((s) => s.moveTab)
  const duplicateTab = useBrowser((s) => s.duplicateTab)
  const togglePin = useBrowser((s) => s.togglePin)
  const closeOthers = useBrowser((s) => s.closeOthers)
  const restoreClosedTab = useBrowser((s) => s.restoreClosedTab)
  const openMenu = useContextMenu()

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const showCustomControls = platform.windowChrome === 'custom'

  function onTabContextMenu(event: React.MouseEvent, tab: Tab, index: number) {
    event.preventDefault()
    openMenu(event, [
      { label: 'Duplicate tab', icon: 'categories', onSelect: () => duplicateTab(tab.id) },
      {
        label: tab.pinned ? 'Unpin tab' : 'Pin tab',
        icon: 'pin',
        onSelect: () => togglePin(tab.id),
      },
      { separator: true },
      { label: 'Reopen closed tab', icon: 'reload', onSelect: restoreClosedTab },
      { separator: true },
      {
        label: 'Close other tabs',
        onSelect: () => closeOthers(tab.id),
        disabled: tabs.length <= 1,
      },
      {
        label: 'Close tab',
        icon: 'close',
        danger: true,
        onSelect: () => closeTab(tab.id),
        shortcut: `${platform.modKey}W`,
      },
    ])
    void index
  }

  return (
    <div className="tabstrip" data-tauri-drag-region ref={stripRef}>
      {platform.trafficLightInset > 0 && (
        <div
          className="tabstrip__inset"
          style={{ width: platform.trafficLightInset }}
          data-tauri-drag-region
        />
      )}

      <div className="tabstrip__list" role="tablist" aria-label="Open tabs">
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId
          const dropClass =
            dropIndex === index && dragIndex !== null && dragIndex !== index
              ? dragIndex < index
                ? 'tab--drop-after'
                : 'tab--drop-before'
              : ''

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              title={tab.title}
              className={[
                'tab',
                active ? 'tab--active' : '',
                tab.pinned ? 'tab--pinned' : '',
                dragIndex === index ? 'tab--dragging' : '',
                dropClass,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => activateTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(tab.id) // middle-click closes
              }}
              onContextMenu={(e) => onTabContextMenu(e, tab, index)}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                e.preventDefault()
                setDropIndex(index)
              }}
              onDragEnd={() => {
                if (dragIndex !== null && dropIndex !== null) moveTab(dragIndex, dropIndex)
                setDragIndex(null)
                setDropIndex(null)
              }}
            >
              <span className="tab__icon">
                {tab.loading ? <span className="tab__spinner" /> : <Icon name={tabIcon(tab)} size={14} />}
              </span>

              {!tab.pinned && <span className="tab__label">{tab.title}</span>}

              {!tab.pinned && (
                <span
                  className="tab__close"
                  role="button"
                  tabIndex={-1}
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  <Icon name="close" size={11} />
                </span>
              )}
            </button>
          )
        })}

        <button
          className="tabstrip__new"
          onClick={() => newTab()}
          title={`New tab (${platform.modKey}T)`}
          aria-label="New tab"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      {showCustomControls && (
        <div className="window-controls">
          <button
            className="window-controls__button"
            onClick={() => void windowAction('minimize')}
            aria-label="Minimize"
          >
            <Icon name="win-minimize" size={14} />
          </button>
          <button
            className="window-controls__button"
            onClick={() => void windowAction('toggle-maximize')}
            aria-label="Maximize"
          >
            <Icon name="win-maximize" size={12} />
          </button>
          <button
            className="window-controls__button window-controls__button--close"
            onClick={() => void windowAction('close')}
            aria-label="Close window"
          >
            <Icon name="win-close" size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
