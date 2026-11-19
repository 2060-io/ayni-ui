/**
 * The endpoints of profile 3.3 as the client calls them (§3.6 to §3.9, §8): the method, the path, the body and the
 * token of each; the answers read; the refusals carried to the caller with their code and field.
 */
import { describe, expect, it } from 'vitest'
import { ProfileClient, ProfileError } from '../src/profileClient.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'

function agent(answer: (method: string, path: string, body: unknown) => Response = () => json({})) {
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = []
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const path = url.slice(SESSIONS.length)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method: init?.method ?? 'GET', path, body, auth: new Headers(init?.headers).get('authorization') })
    return answer(init?.method ?? 'GET', path, body)
  }
  return { client: new ProfileClient(SESSIONS, fetchFn as typeof fetch), calls }
}
const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('deleting a message within the window (PROF-HIST-010)', () => {
  it('asks the agent to delete the message, by the id given', async () => {
    const { client, calls } = agent(() => new Response(null, { status: 204 }))
    await client.deleteMessage('ses_1', 't', 'u_run1')
    expect(calls).toEqual([{ method: 'DELETE', path: '/ses_1/messages/u_run1', body: undefined, auth: 'Bearer t' }])
  })

  it('carries the refusal to the caller with its code', async () => {
    const { client } = agent(() => json({ error: 'window-passed' }, 409))
    const error = await client.deleteMessage('ses_1', 't', 'msg_1').catch((e) => e)
    expect(error).toBeInstanceOf(ProfileError)
    expect(error).toMatchObject({ status: 409, code: 'window-passed' })
  })
})

describe('the conversations of a space (PROF-CONV-010..012)', () => {
  it('starts a new conversation in a space, and only a new one', async () => {
    const { client, calls } = agent(() =>
      json({ sessionId: 's', sessionToken: 't2', state: 'bound', conversationId: 'conv_9' })
    )
    const desc = { name: 'ayni-ui', version: '3.3.0', platform: 'web' }
    await client.create(desc, 'en', 't', undefined, undefined, undefined, undefined, true, false, 'spc_truck14')
    expect(calls[0].body).toMatchObject({ newConversation: true, spaceId: 'spc_truck14' })
    await client.create(desc, 'en', 't', undefined, undefined, undefined, 'conv_1', false, false, 'spc_truck14')
    expect(calls[1].body).not.toHaveProperty('spaceId')
  })

  it('lists the conversations of one space, moves one, shares and stops sharing it', async () => {
    const { client, calls } = agent((method) =>
      method === 'POST'
        ? json({ shared: true, sharedAt: '2026-11-18T10:00:00Z' })
        : method === 'DELETE' || method === 'PATCH'
          ? new Response(null, { status: 204 })
          : json({ conversations: [] })
    )
    await client.conversations('t', 'spc_truck14')
    await client.patchConversation('t', 'conv_1', { spaceId: 'spc_depot' })
    expect(await client.share('t', 'conv_1')).toEqual({ shared: true, sharedAt: '2026-11-18T10:00:00Z' })
    await client.unshare('t', 'conv_1')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /conversations?spaceId=spc_truck14',
      'PATCH /conversations/conv_1',
      'POST /conversations/conv_1/share',
      'DELETE /conversations/conv_1/share',
    ])
    expect(calls[1].body).toEqual({ spaceId: 'spc_depot' })
    // a share takes no target: a conversation is shared with its own space
    expect(calls[2].body).toBeUndefined()
  })
})

