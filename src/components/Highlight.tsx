/** Search hits inside rendered text (UI-CONV-020): every hit is a mark, the current one stands out. */
import type { ReactNode } from 'react'

export interface HighlightSpec {
  query: string
  messageId: string
  /** ordinal of the current hit inside this message, or -1 */
  current: number
  /** running counter shared by every text run of the message, so ordinals follow reading order */
  counter: { n: number }
}

export function highlight(text: string, spec: HighlightSpec | undefined, keyBase: string): ReactNode[] {
  if (!spec?.query) return [text]
  const q = spec.query.toLowerCase()
  const lower = text.toLowerCase()
  const out: ReactNode[] = []
  let last = 0
  let i = lower.indexOf(q)
  let k = 0
  while (i >= 0) {
    if (i > last) out.push(text.slice(last, i))
    const ordinal = spec.counter.n++
    out.push(
      <mark
        key={`${keyBase}-${k++}`}
        className={ordinal === spec.current ? 'hit current' : 'hit'}
        data-hit={`${spec.messageId}:${ordinal}`}
      >
        {text.slice(i, i + q.length)}
      </mark>
    )
    last = i + q.length
    i = lower.indexOf(q, last)
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
