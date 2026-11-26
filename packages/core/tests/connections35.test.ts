/**
 * Profile 3.5 in the core (tools, phase 2: each person's own accounts; agent D104 to D110): Your accounts as the agent
 * lists them (PROF-TOOL-014) and the rules a screen follows with them (UI-CONV-053..058); the endpoints of §3.11 as the
 * client calls them; `ayni.connections.changed` and the Connect card; `personal` in the shapes of 3.4
 * (PROF-TOOL-021); a message held back because it carried a credential (PROF-STREAM-011, PROF-HIST-013); the app link
 * of Your accounts (PROF-LINK-004); and `client.profileVersion: "3.5"` (UI-SESS-018).
 */
import { describe, expect, it } from 'vitest'
import { parseAppLink } from '../src/appLinks.js'
import {
  attemptWaits,
  connectionControlsOf,
  connectionFor,
  connectionRefusalOf,
  connectionStateKeyOf,
  connectionsChangeOf,
  connectionsOf,
  disconnectedKeyOf,
  outcomeNoticeOf,
  signInUrlAllowed,
  sinceDateOf,
  spaceIdFor,
  takesConnections,
  usageOfConnection,
} from '../src/connections.js'
import { CONNECTIONS_COPY } from '../src/connectionsCopy.js'
import { ProfileClient, ProfileError } from '../src/profileClient.js'
import {
  emptyTranscript,
  mergeHistory,
  namedMessageIds,
  reduce,
  toTranscriptMessage,
  withheldTextsOf,
  withWithheld,
} from '../src/reducer.js'
import {
  accountLineOf,
  accountSourceOf,
  conversationSourcesOf,
  messageSourcesOf,
  spaceToolOf,
  toolActionOf,
  toolRefusalOf,
} from '../src/tools.js'
import type { SessionRecord, Transcript, TranscriptMessage } from '../src/types.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'
const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** The example of §3.11: Relaticle connected for Sales EU, GitHub waiting for a sign-in, My tasks of fields. */
const LIST = {
  connections: [
    {
      source: 'relaticle',
      title: 'Relaticle CRM',
      description: "The companies, people, notes and tasks of the space's workspace",
      method: 'oauth',
      binding: {
        name: 'workspace',
        label: 'Workspace',
        value: '01JD8Q4W6Z0KX3V7N2M5B9C1TA',
        valueLabel: 'ayni-dev-agent',
      },
      usedIn: [{ kind: 'space', id: 'spc_sales', title: 'Sales EU' }],
      state: 'connected',
      reason: null,
      moreAccess: false,
      account: {
        id: 'acc_1',
        label: 'ana@2060.io · ayni-dev-agent',
        connectedAt: '2026-11-21T10:02:00Z',
        lastUsedAt: '2026-11-21T10:40:00Z',
      },
      attempt: null,
      revokesAtSource: false,
    },
    {
      source: 'github',
      title: 'GitHub',
      description: 'Code, issues and pull requests in GitHub',
      method: 'oauth',
      binding: null,
      usedIn: [{ kind: 'personal' }, { kind: 'space', id: 'spc_repo', title: 'Test repo' }],
      state: 'not-connected',
      reason: null,
      moreAccess: false,
      account: null,
      attempt: { id: 'att_1', expiresAt: '2026-11-21T10:12:00Z' },
      revokesAtSource: false,
    },
    {
      source: 'my_tasks',
      title: 'My tasks',
      description: 'Lists your open tasks in the task tracker',
      method: 'fields',
      fields: [{ name: 'token', label: 'API token', pattern: '^tt_[A-Za-z0-9]{32}$' }],
      binding: null,
      usedIn: [{ kind: 'personal' }],
      state: 'not-connected',
      reason: null,
      moreAccess: false,
      account: null,
      attempt: null,
      revokesAtSource: false,
    },
  ],
}

