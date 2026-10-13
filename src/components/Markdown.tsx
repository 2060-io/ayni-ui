/** A markdown subset (UI-CONV-002): paragraphs, bold, italic, code, lists, links in a new tab with no referrer and no opener (UI-SEC-004). */
import type { ReactNode } from 'react'
import { type HighlightSpec, highlight } from './Highlight.js'

function inline(text: string, keyBase: string, hl?: HighlightSpec): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s<]+|\*[^*]+\*)/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0
    if (start > last) out.push(...highlight(text.slice(last, start), hl, `${keyBase}-t${i}`))
    const token = m[0]
    const key = `${keyBase}-${i++}`
    if (token.startsWith('**')) out.push(<strong key={key}>{highlight(token.slice(2, -2), hl, `${key}-b`)}</strong>)
    else if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('[')) {
      const label = token.slice(1, token.indexOf(']'))
      out.push(
        <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer nofollow">
          {label}
        </a>
      )
    } else if (token.startsWith('http')) {
      out.push(
        <a key={key} href={token} target="_blank" rel="noopener noreferrer nofollow">
          {token}
        </a>
      )
    } else out.push(<em key={key}>{highlight(token.slice(1, -1), hl, `${key}-i`)}</em>)
    last = start + token.length
  }
  if (last < text.length) out.push(...highlight(text.slice(last), hl, `${keyBase}-e`))
  return out
}

export function Markdown({ text, hl }: { text: string; hl?: HighlightSpec }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={key++}>
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }
    if (/^\s*[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ''))
      blocks.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`, hl)}</li>
          ))}
        </ul>
      )
      continue
    }
    if (/^\s*\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\. /, ''))
      blocks.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`, hl)}</li>
          ))}
        </ol>
      )
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^\s*([-*]|\d+\.) /.test(lines[i])
    )
      para.push(lines[i++])
    if (para.length) {
      blocks.push(
        <p key={key++}>
          {para.flatMap((p, j) => [...(j > 0 ? [<br key={`br-${j}`} />] : []), ...inline(p, `${key}-${j}`, hl)])}
        </p>
      )
    } else i++
  }
  return <div className="markdown">{blocks}</div>
}
