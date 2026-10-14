/**
 * Trust before binding (D4, UI-TRUST-001/002/005): descriptor discovery from a URL, a DID or a link,
 * and the Verifiable Trust resolution of the descriptor's `did` through the resolution service.
 */
import { type AgentDescriptor, DESCRIPTOR_PATH, DID_SERVICE_TYPE, PROFILE_MAJOR } from '@2060.io/hologram-agui-profile'
import type { TrustSummary } from './types.js'

export interface ResolveResponse {
  did: string
  trusted: boolean
  evaluatedAtTime?: string
  expiresAtTime?: string | null
  ecsCredentials?: { ecsSchema: string; ecosystemId?: number; credentialSubject: Record<string, unknown> }[]
  services?: { id: string; type: string; serviceEndpoint: unknown }[]
  ecosystems?: { id: number; name?: string }[]
  error?: string
}

export class TrustError extends Error {
  public constructor(
    message: string,
    public readonly code: 'descriptor' | 'version' | 'did' | 'network'
  ) {
    super(message)
    this.name = 'TrustError'
  }
}

export async function resolveDid(
  indexerUrl: string,
  did: string,
  fetchFn: typeof fetch = fetch
): Promise<ResolveResponse> {
  const response = await fetchFn(`${indexerUrl.replace(/\/+$/, '')}/v4/verifiable-trust/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ did, ecsCredentials: true, services: true, ecosystems: {} }),
  })
  if (response.status === 404) return { did, trusted: false, error: 'DID not found' }
  if (!response.ok) throw new TrustError(`trust resolution failed (${response.status})`, 'network')
  return response.json()
}

export function summarize(result: ResolveResponse, unverified = false): TrustSummary {
  const service = result.ecsCredentials?.find((c) => c.ecsSchema === 'ServiceCredential')?.credentialSubject
  const org = result.ecsCredentials?.find((c) => c.ecsSchema === 'OrganizationCredential')?.credentialSubject
  const persona = result.ecsCredentials?.find((c) => c.ecsSchema === 'PersonaCredential')?.credentialSubject
  const reasons: string[] = []
  if (unverified) reasons.push('resolution-unavailable')
  else if (!result.trusted) reasons.push(result.error ? 'did-not-found' : 'not-trusted')
  if (!unverified && result.trusted && !service) reasons.push('no-service-credential')
  const operator = org
    ? {
        kind: 'organization',
        name: String(org.name ?? ''),
        did: typeof org.id === 'string' ? org.id : undefined,
        countryCode: org.countryCode as string | undefined,
        registryId: org.registryId as string | undefined,
        logoUri: org.logoUri as string | undefined,
      }
    : persona
      ? {
          kind: 'persona',
          name: String(persona.name ?? ''),
          did: typeof persona.id === 'string' ? persona.id : undefined,
          countryCode: persona.countryCode as string | undefined,
          logoUri: persona.avatarUri as string | undefined,
        }
      : undefined
  return {
    result: unverified ? 'unverified' : result.trusted ? 'trusted' : 'untrusted',
    checkedAt: new Date().toISOString(),
    did: result.did,
    serviceName: service?.name as string | undefined,
    serviceType: service?.type as string | undefined,
    description: service?.description as string | undefined,
    logoUri: service?.logoUri as string | undefined,
    links: {
      terms: httpsOnly(service?.termsAndConditions),
      privacy: httpsOnly(service?.privacyPolicy),
    },
    operator,
    ecosystems: result.ecosystems?.map((e) => ({ id: e.id, name: e.name })),
    reasons,
  }
}

export async function resolveTrust(
  indexerUrl: string,
  did: string,
  fetchFn: typeof fetch = fetch
): Promise<TrustSummary> {
  try {
    return summarize(await resolveDid(indexerUrl, did, fetchFn))
  } catch {
    return summarize({ did, trusted: false }, true)
  }
}

export function isDid(input: string): boolean {
  return /^did:[a-z0-9]+:.+/.test(input.trim())
}

/** The descriptor URL of a DID: its DID Document service of type HologramAgUI, through resolution. */
export async function descriptorUrlOfDid(
  indexerUrl: string,
  did: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const result = await resolveDid(indexerUrl, did, fetchFn)
  const service = result.services?.find((s) => s.type === DID_SERVICE_TYPE)
  const endpoint = service?.serviceEndpoint
  const url = typeof endpoint === 'string' ? endpoint : (endpoint as { uri?: string } | undefined)?.uri
  if (!url) throw new TrustError('this DID declares no HologramAgUI service', 'did')
  return url
}

export interface DiscoveredAgent {
  descriptorUrl: string
  descriptor: AgentDescriptor
}

/** Entry points: a descriptor URL, an agent origin, a DID, or a link carrying ?agent= (UI-AGENTS-001/002). */
export async function discoverAgent(
  input: string,
  indexerUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<DiscoveredAgent> {
  let target = input.trim()
  try {
    const asUrl = new URL(target)
    const param = asUrl.searchParams.get('agent')
    if (param) target = param
  } catch {
    // not a URL
  }
  let descriptorUrl: string
  if (isDid(target)) descriptorUrl = await descriptorUrlOfDid(indexerUrl, target, fetchFn)
  else {
    const url = new URL(target.startsWith('http') ? target : `https://${target}`)
    descriptorUrl = url.pathname === '/' || url.pathname === '' ? `${url.origin}${DESCRIPTOR_PATH}` : url.toString()
  }
  if (!descriptorUrl.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(descriptorUrl)) {
    throw new TrustError('agent descriptors must be served over HTTPS', 'descriptor')
  }
  const response = await fetchFn(descriptorUrl, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new TrustError(`descriptor not found (${response.status})`, 'descriptor')
  const descriptor = (await response.json()) as AgentDescriptor
  if (!descriptor || typeof descriptor.profileVersion !== 'string' || !descriptor.did || !descriptor.sessions)
    throw new TrustError('not a Hologram agent descriptor', 'descriptor')
  const major = Number(descriptor.profileVersion.split('.')[0])
  if (major !== PROFILE_MAJOR)
    throw new TrustError(
      `profile version ${descriptor.profileVersion} is not supported (this UI implements ${PROFILE_MAJOR}.x)`,
      'version'
    )
  return { descriptorUrl, descriptor }
}

function httpsOnly(value: unknown): string | undefined {
  return typeof value === 'string' && /^https:\/\//i.test(value) ? value : undefined
}
