/**
 * Sending while the agent answers (UI-CONV-025, APP-CONV-023, PROF-RUN-011/012/013). An agent that declares
 * `features.queue` takes a message sent during a turn: it waits, is listed in `state.ayni.waiting` on every device
 * of the person, and is answered when the turn ends, together with whatever else waits. A run that gets no turn
 * of its own (answered by another's, withdrawn, refused) says so in its first event, and nothing of it reaches
 * the transcript's run.
 */
import type { TranscriptMessage } from './types.js'

/** Why a run gets no turn of its own: carried by its `RunStarted` as `noTurn`. */
export type NoTurn = 'merged' | 'withdrawn' | 'refused'

/** How a run ended, for the client that sent it. Empty for a run that had its turn. */
export interface RunEnd {
  noTurn?: NoTurn
  /** the run whose turn answers this one's message */
  mergedInto?: string
  /** the code of the error that ended a run without a turn */
  code?: string
}

/** A message of the person that waits for the turn in progress of its conversation to end. */
export interface WaitingMessage {
  /** the run that carries it: cancelling that run withdraws the message */
  runId?: string
  /** the session it came through */
  sessionId: string
  /** the id the client gave the message */
  messageId?: string
  text: string
  attachments: number
  at: string
}

/** What a `RunStarted` says of a run that gets no turn of its own; undefined for any other event. */
export function noTurnOf(event: { type?: unknown; noTurn?: unknown }): NoTurn | undefined {
  if (event.type !== 'RUN_STARTED') return undefined
  return event.noTurn === 'merged' || event.noTurn === 'withdrawn' || event.noTurn === 'refused'
    ? event.noTurn
    : undefined
}

/**
 * Keeps the events of a run that gets no turn of its own away from the transcript: they would end, on screen, the
 * run that is in progress, which is another one. Returns what to do with each event, and how the run ended.
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
        const into = (event as { mergedInto?: unknown }).mergedInto
        ended = { noTurn, ...(typeof into === 'string' && into ? { mergedInto: into } : {}) }
        return
      }
      if (!ended) return forward(event)
      const code = (event as { code?: unknown }).code
      if (event.type === 'RUN_ERROR' && typeof code === 'string') ended = { ...ended, code }
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
      typeof (w as WaitingMessage).sessionId === 'string' &&
      typeof (w as WaitingMessage).text === 'string'
  )
}

/** The id a waiting message has in the transcript of the device that sent it: the one the client gave it. */
export function waitingMessageId(waiting: Pick<WaitingMessage, 'messageId' | 'runId'>): string | undefined {
  return waiting.messageId ?? (waiting.runId ? `u_${waiting.runId}` : undefined)
}

/** A waiting message as the transcript shows it, with what is needed to withdraw it. */
export interface WaitingView {
  /** the transcript message it marks, or the bubble shown for one sent from another device */
  message: TranscriptMessage
  runId?: string
  /** this device sent it: it may withdraw it */
  own: boolean
}

/**
 * What waits, as the transcript shows it (UI-CONV-025): a message this device sent is already in the transcript
 * and is marked there; one sent from another device gets a bubble of its own, after the messages, in the order
 * they arrived. Keyed by the id of the transcript message.
 */
export function waitingViews(
  messages: readonly TranscriptMessage[],
  waiting: readonly WaitingMessage[],
  sessionId: string
): { marked: Map<string, WaitingView>; added: WaitingView[] } {
  const held = new Map(messages.map((m) => [m.id, m]))
  const marked = new Map<string, WaitingView>()
  const added: WaitingView[] = []
  for (const w of waiting) {
    const id = waitingMessageId(w)
    const own = w.sessionId === sessionId
    const message = id ? held.get(id) : undefined
    if (id && message) {
      marked.set(id, { message, runId: w.runId, own })
      continue
    }
    // nothing to show for a message with no words (attachments alone) that this device does not hold
    if (!w.text) continue
    added.push({
      message: { id: id ?? `waiting_${added.length}`, role: 'user', content: w.text, at: w.at },
      runId: w.runId,
      own,
    })
  }
  return { marked, added }
}

/** The English copy of the queue; a UI with its own languages translates it. */
export const QUEUE_COPY = {
  waiting: 'Waiting',
  withdraw: 'Withdraw',
  refused: 'Too many messages are waiting. Send this one again in a moment.',
} as const

/**
 * The transcript without the messages that were sent while a run was in progress, were never taken, and whose run
 * the device no longer drives (`driven` says which runs it does): the run ended with the page or the app, the
 * agent withdrew the message, and nothing will answer it (PROF-RUN-013).
 */
export function withoutOrphans(
  messages: readonly TranscriptMessage[],
  driven: (runId: string) => boolean
): TranscriptMessage[] {
  return messages.filter((m) => m.role === 'activity' || !m.queued || driven(m.id.replace(/^u_/, '')))
}

/** The transcript with a waiting message marked as taken by the agent. */
export function taken(messages: readonly TranscriptMessage[], messageId: string): TranscriptMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId || m.role === 'activity' || !m.queued) return m
    const { queued: _queued, ...rest } = m
    return rest
  })
}
