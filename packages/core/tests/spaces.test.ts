/**
 * Spaces as the agent gives them and as a screen reads them (profile 3.3 §3.7, PROF-SPACE-001..007, PROF-STREAM-009;
 * UI-CONV-028..031, 040, 041, 043).
 */
import { describe, expect, it } from 'vitest'
import { changedConversation } from '../src/readState.js'
import {
  canWriteIn,
  chooserSpacesOf,
  hasOtherSpace,
  isPersonalConversation,
  lawfulBasisKeyOf,
  memberStateOf,
  membersLineOf,
  personalSpaceOf,
  ruleChoicesOf,
  type SpaceInfo,
  sharedConversationsOf,
  sharedRowsOf,
  showsHeaderChip,
  showsSpaceChooser,
  spaceActivityOf,
  spaceDetailOf,
  spaceRefOf,
  spaceRowsOf,
  spaceSegmentsOf,
  spacesOf,
  spacesWithLocal,
  spaceUnreadOf,
  templateOf,
} from '../src/spaces.js'

/** The example of §3.7, with Personal listed after another space to check the order. */
const BODY = {
  spaces: [
    {
      id: 'spc_truck14',
      kind: 'team',
      title: 'Truck 14 recall',
      purpose: 'Get every truck inspected.',
      brief: 'Form F-12.',
      templateId: 'project',
      language: 'en',
      rules: { retentionDays: 365, lawfulBasis: 'contract', allowedProviders: ['kimi'], handover: true },
      membership: { mode: 'list', memberCount: 5 },
      owner: { name: 'Jonas Weber' },
      role: 'member',
      state: 'active',
      unread: 2,
      lastActivityAt: '2026-11-18T10:46:00.000Z',
    },
    {
      id: 'spc_personal',
      kind: 'personal',
      title: 'Personal',
      purpose: '',
      brief: '',
      templateId: null,
      language: null,
      rules: { retentionDays: 90, lawfulBasis: 'consent', allowedProviders: ['kimi'], handover: false },
      membership: { mode: 'list', memberCount: 1 },
      owner: { name: 'Ana Ríos' },
      role: 'owner',
      state: 'active',
      unread: 0,
      lastActivityAt: '2026-11-18T09:12:00.000Z',
    },
    {
      id: 'spc_depot',
      kind: 'team',
      title: 'Depot Rotterdam',
      purpose: '',
      brief: '',
      templateId: 'department',
      language: null,
      rules: { retentionDays: 365, lawfulBasis: 'legitimate-interest', allowedProviders: [], handover: false },
      membership: { mode: 'rule', rule: { department: 'Depot Rotterdam' }, memberCount: 48 },
      owner: { name: 'Marta Kovač' },
      role: 'member',
      state: 'left',
      unread: 0,
      lastActivityAt: '2026-11-17T08:00:00.000Z',
    },
  ],
  templates: [{ id: 'project', title: 'Project', kind: 'team', membership: 'list' }],
}

const space = (over: Partial<SpaceInfo>): SpaceInfo => ({ ...(spacesOf(BODY).spaces[1] as SpaceInfo), ...over })

describe('the spaces of a person (PROF-SPACE-001)', () => {
  it('reads the shape of §3.7, Personal first, with the templates', () => {
    const { spaces, templates } = spacesOf(BODY)
    expect(spaces.map((s) => s.id)).toEqual(['spc_personal', 'spc_truck14', 'spc_depot'])
    expect(spaces[1]).toMatchObject({
      kind: 'team',
      templateId: 'project',
      language: 'en',
      rules: { retentionDays: 365, lawfulBasis: 'contract', allowedProviders: ['kimi'], handover: true },
      membership: { mode: 'list', memberCount: 5 },
      owner: { name: 'Jonas Weber' },
      role: 'member',
      state: 'active',
      unread: 2,
    })
    expect(spaces[2].membership).toEqual({ mode: 'rule', rule: { department: 'Depot Rotterdam' }, memberCount: 48 })
    expect(spaces[2].state).toBe('left')
    expect(templates).toEqual([{ id: 'project', title: 'Project', kind: 'team', membership: 'list' }])
    expect(personalSpaceOf(spaces)?.id).toBe('spc_personal')
  })

  it('fills in what an answer leaves out, and drops a space with no id', () => {
    const { spaces, templates } = spacesOf({ spaces: [{ id: 'spc_x' }, { title: 'no id' }], templates: [{}] })
    expect(spaces).toHaveLength(1)
    expect(spaces[0]).toMatchObject({
      kind: 'team',
      title: '',
      templateId: null,
      language: null,
      rules: { retentionDays: null, allowedProviders: [], handover: false },
      membership: { mode: 'list', memberCount: 0 },
      role: 'member',
      state: 'active',
      unread: 0,
    })
    expect(templates).toEqual([])
    expect(spacesOf(undefined)).toEqual({ spaces: [], templates: [] })
  })

  it('reads the bounds of a template when the agent gives them', () => {
    const template = templateOf({
      id: 'project',
      title: 'Project',
      kind: 'team',
      membership: 'list',
      rules: {
        retentionDays: { default: 365, min: 90, max: 730 },
        lawfulBasis: { default: 'contract', allowed: ['contract', 'legitimate-interest'] },
        allowedProviders: { default: ['kimi'], allowed: ['kimi', 'mistral'] },
        handover: { default: true, allowed: [true] },
      },
    })
    expect(template?.bounds).toEqual({
      retentionDays: { min: 90, max: 730 },
      lawfulBasis: ['contract', 'legitimate-interest'],
      allowedProviders: ['kimi', 'mistral'],
      handover: [true],
    })
    expect(templateOf({ id: 'p', title: 'P', kind: 'team', membership: 'list' })?.bounds).toBeUndefined()
  })
})

