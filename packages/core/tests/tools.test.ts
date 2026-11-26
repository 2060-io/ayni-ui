/**
 * Tools, phase 1 in the core (profile 3.4: §3.10, §6, §8; UI-CONV-045..051, UI-APPR-006): the answers read as the
 * profile gives them, the rules a screen follows for a space's tools, and what a confirmation card shows.
 */
import { describe, expect, it } from 'vitest'
import { progressOf } from '../src/conversationDesign.js'
import {
  accountSourceOf,
  accountValueFits,
  accountValueOf,
  accountValuesOf,
  awaitsConfirmation,
  bindingValueFits,
  CHOICES_TEXT_MAX,
  canAdd,
  canChangeProvider,
  canStopAllowing,
  changeOutcomeKeyOf,
  choiceInList,
  choicesRefusalOf,
  choicesTextOf,
  choosesProvider,
  concernsFeature,
  confirmationOf,
  confirmationOutcomeOf,
  conversationSourcesOf,
  defaultProviderOf,
  entryCovers,
  isAdded,
  isConformant,
  LIST_CHOICES_MAX,
  listChanged,
  listChoicesOf,
  listFormOf,
  listInputOf,
  listIsFull,
  listLineOf,
  looksLikeJson,
  loosens,
  messageSourcesOf,
  missingOf,
  missingPartsOf,
  otherProvidersOf,
  providerChangeInputOf,
  providerChangeOf,
  providerLineOf,
  readyToolsOf,
  requesterNameOf,
  ruleChoicesFor,
  ruleGroupsOf,
  sourceNameOf,
  spaceToolOf,
  spaceToolsChangeOf,
  spaceToolsOf,
  TOKEN_MAX_LENGTH,
  takesTools,
  timeLeftOf,
  toolApprovalOf,
  toolRefusalOf,
  toolRowStateOf,
  withListEntry,
  withoutListEntry,
} from '../src/tools.js'

/** The CRM of Sales EU as its owner reads it (profile §3.10): one item per feature, the provider in use. */
const CRM_OWNER = {
  feature: { id: 'crm', title: 'CRM', profile: null },
  providers: [
    {
      source: 'relaticle',
      title: 'Relaticle CRM',
      description: "The sales team's accounts, contacts and notes",
      account: { kind: 'space' },
      default: true,
    },
  ],
  source: 'relaticle',
  title: 'Relaticle CRM',
  description: "The sales team's accounts, contacts and notes",
  state: 'ready',
  add: 'auto',
  guests: false,
  account: {
    kind: 'space',
    fields: [{ name: 'token', label: 'API token', pattern: '^[A-Za-z0-9|]{20,200}$' }],
    set: true,
    setAt: '2026-11-20T10:02:00Z',
    setBy: { name: 'Jonas Weber' },
  },
  bindings: [
    { name: 'workspace', label: 'Workspace', value: 'sales-eu', setBy: 'owner', pattern: '^[a-z0-9-]{1,64}$' },
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
    { name: 'export', title: 'Export', effect: 'external', rule: 'off', packRule: 'approval', stepUp: null },
  ],
  pending: null,
}

/** The account of X as its owner reads it: four keys, each a field of its own. */
const X_ACCOUNT = {
  kind: 'space',
  fields: [
    { name: 'api_key', label: 'API key', pattern: '^[A-Za-z0-9]{10,64}$' },
    { name: 'api_secret', label: 'API secret', pattern: '^[A-Za-z0-9]{20,128}$' },
    { name: 'access_token', label: 'Access token', pattern: '^[0-9]{1,20}-[A-Za-z0-9]{10,64}$' },
    { name: 'access_token_secret', label: 'Access token secret', pattern: '^[A-Za-z0-9]{20,128}$' },
  ],
  set: false,
  setAt: null,
  setBy: null,
}

/** A confirmation card of a call of `create-note` (profile §6). */
const CARD = {
  approvalId: 'apr_1',
  kind: 'confirmation',
  status: 'PENDING',
  expiresAt: '2026-11-20T10:10:00Z',
  requester: { displayName: 'Ana Ríos', role: 'sales' },
  tool: 'create-note',
  action: {
    title: 'Add a note',
    source: { id: 'relaticle', title: 'Relaticle CRM' },
    account: { kind: 'space', space: { id: 'spc_sales', title: 'Sales EU' } },
    fields: [
      { label: 'Company', value: 'Acme Logistics' },
      { label: 'Workspace', value: 'sales-eu', pinned: true },
      { label: 'Note', value: 'Called Marta: renewal in March,\nquote for 40 seats.' },
    ],
    erased: false,
  },
  allowForConversation: true,
}

