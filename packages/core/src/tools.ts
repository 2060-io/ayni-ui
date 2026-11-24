/**
 * Tools, phase 1 (AG-UI profile 3.4: §3.10, §6, §8, PROF-TOOL-001..013, PROF-DESC-009, PROF-SESS-016; agent D96 to
 * D100; UI-CONV-045..052, UI-APPR-006). A space's tools as its members read them and its owner manages them, a change
 * that grants something confirmed on the owner's phone; the confirmation card of a tool call and the exact action on
 * the approval of one; the sources a reply used and those a conversation holds. The wire types are written here until
 * the profile package of 3.4 is the one every client has; the rules a screen follows are here too, so that the
 * browser and the Ayni app apply the same ones. Phase 2 (profile 3.5, PROF-TOOL-021; agent D104, D110) adds the kind
 * of account `personal` to these shapes, and the binding of a space set from an account of its owner; each person's
 * own accounts are in `connections.ts`.
 */
import type { Transcript, TranscriptMessage } from './types.js'

/** The live event of a change of a space's tools that applied or was dropped (PROF-TOOL-006). */
export const SPACE_TOOLS_CHANGED = 'ayni.space.tools.changed'
/** The kind of an `ayni.approval` activity that is the person's confirmation of a tool call (PROF-TOOL-007). */
export const CONFIRMATION = 'confirmation'
/** Whose account a source's calls run with; `personal`: the account of the person who asks (3.5, agent D104). */
export type ToolAccountKind = 'none' | 'agent' | 'space' | 'personal'
export type ToolEffect = 'read' | 'write' | 'delete' | 'external'
/** What a call needs before it runs; `off`: the tool is not given to the model in this space (agent D99, D98). */
export type ToolRule = 'none' | 'confirm' | 'approval' | 'off'
export type ToolStepUp = 'device' | 'face-match' | 'document'
export type SpaceToolState = 'available' | 'setup' | 'ready' | 'off'

/**
 * One value of a space's account, as its owner's answer declares it (PROF-TOOL-001): one masked field each, labelled by
 * `label`, the value checked against `pattern` before it is sent. Every field is a secret.
 */
export interface SpaceToolAccountField {
  name: string
  label: string
  pattern?: string
}

/**
 * Whose account a source's calls run with; for a space's account, the fields its owner fills in (one per value, in
 * the order to show; none in a member's answer) and whether it is set, when and by whom, never a value; for each
 * person's own (`personal`), whether the reader's own account of it, for this space, is connected (PROF-TOOL-021).
 */
export interface SpaceToolAccount {
  kind: ToolAccountKind
  fields?: SpaceToolAccountField[]
  set?: boolean
  setAt?: string | null
  setBy?: { name: string } | null
  /** `personal` only: the reader's own account is connected for this space */
  connected?: boolean
  /**
   * `personal` only, when the tool uses another source's account (`account.from`, such as `github-project` using
   * `github`): the source Your accounts lists for it (§3.10), the row a Connect from the space's tools opens
   */
  source?: string
}

/** One of the owner's own accounts of a source, a value the binding it is for may take (PROF-TOOL-021, agent D110). */
export interface SpaceToolBindingChoice {
  value: string
  valueLabel: string
}

/** A parameter of a source the agent pins, set by the agent-pack or by the space's owner (agent D98). */
export interface SpaceToolBinding {
  /** absent in a member's answer */
  name: string
  label: string
  value: string | null
  setBy: 'pack' | 'owner'
  pattern?: string
  /** the name of the value, for the binding a personal account is for (agent D110) */
  valueLabel?: string
  /**
   * the owner's answer only: the binding is chosen from the owner's own accounts of the source, never typed
   * (PROF-TOOL-021), one of `choices`; none when the owner holds no account of it yet
   */
  fromAccount?: boolean
  choices?: SpaceToolBindingChoice[]
}

/** One tool of a source; `name` and `packRule` only in the owner's answer (PROF-TOOL-001, PROF-TOOL-013). */
export interface SpaceToolItem {
  name?: string
  title: string
  effect: ToolEffect
  rule: ToolRule
  packRule?: ToolRule
  stepUp: ToolStepUp | null
}

/** The change that waits for the owner's phone (§3.10). */
export interface PendingToolChange {
  changeId: string
  summary: string
  code: string
  expiresAt: string
}

