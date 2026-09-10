/**
 * Renders inline markdown links inside FMHY prose.
 *
 * Editorial notes keep their original markdown, because unlike resource
 * entries the links are woven through the sentence rather than trailing it —
 * stripping them out would break the text. This renders `[label](url)` as a
 * real link and leaves everything else as written.
 */
import type { ReactNode } from 'react'

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

export function RichText({
  text,
  onOpen,
}: {
  text: string
  onOpen: (url: string) => void
}) {
  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0

  for (const match of text.matchAll(LINK)) {
    const index = match.index ?? 0
    if (index > cursor) nodes.push(text.slice(cursor, index))

    const [, label, url] = match
    nodes.push(
      <a
        key={key++}
        className="doc__link"
        title={url}
        onClick={(event) => {
          event.preventDefault()
          if (url) onOpen(url)
        }}
      >
        {label}
      </a>,
    )
    cursor = index + match[0].length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return <>{nodes}</>
}
