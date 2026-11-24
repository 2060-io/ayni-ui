/**
 * The words and the marks of an approval's status (UI-CONV-052; agent D114), for the requester's card and for the items
 * of the Notifications, and the badge of what waits in a place (PROF-TOOL-025); the words of an approval policy's
 * entries and of where an approval stands (profile 3.5.4, UI-APPR-010), shared by About, the owner's panel, the card,
 * the Notifications and their notices.
 */
import {
  type ApprovalPolicyView,
  type ApprovalStatusLine,
  decidedAtOf,
  type EntryWords,
  entryWordsOf,
  type ProgressEntry,
  type ProgressLine,
  policyRuleWordsOf,
  timeLeftOf,
} from '@ayni.org/ayni-ui-core'
import { Ban, Bell, Check, Clock, OctagonX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type T = (key: string, options?: Record<string, unknown>) => string

/** An entry of a policy in words (UI-CONV-052): the person's name, "<name> (you)", "Any member", a role, a department. */
export function entryText(words: EntryWords, t: T): string {
  switch (words.key) {
    case 'name':
      return words.name
    case 'self':
      return t('policy.entry.you', { name: words.name })
    case 'anyMember':
      return t('policy.entry.anyMember')
    case 'role':
      return t('policy.entry.role', { role: words.role })
    case 'department':
      return t('policy.entry.department', { department: words.department })
    default:
      return t('policy.entry.owner')
  }
}

/**
 * Entries in words, joined by ", " (UI-CONV-052), each required one followed by " (required)" where the table marks
 * them (About and the progress).
 */
export function entriesText(entries: readonly (EntryWords & { required?: boolean })[], t: T, marked = true): string {
  return entries
    .map((e) => (marked && e.required ? t('policy.entry.required', { entry: entryText(e, t) }) : entryText(e, t)))
    .join(', ')
}

/** Entries that name nobody, as the attention line puts them (UI-CONV-067): their words, unmarked. */
export function attentionText(entries: readonly ProgressEntry[], t: T): string {
  return entriesText(
    entries.map((e) => entryWordsOf(e)),
    t,
    false
  )
}

/** Where an approval stands (UI-APPR-010): "1 of 2 approvals, waiting for Jonas Weber (required)". */
export function progressText(line: Extract<ProgressLine, { key: 'progress' }>, t: T): string {
  return line.entries.length
    ? t('approval.progress', {
        approvals: line.approvals,
        threshold: line.threshold,
        entries: entriesText(line.entries, t),
      })
    : t('approval.progressCount', { approvals: line.approvals, threshold: line.threshold })
}

/**
 * The rule `approval` in About (UI-CONV-049): "Needs Jonas Weber's approval", "Needs your approval" for that one person
 * reading it, or "Needs 2 approvals: Jonas Weber (required), Marta Kova".
 */
export function approvalRuleText(
  policy: Pick<ApprovalPolicyView, 'approvers' | 'threshold'>,
  reader: { name?: string; isOwner?: boolean },
  t: T
): string {
  const words = policyRuleWordsOf(policy, reader)
  if (words.key === 'needsYou') return t('tools.rule.approvalYou')
  if (words.key === 'needsName') return t('tools.rule.approval', { name: words.name })
  return t('tools.rule.approvals', { count: words.count, entries: entriesText(words.entries, t) })
}

/**
 * The words of an approval's status (UI-CONV-052), on the requester's card and on an item of the Notifications: who
 * decided, "you" for the person's own decision, and, in the Notifications (`withTime`), " · <date and time>".
 */
export function approvalStatusWords(line: ApprovalStatusLine, t: T, locale: string, now: number, withTime = false) {
  switch (line.key) {
    case 'waitingFor':
      return t('approval.waitingFor', { approver: line.approver })
    case 'waiting':
      return t('approval.waiting')
    case 'progress':
      return progressText(line, t)
    case 'noApprover':
      return t('approval.noApprover')
    case 'timeLeft':
      return t('tools.timeLeft', { time: timeLeftOf(line.expiresAt, now) })
    case 'mine':
      return t(line.decision === 'approve' ? 'approval.approvedByYouWaiting' : 'approval.rejectedByYouWaiting')
    case 'decided': {
      const approved = line.decision === 'approve'
      const outcome = line.you
        ? t(approved ? 'approval.approvedByYou' : 'approval.rejectedByYou')
        : line.by
          ? t(approved ? 'approval.approvedBy' : 'approval.rejectedBy', { name: line.by })
          : t(approved ? 'approval.status.APPROVED' : 'approval.status.REJECTED')
      return withTime && line.at
        ? t('notifications.decidedAt', { outcome, time: decidedAtOf(line.at, locale) })
        : outcome
    }
    case 'expired':
      return t('approval.notAnswered')
    default:
      return t('approval.withdrawn')
  }
}

/** The icon of an ended approval, drawn, never typed; none while it waits. */
export function ApprovalStatusIcon({ line }: { line: ApprovalStatusLine }) {
  const props = { size: 15, 'aria-hidden': true, className: 'tool-outcome-icon' } as const
  switch (line.key) {
    case 'decided':
      return line.decision === 'approve' ? <Check {...props} /> : <OctagonX {...props} />
    case 'expired':
      return <Clock {...props} />
    case 'noApprover':
      return <OctagonX {...props} />
    case 'withdrawn':
      return <Ban {...props} />
    default:
      return null
  }
}

/** The count of what waits in a place, as a badge (PROF-TOOL-025): the bell drawn, the number, and its words. */
export function NotificationsBadge({ count, bell = false }: { count: number | undefined; bell?: boolean }) {
  const { t } = useTranslation()
  if (!count) return null
  return (
    <span className="notifications-count">
      {bell ? <Bell size={11} aria-hidden="true" /> : null}
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{`, ${t('notifications.waiting', { count })}`}</span>
    </span>
  )
}
