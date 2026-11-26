/**
 * The tools of a space (profile 3.5.8 §3.10; agent D97, D98, D120, D122): the owner's Tools segment, one row per feature
 * with the line of its provider and its state (UI-CONV-050, UI-CONV-065), Add among one or several providers, the
 * panel of a provider, a change that waits for the owner's phone and its outcomes on `ayni.space.tools.changed`, each
 * refusal where it belongs; the account typed in one masked field per value the agent declares, never kept or shown
 * back; what members read in About, by feature (UI-CONV-031, UI-CONV-049); the activity of tools (UI-CONV-051); and
 * nothing of it against a 3.3 agent.
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

/** The CRM of Sales EU: one item per feature, with the providers its template allows (PROF-TOOL-033). */
const CRM_FEATURE = { id: 'crm', title: 'CRM', profile: null }
const CRM_PROVIDER = {
  source: 'relaticle',
  title: 'Relaticle CRM',
  description: "The sales team's accounts, contacts and notes",
  account: { kind: 'space' },
  default: true,
}
const crm = (over: Record<string, unknown> = {}) => ({
  feature: CRM_FEATURE,
  providers: [CRM_PROVIDER],
  source: 'relaticle',
  title: 'Relaticle CRM',
  description: "The sales team's accounts, contacts and notes",
  state: 'setup',
  add: 'auto',
  guests: false,
  account: {
    kind: 'space',
    fields: [{ name: 'token', label: 'API token', pattern: '^[A-Za-z0-9|]{20,200}$' }],
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
    fields: [{ name: 'token', label: 'API token', pattern: '^[A-Za-z0-9|]{20,200}$' }],
    set: true,
    setAt: '2026-11-20T10:02:00Z',
    setBy: { name: 'Jonas Weber' },
  },
  bindings: [
    { name: 'workspace', label: 'Workspace', value: 'sales-eu', setBy: 'owner', pattern: '^[a-z0-9-]{1,64}$' },
    { name: 'region', label: 'Region', value: 'eu-1', setBy: 'pack' },
  ],
})
/** The CRM with no provider: removed from a space whose template adds it, `off` (PROF-TOOL-005, PROF-TOOL-033). */
const CRM_OFF = {
  feature: CRM_FEATURE,
  providers: [CRM_PROVIDER],
  source: null,
  title: null,
  state: 'off',
  add: 'auto',
  guests: false,
  pending: null,
}
/** Web search, offered and not added: no provider chosen yet, so nothing of one (PROF-TOOL-033). */
const WEB = {
  feature: { id: 'search', title: 'Web search', profile: null },
  providers: [
    { source: 'web', title: 'Web search', description: 'Searches the web', account: { kind: 'agent' }, default: true },
  ],
  source: null,
  title: null,
  state: 'available',
  add: 'owner',
  guests: true,
  pending: null,
}
/** Web search with its provider in use. */
const WEB_READY = {
  ...WEB,
  source: 'web',
  title: 'Web search',
  description: 'Searches the web',
  state: 'ready',
  account: { kind: 'agent' },
  bindings: [],
  tools: [{ name: 'search', title: 'Search the web', effect: 'read', rule: 'none', packRule: 'none', stepUp: null }],
}
/** Files of Sales EU, a feature with a contract and two providers (agent D120, D123; profile §3.10). */
const FILES_FEATURE = { id: 'files', title: 'Files', profile: { id: 'org.ayni/files', version: '1.0' } }
const NEXTCLOUD = {
  source: 'nextcloud',
  title: 'Nextcloud',
  description: "A folder of the organization's Nextcloud, with an account of the space",
  account: { kind: 'space' },
  default: true,
}
const DRIVE = {
  source: 'drive',
  title: 'Google Drive',
  description: 'The files each person can open in their drive',
  account: { kind: 'personal' },
  default: false,
}
const FILES = {
  feature: FILES_FEATURE,
  providers: [NEXTCLOUD, DRIVE],
  source: null,
  title: null,
  state: 'available',
  add: 'owner',
  guests: false,
  pending: null,
}
const FOLDERS = {
  label: 'Folders',
  any: false,
  entries: [{ values: { root: '48213' }, label: '/Projects/Alpha' }],
  anyAllowed: false,
  anyLabel: 'Any folder you can reach',
  choices: true,
  typed: false,
  maxEntries: 10,
}
const FILES_READY = {
  ...FILES,
  source: 'nextcloud',
  title: 'Nextcloud',
  description: NEXTCLOUD.description,
  state: 'ready',
  conformant: true,
  capabilities: ['search', 'folders'],
  account: {
    kind: 'space',
    fields: [
      { name: 'username', label: 'User name' },
      { name: 'password', label: 'App password' },
    ],
    set: true,
    setAt: '2026-11-22T09:10:00Z',
    setBy: { name: 'Jonas Weber' },
  },
  bindings: [],
  list: FOLDERS,
  tools: [
    { name: 'files_read', title: 'Read a file', effect: 'read', rule: 'none', packRule: 'none', stepUp: null },
    {
      name: 'files_replace',
      title: "Replace a file's content",
      effect: 'write',
      rule: 'confirm',
      packRule: 'confirm',
      stepUp: null,
    },
  ],
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
    provider: r.querySelector('.tool-provider-line')?.textContent,
    state: r.querySelector('.tag, .state-tag, .tool-not-conformant')?.textContent?.trim(),
    add: !!byText(r, 'button', 'Add'),
  }))
const open = async (el: HTMLElement, title: string) =>
  click([...el.querySelectorAll<HTMLElement>('.tool-row-main')].find((b) => b.textContent?.includes(title)))
const tokenField = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[type="password"]')
/** The masked fields of the account, in the order shown. */
const accountFields = (el: HTMLElement) => [
  ...el.querySelectorAll<HTMLInputElement>('.tool-section[aria-label="Account"] input[type="password"]'),
]
/** The label of each field of the account, without the message under it. */
const accountLabels = (el: HTMLElement) =>
  [...el.querySelectorAll('.tool-section[aria-label="Account"] label.field')].map((l) => l.childNodes[0]?.textContent)
