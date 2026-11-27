/**
 * Tools, phase 1 (AG-UI profile 3.4: §3.10, §6, §8, PROF-TOOL-001..013, PROF-DESC-009, PROF-SESS-016; agent D96 to
 * D100; UI-CONV-045..052, UI-APPR-006). A space's tools as its members read them and its owner manages them, a change
 * that grants something confirmed on the owner's phone; the confirmation card of a tool call and the exact action on
 * the approval of one; the sources a reply used and those a conversation holds. The wire types are written here until
 * the profile package of 3.4 is the one every client has; the rules a screen follows are here too, so that the
 * browser and the Ayni app apply the same ones. Phase 2 (profile 3.5, PROF-TOOL-021; agent D104, D110) adds the kind
 * of account `personal` to these shapes, and the binding of a space set from an account of its owner; each person's
 * own accounts are in `connections.ts`.
 *
 * Package 3.5.8 (agent D120 to D124, PROF-TOOL-001, 002, 022, 023, 033 to 035; UI-CONV-050, 059, 060, 064 to 066): a
 * space's tools are one item per feature of its template (Files, Calendar, CRM), never one per source, each with the
 * provider chosen for it among those the template allows (`providers`, to the owner); `source`, `title` and
 * `description` are the provider in use, `null` while none is chosen, and `account`, `bindings`, `list` and `tools`
 * come only with one. A feature with a contract carries its profile, `conformant`, `capabilities` and its location as
 * `list`, whose entries are picked among the choices the provider answers (`…/list/choices`), never typed. The change
 * of provider is the same `POST` with `replaces`. Not additive: no shape of one item per source is read.
 *
 * Package 3.5.9 (agent D145 to D150, PROF-TOOL-040 to 043; UI-CONV-069 to 071): the owner's item of Files carries the
 * modes the template allows (`locations`, for the item and for each provider) and the mode in use (`location`); in the
 * managed mode it carries the folder the agent made and keeps (`folder`). The rules of the managed folder are in
 * `managedFolder.ts`.
 */
import {
  type ApprovalPolicyInput,
  type ApprovalPolicyView,
  type ApprovalProgress,
  approvalPolicyOf,
  approvalProgressOf,
  type PolicyRefusal,
  policyKeyOf,
  policyRefusalOf,
} from './approvalPolicy.js'
import {
  locationOf,
  locationsOf,
  type SpaceToolFolder,
  type SpaceToolLocation,
  spaceToolFolderOf,
} from './managedFolder.js'
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
/**
 * The type of a method that a step-up's re-authentication asks (profile 3.5.6, PROF-TOOL-001; agent D127): the agent
 * gives each method of the step-up by its type, never by its name, so a badge is a `credential`.
 */
export type StepUpMethod = 'credential' | 'email' | 'document' | 'face-match' | 'authenticator-app' | 'passkey'
/**
 * A tool's step-up in the settings of a space (PROF-TOOL-001): `device`, a check on the phone, or the methods a
 * re-authentication asks, every one of them, in the agent's order and each type once.
 */
export type ToolStepUp = 'device' | StepUpMethod[]
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
  /**
   * a rule `approval`: its policy in this space (profile 3.5.4, PROF-TOOL-036), whole to the owner, its approvers and
   * threshold to a member
   */
  approval?: ApprovalPolicyView
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

/**
 * A feature of a space's tools (agent D120, PROF-TOOL-033): its id, the title people read ("Files", "CRM") and, for a
 * feature with a contract, the feature profile it follows (`{ id: "org.ayni/files", version: "1.0" }`); `null` for a
 * category, a heading under which its provider's own tools are shown.
 */
export interface SpaceFeature {
  id: string
  title: string
  profile: { id: string; version: string } | null
}

/**
 * A provider the template allows for a feature, as its owner chooses among them (PROF-TOOL-033): the source, its title
 * and description, whose account its calls run with, and whether it is the template's default ("Suggested").
 */
export interface SpaceToolProvider {
  source: string
  title: string
  description: string
  account: { kind: ToolAccountKind }
  default: boolean
  /**
   * Files (package 3.5.9, PROF-TOOL-040): the modes the template allows for this provider, `existing` alone where the
   * agent cannot manage a folder at it, the managed one first; empty for another feature
   */
  locations: SpaceToolLocation[]
}

/** An entry of a list (PROF-TOOL-022): the `values` it binds, in the owner's answer only, and the label people read. */
export interface SpaceToolListEntry {
  values?: Record<string, string>
  label: string
}

/**
 * The list of a source (PROF-TOOL-022), for a feature with a contract its location (PROF-TOOL-033): its folders or
 * calendars, or any. To a member, `label`, `any`, the entries' labels and `anyLabel` when `any` is true; the rest is the
 * owner's: whether the template allows any value, whether the owner may search their account for entries (`choices`),
 * whether an entry may be typed (`typed`, false for a location: always one of the choices) and the most it holds.
 */
