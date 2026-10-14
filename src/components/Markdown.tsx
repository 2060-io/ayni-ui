/**
 * A markdown subset (UI-CONV-002): headings, paragraphs, block quotes, rules, lists, code, bold, italic,
 * bold-italic, strike-through, inline code, links in a new tab with no referrer and no opener (UI-SEC-004),
 * and the inline tags u, b, i, em, strong, s. Every other tag is shown as text.
 */
import type { ReactNode } from 'react'
import { type HighlightSpec, highlight } from './Highlight.js'

const INLINE =
  /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s<]+|\*[^*\n]+\*|_[^_\n]+_|<(u|b|i|em|strong|s)>[\s\S]*?<\/\3>)/g

function inline(text: string, keyBase: string, hl?: HighlightSpec): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0
    if (start > last) out.push(...highlight(text.slice(last, start), hl, `${keyBase}-t${i}`))
    const token = m[0]
    const key = `${keyBase}-${i++}`
    if (token.startsWith('***'))
      out.push(
        <strong key={key}>
          <em>{inline(token.slice(3, -3), `${key}-bi`, hl)}</em>
        </strong>
      )
    else if (token.startsWith('**')) out.push(<strong key={key}>{inline(token.slice(2, -2), `${key}-b`, hl)}</strong>)
    else if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('~~')) out.push(<s key={key}>{inline(token.slice(2, -2), `${key}-s`, hl)}</s>)
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
    } else if (token.startsWith('<')) {
      const tag = m[3]
      const body = inline(token.slice(tag.length + 2, -(tag.length + 3)), `${key}-h`, hl)
      if (tag === 'u') out.push(<u key={key}>{body}</u>)
      else if (tag === 'b' || tag === 'strong') out.push(<strong key={key}>{body}</strong>)
      else if (tag === 's') out.push(<s key={key}>{body}</s>)
      else out.push(<em key={key}>{body}</em>)
    } else out.push(<em key={key}>{inline(token.slice(1, -1), `${key}-i`, hl)}</em>)
    last = start + token.length
  }
  if (last < text.length) out.push(...highlight(text.slice(last), hl, `${keyBase}-e`))
  return out
}

const isList = (line: string) => /^\s*([-*+]|\d+\.) /.test(line)
const isBlockStart = (line: string) =>
  line.startsWith('```') ||
  isList(line) ||
  /^#{1,6} /.test(line) ||
  /^>/.test(line) ||
  /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)

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
    const heading = /^(#{1,6}) (.*)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length, 6)
      const Tag = `h${level}` as 'h1'
      blocks.push(<Tag key={key++}>{inline(heading[2], `${key}-h`, hl)}</Tag>)
      i++
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push(<hr key={key++} />)
      i++
      continue
    }
    if (/^>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(
        <blockquote key={key++}>
          <Markdown text={quote.join('\n')} hl={hl} />
        </blockquote>
      )
      continue
    }
    if (/^\s*[-*+] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*+] /, ''))
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
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) para.push(lines[i++])
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
