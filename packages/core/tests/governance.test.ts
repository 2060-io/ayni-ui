/**
 * A space's governance in the core (AG-UI profile 3.5, package 3.5.4; agent D135 to D142): one owner or none, the
 * successor, the approval timeouts and the stewards (PROF-SPACE-008, PROF-SPACE-009); the approval policy of a tool of a
 * space as the owner and a member read it, its words, its form and the refusals of a change (PROF-TOOL-036); where an
 * approval stands, the requester's own confirmation and a refusal for want of an approver (PROF-TOOL-037); the notices
 * of a space's governance in the Notifications (PROF-TOOL-038). The shapes are the merged agent's (ayni-agent #122).
 */
import { describe, expect, it } from 'vitest'
import {
  addableKindsOf,
  approvalPolicyOf,
  approvalProgressOf,
  attentionEntriesOf,
  defaultWhenApproverAsksOf,
  entryWordsOf,
  lowerThreshold,
  minApprovalsOf,
  policyChanged,
  policyFormOf,
  policyInputOf,
  policyRefusalOf,
  policyRuleWordsOf,
  progressLineOf,
  withApprovers,
} from '../src/approvalPolicy.js'
import { GOVERNANCE_COPY } from '../src/governanceCopy.js'
import {
  cardStatusOf,
  deciderProgressOf,
  noticeControlOf,
  noticeWordsOf,
  notificationControlsOf,
  notificationHeadingOf,
  notificationStatusOf,
  notificationsChangeOf,
  notificationsPageOf,
} from '../src/notifications.js'
import { ProfileClient, ProfileError } from '../src/profileClient.js'
import {
  handoverCandidatesOf,
  ownerCandidatesOf,
  ownerNameOf,
  type SpaceMember,
  spaceActivityOf,
  spaceOf,
  stewardReasonFits,
  stewardRefusalOf,
  stewardshipOf,
  templateOf,
  timeoutChoicesOf,
  timeoutFits,
} from '../src/spaces.js'
import { ruleGroupsOf, spaceToolOf, toolRefusalOf, toolsNeedingAttention, withApprovalUpdate } from '../src/tools.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'
const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Communication, as its owner reads it from an agent of 3.5.4. */
const COMMS = {
  id: 'spc_comms',
  kind: 'team',
  title: 'Communication',
  purpose: 'Posts and newsletters',
  brief: '',
  templateId: 'project',
  language: null,
  rules: {
    retentionDays: 365,
    lawfulBasis: 'contract',
    allowedProviders: ['kimi'],
    handover: true,
    approvalTimeouts: { 'tool-call': 60 },
  },
  membership: { mode: 'list', memberCount: 3 },
  owner: { name: 'Jonas Weber' },
  successor: { name: 'Ana Ríos' },
  role: 'owner',
  state: 'active',
  unread: 0,
  lastActivityAt: '2026-11-24T09:00:00Z',
}

/** Post on X's policy as its owner reads it: Jonas, required, and Marta, two needed (the spec's example). */
const OWNER_POLICY = {
  approvers: [
    { kind: 'owner', name: 'Jonas Weber', required: true },
    { kind: 'person', memberId: 'mem_marta', name: 'Marta Kova', required: false },
  ],
  threshold: 2,
  refusal: 'any',
  attested: true,
  whenApproverAsks: 'another-approver',
  state: 'ok',
  attention: [],
  warnings: [{ code: 'own-requests-blocked', approvers: [{ name: 'Jonas Weber' }, { name: 'Marta Kova' }] }],
  bounds: {
    minApprovals: 1,
    kinds: ['owner', 'person', 'member', 'role', 'department'],
    roles: ['manager'],
    attested: 'optional',
  },
}

