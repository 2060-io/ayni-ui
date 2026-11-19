/**
 * Sharing a conversation with its space from its menu (UI-CONV-038, PROF-CONV-012), and the admin view of roles for a
 * person whom the agent answers it (UI-CONV-042, PROF-DIR-003).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AdminPage } from '../src/components/AdminRoles.js'
import { ConversationRow } from '../src/components/Column.js'
import {
  AGENT,
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
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

async function row(session = record({ sessionId: 's3', title: 'Caliper check', spaceId: TRUCK.id })) {
  const hub = await tab({ sessions: [session], spaces: SPACES })
  const el = await render(hub, <ConversationRow session={hub.getSnapshot().sessions[0]} selected={false} />)
  await click(el.querySelector('[aria-label="Agent options"]'))
  const items = () => [...el.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)
  return { hub, el, items }
}

describe('sharing a conversation with its space (UI-CONV-038)', () => {
  it('a conversation of a space that allows it offers "Share with <space>", and shares it', async () => {
    const agent = fakeAgent([
      ['POST /conversations/conv_s3/share', () => json({ shared: true, sharedAt: '2026-11-18T10:00:00Z' })],
    ])
    const { hub, items, el } = await row()
    expect(items()).toEqual(['Rename', 'Share with Truck 14 recall', 'What Fleet support keeps about you', 'Archive'])
    await click(byText(el, '[role="menuitem"]', 'Share with Truck 14 recall'))
    await until(() => hub.getSnapshot().sessions[0].shared === true)
    expect(agent.find('POST', '/conversations/conv_s3/share')[0].body).toBeUndefined()
    expect(hub.getSnapshot().notice?.text).toBe('Shared with Truck 14 recall: its members can read it.')
  })

  it('a shared conversation says so in its row, and offers Stop sharing', async () => {
    const agent = fakeAgent([['DELETE /conversations/conv_s3/share', () => new Response(null, { status: 204 })]])
    const { hub, items, el } = await row(
      record({ sessionId: 's3', title: 'Caliper check', spaceId: TRUCK.id, shared: true })
    )
    expect(el.querySelector('.shared-tag')?.textContent).toBe('Shared with Truck 14 recall')
    expect(items()).toContain('Stop sharing')
    await click(byText(el, '[role="menuitem"]', 'Stop sharing'))
    await until(() => hub.getSnapshot().sessions[0].shared === false)
    expect(agent.find('DELETE', '/conversations/conv_s3/share')).toHaveLength(1)
  })

  it('a conversation of Personal, or of a space that takes no share, offers none', async () => {
    const personal = await row(record({ sessionId: 's1', spaceId: PERSONAL.id }))
    expect(personal.items().some((i) => i?.startsWith('Share'))).toBe(false)
    teardown()
    // Depot Rotterdam takes shares in the fixture; the same space, once it takes none, offers nothing
    const depot = await row(record({ sessionId: 's4', spaceId: DEPOT.id }))
    expect(depot.items()).toContain('Share with Depot Rotterdam')
    teardown()
    const hub = await tab({
      sessions: [record({ sessionId: 's4', spaceId: DEPOT.id })],
      spaces: {
        ...SPACES,
        spaces: SPACES.spaces.map((s) => (s.id === DEPOT.id ? { ...s, rules: { ...s.rules, handover: false } } : s)),
      },
    })
    const el = await render(hub, <ConversationRow session={hub.getSnapshot().sessions[0]} selected={false} />)
    await click(el.querySelector('[aria-label="Agent options"]'))
    expect([...el.querySelectorAll('[role="menuitem"]')].some((i) => i.textContent?.startsWith('Share'))).toBe(false)
  })

  it('says why the agent refused a share', async () => {
    fakeAgent([['POST /conversations/conv_s3/share', () => json({ error: 'handover-not-allowed' }, 409)]])
    const { hub } = await row()
    await expect(hub.setShared('s3', true)).rejects.toThrow('Truck 14 recall does not take shared conversations.')
    expect(hub.getSnapshot().sessions[0].shared).toBeUndefined()
  })
})

describe('the admin view of roles (UI-CONV-042)', () => {
  const syncRoutes = (admin: number) =>
    fakeAgent([
      ['GET /conversations', () => json({ conversations: [] })],
      ['GET /spaces', () => json(SPACES)],
      ['GET /admin/roles', () => (admin === 200 ? json({ entries: [] }) : json({ error: 'not-admin' }, admin))],
    ])

  it('an admin is told once the list is read; a dispatcher is not', async () => {
    syncRoutes(200)
    const admin = await tab({ sessions: [record({ sessionId: 's1' })], spaces: SPACES, snapshot: { admins: {} } })
    await admin.syncConversations(AGENT)
    await until(() => admin.getSnapshot().admins[AGENT] === true)
    teardown()
    syncRoutes(403)
    const dispatcher = await tab({ sessions: [record({ sessionId: 's1' })], spaces: SPACES, snapshot: { admins: {} } })
    await dispatcher.syncConversations(AGENT)
    await until(() => dispatcher.getSnapshot().admins[AGENT] === false)
  })

  it('reading the list also reads the spaces', async () => {
    syncRoutes(403)
    const hub = await tab({ sessions: [record({ sessionId: 's1' })], spaces: undefined, snapshot: { admins: {} } })
    await hub.syncConversations(AGENT)
    expect(hub.getSnapshot().spaces[AGENT]?.spaces.map((s) => s.id)).toEqual(SPACES.spaces.map((s) => s.id))
  })

  it('shows who holds which role and why, and the changes of the list, newest first', async () => {
    fakeAgent([
      [
        'GET /admin/roles',
        () =>
          json({
            entries: [
              {
                directoryId: 'emp_7',
                name: 'Ana Ríos',
                department: 'Dispatch',
                groups: ['drivers'],
                roles: ['dispatcher', 'creator'],
                onAgent: true,
              },
              { directoryId: 'emp_8', name: 'Lea Fischer', department: null, groups: [], roles: [], onAgent: false },
            ],
          }),
      ],
      [
        'GET /admin/changes?limit=50',
        () =>
          json({
            changes: [
              {
                at: '2026-11-18T09:00:00Z',
                kind: 'changed',
                directoryId: 'emp_7',
                name: 'Ana Ríos',
                fields: ['roles'],
                rolesBefore: ['dispatcher'],
                rolesAfter: ['dispatcher', 'creator'],
              },
              { at: '2026-11-17T09:00:00Z', kind: 'added', directoryId: 'emp_8', name: 'Lea Fischer', fields: [] },
            ],
            nextBefore: null,
          }),
      ],
    ])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      snapshot: { view: 'admin', adminFor: AGENT },
    })
    const el = await render(hub, <AdminPage />)
    await until(() => el.querySelectorAll('.members-table tbody tr').length === 2)
    const ana = [...el.querySelectorAll('.members-table tbody tr')][0].textContent
    expect(ana).toBe('Ana RíosDispatchdriversdispatcher, creatorEntry emp_7 of the employee listOn Fleet support')
    expect([...el.querySelectorAll('.members-table tbody tr')][1].textContent).toContain('Not yet on Fleet support')
    await click(byText(el, '[role="tab"]', 'Changes of the list'))
    const lines = [...el.querySelectorAll('.activity-list li')].map((l) => l.textContent)
    expect(lines[0]).toContain('Ana Ríos changed: roles · Roles: dispatcher to dispatcher, creator')
    expect(lines[1]).toContain('Lea Fischer added to the list')
  })

  it('says so to a person without the role', async () => {
    fakeAgent([[/^GET \/admin\//, () => json({ error: 'not-admin' }, 403)]])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      snapshot: { view: 'admin', adminFor: AGENT },
    })
    const el = await render(hub, <AdminPage />)
    await until(() => el.textContent?.includes('Only the holders of the admin role read this.') ?? false)
  })
})
