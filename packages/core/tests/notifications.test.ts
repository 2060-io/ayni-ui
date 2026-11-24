/**
 * The Notifications in the core (agent D114; AG-UI profile 3.5 as amended on 2026-11-21): the lists of §3.12 as the
 * agent gives them and as the client asks for them (PROF-TOOL-024), Decide on your phone (PROF-TOOL-026), the event
 * and the counts (PROF-TOOL-025), `features.notifications` (PROF-DESC-011), the rules a screen follows with an item and
 * with the requester's card (UI-APPR-006..009), the app links of PROF-LINK-005, the segment of a space's page
 * (UI-APPR-007), and the withdrawn `ayni.approval.request`.
 */
import { describe, expect, it } from 'vitest'
import { destinationKey, hasWebRoute, parseAppLink } from '../src/appLinks.js'
import {
  approvalRefusalOf,
  cardStatusOf,
  decidedAtOf,
  drawsApprovalCard,
  NOTIFICATIONS_CHANGED,
  notificationControlsOf,
  notificationHeadingOf,
  notificationStatusOf,
  notificationsChangeOf,
  notificationsPageOf,
  notificationsWaitingOf,
  takesNotifications,
  withSpaceCount,
} from '../src/notifications.js'
import { NOTIFICATIONS_COPY } from '../src/notificationsCopy.js'
import { ProfileClient, ProfileError } from '../src/profileClient.js'
import { emptyTranscript, reduce } from '../src/reducer.js'
import { spaceOf, spaceSegmentsOf } from '../src/spaces.js'
import type { SessionRecord } from '../src/types.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'
const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** The example of §3.12: Ana's post on X in Communication, waiting for Jonas, read by Jonas. */
const POST = {
  id: 'apr_1',
  kind: 'approval',
  at: '2026-11-21T21:49:00Z',
  waiting: true,
  approval: {
    approvalId: 'apr_1',
    kind: 'sensitivity',
    status: 'PENDING',
    expiresAt: '2026-11-21T21:54:00Z',
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
      fields: [{ label: 'Text', value: 'We are hiring.\nThree roles in Rotterdam.' }],
      erased: false,
    },
    space: { id: 'spc_comms', title: 'Communication' },
    policy: { type: 'count', value: 1 },
    decisions: [],
  },
}

