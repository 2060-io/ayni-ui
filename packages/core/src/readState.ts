/**
 * The shared read state, as a device uses it (D62, PROF-CONV-008, PROF-DESC-005): the agent keeps one read marker
 * per conversation and counts what is unread after it; a device reports the messages it shows with a `viewed`
 * receipt and shows the agent's count in place of its own. The rules are here so the web UI and the app apply
 * the same ones.
 */
import { ACTIVITY } from '@ayni.org/ayni-agui-profile'
import type { AgUiEvent } from './profileClient.js'
import { CONVERSATION_CHANGED } from './reducer.js'
import type { TranscriptMessage } from './types.js'

/** Whether the agent keeps the shared read state. */
export function hasReadState(descriptor: { features?: unknown } | undefined): boolean {
  return (descriptor?.features as { readState?: boolean } | undefined)?.readState === true
}

/** Whether a device reports what it shows: for the audit trail (`receipts`), for the read marker (`readState`). */
export function sendsViewed(descriptor: { features?: unknown } | undefined): boolean {
  return (descriptor?.features as { receipts?: boolean } | undefined)?.receipts === true || hasReadState(descriptor)
}

/**
 * The unread count a device shows for a conversation: the agent's when it gave one, the device's own otherwise,
 * and none for the conversation in front of the person, which the device is reporting as viewed.
 */
export function unreadFrom(agentCount: unknown, own: number, onScreen: boolean): number {
  if (onScreen) return 0
  return typeof agentCount === 'number' && agentCount >= 0 ? agentCount : own
}

/**
 * The messages of a transcript to report as viewed: what the agent said that is shown whole and was not reported
 * yet, by the id the agent knows it under (a text by its own id, an attachment by its entry's).
 */
export function viewedIds(messages: readonly TranscriptMessage[], reported: ReadonlySet<string>): string[] {
  const ids: string[] = []
  for (const m of messages) {
    let id: string | undefined
    if (m.role === 'assistant' && !m.streaming) id = m.id
    else if (
      m.role === 'activity' &&
      m.activityType === ACTIVITY.attachment &&
      (m.content as { role?: string }).role === 'assistant'
    )
      id = m.entryId
    if (id && !reported.has(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** What `ayni.conversation.changed` says of a conversation (PROF-CONV-007); null for any other event. */
export interface ChangedConversation {
  conversationId: string
  title?: string
  state?: 'active' | 'archived' | 'final'
  unread?: number
  readUpTo?: string | null
}

export function changedConversation(event: AgUiEvent): ChangedConversation | null {
  if (event.type !== 'CUSTOM' || event.name !== CONVERSATION_CHANGED) return null
  const value = (event.value ?? {}) as Record<string, unknown>
  if (typeof value.conversationId !== 'string') return null
  return {
    conversationId: value.conversationId,
    title: typeof value.title === 'string' ? value.title : undefined,
    state: value.state === 'active' || value.state === 'archived' || value.state === 'final' ? value.state : undefined,
    unread: typeof value.unread === 'number' ? value.unread : undefined,
    readUpTo: typeof value.readUpTo === 'string' || value.readUpTo === null ? value.readUpTo : undefined,
  }
}
