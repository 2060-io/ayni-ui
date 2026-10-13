/**
 * Tabs mirror (D6, UI-SHELL-005/007/008): a broadcast channel per browser profile and one leader per
 * session elected with the Web Locks API; mirrors send actions to the leader.
 */
export type SyncMessage =
  | { kind: 'changed'; what: 'agents' | 'sessions' | 'preferences'; id?: string }
  | { kind: 'transcript'; sessionId: string }
  | { kind: 'action'; sessionId: string; action: unknown; actionId: string }
  | { kind: 'action-ack'; actionId: string; ok: boolean; error?: string }
  | { kind: 'leader'; sessionId: string; tabId: string }

export interface SyncBus {
  tabId: string
  post(message: SyncMessage): void
  subscribe(handler: (message: SyncMessage) => void): () => void
  /** Holds the session lock while `run` lasts; resolves false at once when another tab leads. */
  tryLead(sessionId: string, run: (release: () => void) => Promise<void>): Promise<boolean>
  close(): void
}

export class BroadcastSyncBus implements SyncBus {
  public readonly tabId = crypto.randomUUID()
  private readonly channel: BroadcastChannel
  private readonly handlers = new Set<(m: SyncMessage) => void>()

  public constructor(deviceId: string) {
    this.channel = new BroadcastChannel(`hologram-ui:${deviceId}`)
    this.channel.onmessage = (ev: MessageEvent<SyncMessage>) => {
      for (const h of this.handlers) h(ev.data)
    }
  }
  public post(message: SyncMessage): void {
    this.channel.postMessage(message)
  }
  public subscribe(handler: (m: SyncMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
  public async tryLead(sessionId: string, run: (release: () => void) => Promise<void>): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
      await run(() => undefined)
      return true
    }
    let acquired = false
    await navigator.locks.request(`hologram-ui:session:${sessionId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return
      acquired = true
      this.post({ kind: 'leader', sessionId, tabId: this.tabId })
      await new Promise<void>((resolve) => {
        run(resolve).finally(resolve)
      })
    })
    return acquired
  }
  public close(): void {
    this.channel.close()
  }
}

/** A bus for tests and single-tab hosts. */
export class LocalSyncBus implements SyncBus {
  public readonly tabId = 'local'
  private readonly handlers = new Set<(m: SyncMessage) => void>()
  public post(message: SyncMessage): void {
    for (const h of this.handlers) h(message)
  }
  public subscribe(handler: (m: SyncMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
  public async tryLead(_sessionId: string, run: (release: () => void) => Promise<void>): Promise<boolean> {
    await run(() => undefined)
    return true
  }
  public close(): void {}
}