const accountSave = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.account-save')
/** Replace (for an account set), the token typed in its field, and the account's Save. */
async function sendToken(el: HTMLElement, token = TOKEN) {
  const replace = byText(el, '.tool-section[aria-label="Account"] button', 'Replace')
  if (replace) await click(replace)
  await type(tokenField(el), token)
  await click(accountSave(el))
}

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
  it("lists every feature of the template in its order: its title, its provider's line, its state, Add for one with none", async () => {
    const social = { id: 'social', title: 'Social posting', profile: null }
    const { el } = await ownersTools([
      [
        `GET ${TOOLS_PATH}`,
        () =>
          json({
            tools: [
              crm(),
              WEB,
              {
                ...WEB,
                feature: social,
                providers: [{ source: 'x', title: 'Post on X', account: { kind: 'space' }, default: true }],
                state: 'off',
                add: 'auto',
              },
              {
                ...READY,
                feature: { id: 'code', title: 'Code and issues', profile: null },
                source: 'github',
                title: 'GitHub',
              },
              pending({
                ...READY,
                feature: { id: 'chat', title: 'Chat', profile: null },
                source: 'slack',
                title: 'Slack',
              }),
            ],
          }),
      ],
    ])
    await until(() => el.querySelectorAll('.tool-row').length === 5)
    expect(rowTexts(el)).toEqual([
      {
        title: 'CRM',
        provider: "Relaticle CRM · Region: eu-1 · Uses the space's account",
        state: 'Needs setup: Workspace, account',
        add: false,
      },
      { title: 'Web search', provider: 'Choose a provider', state: 'Not added', add: true },
      { title: 'Social posting', provider: 'Choose a provider', state: 'Off', add: true },
      {
        title: 'Code and issues',
        provider: "GitHub · Workspace: sales-eu · Region: eu-1 · Uses the space's account",
        state: 'Ready',
        add: false,
      },
      {
        title: 'Chat',
        provider: "Slack · Workspace: sales-eu · Region: eu-1 · Uses the space's account",
        state: 'Waiting for your phone',
        add: false,
      },
    ])
  })

  it('names the feature on its row and "<feature> · <provider>" atop its panel, the title once when both are the same (UI-CONV-064, UI-CONV-065)', async () => {
    const { el } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [{ ...READY, title: 'Relaticle' }, WEB_READY] })],
    ])
    await until(() => el.querySelectorAll('.tool-row').length === 2)
    expect(rowTexts(el).map((r) => [r.title, r.provider])).toEqual([
      ['CRM', "Relaticle · Workspace: sales-eu · Region: eu-1 · Uses the space's account"],
      ['Web search', "Web search · Uses Fleet support's account"],
    ])
    await open(el, 'Relaticle')
    await until(() => el.querySelector('.tool-panel-title'))
    expect(el.querySelector('.tool-panel-title')?.textContent).toBe('CRM · Relaticle')
    await click(byText(el, 'button', 'All tools'))
    await open(el, 'Web search')
    expect(el.querySelector('.tool-panel-title')?.textContent).toBe('Web search')
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
    expect(el.querySelector('.tool-account-status')?.textContent).toBe('Set by Jonas Weber on Nov 20, 2026')
    // an account set shows no field, only Replace and Remove account; Replace shows the field, empty
    expect(tokenField(el)).toBeNull()
    expect(byText(el, '.tool-actions button', 'Remove account')).toBeTruthy()
    await click(byText(el, 'button', 'Replace'))
    // the token field: masked, never prefilled
    expect(tokenField(el)?.value).toBe('')
    expect(tokenField(el)?.placeholder).toBe('Paste the API token')
    expect(accountLabels(el)).toEqual(['API token'])
    // each tool by its title, its effect in words, the rules no looser than the pack's, the step-up said
    const rows = [...el.querySelectorAll('.tool-rule-row')]
    // the step-up after the tool's title, never after the rule's words
    expect(rows.map((r) => r.querySelector('.tool-rule-name')?.textContent)).toEqual([
      'Get companyReads',
      'List companiesReads',
      'Add a noteWrites',
      'Delete note, then a check on your phoneDeletes',
    ])
    const options = (i: number) => [...(rows[i]?.querySelectorAll('option') ?? [])].map((o) => o.textContent)
    expect(options(0)).toEqual([
      'Runs without asking',
      'Asks the person first',
      // the rule `approval` in the owner's segment, followed by its policy (UI-CONV-049, profile 3.5.4)
      'Needs approval',
      'Off in this space',
    ])
    expect(options(2)).toEqual(['Asks the person first', 'Needs approval', 'Off in this space'])
    expect(options(3)).toEqual(['Needs approval', 'Off in this space'])
    expect(rows[3]?.querySelector('.tool-rule-choice .tool-step-up')).toBeNull()
    expect(rows[2]?.querySelector('select')?.value).toBe('confirm')
    // one Save for the settings, bindings and rules, at the end of what each tool asks; one for the account
    expect(el.querySelector('.tool-section[aria-label="What each tool asks"] .settings-save')?.textContent).toBe('Save')
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
    await click(byText(el, 'button', 'Replace'))
    const field = tokenField(el) as HTMLInputElement
    await type(field, TOKEN)
    await click(accountSave(el))
    // emptied as the request left, and never shown back
    expect(field.value).toBe('')
    await until(() => el.querySelector('.tool-pending'))
    expect(agent.find('PUT', `${TOOLS_PATH}/relaticle/account`)[0].body).toEqual({ values: { token: TOKEN } })
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
      feature: 'crm',
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'applied',
    })
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Saved')
    expect(el.querySelector('.tool-pending')).toBeNull()
    expect(agent.find('GET', TOOLS_PATH).length).toBeGreaterThan(reads)
    // set: no field, Replace again
    expect(tokenField(el)).toBeNull()
    expect(byText(el, 'button', 'Replace')).toBeTruthy()
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
    await sendToken(el)
    await until(() => el.querySelector('.tool-pending'))
    await announce(hub, {
      spaceId: SALES.id,
      feature: 'crm',
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'declined',
    })
    await until(() => el.querySelector('.tool-change-outcome'))
    expect(el.querySelector('.tool-change-outcome')?.textContent).toBe('Not confirmed on your phone. Nothing changed.')
    await sendToken(el)
    await until(() => el.querySelector('.tool-pending'))
    // what was heard before this change started waiting does not end it
    await new Promise((r) => setTimeout(r, 50))
    expect(el.querySelector('.tool-pending')).toBeTruthy()
    await announce(hub, {
      spaceId: SALES.id,
      feature: 'crm',
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
    expect(el.querySelector('.tool-change-outcome')?.textContent).toBe('Withdrawn. Nothing changed.')
  })

  it('says a change the agent dropped was withdrawn', async () => {
    const { el, hub } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ tools: [pending(READY)] })]])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    await announce(hub, {
      spaceId: SALES.id,
      feature: 'crm',
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'cancelled',
    })
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Withdrawn. Nothing changed.')
    expect(el.querySelector('.tool-pending')).toBeNull()
  })

  it('keeps a stream of the agent open while a change waits, for its outcome (PROF-TOOL-006)', async () => {
    const { hub, el } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })]])
    await until(() => el.querySelector('.tool-row'))
    expect(hub.getSnapshot().leaders.s1).toBeUndefined()
    teardown()
    const waiting = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ tools: [pending(READY)] })]])
    await until(() => waiting.el.querySelector('.tool-row'))
    // the session's stream is asked for (this test's tab bus lets another tab lead it)
    await until(() => waiting.hub.getSnapshot().leaders.s1 !== undefined)
  })

  it('names each refusal in the words of UI-CONV-052, under the Save that sent it', async () => {
    const refusals: [number, string, string][] = [
      [403, 'not-owner', 'Only the owner of the space changes its tools.'],
      [404, 'not-found', 'This tool is not offered in this space.'],
      [409, 'change-pending', 'A change of this tool is already waiting for your phone.'],
      [409, 'not-added', 'Add the tool to the space first.'],
      [409, 'no-space-account', 'This tool uses no account of the space.'],
      // a provider the template allows, which the space does not use for its feature; a space's account not set (C7)
      [409, 'provider-not-used', "This provider isn't used in this space."],
      [409, 'space-account-not-set', "This space's account isn't set up yet; ask its owner."],
      [409, 'personal-space', 'Personal has no tools of a space.'],
      [409, 'confirmation-unavailable', 'Your phone must be connected to Fleet support to confirm this change.'],
    ]
    for (const [status, error, words] of refusals) {
      const { el } = await ownersTools([
        [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
        [`PUT ${TOOLS_PATH}/relaticle/account`, () => json({ error }, status)],
      ])
      await until(() => el.querySelector('.tool-row'))
      await open(el, 'Relaticle CRM')
      await sendToken(el)
      await until(() => el.querySelector('.tool-error'))
      expect(el.querySelector('.tool-section[aria-label="Account"] .tool-error')?.textContent, error).toBe(words)
      teardown()
    }
    const already = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [WEB] })],
      [`POST ${TOOLS_PATH}`, () => json({ error: 'already-added' }, 409)],
    ])
    await until(() => already.el.querySelector('.tool-row'))
    await open(already.el, 'Web search')
    await click(byText(already.el, 'button', 'Add to Sales EU'))
    await until(() => already.el.querySelector('.tool-error'))
    expect(already.el.querySelector('.tool-error')?.textContent).toBe('This tool is already in the space.')
  })

  it('says the phone must be connected when the agent cannot ask it', async () => {
    const { el } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [`PUT ${TOOLS_PATH}/relaticle/account`, () => json({ error: 'confirmation-unavailable' }, 409)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    await sendToken(el)
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
    // a token that does not match the account's pattern: nothing is sent, and it stays in its field
    await sendToken(el, 'short')
    expect(agent.find('PUT', `${TOOLS_PATH}/relaticle/account`)).toHaveLength(0)
    expect(tokenField(el)?.value).toBe('short')
    expect(el.querySelector('.field-error')?.textContent?.trim()).toBe('Fleet support does not take this API token.')
    // a value that does not match the binding's pattern: nothing is sent
    const workspace = byText(el, 'label.field', /^Workspace/)?.querySelector('input')
    await type(workspace, 'Sales EU')
    await click(el.querySelector('.settings-save'))
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)).toHaveLength(0)
    expect(
      byText(el, 'label.field', /^Workspace/)
        ?.querySelector('.field-error')
        ?.textContent?.trim()
    ).toBe('This value is not in the form Fleet support expects.')
    // one the agent refuses, at the field it names
    await type(workspace, 'sales-nl')
    await click(el.querySelector('.settings-save'))
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
    // chosen, not sent until the settings are saved
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)).toHaveLength(0)
    await click(el.querySelector('.settings-save'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/relaticle`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)[0].body).toEqual({ calls: { 'create-note': 'approval' } })
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Saved')
    expect(el.querySelector('.tool-pending')).toBeNull()
    answer = () => json({ error: 'looser-than-pack', field: 'calls.create-note' }, 422)
    await type(select(), 'off')
    await click(el.querySelector('.settings-save'))
    await until(() => el.querySelectorAll('.tool-rule-row .field-error').length === 1)
    expect(el.querySelector('.tool-rule-row .field-error')?.textContent?.trim()).toBe(
      'Fleet support does not allow a looser rule for this tool.'
    )
    // the rule in force stays
    expect(select().value).toBe('confirm')
  })

  it('narrows a rule at once while a token waits for the phone, and offers no looser rule meanwhile', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [`PUT ${TOOLS_PATH}/relaticle/account`, () => json({ tool: pending(READY) }, 202)],
      [
        `PATCH ${TOOLS_PATH}/relaticle`,
        () =>
          json(
            {
              tool: pending({
                ...READY,
                tools: READY.tools.map((x) => (x.name === 'create-note' ? { ...x, rule: 'approval' } : x)),
              }),
            },
            200
          ),
      ],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Relaticle CRM')
    await sendToken(el)
    await until(() => el.querySelector('.tool-section[aria-label="Account"] .tool-pending'))
    // a binding, another token and a looser rule would be refused while it waits: none is offered
    expect(byText(el, 'label.field', /^Workspace/)?.querySelector('input')?.disabled).toBe(true)
    expect(tokenField(el)).toBeNull()
    expect(byText(el, '.tool-section[aria-label="Account"] button', 'Replace')).toBeUndefined()
    const select = () => el.querySelectorAll<HTMLSelectElement>('.tool-rule-row select')[2] as HTMLSelectElement
    expect(select().disabled).toBe(false)
    expect([...select().options].map((o) => [o.value, o.disabled])).toEqual([
      ['confirm', false],
      ['approval', false],
      ['off', false],
    ])
    await type(select(), 'approval')
    await click(el.querySelector('.settings-save'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/relaticle`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)[0].body).toEqual({ calls: { 'create-note': 'approval' } })
    await until(
      () =>
        el.querySelector('.tool-section[aria-label="What each tool asks"] .tool-change-outcome')?.textContent ===
        'Saved'
    )
    // the token still waits, its code in place of its Save; the rule in force is the stricter one
    expect(el.querySelector('.tool-section[aria-label="Account"] .tool-pending-text')?.textContent).toMatch(
      /^Confirm on your phone · Code 48 21/
    )
    expect(select().value).toBe('approval')
    // a rule looser than the one now in force is not offered while the token waits
    expect([...select().options].map((o) => [o.value, o.disabled])).toEqual([
      ['confirm', true],
      ['approval', false],
      ['off', false],
    ])
  })

  it('removes the account and the tool only once the owner confirms in the page', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [READY] })],
      [
        `DELETE ${TOOLS_PATH}/relaticle/account`,
        () => json({ tool: { ...READY, state: 'setup', account: { ...READY.account, set: false } } }),
      ],
      [`DELETE ${TOOLS_PATH}/relaticle`, () => json({ tool: CRM_OFF })],
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
    await until(() => el.querySelector('.tool-account-status')?.textContent === 'Not set')
    // not set: the field shows again, empty
    expect(tokenField(el)?.value).toBe('')
    await click(byText(el, 'button', 'Remove from Sales EU'))
    expect(el.querySelector('.tool-confirm')?.textContent).toContain(
      'Remove Relaticle CRM from Sales EU? Its account and settings are deleted.'
    )
    await click(byText(el, '.tool-confirm button', 'Remove from Sales EU'))
    await until(() => agent.find('DELETE', `${TOOLS_PATH}/relaticle`).length === 1)
    // back to the list, the feature off, with no provider
    await until(() => rowTexts(el)[0]?.state === 'Off')
    expect(rowTexts(el)[0]?.provider).toBe('Choose a provider')
  })

  it("opens the panel of a feature's one provider at once: no account field before it is added, and Add (UI-CONV-065)", async () => {
    const offered = { ...CRM_OFF, state: 'available', add: 'owner' }
    let tools: unknown[] = [offered]
    const { el, hub, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: pending(offered) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await click(byText(el, '.tool-row button', 'Add'))
    // one provider: its panel, no choice to make
    expect(el.querySelector('.tool-providers')).toBeNull()
    expect(el.querySelector('.tool-panel-title')?.textContent).toBe('CRM · Relaticle CRM')
    expect(el.querySelector('.tool-panel-description')?.textContent).toBe(
      "The sales team's accounts, contacts and notes"
    )
    // a space's account only once the provider is added; its settings are not known before it is in use
    expect([...el.querySelectorAll('.tool-section h4')].map((h) => h.textContent)).toEqual(['Who can use it'])
    expect(tokenField(el)).toBeNull()
    await click(byText(el, 'button', 'Add to Sales EU'))
    await until(() => el.querySelector('.tool-pending'))
    // the choice of the provider, and nothing else, waits for the phone (PROF-TOOL-002)
    expect(agent.find('POST', TOOLS_PATH)[0].body).toEqual({ source: 'relaticle' })
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(/^Confirm on your phone · Code 48 21/)
    expect(byText(el, 'button', 'Add to Sales EU')).toBeUndefined()
    // confirmed: the feature has its provider, setup; the panel is its provider's, with its settings
    tools = [crm()]
    await announce(hub, {
      spaceId: SALES.id,
      feature: 'crm',
      source: 'relaticle',
      state: 'setup',
      changeId: 'chg_1',
      outcome: 'applied',
    })
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Saved')
    await until(() => !!byText(el, 'label.field', /^Workspace/))
    expect(el.querySelector('.tool-panel .state-tag')?.textContent).toBe('Needs setup: Workspace, account')
    expect([...el.querySelectorAll('.tool-section h4')].map((h) => h.textContent)).toEqual([
      'Settings of the tool',
      'Account',
      'What each tool asks',
      'Who can use it',
    ])
  })

  it("adds a feature of one provider with the agent's account, and waits for the phone", async () => {
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
    await click(byText(el, 'button', 'Add to Sales EU'))
    await until(() => el.querySelector('.tool-pending'))
    expect(agent.find('POST', TOOLS_PATH)[0].body).toEqual({ source: 'web' })
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(/^Confirm on your phone · Code 17 03/)
    // back to the list: the row waits too
    await click(byText(el, 'button', 'All tools'))
    expect(rowTexts(el)[0]?.state).toBe('Waiting for your phone')
  })

  it('says why the list could not be read', async () => {
    const { el } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ error: 'boom', message: 'agent down' }, 500)]])
    await until(() => el.querySelector('.banner.warning'))
  })
})

