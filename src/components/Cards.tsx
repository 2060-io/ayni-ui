/**
 * Inline menus, approval cards, elevation form, routed capabilities, flow cards, generating placeholders
 * (UI-CONV-004/006/021, UI-APPR-*, UI-CAP-*).
 */
import type { ApprovalActivity, CapabilityActivity, FlowActivity, MenuActivity } from '@ayni.org/ayni-agui-profile'
import { isClosedFlow, type SessionRecord } from '@ayni.org/ayni-ui-core'
import { BadgeCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub } from '../state/useHub.js'

export function MenuCard({ sessionId, menu }: { sessionId: string; menu: MenuActivity }) {
  const hub = useHub()
  const { t } = useTranslation()
  const answered = !!menu.selectedItemId
  return (
    <div className="card">
      <div>{menu.prompt}</div>
      <fieldset className="menu">
        {menu.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn ${menu.selectedItemId === item.id ? 'primary' : ''}`}
            disabled={answered || hub.isRunning(sessionId)}
            onClick={() =>
              void hub.act(sessionId, { kind: 'menu.select', menuId: menu.menuId, itemId: item.id }, item.label)
            }
          >
            {item.label}
            {item.description ? <span className="muted"> {item.description}</span> : null}
          </button>
        ))}
      </fieldset>
      {answered ? <div className="meta muted">{t('conversation.menuAnswered')}</div> : null}
    </div>
  )
}

export function ApprovalCard({
  sessionId,
  approval,
}: {
  sessionId: string
  approval: Partial<ApprovalActivity> & { approvalId?: string; text?: string; grantExpiresAt?: string }
}) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [note, setNote] = useState('')
  const status = approval.status ?? 'PENDING'
  const kind = approval.kind ?? 'sensitivity'
  return (
    <section className="card" aria-label={t('approval.title')}>
      <h3>{t(`approval.${kind}`)}</h3>
      {approval.requester ? (
        <div className="row">
          <span>{t('approval.requester')}</span>
          <span>{approval.requester.displayName}</span>
        </div>
      ) : null}
      <div className="row">
        <span>{t('approval.tool')}</span>
        <span>{approval.tool ?? approval.text}</span>
      </div>
      {approval.purpose ? (
        <div className="row">
          <span>{t('approval.purpose')}</span>
          <span>{approval.purpose.label}</span>
        </div>
      ) : null}
      {approval.justification ? (
        <div className="row">
          <span>{t('approval.justification')}</span>
          <span>{approval.justification}</span>
        </div>
      ) : null}
      <div className="row">
        <span>{t('approval.title')}</span>
        <span>{t(`approval.status.${status}`)}</span>
      </div>
      {approval.grantExpiresAt ? (
        <div className="muted">
          {t('approval.grantUntil', { time: formatTime(approval.grantExpiresAt, i18n.language) })}
        </div>
      ) : null}
      {status === 'PENDING' && approval.expiresAt ? (
        <div className="muted">{t('approval.expires', { time: formatTime(approval.expiresAt, i18n.language) })}</div>
      ) : null}
      {status === 'PENDING' && approval.canDecide && approval.approvalId ? (
        <>
          <input
            className="input"
            placeholder={t('approval.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                void hub.act(sessionId, {
                  kind: 'approval.decide',
                  approvalId: approval.approvalId ?? '',
                  decision: 'approve',
                  note: note || undefined,
                })
              }
            >
              {t('approval.approve')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() =>
                void hub.act(sessionId, {
                  kind: 'approval.decide',
                  approvalId: approval.approvalId ?? '',
                  decision: 'reject',
                  note: note || undefined,
                })
              }
            >
              {t('approval.reject')}
            </button>
          </div>
        </>
      ) : null}
      {status === 'PENDING' && approval.own && approval.approvalId ? (
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => void hub.act(sessionId, { kind: 'approval.cancel', approvalId: approval.approvalId ?? '' })}
          >
            {t('approval.withdraw')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** The human authors purpose and justification; nothing is prefilled or suggested (UI-APPR-003). */
export function ElevationForm({ session, onClose }: { session: SessionRecord; onClose: () => void }) {
  const hub = useHub()
  const { t } = useTranslation()
  const [tool, setTool] = useState('')
  const [purposeId, setPurposeId] = useState('')
  const [justification, setJustification] = useState('')
  const purposes = session.ayni?.purposes ?? []
  const valid = tool.trim() && purposeId && justification.trim()
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        void hub
          .act(session.sessionId, {
            kind: 'elevation.request',
            tool: tool.trim(),
            purposeId,
            justification: justification.trim(),
          })
          .then(onClose)
      }}
    >
      <h3>{t('elevation.title')}</h3>
      <p className="muted">{t('elevation.hint')}</p>
      <label className="field">
        {t('elevation.tool')}
        <input className="input" value={tool} onChange={(e) => setTool(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        {t('elevation.purpose')}
        <select className="input" value={purposeId} onChange={(e) => setPurposeId(e.target.value)}>
          <option value="">{t('elevation.choosePurpose')}</option>
          {purposes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('elevation.justification')}
        <textarea
          className="input"
          rows={3}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          autoComplete="off"
          spellCheck
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn primary" disabled={!valid}>
          {t('elevation.send')}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t('app.cancel')}
        </button>
      </div>
    </form>
  )
}

/** The "continue on your phone" card names the kind of what the phone is doing (UI-CAP-001/005). */
export function CapabilityCard({ capability }: { capability: Partial<CapabilityActivity> & { kind?: string } }) {
  const { t } = useTranslation()
  const status = capability.status ?? 'pending'
  const label = capability.challengeType
    ? t(`capability.${capability.challengeType}`)
    : t(`capability.${capability.kind ?? 'authentication'}`)
  return (
    <div className="card" role="status">
      <h3 className="row-between" style={{ justifyContent: 'flex-start', gap: 8 }}>
        <Smartphone size={16} aria-hidden="true" /> {t('capability.title')}
      </h3>
      <div>{label}</div>
      <div className="muted">{capability.message ?? t(`capability.status.${status}`)}</div>
    </div>
  )
}

const HIDDEN_PREVIEW_KEYS = new Set([
  'claims',
  'attributes',
  'attestation',
  'decision',
  'confirmed',
  'txHash',
  'browser',
])

function labelOf(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

/** A key/value list of what the person received or disclosed (claims, attributes, anything else the agent previews). */
function PreviewList({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
  if (!entries.length) return null
  return (
    <dl className="flow-claims">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{labelOf(k)}</dt>
          <dd>{String(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The flow card (UI-CONV-021, PROF-MAP-007): the pending text of its kind while the flow is open, then its outcome
 * and the preview the agent built from what the person received or disclosed. Ordered at the open time, replaced
 * in place at the close by the reducer.
 */
export function FlowCard({ flow }: { flow: Partial<FlowActivity> & { kind?: string; reason?: string } }) {
  const { t } = useTranslation()
  const kind = flow.kind ?? 'present'
  const closed = isClosedFlow(flow.state)
  const preview = (flow.preview ?? {}) as Record<string, unknown>
  const kindLabel = t(`flow.kind.${kind}`, { defaultValue: t('capability.title') })
  if (!closed) {
    return (
      <div className="card flow pending" role="status" data-flow-id={flow.flowId}>
        <h3 className="row-between" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <Smartphone size={16} aria-hidden="true" /> {kindLabel}
        </h3>
        <div>{flow.title}</div>
        <div className="muted">{t(`flow.pending.${kind}`, { defaultValue: t('flow.pending.default') })}</div>
      </div>
    )
  }
  const outcome = flow.outcome ?? (flow.state as string)
  const ok = outcome === 'completed'
  const attestation = preview.attestation as { method?: string } | undefined
  const attested = attestation?.method
    ? t('flow.attested', { method: t(`flow.attestation.${attestation.method}`, { defaultValue: attestation.method }) })
    : undefined
  const result = (() => {
    if (!ok) return t(`flow.outcome.${outcome}`, { defaultValue: outcome })
    switch (kind) {
      case 'issue':
        return t('flow.credentialReceived')
      case 'present':
        return t('flow.shared')
      case 'authorize':
        return preview.decision === 'rejected' ? t('flow.rejected') : t('flow.approved')
      case 'confirm':
        return preview.confirmed === false ? t('flow.notConfirmed') : t('flow.confirmed')
      case 'link-session':
        return t('flow.linked')
      default:
        return t('flow.outcome.completed')
    }
  })()
  const claims = (preview.claims ?? preview.attributes) as Record<string, unknown> | undefined
  const rest = Object.fromEntries(Object.entries(preview).filter(([k]) => !HIDDEN_PREVIEW_KEYS.has(k)))
  const txHash = (preview.txHash as string | undefined) ?? flow.references?.find((r) => r.type === 'transaction')?.id
  return (
    <div className={['card', 'flow', ok ? 'completed' : 'ended'].join(' ')} data-flow-id={flow.flowId}>
      <h3 className="row-between" style={{ justifyContent: 'flex-start', gap: 8 }}>
        <BadgeCheck size={16} aria-hidden="true" /> {kindLabel}
      </h3>
      <div>{flow.title}</div>
      <div className={ok ? '' : 'muted'}>
        {result}
        {attested ? <span className="muted">, {attested}</span> : null}
      </div>
      {flow.reason ? (
        <div className="muted">
          {t('flow.reason')}: {flow.reason}
        </div>
      ) : null}
      {claims ? <PreviewList values={claims} /> : null}
      <PreviewList values={rest} />
      {txHash ? (
        <div className="meta muted">
          {t('flow.transaction')}: <code>{txHash}</code>
        </div>
      ) : null}
      {ok && kind === 'issue' ? <div className="meta muted">{t('flow.openInWallet')}</div> : null}
    </div>
  )
}

export function GeneratingCard() {
  const { t } = useTranslation()
  return (
    <div className="card progress" aria-busy="true">
      {t('details.generating')}…
    </div>
  )
}
