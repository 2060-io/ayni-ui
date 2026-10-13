import { describe, expect, it } from 'vitest'
import { emptyTranscript, mergeHistory, orderAgents, reduce } from '../src/index.js'
import type { SessionRecord } from '../src/types.js'

const session = (): SessionRecord => ({
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
  hologram: null,
})

describe('AG-UI reducer (UI-CONV-002/006/015, UI-SESS-003/006, UI-CAP-001)', () => {
  it('streams text into one message and marks a cancelled run as interrupted', () => {
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      session(),
      { type: 'RUN_STARTED', runId: 'r1' },
      true,
      false
    )
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
      true,
      false
    ))
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello ' },
      true,
      false
    ))
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'there' },
      true,
      false
    ))
    expect(t.run?.runId).toBe('r1')
    expect(t.messages).toHaveLength(1)
    expect(t.messages[0]).toMatchObject({ id: 'm1', role: 'assistant', content: 'Hello there', streaming: true })
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'RUN_ERROR', message: 'cancelled', code: 'cancelled' },
      true,
      false
    ))
    expect(t.run).toBeNull()
    expect(t.messages[0]).toMatchObject({ streaming: false, interrupted: true })
  })

  it('counts unread for background conversations and clears nothing when on screen', () => {
    const r = reduce(emptyTranscript('s1'), session(), { type: 'TEXT_MESSAGE_START', messageId: 'm1' }, false, false)
    const r2 = reduce(
      r.transcript,
      r.session,
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'hi' },
      false,
      false
    )
    const r3 = reduce(r2.transcript, r2.session, { type: 'TEXT_MESSAGE_END', messageId: 'm1' }, false, false)
    expect(r3.session.unreadCount).toBe(1)
    expect(r3.signals).toContain('message')
    const onScreen = reduce(r2.transcript, r2.session, { type: 'TEXT_MESSAGE_END', messageId: 'm1' }, false, true)
    expect(onScreen.session.unreadCount).toBe(0)
  })

  it('replaces a generating placeholder with the late artifact and keeps state under hologram', () => {
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      session(),
      {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'g1',
        activityType: 'hologram.generating',
        content: { entryId: 'e1', kind: 'image' },
      },
      false,
      false
    )
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'a1',
        activityType: 'hologram.attachment',
        content: { attachmentId: 'a1', type: 'image', entryId: 'e1', textRepr: 'a cat' },
      },
      false,
      false
    ))
    expect(t.messages.map((m) => m.id)).toEqual(['a1'])
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      {
        type: 'STATE_SNAPSHOT',
        snapshot: {
          hologram: {
            contextualMenu: { items: [{ id: 'x', label: 'X', badge: 2 }] },
            pendingApprovals: 2,
            generating: [],
            principal: null,
          },
        },
      },
      false,
      false
    ))
    expect(s.hologram?.pendingApprovals).toBe(2)
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/hologram/pendingApprovals', value: 0 }] },
      false,
      false
    ))
    expect(s.hologram?.pendingApprovals).toBe(0)
  })

  it('handles session lifecycle events: bound, token rotation, closure with reason', () => {
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      { ...session(), state: 'provisional' },
      {
        type: 'CUSTOM',
        name: 'hologram.session.bound',
        value: { principal: { displayName: 'Ana', photo: null, backingIdentity: null }, boundAt: 'x' },
      },
      false,
      false
    )
    expect(s.state).toBe('bound')
    expect(s.principal?.displayName).toBe('Ana')
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'CUSTOM', name: 'hologram.session.token', value: { sessionToken: 'new' } },
      false,
      false
    ))
    expect(s.sessionToken).toBe('new')
    const closed = reduce(
      t,
      s,
      { type: 'CUSTOM', name: 'hologram.session.state', value: { state: 'closed', reason: 'supersede' } },
      false,
      false
    )
    expect(closed.session.state).toBe('closed')
    expect(closed.session.closedReason).toBe('supersede')
    expect(closed.session.sessionToken).toBeNull()
    expect(closed.signals).toContain('closed')
    const routed = reduce(
      t,
      s,
      {
        type: 'CUSTOM',
        name: 'hologram.capability.routed',
        value: { kind: 'auth-challenge', challengeType: 'face-match', status: 'pending', originSessionId: 's1' },
      },
      false,
      false
    )
    expect(Object.values(routed.transcript.routed)[0]).toMatchObject({ challengeType: 'face-match', status: 'pending' })
  })

  it('merges history pages without duplicates, oldest first', () => {
    const t = {
      ...emptyTranscript('s1'),
      messages: [{ id: 'm3', role: 'assistant' as const, content: 'c', at: '2026-01-01T00:00:03.000Z' }],
    }
    const merged = mergeHistory(
      t,
      [
        { id: 'm1', role: 'user', content: 'a', metadata: { createdAt: '2026-01-01T00:00:01.000Z' } },
        { id: 'm3', role: 'assistant', content: 'c', metadata: { createdAt: '2026-01-01T00:00:03.000Z' } },
      ],
      null
    )
    expect(merged.messages.map((m) => m.id)).toEqual(['m1', 'm3'])
    expect(merged.complete).toBe(true)
  })
})

