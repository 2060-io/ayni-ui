/**
 * Where a conversation's tool results came from (agent D100): the sources a reply used, in its Info, read from history
 * when the reply came live, and in a conversation shared with the space (UI-CONV-047, PROF-TOOL-010); the sources a
 * conversation holds, shown before it is shared, the person deciding (UI-CONV-048, PROF-TOOL-011); nothing asked of a
 * 3.3 agent (PROF-DESC-009).
 */
import type { TranscriptMessage } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ConversationRow } from '../src/components/Column.js'
import { MessageInfo } from '../src/components/Details.js'
import { SharedConversationView } from '../src/components/SharedConversation.js'
import {
  AGENT,
  byText,
  type Call,
  click,
  fakeAgent,
  json,
  record,
  render,
  SPACES,
  setup,
  TRUCK,
  tab,
  teardown,
  transcript,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const CRM = { source: 'relaticle', title: 'Relaticle CRM', account: 'space' }
const WEB = { source: 'web', title: 'Web search', account: 'agent' }
const reply = (over: Record<string, unknown> = {}): TranscriptMessage =>
  ({
    id: 'a1',
    role: 'assistant',
    content: 'Acme renews in March.',
    at: '2026-11-20T10:01:00.000Z',
    ...over,
  }) as TranscriptMessage
const history = (meta: Record<string, unknown>) => ({
  messages: [
    {
      id: 'a1',
      role: 'assistant',
      content: 'Acme renews in March.',
      metadata: { createdAt: '2026-11-20T10:01:00.000Z', ...meta },
    },
  ],
  nextBefore: null,
})

async function info(
  message: TranscriptMessage,
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][] = [],
  features: Record<string, unknown> = { tools: true }
) {
  const agent = fakeAgent(routes)
  const hub = await tab({
    sessions: [record({ sessionId: 's1' })],
    transcripts: [transcript('s1', [message])],
    spaces: SPACES,
    features,
    profileVersion: features.tools ? '3.4' : '3.3',
    snapshot: { selectedSessionId: 's1', inspect: { sessionId: 's1', messageId: 'a1' } },
  })
  const el = await render(hub, <MessageInfo />)
  const sources = () => el.querySelector('dd.sources')?.textContent
  return { hub, el, agent, sources }
}

describe("a reply's sources, in its Info (UI-CONV-047)", () => {
  it('lists them with whose account read them', async () => {
    const { sources, el } = await info(reply({ sources: [CRM, WEB] as never }))
    expect(sources()).toBe("Relaticle CRM, the space's account · Web search, Fleet support's account")
    expect(el.querySelector('dt.info-term')?.textContent).toBe('Sources')
  })

  it('reads them from history for a reply received live', async () => {
    const { sources, agent } = await info(reply(), [[/^GET \/s1\/messages/, () => json(history({ sources: [CRM] }))]])
    await until(() => sources() === "Relaticle CRM, the space's account")
    expect(agent.calls.filter((c) => c.url.includes('/s1/messages')).length).toBeGreaterThanOrEqual(1)
  })

  it('names no account for a source that needs none, and shows nothing for a reply that used no tool', async () => {
    const none = await info(reply({ sources: [{ source: 'calc', title: 'Calculator', account: 'none' }] as never }))
    expect(none.sources()).toBe('Calculator')
    teardown()
    const noTool = await info(reply(), [[/^GET \/s1\/messages/, () => json(history({}))]])
    await until(() => noTool.agent.calls.some((c) => c.url.includes('/s1/messages')))
    // read back: history says the reply used no tool
    const held = () => noTool.hub.getSnapshot().transcripts.s1?.messages[0] as { sources?: unknown } | undefined
    await until(() => Array.isArray(held()?.sources))
    expect(held()?.sources).toEqual([])
    expect(noTool.sources()).toBeUndefined()
    expect(noTool.el.textContent).not.toContain('Sources')
  })

  it('reads nothing from a 3.3 agent for it', async () => {
    const { agent, sources } = await info(reply(), [], { history: true })
    // the memories read history for their own reasons; nothing claims a source
    expect(sources()).toBeUndefined()
    expect(agent.calls.filter((c) => c.url.includes('/sources'))).toHaveLength(0)
  })
})

describe('a reply read in a conversation shared with the space (UI-CONV-047)', () => {
  it('lists the sources in its Info', async () => {
    fakeAgent([[/^GET \/spaces\/spc_truck14\/shared\/conv_9\/messages/, () => json(history({ sources: [CRM, WEB] }))]])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      features: { tools: true },
      profileVersion: '3.4',
      snapshot: {
        view: 'shared',
        sharedFor: {
          agentDid: AGENT,
          spaceId: TRUCK.id,
          conversation: {
            id: 'conv_9',
            title: 'Acme renewal',
            author: { name: 'Jonas Weber' },
            sharedAt: '2026-11-20T10:00:00Z',
            lastActivityAt: '2026-11-20T10:01:00Z',
          },
        },
      },
    })
    const el = await render(hub, <SharedConversationView />)
    await until(() => el.querySelector('.shared-info'))
    // nothing about sources under the reply
    expect(el.querySelector('.transcript')?.textContent).not.toContain('Relaticle')
    await click(el.querySelector('.shared-info'))
    await until(() => document.querySelector('[role="dialog"] dd.sources'))
    expect(document.querySelector('[role="dialog"] dd.sources')?.textContent).toBe(
      "Relaticle CRM, the space's account · Web search, Fleet support's account"
    )
  })
})

