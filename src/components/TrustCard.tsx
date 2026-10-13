/** Trust card (D4, UI-TRUST-002/003/004/005/006): service, operator, accreditations, result with reasons. */
import type { AgentRecord, TrustSummary } from '@2060.io/hologram-ui-core'
import { ShieldAlert, ShieldCheck, ShieldQuestion, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'

export function TrustSummaryView({ trust, compact = false }: { trust: TrustSummary; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const Icon = trust.result === 'trusted' ? ShieldCheck : trust.result === 'untrusted' ? ShieldAlert : ShieldQuestion
  return (
    <div className="trust-card">
      <div className="row-between">
        <div className="row-between" style={{ gap: 10 }}>
          <Avatar
            name={trust.serviceName ?? trust.did}
            src={trust.result === 'trusted' ? trust.logoUri : undefined}
            size={40}
          />
          <div>
            <div style={{ fontWeight: 600 }}>
              {trust.serviceName ?? <span className="muted">{t('trust.unverifiedName')}</span>}
            </div>
            {trust.serviceType ? <div className="muted">{trust.serviceType}</div> : null}
          </div>
        </div>
        <span className={`result ${trust.result}`}>
          <Icon size={18} aria-hidden="true" /> {t(`trust.${trust.result}`)}
        </span>
      </div>
      {!compact && trust.description ? <div>{trust.description}</div> : null}
      {trust.operator ? (
        <div className="row">
          <span className="muted">{t('trust.operator')}</span>
          <span>
            {trust.operator.name}
            {trust.operator.countryCode ? ` (${trust.operator.countryCode})` : ''}
          </span>
        </div>
      ) : null}
      {!compact && trust.ecosystems?.length ? (
        <div className="row">
          <span className="muted">{t('trust.ecosystems')}</span>
          <span>{trust.ecosystems.map((e) => e.name ?? `#${e.id}`).join(', ')}</span>
        </div>
      ) : null}
      {!compact ? (
        <div className="row">
          <span className="muted">{t('trust.did')}</span>
          <span style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{trust.did}</span>
        </div>
      ) : null}
      {trust.reasons.length ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {trust.reasons.map((r) => (
            <li key={r}>{t(`trust.reasons.${r}`, r)}</li>
          ))}
        </ul>
      ) : null}
      <div className="muted" style={{ fontSize: 12 }}>
        {t('trust.checkedAt', { time: formatTime(trust.checkedAt, i18n.language) })}
      </div>
    </div>
  )
}

export function TrustCardDialog({
  agent,
  onClose,
  connect = false,
}: {
  agent: AgentRecord
  onClose: () => void
  connect?: boolean
}) {
  const { t } = useTranslation()
  const hub = useHub()
  const snap = useSnapshot()
  const trusted = agent.trust.result === 'trusted'
  const warnAllowed = snap.config.trustPolicy === 'warn'
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('trust.title')}
      className="panel"
      style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 40, maxWidth: 'none' }}
    >
      <div className="row-between">
        <h1>{t('trust.title')}</h1>
        <button type="button" className="icon-btn" aria-label={t('app.close')} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <TrustSummaryView trust={agent.trust} />
      {connect ? (
        <div className="column-actions" style={{ marginTop: 14 }}>
          {trusted ? (
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                void hub.connect(agent.did).then(onClose, (e) => hub.notify('error', String(e.message ?? e)))
              }
            >
              {t('trust.connect')}
            </button>
          ) : warnAllowed ? (
            <button
              type="button"
              className="btn danger"
              onClick={() =>
                void hub
                  .acknowledgeTrust(agent.did)
                  .then(() => hub.connect(agent.did))
                  .then(onClose)
              }
            >
              {t('trust.continueWithWarning')}
            </button>
          ) : (
            <span className="muted">{t('trust.refused')}</span>
          )}
        </div>
      ) : null}
    </div>
  )
}
