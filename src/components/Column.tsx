/** The conversation column (UI-SHELL-002/012, UI-SESS-004/008, UI-AGENTS-005): every connection action lives here. */
import { Link2, MoreVertical, Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'
import { TrustCardDialog } from './TrustCard.js'

export function Column() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [trustOpen, setTrustOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const agent = snap.agents.find((a) => a.did === snap.selectedAgentDid)
  if (!agent) {
    return (
      <aside className="column">
        <div className="center">{snap.agents.length ? '' : t('app.addAgent')}</div>
      </aside>
    )
  }
  const sessions = snap.sessions.filter(
    (s) => s.agentDid === agent.did && (!filter || (s.title || '').toLowerCase().includes(filter.toLowerCase()))
  )
  const open = sessions
    .filter((s) => s.state !== 'closed')
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  const closed = sessions
    .filter((s) => s.state === 'closed')
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  const bound = open.find((s) => s.state === 'bound')
  const run = (fn: () => Promise<unknown>) => {
    setMenuOpen(false)
    fn().catch((e) => hub.notify('error', String(e.message ?? e)))
  }
  return (
    <aside className="column">
      <div className="column-header relative">
        <div className="row-between">
          <h2 className="row-between" style={{ gap: 8 }}>
            <Avatar name={agent.name} src={agent.logoRef} size={28} /> {agent.name}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('column.options')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={20} />
          </button>
        </div>
        <div className="state">
          {bound?.principal ? (
            <span>
              <Link2 size={12} aria-hidden="true" />{' '}
              {t('column.linkedSince', { time: formatTime(bound.createdAt, i18n.language) })}
            </span>
          ) : (
            t('column.notLinked')
          )}
        </div>
        <div className="column-actions">
          <button type="button" className="btn primary small" onClick={() => run(() => hub.newConversation(agent.did))}>
            <Plus size={16} /> {t('column.newConversation')}
          </button>
          <button type="button" className="btn small" onClick={() => setTrustOpen(true)}>
            <ShieldCheck size={16} /> {t('column.trustCard')}
          </button>
        </div>
        {menuOpen ? (
          <div className="menu-popover" role="menu">
            <button type="button" role="menuitem" onClick={() => run(() => hub.togglePin(agent.did))}>
              {agent.pinned ? t('column.unpin') : t('column.pin')}
            </button>
            <button type="button" role="menuitem" onClick={() => run(() => hub.connect(agent.did))}>
              {t('column.linkAgain')}
            </button>
            <button type="button" role="menuitem" onClick={() => run(() => hub.endAllConversations(agent.did))}>
              {t('column.endAll')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => run(() => hub.removeAgent(agent.did))}
            >
              {t('column.remove')}
            </button>
          </div>
        ) : null}
      </div>
      <div style={{ padding: '8px 12px' }}>
        <input
          className="input"
          type="search"
          placeholder={t('column.search')}
          aria-label={t('column.search')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="list">
        {open.length === 0 && closed.length === 0 ? <div className="center">{t('column.noConversations')}</div> : null}
        {open.map((s) => (
          <ConversationRow key={s.sessionId} id={s.sessionId} selected={snap.selectedSessionId === s.sessionId} />
        ))}
        {closed.length ? <div className="section-label">{t('column.closed')}</div> : null}
        {closed.map((s) => (
          <ConversationRow key={s.sessionId} id={s.sessionId} selected={snap.selectedSessionId === s.sessionId} />
        ))}
      </div>
      {trustOpen ? <TrustCardDialog agent={agent} onClose={() => setTrustOpen(false)} /> : null}
    </aside>
  )
}

function ConversationRow({ id, selected }: { id: string; selected: boolean }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [menu, setMenu] = useState(false)
  const s = snap.sessions.find((x) => x.sessionId === id)
  if (!s) return null
  const title = s.title || t('column.untitled')
  return (
    <div className="relative">
      <button
        type="button"
        className={['conv-row', selected ? 'selected' : ''].join(' ')}
        onClick={() => hub.selectSession(s.sessionId)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu(true)
        }}
        aria-current={selected ? 'true' : undefined}
      >
        <span className="title">{title}</span>
        <span className="time">{s.lastMessageAt ? formatTime(s.lastMessageAt, i18n.language) : ''}</span>
        <span className="preview">
          {s.state === 'provisional'
            ? t('column.notLinked')
            : s.state === 'closed'
              ? t('closure.title')
              : s.lastPreview}
        </span>
        {s.unreadCount ? <span className="count">{s.unreadCount}</span> : <span />}
      </button>
      <button
        type="button"
        className="icon-btn"
        style={{ position: 'absolute', right: 0, top: 0, width: 36, height: 36 }}
        aria-label={t('column.options')}
        onClick={() => setMenu((v) => !v)}
      >
        <MoreVertical size={16} />
      </button>
      {menu ? (
        <div className="menu-popover" role="menu" style={{ top: 36 }}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              const next = prompt(t('column.rename'), title)
              if (next !== null) void hub.renameConversation(s.sessionId, next)
            }}
          >
            {t('column.rename')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              void hub.closeConversation(s.sessionId)
            }}
          >
            {t('column.end')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