/** The feature a source serves, as the agent gives it with the source (PROF-TOOL-035): its id and its title. */
export interface FeatureRef {
  id: string
  title: string
}

/** A source a space's template names, in that space (`SpaceTool`, §3.10). */
export interface SpaceTool {
  source: string
  title: string
  /** the feature the source serves (PROF-TOOL-033, PROF-TOOL-035), when the agent gives it */
  feature?: FeatureRef
  description: string
  state: SpaceToolState
  /** the owner's answer only */
  add?: 'auto' | 'owner'
  guests: boolean
  account: SpaceToolAccount
  bindings: SpaceToolBinding[]
  tools: SpaceToolItem[]
  pending: PendingToolChange | null
}

/** How the agent answered a change of a space's tools: applied at once (`200`) or waiting for the phone (`202`). */
export interface SpaceToolAnswer {
  status: 200 | 202
  tool: SpaceTool
}

/** `ayni.space.tools.changed` (PROF-TOOL-006). */
export interface SpaceToolsChange {
  spaceId: string
  source: string
  state: SpaceToolState
  /** absent for a change that applied at once */
  changeId?: string
  outcome: 'applied' | 'declined' | 'expired' | 'failed' | 'cancelled'
}

/** A field of the exact action: an argument the tool will receive, whole, as text (PROF-TOOL-007). */
export interface ToolActionField {
  label: string
  value: string
  pinned: boolean
}

/** The exact action a confirmation or the approval of a tool call shows (PROF-TOOL-007, PROF-TOOL-009). */
export interface ToolAction {
  title: string
  /** the source, with the feature it serves when the agent gives it (PROF-TOOL-035) */
  source: { id: string; title: string; feature?: FeatureRef }
  /**
   * the space for `space`; for `personal`, `label` (the account's name at its service) on the card of the person
   * whose account it is, and on no other card (PROF-TOOL-021)
   */
  account: { kind: ToolAccountKind; space?: { id: string; title: string }; label?: string }
  /**
   * the addresses outside the organization the call would reach, when the agent took it as `external` for them
   * (`action.outsideOrganization`, PROF-TOOL-007, agent TOOL-FEAT-013); absent when there is none
   */
  outsideOrganization?: string[]
  fields: ToolActionField[]
  /** the message whose turn asked for it was deleted: the fields are gone (INTX-APPR-015) */
  erased: boolean
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'

/** The confirmation card of a tool call: an `ayni.approval` activity of kind `confirmation` (PROF-TOOL-007). */
export interface ToolConfirmation {
  approvalId: string
  status: ApprovalStatus
  expiresAt?: string
  requester?: string
  action: ToolAction
  /** the untrusted sources the turn read, when they are why the card was asked (agent TOOL-CALL-008) */
  untrusted?: string[]
  allowForConversation: boolean
  scope?: 'once' | 'conversation'
  allowanceEnded: boolean
}

/** A source a reply used, from history's `metadata.sources` (PROF-TOOL-010). */
export interface MessageSource {
  source: string
  title: string
  feature?: FeatureRef
  account: ToolAccountKind
}

/** A source of the tool results a conversation holds (`GET /conversations/{id}/sources`, PROF-TOOL-011). */
export interface ConversationSource {
  source: string
  title: string
  feature?: FeatureRef
  account: { kind: ToolAccountKind; space?: { id: string; title: string } }
  results: number
  lastAt: string
}

// ---------------------------------------------------------------------------------------------------- reading

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])

const RULES: readonly ToolRule[] = ['none', 'confirm', 'approval', 'off']
const EFFECTS: readonly ToolEffect[] = ['read', 'write', 'delete', 'external']
const STEP_UPS: readonly ToolStepUp[] = ['device', 'face-match', 'document']
const STATES: readonly SpaceToolState[] = ['available', 'setup', 'ready', 'off']

const ruleOf = (v: unknown, fallback: ToolRule): ToolRule =>
  RULES.includes(v as ToolRule) ? (v as ToolRule) : fallback
const accountKindOf = (v: unknown): ToolAccountKind => (v === 'agent' || v === 'space' || v === 'personal' ? v : 'none')
const spaceRefOf = (v: unknown): { id: string; title: string } | undefined => {
  const s = obj(v)
  return typeof s.id === 'string' ? { id: s.id, title: str(s.title) } : undefined
}

