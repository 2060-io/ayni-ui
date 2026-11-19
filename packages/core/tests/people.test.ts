/** People, organizations and the admin view (profile 3.3 §3.9, PROF-DIR-001..003; UI-CONV-040, UI-CONV-042). */
import { describe, expect, it } from 'vitest'
import {
  adminChangesOf,
  adminRolesOf,
  looksLikeEmail,
  memberRefusalOf,
  organizationsOf,
  peopleOf,
} from '../src/people.js'

describe('the member picker and the organizations (PROF-DIR-001, PROF-DIR-002)', () => {
  it('reads the people of the employee list: a name and a department, nothing else', () => {
    expect(
      peopleOf({
        people: [
          { directoryId: 'emp_7', name: 'Ana Ríos', department: 'Dispatch', email: 'ana@northwind.example' },
          { directoryId: 'emp_8', name: 'Lea Fischer', department: null },
          { name: 'no id' },
        ],
      })
    ).toEqual([
      { directoryId: 'emp_7', name: 'Ana Ríos', department: 'Dispatch' },
      { directoryId: 'emp_8', name: 'Lea Fischer', department: null },
    ])
  })

  it('reads the organizations of the trust graph', () => {
    expect(
      organizationsOf({ organizations: [{ organizationKey: 'org:PL:0000123', name: 'Baltic Haul', country: 'PL' }] })
    ).toEqual([{ organizationKey: 'org:PL:0000123', name: 'Baltic Haul', country: 'PL' }])
    expect(organizationsOf({})).toEqual([])
  })

  it('says why an addition or an invitation was refused', () => {
    expect(memberRefusalOf({ status: 403, code: 'not-owner' })).toBe('notOwner')
    expect(memberRefusalOf({ status: 409, code: 'rule-membership' })).toBe('ruleMembership')
    expect(memberRefusalOf({ status: 409, code: 'owner' })).toBe('owner')
    expect(memberRefusalOf({ status: 409, code: 'already-member' })).toBe('alreadyMember')
    expect(memberRefusalOf({ status: 404, code: '404' })).toBe('unknownPerson')
    expect(memberRefusalOf({ status: 400, code: 'bad-request' })).toBe('badEmail')
    expect(memberRefusalOf({ status: 422, code: 'not-on-verana' })).toBe('notOnVerana')
    expect(memberRefusalOf({ status: 422, code: 'home-organization' })).toBe('homeOrganization')
    expect(memberRefusalOf({ status: 409, code: 'organization-not-accepted' })).toBe('organizationNotAccepted')
    expect(memberRefusalOf({ status: 503, code: 'email-unavailable' })).toBe('emailUnavailable')
    expect(memberRefusalOf(undefined)).toBe('other')
  })

  it('checks an email address before asking the agent', () => {
    expect(looksLikeEmail(' sam.okafor@baltichaul.example ')).toBe(true)
    expect(looksLikeEmail('sam@')).toBe(false)
    expect(looksLikeEmail('sam okafor@x.y')).toBe(false)
  })
})

describe('the admin view (PROF-DIR-003)', () => {
  it('reads who holds which role and why', () => {
    expect(
      adminRolesOf({
        entries: [
          {
            directoryId: 'emp_7',
            name: 'Ana Ríos',
            department: 'Dispatch',
            groups: ['drivers'],
            roles: ['dispatcher'],
            onAgent: true,
          },
        ],
      })
    ).toEqual([
      {
        directoryId: 'emp_7',
        name: 'Ana Ríos',
        department: 'Dispatch',
        groups: ['drivers'],
        roles: ['dispatcher'],
        onAgent: true,
      },
    ])
  })

  it('reads the changes of the list newest first', () => {
    const page = adminChangesOf({
      changes: [
        { at: '2026-11-16T00:00:00Z', kind: 'added', directoryId: 'emp_8', name: 'Lea Fischer', fields: [] },
        {
          at: '2026-11-18T00:00:00Z',
          kind: 'changed',
          directoryId: 'emp_7',
          name: 'Ana Ríos',
          fields: ['roles'],
          rolesBefore: ['dispatcher'],
          rolesAfter: ['dispatcher', 'creator'],
        },
        { at: '2026-11-17T00:00:00Z', kind: 'renamed', directoryId: 'x', name: 'x', fields: [] },
      ],
      nextBefore: 'chg_3',
    })
    expect(page.changes.map((c) => c.kind)).toEqual(['changed', 'added'])
    expect(page.changes[0].rolesAfter).toEqual(['dispatcher', 'creator'])
    expect(page.nextBefore).toBe('chg_3')
  })
})
