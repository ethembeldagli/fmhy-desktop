/**
 * FMHY page catalogue.
 *
 * These are FMHY's real pages, slugs and titles, mirroring the upstream
 * navigation (`docs/.vitepress/shared.ts` in fmhy/edit). It exists so the shell
 * has a genuine spine to navigate before the dataset is synced.
 *
 * The sync layer replaces the *contents* of every page; this list only supplies
 * ordering, grouping and display names, which is exactly the metadata the
 * upstream markdown does not carry. Nothing here is invented.
 *
 * Upstream marks each page with a twemoji glyph. We deliberately map those onto
 * the app's own icon set instead of rendering emoji as UI chrome.
 */
import type { IconName } from '../ui/components/Icon'

export interface CatalogPage {
  /** Upstream document id, e.g. `/ai` — the sync key. */
  slug: string
  title: string
  /** Short editorial blurb shown on cards. */
  blurb: string
  icon: IconName
  /**
   * The glyph FMHY shows beside this page in its own sidebar.
   *
   * Their nav is emoji-led, so matching the site means using them here. App
   * chrome that FMHY has no equivalent for (tabs, toolbar) keeps the drawn
   * icon set.
   */
  emoji: string
  group: CatalogGroup
}

export type CatalogGroup = 'Wiki' | 'Tools' | 'More'

export const CATALOG: CatalogPage[] = [
  // ---- Wiki --------------------------------------------------------------
  { slug: 'privacy', title: 'Adblocking / Privacy', blurb: 'Blockers, trackers, hardening', emoji: '📛', icon: 'shield', group: 'Wiki' },
  { slug: 'ai', title: 'Artificial Intelligence', blurb: 'Chatbots, models, generation', emoji: '🤖', icon: 'sparkle', group: 'Wiki' },
  { slug: 'video', title: 'Movies / TV / Anime', blurb: 'Streaming and libraries', emoji: '📺', icon: 'compass', group: 'Wiki' },
  { slug: 'audio', title: 'Music / Podcasts / Radio', blurb: 'Listening and archives', emoji: '🎵', icon: 'globe', group: 'Wiki' },
  { slug: 'gaming', title: 'Gaming / Emulation', blurb: 'Games, emulators, tooling', emoji: '🎮', icon: 'categories', group: 'Wiki' },
  { slug: 'reading', title: 'Books / Comics / Manga', blurb: 'Reading and libraries', emoji: '📗', icon: 'folder', group: 'Wiki' },
  { slug: 'downloading', title: 'Downloading', blurb: 'Direct downloads and clients', emoji: '💾', icon: 'download', group: 'Wiki' },
  { slug: 'torrenting', title: 'Torrenting', blurb: 'Trackers and clients', emoji: '🌀', icon: 'reload', group: 'Wiki' },
  { slug: 'educational', title: 'Educational', blurb: 'Courses and reference', emoji: '🧠', icon: 'home', group: 'Wiki' },
  { slug: 'mobile', title: 'Android / iOS', blurb: 'Mobile apps and stores', emoji: '📱', icon: 'panel-left', group: 'Wiki' },
  { slug: 'linux-macos', title: 'Linux / macOS', blurb: 'Platform-specific software', emoji: '🐧', icon: 'command', group: 'Wiki' },
  { slug: 'non-english', title: 'Non-English', blurb: 'Resources by language', emoji: '🌏', icon: 'globe', group: 'Wiki' },
  { slug: 'misc', title: 'Miscellaneous', blurb: 'Everything else worth keeping', emoji: '📁', icon: 'more', group: 'Wiki' },

  // ---- Tools -------------------------------------------------------------
  { slug: 'system-tools', title: 'System Tools', blurb: 'Utilities and maintenance', emoji: '💻', icon: 'settings', group: 'Tools' },
  { slug: 'file-tools', title: 'File Tools', blurb: 'Conversion and management', emoji: '🗃️', icon: 'folder', group: 'Tools' },
  { slug: 'internet-tools', title: 'Internet Tools', blurb: 'Networking and web utilities', emoji: '📎', icon: 'globe', group: 'Tools' },
  { slug: 'social-media-tools', title: 'Social Media Tools', blurb: 'Front-ends and exporters', emoji: '🗨️', icon: 'compass', group: 'Tools' },
  { slug: 'text-tools', title: 'Text Tools', blurb: 'Writing, notes, formatting', emoji: '📝', icon: 'categories', group: 'Tools' },
  { slug: 'gaming-tools', title: 'Gaming Tools', blurb: 'Launchers, mods, utilities', emoji: '👾', icon: 'categories', group: 'Tools' },
  { slug: 'image-tools', title: 'Image Tools', blurb: 'Editing and conversion', emoji: '📷', icon: 'sparkle', group: 'Tools' },
  { slug: 'video-tools', title: 'Video Tools', blurb: 'Editing and downloading', emoji: '📼', icon: 'compass', group: 'Tools' },
  { slug: 'developer-tools', title: 'Developer Tools', blurb: 'Hosting, APIs, environments', emoji: '👨‍💻', icon: 'command', group: 'Tools' },

  // ---- More --------------------------------------------------------------
  { slug: 'storage', title: 'Storage', blurb: 'Cloud and file hosting', emoji: '📦', icon: 'download', group: 'More' },
  { slug: 'beginners-guide', title: 'Beginners Guide', blurb: 'Start here', emoji: '📚', icon: 'home', group: 'More' },
  { slug: 'unsafe', title: 'Unsafe Sites', blurb: 'Known-bad sites to avoid', emoji: '⚠️', icon: 'alert', group: 'More' },
]

export const CATALOG_GROUPS: CatalogGroup[] = ['Wiki', 'Tools', 'More']

export function pageBySlug(slug: string): CatalogPage | undefined {
  return CATALOG.find((page) => page.slug === slug)
}

export function pagesInGroup(group: CatalogGroup): CatalogPage[] {
  return CATALOG.filter((page) => page.group === group)
}

/**
 * Where the dataset is fetched from.
 *
 * FMHY publishes an official concatenation of every wiki page, served from
 * their own Cloudflare worker (`fmhy/edit` -> `api/routes/single-page.ts`) with
 * a two-hour cache header. Using it means one request instead of 25 and no
 * scraping of the rendered site. The raw per-page markdown is the fallback.
 */
export const FMHY_SOURCES = {
  singlePage: 'https://api.fmhy.net/single-page',
  rawPage: (slug: string) => `https://raw.githubusercontent.com/fmhy/edit/main/docs/${slug}.md`,
  site: 'https://fmhy.net',
  repo: 'https://github.com/fmhy/edit',
} as const
