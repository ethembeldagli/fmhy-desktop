/**
 * Service marks for supplementary links (Discord, GitHub, subreddit, ...).
 *
 * Rendered as CSS masks so they take the surrounding text colour and respond
 * to hover, which full-colour artwork could not.
 */
import { serviceIconUrl, type ServiceIconName } from './serviceIcons.generated'
import './ServiceIcon.css'

export type { ServiceIconName }

export function ServiceIcon({
  name,
  size = 16,
}: {
  name: ServiceIconName
  size?: number
}) {
  return (
    <span
      className="service-icon"
      style={{ maskImage: serviceIconUrl(name), WebkitMaskImage: serviceIconUrl(name), width: size, height: size }}
      aria-hidden="true"
    />
  )
}

/** Which mark, if any, represents this URL's host. */
export function serviceFor(url: string): ServiceIconName | null {
  let host: string
  try {
    host = new URL(url).host.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  if (host === 'discord.gg' || host.endsWith('discord.com')) return 'discord'
  if (host.endsWith('github.com') || host.endsWith('github.io')) return 'github'
  if (host.endsWith('reddit.com') || host === 'redd.it') return 'reddit'
  if (host === 't.me' || host.endsWith('telegram.me')) return 'telegram'
  if (host === 'x.com' || host.endsWith('twitter.com')) return 'x'
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube'
  return null
}
