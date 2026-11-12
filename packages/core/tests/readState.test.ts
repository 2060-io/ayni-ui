/** The shared read state as a device uses it (D62, PROF-CONV-008, PROF-DESC-005). */
import { describe, expect, it } from 'vitest'
import { changedConversation, hasReadState, sendsViewed, unreadFrom, viewedIds } from '../src/readState.js'
import type { TranscriptMessage } from '../src/types.js'

describe('the shared read state', () => {
  it('a device reports what it shows for the audit trail or for the read marker', () => {
    expect(hasReadState({ features: { readState: true } })).toBe(true)
    expect(hasReadState({ features: { receipts: true } })).toBe(false)
    expect(hasReadState(undefined)).toBe(false)
    expect(sendsViewed({ features: { receipts: true } })).toBe(true)
    expect(sendsViewed({ features: { receipts: false, readState: true } })).toBe(true)
    expect(sendsViewed({ features: { receipts: false } })).toBe(false)
  })

  it("the count shown is the agent's, the device's own without one, and none for the conversation on screen", () => {
    expect(unreadFrom(0, 3, false)).toBe(0)
    expect(unreadFrom(2, 0, false)).toBe(2)
    // an agent that does not keep the read state lists no count: the device counts by itself
    expect(unreadFrom(undefined, 3, false)).toBe(3)
    // the conversation in front of the person is being reported as viewed: nothing is unread in it
    expect(unreadFrom(2, 3, true)).toBe(0)
  })

  it('reports what the agent said, shown whole, once, by the id the agent knows it under', () => {
    const at = '2026-11-12T10:00:00.000Z'
    const messages: TranscriptMessage[] = [
      { id: 'u_1', role: 'user', content: 'Hello', at },
      { id: 'msg_1', role: 'assistant', content: 'Hi', at },
      // an image the agent made: the transcript knows it by its attachment, the agent by its entry
      {
        id: 'att_1',
        role: 'activity',
        activityType: 'ayni.attachment',
        content: { role: 'assistant' },
        at,
        entryId: 'msg_2',
      },
      // one the person sent is not the agent's
      {
        id: 'att_2',
        role: 'activity',
        activityType: 'ayni.attachment',
        content: { role: 'user' },
        at,
        entryId: 'msg_3',
      },
      // still arriving: reported when it is whole
      { id: 'msg_4', role: 'assistant', content: 'Thin', at, streaming: true },
    ]
    expect(viewedIds(messages, new Set())).toEqual(['msg_1', 'msg_2'])
    expect(viewedIds(messages, new Set(['msg_1']))).toEqual(['msg_2'])
    expect(viewedIds(messages, new Set(['msg_1', 'msg_2']))).toEqual([])
  })

  it('reads what a conversation change says, and nothing from another event', () => {
    expect(
      changedConversation({
        type: 'CUSTOM',
        name: 'ayni.conversation.changed',
        value: { conversationId: 'c_1', title: 'Croq', state: 'active', unread: 2, readUpTo: 'msg_1' },
      })
    ).toEqual({ conversationId: 'c_1', title: 'Croq', state: 'active', unread: 2, readUpTo: 'msg_1' })
    // an agent that does not keep the read state sends no count
    expect(
      changedConversation({
        type: 'CUSTOM',
        name: 'ayni.conversation.changed',
        value: { conversationId: 'c_1', title: 'Croq', state: 'archived' },
      })
    ).toEqual({ conversationId: 'c_1', title: 'Croq', state: 'archived', unread: undefined, readUpTo: undefined })
    expect(changedConversation({ type: 'CUSTOM', name: 'ayni.reaction', value: {} })).toBeNull()
    expect(changedConversation({ type: 'RUN_STARTED' })).toBeNull()
  })
})
