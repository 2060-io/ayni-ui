/**
 * Sending while the agent answers (UI-CONV-025, PROF-RUN-011/012/013): what the shared rules read of the queue,
 * and how a run that gets no turn is kept away from the transcript.
 */
import { describe, expect, it } from 'vitest'
import { ProfileClient } from '../src/profileClient.js'
import { noTurnOf, runEvents, taken, takesQueue, waitingOf, waitingViews, withoutOrphans } from '../src/queue.js'
import type { AgUiEvent, TranscriptMessage } from '../src/types.js'

const at = '2026-11-14T10:00:00.000Z'
const user = (id: string, content: string): TranscriptMessage => ({ id, role: 'user', content, at })
const waits = (id: string, messageId: string, text: string, sessionId = 's1') => ({
  id,
  sessionId,
  messageId,
  text,
  attachments: 0,
  at,
})

describe('what an agent says of its queue', () => {
  it('takes a message during a run only when it declares so', () => {
    expect(takesQueue({ queue: true })).toBe(true)
    expect(takesQueue({})).toBe(false)
    expect(takesQueue({ queue: 'yes' })).toBe(false)
    expect(takesQueue(undefined)).toBe(false)
  })

  it('reads what waits from the state, and nothing from a state without it', () => {
    const waiting = [waits('msg_2', 'u_r2', 'second')]
    expect(waitingOf({ waiting })).toEqual(waiting)
    expect(waitingOf({})).toEqual([])
    expect(waitingOf(null)).toEqual([])
    expect(waitingOf({ waiting: [null, 'x', { text: 'no id' }] })).toEqual([])
  })
})

describe('what waits, in the transcript', () => {
  const answering = { id: 'm1', role: 'assistant', content: 'answering', at } as TranscriptMessage

  it('marks the message this device sent, under the id it gave it', () => {
    const views = waitingViews(
      [user('u_r1', 'first'), answering, user('u_r2', 'second')],
      [waits('msg_2', 'u_r2', 'second')]
    )
    expect([...views.marked]).toEqual(['u_r2'])
    expect(views.added).toEqual([])
  })

  it('marks a message read from history, under the id of the agent', () => {
    // after a reload the device holds the message as history gives it
    const views = waitingViews(
      [user('msg_1', 'first'), answering, user('msg_2', 'second')],
      [waits('msg_2', 'u_r2', 'second')]
    )
    expect([...views.marked]).toEqual(['msg_2'])
    expect(views.added).toEqual([])
  })

  it('adds a bubble for a message sent from another device and not held yet', () => {
    const views = waitingViews(
      [user('u_r1', 'first'), answering],
      [waits('msg_7', 'u_r7', 'from the phone', 's2'), { ...waits('msg_8', 'u_r8', '', 's2'), attachments: 1 }]
    )
    expect(views.marked.size).toBe(0)
    // the one with words shows; attachments alone, which this device does not hold, do not
    expect(views.added).toEqual([user('msg_7', 'from the phone')])
  })
})

