/**
 * The column (UI-SHELL-001/002/012, UI-SESS-004/008/012, UI-AGENTS-005/006, D32): the selected
 * controller's agents as collapsible cards, each with its trust icon, menu, link state, new
 * conversation, search, and its active or archived conversations.
 */
import {
  type AgentRecord,
  CONTROLLER_KIND_ICON,
  flagOf,
  HOME_DESIGN,
  type SessionRecord,
  TRUST_MARK,
} from '@ayni.org/ayni-ui-core'
import {
  Archive,
  Building2,
  Link2,
  MoreVertical,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  User,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { linkOf } from '../state/link.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'
import { DevicesDialog } from './Devices.js'
import { useDismiss } from './useDismiss.js'

const D = HOME_DESIGN.column
const KIND_ICON = { building: Building2, user: User, 'shield-question': ShieldQuestion }
const TRUST_ICON = { 'shield-check': ShieldCheck, 'shield-alert': ShieldAlert, 'shield-question': ShieldQuestion }

export function Column() {
  const snap = useSnapshot()
  const { t } = useTranslation()
  const controller = snap.controllers.find((c) => c.did === snap.selectedControllerDid)
  if (!controller) {
    return (
      <aside className="column">
        <div className="center">{snap.controllers.length ? '' : t('app.addAgent')}</div>
      </aside>
    )
  }
  const KindIcon = KIND_ICON[CONTROLLER_KIND_ICON[controller.kind]]
  const agents = snap.agents
    .filter((a) => a.controllerDid === controller.did)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  return (
    <aside className="column">
      <div className="column-header">
        <div className="row-between">
          <h2 className="controller-title">
            <KindIcon size={D.header.iconSize} role="img" aria-label={t(`column.kind.${controller.kind}`)} />
            {flagOf(controller.countryCode) ? (
              <span className="flag" role="img" aria-label={controller.countryCode}>
                {flagOf(controller.countryCode)}
              </span>
            ) : null}
            <span className="ellipsis">{controller.name}</span>
          </h2>
        </div>
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
  // linked is the device pairing, not a session open at this moment (UI-AGENTS-007)
  const link = linkOf(agent, snap.sessions)
  const unread = snap.sessions.filter((s) => s.agentDid === agent.did).reduce((n, s) => n + s.unreadCount, 0)
  const selected = snap.selectedAgentDid === agent.did
  const run = (fn: () => Promise<unknown>) => {
    setMenuOpen(false)
    fn().catch((e) => hub.notify('error', String(e.message ?? e)))
  }
  const toggle = () => {
    if (!selected) hub.selectAgent(agent.did)
    else hub.toggleAgentExpanded(agent.did)
  }
  const TrustIcon = TRUST_ICON[TRUST_MARK[agent.trust.result].icon]
  return (
    <section className={['agent-card', selected ? 'selected' : '', expanded ? 'open' : ''].join(' ')} ref={cardRef}>
      <div className="agent-row relative">
        <button
          type="button"
          className="agent-avatar"
          aria-label={agent.name}
          aria-expanded={expanded}
          onClick={toggle}
        >
          <Avatar name={agent.name} src={agent.logoRef} size={D.agentAvatar.size} />
        </button>
        <div className="agent-text">
          <div className="agent-title-row">
            <button type="button" className="agent-toggle" aria-expanded={expanded} onClick={toggle}>
              <span className="ellipsis agent-name">{agent.name}</span>
              {!expanded && unread ? <span className="count">{unread}</span> : null}
            </button>
            <button
              type="button"
              className={`trust-mark ${agent.trust.result}`}
              aria-label={t('trust.title')}
              title={t(`trust.${agent.trust.result}`)}
              onClick={() => hub.showTrust(agent.did)}
            >
              <TrustIcon size={D.trustMark.iconSize} />
            </button>
          </div>
          {agent.trust.links?.terms || agent.trust.links?.privacy ? (
            <div className="agent-links">
              {agent.trust.links.terms ? (
                <a href={agent.trust.links.terms} target="_blank" rel="noopener noreferrer nofollow">
                  {t('column.terms')}
                </a>
              ) : null}
              {agent.trust.links.privacy ? (
                <a href={agent.trust.links.privacy} target="_blank" rel="noopener noreferrer nofollow">
                  {t('column.privacy')}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="icon-btn small"
          aria-label={t('column.options')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreVertical size={D.smallButton.iconSize} />
        </button>
        {menuOpen ? (
          <div className="menu-popover" role="menu" style={{ top: 40 }}>
            {link.linked ? (
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
              {link.linked ? (
                <>
                  <Link2 size={D.meta.iconSize} aria-hidden="true" />{' '}
                  {link.since
                    ? t('column.linkedSince', { time: formatTime(link.since, i18n.language) })
                    : t('column.linked')}
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
                <Plus size={D.smallButton.iconSize} />
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
                <Search size={D.smallButton.iconSize} />
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
              <Archive size={D.sectionLabel.iconSize} aria-hidden="true" /> {t('column.archived')}
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
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: D.conversationRow.menuButtonSize,
          height: D.conversationRow.menuButtonSize,
        }}
        aria-label={t('column.options')}
        onClick={() => setMenu((v) => !v)}
      >
        <MoreVertical size={D.conversationRow.menuIconSize} />
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
          {/* archived, or never bound: a conversation the person opened and will not link leaves without the phone */}
          {s.archived || s.state === 'provisional' ? (
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
