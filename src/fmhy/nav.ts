/**
 * The sidebar, mirroring FMHY's own navigation exactly.
 *
 * Taken from `docs/.vitepress/shared.ts` upstream: the same entries, order,
 * grouping and emoji. Destinations that are not pages in our index (Posts,
 * Contribute, NSFW, Recently Removed) are marked external and open in the
 * app's browser, since there is nothing local to render for them.
 */
import type { Route } from '../browser/types'
import type { EmojiName } from '../ui/components/Emoji'

export interface NavEntry {
  key: string
  emoji: EmojiName
  label: string
  /** A page slug in the local index, or an absolute URL. */
  target: string
}

export interface NavGroup {
  title: string
  entries: NavEntry[]
  /** Groups are open by default, matching the site. */
  collapsedByDefault?: boolean
}

export const NAV_TOP: NavEntry[] = [
  { key: 'beginners-guide', emoji: 'books', label: 'Beginners Guide', target: 'beginners-guide' },
  { key: 'posts', emoji: 'newspaper', label: 'Posts', target: 'https://fmhy.net/posts' },
  {
    key: 'contribute',
    emoji: 'light-bulb',
    label: 'Contribute',
    target: 'https://fmhy.net/other/contributing',
  },
]

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Wiki',
    entries: [
      { key: 'privacy', emoji: 'name-badge', label: 'Adblocking / Privacy', target: 'privacy' },
      { key: 'ai', emoji: 'robot', label: 'Artificial Intelligence', target: 'ai' },
      { key: 'video', emoji: 'television', label: 'Movies / TV / Anime', target: 'video' },
      { key: 'audio', emoji: 'musical-note', label: 'Music / Podcasts / Radio', target: 'audio' },
      { key: 'gaming', emoji: 'video-game', label: 'Gaming / Emulation', target: 'gaming' },
      { key: 'reading', emoji: 'green-book', label: 'Books / Comics / Manga', target: 'reading' },
      { key: 'downloading', emoji: 'floppy-disk', label: 'Downloading', target: 'downloading' },
      { key: 'torrenting', emoji: 'cyclone', label: 'Torrenting', target: 'torrenting' },
      { key: 'educational', emoji: 'brain', label: 'Educational', target: 'educational' },
      { key: 'mobile', emoji: 'mobile-phone', label: 'Android / iOS', target: 'mobile' },
      { key: 'linux-macos', emoji: 'penguin', label: 'Linux / macOS', target: 'linux-macos' },
      { key: 'non-english', emoji: 'globe-showing-asia-australia', label: 'Non-English', target: 'non-english' },
      { key: 'misc', emoji: 'file-folder', label: 'Miscellaneous', target: 'misc' },
    ],
  },
  {
    title: 'Tools',
    entries: [
      { key: 'system-tools', emoji: 'laptop', label: 'System Tools', target: 'system-tools' },
      { key: 'file-tools', emoji: 'card-file-box', label: 'File Tools', target: 'file-tools' },
      { key: 'internet-tools', emoji: 'paperclip', label: 'Internet Tools', target: 'internet-tools' },
      {
        key: 'social-media-tools',
        emoji: 'left-speech-bubble',
        label: 'Social Media Tools',
        target: 'social-media-tools',
      },
      { key: 'text-tools', emoji: 'memo', label: 'Text Tools', target: 'text-tools' },
      { key: 'gaming-tools', emoji: 'alien-monster', label: 'Gaming Tools', target: 'gaming-tools' },
      { key: 'image-tools', emoji: 'camera', label: 'Image Tools', target: 'image-tools' },
      { key: 'video-tools', emoji: 'videocassette', label: 'Video Tools', target: 'video-tools' },
      { key: 'audio-tools', emoji: 'speaker-high-volume', label: 'Audio Tools', target: 'audio' },
      {
        key: 'educational-tools',
        emoji: 'red-apple',
        label: 'Educational Tools',
        target: 'educational',
      },
      {
        key: 'developer-tools',
        emoji: 'man-technologist',
        label: 'Developer Tools',
        target: 'developer-tools',
      },
    ],
  },
  {
    title: 'More',
    collapsedByDefault: true,
    entries: [
      { key: 'nsfw', emoji: 'no-one-under-eighteen', label: 'NSFW', target: 'https://rentry.org/NSFW-Checkpoint' },
      { key: 'unsafe', emoji: 'warning', label: 'Unsafe Sites', target: 'unsafe' },
      {
        key: 'recently-removed',
        emoji: 'wastebasket',
        label: 'Recently Removed',
        target: 'https://fmhy.net/recently-removed',
      },
      { key: 'storage', emoji: 'package', label: 'Storage', target: 'storage' },
    ],
  },
]