describe('Your accounts as the agent lists them (PROF-TOOL-014)', () => {
  it('reads the example of §3.11, never a token', () => {
    const [crm, github, tasks] = connectionsOf(LIST)
    expect(crm).toMatchObject({
      source: 'relaticle',
      method: 'oauth',
      fields: [],
      binding: { label: 'Workspace', value: '01JD8Q4W6Z0KX3V7N2M5B9C1TA', valueLabel: 'ayni-dev-agent' },
      usedIn: [{ kind: 'space', id: 'spc_sales', title: 'Sales EU' }],
      state: 'connected',
      reason: null,
      account: { id: 'acc_1', label: 'ana@2060.io · ayni-dev-agent' },
      attempt: null,
    })
    expect(github?.attempt).toEqual({ id: 'att_1', expiresAt: '2026-11-21T10:12:00Z' })
    expect(github?.usedIn).toEqual([{ kind: 'personal' }, { kind: 'space', id: 'spc_repo', title: 'Test repo' }])
    expect(tasks?.fields).toEqual([{ name: 'token', label: 'API token', pattern: '^tt_[A-Za-z0-9]{32}$' }])
    expect(connectionsOf({ connections: [] })).toEqual([])
    expect(connectionsOf({})).toEqual([])
  })

  it('reads the features each account serves, each once (package 3.5.8, PROF-TOOL-035, UI-CONV-064)', () => {
    const [cloud] = connectionsOf({
      connections: [
        {
          source: 'cloud',
          title: 'Cloud of the organization',
          method: 'oauth',
          state: 'connected',
          features: [
            { id: 'files', title: 'Files' },
            { id: 'calendar', title: 'Calendar' },
            { id: 'files', title: 'Files' },
            { id: 'nameless' },
            'junk',
          ],
        },
      ],
    })
    expect(cloud?.features).toEqual([
      { id: 'files', title: 'Files' },
      { id: 'calendar', title: 'Calendar' },
    ])
    expect(connectionsOf({ connections: [{ source: 'x', title: 'X' }] })[0]?.features).toEqual([])
    expect(CONNECTIONS_COPY['accounts.features']).toBe('For {{features}}')
    // the Connect card names the account and the feature of the card (UI-CONV-058)
    expect(CONNECTIONS_COPY['accounts.card.connect']).toBe('Connect your {{account}} account to use {{feature}}.')
  })

  it('reads loosely: a row with no source is left out, an unknown state is not connected, a reason only to reconnect', () => {
    const list = connectionsOf({
      connections: [
        { title: 'no source' },
        { source: 'a', state: 'strange', reason: 'expired', moreAccess: true },
        { source: 'b', state: 'reconnect' },
        { source: 'c', state: 'reconnect', reason: 'revoked', method: 'fields', fields: [{ label: 'x' }] },
      ],
    })
    expect(list.map((c) => [c.source, c.state, c.reason, c.moreAccess])).toEqual([
      ['a', 'not-connected', null, false],
      ['b', 'reconnect', 'changed', false],
      ['c', 'reconnect', 'revoked', false],
    ])
    expect(list[2]?.fields).toEqual([])
  })

  it('names a row by its source and the value of its binding, or the space it serves', () => {
    const list = connectionsOf(LIST)
    expect(connectionFor(list, { source: 'relaticle', bindingValue: '01JD8Q4W6Z0KX3V7N2M5B9C1TA' })?.account?.id).toBe(
      'acc_1'
    )
    expect(connectionFor(list, { source: 'relaticle', bindingValue: 'other' })).toBeUndefined()
    expect(connectionFor(list, { source: 'github', spaceId: 'spc_repo' })?.source).toBe('github')
    expect(connectionFor(list, { source: 'my_tasks' })?.method).toBe('fields')
    expect(connectionFor(list, { source: 'nothing' })).toBeUndefined()
  })

  it('says where each serves, its state and its controls (UI-CONV-053, UI-CONV-058)', () => {
    const [crm, github, tasks] = connectionsOf(LIST)
    expect(usageOfConnection(crm as never)).toEqual({ kind: 'places', personal: false, spaces: ['Sales EU'] })
    expect(usageOfConnection(github as never)).toEqual({ kind: 'places', personal: true, spaces: ['Test repo'] })
    expect(usageOfConnection({ usedIn: [{ kind: 'agent' }, { kind: 'personal' }] })).toEqual({ kind: 'all' })
    expect(usageOfConnection({ usedIn: [] })).toEqual({ kind: 'none' })
    expect(connectionStateKeyOf(crm as never)).toBe('connected')
    expect(connectionStateKeyOf(tasks as never)).toBe('notConnected')
    expect(connectionStateKeyOf({ state: 'connected', reason: null, moreAccess: true })).toBe('moreAccess')
    for (const reason of ['expired', 'revoked', 'changed'] as const)
      expect(connectionStateKeyOf({ state: 'reconnect', reason, moreAccess: false })).toBe(reason)
    expect(connectionControlsOf({ state: 'not-connected', moreAccess: false })).toEqual(['connect'])
    expect(connectionControlsOf({ state: 'connected', moreAccess: false })).toEqual(['disconnect'])
    expect(connectionControlsOf({ state: 'connected', moreAccess: true })).toEqual(['reconnect', 'disconnect'])
    expect(connectionControlsOf({ state: 'reconnect', moreAccess: false })).toEqual(['reconnect', 'disconnect'])
  })

  it('sends the space of a source of a space, and none for one of Personal or of every conversation', () => {
    const [crm, github, tasks] = connectionsOf(LIST)
    expect(spaceIdFor(crm as never)).toBe('spc_sales')
    expect(spaceIdFor(github as never)).toBeUndefined()
    expect(spaceIdFor(tasks as never)).toBeUndefined()
    expect(spaceIdFor({ usedIn: [{ kind: 'agent' }, { kind: 'space', id: 's', title: 'S' }] })).toBeUndefined()
  })

  it('tells an attempt that waits, the date since, and which sign-in URL may be opened', () => {
    expect(attemptWaits({ expiresAt: '2026-11-21T10:12:00Z' }, Date.parse('2026-11-21T10:11:00Z'))).toBe(true)
    expect(attemptWaits({ expiresAt: '2026-11-21T10:12:00Z' }, Date.parse('2026-11-21T10:13:00Z'))).toBe(false)
    expect(attemptWaits(null, 0)).toBe(false)
    const now = new Date('2026-11-25T00:00:00Z')
    expect(sinceDateOf('2026-11-21T10:02:00Z', 'en-GB', now)).toBe('21 Nov')
    expect(sinceDateOf('2026-11-21T10:02:00Z', 'en-US', now)).toBe('Nov 21')
    expect(sinceDateOf('2025-11-21T10:02:00Z', 'en-GB', now)).toBe('21 Nov 2025')
    expect(sinceDateOf('', 'en', now)).toBe('')
    expect(signInUrlAllowed('https://github.com/login/oauth/authorize?client_id=x')).toBe(true)
    expect(signInUrlAllowed('http://localhost:8000/oauth/authorize')).toBe(true)
    expect(signInUrlAllowed('http://crm.2060.io/oauth/authorize')).toBe(false)
    expect(signInUrlAllowed('javascript:alert(1)')).toBe(false)
    expect(signInUrlAllowed('data:text/html,<b>x</b>')).toBe(false)
    expect(signInUrlAllowed('/relative')).toBe(false)
  })

  it('declares nothing without `features.connections` (PROF-DESC-010)', () => {
    expect(takesConnections({ connections: true })).toBe(true)
    expect(takesConnections({ tools: true })).toBe(false)
    expect(takesConnections(undefined)).toBe(false)
  })
})