/** The providers a feature's Add shows, as the owner reads them: title, the Suggested mark, description, account. */
const providerTexts = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLLabelElement>('.tool-provider-option')].map((o) => ({
    title: o.querySelector('.tool-provider-title')?.childNodes[0]?.textContent,
    suggested: !!o.querySelector('.tool-suggested'),
    checked: !!o.querySelector('input')?.checked,
    lines: [...o.querySelectorAll('.tool-provider-text > .muted')].map((x) => x.textContent),
  }))

describe('Add among the providers of a feature (UI-CONV-065, PROF-TOOL-002, PROF-TOOL-033)', () => {
  it('shows several under "Choose a provider for <feature>", the default Suggested and selected, then the one picked', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [FILES] })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: pending(FILES, '31 07') }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    expect(rowTexts(el)).toEqual([{ title: 'Files', provider: 'Choose a provider', state: 'Not added', add: true }])
    await click(byText(el, '.tool-row button', 'Add'))
    expect(el.querySelector('.tool-panel-title')?.textContent).toBe('Files')
    expect(el.querySelector('.tool-providers legend')?.textContent).toBe('Choose a provider for Files')
    // in the agent's order, each with its title, its description and whose account it uses
    expect(providerTexts(el)).toEqual([
      {
        title: 'Nextcloud',
        suggested: true,
        checked: true,
        lines: [NEXTCLOUD.description, "Uses the space's account"],
      },
      {
        title: 'Google Drive',
        suggested: false,
        checked: false,
        lines: [DRIVE.description, 'Each person uses their own account'],
      },
    ])
    expect(el.querySelector('.tool-suggested')?.textContent).toBe('Suggested')
    // the default: a space's account, none to set before it is added
    expect(el.querySelector('.tool-section[aria-label="Account"]')).toBeNull()
    await click(el.querySelectorAll<HTMLInputElement>('.tool-provider-option input')[1])
    // the one picked: each person's own account
    expect(el.querySelector('.tool-section[aria-label="Account"] .rule-line')?.textContent).toBe(
      'Each person connects their own account, in Your accounts.'
    )
    await click(byText(el, 'button', 'Add to Sales EU'))
    await until(() => el.querySelector('.tool-pending'))
    expect(agent.find('POST', TOOLS_PATH)[0].body).toEqual({ source: 'drive' })
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(/^Confirm on your phone · Code 31 07/)
    // while it waits, no other provider can be picked
    expect(el.querySelector('.tool-providers')).toBeNull()
  })

  it("ends the wait on the change of the feature, whichever provider it names, and opens the new provider's panel", async () => {
    let tools: unknown[] = [FILES]
    const { el, hub } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: pending(FILES) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Files')
    await click(byText(el, 'button', 'Add to Sales EU'))
    await until(() => el.querySelector('.tool-pending'))
    // a change of another feature, or one that names no feature, ends nothing
    await announce(hub, {
      spaceId: SALES.id,
      feature: 'crm',
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'applied',
    })
    await announce(hub, {
      spaceId: SALES.id,
      source: 'nextcloud',
      state: 'setup',
      changeId: 'chg_1',
      outcome: 'applied',
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(el.querySelector('.tool-pending')).toBeTruthy()
    tools = [
      {
        ...FILES_READY,
        state: 'setup',
        account: { ...FILES_READY.account, set: false },
        list: { ...FOLDERS, entries: [] },
      },
    ]
    await announce(hub, {
      spaceId: SALES.id,
      feature: 'files',
      source: 'nextcloud',
      state: 'setup',
      changeId: 'chg_1',
      outcome: 'applied',
    })
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Saved')
    await until(() => el.querySelector('.tool-panel-title')?.textContent === 'Files · Nextcloud')
    // the needs-setup line names the list with no entry, then the account (UI-CONV-052)
    expect(el.querySelector('.tool-panel .state-tag')?.textContent).toBe('Needs setup: Folders, account')
    await click(byText(el, 'button', 'All tools'))
    expect(rowTexts(el)[0]).toMatchObject({
      provider: "Nextcloud · Uses the space's account",
      state: 'Needs setup: Folders, account',
    })
  })

  it('withdraws a first choice found waiting, which names no provider, by a provider of its feature (PROF-TOOL-005)', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [pending(FILES)] })],
      [`DELETE ${TOOLS_PATH}/nextcloud/pending`, () => new Response(null, { status: 204 })],
    ])
    await until(() => el.querySelector('.tool-row'))
    expect(rowTexts(el)[0]).toMatchObject({
      provider: 'Choose a provider',
      state: 'Waiting for your phone',
      add: false,
    })
    await open(el, 'Files')
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(/^Confirm on your phone · Code 48 21/)
    expect(el.querySelector('.tool-providers')).toBeNull()
    await click(byText(el, '.tool-pending button', 'Withdraw'))
    await until(() => agent.find('DELETE', `${TOOLS_PATH}/nextcloud/pending`).length === 1)
    await until(() => el.querySelector('.tool-change-outcome')?.textContent === 'Withdrawn. Nothing changed.')
  })

  it('says a provider that does not offer its feature, in place of its state and atop its panel, with no tool', async () => {
    const { el } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [{ ...FILES_READY, conformant: false, tools: [] }] })],
    ])
    const words = 'Nextcloud does not offer Files as Fleet support expects. Choose another provider.'
    await until(() => el.querySelector('.tool-row'))
    expect(rowTexts(el)[0]?.state).toBe(words)
    expect(el.querySelector('.tool-row .tag, .tool-row .state-tag')).toBeNull()
    await open(el, 'Files')
    expect(el.querySelector('.tool-panel-head .tool-not-conformant')?.textContent?.trim()).toBe(words)
    expect(el.querySelector('.tool-section[aria-label="What each tool asks"]')).toBeNull()
    // conformant, or not connected yet: the state as ever
    teardown()
    const fresh = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [{ ...FILES_READY, conformant: undefined }] })],
    ])
    await until(() => fresh.el.querySelector('.tool-row'))
    expect(rowTexts(fresh.el)[0]?.state).toBe('Ready')
  })

  it('says that a feature already has a provider, in the words of UI-CONV-052', async () => {
    const { el } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [FILES] })],
      [`POST ${TOOLS_PATH}`, () => json({ error: 'feature-has-provider' }, 409)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'Files')
    await click(byText(el, 'button', 'Add to Sales EU'))
    await until(() => el.querySelector('.tool-error'))
    expect(el.querySelector('.tool-error')?.textContent).toBe(
      'Files already has a provider in this space. Change it instead.'
    )
  })
})

