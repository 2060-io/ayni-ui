/**
 * Spaces in the agent's card (UI-CONV-028): rows above the Personal conversations, three with the latest activity and
 * "N more spaces", each with its kind, members, activity and unread count, which the agent's total includes; the
 * column's search matches space titles; with Personal alone the card is what it was; the rail shows no space. The
 * agent's menu offers New space to a creator (UI-CONV-039), what the agent keeps (UI-CONV-033) and Roles to an admin
 * (UI-CONV-042).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Column } from '../src/components/Column.js'
import { Rail } from '../src/components/Rail.js'
import {
  AGENT,
  byText,
  click,
  DEPOT,
  FORKLIFT,
  NORTHWIND,
  PERSONAL,
  record,
  render,
  SPACES,
  setup,
  TEMPLATES,
  TRUCK,
  tab,
  teardown,
  type,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const conversations = [
  record({ sessionId: 's1', title: 'Overtime for November', spaceId: PERSONAL.id, unreadCount: 1 }),
  record({ sessionId: 's2', title: 'Route change A12', spaceId: PERSONAL.id }),
  record({
    sessionId: 's3',
    title: 'Caliper check',
    spaceId: TRUCK.id,
    unreadCount: 2,
    lastMessageAt: '2026-11-18T10:46:00.000Z',
  }),
  record({ sessionId: 's4', title: 'Shift handover', spaceId: DEPOT.id }),
]
const rows = (el: HTMLElement) =>
  [...el.querySelectorAll('.space-row')].map((r) => r.querySelector('.space-name')?.textContent)
const listed = (el: HTMLElement) => [...el.querySelectorAll('.conv-row .title')].map((r) => r.textContent)

describe('the spaces of an agent in its card (UI-CONV-028)', () => {
  it('shows the spaces as rows above the Personal conversations', async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Column />)
    expect(byText(el, '.section-label', 'Spaces')).toBeTruthy()
    expect(rows(el)).toEqual(['Truck 14 recall', 'Depot Rotterdam', 'Northwind Logistics'])
    // below the rows, the conversations of Personal, as before spaces
    expect(byText(el, '.section-label', 'Personal')).toBeTruthy()
    expect(listed(el)).toEqual(['Overtime for November', 'Route change A12'])
    const rowsBox = el.querySelector('.space-rows')
    const firstConversation = el.querySelector('.conv-row')
    expect(rowsBox && firstConversation && rowsBox.compareDocumentPosition(firstConversation)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it('each row has its kind, its members, its latest activity and its unread count', async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Column />)
    const truck = [...el.querySelectorAll('.space-row')][0]
    expect(truck.querySelector('.space-tile svg')).toBeTruthy()
    expect(truck.querySelector('.space-sub')?.textContent).toMatch(/^5 members · /)
    expect(truck.querySelector('.count')?.textContent).toBe('2')
    const depot = [...el.querySelectorAll('.space-row')][1]
    expect(depot.querySelector('.space-sub')?.textContent).toMatch(/^By rule/)
  })

  it('a fourth space waits behind "1 more space", which shows it', async () => {
    const hub = await tab({ sessions: conversations, spaces: { ...SPACES, spaces: [...SPACES.spaces, FORKLIFT] } })
    const el = await render(hub, <Column />)
    const more = byText(el, '.space-more', '1 more space')
    expect(more).toBeTruthy()
    expect(rows(el)).not.toContain('Forklift licence')
    await click(more)
    expect(rows(el)).toContain('Forklift licence')
  })

  it("a reply in a space raises its row's count and the agent's total", async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Column />)
    // the card closed shows the agent's total: Personal's and the spaces'
    await click(el.querySelector('.agent-toggle'))
    expect(el.querySelector('.agent-toggle .count')?.textContent).toBe('3')
    await click(el.querySelector('.agent-toggle'))
    // a reply lands in Caliper check
    // @ts-expect-error private: the agent's count of the conversation, as a change event gives it
    await hub.saveSession({ ...conversations[2], unreadCount: 3 })
    await until(() => [...el.querySelectorAll('.space-row')][0]?.querySelector('.count')?.textContent === '3')
    await click(el.querySelector('.agent-toggle'))
    expect(el.querySelector('.agent-toggle .count')?.textContent).toBe('4')
  })

  it("the column's search finds a space by its title", async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Column />)
    await click(el.querySelector('[aria-label="Search conversations"]'))
    await type(el.querySelector('input[type="search"]'), 'truck')
    await until(() => rows(el).length === 1)
    expect(rows(el)).toEqual(['Truck 14 recall'])
  })

  it('a row opens the space page', async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Column />)
    await click(el.querySelector('.space-row'))
    expect(hub.getSnapshot().view).toBe('space')
    expect(hub.getSnapshot().spaceFor).toEqual({ agentDid: AGENT, spaceId: TRUCK.id, segment: 'conversations' })
  })

  it('with Personal alone, the card is what it was before spaces', async () => {
    const hub = await tab({
      sessions: conversations.map((s) => ({ ...s, spaceId: PERSONAL.id })),
      spaces: { spaces: [PERSONAL], templates: [] },
    })
    const el = await render(hub, <Column />)
    expect(el.querySelector('.space-rows')).toBeNull()
    expect(byText(el, '.section-label', 'Personal')).toBeUndefined()
    expect(listed(el)).toHaveLength(4)
  })

  it('an agent that serves no spaces shows its card as before', async () => {
    const hub = await tab({ sessions: conversations, spaces: undefined, profileVersion: '3.1' })
    const el = await render(hub, <Column />)
    expect(el.querySelector('.space-rows')).toBeNull()
    expect(listed(el)).toHaveLength(4)
  })

  it('the rail shows no space', async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Rail />)
    for (const s of [TRUCK, DEPOT, NORTHWIND]) expect(el.textContent).not.toContain(s.title)
  })
})

describe("the agent's menu (UI-CONV-033, UI-CONV-039, UI-CONV-042)", () => {
  const menuItems = async (el: HTMLElement) => {
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    return [...el.querySelectorAll('.agent-row [role="menuitem"]')].map((b) => b.textContent)
  }

  it('offers New space to a person who may create one, and opens the template step', async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Column />)
    expect(await menuItems(el)).toContain('New space')
    await click(byText(el, '[role="menuitem"]', 'New space'))
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('New space')
    expect(byText(document.body, '.choice b', 'Project')).toBeTruthy()
  })

  it('offers no New space to a person with no template', async () => {
    const hub = await tab({ sessions: conversations, spaces: { ...SPACES, templates: [] } })
    const el = await render(hub, <Column />)
    expect(await menuItems(el)).not.toContain('New space')
  })

  it('offers what the agent keeps about the person, and opens its page', async () => {
    const hub = await tab({ sessions: conversations, spaces: SPACES })
    const el = await render(hub, <Column />)
    expect(await menuItems(el)).toContain('What Fleet support keeps about you')
    await click(byText(el, '[role="menuitem"]', 'What Fleet support keeps about you'))
    expect(hub.getSnapshot()).toMatchObject({ view: 'keeps', keepsFor: AGENT })
  })

  it('offers Roles to a person the admin view answers, and to nobody else', async () => {
    const admin = await tab({ sessions: conversations, spaces: SPACES, snapshot: { admins: { [AGENT]: true } } })
    let el = await render(admin, <Column />)
    expect(await menuItems(el)).toContain('Roles')
    await click(byText(el, '[role="menuitem"]', 'Roles'))
    expect(admin.getSnapshot()).toMatchObject({ view: 'admin', adminFor: AGENT })
    teardown()
    const dispatcher = await tab({ sessions: conversations, spaces: SPACES })
    el = await render(dispatcher, <Column />)
    expect(await menuItems(el)).not.toContain('Roles')
  })

  it('keeps a template-less, space-less agent menu as it was', async () => {
    const hub = await tab({
      sessions: conversations,
      spaces: { spaces: [PERSONAL], templates: [] },
      profileVersion: '3.1',
    })
    const el = await render(hub, <Column />)
    const items = await menuItems(el)
    expect(items).not.toContain('New space')
    expect(items).not.toContain('What Fleet support keeps about you')
    expect(TEMPLATES).toHaveLength(1)
  })
})
