import { describe, expect, it } from 'vitest'
import {
  type Accreditation,
  accreditationLine,
  type CredentialCard,
  claimRows,
  didSearchUrl,
  fillText,
  formatTime,
  identityStepOf,
  otherCredentialLine,
  schemaLabel,
  shortDid,
  proofOfTrustEnglish as t,
  verdictOf,
} from '../src/index.js'

const day = (iso: string) => iso.slice(0, 10)
const card = (over: Partial<CredentialCard>): CredentialCard => ({
  id: 'c1',
  schemaTitle: 'ServiceCredential',
  claims: {},
  issuer: { did: 'did:web:issuer.example' },
  selfIssued: false,
  ecosystem: { id: 1 },
  valid: true,
  ...over,
})

describe('what the Proof of Trust shows', () => {
  it('takes the verdict from the registry once loaded, from the agent before', () => {
    expect(verdictOf(null, 'trusted')).toBe('trusted')
    expect(verdictOf({ trusted: true }, 'untrusted')).toBe('trusted')
    expect(verdictOf({ trusted: false }, 'trusted')).toBe('untrusted')
    expect(verdictOf({ trusted: null }, 'trusted')).toBe('unverified')
  })

  it('shortens a long DID to its two ends and names the ECS schemas', () => {
    expect(shortDid('did:web:short.example')).toBe('did:web:short.example')
    const long = `did:webvh:${'Q'.repeat(46)}:welcome.example.org`
    expect(shortDid(long)).toBe(`${long.slice(0, 22)}…${long.slice(-20)}`)
    expect(schemaLabel('OrganizationCredential')).toBe('ECS-Organization')
    expect(schemaLabel('Membership')).toBe('Membership')
    expect(didSearchUrl('https://graph.example.org', 'did:web:a b')).toBe(
      'https://search.example.org/?q=did%3Aweb%3Aa%20b'
    )
  })

  it('fills the places of a text', () => {
    expect(fillText('Issued by {{name}}', { name: 'Acme' })).toBe('Issued by Acme')
    expect(t('minimumAge', { age: 18 })).toBe('Minimum age 18')
  })

  it('draws the service step: its tag, its description, its facts on one line, its links', () => {
    const step = identityStepOf(
      'service',
      card({
        claims: {
          name: 'Welcome',
          type: 'AI agent',
          description: 'Shows you around.',
          minimumAgeRequired: 16,
          termsAndConditionsUri: 'https://example.org/terms',
          privacyPolicyUri: 'https://example.org/privacy',
          logoUri: 'https://example.org/logo.svg',
        },
        selfIssued: true,
        ecosystem: { id: 1, name: 'Essential Credentials' },
        issuedAt: '2026-10-19T10:00:00Z',
      }),
      t,
      day
    )
    expect(step.kicker).toBe('Service · ECS-Service')
    expect(step).toMatchObject({
      name: 'Welcome',
      logo: 'https://example.org/logo.svg',
      tag: 'AI agent',
      description: 'Shows you around.',
      factsLayout: 'row',
      nameIcon: undefined,
    })
    expect(step.facts).toEqual([{ value: 'Minimum age 16' }])
    expect(step.links).toEqual([
      { label: 'terms', url: 'https://example.org/terms' },
      { label: 'privacy', url: 'https://example.org/privacy' },
    ])
    expect(step.provenance).toBe('Self-issued · Essential Credentials · since 2026-10-19')
  })

  it('draws the operator step: its icon, its flag, its facts one per line', () => {
    const step = identityStepOf(
      'operator',
      card({
        schemaTitle: 'OrganizationCredential',
        ecsSchema: 'OrganizationCredential',
        claims: { name: 'Acme', countryCode: 'ee', address: 'Tallinn', registryId: '123', legalJurisdiction: 'EE' },
        issuer: { did: 'did:web:issuer.example', name: 'Registrar' },
        validUntil: '2027-01-01T00:00:00Z',
      }),
      t,
      day
    )
    expect(step.kicker).toBe('Operated by · ECS-Organization')
    expect(step.nameIcon).toBe('building')
    expect(step.flag).toBe('🇪🇪')
    expect(step.factsLayout).toBe('column')
    expect(step.facts).toEqual([
      { value: 'Tallinn' },
      { label: 'Registry id', value: '123' },
      { label: 'Jurisdiction', value: 'EE' },
    ])
    expect(step.provenance).toBe('Issued by Registrar · valid until 2027-01-01')
    const persona = identityStepOf('operator', card({ ecsSchema: 'PersonaCredential' }), t, day)
    expect(persona.nameIcon).toBe('user')
    expect(persona.provenance).toBe('Issuer accredited')
  })

  it('writes the line of another credential and of an accreditation', () => {
    expect(
      otherCredentialLine(
        card({ issuer: { did: 'd', name: 'Guild' }, ecosystem: { id: 2, name: 'Trades' }, validUntil: '2027-05-01' }),
        t,
        day
      )
    ).toBe('Issued by Guild · Trades · valid until 2027-05-01')
    expect(otherCredentialLine(card({}), t, day)).toBe('')
    const direct: Accreditation = {
      participantId: 7,
      role: 'ISSUER',
      state: 'ACTIVE',
      schemaTitle: 'ServiceCredential',
      ecosystem: { id: 1, name: 'Essential Credentials' },
      chain: [
        { participantId: 1, role: 'ECOSYSTEM', who: { did: 'did:eco' } },
        { participantId: 7, role: 'ISSUER', who: { did: 'did:me' } },
      ],
    }
    expect(accreditationLine(direct, t)).toBe('Essential Credentials · accredited by the ecosystem')
    const through: Accreditation = {
      ...direct,
      state: 'REVOKED',
      ecosystem: { id: 4 },
      chain: [
        { participantId: 1, role: 'ECOSYSTEM', who: { did: 'did:eco' } },
        { participantId: 3, role: 'ISSUER_GRANTOR', who: { did: 'did:g', name: 'Chamber' } },
        { participantId: 5, role: 'ISSUER_GRANTOR', who: { did: 'did:h' } },
        { participantId: 7, role: 'ISSUER', who: { did: 'did:me' } },
      ],
    }
    expect(accreditationLine(through, t)).toBe('Ecosystem 4 · via Chamber → Issuer grantor · revoked')
  })

  it('lists the claims worth showing, links marked', () => {
    expect(claimRows({ id: 'x', logoSri: 'sha', level: 3, site: 'https://example.org', nested: { a: 1 } })).toEqual([
      { key: 'level', value: '3', link: false },
      { key: 'site', value: 'https://example.org', link: true },
    ])
  })
})

describe('the time on a row', () => {
  it('is the hour today, the day and the hour before, empty when unreadable', () => {
    const now = new Date('2026-11-11T18:00:00')
    expect(formatTime('2026-11-11T09:05:00', 'en-GB', now)).toBe('09:05')
    expect(formatTime('2026-11-03T09:05:00', 'en-GB', now)).toMatch(/3 Nov.*09:05/)
    expect(formatTime('not a date', 'en-GB', now)).toBe('')
  })
})
