/** Search hits inside rendered text (UI-CONV-020): every hit becomes a mark; the conversation numbers them in reading order. */
import type { ReactNode } from 'react'

export interface HighlightSpec {
  query: string
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
    out.push(
      <mark key={`${keyBase}-${k++}`} className="hit">
        {text.slice(i, i + q.length)}
      </mark>
    )
    last = i + q.length
    i = lower.indexOf(q, last)
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
