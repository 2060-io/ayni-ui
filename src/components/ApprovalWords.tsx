/**
 * The words and the marks of an approval's status (UI-CONV-052; agent D114), for the requester's card and for the items
 * of the Notifications, and the badge of what waits in a place (PROF-TOOL-025).
 */
import { type ApprovalStatusLine, decidedAtOf, timeLeftOf } from '@ayni.org/ayni-ui-core'
import { Ban, Bell, Check, Clock, OctagonX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type T = (key: string, options?: Record<string, unknown>) => string

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
