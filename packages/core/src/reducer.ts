/**
 * AG-UI events (runs and the session stream) to the local transcript and session state
 * (profile sections 5 to 7; UI-CONV-002/004/005/006/007/009/015, UI-CAP-001, UI-APPR-002).
 */
import { ACTIVITY, type AyniState, CUSTOM_EVENT } from '@ayni.org/ayni-agui-profile'
import type { AgUiEvent } from './profileClient.js'
import type { SessionRecord, Transcript, TranscriptMessage } from './types.js'

export interface Reduction {
  transcript: Transcript
  session: SessionRecord
  /** signals the shell reacts to (title, badge, sound) */
  signals: ('message' | 'bound' | 'closed' | 'token' | 'approval')[]
}

export function emptyTranscript(sessionId: string): Transcript {
  return { sessionId, messages: [], oldestLoadedId: null, complete: false, run: null, routed: {}, reactions: {} }
}

const now = () => new Date().toISOString()

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
      t = {
        ...t,
        messages: upsertMessage(t.messages, { id: String(event.messageId), role, content: '', at, streaming: true }),
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
      }
      if (activityType === ACTIVITY.attachment && content.entryId) {
        messages = messages.filter(
          (m) =>
            !(m.role === 'activity' && m.activityType === ACTIVITY.generating && m.content.entryId === content.entryId)
        )
      }
      t = {
        ...t,
        routed,
        messages: upsertMessage(messages, {
          id,
          role: 'activity',
          activityType,
          content,
          at: flowAt,
          entryId: content.entryId as string | undefined,
        }),
      }
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
      break
    }
    case 'STATE_DELTA': {
      const patched = applyPatch(
        { ayni: s.ayni ?? {} },
        (event.delta as { op: string; path: string; value?: unknown }[]) ?? []
      ) as { ayni?: AyniState }
      if (patched.ayni) s = { ...s, ayni: patched.ayni }
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
        case CUSTOM_EVENT.approvalUpdate:
          signals.push('approval')
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

/** History messages (MessagesSnapshot shape) to transcript messages (UI-CONV-012). */
export function toTranscriptMessage(m: Record<string, unknown>): TranscriptMessage {
  const meta = (m.metadata ?? {}) as {
    createdAt?: string
    completion?: string
    entryId?: string
    replyTo?: { id: string; text: string; role: 'user' | 'assistant' }
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
  }
}

/** Current reactions carried by history messages (`metadata.reactions`, PROF-HIST-006). */
export function reactionsOf(page: Record<string, unknown>[]): Record<string, { emoji: string; by: string }[]> {
  const out: Record<string, { emoji: string; by: string }[]> = {}
  for (const m of page) {
    const meta = (m.metadata ?? {}) as { reactions?: { emoji: string; by: string }[] }
    if (meta.reactions?.length) out[String(m.id)] = meta.reactions.map((r) => ({ emoji: r.emoji, by: r.by }))
  }
  return out
}

/** Merges a history page (newest last) into the transcript without duplicates (UI-CONV-012, UI-PRIV-003). */
export function mergeHistory(
  transcript: Transcript,
  page: Record<string, unknown>[],
  nextBefore: string | null
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
  const kept = transcript.messages.map((m) => (ownIdOf.has(m.id) ? { ...m, id: ownIdOf.get(m.id) as string } : m))
  const older = page.map(toTranscriptMessage).filter((m) => !known.has(m.id) && !renamedIds.has(m.id))
  const messages = [...older, ...kept].sort((a, b) => a.at.localeCompare(b.at))
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
