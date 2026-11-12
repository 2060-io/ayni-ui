/**
 * A browser is linked to an agent while it holds the agent's device pairing (UI-AGENTS-007): its sessions close
 * when idle and the next action opens one silently, so "Not linked" was shown for a browser that could use
 * every conversation.
 */
import type { AgentRecord, SessionRecord } from '@ayni.org/ayni-ui-core'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Column } from '../src/components/Column.js'
import { initI18n } from '../src/i18n/index.js'
import { Hub } from '../src/state/hub.js'
import { linkOf } from '../src/state/link.js'
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

const AGENT = 'did:web:agent.test'

function agent(over: Partial<AgentRecord> = {}): AgentRecord {
  return {
    did: AGENT,
    descriptorUrl: 'https://agent.test/agent.json',
    descriptor: { name: 'Acme Support' } as AgentRecord['descriptor'],
    name: 'Acme Support',
    trust: { result: 'trusted', checkedAt: '2026-11-01T10:00:00.000Z', did: AGENT },
    controllerDid: 'did:a',
    pinned: false,
    pinOrder: 0,
    addedAt: '2026-11-01T10:00:00.000Z',
    lastMessageAt: '2026-11-02T10:00:00.000Z',
    ...over,
  } as AgentRecord
}

function session(sessionId: string, over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId,
    agentDid: AGENT,
    sessionToken: null,
    title: 'First talk',
    createdAt: '2026-11-02T09:00:00.000Z',
    state: 'closed',
    closedReason: 'idle-timeout',
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: 'Hello',
    lastMessageAt: '2026-11-02T10:00:00.000Z',
    draft: '',
    ayni: null,
    conversationId: 'c_1',
    ...over,
  } as SessionRecord
}

const principal = { displayName: 'Ada' } as SessionRecord['principal']
const paired = { deviceHandle: 'dev_1', deviceSecret: 'dsk_1' }

describe('whether a browser is linked to an agent', () => {
  it('is linked while it holds the pairing, with no session open', () => {
    // every session closed by the idle timeout: the next click opens one silently
    expect(linkOf(agent({ ...paired, linkedAt: '2026-11-01T12:00:00.000Z' }), [session('s_1')])).toEqual({
      linked: true,
      since: '2026-11-01T12:00:00.000Z',
    })
    // a pairing made before the time was kept: linked, the time unknown
    expect(linkOf(agent(paired), [session('s_1')])).toEqual({ linked: true, since: undefined })
  })

  it('is linked while a session is bound, and not linked with neither', () => {
    const bound = session('s_2', {
      state: 'bound',
      sessionToken: 't',
      principal,
      createdAt: '2026-11-03T08:00:00.000Z',
    })
    expect(linkOf(agent(), [session('s_1'), bound])).toEqual({ linked: true, since: '2026-11-03T08:00:00.000Z' })
    expect(linkOf(agent(), [session('s_1')])).toEqual({ linked: false })
    // a handle whose secret the agent refused is no pairing: the phone is needed again
    expect(linkOf(agent({ deviceHandle: 'dev_1' }), [session('s_1', { state: 'provisional' })])).toEqual({
      linked: false,
    })
  })

  it('ignores the sessions of another agent', () => {
    const other = session('s_9', { agentDid: 'did:web:other.test', state: 'bound', sessionToken: 't', principal })
    expect(linkOf(agent(), [other])).toEqual({ linked: false })
  })
})

describe('the agent card', () => {
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

  async function card(record: AgentRecord, sessions: SessionRecord[]): Promise<HTMLDivElement> {
    const hub = new Hub(config, { appName: 'Ayni' })
    // @ts-expect-error private, set the in-memory snapshot directly for rendering
    hub.snapshot = {
      ...hub.getSnapshot(),
      ready: true,
      controllers: [{ did: 'did:a', kind: 'organization' as const, name: 'Acme', pinned: false, pinOrder: 0 }],
      agents: [record],
      sessions,
      selectedControllerDid: 'did:a',
      selectedAgentDid: AGENT,
      expandedAgents: { [AGENT]: true },
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <HubContext.Provider value={hub}>
          <Column />
        </HubContext.Provider>
      )
    })
    return host
  }

  it('says linked for a paired browser whose sessions all closed, and offers its devices', async () => {
    const el = await card(agent({ ...paired, linkedAt: '2026-11-01T12:00:00.000Z' }), [session('s_1')])
    const state = el.querySelector('.agent-meta .state')?.textContent ?? ''
    expect(state).toContain('Linked via your phone since')
    expect(state).not.toContain('Not linked')
    await act(async () => (el.querySelector('button[aria-label="Agent options"]') as HTMLButtonElement).click())
    const items = [...el.querySelectorAll('.menu-popover [role="menuitem"]')].map((i) => i.textContent)
    expect(items).toContain('Linked devices')
    expect(items).not.toContain('Link again')
  })

  it('says not linked for a browser that holds no pairing and no bound session', async () => {
    const el = await card(agent(), [session('s_1')])
    expect(el.querySelector('.agent-meta .state')?.textContent).toContain('Not linked')
  })
})
