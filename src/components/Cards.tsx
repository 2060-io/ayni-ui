/** Inline menus, approval cards, elevation form, routed capabilities, generating placeholders (UI-CONV-004/006, UI-APPR-*, UI-CAP-*). */
import type { ApprovalActivity, CapabilityActivity, MenuActivity } from '@2060.io/hologram-agui-profile'
import type { SessionRecord } from '@2060.io/hologram-ui-core'
import { Smartphone } from 'lucide-react'
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
  const purposes = session.hologram?.purposes ?? []
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

export function GeneratingCard() {
  const { t } = useTranslation()
  return (
    <div className="card progress" aria-busy="true">
      {t('details.generating')}…
    </div>
  )
}