/** X needs four keys: one masked field each, in the agent's order (PROF-TOOL-001, PROF-TOOL-004). */
const X_FIELDS = [
  { name: 'api_key', label: 'API key', pattern: '^[A-Za-z0-9]{10,64}$' },
  { name: 'api_secret', label: 'API secret', pattern: '^[A-Za-z0-9]{20,128}$' },
  { name: 'access_token', label: 'Access token', pattern: '^[0-9]{1,20}-[A-Za-z0-9]{10,64}$' },
  { name: 'access_token_secret', label: 'Access token secret', pattern: '^[A-Za-z0-9]{20,128}$' },
]
const X_VALUES = {
  api_key: 'XkEyXkEyXkEy',
  api_secret: 'XsEcReTXsEcReTXsEcReT01',
  access_token: '1234567890-XtOkEnXtOkEn',
  access_token_secret: 'XtSeCrEtXtSeCrEtXtSeCrEt9',
}
const X = {
  feature: { id: 'social', title: 'Social posting', profile: null },
  providers: [{ source: 'x', title: 'X', account: { kind: 'space' }, default: true }],
  source: 'x',
  title: 'X',
  description: 'Posts of the team',
  state: 'setup',
  add: 'owner',
  guests: false,
  account: { kind: 'space', fields: X_FIELDS, set: false, setAt: null, setBy: null },
  bindings: [],
  tools: [{ name: 'post', title: 'Post', effect: 'external', rule: 'confirm', packRule: 'confirm', stepUp: null }],
  pending: null,
}
const X_SET = {
  ...X,
  state: 'ready',
  account: { ...X.account, set: true, setAt: '2026-11-20T10:02:00Z', setBy: { name: 'Jonas Weber' } },
}
const X_ACCOUNT = `${TOOLS_PATH}/x/account`

