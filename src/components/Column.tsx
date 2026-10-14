/**
 * The column (UI-SHELL-001/002/012, UI-SESS-004/008/012, UI-AGENTS-005/006, D32): the selected
 * controller's agents as collapsible cards, each with its trust icon, menu, link state, new
 * conversation, search, and its active or archived conversations.
 */
import type { AgentRecord, SessionRecord } from '@2060.io/hologram-ui-core'
import { Archive, Link2, MoreVertical, Plus, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
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
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  useDismiss(
    menuOpen,
    headerRef,
    useCallback(() => setMenuOpen(false), [])
  )
  const controller = snap.controllers.find((c) => c.did === snap.selectedControllerDid)
  if (!controller) {
    return (
      <aside className="column">
        <div className="center">{snap.controllers.length ? '' : t('app.addAgent')}</div>
      </aside>
    )
  }
  const agents = snap.agents
    .filter((a) => a.controllerDid === controller.did)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  return (
    <aside className="column">
      <div className="column-header relative" ref={headerRef}>
        <div className="row-between">
          <h2 className="row-between controller-title" style={{ gap: 8 }}>
            <Avatar name={controller.name} src={controller.logoRef} size={28} />
            <span className="ellipsis">{controller.name}</span>
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('column.controllerOptions')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={20} />
          </button>
        </div>
        <div className="state">{t(`column.kind.${controller.kind}`)}</div>
        {menuOpen ? (
          <div className="menu-popover" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                void hub.togglePin(controller.did)
              }}
            >
              {controller.pinned ? t('column.unpin') : t('column.pin')}
            </button>
          </div>
        ) : null}
      </div>
      <div className="list">
        {agents.map((a) => (
          <AgentCard key={a.did} agent={a} />
        ))}
      </div>
    </aside>
  )
}

