/**
 * Admin access from the agent's card (AG-UI profile 3.5.5 §3.14, PROF-DESC-013, PROF-ADMIN-001 to 007; agent D132 to
 * D134; UI-ADMIN-001 to 006, APP-ADMIN-001 to 004): the roles `auditor` and `operator`, Show Admin and Hide Admin, the
 * admin grant the phone's re-authentication opens for one device, the ADMIN area of the card while it is open, and the
 * pages Audit and Operations, each read and each action with its reason.
 *
 * The wire shapes are package 3.5.5's (ayni-agent #120, `packages/agui-profile`), written here while that version is not
 * on npm, as the core did for 3.3 to 3.5.4; the rules a screen follows (which entry the menu shows, when the area shows
 * and hides, the words of a request and of a refusal) are this module's, shared by the browser and the Ayni app.
 */

// ---- the shapes of profile 3.5.5 (§3.14), as ayni-agent #120 serves them -----------------------------------------------

/** `ayni.admin.changed` (§5, PROF-ADMIN-004). */
export const ADMIN_CHANGED = 'ayni.admin.changed'

/** The two roles of admin access, which nothing else reads (agent RBAC-XSESS-008). */
export type AdminRoleName = 'auditor' | 'operator'

export const ADMIN_ROLE_NAMES: readonly AdminRoleName[] = ['auditor', 'operator']

/** A device's open admin grant: its end, counted from the phone's confirmation (agent RBAC-ADMIN-003). */
export interface AdminGrantState {
  open: true
  expiresAt: string
}

/**
 * `GET {sessions}/admin` (PROF-ADMIN-001): the admin roles the Principal holds and the device's open grant; to a person
 * who holds neither role, `{ roles: [] }` and nothing else.
 */
export type AdminStateResponse = { roles: [] } | { roles: AdminRoleName[]; grant: AdminGrantState | null }

/** `POST {sessions}/admin/grant` → `202` at once (PROF-ADMIN-002): the outcome comes as `ayni.admin.changed`. */
export interface AdminGrantRequestResponse {
  requestId: string
  /** when the request stops waiting for the phone */
  expiresAt: string
}

/** What became of a request (`declined`, `failed`, `expired`) or of a grant (`opened`, `ended`). */
export type AdminOutcome = 'opened' | 'declined' | 'failed' | 'expired' | 'ended'

/** The value of `ayni.admin.changed`, to every bound session of the device. */
export interface AdminChangedValue {
  roles: AdminRoleName[]
  grant: AdminGrantState | null
  outcome?: AdminOutcome
}

/** Every answer of Audit and Operations names the record of the admin audit the call wrote. */
export interface AdminAudited {
  auditId: string
}

/** One conversation of `GET {sessions}/admin/audit/conversations?principal=&space=&from=&to=&reason=`. */
export interface AuditConversation {
  id: string
  principalId: string
  spaceId: string
  title: string
  state: 'active' | 'archived' | 'final'
  createdAt: string
  lastActivityAt: string
}

/** Newest activity first. */
export interface AuditConversationsResponse extends AdminAudited {
  conversations: AuditConversation[]
}

/**
 * `GET {sessions}/admin/audit/conversations/{id}/messages?before=&limit=&reason=`: the entries, decrypted, in the shapes
 * of §8, each page oldest first; an erased entry reads `[erased]`.
 */
export interface AuditMessagesResponse extends AdminAudited {
  messages: Record<string, unknown>[]
  nextBefore: string | null
}

/** `GET {sessions}/admin/audit/evidence?principal=&reason=`: each record's audit fields and the values stored. */
export interface AuditEvidenceResponse extends AdminAudited {
  evidence: { record: Record<string, unknown>; values: Record<string, string> }[]
}

/**
 * `GET {sessions}/admin/audit/tool-calls?principal=&space=&conversation=&source=&from=&to=&reason=` (agent
 * TOOL-PROV-005): the call records, newest first, with no argument, no result and no account value.
 */
export interface AuditToolCallsResponse extends AdminAudited {
  calls: Record<string, unknown>[]
}

/** One record of the admin audit: who (the verified Principal and the grant, or the break-glass token), why, what. */
export interface AdminAuditItem {
  id: string
  ts: string
  action: string
  actor: string
  principalId?: string
  grantId?: string
  breakGlass?: boolean
  reason: string
  detail: Record<string, unknown>
}

/** `GET {sessions}/admin/audit/log?before=&limit=&reason=`: newest first. */
export interface AuditLogResponse extends AdminAudited {
  records: AdminAuditItem[]
  nextBefore: string | null
}

/** `POST {sessions}/admin/operations/erase`. */
export interface EraseRequest {
  entryIds: string[]
  reason: string
}

/** What was erased (with the cascade), what a legal hold kept, what was not found. */
export interface EraseResponse extends AdminAudited {
  erased: string[]
  held: string[]
  notFound: string[]
}

