/**
 * The approval policy of a tool of a space (AG-UI profile 3.5, package 3.5.4: PROF-TOOL-036, PROF-TOOL-037; agent D137
 * to D142; UI-CONV-049, UI-CONV-052, UI-CONV-067, UI-APPR-010). For each tool whose rule in a space is `approval`, the
 * space holds who approves its calls (the owner, a person, any member, a role, a department; each required or
 * optional), how many approvals are needed, which refusal rejects, whether a decision is confirmed with fingerprint or
 * face, and what counts when an approver makes the request. The owner reads it whole and changes it in the panel of the
 * tool's source; a member reads its approvers and its number; the requester's card and the Notifications show where an
 * approval stands. The wire types are the profile package's (3.5.4); the rules a screen follows (the words of a policy,
 * of its progress, its form and the refusals of a change) are here, so that the browser and the Ayni app apply the
 * same ones.
 */

import {
  APPROVER_KINDS,
  type ApprovalProgress,
  type ApproverKind,
  type ApproverView,
  type SpaceApprovalPolicyInput,
  type SpaceApprovalPolicyView,
  type SpaceApprovalPolicyWarning,
} from '@ayni.org/ayni-agui-profile'

export type { ApprovalProgress, ApproverKind, ApproverView }
/**
 * The kinds of entry (`ApproverKind`, `APPROVER_KINDS`), an approver as people read it (`ApproverView`, §3.12: `name`
 * for the person an `owner` or a `person` entry names, none for an `owner` of a space that has no owner; `role` or
 * `department` for those entries; to the owner, a `person` also carries `memberId` or `directoryId`) and where an
 * approval of a tool of a space stands (`ApprovalProgress`, PROF-TOOL-037: its threshold, the approvals counted, the
 * entries not yet satisfied, the required ones first) are the profile package's.
 */
export { APPROVER_KINDS }

/**
 * The policy of a tool of a space (PROF-TOOL-036). To the owner every field, with its `state` (`needs-attention` while a
 * required entry names nobody, `attention` listing their indexes), its `warnings` and the agent-pack's `bounds`; to a
 * member, `approvers` and `threshold` only.
 */
export type ApprovalPolicyView = SpaceApprovalPolicyView

/** What the agent-pack lets an owner set for one tool (agent TOOL-CAT-023). */
export type ApprovalPolicyBounds = NonNullable<SpaceApprovalPolicyView['bounds']>

/** A warning of a policy (agent TOOL-SPACE-020): it refuses nothing. */
export type ApprovalPolicyWarning = SpaceApprovalPolicyWarning

export type WhenApproverAsks = NonNullable<SpaceApprovalPolicyView['whenApproverAsks']>

/** An entry an approval still waits for, in the progress (PROF-TOOL-037). */
export type ProgressEntry = ApprovalProgress['waitingFor'][number]

/** An entry of a policy as the owner sends it (`PATCH …/tools/{source}` with `approvals`, PROF-TOOL-036). */
export type ApproverInput = SpaceApprovalPolicyInput['approvers'][number]

/**
 * A policy as the owner sends it, whole (PROF-TOOL-036): the package's, with `whenApproverAsks` always given (the form
 * holds one from the start, its default following the approvers, UI-CONV-067).
 */
export type ApprovalPolicyInput = Required<SpaceApprovalPolicyInput>

// ---------------------------------------------------------------------------------------------------- reading

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])
const whole = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback

const kindOf = (v: unknown): ApproverKind | null =>
  APPROVER_KINDS.includes(v as ApproverKind) ? (v as ApproverKind) : null

/** An approver as the agent gives it; null for one of a kind this client does not know. */
export function approverOf(value: unknown): ApproverView | null {
  const a = obj(value)
  const kind = kindOf(a.kind)
  if (!kind) return null
  return {
    kind,
    ...(str(a.memberId) ? { memberId: str(a.memberId) } : {}),
    ...(str(a.directoryId) ? { directoryId: str(a.directoryId) } : {}),
    ...(str(a.name) ? { name: str(a.name) } : {}),
    ...(str(a.role) ? { role: str(a.role) } : {}),
    ...(str(a.department) ? { department: str(a.department) } : {}),
    required: a.required === true,
  }
}

