/**
 * Package 3.5.10 in the core (an account that several sources use, and the scopes of each tool; agent D118, ayni-agent
 * decision 87): the item of Your accounts with `access` (§3.13, PROF-TOOL-028) and the lines a screen draws of it
 * (UI-CONV-061, UI-CONV-063); the sign-in for one source (PROF-TOOL-029); the Connect card's `why: "allow"`; the
 * managed folder's Allow (UI-CONV-070); the agent's key service (PROF-TOOL-032). The bodies are those of ayni-agent's
 * tests/googleAccount.test.ts, with the spec's invented names.
 */
import { describe, expect, it } from 'vitest'
import {
  accessLinesOf,
  type Connection,
  connectCardOf,
  connectCardStateOf,
  connectionRefusalOf,
  connectionsChangeOf,
  connectionsOf,
  disconnectedAccountOf,
  disconnectedKeyOf,
  outcomeNoticeOf,
  signInSourceOfCard,
} from '../src/connections.js'
import { CONNECTIONS_COPY } from '../src/connectionsCopy.js'
import { ProfileClient } from '../src/profileClient.js'
import { accountSourceOf, folderSignInOf, spaceToolOf } from '../src/tools.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'
const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** The item `google` as the agent lists it before any sign-in (googleAccount.test.ts). */
const GOOGLE = {
  source: 'google',
  title: 'Google',
  description: 'Your files and your calendar at Google, with your own rights there',
  method: 'oauth',
  binding: null,
  usedIn: [{ kind: 'personal' }],
  state: 'not-connected',
  reason: null,
  moreAccess: false,
  account: null,
  attempt: null,
  revokesAtSource: true,
  features: [
    { id: 'files', title: 'Files' },
    { id: 'calendar', title: 'Calendar' },
  ],
  access: [
    { source: 'drive', title: 'Google Drive', allowed: 'none' },
    { source: 'calendar', title: 'Google Calendar', allowed: 'none' },
  ],
}
/** Once Ana allowed Google Drive and unticked `drive` at Google's consent. */
const GOOGLE_IN_PART = {
  ...GOOGLE,
  state: 'connected',
  account: { id: 'acc_g', label: 'ana@example.org', connectedAt: '2026-11-22T09:02:00Z', lastUsedAt: null },
  access: [
    { source: 'drive', title: 'Google Drive', allowed: 'some', missing: ['Create a file', "Replace a file's content"] },
    { source: 'calendar', title: 'Google Calendar', allowed: 'none' },
  ],
}
/** A source of its own sign-in whose tools declare their scopes: its `access` names it alone. */
const NOTES = {
  ...GOOGLE,
  source: 'notes',
  title: 'Notes',
  description: 'Your notes',
  features: [{ id: 'notes', title: 'Notes' }],
  revokesAtSource: false,
  access: [{ source: 'notes', title: 'Notes', allowed: 'none' }],
}
/** Any other item: no access. */
const { access: _none, ...GITHUB_BASE } = NOTES
const GITHUB = { ...GITHUB_BASE, source: 'github', title: 'GitHub', features: [] }

const item = (value: unknown): Connection => connectionsOf({ connections: [value] })[0] as Connection

