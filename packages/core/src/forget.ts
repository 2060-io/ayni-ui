/**
 * What a device forgets of the person for one agent when the person disconnects from it (UI-AGENTS-006) or removes it
 * (UI-AGENTS-005): everything it read from the agent for the person, not only the conversations. The agent's spaces
 * and templates with their counts, whether it gave the person its admin view or spaces to steward, the person's own
 * accounts with it, its Notifications count, the changes of tools and of accounts it announced, and the pages of these
 * that are open; with the conversations' transcripts, the messages being answered or pushed into a form, the searches,
 * the message inspected and what is being sent. Pairing again as the same Principal reads all of it again from the
 * agent. The rules are here so the browser and the Ayni app forget the same things.
 */

type ByAgent<V> = Record<string, V | undefined>
type BySession = Record<string, unknown>

/** The pages of an agent that close when it is forgotten: each names the agent it shows. */
export const AGENT_PAGES = ['space', 'keeps', 'admin', 'steward', 'shared', 'accounts', 'notifications'] as const

/** What a screen holds of the person, per agent and per conversation, in the shape the browser's state keeps it. */
export interface HeldOfPerson {
  view: string
  /** per agent: the person's spaces and templates (PROF-SPACE-001), with their Notifications counts */
  spaces: ByAgent<unknown>
  /** per agent: whether its admin view answers the person (UI-CONV-042) */
  admins: ByAgent<boolean>
  /** per agent: whether the person stewards a space of it (UI-CONV-068) */
  stewards: ByAgent<boolean>
  /** per agent: the person's own accounts (PROF-TOOL-014) */
  connections: ByAgent<unknown>
  /** per agent: how many of its Notifications wait for the person (PROF-TOOL-025) */
  agentNotifications: ByAgent<number>
  /** the changes of spaces' tools the agent announced (UI-CONV-050) */
  toolChanges: readonly { agentDid: string }[]
  /** the changes of the person's own accounts the agent announced (UI-CONV-053) */
  connectionChanges: readonly { agentDid: string }[]
  spaceFor: { agentDid: string } | null
  keepsFor: string | null
  adminFor: string | null
  stewardFor: { agentDid: string } | null
  sharedFor: { agentDid: string } | null
  memoryFor: { agentDid: string } | null
  accountsFor: { agentDid: string } | null
  notificationsFor: { agentDid: string } | null
  /** per conversation: its transcript, and what a screen holds of it */
  transcripts: BySession
  pending: BySession
  replyTo: BySession
  prefill: BySession
  loadingOlder: BySession
  search: BySession
  leaders: BySession
  inspect: { sessionId: string } | null
  selectedSessionId: string | null
}

const without = <T extends Record<string, unknown>>(record: T, keys: readonly string[]): T => {
  if (!keys.some((k) => k in record)) return record
  const next = { ...record }
  for (const k of keys) delete next[k]
  return next
}

const ofAgent = (page: { agentDid: string } | string | null, agentDid: string) =>
  page !== null && (typeof page === 'string' ? page === agentDid : page.agentDid === agentDid)

/**
 * The state with nothing left of the person for `agentDid`: its per-agent data, the changes it announced, its open
 * pages, and what is held of its conversations `sessionIds`. A page of the agent that is open, or one of its
 * conversations, gives way to the list.
 */
export function withAgentForgotten<S extends HeldOfPerson>(
  held: S,
  agentDid: string,
  sessionIds: readonly string[]
): Pick<S, keyof HeldOfPerson> {
  const sessions = new Set(sessionIds)
  const pages = {
    spaceFor: held.spaceFor,
    keepsFor: held.keepsFor,
    adminFor: held.adminFor,
    stewardFor: held.stewardFor,
    sharedFor: held.sharedFor,
    memoryFor: held.memoryFor,
    accountsFor: held.accountsFor,
    notificationsFor: held.notificationsFor,
  }
  const pageOf: Record<(typeof AGENT_PAGES)[number], keyof typeof pages> = {
    space: 'spaceFor',
    keeps: 'keepsFor',
    admin: 'adminFor',
    steward: 'stewardFor',
    shared: 'sharedFor',
    accounts: 'accountsFor',
    notifications: 'notificationsFor',
  }
  const page = pageOf[held.view as (typeof AGENT_PAGES)[number]]
  const onPage = page !== undefined && ofAgent(pages[page], agentDid)
  const inConversation =
    held.view === 'conversation' && !!held.selectedSessionId && sessions.has(held.selectedSessionId)
  const keep = <P extends { agentDid: string } | string | null>(p: P): P | null => (ofAgent(p, agentDid) ? null : p)
  return {
    view: onPage || inConversation ? 'list' : held.view,
    spaces: without(held.spaces, [agentDid]),
    admins: without(held.admins, [agentDid]),
    stewards: without(held.stewards, [agentDid]),
    connections: without(held.connections, [agentDid]),
    agentNotifications: without(held.agentNotifications, [agentDid]),
    toolChanges: held.toolChanges.filter((c) => c.agentDid !== agentDid),
    connectionChanges: held.connectionChanges.filter((c) => c.agentDid !== agentDid),
    spaceFor: keep(held.spaceFor),
    keepsFor: keep(held.keepsFor),
    adminFor: keep(held.adminFor),
    stewardFor: keep(held.stewardFor),
    sharedFor: keep(held.sharedFor),
    memoryFor: keep(held.memoryFor),
    accountsFor: keep(held.accountsFor),
    notificationsFor: keep(held.notificationsFor),
    transcripts: without(held.transcripts, sessionIds),
    pending: without(held.pending, sessionIds),
    replyTo: without(held.replyTo, sessionIds),
    prefill: without(held.prefill, sessionIds),
    loadingOlder: without(held.loadingOlder, sessionIds),
    search: without(held.search, sessionIds),
    leaders: without(held.leaders, sessionIds),
    inspect: held.inspect && sessions.has(held.inspect.sessionId) ? null : held.inspect,
    selectedSessionId: held.selectedSessionId && sessions.has(held.selectedSessionId) ? null : held.selectedSessionId,
  } as Pick<S, keyof HeldOfPerson>
}
