import { describe, expect, it } from 'vitest'
import { searchDirectory } from '../src/directory.js'
import { readSse } from '../src/sse.js'
import { discoverAgent, summarize } from '../src/trust.js'

const descriptor = {
  profileVersion: '3.0',
  did: 'did:webvh:x:agent',
  name: 'Acme',
  sessions: 'https://agent.test/agui/v3/sessions',
  binding: { modes: ['cross-device'], walletLinkTemplate: 'https://hologram.zone/open?oob={oob}' },
  features: { contextualMenu: true, approvals: true, reactions: true, receipts: true, history: true, uploads: false },
  locales: ['en'],
}

const fetchFn: typeof fetch = async (input) => {
  const url = String(input)
  if (url === 'https://agent.test/.well-known/ayni-agent.json') return new Response(JSON.stringify(descriptor))
  if (url === 'https://agent.test/old.json')
    return new Response(JSON.stringify({ ...descriptor, profileVersion: '4.0' }))
  if (url.endsWith('/v4/verifiable-trust/resolve')) {
    return new Response(
      JSON.stringify({
        did: 'did:webvh:x:agent',
        trusted: true,
        services: [
          { id: '#agui', type: 'AyniAgUI', serviceEndpoint: 'https://agent.test/.well-known/ayni-agent.json' },
        ],
        ecsCredentials: [
          { ecsSchema: 'ServiceCredential', credentialSubject: { name: 'Acme Support', type: 'AIAgent' } },
          { ecsSchema: 'OrganizationCredential', credentialSubject: { name: 'Acme GmbH', countryCode: 'DE' } },
        ],
      })
    )
  }
  if (url.endsWith('/v4/graph/search')) {
    return new Response(
      JSON.stringify({
        hits: [
          {
            id: 'did:webvh:x:agent#agui',
            snippet: {
              didId: 'did:webvh:x:agent',
              type: 'AyniAgUI',
              serviceEndpoint: 'https://agent.test/.well-known/ayni-agent.json',
              didCard: {
                did: 'did:webvh:x:agent',
                trusted: true,
                service: { name: 'Acme Support' },
                operator: { kind: 'Organization', name: 'Acme GmbH' },
              },
            },
          },
        ],
        cursor: null,
        totalCount: 1,
      })
    )
  }
  return new Response('nope', { status: 404 })
}

describe('trust before binding (UI-TRUST-001/002/005, UI-AGENTS-001/002)', () => {
  it('discovers the descriptor from an origin, a descriptor URL, a DID and an ?agent= link', async () => {
    for (const input of [
      'https://agent.test',
      'https://agent.test/.well-known/ayni-agent.json',
      'did:webvh:x:agent',
      'https://ui.test/?agent=https://agent.test',
    ]) {
      const found = await discoverAgent(input, 'https://idx.test', fetchFn)
      expect(found.descriptor.did).toBe('did:webvh:x:agent')
    }
  })
  it('refuses an unsupported profile major (PROF-DESC-002)', async () => {
    await expect(discoverAgent('https://agent.test/old.json', 'https://idx.test', fetchFn)).rejects.toThrow(/4\.0/)
  })
  it('summarizes a resolution into the trust card with the verified service name and operator', () => {
    const summary = summarize({
      did: 'did:webvh:x:agent',
      trusted: true,
      ecsCredentials: [
        { ecsSchema: 'ServiceCredential', credentialSubject: { name: 'Acme Support' } },
        { ecsSchema: 'OrganizationCredential', credentialSubject: { name: 'Acme GmbH', countryCode: 'DE' } },
      ],
    })
    expect(summary.result).toBe('trusted')
    expect(summary.serviceName).toBe('Acme Support')
    expect(summary.operator?.name).toBe('Acme GmbH')
    expect(summarize({ did: 'x', trusted: false, error: 'DID not found' }).reasons).toContain('did-not-found')
    expect(summarize({ did: 'x', trusted: false }, true).result).toBe('unverified')
  })
  it('lists the directory through the graph (UI-AGENTS-004)', async () => {
    const page = await searchDirectory('https://graph.test', { freeText: 'acme' }, fetchFn)
    expect(page.hits).toHaveLength(1)
    expect(page.hits[0]).toMatchObject({
      did: 'did:webvh:x:agent',
      trusted: true,
      descriptorUrl: 'https://agent.test/.well-known/ayni-agent.json',
    })
    expect((await searchDirectory('https://graph.test', { freeText: 'zzz' }, fetchFn)).hits).toHaveLength(0)
  })
})

describe('sse reader', () => {
  it('parses ids and multi-line data', async () => {
    const text = 'id: 1\ndata: {"a":1}\n\n: ping\n\nid: 2\ndata: {"b":\ndata: 2}\n\n'
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    })
    const out: { id?: string; data: string }[] = []
    await readSse(stream, (m) => out.push(m))
    expect(out).toEqual([
      { id: '1', data: '{"a":1}' },
      { id: '2', data: '{"b":\n2}' },
    ])
  })
})
