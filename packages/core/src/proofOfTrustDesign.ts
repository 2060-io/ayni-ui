/**
 * The design of the Proof of Trust, written once for the two renderers of the Ayni UI: the browser (CSS) and the
 * Ayni app (React Native styles), with what the card shows for a DID: the verdict, the two identity steps (the
 * service, who operates it), the other credentials, the accreditations, the endpoints and the governance documents.
 *
 * The browser's stylesheet is the reference: a test in this repository compares it with these values, and the
 * browser's component reads its wording through the same functions the app calls. The numbers are CSS pixels, read
 * by React Native as density-independent points; letter spacings are in em.
 */
import type { ColorRole } from './conversationDesign.js'
import { flagOf } from './flag.js'
import { TRUST_MARK, type TrustResult } from './homeDesign.js'
import type { Accreditation, CredentialCard, TrustDetails } from './trustDetails.js'

export const PROOF_OF_TRUST_DESIGN = {
  /** the card itself; on a phone it takes the screen, with no border and no radius */
  card: { maxWidth: 760, radius: 18 },
  head: {
    gap: 6,
    paddingY: 12,
    paddingRight: 14,
    paddingLeft: 18,
    dotSize: 10,
    didFontSize: 12,
    toolIconSize: 15,
    closeIconSize: 18,
  },
  body: { paddingTop: 18, paddingX: 22, paddingBottom: 22, gap: 18 },
  verdict: {
    gap: 10,
    paddingY: 12,
    paddingX: 16,
    radius: 14,
    borderWidth: 2,
    iconSize: 22,
    /** the share of the verdict's colour mixed into the background */
    tint: 0.08,
    labelFontSize: 18,
    labelWeight: 700,
    labelSpacing: 0.06,
    subFontSize: 12,
  },
  reasons: { fontSize: 14, paddingLeft: 18 },
  loading: { gap: 8, fontSize: 13, iconSize: 16 },
  /** one identity step: its node on the line, then who it is */
  step: { gap: 16, paddingBottom: 22, bodyGap: 8 },
  /** the line that joins a step's node to the next one */
  line: { left: 15, top: 32, width: 2, okShare: 0.4 },
  node: { size: 32, borderWidth: 2, iconSize: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 0.08, paddingTop: 7 },
  identity: { gap: 14, avatarSize: 56, avatarRadius: 14, avatarFontSize: 18, textGap: 4 },
  name: { fontSize: 20, fontWeight: 700, gap: 8, lineHeight: 1.2, iconSize: 18 },
  facts: { gap: 14, columnGap: 2, fontSize: 13, linkGap: 3, linkIconSize: 11 },
  provenance: { fontSize: 13 },
  section: {
    paddingTop: 12,
    titleMarginBottom: 8,
    titleFontSize: 12,
    titleWeight: 700,
    titleSpacing: 0.08,
    titleGap: 8,
    iconSize: 16,
  },
  count: { minWidth: 20, height: 20, paddingX: 6, radius: 10, fontSize: 11, tint: 0.14 },
  row: { gap: 10, paddingY: 7, fontSize: 14, titleWeight: 600, titleGap: 6, titleIconSize: 14, linkIconSize: 12 },
  valid: { gap: 4, fontSize: 13, fontWeight: 600, iconSize: 14 },
  role: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.05,
    paddingY: 2,
    paddingX: 8,
    radius: 6,
    tint: 0.12,
    ecosystemTint: 0.14,
  },
  tag: { fontSize: 11, fontWeight: 600, radius: 6, paddingY: 1, paddingX: 6, tint: 0.12 },
  claims: { marginTop: 2, rowGap: 2, columnGap: 12, fontSize: 13 },
  endpoint: { fontSize: 12 },
  actions: { gap: 10, paddingTop: 14 },
} as const

export type ProofOfTrustDesign = typeof PROOF_OF_TRUST_DESIGN

/** Which colour role paints what on the Proof of Trust. */
export const PROOF_OF_TRUST_COLORS = {
  view: { background: 'surface' },
  card: { background: 'bg', border: 'border' },
  did: { text: 'muted' },
  verdictSub: { text: 'muted' },
  reasons: { text: 'danger' },
  loading: { text: 'muted' },
  line: { ok: 'ok', rest: 'border' },
  node: { ok: 'ok', bad: 'danger', background: 'bg' },
  kicker: { text: 'muted' },
  nameIcon: { color: 'muted' },
  facts: { text: 'muted' },
  provenance: { text: 'muted' },
  section: { border: 'border', title: 'muted' },
  count: { background: 'accent', text: 'accent' },
  valid: { ok: 'ok', bad: 'danger' },
  role: { text: 'accent', ecosystem: 'warning' },
  tag: { text: 'accent' },
  claims: { key: 'muted' },
} as const satisfies Record<string, Record<string, ColorRole>>

