/**
 * The Proof of Trust card (D33, UI-TRUST-002..006): over the conversation area only. The verdict,
 * the identity credentials with their claims, the other credentials presented, the accreditations with
 * the chain behind each, the DID Document endpoints and the governance documents.
 */
import {
  type Accreditation,
  type AgentRecord,
  type CredentialCard,
  flagOf,
  loadTrustDetails,
  type TrustDetails,
} from '@2060.io/hologram-ui-core'
import {
  Award,
  BadgeCheck,
  Building2,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  User,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'

const shortDid = (did: string) => (did.length > 48 ? `${did.slice(0, 22)}…${did.slice(-20)}` : did)

export function ProofOfTrust({
  agent,
  onClose,
  connect = false,
}: {
  agent: AgentRecord
  onClose: () => void
  connect?: boolean
}) {
  const { t, i18n } = useTranslation()
  const hub = useHub()
  const snap = useSnapshot()
  const [details, setDetails] = useState<TrustDetails | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    setDetails(null)
    loadTrustDetails(snap.config.veranaIndexerUrl, snap.config.veranaGraphUrl, agent.did)
      .then((d) => live && setDetails(d))
      .catch((e) => live && setError(String((e as Error).message)))
    return () => {
      live = false
    }
  }, [agent.did, snap.config.veranaIndexerUrl, snap.config.veranaGraphUrl])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const verdict = details
    ? details.trusted === null
      ? 'unverified'
      : details.trusted
        ? 'trusted'
        : 'untrusted'
    : agent.trust.result
  const Icon = verdict === 'trusted' ? ShieldCheck : verdict === 'untrusted' ? ShieldAlert : ShieldQuestion
  const when = (iso?: string) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : ''
  const trusted = verdict === 'trusted'
  const warnAllowed = snap.config.trustPolicy === 'warn'

  const body = (
    <div className="pot-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="pot" role="dialog" aria-modal="true" aria-label={t('pot.title')}>
        <header className="pot-head">
          <span className={`pot-dot ${verdict}`} aria-hidden="true" />
          <code className="pot-did" title={agent.did}>
            {shortDid(agent.did)}
          </code>
          <button
            type="button"
            className="tool"
            aria-label={t('pot.copyDid')}
            onClick={() =>
              void navigator.clipboard.writeText(agent.did).then(() => hub.notify('info', t('conversation.copied')))
            }
          >
            <Copy size={15} />
          </button>
          <a
            className="tool"
            aria-label={t('pot.openInGraph')}
            href={`${snap.config.veranaGraphUrl.replace(/graph\./, 'search.')}/?q=${encodeURIComponent(agent.did)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} />
          </a>
          <span className="spacer" />
          <button type="button" className="tool" aria-label={t('app.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="pot-body">
          <div className={`pot-verdict ${verdict}`}>
            <Icon size={22} aria-hidden="true" />
            <span className="pot-verdict-label">{t(`trust.${verdict}`)}</span>
            {details?.evaluatedAt ? (
              <span className="pot-verdict-sub">
                {t('pot.evaluated', { time: when(details.evaluatedAt) })}
                {details.evaluatedAtBlock ? ` · ${t('pot.block', { block: details.evaluatedAtBlock })}` : ''}
              </span>
            ) : null}
          </div>
          {verdict !== 'trusted' && agent.trust.reasons.length ? (
            <ul className="pot-reasons">
              {agent.trust.reasons.map((r) => (
                <li key={r}>{t(`trust.reasons.${r}`)}</li>
              ))}
            </ul>
          ) : null}
          {error ? <div className="banner warning">{error}</div> : null}
          {!details && !error ? (
            <div className="pot-loading">
              <Loader2 size={16} className="spin" aria-hidden="true" /> {t('pot.loading')}
            </div>
          ) : null}

          {details ? (
            <>
              <ol className="pot-timeline">
                {details.service ? <IdentityStep kind="service" card={details.service} did={agent.did} /> : null}
                {details.operator ? <IdentityStep kind="operator" card={details.operator} did={agent.did} /> : null}
              </ol>

              {details.otherCredentials.length ? (
                <Section
                  icon={<Award size={16} />}
                  title={t('pot.alsoPresents')}
                  count={details.otherCredentials.length}
                >
                  {details.otherCredentials.map((c) => (
                    <div key={c.id} className="pot-row">
                      <span className="pot-row-title">{c.schemaTitle}</span>
                      <span className="muted">
                        {c.issuer.name ? t('pot.issuedBy', { name: c.issuer.name }) : null}
                        {c.ecosystem.name ? ` · ${c.ecosystem.name}` : ''}
                        {c.validUntil ? ` · ${t('pot.validUntil', { time: when(c.validUntil) })}` : ''}
                      </span>
                      <span className={`pot-valid ${c.valid ? 'ok' : 'bad'}`}>
                        {c.valid ? <Check size={14} /> : <X size={14} />} {t(c.valid ? 'pot.verified' : 'pot.invalid')}
                      </span>
                      <Claims claims={c.claims} />
                    </div>
                  ))}
                </Section>
              ) : null}

              {details.accreditations.length ? (
                <Section
                  icon={<BadgeCheck size={16} />}
                  title={t('pot.accreditations')}
                  count={details.accreditations.length}
                >
                  {details.accreditations.map((a) => (
                    <AccreditationRow key={a.participantId} a={a} />
                  ))}
                </Section>
              ) : null}

              {details.endpoints.length ? (
                <Section icon={<Link2 size={16} />} title={t('pot.endpoints')} count={details.endpoints.length}>
                  {details.endpoints.map((e) => (
                    <div key={e.id} className="pot-row pot-endpoint">
                      <span className="tag">{e.type}</span>
                      <code className="mono">{e.endpoint}</code>
                    </div>
                  ))}
                </Section>
              ) : null}

              {details.governance.ecosystems.length || details.governance.corporation ? (
                <Section icon={<FileText size={16} />} title={t('pot.governance')}>
                  {details.governance.ecosystems.map((e) => (
                    <div key={e.id} className="pot-row">
                      <span className="pot-row-title">
                        <Globe size={14} aria-hidden="true" /> {e.name ?? `${t('pot.ecosystem')} ${e.id}`}
                      </span>
                      {e.documents.map((d) => (
                        <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer nofollow">
                          {t('pot.egf')} <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  ))}
                  {details.governance.corporation?.documents.length ? (
                    <div className="pot-row">
                      <span className="pot-row-title">
                        <Building2 size={14} aria-hidden="true" />{' '}
                        {t('pot.corporation', { id: details.governance.corporation.id })}
                      </span>
                      {details.governance.corporation.documents.map((d) => (
                        <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer nofollow">
                          {t('pot.cgf')} <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </Section>
              ) : null}
            </>
          ) : null}

          {connect ? (
            <div className="pot-actions">
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
      </section>
    </div>
  )
  const host = document.querySelector('.conversation')
  return host ? createPortal(body, host) : body
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="pot-section">
      <h3>
        {icon} {title}
        {count !== undefined ? <span className="pot-count">{count}</span> : null}
      </h3>
      {children}
    </section>
  )
}

function IdentityStep({ kind, card, did }: { kind: 'service' | 'operator'; card: CredentialCard; did: string }) {
  const { t, i18n } = useTranslation()
  const c = card.claims
  const name = String(c.name ?? '')
  const persona = card.ecsSchema === 'PersonaCredential'
  const when = (iso?: string) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso)) : ''
  const flag = flagOf(c.countryCode as string | undefined)
  return (
    <li className="pot-step">
      <span className={`pot-node ${card.valid ? 'ok' : 'bad'}`} aria-hidden="true">
        {card.valid ? <Check size={16} /> : <X size={16} />}
      </span>
      <div className="pot-step-body">
        <div className="pot-kicker">
          {t(kind === 'service' ? 'pot.service' : 'pot.operatedBy')} · {card.schemaTitle}
        </div>
        <div className="pot-identity">
          <Avatar name={name || did} src={String(c.logoUri ?? c.avatarUri ?? '') || undefined} size={56} />
          <div className="pot-identity-text">
            <div className="pot-name">
              {kind === 'operator' ? (
                persona ? (
                  <User size={18} aria-hidden="true" />
                ) : (
                  <Building2 size={18} aria-hidden="true" />
                )
              ) : null}
              {name}
              {flag ? (
                <span className="flag" role="img" aria-label={String(c.countryCode)}>
                  {flag}
                </span>
              ) : null}
            </div>
            {kind === 'service' ? (
              <>
                {c.type ? <span className="tag">{String(c.type)}</span> : null}
                {c.description ? <p className="pot-desc">{String(c.description)}</p> : null}
                <div className="pot-facts">
                  {typeof c.minimumAgeRequired === 'number' && c.minimumAgeRequired > 0 ? (
                    <span>{t('pot.minimumAge', { age: c.minimumAgeRequired })}</span>
                  ) : null}
                  {typeof c.termsAndConditionsUri === 'string' ? (
                    <a href={c.termsAndConditionsUri} target="_blank" rel="noopener noreferrer nofollow">
                      {t('column.terms')} <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {typeof c.privacyPolicyUri === 'string' ? (
                    <a href={c.privacyPolicyUri} target="_blank" rel="noopener noreferrer nofollow">
                      {t('column.privacy')} <ExternalLink size={11} />
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="pot-facts column">
                {c.address ? <span>{String(c.address)}</span> : null}
                {c.registryId ? (
                  <span>
                    {t('pot.registryId')}: <strong>{String(c.registryId)}</strong>
                  </span>
                ) : null}
                {c.lei ? (
                  <span>
                    LEI: <strong>{String(c.lei)}</strong>
                  </span>
                ) : null}
                {c.legalJurisdiction ? (
                  <span>
                    {t('pot.jurisdiction')}: <strong>{String(c.legalJurisdiction)}</strong>
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="pot-provenance">
          {card.selfIssued
            ? t('pot.selfIssued')
            : card.issuer.name
              ? t('pot.issuedBy', { name: card.issuer.name })
              : t('pot.issuedByUnknown')}
          {card.ecosystem.name ? ` · ${card.ecosystem.name}` : ''}
          {card.issuedAt ? ` · ${t('pot.since', { time: when(card.issuedAt) })}` : ''}
          {card.validUntil ? ` · ${t('pot.validUntil', { time: when(card.validUntil) })}` : ''}
        </div>
      </div>
    </li>
  )
}

function AccreditationRow({ a }: { a: Accreditation }) {
  const { t } = useTranslation()
  const chain = a.chain.filter((c) => c.participantId !== a.participantId)
  return (
    <div className="pot-row">
      <span className={`role role-${a.role.toLowerCase()}`}>{t(`pot.role.${a.role}`)}</span>
      <span className="pot-row-title">{a.schemaTitle}</span>
      <span className="muted">
        {a.ecosystem.name ?? `${t('pot.ecosystem')} ${a.ecosystem.id}`}
        {chain.length
          ? ` · ${chain.map((c) => c.who.name ?? t(`pot.role.${c.role}`)).join(' → ')}`
          : ` · ${t('pot.root')}`}
        {a.state !== 'ACTIVE' ? ` · ${a.state.toLowerCase()}` : ''}
      </span>
    </div>
  )
}

/** The claims of a non-identity credential, flat key/value, strings and numbers only. */
function Claims({ claims }: { claims: Record<string, unknown> }) {
  const rows = Object.entries(claims).filter(
    ([k, v]) => k !== 'id' && !/Sri$/.test(k) && (typeof v === 'string' || typeof v === 'number')
  )
  if (!rows.length) return null
  return (
    <dl className="pot-claims">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>
            {/^https?:\/\//.test(String(v)) ? (
              <a href={String(v)} target="_blank" rel="noopener noreferrer nofollow">
                {String(v)}
              </a>
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
