/**
 * The Notifications of a space and of the agent (AG-UI profile 3.5 as amended on 2026-11-21: §3.7, §3.12, §5, §6, §10,
 * PROF-TOOL-024..027, PROF-DESC-011, PROF-LINK-005; agent D114; UI-APPR-001, 002, 005..009). An approver finds an
 * approval nowhere but on their phone and in the Notifications of the space, for an approval of a space's tool, or of
 * the agent, for any other: never as a card in a conversation. The requester sees one card, in the conversation where
 * they asked, replaced in place by each status, and their own requests in the Notifications, read-only. The kinds of
 * notification and a notice's body are the profile package's (3.5.4); an approval and an item are written here as the
 * readers fill them (an approval's `by` is the name, an item carries its `approval` or its `notice` by its kind); the
 * rules a screen follows (what an item offers, the words of its status, which card a conversation draws) are here too,
 * so that the browser and the Ayni app apply the same ones.
 */
import type { GovernanceNoticeBody, GovernanceNoticeKind, NotificationKind } from '@ayni.org/ayni-agui-profile'
import {
  type ApprovalPolicyView,
  type ApprovalProgress,
  approvalPolicyOf,
  approvalProgressOf,
  type ProgressEntry,
  type ProgressLine,
  progressLineOf,
} from './approvalPolicy.js'
import type { OwnerChange } from './spaces.js'
import { type ApprovalStatus, isConfirmation, type ToolAction, toolActionOf } from './tools.js'

/** The live event of a notification of the person that entered, changed or ended in a list (PROF-TOOL-025). */
export const NOTIFICATIONS_CHANGED = 'ayni.space.notifications.changed'

/**
 * The notices of a space's governance (`GovernanceNoticeKind`, profile 3.5.4, PROF-TOOL-038; agent D142) and the kinds
 * of notification, an approval or a notice (`NotificationKind`, agent D114, D142), are the profile package's; the
 * package lists no notice kinds, so the list is here.
 */
export type { GovernanceNoticeKind, NotificationKind }
export const GOVERNANCE_NOTICE_KINDS: readonly GovernanceNoticeKind[] = [
  'owner-changed',
  'policy-attention',
  'no-approver',
  'space-without-owner',
]

/** One decision an approver made (`decisions` of §3.12). */
export interface ApprovalDecision {
  /** the name the agent shows of who decided */
  by: string
  decision: 'approve' | 'reject'
  at: string
  /** the requester's own confirmation of their own request (profile 3.5.4, PROF-TOOL-037) */
  self?: boolean
}

/**
 * The approval an item carries (§3.12): the shape of the `ayni.approval` activity as this person may read it. `own`: a
 * request the person sent, which they read and never decide, but their own confirmation of a tool of a space (`own`
 * and `canDecide`, profile 3.5.4); `canDecide`: while they may decide it; `attested`: its decision is made on the phone
 * only; `myDecision`: the person's own, while it waits for other approvers; `policy` and `progress`, for a tool of a
 * space (PROF-TOOL-037); `reason: "no-approver"`: refused at once, for want of another approver.
 */
export interface NotificationApproval {
  approvalId: string
  kind: 'sensitivity' | 'elevation'
  status: ApprovalStatus
  expiresAt?: string
  requester: { displayName: string; role?: string }
  own: boolean
  canDecide: boolean
  attested: boolean
  myDecision: 'approve' | 'reject' | null
  tool?: string
  /** the exact call, as the requester's card shows it (PROF-TOOL-009); none for an elevation */
  action?: ToolAction
  space?: { id: string; title: string }
  /** an elevation's (PROF-RUN-005) */
  purpose?: { id: string; label: string }
  justification?: string
  decisions: ApprovalDecision[]
  closedAt?: string
  policy?: ApprovalPolicyView
  progress?: ApprovalProgress
  reason?: 'no-approver'
}

