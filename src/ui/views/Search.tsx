import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { useContextMenu } from '../components/ContextMenu'
import { useBrowser } from '../../browser/store'
import { useDataset } from '../../fmhy/store'
import { fmhy, hostOf, type SearchHit } from '../../fmhy/api'
import { openExternal } from '../../platform'
import { SyncBanner } from './FmhyPage'
import './views.css'
import './FmhyPage.css'

export function SearchView({ query }: { query?: string }) {
  const navigate = useBrowser((s) => s.navigate)
  const newTab = useBrowser((s) => s.newTab)
  const openMenu = useContextMenu()
  const status = useDataset((s) => s.status)

  const [input, setInput] = useState(query ?? '')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  useEffect(() => setInput(query ?? ''), [query])

  // Debounced so typing does not queue a query per keystroke; the id guard
  // discards out-of-order responses.
  useEffect(() => {
    const term = input.trim()
    if (!term) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const id = ++requestId.current
    const timer = setTimeout(() => {
      void fmhy
        .search(term, 60)
        .then((results) => {
          if (id === requestId.current) {
            setHits(results)
            setSelected(0)
            setSearching(false)
          }
        })
        .catch(() => id === requestId.current && setSearching(false))
    }, 90)
    return () => clearTimeout(timer)
  }, [input, status?.lastSynced])

  useEffect(() => {
    listRef.current?.querySelector('.res--selected')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>()
    for (const hit of hits) {
      const key = hit.pageTitle
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(hit)
    }
    return [...map.entries()]
  }, [hits])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((s) => Math.min(s + 1, hits.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (event.key === 'Enter') {
      const hit = hits[selected]
      if (hit) navigate({ view: 'web', url: hit.url })
    }
  }

  let index = -1

  return (
    <div className="view scroll">
      <div className="view__inner">
        <SyncBanner />

        <h1 className="view__title">Search</h1>
        <p className="view__lede">
          {status
            ? `Full-text search across ${status.links.toLocaleString()} FMHY resources, running locally.`
            : 'Full-text search across the FMHY index.'}
        </p>

        <div className="page__filter" style={{ marginTop: 'var(--space-7)', height: 38 }}>
          <Icon name="search" size={15} />
          <input
            autoFocus
            value={input}
            spellCheck={false}
            placeholder="Search resource names, descriptions and categories"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {searching && <span className="sync__spinner" />}
          {input && !searching && (
            <button className="icon-button" onClick={() => setInput('')} aria-label="Clear">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        {!input.trim() && (
          <div className="empty">
            <span className="empty__icon">
              <Icon name="search" size={17} />
            </span>
            <span className="empty__title">Search the whole index</span>
            <span className="empty__body">
              Results match resource names, their descriptions and the section they live in.
              Everything runs against a local database, so it stays fast and works offline.
            </span>
          </div>
        )}

        {input.trim() && !searching && hits.length === 0 && (
          <div className="empty">
            <span className="empty__icon">
              <Icon name="search" size={17} />
            </span>
            <span className="empty__title">No results for “{input.trim()}”</span>
            <span className="empty__body">
              Try fewer or more general words. Search matches whole words and prefixes.
            </span>
          </div>
        )}

        <div ref={listRef}>
          {grouped.map(([pageTitle, pageHits]) => (
            <section className="section" key={pageTitle}>
              <div className="section__head">
                <h2 className="section__title">{pageTitle}</h2>
                <span className="section__action">{pageHits.length}</span>
              </div>
              {pageHits.map((hit) => {
                index++
                const isSelected = index === selected
                return (
                  <div
                    key={hit.id}
                    className={`res${isSelected ? ' res--selected' : ''}`}
                    style={isSelected ? { background: 'var(--fill-selected)' } : undefined}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openMenu(e, [
                        {
                          label: 'Open',
                          icon: 'arrow-right',
                          onSelect: () => navigate({ view: 'web', url: hit.url }),
                        },
                        {
                          label: 'Open in new tab',
                          icon: 'plus',
                          onSelect: () =>
                            newTab({ view: 'web', url: hit.url }, { background: true }),
                        },
                        {
                          label: 'Open in external browser',
                          icon: 'external',
                          onSelect: () => void openExternal(hit.url),
                        },
                        { separator: true },
                        {
                          label: 'Go to category',
                          icon: 'categories',
                          onSelect: () =>
                            navigate({ view: 'categories', page: hit.pageSlug }),
                        },
                      ])
                    }}
                  >
                    <span
                      className={`res__star${hit.starred ? ' res__star--on' : ''}`}
                      title={hit.starred ? 'Starred by FMHY' : undefined}
                    >
                      <Icon name={hit.starred ? 'star-filled' : 'star'} size={13} />
                    </span>
                    <button
                      className="res__main"
                      onClick={() => navigate({ view: 'web', url: hit.url })}
                      title={hit.url}
                    >
                      <span className="res__line">
                        <span className="res__title">{hit.title}</span>
                        {hit.isIndex && (
                          <span className="res__badge res__badge--index">
                            <Icon name="globe" size={9} /> INDEX
                          </span>
                        )}
                        <span className="res__host">{hostOf(hit.url)}</span>
                      </span>
                      {hit.description && <span className="res__desc">{hit.description}</span>}
                      <span className="res__tags">
                        <span className="chip">{hit.breadcrumb}</span>
                      </span>
                    </button>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
