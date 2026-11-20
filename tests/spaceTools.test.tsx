/**
 * The tools of a space (profile 3.4 §3.10; agent D97, D98): the owner's Tools segment with each state of a source and
 * its panel (UI-CONV-050), a change that waits for the owner's phone and its outcomes on `ayni.space.tools.changed`,
 * each refusal where it belongs; the token typed and never kept or shown back; what members read in About
 * (UI-CONV-031, UI-CONV-049); the activity of tools (UI-CONV-051); and nothing of it against a 3.3 agent.
 */
import type { SpaceInfo } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SpacePage } from '../src/components/SpacePage.js'
import type { Hub } from '../src/state/hub.js'
import {
  AGENT,
  byText,
  type Call,
  click,
  fakeAgent,
  json,
  PERSONAL,
  record,
  render,
  SPACES,
  setup,
  space,
  tab,
  teardown,
  type,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const SALES: SpaceInfo = space({
  id: 'spc_sales',
  title: 'Sales EU',
  role: 'owner',
  owner: { name: 'Jonas Weber' },
})
const TOOLS_PATH = '/spaces/spc_sales/tools'
const TOKEN = '7|AbCdEfGhIjKlMnOpQrStUvWxYz0123'

const crm = (over: Record<string, unknown> = {}) => ({
  source: 'relaticle',
  title: 'Relaticle CRM',
  description: "The sales team's accounts, contacts and notes",
  state: 'setup',
  add: 'auto',
  guests: false,
  account: {
    kind: 'space',
    label: 'API token',
    pattern: '^[A-Za-z0-9|]{20,200}$',
    set: false,
    setAt: null,
    setBy: null,
  },
  bindings: [
    { name: 'workspace', label: 'Workspace', value: null, setBy: 'owner', pattern: '^[a-z0-9-]{1,64}$' },
    { name: 'region', label: 'Region', value: 'eu-1', setBy: 'pack' },
  ],
  tools: [
    { name: 'get-company', title: 'Get company', effect: 'read', rule: 'none', packRule: 'none', stepUp: null },
    { name: 'list-companies', title: 'List companies', effect: 'read', rule: 'none', packRule: 'none', stepUp: null },
    { name: 'create-note', title: 'Add a note', effect: 'write', rule: 'confirm', packRule: 'confirm', stepUp: null },
    {
      name: 'delete-note',
      title: 'Delete note',
      effect: 'delete',
      rule: 'approval',
      packRule: 'approval',
      stepUp: 'device',
    },
  ],
  pending: null,
  ...over,
})
const READY = crm({
  state: 'ready',
  account: {
    kind: 'space',
    label: 'API token',
    pattern: '^[A-Za-z0-9|]{20,200}$',
    set: true,
    setAt: '2026-11-20T10:02:00Z',
    setBy: { name: 'Jonas Weber' },
  },
  bindings: [
    { name: 'workspace', label: 'Workspace', value: 'sales-eu', setBy: 'owner', pattern: '^[a-z0-9-]{1,64}$' },
    { name: 'region', label: 'Region', value: 'eu-1', setBy: 'pack' },
  ],
})
const WEB = {
  source: 'web',
  title: 'Web search',
  description: 'Searches the web',
  state: 'available',
  add: 'owner',
  guests: true,
  account: { kind: 'agent' },
  bindings: [],
  tools: [{ name: 'search', title: 'Search the web', effect: 'read', rule: 'none', packRule: 'none', stepUp: null }],
  pending: null,
}
const pending = (tool: Record<string, unknown>, code = '48 21') => ({
  ...tool,
  pending: {
    changeId: 'chg_1',
    summary: 'Set the account of Relaticle CRM in Sales EU',
    code,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  },
})

/** The owner's page of Sales EU, on its Tools segment, against an agent of profile 3.4 with tools. */
async function ownersTools(
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][],
  options: { features?: Record<string, unknown>; profileVersion?: string; segment?: 'tools' | 'about' } = {}
) {
  const agent = fakeAgent(routes)
  const hub = await tab({
    sessions: [record({ sessionId: 's1' })],
    spaces: { spaces: [PERSONAL, SALES], templates: [] },
    features: options.features ?? { tools: true },
    profileVersion: options.profileVersion ?? '3.4',
    snapshot: { view: 'space', spaceFor: { agentDid: AGENT, spaceId: SALES.id, segment: options.segment ?? 'tools' } },
  })
  const el = await render(hub, <SpacePage />)
  return { agent, hub, el }
}

