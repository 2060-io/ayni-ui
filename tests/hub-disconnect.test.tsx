/**
 * Disconnect forgets everything this browser read from the agent for the person (UI-AGENTS-006). Found by Fabrice on
 * devnet, 2026-11-24: "Disconnect from this agent" took the agent's conversations away, as it should, but its card
 * still listed his spaces. The hub revoked the pairing, closed the sessions and deleted their records and transcripts,
 * and left in memory what it had read with them: the spaces, the agent's Notifications count, Your accounts, roles and
 * stewardship, and the space's page open on screen.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Column } from '../src/components/Column.js'
import type { Hub } from '../src/state/hub.js'
import {
  AGENT,
  byText,
  click,
  fakeAgent,
  json,
  record,
  render,
  SPACES,
  settle,
  setup,
  tab,
  teardown,
  transcript,
  until,
} from './spacesFixture.js'

const ACCOUNT = { source: 'github', state: 'connected', revokesAtSource: false } as never

/** The agent: it revokes the pairing, closes sessions and gives the person's spaces. */
function agent() {
  return fakeAgent([
    [/^DELETE \/devices\//, () => json(undefined, 204)],
    [/^DELETE \/ses_/, () => json(undefined, 204)],
    ['GET /spaces', () => json(SPACES)],
  ])
}

/** A tab with two conversations of the agent, its spaces and what else was read for the person, a space open. */
async function held(): Promise<Hub> {
  return tab({
    sessions: [record({ sessionId: 'ses_a', spaceId: 'spc_truck' }), record({ sessionId: 'ses_b' })],
    transcripts: [transcript('ses_a'), transcript('ses_b')],
    spaces: SPACES,
    snapshot: {
      view: 'space',
      spaceFor: { agentDid: AGENT, spaceId: 'spc_truck', segment: 'conversations' },
      memoryFor: { agentDid: AGENT, memoryId: 'mem_1' },
      admins: { [AGENT]: true },
      stewards: { [AGENT]: true },
      connections: { [AGENT]: [ACCOUNT] },
      agentNotifications: { [AGENT]: 2 },
      toolChanges: [{ agentDid: AGENT, change: {} as never, n: 1 }],
      connectionChanges: [{ agentDid: AGENT, change: {} as never, n: 1 }],
      replyTo: { ses_a: { id: 'm1' } as never },
      pending: { ses_b: 'sending' },
    },
  })
}

const spaceRows = (el: ParentNode) => [...el.querySelectorAll('.space-row .space-name')].map((r) => r.textContent)

describe('Disconnect forgets what the browser read of the person from the agent (UI-AGENTS-006)', () => {
  beforeAll(setup)
  afterEach(() => {
    vi.restoreAllMocks()
    teardown()
  })

  it('the screen Fabrice saw: after Disconnect the card lists no spaces, and nothing else of the person stays', async () => {
    agent()
    const hub = await held()
    hub.setView('list')
    const el = await render(hub, <Column />)
    expect(spaceRows(el).length).toBeGreaterThan(0)
    expect(byText(el, '.section-label', 'Spaces')).toBeTruthy()
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    await click(byText(el, '[role="menuitem"]', 'Disconnect'))
    await until(() => !hub.getSnapshot().agents[0]?.deviceSecret)
    await settle()
    expect(spaceRows(el)).toEqual([])
    expect(byText(el, '.section-label', 'Spaces')).toBeUndefined()
    const snap = hub.getSnapshot()
    expect(snap.spaces[AGENT]).toBeUndefined()
    expect(snap.sessions.filter((s) => s.agentDid === AGENT)).toEqual([])
    expect(snap.agents.map((a) => a.did)).toEqual([AGENT])
  })

  it('forgets the spaces, the open space, Notifications, Your accounts, roles, stewardship and the conversations', async () => {
    const fake = agent()
    const hub = await held()
    await hub.disconnectAgent(AGENT)
    const snap = hub.getSnapshot()
    expect(fake.find('DELETE', '/devices/dev_1')).toHaveLength(1)
    expect(snap.spaces[AGENT]).toBeUndefined()
    expect(snap.view).toBe('list')
    expect(snap.spaceFor).toBeNull()
    expect(snap.memoryFor).toBeNull()
    expect(snap.admins[AGENT]).toBeUndefined()
    expect(snap.stewards[AGENT]).toBeUndefined()
    expect(snap.connections[AGENT]).toBeUndefined()
    expect(snap.agentNotifications[AGENT]).toBeUndefined()
    expect(snap.toolChanges).toEqual([])
    expect(snap.connectionChanges).toEqual([])
    expect(snap.transcripts).toEqual({})
    expect(snap.replyTo).toEqual({})
    expect(snap.pending).toEqual({})
    expect(snap.agents[0]).toMatchObject({ did: AGENT, deviceHandle: undefined, deviceSecret: undefined })
  })

  it('pairing again reads the spaces again from the agent', async () => {
    const fake = agent()
    const hub = await held()
    hub.setView('list')
    const el = await render(hub, <Column />)
    await hub.disconnectAgent(AGENT)
    await settle()
    expect(spaceRows(el)).toEqual([])
    // the phone pairs the browser again: the agent gives a new pairing and binds a session
    // @ts-expect-error private: the device's store
    const store = hub.store as import('@ayni.org/ayni-ui-core').DeviceStore
    const unpaired = hub.getSnapshot().agents[0]
    await store.putAgent({
      ...unpaired,
      deviceHandle: 'dev_2',
      deviceSecret: 'dsk_2',
      linkedAt: '2026-11-24T10:00:00Z',
    })
    await store.putSession(record({ sessionId: 'ses_c' }))
    await hub.reload()
    await hub.loadSpaces(AGENT)
    await settle()
    expect(fake.find('GET', '/spaces')).toHaveLength(1)
    expect(hub.getSnapshot().spaces[AGENT]).toEqual(SPACES)
    expect(spaceRows(el).length).toBeGreaterThan(0)
  })

  it('every tab forgets: the tab that disconnects says so, and another tab hearing it forgets too', async () => {
    agent()
    const hub = await held()
    const post = vi.fn()
    // @ts-expect-error private: the bus of the tab
    hub.bus = { ...hub.bus, post }
    await hub.disconnectAgent(AGENT)
    expect(post).toHaveBeenCalledWith({ kind: 'agent-forgotten', agentDid: AGENT, sessionIds: ['ses_a', 'ses_b'] })
    const other = await held()
    // @ts-expect-error private: what the other tab hears on the bus
    other.onBus({ kind: 'agent-forgotten', agentDid: AGENT, sessionIds: ['ses_a', 'ses_b'] })
    const snap = other.getSnapshot()
    expect(snap.spaces[AGENT]).toBeUndefined()
    expect(snap.view).toBe('list')
    expect(snap.spaceFor).toBeNull()
    expect(snap.agentNotifications[AGENT]).toBeUndefined()
    expect(snap.transcripts).toEqual({})
  })

  it('Remove forgets the same (UI-AGENTS-005)', async () => {
    agent()
    const hub = await held()
    await hub.removeAgent(AGENT)
    const snap = hub.getSnapshot()
    expect(snap.agents).toEqual([])
    expect(snap.spaces[AGENT]).toBeUndefined()
    expect(snap.connections[AGENT]).toBeUndefined()
    expect(snap.spaceFor).toBeNull()
  })
})
