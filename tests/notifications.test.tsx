/**
 * Approvals reach each person once (ayni-spec #116, agent D114), in the browser of Jonas Weber, owner of the space
 * Communication, and of Ana Ríos, a member who asks for a post on X there. The approver sees no card in any of their
 * conversations, and one item in the Notifications of the space, with the badge of the tab and of the space's row, or
 * in the agent's Notifications, from the agent's menu (UI-APPR-001, UI-APPR-007); one to attest offers Decide on your
 * phone, which sends it to the phone again (UI-APPR-008), any other Approve and Reject, which start no turn
 * (UI-APPR-002); the lists are read again on `ayni.space.notifications.changed`, when the tab is in front again and from
 * another tab, and a link opens them with its item selected (PROF-TOOL-025, PROF-LINK-005). The requester sees one
 * card, in the conversation where they asked, updated in place by each status (UI-APPR-005, UI-APPR-006). Nothing shows
 * a request waiting without its card (UI-APPR-009). The words in the four languages, and the colours in both themes.
 */
import { NOTIFICATIONS_COPY, type SessionRecord, type TranscriptMessage } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Column } from '../src/components/Column.js'
import { Conversation } from '../src/components/Conversation.js'
import { NotificationsPage } from '../src/components/Notifications.js'
import { Rail } from '../src/components/Rail.js'
import { SpacePage } from '../src/components/SpacePage.js'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'
import type { Hub } from '../src/state/hub.js'
import { useSnapshot } from '../src/state/useHub.js'
import {
  AGENT,
  byText,
  type Call,
  click,
  fakeAgent,
  json,
  PERSONAL,
  record,
  render,
  settle,
  setup,
  space,
  TRUCK,
  tab,
  teardown,
  transcript,
  type,
  until,
} from './spacesFixture.js'
import { css, rule } from './stylesheet.js'

beforeAll(setup)
afterEach(teardown)

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const FEATURES = { tools: true, connections: true, notifications: true, queue: true }
const POST_TEXT = 'We are hiring.\nThree roles in Rotterdam.'

/** Communication, as Jonas (its owner) and Ana (a member) list it. */
const COMMS_JONAS = space({
  id: 'spc_comms',
  title: 'Communication',
  role: 'owner',
  owner: { name: 'Jonas Weber' },
  lastActivityAt: '2026-11-21T21:00:00.000Z',
})
const COMMS_ANA = { ...COMMS_JONAS, role: 'member' as const }
const JONAS_PERSONAL = { ...PERSONAL, owner: { name: 'Jonas Weber' } }

/** The approval of Ana's post, as §3.12 gives it to `viewer`. */
function postApproval(over: Record<string, unknown> = {}) {
  return {
    approvalId: 'apr_1',
    kind: 'sensitivity',
    status: 'PENDING',
    expiresAt: at(-4.5),
    requester: { displayName: 'Ana Ríos', role: 'member' },
    own: false,
    canDecide: true,
    attested: true,
    myDecision: null,
    tool: 'post_tweet',
    action: {
      title: 'Post on X',
      source: { id: 'x', title: 'X' },
      account: { kind: 'space', space: { id: 'spc_comms', title: 'Communication' } },
      fields: [{ label: 'Text', value: POST_TEXT }],
      erased: false,
    },
    space: { id: 'spc_comms', title: 'Communication' },
    policy: { type: 'count', value: 1 },
    decisions: [],
    ...over,
  }
}
const item = (approval: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id: String(approval.approvalId),
  kind: 'approval',
  at: at(1),
  waiting: approval.status === 'PENDING' && approval.canDecide === true && !approval.own,
  approval,
  ...over,
})
const page =
  (items: unknown[], waiting = 0, nextBefore: string | null = null) =>
  () =>
    json({ notifications: items, nextBefore, waiting })

/** A delete of a CRM record that the managers approve, no attestation asked: in the agent's Notifications. */
const DELETE = {
  approvalId: 'apr_7',
  kind: 'sensitivity',
  status: 'PENDING',
  expiresAt: at(-30),
  requester: { displayName: 'Ana Ríos', role: 'sales' },
  own: false,
  canDecide: true,
  attested: false,
  myDecision: null,
  tool: 'delete-company',
  action: {
    title: 'Delete a company',
    source: { id: 'relaticle', title: 'Relaticle CRM' },
    account: { kind: 'agent' },
    fields: [{ label: 'Company', value: 'Acme Logistics' }],
    erased: false,
  },
  policy: { type: 'count', value: 1 },
  decisions: [],
}

