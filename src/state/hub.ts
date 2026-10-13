/**
 * The application hub: owns the device store, the tab sync bus, the per-session leadership
 * (stream and runs), and the in-memory snapshot React renders from. Framework-independent core
 * underneath (UI-SHELL-004); this file is the shell's state.
 */
import { CUSTOM_EVENT, type HologramAction } from '@2060.io/hologram-agui-profile'
import {
  type AgentRecord,
  type AgUiEvent,
  type BrandConfig,
  BroadcastSyncBus,
  CLIENT,
  addAgent as coreAddAgent,
  type DeviceStore,
  emptyTranscript,
  IndexedDbStore,
  mergeHistory,
  type Preferences,
  ProfileClient,
  ProfileError,
  type RuntimeConfig,
  recheckTrust,
  reduce,
  type SessionRecord,
  type SyncBus,
  type SyncMessage,
  type Transcript,
} from '@2060.io/hologram-ui-core'
import { loadConfig } from './config.js'

export type View = 'list' | 'conversation' | 'directory' | 'add' | 'settings'

export interface Snapshot {
  ready: boolean
  config: RuntimeConfig
  brand: BrandConfig
  prefs: Preferences
  agents: AgentRecord[]
  sessions: SessionRecord[]
  transcripts: Record<string, Transcript>
  selectedAgentDid: string | null
  selectedSessionId: string | null
  view: View
  online: boolean
  leaders: Record<string, boolean>
  notice: { kind: 'info' | 'error'; text: string } | null
  pending: Record<string, string | undefined>
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
      sessions: [],
      transcripts: {},
      selectedAgentDid: null,
      selectedSessionId: null,
      view: 'list',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      leaders: {},
      notice: null,
      pending: {},
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
    })
    await this.reload()
    this.set({ ready: true, prefs: await this.store.getPreferences() })
    const first = this.snapshot.agents[0]
    if (this.snapshot.config.defaultAgent && this.snapshot.agents.length === 0) {
      void this.addAgent(this.snapshot.config.defaultAgent).catch((e) => this.notify('error', String(e.message ?? e)))
    } else if (first) this.selectAgent(first.did)
    const params = new URLSearchParams(location.search)
    if (params.get('agent') && !this.snapshot.config.singleAgent)
      void this.addAgent(params.get('agent') ?? '').catch((e) => this.notify('error', String(e.message ?? e)))
    for (const s of this.snapshot.sessions) if (s.state !== 'closed' && s.sessionToken) void this.lead(s.sessionId)
    setInterval(() => this.retryLeadership(), 5000)
    setInterval(() => this.recheckTrustAll(), this.snapshot.config.trustRecheckIntervalSeconds * 1000)
  }

  public async reload(): Promise<void> {
    const [agents, sessions] = await Promise.all([this.store.listAgents(), this.store.listSessions()])
    this.set({ agents, sessions })
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
    const sessions = this.snapshot.sessions
      .filter((s) => s.agentDid === did)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    this.set({ selectedAgentDid: did, selectedSessionId: sessions[0]?.sessionId ?? null, view: 'list' })
  }

  public selectSession(sessionId: string | null): void {
    const session = this.snapshot.sessions.find((s) => s.sessionId === sessionId)
    this.set({
      selectedSessionId: sessionId,
      selectedAgentDid: session?.agentDid ?? this.snapshot.selectedAgentDid,
      view: sessionId ? 'conversation' : 'list',
    })
    if (sessionId) {
      void this.loadTranscript(sessionId)
      void this.markRead(sessionId)
    }
  }

  public setView(view: View): void {
    this.set({ view })
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
    for (const s of this.snapshot.sessions.filter((x) => x.agentDid === did))
      await this.closeConversation(s.sessionId, true)
    await this.store.deleteAgent(did)
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'agents' })
    if (this.snapshot.selectedAgentDid === did) this.selectAgent(this.snapshot.agents[0]?.did ?? null)
  }

  public async togglePin(did: string): Promise<void> {
    const agent = this.snapshot.agents.find((a) => a.did === did)
    if (!agent) return
    const maxOrder = Math.max(0, ...this.snapshot.agents.filter((a) => a.pinned).map((a) => a.pinOrder))
    await this.store.putAgent({ ...agent, pinned: !agent.pinned, pinOrder: agent.pinned ? 0 : maxOrder + 1 })
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

  /** Connect: a provisional session with binding material (UI-BIND-001). */
  public async connect(agentDid: string): Promise<SessionRecord> {
    const agent = this.snapshot.agents.find((a) => a.did === agentDid)
    if (!agent) throw new Error('agent not found')
    if (!this.canConnect(agent)) throw new Error('agent is not trusted')
    await recheckTrust(this.store, agent, this.snapshot.config.veranaIndexerUrl).catch(() => undefined)
    const created = await this.client(agent).create(
      { ...CLIENT, platform: platformDescription() },
      this.snapshot.prefs.locale ?? navigator.language
    )
    const session: SessionRecord = {
      sessionId: created.sessionId,
      agentDid,
      sessionToken: created.sessionToken,
      title: '',
      createdAt: new Date().toISOString(),
      state: created.state,
      binding: created.binding,
      principal: created.principal,
      lastEventId: 0,
      unreadCount: 0,
      lastPreview: '',
      lastMessageAt: new Date().toISOString(),
      draft: '',
      hologram: null,
      idleTimeoutSeconds: created.idleTimeoutSeconds,
    }
    await this.store.putSession(session)
    await this.store.putTranscript(emptyTranscript(session.sessionId))
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'sessions' })
    this.selectSession(session.sessionId)
    void this.lead(session.sessionId)
    return session
  }

  /** New conversation: a sibling when a bound one exists on this device, else the binding flow (UI-SESS-008). */
  public async newConversation(agentDid: string): Promise<SessionRecord> {
    const bound = this.snapshot.sessions.find((s) => s.agentDid === agentDid && s.state === 'bound' && s.sessionToken)
    if (!bound) return this.connect(agentDid)
    const { client, token } = this.clientOf(bound)
    const created = await client.create(
      { ...CLIENT, platform: platformDescription() },
      this.snapshot.prefs.locale ?? navigator.language,
      token
    )
    const session: SessionRecord = {
      sessionId: created.sessionId,
      agentDid,
      sessionToken: created.sessionToken,
      title: '',
      createdAt: new Date().toISOString(),
      parentSessionId: created.parentSessionId ?? bound.sessionId,
      state: 'bound',
      principal: created.principal ?? bound.principal,
      lastEventId: 0,
      unreadCount: 0,
      lastPreview: '',
      lastMessageAt: new Date().toISOString(),
      draft: '',
      hologram: null,
      idleTimeoutSeconds: created.idleTimeoutSeconds,
    }
    await this.store.putSession(session)
    await this.store.putTranscript(emptyTranscript(session.sessionId))
    await this.reload()
    this.bus?.post({ kind: 'changed', what: 'sessions' })
    this.selectSession(session.sessionId)
    void this.lead(session.sessionId)
    return session
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
    if (session) await this.saveSession({ ...session, title })
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

  private async lead(sessionId: string): Promise<void> {
    if (!this.bus || this.snapshot.leaders[sessionId] !== undefined) return
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
      try {
        const status = await client.status(sessionId, token)
        await this.saveSession({
          ...session,
          state: status.state,
          principal: status.principal ?? session.principal,
          binding: status.binding ?? (status.state === 'provisional' ? session.binding : undefined),
          closedReason: status.reason,
        })
        if (status.state === 'closed') return
        if (status.state === 'bound' && !(await this.store.getTranscript(sessionId))?.messages.length)
          await this.loadHistory(sessionId)
        const controller = new AbortController()
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

  private eventQueue = Promise.resolve()

  private onEvent(sessionId: string, event: AgUiEvent, id: number | undefined, fromRun: boolean): Promise<void> {
    this.eventQueue = this.eventQueue.then(async () => {
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
      if (signals.includes('bound') && !fromRun) await this.loadHistory(sessionId)
      if (signals.includes('closed')) this.stopLeading(sessionId)
      this.set({})
      this.updateTitle()
      this.bus?.post({ kind: 'transcript', sessionId })
      if (signals.length) this.bus?.post({ kind: 'changed', what: 'sessions', id: sessionId })
      if (event.type === 'CUSTOM' && event.name === CUSTOM_EVENT.sessionBound) await this.reload()
    })
    return this.eventQueue
  }

  public async loadTranscript(sessionId: string, force = false): Promise<Transcript> {
    if (!force && this.snapshot.transcripts[sessionId]) return this.snapshot.transcripts[sessionId]
    const t = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
    this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: t } })
    return t
  }

  public async loadHistory(sessionId: string, before?: string): Promise<void> {
    const session = await this.store.getSession(sessionId)
    if (session?.state !== 'bound') return
    const { client, token } = this.clientOf(session)
    const page = await client.history(sessionId, token, before, 50)
    const transcript = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
    const merged = mergeHistory(transcript, page.messages as Record<string, unknown>[], page.nextBefore)
    await this.store.putTranscript(merged)
    this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: merged } })
    this.bus?.post({ kind: 'transcript', sessionId })
  }

  public async loadOlder(sessionId: string): Promise<void> {
    const t = this.snapshot.transcripts[sessionId]
    if (!t || t.complete) return
    await this.loadHistory(sessionId, t.oldestLoadedId ?? t.messages[0]?.id)
  }

  // ---- turns and actions (UI-CONV-001/003/015, UI-APPR-*, UI-MEDIA-003) -------------------------------------

  public async send(sessionId: string, text: string, attachmentIds: string[] = []): Promise<void> {
    const action: HologramAction | undefined = attachmentIds.length ? { kind: 'attachments', attachmentIds } : undefined
    await this.dispatch(sessionId, { type: 'run', text, action })
  }

  public async act(sessionId: string, action: HologramAction, text?: string): Promise<void> {
    await this.dispatch(sessionId, { type: 'run', text, action })
  }

  public async stop(sessionId: string): Promise<void> {
    await this.dispatch(sessionId, { type: 'cancel' })
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
      if (!run) return
      const { client, token } = this.clientOf(session)
      await client.cancel(sessionId, token, run.runId).catch(() => undefined)
      run.controller.abort()
      return
    }
    if (session.state !== 'bound') throw new Error('session is not bound')
    if (this.runs.has(sessionId)) throw new Error('a run is in progress')
    if (!this.snapshot.online) throw new Error('offline')
    const { client, token } = this.clientOf(session)
    const runId = crypto.randomUUID()
    const controller = new AbortController()
    this.runs.set(sessionId, { runId, controller })
    if (action.text) {
      const transcript = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
      const userMessage = {
        id: `u_${runId}`,
        role: 'user' as const,
        content: action.text,
        at: new Date().toISOString(),
      }
      const next = { ...transcript, messages: [...transcript.messages, userMessage], run: { runId, steps: [] } }
      await this.store.putTranscript(next)
      const title = session.title || action.text.slice(0, 60)
      await this.store.putSession({
        ...session,
        draft: '',
        title,
        lastMessageAt: userMessage.at,
        lastPreview: action.text.slice(0, 120),
      })
      this.set({ transcripts: { ...this.snapshot.transcripts, [sessionId]: next } })
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
      const t = (await this.store.getTranscript(sessionId)) ?? emptyTranscript(sessionId)
      if (t.run?.runId === runId) {
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

type LocalAction = { type: 'run'; text?: string; action?: HologramAction } | { type: 'cancel' }

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
