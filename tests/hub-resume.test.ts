/**
 * Writing on a closed conversation resumes it: a new session binds with the device proof, its
 * stream replays the bound event (which reloads history), and the text goes out as a run. The
 * user's message must survive these concurrent transcript writes (the bug: it vanished while the
 * agent's answer appeared). A fake agent answers over fetch; the store delays every operation so
 * that read-modify-write sequences interleave as they do with IndexedDB.
 */
import { MemoryDeviceStore } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hub } from '../src/state/hub.js'

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
const SESSIONS = 'http://agent.test/agui/v3/sessions'
let seed = 1
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
/** A macrotask or a few: IndexedDB and the network never answer in a fixed order. */
const tick = () => new Promise((r) => setTimeout(r, 1 + Math.floor(rand() * 4)))

/** Every store operation takes a macrotask, as IndexedDB does. */
function slowStore(): MemoryDeviceStore {
  const store = new MemoryDeviceStore()
  for (const name of ['getTranscript', 'putTranscript', 'getSession', 'putSession'] as const) {
    const original = (store[name] as (...a: unknown[]) => Promise<unknown>).bind(store)
    ;(store as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      await tick()
      return original(...args)
    }
  }
  return store
}

const sse = (events: object[], keepOpen: boolean) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      events.forEach((e, i) => {
        controller.enqueue(enc.encode(`id: ${i + 1}\ndata: ${JSON.stringify(e)}\n\n`))
      })
      if (!keepOpen) controller.close()
    },
  })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** The agent: one closed session s1 of conversation conv1; a resume binds s2 at once (paired device). */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fakeAgent(delay: () => Promise<unknown> = tick) {
  const calls: string[] = []
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.replace(SESSIONS, '')}`)
    await delay()
    if (url.startsWith('http://indexer.test/'))
      return json({
        did: 'did:x',
        trusted: true,
        ecsCredentials: [
          { ecsSchema: 'ServiceCredential', credentialSubject: { name: 'Agent', type: 'AIAgent' } },
          { ecsSchema: 'OrganizationCredential', credentialSubject: { name: 'Org', countryCode: 'EE' } },
        ],
      })
    if (url === SESSIONS && method === 'POST')
      return json(
        {
          sessionId: 's2',
          sessionToken: 't2',
          state: 'bound',
          conversationId: 'conv1',
          resumedFromSessionId: 's1',
          principal: { displayName: 'Ana' },
          idleTimeoutSeconds: 1800,
          deviceHandle: 'dev_1',
          deviceSecret: 'dsk_2',
        },
        201
      )
    if (url === `${SESSIONS}/s2` && method === 'GET')
      return json({ state: 'bound', principal: { displayName: 'Ana' }, conversationId: 'conv1' })
    if (url === `${SESSIONS}/s2/stream`)
      return new Response(
        sse(
          [
            {
              type: 'CUSTOM',
              name: 'ayni.session.bound',
              value: { principal: { displayName: 'Ana' }, conversationId: 'conv1' },
            },
          ],
          true
        ),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    if (url.startsWith(`${SESSIONS}/s2/messages`))
      return json({
        messages: [
          {
            id: 'a1',
            role: 'assistant',
            content: 'Earlier answer',
            metadata: { createdAt: '2026-01-01T00:00:01.000Z' },
          },
        ],
        nextBefore: null,
      })
    if (url === `${SESSIONS}/conversations`)
      return json({
        conversations: [
          {
            id: 'conv1',
            title: 'Earlier',
            state: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastActivityAt: '2026-01-01T00:00:01.000Z',
          },
        ],
      })
    if (url === `${SESSIONS}/s2/runs` && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { runId: string }
      return new Response(
        sse(
          [
            { type: 'RUN_STARTED', threadId: 's2', runId: body.runId },
            { type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: 'Hey! What can I do for you?' },
            { type: 'TEXT_MESSAGE_END', messageId: 'a2' },
            { type: 'RUN_FINISHED', threadId: 's2', runId: body.runId },
          ],
          false
        ),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    }
    return json({ error: 'not-found', message: url }, 404)
  }
  return { fetchFn, calls }
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

describe('writing on a closed conversation (UI-SESS-003)', () => {
  let agent: ReturnType<typeof fakeAgent>
  beforeEach(() => {
    agent = fakeAgent()
    vi.stubGlobal('fetch', agent.fetchFn)
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])(
    'keeps the message the person wrote next to the answer it got (timing %i)',
    async (s) => {
      seed = s * 7919
      const hub = new Hub(config, { appName: 'Ayni' })
      const store = slowStore()
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
        deviceHandle: 'dev_1',
        deviceSecret: 'dsk_1',
      })
      await store.putSession({
        sessionId: 's1',
        agentDid: 'did:x',
        sessionToken: null,
        title: 'Earlier',
        createdAt: '2026-01-01T00:00:00.000Z',
        state: 'closed',
        closedReason: 'idle-timeout',
        lastEventId: 0,
        unreadCount: 0,
        lastPreview: '',
        lastMessageAt: '2026-01-01T00:00:01.000Z',
        draft: '',
        ayni: null,
        conversationId: 'conv1',
      })
      await store.putTranscript({
        sessionId: 's1',
        messages: [{ id: 'a1', role: 'assistant', content: 'Earlier answer', at: '2026-01-01T00:00:01.000Z' }],
        oldestLoadedId: null,
        complete: true,
        run: null,
        routed: {},
        reactions: {},
      })
      await hub.reload()

      await hub.resume('s1', 'what is new?')
      // let the stream replay, the history reloads and the run settle
      for (let i = 0; i < 60; i++) await tick()

      const snap = hub.getSnapshot()
      const current = snap.sessions.find((s) => s.conversationId === 'conv1')
      expect(current?.sessionId).toBe('s2')
      const shown = snap.transcripts.s2?.messages.map((m) =>
        m.role === 'activity' ? m.activityType : `${m.role}:${m.content}`
      )
      expect(shown).toContain('user:what is new?')
      expect(shown).toContain('assistant:Hey! What can I do for you?')
      const stored = (await store.getTranscript('s2'))?.messages.map((m) => m.role)
      expect(stored).toEqual(['assistant', 'user', 'assistant'])
      expect(agent.calls).toContain('POST /s2/runs')
    }
  )

  it('a history reload started together with a send never drops the sent message', async () => {
    // fixed timings: the network answers in one tick, a transcript read is taken at once (as an
    // IndexedDB read is) but delivered three ticks later, so the reload's read is issued while the
    // send's read is in flight and both continue in that order, the reload writing last
    agent = fakeAgent(() => wait(1))
    vi.stubGlobal('fetch', agent.fetchFn)
    const hub = new Hub(config, { appName: 'Ayni' })
    const store = new MemoryDeviceStore()
    const original = store.getTranscript.bind(store)
    store.getTranscript = async (id: string) => {
      const value = await original(id)
      await wait(3)
      return value
    }
    // @ts-expect-error private
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
    })
    await store.putSession({
      sessionId: 's2',
      agentDid: 'did:x',
      sessionToken: 't2',
      title: 'Earlier',
      createdAt: '2026-01-01T00:00:00.000Z',
      state: 'bound',
      lastEventId: 0,
      unreadCount: 0,
      lastPreview: '',
      lastMessageAt: '2026-01-01T00:00:01.000Z',
      draft: '',
      ayni: null,
      conversationId: 'conv1',
    })
    await store.putTranscript({
      sessionId: 's2',
      messages: [{ id: 'a1', role: 'assistant', content: 'Earlier answer', at: '2026-01-01T00:00:01.000Z' }],
      oldestLoadedId: null,
      complete: true,
      run: null,
      routed: {},
      reactions: {},
    })
    await hub.reload()
    // @ts-expect-error private: this tab leads the session, so a send runs here
    hub.snapshot = { ...hub.getSnapshot(), leaders: { s2: true } }

    await Promise.all([hub.loadHistory('s2'), hub.send('s2', 'what is new?')])
    for (let i = 0; i < 30; i++) await tick()

    const stored = (await store.getTranscript('s2'))?.messages.map((m) =>
      m.role === 'activity' ? m.activityType : `${m.role}:${m.content}`
    )
    expect(stored).toContain('user:what is new?')
    expect(stored).toContain('assistant:Hey! What can I do for you?')
  })
})