const sse = (...events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
const decision = (approvalId: string, status: string) => () =>
  sse(
    { type: 'RUN_STARTED', threadId: 's', runId: 'r', noTurn: 'decision' },
    { type: 'RUN_FINISHED', threadId: 's', runId: 'r', outcome: { type: 'decision', approvalId, status } }
  )
const actionOf = (call: Call | undefined) =>
  (call?.body as { forwardedProps?: { ayni?: unknown } } | undefined)?.forwardedProps?.ayni

/** The main pane as the shell shows it, beside the column: what the hub's view names. */
function Screen() {
  const snap = useSnapshot()
  return (
    <>
      <Rail />
      <Column />
      <main>
        {snap.view === 'space' ? (
          <SpacePage />
        ) : snap.view === 'notifications' ? (
          <NotificationsPage />
        ) : (
          <Conversation />
        )}
      </main>
    </>
  )
}

/** Jonas's tab: three conversations, in Personal, in Communication and in Truck 14 recall. */
async function jonas(
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][] = [],
  options: { features?: Record<string, unknown>; comms?: typeof COMMS_JONAS; sessions?: SessionRecord[] } = {}
) {
  const agent = fakeAgent([...routes, [/^GET \/notifications\?/, page([], 0)]])
  const who = { principal: { displayName: 'Jonas Weber' } as never }
  const sessions = options.sessions ?? [
    record({ sessionId: 's1', title: 'Weekly plan', spaceId: PERSONAL.id, ...who }),
    record({ sessionId: 's2', title: 'Launch posts', spaceId: 'spc_comms', ...who }),
    record({ sessionId: 's3', title: 'Calipers', spaceId: TRUCK.id, ...who }),
  ]
  const hub = await tab({
    sessions,
    transcripts: sessions.map((s) =>
      transcript(s.sessionId, [{ id: `m_${s.sessionId}`, role: 'user', content: 'Hello', at: at(10) }])
    ),
    spaces: { spaces: [JONAS_PERSONAL, options.comms ?? COMMS_JONAS, TRUCK], templates: [] },
    features: options.features ?? FEATURES,
    profileVersion: '3.5',
    snapshot: { selectedSessionId: 's1', view: 'conversation' },
  })
  const el = await render(hub, <Screen />)
  return { agent, hub, el }
}

/** The agent says, on one of the person's session streams, that a notification changed (PROF-TOOL-025). */
async function announce(hub: Hub, sessionId: string, value: Record<string, unknown>) {
  // @ts-expect-error private: the event as the session's stream delivers it
  await hub.onEvent(sessionId, { type: 'CUSTOM', name: 'ayni.space.notifications.changed', value }, undefined, false)
}

const row = (el: HTMLElement, title: string) =>
  [...el.querySelectorAll<HTMLElement>('.space-row')].find((r) => r.querySelector('.space-name')?.textContent === title)
const items = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.notification')]
const lines = (n: HTMLElement | undefined) =>
  [...(n?.querySelectorAll('.tool-approval-head, .tool-title, .tool-approval-space, .tool-source') ?? [])].map(
    (x) => x.textContent
  )
const statusOf = (n: HTMLElement | undefined) => n?.querySelector('.notification-status')?.textContent
const tabOf = (el: HTMLElement, name: RegExp) =>
  [...el.querySelectorAll<HTMLElement>('[role="tab"]')].find((x) => name.test(x.textContent ?? ''))

