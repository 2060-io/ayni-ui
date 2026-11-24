/**
 * The column (UI-SHELL-001/002/012, UI-SESS-004/008/012, UI-AGENTS-005/006, D32): the selected
 * controller's agents as collapsible cards, each with its trust icon, menu, link state, new
 * conversation, search, and its active or archived conversations.
 */
import {
  AGENT_MENU_DANGER,
  type AgentMenuKey,
  type AgentRecord,
  adminMenuEntryOf,
  agentMenuOf,
  CONTROLLER_KIND_ICON,
  type ConversationSource,
  flagOf,
  HOME_DESIGN,
  hasOtherSpace,
  isPersonalConversation,
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
import { AdminAreaRows, AdminRequestLine } from './AdminArea.js'
import { NotificationsBadge } from './ApprovalWords.js'
import { Avatar } from './Avatar.js'
import { DevicesDialog } from './Devices.js'
import { MenuEntry } from './MenuEntry.js'
import { CreateSpaceDialog, SpaceRows, spaceTitle } from './SpaceParts.js'
import { ShareSourcesDialog } from './Tools.js'
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
  const [creatingSpace, setCreatingSpace] = useState(false)
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
  // with spaces, the card lists the conversations of Personal under the rows of the spaces (UI-CONV-028); a search
  // and the archived view list every space's
  const spaces = snap.spaces[agent.did]
  const withSpaces = hasOtherSpace(spaces?.spaces ?? [])
  const onlyPersonal = withSpaces && !archivedView && !matches
  const shown = sessions.filter(
    (s) => !!s.archived === archivedView && (!onlyPersonal || isPersonalConversation(s.spaceId, spaces?.spaces ?? []))
  )
  const spaceOf = (s: SessionRecord) => {
    const space = spaces?.spaces.find((x) => x.id === s.spaceId)
    return withSpaces && space && space.kind !== 'personal' ? space.title : undefined
  }
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
  // Show Admin to a holder of an admin role, Hide Admin while this browser's grant is open (UI-ADMIN-001)
  const adminEntry = link.linked
    ? adminMenuEntryOf(agent.descriptor.features, snap.adminAccess[agent.did], Date.now())
    : null
  // the entries of the agent's menu, as the app lists them: Disconnect while linked, Reconnect and Remove only while
  // not (UI-AGENTS-009)
  const menuEntries = agentMenuOf({
    connected: link.linked,
    notifications: hub.takesNotifications(agent.did),
    devices: link.linked,
    archivedShown: archivedView,
    newSpace: !!spaces?.templates.length,
    keeps: true,
    accounts: hub.takesConnections(agent.did),
    steward: !!snap.stewards[agent.did],
    roles: !!snap.admins[agent.did],
    admin: adminEntry,
  })
  const closing = (fn: () => void) => () => {
    setMenuOpen(false)
    fn()
  }
  const toggleArchived = closing(() => {
    hub.toggleArchivedView(agent.did)
    if (!expanded) hub.toggleAgentExpanded(agent.did)
  })
  // the browser offers no Sign-in methods, Authenticate or Service details: the app's alone
  const menuActions: Partial<Record<AgentMenuKey, () => void>> = {
    notifications: closing(() => hub.openNotifications(agent.did)),
    devices: closing(() => setDevicesOpen(true)),
    archived: toggleArchived,
    active: toggleArchived,
    newSpace: closing(() => setCreatingSpace(true)),
    keeps: closing(() => hub.openKeeps(agent.did)),
    accounts: closing(() => hub.openAccounts(agent.did)),
    steward: closing(() => hub.openSteward(agent.did)),
    roles: closing(() => hub.openAdmin(agent.did)),
    showAdmin: () => run(() => hub.showAdmin(agent.did)),
    hideAdmin: () => run(() => hub.hideAdmin(agent.did)),
    disconnect: () => run(() => hub.disconnectAgent(agent.did)),
    reconnect: () => run(() => hub.connect(agent.did)),
    remove: () => run(() => hub.removeAgent(agent.did)),
  }
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
          // the entries the app's menu of the agent lists, in its order and with its words, each with its icon
          // (AGENT_MENU_ORDER, AGENT_MENU_COPY, MENU_ICON; UI-AGENTS-009, APP-HOME-020)
          <div className="menu-popover" role="menu" style={{ top: 40 }}>
            {menuEntries.map((key) => (
              <MenuEntry
                key={key}
                entry={key}
                danger={AGENT_MENU_DANGER.has(key)}
                onClick={() => menuActions[key]?.()}
                after={
                  // the approvals no space holds, with the badge of what waits there (UI-APPR-007, PROF-TOOL-025)
                  key === 'notifications' ? <NotificationsBadge count={snap.agentNotifications[agent.did]} /> : null
                }
              >
                {t(`agentMenu.${key}`, { agent: agent.name })}
              </MenuEntry>
            ))}
          </div>
        ) : null}
      </div>
      <AdminRequestLine agent={agent} />
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
          {/* the ADMIN area, above the spaces, while the grant is open (UI-ADMIN-003) */}
          <AdminAreaRows agent={agent} />
          {!archivedView ? <SpaceRows agent={agent} query={searchOpen ? filter : ''} /> : null}
          {archivedView ? (
            <div className="section-label">
              <Archive size={D.sectionLabel.iconSize} aria-hidden="true" /> {t('column.archived')}
            </div>
          ) : onlyPersonal ? (
            <div className="section-label">
              <User size={D.sectionLabel.iconSize} aria-hidden="true" /> {t('spaces.personal')}
            </div>
          ) : null}
          {shown.length === 0 ? (
            <div className="muted empty">{matches ? t('column.noMatch') : t('column.noConversations')}</div>
          ) : null}
          {shown.map((s) => (
            <ConversationRow
              key={s.sessionId}
              session={s}
              selected={snap.selectedSessionId === s.sessionId && snap.view !== 'space'}
              match={matches?.[s.sessionId]}
              query={matches ? filter : undefined}
              spaceLabel={spaceOf(s)}
            />
          ))}
        </div>
      ) : null}
      {devicesOpen ? <DevicesDialog agent={agent} onClose={() => setDevicesOpen(false)} /> : null}
      {creatingSpace ? <CreateSpaceDialog agent={agent} onClose={() => setCreatingSpace(false)} /> : null}
    </section>
  )
}