/** Types each value in its field, in the fields' order. */
async function fill(el: HTMLElement, values: Record<string, string>) {
  const fields = accountFields(el)
  for (const [i, f] of X_FIELDS.entries()) await type(fields[i], values[f.name] ?? '')
}
const errorAt = (el: HTMLElement, label: string) =>
  byText(el, '.tool-section[aria-label="Account"] label.field', new RegExp(`^${label}`))
    ?.querySelector('.field-error')
    ?.textContent?.trim()

/** Nothing of these values in the page, the snapshot or the device store. */
function holdsNone(el: HTMLElement, hub: Hub, values: Record<string, string>) {
  // @ts-expect-error private: the device store
  const store = hub.store as { [key: string]: unknown }
  const stored = JSON.stringify(Object.values(store).map((v) => (v instanceof Map ? [...v.values()] : v)))
  for (const value of Object.values(values)) {
    expect(el.textContent).not.toContain(value)
    expect(el.innerHTML).not.toContain(value)
    expect(JSON.stringify(hub.getSnapshot())).not.toContain(value)
    expect(stored).not.toContain(value)
  }
}

describe('one field per key of a space account (UI-CONV-050, PROF-TOOL-004)', () => {
  it('shows the four keys of X as four masked fields, in order, each labelled; Save once each holds a value', async () => {
    const { el } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ tools: [X] })]])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    expect(accountLabels(el)).toEqual(['API key', 'API secret', 'Access token', 'Access token secret'])
    const fields = accountFields(el)
    expect(fields.map((f) => f.type)).toEqual(['password', 'password', 'password', 'password'])
    expect(fields.map((f) => f.placeholder)).toEqual([
      'Paste the API key',
      'Paste the API secret',
      'Paste the Access token',
      'Paste the Access token secret',
    ])
    // never prefilled, nothing suggested, corrected or filled in by the browser
    for (const f of fields) {
      expect(f.value).toBe('')
      expect(f.getAttribute('autocomplete')).toBe('off')
      expect(f.getAttribute('autocorrect')).toBe('off')
      expect(f.getAttribute('spellcheck')).toBe('false')
      expect(f.getAttribute('data-1p-ignore')).toBe('true')
    }
    expect(el.querySelector('.tool-account-status')?.textContent).toBe('Not set')
    expect(accountSave(el)?.disabled).toBe(true)
    await fill(el, { ...X_VALUES, access_token_secret: '' })
    expect(accountSave(el)?.disabled).toBe(true)
    // spaces only do not hold a value
    await type(fields[3], '   ')
    expect(accountSave(el)?.disabled).toBe(true)
    await type(fields[3], X_VALUES.access_token_secret)
    expect(accountSave(el)?.disabled).toBe(false)
  })

  it('sends every field together, trimmed, empties them all, and keeps none of them anywhere', async () => {
    const { el, hub, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [X] })],
      [`PUT ${X_ACCOUNT}`, () => json({ tool: pending(X) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    // pasted with a line break and spaces at either end: accepted, sent without them
    await fill(el, {
      ...X_VALUES,
      api_key: `${X_VALUES.api_key}\n  `,
      access_token_secret: `  ${X_VALUES.access_token_secret} \r\n`,
    })
    await click(accountSave(el))
    // emptied as the request left
    expect(accountFields(el).map((f) => f.value)).toEqual(['', '', '', ''])
    await until(() => agent.find('PUT', X_ACCOUNT).length === 1)
    expect(agent.find('PUT', X_ACCOUNT)[0].body).toEqual({ values: X_VALUES })
    await until(() => el.querySelector('.tool-section[aria-label="Account"] .tool-pending'))
    holdsNone(el, hub, X_VALUES)
  })

  it('sends nothing while a value does not fit: it stays in its field, with the message, the others too', async () => {
    const { el, hub, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [X] })],
      [`PUT ${X_ACCOUNT}`, () => json({ tool: pending(X) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    await fill(el, { ...X_VALUES, api_secret: 'tooShort' })
    await click(accountSave(el))
    expect(agent.find('PUT', X_ACCOUNT)).toHaveLength(0)
    expect(accountFields(el).map((f) => f.value)).toEqual([
      X_VALUES.api_key,
      'tooShort',
      X_VALUES.access_token,
      X_VALUES.access_token_secret,
    ])
    expect(errorAt(el, 'API secret')).toBe('Fleet support does not take this API secret.')
    expect(el.querySelectorAll('.tool-section[aria-label="Account"] .field-error')).toHaveLength(1)
    expect(accountFields(el)[1]?.getAttribute('aria-invalid')).toBe('true')
    // an access token with no dash: the words name that field's label (UI-CONV-052)
    await type(accountFields(el)[1], X_VALUES.api_secret)
    await type(accountFields(el)[2], '1234567890XtOkEnXtOkEn')
    await click(accountSave(el))
    expect(agent.find('PUT', X_ACCOUNT)).toHaveLength(0)
    expect(errorAt(el, 'Access token')).toBe('Fleet support does not take this Access token.')
    expect(errorAt(el, 'API secret')).toBeUndefined()
    // a space inside a value, once trimmed, is refused at its field
    await type(accountFields(el)[2], '1234567890-XtOkEn XtOkEn')
    await click(accountSave(el))
    expect(agent.find('PUT', X_ACCOUNT)).toHaveLength(0)
    expect(errorAt(el, 'Access token')).toBe('Fleet support does not take this Access token.')
    expect(errorAt(el, 'API secret')).toBeUndefined()
    expect(accountFields(el)[2]?.value).toBe('1234567890-XtOkEn XtOkEn')
    holdsNone(el, hub, X_VALUES)
  })

  it('shows a 422 that names `account.api_secret` at the API secret field', async () => {
    const { el, hub, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [X] })],
      [`PUT ${X_ACCOUNT}`, () => json({ error: 'bad-token', field: 'account.api_secret' }, 422)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    await fill(el, X_VALUES)
    await click(accountSave(el))
    await until(() => errorAt(el, 'API secret'))
    expect(agent.find('PUT', X_ACCOUNT)).toHaveLength(1)
    expect(errorAt(el, 'API secret')).toBe('Fleet support does not take this API secret.')
    expect(el.querySelectorAll('.tool-section[aria-label="Account"] .field-error')).toHaveLength(1)
    expect(el.querySelector('.tool-error')).toBeNull()
    // the values went with the request: every field is empty, to be typed again
    expect(accountFields(el).map((f) => f.value)).toEqual(['', '', '', ''])
    expect(accountSave(el)?.disabled).toBe(true)
    holdsNone(el, hub, X_VALUES)
  })

  it('says the fields changed when a `400` names a field of the account, and reads them again (UI-CONV-052)', async () => {
    let tools: unknown[] = [X]
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools })],
      [`PUT ${X_ACCOUNT}`, () => json({ error: 'bad-request', field: 'account.api_key' }, 400)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    await fill(el, X_VALUES)
    tools = [{ ...X, account: { ...X.account, fields: X_FIELDS.slice(1) } }]
    const reads = agent.find('GET', TOOLS_PATH).length
    await click(accountSave(el))
    await until(() => el.querySelector('.tool-section[aria-label="Account"] .tool-error'))
    expect(el.querySelector('.tool-section[aria-label="Account"] .tool-error')?.textContent).toBe(
      'The fields of this account have changed. Open the tool again.'
    )
    await until(() => agent.find('GET', TOOLS_PATH).length > reads)
    await until(() => accountLabels(el).length === 3)
    expect(accountLabels(el)).toEqual(['API secret', 'Access token', 'Access token secret'])
    // nothing is said at a field: the words are the account's
    expect(el.querySelectorAll('.tool-section[aria-label="Account"] .field-error')).toHaveLength(0)
  })

  it('says the fields changed for a `bad-token` that names a field the panel does not show', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [X] })],
      [`PUT ${X_ACCOUNT}`, () => json({ error: 'bad-token', field: 'account.pin' }, 422)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    await fill(el, X_VALUES)
    const reads = agent.find('GET', TOOLS_PATH).length
    await click(accountSave(el))
    await until(() => el.querySelector('.tool-section[aria-label="Account"] .tool-error'))
    expect(el.querySelector('.tool-section[aria-label="Account"] .tool-error')?.textContent).toBe(
      'The fields of this account have changed. Open the tool again.'
    )
    await until(() => agent.find('GET', TOOLS_PATH).length > reads)
  })

  it('empties every field when the panel is left, and when the segment is', async () => {
    const { el, hub } = await ownersTools([[`GET ${TOOLS_PATH}`, () => json({ tools: [X] })]])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    await fill(el, X_VALUES)
    await click(byText(el, 'button', 'All tools'))
    await open(el, 'X')
    expect(accountFields(el).map((f) => f.value)).toEqual(['', '', '', ''])
    expect(accountSave(el)?.disabled).toBe(true)
    await fill(el, X_VALUES)
    await click(byText(el, '[role="tab"]', 'About'))
    await click(byText(el, '[role="tab"]', 'Tools'))
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    expect(accountFields(el).map((f) => f.value)).toEqual(['', '', '', ''])
    holdsNone(el, hub, X_VALUES)
  })

  it('shows an account set as set, when and by whom; Replace shows the empty fields again', async () => {
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [X_SET] })],
      [`PUT ${X_ACCOUNT}`, () => json({ tool: pending(X_SET) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'X')
    expect(el.querySelector('.tool-account-status')?.textContent).toBe('Set by Jonas Weber on Nov 20, 2026')
    expect(accountFields(el)).toHaveLength(0)
    expect(byText(el, '.tool-actions button', 'Remove account')).toBeTruthy()
    await click(byText(el, 'button', 'Replace'))
    expect(accountLabels(el)).toEqual(['API key', 'API secret', 'Access token', 'Access token secret'])
    expect(accountFields(el).map((f) => f.value)).toEqual(['', '', '', ''])
    // Cancel hides them, and what was typed goes with them
    await fill(el, X_VALUES)
    await click(byText(el, '.tool-section[aria-label="Account"] button', 'Cancel'))
    expect(accountFields(el)).toHaveLength(0)
    await click(byText(el, 'button', 'Replace'))
    expect(accountFields(el).map((f) => f.value)).toEqual(['', '', '', ''])
    await fill(el, X_VALUES)
    await click(accountSave(el))
    await until(() => el.querySelector('.tool-section[aria-label="Account"] .tool-pending'))
    expect(agent.find('PUT', X_ACCOUNT)[0].body).toEqual({ values: X_VALUES })
    // sent: the fields are gone, the code in place of Replace
    expect(accountFields(el)).toHaveLength(0)
  })

  it('shows a single token as one field', async () => {
    const single = {
      ...X,
      feature: { id: 'code', title: 'Code and issues', profile: null },
      source: 'github',
      title: 'GitHub',
      account: { kind: 'space', fields: [{ name: 'token', label: 'API token' }], set: false },
    }
    const { el, agent } = await ownersTools([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [single] })],
      [`PUT ${TOOLS_PATH}/github/account`, () => json({ tool: pending(single) }, 202)],
    ])
    await until(() => el.querySelector('.tool-row'))
    await open(el, 'GitHub')
    expect(accountLabels(el)).toEqual(['API token'])
    expect(accountFields(el)).toHaveLength(1)
    expect(accountFields(el)[0]?.placeholder).toBe('Paste the API token')
    await type(accountFields(el)[0], ' ghp_Abc123 ')
    await click(accountSave(el))
    await until(() => agent.find('PUT', `${TOOLS_PATH}/github/account`).length === 1)
    expect(agent.find('PUT', `${TOOLS_PATH}/github/account`)[0].body).toEqual({ values: { token: 'ghp_Abc123' } })
  })
})