describe('an approver sees an approval once (UI-APPR-001, UI-APPR-007)', () => {
  it('no card in any of their conversations, one item in the Notifications, and the badge counts it once', async () => {
    const { hub, el, agent } = await jonas([
      [/^GET \/spaces\/spc_comms\/notifications\?/, page([item(postApproval())], 1)],
    ])
    const sessions = ['s1', 's2', 's3']
    // the agent tells each of Jonas's open streams: three sessions, one notification
    for (const s of sessions)
      await announce(hub, s, { spaceId: 'spc_comms', id: 'apr_1', kind: 'approval', waiting: true, count: 1 })
    // a request in the withdrawn shape, and an approver's card as an earlier agent wrote it into every session
    const card = { ...postApproval(), canDecide: true, own: false }
    for (const s of sessions) {
      // @ts-expect-error private: events as the session's stream delivers them
      await hub.onEvent(s, { type: 'CUSTOM', name: 'ayni.approval.request', value: card }, undefined, false)
      // @ts-expect-error private
      await hub.onEvent(
        s,
        { type: 'ACTIVITY_SNAPSHOT', messageId: `act_${s}`, activityType: 'ayni.approval', content: card },
        undefined,
        false
      )
    }
    for (const s of sessions) {
      hub.selectSession(s)
      await settle()
      const pane = el.querySelector('main') as HTMLElement
      expect(pane.querySelector('.transcript'), s).toBeTruthy()
      expect(pane.querySelector('.tool-approval'), s).toBeNull()
      expect(pane.textContent, s).not.toContain('asks for your approval')
      expect(pane.textContent, s).not.toContain('Post on X')
    }
    // the space's row shows 1, not 3
    const badge = row(el, 'Communication')?.querySelector('.notifications-count')
    expect(badge?.querySelector('[aria-hidden="true"]:not(svg)')?.textContent).toBe('1')
    expect(badge?.textContent).toContain('1 waiting')
    // its tab, right after Conversations, with the same badge, then one item
    await click(row(el, 'Communication'))
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((x) => x.firstChild?.textContent)
    expect(tabs.slice(0, 3)).toEqual(['Conversations', 'Notifications', 'Your memories'])
    expect(tabOf(el, /^Notifications/)?.querySelector('.notifications-count')?.textContent).toContain('1')
    await click(tabOf(el, /^Notifications/))
    await until(() => items(el).length === 1)
    const n = items(el)[0]
    expect(lines(n)).toEqual(['Ana Ríos asks for your approval', 'Post on X', 'Communication', 'X'])
    expect(n?.querySelector('.tool-field dd')?.textContent).toBe(POST_TEXT)
    expect(n?.querySelector('.tool-account')?.textContent).toBe('With the account of Communication')
    expect(statusOf(n)).toMatch(/^\d+:\d{2} left$/)
    // to attest: on the phone, never in the browser
    expect(byText(n as HTMLElement, 'button', 'Decide on your phone')).toBeTruthy()
    expect(byText(n as HTMLElement, 'button', 'Approve')).toBeUndefined()
    // a screen reader reads it as its heading, the action's title and its status
    expect(n?.getAttribute('aria-label')).toMatch(/^Ana Ríos asks for your approval, Post on X, \d+:\d{2} left$/)
    expect(agent.find('GET', '/spaces/spc_comms/notifications?limit=50').length).toBeGreaterThan(0)
  })

  it("has the agent's Notifications in the agent's menu, with their badge, for the approvals no space holds", async () => {
    const { el, hub } = await jonas([
      [/^GET \/notifications\?/, page([item(DELETE)], 1)],
      ['GET /spaces', () => json({ spaces: [JONAS_PERSONAL, COMMS_JONAS, TRUCK], templates: [] })],
    ])
    // the count is read with the spaces (PROF-TOOL-025)
    await hub.loadSpaces(AGENT)
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    const entry = byText(el, '[role="menuitem"]', /^Notifications/)
    expect(entry?.querySelector('.notifications-count')?.textContent).toContain('1')
    await click(entry)
    expect(hub.getSnapshot().view).toBe('notifications')
    await until(() => items(el).length === 1)
    expect(el.querySelector('main h1')?.textContent).toBe('Notifications')
    expect(lines(items(el)[0])).toEqual(['Ana Ríos asks for your approval', 'Delete a company', 'Relaticle CRM'])
  })

  it('offers nothing of them against an agent that does not declare `features.notifications`', async () => {
    const { el, agent } = await jonas([], { features: { tools: true, connections: true } })
    expect(row(el, 'Communication')?.querySelector('.notifications-count')).toBeNull()
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    expect(byText(el, '[role="menuitem"]', /^Notifications/)).toBeUndefined()
    await click(row(el, 'Communication'))
    expect(tabOf(el, /^Notifications/)).toBeUndefined()
    expect(agent.calls.some((c) => c.url.includes('notifications'))).toBe(false)
  })
})

