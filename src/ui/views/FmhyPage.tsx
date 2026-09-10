import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Emoji } from '../components/Emoji'
import { RichText } from '../components/RichText'
import { ServiceIcon, serviceFor } from '../components/ServiceIcon'
import { useContextMenu } from '../components/ContextMenu'
import { useBrowser } from '../../browser/store'
import { useDataset } from '../../fmhy/store'
import { fmhy, type LinkRow, type PageDetail, type SectionRow } from '../../fmhy/api'
import { openExternal } from '../../platform'
import { useFavorites } from '../../favorites/store'
import { resourceFavorite } from '../../favorites/api'
import { LINK_TOOLS } from '../../fmhy/tools'
import './views.css'
import './FmhyPage.css'

export function SyncBanner() {
  const { syncing, progress, error, sync, status } = useDataset()

  if (error) {
    return (
      <div className="sync">
        <Icon name="alert" size={15} />
        <div className="sync__body">
          <div className="sync__title">Could not update the FMHY index</div>
          <div className="sync__sub">{error}</div>
        </div>
        <button className="button" onClick={() => void sync()}>
          Retry
        </button>
      </div>
    )
  }

  if (syncing) {
    const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 8
    return (
      <div className="sync">
        <span className="sync__spinner" />
        <div className="sync__body">
          <div className="sync__title">
            {status ? 'Updating the FMHY index' : 'Building your FMHY index'}
          </div>
          <div className="sync__sub">
            {progress?.label ?? 'Contacting FMHY'}
            {progress && progress.total > 0 ? ` · ${progress.done}/${progress.total} pages` : ''}
          </div>
          <div className="sync__bar">
            <div className="sync__bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    )
  }

  return null
}

/**
 * One wiki entry, rendered in the shape FMHY's source gives it:
 *
 *   ⭐ **Name**, mirror - Tag / Tag / RelatedLink
 *
 * The markers are content from the dataset rather than invented UI icons, so
 * they are shown as FMHY shows them.
 */
function Entry({ link }: { link: LinkRow }) {
  const navigate = useBrowser((s) => s.navigate)
  const newTab = useBrowser((s) => s.newTab)
  const openMenu = useContextMenu()
  const toggleFavorite = useFavorites((s) => s.toggle)
  const saved = useFavorites((s) => s.isSaved(link.url))

  const open = (url: string) => navigate({ view: 'web', url })

  if (link.kind === 'note') {
    return (
      <li className="doc__callout">
        <span className="doc__callout-title">
          <Icon name="bulb" size={14} />
          TIP
        </span>
        <RichText text={link.description || link.title} onOpen={open} />
      </li>
    )
  }

  const menu = (event: React.MouseEvent) => {
    event.preventDefault()
    openMenu(event, [
      { label: 'Open', icon: 'arrow-right', onSelect: () => open(link.url) },
      {
        label: 'Open in new tab',
        icon: 'plus',
        onSelect: () => newTab({ view: 'web', url: link.url }, { background: true }),
      },
      {
        label: 'Open in external browser',
        icon: 'external',
        onSelect: () => void openExternal(link.url),
      },
      { separator: true },
      {
        label: saved ? 'Remove from favorites' : 'Add to favorites',
        icon: saved ? 'star-filled' : 'star',
        onSelect: () => void toggleFavorite(resourceFavorite(link.title, link.url)),
      },
      {
        label: 'Copy link',
        onSelect: () => void navigator.clipboard?.writeText(link.url),
      },
      { separator: true },
      // Sends this URL to a third-party service, so it is per-link and manual.
      ...LINK_TOOLS.map((tool) => ({
        label: `Unlock with ${tool.label}`,
        icon: 'external' as const,
        onSelect: () => navigate({ view: 'web', url: tool.open(link.url) }),
      })),
    ])
  }

  const classes = [
    'doc__item',
    link.starred ? 'doc__item--starred' : '',
    link.kind === 'reference' ? 'doc__item--reference' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={classes} onContextMenu={menu}>
      {link.starred && <Emoji name="star" size={15} className="doc__mark" />}
      {saved && (
        <span className="doc__saved" title="In your favorites">
          <Icon name="star-filled" size={12} />
        </span>
      )}
      {link.isIndex && <Emoji name="globe-with-meridians" size={15} className="doc__mark" />}
      {link.kind === 'reference' && (
        <Emoji name="repeat-button" size={15} className="doc__mark" />
      )}

      <a className="doc__link" title={link.url} onClick={() => open(link.url)}>
        {link.title}
      </a>

      {link.mirrors.map((mirror, i) => (
        <span key={`m${i}`}>
          <span className="doc__sep">, </span>
          <a className="doc__link" title={mirror.url} onClick={() => open(mirror.url)}>
            {mirror.label || String(i + 2)}
          </a>
        </span>
      ))}

      {(link.tags.length > 0 || link.related.length > 0) && (
        <span className="doc__desc">
          <span className="doc__sep"> - </span>
          {link.tags.map((tag, i) => (
            <span key={`t${i}`}>
              {i > 0 && <span className="doc__sep"> / </span>}
              {tag}
            </span>
          ))}
          {link.related.map((related, i) => {
            const icon = serviceFor(related.url)
            const title = `${related.label} — ${related.url}`
            return (
              <span key={`r${i}`}>
                <span className="doc__sep">
                  {i > 0 || link.tags.length > 0 ? ' / ' : ''}
                </span>
                {icon ? (
                  <a
                    className="doc__service"
                    title={title}
                    aria-label={related.label}
                    onClick={() => open(related.url)}
                  >
                    <ServiceIcon name={icon} size={15} />
                  </a>
                ) : (
                  <a className="doc__link" title={title} onClick={() => open(related.url)}>
                    {related.label}
                  </a>
                )}
              </span>
            )
          })}
        </span>
      )}
    </li>
  )
}

const SECTION_HEADER_PX = 48
const ROW_PX = 30

function Section({ section, id }: { section: SectionRow; id: string }) {
  const depth = Math.min(section.depth, 2) as 0 | 1 | 2
  const Heading = (['h1', 'h2', 'h3'] as const)[depth]
  const estimated = SECTION_HEADER_PX + section.links.length * ROW_PX

  return (
    <section
      className="fsection"
      id={id}
      style={{ containIntrinsicSize: `auto ${estimated}px` }}
    >
      <Heading className={`doc__h${depth + 1}`}>
        {section.title}
        <span className="doc__count">{section.links.length}</span>
      </Heading>
      <ul className="doc__list">
        {section.links.map((link) => (
          <Entry key={link.id} link={link} />
        ))}
      </ul>
    </section>
  )
}

export function FmhyPage({ slug }: { slug: string }) {
  const navigate = useBrowser((s) => s.navigate)
  const { status, syncing } = useDataset()
  const filterStarred = useBrowser((s) => s.filterStarred)
  const filterIndexes = useBrowser((s) => s.filterIndexes)
  const [detail, setDetail] = useState<PageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [activeSection, setActiveSection] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fmhy
      .page(slug)
      .then((page) => {
        if (!cancelled) {
          setDetail(page)
          setLoading(false)
        }
      })
      .catch(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // Re-fetch once a sync completes so the page fills in behind the banner.
  }, [slug, status?.lastSynced])

  // Filtering happens in the client because the page's rows are already here;
  // going back to SQLite for a keystroke would be slower, not faster.
  const sections = useMemo(() => {
    if (!detail) return []
    const needle = filter.trim().toLowerCase()
    if (!needle && !filterStarred && !filterIndexes) return detail.sections

    return detail.sections
      .map((section) => ({
        ...section,
        links: section.links.filter((link) => {
          if (filterStarred && !link.starred) return false
          if (filterIndexes && !link.isIndex) return false
          if (!needle) return true
          return (
            link.title.toLowerCase().includes(needle) ||
            link.description.toLowerCase().includes(needle)
          )
        }),
      }))
      .filter((section) => section.links.length > 0)
  }, [detail, filter, filterStarred, filterIndexes])

  const totals = useMemo(() => {
    if (!detail) return { resources: 0, starred: 0 }
    let resources = 0
    let starred = 0
    for (const section of detail.sections) {
      for (const link of section.links) {
        if (link.kind === 'resource') resources++
        if (link.starred) starred++
      }
    }
    return { resources, starred }
  }, [detail])

  // Scroll-spy: highlight whichever section heading is nearest the top.
  useEffect(() => {
    const root = bodyRef.current
    if (!root || sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiveSection(Number(visible.target.id.replace('sec-', '')))
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )
    root.querySelectorAll('.fsection').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sections])

  const jumpTo = (id: number) => {
    bodyRef.current?.querySelector(`#sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading && !detail) {
    return (
      <div className="view">
        <div className="view__inner">
          <SyncBanner />
          {!syncing && <div className="empty__body">Loading…</div>}
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="view scroll">
        <div className="view__inner">
          <SyncBanner />
          <div className="empty">
            <span className="empty__icon">
              <Icon name="folder" size={17} />
            </span>
            <span className="empty__title">This page isn’t in your index yet</span>
            <span className="empty__body">
              {syncing
                ? 'The index is still building — this page will appear when it finishes.'
                : 'Update the FMHY index from Settings to load this category.'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page__body scroll" ref={bodyRef}>
        <div className="page__inner">
          <SyncBanner />

          <div className="crumbs">
            <button onClick={() => navigate({ view: 'home' })}>FMHY</button>
            <Icon name="chevron-right" size={10} />
            <button onClick={() => navigate({ view: 'categories' })}>Categories</button>
            <Icon name="chevron-right" size={10} />
            <span>{detail.group}</span>
          </div>

          <h1 className="page__title">{detail.title}</h1>
          <div className="page__stats">
            <span>{totals.resources.toLocaleString()} resources</span>
            <span className="page__stat-star">
              <Icon name="star-filled" size={11} />
              {totals.starred} starred
            </span>
            <span>{detail.sections.length} sections</span>
          </div>

          <div className="page__filter">
            <Icon name="search" size={13} />
            <input
              value={filter}
              spellCheck={false}
              placeholder={`Filter within ${detail.title}`}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button className="icon-button" onClick={() => setFilter('')} aria-label="Clear filter">
                <Icon name="close" size={12} />
              </button>
            )}
          </div>

          {sections.length === 0 ? (
            <div className="empty">
              <span className="empty__icon">
                <Icon name="search" size={17} />
              </span>
              <span className="empty__title">No matches in this category</span>
              <span className="empty__body">
                Nothing here matches “{filter}”. Try the global search to look across all of FMHY.
              </span>
            </div>
          ) : (
            <div className="doc">
              {sections.map((section) => (
                <Section key={section.id} section={section} id={`sec-${section.id}`} />
              ))}
            </div>
          )}
        </div>
      </div>
      <nav className="page__toc scroll" aria-label="On this page">
        <div className="page__toc-label">On this page</div>
        {detail.sections.map((section) => (
          <button
            key={section.id}
            className={[
              'toc-item',
              `toc-item--depth${section.depth}`,
              activeSection === section.id ? 'toc-item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => jumpTo(section.id)}
          >
            {section.title}
            <span className="toc-item__count">{section.links.length}</span>
          </button>
        ))}
      </nav>

    </div>
  )
}