/** The verdict the card shows: the registry's answer once loaded, the agent's last known result before. */
export function verdictOf(
  details: Pick<TrustDetails, 'trusted'> | null | undefined,
  fallback: TrustResult
): TrustResult {
  if (!details) return fallback
  return details.trusted === null ? 'unverified' : details.trusted ? 'trusted' : 'untrusted'
}

/** The icon and the colour of a verdict: those of the trust mark. */
export const VERDICT_MARK = TRUST_MARK

/** A DID short enough for one line: its two ends. */
export function shortDid(did: string): string {
  return did.length > 48 ? `${did.slice(0, 22)}…${did.slice(-20)}` : did
}

/** ECS schema titles as people read them on the wallet cards. */
const ECS_LABEL: Record<string, string> = {
  ServiceCredential: 'ECS-Service',
  OrganizationCredential: 'ECS-Organization',
  PersonaCredential: 'ECS-Persona',
  UserAgentCredential: 'ECS-UserAgent',
}
export function schemaLabel(title: string): string {
  return ECS_LABEL[title] ?? title
}

/** The DID in the Verana search, from the graph's address. */
export function didSearchUrl(graphUrl: string, did: string): string {
  return `${graphUrl.replace(/graph\./, 'search.')}/?q=${encodeURIComponent(did)}`
}

/**
 * The wording of the card, in English: the browser's translation files hold the same keys (a test compares the
 * English one with this), and the app, which speaks English for now, reads it from here.
 */
export const PROOF_OF_TRUST_COPY = {
  title: 'Proof of Trust',
  loading: 'Checking the registry',
  copyDid: 'Copy the DID',
  openInGraph: 'Open in the Verana search',
  evaluated: 'Evaluated {{time}}',
  block: 'block {{block}}',
  service: 'Service',
  operatedBy: 'Operated by',
  selfIssued: 'Self-issued',
  issuedBy: 'Issued by {{name}}',
  issuedByUnknown: 'Issuer accredited',
  since: 'since {{time}}',
  validUntil: 'valid until {{time}}',
  minimumAge: 'Minimum age {{age}}',
  registryId: 'Registry id',
  jurisdiction: 'Jurisdiction',
  alsoPresents: 'Also presents',
  verified: 'verified',
  invalid: 'invalid',
  accreditations: 'Accreditations',
  endpoints: 'Endpoints in the DID Document',
  governance: 'Governance',
  ecosystem: 'Ecosystem',
  root: 'accredited by the ecosystem',
  egf: 'Governance framework',
  cgf: 'Corporate governance framework',
  corporation: 'Corporation {{id}}',
  via: 'via {{chain}}',
  'role.ECOSYSTEM': 'Ecosystem',
  'role.ISSUER_GRANTOR': 'Issuer grantor',
  'role.VERIFIER_GRANTOR': 'Verifier grantor',
  'role.ISSUER': 'Issuer',
  'role.VERIFIER': 'Verifier',
  'role.HOLDER': 'Holder',
} as const

export type ProofOfTrustKey = keyof typeof PROOF_OF_TRUST_COPY

/** The wording of a verdict and of the reasons behind one that is not "trusted" (the browser's `trust.*` keys). */
export const TRUST_COPY = {
  trusted: 'Trusted',
  untrusted: 'Untrusted',
  unverified: 'Could not verify',
  'reasons.not-trusted': 'The Verana registry does not vouch for this service.',
  'reasons.did-not-found': 'The DID is unknown to the registry.',
  'reasons.resolution-unavailable': 'The trust resolution service could not be reached.',
  'reasons.no-service-credential': 'No service credential was found.',
} as const

/** A text of the card with its values in place: what the renderer's translator returns. */
export type ProofOfTrustText = (key: ProofOfTrustKey, values?: Record<string, string | number>) => string

/** Fills the `{{name}}` places of a text. */
export function fillText(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''))
}

