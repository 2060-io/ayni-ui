/** Local data model (ayni-ui architecture section 12). Nothing here is authoritative except the token. */
import type {
  AgentDescriptor,
  AyniState,
  ClosureReason,
  PrincipalDisplay,
  SessionState,
} from '@ayni.org/ayni-agui-profile'

export type TrustStatus = 'trusted' | 'untrusted' | 'unverified'

export interface TrustSummary {
  result: TrustStatus
  checkedAt: string
  did: string
  serviceName?: string
  serviceType?: string
  description?: string
  logoUri?: string
  /** from the ECS Service credential: terms and privacy policy URLs; `read` marks a summary that looked at the Uri fields */
  links?: { terms?: string; privacy?: string; read?: boolean }
  operator?: {
    kind: string
    name: string
    /** the ECS credential subject: the controller's DID (D32) */
    did?: string
    countryCode?: string
    registryId?: string
    logoUri?: string
  }
  ecosystems?: { id: number; name?: string }[]
  reasons: string[]
}

/** The organization or persona behind one or more agents (D32); an unverified agent stands alone. */
export interface ControllerRecord {
  did: string
  kind: 'organization' | 'persona' | 'unverified'
  name: string
  logoRef?: string
  /** ISO 3166-1 alpha-2 from the ECS credential, for the flag */
  countryCode?: string
  pinned: boolean
  pinOrder: number
}

export interface AgentRecord {
  did: string
  descriptorUrl: string
  descriptor: AgentDescriptor
  name: string
  logoRef?: string
  trust: TrustSummary
  /** the controller tile this agent files under (D32); derived from the trust result */
  controllerDid?: string
  /** @deprecated pinning applies to controllers since D32; kept for records written before */
  pinned: boolean
  /** @deprecated see pinned */
  pinOrder: number
  addedAt: string
  /** most recent message in any conversation (rail order, UI-SHELL-011) */
  lastMessageAt: string
  trustAcknowledged?: boolean
  /** opaque handle the agent gave this browser profile at binding: later sessions ask the phone to re-link */
  deviceHandle?: string
  /** pairing secret from the agent (D30): sent as deviceProof, replaced by every rotation, never leaves the device store */
  deviceSecret?: string
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
  ayni: AyniState | null
  idleTimeoutSeconds?: number
  /** the agent asked the phone to re-link this provisional session */
  rebindAsked?: boolean
  deviceHandle?: string
  /** a device secret the agent handed with this session, moved to the agent record once seen */
  deviceSecret?: string
  /** the closed session this one resumes */
  resumedFromSessionId?: string
  /** the agent's conversation this record serves (D31); a record with no token and this id is a listed conversation not yet opened here */
  conversationId?: string
  /** mirrored from the agent's conversation state (D31) */
  archived?: boolean
  /** text to send as soon as the session binds (written on a closed conversation to wake it up) */
  pendingText?: string
}

export interface ReplyQuote {
  id: string
  text: string
  role: 'user' | 'assistant'
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
      /** the message this one answers (UI-CONV-018) */
      replyTo?: ReplyQuote
      /** step labels the agent reported while producing this reply (UI-CONV-019) */
      steps?: string[]
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
  /** steps in progress */
  steps: string[]
  /** every step label reported during the run, in order */
  log: string[]
}

export interface Transcript {
  sessionId: string
  messages: TranscriptMessage[]
  oldestLoadedId: string | null
  complete: boolean
  /** the run in progress, if any (one at a time per session, UI-CONV-003) */
  run: RunProgress | null
  /** trust-bound events being served on the phone (UI-CAP-001); `flowId` when served as a flow (PROF-MAP-007) */
  routed: Record<
    string,
    { kind: string; challengeType?: string; status: string; message?: string; at: string; flowId?: string }
  >
  /** current reactions per message, one per person (UI-CONV-011) */
  reactions: Record<string, { emoji: string; by: string }[]>
}

export interface Preferences {
  locale?: string
  theme: 'system' | 'light' | 'dark'
  sounds: boolean
  /** the right panel is shown (UI-SHELL-014); default true */
  detailsOpen?: boolean
  /** emojis picked recently, newest first (UI-CONV-017) */
  recentEmojis?: string[]
  /** width of the conversation column in px, set by dragging the splitter (D32) */
  columnWidth?: number
  /** accent colour chosen by the person (hex), overriding the brand's (UI-THEME-003) */
  accent?: string
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
  /** the mark alone, transparent background, for the rail (UI-THEME-004); falls back to logo */
  mark?: string
  colors?: { light?: Record<string, string>; dark?: Record<string, string> }
  links?: { terms?: string; privacy?: string; support?: string }
  defaultLocale?: string
}
