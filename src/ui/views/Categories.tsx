import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useBrowser } from '../../browser/store'
import { useDataset } from '../../fmhy/store'
import { fmhy, type PageSummary } from '../../fmhy/api'
import { CATALOG_GROUPS, pageBySlug, type CatalogGroup } from '../../fmhy/catalog'
import { SyncBanner } from './FmhyPage'
import './views.css'

export function Categories() {
  const navigate = useBrowser((s) => s.navigate)
  const status = useDataset((s) => s.status)
  const syncing = useDataset((s) => s.syncing)
  const [pages, setPages] = useState<PageSummary[]>([])

  useEffect(() => {
    void fmhy.pages().then(setPages)
  }, [status?.lastSynced])

  const grouped = CATALOG_GROUPS.map((group) => ({
    group,
    pages: pages.filter((p) => p.group === group),
  })).filter((g) => g.pages.length > 0)

  const totalLinks = pages.reduce((sum, p) => sum + p.linkCount, 0)

  return (
    <div className="view scroll">
      <div className="view__inner">
        <SyncBanner />

        <h1 className="view__title">Categories</h1>
        <p className="view__lede">
          {pages.length > 0
            ? `${totalLinks.toLocaleString()} resources across ${pages.length} pages of the FMHY wiki.`
            : 'Every page of the FMHY wiki, grouped the way FMHY groups them.'}
        </p>

        {pages.length === 0 && !syncing && (
          <section className="section">
            <div className="empty">
              <span className="empty__icon">
                <Icon name="folder" size={17} />
              </span>
              <span className="empty__title">No index yet</span>
              <span className="empty__body">
                The FMHY index has not been downloaded. It builds automatically on first launch, or
                you can start it from Settings.
              </span>
            </div>
          </section>
        )}

        {grouped.map(({ group, pages: groupPages }) => (
          <section className="section" key={group}>
            <div className="section__head">
              <h2 className="section__title">{group}</h2>
              <span className="section__action">
                {groupPages.reduce((sum, p) => sum + p.linkCount, 0).toLocaleString()} resources
              </span>
            </div>
            <div className="card-grid">
              {groupPages.map((page) => (
                <CategoryCard key={page.slug} page={page} group={group} onOpen={() => navigate({ view: 'categories', page: page.slug })} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function CategoryCard({
  page,
  onOpen,
}: {
  page: PageSummary
  group: CatalogGroup
  onOpen: () => void
}) {
  // Icons are presentation only, so they stay in the frontend catalogue keyed
  // by slug rather than being persisted with the dataset.
  const icon = pageBySlug(page.slug)?.icon ?? 'folder'
  return (
    <button className="card" onClick={onOpen}>
      <span className="card__icon">
        <Icon name={icon} size={15} />
      </span>
      <span className="card__body">
        <span className="card__title">{page.title}</span>
        <span className="card__blurb">
          {page.linkCount.toLocaleString()} resources
          {page.starredCount > 0 && ` · ${page.starredCount} starred`}
        </span>
      </span>
    </button>
  )
}
