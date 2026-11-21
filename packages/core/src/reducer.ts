/**
 * AG-UI events (runs and the session stream) to the local transcript and session state
 * (profile sections 5 to 7; UI-CONV-002/004/005/006/007/009/015/027, UI-CONV-045/046/047, UI-CAP-001, UI-APPR-002).
 */
import { ACTIVITY, type AyniState, CUSTOM_EVENT } from '@ayni.org/ayni-agui-profile'
import { CONNECTIONS_CHANGED } from './connections.js'
import { withoutVoiceEchoes } from './mediaMessages.js'
import { MEMORY_UPDATE, MEMORY_UPDATED, memoryLineOf } from './memories.js'
import type { AgUiEvent } from './profileClient.js'
import { spaceRefOf } from './spaces.js'
import { messageSourcesOf, SPACE_TOOLS_CHANGED, withApprovalUpdate } from './tools.js'
import type { ReplyQuote, SessionRecord, Transcript, TranscriptMessage } from './types.js'

export interface Reduction {
  transcript: Transcript
  session: SessionRecord
  /** signals the shell reacts to (title, badge, sound) */
  signals: (
    | 'message'
    | 'bound'
    | 'closed'
    | 'token'
    | 'approval'
    | 'identified'
    | 'conversations'
    | 'tools'
    | 'connections'
  )[]
}

export function emptyTranscript(sessionId: string): Transcript {
  return { sessionId, messages: [], oldestLoadedId: null, complete: false, run: null, routed: {}, reactions: {} }
}

const now = () => new Date().toISOString()

/**
 * The agent's signal that the person's list of conversations changed (PROF-CONV-007): a title, an archive, a
 * closure, made from any device. Named here until the profile package that lists it is the one every client has.
 */
export const CONVERSATION_CHANGED = 'ayni.conversation.changed'

/**
 * Messages of the conversation erased for good, from this device or another (PROF-STREAM-008): the transcript lets
 * them go. Named here until the profile package that lists it is the one every client has.
 */
export const MESSAGES_ERASED = 'ayni.messages.erased'

/**
 * The transcript without the messages the agent erased (UI-CONV-027). The agent names a message by its id, the one
 * history gives and the one under which another device's message arrives; a media message by its entry, which each
 * of its attachments carries (`entryId`). A message this device sent is held under the id this device gave it until
 * history names it (`mergeHistory`): the event names it by that id too (`clientIds`, PROF-STREAM-008).
 */
export function withoutErased(transcript: Transcript, messageIds: readonly string[]): Transcript {
  const erased = new Set(messageIds)
  const named = (m: TranscriptMessage) => erased.has(m.id) || (!!m.entryId && erased.has(m.entryId))
  const gone = transcript.messages.filter(named)
  if (!gone.length) return transcript
  // their reactions go with them
  const keys = new Set(gone.flatMap((m) => (m.entryId ? [m.id, m.entryId] : [m.id])))
  const reactions = Object.fromEntries(Object.entries(transcript.reactions).filter(([key]) => !keys.has(key)))
  return { ...transcript, messages: transcript.messages.filter((m) => !named(m)), reactions }
}

/**
 * Messages of the person that the AI never received: the service's code took them, as it takes the address and the
 * code of an email check (PROF-STREAM-011, D95). Sent while the run is on, as soon as the code takes the message.
 * Named here until the profile package that lists it is the one every client has.
 */
export const MESSAGES_WITHHELD = 'ayni.messages.withheld'

/**
 * The ids an event names its messages by (PROF-STREAM-008, PROF-STREAM-011): the agent's (`messageIds`), and the ids
 * the clients gave the messages they sent (`clientIds`), under which the sending device holds them until history
 * names them (`mergeHistory`).
 */
export function namedMessageIds(value: unknown): string[] {
  const v = (value ?? {}) as { messageIds?: unknown; clientIds?: unknown }
  return [v.messageIds, v.clientIds].flatMap((list) =>
    Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []
  )
}

/** Whether a message is one of the person that the AI never received (UI-CONV-044, D95). */
export function isWithheld(m: TranscriptMessage): boolean {
  return m.role === 'user' && m.modelVisible === false
}

/**
 * The transcript with the person's messages the service's code took marked as never received by the AI (UI-CONV-044,
 * PROF-STREAM-011): a bubble already drawn filled turns into the outline. Only the person's text messages are marked;
 * the messages the service's code wrote stay the agent's. A message held back because it carried a credential
 * (`credential`, agent D109) also takes the text the agent kept, in place of the one this device holds (`texts`, by
 * the id the message is held under).
 */