describe('spaces (PROF-SPACE-001..007)', () => {
  const space = {
    id: 'spc_9',
    kind: 'team',
    title: 'Truck 22 recall',
    purpose: 'Inspect truck 22.',
    brief: '',
    templateId: 'project',
    language: null,
    rules: { retentionDays: 365, lawfulBasis: 'contract', allowedProviders: ['kimi'], handover: true },
    membership: { mode: 'list', memberCount: 1 },
    owner: { name: 'Ana Ríos' },
    role: 'owner',
    state: 'active',
    unread: 0,
    lastActivityAt: '2026-11-18T10:00:00Z',
  }

  it('calls each endpoint of §3.7 with the token of a bound session', async () => {
    const { client, calls } = agent((method, path) => {
      if (path === '/spaces' && method === 'GET') return json({ spaces: [space], templates: [] })
      if (path === '/spaces' && method === 'POST') return json(space, 201)
      if (path.endsWith('/activity?limit=50&before=act_2')) return json({ activity: [], nextBefore: null })
      if (path.endsWith('/shared')) return json({ conversations: [] })
      if (path.includes('/shared/conv_1/messages')) return json({ messages: [], nextBefore: null })
      if (path.includes('/shared/conv_1/attachments/att_1')) return new Response('img', { status: 200 })
      if (method === 'DELETE' || path.endsWith('/members') || path.endsWith('/owner'))
        return method === 'DELETE' ? new Response(null, { status: 204 }) : json({}, 201)
      return json(space)
    })
    expect((await client.spaces('t')).spaces[0].title).toBe('Truck 22 recall')
    const created = await client.createSpace('t', {
      templateId: 'project',
      title: 'Truck 22 recall',
      purpose: 'Inspect truck 22.',
    })
    expect(created.role).toBe('owner')
    await client.space('t', 'spc_9')
    await client.patchSpace('t', 'spc_9', { rules: { retentionDays: 730 } })
    await client.addMember('t', 'spc_9', { directoryId: 'emp_8' })
    await client.addMember('t', 'spc_9', { organizationKey: 'org:PL:1', email: 'sam@baltichaul.example' })
    await client.removeMember('t', 'spc_9', 'mem_2')
    await client.transferOwnership('t', 'spc_9', { memberId: 'mem_1' })
    await client.spaceActivity('t', 'spc_9', 'act_2')
    await client.sharedConversations('t', 'spc_9')
    await client.sharedHistory('t', 'spc_9', 'conv_1')
    expect(await (await client.sharedAttachment('t', 'spc_9', 'conv_1', 'att_1')).text()).toBe('img')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /spaces',
      'POST /spaces',
      'GET /spaces/spc_9',
      'PATCH /spaces/spc_9',
      'POST /spaces/spc_9/members',
      'POST /spaces/spc_9/members',
      'DELETE /spaces/spc_9/members/mem_2',
      'POST /spaces/spc_9/owner',
      'GET /spaces/spc_9/activity?limit=50&before=act_2',
      'GET /spaces/spc_9/shared',
      'GET /spaces/spc_9/shared/conv_1/messages?limit=50',
      'GET /spaces/spc_9/shared/conv_1/attachments/att_1',
    ])
    expect(calls.every((c) => c.auth === 'Bearer t')).toBe(true)
    expect(calls[1].body).toEqual({ templateId: 'project', title: 'Truck 22 recall', purpose: 'Inspect truck 22.' })
    expect(calls[3].body).toEqual({ rules: { retentionDays: 730 } })
    expect(calls[4].body).toEqual({ directoryId: 'emp_8' })
    expect(calls[5].body).toEqual({ organizationKey: 'org:PL:1', email: 'sam@baltichaul.example' })
    expect(calls[7].body).toEqual({ memberId: 'mem_1' })
  })

  it('carries the field an out-of-bounds refusal names', async () => {
    const { client } = agent(() => json({ error: 'out-of-bounds', field: 'rules.retentionDays' }, 422))
    const error = await client.patchSpace('t', 'spc_9', { rules: { retentionDays: 731 } }).catch((e) => e)
    expect(error).toMatchObject({ status: 422, code: 'out-of-bounds', field: 'rules.retentionDays' })
  })
})

describe('memories and people (PROF-MEM-001..003, PROF-DIR-001..003)', () => {
  it('reads and deletes memories and preferences, the key percent-encoded', async () => {
    const { client, calls } = agent((method, path) =>
      method === 'DELETE'
        ? new Response(null, { status: 204 })
        : path.startsWith('/about-me')
          ? json({ preferences: [], memoriesBySpace: [], conversations: [], verified: [] })
          : json({ preferences: [], memories: [] })
    )
    await client.memories('t', 'spc_truck14')
    await client.memories('t')
    await client.deleteMemory('t', 'mem_1')
    await client.deletePreference('t', 'answer style/short')
    await client.aboutMe('t')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /memories?spaceId=spc_truck14',
      'GET /memories',
      'DELETE /memories/mem_1',
      'DELETE /preferences/answer%20style%2Fshort',
      'GET /about-me',
    ])
  })

  it('searches the employee list and the organizations, and reads the admin view', async () => {
    const { client, calls } = agent((_method, path) =>
      path.startsWith('/directory')
        ? json({ people: [{ directoryId: 'emp_7', name: 'Ana Ríos', department: 'Dispatch' }] })
        : path.startsWith('/organizations')
          ? json({ organizations: [] })
          : path.startsWith('/admin/roles')
            ? json({ entries: [] })
            : json({ changes: [], nextBefore: null })
    )
    expect(await client.directory('t', 'rio')).toEqual([
      { directoryId: 'emp_7', name: 'Ana Ríos', department: 'Dispatch' },
    ])
    await client.organizations('t', 'Baltic Haul')
    await client.adminRoles('t')
    await client.adminChanges('t', 'chg_9')
    expect(calls.map((c) => c.path)).toEqual([
      '/directory?q=rio',
      '/organizations?q=Baltic+Haul',
      '/admin/roles',
      '/admin/changes?limit=50&before=chg_9',
    ])
  })

  it('the admin view refuses a person without the role', async () => {
    const { client } = agent(() => json({ error: 'not-admin' }, 403))
    await expect(client.adminRoles('t')).rejects.toMatchObject({ status: 403, code: 'not-admin' })
  })
})
