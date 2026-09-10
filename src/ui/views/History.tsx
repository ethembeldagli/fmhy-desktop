import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useContextMenu } from '../components/ContextMenu'
import { useBrowser } from '../../browser/store'
import { history, dayLabel, timeLabel, type HistoryEntry } from '../../history/api'
import { hostOf } from '../../fmhy/api'
import { openExternal, type PlatformInfo } from '../../platform'
import './views.css'
import './FmhyPage.css'

export function History({ platform }: { platform: PlatformInfo }) {
  const navigate = useBrowser((s) => s.navigate)
  const newTab = useBrowser((s) => s.newTab)
  const openMenu = useContextMenu()

  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState(true)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (term: string) => {
    const rows = term.trim() ? await history.search(term) : await history.list()
    setEntries(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void history.recordingEnabled().then(setRecording)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void refresh(query), query ? 120 : 0)
    return () => clearTimeout(timer)
  }, [query, refresh])

  // Group by day so a long list stays scannable.
  const groups: { label: string; items: HistoryEntry[] }[] = []
  for (const entry of entries) {
    const label = dayLabel(entry.visitedAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(entry)
    else groups.push({ label, items: [entry] })
  }

  const remove = async (id: number) => {
    await history.remove(id)
    setEntries((rows) => rows.filter((r) => r.id !== id))
  }

  return (
    <div className="view scroll">
      <div className="view__inner">
        <h1 className="view__title">History</h1>
        <p className="view__lede">
          Pages opened in this app, stored only on this machine. Nothing is ever uploaded.
        </p>

        <div className="page__filter" style={{ marginTop: 'var(--space-6)', height: 34 }}>
          <Icon name="search" size={13} />
          <input
            value={query}
            spellCheck={false}
            placeholder="Search history"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-button" onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-5)',
            marginBottom: 'var(--space-7)',
          }}
        >
          <button
            className="button"
            onClick={async () => {
              const next = !recording
              await history.setRecording(next)
              setRecording(next)
            }}
          >
            {recording ? 'Pause recording' : 'Resume recording'}
          </button>
          <button
            className="button button--danger"
            disabled={entries.length === 0}
            onClick={async () => {
              await history.clear()
              setEntries([])
            }}
          >
            Clear all history
          </button>
          {!recording && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
              New visits are not being recorded.
            </span>
          )}
        </div>

        {!loading && entries.length === 0 && (
          <div className="empty">
            <span className="empty__icon">
              <Icon name="clock" size={17} />
            </span>
            <span className="empty__title">
              {query ? `No history matching “${query}”` : 'No history yet'}
            </span>
            <span className="empty__body">
              {query
                ? 'Try a different search term.'
                : `Pages you open will be listed here. Press ${platform.modKey}Y to return to this view.`}
            </span>
          </div>
        )}

        {groups.map((group) => (
          <section className="section" key={group.label}>
            <div className="section__head">
              <h2 className="section__title">{group.label}</h2>
              <span className="section__action">{group.items.length}</span>
            </div>
            {group.items.map((entry) => (
              <div
                className="res"
                key={entry.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openMenu(event, [
                    {
                      label: 'Open',
                      icon: 'arrow-right',
                      onSelect: () => navigate({ view: 'web', url: entry.url }),
                    },
                    {
                      label: 'Open in new tab',
                      icon: 'plus',
                      onSelect: () => newTab({ view: 'web', url: entry.url }, { background: true }),
                    },
                    {
                      label: 'Open in external browser',
                      icon: 'external',
                      onSelect: () => void openExternal(entry.url),
                    },
                    { separator: true },
                    {
                      label: 'Copy link',
                      onSelect: () => void navigator.clipboard?.writeText(entry.url),
                    },
                    {
                      label: 'Remove from history',
                      icon: 'close',
                      danger: true,
                      onSelect: () => void remove(entry.id),
                    },
                  ])
                }}
              >
                <span className="res__star res__star--on" style={{ color: 'var(--text-disabled)' }}>
                  <Icon name="clock" size={13} />
                </span>
                <button
                  className="res__main"
                  onClick={() => navigate({ view: 'web', url: entry.url })}
                  title={entry.url}
                >
                  <span className="res__line">
                    <span className="res__title">{entry.title || hostOf(entry.url)}</span>
                    <span className="res__host">{hostOf(entry.url)}</span>
                  </span>
                  <span className="res__desc">{entry.url}</span>
                </button>
                <button
                  className="icon-button"
                  onClick={() => void remove(entry.id)}
                  aria-label="Remove from history"
                  title="Remove"
                >
                  <Icon name="close" size={12} />
                </button>
                <span className="res__host" style={{ alignSelf: 'center' }}>
                  {timeLabel(entry.visitedAt)}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