/**
 * A conversation's row and its menu (UI-SESS-004/012, UI-CONV-038, UI-CONV-033): Rename, Share with its space or Stop
 * sharing, What the agent keeps about the person, Archive, Close for good. `spaceLabel` names a space other than
 * Personal, where the row is listed outside it (a search, the archived view).
 */
export function ConversationRow({
  session: s,
  selected,
  match,
  query,
  spaceLabel,
}: {
  session: SessionRecord
  selected: boolean
  match?: { snippet: string; count: number }
  query?: string
  spaceLabel?: string
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t, i18n } = useTranslation()
  const agent = snap.agents.find((a) => a.did === s.agentDid)
  const space = snap.spaces[s.agentDid]?.spaces.find((x) => x.id === s.spaceId)
  const ofSpace = !!space && space.kind !== 'personal'
  const spaceName = space ? spaceTitle(space, t) : ''
  const [menu, setMenu] = useState(false)
  // the sources of the conversation's tool results, shown before it is shared (UI-CONV-048)
  const [shareSources, setShareSources] = useState<ConversationSource[] | null>(null)
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
          {spaceLabel ? <span className="row-space">{spaceLabel} · </span> : null}
          {match?.snippet && match.snippet !== title
            ? match.snippet
            : s.state === 'provisional'
              ? t('column.notLinked')
              : s.lastPreview}
        </span>
        {s.shared && ofSpace ? <span className="shared-tag">{t('spaces.sharedTag', { space: spaceName })}</span> : null}
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
        // each entry with its icon, the same as the app's for a conversation (MENU_ICON, APP-CONV-008/040)
        <div className="menu-popover" role="menu" style={{ top: 36 }}>
          <MenuEntry
            entry="rename"
            onClick={() => {
              setMenu(false)
              const next = prompt(t('column.rename'), title)
              if (next !== null) act(() => hub.renameConversation(s.sessionId, next))
            }}
          >
            {t('column.rename')}
          </MenuEntry>
          {s.conversationId && ofSpace && (s.shared || space.rules.handover) && space.state === 'active' ? (
            <MenuEntry
              entry={s.shared ? 'unshare' : 'share'}
              onClick={() =>
                act(async () => {
                  if (s.shared) return hub.setShared(s.sessionId, false)
                  // against an agent that serves tools, where the results came from is shown first (UI-CONV-048)
                  const answer = await hub.requestShare(s.sessionId)
                  if (answer !== 'shared') setShareSources(answer)
                })
              }
            >
              {s.shared ? t('spaces.stopSharing') : t('spaces.share', { space: spaceName })}
            </MenuEntry>
          ) : null}
          {agent ? (
            <MenuEntry
              entry="keeps"
              onClick={() => {
                setMenu(false)
                hub.openKeeps(agent.did)
              }}
            >
              {t('column.keeps', { agent: agent.name })}
            </MenuEntry>
          ) : null}
          {agent && hub.takesConnections(agent.did) ? (
            <MenuEntry
              entry="accounts"
              onClick={() => {
                setMenu(false)
                hub.openAccounts(agent.did)
              }}
            >
              {t('accounts.menu')}
            </MenuEntry>
          ) : null}
          {s.conversationId ? (
            <MenuEntry
              entry={s.archived ? 'unarchive' : 'archive'}
              onClick={() => act(() => hub.setArchived(s.sessionId, !s.archived))}
            >
              {s.archived ? t('column.unarchive') : t('column.archive')}
            </MenuEntry>
          ) : null}
          {/* archived, or never bound: a conversation the person opened and will not link leaves without the phone */}
          {s.archived || s.state === 'provisional' ? (
            <MenuEntry
              entry="close"
              danger
              onClick={() => {
                setMenu(false)
                if (!confirm(t('column.closeForGoodConfirm'))) return
                act(() => hub.closeForGood(s.sessionId))
              }}
            >
              {t('column.closeForGood')}
            </MenuEntry>
          ) : null}
        </div>
      ) : null}
      {shareSources ? (
        <ShareSourcesDialog
          space={spaceName}
          agentName={agent?.name ?? ''}
          sources={shareSources}
          onCancel={() => setShareSources(null)}
          onShare={() => {
            setShareSources(null)
            act(() => hub.setShared(s.sessionId, true))
          }}
        />
      ) : null}
    </div>
  )
}
