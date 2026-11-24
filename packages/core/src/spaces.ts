/**
 * Spaces (AG-UI profile 3.3 §3.7, PROF-SPACE-001..007, agent D80 to D84; UI-CONV-028..031, 038..041, 043): one piece
 * of work in one agent, with its own purpose, people and rules. Every conversation belongs to one; the person's own is
 * Personal. The wire types are written here until the profile package of 3.3 is the one every client has; the rules a
 * screen follows (which rows the agent's card shows, when a chip shows, how members and rules read) are here too, so
 * that the browser and the Ayni app apply the same ones.
 */

export type SpaceKind = 'personal' | 'team' | 'organization'
export type SpaceRole = 'owner' | 'member' | 'guest'
export type LawfulBasis = 'consent' | 'contract' | 'legitimate-interest'

/** What a space keeps and how (agent D84). */
export interface SpaceRules {
  /** days a conversation of the space is kept; null when the agent keeps it with no limit */
  retentionDays: number | null
  lawfulBasis: LawfulBasis | string
  /** the model providers that may process its conversations */
  allowedProviders: string[]
  /** a conversation may be shared with the space (agent D83) */
  handover: boolean
  /**
   * minutes an approval of the space waits, per kind of approval (`tool-call`, profile 3.5.4, agent D138); none for
   * Personal
   */
  approvalTimeouts?: Record<string, number>
}

/** Membership by rule, over verified facts: one department, one group, or the whole organization (agent D81). */
export interface SpaceMembershipRule {
  department?: string
  group?: string
  organization?: true
}

export interface SpaceMembership {
  mode: 'rule' | 'list'
  rule?: SpaceMembershipRule
  memberCount: number
}

/** A space as `GET {sessions}/spaces` gives it (PROF-SPACE-001). */
export interface SpaceInfo {
  id: string
  kind: SpaceKind
  /** Personal's title is the agent's word: a UI writes its own (`personalTitle`) */
  title: string
  purpose: string
  brief: string
  templateId: string | null
  /** a BCP 47 tag: what the agent writes for the space is in it; null when the space has none */
  language: string | null
  rules: SpaceRules
  membership: SpaceMembership
  /** null while the space has no owner: its owner left with no successor, until a steward names one (agent D136) */
  owner: { name: string } | null
  /**
   * the owner's answers only: the person who becomes the owner when the owner's entry leaves the directory, or null
   * (profile 3.5.4, PROF-SPACE-008)
   */
  successor?: { name: string } | null
  /** the person's role in it */
  role: SpaceRole
  /** `left`: the person reads their conversations of it and writes no more (agent SPACE-MEMB-004) */
  state: 'active' | 'left'
  /** the unread messages of the person's own conversations of it */
  unread: number
  /**
   * how many of its notifications wait for the person (profile §3.7, §3.12, agent D114): the badge of its row and of
   * its Notifications, from an agent that declares `features.notifications`
   */
  notificationsWaiting?: number
  lastActivityAt: string
}

/**
 * What a template lets an owner choose, when the agent gives it (`rules` of a template). The profile names the
 * template's bounds (PROF-SPACE-004) without giving them in §3.7: a UI offers these values when it has them, and
 * otherwise lets the agent refuse what lies outside (`422 out-of-bounds`, naming the field).
 */
export interface TemplateBounds {
  retentionDays?: { min?: number; max?: number }
  lawfulBasis?: string[]
  allowedProviders?: string[]
  handover?: boolean[]
  /** per kind of approval, in minutes (profile 3.5.4, agent D138) */
  approvalTimeouts?: Record<string, { default?: number; min?: number; max?: number }>
}

/** A template the person may create a space from (PROF-SPACE-001). */
export interface SpaceTemplate {
  id: string
  title: string
  kind: Exclude<SpaceKind, 'personal'>
  membership: 'rule' | 'list'
  bounds?: TemplateBounds
}

export interface Spaces {
  spaces: SpaceInfo[]
  templates: SpaceTemplate[]
}

/** A member of a list space (PROF-SPACE-003). */
export interface SpaceMember {
  memberId: string
  /** the invited email until the invitation binds */
  name: string
  organization: string | null
  state: 'active' | 'invited' | 'left'
  role: SpaceRole
}