describe('the lists of §3.12 (PROF-TOOL-024)', () => {
  it('reads an item as the agent gives it, with its exact action and space', () => {
    const page = notificationsPageOf({ notifications: [POST], nextBefore: null, waiting: 1 })
    expect(page.waiting).toBe(1)
    expect(page.nextBefore).toBeNull()
    expect(page.notifications).toHaveLength(1)
    const [item] = page.notifications
    expect(item).toMatchObject({ id: 'apr_1', kind: 'approval', at: '2026-11-21T21:49:00Z', waiting: true })
    expect(item?.approval).toMatchObject({
      approvalId: 'apr_1',
      kind: 'sensitivity',
      status: 'PENDING',
      requester: { displayName: 'Ana Ríos', role: 'member' },
      own: false,
      canDecide: true,
      attested: true,
      myDecision: null,
      space: { id: 'spc_comms', title: 'Communication' },
      decisions: [],
    })
    expect(item?.approval.action?.fields).toEqual([
      { label: 'Text', value: 'We are hiring.\nThree roles in Rotterdam.', pinned: false },
    ])
  })

  it('reads an elevation, a past item and a request the person sent; leaves out what it cannot show', () => {
    const page = notificationsPageOf({
      notifications: [
        {
          id: 'apr_2',
          kind: 'approval',
          at: '2026-11-21T20:00:00Z',
          waiting: false,
          approval: {
            approvalId: 'apr_2',
            kind: 'elevation',
            status: 'APPROVED',
            tool: 'crm.export',
            requester: { displayName: 'Ana Ríos' },
            purpose: { id: 'audit', label: 'Audit' },
            justification: 'The yearly audit.',
            own: true,
            canDecide: true,
            decisions: [{ by: { displayName: 'Marta Kovač' }, decision: 'approve', at: '2026-11-21T20:05:00Z' }],
            closedAt: '2026-11-21T20:05:00Z',
          },
        },
        { id: 'x', kind: 'invitation', at: '', waiting: false },
        { id: 'y', kind: 'approval', approval: {} },
      ],
      nextBefore: 'apr_2',
      waiting: 0,
    })
    expect(page.notifications).toHaveLength(1)
    expect(page.nextBefore).toBe('apr_2')
    const a = page.notifications[0]?.approval
    expect(a).toMatchObject({
      kind: 'elevation',
      status: 'APPROVED',
      purpose: { id: 'audit', label: 'Audit' },
      justification: 'The yearly audit.',
      own: true,
      // a request the person sent is read, never decided
      canDecide: false,
      decisions: [{ by: 'Marta Kovač', decision: 'approve', at: '2026-11-21T20:05:00Z' }],
      closedAt: '2026-11-21T20:05:00Z',
    })
    expect(a?.action).toBeUndefined()
    expect(notificationsPageOf(undefined)).toEqual({ notifications: [], nextBefore: null, waiting: 0 })
  })

  it("asks for a space's list and for the agent's, newest first, paged, 200 at most", async () => {
    const calls: string[] = []
    const client = new ProfileClient(SESSIONS, (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return json({ notifications: [POST], nextBefore: null, waiting: 1 })
    }) as typeof fetch)
    const page = await client.notifications('tok', 'spc_comms')
    expect(page.waiting).toBe(1)
    await client.notifications('tok', null, 'apr_9', 500)
    await client.notifications('tok', null, undefined, 1)
    expect(calls).toEqual([
      `${SESSIONS}/spaces/spc_comms/notifications?limit=50`,
      `${SESSIONS}/notifications?limit=200&before=apr_9`,
      `${SESSIONS}/notifications?limit=1`,
    ])
  })

  it('sends Decide on your phone, and gives its refusals as they come (PROF-TOOL-026)', async () => {
    const sent: { url: string; method?: string; auth: string | null }[] = []
    let answer = () => json({ expiresAt: '2026-11-21T22:00:00Z' }, 202)
    const client = new ProfileClient(SESSIONS, (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), method: init?.method, auth: new Headers(init?.headers).get('authorization') })
      return answer()
    }) as typeof fetch)
    expect(await client.resendApproval('tok', 'apr_1')).toEqual({ expiresAt: '2026-11-21T22:00:00Z' })
    expect(sent).toEqual([{ url: `${SESSIONS}/approvals/apr_1/resend`, method: 'POST', auth: 'Bearer tok' }])
    for (const [status, code, refusal] of [
      [409, 'not-pending', 'ended'],
      [409, 'confirmation-unavailable', 'phoneUnreachable'],
      [404, 'not-found', 'notEligible'],
    ] as const) {
      answer = () => json({ error: code }, status)
      const error = await client.resendApproval('tok', 'apr_1').catch((e) => e)
      expect(error).toBeInstanceOf(ProfileError)
      expect(approvalRefusalOf(error)).toBe(refusal)
    }
    expect(approvalRefusalOf({ code: 'decide-on-phone' })).toBe('onPhone')
    expect(approvalRefusalOf({ code: 'not-eligible' })).toBe('notEligible')
    expect(approvalRefusalOf({ status: 500, code: 'boom' })).toBe('other')
  })
})

