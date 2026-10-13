/** The right panel: information only (UI-SHELL-012); session, principal, pending approvals, generating. */
import { useTranslation } from 'react-i18next'
import { useSnapshot } from '../state/useHub.js'
import { TrustSummaryView } from './TrustCard.js'

export function Details() {
  const snap = useSnapshot()
  const { t } = useTranslation()
  const agent = snap.agents.find((a) => a.did === snap.selectedAgentDid)
  const session = snap.sessions.find((s) => s.sessionId === snap.selectedSessionId)
  if (!agent) return null
  return (
    <div>
      <h3>{t('details.agent')}</h3>
      <TrustSummaryView trust={agent.trust} compact />
      {session ? (
        <>
          <h3>{t('details.session')}</h3>
          <div>{t(`trust.${session.state === 'bound' ? 'trusted' : 'unverified'}`) && session.state}</div>
          {session.principal ? (
            <>
              <h3>{t('details.principal')}</h3>
              <div>{session.principal.displayName}</div>
              {session.principal.backingIdentity ? (
                <div className="muted">{session.principal.backingIdentity.name}</div>
              ) : null}
            </>
          ) : null}
          {session.hologram?.pendingApprovals ? (
            <>
              <h3>{t('details.pending')}</h3>
              <div>{session.hologram.pendingApprovals}</div>
            </>
          ) : null}
          {session.hologram?.generating?.length ? (
            <>
              <h3>{t('details.generating')}</h3>
              <div>{session.hologram.generating.length}</div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