describe('deciding in the Notifications (UI-APPR-002, UI-APPR-008, PROF-TOOL-026)', () => {
  it('decides one that needs no attestation with Approve and the note, starting no turn and adding nothing', async () => {
    let decided = false
    const { el, hub, agent } = await jonas([
      [/^POST \/s\d\/runs$/, decision('apr_7', 'APPROVED')],
      [
        /^GET \/notifications\?/,
        () =>
          decided
            ? json({
                notifications: [
                  item(
                    {
                      ...DELETE,
                      status: 'APPROVED',
                      canDecide: false,
                      decisions: [{ by: { displayName: 'Jonas Weber' }, decision: 'approve', at: at(0) }],
                      closedAt: at(0),
                    },
                    { waiting: false }
                  ),
                ],
                nextBefore: null,
                waiting: 0,
              })
            : json({ notifications: [item(DELETE)], nextBefore: null, waiting: 1 }),
      ],
    ])
    const before = JSON.stringify(hub.getSnapshot().transcripts)
    hub.openNotifications(AGENT)
    await until(() => items(el).length === 1)
    const n = items(el)[0] as HTMLElement
    expect(byText(n, 'button', 'Decide on your phone')).toBeUndefined()
    await type(n.querySelector('input[aria-label="Note (optional)"]'), 'Checked with finance')
    decided = true
    await click(byText(n, 'button', 'Approve'))
    await until(() => /^Approved by you · /.test(statusOf(items(el)[0]) ?? ''))
    const runs = agent.calls.filter((c) => c.method === 'POST' && /\/s\d\/runs$/.test(c.url))
    expect(runs).toHaveLength(1)
    expect(actionOf(runs[0])).toEqual({
      kind: 'approval.decide',
      approvalId: 'apr_7',
      decision: 'approve',
      note: 'Checked with finance',
    })
    // no turn, and nothing added to any conversation of Jonas
    expect(JSON.stringify(hub.getSnapshot().transcripts)).toBe(before)
    expect(Object.values(hub.getSnapshot().transcripts).every((t) => t.run === null)).toBe(true)
    expect(byText(items(el)[0] as HTMLElement, 'button', 'Approve')).toBeUndefined()
  })

  it('"Decide on your phone" sends the request to the phone again, and says so; never `approval.decide`', async () => {
    let answer = () => json({ expiresAt: at(-5) }, 202)
    const { el, agent } = await jonas([
      [/^GET \/spaces\/spc_comms\/notifications\?/, page([item(postApproval())], 1)],
      ['POST /approvals/apr_1/resend', () => answer()],
    ])
    await click(row(el, 'Communication'))
    await click(tabOf(el, /^Notifications/))
    await until(() => items(el).length === 1)
    await click(byText(items(el)[0] as HTMLElement, 'button', 'Decide on your phone'))
    await until(() => el.querySelector('.notification-notice')?.textContent === 'Sent to your phone')
    expect(agent.find('POST', '/approvals/apr_1/resend')).toHaveLength(1)
    expect(agent.calls.some((c) => c.method === 'POST' && c.url.endsWith('/runs'))).toBe(false)
    // a phone the agent cannot reach
    answer = () => json({ error: 'confirmation-unavailable' }, 409)
    await click(byText(items(el)[0] as HTMLElement, 'button', 'Decide on your phone'))
    await until(
      () =>
        el.querySelector('.notification .tool-error')?.textContent ===
        'Fleet support cannot reach the Ayni app on your phone.'
    )
  })

  it('offers Decide on your phone at once when the agent answers that the decision is made there', async () => {
    const { el } = await jonas([
      [/^POST \/s\d\/runs$/, () => sse({ type: 'RUN_ERROR', code: 'decide-on-phone', message: 'attested' })],
      [/^GET \/notifications\?/, page([item(DELETE)], 1)],
    ])
    // through the agent's menu
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    await click(byText(el, '[role="menuitem"]', /^Notifications/))
    await until(() => items(el).length === 1)
    await click(byText(items(el)[0] as HTMLElement, 'button', 'Reject'))
    await until(() => !!byText(items(el)[0] as HTMLElement, 'button', 'Decide on your phone'))
    expect(byText(items(el)[0] as HTMLElement, 'button', 'Reject')).toBeUndefined()
  })

  it("shows what became of each: who decided and when, the person's own while others decide, Sent by you", async () => {
    const decisions = [{ by: { displayName: 'Marta Kovač' }, decision: 'reject', at: '2026-11-21T21:51:00Z' }]
    const { el } = await jonas([
      [
        /^GET \/spaces\/spc_comms\/notifications\?/,
        page([
          item(postApproval({ approvalId: 'a1', status: 'REJECTED', canDecide: false, decisions })),
          item(postApproval({ approvalId: 'a2', status: 'PENDING', canDecide: false, myDecision: 'approve' })),
          item(postApproval({ approvalId: 'a3', status: 'EXPIRED', canDecide: false })),
          item(postApproval({ approvalId: 'a4', status: 'CANCELLED', canDecide: false })),
          item(postApproval({ approvalId: 'a5', own: true, canDecide: false, requester: { displayName: 'Jonas' } })),
        ]),
      ],
    ])
    await click(row(el, 'Communication'))
    await click(tabOf(el, /^Notifications/))
    await until(() => items(el).length === 5)
    const [rejected, mine, expired, withdrawn, sent] = items(el)
    expect(statusOf(rejected)).toMatch(/^Rejected by Marta Kovač · .*21.*:51/)
    expect(statusOf(mine)).toBe('Approved by you · Waiting for other approvers')
    expect(statusOf(expired)).toBe('Not answered in time')
    expect(statusOf(withdrawn)).toBe('Withdrawn')
    expect(sent?.querySelector('.tool-approval-head')?.textContent).toBe('Sent by you')
    expect(statusOf(sent)).toBe("Waiting for Jonas Weber's approval")
    // read-only: no control on any of them
    for (const n of items(el)) expect(n.querySelector('.actions')).toBeNull()
    // the icons are drawn, never typed
    expect(rejected?.querySelector('.notification-status svg')).toBeTruthy()
  })

  it('says "No notifications." when there is none, and reads more as the person asks', async () => {
    const first = Array.from({ length: 50 }, (_, i) => item(postApproval({ approvalId: `p${i}`, status: 'EXPIRED' })))
    const { el, agent } = await jonas([
      [/^GET \/spaces\/spc_comms\/notifications\?limit=50&before=p49$/, page([item(DELETE)], 0)],
      [/^GET \/spaces\/spc_comms\/notifications\?/, page(first, 0, 'p49')],
      [/^GET \/spaces\/spc_truck14\/notifications\?/, page([], 0)],
    ])
    await click(row(el, 'Truck 14 recall'))
    await click(tabOf(el, /^Notifications/))
    await until(() => el.querySelector('.notifications .empty')?.textContent === 'No notifications.')
    await click(row(el, 'Communication'))
    await click(tabOf(el, /^Notifications/))
    await until(() => items(el).length === 50)
    await click(byText(el, 'button', 'Show more'))
    await until(() => items(el).length === 51)
    expect(agent.find('GET', '/spaces/spc_comms/notifications?limit=50&before=p49')).toHaveLength(1)
    expect(byText(el, 'button', 'Show more')).toBeUndefined()
  })
})

