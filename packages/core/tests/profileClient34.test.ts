/**
 * The endpoints of profile 3.4 as the client calls them (§3.10 and §3.6): the method, the path, the body and the
 * token of each; whether a change applied (`200`) or waits for the phone (`202`); the refusals with their field.
 */
import { describe, expect, it } from 'vitest'
import { ProfileClient, ProfileError } from '../src/profileClient.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'
const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
const TOOL = {
  source: 'relaticle',
  title: 'Relaticle CRM',
  state: 'setup',
  account: { kind: 'space', fields: [{ name: 'token', label: 'API token' }], set: false },
  bindings: [],
  tools: [],
  pending: null,
}
const PENDING = { ...TOOL, pending: { changeId: 'chg_1', summary: 's', code: '48 21', expiresAt: 'x' } }

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

describe("a space's tools (PROF-TOOL-001..005)", () => {
  it('reads them', async () => {
    const { client, calls } = agent(() => json({ tools: [TOOL] }))
    const tools = await client.spaceTools('t', 'spc_sales')
    expect(calls[0]).toEqual({ method: 'GET', path: '/spaces/spc_sales/tools', body: undefined, auth: 'Bearer t' })
    expect(tools.map((x) => x.source)).toEqual(['relaticle'])
  })

  it('adds a source with its bindings and rules, and says it waits', async () => {
    const { client, calls } = agent(() => json({ tool: PENDING }, 202))
    const answer = await client.addSpaceTool('t', 'spc_sales', {
      source: 'relaticle',
      bindings: { workspace: 'sales-eu' },
      calls: { 'create-note': 'approval' },
    })
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/spaces/spc_sales/tools',
      body: { source: 'relaticle', bindings: { workspace: 'sales-eu' }, calls: { 'create-note': 'approval' } },
    })
    expect(answer.status).toBe(202)
    expect(answer.tool.pending?.code).toBe('48 21')
  })

  it('changes bindings and rules: applied at once, or waiting', async () => {
    const applied = agent(() => json({ tool: TOOL }, 200))
    const narrowed = await applied.client.patchSpaceTool('t', 'spc_sales', 'relaticle', {
      calls: { 'create-note': 'approval' },
    })
    expect(applied.calls[0]).toMatchObject({ method: 'PATCH', path: '/spaces/spc_sales/tools/relaticle' })
    expect(narrowed.status).toBe(200)
    const waiting = agent(() => json({ tool: PENDING }, 202))
    expect(
      (await waiting.client.patchSpaceTool('t', 'spc_sales', 'relaticle', { bindings: { workspace: 'x' } })).status
    ).toBe(202)
  })

  it("sets the space's account with every value in the body, by field, and clears it", async () => {
    const { client, calls } = agent((method) =>
      method === 'PUT' ? json({ tool: PENDING }, 202) : json({ tool: TOOL })
    )
    const values = { api_key: 'k', api_secret: 's', access_token: '1-t', access_token_secret: 'ts' }
    expect((await client.setSpaceToolAccount('t', 'spc_sales', 'relaticle', values)).status).toBe(202)
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      path: '/spaces/spc_sales/tools/relaticle/account',
      body: { values },
    })
    const cleared = await client.clearSpaceToolAccount('t', 'spc_sales', 'relaticle')
    expect(calls[1]).toMatchObject({
      method: 'DELETE',
      path: '/spaces/spc_sales/tools/relaticle/account',
      body: undefined,
    })
    expect(cleared.account.set).toBe(false)
  })

  it('removes a source, and withdraws a change that waits', async () => {
    const { client, calls } = agent((_m, path) =>
      path.endsWith('/pending') ? new Response(null, { status: 204 }) : json({ tool: { ...TOOL, state: 'off' } })
    )
    expect((await client.removeSpaceTool('t', 'spc_sales', 'relaticle')).state).toBe('off')
    await client.withdrawSpaceToolChange('t', 'spc_sales', 'relaticle')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /spaces/spc_sales/tools/relaticle',
      'DELETE /spaces/spc_sales/tools/relaticle/pending',
    ])
  })

  it('carries a refusal with the field it names', async () => {
    const { client } = agent(() => json({ error: 'looser-than-pack', field: 'calls.create-note' }, 422))
    const error = await client
      .patchSpaceTool('t', 's', 'relaticle', { calls: { 'create-note': 'none' } })
      .catch((e) => e)
    expect(error).toBeInstanceOf(ProfileError)
    expect(error).toMatchObject({ status: 422, code: 'looser-than-pack', field: 'calls.create-note' })
    const phone = agent(() => json({ error: 'confirmation-unavailable' }, 409))
    expect(await phone.client.setSpaceToolAccount('t', 's', 'r', { token: 'x' }).catch((e) => e)).toMatchObject({
      status: 409,
      code: 'confirmation-unavailable',
    })
    // a value of the account the agent does not take, by the field it names
    const bad = agent(() => json({ error: 'bad-token', field: 'account.api_secret' }, 422))
    expect(
      await bad.client.setSpaceToolAccount('t', 's', 'x', { api_key: 'k', api_secret: 's' }).catch((e) => e)
    ).toMatchObject({ status: 422, code: 'bad-token', field: 'account.api_secret' })
  })
})

describe('the sources of a conversation and its allowances (PROF-TOOL-011, PROF-TOOL-012)', () => {
  it('reads the sources', async () => {
    const { client, calls } = agent(() =>
      json({ sources: [{ source: 'relaticle', title: 'Relaticle CRM', account: { kind: 'space' }, results: 3 }] })
    )
    const sources = await client.conversationSources('t', 'conv_1')
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/conversations/conv_1/sources' })
    expect(sources[0].results).toBe(3)
  })

  it('ends an allowance', async () => {
    const { client, calls } = agent(() => new Response(null, { status: 204 }))
    await client.endAllowance('t', 'conv_1', 'apr_1')
    expect(calls[0]).toEqual({
      method: 'DELETE',
      path: '/conversations/conv_1/allowances/apr_1',
      body: undefined,
      auth: 'Bearer t',
    })
  })
})

describe('session creation (PROF-SESS-016)', () => {
  it('carries `client.profileVersion`', async () => {
    const { client, calls } = agent(() => json({ sessionId: 's', sessionToken: 't2', state: 'bound' }))
    await client.create(
      { name: 'ayni-ui', version: '3.4.0', platform: 'web', profileVersion: '3.4' } as never,
      'en',
      't'
    )
    expect((calls[0].body as { client: { profileVersion: string } }).client.profileVersion).toBe('3.4')
  })
})
