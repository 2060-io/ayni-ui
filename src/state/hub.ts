/**
 * The application hub: owns the device store, the tab sync bus, the per-session leadership
 * (stream and runs), and the in-memory snapshot React renders from. Framework-independent core
 * underneath (UI-SHELL-004); this file is the shell's state.
 */
import { type AyniAction, CUSTOM_EVENT } from '@ayni.org/ayni-agui-profile'
import {
  type AgentRecord,
  type AgUiEvent,
  type AppLinkDestination,
  type ApprovalPolicyInput,
  type ApprovalStatus,
  type BrandConfig,
  BroadcastSyncBus,
  type Connection,
  type ConnectionAttempt,
  type ConnectionRef,
  type ConnectionsChange,
  type ControllerRecord,
  type ConversationSource,
  changedConversation,
  clientDescription,
  connectionKeyOf,
  connectionsChangeOf,
  addAgent as coreAddAgent,
  countOccurrences,
  type DeviceStore,
  deletionIdOf,
  deletionRefusalOf,
  deletionWindowOf,
  emptyTranscript,
  excerpt,
  fileUnderController,
  hasIssuedCredential,
  IndexedDbStore,
  isAppLink,
  mergeHistory,
  type NotificationsChange,
  type NotificationsPage,
  notificationsChangeOf,
  type OwnerCandidate,
  type Preferences,
  ProfileClient,
  ProfileError,
  parseAppLink,
  personalSpaceOf,
  type ReplyQuote,
  type RuntimeConfig,
  readCatchUp,
  recheckTrust,
  reduce,
  refreshDescriptor,
  type SessionRecord,
  type SharedConversation,
  type SpaceInfo,
  type SpacePatch,
  type SpaceSegment,
  type Spaces,
  type SpaceTool,
  type SpaceToolAnswer,
  type SpaceToolsChange,
  type StewardedSpace,
  type SyncBus,
  type SyncMessage,
  spaceToolsChangeOf,
  type ToolRule,
  type Transcript,
  type TranscriptMessage,
  taken,
  takesConnections,
  takesNotifications,
  takesQueue,
  takesTools,
  turnToDelete,
  unreadFrom,
  type VoiceMeasures,
  withAgentForgotten,
  withAllowanceEnded,
  withDecided,
  withoutOrphans,
  withRestored,
  withSpaceCount,
  withUsageFrom,
} from '@ayni.org/ayni-ui-core'
import i18next from '../i18n/index.js'
import { loadConfig } from './config.js'

export type View =
  | 'list'
  | 'conversation'
  | 'directory'
  | 'add'
  | 'settings'
  | 'about'
  | 'trust'
  /** an app link whose destination lives on the phone (UI-LINK-001, CC-WEB-002) */
  | 'phone'
  /** `/app/connect?oob=`: the invitation as a QR for other wallets (CC-WEB-002) */
  | 'connect'
  /** a space's page, where a conversation opens (UI-CONV-031) */
  | 'space'
  /** "What <agent> keeps about you" (UI-CONV-033) */
  | 'keeps'
  /** the admin view of roles (UI-CONV-042) */
  | 'admin'
  /** a conversation shared with a space, read-only (UI-CONV-038) */
  | 'shared'
  /** Your accounts of an agent (UI-CONV-053, profile 3.5) */
  | 'accounts'
  /** the agent's Notifications, for the approvals no space holds (UI-APPR-007, agent D114) */
  | 'notifications'
  /** Spaces you steward (UI-CONV-068, profile 3.5.4 PROF-SPACE-009) */
  | 'steward'

export interface Snapshot {
  ready: boolean
  config: RuntimeConfig
  brand: BrandConfig
  prefs: Preferences
  agents: AgentRecord[]
  /** the organizations and personas behind the agents (D32) */
  controllers: ControllerRecord[]
  sessions: SessionRecord[]
  transcripts: Record<string, Transcript>
  selectedControllerDid: string | null
  selectedAgentDid: string | null
  /** agent cards open in the column (D32) */
  expandedAgents: Record<string, boolean>
  /** agent cards showing their archived conversations instead of the active ones */
  archivedView: Record<string, boolean>
  /** agent cards showing their search field */
  searchOpen: Record<string, boolean>
  selectedSessionId: string | null
  view: View
  online: boolean
  leaders: Record<string, boolean>
  notice: { kind: 'info' | 'error'; text: string } | null
  pending: Record<string, string | undefined>
  /** the message being answered, per session (UI-CONV-018) */
  replyTo: Record<string, ReplyQuote | undefined>
  /** text pushed into the composer (edit and resend), per session; `nonce` makes each push distinct */
  prefill: Record<string, { text: string; nonce: number } | undefined>
  /** the message whose details the right panel shows (UI-CONV-019) */
  inspect: { sessionId: string; messageId: string } | null
  /** older history pages being fetched, per session (UI-CONV-012) */
  loadingOlder: Record<string, boolean>
  /** in-conversation search, per session (UI-CONV-020): the query and the current hit */
  search: Record<string, { query: string; current: number } | undefined>
  /** the Proof of Trust shown in the conversation area (D33): which agent, whether a Connect follows, where to return */
  trustFor: { did: string; connect: boolean; returnTo: View } | null
  /** a search typed by an app link, read once by the directory (`/app/explore?q=`, UI-LINK-001) */
  directoryQuery: string | null
  /** the destination an app link named that is only on the phone (view `phone`) */
  phoneFor: AppLinkDestination | null
  /** the invitation of `/app/connect?oob=` (view `connect`) */
  connectOob: string | null
  /** the settings section an app link asked for (`/app/settings/devices`) */
  settingsSection: 'devices' | null
  /** per agent: Personal, the person's spaces and the templates they may create from (profile 3.3, PROF-SPACE-001) */
  spaces: Record<string, Spaces | undefined>
  /**
   * the space whose page is open (view `space`, UI-CONV-031); `approvalId`, the item of its Notifications a link
   * names, shown selected (UI-APPR-007, PROF-LINK-005)
   */
  spaceFor: {
    agentDid: string
    spaceId: string
    segment: SpaceSegment
    approvalId?: string
    /** the source whose panel the Tools segment opens at (Open the tool, UI-APPR-011) */
    source?: string
  } | null
  /** the agent whose page "What <agent> keeps about you" is open (view `keeps`, UI-CONV-033) */
  keepsFor: string | null
  /** the agent whose admin view of roles is open (view `admin`, UI-CONV-042) */
  adminFor: string | null
  /** per agent: whether its admin view answers this person (UI-CONV-042); unknown until asked */
  admins: Record<string, boolean | undefined>
  /**
   * per agent: whether `GET {sessions}/stewardship` gives this person at least one space (UI-CONV-068): the entry Spaces
   * you steward of the agent's menu; unknown until asked
   */
  stewards: Record<string, boolean | undefined>
  /** the agent whose Spaces you steward is open (view `steward`, UI-CONV-068), and the space it opens at */
  stewardFor: { agentDid: string; spaceId?: string } | null
  /** the conversation shared with a space that is open, read-only (view `shared`, UI-CONV-038) */
  sharedFor: { agentDid: string; spaceId: string; conversation: SharedConversation } | null
  /** the sheet of a memory or of a preference (UI-CONV-032) */
  memoryFor: { agentDid: string; memoryId?: string; preferenceKey?: string; spaceId?: string } | null
  /** moves when the person deletes a memory or a preference: what lists them reads them again */
  memoriesVersion: number
  /**
   * the changes of spaces' tools the agent announced, newest last (`ayni.space.tools.changed`, UI-CONV-050): a panel
   * that waits for the owner's phone finds its own by `changeId`; a list of tools reads again when one comes
   */
  toolChanges: { agentDid: string; change: SpaceToolsChange; n: number }[]
  /** the agent whose Your accounts is open (view `accounts`, UI-CONV-053), and the row it opened at */
  accountsFor: { agentDid: string; focus?: ConnectionRef } | null
  /**
   * per agent: the person's own accounts as last read (PROF-TOOL-014), for Your accounts, the Connect cards and the
   * owner's choice of a binding; read again on `ayni.connections.changed` and when the tab is in front again
   */
  connections: Record<string, Connection[] | undefined>
  /**
   * the changes of the person's own accounts the agent announced, newest last (`ayni.connections.changed`,
   * UI-CONV-053): a row, a card or a sign-in that waits finds its outcome here
   */
  connectionChanges: { agentDid: string; change: ConnectionsChange; n: number }[]
  /** the agent whose Notifications are open (view `notifications`, UI-APPR-007), and the item a link names */
  notificationsFor: { agentDid: string; approvalId?: string } | null
  /**
   * per agent: how many of the agent's Notifications wait for the person, the badge of its entry in the agent's menu
   * (PROF-TOOL-025); a space's count is its `notificationsWaiting`. Both are the agent's numbers, as it last gave them
   */
  agentNotifications: Record<string, number | undefined>
  /**
   * moves on each `ayni.space.notifications.changed`, heard here or in another tab, after a decision, and when the tab
   * comes back in front: the Notifications on screen read their list again (UI-APPR-007)
   */
  notificationsVersion: number
}

type Listener = () => void

export class Hub {
  private snapshot: Snapshot
  private readonly listeners = new Set<Listener>()
  private store: DeviceStore = new IndexedDbStore()
  private bus: SyncBus | null = null
  private readonly streams = new Map<string, AbortController>()
  /** the runs this tab drives, by session: the one in progress, and the sending of a message during it (UI-CONV-025) */
  private readonly runs = new Map<string, Map<string, AbortController>>()
  private readonly clients = new Map<string, ProfileClient>()
  private readonly pendingActions = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()
  private visible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  /** what the message forms hold and the store does not yet, by session: a draft is written 400 ms after typing */
  private readonly unsavedDrafts = new Map<string, string>()

  public constructor(config: RuntimeConfig, brand: BrandConfig) {
    this.snapshot = {
      ready: false,
      config,
      brand,
      prefs: { theme: 'system', sounds: true },
      agents: [],
      controllers: [],
      sessions: [],
      transcripts: {},
      selectedControllerDid: null,
      selectedAgentDid: null,
      expandedAgents: {},
      archivedView: {},
      searchOpen: {},
      selectedSessionId: null,
      view: 'list',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      leaders: {},
      notice: null,
      pending: {},
      replyTo: {},
      prefill: {},
      inspect: null,
      loadingOlder: {},
      search: {},
      trustFor: null,
      directoryQuery: null,
      phoneFor: null,
      connectOob: null,
      settingsSection: null,
      spaces: {},
      spaceFor: null,
      keepsFor: null,
      adminFor: null,
      admins: {},
      stewards: {},
      stewardFor: null,
      sharedFor: null,
      memoryFor: null,
      memoriesVersion: 0,
      toolChanges: [],
      accountsFor: null,
      connections: {},
      connectionChanges: [],
      notificationsFor: null,
      agentNotifications: {},
      notificationsVersion: 0,
    }
  }

  // ---- React binding ------------------------------------------------------------------------------

