import { Icon, type IconName } from '../components/Icon'
import './views.css'

interface PlaceholderProps {
  title: string
  lede: string
  icon: IconName
  emptyTitle: string
  emptyBody: string
  /** Describes what still has to be built, so the state is never misleading. */
  pending?: string
}

export function Placeholder({
  title,
  lede,
  icon,
  emptyTitle,
  emptyBody,
  pending,
}: PlaceholderProps) {
  return (
    <div className="view scroll">
      <div className="view__inner">
        <h1 className="view__title">{title}</h1>
        <p className="view__lede">{lede}</p>
        <section className="section">
          <div className="empty">
            <span className="empty__icon">
              <Icon name={icon} size={17} />
            </span>
            <span className="empty__title">{emptyTitle}</span>
            <span className="empty__body">{emptyBody}</span>
          </div>
        </section>
        {pending && (
          <div className="pending">
            <Icon name="reload" size={14} />
            {pending}
          </div>
        )}
      </div>
    </div>
  )
}

export function Discover() {
  return (
    <Placeholder
      title="Discover"
      icon="compass"
      lede="Newly added and recently updated resources from across the FMHY index."
      emptyTitle="Nothing to show until the index is synced"
      emptyBody="Discover surfaces additions and changes from the upstream FMHY dataset."
      pending="Depends on the FMHY sync layer."
    />
  )
}

export function Favorites() {
  return (
    <Placeholder
      title="Favorites"
      icon="star"
      lede="Resources, categories and sites you have saved. Stored locally, never uploaded."
      emptyTitle="No favorites yet"
      emptyBody="Star anything to keep it here. Favorites live in a local database on this machine."
    />
  )
}

export function Downloads() {
  return (
    <Placeholder
      title="Downloads"
      icon="download"
      lede="Files saved from sites opened in the app."
      emptyTitle="No downloads"
      emptyBody="Downloads started from a page will be listed here with their progress and location."
    />
  )
}
