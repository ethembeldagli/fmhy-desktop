import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { openExternal } from '../../platform'
import { useOverlay } from '../../browser/overlay'
import './ExternalSchemePrompt.css'

/**
 * Consent gate for non-web schemes.
 *
 * The engine blocks anything that is not http/https — `magnet:`, `mailto:` and
 * custom app handlers are common on the sites FMHY indexes. Handing one to the
 * OS launches another application, so it is always an explicit user choice
 * rather than something a page can trigger on its own.
 */
export function ExternalSchemePrompt({
  url,
  onDismiss,
}: {
  url: string | null
  onDismiss: () => void
}) {
  // The dialog sits over the content area, which a child webview would
  // otherwise paint on top of.
  useOverlay(!!url)

  useEffect(() => {
    if (!url) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, onDismiss])

  if (!url) return null

  const scheme = url.split(':')[0] ?? 'unknown'

  return (
    <div className="scheme-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="scheme" role="dialog" aria-modal="true" aria-labelledby="scheme-title">
        <div className="scheme__icon">
          <Icon name="external" size={17} />
        </div>
        <h2 className="scheme__title" id="scheme-title">
          Open this link outside FMHY Desktop?
        </h2>
        <p className="scheme__body">
          This link uses the <strong>{scheme}:</strong> scheme, which this app does not display.
          Continuing hands it to your system, which may open another application.
        </p>
        <div className="scheme__url selectable">{url}</div>
        <div className="scheme__actions">
          <button className="button" onClick={onDismiss}>
            Cancel
          </button>
          <button
            className="button button--primary"
            onClick={() => {
              void openExternal(url)
              onDismiss()
            }}
          >
            Open externally
          </button>
        </div>
      </div>
    </div>
  )
}
