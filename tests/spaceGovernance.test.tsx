/**
 * A space's governance in the browser (profile 3.5.4; agent D135 to D142, ayni-agent #122), in the tab of Jonas Weber,
 * owner of the space Communication, and of the people around it: the approval timeouts, the successor and the activity
 * in Settings and Activity (UI-CONV-041); a space with no owner; the approval policy of a tool in the owner's panel, its
 * warnings, its attention and its refusals (UI-CONV-067, UI-CONV-049); its words in About; the progress on the
 * requester's card and in the Notifications, the requester's own confirmation and a refusal for want of an approver
 * (UI-APPR-010); the notices of a space's governance (UI-APPR-011); Spaces you steward (UI-CONV-068). The agent's
 * answers are mocked as the merged agent gives them; nothing real is contacted.
 */
import { GOVERNANCE_COPY, type SpaceInfo, type SpaceSegment, type TranscriptMessage } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Column } from '../src/components/Column.js'
import { Conversation } from '../src/components/Conversation.js'
import { NotificationsPage } from '../src/components/Notifications.js'
import { SpacePage } from '../src/components/SpacePage.js'
import { StewardshipPage } from '../src/components/Stewardship.js'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'
import type { Snapshot } from '../src/state/hub.js'
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
  tab,
  teardown,
  transcript,
  type,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

type Route = [string | RegExp, (call: Call) => Response | Promise<Response>]
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const FEATURES = { tools: true, notifications: true }
const ALL_KINDS = ['owner', 'person', 'member', 'role', 'department']

const COMMS: SpaceInfo = space({
  id: 'spc_comms',
  title: 'Communication',
  purpose: 'Posts, newsletters and the press.',
  role: 'owner',
  owner: { name: 'Jonas Weber' },
  successor: { name: 'Ana Ríos' },
  rules: {
    retentionDays: 365,
    lawfulBasis: 'contract',
    allowedProviders: ['kimi'],
    handover: true,
    approvalTimeouts: { 'tool-call': 60 },
  },
})
const MEMBERS = [
  { memberId: 'mem_jonas', name: 'Jonas Weber', organization: null, state: 'active', role: 'owner' },
  { memberId: 'mem_ana', name: 'Ana Ríos', organization: null, state: 'active', role: 'member' },
  { memberId: 'mem_marta', name: 'Marta Kova', organization: null, state: 'active', role: 'member' },
  { memberId: 'mem_lee', name: 'Lee Park', organization: 'Acme', state: 'active', role: 'guest' },
]
const TEMPLATE = {
  id: 'project',
  title: 'Project',
  kind: 'team' as const,
  membership: 'list' as const,
  bounds: { approvalTimeouts: { 'tool-call': { default: 60, min: 5, max: 10080 } } },
}

/** The policy of Post on X as its owner reads it: the agent-pack's default, the owner alone. */
const DEFAULT_POLICY = {
  approvers: [{ kind: 'owner', name: 'Jonas Weber', required: true }],
  threshold: 1,
  refusal: 'any',
  attested: true,
  whenApproverAsks: 'own-confirmation',
  state: 'ok',
  attention: [],
  warnings: [],
  bounds: { minApprovals: 1, kinds: ALL_KINDS, roles: ['manager'], attested: 'optional' },
}
/** Jonas, required, and Marta, two needed, another approver deciding (the spec's example). */
const TWO_POLICY = {
  ...DEFAULT_POLICY,
  approvers: [
    { kind: 'owner', name: 'Jonas Weber', required: true },
    { kind: 'person', memberId: 'mem_marta', name: 'Marta Kova', required: false },
  ],
  threshold: 2,
  whenApproverAsks: 'another-approver',
}
const BLOCKED = [{ code: 'own-requests-blocked', approvers: [{ name: 'Jonas Weber' }, { name: 'Marta Kova' }] }]

const postTool = (approval: Record<string, unknown> | undefined, over: Record<string, unknown> = {}) => ({
  source: 'x',
  title: 'Post on X',
  description: "The space's account on X",
  state: 'ready',
  add: 'owner',
  guests: false,
  account: { kind: 'space', fields: [], set: true, setAt: '2026-11-20T10:00:00Z', setBy: { name: 'Jonas Weber' } },
  bindings: [],
  tools: [
    {
      name: 'post',
      title: 'Post on X',
      effect: 'external',
      rule: 'approval',
      packRule: 'approval',
      stepUp: null,
      ...(approval ? { approval } : {}),
    },
  ],
  pending: null,
  ...over,
})

