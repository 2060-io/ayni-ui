import { describe, expect, it } from 'vitest'
import {
  bubbleSide,
  plainText,
  progressOf,
  QUICK_REACTIONS,
  REPLY_QUOTE_LENGTH,
  reactionPillOf,
  replyQuoteOf,
} from '../src/conversationDesign.js'

describe('what a conversation shows, the same in the browser and in the app', () => {
  it('a message sits on the side of who wrote it', () => {
    expect(bubbleSide('user')).toBe('mine')
    expect(bubbleSide('assistant')).toBe('theirs')
    expect(bubbleSide('system')).toBe('system')
  })

  it('strips the markdown markers of a message', () => {
    expect(plainText('## T\n> q\n***x*** <u>y</u> ~~z~~\n---\n- a')).toBe('T\nq\nx y z\n\n• a')
    expect(plainText('see [the page](https://ayni.org/x) and `code`')).toBe(
      'see the page (https://ayni.org/x) and code'
    )
  })

  it('a reply quotes the message as plain text, shortened, on the side of its author', () => {
    const long = `**Hello** ${'x'.repeat(400)}`
    const quote = replyQuoteOf({ id: 'm1', role: 'assistant', content: long })
    expect(quote.id).toBe('m1')
    expect(quote.role).toBe('assistant')
    expect(quote.text.startsWith('Hello x')).toBe(true)
    expect(quote.text.length).toBe(REPLY_QUOTE_LENGTH)
    expect(replyQuoteOf({ id: 'm2', role: 'user', content: 'Hi' })).toEqual({ id: 'm2', text: 'Hi', role: 'user' })
    // a system line quoted reads as the agent's
    expect(replyQuoteOf({ id: 'm3', role: 'system', content: 'Closed' }).role).toBe('assistant')
  })

  it('the pill of a message holds one reaction per person, the own one first', () => {
    expect(reactionPillOf(undefined, 'me')).toBeNull()
    expect(reactionPillOf([], 'me')).toBeNull()
    const pill = reactionPillOf(
      [
        { emoji: '👍', by: 'ana' },
        { emoji: '❤️', by: 'me' },
        { emoji: '😂', by: 'bo' },
      ],
      'me'
    )
    expect(pill?.mine).toBe('❤️')
    expect(pill?.emojis.map((r) => r.emoji)).toEqual(['❤️', '👍', '😂'])
    expect(pill?.emojis.map((r) => r.own)).toEqual([true, false, false])
    // nobody's own: the order they came, and no control
    const others = reactionPillOf([{ emoji: '👍', by: 'ana' }], undefined)
    expect(others?.mine).toBeUndefined()
    expect(others?.emojis).toEqual([{ emoji: '👍', by: 'ana', own: false }])
  })

  it('the quick row offers six reactions', () => {
    expect(QUICK_REACTIONS.map((r) => r.e)).toEqual(['❤️', '👍', '👎', '😂', '😮', '😢'])
  })
  it('says the agent is working from the start of a run until its reply streams, and names the steps it reports', () => {
    const none = { run: null, messages: [] }
    expect(progressOf(none)).toBeNull()
    expect(progressOf(undefined)).toBeNull()
    const started = { run: { steps: [] }, messages: [{ role: 'user' }] }
    expect(progressOf(started)).toEqual({ kind: 'thinking' })
    // an activity that streams nothing does not end the wait
    expect(progressOf({ run: { steps: [] }, messages: [{ role: 'activity', streaming: true }] })).toEqual({
      kind: 'thinking',
    })
    expect(progressOf({ run: { steps: ['Searching the registry'] }, messages: [] })).toEqual({
      kind: 'steps',
      steps: ['Searching the registry'],
    })
    // the reply is arriving: nothing more to say
    expect(progressOf({ run: { steps: [] }, messages: [{ role: 'assistant', streaming: true }] })).toBeNull()
  })
})
