import { describe, expect, it } from 'vitest'
import { controllerOf, orderControllers } from '../src/index.js'

const agent = (
  did: string,
  result: string,
  op?: { kind: string; name: string; did?: string; countryCode?: string; registryId?: string }
) => ({
  did,
  name: `Agent ${did}`,
  trust: { result, operator: op },
})

describe('controllers (D32, UI-SHELL-001/011)', () => {
  it('files a trusted agent under its organization (registry identity) and an unverified one under itself', () => {
    // on devnet each service DID holds its own copy of the Organization credential: the registry id is the link
    const org = agent('did:a', 'trusted', {
      kind: 'organization',
      name: 'Northwind',
      did: 'did:a',
      countryCode: 'EE',
      registryId: '16853041',
    })
    const other = agent('did:b', 'trusted', {
      kind: 'organization',
      name: 'Northwind',
      did: 'did:b',
      countryCode: 'ee',
      registryId: '16853041',
    })
    expect(controllerOf(org)).toMatchObject({ did: 'org:ee:16853041', kind: 'organization', name: 'Northwind' })
    expect(controllerOf(other).did).toBe(controllerOf(org).did)
    expect(controllerOf(agent('did:c', 'trusted', { kind: 'organization', name: 'Loose', did: 'did:org' })).did).toBe(
      'did:org'
    )
    expect(controllerOf(agent('did:p', 'trusted', { kind: 'persona', name: 'Ana', did: 'did:ana' })).kind).toBe(
      'persona'
    )
    expect(
      controllerOf(agent('did:x', 'untrusted', { kind: 'organization', name: 'X', did: 'did:x-org' }))
    ).toMatchObject({
      did: 'did:x',
      kind: 'unverified',
    })
    expect(controllerOf(agent('did:y', 'unverified')).did).toBe('did:y')
  })

  it('orders pinned first, then by activity, unverified last', () => {
    const list = [
      { did: 'u', kind: 'unverified', pinned: false, pinOrder: 0, last: '2026-03-01' },
      { did: 'b', kind: 'organization', pinned: false, pinOrder: 0, last: '2026-02-01' },
      { did: 'p', kind: 'organization', pinned: true, pinOrder: 1, last: '2026-01-01' },
      { did: 'a', kind: 'organization', pinned: false, pinOrder: 0, last: '2026-02-15' },
    ]
    expect(orderControllers(list, (c) => c.last).map((c) => c.did)).toEqual(['p', 'a', 'b', 'u'])
  })
})
