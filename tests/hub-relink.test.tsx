/**
 * A link lists the conversations and the spaces of the person it links (UI-SESS-019). Found by Fabrice on devnet,
 * 2026-11-20: he linked the browser again with his phone; the agent bound it as a device of the person his phone is,
 * and his phone listed the five conversations the agent holds for him and his two spaces. The browser showed one row,
 * the session the link bound, titled "New conversation" with the time of the link, and in it the history of "Obtain
 * badge with email"; no spaces. The list that would have added the other four, given this one its title and read the
 * spaces was never read.
 *
 * The hub read the list (and the spaces with it), and opened new sessions, through the first record of the agent that
 * said `bound`, in the order the store keeps them, not through the session the link had just bound. A record of an
 * earlier binding came first: a session the agent closed while this browser was away, one it superseded, one of the
 * guest the person was before. Its token was refused (or listed another Principal's conversations), the failure was
 * swallowed, and the record stayed, so every reading after it failed the same way.
 */
import { CUSTOM_EVENT } from '@ayni.org/ayni-agui-profile'
import { MemoryDeviceStore, type SessionRecord } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Column } from '../src/components/Column.js'
import { Hub } from '../src/state/hub.js'
import { byText, click, render, setup, space, teardown, until } from './spacesFixture.js'

const AGENT = 'did:web:dev-agent.test'
const CONTROLLER = 'org:ee:2060'
const SESSIONS = 'http://agent.test/agui/v3/sessions'
const LINK = 'ses_zW9t55MCuKZGGPHr'
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Who = 'fabrice' | 'guest'
const DISPLAY = {
  fabrice: {
    displayName: 'Fabrice Rochette',
    photo: null,
    backingIdentity: { kind: 'persona' as const, name: 'Fabrice Rochette' },
  },
  guest: { displayName: 'guest-2b7c', photo: null, backingIdentity: null },
}

/** The person's spaces: Personal, "Verana Social" (Communication, active today) and "Verana" (Project). */
const PERSONAL = space({
  id: 'spc_personal',
  kind: 'personal',
  title: 'Personal',
  templateId: null,
  owner: { name: 'Fabrice Rochette' },
  role: 'owner',
})
const SOCIAL = space({
  id: 'spc_social',
  title: 'Verana Social',
  templateId: 'communication',
  owner: { name: 'Fabrice Rochette' },
  role: 'owner',
  lastActivityAt: '2026-11-20T15:00:00.000Z',
})
const VERANA = space({
  id: 'spc_verana',
  title: 'Verana',
  templateId: 'project',
  owner: { name: 'Fabrice Rochette' },
  role: 'owner',
  lastActivityAt: '2026-11-19T09:00:00.000Z',
})
const SPACES = {
  fabrice: {
    spaces: [PERSONAL, SOCIAL, VERANA],
    templates: [
      { id: 'communication', title: 'Communication', kind: 'team', membership: 'list' },
      { id: 'project', title: 'Project', kind: 'team', membership: 'list' },
    ],
  },
  guest: { spaces: [{ ...PERSONAL, id: 'spc_guest_personal', owner: { name: 'guest-2b7c' } }], templates: [] },
}

const conversation = (id: string, title: string, at: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  state: 'active',
  createdAt: at,
  lastActivityAt: at,
  lastPreview: `${title}…`,
  unread: 0,
  spaceId: PERSONAL.id,
  ...extra,
})
/** What the agent holds for the person: five conversations, four in Personal and one in a space. */
const FIVE = [
  conversation('conv_badge', 'Obtain badge with email', '2026-11-20T12:58:00.000Z'),
  conversation('conv_trip', 'Trip to Tallinn', '2026-11-20T10:00:00.000Z'),
  conversation('conv_notes', 'Meeting notes', '2026-11-19T16:00:00.000Z'),
  conversation('conv_hello', 'Hello', '2026-11-18T09:00:00.000Z'),
  conversation('conv_posts', 'Posts for the week', '2026-11-20T15:00:00.000Z', { spaceId: SOCIAL.id }),
]

interface AgentSession {
  who: Who
  state: 'provisional' | 'bound' | 'closed'
  reason?: string
  conversationId?: string
}

