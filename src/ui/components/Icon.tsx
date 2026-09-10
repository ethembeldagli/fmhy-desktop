/**
 * Icon set.
 *
 * Hand-authored on a 16px grid with a consistent 1.5px stroke and round joins,
 * rather than pulling in an icon library. Keeping them here means one visual
 * language, no dependency, and no emoji standing in for UI affordances.
 */

export type IconName =
  | 'home'
  | 'compass'
  | 'categories'
  | 'search'
  | 'star'
  | 'star-filled'
  | 'clock'
  | 'download'
  | 'settings'
  | 'arrow-left'
  | 'arrow-right'
  | 'reload'
  | 'close'
  | 'plus'
  | 'lock'
  | 'globe'
  | 'external'
  | 'more'
  | 'chevron-right'
  | 'chevron-down'
  | 'panel-left'
  | 'pin'
  | 'command'
  | 'sun'
  | 'moon'
  | 'shield'
  | 'check'
  | 'alert'
  | 'win-minimize'
  | 'win-maximize'
  | 'win-restore'
  | 'win-close'
  | 'sparkle'
  | 'folder'
  | 'bulb'

const S = 1.5

const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M2.6 6.6 8 2.4l5.4 4.2V13a.9.9 0 0 1-.9.9h-9a.9.9 0 0 1-.9-.9Z" />
      <path d="M6.3 13.9v-3.6h3.4v3.6" />
    </>
  ),
  compass: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M10.5 5.5 9.2 9.2 5.5 10.5 6.8 6.8Z" />
    </>
  ),
  categories: (
    <>
      <rect x="2.2" y="2.2" width="5" height="5" rx="1.2" />
      <rect x="8.8" y="2.2" width="5" height="5" rx="1.2" />
      <rect x="2.2" y="8.8" width="5" height="5" rx="1.2" />
      <rect x="8.8" y="8.8" width="5" height="5" rx="1.2" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.6" />
      <path d="m10.6 10.6 3 3" />
    </>
  ),
  star: <path d="m8 2.1 1.82 3.69 4.07.6-2.945 2.87.695 4.055L8 11.4l-3.64 1.915.695-4.055L2.11 6.39l4.07-.6Z" />,
  'star-filled': (
    <path
      d="m8 2.1 1.82 3.69 4.07.6-2.945 2.87.695 4.055L8 11.4l-3.64 1.915.695-4.055L2.11 6.39l4.07-.6Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M8 4.6V8l2.4 1.5" />
    </>
  ),
  download: (
    <>
      <path d="M8 2.4v7.2" />
      <path d="m5 6.8 3 3 3-3" />
      <path d="M2.6 11.6v1a1 1 0 0 0 1 1h8.8a1 1 0 0 0 1-1v-1" />
    </>
  ),
  settings: (
    <>
      <path d="M2.4 4.6h11.2M2.4 11.4h11.2" />
      <circle cx="6" cy="4.6" r="1.7" />
      <circle cx="10.4" cy="11.4" r="1.7" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M13 8H3.4" />
      <path d="m7.4 3.6-4 4.4 4 4.4" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M3 8h9.6" />
      <path d="m8.6 3.6 4 4.4-4 4.4" />
    </>
  ),
  reload: (
    <>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" />
      <path d="M13.4 2.5v3.2h-3.2" />
    </>
  ),
  close: <path d="m3.9 3.9 8.2 8.2M12.1 3.9l-8.2 8.2" />,
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  lock: (
    <>
      <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.6" />
      <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
    </>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M2.3 8h11.4" />
      <path d="M8 2.1c1.5 1.65 2.35 3.7 2.35 5.9S9.5 12.25 8 13.9c-1.5-1.65-2.35-3.7-2.35-5.9S6.5 3.75 8 2.1Z" />
    </>
  ),
  external: (
    <>
      <path d="M9.4 2.6h4v4" />
      <path d="m13.4 2.6-5.6 5.6" />
      <path d="M11.6 9.6v2.9a1.3 1.3 0 0 1-1.3 1.3H3.8a1.3 1.3 0 0 1-1.3-1.3V6a1.3 1.3 0 0 1 1.3-1.3h2.9" />
    </>
  ),
  more: (
    <>
      <circle cx="3.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  'chevron-right': <path d="m6.2 3.6 4.4 4.4-4.4 4.4" />,
  'chevron-down': <path d="m3.6 6.2 4.4 4.4 4.4-4.4" />,
  'panel-left': (
    <>
      <rect x="2.2" y="2.9" width="11.6" height="10.2" rx="1.8" />
      <path d="M6.5 2.9v10.2" />
    </>
  ),
  pin: (
    <>
      <path d="M9.6 1.9 14.1 6.4l-2.05.55a2 2 0 0 0-1.02.6l-1.9 2.05-2.7-2.7 2.05-1.9a2 2 0 0 0 .6-1.02Z" />
      <path d="m6.43 9.57-4.3 4.3" />
    </>
  ),
  command: (
    <path d="M5.9 2.6a1.7 1.7 0 1 1-1.7 1.7v7.4a1.7 1.7 0 1 1 1.7 1.7h4.2a1.7 1.7 0 1 1 1.7-1.7V4.3a1.7 1.7 0 1 1-1.7-1.7Z" />
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.4v1.6M8 13v1.6M3.34 3.34l1.13 1.13M11.53 11.53l1.13 1.13M1.4 8h1.6M13 8h1.6M3.34 12.66l1.13-1.13M11.53 4.47l1.13-1.13" />
    </>
  ),
  moon: <path d="M13.2 9.6A5.7 5.7 0 0 1 6.4 2.8a5.9 5.9 0 1 0 6.8 6.8Z" />,
  shield: (
    <>
      <path d="M8 1.9l4.9 1.9v4c0 3-2.05 5.4-4.9 6.3-2.85-.9-4.9-3.3-4.9-6.3v-4Z" />
      <path d="m5.9 7.9 1.5 1.5 2.9-2.9" />
    </>
  ),
  check: <path d="m3 8.4 3.2 3.2L13 4.8" />,
  alert: (
    <>
      <path d="M7.05 2.6 1.9 11.4a1.1 1.1 0 0 0 .95 1.65h10.3a1.1 1.1 0 0 0 .95-1.65L8.95 2.6a1.1 1.1 0 0 0-1.9 0Z" />
      <path d="M8 6.3v2.6" />
      <circle cx="8" cy="10.9" r=".85" fill="currentColor" stroke="none" />
    </>
  ),
  'win-minimize': <path d="M3 8h10" />,
  'win-maximize': <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.2" />,
  'win-restore': (
    <>
      <rect x="2.6" y="5" width="8.4" height="8.4" rx="1.2" />
      <path d="M5 5V3.8A1.2 1.2 0 0 1 6.2 2.6h7.2A1.2 1.2 0 0 1 14.6 3.8V11a1.2 1.2 0 0 1-1.2 1.2h-1.2" />
    </>
  ),
  'win-close': <path d="m3.9 3.9 8.2 8.2M12.1 3.9l-8.2 8.2" />,
  sparkle: (
    <>
      <path d="M8 2.2 9.35 6.2 13.3 7.55 9.35 8.9 8 12.9 6.65 8.9 2.7 7.55 6.65 6.2Z" />
      <path d="M12.6 2.2v2.2M13.7 3.3h-2.2" />
    </>
  ),
  bulb: (
    <>
      <path d="M6.2 10.4a4.4 4.4 0 1 1 3.6 0" />
      <path d="M6.3 12.2h3.4M6.8 14h2.4" />
    </>
  ),
  folder: (
    <path d="M2.4 4.6a1.2 1.2 0 0 1 1.2-1.2h2.5l1.5 1.8h4.9a1.2 1.2 0 0 1 1.2 1.2v5.8a1.2 1.2 0 0 1-1.2 1.2H3.6a1.2 1.2 0 0 1-1.2-1.2Z" />
  ),
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
  'aria-hidden'?: boolean
}

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={S}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
