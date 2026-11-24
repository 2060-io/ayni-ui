/** Reactions and replies on a media message (UI-CONV-024, APP-MSG-005, PROF-RUN-009/010). */
import { describe, expect, it } from 'vitest'
import { isAttachment, lastAttachments, quoteLabel, quoteOf, targetIdOf } from '../src/mediaMessages.js'
import { emptyTranscript, mergeHistory, reactionsOf, reduce, toTranscriptMessage } from '../src/reducer.js'
import type { TranscriptMessage } from '../src/types.js'

const at = '2026-11-13T10:00:00.000Z'
const picture = (id: string, entryId: string, content: Record<string, unknown> = {}): TranscriptMessage => ({
  id,
  role: 'activity',
  activityType: 'ayni.attachment',
  content: { type: 'image', role: 'user', textRepr: '[file photo.jpg]', filename: 'photo.jpg', ...content },
  at,
  entryId,
})
const text: TranscriptMessage = { id: 'msg_1', role: 'assistant', content: 'A **bold** answer', at }

describe('a media message', () => {
  it('is named by the id of its entry, a text by its own', () => {
    expect(targetIdOf(picture('att_1', 'msg_9'))).toBe('msg_9')
    expect(targetIdOf(text)).toBe('msg_1')
    expect(isAttachment(picture('att_1', 'msg_9'))).toBe(true)
    expect(isAttachment(text)).toBe(false)
    // a card is not a media message
    expect(isAttachment({ id: 'f_1', role: 'activity', activityType: 'ayni.flow', content: {}, at })).toBe(false)
  })

  it('is quoted by what it is, with the words it has of its own', () => {
    expect(quoteOf(text)).toEqual({ id: 'msg_1', text: 'A bold answer', role: 'assistant' })
    expect(quoteOf(picture('att_1', 'msg_9') as never)).toEqual({
      id: 'msg_9',
      text: '',
      role: 'user',
      media: 'image',
      filename: 'photo.jpg',
    })
    const voice = picture('att_2', 'msg_8', {
      type: 'voice',
      role: 'assistant',
      textRepr: 'Call me back',
      filename: undefined,
    })
    expect(quoteOf(voice as never)).toEqual({ id: 'msg_8', text: 'Call me back', role: 'assistant', media: 'voice' })
  })

  it('shows in a quote as its words, else as what it is', () => {
    expect(quoteLabel({ id: 'm', text: 'My drawing', role: 'user', media: 'image' })).toBe('My drawing')
    expect(quoteLabel({ id: 'm', text: '', role: 'user', media: 'image', filename: 'photo.jpg' })).toBe('Photo')
    expect(quoteLabel({ id: 'm', text: '', role: 'user', media: 'file', filename: 'report.pdf' })).toBe('report.pdf')
    expect(quoteLabel({ id: 'm', text: '', role: 'user', media: 'voice' }, () => 'Note vocale')).toBe('Note vocale')
    expect(quoteLabel({ id: 'm', text: 'plain', role: 'user' })).toBe('plain')
  })

  it('keeps its reactions under its entry, from history as from a live event', () => {
    const page = [
      {
        id: 'att_1',
        role: 'activity',
        activityType: 'ayni.attachment',
        content: { type: 'image' },
        metadata: { entryId: 'msg_9', reactions: [{ emoji: '❤️', by: 'Ana' }] },
      },
      { id: 'msg_1', role: 'assistant', content: 'Hi', metadata: { reactions: [{ emoji: '👍', by: 'Ana' }] } },
    ]
    expect(reactionsOf(page)).toEqual({ msg_9: [{ emoji: '❤️', by: 'Ana' }], msg_1: [{ emoji: '👍', by: 'Ana' }] })
  })

  it('shows its reactions on its last attachment when it carries several', () => {
    const messages = [picture('att_1', 'msg_9'), picture('att_2', 'msg_9'), text, picture('att_3', 'msg_7')]
    expect(lastAttachments(messages)).toEqual(
      new Map([
        ['msg_9', 'att_2'],
        ['msg_7', 'att_3'],
      ])
    )
  })

  it('a reply read from history keeps what its quote is of', () => {
    const reply = toTranscriptMessage({
      id: 'msg_2',
      role: 'user',
      content: 'What is this?',
      metadata: { replyTo: { id: 'msg_9', text: '', role: 'user', media: 'image', filename: 'photo.jpg' } },
    })
    expect(reply.role !== 'activity' && reply.replyTo).toEqual({
      id: 'msg_9',
      text: '',
      role: 'user',
      media: 'image',
      filename: 'photo.jpg',
    })
  })
})

describe('a voice note and the words of the person (UI-MEDIA-007, PROF-MAP-006)', () => {
  const said = (id: string, content: string): TranscriptMessage => ({ id, role: 'user', content, at })

  it("drops none of the person's messages beside a note: the agent never gives its transcription as a text", () => {
    const page = [
      {
        id: 'att_1',
        role: 'activity',
        activityType: 'ayni.attachment',
        content: { type: 'voice', role: 'user', textRepr: 'Call me back', attachmentId: 'att_1' },
        metadata: { entryId: 'msg_1', createdAt: at },
      },
      { id: 'msg_1', role: 'user', content: 'Call me back', metadata: { createdAt: at } },
    ]
    expect(mergeHistory(emptyTranscript('s1'), page, null).messages.map((m) => m.id)).toEqual(['att_1', 'msg_1'])
    const held = { ...emptyTranscript('s1'), messages: [said('msg_1', 'Call me back')] }
    const session = { sessionId: 's1', agentDid: 'did:x', unreadCount: 0 } as never
    const next = reduce(held, session, {
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'att_1',
      activityType: 'ayni.attachment',
      content: { type: 'voice', role: 'user', textRepr: 'Call me back', attachmentId: 'att_1', entryId: 'msg_1' },
    } as never)
    expect(next.transcript.messages.map((m) => m.id)).toEqual(['msg_1', 'att_1'])
  })
})
