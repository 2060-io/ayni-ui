export * from './agents.js'
export * from './directory.js'
export * from './profileClient.js'
export * from './reducer.js'
export * from './sse.js'
export * from './store.js'
export * from './sync.js'
export * from './trust.js'
export * from './types.js'

export const CLIENT = { name: 'hologram-ui', version: '3.0.0' } as const

export const CLOSURE_REASON_KEYS: Record<string, string> = {
  user: 'closure.user',
  supersede: 'closure.supersede',
  'channel-closed': 'closure.channelClosed',
  'credential-invalid': 'closure.credentialInvalid',
  'idle-timeout': 'closure.idleTimeout',
  expired: 'closure.expired',
  agent: 'closure.agent',
}

/** Rail order (UI-SHELL-011): pinned in the person's order, then by most recent message, then not linked. */
export function orderAgents<T extends { pinned: boolean; pinOrder: number; lastMessageAt: string; did: string }>(
  agents: T[],
  linked: (a: T) => boolean
): T[] {
  const pinned = agents.filter((a) => a.pinned).sort((a, b) => a.pinOrder - b.pinOrder)
  const rest = agents.filter((a) => !a.pinned)
  const active = rest.filter(linked).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  const inactive = rest.filter((a) => !linked(a)).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  return [...pinned, ...active, ...inactive]
}
