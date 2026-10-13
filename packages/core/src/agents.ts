/** Agents list operations (UI-AGENTS-001..005) over the device store. */
import type { AgentDescriptor } from '@2060.io/hologram-agui-profile'
import type { DeviceStore } from './store.js'
import { discoverAgent, resolveTrust } from './trust.js'
import type { AgentRecord, TrustSummary } from './types.js'

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
  }
  await store.putAgent(record)
  return record
}

export async function recheckTrust(
  store: DeviceStore,
  agent: AgentRecord,
  indexerUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<TrustSummary> {
  const trust = await resolveTrust(indexerUrl, agent.did, fetchFn)
  const changed = trust.result !== agent.trust.result
  await store.putAgent({
    ...agent,
    trust,
    trustAcknowledged: changed ? false : agent.trustAcknowledged,
    name: trust.serviceName ?? agent.name,
    logoRef: trust.logoUri ?? agent.logoRef,
  })
  return trust
}

export function descriptorOf(agent: AgentRecord): AgentDescriptor {
  return agent.descriptor
}
