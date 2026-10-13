/** The agent rail (UI-SHELL-001/002/011): one icon per agent, pinned first, then recency, then not linked. */
import { orderAgents } from '@2060.io/hologram-ui-core'
import { Pin, Plus, Search, Settings as SettingsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'

export function Rail() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const linked = (did: string) => snap.sessions.some((s) => s.agentDid === did && s.state === 'bound')
  const agents = orderAgents(snap.agents, (a) => linked(a.did))
  return (
    <nav className="rail" aria-label={t('app.agents')}>
      {agents.map((a) => {
        const unread = snap.sessions.filter((s) => s.agentDid === a.did).reduce((n, s) => n + s.unreadCount, 0)
        const waiting = snap.sessions.some((s) => s.agentDid === a.did && (s.hologram?.pendingApprovals ?? 0) > 0)
        const selected = snap.selectedAgentDid === a.did
        return (
          <button
            key={a.did}
            type="button"
            className={['rail-item', selected ? 'selected' : '', linked(a.did) ? '' : 'inactive'].join(' ')}
            title={a.name}
            aria-label={unread ? `${a.name}, ${t('rail.unread', { count: unread })}` : a.name}
            aria-current={selected ? 'true' : undefined}
            onClick={() => hub.selectAgent(a.did)}
          >
            <Avatar name={a.name} src={a.logoRef} />
            {a.pinned ? <Pin size={10} className="pin-mark" aria-hidden="true" /> : null}
            {unread ? <span className="badge">{unread}</span> : null}
            {waiting ? <span className="dot" aria-hidden="true" /> : null}
          </button>
        )
      })}
      <div className="spacer" />
      <button
        type="button"
        className="rail-item"
        title={t('app.addAgent')}
        aria-label={t('app.addAgent')}
        onClick={() => hub.setView('add')}
      >
        <Plus size={22} />
      </button>
      <button
        type="button"
        className="rail-item"
        title={t('app.findAgents')}
        aria-label={t('app.findAgents')}
        onClick={() => hub.setView('directory')}
      >
        <Search size={22} />
      </button>
      <button
        type="button"
        className="rail-item"
        title={t('app.settings')}
        aria-label={t('app.settings')}
        onClick={() => hub.setView('settings')}
      >
        <SettingsIcon size={22} />
      </button>
    </nav>
  )
}