describe('the Notifications kept current (PROF-TOOL-025)', () => {
  it('are read again on the event, when the tab is in front again and from another tab, which they tell', async () => {
    let waiting = 0
    const { el, hub, agent } = await jonas([
      [
        /^GET \/spaces\/spc_comms\/notifications\?/,
        () =>
          json({ notifications: waiting ? [item(postApproval())] : [], nextBefore: null, waiting: waiting ? 1 : 0 }),
      ],
    ])
    const messages: { kind: string }[] = []
    // @ts-expect-error private: the tab sync bus of this test tab
    hub.bus = { ...hub.bus, post: (m: { kind: string }) => messages.push(m) }
    await click(row(el, 'Communication'))
    await click(tabOf(el, /^Notifications/))
    await until(() => el.querySelector('.notifications .empty'))
    const reads = () => agent.calls.filter((c) => c.url.includes('/spaces/spc_comms/notifications')).length
    const before = reads()
    // Ana asks: the event on one of Jonas's streams, without a reload
    waiting = 1
    await announce(hub, 's1', { spaceId: 'spc_comms', id: 'apr_1', kind: 'approval', waiting: true, count: 1 })
    await until(() => items(el).length === 1)
    expect(reads()).toBeGreaterThan(before)
    expect(tabOf(el, /^Notifications/)?.querySelector('.notifications-count')?.textContent).toContain('1')
    // told to the other tabs
    expect(messages.filter((m) => m.kind === 'notifications-changed')).toEqual([
      {
        kind: 'notifications-changed',
        agentDid: AGENT,
        change: { spaceId: 'spc_comms', id: 'apr_1', kind: 'approval', waiting: true, count: 1 },
      },
    ])
    // decided on the phone, heard by another tab
    waiting = 0
    // @ts-expect-error private: a message of the tab that streams the session that heard it
    hub.onBus({
      kind: 'notifications-changed',
      agentDid: AGENT,
      change: { spaceId: 'spc_comms', id: 'apr_1', kind: 'approval', waiting: false, count: 0 },
    })
    await until(() => items(el).length === 0)
    expect(tabOf(el, /^Notifications/)?.querySelector('.notifications-count')).toBeNull()
    expect(messages.filter((m) => m.kind === 'notifications-changed')).toHaveLength(1)
    // back in front of the person
    const now = reads()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await until(() => reads() > now)
  })

  it('open from a link with its item selected, and decide nothing (UI-LINK-001, PROF-LINK-005)', async () => {
    const { el, hub, agent } = await jonas([
      [
        /^GET \/spaces\/spc_comms\/notifications\?/,
        page([item(postApproval({ approvalId: 'apr_0' })), item(postApproval())], 2),
      ],
      [/^GET \/notifications\?/, page([item(DELETE)], 1)],
    ])
    expect(
      hub.openAppLink(`${location.origin}/app/service/${AGENT}/spaces/spc_comms/notifications?approval=apr_1`)
    ).toBe(true)
    expect(hub.getSnapshot().view).toBe('space')
    expect(hub.getSnapshot().spaceFor).toMatchObject({ spaceId: 'spc_comms', segment: 'notifications' })
    await until(() => items(el).length === 2)
    const selected = el.querySelector<HTMLElement>('.notification.selected')
    expect(selected?.getAttribute('aria-current')).toBe('true')
    expect(document.activeElement).toBe(selected)
    expect(items(el).indexOf(selected as HTMLElement)).toBe(1)
    expect(hub.openAppLink(`${location.origin}/app/service/${AGENT}/notifications?approval=apr_7&x=1`)).toBe(true)
    expect(hub.getSnapshot().view).toBe('notifications')
    await until(() => el.querySelector('.notification.selected'))
    expect(agent.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })
})

describe("the requester's one card (UI-APPR-005, UI-APPR-006)", () => {
  const card = (over: Record<string, unknown> = {}): TranscriptMessage => ({
    id: 'act_1',
    role: 'activity',
    activityType: 'ayni.approval',
    content: { ...postApproval({ own: true, canDecide: false, attested: undefined, decisions: undefined }), ...over },
    at: at(1),
  })
  const asked: TranscriptMessage = { id: 'u1', role: 'user', content: 'Post our hiring news on X', at: at(2) }

  async function ana(routes: [string | RegExp, (call: Call) => Response | Promise<Response>][] = []) {
    const agent = fakeAgent([...routes, [/^GET \/notifications\?/, page([], 0)]])
    const who = { principal: { displayName: 'Ana Ríos' } as never }
    const hub = await tab({
      sessions: [
        record({ sessionId: 's1', title: 'Hiring post', spaceId: 'spc_comms', ...who }),
        record({ sessionId: 's2', title: 'Logo ideas', spaceId: 'spc_comms', ...who }),
      ],
      transcripts: [
        transcript('s1', [asked, card()]),
        transcript('s2', [{ id: 'u9', role: 'user', content: 'Logo?', at: at(5) }]),
      ],
      spaces: { spaces: [PERSONAL, COMMS_ANA], templates: [] },
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true, s2: true } },
    })
    const el = await render(hub, <Screen />)
    return { hub, el, agent }
  }
  const cards = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('main .tool-approval')]

  it('is one card in the conversation where she asked, and is replaced in place by each status', async () => {
    const { hub, el } = await ana()
    expect(cards(el)).toHaveLength(1)
    expect(cards(el)[0]?.querySelector('.tool-approval-head')?.textContent).toBe("Waiting for Jonas Weber's approval")
    expect(byText(cards(el)[0] as HTMLElement, 'button', 'Cancel')).toBeTruthy()
    // Jonas approves on his phone: the update, then the activity in its new status under the same message id
    // @ts-expect-error private: events as the session's stream delivers them
    await hub.onEvent(
      's1',
      {
        type: 'CUSTOM',
        name: 'ayni.approval.update',
        value: { approvalId: 'apr_1', status: 'APPROVED', decidedBy: 'Jonas Weber' },
      },
      undefined,
      false
    )
    await until(() => cards(el)[0]?.querySelector('.tool-approval-head')?.textContent === 'Approved by Jonas Weber')
    // @ts-expect-error private
    await hub.onEvent(
      's1',
      {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'act_1',
        activityType: 'ayni.approval',
        content: { ...(card().content as Record<string, unknown>), status: 'APPROVED', decidedBy: 'Jonas Weber' },
      },
      undefined,
      false
    )
    await settle()
    expect(cards(el)).toHaveLength(1)
    expect(cards(el)[0]?.querySelector('.tool-approval-head')?.getAttribute('role')).toBe('status')
    expect(byText(cards(el)[0] as HTMLElement, 'button', 'Cancel')).toBeUndefined()
    // where it was: after her message
    const messages = hub.getSnapshot().transcripts.s1?.messages ?? []
    expect(messages.map((m) => m.id)).toEqual(['u1', 'act_1'])
    // her other conversation holds no card
    hub.selectSession('s2')
    await settle()
    expect(cards(el)).toHaveLength(0)
    // a rejection, an expiry and a withdrawal read as UI-CONV-052 writes them
    for (const [status, words] of [
      ['REJECTED', 'Rejected by Jonas Weber'],
      ['EXPIRED', 'Not answered in time'],
      ['CANCELLED', 'Withdrawn'],
    ]) {
      teardown()
      const other = await ana()
      // @ts-expect-error private
      await other.hub.onEvent(
        's1',
        {
          type: 'CUSTOM',
          name: 'ayni.approval.update',
          value: { approvalId: 'apr_1', status, decidedBy: 'Jonas Weber' },
        },
        undefined,
        false
      )
      await until(() => cards(other.el)[0]?.querySelector('.tool-approval-head')?.textContent === words)
    }
  })

  it('Cancel withdraws it with no turn, and the card turns to Withdrawn where it is', async () => {
    const { el, hub, agent } = await ana([['POST /s1/runs', decision('apr_1', 'CANCELLED')]])
    await click(byText(cards(el)[0] as HTMLElement, 'button', 'Cancel'))
    await until(() => cards(el)[0]?.querySelector('.tool-approval-head')?.textContent === 'Withdrawn')
    expect(actionOf(agent.find('POST', '/s1/runs')[0])).toEqual({ kind: 'approval.cancel', approvalId: 'apr_1' })
    const t = hub.getSnapshot().transcripts.s1
    expect(t?.run).toBeNull()
    expect(t?.messages.map((m) => m.id)).toEqual(['u1', 'act_1'])
  })
})