describe("a space's tools as the agent gives them (PROF-TOOL-001)", () => {
  it("reads the owner's answer whole, and carries no token", () => {
    const [crm] = spaceToolsOf({ tools: [{ ...CRM_OWNER, account: { ...CRM_OWNER.account, token: 'secret' } }] })
    expect(crm.feature).toEqual({ id: 'crm', title: 'CRM', profile: null })
    expect(crm.providers).toEqual([
      {
        source: 'relaticle',
        title: 'Relaticle CRM',
        description: "The sales team's accounts, contacts and notes",
        account: { kind: 'space' },
        default: true,
      },
    ])
    expect([crm.source, crm.title]).toEqual(['relaticle', 'Relaticle CRM'])
    expect(crm.state).toBe('ready')
    expect(crm.add).toBe('auto')
    // a category: no contract, no capability, no conformance, no list
    expect(crm.capabilities).toEqual([])
    expect(crm).not.toHaveProperty('conformant')
    expect(crm.list).toBeNull()
    expect(crm.account).toEqual({
      kind: 'space',
      fields: [{ name: 'token', label: 'API token', pattern: '^[A-Za-z0-9|]{20,200}$' }],
      set: true,
      setAt: '2026-11-20T10:02:00Z',
      setBy: { name: 'Jonas Weber' },
    })
    expect(JSON.stringify(crm)).not.toContain('secret')
    expect(crm.bindings[0]).toEqual({
      name: 'workspace',
      label: 'Workspace',
      value: 'sales-eu',
      setBy: 'owner',
      pattern: '^[a-z0-9-]{1,64}$',
    })
    expect(crm.tools.map((t) => t.packRule)).toEqual(['none', 'none', 'confirm', 'approval', 'approval'])
    expect(crm.pending).toBeNull()
  })

  it("reads a member's answer: titles and rules, no name, no pack rule, no pending change", () => {
    const [crm] = spaceToolsOf({
      tools: [
        {
          feature: { id: 'crm', title: 'CRM', profile: null },
          source: 'relaticle',
          title: 'Relaticle CRM',
          description: 'd',
          state: 'ready',
          guests: false,
          account: { kind: 'space' },
          bindings: [{ label: 'Workspace', value: 'sales-eu' }],
          tools: [{ title: 'Add a note', effect: 'write', rule: 'confirm', stepUp: null }],
        },
      ],
    })
    expect(crm.add).toBeUndefined()
    // a member chooses no provider: none is given
    expect(crm.providers).toEqual([])
    expect(crm.tools[0]).toEqual({ title: 'Add a note', effect: 'write', rule: 'confirm', stepUp: null })
    // a member's answer names the kind only: no field, no state of the account
    expect(crm.account).toEqual({ kind: 'space', fields: [], set: false, setAt: null, setBy: null })
    expect(spaceToolsOf({ tools: [] })).toEqual([])
    expect(spaceToolsOf(undefined)).toEqual([])
  })

  it("reads one field per value of a space's account, in the agent's order (PROF-TOOL-001)", () => {
    const [x] = spaceToolsOf({ tools: [{ ...CRM_OWNER, source: 'x', title: 'X', account: X_ACCOUNT }] })
    expect(x.account?.fields).toEqual(X_ACCOUNT.fields)
    expect(x.account?.set).toBe(false)
    // a field with no name, or a name said twice, is not shown; a field with no label is named by its name
    const [odd] = spaceToolsOf({
      tools: [
        {
          ...CRM_OWNER,
          account: {
            kind: 'space',
            fields: [{ label: 'Nameless' }, { name: 'token' }, { name: 'token', label: 'Again' }, 'junk'],
          },
        },
      ],
    })
    expect(odd.account?.fields).toEqual([{ name: 'token', label: 'token' }])
    // the old single label and pattern are not read: the fields are
    const [old] = spaceToolsOf({ tools: [{ ...CRM_OWNER, account: { kind: 'space', label: 'API token' } }] })
    expect(old.account?.fields).toEqual([])
    expect(JSON.stringify(old.account)).not.toContain('API token')
  })

  it('reads the change that waits for the phone', () => {
    const [crm] = spaceToolsOf({
      tools: [
        { ...CRM_OWNER, pending: { changeId: 'chg_1', summary: 'Set the account', code: '48 21', expiresAt: 'x' } },
      ],
    })
    expect(crm.pending).toEqual({ changeId: 'chg_1', summary: 'Set the account', code: '48 21', expiresAt: 'x' })
    expect(toolRowStateOf(crm)).toBe('waiting')
  })

  it('reads `ayni.space.tools.changed`, with its feature (PROF-TOOL-006)', () => {
    expect(
      spaceToolsChangeOf({
        spaceId: 's',
        feature: 'crm',
        source: 'relaticle',
        state: 'ready',
        changeId: 'chg_1',
        outcome: 'applied',
      })
    ).toEqual({
      spaceId: 's',
      feature: 'crm',
      source: 'relaticle',
      state: 'ready',
      changeId: 'chg_1',
      outcome: 'applied',
    })
    expect(
      spaceToolsChangeOf({ spaceId: 's', feature: 'social', source: 'x', state: 'ready', outcome: 'applied' })?.changeId
    ).toBeUndefined()
    expect(spaceToolsChangeOf({ spaceId: 's', feature: 'social', source: 'x', outcome: 'nope' })).toBeNull()
    // a feature left with no provider names none (§5)
    expect(
      spaceToolsChangeOf({ spaceId: 's', feature: 'crm', source: null, state: 'off', outcome: 'applied' })?.source
    ).toBeNull()
    // the earlier shape, one change per source with no feature, is not read: no backward compatibility
    expect(spaceToolsChangeOf({ spaceId: 's', source: 'x', state: 'ready', outcome: 'applied' })).toBeNull()
  })

  it('serves tools only to an agent that declares them (PROF-DESC-009)', () => {
    expect(takesTools({ tools: true })).toBe(true)
    expect(takesTools({ tools: false })).toBe(false)
    expect(takesTools({})).toBe(false)
    expect(takesTools(undefined)).toBe(false)
  })
})

