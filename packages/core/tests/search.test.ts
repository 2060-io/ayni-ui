import { describe, expect, it } from 'vitest'
import { countOccurrences, excerpt, findOccurrences } from '../src/index.js'

describe('occurrence search (UI-CONV-020, UI-SHELL-015)', () => {
  it('counts every hit, case-insensitively, in transcript order, skipping activities', () => {
    const messages = [
      { id: 'a', role: 'assistant' as const, content: 'Invoice INV-2093 and invoice INV-2094.', at: '1' },
      { id: 'x', role: 'activity' as const, activityType: 'hologram.menu', content: { prompt: 'invoice' }, at: '2' },
      { id: 'u', role: 'user' as const, content: 'Refund the second invoice.', at: '3' },
    ]
    expect(countOccurrences(messages[0].content, 'invoice')).toBe(2)
    expect(findOccurrences(messages, 'INVOICE')).toEqual([
      { messageId: 'a', ordinal: 0 },
      { messageId: 'a', ordinal: 1 },
      { messageId: 'u', ordinal: 0 },
    ])
    expect(findOccurrences(messages, '  ')).toEqual([])
  })

  it('builds an excerpt around the first hit', () => {
    expect(excerpt('Refund the second invoice today.', 'invoice', 5, 3)).toBe('…cond invoice to')
    expect(excerpt('nothing here', 'invoice')).toBeUndefined()
  })
})
