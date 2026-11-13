/**
 * A media message takes reactions and replies as a text does (UI-CONV-024): its reactions show on its last
 * attachment, its tools name its entry, and a reply to it is quoted by what it is.
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

const picture = (id: string) => ({
  id,
  role: 'activity' as const,
  activityType: 'ayni.attachment',
  content: { attachmentId: id, type: 'image', role: 'user', mimeType: 'image/jpeg', textRepr: '[file photo.jpg]' },
  at: '2026-01-01T00:00:01.000Z',
  // the two pictures were sent as one message
  entryId: 'msg_p',
})

function hubWithMedia(): Hub {
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
    title: 'Pictures',
    createdAt: '2026-01-01T00:00:00.000Z',
    state: 'bound' as const,
    principal: { displayName: 'Ana' } as never,
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: '',
    lastMessageAt: '',
    draft: '',
    ayni: null,
  }
  const transcript = {
    sessionId: 's1',
    messages: [
      picture('att_1'),
      picture('att_2'),
      {
        id: 'u2',
        role: 'user' as const,
        content: 'What do you see?',
        at: '2026-01-01T00:00:03.000Z',
        replyTo: { id: 'msg_p', text: '', role: 'user' as const, media: 'image' as const, filename: 'photo.jpg' },
      },
    ],
    oldestLoadedId: null,
    complete: true,
    run: null,
    routed: {},
    // made on the phone: kept under the message's entry
    reactions: { msg_p: [{ emoji: '❤️', by: 'Ana' }] },
  }
  // @ts-expect-error private, set the in-memory snapshot directly for rendering
  hub.snapshot = {
    ...hub.getSnapshot(),
    ready: true,
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

describe('a media message in the transcript', () => {
  it('shows its reactions once, on its last attachment, and a reply to it quoted by what it is', async () => {
    const hub = hubWithMedia()
    // the picture itself is not fetched here: the row is what is under test
    vi.spyOn(hub, 'attachmentBlob').mockRejectedValue(new Error('not fetched in this test'))
    const el = await render(hub)
    const rows = el.querySelectorAll('article.row')
    expect(rows.length).toBe(3)
    expect(el.querySelectorAll('.pill').length).toBe(1)
    expect(rows[0]?.querySelector('.pill')).toBeNull()
    expect(rows[1]?.querySelector('.pill')?.textContent).toContain('❤️')
    expect(el.querySelector('.msg.user .quote-text')?.textContent).toBe('Photo')
  })

  it('reacts to and replies to the message by its entry, never by an attachment', async () => {
    const hub = hubWithMedia()
    // the picture itself is not fetched here: the row is what is under test
    vi.spyOn(hub, 'attachmentBlob').mockRejectedValue(new Error('not fetched in this test'))
    const acted = vi.spyOn(hub, 'act').mockResolvedValue(undefined as never)
    const replied = vi.spyOn(hub, 'setReply').mockImplementation(() => undefined)
    vi.spyOn(hub, 'rememberEmoji').mockResolvedValue(undefined as never)
    const el = await render(hub)
    const first = el.querySelectorAll('article.row')[0] as HTMLElement
    // each attachment has the tools of a message
    expect(first.querySelector('.tools [aria-label="React"]')).not.toBeNull()
    await act(async () => (first.querySelector('.tools [aria-label="Reply"]') as HTMLButtonElement).click())
    expect(replied).toHaveBeenCalledWith('s1', { id: 'msg_p', text: '', role: 'user', media: 'image' })
    await act(async () => (first.querySelector('.tools [aria-label="React"]') as HTMLButtonElement).click())
    const quick = first.querySelector('.quick .quick-emoji') as HTMLButtonElement
    await act(async () => quick.click())
    expect(acted).toHaveBeenCalledWith('s1', expect.objectContaining({ kind: 'reaction', messageId: 'msg_p' }))
  })
})