/** The card's wording in English, for a renderer with no translation files. */
export const proofOfTrustEnglish: ProofOfTrustText = (key, values) => fillText(PROOF_OF_TRUST_COPY[key], values)

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** One identity step as the card draws it: who the credential names, and what it says about them. */
export interface IdentityStepView {
  kind: 'service' | 'operator'
  valid: boolean
  /** "Service · ECS-Service" */
  kicker: string
  name: string
  logo?: string
  /** the icon before an operator's name */
  nameIcon?: 'building' | 'user'
  flag?: string
  countryCode?: string
  /** a service: its type, as a tag */
  tag?: string
  description?: string
  /** a service: the facts on one line; an operator: one per line */
  factsLayout: 'row' | 'column'
  facts: { label?: string; value: string }[]
  links: { label: 'terms' | 'privacy'; url: string }[]
  /** "Issued by … · ecosystem · since … · valid until …" */
  provenance: string
}

/**
 * An identity credential as its step shows it (UI-TRUST-003). `t` gives the wording, `day` writes a date; the
 * terms and privacy links carry a label the renderer words itself (they are the column's).
 */
export function identityStepOf(
  kind: 'service' | 'operator',
  card: CredentialCard,
  t: ProofOfTrustText,
  day: (iso: string) => string
): IdentityStepView {
  const c = card.claims
  const facts: IdentityStepView['facts'] = []
  const links: IdentityStepView['links'] = []
  if (kind === 'service') {
    if (typeof c.minimumAgeRequired === 'number' && c.minimumAgeRequired > 0)
      facts.push({ value: t('minimumAge', { age: c.minimumAgeRequired }) })
    const terms = text(c.termsAndConditionsUri)
    const privacy = text(c.privacyPolicyUri)
    if (terms) links.push({ label: 'terms', url: terms })
    if (privacy) links.push({ label: 'privacy', url: privacy })
  } else {
    const address = text(c.address)
    if (address) facts.push({ value: address })
    if (c.registryId) facts.push({ label: t('registryId'), value: String(c.registryId) })
    if (c.lei) facts.push({ label: 'LEI', value: String(c.lei) })
    if (c.legalJurisdiction) facts.push({ label: t('jurisdiction'), value: String(c.legalJurisdiction) })
  }
  const provenance = [
    card.selfIssued
      ? t('selfIssued')
      : card.issuer.name
        ? t('issuedBy', { name: card.issuer.name })
        : t('issuedByUnknown'),
    card.ecosystem.name,
    card.issuedAt ? t('since', { time: day(card.issuedAt) }) : undefined,
    card.validUntil ? t('validUntil', { time: day(card.validUntil) }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  const countryCode = text(c.countryCode)
  return {
    kind,
    valid: card.valid,
    kicker: `${t(kind === 'service' ? 'service' : 'operatedBy')} · ${schemaLabel(card.schemaTitle)}`,
    name: String(c.name ?? ''),
    logo: text(c.logoUri) ?? text(c.avatarUri),
    nameIcon: kind === 'operator' ? (card.ecsSchema === 'PersonaCredential' ? 'user' : 'building') : undefined,
    flag: flagOf(countryCode) || undefined,
    countryCode,
    tag: kind === 'service' ? text(c.type) : undefined,
    description: kind === 'service' ? text(c.description) : undefined,
    factsLayout: kind === 'service' ? 'row' : 'column',
    facts,
    links,
    provenance,
  }
}

/** The line under another credential the DID presents: its issuer, its ecosystem, its end. */
export function otherCredentialLine(card: CredentialCard, t: ProofOfTrustText, when: (iso: string) => string): string {
  return [
    card.issuer.name ? t('issuedBy', { name: card.issuer.name }) : undefined,
    card.ecosystem.name,
    card.validUntil ? t('validUntil', { time: when(card.validUntil) }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The line of an accreditation: its ecosystem, then the grantors between the ecosystem's root and this participant
 * (none means the ecosystem accredited it directly), then its state when it is not active.
 */
export function accreditationLine(a: Accreditation, t: ProofOfTrustText): string {
  const grantors = a.chain.filter((c) => c.participantId !== a.participantId && c.role !== 'ECOSYSTEM')
  return [
    a.ecosystem.name ?? `${t('ecosystem')} ${a.ecosystem.id}`,
    grantors.length
      ? t('via', { chain: grantors.map((c) => c.who.name ?? t(`role.${c.role}`)).join(' → ') })
      : t('root'),
    a.state !== 'ACTIVE' ? a.state.toLowerCase() : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The claims of a non-identity credential, flat key and value, strings and numbers only. */
export function claimRows(claims: Record<string, unknown>): { key: string; value: string; link: boolean }[] {
  return Object.entries(claims)
    .filter(([k, v]) => k !== 'id' && !/Sri$/.test(k) && (typeof v === 'string' || typeof v === 'number'))
    .map(([key, v]) => ({ key, value: String(v), link: /^https?:\/\//.test(String(v)) }))
}