describe('an account that several sources use, as the agent lists it (§3.13, PROF-TOOL-028)', () => {
  it('reads its access, one source each, in the agent order; an item of a single scoped source, its own', () => {
    const list = connectionsOf({ connections: [NOTES, GOOGLE, GITHUB] })
    expect(list.map((c) => [c.source, c.access])).toEqual([
      ['notes', [{ source: 'notes', title: 'Notes', allowed: 'none', missing: [] }]],
      [
        'google',
        [
          { source: 'drive', title: 'Google Drive', allowed: 'none', missing: [] },
          { source: 'calendar', title: 'Google Calendar', allowed: 'none', missing: [] },
        ],
      ],
      // any other item carries none
      ['github', []],
    ])
    expect(item(GOOGLE_IN_PART).access[0]).toEqual({
      source: 'drive',
      title: 'Google Drive',
      allowed: 'some',
      missing: ['Create a file', "Replace a file's content"],
    })
  })

  it('reads loosely: a source with no id or said twice is left out, an unknown allowed claims nothing', () => {
    const c = item({
      ...GOOGLE,
      access: [
        { title: 'No id', allowed: 'all' },
        { source: 'drive', allowed: 'maybe', missing: ['Create a file'] },
        { source: 'drive', title: 'Twice', allowed: 'all' },
        { source: 'calendar', title: 'Google Calendar', allowed: 'all', missing: ['Not read for all'] },
        { source: 'tasks', title: 'Tasks', allowed: 'some', missing: ['Add a task', 7, '  ', null] },
      ],
    })
    expect(c.access).toEqual([
      { source: 'drive', title: 'drive', allowed: 'none', missing: [] },
      { source: 'calendar', title: 'Google Calendar', allowed: 'all', missing: [] },
      { source: 'tasks', title: 'Tasks', allowed: 'some', missing: ['Add a task'] },
    ])
    expect(item({ ...GOOGLE, access: 'all' }).access).toEqual([])
  })

  it('gives each source its line and control: allowed, allowed in part with what is not, not allowed (UI-CONV-061)', () => {
    const allowed = item({
      ...GOOGLE_IN_PART,
      access: [...GOOGLE_IN_PART.access, { source: 'sheets', title: 'Google Sheets', allowed: 'all' }],
    })
    expect(accessLinesOf(allowed)).toEqual([
      {
        source: 'drive',
        title: 'Google Drive',
        key: 'allowedInPart',
        missing: ['Create a file', "Replace a file's content"],
        control: 'allowMore',
      },
      { source: 'calendar', title: 'Google Calendar', key: 'notAllowed', missing: [], control: 'allow' },
      { source: 'sheets', title: 'Google Sheets', key: 'allowed', missing: [], control: null },
    ])
    expect(accessLinesOf(item(GITHUB))).toEqual([])
  })

  it('reads the change of an item, which the agent also sends when its access changes', () => {
    expect(
      connectionsChangeOf({
        source: 'google',
        state: 'connected',
        moreAccess: false,
        accountId: 'acc_g',
        label: 'ana@example.org',
        attemptId: 'att_c',
        outcome: 'connected',
      })
    ).toEqual({
      source: 'google',
      state: 'connected',
      moreAccess: false,
      accountId: 'acc_g',
      label: 'ana@example.org',
      attemptId: 'att_c',
      outcome: 'connected',
    })
    // a sign-in whose ID token the agent refused: the account is not the person's, or the sign-in did not complete
    for (const outcome of ['failed', 'wrong-person'] as const)
      expect(outcomeNoticeOf(connectionsChangeOf({ source: 'google', state: 'not-connected', outcome }) ?? {})).toEqual(
        { key: outcome === 'failed' ? 'failed' : 'wrongPerson' }
      )
  })
})