/** The agent says a change applied or was dropped, on the owner's session stream (PROF-TOOL-006). */
async function announce(hub: Hub, value: Record<string, unknown>) {
  // @ts-expect-error private: the event as the session's stream delivers it
  await hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.space.tools.changed', value }, undefined, false)
}

const rowTexts = (el: HTMLElement) =>
  [...el.querySelectorAll('.tool-row')].map((r) => ({
    title: r.querySelector('.space-name')?.textContent,
    state: r.querySelector('.tag, .state-tag')?.textContent,
    add: !!byText(r, 'button', 'Add'),
  }))
const open = async (el: HTMLElement, title: string) =>
  click([...el.querySelectorAll<HTMLElement>('.tool-row-main')].find((b) => b.textContent?.includes(title)))
const tokenField = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[type="password"]')

describe('the segments of a space (UI-CONV-031, PROF-DESC-009)', () => {
  it('gives its owner Members, Tools, Settings and Activity, against an agent that serves tools', async () => {
    const { el } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ tools: [] })]])
    expect([...el.querySelectorAll('[role="tab"]')].map((x) => x.textContent)).toEqual([
      'Conversations',
      'Your memories',
      'About',
      'Members',
      'Tools',
      'Settings',
      'Activity',
    ])
  })

  it('gives no Tools against a 3.3 agent, and asks it nothing about tools', async () => {
    const { el, agent } = await ownersTools([], { features: {}, profileVersion: '3.3', segment: 'about' })
    expect([...el.querySelectorAll('[role="tab"]')].map((x) => x.textContent)).not.toContain('Tools')
    expect(el.querySelector('.about-tools')).toBeNull()
    expect(agent.calls.filter((c) => c.url.includes('/tools'))).toHaveLength(0)
  })
})