/** `GET {sessions}/spaces/{id}`: the space and, for an active member of a list space, its members. */
export interface SpaceDetail extends SpaceInfo {
  members?: SpaceMember[]
}

/** `PATCH {sessions}/spaces/{id}` (PROF-SPACE-004). */
export interface SpacePatch {
  title?: string
  purpose?: string
  brief?: string
  language?: string | null
  rules?: Partial<SpaceRules>
}

export type SpaceActivityKind =
  | 'created'
  | 'joined'
  | 'left'
  | 'invited'
  | 'removed'
  | 'owner-changed'
  /** the owner named a successor, or it was cleared (profile 3.5.4, PROF-SPACE-008) */
  | 'successor-set'
  | 'successor-cleared'
  | 'rules-changed'
  | 'shared'
  | 'unshared'
  /** the changes of the space's tools (profile 3.4, PROF-TOOL-006) */
  | 'tool-added'
  | 'tool-changed'
  | 'tool-removed'
  | 'account-set'
  | 'account-cleared'

export const SPACE_ACTIVITY_KINDS: readonly SpaceActivityKind[] = [
  'created',
  'joined',
  'left',
  'invited',
  'removed',
  'owner-changed',
  'successor-set',
  'successor-cleared',
  'rules-changed',
  'shared',
  'unshared',
  'tool-added',
  'tool-changed',
  'tool-removed',
  'account-set',
  'account-cleared',
]

/** One line of a space's activity, newest first (PROF-SPACE-006). */
export interface SpaceActivityItem {
  at: string
  kind: SpaceActivityKind
  member?: { name: string }
  /** the source a change of the space's tools concerns (PROF-TOOL-006) */
  tool?: { source: string; title: string }
  by?: { name: string }
  /** an `owner-changed`: how (profile 3.5.4), and a steward's reason (PROF-SPACE-009) */
  how?: OwnerChange
  reason?: string
}

/** How the owner of a space changed (agent SPACE-MEMB-012). */
export type OwnerChange = 'handover' | 'succession' | 'steward'

export interface SpaceActivityPage {
  activity: SpaceActivityItem[]
  nextBefore: string | null
}

/** A conversation shared with a space, as its members list it (PROF-SPACE-007). */
export interface SharedConversation {
  id: string
  title: string
  author: { name: string }
  sharedAt: string
  lastActivityAt: string
}

/** The space of a conversation, in its state (`state.ayni.space`, PROF-STREAM-009). */
export interface SpaceRef {
  id: string
  title: string
  kind: SpaceKind
}

// ---------------------------------------------------------------------------------------------------- reading

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})

function kindOf(v: unknown): SpaceKind {
  return v === 'personal' || v === 'team' || v === 'organization' ? v : 'team'
}

function ruleOf(v: unknown): SpaceMembershipRule | undefined {
  const r = obj(v)
  if (typeof r.department === 'string') return { department: r.department }
  if (typeof r.group === 'string') return { group: r.group }
  if (r.organization === true) return { organization: true }
  return undefined
}

/** The minutes of each kind of approval, as a space's rules give them; undefined when there are none. */
function timeoutsOf(value: unknown): Record<string, number> | undefined {
  const out: Record<string, number> = {}
  for (const [kind, minutes] of Object.entries(obj(value)))
    if (typeof minutes === 'number' && Number.isFinite(minutes)) out[kind] = minutes
  return Object.keys(out).length ? out : undefined
}

