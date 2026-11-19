/**
 * Deleting a message within a window (profile 3.3 §8, PROF-HIST-010, PROF-DESC-008; UI-CONV-017, UI-CONV-036): who
 * may delete what, until when, what leaves with it, and how it comes back when the agent refuses.
 */
import { describe, expect, it } from 'vitest'
import {
  canDeleteMessage,
  deletableUntil,
  deletionIdOf,
  deletionRefusalOf,
  deletionWindowOf,
  isPersonsMessage,
  turnToDelete,
  withRestored,
} from '../src/deletion.js'
import type { TranscriptMessage } from '../src/types.js'

const now = Date.parse('2026-11-18T10:10:00.000Z')
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
const user = (id: string, minutesAgo = 1, over: object = {}): TranscriptMessage => ({
  id,
  role: 'user',
  content: id,
  at: at(minutesAgo),
  ...over,
})
const agent = (id: string, minutesAgo = 1): TranscriptMessage => ({
  id,
  role: 'assistant',
  content: id,
  at: at(minutesAgo),
})
const activity = (
  id: string,
  activityType: string,
  content: Record<string, unknown>,
  entryId?: string
): TranscriptMessage => ({
  id,
  role: 'activity',
  activityType,
  content,
  at: at(1),
  ...(entryId ? { entryId } : {}),
})
const live = { windowSeconds: 600, online: true, live: true, now }

describe('the window the agent declares (PROF-DESC-008)', () => {
  it('is `erasure.windowSeconds`; nothing else is a window', () => {
    expect(deletionWindowOf({ erasure: { windowSeconds: 600 } })).toBe(600)
    // what a 3.2 agent declared: a UI does not know its window, and offers nothing
    expect(deletionWindowOf({ erasure: true })).toBeNull()
    expect(deletionWindowOf({ erasure: { windowSeconds: 0 } })).toBeNull()
    expect(deletionWindowOf({})).toBeNull()
    expect(deletionWindowOf(undefined)).toBeNull()
  })
})

describe('Delete in the menu of a message (UI-CONV-036)', () => {
  it('is offered on the person message younger than the window, online, on a live session', () => {
    expect(canDeleteMessage(user('u1', 1), live)).toBe(true)
    expect(canDeleteMessage(user('u1', 11), live)).toBe(false)
    expect(canDeleteMessage(user('u1', 1), { ...live, online: false })).toBe(false)
    expect(canDeleteMessage(user('u1', 1), { ...live, live: false })).toBe(false)
    expect(canDeleteMessage(user('u1', 1), { ...live, windowSeconds: null })).toBe(false)
  })

  it('is never offered on a message of the agent, nor on one not recorded yet', () => {
    expect(canDeleteMessage(agent('a1'), live)).toBe(false)
    expect(canDeleteMessage(user('u1', 1, { queued: true }), live)).toBe(false)
    expect(canDeleteMessage(user('u1', 1, { streaming: true }), live)).toBe(false)
  })

  it('takes the person media message too, by its entry', () => {
    const note = activity('att_1', 'ayni.attachment', { role: 'user', type: 'voice' }, 'ent_1')
    expect(isPersonsMessage(note)).toBe(true)
    expect(canDeleteMessage(note, live)).toBe(true)
    expect(deletionIdOf(note)).toBe('ent_1')
    expect(deletionIdOf(user('u_run1'))).toBe('u_run1')
    expect(canDeleteMessage(activity('att_2', 'ayni.attachment', { role: 'assistant' }, 'ent_2'), live)).toBe(false)
  })

  it('closes the window counted from the message time', () => {
    expect(deletableUntil(user('u1', 0), 600)).toBe(now + 600_000)
    expect(deletableUntil({ at: 'not a date' }, 600)).toBe(Number.NEGATIVE_INFINITY)
  })
})

describe('what leaves with the message (PROF-HIST-010)', () => {
  const messages: TranscriptMessage[] = [
    user('u0'),
    agent('a0'),
    user('u1'),
    activity('gen', 'ayni.generating', { entryId: 'x' }),
    agent('a1'),
    activity('mem', 'ayni.memory-update', { memoryId: 'm1' }, 'mem'),
    activity('flow', 'ayni.flow', { flowId: 'f1' }),
    activity('img', 'ayni.attachment', { role: 'assistant' }, 'ent_img'),
    user('u2'),
    agent('a2'),
  ]

  it('takes the reply of the agent to it, up to the person next message; the cards stay', () => {
    expect(turnToDelete(messages, 'u1').map((m) => m.id)).toEqual(['u1', 'gen', 'a1', 'mem', 'img'])
    expect(turnToDelete(messages, 'u2').map((m) => m.id)).toEqual(['u2', 'a2'])
    expect(turnToDelete(messages, 'nope')).toEqual([])
  })

  it('takes every attachment of a media message', () => {
    const media: TranscriptMessage[] = [
      activity('att_1', 'ayni.attachment', { role: 'user' }, 'ent_1'),
      activity('att_2', 'ayni.attachment', { role: 'user' }, 'ent_1'),
      agent('a1'),
      user('u2'),
    ]
    expect(turnToDelete(media, 'ent_1').map((m) => m.id)).toEqual(['att_1', 'att_2', 'a1'])
  })

  it('puts them back where they were when the agent refuses, what arrived since after them', () => {
    const removed = turnToDelete(messages, 'u1')
    const gone = new Set(removed.map((m) => m.id))
    const current = [...messages.filter((m) => !gone.has(m.id)), agent('a3')]
    expect(withRestored(current, removed, messages).map((m) => m.id)).toEqual([...messages.map((m) => m.id), 'a3'])
  })

  it('says why the agent refused', () => {
    expect(deletionRefusalOf({ status: 409, code: 'window-passed' })).toBe('windowPassed')
    expect(deletionRefusalOf({ status: 409, code: 'legal-hold' })).toBe('legalHold')
    expect(deletionRefusalOf({ status: 404, code: '404' })).toBe('refused')
    expect(deletionRefusalOf(undefined)).toBe('unreachable')
  })
})
