/** Local data model (hologram-ui architecture section 12). Nothing here is authoritative except the token. */
import type {
  AgentDescriptor,
  ClosureReason,
  HologramState,
  PrincipalDisplay,
  SessionState,
} from '@2060.io/hologram-agui-profile'

export type TrustStatus = 'trusted' | 'untrusted' | 'unverified'

export interface TrustSummary {
  result: TrustStatus
  checkedAt: string
  did: string
  serviceName?: string
  serviceType?: string
  description?: string
  logoUri?: string
  operator?: { kind: string; name: string; countryCode?: string; registryId?: string; logoUri?: string }
  ecosystems?: { id: number; name?: string }[]
  reasons: string[]
}

export interface AgentRecord {
  did: string
  descriptorUrl: string
  descriptor: AgentDescriptor
  name: string
  logoRef?: string
  trust: TrustSummary
  pinned: boolean
  pinOrder: number
  addedAt: string
  /** most recent message in any conversation (rail order, UI-SHELL-011) */
  lastMessageAt: string
  trustAcknowledged?: boolean
  /** opaque handle the agent gave this browser profile at binding: later sessions ask the phone to re-link */
  deviceHandle?: string
}

export interface SessionRecord {
  sessionId: string
  agentDid: string
  sessionToken: string | null
  title: string
  createdAt: string
  parentSessionId?: string
  state: SessionState
  closedReason?: ClosureReason
  binding?: { oobUrl: string; walletLink: string; bindingCode: string; expiresAt: string }
  principal?: PrincipalDisplay
  lastEventId: number
  unreadCount: number
  lastPreview: string
  lastMessageAt: string
  draft: string
  hologram: HologramState | null
  idleTimeoutSeconds?: number
  /** the agent asked the phone to re-link this provisional session */
  rebindAsked?: boolean
  deviceHandle?: string
  /** the closed session this one resumes */
  resumedFromSessionId?: string
  /** text to send as soon as the session binds (written on a closed conversation to wake it up) */
  pendingText?: string
}

export type TranscriptMessage =
  | {
      id: string
      role: 'user' | 'assistant' | 'system'
      content: string
      at: string
      streaming?: boolean
      interrupted?: boolean
      entryId?: string
    }
  | {
      id: string
      role: 'activity'
      activityType: string
      content: Record<string, unknown>
      at: string
      entryId?: string
    }

export interface RunProgress {
  runId: string
  steps: string[]
}

export interface Transcript {
  sessionId: string
  messages: TranscriptMessage[]
  oldestLoadedId: string | null
  complete: boolean
  /** the run in progress, if any (one at a time per session, UI-CONV-003) */
  run: RunProgress | null
  routed: Record<string, { kind: string; challengeType?: string; status: string; message?: string; at: string }>
  reactions: Record<string, { emoji: string; by: string }[]>
}

export interface Preferences {
  locale?: string
  theme: 'system' | 'light' | 'dark'
  sounds: boolean
}

export interface RuntimeConfig {
  publicUrl: string
  defaultAgent?: string
  singleAgent: boolean
  trustPolicy: 'refuse' | 'warn'
  trustRecheckIntervalSeconds: number
  veranaIndexerUrl: string
  veranaGraphUrl: string
  didResolverUrl?: string
  allowedAgentOrigins: string[]
  brandConfigUrl?: string
  locales: string[]
  defaultLocale?: string
  soundsEnabled: boolean
  installPromptEnabled: boolean
}

export interface BrandConfig {
  appName: string
  logo?: string
  colors?: { light?: Record<string, string>; dark?: Record<string, string> }
  links?: { terms?: string; privacy?: string; support?: string }
  defaultLocale?: string
}