export function withWithheld(
  transcript: Transcript,
  messageIds: readonly string[],
  credential?: { texts: Readonly<Record<string, string>> }
): Transcript {
  const withheld = new Set(messageIds)
  const named = (m: TranscriptMessage) =>
    m.role === 'user' &&
    withheld.has(m.id) &&
    (m.modelVisible !== false ||
      (!!credential && (m.withheld !== 'credential' || credential.texts[m.id] !== undefined)))
  if (!transcript.messages.some(named)) return transcript
  return {
    ...transcript,
    messages: transcript.messages.map((m) => {
      if (m.role !== 'user' || !named(m)) return m
      if (!credential) return { ...m, modelVisible: false as const }
      const kept = credential.texts[m.id]
      return {
        ...m,
        modelVisible: false as const,
        withheld: 'credential' as const,
        ...(kept !== undefined ? { content: kept } : {}),
      }
    }),
  }
}

/**
 * The text the agent kept of each message held back for a credential, by every id the event names it under
 * (PROF-STREAM-011). `texts` is keyed by the agent's ids; the device that sent the message holds it under its own id
 * until history names it, so a client's id takes the text of the agent's id at its place in the lists, and, when the
 * event keeps one text only, that text.
 */
export function withheldTextsOf(value: unknown): Record<string, string> {
  const v = (value ?? {}) as { messageIds?: unknown; clientIds?: unknown; texts?: unknown }
  const texts: Record<string, string> = {}
  const given =
    typeof v.texts === 'object' && v.texts !== null
      ? Object.entries(v.texts as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === 'string'
        )
      : []
  if (!given.length) return texts
  for (const [id, text] of given) texts[id] = text
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  const agentIds = ids(v.messageIds)
  const clientIds = ids(v.clientIds)
  const only = given.length === 1 ? (given[0] as [string, string])[1] : undefined
  clientIds.forEach((clientId, i) => {
    const byPlace = agentIds.length === clientIds.length ? texts[agentIds[i] as string] : undefined
    const text = byPlace ?? only
    if (text !== undefined && texts[clientId] === undefined) texts[clientId] = text
  })
  return texts
}

/**
 * The session with what it shows of a message held back for a credential replaced by the text the agent kept: its
 * title and its preview, made from the message as it was sent, and a text that waits for the session to bind
 * (UI-CONV-044: the transcript, the store and the outbox).
 */
function sessionWithout(s: SessionRecord, held: readonly TranscriptMessage[], next: readonly TranscriptMessage[]) {
  let out = s
  for (const before of held) {
    const after = next.find((m) => m.id === before.id)
    if (!after || before.role === 'activity' || after.role === 'activity' || before.content === after.content) continue
    const sent = before.content
    const kept = after.content
    if (sent && out.title && sent.startsWith(out.title)) out = { ...out, title: kept.slice(0, 60) }
    if (sent && out.lastPreview && sent.startsWith(out.lastPreview)) out = { ...out, lastPreview: kept.slice(0, 120) }
    if (out.pendingText === sent) out = { ...out, pendingText: undefined }
  }
  return out
}

/** The five closed states of a flow (flow profile §5.2). */
export function isClosedFlow(state: unknown): boolean {
  return (
    state === 'completed' || state === 'declined' || state === 'cancelled' || state === 'failed' || state === 'expired'
  )
}

function upsertMessage(messages: TranscriptMessage[], message: TranscriptMessage): TranscriptMessage[] {
  const index = messages.findIndex((m) => m.id === message.id)
  if (index < 0) return [...messages, message]
  const next = messages.slice()
  next[index] = message
  return next
}

function applyPatch(state: unknown, ops: { op: string; path: string; value?: unknown }[]): unknown {
  const root = structuredClone(state ?? {}) as Record<string, unknown>
  for (const op of ops) {
    const parts = op.path
      .split('/')
      .slice(1)
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    let node: Record<string, unknown> = root
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {}
      node = node[part] as Record<string, unknown>
    }
    const last = parts[parts.length - 1]
    if (op.op === 'remove') {
      if (Array.isArray(node)) node.splice(Number(last), 1)
      else delete node[last]
    } else if (Array.isArray(node) && last === '-') node.push(op.value)
    else node[last] = op.value
  }
  return root
}