export interface SpaceToolList {
  label: string
  any: boolean
  /** in the owner's order; none with `any` */
  entries: SpaceToolListEntry[]
  anyLabel: string
  anyAllowed: boolean
  choices: boolean
  typed: boolean
  /** null when the answer gives no limit */
  maxEntries: number | null
}

/**
 * A feature of a space's template, in that space (`SpaceTool`, §3.10, PROF-TOOL-033): one item per feature, in the
 * template's order, with the provider in use. To the owner every feature in every state with the `providers` the
 * template allows; to a member the `ready` ones, with no provider to choose. While no provider is chosen (also while the
 * choice of a first one waits for the phone) `source` and `title` are null, `account` and `list` null, and `bindings`
 * and `tools` empty.
 */
export interface SpaceTool {
  feature: SpaceFeature
  /** the owner's answer only: the providers the template allows for the feature, in its order; empty to a member */
  providers: SpaceToolProvider[]
  /** the provider in use: null while none is chosen */
  source: string | null
  title: string | null
  /** the provider's description; empty with none */
  description: string
  state: SpaceToolState
  /** the owner's answer only */
  add?: 'auto' | 'owner'
  guests: boolean
  /**
   * a feature with a contract: `false` when its provider did not offer the profile at its last connection (agent
   * TOOL-FEAT-011), `true` when it did; absent before any connection, and for a category
   */
  conformant?: boolean
  /** a feature with a contract: the optional capabilities of its profile in use; empty otherwise */
  capabilities: string[]
  /** null while no provider is in use */
  account: SpaceToolAccount | null
  bindings: SpaceToolBinding[]
  /** the list of the provider in use (a feature's location, PROF-TOOL-033), null when it has none */
  list: SpaceToolList | null
  tools: SpaceToolItem[]
  pending: PendingToolChange | null
  /**
   * Files, the owner's (package 3.5.9, PROF-TOOL-040): the modes the template allows for the provider in use, or for the
   * default one while none is chosen, the managed one first; empty otherwise
   */
  locations: SpaceToolLocation[]
  /** Files, the owner's: the mode in use, once chosen (PROF-TOOL-040); null otherwise */
  location: SpaceToolLocation | null
  /** Files in the managed mode: the folder the agent made and keeps, the owner's view or a member's (PROF-TOOL-041) */
  folder: SpaceToolFolder | null
}

/** How the agent answered a change of a space's tools: applied at once (`200`) or waiting for the phone (`202`). */
export interface SpaceToolAnswer {
  status: 200 | 202
  tool: SpaceTool
}

/** `ayni.space.tools.changed` (PROF-TOOL-006, PROF-TOOL-034). */
export interface SpaceToolsChange {
  spaceId: string
  /** the id of the feature the change concerns */
  feature: string
  /** the provider it concerns, for a change of provider the new one; null when the feature has none (§5) */
  source: string | null
  /** a change of provider: the provider it replaced */
  formerSource?: string
  state: SpaceToolState
  /** absent for a change that applied at once */
  changeId?: string
  outcome: 'applied' | 'declined' | 'expired' | 'failed' | 'cancelled'
}

/** A location the provider answered to the owner's search (`…/list/choices`, PROF-TOOL-023). */
export interface ListChoice {
  values: Record<string, string>
  label: string
}

/** A list as the owner sends it, whole (PROF-TOOL-022): the `values` of each entry, or any. */
export type SpaceToolListInput = { entries: Record<string, string>[] } | { any: true }

/**
 * `POST {sessions}/spaces/{id}/tools` (PROF-TOOL-002, PROF-TOOL-034): `source`, the provider chosen for its feature;
 * with `replaces`, the provider in use, it changes the feature's provider.
 */
export interface AddSpaceToolInput {
  source: string
  replaces?: string
  /** Files (package 3.5.9, PROF-TOOL-040): a folder the agent makes, with no `list`, or one that exists */
  location?: SpaceToolLocation
  bindings?: Record<string, string>
  list?: SpaceToolListInput
  calls?: Record<string, ToolRule>
}

