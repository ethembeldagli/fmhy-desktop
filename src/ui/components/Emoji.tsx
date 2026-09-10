/**
 * Emoji rendered as Twemoji images.
 *
 * FMHY's site renders emoji as Twemoji SVGs, not text. Using the text
 * characters instead would pick up the host platform's emoji font — Apple's on
 * macOS, Segoe's on Windows, Noto's on most Linux — so the same page would look
 * different on each, and different from FMHY everywhere.
 */
import { emojiUrl, type EmojiName } from './emoji.generated'
import './Emoji.css'

export type { EmojiName }

export function Emoji({
  name,
  size = 16,
  className,
}: {
  name: EmojiName
  size?: number
  className?: string
}) {
  return (
    <span
      className={className ? `emoji ${className}` : 'emoji'}
      style={{
        backgroundImage: emojiUrl(name),
        width: size,
        height: size,
      }}
      aria-hidden="true"
    />
  )
}