/**
 * A notice of a space's governance (PROF-TOOL-038), read-only: `owner-changed` to every member (`how`, `from`, `to`, a
 * steward's `reason`); `policy-attention` to the owner (`tool`, `entries` that name nobody); `no-approver` to the owner
 * (`tool`, `requester`); `space-without-owner` to the stewards, in the agent's Notifications (`template`,
 * `formerOwner`). `resolvedAt` once what it reports is resolved.
 */
export type GovernanceNotice = GovernanceNoticeBody

/**
 * An item of the Notifications (PROF-TOOL-024): an approval, or a notice of a space's governance. `waiting`: the person
 * can still decide the approval, or the notice waits until what it reports is resolved (it counts in the badge).
 */
export type NotificationItem =
  | { id: string; kind: 'approval'; at: string; waiting: boolean; approval: NotificationApproval }
  | { id: string; kind: GovernanceNoticeKind; at: string; waiting: boolean; notice: GovernanceNotice }

/** Whether an item is an approval, which carries `approval`. */
export function isApprovalItem(item: NotificationItem): item is Extract<NotificationItem, { kind: 'approval' }> {
  return item.kind === 'approval'
}

/** A page of a list, newest first; `waiting` counts what waits for the person in the whole place: the badge. */
export interface NotificationsPage {
  notifications: NotificationItem[]
  nextBefore: string | null
  waiting: number
}

/** `ayni.space.notifications.changed` (PROF-TOOL-025): `spaceId` null for the agent's Notifications. */
export interface NotificationsChange {
  spaceId: string | null
  id: string
  kind: NotificationKind
  waiting: boolean
  /** how many wait for the person there now: the badge */
  count: number
}

/** The Notifications a list or a link names: a space's, or the agent's (`spaceId` null). */
export interface NotificationsPlace {
  spaceId: string | null
}

/** `limit` of a list: 50 by default, 200 at most (§3.12). */
export const NOTIFICATIONS_PAGE = { default: 50, max: 200 } as const

// ---------------------------------------------------------------------------------------------------- reading

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

const statusOf = (v: unknown): ApprovalStatus =>
  v === 'APPROVED' || v === 'REJECTED' || v === 'CANCELLED' || v === 'EXPIRED' ? v : 'PENDING'
const decisionOf = (v: unknown): 'approve' | 'reject' | null => (v === 'approve' || v === 'reject' ? v : null)

function spaceOf(value: unknown): { id: string; title: string } | undefined {
  const s = obj(value)
  return typeof s.id === 'string' && s.id ? { id: s.id, title: str(s.title) } : undefined
}

/** The approval of an item as the agent gives it; null for one with no id. */
export function notificationApprovalOf(value: unknown): NotificationApproval | null {
  const a = obj(value)
  if (typeof a.approvalId !== 'string' || !a.approvalId) return null
  const requester = obj(a.requester)
  const purpose = obj(a.purpose)
  const action = toolActionOf(a.action)
  const space = spaceOf(a.space)
  const own = a.own === true
  const decisions = list(a.decisions).flatMap((d): ApprovalDecision[] => {
    const decision = decisionOf(d.decision)
    return decision
      ? [{ by: str(obj(d.by).displayName), decision, at: str(d.at), ...(d.self === true ? { self: true } : {}) }]
      : []
  })
  const policy = approvalPolicyOf(a.policy)
  const progress = approvalProgressOf(a.progress)
  return {
    approvalId: a.approvalId,
    kind: a.kind === 'elevation' ? 'elevation' : 'sensitivity',
    status: statusOf(a.status),
    ...(typeof a.expiresAt === 'string' ? { expiresAt: a.expiresAt } : {}),
    requester: {
      displayName: str(requester.displayName),
      ...(typeof requester.role === 'string' ? { role: requester.role } : {}),
    },
    own,
    // a request the person sent is read, never decided, but their own confirmation of a call of a space's tool, which
    // they decide on their phone (profile 3.5.4, PROF-TOOL-037)
    canDecide: a.canDecide === true && (!own || (!!action && !!space)),
    attested: a.attested === true,
    myDecision: decisionOf(a.myDecision),
    ...(typeof a.tool === 'string' ? { tool: a.tool } : {}),
    ...(action ? { action } : {}),
    ...(space ? { space } : {}),
    ...(typeof purpose.label === 'string' ? { purpose: { id: str(purpose.id), label: purpose.label } } : {}),
    ...(typeof a.justification === 'string' ? { justification: a.justification } : {}),
    decisions,
    ...(typeof a.closedAt === 'string' ? { closedAt: a.closedAt } : {}),
    ...(policy ? { policy } : {}),
    ...(progress ? { progress } : {}),
    ...(a.reason === 'no-approver' ? { reason: 'no-approver' as const } : {}),
  }
}