/** A space as the agent gives it, with what is missing filled in; null for one with no id. */
export function spaceOf(value: unknown): SpaceInfo | null {
  const s = obj(value)
  if (typeof s.id !== 'string' || !s.id) return null
  const rules = obj(s.rules)
  const membership = obj(s.membership)
  const mode = membership.mode === 'rule' ? 'rule' : 'list'
  const kind = kindOf(s.kind)
  return {
    id: s.id,
    kind,
    title: str(s.title),
    purpose: str(s.purpose),
    brief: str(s.brief),
    templateId: strOrNull(s.templateId),
    language: strOrNull(s.language),
    rules: {
      retentionDays: typeof rules.retentionDays === 'number' ? rules.retentionDays : null,
      lawfulBasis: str(rules.lawfulBasis),
      allowedProviders: strings(rules.allowedProviders),
      handover: rules.handover === true,
      ...(timeoutsOf(rules.approvalTimeouts) ? { approvalTimeouts: timeoutsOf(rules.approvalTimeouts) } : {}),
    },
    membership: {
      mode,
      ...(mode === 'rule' && ruleOf(membership.rule) ? { rule: ruleOf(membership.rule) } : {}),
      memberCount: num(membership.memberCount),
    },
    owner: s.owner === null ? null : { name: str(obj(s.owner).name) },
    ...(s.successor === null
      ? { successor: null }
      : typeof obj(s.successor).name === 'string'
        ? { successor: { name: str(obj(s.successor).name) } }
        : {}),
    role: s.role === 'owner' || s.role === 'guest' ? s.role : 'member',
    state: s.state === 'left' ? 'left' : 'active',
    unread: num(s.unread),
    ...(typeof s.notificationsWaiting === 'number' ? { notificationsWaiting: num(s.notificationsWaiting) } : {}),
    lastActivityAt: str(s.lastActivityAt),
  }
}

function boundsOf(value: unknown): TemplateBounds | undefined {
  const r = obj(value)
  if (!Object.keys(r).length) return undefined
  const retention = obj(r.retentionDays)
  const allowed = (v: unknown) => {
    const a = obj(v).allowed
    return Array.isArray(a) ? a : undefined
  }
  const bounds: TemplateBounds = {}
  if (typeof retention.min === 'number' || typeof retention.max === 'number')
    bounds.retentionDays = {
      ...(typeof retention.min === 'number' ? { min: retention.min } : {}),
      ...(typeof retention.max === 'number' ? { max: retention.max } : {}),
    }
  const basis = allowed(r.lawfulBasis)
  if (basis) bounds.lawfulBasis = basis.filter((x): x is string => typeof x === 'string')
  const providers = allowed(r.allowedProviders)
  if (providers) bounds.allowedProviders = providers.filter((x): x is string => typeof x === 'string')
  const handover = allowed(r.handover)
  if (handover) bounds.handover = handover.filter((x): x is boolean => typeof x === 'boolean')
  const timeouts: NonNullable<TemplateBounds['approvalTimeouts']> = {}
  for (const [kind, value] of Object.entries(obj(r.approvalTimeouts))) {
    const t = obj(value)
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    timeouts[kind] = {
      ...(n(t.default) !== undefined ? { default: n(t.default) } : {}),
      ...(n(t.min) !== undefined ? { min: n(t.min) } : {}),
      ...(n(t.max) !== undefined ? { max: n(t.max) } : {}),
    }
  }
  if (Object.keys(timeouts).length) bounds.approvalTimeouts = timeouts
  return Object.keys(bounds).length ? bounds : undefined
}

/** A template as the agent gives it; null for one with no id. */
export function templateOf(value: unknown): SpaceTemplate | null {
  const t = obj(value)
  if (typeof t.id !== 'string' || !t.id) return null
  const bounds = boundsOf(t.rules ?? t.bounds)
  return {
    id: t.id,
    title: str(t.title, t.id),
    kind: t.kind === 'organization' ? 'organization' : 'team',
    membership: t.membership === 'rule' ? 'rule' : 'list',
    ...(bounds ? { bounds } : {}),
  }
}

/** `GET {sessions}/spaces` (PROF-SPACE-001): Personal first, then the others in the agent's order; the templates. */
export function spacesOf(body: unknown): Spaces {
  const b = obj(body)
  const spaces = (Array.isArray(b.spaces) ? b.spaces : []).map(spaceOf).filter((s): s is SpaceInfo => !!s)
  const personal = spaces.filter((s) => s.kind === 'personal')
  return {
    spaces: [...personal, ...spaces.filter((s) => s.kind !== 'personal')],
    templates: (Array.isArray(b.templates) ? b.templates : []).map(templateOf).filter((t): t is SpaceTemplate => !!t),
  }
}

/** `GET {sessions}/spaces/{id}` (PROF-SPACE-003). */
export function spaceDetailOf(body: unknown): SpaceDetail | null {
  const space = spaceOf(body)
  if (!space) return null
  const raw = obj(body).members
  if (!Array.isArray(raw)) return space
  const members = raw
    .map((m) => obj(m))
    .filter((m) => typeof m.memberId === 'string')
    .map(
      (m): SpaceMember => ({
        memberId: m.memberId as string,
        name: str(m.name),
        organization: strOrNull(m.organization),
        state: m.state === 'invited' || m.state === 'left' ? m.state : 'active',
        role: m.role === 'owner' || m.role === 'guest' ? m.role : 'member',
      })
    )
  return { ...space, members }
}

