/**
 * The device store (D14, UI-SHELL-006, UI-SESS-005): IndexedDB shared by every tab of the browser
 * profile. Tokens live here only; clearing site data is a complete reset (UI-SEC-003).
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { AgentRecord, ControllerRecord, Preferences, SessionRecord, Transcript } from './types.js'

interface Schema extends DBSchema {
  agents: { key: string; value: AgentRecord }
  controllers: { key: string; value: ControllerRecord }
  sessions: { key: string; value: SessionRecord; indexes: { byAgent: string } }
  transcripts: { key: string; value: Transcript }
  meta: { key: string; value: { key: string; value: unknown } }
}

export interface DeviceStore {
  deviceId(): Promise<string>
  listControllers(): Promise<ControllerRecord[]>
  getController(did: string): Promise<ControllerRecord | undefined>
  putController(controller: ControllerRecord): Promise<void>
  deleteController(did: string): Promise<void>
  listAgents(): Promise<AgentRecord[]>
  getAgent(did: string): Promise<AgentRecord | undefined>
  putAgent(agent: AgentRecord): Promise<void>
  deleteAgent(did: string): Promise<void>
  listSessions(agentDid?: string): Promise<SessionRecord[]>
  getSession(sessionId: string): Promise<SessionRecord | undefined>
  putSession(session: SessionRecord): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  getTranscript(sessionId: string): Promise<Transcript | undefined>
  putTranscript(transcript: Transcript): Promise<void>
  deleteTranscript(sessionId: string): Promise<void>
  getPreferences(): Promise<Preferences>
  putPreferences(prefs: Preferences): Promise<void>
}

const DEFAULT_PREFS: Preferences = { theme: 'system', sounds: true }

export class IndexedDbStore implements DeviceStore {
  private db?: Promise<IDBPDatabase<Schema>>

  private open(): Promise<IDBPDatabase<Schema>> {
    if (!this.db) {
      this.db = openDB<Schema>('ayni-ui', 2, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            db.createObjectStore('agents', { keyPath: 'did' })
            const sessions = db.createObjectStore('sessions', { keyPath: 'sessionId' })
            sessions.createIndex('byAgent', 'agentDid')
            db.createObjectStore('transcripts', { keyPath: 'sessionId' })
            db.createObjectStore('meta', { keyPath: 'key' })
          }
          if (oldVersion < 2) db.createObjectStore('controllers', { keyPath: 'did' })
        },
      })
    }
    return this.db
  }

  public async deviceId(): Promise<string> {
    const db = await this.open()
    const existing = await db.get('meta', 'deviceId')
    if (existing) return String(existing.value)
    const id = crypto.randomUUID()
    await db.put('meta', { key: 'deviceId', value: id })
    return id
  }
  public async listControllers() {
    return (await this.open()).getAll('controllers')
  }
  public async getController(did: string) {
    return (await this.open()).get('controllers', did)
  }
  public async putController(controller: ControllerRecord) {
    await (await this.open()).put('controllers', controller)
  }
  public async deleteController(did: string) {
    await (await this.open()).delete('controllers', did)
  }
  public async listAgents() {
    return (await this.open()).getAll('agents')
  }
  public async getAgent(did: string) {
    return (await this.open()).get('agents', did)
  }
  public async putAgent(agent: AgentRecord) {
    await (await this.open()).put('agents', agent)
  }
  public async deleteAgent(did: string) {
    await (await this.open()).delete('agents', did)
  }
  public async listSessions(agentDid?: string) {
    const db = await this.open()
    return agentDid ? db.getAllFromIndex('sessions', 'byAgent', agentDid) : db.getAll('sessions')
  }
  public async getSession(sessionId: string) {
    return (await this.open()).get('sessions', sessionId)
  }
  public async putSession(session: SessionRecord) {
    await (await this.open()).put('sessions', session)
  }
  public async deleteSession(sessionId: string) {
    await (await this.open()).delete('sessions', sessionId)
  }
  public async getTranscript(sessionId: string) {
    return (await this.open()).get('transcripts', sessionId)
  }
  public async putTranscript(transcript: Transcript) {
    await (await this.open()).put('transcripts', transcript)
  }
  public async deleteTranscript(sessionId: string) {
    await (await this.open()).delete('transcripts', sessionId)
  }
  public async getPreferences(): Promise<Preferences> {
    const row = await (await this.open()).get('meta', 'preferences')
    return { ...DEFAULT_PREFS, ...((row?.value as Partial<Preferences>) ?? {}) }
  }
  public async putPreferences(prefs: Preferences) {
    await (await this.open()).put('meta', { key: 'preferences', value: prefs })
  }
}

/** In-memory store for tests and non-browser hosts. */
export class MemoryDeviceStore implements DeviceStore {
  private agents = new Map<string, AgentRecord>()
  private controllers = new Map<string, ControllerRecord>()
  private sessions = new Map<string, SessionRecord>()
  private transcripts = new Map<string, Transcript>()
  private prefs: Preferences = DEFAULT_PREFS
  private id = crypto.randomUUID()
  public async deviceId() {
    return this.id
  }
  public async listControllers() {
    return [...this.controllers.values()].map((c) => structuredClone(c))
  }
  public async getController(did: string) {
    return structuredClone(this.controllers.get(did))
  }
  public async putController(controller: ControllerRecord) {
    this.controllers.set(controller.did, structuredClone(controller))
  }
  public async deleteController(did: string) {
    this.controllers.delete(did)
  }
  public async listAgents() {
    return [...this.agents.values()].map((a) => structuredClone(a))
  }
  public async getAgent(did: string) {
    return structuredClone(this.agents.get(did))
  }
  public async putAgent(agent: AgentRecord) {
    this.agents.set(agent.did, structuredClone(agent))
  }
  public async deleteAgent(did: string) {
    this.agents.delete(did)
  }
  public async listSessions(agentDid?: string) {
    return [...this.sessions.values()]
      .filter((s) => !agentDid || s.agentDid === agentDid)
      .map((s) => structuredClone(s))
  }
  public async getSession(sessionId: string) {
    return structuredClone(this.sessions.get(sessionId))
  }
  public async putSession(session: SessionRecord) {
    this.sessions.set(session.sessionId, structuredClone(session))
  }
  public async deleteSession(sessionId: string) {
    this.sessions.delete(sessionId)
  }
  public async getTranscript(sessionId: string) {
    return structuredClone(this.transcripts.get(sessionId))
  }
  public async putTranscript(transcript: Transcript) {
    this.transcripts.set(transcript.sessionId, structuredClone(transcript))
  }
  public async deleteTranscript(sessionId: string) {
    this.transcripts.delete(sessionId)
  }
  public async getPreferences() {
    return structuredClone(this.prefs)
  }
  public async putPreferences(prefs: Preferences) {
    this.prefs = structuredClone(prefs)
  }
}