describe('outcomes and refusals (UI-CONV-058)', () => {
  it('reads `ayni.connections.changed`', () => {
    expect(
      connectionsChangeOf({
        source: 'relaticle',
        binding: { value: '01JD8', valueLabel: 'ayni-dev-agent' },
        state: 'not-connected',
        attemptId: 'att_1',
        outcome: 'wrong-binding',
        expected: 'ayni-dev-agent',
        chosen: 'Partners',
      })
    ).toEqual({
      source: 'relaticle',
      binding: { value: '01JD8', valueLabel: 'ayni-dev-agent' },
      state: 'not-connected',
      attemptId: 'att_1',
      outcome: 'wrong-binding',
      expected: 'ayni-dev-agent',
      chosen: 'Partners',
    })
    expect(connectionsChangeOf({ source: 'github', state: 'reconnect', reason: 'expired' })).toEqual({
      source: 'github',
      state: 'reconnect',
      reason: 'expired',
    })
    expect(connectionsChangeOf({ state: 'connected' })).toBeNull()
    expect(connectionsChangeOf({ source: 'x', outcome: 'nonsense' })?.outcome).toBeUndefined()
  })

  it('says each outcome, `ended` with no words of its own', () => {
    expect(outcomeNoticeOf({ outcome: 'connected', label: 'ana-rios' })).toEqual({
      key: 'connected',
      label: 'ana-rios',
    })
    expect(outcomeNoticeOf({ outcome: 'connected' })).toEqual({ key: 'connected', label: '' })
    for (const o of ['denied', 'failed', 'expired', 'cancelled', 'disconnected'] as const)
      expect(outcomeNoticeOf({ outcome: o })).toEqual({ key: o })
    expect(outcomeNoticeOf({ outcome: 'wrong-person' })).toEqual({ key: 'wrongPerson' })
    expect(outcomeNoticeOf({ outcome: 'wrong-binding', expected: 'a', chosen: 'b' })).toEqual({
      key: 'wrongBinding',
      expected: 'a',
      chosen: 'b',
    })
    expect(outcomeNoticeOf({ outcome: 'ended' })).toBeNull()
    expect(outcomeNoticeOf({})).toBeNull()
    expect(disconnectedKeyOf({ revokesAtSource: false })).toBe('disconnected')
    expect(disconnectedKeyOf({ revokesAtSource: true })).toBe('disconnectedRevoked')
  })

  it('places each refusal of §3.11: at a field, or under the row', () => {
    expect(connectionRefusalOf({ status: 422, code: 'bad-token', field: 'account.token' })).toEqual({
      at: 'field',
      field: 'token',
      reason: 'badToken',
    })
    expect(connectionRefusalOf({ status: 422, code: 'wrong-binding', expected: 'a', chosen: 'b' })).toEqual({
      at: 'row',
      reason: 'wrongBinding',
      expected: 'a',
      chosen: 'b',
    })
    expect(connectionRefusalOf({ status: 422, code: 'wrong-person' })).toEqual({ at: 'row', reason: 'wrongPerson' })
    expect(connectionRefusalOf({ status: 502, code: 'source-unavailable' })).toEqual({
      at: 'row',
      reason: 'unavailable',
    })
    expect(connectionRefusalOf({ status: 404, code: 'not-found' })).toEqual({ at: 'row', reason: 'notOffered' })
    expect(connectionRefusalOf({ status: 409, code: 'not-oauth' })).toEqual({ at: 'row', reason: 'changed' })
    expect(connectionRefusalOf({ status: 409, code: 'not-fields' })).toEqual({ at: 'row', reason: 'changed' })
    expect(connectionRefusalOf({ status: 400, code: 'bad-request', field: 'spaceId' })).toEqual({
      at: 'row',
      reason: 'changed',
    })
    expect(connectionRefusalOf({ status: 500, code: 'boom' })).toEqual({ at: 'row', reason: 'other' })
  })
})