/** `POST {sessions}/admin/operations/legal-hold`: entries, or every entry of a conversation. */
export interface LegalHoldRequest {
  entryIds?: string[]
  conversationId?: string
  hold: boolean
  reason: string
}

export interface LegalHoldResponse extends AdminAudited {
  changed: string[]
  skipped: string[]
}

/** The two keys of Operations. */
export type AdminKeyName = 'master' | 'index'

/** One key of `GET {sessions}/admin/operations/keys?reason=`: its versions, a rotation's progress. */
export interface KeyStatus {
  key: AdminKeyName
  versions: { version: number; current: boolean; wraps: number | null }[]
  rotation: { from: number; to: number; done: number; total: number } | null
  /** whether `POST {sessions}/admin/operations/keys/{key}/rotate` can rotate it */
  rotatable: boolean
}

export interface KeysResponse extends AdminAudited {
  keys: KeyStatus[]
  /** when the key service last answered; null while the agent has none */
  keyService: { lastAnsweredAt: string } | null
}

// ---- the readers -----------------------------------------------------------------------------------------------------

/** What a client knows of its admin access with one agent: the person's admin roles and the device's open grant. */
export interface AdminAccess {
  roles: AdminRoleName[]
  /** the device's open grant, by its end; null without one */
  grant: { expiresAt: string } | null
}

/** Whether the agent serves admin access (PROF-DESC-013): without it, no Show Admin. */
export function takesAdmin(features: object | null | undefined): boolean {
  // read loosely: the descriptor's type gains the field with the profile package that declares it (3.5.5)
  return (features as { admin?: unknown } | null | undefined)?.admin === true
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function rolesOf(v: unknown): AdminRoleName[] {
  const held = strings(v)
  return ADMIN_ROLE_NAMES.filter((r) => held.includes(r))
}

function grantOf(v: unknown): AdminAccess['grant'] {
  if (!isRecord(v) || v.open !== true) return null
  const expiresAt = str(v.expiresAt)
  return expiresAt && !Number.isNaN(Date.parse(expiresAt)) ? { expiresAt } : null
}

/**
 * The answer of `GET {sessions}/admin` (PROF-ADMIN-001); roles other than the two are not admin roles, and a person
 * without one holds no grant.
 */
export function adminAccessOf(body: unknown): AdminAccess {
  const b = isRecord(body) ? body : {}
  const roles = rolesOf(b.roles)
  return { roles, grant: roles.length ? grantOf(b.grant) : null }
}

/** The value of `ayni.admin.changed` (PROF-ADMIN-004), or null for one that is not. */
export function adminChangedOf(value: unknown): { access: AdminAccess; outcome?: AdminOutcome } | null {
  if (!isRecord(value) || !Array.isArray(value.roles)) return null
  const outcome = (['opened', 'declined', 'failed', 'expired', 'ended'] as const).find((o) => o === value.outcome)
  return { access: adminAccessOf(value), ...(outcome ? { outcome } : {}) }
}

/** Whether the grant is open now, by this client's own clock too (PROF-ADMIN-004). */
export function grantOpen(access: AdminAccess | undefined, now: number): boolean {
  return !!access?.grant && Date.parse(access.grant.expiresAt) > now
}

/**
 * The entry of the agent's menu (UI-ADMIN-001, APP-ADMIN-001): Show Admin to a person who holds an admin role while the
 * device holds no open grant, Hide Admin while it holds one, none to anyone else or for an agent that does not serve
 * admin access.
 */
export function adminMenuEntryOf(
  features: object | null | undefined,
  access: AdminAccess | undefined,
  now: number
): 'showAdmin' | 'hideAdmin' | null {
  if (!takesAdmin(features) || !access?.roles.length) return null
  return grantOpen(access, now) ? 'hideAdmin' : 'showAdmin'
}

/** The pages of the ADMIN area. */
export type AdminPage = 'audit' | 'operations'

/**
 * The ADMIN area of the agent's card (UI-ADMIN-003, APP-ADMIN-003): shown exactly while the grant is open, with Audit
 * for an `auditor` and Operations for an `operator`, and the grant's end; null hides it.
 */
export function adminAreaOf(
  access: AdminAccess | undefined,
  now: number
): { pages: AdminPage[]; expiresAt: string } | null {
  if (!access || !grantOpen(access, now) || !access.grant) return null
  const pages: AdminPage[] = []
  if (access.roles.includes('auditor')) pages.push('audit')
  if (access.roles.includes('operator')) pages.push('operations')
  return pages.length ? { pages, expiresAt: access.grant.expiresAt } : null
}

/** The role a page needs (PROF-ADMIN-005, PROF-ADMIN-006). */
export const ADMIN_PAGE_ROLE: Record<AdminPage, AdminRoleName> = { audit: 'auditor', operations: 'operator' }

/** Whether a page may stay open: the grant open and the role held (UI-ADMIN-003). */
export function adminPageOpen(access: AdminAccess | undefined, page: AdminPage, now: number): boolean {
  return !!adminAreaOf(access, now)?.pages.includes(page)
}

/**
 * Show Admin, as the card says it (UI-ADMIN-002): waiting for the phone until `ayni.admin.changed` arrives, then the
 * request that opened no grant. A request that opened one leaves nothing to say: the area shows.
 */
export type AdminRequestState =
  | { status: 'waiting'; requestId: string; expiresAt: string }
  | { status: 'declined' | 'failed' | 'expired' }

/**
 * What a change does to the request on screen: an outcome of a request (`opened`, `declined`, `failed`, `expired`) ends
 * the one that waits; `ended` speaks of a grant, not of a request, and leaves it as it was.
 */
export function adminRequestAfter(
  request: AdminRequestState | undefined,
  outcome: AdminOutcome | undefined
): AdminRequestState | undefined {
  if (outcome === 'opened') return undefined
  if (outcome === 'declined' || outcome === 'failed' || outcome === 'expired') return { status: outcome }
  return request
}

/** The words of a request on the card, by their path in the translation files (UI-ADMIN-002). */
export function adminRequestWordsOf(request: AdminRequestState): string {
  switch (request.status) {
    case 'waiting':
      return 'adminAccess.request.waiting'
    case 'expired':
      return 'adminAccess.request.expired'
    default:
      // a declined request and one that failed are both not confirmed on the phone
      return 'adminAccess.request.notConfirmed'
  }
}

/**
 * A refusal of Audit or Operations (PROF-ADMIN-007), as a screen says it (UI-ADMIN-006): `ended` the grant is gone (the
 * page closes), `noRole` the person lost the role, `reason` no reason; null for any other answer.
 */
export function adminRefusalOf(error: unknown): 'ended' | 'noRole' | 'reason' | null {
  const e = error as { status?: unknown; code?: unknown } | null | undefined
  if (e?.status === 403 && e.code === 'admin-closed') return 'ended'
  if (e?.status === 403 && (e.code === 'not-auditor' || e.code === 'not-operator')) return 'noRole'
  if (e?.status === 400 && e.code === 'reason-required') return 'reason'
  return null
}

/** The words of a refusal, by their path in the translation files (UI-ADMIN-006). */
export const ADMIN_REFUSAL_WORDS = {
  ended: 'adminAccess.ended',
  noRole: 'adminAccess.noRole',
  reason: 'adminAccess.reasonRequired',
} as const

/** A reason the agent takes: at least one letter or digit (agent RBAC-ADMIN-006). */
export function adminReasonFits(reason: string): boolean {
  return /[\p{L}\p{N}]/u.test(reason.trim())
}

/**
 * A period typed as two days (`YYYY-MM-DD`, either may be empty): from the start of the first to the end of the last,
 * in the person's own time zone, as the agent takes them (ISO times).
 */
export function auditPeriodOf(from: string, to: string): { from?: string; to?: string } {
  const day = (value: string, end: boolean): string | undefined => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
    if (!m) return undefined
    const d = end
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
      : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const f = day(from, false)
  const t = day(to, true)
  return { ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) }
}

