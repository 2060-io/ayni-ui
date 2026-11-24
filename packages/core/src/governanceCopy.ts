/**
 * The English wording of a space's governance (profile 3.5.4; agent D135 to D142; UI-CONV-041, UI-CONV-049,
 * UI-CONV-052, UI-CONV-067, UI-CONV-068, UI-APPR-010, UI-APPR-011), written once for the browser and the Ayni app: the
 * browser's English translation file must say the same (a test compares them), and the app starts from these. Keys are
 * paths in the translation file; `{{name}}` marks what the screen puts in. The words of the table of UI-CONV-052 are the
 * spec's; the others are this client's own, for what the table does not word: the headings and choices of the policy
 * form are UI-CONV-067's; `policy.entry.owner` (the entry of the owner of a space that has none), `policy.repeatedEntry`,
 * `policy.notApproval`, `policy.badPolicy`, `approval.progressCount` (a progress that waits for no entry by name), the
 * activity of a successor and of an owner named by succession or by a steward, the successor's and the timeout's
 * explanations, and the steward page's own lines are this client's.
 *
 * `policy.ownRequestsBlocked` takes `names`, each name written by `policy.possessive` and joined by `policy.and`, so
 * that "Jonas Weber's and Marta Kova's own requests can never be approved." reads in every language.
 */
export const GOVERNANCE_COPY = {
  // About and the owner's Tools segment (UI-CONV-049, UI-CONV-052)
  'tools.rule.approvalYou': 'Needs your approval',
  'tools.rule.approvals_one': 'Needs {{count}} approval: {{entries}}',
  'tools.rule.approvals_other': 'Needs {{count}} approvals: {{entries}}',
  // an entry of a policy (UI-CONV-052)
  'policy.entry.anyMember': 'Any member',
  'policy.entry.role': 'Someone with the role {{role}}',
  'policy.entry.department': 'Someone of {{department}}',
  'policy.entry.you': '{{name}} (you)',
  'policy.entry.owner': "The space's owner",
  'policy.entry.required': '{{entry}} (required)',
  // the policy in the owner's panel (UI-CONV-067)
  'policy.who': 'Who approves',
  'policy.required': 'Required',
  'policy.remove': 'Remove',
  'policy.addApprover': 'Add approver',
  'policy.kind.owner': 'The owner',
  'policy.kind.person': 'A member of the space',
  'policy.kind.member': 'Any member',
  'policy.kind.role': 'A role',
  'policy.kind.department': 'A department',
  'policy.add': 'Add',
  'policy.member': 'Member',
  'policy.role': 'Role',
  'policy.department': 'Department',
  'policy.needed': 'Approvals needed',
  'policy.refusal': 'When someone refuses',
  'policy.refusalAny': 'One refusal rejects',
  'policy.refusalRequired': "Only a required approver's refusal rejects",
  'policy.attested': 'Confirm with fingerprint or face',
  'policy.whenAsks': 'When an approver makes the request',
  'policy.anotherApprover': 'Another approver decides',
  'policy.ownConfirmation': 'Their own confirmation counts',
  // its warnings, attention and refusals (UI-CONV-052)
  'policy.possessive': "{{name}}'s",
  'policy.and': ' and ',
  'policy.ownRequestsBlocked': '{{names}} own requests can never be approved.',
  'policy.unreachable': "Nobody's requests can be approved with these approvers.",
  'policy.lowerNeeded': 'Lower the number needed',
  'policy.useOwnConfirmation': 'Use their own confirmation',
  'policy.needsAttention': 'Needs attention: {{entries}} can no longer approve',
  'policy.belowPackMinimum': '{{agent}} needs at least {{n}} approvals for this tool.',
  'policy.thresholdBelowRequired': 'The number needed counts every required approver.',
  'policy.approverNotAllowed': '{{agent}} does not allow this approver for this tool.',
  'policy.notEligible': "This person can't approve in this space.",
  'policy.attestationRequired': '{{agent}} requires a confirmation with fingerprint or face for this tool.',
  'policy.repeatedEntry': 'This approver is already in the list.',
  'policy.notApproval': 'This tool no longer needs approval in this space.',
  'policy.badPolicy': '{{agent}} does not take this policy.',
  // the progress of an approval (UI-APPR-010)
  'approval.progress': '{{approvals}} of {{threshold}} approvals, waiting for {{entries}}',
  'approval.progressCount': '{{approvals}} of {{threshold}} approvals',
  'approval.noApprover': 'No other approver can decide this',
  'notifications.ownRequest': 'Your own request',
  // the notices of a space's governance (UI-APPR-011)
  'notices.ownerChanged.handover': '{{to}} now owns {{space}} · handed over by {{from}}',
  'notices.ownerChanged.succession': '{{to}} now owns {{space}} · after {{from}} left',
  'notices.ownerChanged.steward': '{{to}} now owns {{space}} · named by a steward: {{reason}}',
  'notices.policyAttention': '{{tool}} needs attention: {{entries}} can no longer approve',
  'notices.openTool': 'Open the tool',
  'notices.noApprover': "{{requester}}'s request for {{tool}} was refused: no other approver could decide it.",
  'notices.spaceWithoutOwner': '{{space}} has no owner',
  'notices.nameOwner': 'Name the owner',
  // Spaces you steward (UI-CONV-068)
  'steward.title': 'Spaces you steward',
  'steward.noOwner': 'No owner',
  'steward.notSteward': 'Only a steward of this kind of space names its owner.',
  'steward.reason': 'Reason',
  'steward.nameOwner': 'Name the owner',
  'steward.successor': 'Successor: {{name}}',
  'steward.candidates': 'Who could own it',
  'steward.noCandidates': 'Nobody can own this space now.',
  'steward.empty': 'No spaces.',
  'steward.named': '{{name}} now owns {{space}}.',
  'steward.reasonRequired': 'Give a reason of 1 to 500 characters.',
  'steward.notEligible': 'This person cannot own the space.',
  // the space's header and Settings (UI-CONV-041)
  'spaces.ownerLineNone': '{{kind}} · No owner',
  'spaces.settings.timeouts': 'Approvals',
  'spaces.settings.timeout.tool-call': 'How long an approval of a tool waits',
  'spaces.settings.timeoutOther': 'How long an approval of the kind {{kind}} waits',
  'spaces.settings.minutes': 'minutes',
  'spaces.settings.timeoutBounds': 'The template allows {{min}} to {{max}} minutes.',
  'spaces.settings.timeoutBad': 'Give a whole number of minutes the template allows.',
  'spaces.settings.successor': 'Successor',
  'spaces.settings.successorHint': 'Becomes the owner if you leave {{organization}}.',
  'spaces.settings.noSuccessor': 'No successor',
  'spaces.settings.setSuccessor': 'Name successor',
  'spaces.settings.successorClear': 'Clear',
  'spaces.settings.successorSet': '{{name}} is the successor of {{space}}.',
  'spaces.settings.successorCleared': '{{space}} has no successor now.',
  // Activity (UI-CONV-041)
  'spaces.activity.successor-set': '{{by}} named {{member}} successor',
  'spaces.activity.successor-cleared': '{{member}} is no longer the successor',
  'spaces.activity.ownerSuccession': '{{member}} became the owner as successor',
  'spaces.activity.ownerSteward': '{{by}}, a steward, named {{member}} owner: {{reason}}',
} as const

export type GovernanceCopyKey = keyof typeof GOVERNANCE_COPY
