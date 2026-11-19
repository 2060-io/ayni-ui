/**
 * The reducer and history under profile 3.3: the conversation's space in its state (PROF-STREAM-009), the line of a
 * memory the agent changed (PROF-STREAM-010, PROF-HIST-012), what a reply used (PROF-HIST-011), and the transcript
 * letting go of what history no longer returns (UI-CONV-037).
 */
import { describe, expect, it } from 'vitest'
import { catchUp, emptyTranscript, mergeHistory, reduce, toTranscriptMessage, withUsageFrom } from '../src/reducer.js'
import type { SessionRecord, Transcript, TranscriptMessage } from '../src/types.js'

const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  sessionId: 's1',
  agentDid: 'did:x',
  sessionToken: 't',
  title: '',
  createdAt: '',
  state: 'bound',
  lastEventId: 0,
  unreadCount: 0,
  lastPreview: '',
  lastMessageAt: '',
  draft: '',
  ayni: null,
  conversationId: 'c1',
  ...over,
})
const at = (n: number) => `2026-11-18T10:${String(n).padStart(2, '0')}:00.000Z`
const transcriptOf = (messages: TranscriptMessage[]): Transcript => ({ ...emptyTranscript('s1'), messages })
const user = (id: string, n: number): TranscriptMessage => ({ id, role: 'user', content: id, at: at(n) })
const agent = (id: string, n: number): TranscriptMessage => ({ id, role: 'assistant', content: id, at: at(n) })
const h = (id: string, role: string, n: number, meta: Record<string, unknown> = {}) => ({
  id,
  role,
  content: id,
  metadata: { createdAt: at(n), ...meta },
})

describe("the conversation's space in its state (PROF-STREAM-009)", () => {
  it('takes the space from the first snapshot, and follows a change', () => {
    const snapshot = reduce(
      emptyTranscript('s1'),
      session(),
      {
        type: 'STATE_SNAPSHOT',
        snapshot: {
          ayni: {
            contextualMenu: { items: [] },
            pendingApprovals: 0,
            generating: [],
            space: { id: 'spc_personal', title: 'Personal', kind: 'personal' },
          },
        },
      },
      false,
      true
    )
    expect(snapshot.session.spaceId).toBe('spc_personal')
    const moved = reduce(
      snapshot.transcript,
      snapshot.session,
      {
        type: 'STATE_DELTA',
        delta: [
          { op: 'replace', path: '/ayni/space', value: { id: 'spc_truck14', title: 'Truck 14 recall', kind: 'team' } },
        ],
      },
      false,
      true
    )
    expect(moved.session.spaceId).toBe('spc_truck14')
    expect((moved.session.ayni as { space?: { title: string } }).space?.title).toBe('Truck 14 recall')
  })
})

describe('a memory the agent changed (UI-CONV-035)', () => {
  const event = (value: Record<string, unknown>) => ({ type: 'CUSTOM', name: 'ayni.memory.updated', value })
  const value = { conversationId: 'c1', entryId: 'ent_1', memoryId: 'mem_1', spaceId: 'spc_1', action: 'changed' }

  it('adds the line under its entry id, once', () => {
    const first = reduce(transcriptOf([user('u1', 1), agent('a1', 2)]), session(), event(value), false, true)
    expect(first.transcript.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'ent_1'])
    expect(first.transcript.messages[2]).toMatchObject({
      role: 'activity',
      activityType: 'ayni.memory-update',
      content: { memoryId: 'mem_1', spaceId: 'spc_1', action: 'changed' },
    })
    const again = reduce(first.transcript, session(), event(value), false, true)
    expect(again.transcript.messages).toHaveLength(3)
  })

  it('ignores the change of another conversation', () => {
    const other = reduce(transcriptOf([]), session(), event({ ...value, conversationId: 'c2' }), false, true)
    expect(other.transcript.messages).toEqual([])
  })

  it('history gives the same line, and does not repeat one held live', () => {
    const live = reduce(transcriptOf([user('u1', 1), agent('a1', 2)]), session(), event(value), false, true).transcript
    const merged = mergeHistory(
      live,
      [
        h('u1', 'user', 1),
        h('a1', 'assistant', 2),
        {
          id: 'ent_1',
          role: 'activity',
          activityType: 'ayni.memory-update',
          content: { memoryId: 'mem_1', spaceId: 'spc_1', action: 'changed' },
          metadata: { createdAt: at(3), entryId: 'ent_1' },
        },
      ],
      null
    )
    expect(merged.messages.filter((m) => m.role === 'activity')).toHaveLength(1)
  })
})

describe('what a reply used (PROF-HIST-011, UI-CONV-034)', () => {
  it('history gives it on the agent messages only', () => {
    const reply = toTranscriptMessage(
      h('a1', 'assistant', 1, { usedMemories: ['mem_1', 'mem_2'], usedPreferences: ['style'] })
    )
    expect(reply).toMatchObject({ usedMemories: ['mem_1', 'mem_2'], usedPreferences: ['style'] })
    const empty = toTranscriptMessage(h('a2', 'assistant', 1, { usedMemories: [], usedPreferences: [] }))
    expect(empty).toMatchObject({ usedMemories: [], usedPreferences: [] })
    expect(toTranscriptMessage(h('a3', 'assistant', 1))).not.toHaveProperty('usedMemories')
    expect(toTranscriptMessage(h('u1', 'user', 1, { usedMemories: ['x'] }))).not.toHaveProperty('usedMemories')
  })

  it('a reply received live takes it when history is read', () => {
    const page = [h('a1', 'assistant', 2, { usedMemories: ['mem_1'], usedPreferences: [] })]
    const merged = mergeHistory(transcriptOf([user('u1', 1), agent('a1', 2)]), page, 'cursor')
    expect(merged.messages[1]).toMatchObject({ id: 'a1', usedMemories: ['mem_1'], usedPreferences: [] })
    const enriched = withUsageFrom([agent('a1', 2), agent('a9', 3)], page)
    expect(enriched[0]).toMatchObject({ usedMemories: ['mem_1'] })
    expect(enriched[1]).not.toHaveProperty('usedMemories')
  })
})