/** The ids typed for an operation: separated by spaces, commas or lines, each once, in the order typed. */
export function entryIdsOf(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).filter(Boolean))]
}

const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : [])
const auditIdOf = (b: Record<string, unknown>) => str(b.auditId) ?? ''

export function auditConversationsOf(body: unknown): AuditConversationsResponse {
  const b = isRecord(body) ? body : {}
  const conversations = records(b.conversations)
    .filter((c) => str(c.id))
    .map(
      (c): AuditConversation => ({
        id: String(c.id),
        principalId: str(c.principalId) ?? '',
        spaceId: str(c.spaceId) ?? '',
        title: typeof c.title === 'string' ? c.title : '',
        state: c.state === 'archived' || c.state === 'final' ? c.state : 'active',
        createdAt: str(c.createdAt) ?? '',
        lastActivityAt: str(c.lastActivityAt) ?? '',
      })
    )
  return { conversations, auditId: auditIdOf(b) }
}

export function auditMessagesOf(body: unknown): AuditMessagesResponse {
  const b = isRecord(body) ? body : {}
  return { messages: records(b.messages), nextBefore: str(b.nextBefore) ?? null, auditId: auditIdOf(b) }
}

export function auditEvidenceOf(body: unknown): AuditEvidenceResponse {
  const b = isRecord(body) ? body : {}
  const evidence = records(b.evidence).map((e) => ({
    record: isRecord(e.record) ? e.record : {},
    values: Object.fromEntries(
      Object.entries(isRecord(e.values) ? e.values : {}).filter((x): x is [string, string] => typeof x[1] === 'string')
    ),
  }))
  return { evidence, auditId: auditIdOf(b) }
}

