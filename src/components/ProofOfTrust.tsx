/**
 * The Proof of Trust card (D33, UI-TRUST-002..006): over the conversation area only. The verdict,
 * the identity credentials with their claims, the other credentials presented, the accreditations with
 * the chain behind each, the DID Document endpoints and the governance documents.
 */
import {
  type Accreditation,
  type AgentRecord,
  accreditationLine,
  type CredentialCard,
  claimRows,
  PROOF_OF_TRUST_DESIGN as D,
  didSearchUrl,
  identityStepOf,
  loadTrustDetails,
  otherCredentialLine,
  type ProofOfTrustText,
  schemaLabel,
  shortDid,
  type TrustDetails,
  VERDICT_MARK,
  verdictOf,
} from '@ayni.org/ayni-ui-core'
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
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'

const VERDICT_ICON = { 'shield-check': ShieldCheck, 'shield-alert': ShieldAlert, 'shield-question': ShieldQuestion }

/** The card's wording from the translation files, as the shared presentation functions ask for it. */
function usePotText(): ProofOfTrustText {
  const { t } = useTranslation()
  return (key, values) => t(`pot.${key}`, values ?? {})
}

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

  const pot = usePotText()
  const verdict = verdictOf(details, agent.trust.result)
  const Icon = VERDICT_ICON[VERDICT_MARK[verdict].icon]
  const when = (iso?: string) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : ''
  const trusted = verdict === 'trusted'
  const warnAllowed = snap.config.trustPolicy === 'warn'

  return (
    <div className="pot-view">
      <section className="pot" aria-label={t('pot.title')}>
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
            <Copy size={D.head.toolIconSize} />
          </button>
          <a
            className="tool"
            aria-label={t('pot.openInGraph')}
            href={didSearchUrl(snap.config.veranaGraphUrl, agent.did)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={D.head.toolIconSize} />
          </a>
          <span className="spacer" />
          <button type="button" className="tool" aria-label={t('app.close')} onClick={onClose}>
            <X size={D.head.closeIconSize} />
          </button>
        </header>

        <div className="pot-body">
          <div className={`pot-verdict ${verdict}`}>
            <Icon size={D.verdict.iconSize} aria-hidden="true" />
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
              <Loader2 size={D.loading.iconSize} className="spin" aria-hidden="true" /> {t('pot.loading')}
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
                  icon={<Award size={D.section.iconSize} />}
                  title={t('pot.alsoPresents')}
                  count={details.otherCredentials.length}
                >
                  {details.otherCredentials.map((c) => (
                    <div key={c.id} className="pot-row">
                      <span className="pot-row-title">{schemaLabel(c.schemaTitle)}</span>
                      <span className="muted">{otherCredentialLine(c, pot, when)}</span>
                      <span className={`pot-valid ${c.valid ? 'ok' : 'bad'}`}>
                        {c.valid ? <Check size={D.valid.iconSize} /> : <X size={D.valid.iconSize} />}{' '}
                        {t(c.valid ? 'pot.verified' : 'pot.invalid')}
                      </span>
                      <Claims claims={c.claims} />
                    </div>
                  ))}
                </Section>
              ) : null}

              {details.accreditations.length ? (
                <Section
                  icon={<BadgeCheck size={D.section.iconSize} />}
                  title={t('pot.accreditations')}
                  count={details.accreditations.length}
                >
                  {details.accreditations.map((a) => (
                    <AccreditationRow key={a.participantId} a={a} />
                  ))}
                </Section>
              ) : null}

              {details.endpoints.length ? (
                <Section
                  icon={<Link2 size={D.section.iconSize} />}
                  title={t('pot.endpoints')}
                  count={details.endpoints.length}
                >
                  {details.endpoints.map((e) => (
                    <div key={e.id} className="pot-row pot-endpoint">
                      <span className="tag">{e.type}</span>
                      <code className="mono">{e.endpoint}</code>
                    </div>
                  ))}
                </Section>
              ) : null}

              {details.governance.ecosystems.length || details.governance.corporation ? (
                <Section icon={<FileText size={D.section.iconSize} />} title={t('pot.governance')}>
                  {details.governance.ecosystems.map((e) => (
                    <div key={e.id} className="pot-row">
                      <span className="pot-row-title">
                        <Globe size={D.row.titleIconSize} aria-hidden="true" />{' '}
                        {e.name ?? `${t('pot.ecosystem')} ${e.id}`}
                      </span>
                      {e.documents.map((d) => (
                        <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer nofollow">
                          {t('pot.egf')} <ExternalLink size={D.row.linkIconSize} />
                        </a>
                      ))}
                    </div>
                  ))}
                  {details.governance.corporation?.documents.length ? (
                    <div className="pot-row">
                      <span className="pot-row-title">
                        <Building2 size={D.row.titleIconSize} aria-hidden="true" />{' '}
                        {t('pot.corporation', { id: details.governance.corporation.id })}
                      </span>
                      {details.governance.corporation.documents.map((d) => (
                        <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer nofollow">
                          {t('pot.cgf')} <ExternalLink size={D.row.linkIconSize} />
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
  const pot = usePotText()
  const day = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso))
  const step = identityStepOf(kind, card, pot, day)
  return (
    <li className="pot-step">
      <span className={`pot-node ${step.valid ? 'ok' : 'bad'}`} aria-hidden="true">
        {step.valid ? <Check size={D.node.iconSize} /> : <X size={D.node.iconSize} />}
      </span>
      <div className="pot-step-body">
        <div className="pot-kicker">{step.kicker}</div>
        <div className="pot-identity">
          <Avatar name={step.name || did} src={step.logo} size={D.identity.avatarSize} />
          <div className="pot-identity-text">
            <div className="pot-name">
              {step.nameIcon === 'user' ? (
                <User size={D.name.iconSize} aria-hidden="true" />
              ) : step.nameIcon === 'building' ? (
                <Building2 size={D.name.iconSize} aria-hidden="true" />
              ) : null}
              {step.name}
              {step.flag ? (
                <span className="flag" role="img" aria-label={step.countryCode}>
                  {step.flag}
                </span>
              ) : null}
            </div>
            {step.tag ? <span className="tag">{step.tag}</span> : null}
            {step.description ? <p className="pot-desc">{step.description}</p> : null}
            <div className={step.factsLayout === 'column' ? 'pot-facts column' : 'pot-facts'}>
              {step.facts.map((f) => (
                <span key={`${f.label ?? ''}${f.value}`}>
                  {f.label ? (
                    <>
                      {f.label}: <strong>{f.value}</strong>
                    </>
                  ) : (
                    f.value
                  )}
                </span>
              ))}
              {step.links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer nofollow">
                  {t(`column.${l.label}`)} <ExternalLink size={D.facts.linkIconSize} />
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="pot-provenance">{step.provenance}</div>
      </div>
    </li>
  )
}

function AccreditationRow({ a }: { a: Accreditation }) {
  const { t } = useTranslation()
  const pot = usePotText()
  return (
    <div className="pot-row">
      <span className={`role role-${a.role.toLowerCase()}`}>{t(`pot.role.${a.role}`)}</span>
      <span className="pot-row-title">{schemaLabel(a.schemaTitle)}</span>
      <span className="muted">{accreditationLine(a, pot)}</span>
    </div>
  )
}

/** The claims of a non-identity credential, flat key/value, strings and numbers only. */
function Claims({ claims }: { claims: Record<string, unknown> }) {
  const rows = claimRows(claims)
  if (!rows.length) return null
  return (
    <dl className="pot-claims">
      {rows.map((r) => (
        <div key={r.key}>
          <dt>{r.key}</dt>
          <dd>
            {r.link ? (
              <a href={r.value} target="_blank" rel="noopener noreferrer nofollow">
                {r.value}
              </a>
            ) : (
              r.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
