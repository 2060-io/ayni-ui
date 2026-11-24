import { describe, expect, it } from 'vitest'
import { emptyTranscript, isAttachmentWithheld, isWithheld, mergeHistory, orderAgents, reduce } from '../src/index.js'
import type { SessionRecord, TranscriptMessage } from '../src/types.js'

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
  ayni: null,
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

  it('replaces a generating placeholder with the late artifact and keeps state under ayni', () => {
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      session(),
      {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'g1',
        activityType: 'ayni.generating',
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
        activityType: 'ayni.attachment',
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
          ayni: {
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
    expect(s.ayni?.pendingApprovals).toBe(2)
    ;({ transcript: t, session: s } = reduce(
      t,
      s,
      { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/ayni/pendingApprovals', value: 0 }] },
      false,
      false
    ))
    expect(s.ayni?.pendingApprovals).toBe(0)
  })

  it('handles session lifecycle events: bound, token rotation, closure with reason', () => {
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      { ...session(), state: 'provisional' },
      {
        type: 'CUSTOM',
        name: 'ayni.session.bound',
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
      { type: 'CUSTOM', name: 'ayni.session.token', value: { sessionToken: 'new' } },
      false,
      false
    ))
    expect(s.sessionToken).toBe('new')
    const closed = reduce(
      t,
      s,
      { type: 'CUSTOM', name: 'ayni.session.state', value: { state: 'closed', reason: 'supersede' } },
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
        name: 'ayni.capability.routed',
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
      { type: 'CUSTOM', name: 'ayni.reaction', value: { messageId: 'm1', emoji, action, by } },
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
  it('a message this device sent comes back from history under the agent id, once (PROF-HIST-006)', () => {
    const local = {
      ...emptyTranscript('s1'),
      messages: [
        { id: 'a1', role: 'assistant' as const, content: 'Earlier', at: '2026-01-01T00:00:01.000Z' },
        { id: 'u_run1', role: 'user' as const, content: 'what is new?', at: '2026-01-01T00:00:02.000Z' },
      ],
      reactions: { u_run1: [{ emoji: '👍', by: 'Agent' }] },
    }
    const merged = mergeHistory(
      local,
      [
        { id: 'a1', role: 'assistant', content: 'Earlier', metadata: { createdAt: '2026-01-01T00:00:01.000Z' } },
        {
          id: 'msg_7',
          role: 'user',
          content: 'what is new?',
          metadata: { createdAt: '2026-01-01T00:00:02.100Z', externalId: 'u_run1' },
        },
        { id: 'a2', role: 'assistant', content: 'Nothing much', metadata: { createdAt: '2026-01-01T00:00:03.000Z' } },
      ],
      null
    )
    expect(merged.messages.map((m) => m.id)).toEqual(['a1', 'msg_7', 'a2'])
    expect(merged.messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(merged.reactions.msg_7).toEqual([{ emoji: '👍', by: 'Agent' }])
    expect(merged.reactions.u_run1).toBeUndefined()
  })
})

describe('flow cards (UI-CONV-021, UI-CAP-005, PROF-MAP-007)', () => {
  const flow = (state: string, extra: Record<string, unknown> = {}) => ({
    type: 'ACTIVITY_SNAPSHOT',
    messageId: 'e-flow',
    activityType: 'ayni.flow',
    content: {
      flowId: 'flow-1',
      kind: 'confirm',
      state,
      title: 'Confirm: Wire 100 EUR',
      openedAt: '2026-01-01T00:00:05.000Z',
      ...extra,
    },
  })

  it('sits at the open time, is replaced in place at the close and retires the routed card of its flow', () => {
    let { transcript: t, session: s } = reduce(
      emptyTranscript('s1'),
      session(),
      {
        type: 'CUSTOM',
        name: 'ayni.capability.routed',
        value: {
          kind: 'auth-challenge',
          challengeType: 'device',
          status: 'pending',
          originSessionId: 's1',
          flowId: 'flow-1',
        },
      },
      false,
      true
    )
    expect(Object.values(t.routed)[0]).toMatchObject({ status: 'pending', flowId: 'flow-1' })
    ;({ transcript: t, session: s } = reduce(t, s, flow('pending'), false, true))
    expect(t.messages).toHaveLength(1)
    expect(t.messages[0]).toMatchObject({ id: 'e-flow', role: 'activity', at: '2026-01-01T00:00:05.000Z' })
    expect(Object.keys(t.routed)).toHaveLength(1) // the phone is still busy: the routed card stays known
    ;({ transcript: t } = reduce(
      t,
      s,
      flow('completed', {
        outcome: 'completed',
        closedAt: '2026-01-01T00:00:09.000Z',
        preview: { confirmed: true, attestation: { method: 'biometric', at: '2026-01-01T00:00:08.000Z' } },
      }),
      false,
      true
    ))
    expect(t.messages).toHaveLength(1) // replaced, not appended
    expect(t.messages[0].at).toBe('2026-01-01T00:00:05.000Z')
    expect((t.messages[0] as { content: Record<string, unknown> }).content).toMatchObject({ state: 'completed' })
    expect(Object.keys(t.routed)).toHaveLength(0) // the flow card took over (UI-CAP-005)
  })

  it('comes back from history at the entry time with its flow id', () => {
    const t = mergeHistory(
      emptyTranscript('s1'),
      [
        {
          id: 'e-flow',
          role: 'activity',
          activityType: 'ayni.flow',
          content: {
            flowId: 'flow-1',
            kind: 'issue',
            state: 'completed',
            title: 'Your badge',
            openedAt: '2026-01-01T00:00:05.000Z',
          },
          metadata: { createdAt: '2026-01-01T00:00:05.000Z', flowId: 'flow-1' },
        },
        { id: 'a2', role: 'assistant', content: 'Done.', metadata: { createdAt: '2026-01-01T00:00:10.000Z' } },
      ],
      null
    )
    expect(t.messages.map((m) => m.id)).toEqual(['e-flow', 'a2'])
  })
})

describe('erased messages (UI-CONV-027, PROF-STREAM-008)', () => {
  const at = (s: number) => `2026-01-01T00:00:0${s}.000Z`
  const held = () => ({
    ...emptyTranscript('s1'),
    messages: [
      { id: 'msg_1', role: 'user' as const, content: 'My door code is 4412.', at: at(1) },
      { id: 'msg_2', role: 'assistant' as const, content: 'Noted.', at: at(2) },
      // a photo of the person: its attachment carries the entry the agent names it by
      {
        id: 'att_1',
        role: 'activity' as const,
        activityType: 'ayni.attachment',
        content: { kind: 'image', entryId: 'msg_3' },
        at: at(3),
        entryId: 'msg_3',
      },
      { id: 'msg_4', role: 'user' as const, content: 'Thanks', at: at(4) },
    ],
    reactions: { msg_1: [{ emoji: '👍', by: 'Agent' }], msg_3: [{ emoji: '❤️', by: 'Agent' }] },
  })
  const erased = (value: unknown, s: SessionRecord = { ...session(), conversationId: 'c1' }) =>
    reduce(held(), s, { type: 'CUSTOM', name: 'ayni.messages.erased', value }, false, true)

  it('removes the named messages from the open transcript, with their reactions', () => {
    const { transcript, session: s, signals } = erased({ conversationId: 'c1', messageIds: ['msg_1'] })
    expect(transcript.messages.map((m) => m.id)).toEqual(['msg_2', 'att_1', 'msg_4'])
    expect(transcript.reactions.msg_1).toBeUndefined()
    expect(transcript.reactions.msg_3).toEqual([{ emoji: '❤️', by: 'Agent' }])
    expect(s.conversationId).toBe('c1')
    expect(signals).toEqual([])
  })

  it('removes a message this browser sent, named by the id it gave it (clientIds)', () => {
    const sent = {
      ...held(),
      messages: [...held().messages, { id: 'u_run-9', role: 'user' as const, content: 'sent from here', at: at(5) }],
    }
    const { transcript } = reduce(
      sent,
      { ...session(), conversationId: 'c1' },
      {
        type: 'CUSTOM',
        name: 'ayni.messages.erased',
        value: { conversationId: 'c1', messageIds: ['msg_9'], clientIds: ['u_run-9'] },
      },
      false,
      true
    )
    expect(transcript.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2', 'att_1', 'msg_4'])
  })

  it('removes a media message named by its entry', () => {
    const { transcript } = erased({ conversationId: 'c1', messageIds: ['msg_3', 'msg_4'] })
    expect(transcript.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2'])
    expect(transcript.reactions.msg_3).toBeUndefined()
  })

  it('leaves the transcript as it is for ids it does not hold, and for another conversation', () => {
    const unknown = erased({ conversationId: 'c1', messageIds: ['msg_9'] })
    expect(unknown.transcript.messages).toHaveLength(4)
    const other = erased({ conversationId: 'c2', messageIds: ['msg_1'] })
    expect(other.transcript.messages).toHaveLength(4)
    expect(erased({ conversationId: 'c1' }).transcript.messages).toHaveLength(4)
  })

  it('applies to a session that does not know its conversation yet', () => {
    const { transcript } = erased({ conversationId: 'c1', messageIds: ['msg_2'] }, session())
    expect(transcript.messages.map((m) => m.id)).toEqual(['msg_1', 'att_1', 'msg_4'])
  })
})

describe('messages of the person the AI never received (UI-CONV-044, D95, PROF-STREAM-011, PROF-HIST-013)', () => {
  const at = (s: number) => `2026-01-01T00:00:0${s}.000Z`
  const held = () => ({
    ...emptyTranscript('s1'),
    messages: [
      { id: 'msg_1', role: 'user' as const, content: 'Send me the badge', at: at(1) },
      { id: 'msg_2', role: 'assistant' as const, content: 'What is your work email?', at: at(2) },
      // typed on this browser: held under the id this browser gave it until history names it
      { id: 'u_run-3', role: 'user' as const, content: 'ana.rios@northwind.example', at: at(3) },
      // written by the service's code
      { id: 'msg_4', role: 'assistant' as const, content: 'A code is on its way.', at: at(4) },
    ],
  })
  const withheld = (value: unknown, s: SessionRecord = { ...session(), conversationId: 'c1' }) =>
    reduce(held(), s, { type: 'CUSTOM', name: 'ayni.messages.withheld', value }, true, true).transcript
  const marked = (t: { messages: TranscriptMessage[] }) => t.messages.filter(isWithheld).map((m) => m.id)

  it('history: metadata.modelVisible false marks a message of the person; absent, the AI received it', () => {
    const t = mergeHistory(
      emptyTranscript('s1'),
      [
        { id: 'msg_1', role: 'user', content: 'Send me the badge', metadata: { createdAt: at(1) } },
        { id: 'msg_3', role: 'user', content: '482913', metadata: { createdAt: at(3), modelVisible: false } },
        { id: 'msg_4', role: 'assistant', content: 'Verified.', metadata: { createdAt: at(4), modelVisible: false } },
      ],
      null
    )
    expect(marked(t)).toEqual(['msg_3'])
    expect(t.messages.find((m) => m.id === 'msg_1')).not.toHaveProperty('modelVisible')
  })

  it('history marks a message already held, the one this browser sent once it takes the agent id', () => {
    const t = mergeHistory(
      held(),
      [
        {
          id: 'msg_3',
          role: 'user',
          content: 'ana.rios@northwind.example',
          metadata: { createdAt: at(3), externalId: 'u_run-3', modelVisible: false },
        },
      ],
      null
    )
    expect(marked(t)).toEqual(['msg_3'])
  })

  it('live: the event marks a bubble already drawn, by the id this browser gave it (clientIds)', () => {
    const t = withheld({ conversationId: 'c1', messageIds: ['msg_3'], clientIds: ['u_run-3'] })
    expect(marked(t)).toEqual(['u_run-3'])
    expect(t.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2', 'u_run-3', 'msg_4'])
  })

  it("live: the event marks a message from another device, by the agent's id (messageIds)", () => {
    expect(marked(withheld({ conversationId: 'c1', messageIds: ['msg_1'] }))).toEqual(['msg_1'])
  })

  it("the agent's messages stay as they are, and so does another conversation's transcript", () => {
    expect(marked(withheld({ conversationId: 'c1', messageIds: ['msg_2', 'msg_4'] }))).toEqual([])
    expect(marked(withheld({ conversationId: 'c2', messageIds: ['msg_1'] }))).toEqual([])
    expect(marked(withheld({ conversationId: 'c1' }))).toEqual([])
    // a session that does not know its conversation yet takes it
    expect(marked(withheld({ conversationId: 'c1', messageIds: ['msg_1'] }, session()))).toEqual(['msg_1'])
  })

  it('a stream that replays the message after a reconnect keeps it marked', () => {
    const t = withheld({ conversationId: 'c1', messageIds: ['msg_1'] })
    const replayed = reduce(
      t,
      { ...session(), conversationId: 'c1' },
      { type: 'TEXT_MESSAGE_START', messageId: 'msg_1', role: 'user' },
      false,
      true
    ).transcript
    expect(marked(replayed)).toEqual(['msg_1'])
  })
})

describe('an attachment the agent held back because it carried a credential (agent D113, PROF-STREAM-011, F11)', () => {
  const at = (s: number) => `2026-01-01T00:00:0${s}.000Z`
  const file = (content: Record<string, unknown> = {}): TranscriptMessage => ({
    id: 'att_1',
    role: 'activity',
    activityType: 'ayni.attachment',
    content: { attachmentId: 'f1', type: 'file', role: 'user', filename: 'contract.pdf', ...content },
    at: at(2),
  })
  const held = () => ({
    ...emptyTranscript('s1'),
    messages: [{ id: 'u1', role: 'user' as const, content: 'Here is the contract', at: at(1) }, file()],
  })
  const withheld = (value: unknown) =>
    reduce(
      held(),
      { ...session(), conversationId: 'c1' },
      { type: 'CUSTOM', name: 'ayni.messages.withheld', value },
      true,
      true
    ).transcript
  const heldBack = (t: { messages: TranscriptMessage[] }) => t.messages.filter(isAttachmentWithheld).map((m) => m.id)

  it('live: named for a credential with no text, the attachment is held back; its words stay as they are', () => {
    const t = withheld({ conversationId: 'c1', messageIds: ['att_1'], reason: 'credential', texts: {} })
    expect(heldBack(t)).toEqual(['att_1'])
    // the message's words are drawn as any other
    expect(t.messages.filter(isWithheld)).toEqual([])
    expect(t.messages[0]).toEqual(held().messages[0])
  })

  it('an email check, or no reason, holds back no attachment', () => {
    expect(heldBack(withheld({ conversationId: 'c1', messageIds: ['att_1'] }))).toEqual([])
    expect(heldBack(withheld({ conversationId: 'c1', messageIds: ['att_1'], reason: 'email-check' }))).toEqual([])
  })

  it('history and the live activity say so on the attachment itself (`withheld: "credential"`, PROF-HIST-014)', () => {
    expect(isAttachmentWithheld(file({ withheld: 'credential' }))).toBe(true)
    expect(isAttachmentWithheld(file())).toBe(false)
    const t = mergeHistory(
      emptyTranscript('s1'),
      [
        {
          id: 'att_9',
          role: 'activity',
          activityType: 'ayni.attachment',
          content: { attachmentId: 'f9', type: 'file', role: 'user', filename: 'keys.txt', withheld: 'credential' },
          metadata: { createdAt: at(3), modelVisible: false, withheld: 'credential' },
        },
      ],
      null
    )
    expect(heldBack(t)).toEqual(['att_9'])
  })
})