  public getSnapshot = (): Snapshot => this.snapshot
  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private set(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const l of this.listeners) l()
  }

  // ---- lifecycle ----------------------------------------------------------------------------------

  public static async create(): Promise<Hub> {
    const { config, brand } = await loadConfig()
    const hub = new Hub(config, brand)
    await hub.init()
    return hub
  }

  private async init(): Promise<void> {
    const deviceId = await this.store.deviceId()
    this.bus = new BroadcastSyncBus(deviceId)
    this.bus.subscribe((m) => this.onBus(m))
    window.addEventListener('online', () => this.set({ online: true }))
    window.addEventListener('offline', () => this.set({ online: false }))
    document.addEventListener('visibilitychange', () => {
      this.visible = document.visibilityState === 'visible'
      if (this.visible && this.snapshot.selectedSessionId) void this.markRead(this.snapshot.selectedSessionId)
      // back in front of the person: what other devices did meanwhile shows (UI-SESS-016)
      if (this.visible) this.refreshAll()
    })
    await this.reload()
    this.set({ ready: true, prefs: await this.store.getPreferences() })
    const first = this.snapshot.agents[0]
    if (this.snapshot.config.defaultAgent && this.snapshot.agents.length === 0) {
      void this.addAgent(this.snapshot.config.defaultAgent).catch((e) => this.notify('error', String(e.message ?? e)))
    } else if (first) this.selectController(first.controllerDid ?? null)
    const params = new URLSearchParams(location.search)
    if (params.get('agent') && !this.snapshot.config.singleAgent)
      void this.addAgent(params.get('agent') ?? '').catch((e) => this.notify('error', String(e.message ?? e)))
    // an app link opened in the browser lands on its web route or on "on your phone" (UI-LINK-001, CC-WEB-002)
    if (isAppLink(location.href, location.origin)) {
      this.openAppLink(location.href)
      history.replaceState(null, '', '/')
    }
    // the most recent conversations stream first; the budget parks the rest (UI-SHELL-016)
    for (const s of [...this.snapshot.sessions].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)))
      if (s.state !== 'closed' && s.sessionToken) void this.lead(s.sessionId)
    this.refreshAll()
    // descriptors can change on the agent side (features such as voice notes): refresh them at start
    void Promise.all(
      this.snapshot.agents.map((a) =>
        refreshDescriptor(this.store, a, this.snapshot.config.veranaIndexerUrl).catch(() => undefined)
      )
    ).then(() => this.reload())
    setInterval(() => this.retryLeadership(), 5000)
    setInterval(() => void this.pollProvisional(), 4000)
    setInterval(() => this.recheckTrustAll(), this.snapshot.config.trustRecheckIntervalSeconds * 1000)
  }

  public async reload(): Promise<void> {
    let [agents, sessions, controllers] = await Promise.all([
      this.store.listAgents(),
      this.store.listSessions(),
      this.store.listControllers(),
    ])
    // records written before D32 have no controller yet, or were filed under themselves while trusted: file them now
    // summaries made before the service links were read: refresh them once (network, trusted agents only)
    for (const a of agents.filter((x) => x.trust.result === 'trusted' && !x.trust.links?.read))
      await recheckTrust(this.store, a, this.snapshot.config.veranaIndexerUrl).catch(() => undefined)
    if (agents.some((x) => x.trust.result === 'trusted' && !x.trust.links?.read)) agents = await this.store.listAgents()
    const unfiled = agents.filter((a) => {
      const c = controllers.find((x) => x.did === a.controllerDid)
      return (
        !c ||
        (c.kind === 'unverified' && a.trust.result === 'trusted' && !!a.trust.operator) ||
        (!c.countryCode && !!a.trust.operator?.countryCode)
      )
    })
    if (unfiled.length) {
      for (const a of unfiled) await fileUnderController(this.store, a)
      ;[agents, controllers] = await Promise.all([this.store.listAgents(), this.store.listControllers()])
    }
    // a controller with no agent left is gone
    for (const c of controllers.filter((c) => !agents.some((a) => a.controllerDid === c.did)))
      await this.store.deleteController(c.did)
    controllers = controllers.filter((c) => agents.some((a) => a.controllerDid === c.did))
    this.set({ agents, sessions, controllers })
    this.updateTitle()
  }

  private onBus(m: SyncMessage): void {
    if (m.kind === 'changed') {
      void this.reload()
      if (m.what === 'preferences') void this.store.getPreferences().then((prefs) => this.set({ prefs }))
    } else if (m.kind === 'transcript') void this.loadTranscript(m.sessionId, true)
    else if (m.kind === 'action' && this.snapshot.leaders[m.sessionId]) {
      void this.performAction(m.sessionId, m.action as LocalAction)
        .then(() => this.bus?.post({ kind: 'action-ack', actionId: m.actionId, ok: true }))
        .catch((e) =>
          this.bus?.post({ kind: 'action-ack', actionId: m.actionId, ok: false, error: String(e.message ?? e) })
        )
    } else if (m.kind === 'action-ack') {
      const p = this.pendingActions.get(m.actionId)
      if (p) {
        this.pendingActions.delete(m.actionId)
        if (m.ok) p.resolve()
        else p.reject(new Error(m.error ?? 'failed'))
      }
    } else if (m.kind === 'tools-changed') {
      // another tab streams the session that heard it
      this.noteToolsChange(m.agentDid, m.change, false)
    } else if (m.kind === 'connections-changed') {
      this.noteConnectionsChange(m.agentDid, m.change, false)
    } else if (m.kind === 'notifications-changed') {
      this.noteNotificationsChange(m.agentDid, m.change, false)
    } else if (m.kind === 'agent-forgotten') {
      this.forgetAgent(m.agentDid, m.sessionIds, false)
    } else if (m.kind === 'leader' && m.tabId !== this.bus?.tabId) {
      this.set({ leaders: { ...this.snapshot.leaders, [m.sessionId]: false } })
    }
  }

  public notify(kind: 'info' | 'error', text: string): void {
    this.set({ notice: { kind, text } })
    setTimeout(() => {
      if (this.snapshot.notice?.text === text) this.set({ notice: null })
    }, 6000)
  }

  private updateTitle(): void {
    const unread = this.snapshot.sessions.reduce((n, s) => n + s.unreadCount, 0)
    document.title = unread ? `(${unread}) ${this.snapshot.brand.appName}` : this.snapshot.brand.appName
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (nav.setAppBadge) (unread ? nav.setAppBadge(unread) : nav.clearAppBadge?.())?.catch(() => undefined)
  }

  // ---- selection ----------------------------------------------------------------------------------

  public selectAgent(did: string | null): void {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    const sessions = this.snapshot.sessions
      .filter((s) => s.agentDid === did && !s.archived)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    this.set({
      selectedAgentDid: did,
      selectedControllerDid: agent?.controllerDid ?? this.snapshot.selectedControllerDid,
      selectedSessionId: sessions[0]?.sessionId ?? null,
      expandedAgents: did ? { ...this.snapshot.expandedAgents, [did]: true } : this.snapshot.expandedAgents,
      view: 'list',
    })
  }

  /** A controller tile: its agents in the column, the first one open (D32). */
  public selectController(did: string | null): void {
    const agents = this.snapshot.agents.filter((a) => a.controllerDid === did)
    const current = agents.find((a) => a.did === this.snapshot.selectedAgentDid)
    this.set({ selectedControllerDid: did, view: 'list' })
    this.selectAgent((current ?? agents[0])?.did ?? null)
    this.set({ selectedControllerDid: did })
  }

  public toggleAgentExpanded(did: string): void {
    this.set({ expandedAgents: { ...this.snapshot.expandedAgents, [did]: !this.snapshot.expandedAgents[did] } })
  }

  public toggleArchivedView(did: string): void {
    this.set({ archivedView: { ...this.snapshot.archivedView, [did]: !this.snapshot.archivedView[did] } })
  }

  public toggleAgentSearch(did: string): void {
    this.set({ searchOpen: { ...this.snapshot.searchOpen, [did]: !this.snapshot.searchOpen[did] } })
  }

  public selectSession(sessionId: string | null): void {
    const clicked = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    // a conversation with a live session on this device opens on that session, never on a stale record (UI-SESS-014)
    const session = (clicked && this.liveRecordOf(clicked)) ?? clicked
    const id = session?.sessionId ?? sessionId
    this.set({
      selectedSessionId: id,
      selectedAgentDid: session?.agentDid ?? this.snapshot.selectedAgentDid,
      view: id ? 'conversation' : 'list',
    })
    if (id) {
      void this.loadTranscript(id)
      void this.markRead(id)
      // the conversation on screen always streams, even when the budget parked it (UI-SHELL-016)
      if (session?.state === 'bound' && session.sessionToken) void this.lead(id, true)
      // a conversation listed by the agent but never opened here: open it now (UI-SESS-013)
      if (session && !session.sessionToken && session.conversationId && session.sessionId === session.conversationId)
        void this.resume(id).catch((e) => this.notify('error', String((e as Error).message)))
      // a conversation whose session closed while idle: a linked browser reads it again as it is now (UI-SESS-016)
      else if (session?.state === 'closed') void this.refresh(session.agentDid).catch(() => undefined)
    }
  }

  public setView(view: View): void {
    this.set({ view })
  }

  /**
   * An app link (AG-UI profile §10, UI-LINK-001/002, D38): the matching web route in place when one exists, else
   * "on your phone" naming the destination. Navigates, never acts. Returns false for a link that is not one.
   */
  public openAppLink(href: string): boolean {
    const origin = typeof location !== 'undefined' ? location.origin : this.snapshot.config.publicUrl
    if (!isAppLink(href, origin)) return false
    const destination = parseAppLink(href, origin)
    const reset = { phoneFor: null, connectOob: null, settingsSection: null, trustFor: null } as const
    switch (destination.path) {
      case 'home':
        if (destination.controller && this.snapshot.controllers.some((c) => c.did === destination.controller))
          this.selectController(destination.controller)
        else this.set({ ...reset, selectedControllerDid: null, selectedSessionId: null, view: 'list' })
        return true
      case 'explore':
        if (destination.create) break
        this.set({ ...reset, directoryQuery: destination.q ?? '', view: 'directory' })
        return true
      case 'service': {
        const agent = this.snapshot.agents.find((a) => a.did === destination.did)
        // Your accounts of that agent, where the agent sends the browser after a sign-in (PROF-LINK-004): the page,
        // and nothing else, is taken from the link; the state is read from the agent
        if (agent && destination.accounts && this.takesConnections(agent.did)) {
          this.set(reset)
          this.openAccounts(agent.did)
          return true
        }
        // the Notifications of a space or of the agent, the item of the link selected (PROF-LINK-005): nothing is
        // decided, and the list is read from the agent
        if (agent && destination.notifications && this.takesNotifications(agent.did)) {
          const { spaceId, approval } = destination.notifications
          this.set(reset)
          if (spaceId) this.openSpace(agent.did, spaceId, 'notifications', approval)
          else this.openNotifications(agent.did, approval)
          return true
        }
        if (agent) {
          // its conversation when it is one, else its Proof of Trust (UI-LINK-001)
          const session = this.snapshot.sessions
            .filter((s) => s.agentDid === agent.did && s.state !== 'closed')
            .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))[0]
          this.set(reset)
          if (session) this.selectSession(session.sessionId)
          else this.showTrust(agent.did, true)
        } else {
          this.set(reset)
          void this.addAgent(destination.did)
            .then((added) => this.showTrust(added.did, true))
            .catch((e) => this.notify('error', String((e as Error).message ?? e)))
        }
        return true
      }
      case 'settings':
        if (destination.section === 'backup') break
        this.set({ ...reset, settingsSection: destination.section === 'devices' ? 'devices' : null, view: 'settings' })
        return true
      case 'connect':
        if (!destination.oob) break
        this.set({ ...reset, connectOob: destination.oob, view: 'connect' })
        return true
      default:
        break
    }
    this.set({ ...reset, phoneFor: destination, view: 'phone' })
    return true
  }

  /** The directory reads the search an app link typed, once. */
  public takeDirectoryQuery(): string | null {
    const q = this.snapshot.directoryQuery
    if (q !== null) this.set({ directoryQuery: null })
    return q
  }

  /** The Proof of Trust takes the conversation area (D33, UI-TRUST-002). */
  public showTrust(did: string, connect = false): void {
    const returnTo = this.snapshot.view === 'trust' ? (this.snapshot.trustFor?.returnTo ?? 'list') : this.snapshot.view
    this.set({ view: 'trust', trustFor: { did, connect, returnTo } })
  }

  /** Back to where the person was: the list on a phone, the conversation on a desktop. */
  public closeTrust(): void {
    const back = this.snapshot.trustFor?.returnTo ?? 'list'
    this.set({ view: back === 'conversation' && !this.snapshot.selectedSessionId ? 'list' : back, trustFor: null })
  }

  /**
   * Conversation search (UI-SHELL-015): titles and the cached transcripts of the agent's
   * conversations, from the device store; the result maps a session id to the matching excerpt.
   */
  public async searchConversations(
    agentDid: string,
    query: string
  ): Promise<Record<string, { snippet: string; count: number }>> {
    const q = query.trim().toLowerCase()
    const out: Record<string, { snippet: string; count: number }> = {}
    if (!q) return out
    for (const session of this.snapshot.sessions.filter((s) => s.agentDid === agentDid)) {
      const transcript =
        this.snapshot.transcripts[session.sessionId] ?? (await this.store.getTranscript(session.sessionId))
      let count = 0
      let snippet: string | undefined
      for (const m of transcript?.messages ?? []) {
        if (m.role === 'activity') continue
        const n = countOccurrences(m.content, q)
        if (!n) continue
        count += n
        snippet ??= excerpt(m.content, q)
      }
      if ((session.title || '').toLowerCase().includes(q))
        out[session.sessionId] = { snippet: snippet ?? session.title, count }
      else if (count) out[session.sessionId] = { snippet: snippet ?? '', count }
    }
    return out
  }

  /** In-conversation search (UI-CONV-020): the bar's query and the current hit, per session. */
  public openSearch(sessionId: string, query = ''): void {
    this.set({ search: { ...this.snapshot.search, [sessionId]: { query, current: 0 } } })
  }

  public setSearch(sessionId: string, patch: Partial<{ query: string; current: number }>): void {
    const existing = this.snapshot.search[sessionId] ?? { query: '', current: 0 }
    const next = { ...existing, ...patch }
    if (patch.query !== undefined && patch.query !== existing.query) next.current = 0
    this.set({ search: { ...this.snapshot.search, [sessionId]: next } })
  }

  public closeSearch(sessionId: string): void {
    this.set({ search: { ...this.snapshot.search, [sessionId]: undefined } })
  }

  /** Loads every earlier page so the search covers the whole conversation (UI-CONV-020). */
  public async loadAll(sessionId: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      const t = this.snapshot.transcripts[sessionId]
      if (!t || t.complete) return
      await this.loadOlder(sessionId)
    }
  }

  /** Reply: the composer quotes this message until sent or cancelled (UI-CONV-018). */
  public setReply(sessionId: string, quote: ReplyQuote | null): void {
    this.set({ replyTo: { ...this.snapshot.replyTo, [sessionId]: quote ?? undefined } })
  }

  /** Puts text into the composer of a conversation (edit and resend, UI-CONV-017). */
  public prefill(sessionId: string, text: string): void {
    this.set({ prefill: { ...this.snapshot.prefill, [sessionId]: { text, nonce: Date.now() } } })
  }

  /** Message info in the right panel (UI-CONV-019); null closes it. */
  public inspect(sessionId: string, messageId: string | null): void {
    this.set({ inspect: messageId ? { sessionId, messageId } : null })
  }

  /** Recently used emojis, newest first, at most 24 (UI-CONV-017). */
  public async rememberEmoji(emoji: string): Promise<void> {
    const recent = [emoji, ...(this.snapshot.prefs.recentEmojis ?? []).filter((e) => e !== emoji)].slice(0, 24)
    await this.setPreferences({ recentEmojis: recent })
  }

  // ---- agents (UI-AGENTS-001..005) ------------------------------------------------------------------

  public async addAgent(input: string): Promise<AgentRecord> {
    const agent = await coreAddAgent(this.store, input, this.snapshot.config.veranaIndexerUrl)
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'agents' })
    this.selectAgent(agent.did)
    return agent
  }

  public async removeAgent(did: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    const sessionIds = this.snapshot.sessions.filter((x) => x.agentDid === did).map((s) => s.sessionId)
    for (const s of this.snapshot.sessions.filter((x) => x.agentDid === did))
      await this.closeConversation(s.sessionId, true)
    await this.store.deleteAgent(did)
    await this.reload()
    this.forgetAgent(did, sessionIds)
    this.bus?.post({ kind: 'changed', what: 'agents' })
    if (this.snapshot.selectedAgentDid === did) {
      const sibling = this.snapshot.agents.find((a) => a.controllerDid === agent?.controllerDid)
      if (sibling) this.selectAgent(sibling.did)
      else this.selectController(this.snapshot.controllers[0]?.did ?? null)
    }
  }

  /** Pinning applies to controllers (UI-SHELL-011, D32). */
  public async togglePin(controllerDid: string): Promise<void> {
    const c = this.snapshot.controllers.find((x) => x.did === controllerDid)
    if (!c) return
    const maxOrder = Math.max(0, ...this.snapshot.controllers.filter((x) => x.pinned).map((x) => x.pinOrder))
    await this.store.putController({ ...c, pinned: !c.pinned, pinOrder: c.pinned ? 0 : maxOrder + 1 })
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'agents' })
  }

  /**
   * Drag and drop on the rail (UI-SHELL-011): drops the controller into the pinned area before
   * `beforeDid` (at the end when null), or into the unpinned area when `pinned` is false.
   */
  public async movePin(controllerDid: string, pinned: boolean, beforeDid: string | null = null): Promise<void> {
    const c = this.snapshot.controllers.find((x) => x.did === controllerDid)
    if (!c) return
    if (!pinned) {
      if (c.pinned) await this.store.putController({ ...c, pinned: false, pinOrder: 0 })
    } else {
      const ordered = this.snapshot.controllers
        .filter((x) => x.pinned && x.did !== controllerDid)
        .sort((a, b) => a.pinOrder - b.pinOrder)
      const index = beforeDid ? ordered.findIndex((x) => x.did === beforeDid) : -1
      const next = index < 0 ? [...ordered, c] : [...ordered.slice(0, index), c, ...ordered.slice(index)]
      await Promise.all(next.map((x, i) => this.store.putController({ ...x, pinned: true, pinOrder: i + 1 })))
    }
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'agents' })
  }

  public async acknowledgeTrust(did: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    if (!agent) return
    await this.store.putAgent({ ...agent, trustAcknowledged: true })
    await this.reload()
  }

  private async recheckTrustAll(): Promise<void> {
    for (const agent of this.snapshot.agents) {
      if (!this.snapshot.sessions.some((s) => s.agentDid === agent.did && s.state === 'bound')) continue
      await recheckTrust(this.store, agent, this.snapshot.config.veranaIndexerUrl).catch(() => undefined)
      const moved = (await this.store.getAgent(agent.did))?.controllerDid
      if (moved && agent.controllerDid && moved !== agent.controllerDid)
        this.notify('info', `${agent.name}: ${(await this.store.getController(moved))?.name ?? moved}`)
    }
    await this.reload()
  }

  // ---- sessions (UI-SESS-*, UI-BIND-*) -----------------------------------------------------------------

  private client(agent: AgentRecord): ProfileClient {
    let client = this.clients.get(agent.did)
    if (!client) {
      client = new ProfileClient(agent.descriptor.sessions)
      this.clients.set(agent.did, client)
    }
    return client
  }

  private clientOf(session: SessionRecord): { client: ProfileClient; token: string } {
    const agent = this.snapshot.agents.find((a) => a.did === session.agentDid)
    if (!agent) throw new Error('agent not found')
    if (!session.sessionToken) throw new Error('session has no token')
    return { client: this.client(agent), token: session.sessionToken }
  }

  /**
   * The bound sessions of the agent, the latest binding first (UI-SESS-019). A record of an earlier binding, which
   * the agent may have closed or superseded while this tab was away, or which is another Principal's, is never the
   * first one asked merely because the store keeps it first.
   */
  private boundSessions(agentDid: string): SessionRecord[] {
    return this.snapshot.sessions
      .filter((s) => s.agentDid === agentDid && s.state === 'bound' && !!s.sessionToken)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** The session the agent is asked through: the latest binding (UI-SESS-019). */
  private boundOf(agentDid: string): SessionRecord | undefined {
    return this.boundSessions(agentDid)[0]
  }

  /**
   * A record whose token the agent refuses (closed, superseded, unknown) is retired (UI-SESS-019): its token is
   * forgotten and never sent again; the conversation it served keeps its row, read-only until it is opened again.
   */
  private async retire(session: SessionRecord, reason?: string): Promise<void> {
    this.park(session.sessionId)
    const current = await this.store.getSession(session.sessionId)
    if (!current) {
      this.set({ sessions: this.snapshot.sessions.filter((s) => s.sessionId !== session.sessionId) })
      return
    }
    await this.saveSession({
      ...current,
      state: 'closed',
      closedReason: (reason as SessionRecord['closedReason']) ?? current.closedReason ?? 'agent',
      sessionToken: null,
      binding: undefined,
    })
  }

  /** Another Principal's record leaves with what it held (UI-SESS-019); `instead` takes its place on screen. */
  private async forget(session: SessionRecord, instead: string): Promise<void> {
    this.park(session.sessionId)
    await this.serial(async () => {
      await this.store.deleteSession(session.sessionId)
      await this.store.deleteTranscript(session.sessionId)
    })
    const { [session.sessionId]: _gone, ...transcripts } = this.snapshot.transcripts
    this.set({
      transcripts,
      sessions: this.snapshot.sessions.filter((s) => s.sessionId !== session.sessionId),
      selectedSessionId:
        this.snapshot.selectedSessionId === session.sessionId ? instead : this.snapshot.selectedSessionId,
    })
  }

  /**
   * The phone bound `session`: a link completed (UI-SESS-019). What this browser kept of an earlier binding is put
   * right first. Another Principal's records (the visitor the person was, someone else) leave with their transcripts,
   * their tokens unused; every other bound session of the agent is asked whether it still holds, and one the agent
   * refuses is retired. The list is then read through the session the link bound, at once, and read again a little
   * later when that fails.
   */
  private async afterLink(session: SessionRecord): Promise<void> {
    const { agentDid, principal } = session
    for (const s of this.snapshot.sessions.filter(
      (x) => x.agentDid === agentDid && x.sessionId !== session.sessionId
    )) {
      if (principal && s.principal && !samePrincipal(s.principal, principal)) {
        await this.forget(s, session.sessionId)
        continue
      }
      if (s.state !== 'bound' || !s.sessionToken) continue
      try {
        const { client, token } = this.clientOf(s)
        const status = await client.status(s.sessionId, token)
        if (status.state === 'closed') await this.retire(s, status.reason)
        else if (principal && status.principal && !samePrincipal(status.principal, principal))
          await this.forget(s, session.sessionId)
      } catch (e) {
        if (!refusesToken(e)) {
          warn(`session ${s.sessionId} could not be checked after the link`, e)
          continue
        }
        warn(`session ${s.sessionId} no longer holds after the link: retired`, e)
        await this.retire(s, e.reason)
      }
    }
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'sessions' })
    for (let attempt = 1; ; attempt++) {
      try {
        await this.syncConversations(agentDid, session.sessionId)
        return
      } catch (e) {
        warn(`the list of conversations could not be read after the link (attempt ${attempt} of 3)`, e)
        if (attempt >= 3) return
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  }

  public canConnect(agent: AgentRecord): boolean {
    return (
      agent.trust.result === 'trusted' ||
      (this.snapshot.config.trustPolicy === 'warn' && agent.trustAcknowledged === true)
    )
  }

  /**
   * Connect (UI-BIND-001): a provisional session with binding material, or one bound at once when the
   * device is paired (UI-BIND-011) or another session of the agent is bound.
   */
  public async connect(agentDid: string, resume?: ResumeTarget, fresh = false): Promise<SessionRecord> {
    return this.open(agentDid, resume, fresh)
  }

  private readonly opening = new Map<string, Promise<unknown>>()

  /**
   * One session opening at a time per agent (UI-BIND-012). Two in flight would present the same device
   * secret: the agent rotates it on the first and, seeing a stale secret on the second, revokes the
   * pairing (IDENT-DEV-003). Across the tabs of this origin through the Web Locks API where the
   * browser has it, within this tab otherwise.
   */
  private withOpening<T>(agentDid: string, fn: () => Promise<T>): Promise<T> {
    const queued = () => {
      const previous = this.opening.get(agentDid) ?? Promise.resolve()
      const next = previous.then(fn, fn)
      this.opening.set(
        agentDid,
        next.then(
          () => undefined,
          () => undefined
        )
      )
      return next
    }
    const locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks
    return locks ? (locks.request(`ayni-open:${agentDid}`, queued) as Promise<T>) : queued()
  }

  /** Opens a session for the agent, then streams it, loads what it continues and sends the text it carries. */
  private async open(
    agentDid: string,
    resume?: ResumeTarget,
    fresh = false,
    quiet = false,
    /** the space a new conversation starts in (PROF-CONV-011): Personal without it */
    spaceId?: string
  ): Promise<SessionRecord> {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    if (!agent) throw new Error('agent not found')
    if (!this.canConnect(agent)) throw new Error('agent is not trusted')
    const shownId = this.snapshot.selectedSessionId
    const shown = this.snapshot.sessions.find((s) => s.sessionId === shownId)
    const { session, reused } = await this.withOpening(agentDid, () =>
      this.openNow(agentDid, resume, fresh, quiet, spaceId)
    )
    // a quiet opening changes nothing the person sees: what was on screen stays on screen. When it is that very
    // conversation that got its session back, the screen follows it to the new session and nothing else moves
    const sameConversation =
      !!shown?.conversationId && shown.agentDid === agentDid && shown.conversationId === session.conversationId
    if (!quiet) this.selectSession(session.sessionId)
    else if (sameConversation && this.snapshot.selectedSessionId === shownId) {
      this.set({ selectedSessionId: session.sessionId })
      void this.loadTranscript(session.sessionId)
    }
    const onScreen = this.snapshot.selectedSessionId === session.sessionId
    if (!reused) void this.lead(session.sessionId, onScreen || undefined)
    if (session.state === 'bound') {
      if (!reused) {
        await this.loadHistory(session.sessionId).catch(() => undefined)
        await this.syncLogged(agentDid, session.sessionId)
      }
      if (resume?.text) await this.send(session.sessionId, resume.text)
    }
    return session
  }

  /**
   * Under the agent's opening lock. A conversation already open here is reused (UI-SESS-014); with a
   * session bound the new one is its sibling and carries no proof; otherwise the device proof binds it
   * silently on a paired device (UI-BIND-011), and a rejected or missing proof leaves it provisional,
   * for the binding screen. `replacing` is the record of a link the new session takes the place of, its transcript
   * and its place in the list included (UI-BIND-013); on screen, the new session is on screen in the same change.
   */
  private async openNow(
    agentDid: string,
    resume: ResumeTarget | undefined,
    fresh: boolean,
    quiet = false,
    spaceId?: string,
    replacing?: SessionRecord
  ): Promise<{ session: SessionRecord; reused: boolean }> {
    // its turn has come, perhaps after another tab's opening: the secret and the sessions are read as they are now
    await this.reload()
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    if (!agent) throw new Error('agent not found')
    const live = resume?.conversationId
      ? this.snapshot.sessions.find(
          (s) =>
            s.agentDid === agentDid &&
            s.conversationId === resume.conversationId &&
            s.state === 'bound' &&
            s.sessionToken
        )
      : undefined
    if (live) return { session: live, reused: true }
    // the sibling of the latest binding (UI-SESS-019)
    const bound = this.boundOf(agentDid)
    const locale = this.snapshot.prefs.locale ?? navigator.language
    const old = replacing ?? this.previousRecord(resume)
    const now = new Date().toISOString()
    let session: SessionRecord
    if (bound) {
      const { client, token } = this.clientOf(bound)
      const created = await client
        .create(
          clientDescription(platformDescription()),
          locale,
          token,
          undefined,
          resume?.sessionId,
          undefined,
          resume?.conversationId,
          fresh,
          false,
          fresh ? spaceId : undefined
        )
        .catch(async (e) => {
          // a parent the agent no longer takes is retired, and the opening goes on without it
          if (!refusesToken(e)) throw e
          warn(`session ${bound.sessionId} was refused as the parent of a new session: retired`, e)
          await this.retire(bound, e.reason)
          return undefined
        })
      if (!created) return this.openNow(agentDid, resume, fresh, quiet, spaceId)
      session = {
        sessionId: created.sessionId,
        agentDid,
        sessionToken: created.sessionToken,
        title: '',
        createdAt: now,
        parentSessionId: created.parentSessionId ?? bound.sessionId,
        state: 'bound',
        principal: created.principal ?? bound.principal,
        lastEventId: 0,
        unreadCount: 0,
        lastPreview: '',
        lastMessageAt: now,
        draft: '',
        ayni: null,
        idleTimeoutSeconds: created.idleTimeoutSeconds,
        conversationId: created.conversationId ?? resume?.conversationId ?? old?.conversationId,
        resumedFromSessionId: created.resumedFromSessionId,
      }
    } else {
      await recheckTrust(this.store, agent, this.snapshot.config.veranaIndexerUrl).catch(() => undefined)
      await refreshDescriptor(this.store, agent, this.snapshot.config.veranaIndexerUrl).catch(() => undefined)
      // a paired device binds silently with its proof (UI-BIND-011); a rejected proof is dropped
      const created = await this.client(agent)
        .create(
          clientDescription(platformDescription()),
          locale,
          undefined,
          agent.deviceHandle,
          resume?.sessionId,
          agent.deviceSecret,
          resume?.conversationId,
          fresh,
          // a refresh the person did not ask for binds with the proof or not at all: the phone is asked nothing
          quiet,
          fresh ? spaceId : undefined
        )
        .catch(async (e) => {
          // refused silently: the pairing this browser held is over, and it reads as not linked from here on
          if (quiet && e instanceof ProfileError && e.status === 409 && e.code.startsWith('pairing-')) {
            await this.store.putAgent({
              ...agent,
              deviceSecret: undefined,
              deviceHandle: e.code === 'pairing-invalid' ? undefined : agent.deviceHandle,
              linkedAt: undefined,
            })
            await this.reload()
          }
          throw e
        })
      if (created.pairing) {
        await this.store.putAgent({
          ...agent,
          deviceSecret: undefined,
          deviceHandle: created.pairing === 'invalid' ? undefined : agent.deviceHandle,
          linkedAt: undefined,
        })
      } else if (created.deviceSecret) {
        await this.store.putAgent({
          ...agent,
          deviceHandle: created.deviceHandle ?? agent.deviceHandle,
          deviceSecret: created.deviceSecret,
        })
      }
      if (quiet && created.state !== 'bound') {
        // an agent that does not know `silent` left a session waiting for the phone: it is withdrawn
        await this.client(agent)
          .close(created.sessionId, created.sessionToken)
          .catch(() => undefined)
        throw new Error('not linked')
      }
      session = {
        sessionId: created.sessionId,
        agentDid,
        sessionToken: created.sessionToken,
        title: '',
        createdAt: now,
        state: created.state,
        binding: created.binding,
        principal: created.principal,
        lastEventId: 0,
        unreadCount: 0,
        lastPreview: '',
        lastMessageAt: now,
        draft: '',
        ayni: null,
        idleTimeoutSeconds: created.idleTimeoutSeconds,
        rebindAsked: created.rebind === 'asked',
        deviceHandle: created.deviceHandle,
        conversationId: created.conversationId ?? resume?.conversationId ?? old?.conversationId,
        resumedFromSessionId: created.resumedFromSessionId ?? resume?.sessionId,
        pendingText: created.state === 'bound' ? undefined : resume?.text,
        // a new code for it opens its replacement the same way (UI-BIND-013)
        newConversation: fresh && created.state !== 'bound' ? true : undefined,
      }
    }
    if (old) {
      // the session continues a conversation the list already shows: it keeps its title, its preview and its
      // place, where a new record read as written in just now (UI-SESS-016)
      session.title = old.title
      session.archived = old.archived
      session.lastPreview = old.lastPreview
      session.lastMessageAt = old.lastMessageAt
      session.spaceId = old.spaceId
      session.shared = old.shared
    } else if (fresh) {
      // a new conversation is in the space it was started from, else in Personal (PROF-CONV-011)
      session.spaceId = spaceId ?? personalSpaceOf(this.snapshot.spaces[agentDid]?.spaces ?? [])?.id
    }
    await this.store.putSession(session)
    await this.serial(async () => this.store.putTranscript(await this.inheritTranscript(session, old)))
    if (session.conversationId) await this.collapseConversations(agentDid, session.sessionId)
    // the link on screen stays on screen: never a moment with neither the old record nor the new one (UI-BIND-013)
    if (replacing && this.snapshot.selectedSessionId === replacing.sessionId)
      this.snapshot = { ...this.snapshot, selectedSessionId: session.sessionId }
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'sessions' })
    return { session, reused: false }
  }

  /** The local record a new session continues: a session of ours, or the placeholder of a listed conversation. */
  private previousRecord(resume?: ResumeTarget): SessionRecord | undefined {
    if (!resume) return undefined
    return this.snapshot.sessions.find(
      (x) => x.sessionId === resume.sessionId || (!!resume.conversationId && x.sessionId === resume.conversationId)
    )
  }

  private syncing = Promise.resolve()

  private readonly refreshing = new Map<string, Promise<void>>()

  private refreshAll(): void {
    for (const agent of this.snapshot.agents) void this.refresh(agent.did).catch(() => undefined)
  }

  /**
   * Brings a linked browser level with the agent without the phone (UI-SESS-016): the agent's list is read, and
   * the conversation on screen, when its session closed while idle, gets a session again and with it what other
   * devices added. With no session bound a paired browser opens one silently (PROF-SESS-015); a browser that is
   * not linked does nothing here. Asked again while it runs, it is the same refresh.
   */
  public refresh(agentDid: string): Promise<void> {
    const running = this.refreshing.get(agentDid)
    if (running) return running
    const next = this.refreshNow(agentDid).finally(() => {
      if (this.refreshing.get(agentDid) === next) this.refreshing.delete(agentDid)
    })
    this.refreshing.set(agentDid, next)
    return next
  }

  private async refreshNow(agentDid: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    if (!agent || !this.canConnect(agent)) return
    // a session the agent closed while this tab was away still reads as bound here: asking through it says so, and
    // the reading retires it and goes on with the next (UI-SESS-019)
    await this.syncConversations(agentDid)
    const mine = this.snapshot.sessions.filter((s) => s.agentDid === agentDid)
    const bound = mine.some((s) => s.state === 'bound' && s.sessionToken)
    const paired = !!agent.deviceHandle && !!agent.deviceSecret
    if (!bound && !paired) return
    const selected = mine.find((s) => s.sessionId === this.snapshot.selectedSessionId)
    const open = (s: SessionRecord | undefined) =>
      s && s.state === 'closed' && s.conversationId && !s.archived ? s : undefined
    // the conversation on screen first; with nothing bound and none on screen, the most recent one carries the list
    const target =
      open(selected) ??
      (bound ? undefined : [...mine].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).find(open))
    if (!target && bound) return
    await this.open(
      agentDid,
      target
        ? {
            sessionId: target.sessionId !== target.conversationId ? target.sessionId : undefined,
            conversationId: target.conversationId,
          }
        : undefined,
      false,
      true
    )
  }

  /**
   * The agent's list of the person's conversations (UI-SESS-011): titles and archived state come
   * from the agent; conversations opened elsewhere appear as records with no session yet; ones the
   * agent no longer lists (closed for good elsewhere) leave. Calls are serialized: several bound
   * sessions ask for it at once, and a record one call drops must not be written back by another. It is read through
   * `via` when that session is bound (the one a link just bound, the one whose stream just attached), else through
   * the latest binding; a session whose token the agent refuses is retired and the next one asked (UI-SESS-019).
   */
  public syncConversations(agentDid: string, via?: string): Promise<void> {
    const next = this.syncing.then(() => this.syncConversationsNow(agentDid, via))
    this.syncing = next.catch(() => undefined)
    return next
  }

  /** The list read again where nothing waits for it: a failure is said, not swallowed (UI-SESS-019). */
  private syncLogged(agentDid: string, via?: string): Promise<void> {
    return this.syncConversations(agentDid, via).catch((e) => warn('the list of conversations could not be read', e))
  }

  /** The agent's list through the first bound session that the agent takes; none when no bound session is left. */
  private async listThrough(agentDid: string, via?: string) {
    while (true) {
      const candidates = this.boundSessions(agentDid)
      const bound = candidates.find((s) => s.sessionId === via) ?? candidates[0]
      if (!bound) return undefined
      const { client, token } = this.clientOf(bound)
      try {
        const { conversations } = await client.conversations(token)
        return { client, token, conversations }
      } catch (e) {
        if (!refusesToken(e)) throw e
        warn(`the list of conversations was refused to session ${bound.sessionId}: retired, asking the next`, e)
        await this.retire(bound, e.reason)
      }
    }
  }

  /** Runs after any list reconciliation in flight, so a stale list cannot overwrite what `fn` writes. */
  private afterSync<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.syncing.then(fn)
    this.syncing = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async syncConversationsNow(agentDid: string, via?: string): Promise<void> {
    const listing = await this.listThrough(agentDid, via)
    if (!listing) return
    const { client, token, conversations } = listing
    const listed = new Map(conversations.map((c) => [c.id, c]))
    await this.collapseConversations(agentDid)
    const local = await this.store.listSessions(agentDid)
    for (const s of local) {
      if (!s.conversationId) continue
      const c = listed.get(s.conversationId)
      if (!c) {
        if (s.state === 'bound') continue // attached a moment ago, the list is just older
        await this.store.deleteSession(s.sessionId)
        await this.store.deleteTranscript(s.sessionId)
        continue
      }
      listed.delete(c.id)
      const next: SessionRecord = {
        ...s,
        title: c.title || s.title,
        archived: c.state === 'archived',
        // its space and its share (PROF-CONV-010)
        ...spaceFieldsOf(c, s),
        lastPreview: c.lastPreview ?? s.lastPreview,
        lastMessageAt: c.lastActivityAt > s.lastMessageAt ? c.lastActivityAt : s.lastMessageAt,
        // the count is the agent's, the same on every device (UI-SESS-017)
        unreadCount: unreadFrom((c as { unread?: number }).unread, s.unreadCount, this.isOnScreen(s.sessionId)),
      }
      if (JSON.stringify(next) !== JSON.stringify(s)) await this.store.putSession(next)
    }
    for (const c of listed.values()) {
      await this.store.putSession({
        sessionId: c.id,
        agentDid,
        sessionToken: null,
        title: c.title,
        createdAt: c.createdAt,
        state: 'closed',
        lastEventId: 0,
        unreadCount: unreadFrom((c as { unread?: number }).unread, 0, false),
        lastPreview: c.lastPreview ?? '',
        lastMessageAt: c.lastActivityAt,
        draft: '',
        ayni: null,
        conversationId: c.id,
        archived: c.state === 'archived',
        ...spaceFieldsOf(c),
      })
    }
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'sessions' })
    // with the list, the spaces its conversations belong to (UI-CONV-028), through the same session (UI-SESS-019), and
    // whether the admin view answers
    await this.loadSpacesWith(agentDid, client, token).catch((e) => warn('the spaces could not be read', e))
    void this.probeAdmin(agentDid, client, token)
    void this.probeSteward(agentDid, client, token)
  }

  /** The bound session of the record's conversation on this device, if any (UI-SESS-014). */
  private liveRecordOf(record: SessionRecord): SessionRecord | undefined {
    if (!record.conversationId) return undefined
    return this.snapshot.sessions.find(
      (x) =>
        x.agentDid === record.agentDid &&
        x.conversationId === record.conversationId &&
        x.state === 'bound' &&
        !!x.sessionToken
    )
  }

  /**
   * One record per conversation on this device (UI-SESS-014). When several of our sessions serve the
   * same conversation, `keep` stays when given, else the one streaming, else the latest bound one,
   * else the latest; the others are closed on the agent (best effort) and dropped here, and their
   * transcript moves over when the kept record has none. Every stream they held is freed.
   */
  private async collapseConversations(agentDid: string, keep?: string): Promise<void> {
    const groups = new Map<string, SessionRecord[]>()
    for (const s of await this.store.listSessions(agentDid)) {
      if (!s.conversationId) continue
      groups.set(s.conversationId, [...(groups.get(s.conversationId) ?? []), s])
    }
    const rank = (s: SessionRecord) =>
      (s.sessionId === keep ? 8 : 0) +
      (this.streams.has(s.sessionId) ? 4 : 0) +
      (s.state === 'bound' && s.sessionToken ? 2 : 0) +
      (s.state !== 'closed' && s.sessionToken ? 1 : 0)
    for (const records of groups.values()) {
      if (records.length < 2) continue
      const [kept, ...dropped] = [...records].sort(
        (a, b) => rank(b) - rank(a) || b.lastMessageAt.localeCompare(a.lastMessageAt)
      )
      for (const s of dropped) {
        this.park(s.sessionId)
        if (s.sessionToken && s.state !== 'closed') {
          const { client, token } = this.clientOf(s)
          void client.close(s.sessionId, token).catch(() => undefined)
        }
        await this.serial(async () => {
          const have = await this.store.getTranscript(kept.sessionId)
          const theirs = await this.store.getTranscript(s.sessionId)
          if (!have?.messages.length && theirs?.messages.length)
            await this.store.putTranscript({
              ...theirs,
              sessionId: kept.sessionId,
              run: null,
              complete: false,
              oldestLoadedId: null,
            })
          await this.store.deleteSession(s.sessionId)
          await this.store.deleteTranscript(s.sessionId)
        })
        const { [s.sessionId]: _gone, ...transcripts } = this.snapshot.transcripts
        this.snapshot = {
          ...this.snapshot,
          transcripts,
          selectedSessionId:
            this.snapshot.selectedSessionId === s.sessionId ? kept.sessionId : this.snapshot.selectedSessionId,
        }
      }
    }
  }

  /**
   * A bound token for the agent: an open session's, else one opened silently on a paired device.
   * An unpaired device gets no session out of this: the action needs the phone first, and a
   * provisional session would only add a row and a binding screen.
   */
  private async tokenFor(agentDid: string, conversationId?: string): Promise<{ client: ProfileClient; token: string }> {
    const bound = this.boundOf(agentDid)
    if (bound) return this.clientOf(bound)
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    if (!agent?.deviceHandle || !agent.deviceSecret) throw new Error('link your phone first')
    const opened = await this.open(agentDid, conversationId ? { conversationId } : undefined)
    if (opened.state !== 'bound' || !opened.sessionToken) throw new Error('link your phone first')
    return this.clientOf(opened)
  }

  /** Archive or unarchive (UI-SESS-012): the agent closes the open sessions of an archived conversation. */
  public async setArchived(sessionId: string, archived: boolean): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session?.conversationId) throw new Error('conversation not known to the agent yet')
    const { client, token } = await this.tokenFor(session.agentDid, session.conversationId)
    await client.patchConversation(token, session.conversationId, { state: archived ? 'archived' : 'active' })
    // behind any list refresh in flight: a reply fetched before the change must not flip the row back
    await this.afterSync(async () => {
      const current = this.snapshot.sessions.find((s) => s.sessionId === sessionId) ?? session
      if (archived) this.stopLeading(sessionId)
      await this.saveSession({
        ...current,
        archived,
        state: archived ? 'closed' : current.state,
        sessionToken: archived ? null : current.sessionToken,
        binding: archived ? undefined : current.binding,
      })
    })
    if (archived && this.snapshot.selectedSessionId === sessionId) this.selectAgent(session.agentDid)
    void this.syncLogged(session.agentDid)
  }

  public async archiveAll(agentDid: string): Promise<void> {
    for (const s of this.snapshot.sessions.filter((x) => x.agentDid === agentDid && !x.archived && x.conversationId))
      await this.setArchived(s.sessionId, true)
  }

  /**
   * Close for good (UI-SESS-004): the agent marks the conversation final and nothing of it stays on
   * this device. When the agent cannot be asked from here (nothing bound, device not paired) the
   * conversation leaves this device anyway: its provisional session is closed; a record the agent
   * holds for it comes back with the next pairing.
   */
  public async closeForGood(sessionId: string): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session) return
    if (session.conversationId && this.canAskAgent(session.agentDid)) {
      const { client, token } = await this.tokenFor(session.agentDid, session.conversationId)
      await client.deleteConversation(token, session.conversationId)
    }
    await this.afterSync(() => this.closeConversation(sessionId, true))
    void this.syncLogged(session.agentDid)
  }

  /** Whether an action on the agent can go through without the phone: a bound session, or a paired device. */
  private canAskAgent(agentDid: string): boolean {
    if (this.snapshot.sessions.some((s) => s.agentDid === agentDid && s.state === 'bound' && s.sessionToken))
      return true
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    return !!agent?.deviceHandle && !!agent.deviceSecret
  }

  /**
   * Disconnect from an agent (UI-AGENTS-006): revokes the pairing with the device proof, closes the agent's
   * conversations and clears their local data, and forgets everything else this browser read from the agent for the
   * person: its spaces, its Notifications count, Your accounts, roles and stewardship, and their pages. The agent
   * stays listed, unpaired; pairing again reads all of it again from the agent.
   */
  public async disconnectAgent(did: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    if (!agent) return
    const sessionIds = this.snapshot.sessions.filter((x) => x.agentDid === did).map((s) => s.sessionId)
    if (agent.deviceHandle && agent.deviceSecret)
      await this.client(agent)
        .revokeDevice(agent.deviceHandle, { deviceProof: agent.deviceSecret })
        .catch(() => undefined)
    await this.endAllConversations(did)
    const current = this.snapshot.agents.find((a) => a.did === did)
    if (current)
      await this.store.putAgent({ ...current, deviceHandle: undefined, deviceSecret: undefined, linkedAt: undefined })
    await this.reload()
    this.forgetAgent(did, sessionIds)
    this.bus?.post({ kind: 'changed', what: 'agents' })
  }

  /**
   * Forgets what this tab read from the agent for the person (UI-AGENTS-005, UI-AGENTS-006), and has every other tab
   * forget it too: nothing of it stays on screen, and nothing is kept to be shown again before the agent gives it.
   */
  private forgetAgent(did: string, sessionIds: string[], tell = true): void {
    for (const id of sessionIds) this.unsavedDrafts.delete(id)
    this.connectionReads.delete(did)
    this.set(withAgentForgotten(this.snapshot, did, sessionIds))
    if (tell) this.bus?.post({ kind: 'agent-forgotten', agentDid: did, sessionIds })
  }

  /** The paired browsers of this Principal with the agent (PROF-SESS-011). */
  public async listDevices(did: string) {
    const bound = this.boundOf(did)
    if (!bound) return []
    const { client, token } = this.clientOf(bound)
    return (await client.devices(token)).devices
  }

  public async unlinkDevice(did: string, handle: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    if (agent?.deviceHandle === handle) return this.disconnectAgent(did)
    const bound = this.boundOf(did)
    if (!bound) throw new Error('no bound conversation')
    const { client, token } = this.clientOf(bound)
    await client.revokeDevice(handle, { token })
  }

  /**
   * A new or resumed conversation of the agent (UI-SESS-001/013), through the agent's opening lock. A new one takes
   * the space it is started from (UI-CONV-029): `spaceId` from a space's page, Personal from the agent's card.
   */
  public async newConversation(agentDid: string, resume?: ResumeTarget, spaceId?: string): Promise<SessionRecord> {
    const fresh = !resume?.sessionId && !resume?.conversationId
    return this.open(agentDid, resume, fresh, false, spaceId)
  }

  /** A resumed session takes over the closed conversation's local transcript and replaces its record. */
  private async inheritTranscript(session: SessionRecord, old: SessionRecord | undefined) {
    const fresh = emptyTranscript(session.sessionId)
    if (!old) return fresh
    const previous = await this.store.getTranscript(old.sessionId)
    await this.store.deleteSession(old.sessionId)
    await this.store.deleteTranscript(old.sessionId)
    const { [old.sessionId]: _dropped, ...transcripts } = this.snapshot.transcripts
    this.snapshot = { ...this.snapshot, transcripts }
    return previous
      ? { ...previous, sessionId: session.sessionId, run: null, complete: false, oldestLoadedId: null }
      : fresh
  }

  /** Writing on a closed conversation wakes it up: a new session resumes it and sends the text once bound. */
  public async resume(sessionId: string, text?: string): Promise<SessionRecord> {
    const closed = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!closed) throw new Error('session not found')
    if (closed.state !== 'closed') return closed
    // a listed conversation never opened here has no session id of its own, only the conversation's
    const ownSession = closed.sessionId !== closed.conversationId
    return this.newConversation(closed.agentDid, {
      sessionId: ownSession ? sessionId : undefined,
      conversationId: closed.conversationId,
      text,
    })
  }

  public async refreshBinding(sessionId: string): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (session?.state !== 'provisional') return
    if (session.binding && Date.parse(session.binding.expiresAt) > Date.now()) return // only after expiry (UI-BIND-006)
    const { client, token } = this.clientOf(session)
    const binding = await client.refreshBinding(sessionId, token)
    await this.saveSession({ ...session, binding })
  }

  private readonly renewing = new Map<string, Promise<SessionRecord | undefined>>()

  /**
   * Show a new code (UI-BIND-013): the link on screen gets a new invitation and a new binding code, in place and
   * with no reload. Material that expired on a session still waiting is refreshed on that session (UI-BIND-006,
   * PROF-BIND-007). Before it expires the agent refreshes nothing, and the phone refuses an invitation it received
   * already (a scan that did not complete); and a session that closed before the phone linked it takes no new
   * material. Then a new provisional session, opened as the first one was, takes its place: its transcript, its
   * title and its place in the list, on screen if it was, and the session it replaces is ended on the agent, so that
   * none stays waiting (PROF-SESS-005). Asked again while it runs, it is the same renewal. Resolves with the session
   * that shows the new code, or nothing when another tab replaced the link already.
   */
  public newBindingCode(sessionId: string): Promise<SessionRecord | undefined> {
    const running = this.renewing.get(sessionId)
    if (running) return running
    const renewal = this.renewBinding(sessionId).finally(() => this.renewing.delete(sessionId))
    this.renewing.set(sessionId, renewal)
    return renewal
  }

  private async renewBinding(sessionId: string): Promise<SessionRecord | undefined> {
    const shown = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!shown || !awaitsLink(shown)) return undefined
    const agent = this.snapshot.agents.find((a) => a.did === shown.agentDid)
    if (!agent) throw new Error('agent not found')
    if (!this.canConnect(agent)) throw new Error('agent is not trusted')
    if (shown.state === 'provisional' && shown.sessionToken && !bindingLive(shown.binding)) {
      try {
        await this.refreshBinding(sessionId)
        const refreshed = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
        // the agent's clock may say the material is still good (`409` with it): then a new session, not the same code
        if (refreshed?.binding?.bindingCode !== shown.binding?.bindingCode) return refreshed
      } catch (e) {
        // the session's own window ended meanwhile (`expired`): a new session takes its place
        if (!refusesToken(e)) throw e
      }
    }
    const renewed = await this.withOpening(shown.agentDid, async () => {
      // its turn has come, perhaps after another tab's: a link another tab replaced already is that tab's
      await this.reload()
      const old = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
      if (!old || !awaitsLink(old)) return undefined
      const opened = await this.openNow(
        old.agentDid,
        { sessionId: old.resumedFromSessionId, conversationId: old.conversationId, text: old.pendingText },
        !!old.newConversation,
        false,
        old.newConversation ? old.spaceId : undefined,
        old
      )
      return { ...opened, old }
    })
    if (!renewed) return undefined
    const { session, reused, old } = renewed
    this.stopLeading(old.sessionId)
    // ended on the agent, not left to expire there: the phone can no longer link it (PROF-SESS-005)
    if (old.state === 'provisional' && old.sessionToken) {
      const { client, token } = this.clientOf(old)
      await client
        .close(old.sessionId, token)
        .catch((e) => warn(`the session ${old.sessionId} a new code replaced could not be ended on the agent`, e))
    }
    if (reused) {
      // the conversation got a session meanwhile: the link's record leaves, and that session is on screen
      await this.store.deleteSession(old.sessionId)
      await this.store.deleteTranscript(old.sessionId)
      if (this.snapshot.selectedSessionId === old.sessionId)
        this.snapshot = { ...this.snapshot, selectedSessionId: session.sessionId }
      await this.reload()
      this.bus?.post({ kind: 'changed', what: 'sessions' })
    }
    const onScreen = [old.sessionId, session.sessionId].includes(this.snapshot.selectedSessionId ?? '')
    if (onScreen) this.selectSession(session.sessionId)
    if (!reused) void this.lead(session.sessionId, onScreen || undefined)
    // bound at once (a sibling of a session that bound meanwhile): as an opening does
    if (session.state === 'bound') {
      if (!reused) {
        await this.loadHistory(session.sessionId).catch(() => undefined)
        await this.syncLogged(session.agentDid, session.sessionId)
      }
      if (old.pendingText) await this.send(session.sessionId, old.pendingText)
    }
    return this.snapshot.sessions.find((s) => s.sessionId === session.sessionId) ?? session
  }

  public async closeConversation(sessionId: string, silent = false): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session) return
    this.stopLeading(sessionId)
    if (session.sessionToken && session.state !== 'closed') {
      try {
        const { client, token } = this.clientOf(session)
        await client.close(sessionId, token)
      } catch (e) {
        if (!silent) this.notify('error', String((e as Error).message))
      }
    }
    await this.store.deleteSession(sessionId)
    await this.store.deleteTranscript(sessionId)
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'sessions' })
    if (this.snapshot.selectedSessionId === sessionId) this.selectAgent(session.agentDid)
  }

  public async endAllConversations(agentDid: string): Promise<void> {
    for (const s of this.snapshot.sessions.filter((x) => x.agentDid === agentDid))
      await this.closeConversation(s.sessionId, true)
  }

  public async renameConversation(sessionId: string, title: string): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session) return
    await this.saveSession({ ...session, title })
    if (session.conversationId) {
      const { client, token } = await this.tokenFor(session.agentDid, session.conversationId)
      await client.patchConversation(token, session.conversationId, { title })
    }
  }

  public async setDraft(sessionId: string, draft: string): Promise<void> {
    if (this.unsavedDrafts.get(sessionId) === draft) this.unsavedDrafts.delete(sessionId)
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (session && session.draft !== draft) await this.saveSession({ ...session, draft }, false)
  }

  /** What a message form holds as the person types, before `setDraft` writes it (UI-SHELL-010). */
  public noteDraft(sessionId: string, draft: string): void {
    this.unsavedDrafts.set(sessionId, draft)
  }

  /**
   * Writes what every message form holds at once: before the page loads again for a new version (UI-PLAT-007), and
   * when the person opens another conversation, so that nothing typed is lost (UI-SHELL-010).
   */
  public async flushDrafts(): Promise<void> {
    await Promise.all([...this.unsavedDrafts].map(([sessionId, draft]) => this.setDraft(sessionId, draft)))
  }

  /** Whether the person has this session's conversation in front of them. */
  private isOnScreen(sessionId: string): boolean {
    return this.visible && this.snapshot.selectedSessionId === sessionId && this.snapshot.view !== 'list'
  }

  /**
   * Takes the unread count an `ayni.conversation.changed` carries for a conversation this browser lists as the
   * agent does. False when the event says more than that (a title, a state, a conversation not listed here): the
   * list is then read again.
   */
  private async applyUnread(agentDid: string, event: AgUiEvent): Promise<boolean> {
    const change = changedConversation(event)
    if (change?.unread === undefined) return false
    const record = this.snapshot.sessions.find(
      (s) => s.agentDid === agentDid && s.conversationId === change.conversationId
    )
    if (!record || change.state === 'final') return false
    if (change.title !== undefined && change.title !== record.title) return false
    if (change.state !== undefined && (change.state === 'archived') !== !!record.archived) return false
    // moved to another space before its first message, or shared, or no longer shared (PROF-CONV-010)
    if (change.spaceId !== undefined && change.spaceId !== record.spaceId) return false
    if (change.shared !== undefined && change.shared !== !!record.shared) return false
    const unreadCount = unreadFrom(change.unread, record.unreadCount, this.isOnScreen(record.sessionId))
    if (unreadCount !== record.unreadCount) await this.saveSession({ ...record, unreadCount })
    return true
  }

  public async markRead(sessionId: string): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (session && session.unreadCount > 0 && this.visible) await this.saveSession({ ...session, unreadCount: 0 })
  }

  private async saveSession(session: SessionRecord, broadcast = true): Promise<void> {
    await this.store.putSession(session)
    this.set({ sessions: this.snapshot.sessions.map((s) => (s.sessionId === session.sessionId ? session : s)) })
    this.updateTitle()
    if (broadcast) this.bus?.post({ kind: 'changed', what: 'sessions', id: session.sessionId })
  }

  // ---- leadership, stream and runs (UI-SHELL-007/008, UI-SESS-002) ----------------------------------------

  /** Streams held open per agent at once (UI-SHELL-016): browsers allow about six connections per host. */
  private static readonly MAX_STREAMS = 3

  private async lead(sessionId: string, prioritize = false): Promise<void> {
    if (!this.bus || this.snapshot.leaders[sessionId] !== undefined) return
    if (!this.reserveStream(sessionId, prioritize)) return
    this.set({ leaders: { ...this.snapshot.leaders, [sessionId]: false } })
    const acquired = await this.bus.tryLead(sessionId, async (release) => {
      this.set({ leaders: { ...this.snapshot.leaders, [sessionId]: true } })
      await this.runStream(sessionId)
      release()
    })
    if (!acquired) return
    const { [sessionId]: _removed, ...rest } = this.snapshot.leaders
    this.set({ leaders: rest })
  }

  /** Whether a stream may open for the session under the per-agent budget; a prioritized one parks the stalest. */
  private reserveStream(sessionId: string, prioritize: boolean): boolean {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session) return false
    const held = this.snapshot.sessions.filter(
      (s) =>
        s.agentDid === session.agentDid && s.sessionId !== sessionId && this.snapshot.leaders[s.sessionId] !== undefined
    )
    if (held.length < Hub.MAX_STREAMS) return true
    if (!prioritize) return false
    const victim = held
      .filter((s) => s.sessionId !== this.snapshot.selectedSessionId)
      .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))[0]
    if (!victim) return false
    this.park(victim.sessionId)
    return true
  }

  /** Stops streaming a session without closing it: it streams again when selected or when a slot frees. */
  private park(sessionId: string): void {
    this.stopLeading(sessionId)
    if (this.snapshot.leaders[sessionId] === undefined) return
    const { [sessionId]: _removed, ...rest } = this.snapshot.leaders
    this.set({ leaders: rest })
  }

  private retryLeadership(): void {
    for (const s of this.snapshot.sessions) {
      if (s.state === 'closed' || !s.sessionToken) continue
      if (this.snapshot.leaders[s.sessionId] === undefined || this.snapshot.leaders[s.sessionId] === false) {
        const { [s.sessionId]: _removed, ...rest } = this.snapshot.leaders
        this.snapshot = { ...this.snapshot, leaders: rest }
        void this.lead(s.sessionId)
      }
    }
  }

  private stopLeading(sessionId: string): void {
    this.streams.get(sessionId)?.abort()
    this.streams.delete(sessionId)
    for (const controller of this.runs.get(sessionId)?.values() ?? []) controller.abort()
    this.runs.delete(sessionId)
  }

  /** The leader reopens the stream from the last stored event id and keeps it open while the session lives. */
  private async runStream(sessionId: string): Promise<void> {
    let attempt = 0
    while (true) {
      const session = await this.store.getSession(sessionId)
      if (!session || session.state === 'closed' || !session.sessionToken) return
      const { client, token } = this.clientOf(session)
      let controller: AbortController | undefined
      try {
        const status = await client.status(sessionId, token)
        await this.saveSession({
          ...session,
          state: status.state,
          principal: status.principal ?? session.principal,
          binding: status.binding ?? (status.state === 'provisional' ? session.binding : undefined),
          closedReason: status.reason,
          conversationId: status.conversationId ?? session.conversationId,
        })
        if (status.state === 'closed') return
        // the leader runs the runs: a run shown on the transcript that it does not hold is a leftover
        if (!this.runs.has(sessionId)) await this.clearStaleRun(sessionId)
        // and so is a message whose sending a page that is gone never completed
        await this.dropOrphans(sessionId)
        // every time the stream attaches: what another device added to the conversation meanwhile, and what the
        // agent's stream can no longer replay (UI-CONV-022, PROF-HIST-007)
        if (status.state === 'bound') await this.catchUp(sessionId).catch(() => undefined)
        if (status.state === 'bound') void this.syncLogged(session.agentDid, sessionId)
        controller = new AbortController()
        this.streams.set(sessionId, controller)
        attempt = 0
        await client.stream(
          sessionId,
          token,
          session.lastEventId || undefined,
          (event, id) => void this.onEvent(sessionId, event, id, false),
          controller.signal
        )
        if (controller.signal.aborted) return
      } catch (e) {
        if (controller?.signal.aborted) return // parked or stopped on purpose
        if (e instanceof ProfileError && e.status === 410) {
          const current = await this.store.getSession(sessionId)
          if (current)
            await this.saveSession({
              ...current,
              state: 'closed',
              closedReason: (e.reason as SessionRecord['closedReason']) ?? current.closedReason ?? 'agent',
              sessionToken: null,
              binding: undefined,
            })
          return
        }
        if (e instanceof ProfileError && e.status === 401) {
          const current = await this.store.getSession(sessionId)
          if (current)
            await this.saveSession({
              ...current,
              state: 'closed',
              closedReason: current.closedReason ?? 'agent',
              sessionToken: null,
            })
          return
        }
      }
      attempt += 1
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** attempt)))
    }
  }

  /** The device handle and secret a binding handed over move to the agent record (UI-BIND-010/011). */
  private async adoptPairing(session: SessionRecord): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === session.agentDid)
    if (!agent) return
    const handle = session.deviceHandle ?? agent.deviceHandle
    const secret = session.deviceSecret ?? agent.deviceSecret
    if (handle !== agent.deviceHandle || secret !== agent.deviceSecret)
      await this.store.putAgent({
        ...agent,
        deviceHandle: handle,
        deviceSecret: secret,
        // a new handle is a new link, made now; a rotated secret keeps the time of the link it continues
        linkedAt: handle === agent.deviceHandle ? agent.linkedAt : new Date().toISOString(),
      })
    if (session.deviceSecret) await this.saveSession({ ...session, deviceSecret: undefined }, false)
  }

  private async flushPending(sessionId: string): Promise<void> {
    const session = await this.store.getSession(sessionId)
    if (!session?.pendingText || session.state !== 'bound') return
    const text = session.pendingText
    await this.saveSession({ ...session, pendingText: undefined })
    await this.send(sessionId, text).catch((e) => this.notify('error', String((e as Error).message)))
  }

  /** Provisional sessions poll their status: the QR screen leaves even if the stream missed the binding. */
  private async pollProvisional(): Promise<void> {
    for (const session of this.snapshot.sessions) {
      if (session.state !== 'provisional' || !session.sessionToken || !this.snapshot.leaders[session.sessionId])
        continue
      try {
        const { client, token } = this.clientOf(session)
        const status = await client.status(session.sessionId, token)
        if (status.state === session.state) continue
        const next: SessionRecord = {
          ...session,
          state: status.state,
          closedReason: status.reason,
          principal: status.principal ?? session.principal,
          binding: undefined,
          deviceHandle: status.deviceHandle ?? session.deviceHandle,
          deviceSecret: status.deviceSecret ?? session.deviceSecret,
          conversationId: status.conversationId ?? session.conversationId,
          sessionToken: status.state === 'closed' ? null : session.sessionToken,
        }
        await this.saveSession(next)
        if (status.state === 'bound') {
          await this.loadHistory(session.sessionId).catch(() => undefined)
          void this.flushPending(session.sessionId)
          await this.adoptPairing(next)
          await this.reload()
          // the phone bound it: a link completed (UI-SESS-019)
          void this.afterLink(next)
        }
      } catch (e) {
        if (e instanceof ProfileError && e.status === 410) {
          await this.saveSession({
            ...session,
            state: 'closed',
            closedReason: (e.reason as SessionRecord['closedReason']) ?? 'agent',
            sessionToken: null,
            binding: undefined,
          })
        }
      }
    }
  }

  private queue = Promise.resolve()

  /**
   * Transcripts are read, changed and written back by several concurrent flows: the session
   * stream, a run, a history reload, a resume. Two of them in flight at once lose the change of
   * whichever wrote first (the person's message vanished behind a history reload), so every such
   * read-modify-write runs here, one after the other. A function on the queue never queues
   * another one: it would wait for itself.
   */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private onEvent(sessionId: string, event: AgUiEvent, id: number | undefined, fromRun: boolean): Promise<void> {
    // one failing event must not poison the queue for the events after it
    return this.serial(async () => {
      const session = await this.store.getSession(sessionId)
      if (!session) return
      const transcript = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
      const onScreen = this.isOnScreen(sessionId)
      const { transcript: t, session: s, signals } = reduce(transcript, session, event, fromRun, onScreen)
      const next = { ...s, lastEventId: id !== undefined ? Math.max(s.lastEventId, id) : s.lastEventId }
      if (signals.includes('message') && !next.title) {
        const firstUser = t.messages.find((m) => m.role === 'user')
        next.title = (firstUser && firstUser.role !== 'activity' ? firstUser.content : next.lastPreview).slice(0, 60)
      }
      await this.store.putTranscript(t)
      await this.store.putSession(next)
      this.snapshot = {
        ...this.snapshot,
        transcripts: { ...this.snapshot.transcripts, [sessionId]: t },
        sessions: this.snapshot.sessions.map((x) => (x.sessionId === sessionId ? next : x)),
      }
      if (signals.includes('message')) {
        const agent = this.snapshot.agents.find((a) => a.did === next.agentDid)
        if (agent) await this.store.putAgent({ ...agent, lastMessageAt: next.lastMessageAt })
        if (!onScreen && this.snapshot.prefs.sounds && this.snapshot.config.soundsEnabled) playPing()
      }
      if (signals.includes('bound') && !fromRun) {
        await this.loadHistoryNow(sessionId).catch((e) => this.notify('error', String((e as Error).message)))
        void this.flushPending(sessionId)
        await this.adoptPairing(next)
        // bound from provisional is the phone's doing, a link that completed (UI-SESS-019); outside the queue
        if (session.state === 'provisional') void this.afterLink(next)
        else void this.syncLogged(next.agentDid, sessionId)
      }
      if (signals.includes('closed')) this.stopLeading(sessionId)
      // a conversation was renamed, archived or closed from another device: the column follows (UI-SESS-015).
      // When only what is unread in it changed (read on another device, a reply landed), the count is taken from
      // the event and the list is not read again (UI-SESS-017)
      if (signals.includes('conversations') && !(await this.applyUnread(next.agentDid, event)))
        void this.syncLogged(next.agentDid, sessionId)
      if (signals.includes('identified')) await this.markIdentified(next.agentDid)
      // a change of a space's tools applied or was dropped: the owner's screens that wait for it follow (UI-CONV-050)
      if (signals.includes('tools') && event.type === 'CUSTOM') this.noteToolsChange(next.agentDid, event.value, true)
      // one of the person's own accounts changed: Your accounts and the cards read it again (UI-CONV-053)
      if (signals.includes('connections') && event.type === 'CUSTOM')
        this.noteConnectionsChange(next.agentDid, event.value, true)
      // a notification of the person entered, changed or ended: the badges take the agent's count, and the
      // Notifications on screen read their list again (UI-APPR-007, PROF-TOOL-025)
      if (signals.includes('notifications') && event.type === 'CUSTOM')
        this.noteNotificationsChange(next.agentDid, event.value, true)
      this.set({})
      this.updateTitle()
      this.bus?.post({ kind: 'transcript', sessionId })
      if (signals.length) this.bus?.post({ kind: 'changed', what: 'sessions', id: sessionId })
      if (event.type === 'CUSTOM' && event.name === CUSTOM_EVENT.sessionBound) await this.reload()
    }).catch((e) => this.notify('error', String((e as Error).message ?? e)))
  }

  public async loadTranscript(sessionId: string, force = false): Promise<Transcript> {
    if (!force && this.snapshot.transcripts[sessionId]) return this.snapshot.transcripts[sessionId]
    const t = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
    // a change that landed while this read was in flight is newer than what was read
    if (!force && this.snapshot.transcripts[sessionId]) return this.snapshot.transcripts[sessionId]
    this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: t } })
    return t
  }

  public loadHistory(sessionId: string, before?: string): Promise<void> {
    return this.serial(() => this.loadHistoryNow(sessionId, before))
  }

  /**
   * Reads the end of the conversation's history and adds what this browser does not hold (UI-CONV-022): a
   * conversation continued on the phone while this tab was closed, asleep or offline.
   */
  public catchUp(sessionId: string): Promise<void> {
    return this.serial(async () => {
      const session = await this.store.getSession(sessionId)
      if (session?.state !== 'bound') return
      const { client, token } = this.clientOf(session)
      const transcript = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
      const merged = await readCatchUp(
        transcript,
        async (before) => {
          const page = await client.history(sessionId, token, before, 50)
          return { messages: page.messages as Record<string, unknown>[], nextBefore: page.nextBefore }
        },
        4,
        // what was deleted or erased while this browser was away leaves it too (UI-CONV-037)
        this.purgeOf(session)
      )
      if (merged === transcript) return
      await this.store.putTranscript(merged)
      this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: merged } })
      this.bus?.post({ kind: 'transcript', sessionId })
      if (hasIssuedCredential(merged.messages)) await this.markIdentified(session.agentDid)
    })
  }

  private async loadHistoryNow(sessionId: string, before?: string): Promise<void> {
    const session = await this.store.getSession(sessionId)
    if (session?.state !== 'bound') return
    const { client, token } = this.clientOf(session)
    const readAt = new Date().toISOString()
    const page = await client.history(sessionId, token, before, 50)
    const transcript = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
    // what the page no longer returns of the period it covers was deleted or erased meanwhile (UI-CONV-037)
    const purge = this.purgeOf(session)
    const merged = mergeHistory(
      transcript,
      page.messages as Record<string, unknown>[],
      page.nextBefore,
      purge ? { ...purge, newest: !before, readAt } : undefined
    )
    await this.store.putTranscript(merged)
    this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: merged } })
    this.bus?.post({ kind: 'transcript', sessionId })
    // a credential issued earlier in this conversation identifies the controller too (D37)
    if (hasIssuedCredential(merged.messages)) await this.markIdentified(session.agentDid)
  }

  /**
   * A controller whose agent issued the person a credential joins the identified group of the rail, once, with a
   * notice (UI-SHELL-011, D37); a later credential changes nothing.
   */
  public async markIdentified(agentDid: string): Promise<boolean> {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    const controller = agent?.controllerDid ? await this.store.getController(agent.controllerDid) : undefined
    if (!agent || !controller || controller.identifiedAt) return false
    await this.store.putController({ ...controller, identifiedAt: new Date().toISOString() })
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'agents' })
    this.notify('info', i18next.t('rail.identifiedNotice', { name: controller.name }))
    return true
  }

  /** Older messages load as soon as the top of the transcript comes into view (UI-CONV-012). */
  public async loadOlder(sessionId: string): Promise<void> {
    const t = this.snapshot.transcripts[sessionId]
    if (!t || t.complete || this.snapshot.loadingOlder[sessionId]) return
    this.set({ loadingOlder: { ...this.snapshot.loadingOlder, [sessionId]: true } })
    try {
      await this.loadHistory(sessionId, t.oldestLoadedId ?? t.messages[0]?.id)
    } finally {
      this.set({ loadingOlder: { ...this.snapshot.loadingOlder, [sessionId]: false } })
    }
  }

  // ---- turns and actions (UI-CONV-001/003/015, UI-APPR-*, UI-MEDIA-003) -------------------------------------

  public async send(
    sessionId: string,
    text: string,
    attachmentIds: string[] = [],
    replyTo: ReplyQuote | null = this.snapshot.replyTo[sessionId] ?? null
  ): Promise<void> {
    const action: AyniAction | undefined = attachmentIds.length
      ? { kind: 'attachments', attachmentIds, replyTo: replyTo?.id }
      : replyTo
        ? { kind: 'text', replyTo: replyTo.id }
        : undefined
    this.setReply(sessionId, null)
    await this.dispatch(sessionId, { type: 'run', text, action, replyTo: replyTo ?? undefined })
  }

  public async act(sessionId: string, action: AyniAction, text?: string): Promise<void> {
    await this.dispatch(sessionId, { type: 'run', text, action })
  }

  public async stop(sessionId: string): Promise<void> {
    // the run to stop is the one shown now: named before the indicator is cleared
    const runId = this.snapshot.transcripts[sessionId]?.run?.runId
    // nothing of ours running here: clear the indicator at once rather than waiting for a leader to answer
    if (!this.runs.has(sessionId) && !this.snapshot.leaders[sessionId]) await this.clearStaleRun(sessionId)
    await this.dispatch(sessionId, { type: 'cancel', runId })
  }

  /** Whether the agent of a session takes a message sent while it answers (PROF-DESC-006). */
  public takesQueue(sessionId: string): boolean {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    return takesQueue(this.snapshot.agents.find((a) => a.did === session?.agentDid)?.descriptor.features)
  }

  /** Takes a message out of a transcript: one the agent refused, and recorded nothing of. */
  private dropMessage(sessionId: string, messageId: string): Promise<void> {
    return this.serial(async () => {
      const t = await this.store.getTranscript(sessionId)
      if (!t?.messages.some((m) => m.id === messageId)) return
      const next = { ...t, messages: t.messages.filter((m) => m.id !== messageId) }
      await this.store.putTranscript(next)
      this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
      this.bus?.post({ kind: 'transcript', sessionId })
    })
  }

  /** The agent recorded a message sent during a run: it stays here whatever happens to this page. */
  private markTaken(sessionId: string, messageId: string): Promise<void> {
    return this.serial(async () => {
      const t = await this.store.getTranscript(sessionId)
      if (!t?.messages.some((m) => m.id === messageId && m.role !== 'activity' && m.queued)) return
      const next = { ...t, messages: taken(t.messages, messageId) }
      await this.store.putTranscript(next)
      this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
    })
  }

  /** Drops the messages sent during a run whose sending this tab no longer drives and the agent never confirmed. */
  private dropOrphans(sessionId: string): Promise<void> {
    return this.serial(async () => {
      const t = await this.store.getTranscript(sessionId)
      if (!t) return
      const messages = withoutOrphans(t.messages, (runId) => !!this.runs.get(sessionId)?.has(runId))
      if (messages.length === t.messages.length) return
      const next = { ...t, messages }
      await this.store.putTranscript(next)
      this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
      this.bus?.post({ kind: 'transcript', sessionId })
    })
  }

  /** Drops a run indicator no tab is driving (a tab closed mid-run): streaming messages end interrupted. */
  private clearStaleRun(sessionId: string): Promise<void> {
    return this.serial(() => this.clearStaleRunNow(sessionId))
  }

  private async clearStaleRunNow(sessionId: string): Promise<void> {
    const t = await this.store.getTranscript(sessionId)
    if (!t?.run) return
    const closed = {
      ...t,
      run: null,
      messages: t.messages.map((m) =>
        m.role !== 'activity' && m.streaming ? { ...m, streaming: false, interrupted: true } : m
      ),
    }
    await this.store.putTranscript(closed)
    this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: closed } })
    this.bus?.post({ kind: 'transcript', sessionId })
  }

  public isRunning(sessionId: string): boolean {
    return !!this.snapshot.transcripts[sessionId]?.run
  }

  private async dispatch(sessionId: string, action: LocalAction): Promise<void> {
    if (this.snapshot.leaders[sessionId]) return this.performAction(sessionId, action)
    if (!this.bus) throw new Error('not ready')
    const actionId = crypto.randomUUID()
    const done = new Promise<void>((resolve, reject) => this.pendingActions.set(actionId, { resolve, reject }))
    this.bus.post({ kind: 'action', sessionId, action, actionId })
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('no leader tab answered')), 4000)
    )
    try {
      await Promise.race([done, timeout])
    } catch (e) {
      this.pendingActions.delete(actionId)
      // no leader: take over and perform locally
      if (String((e as Error).message).includes('no leader')) {
        void this.lead(sessionId)
        await new Promise((r) => setTimeout(r, 300))
        return this.performAction(sessionId, action)
      }
      throw e
    }
  }

  private async performAction(sessionId: string, action: LocalAction): Promise<void> {
    const session = await this.store.getSession(sessionId)
    if (!session) throw new Error('session not found')
    if (action.type === 'cancel') {
      const current = action.runId ?? this.snapshot.transcripts[sessionId]?.run?.runId
      if (!current) return this.clearStaleRun(sessionId)
      const { client, token } = this.clientOf(session)
      const controller = this.runs.get(sessionId)?.get(current)
      if (controller) {
        await client.cancel(sessionId, token, current).catch(() => undefined)
        controller.abort()
        return
      }
      // not a run of ours: the one the agent started for what waited, which any device may stop
      // (PROF-RUN-012); or a run left over from a closed tab, which the agent no longer knows and is cleared
      // here (UI-CONV-003)
      const stopped = await client.cancel(sessionId, token, current).catch(() => false)
      if (!stopped) await this.clearStaleRun(sessionId)
      return
    }
    if (session.state !== 'bound') throw new Error('session is not bound')
    if (!this.snapshot.online) throw new Error('offline')
    const { client, token } = this.clientOf(session)
    const runId = crypto.randomUUID()
    const controller = new AbortController()
    // reactions and receipts are bookkeeping: they never wait for the conversation's run and never block it (UI-CONV-003)
    const bookkeeping = action.action?.kind === 'reaction' || action.action?.kind === 'receipt'
    if (bookkeeping) {
      await client.run(sessionId, token, { runId, action: action.action }, () => undefined, controller.signal)
      return
    }
    // a decision on a confirmation is taken while the turn waits for it, and never starts a turn (PROF-TOOL-008): it
    // neither waits for the run in progress nor blocks it; the card takes the status the agent answers. The
    // requester's withdrawal of an approval takes the same path (PROF-TOOL-026)
    if (action.decision && (action.action?.kind === 'approval.decide' || action.action?.kind === 'approval.cancel')) {
      const approvalId = action.action.approvalId
      const end = await client.run(
        sessionId,
        token,
        { runId, action: action.action },
        () => undefined,
        controller.signal
      )
      const status = end.approvalId === approvalId ? end.status : undefined
      if (status) await this.patchTranscript(sessionId, (t) => withDecided(t, approvalId, status))
      return
    }
    // against an agent that takes it, a message sent while a run is in progress waits (UI-CONV-025); against any
    // other, one run at a time (UI-CONV-003)
    const queues = takesQueue(this.snapshot.agents.find((a) => a.did === session.agentDid)?.descriptor.features)
    if (!queues) {
      // a lock left by a run stream that never closed must not block the person once its finish event landed
      const stale = this.runs.get(sessionId)
      if (stale && !this.snapshot.transcripts[sessionId]?.run) {
        for (const each of stale.values()) each.abort()
        this.runs.delete(sessionId)
      }
      if (this.runs.has(sessionId)) throw new Error('a run is in progress')
    }
    const mine = this.runs.get(sessionId) ?? new Map<string, AbortController>()
    mine.set(runId, controller)
    this.runs.set(sessionId, mine)
    if (action.text) {
      const text = action.text
      await this.serial(async () => {
        const transcript = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
        const userMessage = {
          id: `u_${runId}`,
          role: 'user' as const,
          content: text,
          at: new Date().toISOString(),
          replyTo: action.replyTo,
          // sent while a run is in progress: it waits, and the agent has not recorded it yet
          ...(transcript.run ? { queued: true } : {}),
        }
        const next = {
          ...transcript,
          messages: [...transcript.messages, userMessage],
          // a run in progress stays the one shown: this message waits for it to end
          run: transcript.run ?? { runId, steps: [], log: [] },
        }
        await this.store.putTranscript(next)
        const current = (await this.store.getSession(sessionId)) ?? session
        await this.store.putSession({
          ...current,
          draft: '',
          title: current.title || text.slice(0, 60),
          lastMessageAt: userMessage.at,
          lastPreview: text.slice(0, 120),
        })
        this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
      })
      await this.reload()
      this.bus?.post({ kind: 'transcript', sessionId })
    }
    try {
      const end = await client.run(
        sessionId,
        token,
        { runId, text: action.text, action: action.action },
        (event) => {
          // the first event of a run that has its turn: the agent recorded its message
          if (event.type === 'RUN_STARTED') void this.markTaken(sessionId, `u_${runId}`)
          void this.onEvent(sessionId, event, undefined, true)
        },
        controller.signal
      )
      // recorded, and waiting for the reply in progress to end: the agent answers it next, whatever becomes of
      // this page (PROF-RUN-011)
      if (end.noTurn === 'waiting') await this.markTaken(sessionId, `u_${runId}`)
      // the agent lets no more wait: nothing was recorded, and the person is told
      if (end.noTurn === 'refused') {
        await this.dropMessage(sessionId, `u_${runId}`)
        throw new Error(i18next.t('conversation.waitingRefused'))
      }
    } catch (e) {
      if (e instanceof ProfileError && e.status === 410) {
        await this.saveSession({
          ...session,
          state: 'closed',
          closedReason: (e.reason as SessionRecord['closedReason']) ?? 'agent',
          sessionToken: null,
        })
      } else if (e instanceof ProfileError && e.status === 409 && SPACE_LEFT.has(e.code)) {
        // the person left the conversation's space: the agent recorded nothing, and the conversation is read-only
        // from now on (PROF-RUN-014, UI-CONV-043)
        await this.dropMessage(sessionId, `u_${runId}`)
        await this.loadSpaces(session.agentDid).catch(() => undefined)
        const space = this.snapshot.spaces[session.agentDid]?.spaces.find((x) => x.id === session.spaceId)
        throw new Error(i18next.t('conversation.spaceLeft', { space: space?.title ?? '' }))
      } else if (!controller.signal.aborted) throw e
    } finally {
      const left = this.runs.get(sessionId)
      left?.delete(runId)
      if (left && left.size === 0) this.runs.delete(sessionId)
      // a message sent during a run whose sending failed before the agent recorded it: it leaves the transcript
      // rather than stand there as if it waited
      await this.dropOrphans(sessionId)
      // after the run's own RunFinished, which may still be queued
      await this.serial(async () => {
        const t = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
        if (t.run?.runId !== runId) return
        const closed = {
          ...t,
          run: null,
          messages: t.messages.map((m) =>
            m.role !== 'activity' && m.streaming ? { ...m, streaming: false, interrupted: true } : m
          ),
        }
        await this.store.putTranscript(closed)
        this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: closed } })
        this.bus?.post({ kind: 'transcript', sessionId })
      })
    }
  }

  // ---- deleting a message within the window (UI-CONV-036/037, PROF-HIST-010) ----------------------------------

  /** The deletion window the agent of a session declares, in seconds; null when nobody may delete there. */
  public deletionWindow(sessionId: string): number | null {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    return deletionWindowOf(this.snapshot.agents.find((a) => a.did === session?.agentDid)?.descriptor.features)
  }

  /**
   * Deletes a message the person wrote, with the agent's reply to it (UI-CONV-036): both leave the transcript at
   * once, with no confirmation, and the agent is asked to delete them (PROF-HIST-010); its `ayni.messages.erased`
   * takes them from the person's other devices. When the agent refuses or cannot be reached they come back where
   * they were, and the error says why.
   */
  public async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    const agent = this.snapshot.agents.find((a) => a.did === session?.agentDid)
    if (!session || !agent) throw new Error('session not found')
    const { client, token } = this.clientOf(session)
    let removed: TranscriptMessage[] = []
    let before: TranscriptMessage[] = []
    let target = messageId
    await this.serial(async () => {
      const t = await this.store.getTranscript(sessionId)
      if (!t) return
      removed = turnToDelete(t.messages, messageId)
      if (!removed.length) return
      target = deletionIdOf(removed[0])
      before = t.messages
      const gone = new Set(removed.map((m) => m.id))
      const next = { ...t, messages: t.messages.filter((m) => !gone.has(m.id)) }
      await this.store.putTranscript(next)
      this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
      this.bus?.post({ kind: 'transcript', sessionId })
    })
    if (!removed.length) return
    if (this.snapshot.inspect && removed.some((m) => m.id === this.snapshot.inspect?.messageId))
      this.set({ inspect: null })
    try {
      await client.deleteMessage(sessionId, token, target)
    } catch (e) {
      await this.serial(async () => {
        const t = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
        const next = { ...t, messages: withRestored(t.messages, removed, before) }
        await this.store.putTranscript(next)
        this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
        this.bus?.post({ kind: 'transcript', sessionId })
      })
      const reason = deletionRefusalOf(e instanceof ProfileError ? e : undefined)
      throw new Error(i18next.t(`conversation.deleteRefused.${reason}`, { agent: agent.name }))
    }
  }

  /**
   * How a history read lets go of what history no longer returns (UI-CONV-037): only against an agent that keeps
   * history, and never a message this browser is still sending (its run in flight, or sent in the last minute).
   */
  private purgeOf(session: SessionRecord): { keep: (m: TranscriptMessage) => boolean } | undefined {
    const agent = this.snapshot.agents.find((a) => a.did === session.agentDid)
    if (!agent?.descriptor.features.history) return undefined
    const sessionId = session.sessionId
    return {
      keep: (m) =>
        m.role === 'user' &&
        m.id.startsWith('u_') &&
        (!!this.runs.get(sessionId)?.has(m.id.slice(2)) || Date.now() - Date.parse(m.at) < 60_000),
    }
  }

  private readonly usageReads = new Map<string, Promise<boolean>>()

  /**
   * The memories and preferences a reply used (UI-CONV-034), and the sources of its tools (UI-CONV-047), are only in
   * history (PROF-HIST-011, PROF-TOOL-010): for a reply received live, history is read back, newest page first, until
   * it holds the reply. True when it was found. One read at a time per reply, whatever asks for it.
   */
  public readUsage(sessionId: string, messageId: string, maxPages = 10): Promise<boolean> {
    const key = `${sessionId}:${messageId}`
    const inFlight = this.usageReads.get(key)
    if (inFlight) return inFlight
    const read = this.readUsageNow(sessionId, messageId, maxPages).finally(() => this.usageReads.delete(key))
    this.usageReads.set(key, read)
    return read
  }

  private async readUsageNow(sessionId: string, messageId: string, maxPages: number): Promise<boolean> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (session?.state !== 'bound' || !session.sessionToken) return false
    const { client, token } = this.clientOf(session)
    let before: string | undefined
    for (let i = 0; i < maxPages; i++) {
      const page = await client.history(sessionId, token, before, 50)
      const messages = page.messages as Record<string, unknown>[]
      if (messages.some((m) => String(m.id) === messageId)) {
        await this.serial(async () => {
          const t = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
          const next = { ...t, messages: withUsageFrom(t.messages, messages) }
          await this.store.putTranscript(next)
          this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
        })
        return true
      }
      if (!page.nextBefore || !messages.length) return false
      before = page.nextBefore
    }
    return false
  }

  // ---- spaces (UI-CONV-028..031, 038..041, 043; profile 3.3 §3.7) ------------------------------------------------

  private async loadSpacesWith(agentDid: string, client: ProfileClient, token: string): Promise<void> {
    try {
      const spaces = await client.spaces(token)
      this.set({ spaces: { ...this.snapshot.spaces, [agentDid]: spaces } })
      // with the spaces' counts, the agent's: the badge of its Notifications in its menu (PROF-TOOL-025)
      if (this.takesNotifications(agentDid))
        await client
          .notifications(token, null, undefined, 1)
          .then((page) => this.setNotificationCount(agentDid, null, page.waiting))
          .catch((e) => warn("the agent's notifications could not be read", e))
    } catch (e) {
      // an agent that serves no spaces: the person has Personal alone, as before spaces
      if (e instanceof ProfileError && e.status === 404)
        this.set({ spaces: { ...this.snapshot.spaces, [agentDid]: { spaces: [], templates: [] } } })
      // a token the agent refuses is the caller's to retire (UI-SESS-019); anything else is said, and read again later
      else if (e instanceof ProfileError && (e.status === 401 || e.status === 410)) throw e
      else warn('the spaces could not be read', e)
    }
  }

  /** Reads the person's spaces with the agent again (PROF-SPACE-001). */
  public async loadSpaces(agentDid: string): Promise<Spaces | undefined> {
    await this.withAgent(agentDid, (client, token) => this.loadSpacesWith(agentDid, client, token))
    return this.snapshot.spaces[agentDid]
  }

  /** Whether the agent answers this person its admin view (UI-CONV-042): asked once per page load. */
  private async probeAdmin(agentDid: string, client: ProfileClient, token: string): Promise<void> {
    if (this.snapshot.admins[agentDid] !== undefined) return
    this.snapshot = { ...this.snapshot, admins: { ...this.snapshot.admins, [agentDid]: false } }
    try {
      await client.adminRoles(token)
      this.set({ admins: { ...this.snapshot.admins, [agentDid]: true } })
    } catch (e) {
      // refused (403 not-admin, 404 from an agent with no admin view): no Roles; anything else is asked again later
      const refused = e instanceof ProfileError && (e.status === 403 || e.status === 404)
      this.set({ admins: { ...this.snapshot.admins, [agentDid]: refused ? false : undefined } })
    }
  }

  /**
   * Whether the agent gives this person spaces to steward (UI-CONV-068, PROF-SPACE-009): asked once per page load. A
   * person who stewards none is refused (`403 not-steward`), and an agent of no governance answers `404`: no entry.
   */
  private async probeSteward(agentDid: string, client: ProfileClient, token: string): Promise<void> {
    if (this.snapshot.stewards[agentDid] !== undefined) return
    this.snapshot = { ...this.snapshot, stewards: { ...this.snapshot.stewards, [agentDid]: false } }
    try {
      const spaces = await client.stewardship(token)
      this.set({ stewards: { ...this.snapshot.stewards, [agentDid]: spaces.length > 0 } })
    } catch (e) {
      const refused = e instanceof ProfileError && (e.status === 403 || e.status === 404)
      this.set({ stewards: { ...this.snapshot.stewards, [agentDid]: refused ? false : undefined } })
    }
  }

  /**
   * A call of the agent on the person's behalf, with any bound session's token (profile 3.3 §3.7 to §3.9). With none
   * bound, a paired browser gets one quietly first (UI-SESS-016): what the person has on screen stays there.
   */
  private async withAgent<T>(
    agentDid: string,
    fn: (client: ProfileClient, token: string, session: SessionRecord) => Promise<T>
  ): Promise<T> {
    // through the latest binding; a session whose token the agent refuses is retired and the next one asked
    // (UI-SESS-019). A 404 is not counted: here it answers about what was asked for, not about the token
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!this.boundOf(agentDid))
        await this.refresh(agentDid).catch((e) => warn('no session could be opened without the phone', e))
      const bound = this.boundOf(agentDid)
      if (!bound) break
      const { client, token } = this.clientOf(bound)
      try {
        return await fn(client, token, bound)
      } catch (e) {
        if (!(e instanceof ProfileError && (e.status === 401 || e.status === 410))) throw e
        warn(`session ${bound.sessionId} was refused: retired, asking the next`, e)
        await this.retire(bound, e.reason)
      }
    }
    throw new Error('link your phone first')
  }

  /**
   * A space's page in the main pane (UI-CONV-031); `approvalId`, an item of its Notifications to show selected;
   * `source`, the panel of a source its Tools segment opens at (UI-APPR-011).
   */
  public openSpace(
    agentDid: string,
    spaceId: string,
    segment: SpaceSegment = 'conversations',
    approvalId?: string,
    source?: string
  ): void {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    this.set({
      view: 'space',
      spaceFor: { agentDid, spaceId, segment, ...(approvalId ? { approvalId } : {}), ...(source ? { source } : {}) },
      selectedAgentDid: agentDid,
      selectedControllerDid: agent?.controllerDid ?? this.snapshot.selectedControllerDid,
      inspect: null,
    })
  }

  public setSpaceSegment(segment: SpaceSegment): void {
    if (!this.snapshot.spaceFor) return
    // the item a link named, and the panel a notice opened, stay only on the segment they opened
    const { approvalId: _named, source: _source, ...spaceFor } = this.snapshot.spaceFor
    this.set({ spaceFor: { ...spaceFor, segment } })
  }

  public spaceDetail(agentDid: string, spaceId: string) {
    return this.withAgent(agentDid, (client, token) => client.space(token, spaceId))
  }

  public sharedConversations(agentDid: string, spaceId: string) {
    return this.withAgent(agentDid, (client, token) => client.sharedConversations(token, spaceId))
  }

  /** A new space of a template, owned by the person (UI-CONV-039, PROF-SPACE-002); the list is read again. */
  public async createSpace(
    agentDid: string,
    input: { templateId: string; title: string; purpose: string; brief?: string }
  ): Promise<SpaceInfo> {
    const space = await this.withAgent(agentDid, (client, token) => client.createSpace(token, input))
    await this.loadSpaces(agentDid).catch(() => undefined)
    return space
  }

  /** The owner changes a space within its template's bounds (UI-CONV-041, PROF-SPACE-004). */
  public async patchSpace(agentDid: string, spaceId: string, patch: SpacePatch): Promise<SpaceInfo> {
    const space = await this.withAgent(agentDid, (client, token) => client.patchSpace(token, spaceId, patch))
    await this.loadSpaces(agentDid).catch(() => undefined)
    return space
  }

  public async addMember(
    agentDid: string,
    spaceId: string,
    who: { directoryId: string } | { organizationKey: string; email: string }
  ): Promise<void> {
    await this.withAgent(agentDid, (client, token) => client.addMember(token, spaceId, who))
    await this.loadSpaces(agentDid).catch(() => undefined)
  }

  public async removeMember(agentDid: string, spaceId: string, memberId: string): Promise<void> {
    await this.withAgent(agentDid, (client, token) => client.removeMember(token, spaceId, memberId))
    await this.loadSpaces(agentDid).catch(() => undefined)
  }

  /** Hands the space to someone else (UI-CONV-041, PROF-SPACE-006): the person's owner segments leave with it. */
  public async transferOwnership(
    agentDid: string,
    spaceId: string,
    to: { memberId: string } | { directoryId: string }
  ): Promise<void> {
    await this.withAgent(agentDid, (client, token) => client.transferOwnership(token, spaceId, to))
    await this.loadSpaces(agentDid).catch(() => undefined)
    if (this.snapshot.spaceFor?.spaceId === spaceId) this.setSpaceSegment('about')
  }

  /** The owner names the space's successor (UI-CONV-041, PROF-SPACE-008); the list of spaces says it. */
  public async setSuccessor(
    agentDid: string,
    spaceId: string,
    to: { memberId: string } | { directoryId: string }
  ): Promise<void> {
    await this.withAgent(agentDid, (client, token) => client.setSuccessor(token, spaceId, to))
    await this.loadSpaces(agentDid).catch(() => undefined)
  }

  /** The owner clears the successor (UI-CONV-041, PROF-SPACE-008). */
  public async clearSuccessor(agentDid: string, spaceId: string): Promise<void> {
    await this.withAgent(agentDid, (client, token) => client.clearSuccessor(token, spaceId))
    await this.loadSpaces(agentDid).catch(() => undefined)
  }

  // ---- Spaces you steward (UI-CONV-068; profile 3.5.4 PROF-SPACE-009) ---------------------------------------------

  /** Spaces you steward in the main pane (UI-CONV-068), at the space a notice names (UI-APPR-011). */
  public openSteward(agentDid: string, spaceId?: string): void {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    this.set({
      view: 'steward',
      stewardFor: { agentDid, ...(spaceId ? { spaceId } : {}) },
      selectedAgentDid: agentDid,
      selectedControllerDid: agent?.controllerDid ?? this.snapshot.selectedControllerDid,
      trustFor: null,
      inspect: null,
    })
  }

  public stewardship(agentDid: string): Promise<StewardedSpace[]> {
    return this.withAgent(agentDid, (client, token) => client.stewardship(token))
  }

  public ownerCandidates(agentDid: string, spaceId: string): Promise<OwnerCandidate[]> {
    return this.withAgent(agentDid, (client, token) => client.ownerCandidates(token, spaceId))
  }

  /** A steward names the owner, with a reason (PROF-SPACE-009); the person's own spaces may change with it. */
  public async nameOwner(
    agentDid: string,
    spaceId: string,
    to: { memberId: string } | { directoryId: string },
    reason: string
  ): Promise<StewardedSpace> {
    const space = await this.withAgent(agentDid, (client, token) => client.nameOwner(token, spaceId, to, reason))
    await this.loadSpaces(agentDid).catch(() => undefined)
    return space
  }

  public spaceActivity(agentDid: string, spaceId: string, before?: string) {
    return this.withAgent(agentDid, (client, token) => client.spaceActivity(token, spaceId, before))
  }

  /** The member picker (UI-CONV-040, PROF-DIR-001). */
  public searchPeople(agentDid: string, q: string) {
    return this.withAgent(agentDid, (client, token) => client.directory(token, q))
  }

  /** The organizations of the trust graph, for an invitation (UI-CONV-040, PROF-DIR-002). */
  public searchOrganizations(agentDid: string, q: string) {
    return this.withAgent(agentDid, (client, token) => client.organizations(token, q))
  }

  /**
   * Moves the empty conversation to another space (UI-CONV-029, PROF-CONV-011): only before the person's first
   * message; the agent says so with `409 has-messages`.
   */
  public async setConversationSpace(sessionId: string, spaceId: string): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session?.conversationId) throw new Error('conversation not known to the agent yet')
    const { client, token } = await this.tokenFor(session.agentDid, session.conversationId)
    try {
      await client.patchConversation(token, session.conversationId, { spaceId })
    } catch (e) {
      if (e instanceof ProfileError && e.status === 409) throw new Error(i18next.t('spaces.hasMessages'))
      throw e
    }
    const current = this.snapshot.sessions.find((s) => s.sessionId === sessionId) ?? session
    await this.saveSession({ ...current, spaceId })
  }

  /** Shares the conversation with its own space, or stops sharing it (UI-CONV-038, PROF-CONV-012). */
  public async setShared(sessionId: string, shared: boolean): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session?.conversationId) throw new Error('conversation not known to the agent yet')
    const space = this.snapshot.spaces[session.agentDid]?.spaces.find((x) => x.id === session.spaceId)
    const { client, token } = await this.tokenFor(session.agentDid, session.conversationId)
    try {
      if (shared) await client.share(token, session.conversationId)
      else await client.unshare(token, session.conversationId)
    } catch (e) {
      if (e instanceof ProfileError && e.code === 'handover-not-allowed')
        throw new Error(i18next.t('spaces.shareNotAllowed', { space: space?.title ?? '' }))
      if (e instanceof ProfileError && e.code === 'final') throw new Error(i18next.t('spaces.shareFinal'))
      throw e
    }
    const current = this.snapshot.sessions.find((s) => s.sessionId === sessionId) ?? session
    await this.saveSession({ ...current, shared })
    this.notify(
      'info',
      shared ? i18next.t('spaces.sharedNotice', { space: space?.title ?? '' }) : i18next.t('spaces.unsharedNotice')
    )
  }

  /** A conversation shared with a space, read-only (UI-CONV-038). */
  public openShared(agentDid: string, spaceId: string, conversation: SharedConversation): void {
    this.set({ view: 'shared', sharedFor: { agentDid, spaceId, conversation }, inspect: null })
  }

  public sharedHistory(agentDid: string, spaceId: string, conversationId: string, before?: string) {
    return this.withAgent(agentDid, (client, token) => client.sharedHistory(token, spaceId, conversationId, before, 50))
  }

  public sharedAttachment(agentDid: string, spaceId: string, conversationId: string, attachmentId: string) {
    return this.withAgent(agentDid, (client, token) =>
      client.sharedAttachment(token, spaceId, conversationId, attachmentId)
    )
  }

  // ---- memories and what the agent keeps (UI-CONV-032..035; profile 3.3 §3.8) ---------------------------------

  /** The person's preferences and their memories, of every space or of one (PROF-MEM-001). */
  public memories(agentDid: string, spaceId?: string) {
    return this.withAgent(agentDid, (client, token) => client.memories(token, spaceId))
  }

  /** Deletes a memory for good (UI-CONV-032, PROF-MEM-002): every list of memories reads again. */
  public async deleteMemory(agentDid: string, memoryId: string): Promise<void> {
    await this.withAgent(agentDid, (client, token) => client.deleteMemory(token, memoryId))
    this.set({ memoriesVersion: this.snapshot.memoriesVersion + 1 })
  }

  public async deletePreference(agentDid: string, key: string): Promise<void> {
    await this.withAgent(agentDid, (client, token) => client.deletePreference(token, key))
    this.set({ memoriesVersion: this.snapshot.memoriesVersion + 1 })
  }

  public aboutMe(agentDid: string) {
    return this.withAgent(agentDid, (client, token) => client.aboutMe(token))
  }

  // ---- tools, phase 1 (UI-CONV-045..051, UI-APPR-006; profile 3.4 §3.10, §6, §8) ---------------------------------

  /** Whether the agent serves the tools of profile 3.4 (PROF-DESC-009): nothing of tools is shown or asked without it. */
  public takesTools(agentDid: string): boolean {
    return takesTools(this.snapshot.agents.find((a) => a.did === agentDid)?.descriptor.features)
  }

  /**
   * Keeps a stream of the agent open while a change of a space's tools waits for the owner's phone (UI-CONV-050,
   * PROF-TOOL-006): `ayni.space.tools.changed` reaches only the sessions whose stream is open. A session already
   * streamed here or in another tab does; else the latest bound one is streamed, ahead of the budget, and a paired
   * browser with none bound gets one quietly. Checked again every few seconds; returns what lets it go.
   */
  public holdStream(agentDid: string): () => void {
    const ensure = async () => {
      const bound = () =>
        this.snapshot.sessions
          .filter((s) => s.agentDid === agentDid && s.state === 'bound' && s.sessionToken)
          .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      if (bound().some((s) => this.snapshot.leaders[s.sessionId] !== undefined)) return
      if (!bound().length) await this.refresh(agentDid).catch(() => undefined)
      const session = bound()[0]
      if (session && this.snapshot.leaders[session.sessionId] === undefined) void this.lead(session.sessionId, true)
    }
    void ensure()
    const timer = setInterval(() => void ensure(), 5000)
    return () => clearInterval(timer)
  }

  /** The tools of a space: every source to its owner, the `ready` ones to a member (PROF-TOOL-001). */
  public spaceTools(agentDid: string, spaceId: string): Promise<SpaceTool[]> {
    return this.withAgent(agentDid, (client, token) => client.spaceTools(token, spaceId))
  }

  /** The owner adds a source, or switches an `off` one back on; it waits for the owner's phone (PROF-TOOL-002). */
  public addSpaceTool(
    agentDid: string,
    spaceId: string,
    input: { source: string; bindings?: Record<string, string>; calls?: Record<string, ToolRule> }
  ): Promise<SpaceToolAnswer> {
    return this.withAgent(agentDid, (client, token) => client.addSpaceTool(token, spaceId, input))
  }

  /** The owner changes bindings and rules: at once when it only narrows, else on the phone (PROF-TOOL-003). */
  public patchSpaceTool(
    agentDid: string,
    spaceId: string,
    source: string,
    patch: {
      bindings?: Record<string, string>
      calls?: Record<string, ToolRule>
      approvals?: Record<string, ApprovalPolicyInput>
    }
  ): Promise<SpaceToolAnswer> {
    return this.withAgent(agentDid, (client, token) => client.patchSpaceTool(token, spaceId, source, patch))
  }

  /**
   * The owner sets or replaces the space's account, one value per declared field (PROF-TOOL-004, UI-CONV-050). The
   * values go to the agent and nowhere else: no store, no draft, no log, no notice of this page holds them.
   */
  public setSpaceToolAccount(
    agentDid: string,
    spaceId: string,
    source: string,
    values: Record<string, string>
  ): Promise<SpaceToolAnswer> {
    return this.withAgent(agentDid, (client, token) => client.setSpaceToolAccount(token, spaceId, source, values))
  }

  public clearSpaceToolAccount(agentDid: string, spaceId: string, source: string): Promise<SpaceTool> {
    return this.withAgent(agentDid, (client, token) => client.clearSpaceToolAccount(token, spaceId, source))
  }

  public removeSpaceTool(agentDid: string, spaceId: string, source: string): Promise<SpaceTool> {
    return this.withAgent(agentDid, (client, token) => client.removeSpaceTool(token, spaceId, source))
  }

  /** The owner withdraws the change that waits for the phone (PROF-TOOL-005). */
  public withdrawSpaceToolChange(agentDid: string, spaceId: string, source: string): Promise<void> {
    return this.withAgent(agentDid, (client, token) => client.withdrawSpaceToolChange(token, spaceId, source))
  }

  /** Records a change of a space's tools the agent announced (PROF-TOOL-006), and tells the other tabs. */
  private noteToolsChange(agentDid: string, value: unknown, broadcast: boolean): void {
    const change = spaceToolsChangeOf(value)
    if (!change) return
    const last = this.snapshot.toolChanges[this.snapshot.toolChanges.length - 1]
    // every bound session of the owner hears it: one is enough
    const same =
      !!last &&
      last.agentDid === agentDid &&
      last.change.spaceId === change.spaceId &&
      last.change.source === change.source &&
      last.change.changeId === change.changeId &&
      last.change.outcome === change.outcome
    if (same) return
    const n = (last?.n ?? 0) + 1
    this.set({ toolChanges: [...this.snapshot.toolChanges.slice(-19), { agentDid, change, n }] })
    if (broadcast) this.bus?.post({ kind: 'tools-changed', agentDid, change })
  }

  /**
   * The answer on a confirmation card (UI-CONV-045, PROF-TOOL-008): Allow, Allow for this conversation, Refuse. It is
   * sent while the reply waits for it; a failure reaches the caller, which says the answer was not sent.
   */
  public async decideConfirmation(
    sessionId: string,
    approvalId: string,
    decision: 'approve' | 'reject',
    scope?: 'conversation'
  ): Promise<void> {
    const action = { kind: 'approval.decide', approvalId, decision, ...(scope ? { scope } : {}) } as AyniAction
    await this.dispatch(sessionId, { type: 'run', action, decision: true })
  }

  /** Stop allowing (UI-CONV-046, PROF-TOOL-012): the next call of that tool in the conversation asks again. */
  public async stopAllowing(sessionId: string, approvalId: string): Promise<void> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session?.conversationId) throw new Error('conversation not known to the agent yet')
    const { client, token } = await this.tokenFor(session.agentDid, session.conversationId)
    await client.endAllowance(token, session.conversationId, approvalId)
    await this.patchTranscript(sessionId, (t) => withAllowanceEnded(t, approvalId))
  }

  /**
   * Before sharing a conversation with its space (UI-CONV-048, PROF-TOOL-011): against an agent that serves tools, the
   * sources of the tool results it holds. With none, or against another agent, the conversation is shared at once
   * (`shared`); with some, they are returned, for the person to decide; when they cannot be read nothing is shared
   * and the error says so.
   */
  public async requestShare(sessionId: string): Promise<'shared' | ConversationSource[]> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session?.conversationId) throw new Error('conversation not known to the agent yet')
    if (this.takesTools(session.agentDid)) {
      let sources: ConversationSource[]
      try {
        const { client, token } = await this.tokenFor(session.agentDid, session.conversationId)
        sources = await client.conversationSources(token, session.conversationId)
      } catch {
        throw new Error(i18next.t('tools.share.unreadable'))
      }
      if (sources.length) return sources
    }
    await this.setShared(sessionId, true)
    return 'shared'
  }

  /** A change of one conversation's transcript, stored and shown, and told to the other tabs. */
  private patchTranscript(sessionId: string, change: (t: Transcript) => Transcript): Promise<void> {
    return this.serial(async () => {
      const t = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
      const next = change(t)
      if (next === t) return
      await this.store.putTranscript(next)
      this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
      this.bus?.post({ kind: 'transcript', sessionId })
    })
  }

  // ---- tools, phase 2: the person's own accounts (UI-CONV-053..058; profile 3.5 §3.11) ---------------------------

  /** Whether the agent serves the person's own accounts (PROF-DESC-010): no Your accounts without it. */
  public takesConnections(agentDid: string): boolean {
    return takesConnections(this.snapshot.agents.find((a) => a.did === agentDid)?.descriptor.features)
  }

  /** Your accounts of an agent (UI-CONV-053), at a row when one is named (a Connect card, About); the page reads them. */
  public openAccounts(agentDid: string, focus?: ConnectionRef): void {
    this.set({
      view: 'accounts',
      accountsFor: { agentDid, ...(focus ? { focus } : {}) },
      trustFor: null,
      inspect: null,
    })
  }

  /** The reads of Your accounts in flight, by agent: only the latest one's answer is kept. */
  private readonly connectionReads = new Map<string, number>()

  /** Reads the person's own accounts (PROF-TOOL-014) and keeps them for the screens that show them. */
  public async loadConnections(agentDid: string): Promise<Connection[]> {
    const n = (this.connectionReads.get(agentDid) ?? 0) + 1
    this.connectionReads.set(agentDid, n)
    const list = await this.withAgent(agentDid, (client, token) => client.connections(token))
    if (this.connectionReads.get(agentDid) === n)
      this.set({ connections: { ...this.snapshot.connections, [agentDid]: list } })
    return list
  }

  /** The agents whose accounts a screen shows (Your accounts, a Connect card), with how many screens show them. */
  private readonly watchedConnections = new Map<string, number>()
  private watchingVisibility = false

  /**
   * Keeps the person's own accounts of an agent read while a screen shows them (UI-CONV-053, PROF-TOOL-019): again
   * each time the tab comes back in front, a sign-in finished in another tab or on the phone among what changed (the
   * screen reads them when it opens, and `ayni.connections.changed` reads them again). Returns what lets it go.
   */
  public watchConnections(agentDid: string): () => void {
    this.watchedConnections.set(agentDid, (this.watchedConnections.get(agentDid) ?? 0) + 1)
    if (!this.watchingVisibility && typeof document !== 'undefined') {
      this.watchingVisibility = true
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        for (const watched of this.watchedConnections.keys())
          void this.loadConnections(watched).catch((e) => warn('Your accounts could not be read', e))
      })
    }
    return () => {
      const left = (this.watchedConnections.get(agentDid) ?? 1) - 1
      if (left > 0) this.watchedConnections.set(agentDid, left)
      else this.watchedConnections.delete(agentDid)
    }
  }

  /** The row the agent answered, in place of the one held; the list is read again behind it. */
  private keepConnection(agentDid: string, connection: Connection): void {
    const held = this.snapshot.connections[agentDid]
    if (held) {
      const key = connectionKeyOf(connection)
      const known = held.some((c) => connectionKeyOf(c) === key)
      this.set({
        connections: {
          ...this.snapshot.connections,
          [agentDid]: known ? held.map((c) => (connectionKeyOf(c) === key ? connection : c)) : [...held, connection],
        },
      })
    }
    void this.loadConnections(agentDid).catch((e) => warn('Your accounts could not be read', e))
  }

  /**
   * Starts the sign-in of an account of OAuth (PROF-TOOL-015): the URL the tab opened at the press goes to. Nothing
   * is asked on the phone. `spaceId` for a source of a space's template.
   */
  public async authorizeConnection(agentDid: string, source: string, spaceId?: string): Promise<ConnectionAttempt> {
    const attempt = await this.withAgent(agentDid, (client, token) =>
      client.authorizeConnection(token, source, spaceId)
    )
    void this.loadConnections(agentDid).catch((e) => warn('Your accounts could not be read', e))
    return attempt
  }

  /** Ends a sign-in that waits (PROF-TOOL-015); its outcome, `cancelled`, also comes as an event. */
  public async cancelConnectionAttempt(agentDid: string, attemptId: string): Promise<void> {
    try {
      await this.withAgent(agentDid, (client, token) => client.cancelConnectionAttempt(token, attemptId))
    } finally {
      void this.loadConnections(agentDid).catch((e) => warn('Your accounts could not be read', e))
    }
  }

  /**
   * Sets an account of fields, at once (PROF-TOOL-016, UI-CONV-055). The values go to the agent and nowhere else: no
   * store, no draft, no log, no notice of this page holds them.
   */
  public async setConnectionAccount(
    agentDid: string,
    source: string,
    values: Record<string, string>,
    spaceId?: string
  ): Promise<Connection> {
    const connection = await this.withAgent(agentDid, (client, token) =>
      client.setConnectionAccount(token, source, values, spaceId)
    )
    this.keepConnection(agentDid, connection)
    return connection
  }

  /** Disconnects an account, at once (PROF-TOOL-017, UI-CONV-056). */
  public async disconnectAccount(agentDid: string, accountId: string): Promise<Connection> {
    const connection = await this.withAgent(agentDid, (client, token) => client.disconnectAccount(token, accountId))
    this.keepConnection(agentDid, connection)
    return connection
  }

  /**
   * Records a change of the person's own accounts the agent announced (PROF-TOOL-019), tells the other tabs, and reads
   * Your accounts again. Every bound session of the person hears it: one is enough.
   */
  private noteConnectionsChange(agentDid: string, value: unknown, broadcast: boolean): void {
    const change = connectionsChangeOf(value)
    if (!change) return
    const last = this.snapshot.connectionChanges[this.snapshot.connectionChanges.length - 1]
    if (last && last.agentDid === agentDid && JSON.stringify(last.change) === JSON.stringify(change)) return
    const n = (last?.n ?? 0) + 1
    this.set({ connectionChanges: [...this.snapshot.connectionChanges.slice(-19), { agentDid, change, n }] })
    if (broadcast) this.bus?.post({ kind: 'connections-changed', agentDid, change })
    if (this.takesConnections(agentDid))
      void this.loadConnections(agentDid).catch((e) => warn('Your accounts could not be read', e))
  }

  // ---- the Notifications of a space and of the agent (UI-APPR-001, 002, 005..009; profile §3.12; agent D114) ---------

  /** Whether the agent serves the Notifications (PROF-DESC-011): no tab, no entry and no badge of them without it. */
  public takesNotifications(agentDid: string): boolean {
    return takesNotifications(this.snapshot.agents.find((a) => a.did === agentDid)?.descriptor.features)
  }

  /** The agent's Notifications in the main pane (UI-APPR-007), the item a link names shown selected. */
  public openNotifications(agentDid: string, approvalId?: string): void {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    this.set({
      view: 'notifications',
      notificationsFor: { agentDid, ...(approvalId ? { approvalId } : {}) },
      selectedAgentDid: agentDid,
      selectedControllerDid: agent?.controllerDid ?? this.snapshot.selectedControllerDid,
      trustFor: null,
      inspect: null,
    })
  }

  /**
   * A page of the Notifications of a space, or of the agent's for `spaceId` null (PROF-TOOL-024), newest first; the
   * count of what waits there is taken for the badges.
   */
  public async notifications(
    agentDid: string,
    spaceId: string | null,
    before?: string,
    limit?: number
  ): Promise<NotificationsPage> {
    const page = await this.withAgent(agentDid, (client, token) => client.notifications(token, spaceId, before, limit))
    if (!before) this.setNotificationCount(agentDid, spaceId, page.waiting)
    return page
  }

  /** The badge of a place, as the agent counts it (PROF-TOOL-025): a space's row and tab, or the agent's entry. */
  private setNotificationCount(agentDid: string, spaceId: string | null, waiting: number): void {
    if (spaceId === null) {
      if (this.snapshot.agentNotifications[agentDid] !== waiting)
        this.set({ agentNotifications: { ...this.snapshot.agentNotifications, [agentDid]: waiting } })
      return
    }
    const held = this.snapshot.spaces[agentDid]
    const space = held?.spaces.find((x) => x.id === spaceId)
    if (!held || !space || space.notificationsWaiting === waiting) return
    this.set({
      spaces: {
        ...this.snapshot.spaces,
        [agentDid]: { ...held, spaces: withSpaceCount(held.spaces, spaceId, waiting) },
      },
    })
  }

  /** The Notifications on screen read their list again. */
  public rereadNotifications(): void {
    this.set({ notificationsVersion: this.snapshot.notificationsVersion + 1 })
  }

  /**
   * A notification of the person entered, changed or ended (PROF-TOOL-025): its place's badge takes the agent's count,
   * the Notifications on screen read again, and the other tabs are told. Every bound session of the person whose
   * stream is open hears it; the count is the agent's number, so hearing it twice counts nothing twice, and a list
   * read twice at once is read once more after the first (`useNotifications`).
   */
  private noteNotificationsChange(agentDid: string, value: unknown, broadcast: boolean): void {
    const change: NotificationsChange | null = notificationsChangeOf(value)
    if (!change) return
    this.setNotificationCount(agentDid, change.spaceId, change.count)
    this.rereadNotifications()
    if (broadcast) this.bus?.post({ kind: 'notifications-changed', agentDid, change })
  }

  /** How many screens show Notifications: while one does, the tab coming back in front reads them again. */
  private watchedNotifications = 0
  private watchingNotificationsVisibility = false

  /**
   * Keeps the Notifications on screen current (UI-APPR-007, PROF-TOOL-025): read again each time the tab comes back in
   * front, and a stream of the agent held open so that `ayni.space.notifications.changed` reaches this browser (a
   * decision made on the phone among what changes). Returns what lets it go.
   */
  public watchNotifications(agentDid: string): () => void {
    this.watchedNotifications += 1
    if (!this.watchingNotificationsVisibility && typeof document !== 'undefined') {
      this.watchingNotificationsVisibility = true
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.watchedNotifications > 0) this.rereadNotifications()
      })
    }
    const release = this.holdStream(agentDid)
    return () => {
      this.watchedNotifications = Math.max(0, this.watchedNotifications - 1)
      release()
    }
  }

  /**
   * An approver's decision from the Notifications (UI-APPR-002, PROF-TOOL-026): `approval.decide` through any bound
   * session of the person. It starts no turn and adds nothing to any conversation: no event of its run reaches a
   * transcript. Answers the approval's status after it (`PENDING` while other approvers decide), or the code of the
   * refusal (`decide-on-phone`, `not-eligible`); the Notifications read again.
   */
  public async decideApproval(
    agentDid: string,
    approvalId: string,
    decision: 'approve' | 'reject',
    note?: string
  ): Promise<{ status?: ApprovalStatus; code?: string }> {
    const action = { kind: 'approval.decide', approvalId, decision, ...(note ? { note } : {}) } as AyniAction
    try {
      return await this.withAgent(agentDid, async (client, token, session) => {
        let refused: string | undefined
        const end = await client.run(
          session.sessionId,
          token,
          { runId: crypto.randomUUID(), action },
          (event) => {
            // a refusal the agent sends without a word of the run before it
            if (event.type === 'RUN_ERROR' && typeof event.code === 'string') refused = event.code
          },
          new AbortController().signal
        )
        const code = end.code ?? refused
        return {
          ...(end.approvalId === approvalId && end.status ? { status: end.status } : {}),
          ...(code ? { code } : {}),
        }
      })
    } finally {
      this.rereadNotifications()
    }
  }

  /**
   * Decide on your phone (UI-APPR-008, PROF-TOOL-026): the request of an approval to attest sent to the person's phone
   * again. Its refusals (`404`, `409 not-pending`, `409 confirmation-unavailable`) reach the caller.
   */
  public resendApproval(agentDid: string, approvalId: string): Promise<{ expiresAt: string }> {
    return this.withAgent(agentDid, (client, token) => client.resendApproval(token, approvalId))
  }

  /**
   * The requester withdraws their pending approval from its card (UI-APPR-005, `approval.cancel`): no turn, nothing
   * added to the conversation; the card turns to Withdrawn where it is.
   */
  public async cancelApproval(sessionId: string, approvalId: string): Promise<void> {
    await this.dispatch(sessionId, { type: 'run', action: { kind: 'approval.cancel', approvalId }, decision: true })
  }

  /** "What <agent> keeps about you" (UI-CONV-033): from the agent's menu, the conversation's, the trust card. */
  public openKeeps(agentDid: string): void {
    this.set({ view: 'keeps', keepsFor: agentDid, trustFor: null, inspect: null })
  }

  /** The sheet of a memory or a preference (UI-CONV-032); null closes it. */
  public openMemory(ref: Snapshot['memoryFor']): void {
    this.set({ memoryFor: ref })
  }

  // ---- the admin view (UI-CONV-042; profile 3.3 §3.9) -----------------------------------------------------------

  public openAdmin(agentDid: string): void {
    this.set({ view: 'admin', adminFor: agentDid, inspect: null })
  }

  public adminRoles(agentDid: string) {
    return this.withAgent(agentDid, (client, token) => client.adminRoles(token))
  }

  public adminChanges(agentDid: string, before?: string) {
    return this.withAgent(agentDid, (client, token) => client.adminChanges(token, before))
  }

  // ---- attachments (UI-MEDIA-001/003/004) -------------------------------------------------------------------

  public async upload(
    sessionId: string,
    file: Blob,
    filename: string,
    /** what the recorder measured of a voice note (PROF-HIST-009) */
    measures?: VoiceMeasures
  ): Promise<{ attachmentId: string; textRepr?: string }> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session) throw new Error('session not found')
    const agent = this.snapshot.agents.find((a) => a.did === session.agentDid)
    const uploads = agent?.descriptor.features.uploads
    if (uploads && file.size > uploads.maxBytes) throw new Error('too-large')
    const { client, token } = this.clientOf(session)
    const result = await client.upload(sessionId, token, file, filename, measures)
    return { attachmentId: result.attachmentId, textRepr: (result as { textRepr?: string }).textRepr }
  }

  public async attachmentBlob(sessionId: string, attachmentId: string): Promise<Blob> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session) throw new Error('session not found')
    const { client, token } = this.clientOf(session)
    return client.attachment(sessionId, token, attachmentId)
  }

  // ---- preferences ---------------------------------------------------------------------------------------

  public async setPreferences(patch: Partial<Preferences>): Promise<void> {
    const prefs = { ...this.snapshot.prefs, ...patch }
    await this.store.putPreferences(prefs)
    this.set({ prefs })
    this.bus?.post({ kind: 'changed', what: 'preferences' })
  }
}

