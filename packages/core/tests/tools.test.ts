/**
 * Tools, phase 1 in the core (profile 3.4: §3.10, §6, §8; UI-CONV-045..051, UI-APPR-006): the answers read as the
 * profile gives them, the rules a screen follows for a space's tools, and what a confirmation card shows.
 */
import { describe, expect, it } from 'vitest'
import { progressOf } from '../src/conversationDesign.js'
import {
  accountValueFits,
  accountValueOf,
  accountValuesOf,
  awaitsConfirmation,
  bindingValueFits,
  canAdd,
  canStopAllowing,
  changeOutcomeKeyOf,
  confirmationOf,
  confirmationOutcomeOf,
  conversationSourcesOf,
  isAdded,
  looksLikeJson,
  loosens,
  messageSourcesOf,
  missingOf,
  readyToolsOf,
  requesterNameOf,
  ruleChoicesFor,
  ruleGroupsOf,
  sourceNameOf,
  spaceToolsChangeOf,
  spaceToolsOf,
  TOKEN_MAX_LENGTH,
  takesTools,
  timeLeftOf,
  toolApprovalOf,
  toolRefusalOf,
  toolRowStateOf,
} from '../src/tools.js'

/** The CRM of Sales EU as its owner reads it (profile §3.10). */
const CRM_OWNER = {
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
    expect(crm.state).toBe('ready')
    expect(crm.add).toBe('auto')
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
    expect(crm.tools[0]).toEqual({ title: 'Add a note', effect: 'write', rule: 'confirm', stepUp: null })
    // a member's answer names the kind only: no field, no state of the account
    expect(crm.account).toEqual({ kind: 'space', fields: [], set: false, setAt: null, setBy: null })
    expect(spaceToolsOf({ tools: [] })).toEqual([])
    expect(spaceToolsOf(undefined)).toEqual([])
  })

  it("reads one field per value of a space's account, in the agent's order (PROF-TOOL-001)", () => {
    const [x] = spaceToolsOf({ tools: [{ ...CRM_OWNER, source: 'x', title: 'X', account: X_ACCOUNT }] })
    expect(x.account.fields).toEqual(X_ACCOUNT.fields)
    expect(x.account.set).toBe(false)
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
    expect(odd.account.fields).toEqual([{ name: 'token', label: 'token' }])
    // the old single label and pattern are not read: the fields are
    const [old] = spaceToolsOf({ tools: [{ ...CRM_OWNER, account: { kind: 'space', label: 'API token' } }] })
    expect(old.account.fields).toEqual([])
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

  it('reads `ayni.space.tools.changed`', () => {
    expect(
      spaceToolsChangeOf({ spaceId: 's', source: 'relaticle', state: 'ready', changeId: 'chg_1', outcome: 'applied' })
    ).toEqual({ spaceId: 's', source: 'relaticle', state: 'ready', changeId: 'chg_1', outcome: 'applied' })
    expect(
      spaceToolsChangeOf({ spaceId: 's', source: 'x', state: 'ready', outcome: 'applied' })?.changeId
    ).toBeUndefined()
    expect(spaceToolsChangeOf({ spaceId: 's', source: 'x', outcome: 'nope' })).toBeNull()
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
    expect(missingOf({ ...setup, account: { ...crm.account, set: false } })).toEqual({
      bindings: ['Workspace'],
      account: true,
    })
    expect(missingOf(crm)).toEqual({ bindings: [], account: false })
    expect(missingOf({ ...crm, account: { kind: 'agent' } })).toEqual({ bindings: [], account: false })
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
    expect(spaceToolsOf({ tools: [{ ...CRM_OWNER, feature: { ...CRM, profile: null } }] })[0]?.feature).toEqual(CRM)
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
