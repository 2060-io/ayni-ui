/**
 * The English wording of the Notifications and of the requester's card of an approval (UI-APPR-001, 002, 005..009,
 * UI-CONV-052; agent D114), written once for the browser and the Ayni app: the browser's English translation file must
 * say the same (a test compares them, row by row of the table of UI-CONV-052), and the app starts from these
 * (APP-CONV-051, APP-CONV-061). Keys are paths in the translation file; `{{name}}` marks what the screen puts in.
 * `approval.approve` and `approval.reject` are the existing card's words, kept (Reject, not Refuse). Five texts are this
 * client's own, for cases the table does not name: `notifications.more`, `notifications.waiting`,
 * `notifications.ended`, `notifications.notEligible` and `notifications.notSent`.
 */
export const NOTIFICATIONS_COPY = {
  'notifications.title': 'Notifications',
  'spaces.segments.notifications': 'Notifications',
  'notifications.empty': 'No notifications.',
  'notifications.sentByYou': 'Sent by you',
  'approval.approve': 'Approve',
  'approval.reject': 'Reject',
  'approval.approvedBy': 'Approved by {{name}}',
  'approval.rejectedBy': 'Rejected by {{name}}',
  'approval.approvedByYou': 'Approved by you',
  'approval.rejectedByYou': 'Rejected by you',
  'approval.approvedByYouWaiting': 'Approved by you · Waiting for other approvers',
  'approval.rejectedByYouWaiting': 'Rejected by you · Waiting for other approvers',
  'approval.notAnswered': 'Not answered in time',
  'approval.withdrawn': 'Withdrawn',
  'notifications.decidedAt': '{{outcome}} · {{time}}',
  'notifications.decideOnPhone': 'Decide on your phone',
  'notifications.sentToPhone': 'Sent to your phone',
  'notifications.phoneUnreachable': '{{agent}} cannot reach the Ayni app on your phone.',
  'notifications.more': 'Show more',
  'notifications.waiting': '{{count}} waiting',
  'notifications.ended': 'This request has ended.',
  'notifications.notEligible': 'You can no longer decide this request.',
  'notifications.notSent': 'Your answer was not sent. Try again.',
} as const

export type NotificationsCopyKey = keyof typeof NOTIFICATIONS_COPY
