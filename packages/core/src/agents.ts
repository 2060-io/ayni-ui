/** Agents list operations (UI-AGENTS-001..005) over the device store. */
import type { AgentDescriptor } from '@2060.io/ayni-agui-profile'
import { controllerOf } from './index.js'
import type { DeviceStore } from './store.js'
import { discoverAgent, resolveTrust } from './trust.js'
import type { AgentRecord, TrustSummary } from './types.js'

/** Files the agent under its controller, creating or refreshing the controller record (D32). */
export async function fileUnderController(store: DeviceStore, agent: AgentRecord): Promise<AgentRecord> {
  const c = controllerOf(agent)
  const existing = await store.getController(c.did)
  await store.putController({
    did: c.did,
    kind: c.kind,
    name: c.name,
    logoRef: c.logoRef,
    countryCode: c.countryCode,
    pinned: existing?.pinned ?? false,
    pinOrder: existing?.pinOrder ?? 0,
  })
  const filed = { ...agent, controllerDid: c.did }
  await store.putAgent(filed)
  return filed
}

export async function addAgent(
  store: DeviceStore,
  input: string,
  indexerUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<AgentRecord> {
  const { descriptorUrl, descriptor } = await discoverAgent(input, indexerUrl, fetchFn)
  const trust = await resolveTrust(indexerUrl, descriptor.did, fetchFn)
  const existing = await store.getAgent(descriptor.did)
  const record: AgentRecord = {
    did: descriptor.did,
    descriptorUrl,
    descriptor,
    // display data is verified only after resolution confirmed the service identity (UI-TRUST-005)
    name: trust.result === 'trusted' && trust.serviceName ? trust.serviceName : descriptor.name,
    logoRef: trust.result === 'trusted' ? trust.logoUri : undefined,
    trust,
    pinned: existing?.pinned ?? false,
    pinOrder: existing?.pinOrder ?? 0,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    lastMessageAt: existing?.lastMessageAt ?? '',
    trustAcknowledged: existing?.trustAcknowledged,
    deviceHandle: existing?.deviceHandle,
    deviceSecret: existing?.deviceSecret,
  }
  return fileUnderController(store, record)
}

export async function recheckTrust(
  store: DeviceStore,
  agent: AgentRecord,
  indexerUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<TrustSummary> {
  const trust = await resolveTrust(indexerUrl, agent.did, fetchFn)
  const changed = trust.result !== agent.trust.result
  await fileUnderController(store, {
    ...agent,
    trust,
    trustAcknowledged: changed ? false : agent.trustAcknowledged,
    name: trust.serviceName ?? agent.name,
    logoRef: trust.logoUri ?? agent.logoRef,
  })
  return trust
}

/** The descriptor can change on the agent (features, limits): refresh the stored copy (UI-TRUST-001). */
export async function refreshDescriptor(
  store: DeviceStore,
  agent: AgentRecord,
  indexerUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<AgentRecord> {
  // a record from before the rename points at the old descriptor path: ask for the new one, fall back to the DID
  const stored = agent.descriptorUrl?.replace(/\/\.well-known\/hologram-agent\.json$/, '/.well-known/ayni-agent.json')
  const { descriptorUrl, descriptor } = await discoverAgent(stored || agent.did, indexerUrl, fetchFn).catch(() =>
    stored && stored !== agent.descriptorUrl
      ? discoverAgent(agent.did, indexerUrl, fetchFn)
      : Promise.reject(new Error('unreachable'))
  )
  if (descriptor.did !== agent.did) return agent
  const next = { ...agent, descriptorUrl, descriptor }
  if (JSON.stringify(next.descriptor) !== JSON.stringify(agent.descriptor)) await store.putAgent(next)
  return next
}

export function descriptorOf(agent: AgentRecord): AgentDescriptor {
  return agent.descriptor
}