function AgentCard({ agent }: { agent: AgentRecord }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [trustOpen, setTrustOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [matches, setMatches] = useState<Record<string, { snippet: string; count: number }> | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  useDismiss(
    menuOpen,
    cardRef,
    useCallback(() => setMenuOpen(false), [])
  )
  const expanded = !!snap.expandedAgents[agent.did]
  const archivedView = !!snap.archivedView[agent.did]
  const searchOpen = !!snap.searchOpen[agent.did]
  const agentDid = agent.did
  // search titles and cached transcripts, debounced (UI-SHELL-015)
  useEffect(() => {
    if (!searchOpen || !filter.trim()) {
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
  }, [filter, searchOpen, agentDid, hub])
  const sessions = snap.sessions
    .filter((s) => s.agentDid === agent.did && (!matches || matches[s.sessionId] !== undefined))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  const shown = sessions.filter((s) => !!s.archived === archivedView)
  const bound = snap.sessions.find((s) => s.agentDid === agent.did && s.state === 'bound')
  const unread = snap.sessions.filter((s) => s.agentDid === agent.did).reduce((n, s) => n + s.unreadCount, 0)
  const selected = snap.selectedAgentDid === agent.did
  const run = (fn: () => Promise<unknown>) => {
    setMenuOpen(false)
    fn().catch((e) => hub.notify('error', String(e.message ?? e)))
  }
  const TrustIcon =
    agent.trust.result === 'trusted' ? ShieldCheck : agent.trust.result === 'untrusted' ? ShieldAlert : ShieldQuestion
  return (
    <section className={['agent-card', selected ? 'selected' : '', expanded ? 'open' : ''].join(' ')} ref={cardRef}>
      <div className="agent-row relative">
        <button
          type="button"
          className="agent-toggle"
          aria-expanded={expanded}
          onClick={() => {
            if (!selected) hub.selectAgent(agent.did)
            else hub.toggleAgentExpanded(agent.did)
          }}
        >
          <Avatar name={agent.name} src={agent.logoRef} size={28} />
          <span className="ellipsis agent-name">{agent.name}</span>
          {!expanded && unread ? <span className="count">{unread}</span> : null}
        </button>
        <button
          type="button"
          className={`icon-btn small trust ${agent.trust.result}`}
          aria-label={t('trust.title')}
          title={t(`trust.${agent.trust.result}`)}
          onClick={() => setTrustOpen(true)}
        >
          <TrustIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-btn small"
          aria-label={t('column.options')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen ? (
          <div className="menu-popover" role="menu" style={{ top: 40 }}>
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
            {agent.deviceSecret ? (
              <button type="button" role="menuitem" onClick={() => run(() => hub.disconnectAgent(agent.did))}>
                {t('column.disconnect')}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                hub.toggleArchivedView(agent.did)
                if (!expanded) hub.toggleAgentExpanded(agent.did)
              }}
            >
              {archivedView ? t('column.showActive') : t('column.showArchived')}
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
      {expanded ? (
        <div className="agent-body">
          <div className="agent-meta">
            <span className="state">
              {bound?.principal ? (
                <>
                  <Link2 size={12} aria-hidden="true" />{' '}
                  {t('column.linkedSince', { time: formatTime(bound.createdAt, i18n.language) })}
                </>
              ) : (
                t('column.notLinked')
              )}
            </span>
            <span className="agent-tools">
              <button
                type="button"
                className="icon-btn small"
                aria-label={t('column.newConversation')}
                title={t('column.newConversation')}
                onClick={() => run(() => hub.newConversation(agent.did))}
              >
                <Plus size={18} />
              </button>
              <button
                type="button"
                className={['icon-btn', 'small', searchOpen ? 'on' : ''].join(' ')}
                aria-label={t('column.search')}
                aria-pressed={searchOpen}
                title={t('column.search')}
                onClick={() => {
                  hub.toggleAgentSearch(agent.did)
                  setFilter('')
                }}
              >
                <Search size={18} />
              </button>
            </span>
          </div>
          {searchOpen ? (
            <input
              className="input"
              type="search"
              placeholder={t('column.search')}
              aria-label={t('column.search')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          ) : null}
          {archivedView ? (
            <div className="section-label">
              <Archive size={12} aria-hidden="true" /> {t('column.archived')}
            </div>
          ) : null}
          {shown.length === 0 ? (
            <div className="muted empty">{matches ? t('column.noMatch') : t('column.noConversations')}</div>
          ) : null}
          {shown.map((s) => (
            <ConversationRow
              key={s.sessionId}
              session={s}
              selected={snap.selectedSessionId === s.sessionId}
              match={matches?.[s.sessionId]}
              query={matches ? filter : undefined}
            />
          ))}
        </div>
      ) : null}
      {trustOpen ? <TrustCardDialog agent={agent} onClose={() => setTrustOpen(false)} /> : null}
      {devicesOpen ? <DevicesDialog agent={agent} onClose={() => setDevicesOpen(false)} /> : null}
    </section>
  )
}

function ConversationRow({
  session: s,
  selected,
  match,
  query,
}: {
  session: SessionRecord
  selected: boolean
  match?: { snippet: string; count: number }
  query?: string
}) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [menu, setMenu] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  useDismiss(
    menu,
    rowRef,
    useCallback(() => setMenu(false), [])
  )
  const title = s.title || t('column.untitled')
  const act = (fn: () => Promise<unknown>) => {
    setMenu(false)
    fn().catch((e) => hub.notify('error', String(e.message ?? e)))
  }
  return (
    <div className="relative" ref={rowRef}>
      <button
        type="button"
        className={['conv-row', selected ? 'selected' : ''].join(' ')}
        onClick={() => {
          hub.selectSession(s.sessionId)
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
              if (next !== null) act(() => hub.renameConversation(s.sessionId, next))
            }}
          >
            {t('column.rename')}
          </button>
          {s.conversationId ? (
            <button type="button" role="menuitem" onClick={() => act(() => hub.setArchived(s.sessionId, !s.archived))}>
              {s.archived ? t('column.unarchive') : t('column.archive')}
            </button>
          ) : null}
          {s.archived ? (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setMenu(false)
                if (!confirm(t('column.closeForGoodConfirm'))) return
                act(() => hub.closeForGood(s.sessionId))
              }}
            >
              {t('column.closeForGood')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
