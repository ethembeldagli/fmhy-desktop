import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Icon, type IconName } from './Icon'
import { useOverlay } from '../../browser/overlay'
import './ContextMenu.css'

export interface MenuItem {
  label?: string
  icon?: IconName
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  onSelect?: () => void
}

type OpenMenu = (event: { clientX: number; clientY: number }, items: MenuItem[]) => void

const ContextMenuContext = createContext<OpenMenu>(() => {})

export const useContextMenu = () => useContext(ContextMenuContext)

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // A menu opened from the tab strip can extend down over a page.
  useOverlay(menu !== null)

  const open = useCallback<OpenMenu>((event, items) => {
    setMenu({ x: event.clientX, y: event.clientY, items })
  }, [])

  // Keep the menu inside the window rather than letting it clip at an edge.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const pad = 8
    let { x, y } = menu
    let originX = 'left'
    let originY = 'top'

    if (x + rect.width + pad > window.innerWidth) {
      x = Math.max(pad, x - rect.width)
      originX = 'right'
    }
    if (y + rect.height + pad > window.innerHeight) {
      y = Math.max(pad, y - rect.height)
      originY = 'bottom'
    }
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.setProperty('--menu-origin', `${originY} ${originX}`)
    el.focus()
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    // `capture` so a click anywhere dismisses before it activates something else.
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  return (
    <ContextMenuContext.Provider value={open}>
      {children}
      {menu && (
        <div className="menu" ref={ref} role="menu" tabIndex={-1}>
          {menu.items.map((item, i) =>
            item.separator ? (
              <div key={i} className="menu__separator" role="separator" />
            ) : (
              <button
                key={i}
                role="menuitem"
                className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setMenu(null)
                  item.onSelect?.()
                }}
              >
                {item.icon && (
                  <span className="menu__icon">
                    <Icon name={item.icon} size={14} />
                  </span>
                )}
                <span className="menu__label">{item.label}</span>
                {item.shortcut && <span className="menu__shortcut">{item.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </ContextMenuContext.Provider>
  )
}