/** `PATCH {sessions}/spaces/{id}/tools/{source}` (PROF-TOOL-003, PROF-TOOL-022, PROF-TOOL-036). */
export interface SpaceToolPatchInput {
  /**
   * the managed folder (package 3.5.9, PROF-TOOL-043): `title` renames it at once (`200`), `check: true` checks it again
   * with the members whose access failed (`202`)
   */
  folder?: { title?: string; check?: true }
  bindings?: Record<string, string>
  list?: SpaceToolListInput
  calls?: Record<string, ToolRule>
  approvals?: Record<string, ApprovalPolicyInput>
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
const STATES: readonly SpaceToolState[] = ['available', 'setup', 'ready', 'off']

/** The types of the methods of a step-up (agent D127: the types of the agent's authentication methods). */
export const STEP_UP_METHODS: readonly StepUpMethod[] = [
  'credential',
  'email',
  'document',
  'face-match',
  'authenticator-app',
  'passkey',
]

/**
 * A tool's step-up as the agent gives it (profile 3.5.6, PROF-TOOL-001): `device`, or the list of the types of the
 * methods a re-authentication asks (`["face-match"]`), else none. A type the profile does not name is left out, a type
 * said twice is read once, and a list left with no type is no step-up.
 */
export function stepUpOf(v: unknown): ToolStepUp | null {
  if (v === 'device') return 'device'
  if (!Array.isArray(v)) return null
  const methods = STEP_UP_METHODS.filter((m) => v.includes(m)).sort((a, b) => v.indexOf(a) - v.indexOf(b))
  return methods.length ? methods : null
}

/** What fills the words of a step-up: a translation function, or `fillText` over `TOOLS_COPY` for the app. */
export type StepUpText = (key: string, values?: Record<string, string>) => string

/**
 * A step-up in words, said after the tool's title, never after the rule's (UI-CONV-049): ", then a check on your
 * phone" for `device`; for the methods of a re-authentication ", then " and each method's check, joined by "and", so
 * `["face-match"]` reads ", then a face check" and `["email", "face-match"]` ", then an email check and a face check"
 * (decision 57); nothing for none.
 */
export function stepUpWords(stepUp: ToolStepUp | null, t: StepUpText): string {
  if (stepUp === null) return ''
  if (stepUp === 'device') return t('tools.stepUp.device')
  const checks = stepUp.map((m) => t(`tools.stepUp.method.${m}`)).join(t('tools.stepUp.and'))
  return checks ? t('tools.stepUp.then', { checks }) : ''
}

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

/** The account of the provider in use (§3.10): the fields and status of a space's account, `connected` of a personal one. */
function spaceToolAccountOf(value: unknown): SpaceToolAccount {
  const account = obj(value)
  const kind = accountKindOf(account.kind)
  const setBy = obj(account.setBy)
  return {
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
  }
}

/** The values of an entry or a choice: text values by binding name; an entry with none names nothing. */
function valuesOf(value: unknown): Record<string, string> | undefined {
  const v = obj(value)
  const out: Record<string, string> = {}
  for (const [name, text] of Object.entries(v)) if (typeof text === 'string') out[name] = text
  return Object.keys(out).length ? out : undefined
}

/** The list of the provider in use (PROF-TOOL-022, PROF-TOOL-033); null for a value with no label. */
export function spaceToolListOf(value: unknown): SpaceToolList | null {
  const l = obj(value)
  if (typeof l.label !== 'string') return null
  const any = l.any === true
  return {
    label: l.label,
    any,
    entries: any
      ? []
      : list(l.entries)
          .filter((e) => typeof e.label === 'string')
          .map((e) => {
            const values = valuesOf(e.values)
            return { ...(values ? { values } : {}), label: e.label as string }
          }),
    anyLabel: str(l.anyLabel),
    anyAllowed: l.anyAllowed === true,
    choices: l.choices === true,
    // only an answer that says so takes a typed entry: a feature's location never does (`typed: false`)
    typed: l.typed === true,
    maxEntries:
      typeof l.maxEntries === 'number' && Number.isInteger(l.maxEntries) && l.maxEntries > 0 ? l.maxEntries : null,
  }
}

/** A provider of the owner's answer (PROF-TOOL-033); null for one with no source. */
function providerOf(value: unknown): SpaceToolProvider | null {
  const p = obj(value)
  if (typeof p.source !== 'string' || !p.source) return null
  return {
    source: p.source,
    title: str(p.title, p.source),
    description: str(p.description),
    account: { kind: accountKindOf(obj(p.account).kind) },
    default: p.default === true,
    locations: locationsOf(p.locations),
  }
}

/**
 * A feature of a space as the agent gives it, with what is missing filled in (PROF-TOOL-033); null for one with no
 * feature. What belongs to a provider in use (its account, bindings, list and tools) is read only while one is.
 */
export function spaceToolOf(value: unknown): SpaceTool | null {
  const t = obj(value)
  const f = obj(t.feature)
  if (typeof f.id !== 'string' || !f.id) return null
  const profile = obj(f.profile)
  const source = typeof t.source === 'string' && t.source ? t.source : null
  const pending = obj(t.pending)
  const inUse = source !== null
  return {
    feature: {
      id: f.id,
      title: str(f.title, f.id),
      profile: typeof profile.id === 'string' && profile.id ? { id: profile.id, version: str(profile.version) } : null,
    },
    providers: list(t.providers)
      .map(providerOf)
      .filter((p): p is SpaceToolProvider => !!p),
    source,
    title: inUse ? str(t.title, source) : null,
    description: inUse ? str(t.description) : '',
    state: STATES.includes(t.state as SpaceToolState) ? (t.state as SpaceToolState) : inUse ? 'ready' : 'available',
    ...(t.add === 'auto' || t.add === 'owner' ? { add: t.add } : {}),
    guests: t.guests === true,
    ...(inUse && typeof t.conformant === 'boolean' ? { conformant: t.conformant } : {}),
    capabilities:
      inUse && Array.isArray(t.capabilities) ? t.capabilities.filter((c): c is string => typeof c === 'string') : [],
    account: inUse ? spaceToolAccountOf(t.account) : null,
    list: inUse ? spaceToolListOf(t.list) : null,
    bindings: (inUse ? list(t.bindings) : []).map((b) => ({
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
    tools: (inUse ? list(t.tools) : [])
      .filter((x) => typeof x.title === 'string' || typeof x.name === 'string')
      .map((x) => {
        const rule = ruleOf(x.rule, 'approval')
        const approval = rule === 'approval' ? approvalPolicyOf(x.approval) : undefined
        return {
          ...(typeof x.name === 'string' ? { name: x.name } : {}),
          title: str(x.title, str(x.name)),
          // a tool with no effect said is taken as the strictest default (agent §10.6)
          effect: EFFECTS.includes(x.effect as ToolEffect) ? (x.effect as ToolEffect) : 'delete',
          rule,
          ...(x.packRule !== undefined ? { packRule: ruleOf(x.packRule, 'approval') } : {}),
          stepUp: stepUpOf(x.stepUp),
          ...(approval ? { approval } : {}),
        }
      }),
    pending:
      typeof pending.changeId === 'string'
        ? {
            changeId: pending.changeId,
            summary: str(pending.summary),
            code: str(pending.code),
            expiresAt: str(pending.expiresAt),
          }
        : null,
    locations: locationsOf(t.locations),
    location: inUse ? locationOf(t.location) : null,
    folder: inUse ? spaceToolFolderOf(t.folder) : null,
  }
}

/** `GET {sessions}/spaces/{id}/tools` (PROF-TOOL-001, PROF-TOOL-033): one item per feature, in the template's order. */
export function spaceToolsOf(body: unknown): SpaceTool[] {
  return list(obj(body).tools)
    .map(spaceToolOf)
    .filter((t): t is SpaceTool => !!t)
}

/**
 * What `ayni.space.tools.changed` says (PROF-TOOL-006): the feature, the provider, the former one for a change of
 * provider; null for a value that is not one, one that names no feature among them.
 */
export function spaceToolsChangeOf(value: unknown): SpaceToolsChange | null {
  const v = obj(value)
  if (typeof v.spaceId !== 'string' || (typeof v.source !== 'string' && v.source !== null)) return null
  if (typeof v.feature !== 'string' || !v.feature) return null
  const outcomes = ['applied', 'declined', 'expired', 'failed', 'cancelled'] as const
  const outcome = outcomes.find((o) => o === v.outcome)
  if (!outcome) return null
  return {
    spaceId: v.spaceId,
    feature: v.feature,
    source: typeof v.source === 'string' && v.source ? v.source : null,
    ...(typeof v.formerSource === 'string' && v.formerSource ? { formerSource: v.formerSource } : {}),
    state: STATES.includes(v.state as SpaceToolState) ? (v.state as SpaceToolState) : 'ready',
    ...(typeof v.changeId === 'string' ? { changeId: v.changeId } : {}),
    outcome,
  }
}

/** Whether an announced change concerns a feature of a space (PROF-TOOL-006): its waiting change ends with it. */
export function concernsFeature(
  change: Pick<SpaceToolsChange, 'spaceId' | 'feature'>,
  spaceId: string,
  featureId: string
): boolean {
  return change.spaceId === spaceId && change.feature === featureId
}

/** The choices of a location the provider answered (PROF-TOOL-023): at most fifty, each once, in the order read. */
export function listChoicesOf(body: unknown): ListChoice[] {
  const seen = new Set<string>()
  const out: ListChoice[] = []
  for (const c of list(obj(body).choices)) {
    const values = valuesOf(c.values)
    if (!values || typeof c.label !== 'string') continue
    const key = entryKeyOf(values)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ values, label: c.label })
    if (out.length === LIST_CHOICES_MAX) break
  }
  return out
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
  return (tool.account?.kind === 'personal' ? tool.account.source : undefined) ?? tool.source ?? ''
}

/**
 * The sign-in of a managed folder's Allow (UI-CONV-070, UI-CONV-061; package 3.5.10, PROF-TOOL-029; agent decision 87):
 * `authorize` for the provider itself (`source`), with the space's `spaceId`, which asks the scopes of its tools and of
 * the folder's management alone, and not those of every source of its account; its outcome is told on the row of Your
 * accounts the provider's account is under (`account`: `google` for Google Drive).
 */
export function folderSignInOf(tool: Pick<SpaceTool, 'source' | 'account'>): { source: string; account: string } {
  return { source: tool.source ?? '', account: accountSourceOf(tool) }
}

/** Whether the feature has a provider in the space: added, ready or still missing something. */
export function isAdded(tool: Pick<SpaceTool, 'state'>): boolean {
  return tool.state === 'setup' || tool.state === 'ready'
}

/** Whether the owner may add the feature, choosing its provider: offered and not added, or an automatic one switched off. */
export function canAdd(tool: Pick<SpaceTool, 'state'>): boolean {
  return tool.state === 'available' || tool.state === 'off'
}

// ---------------------------------------------------------------------------------------------------- providers

/**
 * The provider Add starts from (UI-CONV-065): the template's default, "Suggested" and selected among several, else the
 * first the template allows; none when the answer gives no provider (a member's).
 */
export function defaultProviderOf(tool: Pick<SpaceTool, 'providers'>): SpaceToolProvider | undefined {
  return tool.providers.find((p) => p.default) ?? tool.providers[0]
}

/**
 * Whether Add first shows the providers to choose among, under "Choose a provider for <feature>" (UI-CONV-065): a
 * feature whose template allows several; with one, Add opens that provider's panel.
 */
export function choosesProvider(tool: Pick<SpaceTool, 'providers'>): boolean {
  return tool.providers.length > 1
}

/**
 * Whether the panel offers Change provider (UI-CONV-066): a provider in use, and another the template allows. A feature
 * with one provider shows none.
 */
export function canChangeProvider(tool: Pick<SpaceTool, 'providers' | 'source'>): boolean {
  return tool.source !== null && tool.providers.some((p) => p.source !== tool.source)
}

/** The providers Change provider shows (UI-CONV-066): those the template allows but the one in use, in its order. */
export function otherProvidersOf(tool: Pick<SpaceTool, 'providers' | 'source'>): SpaceToolProvider[] {
  return tool.providers.filter((p) => p.source !== tool.source)
}

/**
 * What the question of a change of provider names (UI-CONV-052, UI-CONV-066): the new provider, the feature and the
 * former one, by their titles ("Use Nextcloud for Files in Project Alpha, in place of Google Drive?"); null for a source
 * that is not another provider of the feature, or a feature with no provider in use.
 */
export function providerChangeOf(
  tool: Pick<SpaceTool, 'providers' | 'source' | 'title' | 'feature'>,
  source: string
): { next: string; feature: string; former: string } | null {
  const next = otherProvidersOf(tool).find((p) => p.source === source)
  if (!next || tool.source === null) return null
  return { next: next.title, feature: tool.feature.title, former: tool.title ?? tool.source }
}

/**
 * The request of a change of provider (PROF-TOOL-034): the new provider, the one in use it replaces, and for Files the
 * mode chosen where the new provider has modes (PROF-TOOL-040, which the agent requires where both are allowed).
 */
export function providerChangeInputOf(
  tool: Pick<SpaceTool, 'source'>,
  source: string,
  location: SpaceToolLocation | null = null
): AddSpaceToolInput {
  return { source, ...(tool.source ? { replaces: tool.source } : {}), ...(location ? { location } : {}) }
}

/**
 * Whether the provider of a feature offers it as its contract says (UI-CONV-065, agent TOOL-FEAT-011): `conformant:
 * false` shows "<provider> does not offer <feature> as <agent> expects. Choose another provider." in place of its state,
 * and no tool. Absent (before any connection, or a category) is not a refusal.
 */
export function isConformant(tool: Pick<SpaceTool, 'conformant'>): boolean {
  return tool.conformant !== false
}

/** The line of a list (UI-CONV-060): its label and the labels of its entries, or its `anyLabel` for any value. */
export interface ListLine {
  label: string
  values: string[]
}

/**
 * The line of a list (UI-CONV-060, UI-CONV-052): "Repositories: All of 2060-io, verana-labs/vs-agent", or "<label>:
 * <anyLabel>" for any value; null for a list with no entry, which binds nothing yet.
 */
export function listLineOf(
  list: Pick<SpaceToolList, 'label' | 'any' | 'entries' | 'anyLabel'> | null
): ListLine | null {
  if (!list) return null
  if (list.any) return { label: list.label, values: [list.anyLabel] }
  return list.entries.length ? { label: list.label, values: list.entries.map((e) => e.label) } : null
}

/**
 * The line of a feature's provider (UI-CONV-065, UI-CONV-052), on its row of Tools and in About: the provider's title,
 * what it is bound to (each binding with a value as "<label>: <value>", the `valueLabel` of one that has it, then the
 * line of its list) and whose account its calls use, in the words of UI-CONV-049 (none for `none`); the parts a screen
 * joins with " · ", such as "Nextcloud · Folders: /Projects/Alpha · Uses the space's account". Null while the feature
 * has no provider: its row then reads "Choose a provider".
 */
export interface ProviderLine {
  provider: string
  bindings: { label: string; value: string }[]
  list: ListLine | null
  account: Exclude<ToolAccountKind, 'none'> | null
}

export function providerLineOf(
  tool: Pick<SpaceTool, 'source' | 'title' | 'bindings' | 'list' | 'account'>
): ProviderLine | null {
  if (tool.source === null) return null
  const kind = tool.account?.kind ?? 'none'
  return {
    provider: tool.title ?? tool.source,
    bindings: tool.bindings
      .filter((b) => b.value !== null && b.value !== '')
      .map((b) => ({ label: b.label, value: b.valueLabel || (b.value as string) })),
    list: listLineOf(tool.list),
    account: kind === 'none' ? null : kind,
  }
}

/**
 * What a feature in `setup` still lacks (UI-CONV-050, UI-CONV-052): the labels of its bindings with no value, the label
 * of its list while it holds no entry, and its account while a space's account is not set; "Needs setup: Folders,
 * account".
 */
export function missingOf(
  tool: Pick<SpaceTool, 'bindings' | 'account' | 'list'> & Partial<Pick<SpaceTool, 'location'>>
): {
  bindings: string[]
  list: string | null
  account: boolean
} {
  return {
    bindings: tool.bindings.filter((b) => b.value === null || b.value === '').map((b) => b.label),
    // the list of a managed folder is the agent's, which it sets once the folder is made (PROF-TOOL-041)
    list:
      tool.list && !tool.list.any && !tool.list.entries.length && tool.location !== 'managed' ? tool.list.label : null,
    account: tool.account?.kind === 'space' && tool.account.set !== true,
  }
}

/** The parts of "Needs setup: <what is missing>" (UI-CONV-052), in order: bindings, the list, then `account`. */
export function missingPartsOf(
  tool: Pick<SpaceTool, 'bindings' | 'account' | 'list'> & Partial<Pick<SpaceTool, 'location'>>
): {
  labels: string[]
  account: boolean
} {
  const missing = missingOf(tool)
  return { labels: [...missing.bindings, ...(missing.list ? [missing.list] : [])], account: missing.account }
}

// ---------------------------------------------------------------------------------------------------- a list

/** The most choices one search answers (PROF-TOOL-023). */
export const LIST_CHOICES_MAX = 50
/** The longest text a search takes (PROF-TOOL-023, `400 bad-request` with `field: "text"` beyond it). */
export const CHOICES_TEXT_MAX = 100
/** How long the owner's typing pauses before the search is asked (UI-CONV-059). */
export const CHOICES_PAUSE_MS = 400

/** The text a search of a list sends (PROF-TOOL-023): trimmed, at most 100 characters; null for none, which asks nothing. */
export function choicesTextOf(typed: string): string | null {
  const text = typed.trim().slice(0, CHOICES_TEXT_MAX)
  return text ? text : null
}

const entryKeyOf = (values: Record<string, string>): string =>
  JSON.stringify(
    Object.keys(values)
      .sort()
      .map((k) => [k, values[k]])
  )

/**
 * Whether one entry covers another (§3.10, UI-CONV-059): it names no more of the bindings, each with the same value; an
 * entry covers itself.
 */
export function entryCovers(cover: Record<string, string>, entry: Record<string, string>): boolean {
  const names = Object.keys(cover)
  return names.length > 0 && names.every((name) => entry[name] === cover[name])
}

/** The list as the owner changes it in the panel, until the Save of the settings sends it whole (UI-CONV-059). */
export interface ListForm {
  any: boolean
  /** each with its `values`, in the owner's order */
  entries: { values: Record<string, string>; label: string }[]
}

/** The form of the list in force: its entries with their values (the owner's answer), or any. */
export function listFormOf(list: Pick<SpaceToolList, 'any' | 'entries'>): ListForm {
  return {
    any: list.any,
    entries: list.entries.flatMap((e) => (e.values ? [{ values: e.values, label: e.label }] : [])),
  }
}

/** Whether a choice is in the list: an entry equals it or covers it, which reads "In the list" (UI-CONV-059). */
export function choiceInList(form: ListForm, choice: Pick<ListChoice, 'values'>): boolean {
  return form.entries.some((e) => entryCovers(e.values, choice.values))
}

/** Whether Add is at the most entries the list holds (`maxEntries`): disabled, "A list holds at most <n> entries." */
export function listIsFull(form: ListForm, list: Pick<SpaceToolList, 'maxEntries'>): boolean {
  return list.maxEntries !== null && form.entries.length >= list.maxEntries
}

/**
 * The list with a choice added at its end (UI-CONV-059): the entries it covers leave the list; a choice already in the
 * list, or one beyond `maxEntries`, changes nothing.
 */
export function withListEntry(form: ListForm, choice: ListChoice, list: Pick<SpaceToolList, 'maxEntries'>): ListForm {
  if (choiceInList(form, choice)) return form
  const kept = form.entries.filter((e) => !entryCovers(choice.values, e.values))
  if (list.maxEntries !== null && kept.length >= list.maxEntries) return form
  return { any: false, entries: [...kept, { values: choice.values, label: choice.label }] }
}

/** The list without the entry at an index (Remove, UI-CONV-059). */
export function withoutListEntry(form: ListForm, index: number): ListForm {
  return { ...form, entries: form.entries.filter((_, i) => i !== index) }
}

/** Whether the form differs from the list in force: its choice of any, or its entries and their order. */
export function listChanged(form: ListForm, list: Pick<SpaceToolList, 'any' | 'entries'>): boolean {
  const held = listFormOf(list)
  if (form.any !== held.any) return true
  if (form.any) return false
  return (
    form.entries.length !== held.entries.length ||
    form.entries.some((e, i) => entryKeyOf(e.values) !== entryKeyOf(held.entries[i]?.values ?? {}))
  )
}

/** The list a request sends, whole (PROF-TOOL-022): `{ any: true }`, or the values of each entry in order. */
export function listInputOf(form: ListForm): SpaceToolListInput {
  return form.any ? { any: true } : { entries: form.entries.map((e) => ({ ...e.values })) }
}

/**
 * Why the search of a list answered nothing (PROF-TOOL-023, UI-CONV-059): `notConnected`, the owner's own account is
 * not connected ("Connect your account to choose", with Connect); `spaceAccountNotSet`, the space's account is not set;
 * `unavailable`, the provider could not be read ("<source> cannot be searched now. Try again later.").
 */
export type ChoicesRefusal = 'notConnected' | 'spaceAccountNotSet' | 'unavailable' | 'notOwner' | 'notFound' | 'other'

export function choicesRefusalOf(error: { status?: number; code?: string } | undefined): ChoicesRefusal {
  switch (error?.code) {
    case 'not-connected':
      return 'notConnected'
    case 'space-account-not-set':
      return 'spaceAccountNotSet'
    case 'source-unavailable':
      return 'unavailable'
    case 'not-owner':
      return 'notOwner'
    default:
      return error?.status === 502 ? 'unavailable' : error?.status === 404 ? 'notFound' : 'other'
  }
}

/**
 * The tools of a source whose approval policy needs attention (UI-CONV-067): a required entry names nobody now. Their
 * words go on the tool's line, on the source's row and at those entries.
 */
export function toolsNeedingAttention(tool: Pick<SpaceTool, 'tools'>): SpaceToolItem[] {
  return tool.tools.filter((x) => x.rule === 'approval' && x.approval?.state === 'needs-attention')
}

/**
 * The state of a feature's row in the owner's Tools segment (UI-CONV-050, UI-CONV-065): "Waiting for your phone" while
 * a change waits; `notConformant` for a provider that does not offer its feature as its contract says, whose words
 * stand in place of its state; `makingFolder` while the agent makes the managed folder ("Making the folder at
 * <provider>…", UI-CONV-052, package 3.5.9); else its state.
 */
export type ToolRowState = 'notAdded' | 'needsSetup' | 'ready' | 'off' | 'waiting' | 'notConformant' | 'makingFolder'

export function toolRowStateOf(
  tool: Pick<SpaceTool, 'state' | 'pending'> & Partial<Pick<SpaceTool, 'conformant' | 'folder'>>
): ToolRowState {
  if (tool.pending) return 'waiting'
  if (tool.conformant === false && isAdded(tool)) return 'notConformant'
  const folder = tool.folder?.view === 'owner' ? tool.folder : null
  if (folder?.state === 'creating' && folder.reason !== 'not-connected' && folder.reason !== 'scope-missing')
    return 'makingFolder'
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

/**
 * One group of a source's tools in About (UI-CONV-049): the tools of one rule, and for `approval` of one policy (its
 * words differ from one policy to another, profile 3.5.4), by their titles.
 */
export interface ToolRuleGroup {
  rule: Exclude<ToolRule, 'off'>
  /** the rule `approval`: the policy its tools share, when the agent gives it (PROF-TOOL-036) */
  approval?: ApprovalPolicyView
  /** in the agent's order, each with its step-up, which is named after its title, never after the rule's words */
  tools: { title: string; stepUp: ToolStepUp | null }[]
}

/**
 * A source's tools in About, grouped by rule (UI-CONV-049): the loosest rule first, each group's tools in the agent's
 * order, each with its own step-up; the tools of the rule `approval` grouped by their policy, in the order they come;
 * a tool whose rule is `off` is not shown.
 */
export function ruleGroupsOf(tool: Pick<SpaceTool, 'tools'>): ToolRuleGroup[] {
  const groups: (ToolRuleGroup & { key: string })[] = []
  for (const item of tool.tools) {
    if (item.rule === 'off') continue
    const rule = item.rule
    const key = rule === 'approval' ? policyKeyOf(item.approval) : ''
    let group = groups.find((g) => g.rule === rule && g.key === key)
    if (!group) {
      group = { rule, key, ...(rule === 'approval' && item.approval ? { approval: item.approval } : {}), tools: [] }
      groups.push(group)
    }
    group.tools.push({ title: item.title, stepUp: item.stepUp })
  }
  return groups.sort((a, b) => strictnessOf(a.rule) - strictnessOf(b.rule)).map(({ key: _key, ...group }) => group)
}

/** The tools a space's About shows (UI-CONV-031): its `ready` features, each with its provider, in the template's order. */
export function readyToolsOf(tools: readonly SpaceTool[]): SpaceTool[] {
  return tools.filter((t) => t.state === 'ready' && t.source !== null)
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
  /** a field of an approval policy (`approvals.<tool>…`, profile 3.5.4, PROF-TOOL-036) */
  | { at: 'policy'; refusal: PolicyRefusal }
  /**
   * an entry of a list (`list.entries.<i>` or `list.entries.<i>.<name>`, PROF-TOOL-022), at that entry's row: its value
   * not in a shape or a pattern, a repeat, or a place each member's own account would see differently
   */
  | { at: 'entry'; index: number; reason: 'badBinding' | 'repeatedEntry' | 'notPortable' }
  /** the entries of a list (`list.entries`), under its Add: more than it holds */
  | { at: 'entries'; reason: 'tooManyEntries' }
  /** the choice of any value (`list.any`), at that choice */
  | { at: 'any'; reason: 'anyNotAllowed' }
  /**
   * the mode of Files (`location`, package 3.5.9, PROF-TOOL-040), at the choice of the two modes: a mode the template does
   * not allow, the managed mode with a provider the agent cannot manage, a `400` naming `location` (the modes changed
   * since the panel was read) or `list` (a list sent with the managed mode)
   */
  | { at: 'location'; reason: 'locationNotAllowed' | 'cannotManage' | 'badRequest' }
  /** the name of the managed folder (`folder.title`, PROF-TOOL-043), at its field */
  | { at: 'folderTitle'; reason: 'badName' }
  | {
      at: 'panel'
      reason:
        | 'phoneNeeded'
        | 'changePending'
        | 'notAdded'
        | 'alreadyAdded'
        | 'featureHasProvider'
        | 'notOwner'
        | 'noSpaceAccount'
        | 'spaceAccountNotSet'
        | 'providerNotUsed'
        | 'personalSpace'
        /** `409 managed-location`: a list of Files while the agent manages its folder (PROF-TOOL-043) */
        | 'managedLocation'
        | 'notFound'
        | 'other'
    } {
  const policy = policyRefusalOf(error)
  if (policy) return { at: 'policy', refusal: policy }
  const code = error?.code
  const field = error?.field ?? ''
  if (code === 'cannot-manage') return { at: 'location', reason: 'cannotManage' }
  if (code === 'location-not-allowed') return { at: 'location', reason: 'locationNotAllowed' }
  if (error?.status === 400 && (field === 'location' || field === 'list'))
    return { at: 'location', reason: 'badRequest' }
  if (code === 'bad-name') return { at: 'folderTitle', reason: 'badName' }
  const entry = /^list\.entries\.(\d+)(\.|$)/.exec(field)
  if (entry && (code === 'bad-binding' || code === 'repeated-entry' || code === 'not-portable'))
    return {
      at: 'entry',
      index: Number(entry[1]),
      reason: code === 'bad-binding' ? 'badBinding' : code === 'repeated-entry' ? 'repeatedEntry' : 'notPortable',
    }
  if (code === 'too-many-entries') return { at: 'entries', reason: 'tooManyEntries' }
  if (code === 'any-not-allowed') return { at: 'any', reason: 'anyNotAllowed' }
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
            : code === 'feature-has-provider'
              ? 'featureHasProvider'
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
                        : code === 'managed-location'
                          ? 'managedLocation'
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
        // where an approval of a tool of a space stands after this change (PROF-TOOL-037)
        ...(approvalProgressOf(v.progress) ? { progress: v.progress } : {}),
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

/**
 * The approval of a tool call (PROF-TOOL-009): its action and the space of the tool; for a tool of a space, its policy
 * as a member reads it, where it stands (`progress`, PROF-TOOL-037), and `reason: "no-approver"` when it was refused at
 * once for want of another approver.
 */
export function toolApprovalOf(content: unknown): {
  action: ToolAction
  space?: { id: string; title: string }
  policy?: ApprovalPolicyView
  progress?: ApprovalProgress
  reason?: 'no-approver'
} | null {
  const c = obj(content)
  if (isConfirmation(c)) return null
  const action = toolActionOf(c.action)
  if (!action) return null
  const space = spaceRefOf(c.space)
  const policy = approvalPolicyOf(c.policy)
  const progress = approvalProgressOf(c.progress)
  return {
    action,
    ...(space ? { space } : {}),
    ...(policy ? { policy } : {}),
    ...(progress ? { progress } : {}),
    ...(c.reason === 'no-approver' ? { reason: 'no-approver' as const } : {}),
  }
}

/** The sources a reply used, when this device knows them: undefined for a reply received live, not read back yet. */
export function sourcesOf(m: TranscriptMessage | undefined): MessageSource[] | undefined {
  return m?.role === 'assistant' ? m.sources : undefined
}