/** The feature a source serves (PROF-TOOL-035); none for a value with no title, which names no feature. */
export function featureRefOf(v: unknown): FeatureRef | undefined {
  const f = obj(v)
  return typeof f.title === 'string' && f.title ? { id: str(f.id), title: f.title } : undefined
}
const withFeature = (v: unknown): { feature?: FeatureRef } => {
  const feature = featureRefOf(v)
  return feature ? { feature } : {}
}

/**
 * How a source is named to a person (UI-CONV-064, PROF-TOOL-035, C1): one rule for every source, the title of the
 * feature it serves, " · " and its own title ("Files · Nextcloud", "CRM · Relaticle", "Social posting · X"), and its
 * title alone when the two are the same ("Web search") or when the agent gave no feature.
 */
export function sourceNameOf(source: { title: string; feature?: { title: string } | null }): string {
  const feature = source.feature?.title.trim()
  return feature && feature !== source.title.trim() ? `${feature} · ${source.title}` : source.title
}

/** The fields of a space's account, in the agent's order; one with no name, or a name said twice, is not shown. */
function accountFieldsOf(value: unknown): SpaceToolAccountField[] {
  const seen = new Set<string>()
  const fields: SpaceToolAccountField[] = []
  for (const f of list(value)) {
    if (typeof f.name !== 'string' || !f.name || seen.has(f.name)) continue
    seen.add(f.name)
    fields.push({
      name: f.name,
      label: str(f.label, f.name),
      ...(typeof f.pattern === 'string' ? { pattern: f.pattern } : {}),
    })
  }
  return fields
}

/** A space's tool as the agent gives it, with what is missing filled in; null for one with no source. */
export function spaceToolOf(value: unknown): SpaceTool | null {
  const t = obj(value)
  if (typeof t.source !== 'string' || !t.source) return null
  const account = obj(t.account)
  const kind = accountKindOf(account.kind)
  const setBy = obj(account.setBy)
  const pending = obj(t.pending)
  return {
    source: t.source,
    title: str(t.title, t.source),
    ...withFeature(t.feature),
    description: str(t.description),
    state: STATES.includes(t.state as SpaceToolState) ? (t.state as SpaceToolState) : 'ready',
    ...(t.add === 'auto' || t.add === 'owner' ? { add: t.add } : {}),
    guests: t.guests === true,
    account: {
      kind,
      ...(kind === 'space'
        ? {
            fields: accountFieldsOf(account.fields),
            set: account.set === true,
            setAt: typeof account.setAt === 'string' ? account.setAt : null,
            setBy: typeof setBy.name === 'string' ? { name: setBy.name } : null,
          }
        : {}),
      ...(kind === 'personal'
        ? {
            connected: account.connected === true,
            ...(typeof account.source === 'string' && account.source ? { source: account.source } : {}),
          }
        : {}),
    },
    bindings: list(t.bindings).map((b) => ({
      name: str(b.name, str(b.label)),
      label: str(b.label, str(b.name)),
      value: typeof b.value === 'string' ? b.value : null,
      setBy: b.setBy === 'pack' ? 'pack' : 'owner',
      ...(typeof b.pattern === 'string' ? { pattern: b.pattern } : {}),
      ...(typeof b.valueLabel === 'string' ? { valueLabel: b.valueLabel } : {}),
      ...(b.fromAccount === true
        ? {
            fromAccount: true,
            choices: list(b.choices)
              .filter((c) => typeof c.value === 'string' && c.value)
              .map((c) => ({ value: c.value as string, valueLabel: str(c.valueLabel, c.value as string) })),
          }
        : {}),
    })),
    tools: list(t.tools)
      .filter((x) => typeof x.title === 'string' || typeof x.name === 'string')
      .map((x) => ({
        ...(typeof x.name === 'string' ? { name: x.name } : {}),
        title: str(x.title, str(x.name)),
        // a tool with no effect said is taken as the strictest default (agent §10.6)
        effect: EFFECTS.includes(x.effect as ToolEffect) ? (x.effect as ToolEffect) : 'delete',
        rule: ruleOf(x.rule, 'approval'),
        ...(x.packRule !== undefined ? { packRule: ruleOf(x.packRule, 'approval') } : {}),
        stepUp: STEP_UPS.includes(x.stepUp as ToolStepUp) ? (x.stepUp as ToolStepUp) : null,
      })),
    pending:
      typeof pending.changeId === 'string'
        ? {
            changeId: pending.changeId,
            summary: str(pending.summary),
            code: str(pending.code),
            expiresAt: str(pending.expiresAt),
          }
        : null,
  }
}