describe('what history no longer returns leaves the transcript (UI-CONV-037)', () => {
  const held = transcriptOf([
    user('u1', 1),
    agent('a1', 2),
    user('u2', 3),
    agent('a2', 4),
    user('u3', 5),
    agent('a3', 6),
  ])
  const read = { newest: true, readAt: '2026-11-18T11:00:00.000Z' }

  it('a message and its reply deleted while the browser was away leave it', () => {
    const page = [h('u1', 'user', 1), h('a1', 'assistant', 2), h('u3', 'user', 5), h('a3', 'assistant', 6)]
    const merged = mergeHistory(held, page, null, read)
    expect(merged.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u3', 'a3'])
  })

  it('takes nothing without being asked to, as before', () => {
    const page = [h('u1', 'user', 1), h('a1', 'assistant', 2)]
    expect(mergeHistory(held, page, null).messages).toHaveLength(6)
  })

  it('keeps what the period of the page does not cover: before its oldest message, after it was read', () => {
    // the newest page starts at u2: u1 and a1 are older than it, and stay
    const page = [h('u2', 'user', 3), h('u3', 'user', 5), h('a3', 'assistant', 6)]
    const merged = mergeHistory(held, page, 'cursor', read)
    expect(merged.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'u3', 'a3'])
    // a reply that arrived after the read was sent is newer than the page
    const late = transcriptOf([...held.messages, { ...agent('a4', 0), at: '2026-11-18T11:00:05.000Z' }])
    const kept = mergeHistory(late, [h('u1', 'user', 1), h('a1', 'assistant', 2)], null, read)
    expect(kept.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'a4'])
  })

  it('keeps a message still on its way, and what the caller still sends', () => {
    const t = transcriptOf([
      user('u1', 1),
      { ...user('u_run9', 2), queued: true },
      { ...agent('a_streaming', 3), streaming: true },
      user('u_run10', 4),
    ])
    const merged = mergeHistory(t, [h('u1', 'user', 1)], null, { ...read, keep: (m) => m.id === 'u_run10' })
    expect(merged.messages.map((m) => m.id)).toEqual(['u1', 'u_run9', 'a_streaming', 'u_run10'])
  })

  it('keeps the cards: a deletion never takes them', () => {
    const t = transcriptOf([
      user('u1', 1),
      { id: 'flow_1', role: 'activity', activityType: 'ayni.flow', content: {}, at: at(2) },
      { id: 'ent_9', role: 'activity', activityType: 'ayni.memory-update', content: {}, at: at(3), entryId: 'ent_9' },
      {
        id: 'att_9',
        role: 'activity',
        activityType: 'ayni.attachment',
        content: { role: 'user' },
        at: at(4),
        entryId: 'e9',
      },
    ])
    const merged = mergeHistory(t, [h('u1', 'user', 1)], null, read)
    expect(merged.messages.map((m) => m.id)).toEqual(['u1', 'flow_1'])
  })

  it('a message this browser sent, recalled by history under the agent id, stays', () => {
    const t = transcriptOf([user('u1', 1), user('u_run1', 2)])
    const merged = mergeHistory(t, [h('u1', 'user', 1), h('msg_7', 'user', 2, { externalId: 'u_run1' })], null, read)
    expect(merged.messages.map((m) => m.id)).toEqual(['u1', 'msg_7'])
  })

  it('an older page takes only between its first and its last message', () => {
    const page = [h('u2', 'user', 3), h('u3', 'user', 5)]
    const merged = mergeHistory(held, page, 'cursor', { readAt: read.readAt })
    // a2 lies between them and was not returned; a1 before and a3 after are outside the page
    expect(merged.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'u3', 'a3'])
  })

  it('the period of the page is in the agent times: what is older than its oldest message stays', () => {
    // the newest page starts after everything held: what is held is older, and stays
    expect(mergeHistory(held, [h('x', 'user', 9)], 'cursor', read).messages).toHaveLength(7)
    // a newest page that starts before what is held, and returns none of it: all of it was deleted
    expect(mergeHistory(held, [h('x', 'user', 0)], 'cursor', read).messages.map((m) => m.id)).toEqual(['x'])
    // the whole conversation, empty: nothing of it is left
    expect(mergeHistory(held, [], null, read).messages).toEqual([])
  })

  it('a message received live takes the agent time when history names it', () => {
    const live = transcriptOf([{ ...user('u1', 1), at: '2026-11-18T10:31:00.000Z' }])
    const merged = mergeHistory(live, [h('u1', 'user', 1)], null, read)
    expect(merged.messages[0].at).toBe(at(1))
    // without the option, the time held stays
    expect(mergeHistory(live, [h('u1', 'user', 1)], null).messages[0].at).toBe('2026-11-18T10:31:00.000Z')
  })

  it('a catch-up lets go of what its pages no longer return', () => {
    const merged = catchUp(
      held,
      [
        {
          messages: [h('u1', 'user', 1), h('a1', 'assistant', 2), h('u3', 'user', 5), h('a3', 'assistant', 6)],
          nextBefore: null,
        },
      ],
      { readAt: read.readAt }
    )
    expect(merged.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u3', 'a3'])
    // and without the option, nothing leaves
    const kept = catchUp(held, [{ messages: [h('u1', 'user', 1), h('a1', 'assistant', 2)], nextBefore: null }])
    expect(kept.messages).toHaveLength(6)
  })
})
