/**
 * The context of a conversation under the message form (UI-CONV-026): `Context <used> / <max>`, with the cached part
 * when there is one, once the agent published a figure; no line before.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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
const at = '2026-11-18T05:15:36.247Z'

function hubWith(context?: Record<string, unknown>): Hub {
  const hub = new Hub(config, { appName: 'Ayni' })
  const agent = {
    did: 'did:x',
    descriptorUrl: 'http://agent.test/agui',
    descriptor: {
      did: 'did:x',
      name: 'Northwind Support',
      profileVersion: '3.1',
      sessions: 'http://agent.test/agui/v3/sessions',
      features: { reactions: true, receipts: false, history: true, contextualMenu: true, approvals: true },
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
    createdAt: '2026-11-18T05:00:00.000Z',
    state: 'bound' as const,
    principal: { displayName: 'Ana' } as never,
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: '',
    lastMessageAt: '',
    draft: '',
    ayni: {
      contextualMenu: { items: [] },
      pendingApprovals: 0,
      generating: [],
      principal: null,
      ...(context ? { context } : {}),
    } as never,
  }
  const transcript = {
    sessionId: 's1',
    messages: [
      { id: 'msg_1', role: 'user' as const, content: 'Hello', at },
      { id: 'msg_2', role: 'assistant' as const, content: 'Hi Ana', at },
    ],
    oldestLoadedId: null,
    complete: true,
    run: null,
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
const line = (el: HTMLElement) => el.querySelector('.context-line')

describe('the context line under the message form', () => {
  it('reads the used, the maximum and the cached part', async () => {
    const el = await render(hubWith({ used: 6214, cached: 4096, max: 100000, at }))
    expect(line(el)?.textContent).toBe('Context 6.2k / 100k · 4.1k cached')
    // just below the message form
    expect(el.querySelector('.composer')?.nextElementSibling).toBe(line(el))
  })

  it('leaves the cached part out when nothing was served from the cache', async () => {
    const el = await render(hubWith({ used: 6214, cached: 0, max: 100000, at }))
    expect(line(el)?.textContent).toBe('Context 6.2k / 100k')
  })

  it('shows no line before the agent published a figure', async () => {
    const el = await render(hubWith())
    expect(el.querySelector('.composer')).toBeTruthy()
    expect(line(el)).toBeNull()
  })
})