/** The agent of the person: tokens are `t_<session id>`; a closed session answers 410, an unknown token 401. */
function fakeAgent() {
  const state = {
    sessions: new Map<string, AgentSession>(),
    conversations: {
      fabrice: [...FIVE],
      guest: [conversation('conv_guest', 'Guest chat', '2026-11-17T08:00:00.000Z', { spaceId: 'spc_guest_personal' })],
    } as Record<Who, ReturnType<typeof conversation>[]>,
    /** every request with the session its token names */
    requests: [] as { method: string; path: string; by?: string }[],
    /** listings to answer 503 before answering */
    failLists: 0,
    created: 0,
    link: undefined as ReadableStreamDefaultController<Uint8Array> | undefined,
  }
  const refuse = (by: string | undefined) => {
    const s = by ? state.sessions.get(by) : undefined
    if (!s) return json({ error: 'unauthorized', message: 'invalid token' }, 401)
    if (s.state === 'closed') return json({ error: 'closed', reason: s.reason, message: 'session closed' }, 410)
    return undefined
  }
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = (init?.headers ?? {}) as Record<string, string>
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const by = headers.authorization?.replace('Bearer t_', '')
    await wait(1)
    if (url.startsWith('http://indexer.test/'))
      return json({
        did: AGENT,
        trusted: true,
        ecsCredentials: [
          { ecsSchema: 'ServiceCredential', credentialSubject: { name: 'Ayni Dev Agent', type: 'AIAgent' } },
          { ecsSchema: 'OrganizationCredential', credentialSubject: { name: '2060', countryCode: 'EE' } },
        ],
      })
    const path = url.replace(SESSIONS, '')
    state.requests.push({ method, path, by })
    if (path === '' && method === 'POST') {
      // a sibling of a bound session: the same person, the conversation it names (PROF-SESS-008)
      const refused = refuse(by)
      if (refused) return refused
      const parent = state.sessions.get(by as string) as AgentSession
      const id = `ses_n${++state.created}`
      const conversationId = (body.conversationId as string | undefined) ?? `conv_new${state.created}`
      state.sessions.set(id, { who: parent.who, state: 'bound', conversationId })
      return json(
        {
          sessionId: id,
          sessionToken: `t_${id}`,
          state: 'bound',
          parentSessionId: by,
          conversationId,
          principal: DISPLAY[parent.who],
          idleTimeoutSeconds: 1800,
        },
        201
      )
    }
    if ((path === '/conversations' || path === '/spaces' || path === '/admin/roles') && method === 'GET') {
      const refused = refuse(by)
      if (refused) return refused
      const s = state.sessions.get(by as string) as AgentSession
      if (path === '/spaces') return json(SPACES[s.who])
      if (path === '/admin/roles') return json({ error: 'not-admin' }, 403)
      if (state.failLists > 0) {
        state.failLists--
        return json({ error: 'unavailable' }, 503)
      }
      return json({ conversations: state.conversations[s.who] })
    }
    const m = path.match(/^\/(ses_[\w-]+)(\/[a-z]+)?/)
    if (m) {
      const [, id, rest = ''] = m
      const refused = refuse(by)
      if (refused) return refused
      if (id !== by) return json({ error: 'not-found' }, 404)
      const s = state.sessions.get(id as string) as AgentSession
      if (rest === '' && method === 'GET')
        return json({
          sessionId: id,
          state: s.state,
          principal: s.state === 'bound' ? DISPLAY[s.who] : null,
          conversationId: s.conversationId,
        })
      if (rest === '' && method === 'DELETE') {
        s.state = 'closed'
        s.reason = 'user'
        return new Response(null, { status: 204 })
      }
      if (rest === '/stream')
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              if (id === LINK) state.link = controller
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        )
      if (rest === '/messages')
        return json({
          messages: [
            {
              id: `m_${s.conversationId}`,
              role: 'assistant',
              content: `The history of ${s.conversationId}`,
              metadata: { createdAt: '2026-11-20T12:58:00.000Z' },
            },
          ],
          nextBefore: null,
        })
    }
    return json({ error: 'not-found', message: url }, 404)
  }
  /** The person confirms the link on the phone: the agent binds the session and says so on its stream. */
  const phoneConfirms = () => {
    state.sessions.set(LINK, { who: 'fabrice', state: 'bound', conversationId: 'conv_badge' })
    const enc = new TextEncoder()
    const events = [
      {
        type: 'CUSTOM',
        name: CUSTOM_EVENT.sessionBound,
        value: {
          principal: DISPLAY.fabrice,
          boundAt: '2026-11-20T23:16:39.000Z',
          deviceHandle: 'dev_yum',
          deviceSecret: 'dsk_yum',
          // a pairing continues the person's latest active conversation (PROF-CONV-006)
          conversationId: 'conv_badge',
        },
      },
      { type: 'CUSTOM', name: CUSTOM_EVENT.sessionState, value: { state: 'bound' } },
    ]
    events.forEach((e, i) => {
      state.link?.enqueue(enc.encode(`id: ${i + 1}\ndata: ${JSON.stringify(e)}\n\n`))
    })
  }
  return { state, fetchFn, phoneConfirms }
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