describe('the rows of the agent card (UI-CONV-028)', () => {
  const spaces = [
    space({ id: 'p', kind: 'personal' }),
    space({ id: 'a', kind: 'team', title: 'Truck 14 recall', lastActivityAt: '2026-11-18T10:00:00Z' }),
    space({ id: 'b', kind: 'team', title: 'Depot Rotterdam', lastActivityAt: '2026-11-17T10:00:00Z' }),
    space({ id: 'c', kind: 'organization', title: 'Northwind Logistics', lastActivityAt: '2026-11-16T10:00:00Z' }),
    space({ id: 'd', kind: 'team', title: 'Forklift licence', lastActivityAt: '2026-11-10T10:00:00Z' }),
  ]

  it('shows the three with the latest activity, then the rest behind a control', () => {
    const { rows, more } = spaceRowsOf([...spaces].reverse())
    expect(rows.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(more.map((s) => s.id)).toEqual(['d'])
  })

  it('a search shows every space whose title matches, whatever the case', () => {
    expect(spaceRowsOf(spaces, 'TRUCK')).toEqual({ rows: [spaces[1]], more: [] })
    expect(spaceRowsOf(spaces, 'licence').rows.map((s) => s.id)).toEqual(['d'])
    expect(spaceRowsOf(spaces, 'nothing').rows).toEqual([])
  })

  it('a space counts the unread of the person conversations of it, and their latest activity', () => {
    const conversations = [
      { spaceId: 'a', unreadCount: 2, lastMessageAt: '2026-11-18T11:00:00Z' },
      { spaceId: 'a', unreadCount: 1, lastMessageAt: '2026-11-18T09:00:00Z' },
      { spaceId: 'p', unreadCount: 4, lastMessageAt: '2026-11-18T08:00:00Z' },
    ]
    const local = spacesWithLocal(spaces, conversations)
    expect(local[1]).toMatchObject({ unread: 3, lastActivityAt: '2026-11-18T11:00:00Z' })
    // before any of its conversations is listed here, the agent's count
    expect(spaceUnreadOf({ id: 'b', unread: 5 }, conversations)).toBe(5)
    expect(local[2].lastActivityAt).toBe('2026-11-17T10:00:00Z')
  })

  it('with Personal alone, nothing reads as spaces; a conversation of an unknown space stays with Personal', () => {
    expect(hasOtherSpace([spaces[0]])).toBe(false)
    expect(hasOtherSpace(spaces)).toBe(true)
    expect(isPersonalConversation(undefined, spaces)).toBe(true)
    expect(isPersonalConversation('p', spaces)).toBe(true)
    expect(isPersonalConversation('a', spaces)).toBe(false)
    expect(isPersonalConversation('spc_unknown', spaces)).toBe(true)
  })
})

describe('the chip of a conversation (UI-CONV-029, UI-CONV-030)', () => {
  const personal = space({ id: 'p', kind: 'personal' })
  const team = space({ id: 'a', kind: 'team' })

  it('the empty conversation shows its space once there is another or a template to create one', () => {
    expect(showsSpaceChooser(undefined)).toBe(false)
    expect(showsSpaceChooser({ spaces: [personal], templates: [] })).toBe(false)
    expect(showsSpaceChooser({ spaces: [personal, team], templates: [] })).toBe(true)
    expect(
      showsSpaceChooser({ spaces: [personal], templates: [{ id: 't', title: 'T', kind: 'team', membership: 'list' }] })
    ).toBe(true)
  })

  it('the header names Personal only once the person has another space', () => {
    expect(showsHeaderChip({ kind: 'personal' }, [personal])).toBe(false)
    expect(showsHeaderChip({ kind: 'personal' }, [personal, team])).toBe(true)
    expect(showsHeaderChip({ kind: 'team' }, [personal])).toBe(true)
    expect(showsHeaderChip(null, [personal, team])).toBe(false)
  })

  it('the chooser offers Personal first, then the spaces the person is active in', () => {
    const left = space({ id: 'l', kind: 'team', state: 'left' })
    expect(chooserSpacesOf([team, left, personal]).map((s) => s.id)).toEqual(['p', 'a'])
  })

  it('reads the space of a conversation from its state (PROF-STREAM-009)', () => {
    expect(spaceRefOf({ space: { id: 'spc_1', title: 'Truck 14 recall', kind: 'team' } })).toEqual({
      id: 'spc_1',
      title: 'Truck 14 recall',
      kind: 'team',
    })
    expect(spaceRefOf({ context: {} })).toBeNull()
    expect(spaceRefOf(null)).toBeNull()
  })

  it('a conversation changed elsewhere names its space and its share (PROF-CONV-010)', () => {
    expect(
      changedConversation({
        type: 'CUSTOM',
        name: 'ayni.conversation.changed',
        value: { conversationId: 'c1', title: 'x', state: 'active', spaceId: 'spc_1', shared: true },
      })
    ).toMatchObject({ spaceId: 'spc_1', shared: true })
  })
})

describe('a space in words (UI-CONV-031)', () => {
  it('names its members as a list or as the rule', () => {
    expect(membersLineOf(space({ kind: 'personal' }))).toEqual({ kind: 'personal' })
    expect(membersLineOf(space({ kind: 'team', membership: { mode: 'list', memberCount: 5 } }))).toEqual({
      kind: 'list',
      count: 5,
    })
    expect(
      membersLineOf(
        space({ kind: 'team', membership: { mode: 'rule', rule: { department: 'Depot' }, memberCount: 48 } })
      )
    ).toEqual({ kind: 'department', name: 'Depot', count: 48 })
    expect(
      membersLineOf(space({ kind: 'team', membership: { mode: 'rule', rule: { group: 'Drivers' }, memberCount: 9 } }))
    ).toEqual({ kind: 'group', name: 'Drivers', count: 9 })
    expect(
      membersLineOf(
        space({ kind: 'organization', membership: { mode: 'rule', rule: { organization: true }, memberCount: 312 } })
      )
    ).toEqual({ kind: 'organization', count: 312 })
  })

  it('says the lawful basis in the person words', () => {
    expect(lawfulBasisKeyOf('contract')).toBe('contract')
    expect(lawfulBasisKeyOf('consent')).toBe('consent')
    expect(lawfulBasisKeyOf('legitimate-interest')).toBe('legitimateInterest')
    expect(lawfulBasisKeyOf('vital-interest')).toBe('other')
  })

  it('gives the owner three more segments, in this order', () => {
    expect(spaceSegmentsOf({ kind: 'team', role: 'member' })).toEqual(['conversations', 'memories', 'about'])
    expect(spaceSegmentsOf({ kind: 'team', role: 'owner' })).toEqual([
      'conversations',
      'memories',
      'about',
      'members',
      'settings',
      'activity',
    ])
    expect(spaceSegmentsOf({ kind: 'personal', role: 'owner' })).toEqual(['conversations', 'memories', 'about'])
  })

  it('a space the person left takes no more messages (UI-CONV-043)', () => {
    expect(canWriteIn(space({ state: 'left' }))).toBe(false)
    expect(canWriteIn(space({ state: 'active' }))).toBe(true)
    expect(canWriteIn(undefined)).toBe(true)
  })
})

describe('the members of a space (PROF-SPACE-003, UI-CONV-040)', () => {
  it('reads the members of a list space', () => {
    const detail = spaceDetailOf({
      ...BODY.spaces[0],
      members: [
        { memberId: 'mem_1', name: 'Jonas Weber', organization: 'Northwind Logistics', state: 'active', role: 'owner' },
        {
          memberId: 'mem_2',
          name: 'sam@baltichaul.example',
          organization: 'Baltic Haul',
          state: 'invited',
          role: 'guest',
        },
        { name: 'no id' },
      ],
    })
    expect(detail?.members).toEqual([
      { memberId: 'mem_1', name: 'Jonas Weber', organization: 'Northwind Logistics', state: 'active', role: 'owner' },
      {
        memberId: 'mem_2',
        name: 'sam@baltichaul.example',
        organization: 'Baltic Haul',
        state: 'invited',
        role: 'guest',
      },
    ])
    expect(spaceDetailOf(BODY.spaces[2])?.members).toBeUndefined()
  })

  it('names the state of each member', () => {
    expect(memberStateOf({ state: 'active', role: 'owner' })).toBe('owner')
    expect(memberStateOf({ state: 'active', role: 'member' })).toBe('active')
    expect(memberStateOf({ state: 'invited', role: 'member' })).toBe('notYetOn')
    expect(memberStateOf({ state: 'invited', role: 'guest' })).toBe('invited')
    expect(memberStateOf({ state: 'left', role: 'member' })).toBe('left')
  })

  it('offers the values the template allows, the current one always among them (UI-CONV-041)', () => {
    const current = space({
      rules: { retentionDays: 365, lawfulBasis: 'contract', allowedProviders: ['kimi'], handover: true },
    })
    expect(
      ruleChoicesOf(current, {
        retentionDays: { min: 90, max: 730 },
        lawfulBasis: ['legitimate-interest'],
        allowedProviders: ['kimi', 'mistral'],
        handover: [true],
      })
    ).toEqual({
      lawfulBasis: ['legitimate-interest', 'contract'],
      allowedProviders: ['kimi', 'mistral'],
      handover: [true],
      retention: { min: 90, max: 730 },
    })
    expect(ruleChoicesOf(current, undefined)).toEqual({
      lawfulBasis: ['contract', 'consent', 'legitimate-interest'],
      allowedProviders: ['kimi'],
      handover: [true, false],
      retention: {},
    })
  })

  it('reads the activity newest first as given, leaving out kinds it does not know (PROF-SPACE-006)', () => {
    const page = spaceActivityOf({
      activity: [
        {
          at: '2026-11-18T10:00:00Z',
          kind: 'owner-changed',
          by: { name: 'Jonas Weber' },
          member: { name: 'Ana Ríos' },
        },
        { at: '2026-11-17T10:00:00Z', kind: 'renamed' },
        { at: '2026-11-16T10:00:00Z', kind: 'created', by: { name: 'Jonas Weber' } },
      ],
      nextBefore: 'act_3',
    })
    expect(page.activity.map((a) => a.kind)).toEqual(['owner-changed', 'created'])
    expect(page.activity[0]).toEqual({
      at: '2026-11-18T10:00:00Z',
      kind: 'owner-changed',
      by: { name: 'Jonas Weber' },
      member: { name: 'Ana Ríos' },
    })
    expect(page.nextBefore).toBe('act_3')
    expect(spaceActivityOf({ activity: [] }).nextBefore).toBeNull()
  })

  it('reads the conversations shared with a space (PROF-SPACE-007)', () => {
    expect(
      sharedConversationsOf({
        conversations: [
          {
            id: 'conv_9',
            title: 'Recall R-2291, first inspection',
            author: { name: 'Jonas Weber' },
            sharedAt: '2026-11-12T10:00:00Z',
            lastActivityAt: '2026-11-12T11:00:00Z',
          },
        ],
      })
    ).toEqual([
      {
        id: 'conv_9',
        title: 'Recall R-2291, first inspection',
        author: { name: 'Jonas Weber' },
        sharedAt: '2026-11-12T10:00:00Z',
        lastActivityAt: '2026-11-12T11:00:00Z',
      },
    ])
  })

  it("lists every conversation shared with the space, the person's own with their session of it (UI-CONV-031)", () => {
    const at = '2026-11-12T10:00:00Z'
    const shared = [
      { id: 'conv_9', title: 'Recall R-2291', author: { name: 'Jonas Weber' }, sharedAt: at, lastActivityAt: at },
      { id: 'conv_3', title: 'Caliper check', author: { name: 'Ana Ríos' }, sharedAt: at, lastActivityAt: at },
    ]
    const sessions = [
      { sessionId: 's_old', agentDid: 'did:web:a', conversationId: 'conv_3', archived: true },
      { sessionId: 's3', agentDid: 'did:web:a', conversationId: 'conv_3' },
      // another agent's conversation with the same id is not the person's own here
      { sessionId: 's9', agentDid: 'did:web:b', conversationId: 'conv_9' },
    ]
    const rows = sharedRowsOf(shared, sessions, 'did:web:a')
    expect(rows.map((r) => r.conversation.id)).toEqual(['conv_9', 'conv_3'])
    expect(rows[0].own).toBeNull()
    expect(rows[1].own?.sessionId).toBe('s3')
    // an archived record is still the person's own
    expect(sharedRowsOf(shared, sessions.slice(0, 1), 'did:web:a')[1].own?.sessionId).toBe('s_old')
    expect(sharedRowsOf([], sessions, 'did:web:a')).toEqual([])
  })
})
