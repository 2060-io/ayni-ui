/**
 * The person's memories and preferences (profile 3.3 §3.8, PROF-MEM-001..003, PROF-HIST-011/012, PROF-STREAM-010;
 * UI-CONV-032..035).
 */
import { describe, expect, it } from 'vitest'
import {
  aboutMeOf,
  MEMORY_UPDATE,
  memoriesOf,
  memoryLineOf,
  memoryUpdateOf,
  placeMemoryLines,
  usageOf,
  usageSummaryOf,
} from '../src/memories.js'
import type { TranscriptMessage } from '../src/types.js'

const at = (n: number) => `2026-11-18T10:${String(n).padStart(2, '0')}:00.000Z`
const user = (id: string, n: number): TranscriptMessage => ({ id, role: 'user', content: id, at: at(n) })
const agent = (id: string, n: number): TranscriptMessage => ({ id, role: 'assistant', content: id, at: at(n) })
const line = (id: string, n: number): TranscriptMessage => ({
  id,
  role: 'activity',
  activityType: MEMORY_UPDATE,
  content: { memoryId: 'mem_1', spaceId: 'spc_1', action: 'changed' },
  at: at(n),
  entryId: id,
})
const card = (id: string, n: number): TranscriptMessage => ({
  id,
  role: 'activity',
  activityType: 'ayni.flow',
  content: { flowId: 'f1', state: 'completed' },
  at: at(n),
})

describe('memories and preferences (PROF-MEM-001, PROF-MEM-003)', () => {
  it('reads the memories newest first, with the conversation they came from when given', () => {
    const { memories, preferences } = memoriesOf({
      preferences: [
        { key: 'language', value: 'Answer in English', updatedAt: '2026-11-10T00:00:00Z' },
        { key: 'style', value: 'Answer in short, numbered steps', updatedAt: '2026-11-14T00:00:00Z' },
      ],
      memories: [
        {
          id: 'mem_1',
          spaceId: 'spc_1',
          content: 'Old',
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 'mem_2',
          spaceId: 'spc_1',
          content: 'New',
          createdAt: '2026-11-18T00:00:00Z',
          updatedAt: '2026-11-18T00:00:00Z',
          source: { conversationId: 'conv_1', title: 'Caliper check' },
        },
        { content: 'no id' },
      ],
    })
    expect(memories.map((m) => m.id)).toEqual(['mem_2', 'mem_1'])
    expect(memories[0].source).toEqual({ conversationId: 'conv_1', title: 'Caliper check' })
    expect(memories[1].source).toBeUndefined()
    expect(preferences.map((p) => p.key)).toEqual(['style', 'language'])
  })

  it('reads what the agent keeps about the person, with no attribute value', () => {
    const about = aboutMeOf({
      preferences: [{ key: 'language', value: 'Answer in English', updatedAt: '2026-11-10T00:00:00Z' }],
      memoriesBySpace: [
        { spaceId: 'spc_p', title: 'Personal', count: 4 },
        { spaceId: 'spc_1', title: 'Truck 14 recall', count: 4 },
      ],
      conversations: [{ spaceId: 'spc_p', title: 'Personal', count: 6, retentionDays: 90 }],
      verified: [
        { label: 'Employee badge', source: 'Northwind Logistics', verifiedAt: '2026-11-03T00:00:00Z', expiresAt: null },
      ],
    })
    expect(about.memoriesBySpace).toHaveLength(2)
    expect(about.conversations[0]).toEqual({ spaceId: 'spc_p', title: 'Personal', count: 6, retentionDays: 90 })
    expect(about.verified[0]).toEqual({
      label: 'Employee badge',
      source: 'Northwind Logistics',
      verifiedAt: '2026-11-03T00:00:00Z',
      expiresAt: null,
    })
    expect(aboutMeOf(undefined)).toEqual({ preferences: [], memoriesBySpace: [], conversations: [], verified: [] })
  })
})

describe('the line "<agent> updated a memory" (UI-CONV-035, PROF-STREAM-010, PROF-HIST-012)', () => {
  it('turns the live event into the line history gives, under its entry id', () => {
    const value = { conversationId: 'c1', entryId: 'ent_7', memoryId: 'mem_1', spaceId: 'spc_1', action: 'added' }
    expect(memoryLineOf(value, at(1))).toEqual({
      id: 'ent_7',
      role: 'activity',
      activityType: 'ayni.memory-update',
      content: { memoryId: 'mem_1', spaceId: 'spc_1', action: 'added' },
      at: at(1),
      entryId: 'ent_7',
    })
    expect(memoryLineOf({ memoryId: 'mem_1' }, at(1))).toBeNull()
    expect(memoryUpdateOf({ memoryId: 'm', spaceId: 's', action: 'removed' })).toEqual({
      memoryId: 'm',
      spaceId: 's',
      action: 'removed',
    })
    expect(memoryUpdateOf({})).toBeNull()
  })

  it('places a line that came while the agent worked after the last message of its reply', () => {
    const shown = placeMemoryLines([user('u1', 1), line('l1', 2), agent('a1', 3), agent('a2', 4), user('u2', 5)])
    expect(shown.map((m) => m.id)).toEqual(['u1', 'a1', 'a2', 'l1', 'u2'])
  })

  it('never moves a line past the person next message, nor after a card that follows the reply', () => {
    const shown = placeMemoryLines([user('u1', 1), agent('a1', 2), line('l1', 3), card('f1', 4), user('u2', 5)])
    expect(shown.map((m) => m.id)).toEqual(['u1', 'a1', 'l1', 'f1', 'u2'])
    const noReply = placeMemoryLines([user('u1', 1), line('l1', 2), user('u2', 3)])
    expect(noReply.map((m) => m.id)).toEqual(['u1', 'l1', 'u2'])
  })

  it('leaves a transcript with no line as it is', () => {
    const messages = [user('u1', 1), agent('a1', 2)]
    expect(placeMemoryLines(messages)).toBe(messages)
  })
})

describe('what a reply used (UI-CONV-034, PROF-HIST-011)', () => {
  it('reads it from a reply of the agent, and only when history said it', () => {
    expect(usageOf({ ...agent('a1', 1), usedMemories: ['mem_1'], usedPreferences: [] })).toEqual({
      memories: ['mem_1'],
      preferences: [],
    })
    expect(usageOf(agent('a1', 1))).toBeUndefined()
    expect(usageOf(user('u1', 1))).toBeUndefined()
  })

  it('groups the memories by space, a deleted one under the conversation space, as no longer kept', () => {
    const kept = memoriesOf({
      preferences: [{ key: 'style', value: 'Answer in short, numbered steps', updatedAt: '2026-11-14T00:00:00Z' }],
      memories: [
        { id: 'mem_1', spaceId: 'spc_1', content: 'Front calipers', createdAt: at(1), updatedAt: at(1) },
        { id: 'mem_3', spaceId: 'spc_2', content: 'Elsewhere', createdAt: at(1), updatedAt: at(1) },
      ],
    })
    const summary = usageSummaryOf(
      { memories: ['mem_1', 'mem_2', 'mem_3'], preferences: ['style', 'gone'] },
      kept,
      'spc_1'
    )
    expect(summary.bySpace.map((g) => [g.spaceId, g.memories.map((m) => m.id)])).toEqual([
      ['spc_1', ['mem_1', 'mem_2']],
      ['spc_2', ['mem_3']],
    ])
    expect(summary.bySpace[0].memories[1].memory).toBeUndefined()
    expect(summary.preferences.map((p) => [p.key, !!p.preference])).toEqual([
      ['style', true],
      ['gone', false],
    ])
  })
})