export function reduce(
  transcript: Transcript,
  session: SessionRecord,
  event: AgUiEvent,
  fromRun: boolean,
  isOnScreen: boolean
): Reduction {
  let t: Transcript = transcript
  let s: SessionRecord = session
  const signals: Reduction['signals'] = []
  const at = now()
  switch (event.type) {
    case 'RUN_STARTED':
      t = { ...t, run: { runId: String(event.runId), steps: [], log: [] } }
      break
    case 'RUN_FINISHED':
    case 'RUN_ERROR': {
      const cancelled = event.type === 'RUN_ERROR' && event.code === 'cancelled'
      const messages = t.messages.map((m) =>
        m.role !== 'activity' && m.streaming ? { ...m, streaming: false, interrupted: cancelled || m.interrupted } : m
      )
      t = { ...t, messages, run: null }
      break
    }
    case 'STEP_STARTED': {
      const name = String(event.stepName)
      t = {
        ...t,
        run: { runId: t.run?.runId ?? '', steps: [...(t.run?.steps ?? []), name], log: [...(t.run?.log ?? []), name] },
      }
      break
    }
    case 'STEP_FINISHED':
      t = { ...t, run: t.run ? { ...t.run, steps: t.run.steps.filter((x) => x !== String(event.stepName)) } : null }
      break
    case 'TEXT_MESSAGE_START': {
      const role = event.role === 'user' ? 'user' : event.role === 'system' ? 'system' : 'assistant'
      const id = String(event.messageId)
      // a message already held comes again when a stream replays it after a reconnect: it keeps its time, so
      // it stays where it is in the transcript
      const held = t.messages.find((m) => m.id === id)
      // and a message of the person the AI never received stays marked (UI-CONV-044)
      const withheld = role === 'user' && !!held && isWithheld(held)
      t = {
        ...t,
        messages: upsertMessage(t.messages, {
          id,
          role,
          content: '',
          at: held?.at ?? at,
          streaming: true,
          ...(withheld ? { modelVisible: false as const } : {}),
        }),
      }
      break
    }
    case 'TEXT_MESSAGE_CONTENT': {
      const id = String(event.messageId)
      const existing = t.messages.find((m) => m.id === id)
      const content = `${existing && existing.role !== 'activity' ? existing.content : ''}${String(event.delta ?? '')}`
      const base =
        existing && existing.role !== 'activity'
          ? existing
          : { id, role: 'assistant' as const, content: '', at, streaming: true }
      t = { ...t, messages: upsertMessage(t.messages, { ...base, content }) }
      break
    }
    case 'TEXT_MESSAGE_END': {
      const id = String(event.messageId)
      const existing = t.messages.find((m) => m.id === id)
      if (existing && existing.role !== 'activity') {
        // the steps reported so far belong to this reply (UI-CONV-019)
        const steps = existing.role === 'assistant' && t.run?.log.length ? t.run.log : existing.steps
        t = {
          ...t,
          messages: upsertMessage(t.messages, { ...existing, streaming: false, steps }),
          run: t.run && existing.role === 'assistant' ? { ...t.run, log: [] } : t.run,
        }
        if (existing.role === 'assistant') {
          signals.push('message')
          s = {
            ...s,
            lastPreview: existing.content.slice(0, 120),
            lastMessageAt: at,
            unreadCount: isOnScreen ? 0 : s.unreadCount + 1,
          }
        }
      }
      break
    }
    case 'ACTIVITY_SNAPSHOT': {
      const activityType = String(event.activityType)
      const content = (event.content ?? {}) as Record<string, unknown>
      const id = String(event.messageId)
      // a late artifact replaces its generating placeholder at the initiation position (UI-CONV-006)
      let messages = t.messages
      let routed = t.routed
      // a flow card sits at the flow's open time and is replaced in place at its close (UI-CONV-021, PROF-MAP-007);
      // once closed it takes over from the "continue on your phone" card of the same flow (UI-CAP-005)
      const flowAt = activityType === ACTIVITY.flow && typeof content.openedAt === 'string' ? content.openedAt : at
      if (activityType === ACTIVITY.flow && content.flowId && isClosedFlow(content.state)) {
        routed = Object.fromEntries(Object.entries(routed).filter(([, r]) => r.flowId !== content.flowId))
        // a credential issued in this conversation identifies its controller on the rail (D37)
        if (content.kind === 'issue' && content.state === 'completed') signals.push('identified')
      }
      if (activityType === ACTIVITY.attachment && content.entryId) {
        messages = messages.filter(
          (m) =>
            !(m.role === 'activity' && m.activityType === ACTIVITY.generating && m.content.entryId === content.entryId)
        )
      }
      // an approval's card replaced in place, a confirmation decided or its allowance ended, keeps its place in the
      // reply (UI-CONV-045)
      const held = activityType === ACTIVITY.approval ? messages.find((m) => m.id === id) : undefined
      messages = upsertMessage(messages, {
        id,
        role: 'activity',
        activityType,
        content,
        at: held?.at ?? flowAt,
        entryId: content.entryId as string | undefined,
      })
      // a voice note shows once: not beside a text that only repeats its transcription (UI-MEDIA-007)
      if (activityType === ACTIVITY.attachment) messages = withoutVoiceEchoes(messages)
      t = { ...t, routed, messages }
      if (activityType === ACTIVITY.attachment && !fromRun) {
        signals.push('message')
        s = {
          ...s,
          lastPreview: String(content.textRepr ?? ''),
          lastMessageAt: at,
          unreadCount: isOnScreen ? 0 : s.unreadCount + 1,
        }
      }
      if (activityType === ACTIVITY.approval) signals.push('approval')
      break
    }
    case 'STATE_SNAPSHOT': {
      const snapshot = event.snapshot as { ayni?: AyniState } | undefined
      if (snapshot?.ayni) s = { ...s, ayni: snapshot.ayni, principal: snapshot.ayni.principal ?? s.principal }
      // the conversation's space, from the first snapshot on (PROF-STREAM-009)
      s = withSpaceOf(s)
      break
    }
    case 'STATE_DELTA': {
      const patched = applyPatch(
        { ayni: s.ayni ?? {} },
        (event.delta as { op: string; path: string; value?: unknown }[]) ?? []
      ) as { ayni?: AyniState }
      if (patched.ayni) s = withSpaceOf({ ...s, ayni: patched.ayni })
      break
    }
    case 'MESSAGES_SNAPSHOT': {
      const incoming = (event.messages as Record<string, unknown>[]) ?? []
      t = { ...t, messages: incoming.map(toTranscriptMessage), reactions: { ...t.reactions, ...reactionsOf(incoming) } }
      break
    }
    case 'CUSTOM': {
      const value = (event.value ?? {}) as Record<string, unknown>
      switch (event.name) {
        case CUSTOM_EVENT.sessionState: {
          const state = value.state as SessionRecord['state']
          s = { ...s, state, closedReason: (value.reason as SessionRecord['closedReason']) ?? s.closedReason }
          if (state === 'closed') {
            s = { ...s, sessionToken: null, binding: undefined }
            signals.push('closed')
          }
          break
        }
        case CONVERSATION_CHANGED:
          // a conversation of the person was renamed, archived or closed, here or on another device: the client
          // reads the agent's list again (PROF-CONV-007)
          signals.push('conversations')
          break
        case MESSAGES_ERASED: {
          // messages of this conversation erased for good, here or on another device: they leave the transcript
          // (UI-CONV-027, PROF-STREAM-008)
          const conversationId = typeof value.conversationId === 'string' ? value.conversationId : undefined
          // by the agent's ids, and by the ids the clients gave the messages they sent (`clientIds`)
          const ids = namedMessageIds(value)
          if (!conversationId || !s.conversationId || conversationId === s.conversationId) t = withoutErased(t, ids)
          break
        }
        case MESSAGES_WITHHELD: {
          // messages of the person the service's code took: the AI never received them, and their bubbles say so
          // (UI-CONV-044, PROF-STREAM-011), named as an erasure names them. One held back for a credential takes the
          // text the agent kept, here and wherever this device wrote the text it sent (agent D109)
          const conversationId = typeof value.conversationId === 'string' ? value.conversationId : undefined
          if (!conversationId || !s.conversationId || conversationId === s.conversationId) {
            const ids = namedMessageIds(value)
            const credential = value.reason === 'credential' ? { texts: withheldTextsOf(value) } : undefined
            const before = t.messages.filter((m) => ids.includes(m.id))
            t = withWithheld(t, ids, credential)
            if (credential) s = sessionWithout(s, before, t.messages)
          }
          break
        }
        case MEMORY_UPDATED: {
          // the agent added, changed or removed a memory of the person in this turn: a line after its reply
          // (UI-CONV-035, PROF-STREAM-010), under the entry id history gives the same line
          const conversationId = typeof value.conversationId === 'string' ? value.conversationId : undefined
          if (conversationId && s.conversationId && conversationId !== s.conversationId) break
          const line = memoryLineOf(value, at)
          if (line && !t.messages.some((m) => m.id === line.id || m.entryId === line.id))
            t = { ...t, messages: [...t.messages, line] }
          break
        }
        case CUSTOM_EVENT.sessionBound:
          s = {
            ...s,
            state: 'bound',
            binding: undefined,
            principal: value.principal as SessionRecord['principal'],
            deviceHandle: (value.deviceHandle as string | undefined) ?? s.deviceHandle,
            deviceSecret: (value.deviceSecret as string | undefined) ?? s.deviceSecret,
            conversationId: (value.conversationId as string | undefined) ?? s.conversationId,
          }
          signals.push('bound')
          break
        case CUSTOM_EVENT.sessionToken:
          s = { ...s, sessionToken: String(value.sessionToken) }
          signals.push('token')
          break
        case CUSTOM_EVENT.capabilityRouted: {
          const key = `${String(value.kind)}:${String(value.originSessionId)}`
          t = {
            ...t,
            routed: {
              ...t.routed,
              [key]: {
                kind: String(value.kind),
                challengeType: value.challengeType as string | undefined,
                status: String(value.status),
                message: value.message as string | undefined,
                at,
                flowId: typeof value.flowId === 'string' ? value.flowId : undefined,
              },
            },
          }
          break
        }
        case CUSTOM_EVENT.approvalRequest:
          signals.push('approval')
          break
        case CUSTOM_EVENT.approvalUpdate:
          // the card of the approval, or of a confirmation, takes its new status where it is, on every device: a
          // decision, the scope of an allow, the end of an allowance (UI-APPR-002, UI-CONV-045, UI-CONV-046)
          t = withApprovalUpdate(t, value)
          signals.push('approval')
          break
        case SPACE_TOOLS_CHANGED:
          // a change of a space's tools applied or was dropped: the shell tells the screens that wait for it
          // (UI-CONV-050, PROF-TOOL-006); nothing of it enters the transcript
          signals.push('tools')
          break
        case CONNECTIONS_CHANGED:
          // one of the person's own accounts, or an attempt to connect one, changed: the shell reads Your accounts
          // again and tells the screens that show them (UI-CONV-053, PROF-TOOL-019); nothing of it enters the
          // transcript
          signals.push('connections')
          break
        case CUSTOM_EVENT.reaction: {
          // one reaction per person per message: an add replaces, a remove clears (PROF-RUN-010)
          const messageId = String(value.messageId)
          const list = (t.reactions[messageId] ?? []).filter((r) => r.by !== String(value.by))
          if (value.action === 'add') list.push({ emoji: String(value.emoji), by: String(value.by) })
          t = { ...t, reactions: { ...t.reactions, [messageId]: list } }
          break
        }
        default:
          break
      }
      break
    }
    default:
      break
  }
  return { transcript: t, session: s, signals }
}

