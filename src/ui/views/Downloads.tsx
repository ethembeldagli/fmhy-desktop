import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useContextMenu } from '../components/ContextMenu'
import { useBrowser } from '../../browser/store'
import { downloads, formatBytes, type Download } from '../../downloads/api'
import { hostOf } from '../../fmhy/api'
import { onEvent, openExternal } from '../../platform'
import { timeLabel, dayLabel } from '../../history/api'
import './views.css'
import './FmhyPage.css'

const STATUS_LABEL: Record<Download['status'], string> = {
  pending: 'Waiting',
  active: 'Downloading',
  done: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export function Downloads() {
  const navigate = useBrowser((s) => s.navigate)
  const openMenu = useContextMenu()
  const [items, setItems] = useState<Download[]>([])

  const refresh = useCallback(async () => {
    setItems(await downloads.list())
  }, [])

  useEffect(() => {
    void refresh()
    // The engine performs the transfer, so the list is driven by its events.
    const unlisten = onEvent('downloads://changed', () => void refresh())
    return () => {
      void unlisten.then((off) => off())
    }
  }, [refresh])

  const groups: { label: string; items: Download[] }[] = []
  for (const item of items) {
    const label = dayLabel(item.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }

  return (
    <div className="view scroll">
      <div className="view__inner">
        <h1 className="view__title">Downloads</h1>
        <p className="view__lede">
          Files saved from sites opened in the app. Clearing this list does not delete the files.
        </p>

        {items.length > 0 && (
          <div style={{ margin: 'var(--space-6) 0 var(--space-7)' }}>
            <button
              className="button button--danger"
              onClick={async () => {
                await downloads.clear()
                await refresh()
              }}
            >
              Clear list
            </button>
          </div>
        )}

        {items.length === 0 && (
          <section className="section">
            <div className="empty">
              <span className="empty__icon">
                <Icon name="download" size={17} />
              </span>
              <span className="empty__title">No downloads</span>
              <span className="empty__body">
                Files you download from pages opened in the app appear here, with where they
                were saved.
              </span>
            </div>
          </section>
        )}

        {groups.map((group) => (
          <section className="section" key={group.label}>
            <div className="section__head">
              <h2 className="section__title">{group.label}</h2>
              <span className="section__action">{group.items.length}</span>
            </div>
            {group.items.map((item) => (
              <div
                className="res"
                key={item.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openMenu(event, [
                    ...(item.path
                      ? [
                          {
                            label: 'Show in Finder',
                            icon: 'folder' as const,
                            onSelect: () => void downloads.reveal(item.path!),
                          },
                        ]
                      : []),
                    {
                      label: 'Open source page',
                      icon: 'arrow-right',
                      onSelect: () => navigate({ view: 'web', url: item.url }),
                    },
                    {
                      label: 'Open link externally',
                      icon: 'external',
                      onSelect: () => void openExternal(item.url),
                    },
                    { separator: true },
                    {
                      label: 'Copy link',
                      onSelect: () => void navigator.clipboard?.writeText(item.url),
                    },
                    {
                      label: 'Remove from list',
                      icon: 'close',
                      danger: true,
                      onSelect: async () => {
                        await downloads.remove(item.id)
                        await refresh()
                      },
                    },
                  ])
                }}
              >
                <span
                  className="res__star res__star--on"
                  style={{
                    color:
                      item.status === 'failed'
                        ? 'var(--danger)'
                        : item.status === 'done'
                          ? 'var(--success)'
                          : 'var(--text-tertiary)',
                  }}
                >
                  <Icon name={item.status === 'failed' ? 'alert' : 'download'} size={13} />
                </span>
                <button
                  className="res__main"
                  onClick={() => item.path && void downloads.reveal(item.path)}
                  title={item.path ?? item.url}
                >
                  <span className="res__line">
                    <span className="res__title">{item.filename}</span>
                    <span className="res__host">{hostOf(item.url)}</span>
                  </span>
                  <span className="res__desc">
                    {STATUS_LABEL[item.status]}
                    {item.bytes > 0 && ` · ${formatBytes(item.bytes)}`}
                    {item.path && ` · ${item.path}`}
                  </span>
                </button>
                <span className="res__host" style={{ alignSelf: 'center' }}>
                  {timeLabel(item.createdAt)}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
