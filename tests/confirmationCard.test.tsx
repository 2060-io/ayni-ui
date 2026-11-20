/**
 * The cards of tool calls in a conversation (profile 3.4 §6; agent D99): the confirmation card with the exact action,
 * its buttons, the answer on its way and failing, each outcome, the allowance and Stop allowing, untrusted content, a
 * card whose message was deleted (UI-CONV-045, UI-CONV-046); no working indicator under a card that waits, Stop kept;
 * the approval of a tool call to the approver and to the requester (UI-APPR-006); and the sessions this browser
 * creates say profile 3.4 (UI-SESS-018).
 */
import type { TranscriptMessage } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Conversation } from '../src/components/Conversation.js'
import type { Hub } from '../src/state/hub.js'
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
  SPACES,
  setup,
  space,
  tab,
  teardown,
  transcript,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const NOTE = 'Called Marta: renewal in March,\nquote for 40 seats.\n\nSend the quote by Friday.'
const confirmation = (over: Record<string, unknown> = {}, action: Record<string, unknown> = {}) => ({
  approvalId: 'apr_1',
  kind: 'confirmation',
  status: 'PENDING',
  expiresAt: at(-5),
  requester: { name: 'Ana Ríos' },
  tool: 'create-note',
  action: {
    title: 'Add a note',
    source: { id: 'relaticle', title: 'Relaticle CRM' },
    account: { kind: 'space', space: { id: 'spc_sales', title: 'Sales EU' } },
    fields: [
      { label: 'Workspace', value: 'sales-eu', pinned: true },
      { label: 'Company', value: 'Acme Logistics' },
      { label: 'Note', value: NOTE },
      { label: 'Extra', value: '{\n  "seats": 40,\n  "currency": "EUR"\n}' },
    ],
    erased: false,
    ...action,
  },
  allowForConversation: true,
  ...over,
})
const cardMessage = (content: Record<string, unknown>, id = 'act_1'): TranscriptMessage => ({
  id,
  role: 'activity',
  activityType: 'ayni.approval',
  content,
  at: at(1),
})
const asked: TranscriptMessage = { id: 'u1', role: 'user', content: 'Add a note to Acme', at: at(2) }
const sse = (...events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
const decided = (status: string) => () =>
  sse(
    { type: 'RUN_STARTED', threadId: 's1', runId: 'r', noTurn: 'decision' },
    { type: 'RUN_FINISHED', threadId: 's1', runId: 'r', outcome: { type: 'decision', approvalId: 'apr_1', status } }
  )

async function conversation(
  messages: TranscriptMessage[],
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][] = [],
  options: { running?: boolean; spaces?: typeof SPACES } = {}
) {
  const agent = fakeAgent(routes)
  const hub = await tab({
    sessions: [record({ sessionId: 's1', title: 'Acme' })],
    transcripts: [
      {
        ...transcript('s1', messages),
        run: options.running ? { runId: 'turn_1', steps: [], log: [] } : null,
      },
    ],
    spaces: options.spaces ?? SPACES,
    features: { tools: true, queue: true },
    profileVersion: '3.4',
    snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true } },
  })
  const el = await render(hub, <Conversation />)
  const card = () => el.querySelector<HTMLElement>('.tool-card')
  return { hub, el, agent, card }
}

/** What a run of the card's conversation carried, as the agent received it. */
const decisionOf = (call: Call) => (call.body as { forwardedProps?: { ayni?: unknown } }).forwardedProps?.ayni

async function update(hub: Hub, value: Record<string, unknown>) {
  // @ts-expect-error private: the event as the session's stream delivers it
  await hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.approval.update', value }, undefined, false)
}