/** `GET {sessions}/spaces/{id}/activity` (PROF-SPACE-006): unknown kinds are left out. */
export function spaceActivityOf(body: unknown): SpaceActivityPage {
  const b = obj(body)
  const activity = (Array.isArray(b.activity) ? b.activity : [])
    .map((a) => obj(a))
    .filter((a) => SPACE_ACTIVITY_KINDS.includes(a.kind as SpaceActivityKind) && typeof a.at === 'string')
    .map(
      (a): SpaceActivityItem => ({
        at: a.at as string,
        kind: a.kind as SpaceActivityKind,
        ...(obj(a.member).name ? { member: { name: str(obj(a.member).name) } } : {}),
        ...(typeof obj(a.tool).source === 'string'
          ? { tool: { source: str(obj(a.tool).source), title: str(obj(a.tool).title, str(obj(a.tool).source)) } }
          : {}),
        ...(obj(a.by).name ? { by: { name: str(obj(a.by).name) } } : {}),
        ...(a.how === 'handover' || a.how === 'succession' || a.how === 'steward' ? { how: a.how } : {}),
        ...(typeof a.reason === 'string' && a.reason ? { reason: a.reason } : {}),
      })
    )
  return { activity, nextBefore: strOrNull(b.nextBefore) }
}

/** `GET {sessions}/spaces/{id}/shared` (PROF-SPACE-007). */
export function sharedConversationsOf(body: unknown): SharedConversation[] {
  const b = obj(body)
  return (Array.isArray(b.conversations) ? b.conversations : [])
    .map((c) => obj(c))
    .filter((c) => typeof c.id === 'string')
    .map((c) => ({
      id: c.id as string,
      title: str(c.title),
      author: { name: str(obj(c.author).name) },
      sharedAt: str(c.sharedAt),
      lastActivityAt: str(c.lastActivityAt, str(c.sharedAt)),
    }))
}

/** The conversation's space in its state (PROF-STREAM-009); null before the agent gave one. */
export function spaceRefOf(ayni: unknown): SpaceRef | null {
  const space = obj(obj(ayni).space)
  if (typeof space.id !== 'string' || !space.id) return null
  return { id: space.id, title: str(space.title), kind: kindOf(space.kind) }
}

// ---------------------------------------------------------------------------------------------------- rules

/** The person's Personal space, when the agent gave the list. */
export function personalSpaceOf(spaces: readonly SpaceInfo[]): SpaceInfo | undefined {
  return spaces.find((s) => s.kind === 'personal')
}

/** The spaces other than Personal: what the agent's card shows as rows (UI-CONV-028). */
export function otherSpacesOf(spaces: readonly SpaceInfo[]): SpaceInfo[] {
  return spaces.filter((s) => s.kind !== 'personal')
}

/** Whether the person has a space other than Personal: until then everything reads as before spaces. */
export function hasOtherSpace(spaces: readonly SpaceInfo[]): boolean {
  return spaces.some((s) => s.kind !== 'personal')
}

/**
 * Whether a conversation is listed with Personal, under the rows of the agent's card (UI-CONV-028): one of Personal,
 * and one whose space this device does not know (yet), so that no conversation is ever out of sight.
 */
export function isPersonalConversation(spaceId: string | undefined, spaces: readonly SpaceInfo[]): boolean {
  if (!spaceId) return true
  const space = spaces.find((s) => s.id === spaceId)
  return !space || space.kind === 'personal'
}

/**
 * The rows of the agent's card (UI-CONV-028): the three spaces with the latest activity, then the rest behind a
 * control that names how many they are. A search shows every space whose title matches, and nothing behind.
 */
export function spaceRowsOf(
  spaces: readonly SpaceInfo[],
  query = '',
  shown = 3
): { rows: SpaceInfo[]; more: SpaceInfo[] } {
  const others = otherSpacesOf(spaces).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
  const q = query.trim().toLowerCase()
  if (q) return { rows: others.filter((s) => s.title.toLowerCase().includes(q)), more: [] }
  return { rows: others.slice(0, shown), more: others.slice(shown) }
}