function boundsOf(value: unknown): ApprovalPolicyBounds | undefined {
  const b = obj(value)
  if (!Object.keys(b).length) return undefined
  const kinds = Array.isArray(b.kinds) ? b.kinds.map(kindOf).filter((k): k is ApproverKind => !!k) : [...APPROVER_KINDS]
  return {
    minApprovals: Math.max(1, whole(b.minApprovals, 1)),
    kinds,
    roles: Array.isArray(b.roles) ? b.roles.filter((r): r is string => typeof r === 'string' && !!r) : [],
    attested: b.attested === 'required' ? 'required' : 'optional',
  }
}

function warningsOf(value: unknown): ApprovalPolicyWarning[] {
  return list(value).flatMap((w): ApprovalPolicyWarning[] => {
    if (w.code === 'unreachable') return [{ code: 'unreachable' }]
    if (w.code === 'own-requests-blocked')
      return [
        {
          code: 'own-requests-blocked',
          approvers: list(w.approvers)
            .map((a) => str(a.name))
            .filter((n): n is string => !!n)
            .map((name) => ({ name })),
        },
      ]
    return []
  })
}

/** A policy as the agent gives it, on a tool of a space or on an approval; undefined for a value that is none. */
export function approvalPolicyOf(value: unknown): ApprovalPolicyView | undefined {
  const p = obj(value)
  if (!Array.isArray(p.approvers)) return undefined
  const approvers = p.approvers.map(approverOf).filter((a): a is ApproverView => !!a)
  const bounds = boundsOf(p.bounds)
  return {
    approvers,
    threshold: Math.max(1, whole(p.threshold, 1)),
    ...(p.refusal === 'any' || p.refusal === 'required' ? { refusal: p.refusal } : {}),
    ...(typeof p.attested === 'boolean' ? { attested: p.attested } : {}),
    ...(p.whenApproverAsks === 'another-approver' || p.whenApproverAsks === 'own-confirmation'
      ? { whenApproverAsks: p.whenApproverAsks }
      : {}),
    ...(p.state === 'ok' || p.state === 'needs-attention' ? { state: p.state } : {}),
    ...(Array.isArray(p.attention)
      ? {
          attention: p.attention.filter(
            (i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < approvers.length
          ),
        }
      : {}),
    ...(Array.isArray(p.warnings) ? { warnings: warningsOf(p.warnings) } : {}),
    ...(bounds ? { bounds } : {}),
  }
}

/** The progress of an approval as the agent gives it (PROF-TOOL-037); undefined for a value that is none. */
export function approvalProgressOf(value: unknown): ApprovalProgress | undefined {
  const p = obj(value)
  if (typeof p.threshold !== 'number' || typeof p.approvals !== 'number') return undefined
  return {
    threshold: Math.max(1, whole(p.threshold, 1)),
    approvals: whole(p.approvals, 0),
    waitingFor: list(p.waitingFor)
      .map(approverOf)
      .filter((a): a is ApproverView => !!a)
      .map(({ kind, name, role, department, required }) => ({
        kind,
        ...(name ? { name } : {}),
        ...(role ? { role } : {}),
        ...(department ? { department } : {}),
        required,
      })),
  }
}

// ---------------------------------------------------------------------------------------------------- words

/**
 * How an entry reads (UI-CONV-052): the name of the person it names (`owner` while the space has one, `person`), or
 * `self` when that person is the reader (`<name> (you)` in Who approves); `anyMember`, `role`, `department`; `owner`
 * for the entry of the owner of a space that has none, which the table does not word.
 */
export type EntryWords =
  | { key: 'name'; name: string }
  | { key: 'self'; name: string }
  | { key: 'anyMember' }
  | { key: 'role'; role: string }
  | { key: 'department'; department: string }
  | { key: 'owner' }

export function entryWordsOf(entry: ProgressEntry, reader?: string): EntryWords {
  switch (entry.kind) {
    case 'owner':
    case 'person':
      if (!entry.name) return { key: 'owner' }
      return reader && entry.name === reader ? { key: 'self', name: entry.name } : { key: 'name', name: entry.name }
    case 'member':
      return { key: 'anyMember' }
    case 'role':
      return { key: 'role', role: entry.role ?? '' }
    default:
      return { key: 'department', department: entry.department ?? '' }
  }
}

/**
 * Whether a policy is one entry that names one person and needs one approval (UI-CONV-052): it reads as that person's
 * name alone ("Needs Jonas Weber's approval", "Waiting for Jonas Weber's approval").
 */
export function namesOnePerson(policy: Pick<ApprovalPolicyView, 'approvers' | 'threshold'>): ApproverView | null {
  const [only] = policy.approvers
  return policy.approvers.length === 1 &&
    policy.threshold === 1 &&
    only &&
    (only.kind === 'owner' || only.kind === 'person') &&
    only.name
    ? only
    : null
}

/**
 * The rule `approval` in About (UI-CONV-049, UI-CONV-052): "Needs <name>'s approval", "Needs your approval" when that
 * one person is the reader (`reader`: the name the agent shows of them; `readerIsOwner`, for the entry of the owner),
 * never the reader's own name, or "Needs <threshold> approvals: <entries>", each required one marked.
 */
export type PolicyRuleWords =
  | { key: 'needsName'; name: string }
  | { key: 'needsYou' }
  | { key: 'needsCount'; count: number; entries: (EntryWords & { required: boolean })[] }

export function policyRuleWordsOf(
  policy: Pick<ApprovalPolicyView, 'approvers' | 'threshold'>,
  reader?: { name?: string; isOwner?: boolean }
): PolicyRuleWords {
  const one = namesOnePerson(policy)
  if (one) {
    const you = one.kind === 'owner' ? !!reader?.isOwner : !!reader?.name && one.name === reader.name
    return you ? { key: 'needsYou' } : { key: 'needsName', name: one.name as string }
  }
  return {
    key: 'needsCount',
    count: policy.threshold,
    // in About the reader's own entry reads by its name, as everywhere but Who approves
    entries: policy.approvers.map((e) => ({ ...entryWordsOf(e), required: e.required })),
  }
}

/** The key that groups tools of the same rule and the same policy in About (UI-CONV-049). */
export function policyKeyOf(policy: Pick<ApprovalPolicyView, 'approvers' | 'threshold'> | undefined): string {
  if (!policy) return ''
  return JSON.stringify([
    policy.threshold,
    policy.approvers.map((a) => [a.kind, a.name ?? '', a.role ?? '', a.department ?? '', a.required]),
  ])
}

/**
 * Where an approval of a tool of a space stands, in the words of UI-CONV-052 (UI-APPR-010): one line, "Waiting for
 * <name>'s approval", for a policy of one entry that names one person and needs one approval; otherwise "<approvals> of
 * <threshold> approvals, waiting for <entries>", the required ones first, each marked required.
 */
export type ProgressLine =
  | { key: 'waitingFor'; approver: string }
  | { key: 'progress'; approvals: number; threshold: number; entries: (EntryWords & { required: boolean })[] }

export function progressLineOf(
  progress: ApprovalProgress,
  policy?: Pick<ApprovalPolicyView, 'approvers' | 'threshold'>
): ProgressLine {
  const one = policy ? namesOnePerson(policy) : null
  const [waiting] = progress.waitingFor
  if (one && progress.approvals === 0) return { key: 'waitingFor', approver: one.name as string }
  // with no policy to read, a progress of one person, one approval needed, reads the same
  if (
    !policy &&
    progress.threshold === 1 &&
    progress.approvals === 0 &&
    progress.waitingFor.length === 1 &&
    waiting?.name &&
    (waiting.kind === 'owner' || waiting.kind === 'person')
  )
    return { key: 'waitingFor', approver: waiting.name }
  const required = progress.waitingFor.filter((e) => e.required)
  const optional = progress.waitingFor.filter((e) => !e.required)
  return {
    key: 'progress',
    approvals: progress.approvals,
    threshold: progress.threshold,
    entries: [...required, ...optional].map((e) => ({ ...entryWordsOf(e), required: e.required })),
  }
}

/** The names a policy's warning `own-requests-blocked` gives, in its order (UI-CONV-052). */
export function blockedNamesOf(warning: ApprovalPolicyWarning): string[] {
  return warning.code === 'own-requests-blocked' ? warning.approvers.map((a) => a.name) : []
}

/** The entries of a policy that need attention (UI-CONV-067): the required ones that name nobody now. */
export function attentionEntriesOf(
  policy: Pick<ApprovalPolicyView, 'approvers' | 'attention' | 'state'>
): ApproverView[] {
  if (policy.state !== 'needs-attention') return []
  return (policy.attention ?? []).map((i) => policy.approvers[i]).filter((a): a is ApproverView => !!a)
}

// ---------------------------------------------------------------------------------------------------- the form

/** One entry of the owner's form of a policy: what the agent named it by, and its words while it shows. */
export type PolicyFormEntry = ApproverView

/** The owner's form of a policy (UI-CONV-067), from what the agent says is in force; `chosenWhen`: the owner chose it. */
export interface PolicyForm {
  approvers: PolicyFormEntry[]
  threshold: number
  refusal: 'any' | 'required'
  attested: boolean
  whenApproverAsks: WhenApproverAsks
  /** whether the owner chose "When an approver makes the request"; until then it follows the approvers */
  chosenWhen: boolean
}

/**
 * The default of "When an approver makes the request" (UI-CONV-067, agent INTX-APPR-023): "Their own confirmation counts"
 * with one entry that names one person, "Another approver decides" otherwise.
 */
export function defaultWhenApproverAsksOf(approvers: readonly Pick<ApproverView, 'kind'>[]): WhenApproverAsks {
  const [only] = approvers
  return approvers.length === 1 && (only?.kind === 'owner' || only?.kind === 'person')
    ? 'own-confirmation'
    : 'another-approver'
}

/** The form of a policy in force (UI-CONV-067): the owner's choices as the agent holds them. */
export function policyFormOf(policy: ApprovalPolicyView): PolicyForm {
  const whenApproverAsks = policy.whenApproverAsks ?? defaultWhenApproverAsksOf(policy.approvers)
  return {
    approvers: policy.approvers.map((a) => ({ ...a })),
    threshold: policy.threshold,
    refusal: policy.refusal ?? 'any',
    attested: policy.bounds?.attested === 'required' ? true : (policy.attested ?? true),
    whenApproverAsks,
    // a value that is not the default for these approvers was chosen
    chosenWhen: whenApproverAsks !== defaultWhenApproverAsksOf(policy.approvers),
  }
}

/** The form with its approvers changed: "When an approver makes the request" follows them while the owner has not chosen. */
export function withApprovers(form: PolicyForm, approvers: PolicyFormEntry[]): PolicyForm {
  return {
    ...form,
    approvers,
    whenApproverAsks: form.chosenWhen ? form.whenApproverAsks : defaultWhenApproverAsksOf(approvers),
  }
}

/** The least number of approvals the form may ask (UI-CONV-067): the agent-pack's least, and every required entry. */
export function minApprovalsOf(
  form: Pick<PolicyForm, 'approvers'>,
  bounds?: Pick<ApprovalPolicyBounds, 'minApprovals'>
): number {
  return Math.max(bounds?.minApprovals ?? 1, form.approvers.filter((a) => a.required).length, 1)
}

/** The kinds of approver Add approver offers (UI-CONV-067): those the bounds allow, `role` only with a role to name. */
export function addableKindsOf(bounds: ApprovalPolicyBounds | undefined): ApproverKind[] {
  const kinds = bounds?.kinds ?? [...APPROVER_KINDS]
  return APPROVER_KINDS.filter((k) => kinds.includes(k) && (k !== 'role' || (bounds?.roles.length ?? 0) > 0))
}

/** What makes two entries the same (agent `repeated-entry`): their kind and whom they name. */
export function entryKeyOf(
  entry: Pick<ApproverView, 'kind' | 'memberId' | 'directoryId' | 'role' | 'department'>
): string {
  return [entry.kind, entry.memberId ?? '', entry.directoryId ?? '', entry.role ?? '', entry.department ?? ''].join(
    '\u0000'
  )
}

/** The policy to send (PROF-TOOL-036), whole: each entry by what names it, never by its words. */
export function policyInputOf(form: PolicyForm): ApprovalPolicyInput {
  return {
    approvers: form.approvers.map((a): ApproverInput => {
      switch (a.kind) {
        case 'person':
          return a.memberId
            ? { kind: 'person', memberId: a.memberId, required: a.required }
            : { kind: 'person', directoryId: a.directoryId ?? '', required: a.required }
        case 'role':
          return { kind: 'role', role: a.role ?? '', required: a.required }
        case 'department':
          return { kind: 'department', department: a.department ?? '', required: a.required }
        default:
          return { kind: a.kind, required: a.required }
      }
    }),
    threshold: form.threshold,
    refusal: form.refusal,
    attested: form.attested,
    whenApproverAsks: form.whenApproverAsks,
  }
}

/** Whether the form says something other than the policy in force: only then is it sent. */
export function policyChanged(form: PolicyForm, policy: ApprovalPolicyView): boolean {
  return JSON.stringify(policyInputOf(form)) !== JSON.stringify(policyInputOf(policyFormOf(policy)))
}

/** "Lower the number needed" (UI-CONV-067): one less, never below the least the form may ask. */
export function lowerThreshold(form: PolicyForm, bounds?: Pick<ApprovalPolicyBounds, 'minApprovals'>): PolicyForm {
  return { ...form, threshold: Math.max(minApprovalsOf(form, bounds), form.threshold - 1) }
}

/**
 * Where a refusal of a policy is shown (UI-CONV-067, UI-CONV-052): at the entry, the number needed or the switch the
 * agent's `field` names (`approvals.<tool>.approvers.<i>`, `.threshold`, `.attested`), or for the tool's policy as a
 * whole; null for a refusal that is not of a policy.
 */
export type PolicyRefusal = {
  tool: string
  at: 'approver' | 'threshold' | 'attested' | 'policy'
  index?: number
  reason:
    | 'notApproval'
    | 'approverNotAllowed'
    | 'notEligible'
    | 'repeatedEntry'
    | 'belowPackMinimum'
    | 'thresholdBelowRequired'
    | 'attestationRequired'
    | 'badPolicy'
}

const POLICY_CODES: Record<string, PolicyRefusal['reason']> = {
  'not-approval': 'notApproval',
  'approver-not-allowed': 'approverNotAllowed',
  'not-eligible': 'notEligible',
  'repeated-entry': 'repeatedEntry',
  'below-pack-minimum': 'belowPackMinimum',
  'threshold-below-required': 'thresholdBelowRequired',
  'attestation-required': 'attestationRequired',
}

export function policyRefusalOf(
  error: { status?: number; code?: string; field?: string } | undefined
): PolicyRefusal | null {
  const field = error?.field ?? ''
  const m = /^approvals\.([^.]+)(?:\.(approvers)\.(\d+)|\.(threshold|attested))?(?:\..*)?$/.exec(field)
  if (!m) return null
  const tool = m[1] as string
  const reason = POLICY_CODES[error?.code ?? ''] ?? (error?.status === 400 ? 'badPolicy' : null)
  if (!reason) return null
  if (m[2]) return { tool, at: 'approver', index: Number(m[3]), reason }
  if (m[4]) return { tool, at: m[4] as 'threshold' | 'attested', reason }
  return { tool, at: 'policy', reason }
}
