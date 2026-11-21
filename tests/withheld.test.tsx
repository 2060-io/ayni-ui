/**
 * A message of the person that the AI never received (UI-CONV-044, D95; profile PROF-STREAM-011, PROF-HIST-013): the
 * service's code took it, as it takes the address and the code of an email check. Its bubble is the person's with no
 * fill and an edge, "Not shared with the AI" before the time; from history's `metadata.modelVisible: false`, and live
 * from `ayni.messages.withheld`, by the id this browser gave the message or by the agent's. Its Info says only the
 * service's code read it. What the service's code wrote stays an ordinary bubble of the agent.
 */
import type { TranscriptMessage } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Conversation } from '../src/components/Conversation.js'
import { MessageInfo } from '../src/components/Details.js'
import {
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

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const said = (id: string, role: 'user' | 'assistant', content: string, minutesAgo = 1): TranscriptMessage => ({
  id,
  role,
  content,
  at: at(minutesAgo),
})

async function open(messages: TranscriptMessage[]) {
  const hub = await tab({
    sessions: [record({ sessionId: 's1', spaceId: PERSONAL.id })],
    transcripts: [transcript('s1', messages)],
    spaces: SPACES,
    snapshot: { selectedSessionId: 's1', view: 'conversation' },
  })
  const el = await render(hub, <Conversation />)
  return { hub, el }
}

/** The bubble that says this. */
const bubble = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll<HTMLElement>('.msg')].find((m) => m.querySelector('.body')?.textContent === text)

/** The agent's event on the session's stream, as the hub receives it. */
async function withheld(hub: Awaited<ReturnType<typeof open>>['hub'], value: Record<string, unknown>) {
  // @ts-expect-error private: an event of the agent on the session's stream
  await hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.messages.withheld', value }, undefined, true)
}

describe('a message of the person the AI never received (UI-CONV-044)', () => {
  it('from history: metadata.modelVisible false draws the outline, "Not shared with the AI" before the time', async () => {
    const created = (minutesAgo: number) => ({ createdAt: at(minutesAgo) })
    fakeAgent([
      [
        /^GET \/s1\/messages/,
        () =>
          json({
            messages: [
              { id: 'msg_1', role: 'user', content: 'Send me my badge', metadata: created(4) },
              { id: 'msg_2', role: 'assistant', content: 'What is your work email?', metadata: created(3) },
              {
                id: 'msg_3',
                role: 'user',
                content: 'ana.rios@northwind.example',
                metadata: { ...created(2), modelVisible: false },
              },
              { id: 'msg_4', role: 'assistant', content: 'A code is on its way.', metadata: created(1) },
            ],
            nextBefore: null,
          }),
      ],
    ])
    const { hub, el } = await open([])
    await hub.loadHistory('s1')
    await until(() => el.querySelectorAll('.msg').length === 4)
    const taken = bubble(el, 'ana.rios@northwind.example')
    expect(taken?.className).toBe('msg user withheld')
    const meta = taken?.querySelector('.meta')
    expect(meta?.querySelector('.withheld-label')?.textContent).toBe('Not shared with the AI')
    expect(meta?.querySelector('.withheld-label svg')?.getAttribute('aria-hidden')).toBe('true')
    // the label, then the time; a date comes first when the message is not of today, as just after midnight (it
    // was created two minutes ago)
    expect(meta?.textContent).toMatch(/^Not shared with the AI·([A-Z][a-z]{2} \d{1,2}, )?\d/)
    // the person's other message, and what the service's code wrote, stay as they are
    expect(bubble(el, 'Send me my badge')?.className).toBe('msg user')
    expect(bubble(el, 'A code is on its way.')?.className).toBe('msg assistant')
    expect(el.querySelectorAll('.withheld-label')).toHaveLength(1)
  })

  it('live: the event turns a bubble already drawn into the outline, by the id this browser gave it', async () => {
    const { hub, el } = await open([
      said('msg_2', 'assistant', 'What is your work email?', 2),
      said('u_run-7', 'user', 'ana.rios@northwind.example'),
    ])
    expect(bubble(el, 'ana.rios@northwind.example')?.className).toBe('msg user')
    await withheld(hub, { conversationId: 'conv_s1', messageIds: ['msg_3'], clientIds: ['u_run-7'] })
    await until(() => bubble(el, 'ana.rios@northwind.example')?.classList.contains('withheld'))
    expect(bubble(el, 'ana.rios@northwind.example')?.textContent).toContain('Not shared with the AI')
  })

  it("live: the event names a message from the person's other device by the agent's id", async () => {
    const { hub, el } = await open([said('msg_2', 'assistant', 'Type the code', 2), said('msg_5', 'user', '482913')])
    // clientIds is optional: another device's message has none here
    await withheld(hub, { conversationId: 'conv_s1', messageIds: ['msg_5'] })
    await until(() => bubble(el, '482913')?.classList.contains('withheld'))
    // the agent's message the event might name stays the agent's
    await withheld(hub, { conversationId: 'conv_s1', messageIds: ['msg_2'] })
    expect(bubble(el, 'Type the code')?.className).toBe('msg assistant')
  })

  it('an event of another conversation changes nothing', async () => {
    const { hub, el } = await open([said('msg_5', 'user', '482913')])
    await withheld(hub, { conversationId: 'conv_other', messageIds: ['msg_5'] })
    expect(bubble(el, '482913')?.className).toBe('msg user')
  })

  it("its Info says that only the service's code read it", async () => {
    const message = { ...said('msg_3', 'user', 'ana.rios@northwind.example'), modelVisible: false as const }
    const hub = await tab({
      sessions: [record({ sessionId: 's1', spaceId: PERSONAL.id })],
      transcripts: [transcript('s1', [message, said('msg_6', 'user', 'Thanks', 0)])],
      spaces: SPACES,
      snapshot: { selectedSessionId: 's1', inspect: { sessionId: 's1', messageId: 'msg_3' } },
    })
    const el = await render(hub, <MessageInfo />)
    expect(el.querySelector('.withheld-note')?.textContent).toBe(
      "Only the service's code read this. It was not shared with the AI."
    )
    teardown()
    const plain = await tab({
      sessions: [record({ sessionId: 's1', spaceId: PERSONAL.id })],
      transcripts: [transcript('s1', [message, said('msg_6', 'user', 'Thanks', 0)])],
      spaces: SPACES,
      snapshot: { selectedSessionId: 's1', inspect: { sessionId: 's1', messageId: 'msg_6' } },
    })
    const other = await render(plain, <MessageInfo />)
    expect(other.querySelector('.withheld-note')).toBeNull()
  })
})
