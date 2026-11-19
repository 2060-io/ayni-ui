/**
 * Deleting a message within the window (UI-CONV-017, UI-CONV-036, UI-CONV-037; PROF-HIST-010): Delete, last, after a
 * rule, in red, on the person's own message while it is younger than `features.erasure.windowSeconds` and the browser
 * is online; gone from the open menu when the window passes; at once, with no confirmation, taking the agent's reply;
 * back with the reason when the agent refuses or cannot be reached; and a browser that was away lets go of what history
 * no longer returns.
 */
import type { TranscriptMessage } from '@ayni.org/ayni-ui-core'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Conversation } from '../src/components/Conversation.js'
import {
  click,
  fakeAgent,
  json,
  PERSONAL,
  record,
  render,
  SPACES,
  setup,
  tab,
  teardown,
  transcript,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()
const msg = (id: string, role: 'user' | 'assistant', secondsAgo = 60): TranscriptMessage => ({
  id,
  role,
  content: `${role} ${id}`,
  at: ago(secondsAgo),
})

async function open(options: { messages: TranscriptMessage[]; features?: Record<string, unknown>; online?: boolean }) {
  const hub = await tab({
    sessions: [record({ sessionId: 's1', spaceId: PERSONAL.id })],
    transcripts: [transcript('s1', options.messages)],
    spaces: SPACES,
    features: options.features,
    snapshot: { selectedSessionId: 's1', view: 'conversation', online: options.online ?? true },
  })
  const el = await render(hub, <Conversation />)
  return { hub, el }
}

/** Opens the menu of a message, as a right-click does, and returns its items. */
async function menuOf(el: HTMLElement, text: string): Promise<HTMLElement[]> {
  const row = [...el.querySelectorAll<HTMLElement>('.row')].find((r) => r.textContent?.includes(text))
  if (!row) throw new Error(`no message ${text}`)
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
  })
  return [...row.querySelectorAll<HTMLElement>('[role="menu"] > *')]
}
const labels = (items: HTMLElement[]) =>
  items.filter((i) => i.getAttribute('role') === 'menuitem').map((i) => i.textContent?.trim())

describe('Delete in the menu of a message (UI-CONV-017, UI-CONV-036)', () => {
  it('is offered last, after a rule, in red, on a message the person sent a minute ago', async () => {
    const { el } = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')] })
    const items = await menuOf(el, 'user u1')
    const last = items[items.length - 1]
    expect(last.textContent?.trim()).toBe('Delete')
    expect(last.classList.contains('danger')).toBe(true)
    expect(items[items.length - 2].classList.contains('separator')).toBe(true)
    expect(labels(items)).toEqual(['Reply', 'React', 'Copy text', 'Edit and resend', 'Message info', 'Delete'])
  })

  it('is not offered on a message of the agent', async () => {
    const { el } = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')] })
    expect(labels(await menuOf(el, 'assistant a1'))).not.toContain('Delete')
  })

  it('is not offered on a message older than the window', async () => {
    const { el } = await open({ messages: [msg('u1', 'user', 601), msg('a1', 'assistant', 600)] })
    expect(labels(await menuOf(el, 'user u1'))).not.toContain('Delete')
  })

  it('is not offered offline', async () => {
    const { el } = await open({ messages: [msg('u1', 'user')], online: false })
    expect(labels(await menuOf(el, 'user u1'))).not.toContain('Delete')
  })

  it('is not offered by an agent that declares no window, nor the `true` of a 3.2 agent', async () => {
    const none = await open({ messages: [msg('u1', 'user')], features: { erasure: undefined } })
    expect(labels(await menuOf(none.el, 'user u1'))).not.toContain('Delete')
    teardown()
    const older = await open({ messages: [msg('u1', 'user')], features: { erasure: true } })
    expect(labels(await menuOf(older.el, 'user u1'))).not.toContain('Delete')
  })

  it('leaves the open menu when the window passes', async () => {
    // the window closes a little after the menu opens
    const { el } = await open({ messages: [msg('u1', 'user', 599.7)] })
    const row = [...el.querySelectorAll<HTMLElement>('.row')][0]
    expect(labels(await menuOf(el, 'user u1'))).toContain('Delete')
    await until(() => !row.querySelector('[role="menuitem"].danger'), 3000)
    // the menu is still open, without Delete
    expect(labels([...row.querySelectorAll<HTMLElement>('[role="menu"] > *')])).toContain('Message info')
  })

  it('offers no other way to delete', async () => {
    const { el } = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')] })
    expect(el.querySelector('.tools [aria-label="Delete"]')).toBeNull()
    expect(el.textContent).not.toMatch(/erase/i)
  })
})