describe('the endpoints of §3.11 as the client calls them (PROF-TOOL-014..017)', () => {
  function agent(answer: (method: string, path: string, body: unknown) => Response) {
    const calls: { method: string; path: string; body: unknown; auth: string | null; cache?: string }[] = []
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).slice(SESSIONS.length)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({
        method: init?.method ?? 'GET',
        path,
        body,
        auth: new Headers(init?.headers).get('authorization'),
        cache: init?.cache,
      })
      return answer(init?.method ?? 'GET', path, body)
    }
    return { client: new ProfileClient(SESSIONS, fetchFn as typeof fetch), calls }
  }

  it('reads Your accounts', async () => {
    const { client, calls } = agent(() => json(LIST))
    const list = await client.connections('t')
    expect(calls[0]).toEqual({
      method: 'GET',
      path: '/connections',
      body: undefined,
      auth: 'Bearer t',
      cache: 'no-store',
    })
    expect(list.map((c) => c.source)).toEqual(['relaticle', 'github', 'my_tasks'])
  })

  it('starts a sign-in, with the space for a source of a space, and ends one that waits', async () => {
    const attempt = {
      attemptId: 'att_2',
      authorizationUrl: 'https://github.com/login/oauth/authorize?x',
      expiresAt: 'e',
    }
    const { client, calls } = agent((method) => (method === 'DELETE' ? json(undefined, 204) : json(attempt, 202)))
    expect(await client.authorizeConnection('t', 'github')).toEqual(attempt)
    await client.authorizeConnection('t', 'relaticle', 'spc_sales')
    await client.cancelConnectionAttempt('t', 'att_2')
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/connections/github/authorize', {}],
      ['POST', '/connections/relaticle/authorize', { spaceId: 'spc_sales' }],
      ['DELETE', '/connections/attempts/att_2', undefined],
    ])
  })

  it('sets an account of fields and disconnects one, each answering its item', async () => {
    const connected = { ...LIST.connections[2], state: 'connected', account: { id: 'acc_9', label: 'tt' } }
    const { client, calls } = agent((method) =>
      json({ connection: method === 'PUT' ? connected : { ...connected, state: 'not-connected', account: null } })
    )
    const set = await client.setConnectionAccount('t', 'my_tasks', { token: 'tt_x' })
    expect(set.state).toBe('connected')
    await client.setConnectionAccount('t', 'relaticle', { token: 'v' }, 'spc_sales')
    const gone = await client.disconnectAccount('t', 'acc_9')
    expect(gone.connection.state).toBe('not-connected')
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['PUT', '/connections/my_tasks/account', { values: { token: 'tt_x' } }],
      ['PUT', '/connections/relaticle/account', { values: { token: 'v' }, spaceId: 'spc_sales' }],
      ['DELETE', '/connections/accounts/acc_9', undefined],
    ])
  })

  it('gives the refusal its field, and the names of a wrong binding', async () => {
    const { client } = agent(() =>
      json({ error: 'wrong-binding', expected: 'ayni-dev-agent', chosen: 'Partners', message: 'no' }, 422)
    )
    const e = (await client.setConnectionAccount('t', 'relaticle', { token: 'v' }).catch((x) => x)) as ProfileError
    expect(e).toBeInstanceOf(ProfileError)
    expect([e.status, e.code, e.expected, e.chosen]).toEqual([422, 'wrong-binding', 'ayni-dev-agent', 'Partners'])
    const bad = agent(() => json({ error: 'bad-token', field: 'account.token' }, 422)).client
    const e2 = (await bad.setConnectionAccount('t', 'my_tasks', { token: 'x' }).catch((x) => x)) as ProfileError
    expect([e2.code, e2.field]).toEqual(['bad-token', 'account.token'])
    const none = agent(() => json({}, 202)).client
    await expect(none.authorizeConnection('t', 'github')).rejects.toMatchObject({ status: 502 })
  })
})

