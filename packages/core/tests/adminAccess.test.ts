/**
 * Admin access (profile 3.5.5 §3.14, PROF-ADMIN-001 to 007; agent D132 to D134; UI-ADMIN-001 to 006): the state the
 * agent answers, Show Admin and Hide Admin, `ayni.admin.changed`, the menu's entry and the ADMIN area by the clock, the
 * words of a request and of a refusal, and every call of Audit and Operations with its reason, as the agent of
 * ayni-agent #120 serves them.
 */
import { describe, expect, it } from 'vitest'
import {
  ADMIN_CHANGED,
  ADMIN_COPY,
  ADMIN_REFUSAL_WORDS,
  adminAccessOf,
  adminAreaOf,
  adminChangedOf,
  adminMenuEntryOf,
  adminPageOpen,
  adminReasonFits,
  adminRefusalOf,
  adminRequestAfter,
  adminRequestWordsOf,
  auditPeopleOf,
  auditPeopleQueryOf,
  auditPeriodOf,
  auditValueOf,
  entryIdsOf,
  grantOpen,
  keysOf,
  takesAdmin,
} from '../src/adminAccess.js'
import { MENU_ICON } from '../src/menus.js'
import { ProfileClient, ProfileError } from '../src/profileClient.js'
import { emptyTranscript, reduce } from '../src/reducer.js'
import type { SessionRecord } from '../src/types.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'
const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

function agent(answer: (method: string, path: string, body: unknown) => Response = () => json({})) {
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = []
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).slice(SESSIONS.length)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method: init?.method ?? 'GET', path, body, auth: new Headers(init?.headers).get('authorization') })
    return answer(init?.method ?? 'GET', path, body)
  }
  return { client: new ProfileClient(SESSIONS, fetchFn as typeof fetch), calls }
}

const NOW = Date.parse('2026-11-24T14:02:00.000Z')
const UNTIL = '2026-11-24T14:32:00.000Z'
const JONAS = { roles: ['auditor' as const], grant: null }
const JONAS_OPEN = { roles: ['auditor' as const], grant: { expiresAt: UNTIL } }
const BOTH_OPEN = { roles: ['auditor' as const, 'operator' as const], grant: { expiresAt: UNTIL } }

describe('the admin state (PROF-DESC-013, PROF-ADMIN-001)', () => {
  it('takes features.admin, and nothing else, as an agent that serves admin access', () => {
    expect(takesAdmin({ admin: true })).toBe(true)
    expect(takesAdmin({ admin: 'yes' })).toBe(false)
    expect(takesAdmin({})).toBe(false)
    expect(takesAdmin(undefined)).toBe(false)
  })

  it('reads the roles and the grant; roles: [] alone for a person without one', () => {
    expect(adminAccessOf({ roles: ['auditor'], grant: { open: true, expiresAt: UNTIL } })).toEqual(JONAS_OPEN)
    expect(adminAccessOf({ roles: ['auditor'], grant: null })).toEqual(JONAS)
    expect(adminAccessOf({ roles: [] })).toEqual({ roles: [], grant: null })
    // a role of the directory that is not an admin role, and a grant to a person with none, are not admin access
    expect(adminAccessOf({ roles: ['support'], grant: { open: true, expiresAt: UNTIL } })).toEqual({
      roles: [],
      grant: null,
    })
    expect(adminAccessOf({ roles: ['operator', 'auditor'] }).roles).toEqual(['auditor', 'operator'])
    expect(adminAccessOf({ roles: ['auditor'], grant: { open: true, expiresAt: 'soon' } }).grant).toBeNull()
    expect(adminAccessOf(undefined)).toEqual({ roles: [], grant: null })
  })

  it('reads ayni.admin.changed with its outcome', () => {
    expect(adminChangedOf({ roles: ['auditor'], grant: { open: true, expiresAt: UNTIL }, outcome: 'opened' })).toEqual({
      access: JONAS_OPEN,
      outcome: 'opened',
    })
    expect(adminChangedOf({ roles: ['auditor'], grant: null, outcome: 'declined' })).toEqual({
      access: JONAS,
      outcome: 'declined',
    })
    expect(adminChangedOf({ roles: ['auditor'], grant: null, outcome: 'nonsense' })).toEqual({ access: JONAS })
    expect(adminChangedOf({ grant: null })).toBeNull()
    expect(adminChangedOf('x')).toBeNull()
  })
})