describe('the sources before sharing (UI-CONV-048)', () => {
  async function row(
    routes: [string | RegExp, (call: Call) => Response | Promise<Response>][],
    features: Record<string, unknown> = { tools: true }
  ) {
    const agent = fakeAgent(routes)
    const hub = await tab({
      sessions: [record({ sessionId: 's3', title: 'Acme renewal', spaceId: TRUCK.id })],
      spaces: SPACES,
      features,
      profileVersion: features.tools ? '3.4' : '3.3',
    })
    const el = await render(hub, <ConversationRow session={hub.getSnapshot().sessions[0]} selected={false} />)
    await click(el.querySelector('[aria-label="Agent options"]'))
    await click(byText(el, '[role="menuitem"]', 'Share with Truck 14 recall'))
    return { hub, el, agent }
  }
  const SHARE = 'POST /conversations/conv_s3/share'
  const SOURCES = 'GET /conversations/conv_s3/sources'
  const shared = () => json({ shared: true, sharedAt: '2026-11-20T10:00:00Z' })

  it('shows where the results came from before anything is shared; Share shares it', async () => {
    const { hub, agent } = await row([
      [
        SOURCES,
        () =>
          json({
            sources: [
              {
                source: 'relaticle',
                title: 'Relaticle CRM',
                account: { kind: 'space', space: { id: 'spc_truck14', title: 'Truck 14 recall' } },
                results: 3,
                lastAt: 'x',
              },
              { source: 'web', title: 'Web search', account: { kind: 'agent' }, results: 1, lastAt: 'y' },
            ],
          }),
      ],
      [SHARE, shared],
    ])
    await until(() => document.querySelector('[role="dialog"]'))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.querySelector('h2')?.textContent).toBe('Share with Truck 14 recall?')
    expect(dialog.querySelector('.share-holds')?.textContent).toBe('This conversation holds results read from:')
    expect([...dialog.querySelectorAll('.share-sources li')].map((li) => li.textContent)).toEqual([
      "Relaticle CRM, with the space's account · 3 results",
      "Web search, with Fleet support's account · 1 result",
    ])
    expect(dialog.querySelector('.share-members')?.textContent).toBe(
      'The members of Truck 14 recall will read the replies that used them.'
    )
    expect(agent.find('POST', '/conversations/conv_s3/share')).toHaveLength(0)
    await click(byText(dialog, 'button', 'Share'))
    await until(() => hub.getSnapshot().sessions[0].shared === true)
    expect(agent.find('POST', '/conversations/conv_s3/share')).toHaveLength(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Cancel leaves the conversation as it was', async () => {
    const { hub, agent } = await row([
      [
        SOURCES,
        () =>
          json({ sources: [{ source: 'relaticle', title: 'Relaticle CRM', account: { kind: 'none' }, results: 2 }] }),
      ],
      [SHARE, shared],
    ])
    await until(() => document.querySelector('[role="dialog"]'))
    expect(document.querySelector('.share-sources li')?.textContent).toBe('Relaticle CRM · 2 results')
    await click(byText(document.querySelector('[role="dialog"]') as HTMLElement, 'button', 'Cancel'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(agent.find('POST', '/conversations/conv_s3/share')).toHaveLength(0)
    expect(hub.getSnapshot().sessions[0].shared).toBeUndefined()
  })

  it('shares at once a conversation that holds no tool result', async () => {
    const { hub, agent } = await row([
      [SOURCES, () => json({ sources: [] })],
      [SHARE, shared],
    ])
    await until(() => hub.getSnapshot().sessions[0].shared === true)
    expect(agent.find('GET', '/conversations/conv_s3/sources')).toHaveLength(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shares nothing, and says so, when the sources cannot be read', async () => {
    const { hub, agent } = await row([
      [SOURCES, () => json({ error: 'unavailable' }, 503)],
      [SHARE, shared],
    ])
    await until(() => hub.getSnapshot().notice?.kind === 'error')
    expect(hub.getSnapshot().notice?.text).toBe(
      'The sources of this conversation could not be read. Nothing was shared.'
    )
    expect(agent.find('POST', '/conversations/conv_s3/share')).toHaveLength(0)
    expect(hub.getSnapshot().sessions[0].shared).toBeUndefined()
  })

  it('shares as before against a 3.3 agent, asking it for no sources', async () => {
    const { hub, agent } = await row([[SHARE, shared]], {})
    await until(() => hub.getSnapshot().sessions[0].shared === true)
    expect(agent.calls.filter((c) => c.url.includes('/sources'))).toHaveLength(0)
  })
})
