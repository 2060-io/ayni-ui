/**
 * The person's memories and preferences (AG-UI profile 3.3 §3.8, PROF-MEM-001..003, PROF-HIST-011/012,
 * PROF-STREAM-010, agent D85; UI-CONV-032..035): memories are personal and each belongs to one space; preferences are
 * the person's in every space. The agent writes them; the person reads and deletes them, and changes one by telling
 * the agent. The rules a screen follows are here, for the browser and the Ayni app alike.
 */
import type { SpaceInfo } from './spaces.js'
import type { TranscriptMessage } from './types.js'

/** The live event of a memory the agent added, changed or removed in a turn (PROF-STREAM-010). */
export const MEMORY_UPDATED = 'ayni.memory.updated'
/** The transcript line of that change, in history (PROF-HIST-012) and once the live event is reduced. */
export const MEMORY_UPDATE = 'ayni.memory-update'

export type MemoryAction = 'added' | 'changed' | 'removed'

export interface PreferenceInfo {
  key: string
  value: string
  updatedAt: string
}

export interface MemoryInfo {
  id: string
  spaceId: string
  content: string
  createdAt: string
  updatedAt: string
  /** the conversation it came from, while the person can still read it */
  source?: { conversationId: string; title: string }
}

/** `GET {sessions}/memories?spaceId=` (PROF-MEM-001). */
export interface Memories {
  preferences: PreferenceInfo[]
  memories: MemoryInfo[]
}

