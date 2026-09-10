/**
 * Icons for the home feature cards.
 *
 * FMHY's homepage cards each carry a distinct line icon in its own colour.
 * These are drawn on a 24px grid to match that scale, separate from the 16px
 * chrome set, and the colour is supplied per card.
 */

export type FeatureIconName =
  | 'shield'
  | 'bot'
  | 'tv'
  | 'music'
  | 'gamepad'
  | 'book'
  | 'drive-download'
  | 'magnet'
  | 'graduation'
  | 'smartphone'
  | 'terminal'
  | 'languages'
  | 'boxes'

const paths: Record<FeatureIconName, React.ReactNode> = {
  shield: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  bot: (
    <>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
    </>
  ),
  tv: (
    <>
      <path d="M15.03 9.44a.65.65 0 0 1 0 1.12l-4.06 2.35a.65.65 0 0 1-.97-.56V7.65a.65.65 0 0 1 .97-.56z" />
      <path d="M7 21h10" />
      <rect width="20" height="14" x="2" y="3" rx="2" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  gamepad: (
    <>
      <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59c-.01.05-.01.1-.02.15C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.41.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.55-.6-6.58-.69-7.26 0-.05-.01-.1-.01-.15A4 4 0 0 0 17.32 5z" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <path d="M8 11h8M8 7h6" />
    </>
  ),
  'drive-download': (
    <>
      <path d="M12 2v8M9 7l3 3 3-3" />
      <rect width="20" height="8" x="2" y="14" rx="2" />
      <path d="M6 18h.01M10 18h.01" />
    </>
  ),
  magnet: (
    <>
      <path d="M6 15V6a3 3 0 0 1 6 0v9a3 3 0 0 0 6 0V6" />
      <path d="M3 15h6M15 15h6" />
    </>
  ),
  graduation: (
    <>
      <path d="M22 9 12 5 2 9l10 4 10-4Z" />
      <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    </>
  ),
  smartphone: (
    <>
      <rect width="12" height="20" x="6" y="2" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  terminal: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m7 11 2-2-2-2M11 13h4" />
    </>
  ),
  languages: (
    <>
      <path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1" />
      <path d="m22 22-5-10-5 10M14 18h6" />
    </>
  ),
  boxes: (
    <>
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <path d="m7 16.5-4.74-2.85M7 16.5l5-3M7 16.5v5.17" />
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <path d="m17 16.5-5-3M17 16.5l4.74-2.85M17 16.5v5.17" />
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15M12 8l4.74-2.85M12 8v5.5" />
    </>
  ),
}

export function FeatureIcon({
  name,
  color,
  size = 24,
}: {
  name: FeatureIconName
  color: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