describe("the agent's menu and the ADMIN area (UI-ADMIN-001, UI-ADMIN-003)", () => {
  const ADMIN = { admin: true }

  it('shows Show Admin to a holder of a role, Hide Admin while the grant is open, nothing to anyone else', () => {
    expect(adminMenuEntryOf(ADMIN, JONAS, NOW)).toBe('showAdmin')
    expect(adminMenuEntryOf(ADMIN, JONAS_OPEN, NOW)).toBe('hideAdmin')
    // Ben holds no admin role
    expect(adminMenuEntryOf(ADMIN, { roles: [], grant: null }, NOW)).toBeNull()
    // not asked yet, or an agent that does not declare it
    expect(adminMenuEntryOf(ADMIN, undefined, NOW)).toBeNull()
    expect(adminMenuEntryOf({}, JONAS, NOW)).toBeNull()
    // at its end by the browser's clock the grant is no longer open: Show Admin again
    expect(adminMenuEntryOf(ADMIN, JONAS_OPEN, Date.parse(UNTIL))).toBe('showAdmin')
  })

  it('takes the icons of the entries and of the rows of the area from one table, the same in the app', () => {
    expect(MENU_ICON.showAdmin).toBe('shield-user')
    expect(MENU_ICON.hideAdmin).toBe('shield-off')
    // the rows of the area by their page, as adminAreaOf names them
    const pages: (keyof typeof MENU_ICON)[] = adminAreaOf(BOTH_OPEN, NOW)?.pages ?? []
    expect(pages.map((page) => MENU_ICON[page])).toEqual(['file-search', 'wrench'])
  })

  it('shows the area exactly while the grant is open, with Audit for an auditor and Operations for an operator', () => {
    expect(adminAreaOf(JONAS_OPEN, NOW)).toEqual({ pages: ['audit'], expiresAt: UNTIL })
    expect(adminAreaOf(BOTH_OPEN, NOW)).toEqual({ pages: ['audit', 'operations'], expiresAt: UNTIL })
    expect(adminAreaOf({ roles: ['operator'], grant: { expiresAt: UNTIL } }, NOW)?.pages).toEqual(['operations'])
    expect(adminAreaOf(JONAS, NOW)).toBeNull()
    expect(adminAreaOf(undefined, NOW)).toBeNull()
    // it hides itself at expiresAt
    expect(adminAreaOf(JONAS_OPEN, Date.parse(UNTIL) - 1)).not.toBeNull()
    expect(adminAreaOf(JONAS_OPEN, Date.parse(UNTIL))).toBeNull()
    expect(grantOpen(JONAS_OPEN, Date.parse(UNTIL))).toBe(false)
  })

  it('keeps a page open only while its role holds under an open grant', () => {
    expect(adminPageOpen(BOTH_OPEN, 'operations', NOW)).toBe(true)
    expect(adminPageOpen(JONAS_OPEN, 'operations', NOW)).toBe(false)
    expect(adminPageOpen(JONAS_OPEN, 'audit', Date.parse(UNTIL))).toBe(false)
  })
})

describe('Show Admin, as the card says it (UI-ADMIN-002)', () => {
  const waiting = { status: 'waiting' as const, requestId: 'admreq_1', expiresAt: UNTIL }

  it('waits for the phone, then says a request that opened no grant', () => {
    expect(adminRequestWordsOf(waiting)).toBe('adminAccess.request.waiting')
    expect(adminRequestAfter(waiting, 'declined')).toEqual({ status: 'declined' })
    expect(adminRequestWordsOf({ status: 'declined' })).toBe('adminAccess.request.notConfirmed')
    expect(adminRequestWordsOf({ status: 'failed' })).toBe('adminAccess.request.notConfirmed')
    expect(adminRequestWordsOf({ status: 'expired' })).toBe('adminAccess.request.expired')
    expect(ADMIN_COPY[adminRequestWordsOf(waiting) as keyof typeof ADMIN_COPY]).toBe('Confirm on your phone')
    expect(ADMIN_COPY['adminAccess.request.notConfirmed']).toBe('Not confirmed on your phone')
    expect(ADMIN_COPY['adminAccess.request.expired']).toBe('The request expired')
  })

  it('says nothing once the grant opened; a grant that ended leaves the request as it was', () => {
    expect(adminRequestAfter(waiting, 'opened')).toBeUndefined()
    expect(adminRequestAfter(waiting, 'ended')).toBe(waiting)
    expect(adminRequestAfter(undefined, 'ended')).toBeUndefined()
  })
})

