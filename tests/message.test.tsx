/** Renders the message components in jsdom: toolbar, pill, quick bar, picker, menu, composer reply strip (UI-CONV-011/017/018). */
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

function hubWithConversation(): Hub {
  const hub = new Hub(config, { appName: 'Hologram' })
  const snap = hub.getSnapshot()
  const agent = {
    did: 'did:x',
    descriptorUrl: 'http://agent.test/agui',
    descriptor: {
      did: 'did:x',
      name: 'Northwind Support',
      profileVersion: '3.0',
      sessions: 'http://agent.test/agui/v3/sessions',
      features: { reactions: true, receipts: true, history: true, contextualMenu: true, approvals: true },
    } as never,
    name: 'Northwind Support',
    trust: {
      result: 'trusted' as const,
      checkedAt: '',
      did: 'did:x',
      reasons: [],
      operator: { kind: 'org', name: 'Northwind' },
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
    title: 'Refund INV-2094',
    createdAt: '2026-01-01T00:00:00.000Z',
    state: 'bound' as const,
    principal: { displayName: 'Ana', photoRef: undefined, backingIdentity: undefined } as never,
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: '',
    lastMessageAt: '',
    draft: '',
    hologram: null,
  }
  const transcript = {
    sessionId: 's1',
    messages: [
      {
        id: 'a1',
        role: 'assistant' as const,
        content: 'Order 4471 has **two** invoices.',
        at: '2026-01-01T00:00:01.000Z',
      },
      {
        id: 'u1',
        role: 'user' as const,
        content: 'Refund the duplicate.',
        at: '2026-01-01T00:00:02.000Z',
        replyTo: { id: 'a1', text: 'Order 4471 has two invoices.', role: 'assistant' as const },
      },
    ],
    oldestLoadedId: null,
    complete: true,
    run: null,
    routed: {},
    reactions: {
      a1: [{ emoji: '👍', by: 'Ana' }],
      u1: [{ emoji: '👀', by: 'Northwind Support' }],
    },
  }
  // @ts-expect-error private, set the in-memory snapshot directly for rendering
  hub.snapshot = {
    ...snap,
    ready: true,
    agents: [agent],
    sessions: [session],
    transcripts: { s1: transcript },
    selectedAgentDid: 'did:x',
    selectedSessionId: 's1',
    view: 'conversation',
    replyTo: { s1: { id: 'a1', text: 'Order 4471 has two invoices.', role: 'assistant' } },
    search: { s1: { query: 'invoice', current: 1 } },
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

describe('conversation surface', () => {
  it('renders bubbles with the same reaction pill on both sides, the reply quote and the reply strip', async () => {
    const el = await render(hubWithConversation())
    const pills = el.querySelectorAll('.pill')
    expect(pills.length).toBe(2)
    expect(el.querySelector('.row.theirs .pill.mine')?.textContent).toContain('👍')
    expect(el.querySelector('.row.mine .pill')?.textContent).toContain('👀')
    expect(el.querySelector('.msg.user .quote-text')?.textContent).toBe('Order 4471 has two invoices.')
    expect(el.querySelector('.reply-strip .reply-text')?.textContent).toBe('Order 4471 has two invoices.')
    expect(el.querySelector('.conv-sub')?.textContent).toContain('Northwind Support')
    expect(el.querySelector('.details-toggle')).not.toBeNull()
    expect(el.querySelectorAll('.tools').length).toBe(2)
  })

  it('opens the quick bar from the toolbar, the picker from its more button, and the menu from right-click', async () => {
    const hub = hubWithConversation()
    const el = await render(hub)
    const react = el.querySelector('.row.theirs .tools button') as HTMLButtonElement
    await act(async () => react.click())
    expect(el.querySelectorAll('.quick .quick-emoji').length).toBe(6)
    expect(el.querySelector('.quick .quick-emoji.mine')?.textContent).toBe('👍')
    const more = el.querySelector('.quick-more') as HTMLButtonElement
    await act(async () => more.click())
    expect(el.querySelector('.picker input')).not.toBeNull()
    expect(el.querySelectorAll('.picker-tabs button').length).toBe(6)
    await act(async () => {
      el.querySelector('.row.mine')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    const items = [...el.querySelectorAll('.row.mine [role="menuitem"]')].map((b) => b.textContent?.trim())
    expect(items).toEqual(['Reply', 'React', 'Copy text', 'Edit and resend', 'Message info'])
  })
})

describe('in-conversation search (UI-CONV-020)', () => {
  it('shows the count, marks every hit and singles out the current one', async () => {
    const el = await render(hubWithConversation())
    expect(el.querySelector('.search-bar .count')?.textContent).toBe('2 of 2')
    const marks = el.querySelectorAll('mark.hit')
    expect(marks.length).toBe(2)
    expect(el.querySelector('mark.hit.current')?.getAttribute('data-hit')).toBe('a1:1')
    expect(el.querySelector('.msg.assistant strong')?.textContent).toBe('two')
  })
})