describe("the owner's Tools segment (UI-CONV-050)", () => {
  it('lists every source of the template with its state in words, and Add for those not in the space', async () => {
    const { el } = await ownersTools([
      [
        `GET ${TOOLS_PATH}`,
        () =>
          json({
            tools: [
              crm(),
              WEB,
              { ...WEB, source: 'x', title: 'X', state: 'off', add: 'auto' },
              { ...READY, source: 'github', title: 'GitHub' },
              pending({ ...READY, source: 'slack', title: 'Slack' }),
            ],
          }),
      ],
    ])
    await until(() => el.querySelectorAll('.tool-row').length === 5)
    expect(rowTexts(el)).toEqual([
      { title: 'Relaticle CRM', state: 'Needs setup: Workspace, account', add: false },
      { title: 'Web search', state: 'Not added', add: true },
      { title: 'X', state: 'Off', add: true },
      { title: 'GitHub', state: 'Ready', add: false },
      { title: 'Slack', state: 'Waiting for your phone', add: false },
    ])
  })

  it("opens a source's panel: its settings, its account, what each tool asks, who can use it, Remove", async () => {
    const { el } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })]])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    expect([...el.querySelectorAll('.tool-section h4')].map((h) => h.textContent)).toEqual([
      'Settings of the tool',
      'Account',
      'What each tool asks',
      'Who can use it',
    ])
    // a binding the agent-pack sets is shown, not edited
    const fixed = el.querySelector('.tool-fixed')
    expect(fixed?.textContent).toBe('Regioneu-1Set by Fleet support')
    expect(fixed?.querySelector('input')).toBeNull()
    expect(el.querySelector('.tool-account-status')?.textContent).toBe('API tokenSet by Jonas Weber on Nov 20, 2026')
    // the token field: masked, never prefilled
    expect(tokenField(el)?.value).toBe('')
    expect(tokenField(el)?.placeholder).toBe('Paste the API token')
    expect(byText(el, 'button', 'Replace')).toBeTruthy()
    // each tool by its title, its effect in words, the rules no looser than the pack's, the step-up said
    const rows = [...el.querySelectorAll('.tool-rule-row')]
    expect(rows.map((r) => r.querySelector('.tool-rule-name')?.textContent)).toEqual([
      'Get companyReads',
      'List companiesReads',
      'Add a noteWrites',
      'Delete noteDeletes',
    ])
    const options = (i: number) => [...(rows[i]?.querySelectorAll('option') ?? [])].map((o) => o.textContent)
    expect(options(0)).toEqual([
      'Runs without asking',
      'Asks the person first',
      'Needs your approval',
      'Off in this space',
    ])
    expect(options(2)).toEqual(['Asks the person first', 'Needs your approval', 'Off in this space'])
    expect(options(3)).toEqual(['Needs your approval', 'Off in this space'])
    expect(rows[3]?.querySelector('.tool-step-up')?.textContent).toBe(', then a check on your phone')
    expect(rows[2]?.querySelector('select')?.value).toBe('confirm')
    expect(byText(el, '.tool-section .rule-line', 'Only people of Northwind Logistics')).toBeTruthy()
    expect(byText(el, 'button', 'Remove from Sales EU')).toBeTruthy()
  })

  it('sends the token, empties the field at once, shows the code and waits; the phone confirms: Saved, Ready', async () => {
    let tools: unknown[] = [READY]
    const { el, hub, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools })],
      [`PUT ${TOOLS_PATH}/relaticle/account`, () => json({ tool: pending(READY) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    const field = tokenField(el) as HTMLInputElement
    field.value = TOKEN
    await click(byText(el, 'button', 'Replace'))
    // emptied as the request left, and never shown back
    expect(field.value).toBe('')
    await until(() => el.querySelector('.tool-pending'))
    expect(agent.find('PUT', `${TOOLS_PATH}/relaticle/account`)[0].body).toEqual({ token: TOKEN })
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(
      /^Confirm on your phone · Code 48 21 [45]:\d\d left$/
    )
    expect(byText(el, '.tool-pending button', 'Withdraw')).toBeTruthy()
    // the token is in no state, store or text of the page
    expect(el.textContent).not.toContain(TOKEN)
    expect(JSON.stringify(hub.getSnapshot())).not.toContain(TOKEN)
    // @ts-expect-error private: the device store
    const store = hub.store as { [key: string]: unknown }
    expect(JSON.stringify(Object.values(store).map((v) => (v instanceof Map ? [...v.values()] : v)))).not.toContain(
      TOKEN
    )
    tools = [{ ...READY, account: { ...READY.account, setAt: '2026-11-20T11:00:00Z' } }]
    const reads = agent.find('GET', TOOLS_PATH).length
    await announce(hub, {
      spaceId: SALES.id,
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'applied',
    })
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Saved')
    expect(el.querySelector('.tool-pending')).toBeNull()
    expect(agent.find('GET', TOOLS_PATH).length).toBeGreaterThan(reads)
    expect(tokenField(el)?.value).toBe('')
    await click(byText(el, 'button', 'All tools'))
    expect(rowTexts(el)[0]?.state).toBe('Ready')
  })

  it('says when the phone declined, or let the change expire: nothing changed', async () => {
    const { el, hub } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [`PUT ${TOOLS_PATH}/relaticle/account`, () => json({ tool: pending(READY) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    ;(tokenField(el) as HTMLInputElement).value = TOKEN
    await click(byText(el, 'button', 'Replace'))
    await until(() => el.querySelector('.tool-pending'))
    await announce(hub, {
      spaceId: SALES.id,
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'declined',
    })
    await until(() => el.querySelector('.tool-change-outcome'))
    expect(el.querySelector('.tool-change-outcome')?.textContent).toBe('Not confirmed on your phone. Nothing changed.')
    ;(tokenField(el) as HTMLInputElement).value = TOKEN
    await click(byText(el, 'button', 'Replace'))
    await until(() => el.querySelector('.tool-pending'))
    // what was heard before this change started waiting does not end it
    await new Promise((r) => setTimeout(r, 50))
    expect(el.querySelector('.tool-pending')).toBeTruthy()
    await announce(hub, {
      spaceId: SALES.id,
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'expired',
    })
    await until(
      () => el.querySelector('.tool-change-outcome')?.textContent === 'Not confirmed in time. Nothing changed.'
    )
  })

  it('withdraws the change that waits', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [pending(READY)] })],
      [`DELETE ${TOOLS_PATH}/relaticle/pending`, () => new Response(null, { status: 204 })],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    // a change found waiting when the panel opens shows at its top, with its code
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(/^Confirm on your phone · Code 48 21/)
    await click(byText(el, '.tool-pending button', 'Withdraw'))
    await until(() => !el.querySelector('.tool-pending'))
    expect(agent.find('DELETE', `${TOOLS_PATH}/relaticle/pending`)).toHaveLength(1)
  })

  it('says the phone must be connected when the agent cannot ask it', async () => {
    const { el } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [`PUT ${TOOLS_PATH}/relaticle/account`, () => json({ error: 'confirmation-unavailable' }, 409)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    ;(tokenField(el) as HTMLInputElement).value = TOKEN
    await click(byText(el, 'button', 'Replace'))
    await until(() => el.querySelector('.tool-error'))
    expect(el.querySelector('.tool-error')?.textContent).toBe(
      'Your phone must be connected to Fleet support to confirm this change.'
    )
  })

  it('checks a token and a binding before sending them, and shows a refusal at the field it names', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [`PATCH ${TOOLS_PATH}/relaticle`, () => json({ error: 'bad-binding', field: 'bindings.workspace' }, 422)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    // a token that does not match the account's pattern: nothing is sent, and the field is empty
    ;(tokenField(el) as HTMLInputElement).value = 'short'
    await click(byText(el, 'button', 'Replace'))
    expect(agent.find('PUT', `${TOOLS_PATH}/relaticle/account`)).toHaveLength(0)
    expect(tokenField(el)?.value).toBe('')
    expect(el.querySelector('.field-error')?.textContent?.trim()).toBe('Fleet support does not take this API token.')
    // a value that does not match the binding's pattern: nothing is sent
    const workspace = byText(el, 'label.field', /^Workspace/)?.querySelector('input')
    await type(workspace, 'Sales EU')
    await click(byText(el, '.tool-section button', 'Save'))
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)).toHaveLength(0)
    expect(
      byText(el, 'label.field', /^Workspace/)
        ?.querySelector('.field-error')
        ?.textContent?.trim()
    ).toBe('This value is not in the form Fleet support expects.')
    // one the agent refuses, at the field it names
    await type(workspace, 'sales-nl')
    await click(byText(el, '.tool-section button', 'Save'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/relaticle`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)[0].body).toEqual({ bindings: { workspace: 'sales-nl' } })
    await until(() => byText(el, 'label.field', /^Workspace/)?.querySelector('.field-error'))
  })

  it('applies a stricter rule at once, and shows a looser one the agent refuses at its tool', async () => {
    let answer = () => json({ tool: { ...READY } }, 200)
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [`PATCH ${TOOLS_PATH}/relaticle`, () => answer()],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    const select = () => el.querySelectorAll<HTMLSelectElement>('.tool-rule-row select')[2] as HTMLSelectElement
    await type(select(), 'approval')
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/relaticle`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)[0].body).toEqual({ calls: { 'create-note': 'approval' } })
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Saved')
    expect(el.querySelector('.tool-pending')).toBeNull()
    answer = () => json({ error: 'looser-than-pack', field: 'calls.create-note' }, 422)
    await type(select(), 'off')
    await until(() => el.querySelectorAll('.tool-rule-row .field-error').length === 1)
    expect(el.querySelector('.tool-rule-row .field-error')?.textContent?.trim()).toBe(
      'Fleet support does not allow a looser rule for this tool.'
    )
    // the rule in force stays
    expect(select().value).toBe('confirm')
  })

  it('removes the account and the tool only once the owner confirms in the page', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [
        `DELETE ${TOOLS_PATH}/relaticle/account`,
        () => json({ tool: { ...READY, state: 'setup', account: { ...READY.account, set: false } } }),
      ],
      [`DELETE ${TOOLS_PATH}/relaticle`, () => json({ tool: { ...READY, state: 'off', pending: null } })],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    await click(byText(el, '.tool-actions button', 'Remove account'))
    expect(el.querySelector('.tool-confirm')?.textContent).toContain(
      'Remove the account? Relaticle CRM stops working in this space until a new one is set.'
    )
    expect(agent.find('DELETE', `${TOOLS_PATH}/relaticle/account`)).toHaveLength(0)
    await click(byText(el, '.tool-confirm button', 'Remove account'))
    await until(() => agent.find('DELETE', `${TOOLS_PATH}/relaticle/account`).length === 1)
    await until(() => el.querySelector('.tool-account-status')?.textContent === 'API tokenNot set')
    await click(byText(el, 'button', 'Remove from Sales EU'))
    expect(el.querySelector('.tool-confirm')?.textContent).toContain(
      'Remove Relaticle CRM from Sales EU? Its account and settings are deleted.'
    )
    await click(byText(el, '.tool-confirm button', 'Remove from Sales EU'))
    await until(() => agent.find('DELETE', `${TOOLS_PATH}/relaticle`).length === 1)
    // back to the list, the source off
    await until(() => rowTexts(el)[0]?.state === 'Off')
  })

  it('adds a source the template offers, with its rules, and waits for the phone', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [WEB] })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: pending(WEB, '17 03') }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await click(byText(el, '.tool-row button', 'Add'))
    expect(byText(el, '.tool-section .rule-line', 'Also guests from other organizations')).toBeTruthy()
    expect(byText(el, '.tool-section .rule-line', "Uses Fleet support's account")).toBeTruthy()
    // an `agent` account has no field
    expect(tokenField(el)).toBeNull()
    await type(el.querySelector('.tool-rule-row select'), 'confirm')
    expect(agent.find('PATCH', `${TOOLS_PATH}/web`)).toHaveLength(0)
    await click(byText(el, 'button', 'Add to Sales EU'))
    await until(() => el.querySelector('.tool-pending'))
    expect(agent.find('POST', TOOLS_PATH)[0].body).toEqual({ source: 'web', calls: { search: 'confirm' } })
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(/^Confirm on your phone · Code 17 03/)
  })

  it('says why the list could not be read', async () => {
    const { el } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ error: 'boom', message: 'agent down' }, 500)]])
    await until(() => el.querySelector('.banner.warning'))
  })
})