/** `GET {sessions}/spaces/{id}/tools` (PROF-TOOL-001): the sources in the agent's order. */
export function spaceToolsOf(body: unknown): SpaceTool[] {
  return list(obj(body).tools)
    .map(spaceToolOf)
    .filter((t): t is SpaceTool => !!t)
}

/** What `ayni.space.tools.changed` says; null for a value that is not one. */
export function spaceToolsChangeOf(value: unknown): SpaceToolsChange | null {
  const v = obj(value)
  if (typeof v.spaceId !== 'string' || typeof v.source !== 'string') return null
  const outcomes = ['applied', 'declined', 'expired', 'failed', 'cancelled'] as const
  const outcome = outcomes.find((o) => o === v.outcome)
  if (!outcome) return null
  return {
    spaceId: v.spaceId,
    source: v.source,
    state: STATES.includes(v.state as SpaceToolState) ? (v.state as SpaceToolState) : 'ready',
    ...(typeof v.changeId === 'string' ? { changeId: v.changeId } : {}),
    outcome,
  }
}

/** The sources of a conversation's tool results (PROF-TOOL-011). */
export function conversationSourcesOf(body: unknown): ConversationSource[] {
  return list(obj(body).sources)
    .filter((s) => typeof s.source === 'string')
    .map((s) => {
      const account = obj(s.account)
      const kind = accountKindOf(account.kind)
      const space = spaceRefOf(account.space)
      return {
        source: s.source as string,
        title: str(s.title, s.source as string),
        ...withFeature(s.feature),
        account: { kind, ...(kind === 'space' && space ? { space } : {}) },
        results: typeof s.results === 'number' && Number.isFinite(s.results) ? s.results : 0,
        lastAt: str(s.lastAt),
      }
    })
}

/** The sources a reply used, as history gives them (PROF-TOOL-010); an empty list for a reply that used none. */
export function messageSourcesOf(value: unknown): MessageSource[] {
  return list(value)
    .filter((s) => typeof s.source === 'string')
    .map((s) => ({
      source: s.source as string,
      title: str(s.title, s.source as string),
      ...withFeature(s.feature),
      account: accountKindOf(s.account),
    }))
}

/** Whether the agent serves the tools of profile 3.4 (PROF-DESC-009): without it, no Tools and no sources asked. */
export function takesTools(features: object | null | undefined): boolean {
  // read loosely: the descriptor's type gains the field with the profile package that declares it
  return (features as { tools?: unknown } | null | undefined)?.tools === true
}

// ---------------------------------------------------------------------------------------------------- a space's tools

/** How strict a rule is: `none` < `confirm` < `approval` < `off`. */
export function strictnessOf(rule: ToolRule): number {
  return RULES.indexOf(rule)
}

/**
 * The rules the owner may choose for a tool (UI-CONV-050): none looser than the agent-pack's, `off` included, and
 * the one in force always among them.
 */
export function ruleChoicesFor(tool: Pick<SpaceToolItem, 'rule' | 'packRule'>): ToolRule[] {
  const floor = strictnessOf(tool.packRule ?? tool.rule)
  const choices = RULES.filter((r) => strictnessOf(r) >= floor)
  return choices.includes(tool.rule) ? choices : [tool.rule, ...choices]
}

/** Whether a rule chosen grants something over the one in force, and so waits for the owner's phone (agent D98). */
export function loosens(next: ToolRule, current: ToolRule): boolean {
  return strictnessOf(next) < strictnessOf(current)
}

/**
 * The source of Your accounts a space's tool of each person's own account is connected under (§3.10, PROF-TOOL-021):
 * the one its account names when it uses another source's account (`account.from`), else its own. A Connect from the
 * space's tools opens, or signs in to, that row.
 */
export function accountSourceOf(tool: Pick<SpaceTool, 'source' | 'account'>): string {
  return tool.account.kind === 'personal' ? (tool.account.source ?? tool.source) : tool.source
}

/** Whether the source is in the space: added, ready or still missing something. */
export function isAdded(tool: Pick<SpaceTool, 'state'>): boolean {
  return tool.state === 'setup' || tool.state === 'ready'
}

/** Whether the owner may add the source: offered and not added, or an automatic one switched off. */
export function canAdd(tool: Pick<SpaceTool, 'state'>): boolean {
  return tool.state === 'available' || tool.state === 'off'
}

