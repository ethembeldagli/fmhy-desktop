/**
 * Bindings for the FMHY dataset commands.
 *
 * Mirrors the Rust `fmhy::query` types. Nothing here holds the dataset in
 * memory: pages are fetched per slug and search is executed in SQLite, so the
 * UI's footprint stays flat regardless of index size.
 */
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../platform'

export interface SyncSummary {
  pages: number
  sections: number
  links: number
  lastSynced: number
}

export interface PageSummary {
  slug: string
  title: string
  group: string
  sectionCount: number
  linkCount: number
  starredCount: number
}

export interface LinkRef {
  label: string
  url: string
}

export type LinkKind = 'resource' | 'note' | 'reference'

export interface LinkRow {
  id: number
  title: string
  url: string
  description: string
  tags: string[]
  starred: boolean
  isIndex: boolean
  kind: LinkKind
  mirrors: LinkRef[]
  related: LinkRef[]
}

export interface SectionRow {
  id: number
  title: string
  slug: string
  depth: number
  path: string
  links: LinkRow[]
}

export interface PageDetail {
  slug: string
  title: string
  group: string
  sections: SectionRow[]
  linkCount: number
}

export interface SearchHit {
  id: number
  title: string
  url: string
  description: string
  breadcrumb: string
  pageSlug: string
  pageTitle: string
  sectionTitle: string
  starred: boolean
  isIndex: boolean
}

export interface SyncProgress {
  done: number
  total: number
  label: string
}

/** Outside Tauri there is no dataset; callers render their empty states. */
const unavailable = <T>(value: T): Promise<T> => Promise.resolve(value)

export const fmhy = {
  status: (): Promise<SyncSummary | null> =>
    isTauri ? invoke<SyncSummary | null>('fmhy_status') : unavailable(null),

  sync: (): Promise<SyncSummary> =>
    isTauri
      ? invoke<SyncSummary>('fmhy_sync')
      : Promise.reject(new Error('Dataset sync requires the desktop app')),

  pages: (): Promise<PageSummary[]> =>
    isTauri ? invoke<PageSummary[]>('fmhy_pages') : unavailable([]),

  page: (slug: string): Promise<PageDetail | null> =>
    isTauri ? invoke<PageDetail | null>('fmhy_page', { slug }) : unavailable(null),

  search: (query: string, limit = 50): Promise<SearchHit[]> =>
    isTauri ? invoke<SearchHit[]>('fmhy_search', { query, limit }) : unavailable([]),
}

/** Host shown next to a resource title. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}
