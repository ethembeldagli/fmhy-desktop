import { Icon } from '../components/Icon'
import { useBrowser } from '../../browser/store'
import { progressLabel, useUpdates } from '../../updates/store'

/**
 * Says an update exists, and gets out of the way otherwise.
 *
 * Deliberately quiet: it appears only once a check has actually found
 * something, and it only ever offers the next single step. Everything else —
 * release notes, failures, re-checking — lives in Settings, which this links
 * to rather than duplicating.
 */
export function UpdateBanner() {
  const { status, version, received, total } = useUpdates()
  const download = useUpdates((s) => s.download)
  const restart = useUpdates((s) => s.restart)
  const navigate = useBrowser((s) => s.navigate)

  if (status !== 'available' && status !== 'downloading' && status !== 'ready') return null

  if (status === 'downloading') {
    return (
      <div className="sync">
        <span className="sync__spinner" />
        <div className="sync__body">
          <div className="sync__title">Downloading version {version}</div>
          <div className="sync__sub">{progressLabel(received, total) ?? 'Fetching the update'}</div>
        </div>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="sync">
        <Icon name="check" size={15} />
        <div className="sync__body">
          <div className="sync__title">Version {version} is ready</div>
          <div className="sync__sub">It will be applied the next time the app starts.</div>
        </div>
        <button className="button" onClick={() => void restart()}>
          Restart now
        </button>
      </div>
    )
  }

  return (
    <div className="sync">
      <Icon name="download" size={15} />
      <div className="sync__body">
        <div className="sync__title">FMHY Desktop {version} is available</div>
        <div className="sync__sub">
          <button className="link-button" onClick={() => navigate({ view: 'settings' })}>
            See what changed
          </button>
        </div>
      </div>
      <button className="button" onClick={() => void download()}>
        Download
      </button>
    </div>
  )
}
