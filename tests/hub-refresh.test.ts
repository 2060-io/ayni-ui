/**
 * A linked browser stays level with the agent without the phone (UI-SESS-016). Its sessions close when idle;
 * until one opened again it showed the list and the conversation as they were when it last looked, while the
 * person's other devices had moved on. It now reads the list at load, when the tab comes back and when a closed
 * conversation is selected, opening a session silently (PROF-SESS-015): the phone is never asked.
 */
import { MemoryDeviceStore, type SessionRecord } from '@ayni.org/ayni-ui-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hub } from '../src/state/hub.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** The agent: device dev_1 is paired with secret dsk_1, and the person's conversation c1 moved on elsewhere. */
function fakeAgent() {
  const state = {
    secret: 'dsk_1',
    /** provisional sessions created for a known device: each one is a question on the person's phone */
    phoneAsked: 0,
    calls: [] as string[],
    sessions: new Map<string, { state: 'bound' | 'closed'; conversationId: string }>(),
    conversations: [
      {
        id: 'c1',
        title: 'crok amour',
        state: 'active',
        createdAt: '2026-11-11T10:00:00.000Z',
        lastActivityAt: '2026-11-12T13:13:38.000Z',
        lastPreview: 'Salut ! Comment puis-je vous aider ?',
      },
    ],
  }
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = (init?.headers ?? {}) as Record<string, string>
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const token = headers.authorization?.replace('Bearer ', '')
    const byToken = [...state.sessions.entries()].find(([id]) => `t_${id}` === token)
    await wait(1)
    if (url.startsWith('http://indexer.test/'))
      return json({
        did: 'did:x',
        trusted: true,
        ecsCredentials: [
          { ecsSchema: 'ServiceCredential', credentialSubject: { name: 'Agent', type: 'AIAgent' } },
          { ecsSchema: 'OrganizationCredential', credentialSubject: { name: 'Org', countryCode: 'EE' } },
        ],
      })
    if (url === SESSIONS && method === 'POST') {
      const id = `s${state.sessions.size + 1}`
      const conversationId = (body.conversationId as string | undefined) ?? 'c1'
      const common = { sessionId: id, sessionToken: `t_${id}`, idleTimeoutSeconds: 1800 }
      if (token) {
        if (byToken?.[1].state !== 'bound') return json({ error: 'closed', reason: 'idle-timeout' }, 410)
        state.calls.push(`sibling ${conversationId}`)
        state.sessions.set(id, { state: 'bound', conversationId })
        return json({ ...common, state: 'bound', conversationId, principal: { displayName: 'Ana' } }, 201)
      }
      if (body.deviceHandle === 'dev_1' && body.deviceProof === state.secret) {
        state.secret = `dsk_${state.sessions.size + 2}`
        state.calls.push(`proof ${conversationId}${body.silent ? ' silent' : ''}`)
        state.sessions.set(id, { state: 'bound', conversationId })
        return json(
          {
            ...common,
            state: 'bound',
            conversationId,
            principal: { displayName: 'Ana' },
            deviceHandle: 'dev_1',
            deviceSecret: state.secret,
          },
          201
        )
      }
      if (body.silent) {
        state.calls.push('refused silently')
        return json({ error: 'pairing-invalid', message: 'no session without the phone' }, 409)
      }
      state.phoneAsked++
      return json({ ...common, state: 'provisional', pairing: 'invalid', rebind: 'asked' }, 201)
    }
    if (url === `${SESSIONS}/conversations` && method === 'GET') {
      if (byToken?.[1].state !== 'bound') return json({ error: 'closed', reason: 'idle-timeout' }, 410)
      state.calls.push('list')
      return json({ conversations: state.conversations })
    }
    const m = url.match(/\/sessions\/(s\d+)(\/[a-z]+)?/)
    if (m) {
      const [, id, rest = ''] = m
      const s = state.sessions.get(id as string)
      if (!s) return json({ error: 'not-found' }, 404)
      if (s.state === 'closed') return json({ error: 'closed', reason: 'idle-timeout' }, 410)
      if (rest === '' && method === 'GET')
        return json({ state: s.state, principal: { displayName: 'Ana' }, conversationId: s.conversationId })
      if (rest === '/stream')
        return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      if (rest === '/messages')
        return json({
          messages: [{ id: 'm_new', role: 'assistant', content: 'Salut ! Comment puis-je vous aider ?' }],
          nextBefore: null,
        })
    }
    return json({ error: 'not-found', message: url }, 404)
  }
  return { state, fetchFn }
}

const bus = {
  tabId: 'tab',
  post: () => undefined,
  subscribe: () => () => undefined,
  tryLead: async (_id: string, run: (release: () => void) => Promise<void>) => {
    void run(() => undefined)
    return true
  },
  close: () => undefined,
}

/** What this browser held of c1 when it last looked: an older title, an older last message, a closed session. */
const held: SessionRecord = {
  sessionId: 'old_1',
  agentDid: 'did:x',
  sessionToken: null,
  title: 'Hey',
  createdAt: '2026-11-11T10:00:00.000Z',
  state: 'closed',
  closedReason: 'idle-timeout',
  lastEventId: 0,
  unreadCount: 0,
  lastPreview: 'Oups, désolé !',
  lastMessageAt: '2026-11-12T02:23:28.000Z',
  draft: '',
  ayni: null,
  conversationId: 'c1',
}