/** App destinations the website has no counterpart for. */
export const NAV_LIBRARY: NavGroup = {
  title: 'Library',
  entries: [
    { key: 'home', emoji: 'house', label: 'Home', target: '@home' },
    { key: 'search', emoji: 'magnifying-glass-tilted-left', label: 'Search', target: '@search' },
    { key: 'favorites', emoji: 'star', label: 'Favorites', target: '@favorites' },
    { key: 'history', emoji: 'four-oclock', label: 'History', target: '@history' },
    { key: 'downloads', emoji: 'down-arrow', label: 'Downloads', target: '@downloads' },
    { key: 'settings', emoji: 'gear', label: 'Settings', target: '@settings' },
  ],
}

/** FMHY explains its content markers in a card at the foot of the sidebar. */
export const EMOJI_LEGEND = [
  { emoji: 'globe-with-meridians', label: 'Indexes' },
  { emoji: 'repeat-button', label: 'Section Links' },
  { emoji: 'star', label: 'Recommendations' },
] as const

export function entryRoute(entry: NavEntry): Route {
  if (entry.target.startsWith('@')) {
    return { view: entry.target.slice(1) as 'home' } as Route
  }
  if (entry.target.startsWith('http')) {
    return { view: 'web', url: entry.target }
  }
  return { view: 'categories', page: entry.target }
}

/** Links FMHY carries in its own top navigation. */
export interface TopNavLink {
  emoji: EmojiName
  label: string
  url: string
}

export const TOP_NAV: TopNavLink[] = [
  { emoji: 'bookmark-tabs', label: 'Changelog', url: 'https://fmhy.net/posts/changelog-sites' },
  { emoji: 'open-book', label: 'Glossary', url: 'https://fluffle.cc/piracyglossary' },
  { emoji: 'floppy-disk', label: 'Backups', url: 'https://fmhy.net/other/backups' },
]

/** The "Ecosystem" dropdown from FMHY's top navigation. */
export const ECOSYSTEM: TopNavLink[] = [
  { emoji: 'globe-with-meridians', label: 'Search', url: 'https://fmhy.net/posts/search' },
  { emoji: 'red-question-mark', label: 'FAQs', url: 'https://fmhy.net/other/FAQ' },
  {
    emoji: 'bookmark',
    label: 'Bookmarks',
    url: 'https://github.com/mian196/fmhy-bookmarks-extension',
  },
  {
    emoji: 'check-mark-button',
    label: 'SafeGuard',
    url: 'https://github.com/fmhy/FMHY-SafeGuard',
  },
  { emoji: 'rocket', label: 'Startpage', url: 'https://fmhy.net/startpage' },
  {
    emoji: 'magnifying-glass-tilted-right',
    label: 'SearXNG',
    url: 'https://searx.fmhy.net/',
  },
  {
    emoji: 'light-bulb',
    label: 'Site Hunting',
    url: 'https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/find-new-sites/',
  },
  { emoji: 'smiling-face-with-halo', label: 'SFW FMHY', url: 'https://fmhy.xyz/' },
  { emoji: 'house-with-garden', label: 'Selfhosting', url: 'https://fmhy.net/other/selfhosting' },
  { emoji: 'framed-picture', label: 'Wallpapers', url: 'https://fmhy.net/other/wallpapers' },
  { emoji: 'blue-heart', label: 'Feedback', url: 'https://fmhy.net/feedback' },
]

/**
 * FMHY marks links that leave its own site with an arrow. Anything not on
 * fmhy.net counts, which is what their nav does.
 */
export function isOffSite(url: string): boolean {
  try {
    return !new URL(url).host.endsWith('fmhy.net')
  } catch {
    return false
  }
}