describe('the confirmation card (UI-CONV-045)', () => {
  it('shows the source, the action, the account and every field whole, the pinned one first with a lock', async () => {
    const { card } = await conversation([asked, cardMessage(confirmation())])
    const c = card() as HTMLElement
    expect(c.getAttribute('aria-label')).toBe('Confirmation: Add a note, Relaticle CRM')
    expect(c.closest('.row, .transcript')?.className).toContain('transcript')
    expect(c.querySelector('.tool-source')?.textContent).toBe('Relaticle CRM')
    expect(c.querySelector('.tool-title')?.textContent).toBe('Add a note')
    expect(c.querySelector('.tool-account')?.textContent).toBe('With the account of Sales EU')
    const fields = [...c.querySelectorAll('.tool-field')]
    expect(fields.map((f) => f.querySelector('dt')?.textContent)).toEqual([
      'Set by Fleet support: Workspace',
      'Company',
      'Note',
      'Extra',
    ])
    expect(fields[0]?.querySelector('.tool-lock svg')).toBeTruthy()
    expect(fields[1]?.querySelector('.tool-lock')).toBeNull()
    // whole, with its line breaks, nothing folded behind a control
    expect(fields[2]?.querySelector('dd')?.textContent).toBe(NOTE)
    expect(c.textContent).not.toMatch(/more|…/i)
    // indented JSON in a monospaced face, the rest not
    expect(fields[3]?.querySelector('dd')?.className).toBe('mono-value')
    expect(fields[2]?.querySelector('dd')?.className).toBe('')
    expect([...c.querySelectorAll('.actions button')].map((b) => b.textContent)).toEqual([
      'Allow',
      'Allow for this conversation',
      'Refuse',
    ])
    expect(c.querySelector('.untrusted-notice')).toBeNull()
  })

  it("names the agent's account, and no account for `none`", async () => {
    const agentAccount = await conversation([cardMessage(confirmation({}, { account: { kind: 'agent' } }))])
    expect(agentAccount.card()?.querySelector('.tool-account')?.textContent).toBe("With Fleet support's account")
    teardown()
    const none = await conversation([cardMessage(confirmation({}, { account: { kind: 'none' } }))])
    expect(none.card()?.querySelector('.tool-account')).toBeNull()
  })

  it('warns in amber before the fields after content from outside, with no Allow for this conversation', async () => {
    const { card } = await conversation([
      cardMessage(
        confirmation({ untrusted: { sources: ['Web search', 'GitHub issues'] }, allowForConversation: false })
      ),
    ])
    const c = card() as HTMLElement
    const notice = c.querySelector('.untrusted-notice')
    expect(notice?.textContent).toBe(
      'This reply read content from outside your organization: Web search, GitHub issues. Check the action before you allow it.'
    )
    // before the fields
    expect(notice?.compareDocumentPosition(c.querySelector('.tool-fields') as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect([...c.querySelectorAll('.actions button')].map((b) => b.textContent)).toEqual(['Allow', 'Refuse'])
  })

  it('Allow sends `approve`, the buttons wait for the answer, and the card turns to Allowed', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => {
      release = r
    })
    const { card, agent } = await conversation(
      [asked, cardMessage(confirmation())],
      [
        [
          'POST /s1/runs',
          async () => {
            await gate
            return decided('APPROVED')()
          },
        ],
      ],
      { running: true }
    )
    await click(byText(card() as HTMLElement, 'button', 'Allow'))
    await until(() => agent.find('POST', '/s1/runs').length === 1)
    expect(decisionOf(agent.find('POST', '/s1/runs')[0])).toEqual({
      kind: 'approval.decide',
      approvalId: 'apr_1',
      decision: 'approve',
    })
    // the three disabled while the answer is on its way
    expect(
      [...(card() as HTMLElement).querySelectorAll<HTMLButtonElement>('.actions button')].every((b) => b.disabled)
    ).toBe(true)
    release()
    await until(() => card()?.querySelector('.tool-outcome')?.textContent === 'Allowed')
  })

  it('Allow for this conversation sends its scope; Refuse sends `reject`', async () => {
    const { card, agent } = await conversation([cardMessage(confirmation())], [['POST /s1/runs', decided('APPROVED')]])
    await click(byText(card() as HTMLElement, 'button', 'Allow for this conversation'))
    await until(() => agent.find('POST', '/s1/runs').length === 1)
    expect(decisionOf(agent.find('POST', '/s1/runs')[0])).toEqual({
      kind: 'approval.decide',
      approvalId: 'apr_1',
      decision: 'approve',
      scope: 'conversation',
    })
    teardown()
    const refuse = await conversation([cardMessage(confirmation())], [['POST /s1/runs', decided('REJECTED')]])
    await click(byText(refuse.card() as HTMLElement, 'button', 'Refuse'))
    await until(() => refuse.card()?.querySelector('.tool-outcome')?.textContent === 'Refused')
    expect(decisionOf(refuse.agent.find('POST', '/s1/runs')[0])).toMatchObject({ decision: 'reject' })
    expect(decisionOf(refuse.agent.find('POST', '/s1/runs')[0])).not.toHaveProperty('scope')
  })

  it('says the answer was not sent when it fails, and gives the buttons back', async () => {
    const { card } = await conversation(
      [cardMessage(confirmation())],
      [['POST /s1/runs', () => json({ error: 'turn-in-progress' }, 409)]]
    )
    await click(byText(card() as HTMLElement, 'button', 'Allow'))
    await until(() => card()?.querySelector('.tool-error'))
    expect(card()?.querySelector('.tool-error')?.textContent).toBe('Your answer was not sent. Try again.')
    expect(
      [...(card() as HTMLElement).querySelectorAll<HTMLButtonElement>('.actions button')].some((b) => b.disabled)
    ).toBe(false)
  })

  it('a decision taken on another device reaches the card where it is', async () => {
    const { card, hub } = await conversation([asked, cardMessage(confirmation())])
    await update(hub, { approvalId: 'apr_1', status: 'APPROVED', scope: 'once' })
    await until(() => card()?.querySelector('.tool-outcome')?.textContent === 'Allowed')
    expect(card()?.querySelector('.actions')).toBeNull()
  })

  it('shows each outcome in words', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ status: 'APPROVED' }, 'Allowed'],
      [{ status: 'APPROVED', scope: 'conversation' }, 'Allowed for this conversationStop allowing'],
      [{ status: 'APPROVED', scope: 'conversation', allowanceEnded: true }, 'Allowed for this conversation · Stopped'],
      [{ status: 'REJECTED' }, 'Refused'],
      [{ status: 'EXPIRED' }, 'Not answered in time'],
      [{ status: 'CANCELLED' }, 'Not run'],
    ]
    for (const [over, words] of cases) {
      const { card } = await conversation([cardMessage(confirmation(over))])
      expect(card()?.querySelector('.tool-outcome')?.textContent, JSON.stringify(over)).toBe(words)
      expect(card()?.querySelector('.actions')).toBeNull()
      teardown()
    }
  })

  it('a card whose message was deleted shows its title and outcome, and says the details went', async () => {
    const { card } = await conversation([
      cardMessage(confirmation({ status: 'CANCELLED' }, { fields: [], erased: true })),
    ])
    const c = card() as HTMLElement
    expect(c.querySelector('.tool-title')?.textContent).toBe('Add a note')
    expect(c.querySelector('.tool-outcome')?.textContent).toBe('Not run')
    expect(c.querySelector('.tool-erased')?.textContent).toBe('The details were deleted with your message.')
    expect(c.querySelector('.tool-fields')).toBeNull()
  })

  it('shows no working indicator under a card that waits, and keeps Stop, which cancels the reply', async () => {
    const { el, agent } = await conversation(
      [asked, cardMessage(confirmation())],
      [[/^POST \/s1\/runs\/turn_1\/cancel$/, () => new Response(null, { status: 202 })]],
      { running: true }
    )
    expect(el.querySelector('.progress')).toBeNull()
    const stop = el.querySelector<HTMLButtonElement>('[aria-label="Stop"]')
    expect(stop).toBeTruthy()
    await click(stop)
    await until(() => agent.find('POST', '/s1/runs/turn_1/cancel').length === 1)
  })

  it('shows the working indicator again once the card is decided', async () => {
    const { el } = await conversation([asked, cardMessage(confirmation({ status: 'APPROVED' }))], [], { running: true })
    expect(el.querySelector('.progress.thinking')).toBeTruthy()
  })
})