/** The session with the space its state names (PROF-STREAM-009); unchanged when the state names none. */
function withSpaceOf(s: SessionRecord): SessionRecord {
  const space = spaceRefOf(s.ayni)
  return space && space.id !== s.spaceId ? { ...s, spaceId: space.id } : s
}

/** The memories and preferences a reply used, as history gives them (PROF-HIST-011); nothing when it says nothing. */
function usageFrom(meta: { usedMemories?: unknown; usedPreferences?: unknown }): {
  usedMemories?: string[]
  usedPreferences?: string[]
} {
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined)
  const memories = ids(meta.usedMemories)
  const preferences = ids(meta.usedPreferences)
  return {
    ...(memories ? { usedMemories: memories } : {}),
    ...(preferences ? { usedPreferences: preferences } : {}),
  }
}

/** The sources a reply used, as history gives them (PROF-TOOL-010): an empty list when it says none. */
function sourcesFrom(meta: { sources?: unknown }): { sources: ReturnType<typeof messageSourcesOf> } {
  return { sources: messageSourcesOf(meta.sources) }
}

/** History messages (MessagesSnapshot shape) to transcript messages (UI-CONV-012). */
export function toTranscriptMessage(m: Record<string, unknown>): TranscriptMessage {
  const meta = (m.metadata ?? {}) as {
    createdAt?: string
    completion?: string
    entryId?: string
    replyTo?: ReplyQuote
    usedMemories?: unknown
    usedPreferences?: unknown
    modelVisible?: unknown
    withheld?: unknown
    sources?: unknown
  }
  const at = meta.createdAt ?? now()
  if (m.role === 'activity') {
    return {
      id: String(m.id),
      role: 'activity',
      activityType: String(m.activityType),
      content: (m.content ?? {}) as Record<string, unknown>,
      at,
      entryId: meta.entryId,
    }
  }
  const role = m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant'
  return {
    id: String(m.id),
    role,
    content: typeof m.content === 'string' ? m.content : '',
    at,
    interrupted: meta.completion === 'interrupted',
    replyTo: meta.replyTo,
    // what the reply used: the person's memories and preferences (PROF-HIST-011), the sources of its tools
    // (PROF-TOOL-010); a reply read from history that names no source used none
    ...(role === 'assistant' ? { ...usageFrom(meta), ...sourcesFrom(meta) } : {}),
    // a message of the person the AI never received (PROF-HIST-013); absent, the AI received it. One held back for a
    // credential comes with the text the agent kept (agent D109)
    ...(role === 'user' && meta.modelVisible === false ? { modelVisible: false as const } : {}),
    ...(role === 'user' && meta.modelVisible === false && meta.withheld === 'credential'
      ? { withheld: 'credential' as const }
      : {}),
  }
}

