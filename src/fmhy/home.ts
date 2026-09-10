/**
 * FMHY's homepage content.
 *
 * Mirrors the hero and feature cards defined in `docs/index.md` upstream —
 * same titles, destinations, blurbs and per-card icon colours — so the app's
 * landing screen is the site's landing screen.
 */
import type { FeatureIconName } from '../ui/components/FeatureIcon'

export const HERO = {
  name: 'freemediaheckyeah',
  tagline: 'The largest collection of free stuff on the internet!',
} as const

export interface HomeAction {
  label: string
  kind: 'brand' | 'alt'
  /** Page slug, or an absolute URL for off-site destinations. */
  target: string
}

export const HERO_ACTIONS: HomeAction[] = [
  { label: 'See Beginners Guide', kind: 'brand', target: 'beginners-guide' },
  { label: 'Posts', kind: 'alt', target: 'https://fmhy.net/posts' },
  { label: 'Contribute', kind: 'alt', target: 'https://fmhy.net/other/contributing' },
  {
    label: 'Discord',
    kind: 'alt',
    target: 'https://github.com/fmhy/FMHY/wiki/FMHY-Discord',
  },
]

export interface HomeFeature {
  title: string
  slug: string
  details: string
  color: string
  icon: FeatureIconName
}

export const FEATURES: HomeFeature[] = [
  {
    title: 'Adblocking / Privacy',
    slug: 'privacy',
    details: 'Learn how to block ads, trackers and other nasty things.',
    color: '#D05A6E',
    icon: 'shield',
  },
  {
    title: 'Artificial Intelligence',
    slug: 'ai',
    details: 'Explore the world of AI and machine learning.',
    color: '#91989F',
    icon: 'bot',
  },
  {
    title: 'Streaming',
    slug: 'video',
    details: 'Stream, download, torrent and binge all your favourite movies and shows!',
    color: '#7aa2f7',
    icon: 'tv',
  },
  {
    title: 'Listening',
    slug: 'audio',
    details: 'Stream, download and torrent songs, podcasts and more!',
    color: '#7c82fe',
    icon: 'music',
  },
  {
    title: 'Gaming',
    slug: 'gaming',
    details:
      'Download and play all your favourite games or emulate some old but gold ones!',
    color: '#49d3e9',
    icon: 'gamepad',
  },
  {
    title: 'Reading',
    slug: 'reading',
    details:
      "Whether you're a bookworm, otaku or comic book fan, you'll be able to find your favourite pieces of literature here!",
    color: '#3ccd93',
    icon: 'book',
  },
  {
    title: 'Downloading',
    slug: 'downloading',
    details:
      'Download all your favourite software, movies, shows, music, games and more!',
    color: '#BEC23F',
    icon: 'drive-download',
  },
  {
    title: 'Torrenting',
    slug: 'torrenting',
    details: 'Download your favourite media using the BitTorrent protocol.',
    color: '#8A6BBE',
    icon: 'magnet',
  },
  {
    title: 'Educational',
    slug: 'educational',
    details: 'Educational content for all ages.',
    color: '#A8D8B9',
    icon: 'graduation',
  },
  {
    title: 'Android / iOS',
    slug: 'mobile',
    details: 'All forms of content for Android and iOS.',
    color: '#DAC9A6',
    icon: 'smartphone',
  },
  {
    title: 'Linux / macOS',
    slug: 'linux-macos',
    details: 'The $HOME of Linux and macOS.',
    color: '#f17c67',
    icon: 'terminal',
  },
  {
    title: 'Non-English',
    slug: 'non-english',
    details: 'Content in languages other than English.',
    color: '#FB9966',
    icon: 'languages',
  },
  {
    title: 'Miscellaneous',
    slug: 'misc',
    details: 'Various topics like food, travel, news, shopping, fun sites and more!',
    color: '#DDD23B',
    icon: 'boxes',
  },
]
