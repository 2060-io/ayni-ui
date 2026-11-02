import { describe, expect, it } from 'vitest'
import { controllerOf, hasIssuedCredential, orderControllers } from '../src/index.js'

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

  it('orders pinned first, then identified, then the others in connection order, unverified last (D37)', () => {
    const list = [
      { did: 'u', kind: 'unverified', pinned: false, pinOrder: 0, since: '2026-01-01' },
      { did: 'b', kind: 'organization', pinned: false, pinOrder: 0, since: '2026-02-01' },
      { did: 'p', kind: 'organization', pinned: true, pinOrder: 1, since: '2026-03-01' },
      { did: 'a', kind: 'organization', pinned: false, pinOrder: 0, since: '2026-02-15' },
      { did: 'i2', kind: 'organization', pinned: false, pinOrder: 0, since: '2026-02-20', identifiedAt: '2026-03-02' },
      { did: 'i1', kind: 'persona', pinned: false, pinOrder: 0, since: '2026-01-10', identifiedAt: '2026-03-03' },
    ]
    expect(orderControllers(list, (c) => c.since).map((c) => c.did)).toEqual(['p', 'i1', 'i2', 'b', 'a', 'u'])
    // activity changes nothing: the same input in another array order yields the same rail
    expect(orderControllers([...list].reverse(), (c) => c.since).map((c) => c.did)).toEqual([
      'p',
      'i1',
      'i2',
      'b',
      'a',
      'u',
    ])
  })

  it('recognizes an issued credential from a completed issue flow card only', () => {
    const issue = (state: string, kind = 'issue') => ({
      role: 'activity',
      activityType: 'ayni.flow',
      content: { kind, state },
    })
    expect(hasIssuedCredential([issue('completed')])).toBe(true)
    expect(hasIssuedCredential([issue('pending'), issue('completed', 'present')])).toBe(false)
    expect(hasIssuedCredential([{ role: 'assistant', content: 'hello' }])).toBe(false)
  })
})