describe('the sign-in for one source, and the Connect card that allows one (PROF-TOOL-029, PROF-TOOL-020)', () => {
  /** The cards of googleAccount.test.ts: to connect the account for Calendar, then to allow Calendar on it. */
  const CONNECT = {
    source: 'google',
    title: 'Google',
    description: 'Your files and your calendar at Google, with your own rights there',
    method: 'oauth',
    why: 'connect',
    feature: { id: 'calendar', title: 'Calendar' },
  }
  const ALLOW = { ...CONNECT, why: 'allow', allow: { source: 'calendar', title: 'Google Calendar' } }

  it('starts the sign-in for the source named, or for the account', async () => {
    const calls: [string, string, unknown][] = []
    const client = new ProfileClient(SESSIONS, (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([init?.method ?? 'GET', String(input).slice(SESSIONS.length), JSON.parse(String(init?.body))])
      return json(
        { attemptId: 'att_1', authorizationUrl: 'https://accounts.example.org/o/oauth2/auth', expiresAt: 'e' },
        202
      )
    }) as typeof fetch)
    await client.authorizeConnection('t', 'drive')
    await client.authorizeConnection('t', 'google')
    expect(calls).toEqual([
      ['POST', '/connections/drive/authorize', {}],
      ['POST', '/connections/google/authorize', {}],
    ])
  })

  it('reads why: "allow" with the source to allow, the card naming the account and the feature of that source', () => {
    expect(connectCardOf(ALLOW)).toEqual({
      source: 'google',
      title: 'Google',
      feature: { id: 'calendar', title: 'Calendar' },
      description: 'Your files and your calendar at Google, with your own rights there',
      method: 'oauth',
      why: 'allow',
      allow: { source: 'calendar', title: 'Google Calendar' },
    })
    // a card to allow that names no source is a card to connect the account
    expect(connectCardOf({ ...CONNECT, why: 'allow' })).toMatchObject({ why: 'connect' })
    expect(connectCardOf({ ...CONNECT, why: 'allow' })?.allow).toBeUndefined()
    expect(connectCardOf({ ...ALLOW, allow: { source: 'calendar' } })?.allow).toEqual({
      source: 'calendar',
      title: 'calendar',
    })
    expect(connectCardOf(CONNECT)?.allow).toBeUndefined()
  })

  it('signs in for the source of allow, and for the account otherwise', () => {
    expect(signInSourceOfCard(connectCardOf(ALLOW) as never)).toBe('calendar')
    expect(signInSourceOfCard(connectCardOf(CONNECT) as never)).toBe('google')
    expect(signInSourceOfCard({ source: 'google', why: 'reconnect' })).toBe('google')
  })

  it("says the account's state, and Allow while its source of allow is not allowed in full", () => {
    const allow = connectCardOf(ALLOW) as NonNullable<ReturnType<typeof connectCardOf>>
    const connect = connectCardOf(CONNECT) as NonNullable<ReturnType<typeof connectCardOf>>
    const inPart = item(GOOGLE_IN_PART)
    const calendar = (allowed: string) =>
      item({ ...GOOGLE_IN_PART, access: [GOOGLE_IN_PART.access[0], { ...GOOGLE.access[1], allowed }] })
    expect(connectCardStateOf(allow, inPart)).toBe('allow')
    expect(connectCardStateOf(allow, calendar('some'))).toBe('allow')
    // allowed: the card reads as any connected one
    expect(connectCardStateOf(allow, calendar('all'))).toBe('connected')
    // the account ended since: Connect, which still signs in for the source of allow
    expect(connectCardStateOf(allow, item(GOOGLE))).toBe('connect')
    expect(connectCardStateOf(allow, item({ ...GOOGLE_IN_PART, state: 'reconnect', reason: 'revoked' }))).toBe(
      'reconnect'
    )
    expect(connectCardStateOf(allow, item({ ...GOOGLE_IN_PART, moreAccess: true }))).toBe('reconnect')
    // no row known: the card's own why
    expect(connectCardStateOf(allow, undefined)).toBe('allow')
    expect(connectCardStateOf(connect, undefined)).toBe('connect')
    expect(connectCardStateOf({ why: 'reconnect' }, undefined)).toBe('reconnect')
    // a card to connect, the account connected: connected, whatever its sources
    expect(connectCardStateOf(connect, inPart)).toBe('connected')
    expect(connectCardStateOf(connect, item(GOOGLE))).toBe('connect')
  })
})

