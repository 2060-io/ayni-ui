import { describe, expect, it } from 'vitest'
import { contextFigureOf, contextLineOf, emptyTranscript, formatTokens, reduce } from '../src/index.js'
import type { SessionRecord } from '../src/types.js'

describe('the context line under the message form (UI-CONV-026, APP-CONV-028)', () => {
  it('writes a number of tokens as it is, in thousands, then in millions', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(6214)).toBe('6.2k')
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(1050)).toBe('1.1k')
    expect(formatTokens(100000)).toBe('100k')
    expect(formatTokens(999_950)).toBe('1M')
    expect(formatTokens(1_234_567)).toBe('1.2M')
    // never "2.0k"
    expect(formatTokens(2000)).toBe('2k')
  })

  it('gives the cached part only when some of the context was served from the cache', () => {
    expect(contextLineOf({ used: 6214, cached: 4096, max: 100000, at: '' })).toEqual({
      used: '6.2k',
      max: '100k',
      cached: '4.1k',
    })
    expect(contextLineOf({ used: 6214, cached: 0, max: 100000, at: '' })).toEqual({ used: '6.2k', max: '100k' })
  })

  it('reads the figure from the agent state, and nothing before the first one or from a malformed one', () => {
    const at = '2026-11-18T05:15:36.247Z'
    expect(contextFigureOf({ context: { used: 6214, cached: 4096, max: 100000, at } })).toEqual({
      used: 6214,
      cached: 4096,
      max: 100000,
      at,
    })
    expect(contextFigureOf(null)).toBeNull()
    expect(contextFigureOf(undefined)).toBeNull()
    expect(contextFigureOf({ pendingApprovals: 0 })).toBeNull()
    expect(contextFigureOf({ context: null })).toBeNull()
    expect(contextFigureOf({ context: { used: '6214', cached: 0, max: 100000, at } })).toBeNull()
    expect(contextFigureOf({ context: { used: 6214, max: 100000, at } })).toBeNull()
    expect(contextFigureOf({ context: { used: 6214, cached: 0, max: Number.POSITIVE_INFINITY, at } })).toBeNull()
    expect(contextFigureOf({ context: { used: Number.NaN, cached: 0, max: 100000, at } })).toBeNull()
  })

  it('follows the figure the agent publishes in its state, by snapshot and by delta', () => {
    const session: SessionRecord = {
      sessionId: 's1',
      agentDid: 'did:x',
      sessionToken: 't',
      title: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      state: 'bound',
      lastEventId: 0,
      unreadCount: 0,
      lastPreview: '',
      lastMessageAt: '',
      draft: '',
      ayni: null,
    }
    const at = '2026-11-18T05:15:36.247Z'
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      session,
      { type: 'STATE_SNAPSHOT', snapshot: { ayni: { pendingApprovals: 0 } } },
      false,
      true
    )
    expect(contextFigureOf(s.ayni)).toBeNull()
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'STATE_SNAPSHOT', snapshot: { ayni: { context: { used: 6214, cached: 4096, max: 100000, at } } } },
      false,
      true
    ))
    expect(contextFigureOf(s.ayni)).toEqual({ used: 6214, cached: 4096, max: 100000, at })
    ;({ session: s } = reduce(
      t,
      s,
      { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/ayni/context/used', value: 7300 }] },
      false,
      true
    ))
    expect(contextFigureOf(s.ayni)?.used).toBe(7300)
  })
})
