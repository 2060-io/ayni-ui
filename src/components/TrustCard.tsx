/** Trust card (D4, UI-TRUST-002/003/004/005/006): service, operator, accreditations, result with reasons. */
import type { AgentRecord, TrustSummary } from '@ayni.org/ayni-ui-core'
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { Avatar } from './Avatar.js'
import { ProofOfTrust } from './ProofOfTrust.js'

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

export function TrustCardDialog(props: { agent: AgentRecord; onClose: () => void; connect?: boolean }) {
  return <ProofOfTrust {...props} />
}
