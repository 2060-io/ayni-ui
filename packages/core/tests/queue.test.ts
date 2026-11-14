/**
 * Sending while the agent answers (UI-CONV-025, PROF-RUN-011/012/013): what the shared rules read of the queue,
 * and how a run that gets no turn of its own is kept away from the transcript.
 */
import { describe, expect, it } from 'vitest'
import { ProfileClient } from '../src/profileClient.js'
import { noTurnOf, runEvents, takesQueue, waitingMessageId, waitingOf, waitingViews } from '../src/queue.js'
import type { AgUiEvent, TranscriptMessage } from '../src/types.js'

const at = '2026-11-14T10:00:00.000Z'
const user = (id: string, content: string): TranscriptMessage => ({ id, role: 'user', content, at })

describe('what an agent says of its queue', () => {
  it('takes a message during a run only when it declares so', () => {
    expect(takesQueue({ queue: true })).toBe(true)
    expect(takesQueue({})).toBe(false)
    expect(takesQueue({ queue: 'yes' })).toBe(false)
    expect(takesQueue(undefined)).toBe(false)
  })

  it('reads what waits from the state, and nothing from a state without it', () => {
    const waiting = [{ runId: 'r2', sessionId: 's1', messageId: 'u_r2', text: 'second', attachments: 0, at }]
    expect(waitingOf({ waiting })).toEqual(waiting)
    expect(waitingOf({})).toEqual([])
    expect(waitingOf(null)).toEqual([])
    expect(waitingOf({ waiting: [null, 'x', { text: 'no session' }] })).toEqual([])
  })

  it('names a waiting message as the device that sent it does', () => {
    expect(waitingMessageId({ messageId: 'u_abc', runId: 'abc' })).toBe('u_abc')
    expect(waitingMessageId({ runId: 'abc' })).toBe('u_abc')
    expect(waitingMessageId({})).toBeUndefined()
  })
})

describe('what waits, in the transcript', () => {
  const messages = [
    user('u_r1', 'first'),
    { id: 'm1', role: 'assistant', content: 'answering', at } as TranscriptMessage,
    user('u_r2', 'second'),
  ]

  it('marks the message this device sent, and may withdraw it', () => {
    const views = waitingViews(
      messages,
      [{ runId: 'r2', sessionId: 's1', messageId: 'u_r2', text: 'second', attachments: 0, at }],
      's1'
    )
    expect([...views.marked.keys()]).toEqual(['u_r2'])
    expect(views.marked.get('u_r2')).toMatchObject({ runId: 'r2', own: true })
    expect(views.added).toEqual([])
  })

  it('adds a bubble for a message sent from another device, which it cannot withdraw', () => {
    const views = waitingViews(
      messages.slice(0, 2),
      [
        { runId: 'r7', sessionId: 's2', messageId: 'u_r7', text: 'from the phone', attachments: 0, at },
        { runId: 'r8', sessionId: 's2', messageId: 'u_r8', text: '', attachments: 1, at },
      ],
      's1'
    )
    expect(views.marked.size).toBe(0)
    // the one with words shows; attachments alone, which this device does not hold, do not
    expect(views.added).toEqual([{ message: user('u_r7', 'from the phone'), runId: 'r7', own: false }])
  })
})

describe('a run that gets no turn of its own', () => {
  const started = (extra: Record<string, unknown> = {}): AgUiEvent => ({
    type: 'RUN_STARTED',
    threadId: 's1',
    runId: 'r2',
    ...extra,
  })

  it('is known by its first event', () => {
    expect(noTurnOf(started({ noTurn: 'merged', mergedInto: 'r3' }))).toBe('merged')
    expect(noTurnOf(started({ noTurn: 'withdrawn' }))).toBe('withdrawn')
    expect(noTurnOf(started({ noTurn: 'refused' }))).toBe('refused')
    expect(noTurnOf(started())).toBeUndefined()
    expect(noTurnOf(started({ noTurn: 'something else' }))).toBeUndefined()
    expect(noTurnOf({ type: 'RUN_FINISHED', noTurn: 'merged' })).toBeUndefined()
  })

  it('gives the transcript none of its events, and says how it ended', () => {
    const seen: AgUiEvent[] = []
    const merged = runEvents<AgUiEvent>((e) => seen.push(e))
    merged.onEvent(started({ noTurn: 'merged', mergedInto: 'r3' }))
    merged.onEvent({ type: 'RUN_FINISHED', threadId: 's1', runId: 'r2', outcome: { type: 'merged', runId: 'r3' } })
    expect(seen).toEqual([])
    expect(merged.end()).toEqual({ noTurn: 'merged', mergedInto: 'r3' })

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
          started({ noTurn: 'merged', mergedInto: 'r3' }),
          { type: 'RUN_FINISHED', threadId: 's1', runId: 'r2', outcome: { type: 'merged', runId: 'r3' } },
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
    expect(end).toEqual({ noTurn: 'merged', mergedInto: 'r3' })
  })
})