describe('the event and the counts (PROF-TOOL-025, PROF-DESC-011)', () => {
  it('reads `ayni.space.notifications.changed`, `spaceId` null for the agent', () => {
    expect(
      notificationsChangeOf({ spaceId: 'spc_comms', id: 'apr_1', kind: 'approval', waiting: true, count: 1 })
    ).toEqual({ spaceId: 'spc_comms', id: 'apr_1', kind: 'approval', waiting: true, count: 1 })
    expect(notificationsChangeOf({ spaceId: null, id: 'apr_2', kind: 'approval', waiting: false, count: 0 })).toEqual({
      spaceId: null,
      id: 'apr_2',
      kind: 'approval',
      waiting: false,
      count: 0,
    })
    expect(notificationsChangeOf({ id: 'apr_1', count: 1 })).toBeNull()
    expect(notificationsChangeOf({ spaceId: 'spc_comms', id: 'apr_1' })).toBeNull()
  })

  it("takes each space's `notificationsWaiting` from GET /spaces, and the agent's number as it is", () => {
    const space = spaceOf({ id: 'spc_comms', title: 'Communication', notificationsWaiting: 2 })
    expect(notificationsWaitingOf(space ?? undefined)).toBe(2)
    expect(notificationsWaitingOf(spaceOf({ id: 'spc_x', title: 'X' }) ?? undefined)).toBe(0)
    const spaces = [
      { id: 'a', notificationsWaiting: 2 },
      { id: 'b', notificationsWaiting: 0 },
    ]
    expect(withSpaceCount(spaces, 'b', 3)).toEqual([
      { id: 'a', notificationsWaiting: 2 },
      { id: 'b', notificationsWaiting: 3 },
    ])
    // heard on every bound session: the same number, never added up
    expect(withSpaceCount(withSpaceCount(spaces, 'a', 1), 'a', 1)[0]?.notificationsWaiting).toBe(1)
  })

  it('serves nothing of them for an agent that does not declare `features.notifications`', () => {
    expect(takesNotifications({ notifications: true })).toBe(true)
    expect(takesNotifications({ approvals: true })).toBe(false)
    expect(takesNotifications(undefined)).toBe(false)
  })

  it('signals the event and puts nothing of it, or of the withdrawn `ayni.approval.request`, in the transcript', () => {
    const session = {
      sessionId: 's1',
      agentDid: 'did:x',
      sessionToken: 't',
      title: '',
      createdAt: '',
      state: 'bound',
      lastEventId: 0,
      unreadCount: 0,
      lastPreview: '',
      lastMessageAt: '',
      draft: '',
      ayni: null,
    } as SessionRecord
    const changed = reduce(
      emptyTranscript('s1'),
      session,
      {
        type: 'CUSTOM',
        name: NOTIFICATIONS_CHANGED,
        value: { spaceId: null, id: 'apr_1', kind: 'approval', waiting: true, count: 1 },
      },
      false,
      true
    )
    expect(changed.signals).toEqual(['notifications'])
    expect(changed.transcript.messages).toEqual([])
    const request = reduce(
      emptyTranscript('s1'),
      session,
      { type: 'CUSTOM', name: 'ayni.approval.request', value: { approvalId: 'apr_1', kind: 'sensitivity' } },
      false,
      true
    )
    expect(request.signals).toEqual([])
    expect(request.transcript.messages).toEqual([])
  })
})