describe('the tools a member reads in About (UI-CONV-031, UI-CONV-049)', () => {
  it('lists the ready sources: title, description, whose account, and what their tools ask, by rule', async () => {
    const memberSales = { ...SALES, role: 'member' as const }
    const agent = fakeAgent([
      [
        `GET ${TOOLS_PATH}`,
        () =>
          json({
            tools: [
              {
                source: 'relaticle',
                title: 'Relaticle CRM',
                description: "The sales team's accounts, contacts and notes",
                state: 'ready',
                guests: false,
                account: { kind: 'space' },
                bindings: [{ label: 'Workspace', value: 'sales-eu' }],
                tools: [
                  { title: 'Get company', effect: 'read', rule: 'none', stepUp: null },
                  { title: 'List companies', effect: 'read', rule: 'none', stepUp: null },
                  { title: 'Add a note', effect: 'write', rule: 'confirm', stepUp: null },
                  { title: 'Export', effect: 'external', rule: 'off', stepUp: null },
                  { title: 'Delete note', effect: 'delete', rule: 'approval', stepUp: 'device' },
                ],
              },
            ],
          }),
      ],
    ])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: { spaces: [PERSONAL, memberSales], templates: [] },
      features: { tools: true },
      profileVersion: '3.4',
      snapshot: { view: 'space', spaceFor: { agentDid: AGENT, spaceId: SALES.id, segment: 'about' } },
    })
    const el = await render(hub, <SpacePage />)
    await until(() => el.querySelector('.about-tool'))
    expect([...el.querySelectorAll('[role="tab"]')].map((x) => x.textContent)).toEqual([
      'Conversations',
      'Your memories',
      'About',
    ])
    expect(el.querySelector('.about-tools .section-label')?.textContent).toBe('Tools Fleet support uses in this space')
    expect(el.querySelector('.about-tool-title')?.textContent).toBe('Relaticle CRM')
    expect(el.querySelector('.about-tool-description')?.textContent).toBe(
      "The sales team's accounts, contacts and notes"
    )
    expect(el.querySelector('.about-tool-account')?.textContent).toBe("Uses the space's account")
    expect(el.querySelector('.about-tool-rules')?.textContent).toBe(
      "Runs without asking: Get company, List companies · Asks you first: Add a note · Needs Jonas Weber's approval: Delete note, then a check on your phone"
    )
    expect(el.textContent).not.toContain('Export')
    expect(agent.find('GET', TOOLS_PATH)).toHaveLength(1)
  })

  it('shows nothing when the space has no ready tool', async () => {
    fakeAgent([[`GET ${TOOLS_PATH}`, () => json({ tools: [crm()] })]])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      features: { tools: true },
      profileVersion: '3.4',
      snapshot: { view: 'space', spaceFor: { agentDid: AGENT, spaceId: 'spc_truck14', segment: 'about' } },
    })
    const el = await render(hub, <SpacePage />)
    await until(() => el.querySelector('.space-about'))
    expect(el.querySelector('.about-tools')).toBeNull()
  })
})

