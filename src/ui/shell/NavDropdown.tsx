import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Emoji } from '../components/Emoji'
import { useOverlay } from '../../browser/overlay'
import { isOffSite, type TopNavLink } from '../../fmhy/nav'
import './NavDropdown.css'

/**
 * Hover-opened menu, matching FMHY's own "Ecosystem" dropdown.
 *
 * Opens on hover like the site's, but closes on a short delay so moving the
 * pointer diagonally from the trigger to the menu does not dismiss it. Links
 * that leave fmhy.net carry the same arrow marker the site uses.
 */
export function NavDropdown({
  label,
  emoji,
  items,
  onSelect,
}: {
  label: string
  emoji: Parameters<typeof Emoji>[0]['name']
  items: TopNavLink[]
  onSelect: (url: string) => void
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)

  // The menu overlaps the content area, which a child webview paints above.
  useOverlay(open)

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const cancelClose = () => window.clearTimeout(closeTimer.current)
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 160)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div
      className="navdrop"
      ref={root}
      onPointerEnter={() => {
        cancelClose()
        setOpen(true)
      }}
      onPointerLeave={scheduleClose}
    >
      <button
        className={`navbar__link${open ? ' navbar__link--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Emoji name={emoji} size={13} />
        {label}
        <Icon name="chevron-down" size={11} />
      </button>

      {open && (
        <div className="navdrop__menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className="navdrop__item"
              onClick={() => {
                setOpen(false)
                onSelect(item.url)
              }}
            >
              <Emoji name={item.emoji} size={15} />
              <span className="navdrop__label">{item.label}</span>
              {isOffSite(item.url) && (
                <span className="navdrop__external" aria-label="opens an external site">
                  ↗
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
