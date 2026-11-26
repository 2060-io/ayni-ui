/**
 * Tools, phase 2: each person's own accounts (AG-UI profile 3.5: §3.11, §5, §6, PROF-TOOL-014..021, PROF-DESC-010,
 * PROF-LINK-004; agent D104 to D110; UI-CONV-053..058). Your accounts as the agent lists them, the sign-in of an
 * account of OAuth and the account of fields, Disconnect, the Connect card, and what a screen says of each, written
 * once for the browser and the Ayni app. The wire types are written here until the profile package of 3.5 is the one
 * every client has. Package 3.5.10 (§3.13, PROF-TOOL-028, PROF-TOOL-029; agent D118; UI-CONV-061, UI-CONV-063): an
 * account that several sources use, or a source whose tools declare their scopes, carries `access`, one line each
 * under its row with Allow or Allow more, which sign in for that source alone; the Connect card's `why: 'allow'`. The
 * key service (PROF-TOOL-032): the outcome `unavailable`, `503 keys-unavailable` and Disconnect's `revokedAtSource`.
 */
import { type FeatureRef, featureRefOf, type SpaceToolAccountField } from './tools.js'

/** The live event of a change of one of the person's own accounts, or of an attempt to connect one (PROF-TOOL-019). */
export const CONNECTIONS_CHANGED = 'ayni.connections.changed'
/** The activity of the Connect card (PROF-TOOL-020). */
export const CONNECT_ACTIVITY = 'ayni.connect'

/** How a person connects an account: the service's sign-in in the browser, or fields they type (§3.11). */
export type ConnectionMethod = 'oauth' | 'fields'
export type ConnectionState = 'not-connected' | 'connected' | 'reconnect'
/** Why an account must be connected again (agent D107). */
export type ReconnectReason = 'expired' | 'revoked' | 'changed'

/** The value of a binding an account is for, such as Relaticle's workspace (agent D110). */
export interface ConnectionBinding {
  name: string
  label: string
  value: string
  /** the name of the value at the service, shown in place of the value */
  valueLabel: string
}

/** Where an account serves (`usedIn`): every conversation, Personal, a space. */
export type ConnectionUse = { kind: 'agent' } | { kind: 'personal' } | { kind: 'space'; id: string; title: string }

/** How much of a source's tools the scopes the person granted allow (package 3.5.10, §3.13, PROF-TOOL-028). */
export type ConnectionAllowed = 'all' | 'some' | 'none'
export const CONNECTION_ALLOWED: readonly ConnectionAllowed[] = ['all', 'some', 'none']

/**
 * One source of an account's `access` (package 3.5.10, §3.13, PROF-TOOL-028), on an account that several sources use
 * (Google's, for Google Drive and Google Calendar) or of a source whose tools declare their scopes: whether every tool
 * of it the person may use is allowed (`all`), some (`some`), or none. Its Allow, or Allow more, signs in for this
 * `source` alone (PROF-TOOL-029, UI-CONV-061).
 */
export interface ConnectionAccess {
  source: string
  title: string
  allowed: ConnectionAllowed
  /** for `some`, the titles of the tools not allowed, as the person reads them ("Create a file"); empty otherwise */
  missing: string[]
}

/** One of the person's own accounts, held or to connect (`Connection`, §3.11, PROF-TOOL-014). Never a token. */
export interface Connection {
  source: string
  title: string
  description: string
  method: ConnectionMethod
  /** the fields the person types, one masked field each, for a source of fields (agent D102) */
  fields: SpaceToolAccountField[]
  binding: ConnectionBinding | null
  usedIn: ConnectionUse[]
  state: ConnectionState
  reason: ReconnectReason | null
  /** the service asked a connected account for more access */
  moreAccess: boolean
  /** the account held: its `label` is its name at the service, shown to this person only */
  account: { id: string; label: string; connectedAt: string; lastUsedAt: string | null } | null
  /** the sign-in that waits */
  attempt: { id: string; expiresAt: string } | null
  /** whether Disconnect also ends the agent's access at the service */
  revokesAtSource: boolean
  /**
   * the features the sources that use the account serve, each once (package 3.5.8, PROF-TOOL-035): Your accounts reads
   * "For Files, Calendar" under the description (UI-CONV-064)
   */
  features: FeatureRef[]
  /**
   * the sources of an account that several sources use (`source` is then the account's id, `google`), or the one source
   * of an item whose tools declare their scopes, in the agent's order (package 3.5.10, §3.13, PROF-TOOL-028): Your
   * accounts shows one line each under the row (UI-CONV-061). Empty for any other item.
   */
  access: ConnectionAccess[]
}

