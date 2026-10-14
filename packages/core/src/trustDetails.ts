/**
 * Proof of Trust details (D33, UI-TRUST-002): the identity credentials with their claims, the other
 * credentials the DID presents, its accreditations with the chain behind each, the endpoints of its
 * DID Document and the governance documents, assembled from the resolution service and the graph.
 */
import { resolveDid } from './trust.js'

export interface DidName {
  did: string
  name?: string
  logoUri?: string
  kind?: 'organization' | 'persona'
}

export interface CredentialCard {
  id: string
  schemaTitle: string
  schemaDescription?: string
  ecsSchema?: string
  claims: Record<string, unknown>
  issuedAt?: string
  validFrom?: string
  validUntil?: string | null
  issuer: DidName
  selfIssued: boolean
  ecosystem: { id: number; name?: string; egfUrl?: string }
  valid: boolean
}

export type ParticipantRole = 'ECOSYSTEM' | 'ISSUER_GRANTOR' | 'VERIFIER_GRANTOR' | 'ISSUER' | 'VERIFIER' | 'HOLDER'

export interface Accreditation {
  participantId: number
  role: ParticipantRole
  state: string
  schemaTitle: string
  ecosystem: { id: number; name?: string }
  /** root to leaf: the ecosystem, the grantors, then this participant */
  chain: { participantId: number; role: ParticipantRole; who: DidName }[]
}

export interface TrustDetails {
  did: string
  trusted: boolean | null
  evaluatedAt?: string
  evaluatedAtBlock?: number
  corporationId?: number
  service?: CredentialCard
  operator?: CredentialCard
  otherCredentials: CredentialCard[]
  invalidCredentialIds: string[]
  accreditations: Accreditation[]
  endpoints: { id: string; type: string; endpoint: string }[]
  governance: {
    corporation?: { id: number; documents: { url: string; language?: string }[] }
    ecosystems: { id: number; name?: string; did: string; documents: { url: string; language?: string }[] }[]
  }
}

type Json = Record<string, unknown>