describe('deleting (UI-CONV-036, PROF-HIST-010)', () => {
  it('removes the message and the reply to it at once, with no confirmation, and asks the agent', async () => {
    let answer: (r: Response) => void = () => undefined
    const agent = fakeAgent([['DELETE /s1/messages/u1', () => new Promise<Response>((r) => (answer = r))]])
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const { hub, el } = await open({
      messages: [msg('u0', 'user', 120), msg('a0', 'assistant', 110), msg('u1', 'user'), msg('a1', 'assistant')],
    })
    const items = await menuOf(el, 'user u1')
    await click(items[items.length - 1])
    // gone before the agent answered
    await until(() => !el.textContent?.includes('user u1'))
    expect(el.textContent).not.toContain('assistant a1')
    expect(el.textContent).toContain('assistant a0')
    expect(confirm).not.toHaveBeenCalled()
    expect(agent.find('DELETE', '/s1/messages/u1')).toHaveLength(1)
    answer(new Response(null, { status: 204 }))
    await until(() => hub.getSnapshot().transcripts.s1.messages.length === 2)
    expect(hub.getSnapshot().transcripts.s1.messages.map((m) => m.id)).toEqual(['u0', 'a0'])
  })

  it('brings them back with the reason when the window passed on the agent', async () => {
    fakeAgent([['DELETE /s1/messages/u1', () => json({ error: 'window-passed' }, 409)]])
    const { hub, el } = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')] })
    const items = await menuOf(el, 'user u1')
    await click(items[items.length - 1])
    await until(() => hub.getSnapshot().notice !== null)
    expect(hub.getSnapshot().notice).toEqual({
      kind: 'error',
      text: 'The time to delete this message has passed: it is back.',
    })
    expect(hub.getSnapshot().transcripts.s1.messages.map((m) => m.id)).toEqual(['u1', 'a1'])
    expect(el.textContent).toContain('assistant a1')
  })

  it('brings them back when the message is on legal hold, or the agent cannot be reached', async () => {
    fakeAgent([['DELETE /s1/messages/u1', () => json({ error: 'legal-hold' }, 409)]])
    const held = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')] })
    await expect(held.hub.deleteMessage('s1', 'u1')).rejects.toThrow('This message is kept on legal hold: it is back.')
    expect(held.hub.getSnapshot().transcripts.s1.messages).toHaveLength(2)
    teardown()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    const offline = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')] })
    await expect(offline.hub.deleteMessage('s1', 'u1')).rejects.toThrow(
      'Fleet support could not be reached: the message is back.'
    )
    expect(offline.hub.getSnapshot().transcripts.s1.messages.map((m) => m.id)).toEqual(['u1', 'a1'])
  })

  it('the agent tells every device: its erased event takes them from the transcript (PROF-STREAM-008)', async () => {
    const { hub, el } = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')] })
    // @ts-expect-error private: an event of the agent on the session's stream
    await hub.onEvent(
      's1',
      { type: 'CUSTOM', name: 'ayni.messages.erased', value: { conversationId: 'conv_s1', messageIds: ['u1', 'a1'] } },
      undefined,
      false
    )
    await until(() => !el.querySelector('.row'))
    expect(hub.getSnapshot().transcripts.s1.messages).toEqual([])
  })
})

describe('a browser that was away (UI-CONV-037)', () => {
  it('lets go of a message and its reply deleted from the phone, when it reads history', async () => {
    const history = (id: string, role: string, at: string) => ({ id, role, content: id, metadata: { createdAt: at } })
    const messages = [
      msg('u1', 'user', 300),
      msg('a1', 'assistant', 290),
      msg('u2', 'user', 120),
      msg('a2', 'assistant', 110),
    ]
    fakeAgent([
      [
        /^GET \/s1\/messages/,
        () =>
          json({
            messages: [history('u1', 'user', messages[0].at), history('a1', 'assistant', messages[1].at)],
            nextBefore: null,
          }),
      ],
    ])
    const { hub, el } = await open({ messages })
    await hub.loadHistory('s1')
    await until(() => !el.textContent?.includes('user u2'))
    expect(hub.getSnapshot().transcripts.s1.messages.map((m) => m.id)).toEqual(['u1', 'a1'])
  })

  it('takes nothing from an agent that keeps no history', async () => {
    fakeAgent([[/^GET \/s1\/messages/, () => json({ messages: [], nextBefore: null })]])
    const { hub } = await open({ messages: [msg('u1', 'user'), msg('a1', 'assistant')], features: { history: false } })
    await hub.loadHistory('s1')
    expect(hub.getSnapshot().transcripts.s1.messages).toHaveLength(2)
  })
})
