import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { useContextMenu } from '../components/ContextMenu'
import { useBrowser } from '../../browser/store'
import { useFavorites } from '../../favorites/store'
import { hostOf } from '../../fmhy/api'
import { pageBySlug } from '../../fmhy/catalog'
import { openExternal } from '../../platform'
import './views.css'
import './FmhyPage.css'

export function Favorites() {
  const navigate = useBrowser((s) => s.navigate)
  const newTab = useBrowser((s) => s.newTab)
  const openMenu = useContextMenu()
  const { items, load, remove } = useFavorites()

  useEffect(() => {
    void load()
  }, [load])

  const categories = items.filter((item) => item.kind === 'category')
  const links = items.filter((item) => item.kind !== 'category')

  const open = (url: string) => navigate({ view: 'web', url })

  return (
    <div className="view scroll">
      <div className="view__inner">
        <h1 className="view__title">Favorites</h1>
        <p className="view__lede">
          Saved resources, categories and sites. Stored locally and kept when the FMHY index is
          updated.
        </p>

        {items.length === 0 && (
          <section className="section">
            <div className="empty">
              <span className="empty__icon">
                <Icon name="star" size={17} />
              </span>
              <span className="empty__title">Nothing saved yet</span>
              <span className="empty__body">
                Use the star beside any resource, or the one in the toolbar to save the page
                you are on.
              </span>
            </div>
          </section>
        )}

        {categories.length > 0 && (
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Categories</h2>
              <span className="section__action">{categories.length}</span>
            </div>
            <div className="card-grid">
              {categories.map((item) => (
                <button
                  key={item.id}
                  className="card"
                  onClick={() =>
                    item.fmhyPath && navigate({ view: 'categories', page: item.fmhyPath })
                  }
                  onContextMenu={(event) => {
                    event.preventDefault()
                    openMenu(event, [
                      {
                        label: 'Remove from favorites',
                        icon: 'close',
                        danger: true,
                        onSelect: () => void remove(item.id),
                      },
                    ])
                  }}
                >
                  <span className="card__icon">
                    <Icon
                      name={(item.fmhyPath && pageBySlug(item.fmhyPath)?.icon) || 'folder'}
                      size={15}
                    />
                  </span>
                  <span className="card__body">
                    <span className="card__title">{item.title}</span>
                    <span className="card__blurb">FMHY category</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {links.length > 0 && (
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Resources</h2>
              <span className="section__action">{links.length}</span>
            </div>
            {links.map((item) => (
              <div
                className="res"
                key={item.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openMenu(event, [
                    { label: 'Open', icon: 'arrow-right', onSelect: () => item.url && open(item.url) },
                    {
                      label: 'Open in new tab',
                      icon: 'plus',
                      onSelect: () =>
                        item.url && newTab({ view: 'web', url: item.url }, { background: true }),
                    },
                    {
                      label: 'Open in external browser',
                      icon: 'external',
                      onSelect: () => item.url && void openExternal(item.url),
                    },
                    { separator: true },
                    {
                      label: 'Copy link',
                      onSelect: () => item.url && void navigator.clipboard?.writeText(item.url),
                    },
                    {
                      label: 'Remove from favorites',
                      icon: 'close',
                      danger: true,
                      onSelect: () => void remove(item.id),
                    },
                  ])
                }}
              >
                <span className="res__star res__star--on">
                  <Icon name="star-filled" size={13} />
                </span>
                <button
                  className="res__main"
                  onClick={() => item.url && open(item.url)}
                  title={item.url ?? undefined}
                >
                  <span className="res__line">
                    <span className="res__title">{item.title}</span>
                    <span className="res__host">{item.url ? hostOf(item.url) : ''}</span>
                  </span>
                </button>
                <button
                  className="icon-button"
                  onClick={() => void remove(item.id)}
                  aria-label="Remove from favorites"
                  title="Remove"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