/** Current reactions carried by history messages (`metadata.reactions`, PROF-HIST-006). */
export function reactionsOf(page: Record<string, unknown>[]): Record<string, { emoji: string; by: string }[]> {
  const out: Record<string, { emoji: string; by: string }[]> = {}
  for (const m of page) {
    const meta = (m.metadata ?? {}) as { reactions?: { emoji: string; by: string }[]; entryId?: string }
    // the reactions of a media message are those of its entry, which each of its attachments carries: they are
    // kept under the entry, where a live `ayni.reaction` names it too (UI-CONV-024)
    const key = m.role === 'activity' && meta.entryId ? meta.entryId : String(m.id)
    if (meta.reactions?.length) out[key] = meta.reactions.map((r) => ({ emoji: r.emoji, by: r.by }))
  }
  return out
}

/**
 * How a page of history was read, for the transcript to let go what history no longer returns (UI-CONV-037): a
 * message deleted or erased while this device was away leaves its cache too.
 */
export interface HistoryRead {
  /** the page was read with no `before`: it reaches the end of the conversation */
  newest?: boolean
  /** when the read was sent, by this device's clock: what arrived since is newer than the page and stays */
  readAt?: string
  /** a message the caller still drives (one whose sending is in flight): it stays */
  keep?: (m: TranscriptMessage) => boolean
}

