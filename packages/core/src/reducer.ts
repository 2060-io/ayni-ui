/**
 * AG-UI events (runs and the session stream) to the local transcript and session state
 * (profile sections 5 to 7; UI-CONV-002/004/005/006/007/009/015, UI-CAP-001, UI-APPR-002).
 */
import { ACTIVITY, CUSTOM_EVENT, type HologramState } from '@2060.io/hologram-agui-profile'
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
      t = { ...t, run: { runId: String(event.runId), steps: [] } }
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
    case 'STEP_STARTED':
      t = { ...t, run: { runId: t.run?.runId ?? '', steps: [...(t.run?.steps ?? []), String(event.stepName)] } }
      break
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
        t = { ...t, messages: upsertMessage(t.messages, { ...existing, streaming: false }) }
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
      if (activityType === ACTIVITY.attachment && content.entryId) {
        messages = messages.filter(
          (m) =>
            !(m.role === 'activity' && m.activityType === ACTIVITY.generating && m.content.entryId === content.entryId)
        )
      }
      t = {
        ...t,
        messages: upsertMessage(messages, {
          id,
          role: 'activity',
          activityType,
          content,
          at,
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
      const snapshot = event.snapshot as { hologram?: HologramState } | undefined
      if (snapshot?.hologram)
        s = { ...s, hologram: snapshot.hologram, principal: snapshot.hologram.principal ?? s.principal }
      break
    }
    case 'STATE_DELTA': {
      const patched = applyPatch(
        { hologram: s.hologram ?? {} },
        (event.delta as { op: string; path: string; value?: unknown }[]) ?? []
      ) as { hologram?: HologramState }
      if (patched.hologram) s = { ...s, hologram: patched.hologram }
      break
    }
    case 'MESSAGES_SNAPSHOT': {
      const incoming = (event.messages as Record<string, unknown>[]) ?? []
      t = { ...t, messages: incoming.map(toTranscriptMessage) }
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
          s = { ...s, state: 'bound', binding: undefined, principal: value.principal as SessionRecord['principal'] }
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
          const messageId = String(value.messageId)
          const list = (t.reactions[messageId] ?? []).filter((r) => !(r.emoji === value.emoji && r.by === value.by))
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
  const meta = (m.metadata ?? {}) as { createdAt?: string; completion?: string; entryId?: string }
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
  }
}

/** Merges a history page (newest last) into the transcript without duplicates (UI-CONV-012, UI-PRIV-003). */
export function mergeHistory(
  transcript: Transcript,
  page: Record<string, unknown>[],
  nextBefore: string | null
): Transcript {
  const known = new Set(transcript.messages.map((m) => m.id))
  const older = page.map(toTranscriptMessage).filter((m) => !known.has(m.id))
  const messages = [...older, ...transcript.messages].sort((a, b) => a.at.localeCompare(b.at))
  return { ...transcript, messages, oldestLoadedId: nextBefore, complete: nextBefore === null || page.length === 0 }
}