describe('the activity of tools (UI-CONV-051)', () => {
  it('names each change of the tools', async () => {
    fakeAgent([
      [
        /^GET \/spaces\/spc_sales\/activity/,
        () =>
          json({
            activity: [
              {
                at: '2026-11-20T10:05:00Z',
                kind: 'account-set',
                by: { name: 'Jonas Weber' },
                tool: { source: 'relaticle', title: 'Relaticle CRM' },
              },
              {
                at: '2026-11-20T10:04:00Z',
                kind: 'tool-added',
                by: { name: 'Jonas Weber' },
                tool: { source: 'web', title: 'Web search' },
              },
              {
                at: '2026-11-20T10:03:00Z',
                kind: 'tool-changed',
                by: { name: 'Jonas Weber' },
                tool: { source: 'relaticle', title: 'Relaticle CRM' },
              },
              {
                at: '2026-11-20T10:02:00Z',
                kind: 'account-cleared',
                by: { name: 'Jonas Weber' },
                tool: { source: 'relaticle', title: 'Relaticle CRM' },
              },
              {
                at: '2026-11-20T10:01:00Z',
                kind: 'tool-removed',
                by: { name: 'Jonas Weber' },
                tool: { source: 'web', title: 'Web search' },
              },
            ],
            nextBefore: null,
          }),
      ],
    ])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: { spaces: [PERSONAL, SALES], templates: [] },
      features: { tools: true },
      profileVersion: '3.4',
      snapshot: { view: 'space', spaceFor: { agentDid: AGENT, spaceId: SALES.id, segment: 'activity' } },
    })
    const el = await render(hub, <SpacePage />)
    await until(() => el.querySelectorAll('.activity-list li').length === 5)
    expect([...el.querySelectorAll('.activity-list li span:last-child')].map((s) => s.textContent)).toEqual([
      'Jonas Weber set the account of Relaticle CRM',
      'Jonas Weber added Web search',
      'Jonas Weber changed the settings of Relaticle CRM',
      'Jonas Weber removed the account of Relaticle CRM',
      'Jonas Weber removed Web search',
    ])
  })
})