/**
 * The kinds of message a deletion or an erasure takes (PROF-HIST-010, PROF-STREAM-008): the person's and the agent's
 * texts, media and memory-update lines. Cards (a flow, an approval, a menu) and placeholders are never taken, and a
 * message still on its way (streaming, waiting to be recorded) is not one history could return yet.
 */
function vanishable(m: TranscriptMessage): boolean {
  if (m.role === 'activity') return m.activityType === ACTIVITY.attachment || m.activityType === MEMORY_UPDATE
  return (m.role === 'user' || m.role === 'assistant') && !m.streaming && !m.queued
}

/**
 * The transcript without the messages of the period a page covers that the page no longer returns (UI-CONV-037). The
 * period runs from the page's oldest message (from the conversation's start when the page is its first) to its newest
 * one, or on to the end of the conversation when the page is the newest. Times are the agent's: a message this device
 * holds takes the agent's time once history names it (`mergeHistory`), and one that arrived after the read was sent
 * (by this device's clock, as it was stamped) is newer than any page of that read.
 */
function withoutVanished(
  messages: TranscriptMessage[],
  page: Record<string, unknown>[],
  nextBefore: string | null,
  read: HistoryRead
): TranscriptMessage[] {
  const returned = new Set<string>()
  const times: string[] = []
  for (const m of page) {
    returned.add(String(m.id))
    const meta = (m.metadata ?? {}) as { entryId?: unknown; externalId?: unknown; createdAt?: unknown }
    if (typeof meta.entryId === 'string') returned.add(meta.entryId)
    if (typeof meta.externalId === 'string') returned.add(meta.externalId)
    if (typeof meta.createdAt === 'string') times.push(meta.createdAt)
  }
  times.sort()
  // from the conversation's start for its first page; else from the page's oldest message
  const from = nextBefore === null ? '' : times[0]
  // on to the end for the newest page; else to the page's newest message
  const to = read.newest ? undefined : times[times.length - 1]
  if (from === undefined || (!read.newest && to === undefined)) return messages
  const inPage = (m: TranscriptMessage) => returned.has(m.id) || (!!m.entryId && returned.has(m.entryId))
  const gone = (m: TranscriptMessage) =>
    m.at >= from &&
    (to === undefined || m.at <= to) &&
    vanishable(m) &&
    !inPage(m) &&
    !read.keep?.(m) &&
    // arrived after the read was sent: the page could not hold it
    !(read.readAt && m.at >= read.readAt)
  return messages.some(gone) ? messages.filter((m) => !gone(m)) : messages
}