/**
 * A space's unread count, from the person's own conversations of it on this device: it moves with each reply and each
 * reading, as the conversations do, and adds up into the agent's total like theirs. Before a device lists any of its
 * conversations, the agent's count of the space.
 */
export function spaceUnreadOf(
  space: Pick<SpaceInfo, 'id' | 'unread'>,
  conversations: readonly { spaceId?: string; unreadCount: number }[]
): number {
  const mine = conversations.filter((c) => c.spaceId === space.id)
  return mine.length ? mine.reduce((n, c) => n + c.unreadCount, 0) : space.unread
}

/**
 * The spaces as this device sees them now (UI-CONV-028): each with the unread count of the person's conversations of
 * it here (`spaceUnreadOf`), and with the latest activity of those conversations when it is newer than the agent's.
 */
export function spacesWithLocal(
  spaces: readonly SpaceInfo[],
  conversations: readonly { spaceId?: string; unreadCount: number; lastMessageAt: string }[]
): SpaceInfo[] {
  return spaces.map((space) => {
    const latest = conversations
      .filter((c) => c.spaceId === space.id)
      .reduce((max, c) => (c.lastMessageAt > max ? c.lastMessageAt : max), space.lastActivityAt)
    return { ...space, unread: spaceUnreadOf(space, conversations), lastActivityAt: latest }
  })
}

/** Whether the empty conversation shows the chip of its space (UI-CONV-029): another space, or a template to create one. */
export function showsSpaceChooser(spaces: Spaces | undefined): boolean {
  return !!spaces && (hasOtherSpace(spaces.spaces) || spaces.templates.length > 0)
}

/** Whether the header names the conversation's space (UI-CONV-030): Personal only once there is another. */
export function showsHeaderChip(
  space: Pick<SpaceRef, 'kind'> | null | undefined,
  spaces: readonly SpaceInfo[]
): boolean {
  if (!space) return false
  return space.kind !== 'personal' || hasOtherSpace(spaces)
}

/** The spaces a new conversation may go to (UI-CONV-029): Personal first, then those the person is active in. */
export function chooserSpacesOf(spaces: readonly SpaceInfo[]): SpaceInfo[] {
  const active = spaces.filter((s) => s.state === 'active')
  return [...active.filter((s) => s.kind === 'personal'), ...active.filter((s) => s.kind !== 'personal')]
}

/** How a space's members read: a count of a list, or the rule (UI-CONV-028, UI-CONV-031). */
export type MembersLine =
  | { kind: 'personal' }
  | { kind: 'list'; count: number }
  | { kind: 'department' | 'group'; name: string; count: number }
  | { kind: 'organization'; count: number }
  | { kind: 'rule'; count: number }

export function membersLineOf(space: Pick<SpaceInfo, 'kind' | 'membership'>): MembersLine {
  if (space.kind === 'personal') return { kind: 'personal' }
  const { mode, rule, memberCount: count } = space.membership
  if (mode === 'list') return { kind: 'list', count }
  if (rule?.department) return { kind: 'department', name: rule.department, count }
  if (rule?.group) return { kind: 'group', name: rule.group, count }
  if (rule?.organization) return { kind: 'organization', count }
  return { kind: 'rule', count }
}

/** The lawful basis in the person's words (UI-CONV-031): the key of the phrase, for the translation files. */
export function lawfulBasisKeyOf(basis: string): 'contract' | 'consent' | 'legitimateInterest' | 'other' {
  return basis === 'contract'
    ? 'contract'
    : basis === 'consent'
      ? 'consent'
      : basis === 'legitimate-interest'
        ? 'legitimateInterest'
        : 'other'
}

/**
 * The segments of a space's page (UI-CONV-031): the owner's three more on the web, and Tools among them against an
 * agent that serves the tools of profile 3.4 (UI-CONV-050, PROF-DESC-009). Against an agent that serves the
 * Notifications (PROF-DESC-011), every member's page has Notifications right after Conversations (UI-APPR-007);
 * Personal has none: what Personal's tools ask is in the agent's Notifications (profile §3.12).
 */
export type SpaceSegment =
  | 'conversations'
  | 'notifications'
  | 'memories'
  | 'about'
  | 'members'
  | 'tools'
  | 'settings'
  | 'activity'

