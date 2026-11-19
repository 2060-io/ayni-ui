/**
 * Deleting a message within a window (AG-UI profile 3.3 §8, PROF-HIST-010, PROF-DESC-008, agent D93; UI-CONV-017,
 * UI-CONV-036): the person deletes a message they wrote, with the agent's reply to it, while the message is younger
 * than the window the agent declares. At once, with no confirmation; the message and the reply come back when the
 * agent refuses. The rules are here so the browser and the Ayni app apply the same ones.
 */
import { MEMORY_UPDATE } from './memories.js'
import type { TranscriptMessage } from './types.js'

/**
 * The window the agent declares, in seconds (`features.erasure.windowSeconds`); null when the person may not delete:
 * no `erasure`, a window of 0, or the `true` a 3.2 agent declared, whose window a UI does not know.
 */
export function deletionWindowOf(features: unknown): number | null {
  const erasure = (features as { erasure?: unknown } | undefined)?.erasure
  if (typeof erasure !== 'object' || erasure === null) return null
  const seconds = (erasure as { windowSeconds?: unknown }).windowSeconds
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/** Whether a message is one the person wrote: a text of theirs, or a media message of theirs. */
export function isPersonsMessage(m: TranscriptMessage): boolean {
  if (m.role === 'user') return true
  return (
    m.role === 'activity' && m.activityType === 'ayni.attachment' && (m.content as { role?: string }).role === 'user'
  )
}

/** When the window of a message closes, in milliseconds since the epoch: counted from its `createdAt`. */
export function deletableUntil(m: Pick<TranscriptMessage, 'at'>, windowSeconds: number): number {
  const at = Date.parse(m.at)
  return Number.isFinite(at) ? at + windowSeconds * 1000 : Number.NEGATIVE_INFINITY
}

/**
 * Whether the menu of a message offers Delete (UI-CONV-036): a message of the person, recorded by the agent (not
 * waiting to be, not streaming), younger than the window, while the browser is online and the conversation's
 * session is live.
 */
export function canDeleteMessage(
  m: TranscriptMessage,
  context: { windowSeconds: number | null; online: boolean; live: boolean; now: number }
): boolean {
  if (!context.windowSeconds || !context.online || !context.live) return false
  if (!isPersonsMessage(m)) return false
  if (m.role !== 'activity' && (m.queued || m.streaming)) return false
  return context.now < deletableUntil(m, context.windowSeconds)
}

/** The id the agent is asked to delete: a text by its id (the agent's or this client's own), a media message by its entry. */
export function deletionIdOf(m: TranscriptMessage): string {
  return m.role === 'activity' ? (m.entryId ?? m.id) : m.id
}

const isAgentsReply = (m: TranscriptMessage) =>
  m.role === 'assistant' ||
  (m.role === 'activity' &&
    (m.activityType === MEMORY_UPDATE ||
      m.activityType === 'ayni.generating' ||
      (m.activityType === 'ayni.attachment' && (m.content as { role?: string }).role !== 'user')))

/**
 * What a deletion takes from the transcript (PROF-HIST-010): the person's message (every attachment of a media
 * message) and the agent's reply to it, up to the person's next message: the agent's texts, its media, its
 * memory-update lines. The cards of the turn (a flow, an approval, a menu) stay.
 */
export function turnToDelete(messages: readonly TranscriptMessage[], id: string): TranscriptMessage[] {
  const index = messages.findIndex((m) => m.id === id || (m.role === 'activity' && m.entryId === id))
  if (index < 0) return []
  const target = messages[index]
  const entry = target.role === 'activity' ? target.entryId : undefined
  const sameMessage = (m: TranscriptMessage) =>
    m.id === target.id || (!!entry && m.role === 'activity' && m.entryId === entry)
  const out = messages.filter(sameMessage)
  for (const m of messages.slice(index + 1)) {
    if (sameMessage(m)) continue
    if (isPersonsMessage(m)) break
    if (isAgentsReply(m)) out.push(m)
  }
  return out
}

/**
 * The messages put back where they were, when the agent refused a deletion (UI-CONV-036): in the order of the
 * transcript before the deletion, with what arrived since after them.
 */
export function withRestored(
  current: readonly TranscriptMessage[],
  removed: readonly TranscriptMessage[],
  before: readonly TranscriptMessage[]
): TranscriptMessage[] {
  const order = new Map(before.map((m, i) => [m.id, i]))
  const present = new Set(current.map((m) => m.id))
  const merged = [...current, ...removed.filter((m) => !present.has(m.id))]
  return merged
    .map((m, i) => ({ m, key: order.get(m.id) ?? before.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.m)
}

/** Why the agent refused a deletion, as the key of the sentence the person reads (UI-CONV-036). */
export function deletionRefusalOf(
  error: { status?: number; code?: string } | undefined
): 'windowPassed' | 'legalHold' | 'unreachable' | 'refused' {
  if (error?.status === 409 && error.code === 'window-passed') return 'windowPassed'
  if (error?.status === 409 && error.code === 'legal-hold') return 'legalHold'
  if (!error?.status) return 'unreachable'
  return 'refused'
}