/**
 * The replies held here with what only history says of them: the memories and preferences their turn was given
 * (PROF-HIST-011), and the sources of the tool results it read (PROF-TOOL-010). A reply received live carries none
 * of them until history is read (UI-CONV-034, UI-CONV-047).
 */
export function withUsageFrom(messages: TranscriptMessage[], page: Record<string, unknown>[]): TranscriptMessage[] {
  const usage = new Map<string, ReturnType<typeof usageFrom> & ReturnType<typeof sourcesFrom>>()
  for (const m of page) {
    if (m.role !== 'assistant') continue
    const meta = (m.metadata ?? {}) as Record<string, unknown>
    usage.set(String(m.id), { ...usageFrom(meta), ...sourcesFrom(meta) })
  }
  if (!usage.size) return messages
  return messages.map((m) => {
    const used = m.role === 'assistant' ? usage.get(m.id) : undefined
    return used ? { ...m, ...used } : m
  })
}

/**
 * The person's messages held here that history says the AI never received (`metadata.modelVisible: false`,
 * PROF-HIST-013): one sent from this device, or one whose live event this device missed, is marked as history reads
 * it (UI-CONV-044). One held back for a credential (`metadata.withheld: "credential"`) takes the text history gives,
 * the one the agent kept (agent D109).
 */
export function withWithheldFrom(messages: TranscriptMessage[], page: Record<string, unknown>[]): TranscriptMessage[] {
  const unseen = page.filter(
    (m) => m.role === 'user' && (m.metadata as { modelVisible?: unknown } | undefined)?.modelVisible === false
  )
  if (!unseen.length) return messages
  const isCredential = (m: Record<string, unknown>) =>
    (m.metadata as { withheld?: unknown } | undefined)?.withheld === 'credential'
  const plain = unseen.filter((m) => !isCredential(m)).map((m) => String(m.id))
  const credential = unseen.filter(isCredential)
  let out = plain.length ? withWithheld({ messages } as Transcript, plain).messages : messages
  if (credential.length) {
    const texts = Object.fromEntries(
      credential.filter((m) => typeof m.content === 'string').map((m) => [String(m.id), m.content as string])
    )
    out = withWithheld(
      { messages: out } as Transcript,
      credential.map((m) => String(m.id)),
      { texts }
    ).messages
  }
  return out
}

/**
 * Merges a history page (newest last) into the transcript without duplicates (UI-CONV-012, UI-PRIV-003). A message
 * already held takes what only history gives of it: the memories and preferences its reply used (PROF-HIST-011), and
 * whether the AI received a message of the person (PROF-HIST-013).
 * With `read`, what the page no longer returns of the period it covers leaves (UI-CONV-037).
 */