describe('nothing waits without its card (UI-APPR-009, PROF-TOOL-027)', () => {
  const claim: TranscriptMessage = {
    id: 'a1',
    role: 'assistant',
    content: "I asked Jonas Weber for approval. You'll see it here once he decides.",
    at: at(1),
  }
  const ask: TranscriptMessage = { id: 'u1', role: 'user', content: 'Post it again', at: at(2) }

  it('a reply that says approval was requested shows no waiting line, mark or badge; its card would', async () => {
    fakeAgent([
      [/^GET \/spaces\/spc_comms\/notifications\?/, page([], 0)],
      [/^GET \/notifications\?/, page([], 0)],
    ])
    const who = { principal: { displayName: 'Ana Ríos' } as never }
    const sessions = [
      record({ sessionId: 's1', title: 'Hiring post', spaceId: 'spc_comms', ...who }),
      // a session closed long ago, its state left as it was then
      record({
        sessionId: 's0',
        state: 'closed',
        sessionToken: null,
        ayni: { pendingApprovals: 2, contextualMenu: { items: [] } } as never,
        ...who,
      }),
    ]
    const hub = await tab({
      sessions,
      transcripts: [transcript('s1', [ask, claim])],
      spaces: { spaces: [PERSONAL, COMMS_ANA], templates: [] },
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true } },
    })
    const el = await render(hub, <Screen />)
    const pane = () => el.querySelector('main') as HTMLElement
    expect(pane().textContent).toContain('I asked Jonas Weber for approval.')
    expect(pane().querySelector('.tool-approval')).toBeNull()
    expect(pane().textContent).not.toMatch(/Waiting for/)
    expect(el.querySelector('.notifications-count')).toBeNull()
    expect(el.querySelector('.rail .dot')).toBeNull()
    await click(row(el, 'Communication'))
    expect(tabOf(el, /^Notifications/)?.querySelector('.notifications-count')).toBeNull()
    teardown()
    // the same reply after the card
    const card: TranscriptMessage = {
      id: 'act_1',
      role: 'activity',
      activityType: 'ayni.approval',
      content: postApproval({ own: true, canDecide: false }),
      at: at(1.5),
    }
    fakeAgent([[/^GET \/notifications\?/, page([], 0)]])
    const withCard = await tab({
      sessions,
      transcripts: [transcript('s1', [ask, card, claim])],
      spaces: { spaces: [PERSONAL, COMMS_ANA], templates: [] },
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true } },
    })
    const shown = await render(withCard, <Screen />)
    expect(shown.querySelector('main .tool-approval-head')?.textContent).toBe("Waiting for Jonas Weber's approval")
  })

  it('the menu of a conversation carries no Approvals item and no badge of approvals', async () => {
    fakeAgent([])
    const hub = await tab({
      sessions: [
        record({
          sessionId: 's1',
          ayni: { pendingApprovals: 3, contextualMenu: { items: [{ id: 'help', label: 'Help' }] } } as never,
        }),
      ],
      transcripts: [transcript('s1', [])],
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true } },
    })
    const el = await render(hub, <Conversation />)
    const menu = el.querySelector('.conv-header [aria-label="Menu"]')
    expect(menu).toBeTruthy()
    expect(el.querySelector('.conv-header .badge')).toBeNull()
    expect(el.querySelector('.conv-header [aria-label="Approvals"]')).toBeNull()
  })
})