const record = (sessionId: string, fields: Partial<SessionRecord>): SessionRecord => ({
  sessionId,
  agentDid: AGENT,
  sessionToken: `t_${sessionId}`,
  title: '',
  createdAt: '2026-11-19T08:00:00.000Z',
  state: 'bound',
  lastEventId: 0,
  unreadCount: 0,
  lastPreview: '',
  lastMessageAt: '2026-11-19T08:00:00.000Z',
  draft: '',
  ayni: null,
  ...fields,
})

/** The session the link opened: it waits for the phone, its binding material on screen. */
const linking = record(LINK, {
  state: 'provisional',
  createdAt: '2026-11-20T23:16:30.000Z',
  lastMessageAt: '2026-11-20T23:16:30.000Z',
  binding: {
    oobUrl: 'https://agent.test/oob',
    walletLink: 'ayni://link',
    bindingCode: '42',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
})

const hubs: Hub[] = []

/** A tab holding what this browser kept from before the link; with `link`, the link waits on screen. */
async function tab(
  agent: ReturnType<typeof fakeAgent>,
  before: SessionRecord[],
  options: { transcripts?: string[]; link?: boolean } = {}
) {
  vi.stubGlobal('fetch', agent.fetchFn)
  const hub = new Hub(config, { appName: 'Ayni' })
  hubs.push(hub)
  const store = new MemoryDeviceStore()
  // @ts-expect-error private: the store and the bus of a test tab
  hub.store = store
  // @ts-expect-error private
  hub.bus = bus
  await store.putAgent({
    did: AGENT,
    descriptorUrl: 'http://agent.test/agui',
    descriptor: {
      did: AGENT,
      name: 'Ayni Dev Agent',
      profileVersion: '3.3',
      sessions: SESSIONS,
      features: {},
    } as never,
    name: 'Ayni Dev Agent',
    trust: {
      result: 'trusted',
      checkedAt: '',
      did: AGENT,
      reasons: [],
      links: { read: true },
      operator: { kind: 'organization', name: '2060', countryCode: 'EE', registryId: '2060' },
    } as never,
    controllerDid: CONTROLLER,
    pinned: true,
    pinOrder: 1,
    addedAt: '',
    lastMessageAt: '',
  })
  await store.putController({
    did: CONTROLLER,
    kind: 'organization',
    name: '2060',
    countryCode: 'EE',
    pinned: true,
    pinOrder: 1,
  })
  // the records of the store come in the order they were written: what was there before the link first
  for (const s of [...before, ...(options.link === false ? [] : [linking])]) await store.putSession(s)
  for (const id of options.transcripts ?? [])
    await store.putTranscript({
      sessionId: id,
      messages: [{ id: `m_${id}`, role: 'assistant', content: `kept in ${id}`, createdAt: '' } as never],
      run: null,
      complete: true,
      oldestLoadedId: null,
    } as never)
  await hub.reload()
  hub.selectController(CONTROLLER)
  if (options.link !== false) {
    agent.state.sessions.set(LINK, { who: 'fabrice', state: 'provisional' })
    hub.selectSession(LINK)
    // @ts-expect-error private: the tab leads the session of the link, as `connect` does
    void hub.lead(LINK, true)
    await vi.waitFor(() => expect(agent.state.link).toBeDefined())
  }
  const rows = () => hub.getSnapshot().sessions.filter((s) => s.agentDid === AGENT && !s.archived)
  const linked = () => hub.getSnapshot().sessions.find((s) => s.conversationId === 'conv_badge')
  const spaces = () => hub.getSnapshot().spaces[AGENT]?.spaces.map((s) => s.title)
  /** the requests made with the token of a session, from now on */
  const mark = agent.state.requests.length
  const usedSince = (sessionId: string, from = mark) =>
    agent.state.requests.slice(from).filter((r) => r.by === sessionId)
  return { hub, store, rows, linked, spaces, usedSince }
}

const titles = (rows: SessionRecord[]) => rows.map((s) => s.title).sort()
const FIVE_TITLES = FIVE.map((c) => c.title).sort()
const THE_SPACES = ['Personal', 'Verana Social', 'Verana']

describe('a link lists the conversations and the spaces of the person it links (UI-SESS-019)', () => {
  beforeAll(setup)
  afterEach(() => {
    // the streams of a finished test stop: they must not reach the next test's agent
    // @ts-expect-error private
    for (const hub of hubs.splice(0)) for (const s of hub.getSnapshot().sessions) hub.stopLeading(s.sessionId)
    vi.restoreAllMocks()
    teardown()
  })

  it('the screen Fabrice saw: the bound record alone, no list, the title never given, no spaces; now all of it, at once', async () => {
    const agent = fakeAgent()
    // a conversation archived on the phone: the agent closed this browser's session of it, which never heard so
    agent.state.sessions.set('ses_A3web', {
      who: 'fabrice',
      state: 'closed',
      reason: 'user',
      conversationId: 'conv_old',
    })
    agent.state.conversations.fabrice.push(
      conversation('conv_old', 'An archived one', '2026-11-10T08:00:00.000Z', { state: 'archived' })
    )
    const stale = record('ses_A3web', { conversationId: 'conv_old', title: 'An archived one', archived: true })
    const { hub, rows, linked, spaces, usedSince } = await tab(agent, [stale])
    // before the phone confirms: the one row of the link, and no spaces
    expect(rows().map((s) => s.sessionId)).toEqual([LINK])
    expect(spaces()).toBeUndefined()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    agent.phoneConfirms()
    // no reload: the list of the person and their spaces read at once, through the session the link bound
    await vi.waitFor(() => expect(titles(rows())).toEqual(FIVE_TITLES), { timeout: 3000 })
    expect(linked()).toMatchObject({ sessionId: LINK, state: 'bound', title: 'Obtain badge with email' })
    await vi.waitFor(() => expect(spaces()).toEqual(THE_SPACES))
    expect(agent.state.requests.filter((r) => r.path === '/spaces').map((r) => r.by)).toEqual([LINK])
    // the record whose token the agent refused is retired: asked once, never again
    expect(hub.getSnapshot().sessions.find((s) => s.sessionId === 'ses_A3web')).toMatchObject({
      state: 'closed',
      sessionToken: null,
    })
    expect(usedSince('ses_A3web')).toHaveLength(1)
    await hub.syncConversations(AGENT)
    await hub.loadSpaces(AGENT)
    expect(usedSince('ses_A3web')).toHaveLength(1)
    // and the refusal is said, not swallowed
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ses_A3web'), expect.anything())
  })

  it("the agent's card after the relink: the Spaces rows, New space and every Personal conversation", async () => {
    const agent = fakeAgent()
    agent.state.sessions.set('ses_A3web', {
      who: 'fabrice',
      state: 'closed',
      reason: 'user',
      conversationId: 'conv_hello',
    })
    const stale = record('ses_A3web', { conversationId: 'conv_hello', title: 'Hi' })
    const { hub, linked } = await tab(agent, [stale])
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    hub.setView('list')
    const el = await render(hub, <Column />)
    agent.phoneConfirms()
    const spaceRows = () => [...el.querySelectorAll('.space-row .space-name')].map((r) => r.textContent)
    const listed = () => [...el.querySelectorAll('.conv-row .title')].map((r) => r.textContent)
    await until(() => spaceRows().length === 2, 3000)
    expect(byText(el, '.section-label', 'Spaces')).toBeTruthy()
    expect(spaceRows()).toEqual(['Verana Social', 'Verana'])
    // under the rows, the four conversations of Personal; the fifth is in Verana Social
    await until(() => listed().length === 4)
    expect(listed()).toEqual(['Obtain badge with email', 'Trip to Tallinn', 'Meeting notes', 'Hello'])
    expect(linked()?.sessionId).toBe(LINK)
    // the agent's menu offers New space: the agent gave its templates
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    expect(byText(el, '[role="menuitem"]', 'New space')).toBeTruthy()
  })

  it.each([
    ['the agent closed it while this browser was away (410)', 'closed'],
    ['the agent no longer knows its token (401)', 'unknown'],
  ])('a stale bound record of a listed conversation: %s', async (_, how) => {
    const agent = fakeAgent()
    // two web sessions the person closed that evening (20:19:44); the browser held them as bound
    if (how === 'closed')
      agent.state.sessions.set('ses_B7web', {
        who: 'fabrice',
        state: 'closed',
        reason: 'user',
        conversationId: 'conv_hello',
      })
    const stale = record('ses_B7web', { conversationId: 'conv_hello', title: 'Hi', lastPreview: 'Hi' })
    const { hub, rows, linked, spaces, usedSince } = await tab(agent, [stale])
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    agent.phoneConfirms()
    await vi.waitFor(() => expect(titles(rows())).toEqual(FIVE_TITLES), { timeout: 3000 })
    expect(linked()).toMatchObject({ sessionId: LINK, title: 'Obtain badge with email' })
    await vi.waitFor(() => expect(spaces()).toEqual(THE_SPACES))
    // the conversation keeps its row, read-only until it is opened again; the refused token is gone
    expect(rows().find((s) => s.conversationId === 'conv_hello')).toMatchObject({
      sessionId: 'ses_B7web',
      state: 'closed',
      sessionToken: null,
      title: 'Hello',
    })
    expect(usedSince('ses_B7web')).toHaveLength(1)
    await hub.refresh(AGENT)
    expect(usedSince('ses_B7web')).toHaveLength(1)
  })

  it('a superseded token is not the one the list is read with, and a conversation opens after the relink', async () => {
    const agent = fakeAgent()
    // the session the browser had bound from its device proof, superseded on the agent before this tab heard it
    agent.state.sessions.set('ses_h1K4yb5CVJ8y5VJ', {
      who: 'fabrice',
      state: 'closed',
      reason: 'supersede',
      conversationId: 'conv_badge',
    })
    const superseded = record('ses_h1K4yb5CVJ8y5VJ', { conversationId: 'conv_badge', principal: DISPLAY.fabrice })
    const { hub, rows, linked, spaces, usedSince } = await tab(agent, [superseded])
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    agent.phoneConfirms()
    await vi.waitFor(() => expect(titles(rows())).toEqual(FIVE_TITLES), { timeout: 3000 })
    await vi.waitFor(() => expect(spaces()).toEqual(THE_SPACES))
    // one record for the conversation: the link's
    expect(hub.getSnapshot().sessions.filter((s) => s.conversationId === 'conv_badge')).toHaveLength(1)
    expect(linked()?.sessionId).toBe(LINK)
    expect(usedSince('ses_h1K4yb5CVJ8y5VJ')).toHaveLength(1)
    // opening a conversation the list brought: a sibling of the link's session, its history read
    const trip = rows().find((s) => s.conversationId === 'conv_trip') as SessionRecord
    const mark = agent.state.requests.length
    hub.selectSession(trip.sessionId)
    await vi.waitFor(() =>
      expect(hub.getSnapshot().sessions.find((s) => s.conversationId === 'conv_trip')).toMatchObject({
        state: 'bound',
        title: 'Trip to Tallinn',
      })
    )
    const opened = hub.getSnapshot().sessions.find((s) => s.conversationId === 'conv_trip') as SessionRecord
    await vi.waitFor(() =>
      expect(hub.getSnapshot().transcripts[opened.sessionId]?.messages.map((m) => m.id)).toContain('m_conv_trip')
    )
    expect(hub.getSnapshot().selectedSessionId).toBe(opened.sessionId)
    expect(agent.state.requests.slice(mark).find((r) => r.method === 'POST')?.by).toBe(LINK)
    expect(usedSince('ses_h1K4yb5CVJ8y5VJ', mark)).toHaveLength(0)
  })

  it("a guest Principal's records left from before an identified relink are dropped, their tokens unused", async () => {
    const agent = fakeAgent()
    // the browser was linked while the person was a guest: a session still open as the guest, and a closed one
    agent.state.sessions.set('ses_9gst', { who: 'guest', state: 'bound', conversationId: 'conv_guest' })
    const guestBound = record('ses_9gst', {
      conversationId: 'conv_guest',
      title: 'Guest chat',
      principal: DISPLAY.guest,
    })
    const guestClosed = record('ses_8gst', {
      conversationId: 'conv_guest_old',
      title: 'Before the badge',
      principal: DISPLAY.guest,
      state: 'closed',
      sessionToken: null,
    })
    const { hub, store, rows, linked, spaces, usedSince } = await tab(agent, [guestBound, guestClosed], {
      transcripts: ['ses_9gst', 'ses_8gst'],
    })
    agent.phoneConfirms()
    await vi.waitFor(() => expect(titles(rows())).toEqual(FIVE_TITLES), { timeout: 3000 })
    expect(linked()).toMatchObject({ sessionId: LINK, title: 'Obtain badge with email', principal: DISPLAY.fabrice })
    // the identified person's spaces, not the guest's Personal alone
    await vi.waitFor(() => expect(spaces()).toEqual(THE_SPACES))
    // nothing of the guest stays: neither the records nor what they held
    expect(hub.getSnapshot().sessions.filter((s) => s.principal?.displayName === DISPLAY.guest.displayName)).toEqual([])
    expect(await store.getSession('ses_9gst')).toBeUndefined()
    expect(await store.getSession('ses_8gst')).toBeUndefined()
    expect(await store.getTranscript('ses_9gst')).toBeUndefined()
    expect(await store.getTranscript('ses_8gst')).toBeUndefined()
    expect(hub.getSnapshot().transcripts.ses_9gst).toBeUndefined()
    // and the guest's token is never used again
    expect(usedSince('ses_9gst')).toHaveLength(0)
    await hub.refresh(AGENT)
    await hub.loadSpaces(AGENT)
    expect(usedSince('ses_9gst')).toHaveLength(0)
  })

  it('a listing that fails after the link is said and read again with the session the link bound', async () => {
    const agent = fakeAgent()
    agent.state.failLists = 1
    const { rows, linked, spaces } = await tab(agent, [])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    agent.phoneConfirms()
    await vi.waitFor(() => expect(titles(rows())).toEqual(FIVE_TITLES), { timeout: 4000 })
    expect(linked()).toMatchObject({ sessionId: LINK, title: 'Obtain badge with email' })
    await vi.waitFor(() => expect(spaces()).toEqual(THE_SPACES))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('list of conversations'), expect.anything())
    const lists = agent.state.requests.filter((r) => r.path === '/conversations')
    expect(lists.length).toBeGreaterThanOrEqual(2)
    expect(lists.every((r) => r.by === LINK)).toBe(true)
  })

  it('the spaces read on their own never go through a refused token: it is retired and the next binding asked', async () => {
    const agent = fakeAgent()
    // the latest binding, closed by the person from the phone; an earlier session still holds
    agent.state.sessions.set('ses_late', {
      who: 'fabrice',
      state: 'closed',
      reason: 'user',
      conversationId: 'conv_trip',
    })
    agent.state.sessions.set('ses_early', { who: 'fabrice', state: 'bound', conversationId: 'conv_notes' })
    const late = record('ses_late', { conversationId: 'conv_trip', createdAt: '2026-11-20T20:00:00.000Z' })
    const early = record('ses_early', { conversationId: 'conv_notes', createdAt: '2026-11-20T08:00:00.000Z' })
    const { hub, spaces, usedSince } = await tab(agent, [early, late], { link: false })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await hub.loadSpaces(AGENT)
    expect(spaces()).toEqual(THE_SPACES)
    expect(hub.getSnapshot().sessions.find((s) => s.sessionId === 'ses_late')).toMatchObject({
      state: 'closed',
      sessionToken: null,
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ses_late'), expect.anything())
    await hub.loadSpaces(AGENT)
    expect(usedSince('ses_late')).toHaveLength(1)
  })
})