async function traverse(graphUrl: string, query: string, input: Json, fetchFn: typeof fetch): Promise<unknown> {
  const response = await fetchFn(`${graphUrl.replace(/\/+$/, '')}/v4/graph/traverse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, input, limit: 100 }),
  })
  if (!response.ok) throw new Error(`graph ${query} failed (${response.status})`)
  return ((await response.json()) as { output?: unknown }).output
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** Names of a DID from its own identity credentials (one graph call, cached per card). */
function makeNameLookup(graphUrl: string, fetchFn: typeof fetch) {
  const cache = new Map<string, Promise<DidName>>()
  return (did: string): Promise<DidName> => {
    let hit = cache.get(did)
    if (!hit) {
      hit = traverse(graphUrl, 'A6', { did }, fetchFn)
        .then((out) => {
          const creds = ((out as Json)?.ecsCredentials ?? []) as {
            credential: { ecsSchema?: string; credentialSubject: Json }
          }[]
          const service = creds.find((c) => c.credential.ecsSchema === 'ServiceCredential')?.credential
            .credentialSubject
          const org = creds.find((c) => c.credential.ecsSchema === 'OrganizationCredential')?.credential
            .credentialSubject
          const persona = creds.find((c) => c.credential.ecsSchema === 'PersonaCredential')?.credential
            .credentialSubject
          const who = service ?? org ?? persona
          return {
            did,
            name: str(who?.name),
            logoUri: str(who?.logoUri) ?? str(persona?.avatarUri),
            kind: org ? ('organization' as const) : persona ? ('persona' as const) : undefined,
          }
        })
        .catch(() => ({ did }))
      cache.set(did, hit)
    }
    return hit
  }
}

export async function loadTrustDetails(
  indexerUrl: string,
  graphUrl: string,
  did: string,
  fetchFn: typeof fetch = fetch
): Promise<TrustDetails> {
  const nameOf = makeNameLookup(graphUrl, fetchFn)
  const [resolved, a2, a3, a5, a7] = await Promise.all([
    resolveDidFull(indexerUrl, did, fetchFn),
    traverse(graphUrl, 'A2', { did }, fetchFn).catch(() => undefined),
    traverse(graphUrl, 'A3', { did }, fetchFn).catch(() => []),
    traverse(graphUrl, 'A5', { did }, fetchFn).catch(() => []),
    traverse(graphUrl, 'A7', { did }, fetchFn).catch(() => []),
  ])
  const invalid = new Set<string>(
    (resolved.presentations ?? []).flatMap((p) => [
      ...(p.invalidCredentialIds ?? []),
      ...(p.unresolvableCredentialIds ?? []),
    ])
  )
  const ecosystems = ((a2 as Json)?.ecosystems ?? []) as {
    id: number
    did: string
    egf?: { documents?: { url: string; language?: string }[] }
  }[]
  const ecosystemNames = new Map<number, DidName>()
  await Promise.all(
    ecosystems.map(async (e) => {
      ecosystemNames.set(e.id, await nameOf(e.did))
    })
  )
  const egfOf = (id: number) => ecosystems.find((e) => e.id === id)?.egf?.documents?.[0]?.url

  const rows = (Array.isArray(a5) ? a5 : []) as {
    credential: {
      id: string
      ecsSchema?: string
      credentialSchemaId: number
      issuedAtTime?: string
      validFrom?: string
      validUntil?: string | null
      credentialSubject: Json
    }
    schema?: { title?: string; description?: string }
    ecosystem?: { id: number; did: string }
    issuerDid?: string
  }[]
  const cards: CredentialCard[] = await Promise.all(
    rows.map(async (r) => {
      const ecosystemId = r.ecosystem?.id ?? 0
      let ecosystemName = ecosystemNames.get(ecosystemId)
      if (!ecosystemName && r.ecosystem?.did) {
        ecosystemName = await nameOf(r.ecosystem.did)
        ecosystemNames.set(ecosystemId, ecosystemName)
      }
      const issuer = r.issuerDid ? await nameOf(r.issuerDid) : { did: '' }
      return {
        id: r.credential.id,
        schemaTitle: r.schema?.title ?? r.credential.ecsSchema ?? `Schema ${r.credential.credentialSchemaId}`,
        schemaDescription: r.schema?.description,
        ecsSchema: r.credential.ecsSchema,
        claims: r.credential.credentialSubject,
        issuedAt: r.credential.issuedAtTime,
        validFrom: r.credential.validFrom,
        validUntil: r.credential.validUntil,
        issuer,
        selfIssued: r.issuerDid === did,
        ecosystem: { id: ecosystemId, name: ecosystemName?.name, egfUrl: egfOf(ecosystemId) },
        valid:
          !invalid.has(r.credential.id) &&
          !(r.credential.validUntil && Date.parse(r.credential.validUntil) < Date.now()),
      }
    })
  )
  // the resolver is authoritative for which identity credentials count; the graph adds issuer and schema
  const service =
    cards.find((c) => c.ecsSchema === 'ServiceCredential') ??
    fromResolver(resolved, 'ServiceCredential', ecosystemNames)
  const operator =
    cards.find((c) => c.ecsSchema === 'OrganizationCredential' || c.ecsSchema === 'PersonaCredential') ??
    fromResolver(resolved, 'OrganizationCredential', ecosystemNames) ??
    fromResolver(resolved, 'PersonaCredential', ecosystemNames)
  const otherCredentials = cards.filter((c) => c !== service && c !== operator)

  const participations = (Array.isArray(a7) ? a7 : []) as {
    participant: { id: number; role: ParticipantRole; state: string; validatorParticipantId?: number | null }
    schema?: { title?: string }
    ecosystem?: { id: number; did: string }
  }[]
  const accreditations: Accreditation[] = await Promise.all(
    participations
      .filter((p) => p.participant.role !== 'HOLDER')
      .map(async (p) => {
        const chainRows = ((await traverse(graphUrl, 'G1', { participantId: p.participant.id }, fetchFn).catch(
          () => []
        )) ?? []) as { id: number; didId: string; role: ParticipantRole }[]
        const chain = await Promise.all(
          (Array.isArray(chainRows) ? chainRows : []).map(async (c) => ({
            participantId: c.id,
            role: c.role,
            who: c.didId === did ? { did, name: service?.claims.name as string | undefined } : await nameOf(c.didId),
          }))
        )
        const ecosystemId = p.ecosystem?.id ?? 0
        return {
          participantId: p.participant.id,
          role: p.participant.role,
          state: p.participant.state,
          schemaTitle: p.schema?.title ?? '',
          ecosystem: { id: ecosystemId, name: ecosystemNames.get(ecosystemId)?.name },
          chain,
        }
      })
  )

  const endpoints = (
    (Array.isArray(a3) ? a3 : (resolved.services ?? [])) as { id: string; type: string; serviceEndpoint: unknown }[]
  ).map((s) => ({
    id: s.id,
    type: s.type,
    endpoint:
      typeof s.serviceEndpoint === 'string'
        ? s.serviceEndpoint
        : (str((s.serviceEndpoint as Json)?.uri) ?? JSON.stringify(s.serviceEndpoint)),
  }))
  const corporation = (a2 as Json)?.corporation as
    | { id: number; cgf?: { documents?: { url: string; language?: string }[] } }
    | undefined
  return {
    did,
    trusted: resolved.error ? null : resolved.trusted,
    evaluatedAt: resolved.evaluatedAtTime,
    evaluatedAtBlock: resolved.evaluatedAtBlock,
    corporationId: resolved.corporationId ?? corporation?.id,
    service,
    operator,
    otherCredentials,
    invalidCredentialIds: [...invalid],
    accreditations,
    endpoints,
    governance: {
      corporation: corporation ? { id: corporation.id, documents: corporation.cgf?.documents ?? [] } : undefined,
      ecosystems: ecosystems.map((e) => ({
        id: e.id,
        did: e.did,
        name: ecosystemNames.get(e.id)?.name,
        documents: e.egf?.documents ?? [],
      })),
    },
  }
}

interface ResolvedFull {
  did: string
  trusted: boolean
  error?: string
  evaluatedAtTime?: string
  evaluatedAtBlock?: number
  corporationId?: number
  ecsCredentials?: {
    ecsSchema: string
    ecosystemId?: number
    id?: string
    issuedAtTime?: string
    validFrom?: string
    validUntil?: string | null
    credentialSubject: Record<string, unknown>
  }[]
  presentations?: { invalidCredentialIds?: string[]; unresolvableCredentialIds?: string[] }[]
  services?: { id: string; type: string; serviceEndpoint: unknown }[]
}

async function resolveDidFull(indexerUrl: string, did: string, fetchFn: typeof fetch): Promise<ResolvedFull> {
  const response = await fetchFn(`${indexerUrl.replace(/\/+$/, '')}/v4/verifiable-trust/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ did, ecsCredentials: true, services: true, presentations: { includeInvalid: true } }),
  })
  if (response.status === 404) return { did, trusted: false, error: 'DID not found' }
  if (!response.ok) {
    // the plain resolution still tells trusted or not
    const basic = await resolveDid(indexerUrl, did, fetchFn)
    return { ...basic, error: basic.error } as ResolvedFull
  }
  return response.json()
}

function fromResolver(
  resolved: ResolvedFull,
  ecsSchema: string,
  ecosystemNames: Map<number, DidName>
): CredentialCard | undefined {
  const c = resolved.ecsCredentials?.find((x) => x.ecsSchema === ecsSchema)
  if (!c) return undefined
  return {
    id: c.id ?? '',
    schemaTitle: ecsSchema,
    ecsSchema,
    claims: c.credentialSubject,
    issuedAt: c.issuedAtTime,
    validFrom: c.validFrom,
    validUntil: c.validUntil,
    issuer: { did: '' },
    selfIssued: false,
    ecosystem: { id: c.ecosystemId ?? 0, name: ecosystemNames.get(c.ecosystemId ?? 0)?.name },
    valid: true,
  }
}