describe('the words of the Notifications in the four languages (UI-CONV-052)', () => {
  type Tree = { [key: string]: string | Tree }
  const at = (tree: Tree, path: string): unknown =>
    path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree)
  const files = { en, es, fr, pt } as unknown as Record<string, Tree>

  it('say in English what the core gives the app, and each text in the other three with what the screen puts in', () => {
    for (const [path, text] of Object.entries(NOTIFICATIONS_COPY)) {
      expect(at(files.en as Tree, path), path).toBe(text)
      for (const lang of ['es', 'fr', 'pt']) {
        const other = at(files[lang] as Tree, path) as string
        expect(other, `${lang}.${path}`).toBeTruthy()
        const names = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
        expect(names(other), `${lang}.${path}`).toEqual(names(text))
      }
    }
    // the words that differ from the English in each language
    expect((files.es as Tree).notifications).toMatchObject({ title: 'Notificaciones', sentByYou: 'Enviada por ti' })
    expect((files.fr as Tree).notifications).toMatchObject({ decideOnPhone: 'Décider sur votre téléphone' })
    expect((files.pt as Tree).notifications).toMatchObject({ empty: 'Nenhuma notificação.' })
  })
})

describe('the colours of the Notifications in both themes: light, dark by choice and dark by system (WCAG 2.2 AA)', () => {
  const token = (name: string) => {
    const m = css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))
    if (!m) throw new Error(`no token ${name}`)
    return m[1] as string
  }
  const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = (c: number[]) => 0.2126 * lin(c[0] ?? 0) + 0.7152 * lin(c[1] ?? 0) + 0.0722 * lin(c[2] ?? 0)
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
    return (hi + 0.05) / (lo + 0.05)
  }
  const mix = (a: number[], share: number, b: number[]) => a.map((c, i) => share * c + (1 - share) * (b[i] ?? 0))

  it('paint with the tokens of the palettes', () => {
    expect(rule('.notifications-count').background).toBe('var(--accent)')
    expect(rule('.notifications-count').color).toBe('var(--accent-contrast)')
    expect(rule('.notification-time').color).toBe('var(--muted)')
    expect(rule('.card.notification.selected')['border-color']).toBe('var(--accent)')
    expect(rule('.notification-notice').color).toBe('var(--text)')
    expect(rule('.notification-notice').background).toBe('color-mix(in srgb, var(--accent) 10%, var(--surface))')
    expect(rule('.segments .seg.on').background).toBe('color-mix(in srgb, var(--accent) 12%, var(--bg))')
    expect(rule('.space-row.selected').background).toBe('color-mix(in srgb, var(--accent) 12%, var(--bg))')
    // the item is the transcript's card
    expect(rule('.card').background).toBe('var(--surface)')
    // dark by choice and dark by system take the same dark tokens
    const blocks = [/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/, /:root\[data-theme="dark"\] \{([^}]*)\}/]
    for (const block of blocks)
      for (const r of ['accent', 'accent-contrast', 'bg', 'surface', 'text', 'muted'])
        expect(css.match(block)?.[1], r).toMatch(new RegExp(`--${r}: var\\(--dark-`))
  })

  it('read on both palettes, the figures as the PR states them', () => {
    const figures: Record<string, Record<string, number>> = {}
    for (const theme of ['light', 'dark']) {
      const of = (n: string) => rgb(n === 'danger' ? token('danger') : token(`${theme}-${n}`))
      const [accent, label, bg, surface, text, muted] = [
        'accent',
        'accentContrast',
        'bg',
        'surface',
        'text',
        'muted',
      ].map(of) as number[][]
      const tint = mix(accent as number[], 0.12, bg as number[])
      const f = {
        // the badge's number on its ground, and its edge on the tab, the selected tab and the selected row
        badge: ratio(label as number[], accent as number[]),
        badgeOnPage: ratio(accent as number[], bg as number[]),
        badgeOnSelected: ratio(accent as number[], tint),
        // an item, on the transcript's card
        heading: ratio(text as number[], surface as number[]),
        muted: ratio(muted as number[], surface as number[]),
        // the edge of the item a link names, on the page's ground
        selectedEdge: ratio(accent as number[], bg as number[]),
        // Sent to your phone, and a refusal
        notice: ratio(text as number[], mix(accent as number[], 0.1, surface as number[])),
        refusal: ratio(text as number[], mix(of('danger'), 0.12, surface as number[])),
        // Approve and Decide on your phone, the primary button
        primary: ratio(label as number[], accent as number[]),
      }
      for (const [name, value] of Object.entries(f)) {
        const edge = name.startsWith('badgeOn') || name === 'selectedEdge'
        expect(value, `${theme}: ${name}`).toBeGreaterThanOrEqual(edge ? 3 : 4.5)
      }
      figures[theme] = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 100) / 100]))
    }
    expect(figures).toEqual({
      light: {
        badge: 5.47,
        badgeOnPage: 5.47,
        badgeOnSelected: 4.63,
        heading: 16.98,
        muted: 4.63,
        selectedEdge: 5.47,
        notice: 14.81,
        refusal: 13.87,
        primary: 5.47,
      },
      dark: {
        badge: 7.77,
        badgeOnPage: 10.06,
        badgeOnSelected: 8.12,
        heading: 16.12,
        muted: 6.99,
        selectedEdge: 10.06,
        notice: 13.39,
        refusal: 15.37,
        primary: 7.77,
      },
    })
  })
})