export function spaceSegmentsOf(
  space: Pick<SpaceInfo, 'kind' | 'role'>,
  agent: { tools?: boolean; notifications?: boolean } = {}
): SpaceSegment[] {
  const base: SpaceSegment[] = [
    'conversations',
    ...(agent.notifications && space.kind !== 'personal' ? (['notifications'] as const) : []),
    'memories',
    'about',
  ]
  if (space.role !== 'owner' || space.kind === 'personal') return base
  return [...base, 'members', ...(agent.tools ? (['tools'] as const) : []), 'settings', 'activity']
}

/**
 * The state of a member as the Members segment names it (UI-CONV-040). The profile's member states are `active`,
 * `invited` and `left`; a person of another organization is a `guest`. So an invitation not bound yet is a person of
 * another organization ("Invited") when its role is `guest`, and a person picked from the employee list who never
 * connected ("Not yet on <agent>") otherwise.
 */
export function memberStateOf(
  member: Pick<SpaceMember, 'state' | 'role'>
): 'owner' | 'active' | 'notYetOn' | 'invited' | 'left' {
  if (member.state === 'left') return 'left'
  if (member.state === 'invited') return member.role === 'guest' ? 'invited' : 'notYetOn'
  return member.role === 'owner' ? 'owner' : 'active'
}

/**
 * The values an owner may choose for each rule (UI-CONV-041): those the template allows when the agent gives them,
 * with the current value always among them; otherwise the current value and the usual ones.
 */
export function ruleChoicesOf(
  space: Pick<SpaceInfo, 'rules'>,
  bounds: TemplateBounds | undefined
): {
  lawfulBasis: string[]
  allowedProviders: string[]
  handover: boolean[]
  retention: { min?: number; max?: number }
} {
  const withCurrent = <T>(list: readonly T[], current: readonly T[]) => [
    ...list,
    ...current.filter((c) => !list.includes(c)),
  ]
  return {
    lawfulBasis: withCurrent(bounds?.lawfulBasis ?? ['contract', 'consent', 'legitimate-interest'], [
      space.rules.lawfulBasis,
    ]).filter(Boolean),
    allowedProviders: withCurrent(bounds?.allowedProviders ?? [], space.rules.allowedProviders),
    handover: withCurrent(bounds?.handover ?? [true, false], [space.rules.handover]),
    retention: bounds?.retentionDays ?? {},
  }
}

/** Whether a member of the space may still write in its conversations (UI-CONV-043). */
export function canWriteIn(space: Pick<SpaceInfo, 'state'> | undefined): boolean {
  return space?.state !== 'left'
}

// ---------------------------------------------------------------------------------------------------- governance

/**
 * The name of a space's owner, or null while it has none (profile 3.5.4, agent D136): the header, About and the rule
 * of a tool read "No owner" then.
 */
export function ownerNameOf(space: Pick<SpaceInfo, 'owner'> | undefined): string | null {
  return space?.owner?.name || null
}

/**
 * The people a space could be handed to, and so its successor (UI-CONV-041, PROF-SPACE-006, PROF-SPACE-008): in a list
 * space its active members who are neither its owner nor a guest. A rule space's are found in the employee list.
 */
export function handoverCandidatesOf(members: readonly SpaceMember[] | undefined): SpaceMember[] {
  return (members ?? []).filter((m) => m.state === 'active' && m.role !== 'owner' && m.role !== 'guest')
}

/**
 * The approval timeouts an owner sets in Settings (UI-CONV-041, agent D138): one per kind, each with its minutes and,
 * when the template gives them, its bounds. The kinds are the space's, then any the template adds.
 */
export interface TimeoutChoice {
  kind: string
  minutes: number | null
  min?: number
  max?: number
}

export function timeoutChoicesOf(
  space: Pick<SpaceInfo, 'rules' | 'kind'>,
  bounds: TemplateBounds | undefined
): TimeoutChoice[] {
  if (space.kind === 'personal') return []
  const current = space.rules.approvalTimeouts ?? {}
  const given = bounds?.approvalTimeouts ?? {}
  const kinds = [...new Set([...Object.keys(current), ...Object.keys(given)])]
  return kinds.map((kind) => ({
    kind,
    minutes: current[kind] ?? given[kind]?.default ?? null,
    ...(given[kind]?.min !== undefined ? { min: given[kind]?.min } : {}),
    ...(given[kind]?.max !== undefined ? { max: given[kind]?.max } : {}),
  }))
}