/** The owner's page of Communication on a segment; `spaceFor` as the shell sets it. */
async function owners(
  routes: Route[],
  options: {
    segment?: SpaceSegment
    source?: string
    space?: SpaceInfo
    templates?: (typeof TEMPLATE)[]
    me?: string
  } = {}
) {
  const theSpace = options.space ?? COMMS
  const agent = fakeAgent([
    ...routes,
    ['GET /spaces/spc_comms', () => json({ ...theSpace, members: MEMBERS })],
    ['GET /spaces', () => json({ spaces: [PERSONAL, theSpace], templates: options.templates ?? [TEMPLATE] })],
  ])
  const hub = await tab({
    sessions: [record({ sessionId: 's1', principal: { displayName: options.me ?? 'Jonas Weber' } as never })],
    spaces: { spaces: [PERSONAL, theSpace], templates: options.templates ?? [TEMPLATE] },
    features: FEATURES,
    profileVersion: '3.5',
    snapshot: {
      view: 'space',
      spaceFor: {
        agentDid: AGENT,
        spaceId: theSpace.id,
        segment: options.segment ?? 'settings',
        ...(options.source ? { source: options.source } : {}),
      },
    },
  })
  const el = await render(hub, <SpacePage />)
  return { agent, hub, el }
}

const fieldByLabel = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLLabelElement>('label')]
    .find((l) => l.textContent?.startsWith(label))
    ?.querySelector<HTMLInputElement>('input, select')

describe('Settings: the approval timeouts and the successor (UI-CONV-041, agent D136, D138)', () => {
  it('sets how long an approval of a tool waits, within the template, and says the bounds', async () => {
    const { el, agent } = await owners([['PATCH /spaces/spc_comms', (c) => json({ ...COMMS, ...(c.body as object) })]])
    const field = fieldByLabel(el, 'How long an approval of a tool waits')
    expect(field?.value).toBe('60')
    expect(el.textContent).toContain('The template allows 5 to 10080 minutes.')
    // a value outside the bounds is not sent: the field holds the template's bounds
    await type(field, '20000')
    expect(field?.checkValidity()).toBe(false)
    await click(byText(el, 'button', 'Save changes'))
    expect(agent.find('PATCH', '/spaces/spc_comms')).toHaveLength(0)
    // a day
    await type(field, '1440')
    await click(byText(el, 'button', 'Save changes'))
    await until(() => agent.find('PATCH', '/spaces/spc_comms').length === 1)
    expect(agent.find('PATCH', '/spaces/spc_comms')[0]?.body).toEqual({
      rules: { approvalTimeouts: { 'tool-call': 1440 } },
    })
  })

  it("says the agent's refusal at the timeout it names, when no template bounds are known", async () => {
    const { el } = await owners(
      [
        [
          'PATCH /spaces/spc_comms',
          () => json({ error: 'out-of-bounds', field: 'rules.approvalTimeouts.tool-call' }, 422),
        ],
      ],
      { templates: [] }
    )
    expect(el.textContent).not.toContain('The template allows')
    await type(fieldByLabel(el, 'How long an approval of a tool waits'), '20000')
    await click(byText(el, 'button', 'Save changes'))
    await until(() =>
      el.textContent?.includes('The template does not allow this value: How long an approval of a tool waits.')
    )
  })

  it('names the successor among the people the space could be handed to, and clears it', async () => {
    const { el, agent } = await owners([
      ['PUT /spaces/spc_comms/successor', () => json({ ...COMMS, successor: { name: 'Marta Kova' } })],
      ['DELETE /spaces/spc_comms/successor', () => json({ ...COMMS, successor: null })],
    ])
    const box = el.querySelector<HTMLElement>('.successor')
    expect(box?.querySelector('.successor-name')?.textContent).toBe('Ana Ríos')
    const select = box?.querySelector<HTMLSelectElement>('select')
    await until(() => (select?.options.length ?? 0) > 1)
    // neither the owner nor a guest
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual([
      'Choose a member',
      'Ana Ríos',
      'Marta Kova',
    ])
    await type(select, 'mem_marta')
    await click(byText(box as HTMLElement, 'button', 'Name successor'))
    await until(() => agent.find('PUT', '/spaces/spc_comms/successor').length === 1)
    expect(agent.find('PUT', '/spaces/spc_comms/successor')[0]?.body).toEqual({ memberId: 'mem_marta' })
    await click(byText(box as HTMLElement, 'button', 'Clear'))
    await until(() => agent.find('DELETE', '/spaces/spc_comms/successor').length === 1)
  })

  it("reads the successor, how the owner changed and a steward's reason in Activity", async () => {
    const { el } = await owners(
      [
        [
          /^GET \/spaces\/spc_comms\/activity/,
          () =>
            json({
              activity: [
                {
                  at: at(1),
                  kind: 'successor-set',
                  by: { name: 'Jonas Weber' },
                  member: { name: 'Ana Ríos' },
                },
                { at: at(2), kind: 'successor-cleared', member: { name: 'Ana Ríos' } },
                {
                  at: at(3),
                  kind: 'owner-changed',
                  how: 'steward',
                  reason: 'Marta left the company',
                  by: { name: 'Ben Ode' },
                  member: { name: 'Jonas Weber' },
                },
                { at: at(4), kind: 'owner-changed', how: 'succession', member: { name: 'Marta Kova' } },
                {
                  at: at(5),
                  kind: 'owner-changed',
                  how: 'handover',
                  by: { name: 'Ana Ríos' },
                  member: { name: 'Marta Kova' },
                },
              ],
              nextBefore: null,
            }),
        ],
      ],
      { segment: 'activity' }
    )
    await until(() => el.querySelectorAll('.activity-list li').length === 5)
    expect([...el.querySelectorAll('.activity-list li span:last-child')].map((x) => x.textContent)).toEqual([
      'Jonas Weber named Ana Ríos successor',
      'Ana Ríos is no longer the successor',
      'Ben Ode, a steward, named Jonas Weber owner: Marta left the company',
      'Marta Kova became the owner as successor',
      'Ana Ríos handed the space to Marta Kova',
    ])
  })

  it('says "No owner" in the header of a space whose owner left with no successor', async () => {
    const ownerless = { ...COMMS, role: 'member' as const, owner: null, successor: undefined }
    const { el } = await owners([], { space: ownerless, segment: 'about' })
    expect(el.querySelector('.conv-sub')?.textContent).toBe('Team space · No owner')
    expect(el.querySelector('.purpose-by')).toBeNull()
  })
})