describe('the tools a member reads in About (UI-CONV-031, UI-CONV-049)', () => {
  it("lists the ready features: title, the provider's line, its description, and what their tools ask, by rule", async () => {
    const memberSales = { ...SALES, role: 'member' as const }
    const agent = fakeAgent([
      [
        `GET ${TOOLS_PATH}`,
        () =>
          json({
            tools: [
              {
                feature: CRM_FEATURE,
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
    // the feature, then the line of its provider (UI-CONV-031, UI-CONV-065)
    expect(el.querySelector('.about-tool-title')?.textContent).toBe('CRM')
    expect(el.querySelector('.about-tool-provider')?.textContent).toBe(
      "Relaticle CRM · Workspace: sales-eu · Uses the space's account"
    )
    expect(el.querySelector('.about-tool-description')?.textContent).toBe(
      "The sales team's accounts, contacts and notes"
    )
    expect(el.querySelector('.about-tool-rules')?.textContent).toBe(
      "Runs without asking: Get company, List companies · Asks you first: Add a note · Needs Jonas Weber's approval: Delete note, then a check on your phone"
    )
    expect(el.textContent).not.toContain('Export')
    expect(agent.find('GET', TOOLS_PATH)).toHaveLength(1)
  })

  it("reads each ready feature in the template's order, its provider's line with the line of its list (UI-CONV-060, UI-CONV-065)", async () => {
    const { el } = await ownersTools(
      [
        [
          `GET ${TOOLS_PATH}`,
          () =>
            json({
              tools: [
                FILES_READY,
                { ...READY, title: 'Relaticle' },
                {
                  ...FILES_READY,
                  feature: { ...FILES_FEATURE, id: 'archive', title: 'Archive' },
                  list: { ...FOLDERS, any: true },
                },
                // no provider, or not ready: not in About
                WEB,
                crm({ feature: { id: 'notes', title: 'Notes', profile: null } }),
              ],
            }),
        ],
      ],
      { segment: 'about' }
    )
    await until(() => el.querySelectorAll('.about-tool').length === 3)
    expect(
      [...el.querySelectorAll('.about-tool')].map((x) => [
        x.querySelector('.about-tool-title')?.textContent,
        x.querySelector('.about-tool-provider')?.textContent,
      ])
    ).toEqual([
      ['Files', "Nextcloud · Folders: /Projects/Alpha · Uses the space's account"],
      ['CRM', "Relaticle · Workspace: sales-eu · Region: eu-1 · Uses the space's account"],
      ['Archive', "Nextcloud · Folders: Any folder you can reach · Uses the space's account"],
    ])
    expect(el.querySelector('.about-tool-description')?.textContent).toBe(NEXTCLOUD.description)
    expect(el.querySelector('.about-tool-rules')?.textContent).toBe(
      "Runs without asking: Read a file · Asks you first: Replace a file's content"
    )
  })

  it('tells the owner "Needs your approval", and names each step-up after its own tool', async () => {
    const { el } = await ownersTools(
      [
        [
          `GET ${TOOLS_PATH}`,
          () =>
            json({
              tools: [
                crm({
                  state: 'ready',
                  account: { kind: 'space', label: 'API token', set: true },
                  tools: [
                    {
                      name: 'get-company',
                      title: 'Get company',
                      effect: 'read',
                      rule: 'none',
                      packRule: 'none',
                      stepUp: null,
                    },
                    {
                      name: 'delete-note',
                      title: 'Delete note',
                      effect: 'delete',
                      rule: 'approval',
                      packRule: 'approval',
                      stepUp: 'device',
                    },
                    {
                      name: 'archive',
                      title: 'Archive note',
                      effect: 'write',
                      rule: 'approval',
                      packRule: 'confirm',
                      stepUp: null,
                    },
                    {
                      name: 'export',
                      title: 'Export',
                      effect: 'external',
                      rule: 'off',
                      packRule: 'approval',
                      stepUp: null,
                    },
                  ],
                }),
              ],
            }),
        ],
      ],
      { segment: 'about' }
    )
    await until(() => el.querySelector('.about-tool'))
    expect(el.querySelector('.about-tool-rules')?.textContent).toBe(
      'Runs without asking: Get company · Needs your approval: Delete note, then a check on your phone, Archive note'
    )
    // never the reader's own name
    expect(el.querySelector('.about-tools')?.textContent).not.toContain('Jonas Weber')
    expect(el.textContent).not.toContain('Export')
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
