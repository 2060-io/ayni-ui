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
export * from './search.js'

/**
 * The controller an agent files under (D32). An organization is keyed by its legal registry identity
 * (country and registry id from the ECS Organization credential), because the credential's subject
 * may be the service's own DID; a persona by its credential subject; an unverified agent by itself.
 */
export function controllerOf(agent: {
  did: string
  name: string
  logoRef?: string
  trust: {
    result: string
    operator?: { kind: string; name: string; did?: string; countryCode?: string; registryId?: string; logoUri?: string }
  }
}): {
  did: string
  kind: 'organization' | 'persona' | 'unverified'
  name: string
  logoRef?: string
  countryCode?: string
} {
  const op = agent.trust.operator
  if (agent.trust.result === 'trusted' && op) {
    const key =
      op.kind !== 'persona' && op.registryId
        ? `org:${(op.countryCode ?? '').toLowerCase()}:${op.registryId}`
        : op.did
          ? op.did
          : `${op.kind}:${op.name.trim().toLowerCase()}`
    return {
      did: key,
      kind: op.kind === 'persona' ? 'persona' : 'organization',
      name: op.name || agent.name,
      logoRef: op.logoUri,
      countryCode: op.countryCode?.toUpperCase(),
    }
  }
  return { did: agent.did, kind: 'unverified', name: agent.name, logoRef: agent.logoRef }
}

/** The flag emoji of an ISO 3166-1 alpha-2 code, or an empty string when the code is not one. */
export function flagOf(countryCode?: string): string {
  const code = (countryCode ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** Rail order for controllers (UI-SHELL-011): pinned in the person's order, then by activity, then unverified. */
export function orderControllers<T extends { did: string; kind: string; pinned: boolean; pinOrder: number }>(
  controllers: T[],
  lastMessageAt: (c: T) => string
): T[] {
  const pinned = controllers.filter((c) => c.pinned).sort((a, b) => a.pinOrder - b.pinOrder)
  const rest = controllers.filter((c) => !c.pinned)
  const verified = rest
    .filter((c) => c.kind !== 'unverified')
    .sort((a, b) => lastMessageAt(b).localeCompare(lastMessageAt(a)))
  const unverified = rest
    .filter((c) => c.kind === 'unverified')
    .sort((a, b) => lastMessageAt(b).localeCompare(lastMessageAt(a)))
  return [...pinned, ...verified, ...unverified]
}
export * from './trustDetails.js'
