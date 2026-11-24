/**
 * Admin access on the agent's card (UI-ADMIN-002, UI-ADMIN-003; agent D132): the line of a Show Admin, "Confirm on your
 * phone" until the phone answers and then what came of a request that opened no grant; and the ADMIN area, above the
 * card's spaces, exactly while this browser's grant is open, with Audit for an `auditor` and Operations for an
 * `operator`, each opening its page in the main pane with no further question, and the time the grant ends.
 */
import { type AgentRecord, adminAreaOf, adminRequestWordsOf } from '@ayni.org/ayni-ui-core'
import { CircleAlert, Smartphone, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { menuIconOf } from './MenuEntry.js'

/** The time a grant ends, as the card and the pages say it ("Until 14:32"). */
export function untilWords(expiresAt: string, language: string): string {
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(expiresAt))
}

/** A Show Admin, as the card says it (UI-ADMIN-002); nothing once the grant opened, or with none asked. */
export function AdminRequestLine({ agent }: { agent: AgentRecord }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const request = snap.adminRequests[agent.did]
  if (!request) return null
  const waiting = request.status === 'waiting'
  return (
    <div className={waiting ? 'admin-request' : 'admin-request done'} role="status">
      {waiting ? (
        <Smartphone size={14} aria-hidden="true" />
      ) : (
        <CircleAlert size={14} aria-hidden="true" className="admin-request-icon" />
      )}
      <span className="admin-request-text">{t(adminRequestWordsOf(request))}</span>
      {waiting ? null : (
        <button
          type="button"
          className="icon-btn small"
          aria-label={t('app.close')}
          onClick={() => hub.dismissAdminRequest(agent.did)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** The ADMIN area of the card (UI-ADMIN-003): shown exactly while the grant is open, by the browser's clock too. */
export function AdminAreaRows({ agent }: { agent: AgentRecord }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  // the hub drops the grant at its end by its own timer, which renders this again
  const area = adminAreaOf(snap.adminAccess[agent.did], Date.now())
  if (!area) return null
  return (
    <section className="space-rows admin-area" aria-label={t('adminAccess.area')}>
      <div className="section-label admin-area-head">
        <span>{t('adminAccess.area')}</span>
        <span className="admin-until">
          {t('adminAccess.until', { time: untilWords(area.expiresAt, i18n.language) })}
        </span>
      </div>
      {area.pages.map((page) => {
        // the icon of the row by its page, from the core's table, the same as in the app (MENU_ICON)
        const Icon = menuIconOf(page)
        const selected = snap.view === page && snap.adminPageFor === agent.did
        return (
          <button
            key={page}
            type="button"
            className={['space-row', selected ? 'selected' : ''].join(' ')}
            aria-current={selected ? 'true' : undefined}
            onClick={() => hub.openAdminPage(agent.did, page)}
          >
            <span className="space-tile">
              <Icon size={16} aria-hidden="true" />
            </span>
            <span className="space-text">
              <span className="space-name">{t(`adminAccess.${page}`)}</span>
            </span>
          </button>
        )
      })}
    </section>
  )
}