describe('`personal` in the shapes of 3.4 (PROF-TOOL-021)', () => {
  it("reads a space's tool of each person's own account, and a binding chosen from the owner's", () => {
    const tool = spaceToolOf({
      feature: { id: 'crm', title: 'CRM', profile: null },
      source: 'relaticle',
      title: 'Relaticle CRM',
      state: 'setup',
      account: { kind: 'personal', connected: true },
      bindings: [
        {
          name: 'workspace',
          label: 'Workspace',
          value: null,
          setBy: 'owner',
          fromAccount: true,
          choices: [{ value: '01JD8', valueLabel: 'ayni-dev-agent' }, { value: '' }, { valueLabel: 'no value' }],
        },
        { name: 'region', label: 'Region', value: 'eu', valueLabel: 'Europe', setBy: 'pack' },
      ],
      tools: [],
      pending: null,
    })
    expect(tool?.account).toEqual({ kind: 'personal', connected: true })
    expect(tool?.bindings[0]).toMatchObject({
      fromAccount: true,
      choices: [{ value: '01JD8', valueLabel: 'ayni-dev-agent' }],
    })
    expect(tool?.bindings[1]).toMatchObject({ valueLabel: 'Europe' })
    expect(tool?.bindings[1]?.fromAccount).toBeUndefined()
    expect(spaceToolOf({ feature: { id: 'social' }, source: 'x', account: { kind: 'personal' } })?.account).toEqual({
      kind: 'personal',
      connected: false,
    })
  })

  it("names the row of Your accounts a tool that uses another source's account is under (ayni-spec #110)", () => {
    const project = spaceToolOf({
      feature: { id: 'code', title: 'Code and issues', profile: null },
      source: 'github-project',
      title: 'GitHub repository',
      account: { kind: 'personal', connected: false, source: 'github' },
    })
    expect(project?.account).toEqual({ kind: 'personal', connected: false, source: 'github' })
    expect(accountSourceOf(project as never)).toBe('github')
    expect(accountSourceOf({ source: 'relaticle', account: { kind: 'personal', connected: true } })).toBe('relaticle')
    // only a personal account names one
    expect(
      spaceToolOf({ feature: { id: 'search' }, source: 'web', account: { kind: 'agent', source: 'other' } })?.account
    ).toEqual({
      kind: 'agent',
    })
    expect(accountSourceOf({ source: 'web', account: { kind: 'agent' } })).toBe('web')
  })

  it('reads the account of an action: its label on the card of its person only', () => {
    const own = toolActionOf({
      title: 'Comment on an issue',
      source: { id: 'github', title: 'GitHub' },
      account: { kind: 'personal', label: 'ana-rios' },
      fields: [],
    })
    expect(own?.account).toEqual({ kind: 'personal', label: 'ana-rios' })
    const approver = toolActionOf({ title: 'x', source: { id: 'github' }, account: { kind: 'personal' }, fields: [] })
    expect(approver?.account).toEqual({ kind: 'personal' })
    expect(accountLineOf({ kind: 'personal', label: 'ana-rios' }, 'own')).toEqual({
      key: 'accountYours',
      label: 'ana-rios',
    })
    expect(accountLineOf({ kind: 'personal' }, 'own')).toEqual({ key: 'accountOwn' })
    expect(accountLineOf({ kind: 'personal' }, 'approver')).toEqual({ key: 'accountRequester' })
    expect(accountLineOf({ kind: 'space', space: { id: 's', title: 'Sales EU' } }, 'approver')).toEqual({
      key: 'accountSpace',
      space: 'Sales EU',
    })
    expect(accountLineOf({ kind: 'agent' }, 'own')).toEqual({ key: 'accountAgent' })
    expect(accountLineOf({ kind: 'none' }, 'own')).toBeNull()
  })

  it('reads `personal` in the sources of a reply and of a conversation', () => {
    expect(messageSourcesOf([{ source: 'github', title: 'GitHub', account: 'personal' }])).toEqual([
      { source: 'github', title: 'GitHub', account: 'personal' },
    ])
    expect(
      conversationSourcesOf({
        sources: [{ source: 'github', title: 'GitHub', account: { kind: 'personal' }, results: 2 }],
      })
    ).toEqual([{ source: 'github', title: 'GitHub', account: { kind: 'personal' }, results: 2, lastAt: '' }])
  })

  it('places `422 not-your-account` at the binding it names', () => {
    expect(toolRefusalOf({ status: 422, code: 'not-your-account', field: 'bindings.workspace' })).toEqual({
      at: 'binding',
      name: 'workspace',
      reason: 'notYourAccount',
    })
  })
})

