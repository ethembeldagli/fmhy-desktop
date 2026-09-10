/**
 * Overlay arbitration for content webviews.
 *
 * Child webviews always paint above the chrome webview, so any UI that covers
 * the content area — command palette, context menus, dialogs — must hide the
 * content view while it is open.
 *
 * Several of those can overlap (a context menu opened from the palette, a
 * dialog raised while a menu is up), and a plain boolean would let the first
 * one to close reveal the page underneath the others. Reference counting means
 * the content view reappears only when the last overlay has gone.
 */
import { useEffect } from 'react'
import { contentView } from '../platform'

let depth = 0

function acquire() {
  depth += 1
  if (depth === 1) void contentView.setOverlay(true)
}

function release() {
  depth = Math.max(0, depth - 1)
  if (depth === 0) void contentView.setOverlay(false)
}

/** Hides content webviews for as long as `active` is true. */
export function useOverlay(active: boolean) {
  useEffect(() => {
    if (!active) return
    acquire()
    return release
  }, [active])
}