/**
 * The answer of Disconnect (PROF-TOOL-017, PROF-TOOL-032): the item, `not-connected`, and `revokedAtSource`, `false`
 * when the agent ended the account without telling the service, which names a revocation endpoint (its key service did
 * not answer, agent D117); absent when the service names none.
 */
export interface DisconnectedAccount {
  connection: Connection
  revokedAtSource?: boolean
}

/** A sign-in started (`202` of `authorize`, PROF-TOOL-015). */
export interface ConnectionAttempt {
  attemptId: string
  authorizationUrl: string
  expiresAt: string
}

/** How an attempt ended, or how an account ended (`outcome` of `ayni.connections.changed`). */
export type ConnectionOutcome =
  | 'connected'
  | 'denied'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'wrong-binding'
  | 'wrong-person'
  /** the tokens could not be kept: the agent's key service did not answer (PROF-TOOL-032, agent D117) */
  | 'unavailable'
  | 'disconnected'
  | 'ended'

/** `ayni.connections.changed` (PROF-TOOL-019), also sent when an item's `access` changes (package 3.5.10). */
export interface ConnectionsChange {
  source: string
  binding?: { value: string; valueLabel: string }
  state: ConnectionState
  reason?: ReconnectReason
  moreAccess?: boolean
  accountId?: string
  label?: string
  attemptId?: string
  outcome?: ConnectionOutcome
  /** for `wrong-binding`: the names of the value the space wants and of the one the account is for */
  expected?: string
  chosen?: string
}

/**
 * The Connect card (`ayni.connect`, PROF-TOOL-020): the account it names; its state comes from Your accounts. With
 * `why: 'allow'` (package 3.5.10, PROF-TOOL-029) the account is connected and one more of its sources is to allow:
 * `source`, `title` and `description` are the account's, `feature` that of the source of `allow`.
 */
export interface ConnectCard {
  source: string
  title: string
  /** the feature of the source the card is for (PROF-TOOL-035), when the agent gives it: the card names it first */
  feature?: FeatureRef
  description: string
  method: ConnectionMethod
  why: 'connect' | 'reconnect' | 'allow'
  /** `why: 'allow'`: the source of the account to allow, which the card's button signs in for */
  allow?: { source: string; title: string }
  binding?: { label: string; value: string; valueLabel: string }
  spaceId?: string
}

// ---------------------------------------------------------------------------------------------------- reading

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])

const STATES: readonly ConnectionState[] = ['not-connected', 'connected', 'reconnect']
const REASONS: readonly ReconnectReason[] = ['expired', 'revoked', 'changed']
const OUTCOMES: readonly ConnectionOutcome[] = [
  'connected',
  'denied',
  'failed',
  'expired',
  'cancelled',
  'wrong-binding',
  'wrong-person',
  'unavailable',
  'disconnected',
  'ended',
]

const stateOf = (v: unknown): ConnectionState =>
  STATES.includes(v as ConnectionState) ? (v as ConnectionState) : 'not-connected'
const reasonOf = (v: unknown): ReconnectReason | null =>
  REASONS.includes(v as ReconnectReason) ? (v as ReconnectReason) : null
const methodOf = (v: unknown): ConnectionMethod => (v === 'fields' ? 'fields' : 'oauth')