describe('an item (UI-APPR-002, UI-APPR-007, UI-APPR-008)', () => {
  const approval = (over: Record<string, unknown> = {}) => {
    const page = notificationsPageOf({ notifications: [{ ...POST, approval: { ...POST.approval, ...over } }] })
    const a = page.notifications[0]?.approval
    if (!a) throw new Error('no item')
    return a
  }

  it('offers Decide on your phone for one to attest, Approve and Reject for any other, nothing once read-only', () => {
    expect(notificationControlsOf(approval())).toBe('phone')
    expect(notificationControlsOf(approval({ attested: false }))).toBe('decide')
    expect(notificationControlsOf(approval({ own: true, canDecide: false }))).toBe('none')
    expect(notificationControlsOf(approval({ attested: false, myDecision: 'approve' }))).toBe('none')
    expect(notificationControlsOf(approval({ attested: false, status: 'APPROVED' }))).toBe('none')
    expect(notificationControlsOf(approval({ attested: false, canDecide: false }))).toBe('none')
  })

  it('is headed by who asks, or by Sent by you', () => {
    expect(notificationHeadingOf(approval())).toEqual({ key: 'asksYou', requester: 'Ana Ríos' })
    expect(notificationHeadingOf(approval({ own: true, canDecide: false }))).toEqual({ key: 'sentByYou' })
  })

  it('says its status: the time left, the person\'s own decision, who decided and when, "you" for the person', () => {
    expect(notificationStatusOf(approval())).toEqual({ key: 'timeLeft', expiresAt: '2026-11-21T21:54:00Z' })
    expect(notificationStatusOf(approval({ own: true, canDecide: false }), 'Ana Ríos', 'Jonas Weber')).toEqual({
      key: 'waitingFor',
      approver: 'Jonas Weber',
    })
    expect(notificationStatusOf(approval({ canDecide: false, myDecision: 'approve' }))).toEqual({
      key: 'mine',
      decision: 'approve',
    })
    const decided = (by: string, decision = 'approve', status = 'APPROVED') =>
      approval({
        status,
        canDecide: false,
        decisions: [
          { by: { displayName: 'Marta Kovač' }, decision: 'approve', at: '2026-11-21T21:50:00Z' },
          { by: { displayName: by }, decision, at: '2026-11-21T21:51:00Z' },
        ],
        closedAt: '2026-11-21T21:51:00Z',
      })
    expect(notificationStatusOf(decided('Jonas Weber'), 'Jonas Weber')).toEqual({
      key: 'decided',
      decision: 'approve',
      by: 'Jonas Weber',
      you: true,
      at: '2026-11-21T21:51:00Z',
    })
    expect(notificationStatusOf(decided('Jonas Weber'), 'Ana Ríos')).toMatchObject({ by: 'Jonas Weber', you: false })
    expect(notificationStatusOf(decided('Jonas Weber', 'reject', 'REJECTED'), 'Ana Ríos')).toMatchObject({
      key: 'decided',
      decision: 'reject',
      by: 'Jonas Weber',
    })
    expect(notificationStatusOf(approval({ status: 'EXPIRED' }))).toEqual({ key: 'expired' })
    expect(notificationStatusOf(approval({ status: 'CANCELLED' }))).toEqual({ key: 'withdrawn' })
  })

  it('writes when it was decided as the day, the short month and the time, the year when it is not this one', () => {
    const now = new Date('2026-11-22T10:00:00Z')
    const at = decidedAtOf('2026-11-21T21:51:00Z', 'en-GB', now)
    expect(at).toMatch(/21 Nov/)
    expect(at).toMatch(/\d{2}:51/)
    expect(decidedAtOf('2025-11-21T21:51:00Z', 'en-GB', now)).toMatch(/2025/)
    expect(decidedAtOf('not a date', 'en-GB', now)).toBe('')
  })
})

describe("the requester's card (UI-APPR-006, UI-APPR-001)", () => {
  it('waits for the owner, then says the outcome where it waited, by whom', () => {
    expect(cardStatusOf({ status: 'PENDING' }, 'Jonas Weber')).toEqual({ key: 'waitingFor', approver: 'Jonas Weber' })
    expect(cardStatusOf({ status: 'PENDING' })).toEqual({ key: 'waiting' })
    expect(cardStatusOf({ status: 'APPROVED', decidedBy: 'Jonas Weber' }, 'Jonas Weber')).toEqual({
      key: 'decided',
      decision: 'approve',
      by: 'Jonas Weber',
      you: false,
    })
    expect(cardStatusOf({ status: 'REJECTED', decidedBy: 'Jonas Weber' })).toMatchObject({ decision: 'reject' })
    expect(cardStatusOf({ status: 'EXPIRED' })).toEqual({ key: 'expired' })
    expect(cardStatusOf({ status: 'CANCELLED' })).toEqual({ key: 'withdrawn' })
  })

  it("is drawn in a conversation as the requester's card or a confirmation, never as an approver's request", () => {
    expect(drawsApprovalCard({ kind: 'sensitivity', own: true, canDecide: false })).toBe(true)
    expect(drawsApprovalCard({ kind: 'confirmation', canDecide: true })).toBe(true)
    expect(drawsApprovalCard({ kind: 'sensitivity', own: false, canDecide: true })).toBe(false)
    expect(drawsApprovalCard({ kind: 'elevation', canDecide: true })).toBe(false)
  })
})

