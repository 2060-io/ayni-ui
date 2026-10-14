import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../src/components/Markdown.js'
import { plainText } from '../src/components/MessageActions.js'

describe('markdown subset (UI-CONV-002)', () => {
  it('renders headings, quotes, rules, lists, emphasis variants and whitelisted tags', () => {
    const text = [
      '# Title',
      '## Chapter',
      'A **bold**, *italic*, ***both*** and ~~gone~~ line with <u>under</u> and `code`.',
      '> quoted *words*',
      '1. one',
      '2. <u>two</u>',
      '---',
      '**The End** <script>alert(1)</script>',
    ].join('\n')
    const html = renderToStaticMarkup(<Markdown text={text} />)
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<h2>Chapter</h2>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<strong><em>both</em></strong>')
    expect(html).toContain('<s>gone</s>')
    expect(html).toContain('<u>under</u>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<em>words</em>')
    expect(html).toContain('<ol><li>one</li><li><u>two</u></li></ol>')
    expect(html).toContain('<hr/>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('strips markers for the clipboard', () => {
    expect(plainText('## T\n> q\n***x*** <u>y</u> ~~z~~\n---\n- a')).toBe('T\nq\nx y z\n\n• a')
  })
})
