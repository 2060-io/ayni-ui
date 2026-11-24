/**
 * The approval policy of a tool in the owner's panel of its source (UI-CONV-067, profile 3.5.4 PROF-TOOL-036; agent
 * D137 to D140), under its rule in What each tool asks, in this order: Who approves, each entry with its switch Required
 * and Remove, and Add approver, which offers only what the agent-pack's bounds allow; Approvals needed, from the larger
 * of the agent-pack's least and the required entries; When someone refuses; Confirm with fingerprint or face, on and
 * not editable when the agent-pack requires it; When an approver makes the request, which follows the approvers until
 * the owner chooses. The policy is saved with the settings of the tool. Each warning the agent gives is shown under it
 * with three controls that change the form, not the policy; a policy that needs attention says so at the entries that
 * name nobody.
 */
import {
  type AgentRecord,
  type ApprovalPolicyView,
  type ApproverKind,
  addableKindsOf,
  attentionEntriesOf,
  blockedNamesOf,
  entryKeyOf,
  entryWordsOf,
  handoverCandidatesOf,
  lowerThreshold,
  minApprovalsOf,
  type PolicyForm,
  type PolicyFormEntry,
  type PolicyRefusal,
  type SpaceInfo,
  withApprovers,
} from '@ayni.org/ayni-ui-core'
import { CircleAlert, Plus, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { attentionText, entryText } from './ApprovalWords.js'
import { PeoplePicker } from './SpaceAdmin.js'
import { organizationNameOf, useSpaceDetail } from './SpaceParts.js'

type T = (key: string, options?: Record<string, unknown>) => string

/** The words of a refusal of a policy, at the place it names (UI-CONV-052). */
export function policyRefusalText(refusal: PolicyRefusal, agentName: string, minApprovals: number, t: T): string {
  switch (refusal.reason) {
    case 'approverNotAllowed':
      return t('policy.approverNotAllowed', { agent: agentName })
    case 'notEligible':
      return t('policy.notEligible')
    case 'repeatedEntry':
      return t('policy.repeatedEntry')
    case 'belowPackMinimum':
      return t('policy.belowPackMinimum', { agent: agentName, n: minApprovals })
    case 'thresholdBelowRequired':
      return t('policy.thresholdBelowRequired')
    case 'attestationRequired':
      return t('policy.attestationRequired', { agent: agentName })
    case 'notApproval':
      return t('policy.notApproval')
    default:
      return t('policy.badPolicy', { agent: agentName })
  }
}

/** "Needs attention: Marta Kova can no longer approve" (UI-CONV-067), for a policy, or for one entry of it. */
export function AttentionLine({
  policy,
  className = '',
}: {
  policy: ApprovalPolicyView | undefined
  className?: string
}) {
  const { t } = useTranslation()
  const entries = policy ? attentionEntriesOf(policy) : []
  if (!entries.length) return null
  return (
    <span className={`policy-attention ${className}`.trim()}>
      <TriangleAlert size={13} aria-hidden="true" className="policy-attention-icon" />{' '}
      {t('policy.needsAttention', { entries: attentionText(entries, t) })}
    </span>
  )
}

/** The words of a warning of a policy (UI-CONV-052). */
function warningText(warning: NonNullable<ApprovalPolicyView['warnings']>[number], t: T): string {
  if (warning.code === 'unreachable') return t('policy.unreachable')
  const names = blockedNamesOf(warning)
    .map((name) => t('policy.possessive', { name }))
    .join(t('policy.and'))
  return t('policy.ownRequestsBlocked', { names })
}

/** Add approver (UI-CONV-067): a kind the bounds allow, then whom it names; the entry joins the list optional. */
function AddApprover({
  agent,
  space,
  policy,
  form,
  disabled,
  onAdd,
  onCancel,
}: {
  agent: AgentRecord
  space: SpaceInfo
  policy: ApprovalPolicyView
  form: PolicyForm
  disabled: boolean
  onAdd: (entry: PolicyFormEntry) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const detail = useSpaceDetail(agent.did, space)
  const present = new Set(form.approvers.map(entryKeyOf))
  const free = (entry: Pick<PolicyFormEntry, 'kind' | 'memberId' | 'directoryId' | 'role' | 'department'>) =>
    !present.has(entryKeyOf(entry))
  const kinds = addableKindsOf(policy.bounds).filter(
    (k) => k === 'person' || k === 'role' || k === 'department' || free({ kind: k })
  )
  const [kind, setKind] = useState<ApproverKind | ''>(kinds[0] ?? '')
  const [memberId, setMemberId] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState('')
  const [picking, setPicking] = useState(false)
  // the owner and members who could approve: active members who are not guests; the owner is one of them
  const members = [
    ...(detail?.members ?? []).filter((m) => m.state === 'active' && m.role === 'owner'),
    ...handoverCandidatesOf(detail?.members),
  ]
    // a person an entry names already, by name (the owner's entry names the owner), is not offered again
    .filter((m) => free({ kind: 'person', memberId: m.memberId }) && !form.approvers.some((a) => a.name === m.name))
  const roles = (policy.bounds?.roles ?? []).filter((r) => free({ kind: 'role', role: r }))
  const add = () => {
    if (kind === 'owner' || kind === 'member') onAdd({ kind, required: false })
    else if (kind === 'person' && memberId) {
      const m = members.find((x) => x.memberId === memberId)
      onAdd({ kind: 'person', memberId, ...(m ? { name: m.name } : {}), required: false })
    } else if (kind === 'role' && role) onAdd({ kind: 'role', role, required: false })
    else if (kind === 'department' && department.trim())
      onAdd({ kind: 'department', department: department.trim(), required: false })
  }
  const ready =
    kind === 'owner' ||
    kind === 'member' ||
    (kind === 'person' && !!memberId) ||
    (kind === 'role' && !!role) ||
    (kind === 'department' && !!department.trim())
  const rule = space.membership.mode === 'rule'
  return (
    <div className="policy-add box">
      <label className="field">
        {t('policy.addApprover')}
        <select
          className="input"
          value={kind}
          disabled={disabled}
          onChange={(e) => setKind(e.target.value as ApproverKind)}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(`policy.kind.${k}`)}
            </option>
          ))}
        </select>
      </label>
      {kind === 'person' ? (
        rule ? (
          // a rule space's people are found in the employee list (PROF-DIR-001), by their entry
          <button type="button" className="btn" disabled={disabled} onClick={() => setPicking(true)}>
            {t('spaces.settings.transferSearch', { organization: organizationNameOf(agent) })}
          </button>
        ) : (
          <label className="field">
            {t('policy.member')}
            <select
              className="input"
              value={memberId}
              disabled={disabled}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">{t('spaces.settings.transferPick')}</option>
              {members.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )
      ) : kind === 'role' ? (
        <label className="field">
          {t('policy.role')}
          <select className="input" value={role} disabled={disabled} onChange={(e) => setRole(e.target.value)}>
            <option value="" />
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ) : kind === 'department' ? (
        <label className="field">
          {t('policy.department')}
          <input
            className="input"
            value={department}
            disabled={disabled}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </label>
      ) : null}
      <div className="tool-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('app.cancel')}
        </button>
        {kind === 'person' && rule ? null : (
          <button type="button" className="btn primary policy-add-confirm" disabled={disabled || !ready} onClick={add}>
            {t('policy.add')}
          </button>
        )}
      </div>
      {picking ? (
        <PeoplePicker
          agent={agent}
          title={t('policy.addApprover')}
          actionLabel={t('policy.add')}
          onPick={async (p) => {
            if (free({ kind: 'person', directoryId: p.directoryId }))
              onAdd({ kind: 'person', directoryId: p.directoryId, name: p.name, required: false })
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  )
}

/** The form of a tool's policy (UI-CONV-067): it changes nothing until the Save of the settings sends it. */
export function PolicyEditor({
  agent,
  space,
  toolName,
  title,
  policy,
  form,
  disabled,
  error,
  onChange,
}: {
  agent: AgentRecord
  space: SpaceInfo
  toolName: string
  title: string
  /** the policy as the agent last gave it: its bounds, warnings and attention */
  policy: ApprovalPolicyView
  form: PolicyForm
  disabled: boolean
  error: PolicyRefusal | null
  onChange: (form: PolicyForm) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const bounds = policy.bounds
  const least = minApprovalsOf(form, bounds)
  const reader = space.owner?.name
  const attention = new Set(policy.state === 'needs-attention' ? (policy.attention ?? []) : [])
  // an entry the agent said names nobody: matched by what names it, since the form may have moved it
  const attentionKeys = new Set(policy.approvers.filter((_, i) => attention.has(i)).map(entryKeyOf))
  const errorText = error ? policyRefusalText(error, agent.name, bounds?.minApprovals ?? 1, t) : ''
  const errorAt = (at: PolicyRefusal['at'], index?: number) =>
    error && error.at === at && (index === undefined || error.index === index) ? (
      <span className="field-error" role="alert">
        <CircleAlert size={13} aria-hidden="true" className="field-error-icon" /> {errorText}
      </span>
    ) : null
  const name = (key: string) => `policy-${toolName}-${key}`
  const setEntry = (i: number, entry: PolicyFormEntry) =>
    onChange(
      withApprovers(
        form,
        form.approvers.map((e, j) => (j === i ? entry : e))
      )
    )
  const warnings = policy.warnings ?? []
  return (
    <fieldset className="policy" aria-label={`${t('policy.who')}: ${title}`}>
      <div className="policy-section">
        <span className="policy-label">{t('policy.who')}</span>
        <ul className="policy-entries">
          {form.approvers.map((entry, i) => {
            const words = entryText(entryWordsOf(entry, reader), t)
            return (
              <li key={`${entryKeyOf(entry)}-${i}`} className="policy-entry">
                <span className="policy-entry-name">{words}</span>
                <label className="check policy-required">
                  <input
                    type="checkbox"
                    checked={entry.required}
                    disabled={disabled}
                    onChange={(e) => setEntry(i, { ...entry, required: e.target.checked })}
                  />
                  {t('policy.required')}
                </label>
                <button
                  type="button"
                  className="link policy-remove"
                  disabled={disabled || form.approvers.length < 2}
                  aria-label={`${t('policy.remove')} ${words}`}
                  onClick={() =>
                    onChange(
                      withApprovers(
                        form,
                        form.approvers.filter((_, j) => j !== i)
                      )
                    )
                  }
                >
                  <X size={13} aria-hidden="true" /> {t('policy.remove')}
                </button>
                {attentionKeys.has(entryKeyOf(entry)) ? (
                  <span className="policy-attention">
                    <TriangleAlert size={13} aria-hidden="true" className="policy-attention-icon" />{' '}
                    {t('policy.needsAttention', { entries: entryText(entryWordsOf(entry), t) })}
                  </span>
                ) : null}
                {errorAt('approver', i)}
              </li>
            )
          })}
        </ul>
        {adding ? (
          <AddApprover
            agent={agent}
            space={space}
            policy={policy}
            form={form}
            disabled={disabled}
            onAdd={(entry) => {
              onChange(withApprovers(form, [...form.approvers, entry]))
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className="btn small policy-add-open"
            disabled={disabled}
            onClick={() => setAdding(true)}
          >
            <Plus size={14} aria-hidden="true" /> {t('policy.addApprover')}
          </button>
        )}
      </div>
      <label className="field policy-section">
        {t('policy.needed')}
        <input
          className="input policy-threshold"
          type="number"
          inputMode="numeric"
          min={least}
          step={1}
          value={form.threshold}
          disabled={disabled}
          aria-invalid={error?.at === 'threshold' ? true : undefined}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isInteger(n) && n >= 1) onChange({ ...form, threshold: n })
          }}
        />
        {errorAt('threshold')}
      </label>
      <div className="policy-section" role="radiogroup" aria-label={t('policy.refusal')}>
        <span className="policy-label">{t('policy.refusal')}</span>
        {(['any', 'required'] as const).map((r) => (
          <label key={r} className="check">
            <input
              type="radio"
              name={name('refusal')}
              checked={form.refusal === r}
              disabled={disabled}
              onChange={() => onChange({ ...form, refusal: r })}
            />
            {t(r === 'any' ? 'policy.refusalAny' : 'policy.refusalRequired')}
          </label>
        ))}
      </div>
      <label className="check policy-section">
        <input
          type="checkbox"
          checked={form.attested}
          // on, and not editable, when the agent-pack requires it (UI-CONV-067)
          disabled={disabled || bounds?.attested === 'required'}
          onChange={(e) => onChange({ ...form, attested: e.target.checked })}
        />
        {t('policy.attested')}
        {errorAt('attested')}
      </label>
      <div className="policy-section" role="radiogroup" aria-label={t('policy.whenAsks')}>
        <span className="policy-label">{t('policy.whenAsks')}</span>
        {(['another-approver', 'own-confirmation'] as const).map((w) => (
          <label key={w} className="check">
            <input
              type="radio"
              name={name('when')}
              checked={form.whenApproverAsks === w}
              disabled={disabled}
              onChange={() => onChange({ ...form, whenApproverAsks: w, chosenWhen: true })}
            />
            {t(w === 'another-approver' ? 'policy.anotherApprover' : 'policy.ownConfirmation')}
          </label>
        ))}
      </div>
      {errorAt('policy')}
      {warnings.map((w) => (
        <div key={w.code} className="policy-warning" role="status">
          <span>
            <TriangleAlert size={14} aria-hidden="true" className="policy-attention-icon" /> {warningText(w, t)}
          </span>
          <div className="tool-actions">
            <button type="button" className="btn small" disabled={disabled} onClick={() => setAdding(true)}>
              {t('policy.addApprover')}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={disabled || form.threshold <= least}
              onClick={() => onChange(lowerThreshold(form, bounds))}
            >
              {t('policy.lowerNeeded')}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={disabled || form.whenApproverAsks === 'own-confirmation'}
              onClick={() => onChange({ ...form, whenApproverAsks: 'own-confirmation', chosenWhen: true })}
            >
              {t('policy.useOwnConfirmation')}
            </button>
          </div>
        </div>
      ))}
    </fieldset>
  )
}
