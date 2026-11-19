/**
 * People, organizations and the admin view (AG-UI profile 3.3 §3.9, PROF-DIR-001..003, agent D90, D92;
 * UI-CONV-040, UI-CONV-042): the member picker searches the agent's employee list, an invitation searches the
 * organizations of the trust graph, and the holders of the admin role read who holds which role and the changes of
 * the list.
 */

/** A person of the employee list, as the member picker sees them: a name and a department, nothing else. */
export interface DirectoryPerson {
  directoryId: string
  name: string
  department: string | null
}

/** An organization of the trust graph, for an invitation by organization and email. */
export interface OrganizationInfo {
  organizationKey: string
  name: string
  country: string
}

/** Who holds which role, and why: the entry of the employee list that gives it. */
export interface AdminRoleEntry {
  directoryId: string
  name: string
  department: string | null
  groups: string[]
  roles: string[]
  onAgent: boolean
}

export interface AdminChange {
  at: string
  kind: 'added' | 'removed' | 'changed'
  directoryId: string
  name: string
  fields: string[]
  rolesBefore?: string[]
  rolesAfter?: string[]
}

export interface AdminChangesPage {
  changes: AdminChange[]
  nextBefore: string | null
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])

export function peopleOf(body: unknown): DirectoryPerson[] {
  return list(obj(body).people)
    .filter((p) => typeof p.directoryId === 'string')
    .map((p) => ({
      directoryId: p.directoryId as string,
      name: str(p.name),
      department: typeof p.department === 'string' ? p.department : null,
    }))
}

export function organizationsOf(body: unknown): OrganizationInfo[] {
  return list(obj(body).organizations)
    .filter((o) => typeof o.organizationKey === 'string')
    .map((o) => ({ organizationKey: o.organizationKey as string, name: str(o.name), country: str(o.country) }))
}

export function adminRolesOf(body: unknown): AdminRoleEntry[] {
  return list(obj(body).entries)
    .filter((e) => typeof e.directoryId === 'string')
    .map((e) => ({
      directoryId: e.directoryId as string,
      name: str(e.name),
      department: typeof e.department === 'string' ? e.department : null,
      groups: strings(e.groups),
      roles: strings(e.roles),
      onAgent: e.onAgent === true,
    }))
}

export function adminChangesOf(body: unknown): AdminChangesPage {
  const b = obj(body)
  const changes = list(b.changes)
    .filter((c) => typeof c.at === 'string' && (c.kind === 'added' || c.kind === 'removed' || c.kind === 'changed'))
    .map(
      (c): AdminChange => ({
        at: c.at as string,
        kind: c.kind as AdminChange['kind'],
        directoryId: str(c.directoryId),
        name: str(c.name),
        fields: strings(c.fields),
        ...(Array.isArray(c.rolesBefore) ? { rolesBefore: strings(c.rolesBefore) } : {}),
        ...(Array.isArray(c.rolesAfter) ? { rolesAfter: strings(c.rolesAfter) } : {}),
      })
    )
    .sort((a, b) => b.at.localeCompare(a.at))
  return { changes, nextBefore: typeof b.nextBefore === 'string' && b.nextBefore ? b.nextBefore : null }
}

/**
 * Why an addition or an invitation was refused (PROF-SPACE-005, §3.7), as the key of the sentence the owner reads;
 * `other` for a refusal the profile does not name.
 */
export function memberRefusalOf(
  error: { status?: number; code?: string } | undefined
):
  | 'notOwner'
  | 'ruleMembership'
  | 'owner'
  | 'alreadyMember'
  | 'unknownPerson'
  | 'badEmail'
  | 'notOnVerana'
  | 'homeOrganization'
  | 'organizationNotAccepted'
  | 'emailUnavailable'
  | 'other' {
  switch (error?.code) {
    case 'not-owner':
      return 'notOwner'
    case 'rule-membership':
      return 'ruleMembership'
    case 'owner':
      return 'owner'
    case 'already-member':
      return 'alreadyMember'
    case 'not-on-verana':
      return 'notOnVerana'
    case 'home-organization':
      return 'homeOrganization'
    case 'organization-not-accepted':
      return 'organizationNotAccepted'
    case 'email-unavailable':
      return 'emailUnavailable'
    default:
      if (error?.status === 404) return 'unknownPerson'
      if (error?.status === 400) return 'badEmail'
      if (error?.status === 503) return 'emailUnavailable'
      return 'other'
  }
}

/** A plausible email address, checked before the agent is asked (the agent's 400 stays the authority). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
