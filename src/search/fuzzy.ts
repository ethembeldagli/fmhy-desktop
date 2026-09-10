/**
 * Subsequence fuzzy matching with positional scoring.
 *
 * Used by the command palette now and by FMHY dataset search later, so ranking
 * feels identical everywhere. Deliberately dependency-free and allocation-light:
 * it runs on every keystroke.
 *
 * Scoring favours, in order: matches at the start of the string, matches at
 * word boundaries, and runs of consecutive characters. Shorter targets win ties
 * so exact-ish names beat long descriptions that happen to contain the letters.
 */

export interface FuzzyMatch {
  score: number
  /** Indices in the target that matched, for highlighting. */
  positions: number[]
}

const SEPARATORS = new Set([' ', '-', '_', '/', '.', ':', '(', '[', '·'])

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] }

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Exact substring is always the strongest signal; score it directly.
  const direct = t.indexOf(q)
  if (direct !== -1) {
    const atStart = direct === 0
    const atBoundary = direct > 0 && SEPARATORS.has(t[direct - 1]!)
    const base = 1000 + (atStart ? 400 : atBoundary ? 240 : 0)
    const lengthPenalty = Math.min(t.length - q.length, 120)
    return {
      score: base - lengthPenalty - direct,
      positions: Array.from({ length: q.length }, (_, i) => direct + i),
    }
  }

  const positions: number[] = []
  let score = 0
  let ti = 0
  let consecutive = 0

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!
    let found = -1

    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti
        break
      }
      ti++
    }

    if (found === -1) return null // not a subsequence

    const atStart = found === 0
    const atBoundary = found > 0 && SEPARATORS.has(t[found - 1]!)
    score += atStart ? 22 : atBoundary ? 16 : 4
    score += consecutive * 6

    consecutive = positions.length > 0 && found === positions[positions.length - 1]! + 1
      ? consecutive + 1
      : 0

    positions.push(found)
    ti++
  }

  // Prefer tighter matches spread over less of the string.
  const span = positions[positions.length - 1]! - positions[0]! + 1
  score -= Math.min(span - q.length, 60)
  score -= Math.min(Math.floor(t.length / 12), 20)

  return { score, positions }
}

/** Rank items by their best-matching field. Weights let titles outrank blurbs. */
export function fuzzyRank<T>(
  query: string,
  items: readonly T[],
  fields: (item: T) => { text: string; weight: number }[],
  limit = 40,
): { item: T; score: number; positions: number[] }[] {
  const results: { item: T; score: number; positions: number[] }[] = []

  for (const item of items) {
    let best: { score: number; positions: number[] } | null = null

    for (const { text, weight } of fields(item)) {
      const match = fuzzyMatch(query, text)
      if (!match) continue
      const weighted = match.score * weight
      if (!best || weighted > best.score) {
        best = { score: weighted, positions: match.positions }
      }
    }

    if (best) results.push({ item, score: best.score, positions: best.positions })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

/** Split a string into matched / unmatched runs for highlight rendering. */
export function highlightRuns(
  text: string,
  positions: number[],
): { text: string; match: boolean }[] {
  if (positions.length === 0) return [{ text, match: false }]

  const set = new Set(positions)
  const runs: { text: string; match: boolean }[] = []
  let current = ''
  let currentMatch = set.has(0)

  for (let i = 0; i < text.length; i++) {
    const isMatch = set.has(i)
    if (isMatch !== currentMatch) {
      if (current) runs.push({ text: current, match: currentMatch })
      current = ''
      currentMatch = isMatch
    }
    current += text[i]
  }
  if (current) runs.push({ text: current, match: currentMatch })
  return runs
}