/** `GET {sessions}/about-me` (PROF-MEM-003): what the page "What <agent> keeps about you" shows. */
export interface AboutMe {
  preferences: PreferenceInfo[]
  memoriesBySpace: { spaceId: string; title: string; count: number }[]
  conversations: { spaceId: string; title: string; count: number; retentionDays: number | null }[]
  verified: { label: string; source: string; verifiedAt: string; expiresAt: string | null }[]
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])
const newestFirst = <T extends { updatedAt: string }>(items: T[]) =>
  [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

function preferencesOf(v: unknown): PreferenceInfo[] {
  return list(v)
    .filter((p) => typeof p.key === 'string')
    .map((p) => ({ key: p.key as string, value: str(p.value), updatedAt: str(p.updatedAt) }))
}

/** The memories and preferences as the agent gives them, newest first. */
export function memoriesOf(body: unknown): Memories {
  const b = obj(body)
  const memories = list(b.memories)
    .filter((m) => typeof m.id === 'string')
    .map((m): MemoryInfo => {
      const source = obj(m.source)
      return {
        id: m.id as string,
        spaceId: str(m.spaceId),
        content: str(m.content),
        createdAt: str(m.createdAt),
        updatedAt: str(m.updatedAt, str(m.createdAt)),
        ...(typeof source.conversationId === 'string'
          ? { source: { conversationId: source.conversationId, title: str(source.title) } }
          : {}),
      }
    })
  return { preferences: newestFirst(preferencesOf(b.preferences)), memories: newestFirst(memories) }
}

export function aboutMeOf(body: unknown): AboutMe {
  const b = obj(body)
  return {
    preferences: preferencesOf(b.preferences),
    memoriesBySpace: list(b.memoriesBySpace)
      .filter((m) => typeof m.spaceId === 'string')
      .map((m) => ({
        spaceId: m.spaceId as string,
        title: str(m.title),
        count: typeof m.count === 'number' ? m.count : 0,
      })),
    conversations: list(b.conversations)
      .filter((c) => typeof c.spaceId === 'string')
      .map((c) => ({
        spaceId: c.spaceId as string,
        title: str(c.title),
        count: typeof c.count === 'number' ? c.count : 0,
        retentionDays: typeof c.retentionDays === 'number' ? c.retentionDays : null,
      })),
    verified: list(b.verified).map((v) => ({
      label: str(v.label),
      source: str(v.source),
      verifiedAt: str(v.verifiedAt),
      expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : null,
    })),
  }
}

/** What a memory-update line says (PROF-HIST-012, PROF-STREAM-010); null for content that is not one. */
export function memoryUpdateOf(content: unknown): { memoryId: string; spaceId: string; action: MemoryAction } | null {
  const c = obj(content)
  if (typeof c.memoryId !== 'string') return null
  const action = c.action === 'added' || c.action === 'removed' ? c.action : 'changed'
  return { memoryId: c.memoryId, spaceId: str(c.spaceId), action }
}

/**
 * The transcript line of `ayni.memory.updated` (PROF-STREAM-010): the same item history gives as the
 * `ayni.memory-update` activity, under its entry id, so the two meet when history is read.
 */
export function memoryLineOf(value: unknown, at: string): TranscriptMessage | null {
  const v = obj(value)
  const update = memoryUpdateOf(v)
  if (!update || typeof v.entryId !== 'string' || !v.entryId) return null
  return {
    id: v.entryId,
    role: 'activity',
    activityType: MEMORY_UPDATE,
    content: { memoryId: update.memoryId, spaceId: update.spaceId, action: update.action },
    at,
    entryId: v.entryId,
  }
}

const isPersons = (m: TranscriptMessage) =>
  m.role === 'user' || (m.role === 'activity' && (m.content as { role?: string }).role === 'user')
const isAgents = (m: TranscriptMessage) =>
  m.role === 'assistant' ||
  (m.role === 'activity' && m.activityType !== MEMORY_UPDATE && (m.content as { role?: string }).role === 'assistant')

/**
 * The transcript as it shows (UI-CONV-035): each "updated a memory" line after the reply of its turn. The live event
 * can come before the reply's text, while the agent works; history places the line after the reply's last message.
 * A line moves down past the agent's messages that follow it, never past the person's next message.
 */
export function placeMemoryLines(messages: readonly TranscriptMessage[]): readonly TranscriptMessage[] {
  const isLine = (m: TranscriptMessage) => m.role === 'activity' && m.activityType === MEMORY_UPDATE
  if (!messages.some(isLine)) return messages
  const out: TranscriptMessage[] = []
  // one turn at a time: from a message of the person to the next one
  let turn: TranscriptMessage[] = []
  const flush = () => {
    const lines = turn.filter(isLine)
    const rest = turn.filter((m) => !isLine(m))
    const lastOfAgent = rest.findLastIndex(isAgents)
    // after the reply's last message; with no reply in sight, where the turn ends
    const at = lastOfAgent < 0 ? rest.length : lastOfAgent + 1
    out.push(...rest.slice(0, at), ...lines, ...rest.slice(at))
    turn = []
  }
  for (const m of messages) {
    if (isPersons(m)) flush()
    turn.push(m)
  }
  flush()
  return out
}

/** The memories and preferences a reply used (PROF-HIST-011); undefined when the message does not say. */
export function usageOf(m: TranscriptMessage | undefined): { memories: string[]; preferences: string[] } | undefined {
  if (m?.role !== 'assistant') return undefined
  if (m.usedMemories === undefined && m.usedPreferences === undefined) return undefined
  return { memories: m.usedMemories ?? [], preferences: m.usedPreferences ?? [] }
}

/** One memory a reply used, as its Info lists it (UI-CONV-034): with its text, or as no longer kept. */
export interface UsedMemory {
  id: string
  memory?: MemoryInfo
  spaceId: string
}

export interface UsedPreference {
  key: string
  preference?: PreferenceInfo
}

/**
 * What a reply's Info lists (UI-CONV-034): its memories grouped by space (the conversation's space for one deleted
 * since, whose own space is no longer known), then its preferences, each with what the agent keeps now.
 */
export function usageSummaryOf(
  usage: { memories: readonly string[]; preferences: readonly string[] },
  kept: Memories,
  conversationSpaceId: string | undefined
): { bySpace: { spaceId: string; memories: UsedMemory[] }[]; preferences: UsedPreference[] } {
  const bySpace: { spaceId: string; memories: UsedMemory[] }[] = []
  for (const id of usage.memories) {
    const memory = kept.memories.find((m) => m.id === id)
    const spaceId = memory?.spaceId ?? conversationSpaceId ?? ''
    let group = bySpace.find((g) => g.spaceId === spaceId)
    if (!group) {
      group = { spaceId, memories: [] }
      bySpace.push(group)
    }
    group.memories.push({ id, spaceId, ...(memory ? { memory } : {}) })
  }
  const preferences = usage.preferences.map((key) => {
    const preference = kept.preferences.find((p) => p.key === key)
    return { key, ...(preference ? { preference } : {}) }
  })
  return { bySpace, preferences }
}

/** A space's title as the person reads it: Personal's in the UI's own word. */
export function spaceTitleOf(
  space: Pick<SpaceInfo, 'kind' | 'title'> | undefined,
  personalTitle: string,
  fallback = ''
): string {
  if (!space) return fallback
  return space.kind === 'personal' ? personalTitle : space.title || fallback
}