/** What a source in `setup` still lacks (UI-CONV-050): the labels of its bindings with no value, and its account. */
export function missingOf(tool: Pick<SpaceTool, 'bindings' | 'account'>): { bindings: string[]; account: boolean } {
  return {
    bindings: tool.bindings.filter((b) => b.value === null || b.value === '').map((b) => b.label),
    account: tool.account.kind === 'space' && tool.account.set !== true,
  }
}

/** The state of a source's row in the owner's Tools segment (UI-CONV-050). */
export type ToolRowState = 'notAdded' | 'needsSetup' | 'ready' | 'off' | 'waiting'

export function toolRowStateOf(tool: Pick<SpaceTool, 'state' | 'pending'>): ToolRowState {
  if (tool.pending) return 'waiting'
  return tool.state === 'available'
    ? 'notAdded'
    : tool.state === 'setup'
      ? 'needsSetup'
      : tool.state === 'off'
        ? 'off'
        : 'ready'
}

/** Whether a value fits a binding (UI-CONV-050): not empty, and matching its pattern when it has one. */
export function bindingValueFits(binding: Pick<SpaceToolBinding, 'pattern'>, value: string): boolean {
  if (!value) return false
  if (!binding.pattern) return true
  try {
    return new RegExp(binding.pattern).test(value)
  } catch {
    // a pattern this client cannot read is the agent's to check
    return true
  }
}

/** The longest value of a space's account the agent takes (PROF-TOOL-004). */
export const TOKEN_MAX_LENGTH = 4096

/**
 * A value of a space's account as it is checked and sent: without the spaces and line breaks a paste brings at either
 * end (PROF-TOOL-004).
 */
export function accountValueOf(typed: string): string {
  return typed.trim()
}

/**
 * Whether a value of a space's account may be sent (PROF-TOOL-004), once trimmed: not empty, not too long, with no
 * space or line break inside it, and matching its field's pattern.
 */
export function accountValueFits(field: Pick<SpaceToolAccountField, 'pattern'>, value: string): boolean {
  if (!value || value.length > TOKEN_MAX_LENGTH || /\s/.test(value)) return false
  return bindingValueFits({ pattern: field.pattern }, value)
}

/**
 * The values of a space's account to send (`PUT …/account` with `{ values }`, PROF-TOOL-004): every declared field,
 * trimmed; `refused` names, in the fields' order, those whose value does not fit, and then nothing may be sent.
 */
export function accountValuesOf(
  fields: readonly SpaceToolAccountField[],
  typed: Readonly<Record<string, string | undefined>>
): { values: Record<string, string>; refused: string[] } {
  const values: Record<string, string> = {}
  const refused: string[] = []
  for (const field of fields) {
    const value = accountValueOf(typed[field.name] ?? '')
    if (accountValueFits(field, value)) values[field.name] = value
    else refused.push(field.name)
  }
  return { values: refused.length ? {} : values, refused }
}

/** One group of a source's tools in About (UI-CONV-049): the tools of one rule and one step-up, by their titles. */
export interface ToolRuleGroup {
  rule: Exclude<ToolRule, 'off'>
  /** in the agent's order, each with its step-up, which is named after its title, never after the rule's words */
  tools: { title: string; stepUp: ToolStepUp | null }[]
}

/**
 * A source's tools in About, grouped by rule (UI-CONV-049): the loosest rule first, each group's tools in the agent's
 * order, each with its own step-up; a tool whose rule is `off` is not shown.
 */
export function ruleGroupsOf(tool: Pick<SpaceTool, 'tools'>): ToolRuleGroup[] {
  const groups: ToolRuleGroup[] = []
  for (const item of tool.tools) {
    if (item.rule === 'off') continue
    const rule = item.rule
    let group = groups.find((g) => g.rule === rule)
    if (!group) {
      group = { rule, tools: [] }
      groups.push(group)
    }
    group.tools.push({ title: item.title, stepUp: item.stepUp })
  }
  return groups.sort((a, b) => strictnessOf(a.rule) - strictnessOf(b.rule))
}

/** The tools a space's About shows (UI-CONV-031): its `ready` sources only. */
export function readyToolsOf(tools: readonly SpaceTool[]): SpaceTool[] {
  return tools.filter((t) => t.state === 'ready')
}