async function tab(
  agent: ReturnType<typeof fakeAgent>,
  options: { paired?: boolean; sessions?: SessionRecord[] } = {}
) {
  vi.stubGlobal('fetch', agent.fetchFn)
  const hub = new Hub(config, { appName: 'Ayni' })
  const store = new MemoryDeviceStore()
  // @ts-expect-error private: the store and the bus of a test tab
  hub.store = store
  // @ts-expect-error private
  hub.bus = bus
  await store.putAgent({
    did: 'did:x',
    descriptorUrl: 'http://agent.test/agui',
    descriptor: { did: 'did:x', name: 'Agent', profileVersion: '3.1', sessions: SESSIONS, features: {} } as never,
    name: 'Agent',
    trust: { result: 'trusted', checkedAt: '', did: 'did:x', reasons: [] } as never,
    pinned: true,
    pinOrder: 1,
    addedAt: '',
    lastMessageAt: '',
    ...(options.paired === false ? {} : { deviceHandle: 'dev_1', deviceSecret: 'dsk_1' }),
  })
  for (const s of options.sessions ?? [held]) await store.putSession(s)
  await hub.reload()
  const row = () => hub.getSnapshot().sessions.find((s) => s.conversationId === 'c1')
  return { hub, store, row }
}

describe('a linked browser stays level with the agent (UI-SESS-016)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('with every session closed it reads the list through a session opened silently', async () => {
    const agent = fakeAgent()
    const { hub, store, row } = await tab(agent)
    await hub.refresh('did:x')
    expect(agent.state.calls).toEqual(['proof c1 silent', 'list'])
    expect(agent.state.phoneAsked).toBe(0)
    // the row reads as the agent has it, and it is still one row
    expect(hub.getSnapshot().sessions.filter((s) => s.conversationId === 'c1')).toHaveLength(1)
    expect(row()).toMatchObject({
      title: 'crok amour',
      lastPreview: 'Salut ! Comment puis-je vous aider ?',
      lastMessageAt: '2026-11-12T13:13:38.000Z',
      state: 'bound',
    })
    // nothing the person was looking at changed
    expect(hub.getSnapshot().selectedSessionId).toBeNull()
    expect((await store.listAgents())[0]?.deviceSecret).toBe(agent.state.secret)
  })

  it('a closed conversation that is selected gets a session again, and keeps its place until the list is read', async () => {
    const agent = fakeAgent()
    const { hub, row } = await tab(agent)
    hub.selectSession('old_1')
    await vi.waitFor(() => expect(row()?.state).toBe('bound'))
    await vi.waitFor(() => expect(row()?.title).toBe('crok amour'))
    expect(agent.state.calls).toContain('proof c1 silent')
    expect(agent.state.phoneAsked).toBe(0)
    // the conversation on screen is still the one on screen, on its new session
    expect(hub.getSnapshot().selectedSessionId).toBe(row()?.sessionId)
    expect(row()?.lastMessageAt).toBe('2026-11-12T13:13:38.000Z')
  })

  it('two refreshes asked at once are one', async () => {
    const agent = fakeAgent()
    const { hub } = await tab(agent)
    await Promise.all([hub.refresh('did:x'), hub.refresh('did:x')])
    expect(agent.state.calls.filter((c) => c.startsWith('proof'))).toHaveLength(1)
  })

  it('a session the agent closed while the tab was away is found closed, and the list is read all the same', async () => {
    const agent = fakeAgent()
    agent.state.sessions.set('s1', { state: 'closed', conversationId: 'c1' })
    const stale: SessionRecord = {
      ...held,
      sessionId: 's1',
      state: 'bound',
      sessionToken: 't_s1',
      closedReason: undefined,
    }
    const { hub, row } = await tab(agent, { sessions: [stale] })
    await hub.refresh('did:x')
    expect(agent.state.calls).toEqual(['proof c1 silent', 'list'])
    expect(row()).toMatchObject({ title: 'crok amour', state: 'bound' })
    expect(agent.state.phoneAsked).toBe(0)
  })

  it('a browser that is not linked opens nothing', async () => {
    const agent = fakeAgent()
    const { hub, row } = await tab(agent, { paired: false })
    await hub.refresh('did:x')
    expect(agent.state.calls).toEqual([])
    expect(row()?.title).toBe('Hey')
  })

  it('a pairing the agent ended is refused silently: nothing is asked on the phone, and the browser reads as not linked', async () => {
    const agent = fakeAgent()
    agent.state.secret = 'dsk_rotated_elsewhere'
    const { hub, store } = await tab(agent)
    await expect(hub.refresh('did:x')).rejects.toThrow()
    expect(agent.state.calls).toEqual(['refused silently'])
    expect(agent.state.phoneAsked).toBe(0)
    expect(hub.getSnapshot().sessions.some((s) => s.state === 'provisional')).toBe(false)
    const record = (await store.listAgents())[0]
    expect(record?.deviceSecret).toBeUndefined()
    expect(record?.deviceHandle).toBeUndefined()
    // and it does not try again by itself
    await hub.refresh('did:x')
    expect(agent.state.calls).toEqual(['refused silently'])
  })
})