/**
 * The answer of a run on a conversation of a space the person left (PROF-RUN-014): `space-left`, as the profile names
 * it and as the agent branch answers it (checked against it on 2026-11-19).
 */
const SPACE_LEFT = new Set(['space-left'])

/** The space and the share the agent's list gives a conversation (PROF-CONV-010); what it does not say is kept. */
function spaceFieldsOf(listed: unknown, record?: SessionRecord): Pick<SessionRecord, 'spaceId' | 'shared'> {
  const c = listed as { spaceId?: unknown; shared?: unknown }
  const spaceId = typeof c.spaceId === 'string' ? c.spaceId : record?.spaceId
  const shared = typeof c.shared === 'boolean' ? c.shared : record?.shared
  return { ...(spaceId ? { spaceId } : {}), ...(shared !== undefined ? { shared } : {}) }
}

/**
 * The agent refuses the token itself (profile §9, UI-SESS-019): the session is closed or superseded (410), the token
 * is unknown (401), or it is another session's (404). Such a token is never sent again.
 */
/** A link that waits for the phone, or whose session closed before the phone linked it (UI-BIND-013). */
function awaitsLink(s: SessionRecord): boolean {
  return s.state === 'provisional' || (s.state === 'closed' && !s.principal && !s.archived)
}

/** Binding material the phone can still use: shown and not expired (UI-BIND-006). */
function bindingLive(binding: SessionRecord['binding']): boolean {
  return !!binding && Date.parse(binding.expiresAt) > Date.now()
}

