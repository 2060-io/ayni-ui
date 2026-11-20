/**
 * The reducer, history and runs under profile 3.4: a confirmation card and an approval card follow
 * `ayni.approval.update` in place (PROF-TOOL-008, PROF-TOOL-012); `ayni.space.tools.changed` is a signal, not a
 * message (PROF-TOOL-006); history's `metadata.sources` (PROF-TOOL-010); a decision run says how it ended
 * (PROF-TOOL-008).
 */
import { describe, expect, it } from 'vitest'
import { clientDescription } from '../src/index.js'
import { runEvents } from '../src/queue.js'
import { emptyTranscript, mergeHistory, reduce, toTranscriptMessage, withUsageFrom } from '../src/reducer.js'
import { withAllowanceEnded, withDecided } from '../src/tools.js'
import type { SessionRecord, Transcript, TranscriptMessage } from '../src/types.js'

const session: SessionRecord = {
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
}
const at = (n: number) => `2026-11-20T10:${String(n).padStart(2, '0')}:00.000Z`
const transcriptOf = (messages: TranscriptMessage[]): Transcript => ({ ...emptyTranscript('s1'), messages })
const card = (over: Record<string, unknown> = {}): TranscriptMessage => ({
  id: 'act_1',
  role: 'activity',
  activityType: 'ayni.approval',
  content: {
    approvalId: 'apr_1',
    kind: 'confirmation',
    status: 'PENDING',
    action: { title: 'Add a note', source: { id: 'relaticle', title: 'Relaticle CRM' }, account: { kind: 'none' } },
    allowForConversation: true,
    ...over,
  },
  at: at(2),
})
const custom = (name: string, value: object) => ({ type: 'CUSTOM', name, value })
const contentOf = (t: Transcript, id = 'act_1') =>
  (t.messages.find((m) => m.id === id) as { content: Record<string, unknown> }).content

describe('a card follows its approval where it is (PROF-TOOL-008, PROF-TOOL-012, UI-APPR-002)', () => {
  const held = transcriptOf([
    { id: 'u1', role: 'user', content: 'Add a note to Acme', at: at(1) },
    card(),
    { id: 'a1', role: 'assistant', content: 'Done.', at: at(3) },
  ])

  it('takes the status and the scope of an allow, in its place and at its time', () => {
    const { transcript, signals } = reduce(
      held,
      session,
      custom('ayni.approval.update', { approvalId: 'apr_1', status: 'APPROVED', scope: 'conversation' }),
      false,
      true
    )
    expect(contentOf(transcript)).toMatchObject({ status: 'APPROVED', scope: 'conversation' })
    expect(transcript.messages.map((m) => m.id)).toEqual(['u1', 'act_1', 'a1'])
    expect(transcript.messages[1].at).toBe(at(2))
    expect(signals).toContain('approval')
  })

  it('takes the end of an allowance from another device', () => {
    const allowed = reduce(
      held,
      session,
      custom('ayni.approval.update', { approvalId: 'apr_1', status: 'APPROVED', scope: 'conversation' }),
      false,
      true
    ).transcript
    const ended = reduce(
      allowed,
      session,
      custom('ayni.approval.update', { approvalId: 'apr_1', status: 'APPROVED', allowanceEnded: true }),
      false,
      true
    ).transcript
    expect(contentOf(ended)).toMatchObject({ status: 'APPROVED', scope: 'conversation', allowanceEnded: true })
  })

  it('never goes back to waiting once decided, and leaves other cards as they are', () => {
    const refused = reduce(
      held,
      session,
      custom('ayni.approval.update', { approvalId: 'apr_1', status: 'REJECTED' }),
      false,
      true
    )
    const back = reduce(
      refused.transcript,
      session,
      custom('ayni.approval.update', { approvalId: 'apr_1', status: 'PENDING' }),
      false,
      true
    )
    expect(contentOf(back.transcript).status).toBe('REJECTED')
    const other = reduce(
      held,
      session,
      custom('ayni.approval.update', { approvalId: 'apr_9', status: 'EXPIRED' }),
      false,
      true
    )
    expect(other.transcript).toBe(held)
  })

  it('an approval of someone else follows its update too, with who decided', () => {
    const approval = transcriptOf([card({ kind: 'sensitivity', approvalId: 'apr_2' })])
    const { transcript } = reduce(
      approval,
      session,
      custom('ayni.approval.update', { approvalId: 'apr_2', status: 'APPROVED', decidedBy: 'Jonas Weber' }),
      false,
      true
    )
    expect(contentOf(transcript)).toMatchObject({ status: 'APPROVED', decidedBy: 'Jonas Weber' })
  })

  it('a card replaced by its activity keeps its place in the reply', () => {
    const { transcript } = reduce(
      held,
      session,
      {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'act_1',
        activityType: 'ayni.approval',
        content: { ...card().content, status: 'EXPIRED' } as never,
      },
      false,
      true
    )
    expect(transcript.messages.map((m) => m.id)).toEqual(['u1', 'act_1', 'a1'])
    expect(transcript.messages[1].at).toBe(at(2))
    expect(contentOf(transcript).status).toBe('EXPIRED')
  })

  it('takes the status a decision run answered only while the card still waits', () => {
    expect(contentOf(withDecided(held, 'apr_1', 'APPROVED')).status).toBe('APPROVED')
    const refused = withDecided(held, 'apr_1', 'REJECTED')
    // an update that came first said more: it stays
    expect(withDecided(refused, 'apr_1', 'APPROVED')).toBe(refused)
    expect(contentOf(withAllowanceEnded(held, 'apr_1')).allowanceEnded).toBe(true)
  })
})

