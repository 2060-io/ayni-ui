/**
 * What waits for the agent to finish answering, in the transcript and in the composer (UI-CONV-025): a message this
 * device sent is marked and can be withdrawn; one sent from another device shows here as waiting too; Send stays
 * beside Stop while the agent answers, against an agent that takes it.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Conversation } from '../src/components/Conversation.js'
import { initI18n } from '../src/i18n/index.js'
import { Hub } from '../src/state/hub.js'
import { HubContext } from '../src/state/useHub.js'

const config = {
  publicUrl: 'http://ui.test',
  singleAgent: false,
  trustPolicy: 'refuse' as const,
  trustRecheckIntervalSeconds: 600,
  veranaIndexerUrl: 'http://indexer.test',
  veranaGraphUrl: 'http://graph.test',
  allowedAgentOrigins: [],
  locales: ['en'],
  soundsEnabled: false,
  installPromptEnabled: false,
}
const at = '2026-01-01T00:00:01.000Z'

function hubWith(queue: boolean, draft = ''): Hub {
  const hub = new Hub(config, { appName: 'Ayni' })
  const agent = {
    did: 'did:x',
    descriptorUrl: 'http://agent.test/agui',
    descriptor: {
      did: 'did:x',
      name: 'Northwind Support',
      profileVersion: '3.1',
      sessions: 'http://agent.test/agui/v3/sessions',
      features: { reactions: true, receipts: false, history: true, contextualMenu: true, approvals: true, queue },
    } as never,
    name: 'Northwind Support',
    trust: {
      result: 'trusted' as const,
      checkedAt: '',
      did: 'did:x',
      reasons: [],
      operator: { kind: 'org', name: 'N' },
    },
    pinned: true,
    pinOrder: 1,
    addedAt: '',
    lastMessageAt: '',
  }
  const session = {
    sessionId: 's1',
    agentDid: 'did:x',
    sessionToken: 't',
    title: 'Talk',
    createdAt: '2026-01-01T00:00:00.000Z',
    state: 'bound' as const,
    principal: { displayName: 'Ana' } as never,
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: '',
    lastMessageAt: '',
    draft,
    // the agent's state: one message of this device waits, and one sent from the phone
    ayni: {
      contextualMenu: { items: [] },
      pendingApprovals: 0,
      generating: [],
      principal: null,
      waiting: queue
        ? [
            { runId: 'r2', sessionId: 's1', messageId: 'u_r2', text: 'and one more thing', attachments: 0, at },
            { runId: 'r3', sessionId: 's9', messageId: 'u_r3', text: 'typed on the phone', attachments: 0, at },
          ]
        : [],
    } as never,
  }
  const transcript = {
    sessionId: 's1',
    messages: [
      { id: 'u_r1', role: 'user' as const, content: 'First question', at },
      { id: 'm1', role: 'assistant' as const, content: 'Answering', at, streaming: true },
      { id: 'u_r2', role: 'user' as const, content: 'and one more thing', at },
    ],
    oldestLoadedId: null,
    complete: true,
    run: { runId: 'r1', steps: [], log: [] },
    routed: {},
    reactions: {},
  }
  // @ts-expect-error private, set the in-memory snapshot directly for rendering
  hub.snapshot = {
    ...hub.getSnapshot(),
    ready: true,
    online: true,
    agents: [agent],
    sessions: [session],
    transcripts: { s1: transcript },
    selectedAgentDid: 'did:x',
    selectedSessionId: 's1',
    view: 'conversation',
  }
  return hub
}

let root: Root | undefined
let host: HTMLDivElement | undefined

beforeAll(() => {
  initI18n(['en'], 'en', 'en')
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.restoreAllMocks()
})

async function render(hub: Hub): Promise<HTMLDivElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <HubContext.Provider value={hub}>
        <Conversation />
      </HubContext.Provider>
    )
  })
  return host
}
const rows = (el: HTMLElement) => [...el.querySelectorAll('article.row')] as HTMLElement[]

describe('what waits, in the transcript', () => {
  it('marks the message this device sent and lets it be withdrawn', async () => {
    const hub = hubWith(true)
    const withdraw = vi.spyOn(hub, 'withdraw').mockResolvedValue()
    const el = await render(hub)
    const mine = rows(el).find((r) => r.textContent?.includes('and one more thing'))
    expect(mine?.querySelector('.waiting')?.textContent).toBe('Waiting')
    // the first message was taken long ago: no mark on it
    expect(
      rows(el)
        .find((r) => r.textContent?.includes('First question'))
        ?.querySelector('.waiting')
    ).toBeNull()

    const button = mine?.querySelector('button[aria-label="Withdraw this message"]') as HTMLButtonElement
    expect(button).toBeTruthy()
    await act(async () => button.click())
    expect(withdraw).toHaveBeenCalledWith('s1', 'r2')
  })

  it('shows a message sent from another device as waiting too, with nothing to withdraw it', async () => {
    const el = await render(hubWith(true))
    const all = rows(el)
    const theirs = all.find((r) => r.textContent?.includes('typed on the phone'))
    expect(theirs?.classList.contains('mine')).toBe(true)
    expect(theirs?.querySelector('.waiting')?.textContent).toBe('Waiting')
    expect(theirs?.querySelector('button[aria-label="Withdraw this message"]')).toBeNull()
    // after everything this device holds
    expect(all.indexOf(theirs as HTMLElement)).toBe(all.length - 1)
  })
})

describe('the composer while the agent answers', () => {
  const stop = (el: HTMLElement) => el.querySelector('button[aria-label="Stop"]')
  const send = (el: HTMLElement) => el.querySelector('button[aria-label="Send"]') as HTMLButtonElement | null

  it('keeps Stop, and offers Send beside it once there is something to send', async () => {
    const empty = await render(hubWith(true))
    expect(stop(empty)).toBeTruthy()
    expect(send(empty)).toBeNull()
    act(() => root?.unmount())
    host?.remove()

    const typed = await render(hubWith(true, 'while you think, also this'))
    expect(stop(typed)).toBeTruthy()
    expect(send(typed)?.disabled).toBe(false)
  })

  it('offers no Send during a run against an agent that does not take it', async () => {
    const el = await render(hubWith(false, 'while you think, also this'))
    expect(stop(el)).toBeTruthy()
    expect(send(el)).toBeNull()
  })
})