function refusesToken(e: unknown): e is ProfileError {
  return e instanceof ProfileError && (e.status === 401 || e.status === 404 || e.status === 410)
}

type PrincipalShown = NonNullable<SessionRecord['principal']>

/** Whether two bindings show the same Principal, as far as the agent shows one (its name and its backing identity). */
function samePrincipal(a: PrincipalShown, b: PrincipalShown): boolean {
  return (
    a.displayName === b.displayName &&
    a.backingIdentity?.kind === b.backingIdentity?.kind &&
    a.backingIdentity?.name === b.backingIdentity?.name
  )
}

/** A failure out of the person's sight is said, never swallowed (UI-SESS-019): a list the agent refused, say. */
function warn(message: string, error: unknown): void {
  // biome-ignore lint/suspicious/noConsole: the hub's one log line, for failures the person is not shown
  console.warn(`[ayni-ui] ${message}`, error)
}

/** What a new session continues: a local session, the agent's conversation, and text to send once bound. */
export interface ResumeTarget {
  sessionId?: string
  conversationId?: string
  text?: string
}

type LocalAction =
  /**
   * `decision`: an answer on a confirmation card, sent while the turn waits for it (PROF-TOOL-008), or the requester's
   * withdrawal of an approval (PROF-TOOL-026): neither starts a turn
   */
  | { type: 'run'; text?: string; action?: AyniAction; replyTo?: ReplyQuote; decision?: boolean }
  /** `runId`: the run the person saw in progress when they pressed Stop */
  | { type: 'cancel'; runId?: string }

export function platformDescription(): string {
  const ua = navigator.userAgent
  const browser = /Firefox\//.test(ua)
    ? 'Firefox'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Mac/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'web'
  return `${browser} on ${os}`
}

let audioContext: AudioContext | undefined
function playPing(): void {
  try {
    audioContext ??= new AudioContext()
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.05
    osc.connect(gain).connect(audioContext.destination)
    osc.start()
    osc.stop(audioContext.currentTime + 0.12)
  } catch {
    // no audio
  }
}
