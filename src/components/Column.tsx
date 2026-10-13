/** The conversation column (UI-SHELL-002/012, UI-SESS-004/008, UI-AGENTS-005): every connection action lives here. */
import { Archive, ChevronDown, ChevronRight, Link2, MoreVertical, Plus, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'
import { DevicesDialog } from './Devices.js'
import { TrustCardDialog } from './TrustCard.js'
import { useDismiss } from './useDismiss.js'

export function Column() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  useDismiss(
    menuOpen,
    headerRef,
    useCallback(() => setMenuOpen(false), [])
  )
  const [trustOpen, setTrustOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [matches, setMatches] = useState<Record<string, { snippet: string; count: number }> | null>(null)
  const agent = snap.agents.find((a) => a.did === snap.selectedAgentDid)
  const agentDid = agent?.did
  // search titles and cached transcripts, debounced (UI-SHELL-015)
  useEffect(() => {
    if (!agentDid || !filter.trim()) {
      setMatches(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void hub.searchConversations(agentDid, filter).then((found) => {
        if (live) setMatches(found)
      })
    }, 150)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [filter, agentDid, hub])
  if (!agent) {
    return (
      <aside className="column">
        <div className="center">{snap.agents.length ? '' : t('app.addAgent')}</div>
      </aside>
    )
  }
  const sessions = snap.sessions.filter(
    (s) => s.agentDid === agent.did && (!matches || matches[s.sessionId] !== undefined)
  )
  // closed conversations are listed like the others: writing wakes them (D26); archived ones sit apart (D31)
  const sorted = sessions.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  const open = sorted.filter((s) => !s.archived)
  const archived = sorted.filter((s) => s.archived)
  const bound = open.find((s) => s.state === 'bound')
  const run = (fn: () => Promise<unknown>) => {
    setMenuOpen(false)
    fn().catch((e) => hub.notify('error', String(e.message ?? e)))
  }
  return (
    <aside className="column">
      <div className="column-header relative" ref={headerRef}>
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
            {bound ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setDevicesOpen(true)
                }}
              >
                {t('column.devices')}
              </button>
            ) : (
              <button type="button" role="menuitem" onClick={() => run(() => hub.connect(agent.did))}>
                {t('column.linkAgain')}
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => run(() => hub.archiveAll(agent.did))}>
              {t('column.archiveAll')}
            </button>
            {agent.deviceSecret ? (
              <button type="button" role="menuitem" onClick={() => run(() => hub.disconnectAgent(agent.did))}>
                {t('column.disconnect')}
              </button>
            ) : null}
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
        {open.length === 0 && archived.length === 0 ? (
          <div className="center">{matches ? t('column.noMatch') : t('column.noConversations')}</div>
        ) : null}
        {open.map((s) => (
          <ConversationRow
            key={s.sessionId}
            id={s.sessionId}
            selected={snap.selectedSessionId === s.sessionId}
            match={matches?.[s.sessionId]}
            query={matches ? filter : undefined}
          />
        ))}
        {archived.length ? (
          <button
            type="button"
            className="section-toggle"
            aria-expanded={archivedOpen || !!matches}
            onClick={() => setArchivedOpen((v) => !v)}
          >
            {archivedOpen || matches ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Archive size={14} aria-hidden="true" /> {t('column.archived')} ({archived.length})
          </button>
        ) : null}
        {archivedOpen || matches
          ? archived.map((s) => (
              <ConversationRow
                key={s.sessionId}
                id={s.sessionId}
                selected={snap.selectedSessionId === s.sessionId}
                match={matches?.[s.sessionId]}
                query={matches ? filter : undefined}
              />
            ))
          : null}
      </div>
      {trustOpen ? <TrustCardDialog agent={agent} onClose={() => setTrustOpen(false)} /> : null}
      {devicesOpen ? <DevicesDialog agent={agent} onClose={() => setDevicesOpen(false)} /> : null}
    </aside>
  )
}

function ConversationRow({
  id,
  selected,
  match,
  query,
}: {
  id: string
  selected: boolean
  match?: { snippet: string; count: number }
  query?: string
}) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [menu, setMenu] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  useDismiss(
    menu,
    rowRef,
    useCallback(() => setMenu(false), [])
  )
  const s = snap.sessions.find((x) => x.sessionId === id)
  if (!s) return null
  const title = s.title || t('column.untitled')
  return (
    <div className="relative" ref={rowRef}>
      <button
        type="button"
        className={['conv-row', selected ? 'selected' : ''].join(' ')}
        onClick={() => {
          hub.selectSession(s.sessionId)
          // an active search follows the person into the conversation (UI-CONV-020)
          if (query?.trim() && match?.count) hub.openSearch(s.sessionId, query)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu(true)
        }}
        aria-current={selected ? 'true' : undefined}
      >
        <span className="title">{title}</span>
        <span className="time">{s.lastMessageAt ? formatTime(s.lastMessageAt, i18n.language) : ''}</span>
        <span className="preview">
          {match?.snippet && match.snippet !== title
            ? match.snippet
            : s.state === 'provisional'
              ? t('column.notLinked')
              : s.lastPreview}
        </span>
        {match?.count ? (
          <span className="matches">{t('column.matches', { count: match.count })}</span>
        ) : s.unreadCount ? (
          <span className="count">{s.unreadCount}</span>
        ) : (
          <span />
        )}
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
          {s.conversationId ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false)
                void hub.setArchived(s.sessionId, !s.archived).catch((e) => hub.notify('error', String(e.message ?? e)))
              }}
            >
              {s.archived ? t('column.unarchive') : t('column.archive')}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setMenu(false)
              if (!confirm(t('column.closeForGoodConfirm'))) return
              void hub.closeForGood(s.sessionId).catch((e) => hub.notify('error', String(e.message ?? e)))
            }}
          >
            {t('column.closeForGood')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