/**
 * The time left before a pending change or an approval expires (UI-CONV-052): `m:ss` under one hour, counted down
 * every second ("59:59"), and hours and two-digit minutes from one hour, counted down every minute ("23 h 59 min",
 * "1 h 00 min"); never below `0:00`.
 */
export function timeLeftOf(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0
  if (seconds >= 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
  }
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** What the owner is told of a change once it applied or was dropped (UI-CONV-050, UI-CONV-052). */
export function changeOutcomeKeyOf(
  outcome: SpaceToolsChange['outcome']
): 'saved' | 'declined' | 'expired' | 'withdrawn' {
  return outcome === 'applied'
    ? 'saved'
    : outcome === 'declined' || outcome === 'failed'
      ? 'declined'
      : outcome === 'expired'
        ? 'expired'
        : 'withdrawn'
}

/** Where a refusal of a change of a space's tools is shown (UI-CONV-050): at the field it names, or for the panel. */
export function toolRefusalOf(
  error: { status?: number; code?: string; field?: string } | undefined
): /** `notYourAccount`: the value of a binding a personal account is for is not one of the owner's accounts (3.5) */
  | { at: 'binding'; name: string; reason: 'badBinding' | 'pinnedByPack' | 'notYourAccount' }
  | { at: 'rule'; name: string; reason: 'looserThanPack' }
  /**
   * a value of the space's account (`account.<name>`): `field` the one named, null when none is; `fieldsChanged` when
   * the agent named a field it does not declare, or one it misses (a `400`)
   */
  | { at: 'account'; field: string | null; reason: 'badToken' | 'fieldsChanged' }
  | {
      at: 'panel'
      reason:
        | 'phoneNeeded'
        | 'changePending'
        | 'notAdded'
        | 'alreadyAdded'
        | 'notOwner'
        | 'noSpaceAccount'
        | 'spaceAccountNotSet'
        | 'providerNotUsed'
        | 'personalSpace'
        | 'notFound'
        | 'other'
    } {
  const code = error?.code
  const field = error?.field ?? ''
  const named = field.replace(/^(bindings|calls)\./, '')
  if (code === 'bad-binding' || code === 'pinned-by-pack')
    return { at: 'binding', name: named, reason: code === 'bad-binding' ? 'badBinding' : 'pinnedByPack' }
  if (code === 'not-your-account') return { at: 'binding', name: named, reason: 'notYourAccount' }
  if (code === 'looser-than-pack') return { at: 'rule', name: named, reason: 'looserThanPack' }
  const accountField = field.startsWith('account.') ? field.slice('account.'.length) : null
  if (code === 'bad-token') return { at: 'account', field: accountField, reason: 'badToken' }
  if (error?.status === 400 && accountField !== null)
    return { at: 'account', field: accountField, reason: 'fieldsChanged' }
  const reason =
    code === 'confirmation-unavailable'
      ? 'phoneNeeded'
      : code === 'change-pending'
        ? 'changePending'
        : code === 'not-added'
          ? 'notAdded'
          : code === 'already-added'
            ? 'alreadyAdded'
            : code === 'not-owner'
              ? 'notOwner'
              : code === 'no-space-account'
                ? 'noSpaceAccount'
                : code === 'space-account-not-set'
                  ? 'spaceAccountNotSet'
                  : code === 'provider-not-used'
                    ? 'providerNotUsed'
                    : code === 'personal-space'
                      ? 'personalSpace'
                      : error?.status === 404
                        ? 'notFound'
                        : 'other'
  return { at: 'panel', reason }
}

// ---------------------------------------------------------------------------------------------------- the cards

/** The exact action a card shows (PROF-TOOL-007); null when the value carries none. */
export function toolActionOf(value: unknown): ToolAction | null {
  const a = obj(value)
  if (typeof a.title !== 'string') return null
  const source = obj(a.source)
  const account = obj(a.account)
  const kind = accountKindOf(account.kind)
  const space = spaceRefOf(account.space)
  const fields = list(a.fields)
    .filter((f) => typeof f.label === 'string')
    .map((f) => ({
      label: f.label as string,
      // every value whole, as text: one the agent gave in another type is written as it is
      value: typeof f.value === 'string' ? f.value : f.value === undefined ? '' : JSON.stringify(f.value, null, 2),
      pinned: f.pinned === true,
    }))
  const outside = Array.isArray(a.outsideOrganization)
    ? a.outsideOrganization.filter((x): x is string => typeof x === 'string' && x !== '')
    : []
  return {
    title: a.title,
    source: { id: str(source.id), title: str(source.title, str(source.id)), ...withFeature(source.feature) },
    account: {
      kind,
      ...(kind === 'space' && space ? { space } : {}),
      ...(kind === 'personal' && typeof account.label === 'string' && account.label ? { label: account.label } : {}),
    },
    ...(outside.length ? { outsideOrganization: outside } : {}),
    fields: fieldsInOrder(fields),
    erased: a.erased === true,
  }
}

/** The fields of an action, the pinned ones first, each group in the agent's order (PROF-TOOL-007). */
export function fieldsInOrder<T extends { pinned: boolean }>(fields: readonly T[]): T[] {
  return [...fields.filter((f) => f.pinned), ...fields.filter((f) => !f.pinned)]
}

/**
 * The account line of an exact action (UI-CONV-045, UI-APPR-006, UI-CONV-058), as a key of `tools.card` and what it
 * puts in: the space's, the agent's; for `personal`, "With your account <label>" on the card of the person whose
 * account it is (the only card that carries `label`), "With <requester>'s own account" on an approver's, "With your
 * own account" on the person's own card with no label; nothing for `none`.
 */
export function accountLineOf(
  account: ToolAction['account'],
  viewer: 'own' | 'approver'
):
  | { key: 'accountSpace'; space: string }
  | { key: 'accountAgent' }
  | { key: 'accountYours'; label: string }
  | { key: 'accountOwn' }
  | { key: 'accountRequester' }
  | null {
  switch (account.kind) {
    case 'space':
      return { key: 'accountSpace', space: account.space?.title ?? '' }
    case 'agent':
      return { key: 'accountAgent' }
    case 'personal':
      if (account.label) return { key: 'accountYours', label: account.label }
      return viewer === 'approver' ? { key: 'accountRequester' } : { key: 'accountOwn' }
    default:
      return null
  }
}

/** Whether an `ayni.approval` activity is the person's confirmation of a tool call (PROF-TOOL-007). */
export function isConfirmation(content: unknown): boolean {
  return obj(content).kind === CONFIRMATION
}

const statusOf = (v: unknown): ApprovalStatus =>
  v === 'APPROVED' || v === 'REJECTED' || v === 'CANCELLED' || v === 'EXPIRED' ? v : 'PENDING'

/** The person who asked, as an approval names them (`requester.displayName`, PROF-TOOL-007, PROF-TOOL-009). */
export function requesterNameOf(content: unknown): string {
  return str(obj(obj(content).requester).displayName)
}

/** A confirmation card as the agent gives it; null for an activity that is not one, or one with no action. */
export function confirmationOf(content: unknown): ToolConfirmation | null {
  const c = obj(content)
  if (!isConfirmation(c) || typeof c.approvalId !== 'string') return null
  const action = toolActionOf(c.action)
  if (!action) return null
  const untrusted = Array.isArray(obj(c.untrusted).sources)
    ? (obj(c.untrusted).sources as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined
  return {
    approvalId: c.approvalId,
    status: statusOf(c.status),
    ...(typeof c.expiresAt === 'string' ? { expiresAt: c.expiresAt } : {}),
    ...(requesterNameOf(c) ? { requester: requesterNameOf(c) } : {}),
    action,
    ...(untrusted && c.untrusted ? { untrusted } : {}),
    // never offered on a card asked because of untrusted content (agent TOOL-CALL-008)
    allowForConversation: c.allowForConversation === true && !c.untrusted,
    ...(c.scope === 'once' || c.scope === 'conversation' ? { scope: c.scope } : {}),
    allowanceEnded: c.allowanceEnded === true,
  }
}

/** What a confirmation card shows once decided, or that it waits (UI-CONV-045, UI-CONV-046). */
export type ConfirmationOutcome =
  | 'pending'
  | 'allowed'
  | 'allowedForConversation'
  | 'allowanceStopped'
  | 'refused'
  | 'expired'
  | 'cancelled'

export function confirmationOutcomeOf(
  c: Pick<ToolConfirmation, 'status' | 'scope' | 'allowanceEnded'>
): ConfirmationOutcome {
  switch (c.status) {
    case 'APPROVED':
      if (c.scope !== 'conversation') return 'allowed'
      return c.allowanceEnded ? 'allowanceStopped' : 'allowedForConversation'
    case 'REJECTED':
      return 'refused'
    case 'EXPIRED':
      return 'expired'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/** Whether the card offers Stop allowing: allowed for the conversation, and the allowance still on (UI-CONV-046). */
export function canStopAllowing(c: Pick<ToolConfirmation, 'status' | 'scope' | 'allowanceEnded'>): boolean {
  return confirmationOutcomeOf(c) === 'allowedForConversation'
}

/** Whether a field's value is indented JSON, which the card shows in a monospaced font (UI-CONV-045). */
export function looksLikeJson(value: string): boolean {
  const text = value.trim()
  if (!/^[[{]/.test(text) || !/\n[ \t]+\S/.test(text)) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * The transcript with an approval's update applied to its card (`ayni.approval.update`, PROF-TOOL-008, PROF-TOOL-012;
 * UI-APPR-002): its status, who decided, the grant's expiry, a confirmation's scope and the end of its allowance. A
 * card already decided never goes back to waiting: the first decision counts.
 */
export function withApprovalUpdate(transcript: Transcript, value: unknown): Transcript {
  const v = obj(value)
  if (typeof v.approvalId !== 'string') return transcript
  const named = (m: TranscriptMessage) =>
    m.role === 'activity' && m.activityType === 'ayni.approval' && m.content.approvalId === v.approvalId
  if (!transcript.messages.some(named)) return transcript
  return {
    ...transcript,
    messages: transcript.messages.map((m) => {
      if (m.role !== 'activity' || !named(m)) return m
      const held = statusOf(m.content.status)
      const status = typeof v.status === 'string' ? statusOf(v.status) : held
      const content: Record<string, unknown> = {
        ...m.content,
        status: status === 'PENDING' ? held : status,
        ...(typeof v.decidedBy === 'string' ? { decidedBy: v.decidedBy } : {}),
        ...(typeof v.grantExpiresAt === 'string' ? { grantExpiresAt: v.grantExpiresAt } : {}),
        ...(v.scope === 'once' || v.scope === 'conversation' ? { scope: v.scope } : {}),
        ...(v.allowanceEnded === true ? { allowanceEnded: true } : {}),
      }
      return { ...m, content }
    }),
  }
}

/**
 * The transcript with an approval's card in the status a decision run answered (PROF-TOOL-008). Only a card still
 * waiting takes it: an update that came first is newer, and says more (the scope of an allow).
 */
export function withDecided(transcript: Transcript, approvalId: string, status: ApprovalStatus): Transcript {
  const waiting = transcript.messages.some(
    (m) =>
      m.role === 'activity' &&
      m.activityType === 'ayni.approval' &&
      m.content.approvalId === approvalId &&
      statusOf(m.content.status) === 'PENDING'
  )
  return waiting ? withApprovalUpdate(transcript, { approvalId, status }) : transcript
}

/** The transcript with the allowance a confirmation gave marked as ended, on this device (PROF-TOOL-012). */
export function withAllowanceEnded(transcript: Transcript, approvalId: string): Transcript {
  return withApprovalUpdate(transcript, { approvalId, allowanceEnded: true })
}

/**
 * Whether the reply waits on a confirmation card: its last item is a pending one (UI-CONV-045). No working indicator
 * is shown under it then, and Stop stays.
 */
export function awaitsConfirmation(
  messages: readonly { role: string; activityType?: string; content?: unknown }[]
): boolean {
  const last = messages[messages.length - 1]
  if (last?.role !== 'activity' || last.activityType !== 'ayni.approval') return false
  const c = obj(last.content)
  return isConfirmation(c) && statusOf(c.status) === 'PENDING'
}

/** The approval of a tool call (PROF-TOOL-009): its action and, when the space's owner approves it, the space. */
export function toolApprovalOf(content: unknown): { action: ToolAction; space?: { id: string; title: string } } | null {
  const c = obj(content)
  if (isConfirmation(c)) return null
  const action = toolActionOf(c.action)
  if (!action) return null
  const space = spaceRefOf(c.space)
  return { action, ...(space ? { space } : {}) }
}

/** The sources a reply used, when this device knows them: undefined for a reply received live, not read back yet. */
export function sourcesOf(m: TranscriptMessage | undefined): MessageSource[] | undefined {
  return m?.role === 'assistant' ? m.sources : undefined
}