describe("the owner's rules (UI-CONV-050, agent D98)", () => {
  const [crm] = spaceToolsOf({ tools: [CRM_OWNER] })
  const tool = (name: string) => crm.tools.find((t) => t.name === name) as (typeof crm.tools)[number]

  it('offers the rules no looser than the agent-pack, `off` included', () => {
    expect(ruleChoicesFor(tool('get-company'))).toEqual(['none', 'confirm', 'approval', 'off'])
    expect(ruleChoicesFor(tool('create-note'))).toEqual(['confirm', 'approval', 'off'])
    expect(ruleChoicesFor(tool('delete-note'))).toEqual(['approval', 'off'])
    // `off` in force, the pack's `approval` the loosest
    expect(ruleChoicesFor(tool('export'))).toEqual(['approval', 'off'])
  })

  it('knows a looser rule, which waits for the phone, from a stricter one, which applies at once', () => {
    expect(loosens('confirm', 'approval')).toBe(true)
    expect(loosens('approval', 'confirm')).toBe(false)
    expect(loosens('approval', 'off')).toBe(true)
  })

  it('names what a source in setup still lacks, and the state of each row', () => {
    const setup = { ...crm, state: 'setup' as const, bindings: [{ ...crm.bindings[0], value: null }] }
    expect(missingOf({ ...setup, account: { ...(crm.account ?? { kind: 'space' }), set: false } })).toEqual({
      bindings: ['Workspace'],
      list: null,
      account: true,
    })
    expect(missingOf(crm)).toEqual({ bindings: [], list: null, account: false })
    expect(missingOf({ ...crm, account: { kind: 'agent' } })).toEqual({ bindings: [], list: null, account: false })
    expect(toolRowStateOf({ state: 'available', pending: null })).toBe('notAdded')
    expect(toolRowStateOf({ state: 'setup', pending: null })).toBe('needsSetup')
    expect(toolRowStateOf({ state: 'ready', pending: null })).toBe('ready')
    expect(toolRowStateOf({ state: 'off', pending: null })).toBe('off')
    expect([canAdd({ state: 'available' }), canAdd({ state: 'off' }), canAdd({ state: 'ready' })]).toEqual([
      true,
      true,
      false,
    ])
    expect([isAdded({ state: 'setup' }), isAdded({ state: 'ready' }), isAdded({ state: 'off' })]).toEqual([
      true,
      true,
      false,
    ])
  })

  it('checks a value against its binding, and each value of an account against its field, before sending', () => {
    expect(bindingValueFits({ pattern: '^[a-z0-9-]{1,64}$' }, 'sales-eu')).toBe(true)
    expect(bindingValueFits({ pattern: '^[a-z0-9-]{1,64}$' }, 'Sales EU')).toBe(false)
    expect(bindingValueFits({}, '')).toBe(false)
    expect(bindingValueFits({ pattern: '([' }, 'anything')).toBe(true)
    expect(accountValueFits({ pattern: '^[A-Za-z0-9|]{20,200}$' }, '7|abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(accountValueFits({ pattern: '^[A-Za-z0-9|]{20,200}$' }, 'short')).toBe(false)
    expect(accountValueFits({}, '')).toBe(false)
    expect(accountValueFits({}, 'x'.repeat(TOKEN_MAX_LENGTH))).toBe(true)
    expect(accountValueFits({}, 'x'.repeat(TOKEN_MAX_LENGTH + 1))).toBe(false)
    // a space or a line break inside a value is refused, with or without a pattern
    expect(accountValueFits({}, 'abc def')).toBe(false)
    expect(accountValueFits({}, 'abc\ndef')).toBe(false)
  })

  it('trims what a paste brings at either end of a value of an account, never what is inside it', () => {
    expect(accountValueOf('  AbCdEfGhIjK\n')).toBe('AbCdEfGhIjK')
    expect(accountValueOf('\r\n\tAbC dEf \n')).toBe('AbC dEf')
  })

  it('gives the values of an account to send, every field trimmed, or the fields that do not fit', () => {
    const typed = {
      api_key: 'AbCdEfGhIjK1 \n',
      api_secret: '\tAbCdEfGhIjKlMnOpQrStUvWx',
      access_token: '1234567890-AbCdEfGhIjKl',
      access_token_secret: 'AbCdEfGhIjKlMnOpQrStUvWxYz  \r\n',
    }
    expect(accountValuesOf(X_ACCOUNT.fields, typed)).toEqual({
      values: {
        api_key: 'AbCdEfGhIjK1',
        api_secret: 'AbCdEfGhIjKlMnOpQrStUvWx',
        access_token: '1234567890-AbCdEfGhIjKl',
        access_token_secret: 'AbCdEfGhIjKlMnOpQrStUvWxYz',
      },
      refused: [],
    })
    // one that does not fit its pattern, one with a space inside, one missing: nothing to send, each named in order
    expect(
      accountValuesOf(X_ACCOUNT.fields, {
        ...typed,
        api_key: 'short',
        access_token: '1234567890-AbCdE fGhIjKl',
        access_token_secret: undefined,
      })
    ).toEqual({ values: {}, refused: ['api_key', 'access_token', 'access_token_secret'] })
    // a single token is one field
    expect(accountValuesOf([{ name: 'token', label: 'API token' }], { token: ' 7|abc\n' })).toEqual({
      values: { token: '7|abc' },
      refused: [],
    })
  })

  it('groups the tools by rule in About, loosest first, each with its own step-up, without those `off` (UI-CONV-049)', () => {
    expect(ruleGroupsOf(crm)).toEqual([
      {
        rule: 'none',
        tools: [
          { title: 'Get company', stepUp: null },
          { title: 'List companies', stepUp: null },
        ],
      },
      { rule: 'confirm', tools: [{ title: 'Add a note', stepUp: null }] },
      { rule: 'approval', tools: [{ title: 'Delete note', stepUp: 'device' }] },
    ])
    // a step-up belongs to its tool, not to its group
    const archive = {
      name: 'archive',
      title: 'Archive note',
      effect: 'write' as const,
      rule: 'approval' as const,
      stepUp: null,
    }
    expect(ruleGroupsOf({ tools: [...crm.tools, archive] })[2]).toEqual({
      rule: 'approval',
      tools: [
        { title: 'Delete note', stepUp: 'device' },
        { title: 'Archive note', stepUp: null },
      ],
    })
    expect(readyToolsOf([crm, { ...crm, source: 'x', state: 'setup' }]).map((t) => t.source)).toEqual(['relaticle'])
  })

  it('counts the time left, and says what a change came to', () => {
    const now = Date.parse('2026-11-20T10:00:00Z')
    expect(timeLeftOf('2026-11-20T10:04:32Z', now)).toBe('4:32')
    expect(timeLeftOf('2026-11-20T09:00:00Z', now)).toBe('0:00')
    // from one hour, hours and minutes, counted down every minute (UI-CONV-052): an approval of a day, a minute after
    // it was asked; an hour before its end; a second later
    expect(timeLeftOf('2026-11-21T10:00:00Z', now + 60_000)).toBe('23 h 59 min')
    expect(timeLeftOf('2026-11-20T11:00:00Z', now)).toBe('1 h 00 min')
    expect(timeLeftOf('2026-11-20T11:00:59Z', now)).toBe('1 h 00 min')
    expect(timeLeftOf('2026-11-20T11:00:00Z', now + 1000)).toBe('59:59')
    expect(timeLeftOf('2026-11-22T12:05:00Z', now)).toBe('50 h 05 min')
    expect(changeOutcomeKeyOf('applied')).toBe('saved')
    expect(changeOutcomeKeyOf('declined')).toBe('declined')
    expect(changeOutcomeKeyOf('failed')).toBe('declined')
    expect(changeOutcomeKeyOf('expired')).toBe('expired')
    expect(changeOutcomeKeyOf('cancelled')).toBe('withdrawn')
  })

  it("puts each refusal where it belongs: at the field it names, or the panel's", () => {
    expect(toolRefusalOf({ status: 422, code: 'bad-binding', field: 'bindings.workspace' })).toEqual({
      at: 'binding',
      name: 'workspace',
      reason: 'badBinding',
    })
    expect(toolRefusalOf({ status: 422, code: 'pinned-by-pack', field: 'region' })).toEqual({
      at: 'binding',
      name: 'region',
      reason: 'pinnedByPack',
    })
    expect(toolRefusalOf({ status: 422, code: 'looser-than-pack', field: 'calls.create-note' })).toEqual({
      at: 'rule',
      name: 'create-note',
      reason: 'looserThanPack',
    })
    // a value of the space's account, at the field it names
    expect(toolRefusalOf({ status: 422, code: 'bad-token', field: 'account.api_secret' })).toEqual({
      at: 'account',
      field: 'api_secret',
      reason: 'badToken',
    })
    expect(toolRefusalOf({ status: 422, code: 'bad-token' })).toEqual({
      at: 'account',
      field: null,
      reason: 'badToken',
    })
    // a field the agent does not declare, or one it misses
    expect(toolRefusalOf({ status: 400, code: 'bad-request', field: 'account.pin' })).toEqual({
      at: 'account',
      field: 'pin',
      reason: 'fieldsChanged',
    })
    expect(toolRefusalOf({ status: 400, code: 'bad-request', field: 'calls.nope' })).toEqual({
      at: 'panel',
      reason: 'other',
    })
    expect(toolRefusalOf({ status: 409, code: 'confirmation-unavailable' })).toEqual({
      at: 'panel',
      reason: 'phoneNeeded',
    })
    expect(toolRefusalOf({ status: 409, code: 'change-pending' }).reason).toBe('changePending')
    // a space's account not set, and a provider the space does not use for its feature (C7)
    expect(toolRefusalOf({ status: 409, code: 'space-account-not-set' })).toEqual({
      at: 'panel',
      reason: 'spaceAccountNotSet',
    })
    expect(toolRefusalOf({ status: 409, code: 'provider-not-used' })).toEqual({
      at: 'panel',
      reason: 'providerNotUsed',
    })
    expect(toolRefusalOf({ status: 404, code: '404' }).reason).toBe('notFound')
  })
})

describe('the confirmation card (UI-CONV-045, UI-CONV-046, PROF-TOOL-007)', () => {
  it('reads the exact action, the pinned fields first, every value whole', () => {
    const card = confirmationOf(CARD)
    expect(card?.action.fields.map((f) => f.label)).toEqual(['Workspace', 'Company', 'Note'])
    expect(card?.action.fields[2].value).toBe('Called Marta: renewal in March,\nquote for 40 seats.')
    expect(card?.action.account).toEqual({ kind: 'space', space: { id: 'spc_sales', title: 'Sales EU' } })
    expect(card?.requester).toBe('Ana Ríos')
    expect(card?.allowForConversation).toBe(true)
    expect(confirmationOf({ ...CARD, kind: 'sensitivity' })).toBeNull()
    expect(confirmationOf({ ...CARD, action: undefined })).toBeNull()
  })

  it('never offers Allow for this conversation on a card asked because of untrusted content', () => {
    const card = confirmationOf({ ...CARD, untrusted: { sources: ['Web search'] }, allowForConversation: true })
    expect(card?.untrusted).toEqual(['Web search'])
    expect(card?.allowForConversation).toBe(false)
  })

  it('names each outcome, and offers Stop allowing only while an allowance lasts', () => {
    const of = (over: object) => confirmationOutcomeOf({ status: 'PENDING', allowanceEnded: false, ...over })
    expect(of({})).toBe('pending')
    expect(of({ status: 'APPROVED' })).toBe('allowed')
    expect(of({ status: 'APPROVED', scope: 'once' })).toBe('allowed')
    expect(of({ status: 'APPROVED', scope: 'conversation' })).toBe('allowedForConversation')
    expect(of({ status: 'APPROVED', scope: 'conversation', allowanceEnded: true })).toBe('allowanceStopped')
    expect(of({ status: 'REJECTED' })).toBe('refused')
    expect(of({ status: 'EXPIRED' })).toBe('expired')
    expect(of({ status: 'CANCELLED' })).toBe('cancelled')
    expect(canStopAllowing({ status: 'APPROVED', scope: 'conversation', allowanceEnded: false })).toBe(true)
    expect(canStopAllowing({ status: 'APPROVED', scope: 'conversation', allowanceEnded: true })).toBe(false)
    expect(canStopAllowing({ status: 'APPROVED', scope: 'once', allowanceEnded: false })).toBe(false)
  })

  it('reads a card whose message was deleted: the title, the source and the account, no field', () => {
    const card = confirmationOf({ ...CARD, status: 'CANCELLED', action: { ...CARD.action, fields: [], erased: true } })
    expect(card?.action.erased).toBe(true)
    expect(card?.action.fields).toEqual([])
    expect(card?.action.title).toBe('Add a note')
  })

  it('sets indented JSON apart, and nothing else', () => {
    expect(looksLikeJson('{\n  "seats": 40\n}')).toBe(true)
    expect(looksLikeJson('[\n  1,\n  2\n]')).toBe(true)
    expect(looksLikeJson('{"seats": 40}')).toBe(false)
    expect(looksLikeJson('{ not json\n  at all')).toBe(false)
    expect(looksLikeJson('Called Marta')).toBe(false)
  })

  it('shows no working indicator while the reply waits on a pending card, its last item', () => {
    const run = { steps: [] as string[] }
    const card = { role: 'activity', activityType: 'ayni.approval', content: CARD }
    expect(awaitsConfirmation([card])).toBe(true)
    expect(progressOf({ run, messages: [card] })).toBeNull()
    expect(progressOf({ run: { steps: ['Reading the CRM'] }, messages: [card] })).toBeNull()
    const decided = { ...card, content: { ...CARD, status: 'APPROVED' } }
    expect(progressOf({ run, messages: [decided] })).toEqual({ kind: 'thinking' })
    // an approval for someone else is no confirmation: the turn does not wait on it here
    expect(awaitsConfirmation([{ ...card, content: { ...CARD, kind: 'sensitivity' } }])).toBe(false)
  })

  it('reads the approval of a tool call, with its space (PROF-TOOL-009)', () => {
    const approval = {
      approvalId: 'apr_2',
      kind: 'sensitivity',
      requester: { displayName: 'Ana Ríos' },
      action: { ...CARD.action, title: 'Post on LinkedIn' },
      space: { id: 'spc_comms', title: 'Communication' },
    }
    expect(toolApprovalOf(approval)?.space).toEqual({ id: 'spc_comms', title: 'Communication' })
    expect(toolApprovalOf(approval)?.action.title).toBe('Post on LinkedIn')
    expect(toolApprovalOf({ ...approval, action: undefined })).toBeNull()
    expect(toolApprovalOf(CARD)).toBeNull()
    expect(requesterNameOf(approval)).toBe('Ana Ríos')
    expect(requesterNameOf(CARD)).toBe('Ana Ríos')
    // `requester` is `{ displayName, role }` (PROF-TOOL-009)
    expect(requesterNameOf({ requester: { name: 'Ana Ríos' } })).toBe('')
  })
})

describe('the sources (PROF-TOOL-010, PROF-TOOL-011)', () => {
  it('reads those a reply used, and none for a reply that used none', () => {
    expect(
      messageSourcesOf([
        { source: 'relaticle', title: 'Relaticle CRM', account: 'space' },
        { source: 'web', title: 'Web search', account: 'agent' },
        { title: 'no source' },
      ])
    ).toEqual([
      { source: 'relaticle', title: 'Relaticle CRM', account: 'space' },
      { source: 'web', title: 'Web search', account: 'agent' },
    ])
    expect(messageSourcesOf(undefined)).toEqual([])
  })

  it('reads those a conversation holds, with whose account and how many results', () => {
    expect(
      conversationSourcesOf({
        sources: [
          {
            source: 'relaticle',
            title: 'Relaticle CRM',
            account: { kind: 'space', space: { id: 'spc_sales', title: 'Sales EU' } },
            results: 3,
            lastAt: 'x',
          },
          { source: 'web', title: 'Web search', account: { kind: 'agent' }, results: 1, lastAt: 'y' },
        ],
      })
    ).toEqual([
      {
        source: 'relaticle',
        title: 'Relaticle CRM',
        account: { kind: 'space', space: { id: 'spc_sales', title: 'Sales EU' } },
        results: 3,
        lastAt: 'x',
      },
      { source: 'web', title: 'Web search', account: { kind: 'agent' }, results: 1, lastAt: 'y' },
    ])
    expect(conversationSourcesOf({ sources: [] })).toEqual([])
  })
})

describe('a source named by the feature it serves (PROF-TOOL-035, UI-CONV-064)', () => {
  const CRM = { id: 'crm', title: 'CRM' }

  it('reads "<feature> · <source>", the name once when the two are the same, the title alone with no feature', () => {
    expect(sourceNameOf({ title: 'Nextcloud', feature: { title: 'Files' } })).toBe('Files · Nextcloud')
    expect(sourceNameOf({ title: 'Relaticle', feature: CRM })).toBe('CRM · Relaticle')
    expect(sourceNameOf({ title: 'X', feature: { title: 'Social posting' } })).toBe('Social posting · X')
    expect(sourceNameOf({ title: 'Web search', feature: { title: 'Web search' } })).toBe('Web search')
    expect(sourceNameOf({ title: 'Relaticle' })).toBe('Relaticle')
    expect(sourceNameOf({ title: 'Relaticle', feature: { title: ' ' } })).toBe('Relaticle')
  })

  it('reads the feature wherever the agent gives a source: a card, a reply, a conversation, a space', () => {
    const action = toolApprovalOf({
      action: { title: 'Add a note', source: { id: 'relaticle', title: 'Relaticle', feature: CRM }, fields: [] },
    })?.action
    expect(action?.source).toEqual({ id: 'relaticle', title: 'Relaticle', feature: CRM })
    expect(messageSourcesOf([{ source: 'relaticle', title: 'Relaticle', feature: CRM, account: 'space' }])).toEqual([
      { source: 'relaticle', title: 'Relaticle', feature: CRM, account: 'space' },
    ])
    expect(
      conversationSourcesOf({
        sources: [{ source: 'relaticle', title: 'Relaticle', feature: CRM, account: { kind: 'agent' }, results: 1 }],
      })[0]?.feature
    ).toEqual(CRM)
    // a space's item is the feature itself, with its profile: `null` for a category (PROF-TOOL-033)
    expect(spaceToolsOf({ tools: [{ ...CRM_OWNER, feature: { ...CRM, profile: null } }] })[0]?.feature).toEqual({
      ...CRM,
      profile: null,
    })
    // a feature with no title names none
    expect(messageSourcesOf([{ source: 'web', title: 'Web search', feature: { id: 'web' } }])[0]).not.toHaveProperty(
      'feature'
    )
  })
})

describe('the addresses outside the organization on a card (PROF-TOOL-007, agent TOOL-FEAT-013, C6)', () => {
  it('reads them from the action, and none when it names none', () => {
    const card = (outsideOrganization?: unknown) =>
      confirmationOf({
        kind: 'confirmation',
        approvalId: 'apr_1',
        action: {
          title: 'Invite to the event',
          source: { id: 'calendar', title: 'Calendar' },
          fields: [],
          ...(outsideOrganization === undefined ? {} : { outsideOrganization }),
        },
      })?.action
    expect(card(['p.lee@partner.example', 'm.ito@other.example'])?.outsideOrganization).toEqual([
      'p.lee@partner.example',
      'm.ito@other.example',
    ])
    expect(card([])).not.toHaveProperty('outsideOrganization')
    expect(card()).not.toHaveProperty('outsideOrganization')
    expect(card(['', 3, 'p.lee@partner.example'])?.outsideOrganization).toEqual(['p.lee@partner.example'])
  })
})

/** Files in Project Alpha as its owner reads it (profile §3.10, agent tests/features.test.ts): two providers. */
const PROVIDERS = [
  {
    source: 'nextcloud',
    title: 'Nextcloud',
    description: "A folder of the organization's Nextcloud, with an account of the space",
    account: { kind: 'space' },
    default: true,
  },
  {
    source: 'drive',
    title: 'Google Drive',
    description: 'The files each person can open in their drive',
    account: { kind: 'personal' },
    default: false,
  },
]
const FILES = { id: 'files', title: 'Files', profile: { id: 'org.ayni/files', version: '1.0' } }
const FILES_AVAILABLE = {
  feature: FILES,
  providers: PROVIDERS,
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
  ...FILES_AVAILABLE,
  source: 'nextcloud',
  title: 'Nextcloud',
  description: "A folder of the organization's Nextcloud, with an account of the space",
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
const read = (value: unknown) => {
  const tool = spaceToolOf(value)
  if (!tool) throw new Error('not a feature')
  return tool
}

describe("a space's tools by feature, each with one provider (package 3.5.8, PROF-TOOL-033, agent D120)", () => {
  it('reads a feature with no provider: the providers its template allows, and nothing of a provider', () => {
    const files = read(FILES_AVAILABLE)
    expect(files.feature).toEqual(FILES)
    expect(files.providers.map((p) => [p.source, p.account.kind, p.default])).toEqual([
      ['nextcloud', 'space', true],
      ['drive', 'personal', false],
    ])
    expect([files.source, files.title, files.description]).toEqual([null, null, ''])
    expect([files.account, files.list, files.bindings, files.tools]).toEqual([null, null, [], []])
    // nothing of a provider is read while none is in use, whatever the value carries
    const odd = read({ ...FILES_AVAILABLE, account: { kind: 'space' }, bindings: [{ name: 'x' }], list: FOLDERS })
    expect([odd.account, odd.list, odd.bindings]).toEqual([null, null, []])
    expect(toolRowStateOf(files)).toBe('notAdded')
    // an item with no feature is not one: the earlier shape, one item per source, is not read
    expect(spaceToolOf({ ...CRM_OWNER, feature: undefined })).toBeNull()
    expect(spaceToolsOf({ tools: [{ source: 'relaticle', title: 'Relaticle CRM', state: 'ready' }] })).toEqual([])
  })

  it('reads a feature with a contract: its profile, conformance, capabilities and location (PROF-TOOL-022)', () => {
    const files = read(FILES_READY)
    expect(files.feature.profile).toEqual({ id: 'org.ayni/files', version: '1.0' })
    expect([files.source, files.conformant, files.capabilities]).toEqual(['nextcloud', true, ['search', 'folders']])
    expect(files.list).toEqual({ ...FOLDERS, typed: false })
    expect(files.tools.map((t) => t.title)).toEqual(['Read a file', "Replace a file's content"])
    // before any connection `conformant` is absent: not a refusal
    const fresh = read({ ...FILES_READY, conformant: undefined })
    expect(fresh).not.toHaveProperty('conformant')
    expect(isConformant(fresh)).toBe(true)
    // a member reads the labels of the list only
    const member = read({
      feature: FILES,
      source: 'nextcloud',
      title: 'Nextcloud',
      state: 'ready',
      guests: false,
      account: { kind: 'space' },
      bindings: [],
      list: { label: 'Folders', any: false, entries: [{ label: '/Projects/Alpha' }] },
      tools: [{ title: 'Read a file', effect: 'read', rule: 'none', stepUp: null }],
    })
    expect(member.list).toEqual({
      label: 'Folders',
      any: false,
      entries: [{ label: '/Projects/Alpha' }],
      anyLabel: '',
      anyAllowed: false,
      choices: false,
      typed: false,
      maxEntries: null,
    })
    expect(member.providers).toEqual([])
    // any location: no entries, its label
    expect(read({ ...FILES_READY, list: { ...FOLDERS, any: true, entries: undefined } }).list?.entries).toEqual([])
  })

  it('reads a provider that does not offer its feature: its words in place of the state, no tool (UI-CONV-065)', () => {
    const files = read({ ...FILES_READY, conformant: false, tools: [] })
    expect(isConformant(files)).toBe(false)
    expect(toolRowStateOf(files)).toBe('notConformant')
    // a change that waits still reads as waiting
    expect(toolRowStateOf({ ...files, pending: { changeId: 'c', summary: '', code: '1', expiresAt: '' } })).toBe(
      'waiting'
    )
  })

  it('chooses a provider: the default suggested, several shown first, one opened at once (UI-CONV-065)', () => {
    const files = read(FILES_AVAILABLE)
    expect(defaultProviderOf(files)?.source).toBe('nextcloud')
    expect(choosesProvider(files)).toBe(true)
    const calendar = read({
      ...FILES_AVAILABLE,
      feature: { id: 'calendar', title: 'Calendar', profile: null },
      providers: [PROVIDERS[0]],
    })
    expect(choosesProvider(calendar)).toBe(false)
    expect(defaultProviderOf(calendar)?.source).toBe('nextcloud')
    // no default said: the first the template allows
    expect(defaultProviderOf({ providers: [{ ...read(FILES_AVAILABLE).providers[1] }] })?.source).toBe('drive')
    expect(defaultProviderOf({ providers: [] })).toBeUndefined()
  })

  it('changes the provider: the others shown, the question named, the request with `replaces` (UI-CONV-066, PROF-TOOL-034)', () => {
    const files = read(FILES_READY)
    expect(canChangeProvider(files)).toBe(true)
    expect(otherProvidersOf(files).map((p) => p.source)).toEqual(['drive'])
    expect(providerChangeOf(files, 'drive')).toEqual({ next: 'Google Drive', feature: 'Files', former: 'Nextcloud' })
    expect(providerChangeOf(files, 'nextcloud')).toBeNull()
    expect(providerChangeOf(files, 'onedrive')).toBeNull()
    expect(providerChangeInputOf(files, 'drive')).toEqual({ source: 'drive', replaces: 'nextcloud' })
    // one provider, or none in use: no Change provider
    expect(canChangeProvider({ ...files, providers: [files.providers[0]] })).toBe(false)
    expect(canChangeProvider(read(FILES_AVAILABLE))).toBe(false)
    expect(providerChangeOf(read(FILES_AVAILABLE), 'drive')).toBeNull()
  })

  it("writes the provider's line: its title, what it is bound to, whose account (UI-CONV-065, UI-CONV-060)", () => {
    expect(providerLineOf(read(FILES_READY))).toEqual({
      provider: 'Nextcloud',
      bindings: [],
      list: { label: 'Folders', values: ['/Projects/Alpha'] },
      account: 'space',
    })
    // a binding by its value, or the name of its value; one with no value binds nothing yet
    const crm = read({
      ...CRM_OWNER,
      bindings: [
        { name: 'workspace', label: 'Workspace', value: '01JD8', valueLabel: 'sales-eu', setBy: 'owner' },
        { name: 'region', label: 'Region', value: null, setBy: 'owner' },
      ],
    })
    expect(providerLineOf(crm)).toEqual({
      provider: 'Relaticle CRM',
      bindings: [{ label: 'Workspace', value: 'sales-eu' }],
      list: null,
      account: 'space',
    })
    // any value of a list reads its label; an account `none` is left out
    const anyList = read({
      ...FILES_READY,
      account: { kind: 'none' },
      list: { ...FOLDERS, any: true, entries: undefined },
    })
    expect(providerLineOf(anyList)).toMatchObject({
      list: { label: 'Folders', values: ['Any folder you can reach'] },
      account: null,
    })
    expect(listLineOf({ label: 'Folders', any: false, entries: [], anyLabel: '' })).toBeNull()
    // no provider: the row reads "Choose a provider"
    expect(providerLineOf(read(FILES_AVAILABLE))).toBeNull()
  })

  it('names what a feature in setup lacks: bindings, then the list with no entry, then the account (UI-CONV-052)', () => {
    const setup = read({
      ...FILES_READY,
      state: 'setup',
      account: { ...FILES_READY.account, set: false },
      list: { ...FOLDERS, entries: [] },
    })
    expect(missingOf(setup)).toEqual({ bindings: [], list: 'Folders', account: true })
    expect(missingPartsOf(setup)).toEqual({ labels: ['Folders'], account: true })
    expect(missingOf(read({ ...FILES_READY, list: { ...FOLDERS, any: true } })).list).toBeNull()
    // no provider: nothing of one is missing
    expect(missingOf(read(FILES_AVAILABLE))).toEqual({ bindings: [], list: null, account: false })
    expect(accountSourceOf(read(FILES_AVAILABLE))).toBe('')
    expect(accountSourceOf(read(FILES_READY))).toBe('nextcloud')
  })

  it('tells which feature an announced change concerns, and the former provider of a change of provider', () => {
    const change = spaceToolsChangeOf({
      spaceId: 'spc_alpha',
      feature: 'files',
      source: 'drive',
      formerSource: 'nextcloud',
      state: 'setup',
      changeId: 'chg_2',
      outcome: 'applied',
    })
    expect(change).toEqual({
      spaceId: 'spc_alpha',
      feature: 'files',
      source: 'drive',
      formerSource: 'nextcloud',
      state: 'setup',
      changeId: 'chg_2',
      outcome: 'applied',
    })
    expect(change && concernsFeature(change, 'spc_alpha', 'files')).toBe(true)
    expect(change && concernsFeature(change, 'spc_alpha', 'calendar')).toBe(false)
    expect(change && concernsFeature(change, 'spc_beta', 'files')).toBe(false)
    expect(readyToolsOf([read(FILES_AVAILABLE), read(FILES_READY)]).map((t) => t.feature.id)).toEqual(['files'])
  })
})

describe('the list of a location and its choices (UI-CONV-059, PROF-TOOL-022, PROF-TOOL-023)', () => {
  const folders = read(FILES_READY).list
  if (!folders) throw new Error('no list')
  const beta = { values: { root: '48214' }, label: '/Projects/Beta' }

  it('makes a form of the list in force, adds a choice, removes an entry, and sends it whole', () => {
    const form = listFormOf(folders)
    expect(form).toEqual({ any: false, entries: [{ values: { root: '48213' }, label: '/Projects/Alpha' }] })
    expect(listChanged(form, folders)).toBe(false)
    const added = withListEntry(form, beta, folders)
    expect(added.entries.map((e) => e.label)).toEqual(['/Projects/Alpha', '/Projects/Beta'])
    expect(listChanged(added, folders)).toBe(true)
    expect(listInputOf(added)).toEqual({ entries: [{ root: '48213' }, { root: '48214' }] })
    // a choice in the list changes nothing, and reads "In the list"
    expect(choiceInList(added, beta)).toBe(true)
    expect(withListEntry(added, beta, folders)).toBe(added)
    const removed = withoutListEntry(added, 0)
    expect(removed.entries.map((e) => e.label)).toEqual(['/Projects/Beta'])
    expect(listInputOf({ any: true, entries: [] })).toEqual({ any: true })
    expect(listChanged({ any: true, entries: [] }, folders)).toBe(true)
  })

  it('removes the entries a wider one covers, and adds nothing beyond `maxEntries`', () => {
    expect(entryCovers({ owner: '2060-io' }, { owner: '2060-io', repo: 'ayni-agent' })).toBe(true)
    expect(entryCovers({ owner: '2060-io', repo: 'ayni-agent' }, { owner: '2060-io' })).toBe(false)
    expect(entryCovers({ owner: 'verana-labs' }, { owner: '2060-io', repo: 'ayni-agent' })).toBe(false)
    const repos = { maxEntries: 2 }
    const form = {
      any: false,
      entries: [{ values: { owner: '2060-io', repo: 'ayni-agent-test-repo' }, label: '2060-io/ayni-agent-test-repo' }],
    }
    const wider = withListEntry(form, { values: { owner: '2060-io' }, label: 'All of 2060-io' }, repos)
    expect(wider.entries.map((e) => e.label)).toEqual(['All of 2060-io'])
    const full = withListEntry(wider, { values: { owner: 'verana-labs' }, label: 'All of verana-labs' }, repos)
    expect(listIsFull(full, repos)).toBe(true)
    expect(withListEntry(full, { values: { owner: 'other' }, label: 'All of other' }, repos)).toBe(full)
    expect(listIsFull(full, { maxEntries: null })).toBe(false)
  })

  it('reads the choices: each once, at most fifty, with their values and label', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ values: { root: String(i) }, label: `/F${i}` }))
    expect(listChoicesOf({ choices: many })).toHaveLength(LIST_CHOICES_MAX)
    expect(
      listChoicesOf({
        choices: [
          { values: { root: '48213' }, label: '/Projects/Alpha' },
          { values: { root: '48213' }, label: '/Projects/Alpha again' },
          { values: {}, label: 'none' },
          { label: 'no values' },
          { values: { root: '48214' } },
          'junk',
          { values: { root: '48214', n: 3 }, label: '/Projects/Beta' },
        ],
      })
    ).toEqual([
      { values: { root: '48213' }, label: '/Projects/Alpha' },
      { values: { root: '48214' }, label: '/Projects/Beta' },
    ])
    expect(listChoicesOf(undefined)).toEqual([])
  })

  it('asks a search only for a text, trimmed and at most 100 characters', () => {
    expect(choicesTextOf('  /Proj ')).toBe('/Proj')
    expect(choicesTextOf('   ')).toBeNull()
    expect(choicesTextOf('x'.repeat(150))).toHaveLength(CHOICES_TEXT_MAX)
  })

  it('says why a search answered nothing', () => {
    expect(choicesRefusalOf({ status: 409, code: 'not-connected' })).toBe('notConnected')
    expect(choicesRefusalOf({ status: 409, code: 'space-account-not-set' })).toBe('spaceAccountNotSet')
    expect(choicesRefusalOf({ status: 502, code: 'source-unavailable' })).toBe('unavailable')
    expect(choicesRefusalOf({ status: 502, code: '502' })).toBe('unavailable')
    expect(choicesRefusalOf({ status: 403, code: 'not-owner' })).toBe('notOwner')
    expect(choicesRefusalOf({ status: 404, code: '404' })).toBe('notFound')
    expect(choicesRefusalOf({ status: 400, code: 'bad-request' })).toBe('other')
  })

  it("puts a refusal of the list at the entry, under Add, or at the choice of any; another provider's under the control", () => {
    expect(toolRefusalOf({ status: 422, code: 'bad-binding', field: 'list.entries.0.root' })).toEqual({
      at: 'entry',
      index: 0,
      reason: 'badBinding',
    })
    expect(toolRefusalOf({ status: 422, code: 'repeated-entry', field: 'list.entries.2' })).toEqual({
      at: 'entry',
      index: 2,
      reason: 'repeatedEntry',
    })
    expect(toolRefusalOf({ status: 422, code: 'not-portable', field: 'list.entries.1.root' })).toEqual({
      at: 'entry',
      index: 1,
      reason: 'notPortable',
    })
    expect(toolRefusalOf({ status: 422, code: 'too-many-entries', field: 'list.entries' })).toEqual({
      at: 'entries',
      reason: 'tooManyEntries',
    })
    expect(toolRefusalOf({ status: 422, code: 'any-not-allowed', field: 'list.any' })).toEqual({
      at: 'any',
      reason: 'anyNotAllowed',
    })
    expect(toolRefusalOf({ status: 409, code: 'feature-has-provider' })).toEqual({
      at: 'panel',
      reason: 'featureHasProvider',
    })
    // a binding's refusal is the binding's still
    expect(toolRefusalOf({ status: 422, code: 'bad-binding', field: 'bindings.workspace' })).toMatchObject({
      at: 'binding',
    })
  })
})