describe('the refusals and the reason (PROF-ADMIN-007, UI-ADMIN-006)', () => {
  it('names each refusal with its words', () => {
    expect(adminRefusalOf(new ProfileError(403, 'admin-closed'))).toBe('ended')
    expect(adminRefusalOf(new ProfileError(403, 'not-auditor'))).toBe('noRole')
    expect(adminRefusalOf(new ProfileError(403, 'not-operator'))).toBe('noRole')
    expect(adminRefusalOf(new ProfileError(400, 'reason-required'))).toBe('reason')
    expect(adminRefusalOf(new ProfileError(403, 'forbidden'))).toBeNull()
    expect(adminRefusalOf(new Error('x'))).toBeNull()
    expect(ADMIN_COPY[ADMIN_REFUSAL_WORDS.ended]).toBe('Admin access ended')
    expect(ADMIN_COPY[ADMIN_REFUSAL_WORDS.noRole]).toBe("You don't have this role any more")
    expect(ADMIN_COPY[ADMIN_REFUSAL_WORDS.reason]).toBe('Say why you need this')
  })

  it('takes a reason of at least one letter or digit, as the agent does', () => {
    expect(adminReasonFits('Complaint 4411')).toBe(true)
    expect(adminReasonFits('4411')).toBe(true)
    expect(adminReasonFits('Réclamation')).toBe(true)
    expect(adminReasonFits('   ')).toBe(false)
    expect(adminReasonFits('...')).toBe(false)
  })

  it('reads a period of days in the person time zone, and the ids typed', () => {
    const period = auditPeriodOf('2026-11-16', '2026-11-22')
    expect(new Date(period.from as string).getDate()).toBe(16)
    expect(new Date(period.from as string).getHours()).toBe(0)
    expect(new Date(period.to as string).getDate()).toBe(22)
    expect(new Date(period.to as string).getHours()).toBe(23)
    expect(auditPeriodOf('', '')).toEqual({})
    expect(auditPeriodOf('16/11/2026', '')).toEqual({})
    expect(entryIdsOf(' ent_1, ent_2\nent_1;ent_3 ')).toEqual(['ent_1', 'ent_2', 'ent_3'])
    expect(entryIdsOf('  ')).toEqual([])
    expect(auditValueOf({ a: 1 })).toBe('{"a":1}')
    expect(auditValueOf(null)).toBe('')
    expect(auditValueOf(false)).toBe('false')
  })
})

describe('ayni.admin.changed is a signal, not a message (PROF-ADMIN-004)', () => {
  const session: SessionRecord = {
    sessionId: 's1',
    agentDid: 'did:x',
    sessionToken: 't',
    title: '',
    createdAt: '',
    state: 'bound',
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: '',
    lastMessageAt: '',
    draft: '',
    ayni: null,
    conversationId: 'c1',
  }

  it('signals `admin` and changes no transcript', () => {
    const held = emptyTranscript('s1')
    const event = {
      type: 'CUSTOM',
      name: ADMIN_CHANGED,
      value: { roles: ['auditor'], grant: { open: true, expiresAt: UNTIL }, outcome: 'opened' },
    }
    const { transcript, signals } = reduce(held, session, event, false, true)
    expect(ADMIN_CHANGED).toBe('ayni.admin.changed')
    expect(signals).toEqual(['admin'])
    expect(transcript).toBe(held)
  })
})

