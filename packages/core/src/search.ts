/** Occurrence search over cached messages (UI-CONV-020): every hit, in transcript order. */
import type { TranscriptMessage } from './types.js'

export interface Occurrence {
  messageId: string
  /** the hit's rank inside its message, from 0 */
  ordinal: number
}

export function countOccurrences(text: string, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = text.toLowerCase()
  let n = 0
  let i = t.indexOf(q)
  while (i >= 0) {
    n++
    i = t.indexOf(q, i + q.length)
  }
  return n
}

export function findOccurrences(messages: TranscriptMessage[], query: string): Occurrence[] {
  const out: Occurrence[] = []
  if (!query.trim()) return out
  for (const m of messages) {
    if (m.role === 'activity') continue
    const n = countOccurrences(m.content, query)
    for (let k = 0; k < n; k++) out.push({ messageId: m.id, ordinal: k })
  }
  return out
}

/** The first hit of `query` in `text` with some context around it, for list previews. */
export function excerpt(text: string, query: string, before = 30, after = 60): string | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  const index = text.toLowerCase().indexOf(q)
  if (index < 0) return undefined
  const start = Math.max(0, index - before)
  return `${start > 0 ? '…' : ''}${text.slice(start, index + q.length + after).replace(/\s+/g, ' ')}`
}