describe('one owner or none, the successor and the timeouts (PROF-SPACE-008, agent D136, D138)', () => {
  it('reads the owner, null while the space has none, the successor to its owner, and the timeouts', () => {
    const space = spaceOf(COMMS)
    expect(space?.owner).toEqual({ name: 'Jonas Weber' })
    expect(space?.successor).toEqual({ name: 'Ana Ríos' })
    expect(space?.rules.approvalTimeouts).toEqual({ 'tool-call': 60 })
    const none = spaceOf({ ...COMMS, owner: null, successor: null, role: 'member' })
    expect(none?.owner).toBeNull()
    expect(ownerNameOf(none ?? undefined)).toBeNull()
    expect(none?.successor).toBeNull()
    // a member's answer carries no successor
    const { successor: _s, ...member } = COMMS
    expect(spaceOf(member)).not.toHaveProperty('successor')
    // a template's bounds of the timeouts, per kind
    expect(
      templateOf({
        id: 'project',
        title: 'Project',
        kind: 'team',
        membership: 'list',
        rules: { approvalTimeouts: { 'tool-call': { default: 60, min: 5, max: 10080 } } },
      })?.bounds?.approvalTimeouts
    ).toEqual({ 'tool-call': { default: 60, min: 5, max: 10080 } })
  })

  it('offers each kind of timeout with its bounds, and takes a whole number of minutes within them', () => {
    const space = spaceOf(COMMS)
    if (!space) throw new Error('no space')
    const choices = timeoutChoicesOf(space, { approvalTimeouts: { 'tool-call': { default: 60, min: 5, max: 10080 } } })
    expect(choices).toEqual([{ kind: 'tool-call', minutes: 60, min: 5, max: 10080 }])
    expect(timeoutFits(choices[0] as never, '1440')).toBe(true)
    expect(timeoutFits(choices[0] as never, '4')).toBe(false)
    expect(timeoutFits(choices[0] as never, '20000')).toBe(false)
    expect(timeoutFits(choices[0] as never, '1.5')).toBe(false)
    expect(timeoutFits({}, '1440')).toBe(true)
    // with no template in the list, the space's own kinds, with no bound
    expect(timeoutChoicesOf(space, undefined)).toEqual([{ kind: 'tool-call', minutes: 60 }])
    expect(timeoutChoicesOf({ ...space, kind: 'personal' }, undefined)).toEqual([])
  })

  it('names as successor or new owner an active member who is neither the owner nor a guest', () => {
    const members: SpaceMember[] = [
      { memberId: 'm1', name: 'Jonas Weber', organization: null, state: 'active', role: 'owner' },
      { memberId: 'm2', name: 'Ana Ríos', organization: null, state: 'active', role: 'member' },
      { memberId: 'm3', name: 'Piet', organization: null, state: 'invited', role: 'member' },
      { memberId: 'm4', name: 'Lee', organization: 'Acme', state: 'active', role: 'guest' },
      { memberId: 'm5', name: 'Ben', organization: null, state: 'left', role: 'member' },
    ]
    expect(handoverCandidatesOf(members).map((m) => m.name)).toEqual(['Ana Ríos'])
  })

  it("reads the activity of a successor and how the owner changed, with a steward's reason", () => {
    const page = spaceActivityOf({
      activity: [
        {
          at: '2026-11-24T10:00:00Z',
          kind: 'successor-set',
          by: { name: 'Jonas Weber' },
          member: { name: 'Ana Ríos' },
        },
        { at: '2026-11-24T09:00:00Z', kind: 'successor-cleared', member: { name: 'Ana Ríos' } },
        {
          at: '2026-11-24T08:00:00Z',
          kind: 'owner-changed',
          how: 'steward',
          reason: 'Jonas left the company',
          by: { name: 'Admin' },
          member: { name: 'Ana Ríos' },
        },
      ],
      nextBefore: null,
    })
    expect(page.activity.map((a) => a.kind)).toEqual(['successor-set', 'successor-cleared', 'owner-changed'])
    expect(page.activity[2]).toMatchObject({ how: 'steward', reason: 'Jonas left the company' })
  })

  it('sends the successor, clears it, and the timeouts within the rules', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = []
    const client = new ProfileClient(SESSIONS, async (input, init) => {
      calls.push({
        method: init?.method ?? 'GET',
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return json(COMMS)
    })
    await client.setSuccessor('tok', 'spc_comms', { memberId: 'mem_ana' })
    await client.clearSuccessor('tok', 'spc_comms')
    await client.patchSpace('tok', 'spc_comms', { rules: { approvalTimeouts: { 'tool-call': 1440 } } })
    expect(calls).toEqual([
      { method: 'PUT', url: `${SESSIONS}/spaces/spc_comms/successor`, body: { memberId: 'mem_ana' } },
      { method: 'DELETE', url: `${SESSIONS}/spaces/spc_comms/successor`, body: undefined },
      {
        method: 'PATCH',
        url: `${SESSIONS}/spaces/spc_comms`,
        body: { rules: { approvalTimeouts: { 'tool-call': 1440 } } },
      },
    ])
  })
})

describe('the stewards (PROF-SPACE-009, agent D136)', () => {
  const STEWARDSHIP = {
    spaces: [
      {
        id: 'spc_comms',
        title: 'Communication',
        templateId: 'project',
        kind: 'team',
        owner: { name: 'Jonas Weber' },
        successor: { name: 'Ana Ríos' },
        memberCount: 3,
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

  it('lists the spaces with no owner first, and who could own one', () => {
    const list = stewardshipOf(STEWARDSHIP)
    expect(list.map((s) => [s.title, s.owner?.name ?? null, s.successor?.name ?? null])).toEqual([
      ['Truck 14 recall', null, null],
      ['Communication', 'Jonas Weber', 'Ana Ríos'],
    ])
    expect(
      ownerCandidatesOf({
        candidates: [
          { memberId: 'mem_ana', name: 'Ana Ríos', department: 'Sales' },
          { directoryId: 'dir_7', name: 'Ben Ode', department: null },
          { name: 'Nobody' },
        ],
      })
    ).toEqual([
      { memberId: 'mem_ana', name: 'Ana Ríos', department: 'Sales' },
      { directoryId: 'dir_7', name: 'Ben Ode', department: null },
    ])
  })

  it('takes a reason of 1 to 500 characters, and words the refusals', () => {
    expect(stewardReasonFits('')).toBe(false)
    expect(stewardReasonFits('   ')).toBe(false)
    expect(stewardReasonFits('Jonas left the company')).toBe(true)
    expect(stewardReasonFits('x'.repeat(501))).toBe(false)
    expect(stewardRefusalOf({ status: 403, code: 'not-steward' })).toBe('notSteward')
    expect(stewardRefusalOf({ status: 400, code: 'bad-request', field: 'reason' })).toBe('reason')
    expect(stewardRefusalOf({ status: 422, code: 'not-eligible' })).toBe('notEligible')
  })

  it('reads the stewardship, the candidates, and names the owner with the reason', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = []
    const client = new ProfileClient(SESSIONS, async (input, init) => {
      const url = String(input)
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/stewardship')) return json(STEWARDSHIP)
      if (url.endsWith('/owner/candidates'))
        return json({ candidates: [{ memberId: 'mem_ana', name: 'Ana Ríos', department: null }] })
      return json({ ...STEWARDSHIP.spaces[1], owner: { name: 'Ana Ríos' } })
    })
    expect((await client.stewardship('tok'))[0]?.id).toBe('spc_truck')
    expect(await client.ownerCandidates('tok', 'spc_truck')).toHaveLength(1)
    const named = await client.nameOwner('tok', 'spc_truck', { memberId: 'mem_ana' }, 'Jonas left the company')
    expect(named.owner).toEqual({ name: 'Ana Ríos' })
    expect(calls.at(-1)).toEqual({
      method: 'POST',
      url: `${SESSIONS}/spaces/spc_truck/owner`,
      body: { memberId: 'mem_ana', reason: 'Jonas left the company' },
    })
    const refusing = new ProfileClient(SESSIONS, async () => json({ error: 'not-steward' }, 403))
    await expect(refusing.stewardship('tok')).rejects.toMatchObject({ status: 403, code: 'not-steward' })
  })
})

describe('the approval policy of a tool of a space (PROF-TOOL-036, UI-CONV-049, UI-CONV-067)', () => {
  const tool = (approval: unknown, rule = 'approval') =>
    spaceToolOf({
      source: 'x',
      title: 'Post on X',
      state: 'ready',
      account: { kind: 'space', set: true },
      bindings: [],
      tools: [
        { name: 'post', title: 'Post on X', effect: 'external', rule, packRule: 'approval', stepUp: null, approval },
      ],
      pending: null,
    })

  it("reads a tool's policy, whole to the owner and approvers and number to a member; none for another rule", () => {
    const owner = tool(OWNER_POLICY)?.tools[0]?.approval
    expect(owner).toMatchObject({
      threshold: 2,
      refusal: 'any',
      attested: true,
      whenApproverAsks: 'another-approver',
      state: 'ok',
      warnings: [{ code: 'own-requests-blocked', approvers: [{ name: 'Jonas Weber' }, { name: 'Marta Kova' }] }],
      bounds: { minApprovals: 1, roles: ['manager'], attested: 'optional' },
    })
    expect(owner?.approvers[1]).toEqual({ kind: 'person', memberId: 'mem_marta', name: 'Marta Kova', required: false })
    const member = tool({
      approvers: OWNER_POLICY.approvers.map(({ kind, name, required }) => ({ kind, name, required })),
      threshold: 2,
    })
    expect(member?.tools[0]?.approval).toEqual({
      approvers: [
        { kind: 'owner', name: 'Jonas Weber', required: true },
        { kind: 'person', name: 'Marta Kova', required: false },
      ],
      threshold: 2,
    })
    expect(tool(OWNER_POLICY, 'confirm')?.tools[0]?.approval).toBeUndefined()
  })

  it('words the rule in About: one person by name, "your" for that person, else the number and the entries', () => {
    const one = { approvers: [{ kind: 'owner' as const, name: 'Jonas Weber', required: true }], threshold: 1 }
    expect(policyRuleWordsOf(one, { name: 'Ana Ríos' })).toEqual({ key: 'needsName', name: 'Jonas Weber' })
    expect(policyRuleWordsOf(one, { name: 'Jonas Weber', isOwner: true })).toEqual({ key: 'needsYou' })
    const person = { approvers: [{ kind: 'person' as const, name: 'Marta Kova', required: true }], threshold: 1 }
    expect(policyRuleWordsOf(person, { name: 'Marta Kova' })).toEqual({ key: 'needsYou' })
    const policy = approvalPolicyOf(OWNER_POLICY)
    if (!policy) throw new Error('no policy')
    expect(policyRuleWordsOf(policy, { name: 'Ana Ríos' })).toEqual({
      key: 'needsCount',
      count: 2,
      entries: [
        { key: 'name', name: 'Jonas Weber', required: true },
        { key: 'name', name: 'Marta Kova', required: false },
      ],
    })
    expect(entryWordsOf({ kind: 'member', required: false })).toEqual({ key: 'anyMember' })
    expect(entryWordsOf({ kind: 'role', role: 'manager', required: true })).toEqual({ key: 'role', role: 'manager' })
    expect(entryWordsOf({ kind: 'department', department: 'Sales', required: false })).toEqual({
      key: 'department',
      department: 'Sales',
    })
    expect(entryWordsOf({ kind: 'owner', name: 'Jonas Weber', required: true }, 'Jonas Weber')).toEqual({
      key: 'self',
      name: 'Jonas Weber',
    })
    // the owner of a space that has none
    expect(entryWordsOf({ kind: 'owner', required: true })).toEqual({ key: 'owner' })
  })

  it('groups the tools of About by rule and, for approval, by policy', () => {
    const groups = ruleGroupsOf({
      tools: [
        { title: 'Post', effect: 'external', rule: 'approval', stepUp: null, approval: approvalPolicyOf(OWNER_POLICY) },
        {
          title: 'Delete',
          effect: 'delete',
          rule: 'approval',
          stepUp: 'device',
          approval: approvalPolicyOf({
            approvers: [{ kind: 'owner', name: 'Jonas Weber', required: true }],
            threshold: 1,
          }),
        },
        {
          title: 'Reply',
          effect: 'external',
          rule: 'approval',
          stepUp: null,
          approval: approvalPolicyOf(OWNER_POLICY),
        },
        { title: 'Read', effect: 'read', rule: 'none', stepUp: null },
      ],
    })
    expect(groups.map((g) => [g.rule, g.approval?.threshold ?? null, g.tools.map((x) => x.title)])).toEqual([
      ['none', null, ['Read']],
      ['approval', 2, ['Post', 'Reply']],
      ['approval', 1, ['Delete']],
    ])
  })

  it('makes a form of the policy in force, and sends it whole, each entry by what names it', () => {
    const policy = approvalPolicyOf(OWNER_POLICY)
    if (!policy) throw new Error('no policy')
    const form = policyFormOf(policy)
    expect(policyChanged(form, policy)).toBe(false)
    expect(policyInputOf(form)).toEqual({
      approvers: [
        { kind: 'owner', required: true },
        { kind: 'person', memberId: 'mem_marta', required: false },
      ],
      threshold: 2,
      refusal: 'any',
      attested: true,
      whenApproverAsks: 'another-approver',
    })
    // a role and a department, and a person of a rule space by their entry
    const more = withApprovers(form, [
      ...form.approvers,
      { kind: 'role', role: 'manager', required: false },
      { kind: 'department', department: 'Sales', required: true },
      { kind: 'person', directoryId: 'dir_7', name: 'Ben Ode', required: false },
    ])
    expect(policyInputOf(more).approvers.slice(2)).toEqual([
      { kind: 'role', role: 'manager', required: false },
      { kind: 'department', department: 'Sales', required: true },
      { kind: 'person', directoryId: 'dir_7', required: false },
    ])
    expect(policyChanged(more, policy)).toBe(true)
  })

  it('presets When an approver makes the request by the approvers, until the owner chooses it', () => {
    expect(defaultWhenApproverAsksOf([{ kind: 'owner' }])).toBe('own-confirmation')
    expect(defaultWhenApproverAsksOf([{ kind: 'person' }])).toBe('own-confirmation')
    expect(defaultWhenApproverAsksOf([{ kind: 'role' }])).toBe('another-approver')
    expect(defaultWhenApproverAsksOf([{ kind: 'owner' }, { kind: 'person' }])).toBe('another-approver')
    const single = policyFormOf(
      approvalPolicyOf({
        approvers: [{ kind: 'owner', name: 'Jonas Weber', required: true }],
        threshold: 1,
        refusal: 'any',
        attested: true,
        whenApproverAsks: 'own-confirmation',
      }) as never
    )
    expect(single.chosenWhen).toBe(false)
    const two = withApprovers(single, [...single.approvers, { kind: 'person', memberId: 'mem_marta', required: false }])
    expect(two.whenApproverAsks).toBe('another-approver')
    const chosen = withApprovers({ ...two, whenApproverAsks: 'own-confirmation', chosenWhen: true }, single.approvers)
    expect(chosen.whenApproverAsks).toBe('own-confirmation')
  })

  it('asks no fewer approvals than the agent-pack and the required entries, and lowers the number no further', () => {
    const policy = approvalPolicyOf({ ...OWNER_POLICY, bounds: { ...OWNER_POLICY.bounds, minApprovals: 1 } })
    if (!policy) throw new Error('no policy')
    const form = policyFormOf(policy)
    expect(minApprovalsOf(form, policy.bounds)).toBe(1)
    expect(lowerThreshold(form, policy.bounds).threshold).toBe(1)
    const both = withApprovers(
      form,
      form.approvers.map((a) => ({ ...a, required: true }))
    )
    expect(minApprovalsOf(both, policy.bounds)).toBe(2)
    expect(lowerThreshold(both, policy.bounds).threshold).toBe(2)
    expect(minApprovalsOf(form, { minApprovals: 3 })).toBe(3)
    // a policy whose attestation the agent-pack requires is attested, whatever it said
    expect(
      policyFormOf({ ...policy, attested: false, bounds: { ...policy.bounds, attested: 'required' } as never }).attested
    ).toBe(true)
    // Add approver offers the kinds the bounds allow, a role only with a role to name
    expect(addableKindsOf({ minApprovals: 1, kinds: ['owner', 'role'], roles: [], attested: 'optional' })).toEqual([
      'owner',
    ])
    expect(addableKindsOf(undefined)).toEqual(['owner', 'person', 'member', 'department'])
  })

  it('shows a refusal at the entry, the number needed or the switch the agent names', () => {
    expect(policyRefusalOf({ status: 422, code: 'not-eligible', field: 'approvals.post.approvers.1' })).toEqual({
      tool: 'post',
      at: 'approver',
      index: 1,
      reason: 'notEligible',
    })
    expect(
      policyRefusalOf({ status: 422, code: 'threshold-below-required', field: 'approvals.post.threshold' })
    ).toEqual({
      tool: 'post',
      at: 'threshold',
      reason: 'thresholdBelowRequired',
    })
    expect(
      policyRefusalOf({ status: 422, code: 'attestation-required', field: 'approvals.post.attested' })
    ).toMatchObject({
      at: 'attested',
      reason: 'attestationRequired',
    })
    expect(policyRefusalOf({ status: 422, code: 'not-approval', field: 'approvals.post' })).toEqual({
      tool: 'post',
      at: 'policy',
      reason: 'notApproval',
    })
    expect(policyRefusalOf({ status: 400, code: 'bad-request', field: 'approvals.post.refusal' })).toMatchObject({
      at: 'policy',
      reason: 'badPolicy',
    })
    expect(policyRefusalOf({ status: 422, code: 'bad-binding', field: 'bindings.handle' })).toBeNull()
    expect(
      toolRefusalOf(
        new ProfileError(422, 'below-pack-minimum', undefined, undefined, undefined, 'approvals.post.threshold')
      )
    ).toEqual({
      at: 'policy',
      refusal: { tool: 'post', at: 'threshold', reason: 'belowPackMinimum' },
    })
  })

  it('says which tools need attention, and the entries that name nobody', () => {
    const needing = { ...OWNER_POLICY, state: 'needs-attention', attention: [1, 7] }
    const t = tool(needing)
    if (!t) throw new Error('no tool')
    expect(toolsNeedingAttention(t).map((x) => x.title)).toEqual(['Post on X'])
    expect(attentionEntriesOf(t.tools[0]?.approval as never).map((e) => e.name)).toEqual(['Marta Kova'])
    expect(toolsNeedingAttention(tool(OWNER_POLICY) as never)).toEqual([])
  })

  it('sends the policies with the settings of the tool', async () => {
    const calls: { method: string; body?: unknown }[] = []
    const client = new ProfileClient(SESSIONS, async (_input, init) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return json(
        {
          tool: {
            source: 'x',
            title: 'Post on X',
            state: 'ready',
            account: { kind: 'space' },
            bindings: [],
            tools: [],
            pending: null,
          },
        },
        202
      )
    })
    const policy = policyInputOf(policyFormOf(approvalPolicyOf(OWNER_POLICY) as never))
    const answer = await client.patchSpaceTool('tok', 'spc_comms', 'x', { approvals: { post: policy } })
    expect(answer.status).toBe(202)
    expect(calls[0]).toEqual({ method: 'PATCH', body: { approvals: { post: policy } } })
  })
})

describe('where an approval stands (PROF-TOOL-037, UI-APPR-010)', () => {
  const PROGRESS = {
    threshold: 2,
    approvals: 1,
    waitingFor: [
      { kind: 'person', name: 'Marta Kova', required: false },
      { kind: 'owner', name: 'Jonas Weber', required: true },
    ],
  }

  it('reads one line for one person and one approval, else the count and the entries, required first', () => {
    const progress = approvalProgressOf(PROGRESS)
    if (!progress) throw new Error('no progress')
    expect(progressLineOf(progress)).toEqual({
      key: 'progress',
      approvals: 1,
      threshold: 2,
      entries: [
        { key: 'name', name: 'Jonas Weber', required: true },
        { key: 'name', name: 'Marta Kova', required: false },
      ],
    })
    const single = approvalProgressOf({
      threshold: 1,
      approvals: 0,
      waitingFor: [{ kind: 'owner', name: 'Jonas Weber', required: true }],
    })
    if (!single) throw new Error('no progress')
    expect(progressLineOf(single)).toEqual({ key: 'waitingFor', approver: 'Jonas Weber' })
    expect(
      progressLineOf(single, { approvers: [{ kind: 'owner', name: 'Jonas Weber', required: true }], threshold: 1 })
    ).toEqual({ key: 'waitingFor', approver: 'Jonas Weber' })
    // a role, one approval needed, reads as a count
    const role = approvalProgressOf({
      threshold: 1,
      approvals: 0,
      waitingFor: [{ kind: 'role', role: 'manager', required: true }],
    })
    expect(progressLineOf(role as never).key).toBe('progress')
  })

  it("puts the progress on the requester's card, updated by each update, and a refusal for want of an approver", () => {
    const content = {
      approvalId: 'apr_1',
      status: 'PENDING',
      policy: {
        approvers: [
          { kind: 'owner', name: 'Jonas Weber', required: true },
          { kind: 'person', name: 'Marta Kova', required: false },
        ],
        threshold: 2,
      },
      progress: { threshold: 2, approvals: 0, waitingFor: PROGRESS.waitingFor },
      action: { title: 'Post on X', source: { id: 'x', title: 'X' }, account: { kind: 'space' }, fields: [] },
      space: { id: 'spc_comms', title: 'Communication' },
    }
    expect(cardStatusOf(content, 'Jonas Weber')).toMatchObject({ key: 'progress', approvals: 0, threshold: 2 })
    const transcript = {
      sessionId: 's1',
      messages: [{ id: 'a1', role: 'activity' as const, activityType: 'ayni.approval', content, at: '' }],
      oldestLoadedId: null,
      complete: true,
      run: null,
      routed: {},
      reactions: {},
    }
    const updated = withApprovalUpdate(transcript as never, {
      approvalId: 'apr_1',
      status: 'PENDING',
      progress: PROGRESS,
    })
    const after = (updated.messages[0] as { content: unknown }).content
    expect(cardStatusOf(after)).toMatchObject({ key: 'progress', approvals: 1 })
    // the default policy, one person: the line of UI-APPR-006
    expect(
      cardStatusOf({
        status: 'PENDING',
        policy: { approvers: [{ kind: 'owner', name: 'Jonas Weber', required: true }], threshold: 1 },
        progress: { threshold: 1, approvals: 0, waitingFor: [{ kind: 'owner', name: 'Jonas Weber', required: true }] },
      })
    ).toEqual({ key: 'waitingFor', approver: 'Jonas Weber' })
    expect(cardStatusOf({ status: 'REJECTED', reason: 'no-approver' })).toEqual({ key: 'noApprover' })
    // an agent before 3.5.4: the owner's name, as before
    expect(cardStatusOf({ status: 'PENDING' }, 'Jonas Weber')).toEqual({ key: 'waitingFor', approver: 'Jonas Weber' })
  })

  it("lists the requester's own confirmation under Your own request, decided on the phone", () => {
    const page = notificationsPageOf({
      notifications: [
        {
          id: 'apr_9',
          kind: 'approval',
          at: '2026-11-24T10:00:00Z',
          waiting: true,
          approval: {
            approvalId: 'apr_9',
            kind: 'sensitivity',
            status: 'PENDING',
            expiresAt: '2026-11-24T11:00:00Z',
            requester: { displayName: 'Jonas Weber' },
            own: true,
            canDecide: true,
            attested: true,
            myDecision: null,
            action: { title: 'Post on X', source: { id: 'x', title: 'X' }, account: { kind: 'space' }, fields: [] },
            space: { id: 'spc_comms', title: 'Communication' },
            decisions: [
              { by: { displayName: 'Jonas Weber' }, decision: 'approve', at: '2026-11-24T10:01:00Z', self: true },
            ],
          },
        },
      ],
      nextBefore: null,
      waiting: 1,
    })
    const item = page.notifications[0]
    if (item?.kind !== 'approval') throw new Error('no approval')
    expect(item.approval.canDecide).toBe(true)
    expect(notificationHeadingOf(item.approval)).toEqual({ key: 'ownRequest' })
    expect(notificationControlsOf({ ...item.approval, attested: false })).toBe('phone')
    expect(item.approval.decisions[0]?.self).toBe(true)
  })

  it('shows an approver the progress beside the time left, and their own decision while others decide', () => {
    const base = notificationsPageOf({
      notifications: [
        {
          id: 'apr_1',
          kind: 'approval',
          at: '',
          waiting: true,
          approval: {
            approvalId: 'apr_1',
            status: 'PENDING',
            expiresAt: '2026-11-24T11:00:00Z',
            requester: { displayName: 'Ana Ríos' },
            own: false,
            canDecide: true,
            attested: true,
            myDecision: null,
            policy: {
              approvers: [
                { kind: 'owner', name: 'Jonas Weber', required: true },
                { kind: 'person', name: 'Marta Kova', required: false },
              ],
              threshold: 2,
            },
            progress: PROGRESS,
          },
        },
      ],
    }).notifications[0]
    if (base?.kind !== 'approval') throw new Error('no approval')
    expect(notificationStatusOf(base.approval)).toEqual({ key: 'timeLeft', expiresAt: '2026-11-24T11:00:00Z' })
    expect(deciderProgressOf(base.approval)).toMatchObject({ key: 'progress', approvals: 1, threshold: 2 })
    expect(notificationStatusOf({ ...base.approval, canDecide: false, myDecision: 'approve' })).toEqual({
      key: 'mine',
      decision: 'approve',
    })
    // the requester's own sent item: the progress
    expect(notificationStatusOf({ ...base.approval, own: true, canDecide: false })).toMatchObject({ key: 'progress' })
    expect(notificationStatusOf({ ...base.approval, status: 'REJECTED', reason: 'no-approver' })).toEqual({
      key: 'noApprover',
    })
    // one person, one approval: no line that would only name the reader
    expect(
      deciderProgressOf({
        ...base.approval,
        policy: { approvers: [{ kind: 'owner', name: 'Jonas Weber', required: true }], threshold: 1 },
        progress: { threshold: 1, approvals: 0, waitingFor: [{ kind: 'owner', name: 'Jonas Weber', required: true }] },
      })
    ).toBeNull()
  })
})

describe("the notices of a space's governance (PROF-TOOL-038, UI-APPR-011)", () => {
  const notices = notificationsPageOf({
    notifications: [
      {
        id: 'ntc_1',
        kind: 'owner-changed',
        at: '2026-11-24T10:00:00Z',
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
        at: '2026-11-24T09:00:00Z',
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
        at: '2026-11-24T08:00:00Z',
        waiting: false,
        notice: {
          space: { id: 'spc_comms', title: 'Communication' },
          tool: { source: 'x', title: 'Post on X' },
          requester: { displayName: 'Jonas Weber' },
        },
      },
      {
        id: 'ntc_4',
        kind: 'space-without-owner',
        at: '2026-11-24T07:00:00Z',
        waiting: true,
        notice: {
          space: { id: 'spc_truck', title: 'Truck 14 recall' },
          template: { id: 'project', title: 'Project' },
          formerOwner: { name: 'Jonas Weber' },
        },
      },
      {
        id: 'ntc_5',
        kind: 'space-without-owner',
        at: '2026-11-23T07:00:00Z',
        waiting: false,
        notice: { space: { id: 'spc_old', title: 'Old' }, resolvedAt: '2026-11-23T08:00:00Z' },
      },
      { id: 'ntc_6', kind: 'invitation', at: '', waiting: false, notice: {} },
    ],
    nextBefore: null,
    waiting: 2,
  }).notifications

  it('reads each kind, and leaves out what it cannot show', () => {
    expect(notices.map((n) => n.kind)).toEqual([
      'owner-changed',
      'policy-attention',
      'no-approver',
      'space-without-owner',
      'space-without-owner',
    ])
  })

  it('says what each notice reports, and offers its control only while it waits', () => {
    const words = notices.map((n) => (n.kind === 'approval' ? null : noticeWordsOf(n)))
    expect(words[0]).toEqual({
      key: 'ownerChanged',
      how: 'handover',
      to: 'Marta Kova',
      space: 'Communication',
      from: 'Jonas Weber',
      reason: '',
    })
    expect(words[1]).toMatchObject({ key: 'policyAttention', tool: 'Post on X', source: 'x', spaceId: 'spc_comms' })
    expect(words[2]).toEqual({ key: 'noApprover', requester: 'Jonas Weber', tool: 'Post on X' })
    expect(words[3]).toEqual({ key: 'spaceWithoutOwner', space: 'Truck 14 recall', spaceId: 'spc_truck' })
    expect(notices.map((n) => (n.kind === 'approval' ? null : noticeControlOf(n)))).toEqual([
      null,
      'openTool',
      null,
      'nameOwner',
      null,
    ])
  })

  it('takes the kind of a notice from its event', () => {
    expect(
      notificationsChangeOf({ spaceId: null, id: 'ntc_4', kind: 'space-without-owner', waiting: true, count: 1 })?.kind
    ).toBe('space-without-owner')
    expect(
      notificationsChangeOf({
        spaceId: 'spc_comms',
        id: 'apr_1',
        kind: 'approval',
        status: 'APPROVED',
        waiting: false,
        count: 0,
      })?.kind
    ).toBe('approval')
  })
})

describe('the words of governance', () => {
  it('give the table of UI-CONV-052 as the spec writes it', () => {
    expect(GOVERNANCE_COPY['approval.progress']).toBe(
      '{{approvals}} of {{threshold}} approvals, waiting for {{entries}}'
    )
    expect(GOVERNANCE_COPY['approval.noApprover']).toBe('No other approver can decide this')
    expect(GOVERNANCE_COPY['notifications.ownRequest']).toBe('Your own request')
    expect(GOVERNANCE_COPY['policy.unreachable']).toBe("Nobody's requests can be approved with these approvers.")
    expect(GOVERNANCE_COPY['notices.spaceWithoutOwner']).toBe('{{space}} has no owner')
    expect(GOVERNANCE_COPY['steward.notSteward']).toBe('Only a steward of this kind of space names its owner.')
    expect(GOVERNANCE_COPY['spaces.settings.timeout.tool-call']).toBe('How long an approval of a tool waits')
  })
})