describe('the endpoints of §3.14 as the client calls them', () => {
  it('reads the state, asks for a grant (202) and hides it (204)', async () => {
    const { client, calls } = agent((method, path) =>
      path === '/admin' && method === 'GET'
        ? json({ roles: ['auditor'], grant: null })
        : method === 'POST'
          ? json({ requestId: 'admreq_1', expiresAt: UNTIL }, 202)
          : new Response(null, { status: 204 })
    )
    expect(await client.adminAccess('t')).toEqual(JONAS)
    expect(await client.requestAdminGrant('t')).toEqual({ requestId: 'admreq_1', expiresAt: UNTIL })
    await client.hideAdmin('t')
    expect(calls.map((c) => `${c.method} ${c.path} ${c.auth}`)).toEqual([
      'GET /admin Bearer t',
      'POST /admin/grant Bearer t',
      'DELETE /admin/grant Bearer t',
    ])
  })

  it('refuses a grant request answered without a request', async () => {
    const { client } = agent(() => json({}, 202))
    await expect(client.requestAdminGrant('t')).rejects.toMatchObject({ status: 502 })
  })

  it('carries the reason of each read of Audit in the query, with its filters', async () => {
    const { client, calls } = agent((_m, path) => {
      if (path.startsWith('/admin/audit/conversations?'))
        return json({
          conversations: [
            {
              id: 'conv_1',
              principalId: 'prn_ana',
              spaceId: 'spc_sales',
              title: 'Order 88',
              state: 'active',
              createdAt: UNTIL,
              lastActivityAt: UNTIL,
            },
          ],
          auditId: 'adm_1',
        })
      if (path.includes('/messages?'))
        return json({
          messages: [{ id: 'ent_1', role: 'user', content: '[erased]' }],
          nextBefore: 'ent_1',
          auditId: 'adm_2',
        })
      if (path.startsWith('/admin/audit/evidence?'))
        return json({
          evidence: [{ record: { id: 'evd_1', kind: 'email' }, values: { email: 'ana@x' } }],
          auditId: 'adm_3',
        })
      if (path.startsWith('/admin/audit/tool-calls?')) return json({ calls: [{ id: 'call_1' }], auditId: 'adm_4' })
      return json({
        records: [
          { id: 'adm_1', ts: UNTIL, action: 'audit-read', actor: 'prn_jonas', reason: 'Complaint 4411', detail: {} },
        ],
        nextBefore: null,
        auditId: 'adm_5',
      })
    })
    const found = await client.auditConversations('t', 'Complaint 4411', {
      principal: 'prn_ana',
      space: 'spc_sales',
      from: '2026-11-16T00:00:00.000Z',
      to: '',
    })
    expect(found.conversations[0]).toMatchObject({ id: 'conv_1', title: 'Order 88', spaceId: 'spc_sales' })
    expect(found.auditId).toBe('adm_1')
    const page = await client.auditMessages('t', 'Complaint 4411', 'conv 1', 'ent_9', 20)
    expect(page).toEqual({
      messages: [{ id: 'ent_1', role: 'user', content: '[erased]' }],
      nextBefore: 'ent_1',
      auditId: 'adm_2',
    })
    expect((await client.auditEvidence('t', 'Complaint 4411', 'prn_ana')).evidence[0].values).toEqual({
      email: 'ana@x',
    })
    expect((await client.auditToolCalls('t', 'Complaint 4411', { source: 'x' })).calls).toHaveLength(1)
    expect((await client.auditLog('t', 'Complaint 4411')).records[0].reason).toBe('Complaint 4411')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /admin/audit/conversations?principal=prn_ana&space=spc_sales&from=2026-11-16T00%3A00%3A00.000Z&reason=Complaint+4411',
      'GET /admin/audit/conversations/conv%201/messages?before=ent_9&limit=20&reason=Complaint+4411',
      'GET /admin/audit/evidence?principal=prn_ana&reason=Complaint+4411',
      'GET /admin/audit/tool-calls?source=x&reason=Complaint+4411',
      'GET /admin/audit/log?limit=50&reason=Complaint+4411',
    ])
  })

  it('carries the reason of each action of Operations in the body, and the keys read with theirs in the query', async () => {
    const { client, calls } = agent((method, path) => {
      if (path === '/admin/operations/erase')
        return json({ erased: ['ent_1', 'ent_2'], held: [], notFound: ['x'], auditId: 'a' })
      if (path === '/admin/operations/legal-hold') return json({ changed: ['ent_1'], skipped: [], auditId: 'b' })
      if (method === 'GET')
        return json({
          keys: [
            { key: 'master', versions: [{ version: 1, current: true, wraps: null }], rotation: null, rotatable: false },
            {
              key: 'index',
              versions: [{ version: 2, current: true, wraps: 40 }],
              rotation: { from: 1, to: 2, done: 40, total: 100 },
              rotatable: true,
            },
          ],
          keyService: null,
          auditId: 'c',
        })
      return json({ error: 'not-implemented', message: 'the key store is not built' }, 501)
    })
    expect(await client.eraseEntries('t', 'GDPR request 17', ['ent_1'])).toEqual({
      erased: ['ent_1', 'ent_2'],
      held: [],
      notFound: ['x'],
      auditId: 'a',
    })
    await client.legalHold('t', 'Litigation 9', { conversationId: 'conv_1' }, true)
    await client.legalHold('t', 'Litigation 9', { entryIds: ['ent_1'] }, false)
    const keys = await client.adminKeys('t', 'Quarterly check')
    expect(keys.keys[1]).toMatchObject({ key: 'index', rotation: { done: 40, total: 100 }, rotatable: true })
    expect(keys.keyService).toBeNull()
    await expect(client.rotateKey('t', 'Quarterly check', 'master')).rejects.toMatchObject({
      status: 501,
      code: 'not-implemented',
    })
    expect(calls.map((c) => ({ method: c.method, path: c.path, body: c.body }))).toEqual([
      { method: 'POST', path: '/admin/operations/erase', body: { entryIds: ['ent_1'], reason: 'GDPR request 17' } },
      {
        method: 'POST',
        path: '/admin/operations/legal-hold',
        body: { conversationId: 'conv_1', hold: true, reason: 'Litigation 9' },
      },
      {
        method: 'POST',
        path: '/admin/operations/legal-hold',
        body: { entryIds: ['ent_1'], hold: false, reason: 'Litigation 9' },
      },
      { method: 'GET', path: '/admin/operations/keys?reason=Quarterly+check', body: undefined },
      { method: 'POST', path: '/admin/operations/keys/master/rotate', body: { reason: 'Quarterly check' } },
    ])
  })

  it('finds a person by name for Audit, the reason in the query, at most 20 people', async () => {
    const { client, calls } = agent((_m, path) =>
      path.startsWith('/admin/audit/people?')
        ? json({
            people: [
              { principalId: 'prn_ana', name: 'Ana Ruiz', department: 'Sales' },
              { principalId: 'prn_anabel', name: 'Anabel Costa', department: null },
              { name: 'no id' },
            ],
          })
        : json({}, 404)
    )
    expect(await client.auditPeople('t', 'Complaint 4411', '  Ana ')).toEqual({
      people: [
        { principalId: 'prn_ana', name: 'Ana Ruiz', department: 'Sales' },
        { principalId: 'prn_anabel', name: 'Anabel Costa', department: null },
      ],
    })
    expect(calls.map((c) => `${c.method} ${c.path} ${c.auth}`)).toEqual([
      'GET /admin/audit/people?q=Ana&reason=Complaint+4411 Bearer t',
    ])
    // an empty search goes nowhere: the agent refuses it (400 bad-request, field q)
    await expect(client.auditPeople('t', 'Complaint 4411', '   ')).rejects.toMatchObject({
      status: 400,
      code: 'bad-request',
      field: 'q',
    })
    expect(calls).toHaveLength(1)
    expect(auditPeopleQueryOf(' Ana ')).toBe('Ana')
    expect(auditPeopleQueryOf('  ')).toBeNull()
  })

  it('reads the people tolerantly, at most 20, a person without a name by its id', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ principalId: `prn_${i}`, name: `P ${i}`, department: 'X' }))
    expect(auditPeopleOf({ people: many }).people).toHaveLength(20)
    expect(auditPeopleOf({ people: [{ principalId: 'prn_x', department: 7 }] })).toEqual({
      people: [{ principalId: 'prn_x', name: 'prn_x', department: null }],
    })
    expect(auditPeopleOf(undefined)).toEqual({ people: [] })
  })

  it('names the refusals of a search for a person as those of the other reads of Audit', async () => {
    for (const [status, error, refusal] of [
      [403, 'admin-closed', 'ended'],
      [403, 'not-auditor', 'noRole'],
      [400, 'reason-required', 'reason'],
    ] as const) {
      const { client } = agent(() => json({ error }, status))
      expect(adminRefusalOf(await client.auditPeople('t', 'Complaint 4411', 'Ana').catch((e) => e))).toBe(refusal)
    }
  })

  it('keeps the refusal code of the agent', async () => {
    const { client } = agent(() => json({ error: 'reason-required', message: 'say why you need this' }, 400))
    const error = await client.auditLog('t', ' ').catch((e) => e)
    expect(adminRefusalOf(error)).toBe('reason')
  })

  it('reads keys tolerantly', () => {
    expect(keysOf({ keys: [{ key: 'other' }, { key: 'master' }], keyService: { lastAnsweredAt: UNTIL } })).toEqual({
      keys: [{ key: 'master', versions: [], rotation: null, rotatable: false }],
      keyService: { lastAnsweredAt: UNTIL },
      auditId: '',
    })
  })
})