describe('the allowance and Stop allowing (UI-CONV-046)', () => {
  it('ends the allowance through the profile, and the card says it stopped', async () => {
    const { card, agent } = await conversation(
      [cardMessage(confirmation({ status: 'APPROVED', scope: 'conversation' }))],
      [['DELETE /conversations/conv_s1/allowances/apr_1', () => new Response(null, { status: 204 })]]
    )
    await click(byText(card() as HTMLElement, 'button', 'Stop allowing'))
    await until(() => card()?.querySelector('.tool-outcome')?.textContent === 'Allowed for this conversation · Stopped')
    expect(agent.find('DELETE', '/conversations/conv_s1/allowances/apr_1')).toHaveLength(1)
  })

  it('follows an allowance stopped on another device', async () => {
    const { card, hub } = await conversation([cardMessage(confirmation({ status: 'APPROVED', scope: 'conversation' }))])
    await update(hub, { approvalId: 'apr_1', status: 'APPROVED', allowanceEnded: true })
    await until(() => card()?.querySelector('.tool-outcome')?.textContent === 'Allowed for this conversation · Stopped')
  })

  it('says when the allowance could not be stopped', async () => {
    const { card } = await conversation(
      [cardMessage(confirmation({ status: 'APPROVED', scope: 'conversation' }))],
      [['DELETE /conversations/conv_s1/allowances/apr_1', () => json({ error: 'boom' }, 500)]]
    )
    await click(byText(card() as HTMLElement, 'button', 'Stop allowing'))
    await until(() => card()?.querySelector('.tool-error'))
    expect(card()?.querySelector('.tool-error')?.textContent).toBe('The allowance was not stopped. Try again.')
    expect(card()?.querySelector('.tool-outcome')?.textContent).toBe('Allowed for this conversationStop allowing')
  })
})

