import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { contentView } from '../../platform'
import './FindBar.css'

/**
 * Find-in-page.
 *
 * Deliberately laid out *above* the content area rather than floating over it.
 * A child webview paints above the chrome webview, so a floating bar would
 * either be invisible or force the page to be hidden — which is useless when
 * the point is to look at the page. Occupying its own row shrinks the viewport
 * instead, and the resize observer repositions the webview to match.
 */
export function FindBar({
  tabId,
  open,
  onClose,
}: {
  tabId: string
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQuery('')
  }, [open])

  if (!open) return null

  const find = (forward: boolean) => {
    if (query.trim()) void contentView.find(tabId, query, forward)
  }

  return (
    <div className="findbar">
      <Icon name="search" size={13} />
      <input
        ref={inputRef}
        className="findbar__input"
        value={query}
        spellCheck={false}
        placeholder="Find in page"
        onChange={(e) => {
          setQuery(e.target.value)
          if (e.target.value.trim()) void contentView.find(tabId, e.target.value, true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            find(!e.shiftKey)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <button className="icon-button" onClick={() => find(false)} aria-label="Previous match">
        <Icon name="chevron-down" size={13} className="findbar__flip" />
      </button>
      <button className="icon-button" onClick={() => find(true)} aria-label="Next match">
        <Icon name="chevron-down" size={13} />
      </button>
      <button className="icon-button" onClick={onClose} aria-label="Close find bar">
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}
