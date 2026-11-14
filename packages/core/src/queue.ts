/**
 * Sending while the agent answers (UI-CONV-025, APP-CONV-023, PROF-RUN-011/012/013). An agent that declares
 * `features.queue` takes a message sent during a turn: it records it, lists it in `state.ayni.waiting` on every
 * device of the person, and answers it when the turn ends, together with whatever else waits, in a run it starts
 * itself on each device's stream. The run that carried the message gets no turn: it says so in its first event and
 * ends at once, and nothing of it reaches the transcript's run.
 */
import type { TranscriptMessage } from './types.js'

/**
 * Why a run gets no turn: its message was recorded and waits, the agent refused it (too many wait), or its caller
 * gave up while an action waited for its turn. Carried by the run's `RunStarted` as `noTurn`.
 */
export type NoTurn = 'waiting' | 'refused' | 'withdrawn'

/** How a run ended, for the client that sent it. Empty for a run that had its turn. */
export interface RunEnd {
  noTurn?: NoTurn
  /** the agent's id for the message that waits */
  messageId?: string
  /** the code of the error that ended a run without a turn */
  code?: string
}

/** A message of the person that waits for the turn in progress of its conversation to end. */
export interface WaitingMessage {
  /** the agent's id for the message: the one history gives it */
  id: string
  /** the session it came through */
  sessionId: string
  /** the id the client gave the message */
  messageId?: string
  text: string
  attachments: number
  at: string
}

/** What a `RunStarted` says of a run that gets no turn; undefined for any other event. */
export function noTurnOf(event: { type?: unknown; noTurn?: unknown }): NoTurn | undefined {
  if (event.type !== 'RUN_STARTED') return undefined
  return event.noTurn === 'waiting' || event.noTurn === 'refused' || event.noTurn === 'withdrawn'
    ? event.noTurn
    : undefined
}

/**
 * Keeps the events of a run that gets no turn away from the transcript: they would end, on screen, the run that
 * is in progress, which is another one (PROF-RUN-013). Returns what to do with each event, and how the run ended.
 */
export function runEvents<E extends { type?: unknown }>(
  forward: (event: E) => void
): {
  onEvent: (event: E) => void
  end: () => RunEnd
} {
  let ended: RunEnd | undefined
  return {
    onEvent: (event) => {
      const noTurn = noTurnOf(event as { type?: unknown; noTurn?: unknown })
      if (noTurn) {
        ended = { noTurn }
        return
      }
      if (!ended) return forward(event)
      const { code, outcome } = event as { code?: unknown; outcome?: { messageId?: unknown } | null }
      if (event.type === 'RUN_ERROR' && typeof code === 'string') ended = { ...ended, code }
      if (event.type === 'RUN_FINISHED' && typeof outcome?.messageId === 'string')
        ended = { ...ended, messageId: outcome.messageId }
    },
    end: () => ended ?? {},
  }
}

/** Whether the agent takes a message sent while a run is in progress (PROF-DESC-006). */
export function takesQueue(features: object | null | undefined): boolean {
  // read loosely: the descriptor's type gains the field with the profile package that declares it
  return (features as { queue?: unknown } | null | undefined)?.queue === true
}

/** The messages that wait in a conversation, in the order they arrived, from the session's state. */
export function waitingOf(state: object | null | undefined): WaitingMessage[] {
  const list = (state as { waiting?: unknown } | null | undefined)?.waiting
  if (!Array.isArray(list)) return []
  return list.filter(
    (w): w is WaitingMessage =>
      !!w &&
      typeof w === 'object' &&
      typeof (w as WaitingMessage).id === 'string' &&
      typeof (w as WaitingMessage).text === 'string'
  )
}

/**
 * What waits, as the transcript shows it (UI-CONV-025). A message the device holds is marked where it stands: its
 * own, under the id it gave it, or one it read from history, under the agent's. One sent from another device and
 * not held yet gets a bubble of its own, after the messages, in the order they arrived.
 */
export function waitingViews(
  messages: readonly TranscriptMessage[],
  waiting: readonly WaitingMessage[]
): { marked: Set<string>; added: TranscriptMessage[] } {
  const held = new Set(messages.map((m) => m.id))
  const marked = new Set<string>()
  const added: TranscriptMessage[] = []
  for (const w of waiting) {
    if (held.has(w.id)) marked.add(w.id)
    else if (w.messageId && held.has(w.messageId)) marked.add(w.messageId)
    // nothing to show for a message with no words (attachments alone) that this device does not hold
    else if (w.text) added.push({ id: w.id, role: 'user', content: w.text, at: w.at })
  }
  return { marked, added }
}

/** The English copy of the queue; a UI with its own languages translates it. */
export const QUEUE_COPY = {
  waiting: 'Waiting',
  refused: 'Too many messages are waiting. Send this one again in a moment.',
} as const

/**
 * The transcript without the messages that were sent while a run was in progress and that the agent never
 * recorded, their sending having failed (`driven` says which runs the device still drives): nothing will answer
 * them, and they must not stand there as if they waited.
 */
export function withoutOrphans(
  messages: readonly TranscriptMessage[],
  driven: (runId: string) => boolean
): TranscriptMessage[] {
  return messages.filter((m) => m.role === 'activity' || !m.queued || driven(m.id.replace(/^u_/, '')))
}

/** The transcript with a message marked as taken by the agent: recorded there, whatever happens here. */
export function taken(messages: readonly TranscriptMessage[], messageId: string): TranscriptMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId || m.role === 'activity' || !m.queued) return m
    const { queued: _queued, ...rest } = m
    return rest
  })
}