/** A notice as the agent gives it; null for one with no space. */
export function governanceNoticeOf(value: unknown): GovernanceNotice | null {
  const n = obj(value)
  const space = spaceOf(n.space)
  if (!space) return null
  const named = (v: unknown) =>
    v === null ? null : typeof obj(v).name === 'string' ? { name: str(obj(v).name) } : undefined
  const tool = obj(n.tool)
  const template = obj(n.template)
  const from = named(n.from)
  const to = named(n.to)
  const formerOwner = named(n.formerOwner)
  const progress = approvalProgressOf({ threshold: 1, approvals: 0, waitingFor: n.entries })
  return {
    space,
    ...(n.how === 'handover' || n.how === 'succession' || n.how === 'steward' ? { how: n.how } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(typeof n.reason === 'string' && n.reason ? { reason: n.reason } : {}),
    ...(typeof tool.source === 'string' ? { tool: { source: tool.source, title: str(tool.title, tool.source) } } : {}),
    ...(Array.isArray(n.entries) && progress ? { entries: progress.waitingFor } : {}),
    ...(typeof obj(n.requester).displayName === 'string'
      ? { requester: { displayName: str(obj(n.requester).displayName) } }
      : {}),
    ...(typeof template.id === 'string'
      ? { template: { id: template.id, title: str(template.title, template.id) } }
      : {}),
    ...(formerOwner !== undefined ? { formerOwner } : {}),
    ...(typeof n.resolvedAt === 'string' && n.resolvedAt ? { resolvedAt: n.resolvedAt } : {}),
  }
}

/** An item as the agent gives it; null for one this client does not know how to show. */
export function notificationOf(value: unknown): NotificationItem | null {
  const n = obj(value)
  if (GOVERNANCE_NOTICE_KINDS.includes(n.kind as GovernanceNoticeKind)) {
    const notice = governanceNoticeOf(n.notice)
    if (!notice || typeof n.id !== 'string' || !n.id) return null
    return { id: n.id, kind: n.kind as GovernanceNoticeKind, at: str(n.at), waiting: n.waiting === true, notice }
  }
  if (n.kind !== 'approval') return null
  const approval = notificationApprovalOf(n.approval)
  if (!approval) return null
  return {
    id: str(n.id, approval.approvalId) || approval.approvalId,
    kind: 'approval',
    at: str(n.at),
    waiting: n.waiting === true,
    approval,
  }
}

/** `GET {sessions}/spaces/{id}/notifications` and `GET {sessions}/notifications` (PROF-TOOL-024). */
export function notificationsPageOf(body: unknown): NotificationsPage {
  const b = obj(body)
  return {
    notifications: list(b.notifications)
      .map(notificationOf)
      .filter((n): n is NotificationItem => !!n),
    nextBefore: typeof b.nextBefore === 'string' && b.nextBefore ? b.nextBefore : null,
    waiting: count(b.waiting),
  }
}

/** What `ayni.space.notifications.changed` says; null for a value that is not one. */
export function notificationsChangeOf(value: unknown): NotificationsChange | null {
  const v = obj(value)
  if (v.spaceId !== null && (typeof v.spaceId !== 'string' || !v.spaceId)) return null
  if (typeof v.count !== 'number') return null
  return {
    spaceId: v.spaceId,
    id: str(v.id),
    kind: GOVERNANCE_NOTICE_KINDS.includes(v.kind as GovernanceNoticeKind)
      ? (v.kind as GovernanceNoticeKind)
      : 'approval',
    waiting: v.waiting === true,
    count: count(v.count),
  }
}

/** Whether the agent serves the Notifications (PROF-DESC-011): without it, no tab, no entry, no badge. */
export function takesNotifications(features: object | null | undefined): boolean {
  // read loosely: the descriptor's type gains the field with the profile package that declares it
  return (features as { notifications?: unknown } | null | undefined)?.notifications === true
}

/** The space's count of what waits for the person, from `GET /spaces` (`notificationsWaiting`, §3.7). */
export function notificationsWaitingOf(space: { notificationsWaiting?: number } | undefined): number {
  return count(space?.notificationsWaiting)
}

// ---------------------------------------------------------------------------------------------------- an item

/**
 * What an item offers (UI-APPR-002, UI-APPR-008): Approve and Reject when its decision needs no attestation, Decide on
 * your phone when it must be attested, nothing on a request the person sent, one they decided, or one that ended.
 */
export function notificationControlsOf(
  a: Pick<NotificationApproval, 'own' | 'canDecide' | 'status' | 'myDecision' | 'attested'>
): 'decide' | 'phone' | 'none' {
  if (!a.canDecide || a.status !== 'PENDING' || a.myDecision) return 'none'
  // the requester's own confirmation is always decided on their phone (UI-APPR-010, agent INTX-APPR-023)
  if (a.own) return 'phone'
  return a.attested ? 'phone' : 'decide'
}

/** Whether an item is the person's own confirmation of their own request (UI-APPR-010): `own` and `canDecide`. */
export function isOwnConfirmation(a: Pick<NotificationApproval, 'own' | 'canDecide'>): boolean {
  return a.own && a.canDecide
}

/** The heading of an item (UI-APPR-007): "<requester> asks for your approval", or "Sent by you". */
export function notificationHeadingOf(
  a: Pick<NotificationApproval, 'own' | 'requester'> & Partial<Pick<NotificationApproval, 'canDecide'>>
): { key: 'asksYou'; requester: string } | { key: 'sentByYou' } | { key: 'ownRequest' } {
  if (a.own && a.canDecide) return { key: 'ownRequest' }
  return a.own ? { key: 'sentByYou' } : { key: 'asksYou', requester: a.requester.displayName }
}

/**
 * The status of an approval in the words of UI-CONV-052: on the requester's card and on an item of the Notifications.
 * `waitingFor` / `waiting`: the requester's line while it waits; `timeLeft`: an approver's while they may decide;
 * `mine`: the person's own decision while it waits for other approvers; `decided`: approved or rejected, by whom
 * (`you` for the person's own decision) and when, when known; `expired`: not answered in time; `withdrawn`.
 */
export type ApprovalStatusLine =
  | { key: 'waitingFor'; approver: string }
  | { key: 'waiting' }
  /** where an approval of a tool of a space stands (UI-APPR-010) */
  | Extract<ProgressLine, { key: 'progress' }>
  /** refused at once: "No other approver can decide this" (UI-APPR-010) */
  | { key: 'noApprover' }
  | { key: 'timeLeft'; expiresAt: string }
  | { key: 'mine'; decision: 'approve' | 'reject' }
  | { key: 'decided'; decision: 'approve' | 'reject'; by: string; you: boolean; at?: string }
  | { key: 'expired' }
  | { key: 'withdrawn' }

/** The decision that ended an approval: the latest one of its outcome. */
function endingDecision(
  decisions: readonly ApprovalDecision[],
  decision: 'approve' | 'reject'
): ApprovalDecision | undefined {
  return decisions
    .filter((d) => d.decision === decision)
    .reduce<ApprovalDecision | undefined>((latest, d) => (!latest || d.at >= latest.at ? d : latest), undefined)
}

/** The status line of an ended approval, or null while it waits. */
function endedLine(
  status: ApprovalStatus,
  decided: { by: string; you: boolean; at?: string } | null
): ApprovalStatusLine | null {
  switch (status) {
    case 'APPROVED':
    case 'REJECTED':
      return {
        key: 'decided',
        decision: status === 'APPROVED' ? 'approve' : 'reject',
        by: decided?.by ?? '',
        you: decided?.you ?? false,
        ...(decided?.at ? { at: decided.at } : {}),
      }
    case 'EXPIRED':
      return { key: 'expired' }
    case 'CANCELLED':
      return { key: 'withdrawn' }
    default:
      return null
  }
}

/**
 * The status of an item of the Notifications (UI-APPR-007): who decided and when once ended (`me` is the name the
 * agent shows of the person, from their session, for "you"); the person's own decision while others decide; the
 * time left while they may decide; the requester's line on a request they sent (`owner`: the space's owner's name).
 */
export function notificationStatusOf(a: NotificationApproval, me?: string, owner?: string): ApprovalStatusLine {
  if (a.status === 'REJECTED' && a.reason === 'no-approver') return { key: 'noApprover' }
  if (a.status !== 'PENDING') {
    const decision = a.status === 'APPROVED' ? 'approve' : 'reject'
    const ending =
      a.status === 'APPROVED' || a.status === 'REJECTED' ? endingDecision(a.decisions, decision) : undefined
    const at = ending?.at || a.closedAt
    const decided = {
      by: ending?.by ?? '',
      // the person's own decision: named by the agent as the person's session names them, or the one they made
      you: ending ? !!me && ending.by === me : a.myDecision === decision,
      ...(at ? { at } : {}),
    }
    return endedLine(a.status, decided) ?? { key: 'waiting' }
  }
  if (a.myDecision) return { key: 'mine', decision: a.myDecision }
  if (a.canDecide && a.expiresAt) return { key: 'timeLeft', expiresAt: a.expiresAt }
  if (a.progress) return progressLineOf(a.progress, a.policy)
  return owner ? { key: 'waitingFor', approver: owner } : { key: 'waiting' }
}

/**
 * The progress an approver's item shows beside the time left while they may decide (UI-APPR-007, UI-APPR-010): for a
 * policy of several approvals or approvers, where it stands; none for one person and one approval, which would only
 * name the reader.
 */
export function deciderProgressOf(a: NotificationApproval): Extract<ProgressLine, { key: 'progress' }> | null {
  if (a.status !== 'PENDING' || !a.canDecide || a.myDecision || !a.progress) return null
  const line = progressLineOf(a.progress, a.policy)
  return line.key === 'progress' ? line : null
}

/**
 * The status of the requester's card of an approval (UI-APPR-006, UI-CONV-052): "Waiting for <owner>'s approval" for a
 * tool of a space (`owner`, from the person's list of spaces), "Waiting for approval" for any other, then its outcome,
 * by whom (`decidedBy` of `ayni.approval.update`). The card is replaced in place: never a second one.
 */
export function cardStatusOf(content: unknown, owner?: string): ApprovalStatusLine {
  const c = obj(content)
  const status = statusOf(c.status)
  if (status === 'REJECTED' && c.reason === 'no-approver') return { key: 'noApprover' }
  const by = str(c.decidedBy)
  const line = endedLine(status, by ? { by, you: false } : null)
  if (line) return line
  // a tool of a space: where it stands (UI-APPR-010), updated by each `ayni.approval.update`
  const progress = approvalProgressOf(c.progress)
  if (progress) return progressLineOf(progress, approvalPolicyOf(c.policy))
  return owner ? { key: 'waitingFor', approver: owner } : { key: 'waiting' }
}

/** The words a notice says (UI-APPR-011, UI-CONV-052), and the control it carries while it waits. */
export type NoticeWords =
  | { key: 'ownerChanged'; how: OwnerChange; to: string; space: string; from: string; reason: string }
  | { key: 'policyAttention'; tool: string; entries: ProgressEntry[]; source: string; spaceId: string }
  | { key: 'noApprover'; requester: string; tool: string }
  | { key: 'spaceWithoutOwner'; space: string; spaceId: string }

export function noticeWordsOf(item: Extract<NotificationItem, { kind: GovernanceNoticeKind }>): NoticeWords {
  const n = item.notice
  switch (item.kind) {
    case 'owner-changed':
      return {
        key: 'ownerChanged',
        how: n.how ?? 'handover',
        to: n.to?.name ?? '',
        space: n.space.title,
        from: n.from?.name ?? '',
        reason: n.reason ?? '',
      }
    case 'policy-attention':
      return {
        key: 'policyAttention',
        tool: n.tool?.title ?? '',
        entries: n.entries ?? [],
        source: n.tool?.source ?? '',
        spaceId: n.space.id,
      }
    case 'no-approver':
      return { key: 'noApprover', requester: n.requester?.displayName ?? '', tool: n.tool?.title ?? '' }
    default:
      return { key: 'spaceWithoutOwner', space: n.space.title, spaceId: n.space.id }
  }
}

/**
 * The control a notice offers (UI-APPR-011): Open the tool for a policy that needs attention, Name the owner for a
 * space without one, while the notice waits; a notice resolved reads as past, with none.
 */
export function noticeControlOf(
  item: Extract<NotificationItem, { kind: GovernanceNoticeKind }>
): 'openTool' | 'nameOwner' | null {
  if (!item.waiting || item.notice.resolvedAt) return null
  if (item.kind === 'policy-attention' && item.notice.tool?.source) return 'openTool'
  if (item.kind === 'space-without-owner') return 'nameOwner'
  return null
}

/**
 * Whether a conversation draws an `ayni.approval` activity (UI-APPR-001, UI-APPR-009): a confirmation, at its place in
 * the reply; an approval only as the requester's card. An approver's request is never a card in a conversation: it is
 * on their phone and in their Notifications.
 */
export function drawsApprovalCard(content: unknown): boolean {
  if (isConfirmation(content)) return true
  const c = obj(content)
  return !(c.canDecide === true && c.own !== true)
}

/**
 * Where a refusal of a decision or of Decide on your phone is said (PROF-TOOL-026, §3.12): `onPhone`, the decision
 * must be attested (`decide-on-phone`); `notEligible`, the person may not decide it (`not-eligible`, `404`); `ended`,
 * it ended or they decided it already (`409 not-pending`); `phoneUnreachable`, their capability channel is not
 * flow-capable (`409 confirmation-unavailable`); `other`, anything else.
 */
export type ApprovalRefusal = 'onPhone' | 'notEligible' | 'ended' | 'phoneUnreachable' | 'other'

export function approvalRefusalOf(error: { status?: number; code?: string } | undefined): ApprovalRefusal {
  const code = error?.code
  if (code === 'decide-on-phone') return 'onPhone'
  if (code === 'not-eligible' || error?.status === 404) return 'notEligible'
  if (code === 'not-pending') return 'ended'
  if (code === 'confirmation-unavailable') return 'phoneUnreachable'
  return 'other'
}

/** The date and time an approval was decided, in the person's locale ("21 Nov, 21:51"), the year when not this one. */
export function decidedAtOf(iso: string, locale: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** The counts of a place after an event, or after a read of its list (PROF-TOOL-025): the agent's number, as it is. */
export function withSpaceCount<T extends { id: string; notificationsWaiting?: number }>(
  spaces: readonly T[],
  spaceId: string,
  waiting: number
): T[] {
  return spaces.map((s) => (s.id === spaceId ? { ...s, notificationsWaiting: count(waiting) } : s))
}
