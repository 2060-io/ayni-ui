/**
 * The unread count is the agent's (UI-SESS-017, PROF-CONV-008): a conversation read on another device reads as
 * read here without being opened, from the list and from the agent's announcement, and the conversation in front
 * of the person never shows a count.
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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** An agent that lists two conversations with the count it keeps for each. */
function fakeAgent() {
  const state = {
    lists: 0,
    conversations: [
      { id: 'c1', title: 'Croq', unread: 2 as number | undefined },
      { id: 'c2', title: 'Titi', unread: 0 as number | undefined },
    ],
  }
  const fetchFn = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url === `${SESSIONS}/conversations`) {
      state.lists++
      return json({
        conversations: state.conversations.map((c) => ({
          id: c.id,
          title: c.title,
          state: 'active',
          createdAt: '2026-11-11T10:00:00.000Z',
          lastActivityAt: '2026-11-12T10:00:00.000Z',
          lastPreview: 'Hello',
          open: true,
          ...(c.unread === undefined ? {} : { unread: c.unread, readUpTo: null }),
        })),
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
  tryLead: async () => false,
  close: () => undefined,
}

const record = (conversationId: string, over: Partial<SessionRecord> = {}): SessionRecord => ({
  sessionId: `s_${conversationId}`,
  agentDid: 'did:x',
  sessionToken: `t_${conversationId}`,
  title: conversationId === 'c1' ? 'Croq' : 'Titi',
  createdAt: '2026-11-11T10:00:00.000Z',
  state: 'bound',
  lastEventId: 0,
  unreadCount: 0,
  lastPreview: 'Hello',
  lastMessageAt: '2026-11-12T10:00:00.000Z',
  draft: '',
  ayni: null,
  conversationId,
  ...over,
})

async function tab(agent: ReturnType<typeof fakeAgent>, sessions: SessionRecord[] = [record('c1'), record('c2')]) {
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
    descriptor: {
      did: 'did:x',
      name: 'Agent',
      profileVersion: '3.1',
      sessions: SESSIONS,
      features: { readState: true },
    } as never,
    name: 'Agent',
    trust: { result: 'trusted', checkedAt: '', did: 'did:x', reasons: [] } as never,
    pinned: true,
    pinOrder: 1,
    addedAt: '',
    lastMessageAt: '',
  })
  for (const s of sessions) await store.putSession(s)
  await hub.reload()
  const unread = () =>
    Object.fromEntries(hub.getSnapshot().sessions.map((s) => [s.conversationId, s.unreadCount])) as Record<
      string,
      number
    >
  /** an event of the agent arriving on the stream of a session */
  const event = (sessionId: string, value: Record<string, unknown>) =>
    // @ts-expect-error private
    hub.onEvent(
      sessionId,
      { type: 'CUSTOM', name: 'ayni.conversation.changed', value },
      undefined,
      false
    ) as Promise<void>
  return { hub, unread, event }
}

describe("the unread count is the agent's (UI-SESS-017)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("the list gives each conversation the agent's count, whatever this browser had counted", async () => {
    const agent = fakeAgent()
    const { hub, unread } = await tab(agent, [record('c1'), record('c2', { unreadCount: 3 })])
    await hub.syncConversations('did:x')
    // c1: two replies landed while this browser was away; c2: read on the phone meanwhile
    expect(unread()).toEqual({ c1: 2, c2: 0 })
  })

  it('the conversation in front of the person shows no count', async () => {
    const agent = fakeAgent()
    const { hub, unread } = await tab(agent)
    hub.selectSession('s_c1')
    await hub.syncConversations('did:x')
    expect(unread()).toEqual({ c1: 0, c2: 0 })
  })

  it('a conversation read on another device clears here from the announcement, with no reading of the list', async () => {
    const agent = fakeAgent()
    const { hub, unread, event } = await tab(agent)
    await hub.syncConversations('did:x')
    expect(unread().c1).toBe(2)
    const lists = agent.state.lists
    // the phone showed the replies: the agent tells every session of the person, here the one on the other conversation
    await event('s_c2', { conversationId: 'c1', title: 'Croq', state: 'active', unread: 0, readUpTo: 'msg_9' })
    expect(unread().c1).toBe(0)
    // and a reply that lands on a conversation not on screen counts the same way
    await event('s_c2', { conversationId: 'c1', title: 'Croq', state: 'active', unread: 1, readUpTo: 'msg_9' })
    expect(unread().c1).toBe(1)
    expect(agent.state.lists).toBe(lists)
  })

  it('an announcement that also renames the conversation reads the list again', async () => {
    const agent = fakeAgent()
    const { unread, event, hub } = await tab(agent)
    const lists = agent.state.lists
    ;(agent.state.conversations[0] as { title: string }).title = 'crok amour'
    await event('s_c2', { conversationId: 'c1', title: 'crok amour', state: 'active', unread: 2, readUpTo: null })
    await vi.waitFor(() => expect(agent.state.lists).toBe(lists + 1))
    await vi.waitFor(() =>
      expect(hub.getSnapshot().sessions.find((s) => s.conversationId === 'c1')?.title).toBe('crok amour')
    )
    expect(unread().c1).toBe(2)
  })

  it("against an agent that keeps no read state the browser's own count stays", async () => {
    const agent = fakeAgent()
    for (const c of agent.state.conversations) c.unread = undefined
    const { hub, unread } = await tab(agent, [record('c1', { unreadCount: 4 }), record('c2')])
    await hub.syncConversations('did:x')
    expect(unread()).toEqual({ c1: 4, c2: 0 })
  })
})
