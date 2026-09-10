/**
 * Third-party link tools offered as explicit actions.
 *
 * These are deliberately never automatic. Sending a URL to an unlocker means
 * handing that URL to someone else's server, which is exactly what the privacy
 * settings exist to avoid — so it happens only when the user picks it for a
 * specific link, each time.
 */

export interface LinkTool {
  id: string
  label: string
  /** Where the tool lives, for the About/Settings listing. */
  home: string
  /** Build the URL that opens `target` in the tool. */
  open: (target: string) => string
}

export const LINK_TOOLS: LinkTool[] = [
  {
    id: 'bypasskit',
    label: 'BypassKit',
    home: 'https://bypasskit.co/',
    // The service takes the locked URL as a query parameter.
    open: (target) => `https://bypasskit.co/?url=${encodeURIComponent(target)}`,
  },
]

/** Companion extension, listed for reference — it cannot be installed here. */
export const BYPASSKIT_EXTENSION =
  'https://chromewebstore.google.com/detail/bypasskit-link-unlocker/aiddkahemeniiedmpfblodnmcjoelbjl'