export function mergeHistory(
  transcript: Transcript,
  page: Record<string, unknown>[],
  nextBefore: string | null,
  read?: HistoryRead
): Transcript {
  const known = new Set(transcript.messages.map((m) => m.id))
  // a message this device sent is known under the id it gave the run; history names it under the
  // agent's id and recalls ours in metadata.externalId (PROF-HIST-006): it is the same message,
  // which takes the agent's id from here on so that reactions and replies name it the agent's way
  const ownIdOf = new Map<string, string>()
  for (const m of page) {
    const external = (m.metadata as { externalId?: string } | undefined)?.externalId
    if (external && known.has(external)) ownIdOf.set(external, String(m.id))
  }
  const renamedIds = new Set(ownIdOf.values())
  // a message held here takes the time the agent gives it, when the history is read to let go of what it no longer
  // returns (UI-CONV-037): the period of a page is in the agent's times
  const agentTimes = new Map<string, string>()
  if (read)
    for (const m of page) {
      const createdAt = (m.metadata as { createdAt?: unknown } | undefined)?.createdAt
      if (typeof createdAt === 'string') agentTimes.set(String(m.id), createdAt)
    }
  const kept = withWithheldFrom(
    withUsageFrom(
      transcript.messages.map((m) => {
        const renamed = ownIdOf.has(m.id) ? { ...m, id: ownIdOf.get(m.id) as string } : m
        const time = agentTimes.get(renamed.id)
        // a flow card keeps its place at the flow's open time (UI-CONV-021)
        return time && time !== renamed.at && vanishable(renamed) ? { ...renamed, at: time } : renamed
      }),
      page
    ),
    page
  )
  const older = page.map(toTranscriptMessage).filter((m) => !known.has(m.id) && !renamedIds.has(m.id))
  // a voice note shows once, whatever the agent's history and what this device kept say (UI-MEDIA-007)
  let messages = withoutVoiceEchoes([...older, ...kept].sort((a, b) => a.at.localeCompare(b.at)))
  if (read) messages = withoutVanished(messages, page, nextBefore, read)
  const reactions = { ...transcript.reactions, ...reactionsOf(page) }
  for (const [own, theirs] of ownIdOf) {
    if (reactions[own] && !reactions[theirs]) reactions[theirs] = reactions[own]
    delete reactions[own]
  }
  return {
    ...transcript,
    messages,
    reactions,
    oldestLoadedId: nextBefore,
    complete: nextBefore === null || page.length === 0,
  }
}

/** A page of history as the agent returns it (PROF-HIST-001): newest last, with where the page before it starts. */
export interface HistoryPage {
  messages: Record<string, unknown>[]
  nextBefore: string | null
}

/** Whether a page of history reaches what the transcript holds: one of its messages is already there. */
export function reachesTranscript(transcript: Transcript, page: Record<string, unknown>[]): boolean {
  const known = new Set(transcript.messages.map((m) => m.id))
  return page.some((m) => {
    const external = (m.metadata as { externalId?: string } | undefined)?.externalId
    return known.has(String(m.id)) || (!!external && known.has(external))
  })
}

/**
 * What a device missed while it was away, merged into the transcript it holds (UI-CONV-022, PROF-HIST-007): a
 * conversation continued from another device, or events its stream could not replay. `pages` are the newest pages
 * of history, newest first, read until one reached the transcript or history ended. The transcript keeps its own
 * paging position when a page reached it. When none did, more was missed than was read: the transcript starts
 * over from the pages, so it never shows a hole between what it held and what it read.
 */
export function catchUp(
  transcript: Transcript,
  pages: readonly HistoryPage[],
  /** given, what the pages no longer return of the period they cover leaves the transcript (UI-CONV-037) */
  read?: Omit<HistoryRead, 'newest'>
): Transcript {
  if (!pages.length) return transcript
  const held = transcript.messages.length > 0
  const reached = !held || pages.some((p) => p.nextBefore === null || reachesTranscript(transcript, p.messages))
  let merged: Transcript = reached ? transcript : { ...transcript, messages: [], reactions: {} }
  // the first page is the newest: it reaches the end of the conversation
  for (const [i, page] of pages.entries())
    merged = mergeHistory(merged, page.messages, page.nextBefore, read ? { ...read, newest: i === 0 } : undefined)
  return held && reached
    ? { ...merged, oldestLoadedId: transcript.oldestLoadedId, complete: transcript.complete }
    : merged
}

/**
 * Reads what `catchUp` needs: the newest pages of history, going back until one reaches the transcript, history
 * ends, or `maxPages` were read; then merges them.
 */
export async function readCatchUp(
  transcript: Transcript,
  read: (before?: string) => Promise<HistoryPage>,
  maxPages = 4,
  /** given, what history no longer returns leaves the transcript (UI-CONV-037); `readAt` is set here */
  purge?: Pick<HistoryRead, 'keep'>
): Promise<Transcript> {
  const readAt = new Date().toISOString()
  const pages: HistoryPage[] = []
  let before: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await read(before)
    pages.push(page)
    const done =
      page.nextBefore === null ||
      page.messages.length === 0 ||
      transcript.messages.length === 0 ||
      reachesTranscript(transcript, page.messages)
    if (done) break
    before = page.nextBefore ?? undefined
  }
  return catchUp(transcript, pages, purge ? { ...purge, readAt } : undefined)
}
