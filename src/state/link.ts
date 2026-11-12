/**
 * Whether this browser is linked to an agent (UI-AGENTS-007): it holds the device pairing the agent gave it, or a
 * session bound now. The sessions of a linked browser close when idle and the next action opens one silently
 * (UI-BIND-011), so a browser with no session open is still linked.
 */
import type { AgentRecord, SessionRecord } from '@ayni.org/ayni-ui-core'

export interface Link {
  linked: boolean
  /** when the link was made, when the browser knows */
  since?: string
}

export function linkOf(
  agent: Pick<AgentRecord, 'did' | 'deviceHandle' | 'deviceSecret' | 'linkedAt'>,
  sessions: readonly SessionRecord[]
): Link {
  const paired = !!agent.deviceHandle && !!agent.deviceSecret
  const bound = sessions
    .filter((s) => s.agentDid === agent.did && s.state === 'bound' && !!s.principal)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  if (!paired && !bound) return { linked: false }
  return { linked: true, since: agent.linkedAt ?? bound?.createdAt }
}