describe("a managed folder's Allow (UI-CONV-070, agent decision 87)", () => {
  it("signs in for the provider in the space, its outcome on the row of the provider's account", () => {
    const drive = spaceToolOf({
      feature: { id: 'files', title: 'Files', profile: { id: 'org.ayni/files', version: '1.0' } },
      source: 'team-drive',
      title: 'Google Drive',
      account: { kind: 'personal', connected: true, source: 'google' },
      folder: { title: 'Project Beta', state: 'creating', reason: 'scope-missing', managedWith: 'owner' },
    })
    expect(accountSourceOf(drive as never)).toBe('google')
    expect(folderSignInOf(drive as never)).toEqual({ source: 'team-drive', account: 'google' })
    // a provider of its own account: both are the provider
    expect(folderSignInOf({ source: 'nextcloud', account: { kind: 'personal', connected: false } })).toEqual({
      source: 'nextcloud',
      account: 'nextcloud',
    })
  })
})

describe("the agent's key service (PROF-TOOL-032, UI-CONV-063)", () => {
  it('reads the outcome unavailable, and 503 keys-unavailable under the row', () => {
    const change = connectionsChangeOf({
      source: 'google',
      state: 'not-connected',
      attemptId: 'a',
      outcome: 'unavailable',
    })
    expect(change?.outcome).toBe('unavailable')
    expect(outcomeNoticeOf(change ?? {})).toEqual({ key: 'unavailable' })
    expect(connectionRefusalOf({ status: 503, code: 'keys-unavailable' })).toEqual({
      at: 'row',
      reason: 'keysUnavailable',
    })
    // the service's own, as before
    expect(connectionRefusalOf({ status: 502, code: 'source-unavailable' })).toEqual({
      at: 'row',
      reason: 'unavailable',
    })
  })

  it('reads the answer of Disconnect with revokedAtSource, and says what follows it', async () => {
    const gone = { ...GOOGLE, access: GOOGLE.access }
    expect(disconnectedAccountOf({ connection: gone, revokedAtSource: false })).toMatchObject({
      connection: { source: 'google', state: 'not-connected' },
      revokedAtSource: false,
    })
    expect(disconnectedAccountOf({ connection: gone })).not.toHaveProperty('revokedAtSource')
    expect(disconnectedAccountOf({ revokedAtSource: true })).toBeNull()
    expect(disconnectedKeyOf({ revokesAtSource: true }, false)).toBe('disconnectedNotTold')
    expect(disconnectedKeyOf({ revokesAtSource: true }, true)).toBe('disconnectedRevoked')
    expect(disconnectedKeyOf({ revokesAtSource: true })).toBe('disconnectedRevoked')
    expect(disconnectedKeyOf({ revokesAtSource: false })).toBe('disconnected')
    const client = new ProfileClient(SESSIONS, (async () =>
      json({ connection: gone, revokedAtSource: false })) as unknown as typeof fetch)
    const answer = await client.disconnectAccount('t', 'acc_g')
    expect(answer.revokedAtSource).toBe(false)
    expect(answer.connection.access.map((a) => a.allowed)).toEqual(['none', 'none'])
    const none = new ProfileClient(SESSIONS, (async () => json({})) as unknown as typeof fetch)
    await expect(none.disconnectAccount('t', 'acc_g')).rejects.toMatchObject({ status: 502 })
  })
})

describe('the words of an account that several sources use (UI-CONV-063)', () => {
  it('says each row of the table as the spec writes it', () => {
    expect(CONNECTIONS_COPY).toMatchObject({
      'accounts.access.allowed': '{{source}}: allowed',
      'accounts.access.allowedInPart': '{{source}}: allowed in part',
      'accounts.access.missing': 'Not allowed: {{tools}}',
      'accounts.access.notAllowed': '{{source}}: not allowed',
      'accounts.allow': 'Allow',
      'accounts.allowMore': 'Allow more',
      'accounts.card.allow': 'Allow {{feature}} on your {{account}} account.',
      'accounts.outcome.unavailable':
        'Not connected: {{agent}} cannot keep your account just now. Try again in a few minutes.',
      'accounts.outcome.disconnectedNotTold':
        'Disconnected. {{agent}} could not tell {{source}}: remove its access in your settings there.',
    })
  })
})
