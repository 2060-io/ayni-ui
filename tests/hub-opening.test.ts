/**
 * Session openings are serialized per agent (UI-BIND-012): two at once would present the same device
 * secret, and the agent revokes a pairing on a reused secret (IDENT-DEV-003). A never-bound
 * conversation closes for good without the phone (UI-SESS-004), and an action that needs the agent
 * opens nothing on an unpaired device. A fake agent over fetch rotates the secret as the real one does.
 */
import { MemoryDeviceStore } from '@ayni.org/ayni-ui-core'
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
const openStream = () =>
  new Response(new ReadableStream<Uint8Array>({ start() {} }), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

/** The agent: device dev_1 is paired with secret dsk_1; conversations c1 and c2 are listed for the person. */
function fakeAgent() {
  let secret = 'dsk_1'
  let minted = 1
  let revoked = false
  const sessions = new Map<string, { state: 'bound' | 'provisional' | 'closed'; conversationId?: string }>()
  const calls: string[] = []
  const binding = {
    oobUrl: 'https://agent.test/oob',
    walletLink: 'https://agent.test/link',
    bindingCode: '123456',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  }
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = (init?.headers ?? {}) as Record<string, string>
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
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
      const id = `s${sessions.size + 1}`
      const conversationId = (body.conversationId as string | undefined) ?? (body.newConversation ? `conv_${id}` : 'c1')
      const common = { sessionId: id, sessionToken: `t_${id}`, idleTimeoutSeconds: 1800 }
      if (headers.authorization) {
        calls.push(`create sibling ${id}`)
        sessions.set(id, { state: 'bound', conversationId })
        return json({ ...common, state: 'bound', conversationId, principal: { displayName: 'Ana' } }, 201)
      }
      if (body.deviceProof) {
        if (!revoked && body.deviceProof === secret) {
          minted += 1
          secret = `dsk_${minted}`
          calls.push(`create with proof ${id}`)
          sessions.set(id, { state: 'bound', conversationId })
          return json(
            {
              ...common,
              state: 'bound',
              conversationId,
              principal: { displayName: 'Ana' },
              deviceHandle: 'dev_1',
              deviceSecret: secret,
            },
            201
          )
        }
        revoked = true
        calls.push(`create with stale proof ${id}`)
        sessions.set(id, { state: 'provisional' })
        return json({ ...common, state: 'provisional', binding, pairing: 'invalid' }, 201)
      }
      calls.push(`create provisional ${id}`)
      sessions.set(id, { state: 'provisional' })
      return json({ ...common, state: 'provisional', binding }, 201)
    }
    if (url === `${SESSIONS}/conversations` && method === 'GET')
      return json({
        conversations: ['c1', 'c2'].map((id) => ({
          id,
          title: id,
          state: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastActivityAt: '2026-01-01T00:00:01.000Z',
        })),
      })
    const m = url.match(/\/sessions\/(s\d+)(\/[a-z]+)?/)
    if (m) {
      const [, id, rest = ''] = m
      const s = sessions.get(id)
      if (!s) return json({ error: 'not-found' }, 404)
      if (rest === '' && method === 'GET')
        return json({
          state: s.state,
          principal: s.state === 'bound' ? { displayName: 'Ana' } : undefined,
          conversationId: s.conversationId,
          binding: s.state === 'provisional' ? binding : undefined,
        })
      if (rest === '' && method === 'DELETE') {
        calls.push(`close ${id}`)
        sessions.set(id, { ...s, state: 'closed' })
        return new Response(null, { status: 204 })
      }
      if (rest === '/stream') return openStream()
      if (rest === '/messages') return json({ messages: [], nextBefore: null })
    }
    return json({ error: 'not-found', message: url }, 404)
  }
  return {
    fetchFn,
    calls,
    get secret() {
      return secret
    },
    get revoked() {
      return revoked
    },
  }
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

/** A tab with the agent known and two of its conversations listed but never opened here. */
async function hubWith(paired: boolean, agent: ReturnType<typeof fakeAgent>) {
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
    descriptor: { did: 'did:x', name: 'Agent', profileVersion: '3.0', sessions: SESSIONS, features: {} } as never,
    name: 'Agent',
    trust: { result: 'trusted', checkedAt: '', did: 'did:x', reasons: [] } as never,
    pinned: true,
    pinOrder: 1,
    addedAt: '',
    lastMessageAt: '',
    ...(paired ? { deviceHandle: 'dev_1', deviceSecret: 'dsk_1' } : {}),
  })
  for (const id of ['c1', 'c2'])
    await store.putSession({
      sessionId: id,
      agentDid: 'did:x',
      sessionToken: null,
      title: id,
      createdAt: '2026-01-01T00:00:00.000Z',
      state: 'closed',
      lastEventId: 0,
      unreadCount: 0,
      lastPreview: '',
      lastMessageAt: '2026-01-01T00:00:01.000Z',
      draft: '',
      ayni: null,
      conversationId: id,
    })
  await hub.reload()
  return { hub, store }
}

describe('session openings (UI-BIND-012)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('two conversations opened at once present the device secret once, and both bind', async () => {
    const agent = fakeAgent()
    const { hub, store } = await hubWith(true, agent)
    await Promise.all([hub.resume('c1'), hub.resume('c2')])
    expect(agent.calls.filter((c) => c.startsWith('create with proof'))).toHaveLength(1)
    expect(agent.calls.filter((c) => c.startsWith('create sibling'))).toHaveLength(1)
    expect(agent.revoked).toBe(false)
    const bound = hub
      .getSnapshot()
      .sessions.filter((s) => s.state === 'bound')
      .map((s) => s.conversationId)
      .sort()
    expect(bound).toEqual(['c1', 'c2'])
    expect((await store.listAgents())[0]?.deviceSecret).toBe(agent.secret)
  })

  it('a conversation that never bound closes for good without the phone', async () => {
    const agent = fakeAgent()
    const { hub } = await hubWith(false, agent)
    const opened = await hub.newConversation('did:x')
    expect(opened.state).toBe('provisional')
    await hub.closeForGood(opened.sessionId)
    expect(agent.calls).toContain(`close ${opened.sessionId}`)
    expect(hub.getSnapshot().sessions.find((s) => s.sessionId === opened.sessionId)).toBeUndefined()
    expect(agent.calls.filter((c) => c.startsWith('create'))).toHaveLength(1)
  })

  it('an action that needs the agent asks for the phone on an unpaired device and opens nothing', async () => {
    const agent = fakeAgent()
    const { hub } = await hubWith(false, agent)
    await expect(hub.setArchived('c1', true)).rejects.toThrow('link your phone first')
    expect(agent.calls.filter((c) => c.startsWith('create'))).toHaveLength(0)
    expect(hub.getSnapshot().sessions).toHaveLength(2)
  })
})