describe('a run that gets no turn', () => {
  const started = (extra: Record<string, unknown> = {}): AgUiEvent => ({
    type: 'RUN_STARTED',
    threadId: 's1',
    runId: 'r2',
    ...extra,
  })

  it('is known by its first event', () => {
    expect(noTurnOf(started({ noTurn: 'waiting' }))).toBe('waiting')
    expect(noTurnOf(started({ noTurn: 'refused' }))).toBe('refused')
    expect(noTurnOf(started({ noTurn: 'withdrawn' }))).toBe('withdrawn')
    expect(noTurnOf(started())).toBeUndefined()
    expect(noTurnOf(started({ noTurn: 'something else' }))).toBeUndefined()
    expect(noTurnOf({ type: 'RUN_FINISHED', noTurn: 'waiting' })).toBeUndefined()
  })

  it('gives the transcript none of its events, and says how it ended', () => {
    const seen: AgUiEvent[] = []
    const waiting = runEvents<AgUiEvent>((e) => seen.push(e))
    waiting.onEvent(started({ noTurn: 'waiting' }))
    waiting.onEvent({
      type: 'RUN_FINISHED',
      threadId: 's1',
      runId: 'r2',
      outcome: { type: 'waiting', messageId: 'msg_2' },
    })
    expect(seen).toEqual([])
    expect(waiting.end()).toEqual({ noTurn: 'waiting', messageId: 'msg_2' })

    const refused = runEvents<AgUiEvent>((e) => seen.push(e))
    refused.onEvent(started({ noTurn: 'refused' }))
    refused.onEvent({ type: 'RUN_ERROR', message: 'too many', code: 'too-many-waiting' })
    expect(seen).toEqual([])
    expect(refused.end()).toEqual({ noTurn: 'refused', code: 'too-many-waiting' })
  })

  it('leaves a run that has its turn as it is', () => {
    const seen: AgUiEvent[] = []
    const run = runEvents<AgUiEvent>((e) => seen.push(e))
    const events: AgUiEvent[] = [
      started(),
      { type: 'TEXT_MESSAGE_START', messageId: 'm1' },
      { type: 'RUN_ERROR', message: 'cancelled', code: 'cancelled' },
    ]
    for (const e of events) run.onEvent(e)
    expect(seen).toEqual(events)
    expect(run.end()).toEqual({})
  })

  it('reaches the caller of a run as its end, not as events', async () => {
    const sse = (events: AgUiEvent[]) => `: waiting\n\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`
    const fetchFn = (async () =>
      new Response(
        sse([
          started({ noTurn: 'waiting' }),
          { type: 'RUN_FINISHED', threadId: 's1', runId: 'r2', outcome: { type: 'waiting', messageId: 'msg_2' } },
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )) as typeof fetch
    const client = new ProfileClient('https://agent.test/agui/v3/sessions', fetchFn)
    const seen: AgUiEvent[] = []
    const end = await client.run(
      's1',
      'tok',
      { runId: 'r2', text: 'second' },
      (e) => seen.push(e),
      new AbortController().signal
    )
    expect(seen).toEqual([])
    expect(end).toEqual({ noTurn: 'waiting', messageId: 'msg_2' })
  })
})

describe('the body of a run (PROF-RUN-002, PROF-RUN-003)', () => {
  it('carries the new message and the action, and never `resume`: the profile has no interrupts (UI-CONV-008 gone)', async () => {
    let body: Record<string, unknown> = {}
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch
    const client = new ProfileClient('https://agent.test/agui/v3/sessions', fetchFn)
    await client.run(
      's1',
      'tok',
      { runId: 'r1', text: 'hello', resume: [{ interruptId: 'i1', status: 'resolved' }] } as never,
      () => undefined,
      new AbortController().signal
    )
    expect(body.messages).toEqual([{ id: 'u_r1', role: 'user', content: 'hello' }])
    expect(body).not.toHaveProperty('resume')
  })
})

describe('a message sent during a run whose sending failed', () => {
  const held: TranscriptMessage[] = [
    user('u_r1', 'first'),
    { ...user('u_r2', 'sent, page reloaded before the agent answered'), queued: true },
    { ...user('u_r3', 'being sent'), queued: true },
  ]

  it('leaves the transcript, and one still being sent stays', () => {
    expect(withoutOrphans(held, (runId) => runId === 'r3').map((m) => m.id)).toEqual(['u_r1', 'u_r3'])
    expect(withoutOrphans(held, () => false).map((m) => m.id)).toEqual(['u_r1'])
  })

  it('stays once the agent recorded it, whatever happens to the page', () => {
    const after = taken(held, 'u_r2')
    expect(after[1]).toEqual(user('u_r2', 'sent, page reloaded before the agent answered'))
    expect(withoutOrphans(after, () => false).map((m) => m.id)).toEqual(['u_r1', 'u_r2'])
  })
})