/** Whether minutes typed for a timeout may be sent: a whole number from 1, within the template's bounds when known. */
export function timeoutFits(choice: Pick<TimeoutChoice, 'min' | 'max'>, typed: string): boolean {
  const text = typed.trim()
  if (!/^\d+$/.test(text)) return false
  const minutes = Number(text)
  return (
    minutes >= 1 &&
    (choice.min === undefined || minutes >= choice.min) &&
    (choice.max === undefined || minutes <= choice.max)
  )
}

/** One space of `GET {sessions}/stewardship` (PROF-SPACE-009): of a template whose steward roles the person holds. */
export interface StewardedSpace {
  id: string
  title: string
  templateId: string
  kind: Exclude<SpaceKind, 'personal'>
  owner: { name: string } | null
  successor: { name: string } | null
  memberCount: number
}

/** A person who could own a space, to a steward (PROF-SPACE-009): by `memberId` in a list space, `directoryId` in a rule one. */
export type OwnerCandidate = ({ memberId: string } | { directoryId: string }) & {
  name: string
  department: string | null
}

/** A space as a steward reads it; null for one with no id. */
export function stewardedSpaceOf(value: unknown): StewardedSpace | null {
  const s = obj(value)
  if (typeof s.id !== 'string' || !s.id) return null
  const named = (v: unknown) => (typeof obj(v).name === 'string' && obj(v).name ? { name: str(obj(v).name) } : null)
  return {
    id: s.id,
    title: str(s.title),
    templateId: str(s.templateId),
    kind: s.kind === 'organization' ? 'organization' : 'team',
    owner: named(s.owner),
    successor: named(s.successor),
    memberCount: num(s.memberCount),
  }
}

/**
 * `GET {sessions}/stewardship` (PROF-SPACE-009), in the order of the steward's page (UI-CONV-068): the spaces with no
 * owner first, each group in the agent's order.
 */
export function stewardshipOf(body: unknown): StewardedSpace[] {
  const spaces = (Array.isArray(obj(body).spaces) ? (obj(body).spaces as unknown[]) : [])
    .map(stewardedSpaceOf)
    .filter((s): s is StewardedSpace => !!s)
  return [...spaces.filter((s) => !s.owner), ...spaces.filter((s) => s.owner)]
}

/** `GET {sessions}/spaces/{id}/owner/candidates` (PROF-SPACE-009). */
export function ownerCandidatesOf(body: unknown): OwnerCandidate[] {
  return (Array.isArray(obj(body).candidates) ? (obj(body).candidates as unknown[]) : [])
    .map((c) => obj(c))
    .flatMap((c): OwnerCandidate[] => {
      const department = strOrNull(c.department)
      if (typeof c.memberId === 'string' && c.memberId) return [{ memberId: c.memberId, name: str(c.name), department }]
      if (typeof c.directoryId === 'string' && c.directoryId)
        return [{ directoryId: c.directoryId, name: str(c.name), department }]
      return []
    })
}

/** The longest reason a steward gives (agent SPACE-MEMB-011): 1 to 500 characters, trimmed. */
export const STEWARD_REASON_MAX = 500

/** Whether a steward's reason may be sent (UI-CONV-068): Name the owner stays disabled until it may. */
export function stewardReasonFits(reason: string): boolean {
  const text = reason.trim()
  return text.length > 0 && text.length <= STEWARD_REASON_MAX
}

/**
 * Where a refusal of a steward's request is said (UI-CONV-052): `notSteward` (`403 not-steward`), `reason` (`400` at
 * `field: "reason"`), `notEligible`, `notFound`, `other`.
 */
export function stewardRefusalOf(
  error: { status?: number; code?: string; field?: string } | undefined
): 'notSteward' | 'reason' | 'notEligible' | 'notFound' | 'other' {
  if (error?.code === 'not-steward') return 'notSteward'
  if (error?.field === 'reason') return 'reason'
  if (error?.code === 'not-eligible') return 'notEligible'
  if (error?.status === 404) return 'notFound'
  return 'other'
}