describe('the approval of a tool call (UI-APPR-006)', () => {
  const COMMS = space({ id: 'spc_comms', title: 'Communication', owner: { name: 'Jonas Weber' } })
  const approval = (over: Record<string, unknown>) => ({
    approvalId: 'apr_2',
    kind: 'sensitivity',
    tool: 'post',
    status: 'PENDING',
    expiresAt: at(-60),
    requester: { displayName: 'Ana Ríos' },
    policy: { type: 'count', value: 1 },
    action: {
      title: 'Post on LinkedIn',
      source: { id: 'linkedin', title: 'LinkedIn' },
      account: { kind: 'space', space: { id: 'spc_comms', title: 'Communication' } },
      fields: [{ label: 'Text', value: 'We are hiring.\nThree roles in Rotterdam.' }],
      erased: false,
    },
    space: { id: 'spc_comms', title: 'Communication' },
    ...over,
  })

  it('shows the approver the exact action under who asks, and where, with Approve and Reject', async () => {
    const { card, agent } = await conversation(
      [cardMessage(approval({ canDecide: true }))],
      [
        [
          'POST /s1/runs',
          () =>
            sse(
              { type: 'RUN_STARTED', threadId: 's1', runId: 'r' },
              { type: 'RUN_FINISHED', threadId: 's1', runId: 'r' }
            ),
        ],
      ]
    )
    const c = card() as HTMLElement
    expect(c.querySelector('.tool-approval-head')?.textContent).toBe(
      'Ana Ríos asks to Post on LinkedIn in Communication'
    )
    expect(c.querySelector('.tool-field dd')?.textContent).toBe('We are hiring.\nThree roles in Rotterdam.')
    expect(c.querySelector('.tool-account')?.textContent).toBe('With the account of Communication')
    expect(c.querySelector('input[aria-label="Note (optional)"]')).toBeTruthy()
    await click(byText(c, 'button', 'Approve'))
    await until(() => agent.find('POST', '/s1/runs').length === 1)
    expect(decisionOf(agent.find('POST', '/s1/runs')[0])).toEqual({
      kind: 'approval.decide',
      approvalId: 'apr_2',
      decision: 'approve',
    })
  })

  it("shows the requester whose approval it waits for, with Cancel, and follows the owner's decision", async () => {
    const { card, hub } = await conversation([cardMessage(approval({ own: true }))], [], {
      spaces: { spaces: [PERSONAL, COMMS], templates: [] },
    })
    const c = card() as HTMLElement
    expect(c.querySelector('.tool-approval-head')?.textContent).toBe("Waiting for Jonas Weber's approval")
    expect(c.textContent).toContain('In Communication')
    expect(c.querySelector('.tool-field dd')?.textContent).toBe('We are hiring.\nThree roles in Rotterdam.')
    expect(byText(c, 'button', 'Cancel')).toBeTruthy()
    expect(byText(c, 'button', 'Approve')).toBeUndefined()
    await update(hub, { approvalId: 'apr_2', status: 'APPROVED', decidedBy: 'Jonas Weber' })
    await until(() => byText(card() as HTMLElement, '.row span', 'Approved'))
    expect(byText(card() as HTMLElement, 'button', 'Cancel')).toBeUndefined()
  })

  it('an approval with no action is the card it always was', async () => {
    const { el } = await conversation([cardMessage(approval({ action: undefined, space: undefined, canDecide: true }))])
    expect(el.querySelector('.tool-card')).toBeNull()
    expect(el.querySelector('section.card h3')?.textContent).toBe('Approval needed')
  })
})

describe('the sessions this browser creates (UI-SESS-018, PROF-SESS-016)', () => {
  it('carry `client.profileVersion: "3.4"`', async () => {
    const agent = fakeAgent([
      [
        'POST ',
        () =>
          json(
            {
              sessionId: 's2',
              sessionToken: 't_s2',
              state: 'bound',
              conversationId: 'conv_s2',
              principal: { displayName: 'Ana Ríos' },
            },
            201
          ),
      ],
    ])
    const hub = await tab({ sessions: [record({ sessionId: 's1' })], features: { tools: true }, profileVersion: '3.4' })
    await hub.newConversation(AGENT).catch(() => undefined)
    const created = agent.find('POST', '')
    expect(created).toHaveLength(1)
    expect((created[0].body as { client: Record<string, unknown> }).client).toMatchObject({
      name: 'ayni-ui',
      platform: 'web',
      profileVersion: '3.4',
    })
  })
})