/** The fields of an account of fields, in the agent's order; one with no name, or a name said twice, is left out. */
function fieldsOf(value: unknown): SpaceToolAccountField[] {
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

function bindingOf(value: unknown): ConnectionBinding | null {
  const b = obj(value)
  if (typeof b.value !== 'string') return null
  return {
    name: str(b.name),
    label: str(b.label, str(b.name)),
    value: b.value,
    valueLabel: str(b.valueLabel, b.value),
  }
}

function useOf(value: Record<string, unknown>): ConnectionUse | null {
  if (value.kind === 'agent') return { kind: 'agent' }
  if (value.kind === 'personal') return { kind: 'personal' }
  if (value.kind === 'space' && typeof value.id === 'string')
    return { kind: 'space', id: value.id, title: str(value.title) }
  return null
}

/** One item of Your accounts as the agent gives it; null for one with no source. */
export function connectionOf(value: unknown): Connection | null {
  const c = obj(value)
  if (typeof c.source !== 'string' || !c.source) return null
  const method = methodOf(c.method)
  const account = obj(c.account)
  const attempt = obj(c.attempt)
  const state = stateOf(c.state)
  return {
    source: c.source,
    title: str(c.title, c.source),
    description: str(c.description),
    method,
    fields: method === 'fields' ? fieldsOf(c.fields) : [],
    binding: bindingOf(c.binding),
    usedIn: list(c.usedIn)
      .map(useOf)
      .filter((u): u is ConnectionUse => !!u),
    state,
    reason: state === 'reconnect' ? (reasonOf(c.reason) ?? 'changed') : null,
    moreAccess: state === 'connected' && c.moreAccess === true,
    account:
      typeof account.id === 'string'
        ? {
            id: account.id,
            label: str(account.label),
            connectedAt: str(account.connectedAt),
            lastUsedAt: typeof account.lastUsedAt === 'string' ? account.lastUsedAt : null,
          }
        : null,
    attempt:
      typeof attempt.id === 'string' && typeof attempt.expiresAt === 'string'
        ? { id: attempt.id, expiresAt: attempt.expiresAt }
        : null,
    revokesAtSource: c.revokesAtSource === true,
    features: featuresOf(c.features),
    access: accessOf(c.access),
  }
}

/**
 * The sources of an item's `access`, each once, in the agent's order (PROF-TOOL-028); one with no source is left out,
 * an `allowed` that is not one of the profile's is `none` (nothing is claimed allowed), and `missing` is read for
 * `some` alone.
 */
function accessOf(value: unknown): ConnectionAccess[] {
  const seen = new Set<string>()
  const out: ConnectionAccess[] = []
  for (const a of list(value)) {
    if (typeof a.source !== 'string' || !a.source || seen.has(a.source)) continue
    seen.add(a.source)
    const allowed = CONNECTION_ALLOWED.find((x) => x === a.allowed) ?? 'none'
    const missing = Array.isArray(a.missing)
      ? a.missing.filter((m): m is string => typeof m === 'string' && !!m.trim())
      : []
    out.push({ source: a.source, title: str(a.title, a.source), allowed, missing: allowed === 'some' ? missing : [] })
  }
  return out
}

/** The features of an account, each once, in the agent's order; one with no title is left out. */
function featuresOf(value: unknown): FeatureRef[] {
  const seen = new Set<string>()
  const out: FeatureRef[] = []
  for (const f of Array.isArray(value) ? value : []) {
    const feature = featureRefOf(f)
    if (!feature || seen.has(feature.id || feature.title)) continue
    seen.add(feature.id || feature.title)
    out.push(feature)
  }
  return out
}

/** `GET {sessions}/connections` (PROF-TOOL-014): the person's accounts, in the agent's order. */
export function connectionsOf(body: unknown): Connection[] {
  return list(obj(body).connections)
    .map(connectionOf)
    .filter((c): c is Connection => !!c)
}

/** The `202` of `authorize` (PROF-TOOL-015); null for an answer that is not one. */
export function connectionAttemptOf(body: unknown): ConnectionAttempt | null {
  const a = obj(body)
  if (typeof a.attemptId !== 'string' || typeof a.authorizationUrl !== 'string') return null
  return { attemptId: a.attemptId, authorizationUrl: a.authorizationUrl, expiresAt: str(a.expiresAt) }
}

/** What `ayni.connections.changed` says; null for a value that is not one. */
export function connectionsChangeOf(value: unknown): ConnectionsChange | null {
  const v = obj(value)
  if (typeof v.source !== 'string' || !v.source) return null
  const binding = obj(v.binding)
  const reason = reasonOf(v.reason)
  const outcome = OUTCOMES.find((o) => o === v.outcome)
  return {
    source: v.source,
    ...(typeof binding.value === 'string'
      ? { binding: { value: binding.value, valueLabel: str(binding.valueLabel, binding.value) } }
      : {}),
    state: stateOf(v.state),
    ...(reason ? { reason } : {}),
    ...(typeof v.moreAccess === 'boolean' ? { moreAccess: v.moreAccess } : {}),
    ...(typeof v.accountId === 'string' ? { accountId: v.accountId } : {}),
    ...(typeof v.label === 'string' ? { label: v.label } : {}),
    ...(typeof v.attemptId === 'string' ? { attemptId: v.attemptId } : {}),
    ...(outcome ? { outcome } : {}),
    ...(typeof v.expected === 'string' ? { expected: v.expected } : {}),
    ...(typeof v.chosen === 'string' ? { chosen: v.chosen } : {}),
  }
}

/** The Connect card an `ayni.connect` activity carries; null for content that names no source. */
export function connectCardOf(content: unknown): ConnectCard | null {
  const c = obj(content)
  if (typeof c.source !== 'string' || !c.source) return null
  const binding = obj(c.binding)
  const feature = featureRefOf(c.feature)
  const allow = obj(c.allow)
  // a card that asks to allow a source names it; one that names none is a card to connect the account
  const allowing = c.why === 'allow' && typeof allow.source === 'string' && !!allow.source
  return {
    source: c.source,
    title: str(c.title, c.source),
    ...(feature ? { feature } : {}),
    description: str(c.description),
    method: methodOf(c.method),
    why: c.why === 'reconnect' ? 'reconnect' : allowing ? 'allow' : 'connect',
    ...(allowing ? { allow: { source: allow.source as string, title: str(allow.title, allow.source as string) } } : {}),
    ...(typeof binding.value === 'string'
      ? {
          binding: {
            label: str(binding.label),
            value: binding.value,
            valueLabel: str(binding.valueLabel, binding.value),
          },
        }
      : {}),
    ...(typeof c.spaceId === 'string' ? { spaceId: c.spaceId } : {}),
  }
}

/** Whether the agent serves the person's own accounts of profile 3.5 (PROF-DESC-010): without it, no Your accounts. */
export function takesConnections(features: object | null | undefined): boolean {
  // read loosely: the descriptor's type gains the field with the profile package that declares it
  return (features as { connections?: unknown } | null | undefined)?.connections === true
}

// ---------------------------------------------------------------------------------------------------- a row

/** What names one row of Your accounts: its source and, for a source with a binding, the value it is for. */
export interface ConnectionRef {
  source: string
  bindingValue?: string
  /** a space it serves, when that is all that is known of the value (About, UI-CONV-049) */
  spaceId?: string
}

/** A stable key of a row: source and the value of its binding. */
export function connectionKeyOf(c: { source: string; binding?: { value: string } | null }): string {
  return `${c.source}\u0000${c.binding?.value ?? ''}`
}

/**
 * The row a card, a link or a space names (PROF-TOOL-020): the source and the value of its binding when it gives
 * one; else one of the source that serves the space it names; else the source's only or first row.
 */
export function connectionFor(connections: readonly Connection[], ref: ConnectionRef): Connection | undefined {
  const ofSource = connections.filter((c) => c.source === ref.source)
  if (ref.bindingValue !== undefined) return ofSource.find((c) => c.binding?.value === ref.bindingValue)
  if (ref.spaceId) {
    const serving = ofSource.find((c) => c.usedIn.some((u) => u.kind === 'space' && u.id === ref.spaceId))
    if (serving) return serving
  }
  return ofSource[0]
}

/**
 * The space a sign-in or the fields of a row are for (PROF-TOOL-015, PROF-TOOL-016): `spaceId` is required for a
 * source of a space's template. A row that also serves every conversation or Personal is the agent's or Personal's;
 * else the first space it serves.
 */
export function spaceIdFor(c: Pick<Connection, 'usedIn'>): string | undefined {
  if (c.usedIn.some((u) => u.kind === 'agent' || u.kind === 'personal')) return undefined
  const space = c.usedIn.find((u) => u.kind === 'space')
  return space?.kind === 'space' ? space.id : undefined
}

/** Where an account serves, for its words (UI-CONV-058): every conversation, the places it serves in order, nothing. */
export type ConnectionUsage =
  | { kind: 'all' }
  | { kind: 'places'; personal: boolean; spaces: string[] }
  | { kind: 'none' }

export function usageOfConnection(c: Pick<Connection, 'usedIn'>): ConnectionUsage {
  if (c.usedIn.some((u) => u.kind === 'agent')) return { kind: 'all' }
  const personal = c.usedIn.some((u) => u.kind === 'personal')
  const spaces = c.usedIn.flatMap((u) => (u.kind === 'space' ? [u.title] : []))
  return personal || spaces.length ? { kind: 'places', personal, spaces } : { kind: 'none' }
}

/** A row's state, for its words (UI-CONV-058). */
export type ConnectionStateKey = 'notConnected' | 'connected' | 'moreAccess' | ReconnectReason

export function connectionStateKeyOf(c: Pick<Connection, 'state' | 'reason' | 'moreAccess'>): ConnectionStateKey {
  if (c.state === 'reconnect') return c.reason ?? 'changed'
  if (c.state === 'connected') return c.moreAccess ? 'moreAccess' : 'connected'
  return 'notConnected'
}

/** The controls of a row (UI-CONV-053): Connect; Disconnect; Reconnect and Disconnect for reconnect and moreAccess. */
export function connectionControlsOf(
  c: Pick<Connection, 'state' | 'moreAccess'>
): ('connect' | 'reconnect' | 'disconnect')[] {
  if (c.state === 'not-connected') return ['connect']
  if (c.state === 'reconnect' || c.moreAccess) return ['reconnect', 'disconnect']
  return ['disconnect']
}

/** What the line of one source of an account says (UI-CONV-063): allowed, allowed in part, not allowed. */
export type AccessStateKey = 'allowed' | 'allowedInPart' | 'notAllowed'

/** One line under the row of an account with `access` (UI-CONV-061), with its control. */
export interface AccessLine {
  /** the source its control signs in for (PROF-TOOL-029) */
  source: string
  title: string
  key: AccessStateKey
  /** for `allowedInPart`, the tools not allowed, said on a second line ("Not allowed: Create a file") */
  missing: string[]
  /** Allow for a source not allowed, Allow more for one allowed in part, none for one allowed */
  control: 'allow' | 'allowMore' | null
}

/**
 * The lines under the row of an account with `access` (UI-CONV-061), one per source, in the agent's order: "<source>:
 * allowed" with no control; "<source>: allowed in part", the tools not allowed, and Allow more; "<source>: not allowed"
 * and Allow. The row keeps its own state and controls (`connectionControlsOf`); an item with no `access` has none.
 */
export function accessLinesOf(c: Pick<Connection, 'access'>): AccessLine[] {
  return c.access.map((a) => ({
    source: a.source,
    title: a.title,
    key: a.allowed === 'all' ? 'allowed' : a.allowed === 'some' ? 'allowedInPart' : 'notAllowed',
    missing: a.allowed === 'some' ? a.missing : [],
    control: a.allowed === 'all' ? null : a.allowed === 'some' ? 'allowMore' : 'allow',
  }))
}

/** The source a Connect card's button signs in for (PROF-TOOL-029): the source of `allow`, else the card's account. */
export function signInSourceOfCard(card: Pick<ConnectCard, 'source' | 'why' | 'allow'>): string {
  return card.why === 'allow' && card.allow ? card.allow.source : card.source
}

/**
 * What a Connect card says of the account it names (UI-CONV-057, UI-CONV-061), from its row of Your accounts, or from
 * the card alone while the row is not known: `connect` (its words and Connect), `reconnect` (the words of its reason and
 * Reconnect), `allow` ("Allow <feature> on your <account> account." and Allow: a card of `why: 'allow'` whose account is
 * connected and whose source of `allow` is not allowed in full), `connected` ("Connected as <label>", no control). Every
 * button signs in for `signInSourceOfCard`.
 */
export type ConnectCardState = 'connect' | 'reconnect' | 'allow' | 'connected'

export function connectCardStateOf(
  card: Pick<ConnectCard, 'why' | 'allow'>,
  row: Pick<Connection, 'state' | 'moreAccess' | 'access'> | undefined
): ConnectCardState {
  if (!row) return card.why
  if (row.state === 'reconnect' || row.moreAccess) return 'reconnect'
  if (row.state !== 'connected') return 'connect'
  const allowing =
    card.why === 'allow' && card.allow ? row.access.find((a) => a.source === card.allow?.source) : undefined
  return allowing && allowing.allowed !== 'all' ? 'allow' : 'connected'
}

/** Whether an attempt still waits, by this device's clock. */
export function attemptWaits(attempt: { expiresAt: string } | null | undefined, now: number): boolean {
  if (!attempt) return false
  const at = Date.parse(attempt.expiresAt)
  return !Number.isFinite(at) || at > now
}

/**
 * What the person is told of an outcome, under the row it names (UI-CONV-058); null for one that says nothing more
 * than the row's new state (`ended`). `disconnected` reads as after the person's own Disconnect.
 */
export type ConnectionNotice =
  | { key: 'connected'; label: string }
  | { key: 'denied' | 'failed' | 'expired' | 'cancelled' | 'wrongPerson' | 'unavailable' | 'disconnected' }
  | { key: 'wrongBinding'; expected: string; chosen: string }

export function outcomeNoticeOf(
  change: Pick<ConnectionsChange, 'outcome' | 'label' | 'expected' | 'chosen'>
): ConnectionNotice | null {
  switch (change.outcome) {
    case 'connected':
      return { key: 'connected', label: change.label ?? '' }
    case 'denied':
    case 'failed':
    case 'expired':
    case 'cancelled':
    case 'unavailable':
    case 'disconnected':
      return { key: change.outcome }
    case 'wrong-person':
      return { key: 'wrongPerson' }
    case 'wrong-binding':
      return { key: 'wrongBinding', expected: change.expected ?? '', chosen: change.chosen ?? '' }
    default:
      return null
  }
}

/**
 * Where a refusal of a request of §3.11 is shown (UI-CONV-055, UI-CONV-058): at the field of an account of fields
 * it names (`account.<name>`), or under the row. `changed` asks the person to open Your accounts again: the account is
 * no longer of the method the row showed (`409 not-oauth`, `409 not-fields`), or its fields changed (a `400`).
 * `keysUnavailable`: `503 keys-unavailable`, the agent's key service did not answer (PROF-TOOL-032, UI-CONV-063).
 */
export type ConnectionRefusal =
  | { at: 'field'; field: string; reason: 'badToken' }
  | { at: 'row'; reason: 'unavailable' | 'keysUnavailable' | 'notOffered' | 'changed' | 'wrongPerson' | 'other' }
  | { at: 'row'; reason: 'wrongBinding'; expected: string; chosen: string }

export function connectionRefusalOf(
  error: { status?: number; code?: string; field?: string; expected?: string; chosen?: string } | undefined
): ConnectionRefusal {
  const code = error?.code
  const field = error?.field ?? ''
  const accountField = field.startsWith('account.') ? field.slice('account.'.length) : null
  if (code === 'bad-token' && accountField) return { at: 'field', field: accountField, reason: 'badToken' }
  if (code === 'wrong-binding')
    return { at: 'row', reason: 'wrongBinding', expected: error?.expected ?? '', chosen: error?.chosen ?? '' }
  if (code === 'wrong-person') return { at: 'row', reason: 'wrongPerson' }
  if (code === 'keys-unavailable') return { at: 'row', reason: 'keysUnavailable' }
  if (code === 'source-unavailable' || error?.status === 502) return { at: 'row', reason: 'unavailable' }
  if (code === 'not-oauth' || code === 'not-fields' || code === 'bad-token' || error?.status === 400)
    return { at: 'row', reason: 'changed' }
  if (error?.status === 404) return { at: 'row', reason: 'notOffered' }
  return { at: 'row', reason: 'other' }
}

/**
 * What follows Disconnect (UI-CONV-056): the service may still list the agent, unless the agent revoked it there; and
 * when the answer says the agent could not tell the service (`revokedAtSource: false`, PROF-TOOL-032), the person is
 * told to remove its access there (UI-CONV-063). The outcome `disconnected` of another device carries no answer.
 */
export function disconnectedKeyOf(
  c: Pick<Connection, 'revokesAtSource'>,
  revokedAtSource?: boolean
): 'disconnected' | 'disconnectedRevoked' | 'disconnectedNotTold' {
  if (revokedAtSource === false) return 'disconnectedNotTold'
  return c.revokesAtSource ? 'disconnectedRevoked' : 'disconnected'
}

/** The answer of Disconnect (PROF-TOOL-017): its item and, when it says it, `revokedAtSource`; null for no item. */
export function disconnectedAccountOf(body: unknown): DisconnectedAccount | null {
  const b = obj(body)
  const connection = connectionOf(b.connection)
  if (!connection) return null
  return { connection, ...(typeof b.revokedAtSource === 'boolean' ? { revokedAtSource: b.revokedAtSource } : {}) }
}

/**
 * The date an account was connected, in the person's locale's short form (UI-CONV-058, "since 21 Nov"): the day and
 * the month, and the year when it is not this one.
 */
export function sinceDateOf(iso: string, locale: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(d)
}

/**
 * Whether a client may point the sign-in's tab at the URL the agent gave (PROF-TOOL-018): the service's sign-in over
 * HTTPS, or over HTTP on this computer only (a service in development). Anything else, a `javascript:` URL above all,
 * would run in a tab of this page's origin.
 */
export function signInUrlAllowed(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return true
    return (
      u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
    )
  } catch {
    return false
  }
}