export function auditToolCallsOf(body: unknown): AuditToolCallsResponse {
  const b = isRecord(body) ? body : {}
  return { calls: records(b.calls), auditId: auditIdOf(b) }
}

export function auditLogOf(body: unknown): AuditLogResponse {
  const b = isRecord(body) ? body : {}
  const items = records(b.records)
    .filter((r) => str(r.id))
    .map(
      (r): AdminAuditItem => ({
        id: String(r.id),
        ts: str(r.ts) ?? '',
        action: str(r.action) ?? '',
        actor: str(r.actor) ?? '',
        ...(str(r.principalId) ? { principalId: str(r.principalId) } : {}),
        ...(str(r.grantId) ? { grantId: str(r.grantId) } : {}),
        ...(r.breakGlass === true ? { breakGlass: true } : {}),
        reason: typeof r.reason === 'string' ? r.reason : '',
        detail: isRecord(r.detail) ? r.detail : {},
      })
    )
  return { records: items, nextBefore: str(b.nextBefore) ?? null, auditId: auditIdOf(b) }
}

export function eraseOf(body: unknown): EraseResponse {
  const b = isRecord(body) ? body : {}
  return { erased: strings(b.erased), held: strings(b.held), notFound: strings(b.notFound), auditId: auditIdOf(b) }
}

export function legalHoldOf(body: unknown): LegalHoldResponse {
  const b = isRecord(body) ? body : {}
  return { changed: strings(b.changed), skipped: strings(b.skipped), auditId: auditIdOf(b) }
}

export function keysOf(body: unknown): KeysResponse {
  const b = isRecord(body) ? body : {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const keys = records(b.keys)
    .filter((k) => k.key === 'master' || k.key === 'index')
    .map(
      (k): KeyStatus => ({
        key: k.key as AdminKeyName,
        versions: records(k.versions).map((v) => ({
          version: num(v.version),
          current: v.current === true,
          wraps: typeof v.wraps === 'number' ? v.wraps : null,
        })),
        rotation: isRecord(k.rotation)
          ? {
              from: num(k.rotation.from),
              to: num(k.rotation.to),
              done: num(k.rotation.done),
              total: num(k.rotation.total),
            }
          : null,
        rotatable: k.rotatable === true,
      })
    )
  const service = isRecord(b.keyService) ? str(b.keyService.lastAnsweredAt) : undefined
  return { keys, keyService: service ? { lastAnsweredAt: service } : null, auditId: auditIdOf(b) }
}

/** A field of a record, as a screen shows it: a scalar as text, anything else as compact JSON, nothing for none. */
export function auditValueOf(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** The fields of a call record a screen lists first (agent TOOL-PROV-005), in this order; the others after them. */
export const TOOL_CALL_FIELDS = [
  'at',
  'principalId',
  'spaceId',
  'conversationId',
  'sourceId',
  'toolName',
  'rule',
  'outcome',
] as const

/** The icons of the rows of the ADMIN area, as lucide names (the menu's entries are in `MENU_ICON`). */
export const ADMIN_AREA_ICON: Record<AdminPage, 'file-search' | 'wrench'> = {
  audit: 'file-search',
  operations: 'wrench',
}

/**
 * The English wording of admin access (UI-ADMIN-001 to 006), written once for the browser and the Ayni app: the
 * browser's English translation file must say the same (a test compares them). Keys are paths in the translation file;
 * `{{name}}` marks what the screen puts in. The spec gives "Show Admin", "Hide Admin", "Confirm on your phone", "Not
 * confirmed on your phone", "The request expired", "Admin", "Audit", "Operations", "Until 14:32", "Admin access ended",
 * "You don't have this role any more" and "Say why you need this"; the others are this client's own.
 */
export const ADMIN_COPY = {
  'adminAccess.show': 'Show Admin',
  'adminAccess.hide': 'Hide Admin',
  'adminAccess.request.waiting': 'Confirm on your phone',
  'adminAccess.request.notConfirmed': 'Not confirmed on your phone',
  'adminAccess.request.expired': 'The request expired',
  'adminAccess.area': 'Admin',
  'adminAccess.until': 'Until {{time}}',
  'adminAccess.audit': 'Audit',
  'adminAccess.operations': 'Operations',
  'adminAccess.ended': 'Admin access ended',
  'adminAccess.noRole': "You don't have this role any more",
  'adminAccess.reasonRequired': 'Say why you need this',
  'adminAccess.reason': 'Reason',
  'adminAccess.reasonInForce': 'Reason: {{reason}}',
  'adminAccess.changeReason': 'Change',
  'adminAccess.useReason': 'Continue',
} as const
