/**
 * A space's page (UI-CONV-031): its header, Conversations (Yours, Shared with the space), Your memories and About, and
 * for its owner Members, Settings and Activity (UI-CONV-040, UI-CONV-041); a conversation shared by someone else, read
 * only (UI-CONV-038); New space from a template (UI-CONV-039); a space the person left (UI-CONV-043).
 */
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SharedConversationView } from '../src/components/SharedConversation.js'
import { SpacePage } from '../src/components/SpacePage.js'
import { CreateSpaceDialog } from '../src/components/SpaceParts.js'
import {
  AGENT,
  agentRecord,
  byText,
  click,
  DEPOT,
  fakeAgent,
  json,
  PERSONAL,
  record,
  render,
  SPACES,
  setup,
  TRUCK,
  tab,
  teardown,
  type,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const OWNED = { ...TRUCK, role: 'owner' as const, owner: { name: 'Ana Ríos' } }
const MEMBERS = [
  { memberId: 'mem_1', name: 'Jonas Weber', organization: 'Northwind Logistics', state: 'active', role: 'owner' },
  { memberId: 'mem_2', name: 'Ana Ríos', organization: 'Northwind Logistics', state: 'active', role: 'member' },
  { memberId: 'mem_3', name: 'Lea Fischer', organization: 'Northwind Logistics', state: 'invited', role: 'member' },
  {
    memberId: 'mem_4',
    name: 'sam.okafor@baltichaul.example',
    organization: 'Baltic Haul',
    state: 'invited',
    role: 'guest',
  },
  { memberId: 'mem_5', name: 'Piet de Vries', organization: 'Northwind Logistics', state: 'left', role: 'member' },
]
const MEMORIES = {
  preferences: [{ key: 'style', value: 'Answer in short, numbered steps', updatedAt: '2026-11-14T00:00:00Z' }],
  memories: [
    {
      id: 'mem_a',
      spaceId: TRUCK.id,
      content: "Recall sign-offs need the depot lead's confirmation before 18:00.",
      createdAt: '2026-11-18T10:47:00Z',
      updatedAt: '2026-11-18T10:47:00Z',
      source: { conversationId: 'conv_s3', title: 'Caliper check' },
    },
    {
      id: 'mem_b',
      spaceId: TRUCK.id,
      content: 'You want form F-12 as a PDF.',
      createdAt: '2026-11-11T10:00:00Z',
      updatedAt: '2026-11-11T10:00:00Z',
    },
  ],
}

function agentFor(space = TRUCK) {
  return fakeAgent([
    [`GET /spaces/${space.id}`, () => json({ ...space, members: MEMBERS })],
    [
      `GET /spaces/${space.id}/shared`,
      () =>
        json({
          conversations: [
            {
              id: 'conv_9',
              title: 'Recall R-2291, first inspection',
              author: { name: 'Jonas Weber' },
              sharedAt: '2026-11-12T10:00:00Z',
              lastActivityAt: '2026-11-12T11:00:00Z',
            },
            // Ana's own, shared: under Yours with its tag, and under Shared with the space as hers
            {
              id: 'conv_s3',
              title: 'Caliper check',
              author: { name: 'Ana Ríos' },
              sharedAt: '2026-11-18T10:00:00Z',
              lastActivityAt: '2026-11-18T10:46:00Z',
            },
          ],
        }),
    ],
    [`GET /memories?spaceId=${space.id}`, () => json(MEMORIES)],
    ['GET /spaces', () => json(SPACES)],
  ])
}

async function page(space = TRUCK, segment: string = 'conversations', spaces = SPACES) {
  const list = { ...spaces, spaces: spaces.spaces.map((s) => (s.id === space.id ? space : s)) }
  const hub = await tab({
    sessions: [
      record({ sessionId: 's3', title: 'Caliper check', spaceId: TRUCK.id, shared: true, unreadCount: 1 }),
      record({ sessionId: 's5', title: 'Brake parts order', spaceId: TRUCK.id }),
      record({ sessionId: 's1', title: 'Overtime for November', spaceId: PERSONAL.id }),
    ],
    spaces: list,
    snapshot: { view: 'space', spaceFor: { agentDid: AGENT, spaceId: space.id, segment: segment as never } },
  })
  const el = await render(hub, <SpacePage />)
  return { hub, el }
}
const tabs = (el: HTMLElement) => [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent)

describe('the page of a space (UI-CONV-031)', () => {
  it('a member sees the header and three segments, in this order', async () => {
    agentFor()
    const { el } = await page()
    expect(el.querySelector('.space-header h1')?.textContent).toBe('Truck 14 recall')
    expect(el.querySelector('.space-header .conv-sub')?.textContent).toBe('Team space · Jonas Weber owns it')
    expect(el.querySelector('.space-header .space-tile svg')).toBeTruthy()
    expect(tabs(el)).toEqual(['Conversations', 'Your memories', 'About'])
  })

  it('the owner sees Members, Settings and Activity too', async () => {
    agentFor(OWNED)
    const { el } = await page(OWNED)
    expect(el.querySelector('.space-header .conv-sub')?.textContent).toBe('Team space · you own it')
    expect(tabs(el)).toEqual(['Conversations', 'Your memories', 'About', 'Members', 'Settings', 'Activity'])
  })

  it('Conversations: New conversation, the person own ones, then everything shared with the space', async () => {
    agentFor()
    const { hub, el } = await page()
    await until(() => !!el.querySelector('.shared-row'))
    const yours = byText(el, '.section-label', 'Yours')?.parentElement as HTMLElement
    expect(yours.textContent).toContain('Only you can read these')
    expect([...yours.querySelectorAll('.conv-row .title')].map((t) => t.textContent)).toEqual([
      'Caliper check',
      'Brake parts order',
    ])
    // shared by Ana: its row says so
    expect(yours.querySelector('.shared-tag')?.textContent).toBe('Shared with Truck 14 recall')
    const shared = [...el.querySelectorAll('.shared-row')]
    expect(shared).toHaveLength(2)
    expect(shared[0].textContent).toContain('Recall R-2291, first inspection')
    expect(shared[0].textContent).toContain('Jonas Weber · ')
    // Ana's own share is listed too, with "You" as its author
    expect(shared[1].textContent).toContain('Caliper check')
    expect(shared[1].querySelector('.space-sub')?.textContent).toMatch(/^You · /)
    expect(byText(el, '.section-label', 'Shared with the space')?.parentElement?.textContent).toContain(
      'Read-only, shared by their author'
    )
    await click(shared[0])
    expect(hub.getSnapshot()).toMatchObject({ view: 'shared', sharedFor: { spaceId: TRUCK.id } })
    expect(hub.getSnapshot().sharedFor?.conversation.id).toBe('conv_9')
  })

  it("the person's own share opens as their conversation, not read-only", async () => {
    agentFor()
    const { hub, el } = await page()
    await until(() => el.querySelectorAll('.shared-row').length === 2)
    await click(el.querySelectorAll('.shared-row')[1])
    expect(hub.getSnapshot()).toMatchObject({ view: 'conversation', selectedSessionId: 's3' })
    expect(hub.getSnapshot().sharedFor ?? null).toBeNull()
  })

  it("another space never shows this space's shared list, not even while its own is read", async () => {
    let answer: (r: Response) => void = () => undefined
    fakeAgent([
      [
        `GET /spaces/${TRUCK.id}/shared`,
        () =>
          json({
            conversations: [
              {
                id: 'conv_9',
                title: 'Recall R-2291, first inspection',
                author: { name: 'Jonas Weber' },
                sharedAt: '2026-11-12T10:00:00Z',
                lastActivityAt: '2026-11-12T11:00:00Z',
              },
            ],
          }),
      ],
      // the other space's list is still on its way
      [`GET /spaces/${DEPOT.id}/shared`, () => new Promise<Response>((r) => (answer = r))],
      [/^GET \/spaces\/[^/]+$/, () => json({})],
      [/^GET \/memories/, () => json({ preferences: [], memories: [] })],
      ['GET /spaces', () => json(SPACES)],
    ])
    const { hub, el } = await page()
    await until(() => el.querySelectorAll('.shared-row').length === 1)
    await act(async () => hub.openSpace(AGENT, DEPOT.id))
    expect(el.querySelector('.space-header h1')?.textContent).toBe('Depot Rotterdam')
    expect(el.querySelector('.shared-row')).toBeNull()
    expect(el.textContent).not.toContain('Recall R-2291, first inspection')
    await act(async () => answer(json({ conversations: [] })))
    await until(() => el.textContent?.includes('Nothing is shared with this space yet.'))
    expect(el.querySelector('.shared-row')).toBeNull()
  })

  it('Your memories: the person memories of the space, newest first, which only they see', async () => {
    agentFor()
    const { hub, el } = await page(TRUCK, 'memories')
    await until(() => el.querySelectorAll('.memory-item').length === 2)
    expect(el.textContent).toContain('Only you see these')
    expect([...el.querySelectorAll('.memory-text')].map((m) => m.textContent)).toEqual([
      "Recall sign-offs need the depot lead's confirmation before 18:00.",
      'You want form F-12 as a PDF.',
    ])
    expect(el.querySelector('.memory-by')?.textContent).toContain('From Caliper check')
    await click(el.querySelector('.memory-item'))
    expect(hub.getSnapshot().memoryFor).toEqual({ agentDid: AGENT, memoryId: 'mem_a', spaceId: TRUCK.id })
  })

  it('About: the purpose with its owner, the brief, the language, the rules in plain words, the members', async () => {
    agentFor()
    const { el } = await page(TRUCK, 'about')
    await until(() => el.querySelectorAll('.member-row').length > 0)
    const text = el.textContent ?? ''
    expect(el.querySelector('.space-purpose')?.textContent).toBe(TRUCK.purpose)
    expect(el.querySelector('.purpose-by')?.textContent).toBe('Jonas Weber')
    expect(text).toContain(TRUCK.brief)
    expect(text).toContain('Fleet support writes for this space in English')
    const rules = [...el.querySelectorAll('.rule-line')].map((r) => r.textContent)
    expect(rules).toEqual([
      'Fleet support writes for this space in English',
      'Conversations kept 365 days',
      'Why Fleet support may keep them: a contract with you',
      'Models that may process them: kimi',
      'Conversations can be shared with the space, read-only',
    ])
    expect(el.querySelector('.members-line')?.textContent).toBe('5 members, a list kept by Jonas Weber')
    const members = [...el.querySelectorAll('.member-row')]
    // the members in the list, the owner marked; who left is not a member
    expect(members.map((m) => m.querySelector('.space-name')?.textContent)).toEqual([
      'Jonas Weber',
      'Ana Ríos',
      'Lea Fischer',
      'sam.okafor@baltichaul.example',
    ])
    expect(members[0].querySelector('.tag')?.textContent).toBe('Owner')
    expect(text).toContain('Managers do not see your conversations, and your memories here are yours alone.')
  })

  it('About of a rule space: the rule in words with its count', async () => {
    agentFor(DEPOT)
    const { el } = await page(DEPOT, 'about')
    expect(el.querySelector('.members-line')?.textContent).toBe('Everyone in Depot Rotterdam, 48 people')
    expect(el.querySelector('.member-row')).toBeNull()
    expect(el.textContent).toContain('Why Fleet support may keep them: a contract with you')
  })

  it('a space the person left says so, and starts no conversation (UI-CONV-043)', async () => {
    agentFor()
    const { el } = await page({ ...TRUCK, state: 'left' })
    expect(el.querySelector('.banner.info')?.textContent).toBe('You are no longer in Truck 14 recall')
    expect((byText(el, 'button', 'New conversation') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('the owner manages the members of a list space (UI-CONV-040)', () => {
  it('lists the members with their state, the owner marked', async () => {
    agentFor(OWNED)
    const { el } = await page(OWNED, 'members')
    await until(() => el.querySelectorAll('.members-table tbody tr').length === 5)
    const rows = [...el.querySelectorAll('.members-table tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((c) => (c.querySelector('.member-name b') ?? c).textContent)
    )
    expect(rows.map((r) => [r[0], r[2], r[3]])).toEqual([
      ['Jonas Weber', 'Owner', ''],
      ['Ana Ríos', 'Member', 'Remove'],
      ['Lea Fischer', 'Not yet on Fleet support', 'Remove'],
      ['sam.okafor@baltichaul.example', 'Invited', 'Remove'],
      ['Piet de Vries', 'Left', ''],
    ])
    expect(rows[3][1]).toBe('Baltic Haul')
  })

  it('Add searches the employee list and adds the person', async () => {
    const agent = agentFor(OWNED)
    agent.calls.length = 0
    const routes = fakeAgent([
      [
        /^GET \/directory\?q=Lea/,
        () => json({ people: [{ directoryId: 'emp_8', name: 'Lea Fischer', department: 'Dispatch, Rotterdam' }] }),
      ],
      [`POST /spaces/${OWNED.id}/members`, () => json({ memberId: 'mem_9' }, 201)],
      [`GET /spaces/${OWNED.id}`, () => json({ ...OWNED, members: MEMBERS })],
      ['GET /spaces', () => json(SPACES)],
    ])
    const { hub, el } = await page(OWNED, 'members')
    await click(byText(el, 'button', 'Add'))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getAttribute('aria-label')).toBe('Northwind Logistics employee list')
    await type(dialog.querySelector('input[type="search"]'), 'Lea')
    await until(() => !!dialog.querySelector('.member-row'), 3000)
    expect(dialog.querySelector('.member-row')?.textContent).toContain('Dispatch, Rotterdam')
    await click(dialog.querySelector('.member-row button'))
    await until(() => routes.find('POST', `/spaces/${OWNED.id}/members`).length === 1)
    expect(routes.find('POST', `/spaces/${OWNED.id}/members`)[0].body).toEqual({ directoryId: 'emp_8' })
    await until(() => hub.getSnapshot().notice?.text === 'Lea Fischer was added to Truck 14 recall.')
  })

  it('invites someone outside the organization by organization and email', async () => {
    const routes = fakeAgent([
      [
        /^GET \/organizations\?q=Baltic/,
        () => json({ organizations: [{ organizationKey: 'org:PL:0000123', name: 'Baltic Haul', country: 'PL' }] }),
      ],
      [`POST /spaces/${OWNED.id}/members`, () => json({ memberId: 'mem_9' }, 201)],
      [`GET /spaces/${OWNED.id}`, () => json({ ...OWNED, members: MEMBERS })],
      ['GET /spaces', () => json(SPACES)],
    ])
    const { hub, el } = await page(OWNED, 'members')
    await click(byText(el, 'button', 'Invite someone outside Northwind Logistics'))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Only organizations on Verana can be invited.')
    await type(dialog.querySelector('input[type="search"]'), 'Baltic')
    await until(() => !!byText(dialog, '.choice b', 'Baltic Haul'), 3000)
    await click(byText(dialog, '.choice', /Baltic Haul/))
    await type(dialog.querySelector('input[type="email"]'), 'sam.okafor@baltichaul.example')
    await click(byText(dialog, 'button', 'Invite'))
    await until(() => routes.find('POST', `/spaces/${OWNED.id}/members`).length === 1)
    expect(routes.find('POST', `/spaces/${OWNED.id}/members`)[0].body).toEqual({
      organizationKey: 'org:PL:0000123',
      email: 'sam.okafor@baltichaul.example',
    })
    await until(() => hub.getSnapshot().notice?.text === 'Invitation sent to sam.okafor@baltichaul.example.')
  })

  it('says why an invitation is refused', async () => {
    fakeAgent([
      [
        /^GET \/organizations/,
        () => json({ organizations: [{ organizationKey: 'org:NL:1', name: 'Acme', country: 'NL' }] }),
      ],
      [`POST /spaces/${OWNED.id}/members`, () => json({ error: 'organization-not-accepted' }, 409)],
      [`GET /spaces/${OWNED.id}`, () => json({ ...OWNED, members: MEMBERS })],
    ])
    const { el } = await page(OWNED, 'members')
    await click(byText(el, 'button', 'Invite someone outside Northwind Logistics'))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await type(dialog.querySelector('input[type="search"]'), 'Acme')
    await until(() => !!byText(dialog, '.choice b', 'Acme'), 3000)
    await click(byText(dialog, '.choice', /Acme/))
    await type(dialog.querySelector('input[type="email"]'), 'jo@acme.example')
    await click(byText(dialog, 'button', 'Invite'))
    await until(() => !!dialog.querySelector('.banner'))
    expect(dialog.querySelector('.banner')?.textContent).toBe('This organization cannot be invited to this space.')
  })

  it('Remove takes a member out', async () => {
    const routes = fakeAgent([
      [`GET /spaces/${OWNED.id}`, () => json({ ...OWNED, members: MEMBERS })],
      [`DELETE /spaces/${OWNED.id}/members/mem_3`, () => new Response(null, { status: 204 })],
      ['GET /spaces', () => json(SPACES)],
    ])
    const { el } = await page(OWNED, 'members')
    await until(() => el.querySelectorAll('.members-table tbody tr').length === 5)
    await click([...el.querySelectorAll('.members-table tbody tr')][2].querySelector('button'))
    await until(() => routes.find('DELETE', `/spaces/${OWNED.id}/members/mem_3`).length === 1)
  })

  it('a rule space shows its rule and its count, with no Add or Remove', async () => {
    const ownedDepot = { ...DEPOT, role: 'owner' as const }
    agentFor(ownedDepot)
    const { el } = await page(ownedDepot, 'members')
    expect(el.querySelector('.members-line')?.textContent).toBe('Everyone in Depot Rotterdam, 48 people')
    expect(byText(el, 'button', 'Add')).toBeUndefined()
    expect(el.querySelector('.members-table')).toBeNull()
  })
})

describe('the owner settings and activity (UI-CONV-041)', () => {
  const bounded = {
    ...SPACES,
    templates: [
      {
        id: 'project',
        title: 'Project',
        kind: 'team' as const,
        membership: 'list' as const,
        bounds: {
          retentionDays: { min: 90, max: 730 },
          lawfulBasis: ['contract'],
          allowedProviders: ['kimi', 'mistral'],
          handover: [true, false],
        },
      },
    ],
  }

  it('offers only the values the template allows, and saves a change within them', async () => {
    const routes = fakeAgent([
      [
        `PATCH /spaces/${OWNED.id}`,
        (call) => json({ ...OWNED, rules: { ...OWNED.rules, ...(call.body as { rules: object }).rules } }),
      ],
      [`GET /spaces/${OWNED.id}`, () => json({ ...OWNED, members: MEMBERS })],
      ['GET /spaces', () => json(bounded)],
    ])
    const { hub, el } = await page(OWNED, 'settings', bounded)
    const retention = el.querySelector('input[type="number"]') as HTMLInputElement
    expect([retention.min, retention.max]).toEqual(['90', '730'])
    expect(el.textContent).toContain('The template allows 90 to 730 days.')
    const basis = [...el.querySelectorAll('select')].find((s) =>
      s.closest('label')?.textContent?.startsWith('Why')
    ) as HTMLSelectElement
    expect([...basis.options].map((o) => o.value)).toEqual(['contract'])
    expect(basis.disabled).toBe(true)
    expect([...el.querySelectorAll('.check')].map((c) => c.textContent)).toContain('mistral')
    await type(retention, '730')
    await click(byText(el, 'button', 'Save changes'))
    await until(() => routes.find('PATCH', `/spaces/${OWNED.id}`).length === 1)
    expect(routes.find('PATCH', `/spaces/${OWNED.id}`)[0].body).toEqual({ rules: { retentionDays: 730 } })
    await until(() => hub.getSnapshot().notice?.text === 'Saved.')
  })

  it('names the field the agent finds out of bounds', async () => {
    fakeAgent([
      [`PATCH /spaces/${OWNED.id}`, () => json({ error: 'out-of-bounds', field: 'rules.retentionDays' }, 422)],
      [`GET /spaces/${OWNED.id}`, () => json({ ...OWNED, members: MEMBERS })],
    ])
    const { el } = await page(OWNED, 'settings')
    await type(el.querySelector('input[type="number"]'), '731')
    await click(byText(el, 'button', 'Save changes'))
    await until(() => !!el.querySelector('.settings-form .banner'))
    expect(el.querySelector('.settings-form .banner')?.textContent).toBe(
      'The template does not allow this value: Conversations kept, in days.'
    )
  })

  it('hands the space to a member, whose Settings the former owner no longer sees', async () => {
    const after = { ...OWNED, role: 'member' as const, owner: { name: 'Jonas Weber' } }
    const routes = fakeAgent([
      [`GET /spaces/${OWNED.id}`, () => json({ ...OWNED, members: MEMBERS })],
      [`POST /spaces/${OWNED.id}/owner`, () => json(after)],
      ['GET /spaces', () => json({ ...SPACES, spaces: [PERSONAL, after] })],
    ])
    const { hub, el } = await page(OWNED, 'settings')
    const select = el.querySelector('.transfer select') as HTMLSelectElement
    await until(() => select.options.length > 1)
    expect([...select.options].map((o) => o.textContent)).toEqual(['Choose a member', 'Ana Ríos'])
    await type(select, 'mem_2')
    await click(byText(el, '.transfer button', 'Transfer ownership'))
    await until(() => routes.find('POST', `/spaces/${OWNED.id}/owner`).length === 1)
    expect(routes.find('POST', `/spaces/${OWNED.id}/owner`)[0].body).toEqual({ memberId: 'mem_2' })
    await until(() => tabs(el).length === 3)
    expect(hub.getSnapshot().spaceFor?.segment).toBe('about')
  })

  it('Activity lists what happened, newest first, and pages back', async () => {
    const routes = fakeAgent([
      [
        `GET /spaces/${OWNED.id}/activity?limit=50`,
        () =>
          json({
            activity: [
              {
                at: '2026-11-18T10:00:00Z',
                kind: 'owner-changed',
                by: { name: 'Jonas Weber' },
                member: { name: 'Ana Ríos' },
              },
              { at: '2026-11-17T10:00:00Z', kind: 'rules-changed', by: { name: 'Jonas Weber' } },
              {
                at: '2026-11-16T10:00:00Z',
                kind: 'invited',
                by: { name: 'Jonas Weber' },
                member: { name: 'Sam Okafor' },
              },
            ],
            nextBefore: 'act_3',
          }),
      ],
      [
        `GET /spaces/${OWNED.id}/activity?limit=50&before=act_3`,
        () =>
          json({
            activity: [{ at: '2026-11-10T10:00:00Z', kind: 'created', by: { name: 'Jonas Weber' } }],
            nextBefore: null,
          }),
      ],
    ])
    const { el } = await page(OWNED, 'activity')
    await until(() => el.querySelectorAll('.activity-list li').length === 3)
    const lines = () => [...el.querySelectorAll('.activity-list li span:last-child')].map((s) => s.textContent)
    expect(lines()).toEqual([
      'Jonas Weber handed the space to Ana Ríos',
      'Jonas Weber changed the rules',
      'Jonas Weber invited Sam Okafor',
    ])
    await click(byText(el, 'button', 'Earlier activity'))
    await until(() => el.querySelectorAll('.activity-list li').length === 4)
    expect(lines()[3]).toBe('Jonas Weber created the space')
    expect(routes.calls.some((c) => c.url.endsWith('before=act_3'))).toBe(true)
  })
})

describe('a conversation shared with the space, read-only (UI-CONV-038)', () => {
  const sharedFor = {
    agentDid: AGENT,
    spaceId: TRUCK.id,
    conversation: {
      id: 'conv_9',
      title: 'Recall R-2291, first inspection',
      author: { name: 'Jonas Weber' },
      sharedAt: '2026-11-12T10:00:00Z',
      lastActivityAt: '2026-11-12T11:00:00Z',
    },
  }

  it('shows its messages from the shared history, its author, and nothing that changes it', async () => {
    const routes = fakeAgent([
      [
        `GET /spaces/${TRUCK.id}/shared/conv_9/messages?limit=50`,
        () =>
          json({
            messages: [
              {
                id: 'm1',
                role: 'user',
                content: 'Truck 9 is in. What do I check?',
                metadata: { createdAt: '2026-11-12T09:00:00Z' },
              },
              {
                id: 'm2',
                role: 'assistant',
                content: 'Both front calipers.',
                metadata: { createdAt: '2026-11-12T09:01:00Z' },
              },
              // taken by the service's code: the AI never received it (UI-CONV-044)
              {
                id: 'm3',
                role: 'user',
                content: '482913',
                metadata: { createdAt: '2026-11-12T09:02:00Z', modelVisible: false },
              },
            ],
            nextBefore: null,
          }),
      ],
    ])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      snapshot: { view: 'shared', sharedFor },
    })
    const el = await render(hub, <SharedConversationView />)
    await until(() => el.querySelectorAll('.row').length === 3)
    expect([...el.querySelectorAll('.msg')].map((m) => m.className)).toEqual([
      'msg user',
      'msg assistant',
      'msg user withheld',
    ])
    expect(el.querySelector('.msg.withheld .meta')?.textContent).toMatch(/^Not shared with the AI·/)
    expect(el.querySelector('h1')?.textContent).toBe('Recall R-2291, first inspection')
    expect(el.querySelector('.conv-sub')?.textContent).toContain('Shared by Jonas Weber')
    expect(el.textContent).toContain('Read-only: you cannot write or react here.')
    expect(el.querySelector('.row.mine')?.getAttribute('aria-label')).toBe('Jonas Weber')
    // no message form, no toolbar, no reaction
    expect(el.querySelector('textarea, .composer, .tools, .pill')).toBeNull()
    expect(routes.calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('says so once it is no longer shared', async () => {
    fakeAgent([[/shared\/conv_9\/messages/, () => json({ error: 'not-found' }, 404)]])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      snapshot: { view: 'shared', sharedFor },
    })
    const el = await render(hub, <SharedConversationView />)
    await until(() => el.textContent?.includes('This conversation is no longer shared.') ?? false)
  })
})

describe('New space (UI-CONV-039)', () => {
  it('a template, then a title and a purpose, required, and a brief; created, then its page opens', async () => {
    const created = { ...TRUCK, id: 'spc_truck22', title: 'Truck 22 recall', role: 'owner' }
    const routes = fakeAgent([
      ['POST /spaces', () => json(created, 201)],
      ['GET /spaces', () => json({ ...SPACES, spaces: [...SPACES.spaces, created] })],
    ])
    const hub = await tab({ sessions: [record({ sessionId: 's1' })], spaces: SPACES })
    let closed = false
    await render(hub, <CreateSpaceDialog agent={agentRecord() as never} onClose={() => (closed = true)} />)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.querySelector('.dialog-sub')?.textContent).toBe('Choose a template')
    expect(dialog.querySelector('.choice')?.textContent).toContain('Team space · members you choose')
    await click(dialog.querySelector('.choice'))
    const create = byText(dialog, 'button', 'Create') as HTMLButtonElement
    expect(create.disabled).toBe(true)
    const [title, purpose, brief] = [...dialog.querySelectorAll('input, textarea')]
    await type(title, 'Truck 22 recall')
    expect(create.disabled).toBe(true)
    await type(purpose, 'Inspect truck 22.')
    await type(brief, 'Depot Antwerp.')
    expect(create.disabled).toBe(false)
    await click(create)
    await until(() => hub.getSnapshot().view === 'space')
    expect(routes.find('POST', '/spaces')[0].body).toEqual({
      templateId: 'project',
      title: 'Truck 22 recall',
      purpose: 'Inspect truck 22.',
      brief: 'Depot Antwerp.',
    })
    expect(hub.getSnapshot().spaceFor).toEqual({ agentDid: AGENT, spaceId: 'spc_truck22', segment: 'conversations' })
    expect(closed).toBe(true)
  })

  it('says so when the person may not create from the template', async () => {
    fakeAgent([['POST /spaces', () => json({ error: 'not-creator' }, 403)]])
    const hub = await tab({ sessions: [record({ sessionId: 's1' })], spaces: SPACES })
    await render(hub, <CreateSpaceDialog agent={agentRecord() as never} onClose={() => undefined} />)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await click(dialog.querySelector('.choice'))
    const [title, purpose] = [...dialog.querySelectorAll('input, textarea')]
    await type(title, 'X')
    await type(purpose, 'Y')
    await click(byText(dialog, 'button', 'Create'))
    await until(() => !!dialog.querySelector('.banner'))
    expect(dialog.querySelector('.banner')?.textContent).toBe('You may not create a space from this template.')
  })
})