describe("a tool's approval policy in the owner's panel (UI-CONV-067, UI-CONV-049)", () => {
  const policyOf = (el: HTMLElement) => el.querySelector<HTMLElement>('.policy')
  const entries = (el: HTMLElement) =>
    [...el.querySelectorAll('.policy-entry .policy-entry-name')].map((x) => x.textContent)

  it("shows who approves, the number needed, the refusal, the attestation and the requester's case", async () => {
    const { el } = await owners([['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(DEFAULT_POLICY)] })]], {
      segment: 'tools',
      source: 'x',
    })
    await until(() => !!policyOf(el))
    // the rule's words in the owner's segment (UI-CONV-049)
    expect(el.querySelector<HTMLSelectElement>('.tool-rule-row select')?.selectedOptions[0]?.textContent).toBe(
      'Needs approval'
    )
    expect(entries(el)).toEqual(['Jonas Weber (you)'])
    expect(el.querySelector<HTMLInputElement>('.policy-required input')?.checked).toBe(true)
    expect(el.querySelector<HTMLInputElement>('.policy-threshold')?.value).toBe('1')
    const radios = [...el.querySelectorAll<HTMLInputElement>('.policy input[type="radio"]')]
    expect(radios.filter((r) => r.checked).map((r) => r.parentElement?.textContent)).toEqual([
      'One refusal rejects',
      // one entry that names one person: their own confirmation counts
      'Their own confirmation counts',
    ])
    const attested = fieldByLabel(policyOf(el) as HTMLElement, 'Confirm with fingerprint or face')
    expect(attested?.checked).toBe(true)
    expect(attested?.disabled).toBe(false)
  })

  it('adds an approver, sends the policy with the settings, waits for the phone, and shows its warning', async () => {
    const { el, agent } = await owners(
      [
        ['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(DEFAULT_POLICY)] })],
        [
          'PATCH /spaces/spc_comms/tools/x',
          () =>
            json(
              {
                tool: postTool(
                  { ...DEFAULT_POLICY, warnings: BLOCKED },
                  {
                    pending: {
                      changeId: 'chg_1',
                      summary: 'Change who approves Post on X in Communication',
                      code: '48 21',
                      expiresAt: new Date(Date.now() + 300_000).toISOString(),
                    },
                  }
                ),
              },
              202
            ),
        ],
      ],
      { segment: 'tools', source: 'x' }
    )
    await until(() => !!policyOf(el))
    await click(el.querySelector('.policy-add-open'))
    const add = el.querySelector<HTMLElement>('.policy-add')
    // the owner is named already: the first kind offered is a member of the space
    expect(add?.querySelector('select')?.value).toBe('person')
    const member = fieldByLabel(add as HTMLElement, 'Member') as unknown as HTMLSelectElement
    await until(() => member.options.length > 1)
    // Jonas is named already, and a guest cannot approve
    expect([...member.options].map((o) => o.textContent)).toEqual(['Choose a member', 'Ana Ríos', 'Marta Kova'])
    await type(member, 'mem_marta')
    await click(add?.querySelector('.policy-add-confirm'))
    expect(entries(el)).toEqual(['Jonas Weber (you)', 'Marta Kova'])
    await type(el.querySelector('.policy-threshold'), '2')
    // two approvers: another approver decides, until the owner chooses
    const checked = [...el.querySelectorAll<HTMLInputElement>('.policy input[type="radio"]:checked')]
    expect(checked.map((r) => r.parentElement?.textContent)).toContain('Another approver decides')
    await click(el.querySelector('.settings-save'))
    await until(() => agent.find('PATCH', '/spaces/spc_comms/tools/x').length === 1)
    expect(agent.find('PATCH', '/spaces/spc_comms/tools/x')[0]?.body).toEqual({
      approvals: {
        post: {
          approvers: [
            { kind: 'owner', required: true },
            { kind: 'person', memberId: 'mem_marta', required: false },
          ],
          threshold: 2,
          refusal: 'any',
          attested: true,
          whenApproverAsks: 'another-approver',
        },
      },
    })
    await until(() => el.textContent?.includes('Confirm on your phone · Code 48 21'))
    // the form keeps what waits for the phone, and the warning of the policy sent shows under it with its controls
    expect(entries(el)).toEqual(['Jonas Weber (you)', 'Marta Kova'])
    const warning = el.querySelector<HTMLElement>('.policy-warning')
    expect(warning?.textContent).toContain("Jonas Weber's and Marta Kova's own requests can never be approved.")
    expect([...(warning?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
      'Add approver',
      'Lower the number needed',
      'Use their own confirmation',
    ])
  })

  it('changes the form, not the policy, from the controls of a warning', async () => {
    const { el, agent } = await owners(
      [['GET /spaces/spc_comms/tools', () => json({ tools: [postTool({ ...TWO_POLICY, warnings: BLOCKED })] })]],
      { segment: 'tools', source: 'x' }
    )
    await until(() => !!el.querySelector('.policy-warning'))
    const control = (words: string) => byText(el.querySelector('.policy-warning') as HTMLElement, 'button', words)
    await click(control('Lower the number needed'))
    expect(el.querySelector<HTMLInputElement>('.policy-threshold')?.value).toBe('1')
    // no lower than the required entries
    expect(control('Lower the number needed')?.hasAttribute('disabled')).toBe(true)
    await click(control('Use their own confirmation'))
    const checked = [...el.querySelectorAll<HTMLInputElement>('.policy input[type="radio"]:checked')]
    expect(checked.map((r) => r.parentElement?.textContent)).toContain('Their own confirmation counts')
    await click(control('Add approver'))
    expect(el.querySelector('.policy-add')).toBeTruthy()
    expect(agent.find('PATCH', '/spaces/spc_comms/tools/x')).toHaveLength(0)
  })

  it('keeps the attestation on when the agent-pack requires it, and offers only the kinds it allows', async () => {
    const strict = {
      ...DEFAULT_POLICY,
      bounds: { minApprovals: 1, kinds: ['owner', 'role'], roles: ['manager'], attested: 'required' },
    }
    const { el } = await owners([['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(strict)] })]], {
      segment: 'tools',
      source: 'x',
    })
    await until(() => !!policyOf(el))
    const attested = fieldByLabel(policyOf(el) as HTMLElement, 'Confirm with fingerprint or face')
    expect(attested?.checked).toBe(true)
    expect(attested?.disabled).toBe(true)
    await click(el.querySelector('.policy-add-open'))
    expect(
      [...(el.querySelector('.policy-add select')?.querySelectorAll('option') ?? [])].map((o) => o.textContent)
    ).toEqual(['A role'])
  })

  it('shows a refusal at the number needed, or at the entry the agent names', async () => {
    let answer = json({ error: 'threshold-below-required', field: 'approvals.post.threshold' }, 422)
    const { el } = await owners(
      [
        ['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(TWO_POLICY)] })],
        ['PATCH /spaces/spc_comms/tools/x', () => answer],
      ],
      { segment: 'tools', source: 'x' }
    )
    await until(() => !!policyOf(el))
    // both required, one approval needed: the agent refuses
    for (const box of el.querySelectorAll<HTMLInputElement>('.policy-required input'))
      if (!box.checked) await click(box)
    await type(el.querySelector('.policy-threshold'), '1')
    await click(el.querySelector('.settings-save'))
    await until(() => !!el.querySelector('.policy-section .field-error'))
    expect(el.querySelector('.policy-section .field-error')?.textContent?.trim()).toBe(
      'The number needed counts every required approver.'
    )
    answer = json({ error: 'not-eligible', field: 'approvals.post.approvers.1' }, 422)
    await type(el.querySelector('.policy-threshold'), '2')
    await click(el.querySelector('.settings-save'))
    await until(() => !!el.querySelectorAll('.policy-entry')[1]?.querySelector('.field-error'))
    expect(el.querySelectorAll('.policy-entry')[1]?.querySelector('.field-error')?.textContent?.trim()).toBe(
      "This person can't approve in this space."
    )
  })

  it("says a policy needs attention on the source's row, on the tool's line and at the entry that names nobody", async () => {
    const needing = {
      ...TWO_POLICY,
      approvers: TWO_POLICY.approvers.map((a) => ({ ...a, required: true })),
      state: 'needs-attention',
      attention: [1],
    }
    const { el } = await owners([['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(needing)] })]], {
      segment: 'tools',
    })
    const words = 'Needs attention: Marta Kova can no longer approve'
    await until(() => !!el.querySelector('.tool-row'))
    expect(el.querySelector('.tool-row')?.textContent).toContain(words)
    await click(el.querySelector('.tool-row-main'))
    await until(() => !!policyOf(el))
    expect(el.querySelector('.tool-rule-name .policy-attention')?.textContent?.trim()).toBe(words)
    const at = [...el.querySelectorAll('.policy-entry')].map((x) =>
      x.querySelector('.policy-attention')?.textContent?.trim()
    )
    expect(at).toEqual([undefined, words])
  })
})

describe('the policy in About (UI-CONV-049)', () => {
  it('reads the number and the entries to a member, and "your" to the one person it names', async () => {
    const memberView = {
      approvers: TWO_POLICY.approvers.map(({ kind, name, required }) => ({ kind, name, required })),
      threshold: 2,
    }
    const ana = { ...COMMS, role: 'member' as const, successor: undefined }
    const { el } = await owners([['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(memberView)] })]], {
      space: ana,
      segment: 'about',
      me: 'Ana Ríos',
    })
    await until(() => !!el.querySelector('.about-tool-rules'))
    expect(el.querySelector('.about-tool-rules')?.textContent).toBe(
      'Needs 2 approvals: Jonas Weber (required), Marta Kova: Post on X'
    )
    teardown()
    const marta = { approvers: [{ kind: 'person', name: 'Marta Kova', required: true }], threshold: 1 }
    const second = await owners([['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(marta)] })]], {
      space: ana,
      segment: 'about',
      me: 'Marta Kova',
    })
    await until(() => !!second.el.querySelector('.about-tool-rules'))
    expect(second.el.querySelector('.about-tool-rules')?.textContent).toBe('Needs your approval: Post on X')
  })
})

/** Ana's post as an approval of 3.5.4: its policy as a member reads it, and where it stands. */
function postApproval(over: Record<string, unknown> = {}) {
  return {
    approvalId: 'apr_1',
    kind: 'sensitivity',
    status: 'PENDING',
    expiresAt: at(-30),
    requester: { displayName: 'Ana Ríos', role: 'member' },
    own: false,
    canDecide: true,
    attested: true,
    myDecision: null,
    tool: 'post',
    action: {
      title: 'Post on X',
      source: { id: 'x', title: 'X' },
      account: { kind: 'space', space: { id: 'spc_comms', title: 'Communication' } },
      fields: [{ label: 'Text', value: 'We are hiring.' }],
      erased: false,
    },
    space: { id: 'spc_comms', title: 'Communication' },
    policy: {
      approvers: [
        { kind: 'owner', name: 'Jonas Weber', required: true },
        { kind: 'person', name: 'Marta Kova', required: false },
      ],
      threshold: 2,
    },
    progress: {
      threshold: 2,
      approvals: 1,
      waitingFor: [{ kind: 'owner', name: 'Jonas Weber', required: true }],
    },
    decisions: [{ by: { displayName: 'Marta Kova' }, decision: 'approve', at: at(2) }],
    ...over,
  }
}
const item = (approval: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id: String(approval.approvalId),
  kind: 'approval',
  at: at(3),
  waiting: approval.status === 'PENDING' && approval.canDecide === true,
  approval,
  ...over,
})

describe("the progress on the requester's card (UI-APPR-010, UI-APPR-006)", () => {
  const card = (over: Record<string, unknown> = {}): TranscriptMessage => ({
    id: 'act_1',
    role: 'activity',
    activityType: 'ayni.approval',
    content: {
      ...postApproval({
        own: true,
        canDecide: false,
        attested: undefined,
        decisions: undefined,
        progress: {
          threshold: 2,
          approvals: 0,
          waitingFor: [
            { kind: 'person', name: 'Marta Kova', required: false },
            { kind: 'owner', name: 'Jonas Weber', required: true },
          ],
        },
      }),
      ...over,
    },
    at: at(1),
  })

  async function ana(content: TranscriptMessage) {
    fakeAgent([[/^GET \/notifications\?/, () => json({ notifications: [], nextBefore: null, waiting: 0 })]])
    const hub = await tab({
      sessions: [record({ sessionId: 's1', spaceId: 'spc_comms', principal: { displayName: 'Ana Ríos' } as never })],
      transcripts: [transcript('s1', [{ id: 'u1', role: 'user', content: 'Post it', at: at(2) }, content])],
      spaces: { spaces: [PERSONAL, { ...COMMS, role: 'member' }], templates: [] },
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true } },
    })
    const el = await render(hub, <Conversation />)
    return { hub, el }
  }
  const head = (el: HTMLElement) => el.querySelector('.tool-approval .tool-approval-head')?.textContent

  it('reads where it stands, required first, and moves with each update', async () => {
    const { hub, el } = await ana(card())
    expect(head(el)).toBe('0 of 2 approvals, waiting for Jonas Weber (required), Marta Kova')
    // @ts-expect-error private: the event as the session's stream delivers it
    await hub.onEvent(
      's1',
      {
        type: 'CUSTOM',
        name: 'ayni.approval.update',
        value: {
          approvalId: 'apr_1',
          status: 'PENDING',
          progress: {
            threshold: 2,
            approvals: 1,
            waitingFor: [{ kind: 'owner', name: 'Jonas Weber', required: true }],
          },
        },
      },
      undefined,
      false
    )
    await until(() => head(el) === '1 of 2 approvals, waiting for Jonas Weber (required)')
  })

  it("reads one line under one person's policy, and the refusal for want of another approver", async () => {
    const single = card({
      policy: { approvers: [{ kind: 'owner', name: 'Jonas Weber', required: true }], threshold: 1 },
      progress: { threshold: 1, approvals: 0, waitingFor: [{ kind: 'owner', name: 'Jonas Weber', required: true }] },
    })
    const first = await ana(single)
    expect(head(first.el)).toBe("Waiting for Jonas Weber's approval")
    teardown()
    const refused = await ana(card({ status: 'REJECTED', reason: 'no-approver' }))
    expect(head(refused.el)).toBe('No other approver can decide this')
    expect(byText(refused.el, 'button', 'Cancel')).toBeUndefined()
  })
})

/** The page the hub's view names, as the shell shows it. */
function Screen() {
  const snap = useSnapshot()
  return snap.view === 'space' ? (
    <SpacePage />
  ) : snap.view === 'steward' ? (
    <StewardshipPage />
  ) : snap.view === 'notifications' ? (
    <NotificationsPage />
  ) : (
    <Column />
  )
}

async function notifications(routes: Route[], snapshot: Partial<Snapshot>, me = 'Jonas Weber') {
  const agent = fakeAgent([
    ...routes,
    ['GET /spaces/spc_comms', () => json({ ...COMMS, members: MEMBERS })],
    [/^GET \/notifications\?/, () => json({ notifications: [], nextBefore: null, waiting: 0 })],
  ])
  const hub = await tab({
    sessions: [record({ sessionId: 's1', principal: { displayName: me } as never })],
    spaces: { spaces: [PERSONAL, COMMS], templates: [TEMPLATE] },
    features: FEATURES,
    profileVersion: '3.5',
    snapshot,
  })
  const el = await render(hub, <Screen />)
  return { agent, hub, el }
}
const items = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.notification, .notice')]

describe('the Notifications: progress, own requests and notices (UI-APPR-007, UI-APPR-010, UI-APPR-011)', () => {
  const inSpace = {
    view: 'space' as const,
    spaceFor: { agentDid: AGENT, spaceId: 'spc_comms', segment: 'notifications' as const },
  }

  it("shows an approver the progress and the time left, another their own decision, and the requester's own request", async () => {
    const own = postApproval({
      approvalId: 'apr_9',
      requester: { displayName: 'Jonas Weber' },
      own: true,
      canDecide: true,
      decisions: [],
      progress: { threshold: 1, approvals: 0, waitingFor: [{ kind: 'owner', name: 'Jonas Weber', required: true }] },
    })
    const { el, agent } = await notifications(
      [
        [
          /^GET \/spaces\/spc_comms\/notifications\?/,
          () =>
            json({
              notifications: [
                item(postApproval()),
                item(postApproval({ approvalId: 'apr_2', canDecide: false, myDecision: 'approve' })),
                item(own),
                item(
                  postApproval({
                    approvalId: 'apr_3',
                    status: 'REJECTED',
                    reason: 'no-approver',
                    canDecide: false,
                    own: true,
                  })
                ),
              ],
              nextBefore: null,
              waiting: 2,
            }),
        ],
        ['POST /approvals/apr_9/resend', () => json({ expiresAt: at(-30) })],
      ],
      inSpace
    )
    await until(() => items(el).length === 4)
    const [decide, mine, ownRequest, refused] = items(el)
    const status = (n: HTMLElement | undefined) => n?.querySelector('.notification-status')?.textContent
    expect(status(decide)).toMatch(/^1 of 2 approvals, waiting for Jonas Weber \(required\) · \d+:\d\d left$/)
    expect(status(mine)).toBe('Approved by you · Waiting for other approvers')
    expect(ownRequest?.querySelector('.tool-approval-head')?.textContent).toBe('Your own request')
    expect(byText(ownRequest as HTMLElement, 'button', 'Approve')).toBeUndefined()
    await click(byText(ownRequest as HTMLElement, 'button', 'Decide on your phone'))
    await until(() => agent.find('POST', '/approvals/apr_9/resend').length === 1)
    expect(status(refused)).toBe('No other approver can decide this')
  })

  it("reads the notices of the space's governance, and Open the tool opens the owner's panel of its source", async () => {
    const { el, hub } = await notifications(
      [
        [
          /^GET \/spaces\/spc_comms\/notifications\?/,
          () =>
            json({
              notifications: [
                {
                  id: 'ntc_1',
                  kind: 'owner-changed',
                  at: at(1),
                  waiting: false,
                  notice: {
                    space: { id: 'spc_comms', title: 'Communication' },
                    how: 'handover',
                    from: { name: 'Jonas Weber' },
                    to: { name: 'Marta Kova' },
                  },
                },
                {
                  id: 'ntc_2',
                  kind: 'policy-attention',
                  at: at(2),
                  waiting: true,
                  notice: {
                    space: { id: 'spc_comms', title: 'Communication' },
                    tool: { source: 'x', title: 'Post on X' },
                    entries: [{ kind: 'person', name: 'Marta Kova', required: true }],
                  },
                },
                {
                  id: 'ntc_3',
                  kind: 'no-approver',
                  at: at(3),
                  waiting: false,
                  notice: {
                    space: { id: 'spc_comms', title: 'Communication' },
                    tool: { source: 'x', title: 'Post on X' },
                    requester: { displayName: 'Ana Ríos' },
                  },
                },
                {
                  id: 'ntc_4',
                  kind: 'owner-changed',
                  at: at(4),
                  waiting: false,
                  notice: {
                    space: { id: 'spc_comms', title: 'Communication' },
                    how: 'steward',
                    from: null,
                    to: { name: 'Jonas Weber' },
                    reason: 'Marta left the company',
                  },
                },
                {
                  id: 'ntc_5',
                  kind: 'policy-attention',
                  at: at(5),
                  waiting: false,
                  notice: {
                    space: { id: 'spc_comms', title: 'Communication' },
                    tool: { source: 'x', title: 'Post on X' },
                    entries: [{ kind: 'person', name: 'Ben Ode', required: true }],
                    resolvedAt: at(4),
                  },
                },
              ],
              nextBefore: null,
              waiting: 1,
            }),
        ],
        ['GET /spaces/spc_comms/tools', () => json({ tools: [postTool(DEFAULT_POLICY)] })],
      ],
      inSpace
    )
    await until(() => items(el).length === 5)
    expect(items(el).map((n) => n.getAttribute('aria-label'))).toEqual([
      'Marta Kova now owns Communication · handed over by Jonas Weber',
      'Post on X needs attention: Marta Kova can no longer approve',
      "Ana Ríos's request for Post on X was refused: no other approver could decide it.",
      'Jonas Weber now owns Communication · named by a steward: Marta left the company',
      'Post on X needs attention: Ben Ode can no longer approve',
    ])
    // read-only; a control only on the notice that waits; a resolved one reads as past
    expect(items(el).map((n) => n.querySelector('button')?.textContent ?? null)).toEqual([
      null,
      'Open the tool',
      null,
      null,
      null,
    ])
    expect(items(el)[4]?.classList.contains('past')).toBe(true)
    // the icons are drawn, never typed
    expect(items(el)[1]?.querySelector('svg')).toBeTruthy()
    await click(byText(items(el)[1] as HTMLElement, 'button', 'Open the tool'))
    expect(hub.getSnapshot().spaceFor).toMatchObject({ spaceId: 'spc_comms', segment: 'tools', source: 'x' })
    await until(() => !!el.querySelector('.tool-panel'))
    expect(el.querySelector('.tool-panel-title')?.textContent).toBe('Post on X')
  })

  it("lists a space without an owner in the agent's Notifications, and Name the owner opens Spaces you steward there", async () => {
    const { el, hub } = await notifications(
      [
        [
          /^GET \/notifications\?/,
          () =>
            json({
              notifications: [
                {
                  id: 'ntc_7',
                  kind: 'space-without-owner',
                  at: at(1),
                  waiting: true,
                  notice: {
                    space: { id: 'spc_truck', title: 'Truck 14 recall' },
                    template: { id: 'project', title: 'Project' },
                    formerOwner: { name: 'Jonas Weber' },
                  },
                },
              ],
              nextBefore: null,
              waiting: 1,
            }),
        ],
        ['GET /stewardship', () => json({ spaces: [] })],
      ],
      { view: 'notifications', notificationsFor: { agentDid: AGENT } },
      'Ben Ode'
    )
    await until(() => items(el).length === 1)
    expect(items(el)[0]?.getAttribute('aria-label')).toBe('Truck 14 recall has no owner')
    await click(byText(el, 'button', 'Name the owner'))
    expect(hub.getSnapshot().view).toBe('steward')
    expect(hub.getSnapshot().stewardFor).toEqual({ agentDid: AGENT, spaceId: 'spc_truck' })
  })
})

describe('Spaces you steward (UI-CONV-068)', () => {
  const STEWARDSHIP = {
    spaces: [
      {
        id: 'spc_comms',
        title: 'Communication',
        templateId: 'project',
        kind: 'team',
        owner: { name: 'Jonas Weber' },
        successor: { name: 'Ana Ríos' },
        memberCount: 4,
      },
      {
        id: 'spc_truck',
        title: 'Truck 14 recall',
        templateId: 'project',
        kind: 'team',
        owner: null,
        successor: null,
        memberCount: 5,
      },
    ],
  }

  it('lists the spaces with no owner first, and names an owner with a reason', async () => {
    const { el, agent } = await notifications(
      [
        ['GET /stewardship', () => json(STEWARDSHIP)],
        [
          'GET /spaces/spc_truck/owner/candidates',
          () =>
            json({
              candidates: [
                { memberId: 'mem_ana', name: 'Ana Ríos', department: 'Sales' },
                { memberId: 'mem_piet', name: 'Piet de Vries', department: null },
              ],
            }),
        ],
        ['POST /spaces/spc_truck/owner', () => json({ ...STEWARDSHIP.spaces[1], owner: { name: 'Ana Ríos' } })],
      ],
      { view: 'steward', stewardFor: { agentDid: AGENT } },
      'Ben Ode'
    )
    await until(() => el.querySelectorAll('.steward-row').length === 2)
    expect(el.querySelector('h1')?.textContent).toBe('Spaces you steward')
    const rows = () =>
      [...el.querySelectorAll('.steward-row')].map((r) => [
        r.querySelector('.space-name')?.textContent,
        r.querySelector('.space-sub')?.textContent,
        r.querySelector('.steward-owner')?.textContent,
      ])
    expect(rows()).toEqual([
      ['Truck 14 recall', 'Project', 'No owner'],
      ['Communication', 'Project', 'Jonas WeberSuccessor: Ana Ríos'],
    ])
    await click(el.querySelector('.steward-row .tool-row-main'))
    await until(() => el.querySelectorAll('.steward-candidate').length === 2)
    expect([...el.querySelectorAll('.steward-candidate')].map((c) => c.textContent)).toEqual([
      'Ana RíosSales',
      'Piet de Vries',
    ])
    const submit = () => el.querySelector<HTMLButtonElement>('.steward-submit')
    expect(submit()?.disabled).toBe(true)
    await click(el.querySelector('.steward-candidate input'))
    // Reason is required
    expect(submit()?.disabled).toBe(true)
    await type(fieldByLabel(el, 'Reason') ?? el.querySelector('textarea'), 'Jonas left the company')
    expect(submit()?.disabled).toBe(false)
    await click(submit())
    await until(() => agent.find('POST', '/spaces/spc_truck/owner').length === 1)
    expect(agent.find('POST', '/spaces/spc_truck/owner')[0]?.body).toEqual({
      memberId: 'mem_ana',
      reason: 'Jonas left the company',
    })
    await until(() => rows().some((r) => r[0] === 'Truck 14 recall' && r[2] === 'Ana Ríos'))
    // no space page opens from here
    expect(el.querySelector('.space-page')).toBeNull()
  })

  it('says why a person who stewards nothing is refused', async () => {
    const { el } = await notifications([['GET /stewardship', () => json({ error: 'not-steward' }, 403)]], {
      view: 'steward',
      stewardFor: { agentDid: AGENT },
    })
    await until(() => el.textContent?.includes('Only a steward of this kind of space names its owner.'))
  })

  it("is in the agent's menu for a person the agent gives spaces to steward, and for nobody else", async () => {
    const { el, hub } = await notifications([['GET /stewardship', () => json(STEWARDSHIP)]], { view: 'list' })
    // @ts-expect-error private: asked with the list of conversations, through the same session
    await hub.probeSteward(AGENT, hub.clientOf(hub.getSnapshot().sessions[0]).client, 't_s1')
    expect(hub.getSnapshot().stewards[AGENT]).toBe(true)
    await settle()
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    const entry = byText(el, '[role="menuitem"]', 'Spaces you steward')
    expect(entry?.querySelector('svg')).toBeTruthy()
    await click(entry)
    expect(hub.getSnapshot().view).toBe('steward')
    teardown()
    const other = await notifications([['GET /stewardship', () => json({ error: 'not-steward' }, 403)]], {
      view: 'list',
    })
    // @ts-expect-error private
    await other.hub.probeSteward(AGENT, other.hub.clientOf(other.hub.getSnapshot().sessions[0]).client, 't_s1')
    expect(other.hub.getSnapshot().stewards[AGENT]).toBe(false)
    await click(other.el.querySelector('.agent-row [aria-label="Agent options"]'))
    expect(byText(other.el, '[role="menuitem"]', 'Spaces you steward')).toBeUndefined()
  })
})

describe('the words of governance in the four languages', () => {
  type Tree = { [key: string]: string | Tree }
  const pathOf = (tree: Tree, path: string): unknown =>
    path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree)

  it('say in English what the core gives the app, and each text in the other three with what the screen puts in', () => {
    const names = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
    for (const [path, text] of Object.entries(GOVERNANCE_COPY)) {
      expect(pathOf(en as Tree, path), path).toBe(text)
      for (const [lang, tree] of Object.entries({ es, fr, pt })) {
        const other = pathOf(tree as Tree, path) as string
        expect(other, `${lang}.${path}`).toBeTruthy()
        expect(names(other), `${lang}.${path}`).toEqual(names(text))
      }
    }
  })
})