describe('rail order (UI-SHELL-011)', () => {
  it('pinned first in manual order, then by recency, then not linked', () => {
    const agents = [
      { did: 'a', pinned: false, pinOrder: 0, lastMessageAt: '2026-01-03' },
      { did: 'b', pinned: true, pinOrder: 2, lastMessageAt: '2026-01-01' },
      { did: 'c', pinned: true, pinOrder: 1, lastMessageAt: '2026-01-02' },
      { did: 'd', pinned: false, pinOrder: 0, lastMessageAt: '2026-01-09' },
      { did: 'e', pinned: false, pinOrder: 0, lastMessageAt: '2026-01-05' },
    ]
    const linked = (a: { did: string }) => a.did !== 'd'
    expect(orderAgents(agents, linked).map((a) => a.did)).toEqual(['c', 'b', 'e', 'a', 'd'])
  })
})

describe('reactions and replies (UI-CONV-011/018/019, PROF-RUN-010, PROF-HIST-006)', () => {
  const react = (t: ReturnType<typeof emptyTranscript>, by: string, emoji: string, action: 'add' | 'remove') =>
    reduce(
      t,
      session(),
      { type: 'CUSTOM', name: 'hologram.reaction', value: { messageId: 'm1', emoji, action, by } },
      false,
      true
    ).transcript

  it('keeps one reaction per person: an add replaces, a remove clears', () => {
    let t = react(emptyTranscript('s1'), 'Ana', '👍', 'add')
    t = react(t, 'Ana', '❤️', 'add')
    t = react(t, 'Agent', '👀', 'add')
    expect(t.reactions.m1).toEqual([
      { emoji: '❤️', by: 'Ana' },
      { emoji: '👀', by: 'Agent' },
    ])
    t = react(t, 'Ana', '❤️', 'remove')
    expect(t.reactions.m1).toEqual([{ emoji: '👀', by: 'Agent' }])
  })

  it('restores reactions and reply quotes from history metadata', () => {
    const page = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Order 4471 has two invoices.',
        metadata: { createdAt: '2026-01-01T00:00:01.000Z', reactions: [{ emoji: '👍', by: 'Ana' }] },
      },
      {
        id: 'u2',
        role: 'user',
        content: 'Refund the duplicate.',
        metadata: {
          createdAt: '2026-01-01T00:00:02.000Z',
          replyTo: { id: 'a1', text: 'Order 4471 has two invoices.', role: 'assistant' },
        },
      },
    ]
    const t = mergeHistory(emptyTranscript('s1'), page, null)
    expect(t.reactions.a1).toEqual([{ emoji: '👍', by: 'Ana' }])
    const reply = t.messages.find((m) => m.id === 'u2')
    expect(reply && reply.role !== 'activity' ? reply.replyTo?.id : undefined).toBe('a1')
    expect(t.complete).toBe(true)
  })

  it('attaches the steps of a run to the reply it produced', () => {
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      session(),
      { type: 'RUN_STARTED', runId: 'r' },
      true,
      true
    )
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'STEP_STARTED', stepName: 'Searching invoices' },
      true,
      true
    ))
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'STEP_FINISHED', stepName: 'Searching invoices' },
      true,
      true
    ))
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'TEXT_MESSAGE_START', messageId: 'a', role: 'assistant' },
      true,
      true
    ))
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Done' },
      true,
      true
    ))
    ;({ transcript: t } = reduce(t, s, { type: 'TEXT_MESSAGE_END', messageId: 'a' }, true, true))
    const m = t.messages.find((x) => x.id === 'a')
    expect(m && m.role !== 'activity' ? m.steps : undefined).toEqual(['Searching invoices'])
    expect(t.run?.log).toEqual([])
  })
})
