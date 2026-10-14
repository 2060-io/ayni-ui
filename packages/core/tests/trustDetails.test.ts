import { describe, expect, it } from 'vitest'
import { loadTrustDetails } from '../src/index.js'

const DID = 'did:webvh:abc:agent.example'
const ORG_ISSUER = 'did:webvh:issuer:org-issuer.example'
const ECO = 'did:webvh:eco:ecs.example'

function fakeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/verifiable-trust/resolve'))
      return json({
        did: DID,
        trusted: true,
        evaluatedAtTime: '2026-10-13T15:25:07.571Z',
        evaluatedAtBlock: 77186,
        corporationId: 33,
        ecsCredentials: [],
        presentations: [{ invalidCredentialIds: ['cred-bad'] }],
        services: [],
      })
    const { query, input: qin } = body
    if (query === 'A6') {
      const who = qin.did === ORG_ISSUER ? 'ECS Org Issuer' : qin.did === ECO ? 'ECS Ecosystem' : 'Ayni Agent'
      return json({
        output: {
          ecsCredentials: [{ credential: { ecsSchema: 'ServiceCredential', credentialSubject: { name: who } } }],
        },
      })
    }
    if (query === 'A2')
      return json({
        output: {
          corporation: { id: 33, cgf: { documents: [{ url: 'https://x/cgf.pdf' }] } },
          ecosystems: [{ id: 1, did: ECO, egf: { documents: [{ url: 'https://x/egf.pdf' }] } }],
        },
      })
    if (query === 'A3')
      return json({
        output: [{ id: `${DID}#dc`, type: 'DIDCommMessaging', serviceEndpoint: { uri: 'wss://agent.example' } }],
      })
    if (query === 'A5')
      return json({
        output: [
          {
            credential: {
              id: 'cred-svc',
              ecsSchema: 'ServiceCredential',
              credentialSchemaId: 3,
              issuedAtTime: '2026-10-13T04:58:44Z',
              credentialSubject: { name: 'Ayni Agent', type: 'AIAgent' },
            },
            schema: { title: 'ServiceCredential' },
            ecosystem: { id: 1, did: ECO },
            issuerDid: DID,
          },
          {
            credential: {
              id: 'cred-org',
              ecsSchema: 'OrganizationCredential',
              credentialSchemaId: 1,
              credentialSubject: { name: '2060 OÜ', countryCode: 'EE', registryId: '16853041' },
            },
            schema: { title: 'OrganizationCredential' },
            ecosystem: { id: 1, did: ECO },
            issuerDid: ORG_ISSUER,
          },
          {
            credential: { id: 'cred-bad', credentialSchemaId: 9, credentialSubject: { level: 'gold' } },
            schema: { title: 'PartnerBadge' },
            ecosystem: { id: 1, did: ECO },
            issuerDid: ORG_ISSUER,
          },
        ],
      })
    if (query === 'A7')
      return json({
        output: [
          {
            participant: { id: 156, role: 'ISSUER', state: 'ACTIVE', validatorParticipantId: 3 },
            schema: { title: 'ServiceCredential' },
            ecosystem: { id: 1, did: ECO },
          },
          {
            participant: { id: 157, role: 'HOLDER', state: 'ACTIVE' },
            schema: { title: 'OrganizationCredential' },
            ecosystem: { id: 1, did: ECO },
          },
        ],
      })
    if (query === 'G1')
      return json({
        output: [
          { id: 3, didId: ECO, role: 'ECOSYSTEM' },
          { id: 156, didId: DID, role: 'ISSUER' },
        ],
      })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
}

describe('Proof of Trust details (D33, UI-TRUST-002)', () => {
  it('assembles identity, other credentials, accreditation chains, endpoints and governance', async () => {
    const d = await loadTrustDetails('http://idx', 'http://graph', DID, fakeFetch())
    expect(d.trusted).toBe(true)
    expect(d.service?.claims.name).toBe('Ayni Agent')
    expect(d.service?.selfIssued).toBe(true)
    expect(d.operator?.claims.registryId).toBe('16853041')
    expect(d.operator?.issuer.name).toBe('ECS Org Issuer')
    expect(d.operator?.ecosystem.name).toBe('ECS Ecosystem')
    expect(d.otherCredentials).toHaveLength(1)
    expect(d.otherCredentials[0]).toMatchObject({ schemaTitle: 'PartnerBadge', valid: false })
    expect(d.accreditations).toHaveLength(1)
    expect(d.accreditations[0].role).toBe('ISSUER')
    expect(d.accreditations[0].chain.map((c) => c.who.name)).toEqual(['ECS Ecosystem', 'Ayni Agent'])
    expect(d.endpoints[0]).toMatchObject({ type: 'DIDCommMessaging', endpoint: 'wss://agent.example' })
    expect(d.governance.ecosystems[0]).toMatchObject({
      name: 'ECS Ecosystem',
      documents: [{ url: 'https://x/egf.pdf' }],
    })
    expect(d.governance.corporation?.documents[0].url).toBe('https://x/cgf.pdf')
  })
})
