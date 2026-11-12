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
  type BrandConfig,
  BroadcastSyncBus,
  type ControllerRecord,
  clientDescription,
  addAgent as coreAddAgent,
  countOccurrences,
  type DeviceStore,
  emptyTranscript,
  excerpt,
  fileUnderController,
  hasIssuedCredential,
  IndexedDbStore,
  isAppLink,
  mergeHistory,
  type Preferences,
  ProfileClient,
  ProfileError,
  parseAppLink,
  type ReplyQuote,
  type RuntimeConfig,
  readCatchUp,
  recheckTrust,
  reduce,
  refreshDescriptor,
  type SessionRecord,
  type SyncBus,
  type SyncMessage,
  type Transcript,
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
}

type Listener = () => void

export class Hub {
  private snapshot: Snapshot
  private readonly listeners = new Set<Listener>()
  private store: DeviceStore = new IndexedDbStore()
  private bus: SyncBus | null = null
  private readonly streams = new Map<string, AbortController>()
  private readonly runs = new Map<string, { runId: string; controller: AbortController }>()
  private readonly clients = new Map<string, ProfileClient>()
  private readonly pendingActions = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()
  private visible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true

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
    for (const s of this.snapshot.sessions.filter((x) => x.agentDid === did))
      await this.closeConversation(s.sessionId, true)
    await this.store.deleteAgent(did)
    await this.reload()
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
  private async open(agentDid: string, resume?: ResumeTarget, fresh = false, quiet = false): Promise<SessionRecord> {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    if (!agent) throw new Error('agent not found')
    if (!this.canConnect(agent)) throw new Error('agent is not trusted')
    const shownId = this.snapshot.selectedSessionId
    const shown = this.snapshot.sessions.find((s) => s.sessionId === shownId)
    const { session, reused } = await this.withOpening(agentDid, () => this.openNow(agentDid, resume, fresh, quiet))
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
        await this.syncConversations(agentDid).catch(() => undefined)
      }
      if (resume?.text) await this.send(session.sessionId, resume.text)
    }
    return session
  }

  /**
   * Under the agent's opening lock. A conversation already open here is reused (UI-SESS-014); with a
   * session bound the new one is its sibling and carries no proof; otherwise the device proof binds it
   * silently on a paired device (UI-BIND-011), and a rejected or missing proof leaves it provisional,
   * for the binding screen.
   */
  private async openNow(
    agentDid: string,
    resume: ResumeTarget | undefined,
    fresh: boolean,
    quiet = false
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
    const bound = this.snapshot.sessions.find((s) => s.agentDid === agentDid && s.state === 'bound' && s.sessionToken)
    const locale = this.snapshot.prefs.locale ?? navigator.language
    const old = this.previousRecord(resume)
    const now = new Date().toISOString()
    let session: SessionRecord
    if (bound) {
      const { client, token } = this.clientOf(bound)
      const created = await client.create(
        clientDescription(agent.descriptor.profileVersion, platformDescription()),
        locale,
        token,
        undefined,
        resume?.sessionId,
        undefined,
        resume?.conversationId,
        fresh
      )
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
          clientDescription(agent.descriptor.profileVersion, platformDescription()),
          locale,
          undefined,
          agent.deviceHandle,
          resume?.sessionId,
          agent.deviceSecret,
          resume?.conversationId,
          fresh,
          // a refresh the person did not ask for binds with the proof or not at all: the phone is asked nothing
          quiet
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
      }
    }
    if (old) {
      // the session continues a conversation the list already shows: it keeps its title, its preview and its
      // place, where a new record read as written in just now (UI-SESS-016)
      session.title = old.title
      session.archived = old.archived
      session.lastPreview = old.lastPreview
      session.lastMessageAt = old.lastMessageAt
    }
    await this.store.putSession(session)
    await this.serial(async () => this.store.putTranscript(await this.inheritTranscript(session, old)))
    if (session.conversationId) await this.collapseConversations(agentDid, session.sessionId)
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
    // a session the agent closed while this tab was away still reads as bound here: asking through it says so
    for (const s of this.snapshot.sessions.filter(
      (x) => x.agentDid === agentDid && x.state === 'bound' && x.sessionToken
    )) {
      try {
        await this.syncConversations(agentDid)
        break
      } catch (e) {
        if (!(e instanceof ProfileError && e.status === 410)) throw e
        const current = await this.store.getSession(s.sessionId)
        if (current)
          await this.saveSession({
            ...current,
            state: 'closed',
            closedReason: (e.reason as SessionRecord['closedReason']) ?? current.closedReason ?? 'agent',
            sessionToken: null,
            binding: undefined,
          })
      }
    }
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
   * sessions ask for it at once, and a record one call drops must not be written back by another.
   */
  public syncConversations(agentDid: string): Promise<void> {
    const next = this.syncing.then(() => this.syncConversationsNow(agentDid))
    this.syncing = next.catch(() => undefined)
    return next
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

  private async syncConversationsNow(agentDid: string): Promise<void> {
    const bound = this.snapshot.sessions.find((s) => s.agentDid === agentDid && s.state === 'bound' && s.sessionToken)
    if (!bound) return
    const { client, token } = this.clientOf(bound)
    const { conversations } = await client.conversations(token)
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
        lastPreview: c.lastPreview ?? s.lastPreview,
        lastMessageAt: c.lastActivityAt > s.lastMessageAt ? c.lastActivityAt : s.lastMessageAt,
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
        unreadCount: 0,
        lastPreview: c.lastPreview ?? '',
        lastMessageAt: c.lastActivityAt,
        draft: '',
        ayni: null,
        conversationId: c.id,
        archived: c.state === 'archived',
      })
    }
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'sessions' })
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
    const bound = this.snapshot.sessions.find((s) => s.agentDid === agentDid && s.state === 'bound' && s.sessionToken)
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
    void this.syncConversations(session.agentDid).catch(() => undefined)
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
    void this.syncConversations(session.agentDid).catch(() => undefined)
  }

  /** Whether an action on the agent can go through without the phone: a bound session, or a paired device. */
  private canAskAgent(agentDid: string): boolean {
    if (this.snapshot.sessions.some((s) => s.agentDid === agentDid && s.state === 'bound' && s.sessionToken))
      return true
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    return !!agent?.deviceHandle && !!agent.deviceSecret
  }

  /**
   * Disconnect from an agent (UI-AGENTS-006): revokes the pairing with the device proof, closes the
   * agent's conversations and clears their local data; the agent stays listed, unpaired.
   */
  public async disconnectAgent(did: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    if (!agent) return
    if (agent.deviceHandle && agent.deviceSecret)
      await this.client(agent)
        .revokeDevice(agent.deviceHandle, { deviceProof: agent.deviceSecret })
        .catch(() => undefined)
    await this.endAllConversations(did)
    const current = this.snapshot.agents.find((a) => a.did === did)
    if (current)
      await this.store.putAgent({ ...current, deviceHandle: undefined, deviceSecret: undefined, linkedAt: undefined })
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'agents' })
  }

  /** The paired browsers of this Principal with the agent (PROF-SESS-011). */
  public async listDevices(did: string) {
    const bound = this.snapshot.sessions.find((s) => s.agentDid === did && s.state === 'bound' && s.sessionToken)
    if (!bound) return []
    const { client, token } = this.clientOf(bound)
    return (await client.devices(token)).devices
  }

  public async unlinkDevice(did: string, handle: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    if (agent?.deviceHandle === handle) return this.disconnectAgent(did)
    const bound = this.snapshot.sessions.find((s) => s.agentDid === did && s.state === 'bound' && s.sessionToken)
    if (!bound) throw new Error('no bound conversation')
    const { client, token } = this.clientOf(bound)
    await client.revokeDevice(handle, { token })
  }

  /** A new or resumed conversation of the agent (UI-SESS-001/013), through the agent's opening lock. */
  public async newConversation(agentDid: string, resume?: ResumeTarget): Promise<SessionRecord> {
    const fresh = !resume?.sessionId && !resume?.conversationId
    return this.open(agentDid, resume, fresh)
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
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (session && session.draft !== draft) await this.saveSession({ ...session, draft }, false)
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
    this.runs.get(sessionId)?.controller.abort()
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
        // every time the stream attaches: what another device added to the conversation meanwhile, and what the
        // agent's stream can no longer replay (UI-CONV-022, PROF-HIST-007)
        if (status.state === 'bound') await this.catchUp(sessionId).catch(() => undefined)
        if (status.state === 'bound') void this.syncConversations(session.agentDid).catch(() => undefined)
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
          await this.syncConversations(next.agentDid).catch(() => undefined)
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
      const onScreen = this.visible && this.snapshot.selectedSessionId === sessionId && this.snapshot.view !== 'list'
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
        void this.syncConversations(next.agentDid).catch(() => undefined)
      }
      if (signals.includes('closed')) this.stopLeading(sessionId)
      // a conversation was renamed, archived or closed from another device: the column follows (UI-SESS-015)
      if (signals.includes('conversations')) void this.syncConversations(next.agentDid).catch(() => undefined)
      if (signals.includes('identified')) await this.markIdentified(next.agentDid)
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
      const merged = await readCatchUp(transcript, async (before) => {
        const page = await client.history(sessionId, token, before, 50)
        return { messages: page.messages as Record<string, unknown>[], nextBefore: page.nextBefore }
      })
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
    const page = await client.history(sessionId, token, before, 50)
    const transcript = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
    const merged = mergeHistory(transcript, page.messages as Record<string, unknown>[], page.nextBefore)
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
    // nothing of ours running here: clear the indicator at once rather than waiting for a leader to answer
    if (!this.runs.has(sessionId) && !this.snapshot.leaders[sessionId]) await this.clearStaleRun(sessionId)
    await this.dispatch(sessionId, { type: 'cancel' })
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
      const run = this.runs.get(sessionId)
      // no run of ours behind the indicator: a run left over from a closed tab, cleared here (UI-CONV-003)
      if (!run) return this.clearStaleRun(sessionId)
      const { client, token } = this.clientOf(session)
      await client.cancel(sessionId, token, run.runId).catch(() => undefined)
      run.controller.abort()
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
    // a lock left by a run stream that never closed must not block the person once its finish event landed
    const stale = this.runs.get(sessionId)
    if (stale && !this.snapshot.transcripts[sessionId]?.run) {
      stale.controller.abort()
      this.runs.delete(sessionId)
    }
    if (this.runs.has(sessionId)) throw new Error('a run is in progress')
    this.runs.set(sessionId, { runId, controller })
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
        }
        const next = {
          ...transcript,
          messages: [...transcript.messages, userMessage],
          run: { runId, steps: [], log: [] },
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
      await client.run(
        sessionId,
        token,
        { runId, text: action.text, action: action.action },
        (event) => void this.onEvent(sessionId, event, undefined, true),
        controller.signal
      )
    } catch (e) {
      if (e instanceof ProfileError && e.status === 410) {
        await this.saveSession({
          ...session,
          state: 'closed',
          closedReason: (e.reason as SessionRecord['closedReason']) ?? 'agent',
          sessionToken: null,
        })
      } else if (!controller.signal.aborted) throw e
    } finally {
      this.runs.delete(sessionId)
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

  // ---- attachments (UI-MEDIA-001/003/004) -------------------------------------------------------------------

  public async upload(
    sessionId: string,
    file: Blob,
    filename: string
  ): Promise<{ attachmentId: string; textRepr?: string }> {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    if (!session) throw new Error('session not found')
    const agent = this.snapshot.agents.find((a) => a.did === session.agentDid)
    const uploads = agent?.descriptor.features.uploads
    if (uploads && file.size > uploads.maxBytes) throw new Error('too-large')
    const { client, token } = this.clientOf(session)
    const result = await client.upload(sessionId, token, file, filename)
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

/** What a new session continues: a local session, the agent's conversation, and text to send once bound. */
export interface ResumeTarget {
  sessionId?: string
  conversationId?: string
  text?: string
}

type LocalAction = { type: 'run'; text?: string; action?: AyniAction; replyTo?: ReplyQuote } | { type: 'cancel' }

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