describe('the stream, history and links of 3.5', () => {
  const session: SessionRecord = {
    sessionId: 's1',
    agentDid: 'did:x',
    sessionToken: 't',
    title: 'here is my token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    createdAt: '',
    state: 'bound',
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: 'here is my token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    lastMessageAt: '',
    draft: '',
    ayni: null,
    conversationId: 'c1',
  }
  const SENT = 'here is my token ghp_abcdefghijklmnopqrstuvwxyz0123456789'
  const KEPT = 'here is my token ghp_…'
  const mine: TranscriptMessage = { id: 'u_run1', role: 'user', content: SENT, at: '2026-11-21T10:00:00.000Z' }
  const transcript: Transcript = { ...emptyTranscript('s1'), messages: [mine] }
  const withheld = (value: Record<string, unknown>) =>
    reduce(transcript, session, { type: 'CUSTOM', name: 'ayni.messages.withheld', value }, true, true)

  it('`ayni.messages.erased` names a message by the id a client gave it, at its place, and nothing by `""`', () => {
    expect(namedMessageIds({ messageIds: ['msg_9', 'msg_10'], clientIds: ['u-door', ''] })).toEqual([
      'msg_9',
      'msg_10',
      'u-door',
    ])
    // the person's message held here under its own id, and the agent's reply to it, deleted together
    const reply: TranscriptMessage = {
      id: 'msg_10',
      role: 'assistant',
      content: 'The door code is…',
      at: '2026-11-21T10:01:00.000Z',
    }
    const held: Transcript = {
      ...emptyTranscript('s1'),
      messages: [
        { id: 'u-door', role: 'user', content: 'What is the door code?', at: '2026-11-21T10:00:00.000Z' },
        reply,
      ],
      reactions: { 'u-door': [{ emoji: '👍', by: 'Ana' }] },
    }
    const r = reduce(
      held,
      session,
      {
        type: 'CUSTOM',
        name: 'ayni.messages.erased',
        value: { conversationId: 'c1', messageIds: ['msg_9', 'msg_10'], clientIds: ['u-door', ''] },
      },
      false,
      true
    )
    expect(r.transcript.messages).toEqual([])
    expect(r.transcript.reactions).toEqual({})
  })

  it('`ayni.connections.changed` is a signal, never a message (PROF-TOOL-019)', () => {
    const r = reduce(
      transcript,
      session,
      { type: 'CUSTOM', name: 'ayni.connections.changed', value: { source: 'github', state: 'connected' } },
      false,
      true
    )
    expect(r.signals).toEqual(['connections'])
    expect(r.transcript).toBe(transcript)
  })

  it('a message held back for a credential takes the text the agent kept, in the transcript and the session (UI-CONV-044)', () => {
    const r = withheld({
      conversationId: 'c1',
      messageIds: ['msg_9'],
      clientIds: ['u_run1'],
      reason: 'credential',
      texts: { msg_9: KEPT },
    })
    expect(r.transcript.messages[0]).toMatchObject({ content: KEPT, modelVisible: false, withheld: 'credential' })
    expect(r.session.title).toBe(KEPT)
    expect(r.session.lastPreview).toBe(KEPT)
    expect(JSON.stringify(r)).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789')
  })

  it('an email check keeps the text and the reason it always had', () => {
    const r = withheld({ conversationId: 'c1', messageIds: ['msg_9'], clientIds: ['u_run1'] })
    expect(r.transcript.messages[0]).toMatchObject({ content: SENT, modelVisible: false })
    expect((r.transcript.messages[0] as { withheld?: string }).withheld).toBeUndefined()
    expect(r.session.title).toBe(SENT)
  })

  it('pairs the client\'s ids with the agent\'s by place, `""` for a message no client sent (ayni-spec #110)', () => {
    expect(withheldTextsOf({ messageIds: ['m1', 'm2'], clientIds: ['c1', 'c2'], texts: { m1: 'a', m2: 'b' } })).toEqual(
      {
        m1: 'a',
        m2: 'b',
        c1: 'a',
        c2: 'b',
      }
    )
    expect(withheldTextsOf({ messageIds: ['m1'], clientIds: ['c1'], texts: { m1: 'a' } })).toEqual({ m1: 'a', c1: 'a' })
    // the second message was sent by no client (another device's, or one the agent wrote): nothing is named by ""
    expect(withheldTextsOf({ messageIds: ['m1', 'm2'], clientIds: ['c1', ''], texts: { m1: 'a', m2: 'b' } })).toEqual({
      m1: 'a',
      m2: 'b',
      c1: 'a',
    })
    // by place, never "the only text": a client's id of a message with no text kept takes none
    expect(withheldTextsOf({ messageIds: ['m1', 'm2'], clientIds: ['', 'c2'], texts: { m1: 'a' } })).toEqual({
      m1: 'a',
    })
    expect(withheldTextsOf({ messageIds: ['m1'], texts: { m1: 3 } })).toEqual({})
    // a message another device sent arrives with the text the agent kept: it is only marked
    const other = withWithheld(
      { ...emptyTranscript('s1'), messages: [{ ...mine, id: 'msg_9', content: KEPT }] },
      ['msg_9'],
      {
        texts: {},
      }
    )
    expect(other.messages[0]).toMatchObject({ content: KEPT, withheld: 'credential', modelVisible: false })
  })

  it('history gives the mark and the text kept (PROF-HIST-013), to a message held here and to one read anew', () => {
    const page = [
      {
        id: 'msg_9',
        role: 'user',
        content: KEPT,
        metadata: {
          createdAt: '2026-11-21T10:00:01.000Z',
          externalId: 'u_run1',
          modelVisible: false,
          withheld: 'credential',
        },
      },
    ]
    const merged = mergeHistory(transcript, page, null)
    expect(merged.messages).toHaveLength(1)
    expect(merged.messages[0]).toMatchObject({
      id: 'msg_9',
      content: KEPT,
      modelVisible: false,
      withheld: 'credential',
    })
    expect(toTranscriptMessage(page[0] as never)).toMatchObject({ content: KEPT, withheld: 'credential' })
    expect(
      (
        toTranscriptMessage({ id: 'x', role: 'user', content: 'a', metadata: { withheld: 'credential' } }) as {
          withheld?: string
        }
      ).withheld
    ).toBeUndefined()
  })

  it('reads the app link of Your accounts, and nothing from it but the page (PROF-LINK-004)', () => {
    const origin = 'https://app.ayni.org'
    expect(parseAppLink('https://app.ayni.org/app/service/did:webvh:fleet/accounts', origin)).toEqual({
      path: 'service',
      did: 'did:webvh:fleet',
      accounts: true,
    })
    expect(parseAppLink('/app/service/did:webvh:fleet/accounts?outcome=connected&code=x', origin)).toEqual({
      path: 'service',
      did: 'did:webvh:fleet',
      accounts: true,
    })
    expect(parseAppLink('/app/service/did:webvh:fleet/other', origin)).toEqual({ path: 'unknown' })
    expect(parseAppLink('/app/service/did:webvh:fleet', origin)).toEqual({ path: 'service', did: 'did:webvh:fleet' })
  })

  it('writes the English wording once, with no em-dash', () => {
    for (const text of Object.values(CONNECTIONS_COPY)) expect(text.includes('—')).toBe(false)
  })
})