describe("a change of a space's tools is a signal, not a message (PROF-TOOL-006)", () => {
  it('signals `tools` and changes no transcript', () => {
    const held = transcriptOf([{ id: 'u1', role: 'user', content: 'hi', at: at(1) }])
    const { transcript, signals } = reduce(
      held,
      session,
      custom('ayni.space.tools.changed', {
        spaceId: 'spc_sales',
        source: 'relaticle',
        state: 'ready',
        changeId: 'chg_1',
        outcome: 'applied',
      }),
      false,
      true
    )
    expect(signals).toEqual(['tools'])
    expect(transcript).toBe(held)
  })
})

describe('the sources a reply used, in history (PROF-TOOL-010, UI-CONV-047)', () => {
  const h = (id: string, role: string, n: number, meta: Record<string, unknown> = {}) => ({
    id,
    role,
    content: id,
    metadata: { createdAt: at(n), ...meta },
  })
  const crm = { source: 'relaticle', title: 'Relaticle CRM', account: 'space' }

  it('a reply read from history carries its sources, or none', () => {
    expect(toTranscriptMessage(h('a1', 'assistant', 1, { sources: [crm] }))).toMatchObject({ sources: [crm] })
    expect(toTranscriptMessage(h('a2', 'assistant', 2))).toMatchObject({ sources: [] })
    expect('sources' in toTranscriptMessage(h('u1', 'user', 3))).toBe(false)
  })

  it('a reply received live has none until history is read; then it takes them', () => {
    const live = transcriptOf([{ id: 'a1', role: 'assistant', content: 'a1', at: at(1) }])
    expect((live.messages[0] as { sources?: unknown }).sources).toBeUndefined()
    const page = [h('a1', 'assistant', 1, { sources: [crm] })]
    expect(withUsageFrom(live.messages, page)[0]).toMatchObject({ sources: [crm] })
    expect(mergeHistory(live, page, null).messages[0]).toMatchObject({ sources: [crm] })
    // read back, a reply that used no tool says so
    expect(withUsageFrom(live.messages, [h('a1', 'assistant', 1)])[0]).toMatchObject({ sources: [] })
  })
})

describe('a decision run (PROF-TOOL-008)', () => {
  it('gets no turn, gives the transcript nothing, and says the status the agent holds', () => {
    const forwarded: unknown[] = []
    const events = runEvents((e) => forwarded.push(e))
    events.onEvent({ type: 'RUN_STARTED', runId: 'r', noTurn: 'decision' } as never)
    events.onEvent({
      type: 'RUN_FINISHED',
      runId: 'r',
      outcome: { type: 'decision', approvalId: 'apr_1', status: 'APPROVED' },
    } as never)
    expect(forwarded).toEqual([])
    expect(events.end()).toEqual({ noTurn: 'decision', approvalId: 'apr_1', status: 'APPROVED' })
  })
})

describe('session creation says which profile this client implements (PROF-SESS-016, UI-SESS-018)', () => {
  it('sends `profileVersion: "3.4"` under `client`, to every agent', () => {
    expect(clientDescription('3.4', 'Firefox on Linux')).toEqual({
      name: 'ayni-ui',
      version: '3.4.0',
      platform: 'web',
      description: 'Firefox on Linux',
      profileVersion: '3.4',
    })
    expect(clientDescription('3.0', 'Firefox on Linux')).toMatchObject({
      platform: 'Firefox on Linux',
      profileVersion: '3.4',
    })
  })
})