describe('the app links of the Notifications (PROF-LINK-005, PROF-LINK-003)', () => {
  const origin = 'https://app.dev.ayni.org'

  it("opens a space's Notifications and the agent's, the item of `approval` selected, ignoring any other parameter", () => {
    expect(
      parseAppLink('/app/service/did:webvh:x:svc/spaces/spc_comms/notifications?approval=apr_1&utm=x', origin)
    ).toEqual({ path: 'service', did: 'did:webvh:x:svc', notifications: { spaceId: 'spc_comms', approval: 'apr_1' } })
    expect(parseAppLink('/app/service/did:webvh:x:svc/notifications?approval=apr_2', origin)).toEqual({
      path: 'service',
      did: 'did:webvh:x:svc',
      notifications: { approval: 'apr_2' },
    })
    expect(parseAppLink('/app/service/did:webvh:x:svc/notifications', origin)).toEqual({
      path: 'service',
      did: 'did:webvh:x:svc',
      notifications: {},
    })
    expect(parseAppLink('/app/service/did:webvh:x:svc/spaces/spc_comms', origin)).toEqual({ path: 'unknown' })
    expect(parseAppLink('/app/service/did:webvh:x:svc/spaces/notifications', origin)).toEqual({ path: 'unknown' })
  })

  it('has a web route, named by its own words on hover', () => {
    const space = parseAppLink('/app/service/did:webvh:x:svc/spaces/spc_comms/notifications', origin)
    const agent = parseAppLink('/app/service/did:webvh:x:svc/notifications', origin)
    expect(hasWebRoute(space)).toBe(true)
    expect(destinationKey(space)).toBe('spaceNotifications')
    expect(destinationKey(agent)).toBe('serviceNotifications')
  })
})

describe("the segments of a space's page (UI-APPR-007)", () => {
  const team = { kind: 'team' as const, role: 'member' as const }
  it('put Notifications right after Conversations for every member, against an agent that declares them', () => {
    expect(spaceSegmentsOf(team, { notifications: true })).toEqual([
      'conversations',
      'notifications',
      'memories',
      'about',
    ])
    expect(spaceSegmentsOf({ kind: 'team', role: 'owner' }, { tools: true, notifications: true })).toEqual([
      'conversations',
      'notifications',
      'memories',
      'about',
      'members',
      'tools',
      'settings',
      'activity',
    ])
    expect(spaceSegmentsOf(team, { notifications: false })).toEqual(['conversations', 'memories', 'about'])
    // what Personal's tools ask is in the agent's Notifications
    expect(spaceSegmentsOf({ kind: 'personal', role: 'owner' }, { notifications: true })).toEqual([
      'conversations',
      'memories',
      'about',
    ])
  })
})

describe('the words (UI-CONV-052)', () => {
  it('are the rows of the table, as the spec writes them', () => {
    expect(NOTIFICATIONS_COPY['notifications.title']).toBe('Notifications')
    expect(NOTIFICATIONS_COPY['spaces.segments.notifications']).toBe('Notifications')
    expect(NOTIFICATIONS_COPY['notifications.empty']).toBe('No notifications.')
    expect(NOTIFICATIONS_COPY['notifications.sentByYou']).toBe('Sent by you')
    expect(NOTIFICATIONS_COPY['approval.approvedBy']).toBe('Approved by {{name}}')
    expect(NOTIFICATIONS_COPY['approval.rejectedBy']).toBe('Rejected by {{name}}')
    expect(NOTIFICATIONS_COPY['approval.approvedByYouWaiting']).toBe('Approved by you · Waiting for other approvers')
    expect(NOTIFICATIONS_COPY['approval.rejectedByYouWaiting']).toBe('Rejected by you · Waiting for other approvers')
    expect(NOTIFICATIONS_COPY['approval.notAnswered']).toBe('Not answered in time')
    expect(NOTIFICATIONS_COPY['approval.withdrawn']).toBe('Withdrawn')
    expect(NOTIFICATIONS_COPY['notifications.decideOnPhone']).toBe('Decide on your phone')
    expect(NOTIFICATIONS_COPY['notifications.sentToPhone']).toBe('Sent to your phone')
    expect(NOTIFICATIONS_COPY['notifications.phoneUnreachable']).toBe(
      '{{agent}} cannot reach the Ayni app on your phone.'
    )
    // Reject stays the existing card's word
    expect(NOTIFICATIONS_COPY['approval.reject']).toBe('Reject')
  })
})
