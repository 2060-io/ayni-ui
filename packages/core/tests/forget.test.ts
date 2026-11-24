/**
 * What a device forgets of the person for an agent at Disconnect (UI-AGENTS-006) and at Remove (UI-AGENTS-005).
 */
import { describe, expect, it } from 'vitest'
import { type HeldOfPerson, withAgentForgotten } from '../src/forget.js'

const A = 'did:web:a.test'
const B = 'did:web:b.test'

function held(over: Partial<HeldOfPerson> = {}): HeldOfPerson {
  return {
    view: 'list',
    spaces: { [A]: { spaces: [{ id: 'spc_a' }], templates: [] }, [B]: { spaces: [{ id: 'spc_b' }], templates: [] } },
    admins: { [A]: true, [B]: false },
    stewards: { [A]: true, [B]: true },
    connections: { [A]: [{ source: 'github' }], [B]: [] },
    agentNotifications: { [A]: 3, [B]: 1 },
    toolChanges: [{ agentDid: A }, { agentDid: B }],
    connectionChanges: [{ agentDid: A }, { agentDid: B }],
    spaceFor: null,
    keepsFor: null,
    adminFor: null,
    stewardFor: null,
    sharedFor: null,
    memoryFor: null,
    accountsFor: null,
    notificationsFor: null,
    transcripts: { ses_a1: {}, ses_a2: {}, ses_b1: {} },
    pending: { ses_a1: 'x', ses_b1: 'y' },
    replyTo: { ses_a2: {} },
    prefill: { ses_a1: {} },
    loadingOlder: { ses_a1: true, ses_b1: true },
    search: { ses_a2: {} },
    leaders: { ses_a1: true, ses_b1: true },
    inspect: null,
    selectedSessionId: null,
    ...over,
  }
}

describe('withAgentForgotten (UI-AGENTS-005, UI-AGENTS-006)', () => {
  it("drops what was read of the person from the agent, and keeps every other agent's", () => {
    const next = withAgentForgotten(held(), A, ['ses_a1', 'ses_a2'])
    expect(next.spaces).toEqual({ [B]: { spaces: [{ id: 'spc_b' }], templates: [] } })
    expect(next.admins).toEqual({ [B]: false })
    expect(next.stewards).toEqual({ [B]: true })
    expect(next.connections).toEqual({ [B]: [] })
    expect(next.agentNotifications).toEqual({ [B]: 1 })
    expect(next.toolChanges).toEqual([{ agentDid: B }])
    expect(next.connectionChanges).toEqual([{ agentDid: B }])
  })

  it("drops what is held of the agent's conversations, and keeps the others'", () => {
    const next = withAgentForgotten(held({ inspect: { sessionId: 'ses_a1' }, selectedSessionId: 'ses_a2' }), A, [
      'ses_a1',
      'ses_a2',
    ])
    expect(next.transcripts).toEqual({ ses_b1: {} })
    expect(next.pending).toEqual({ ses_b1: 'y' })
    expect(next.replyTo).toEqual({})
    expect(next.prefill).toEqual({})
    expect(next.loadingOlder).toEqual({ ses_b1: true })
    expect(next.search).toEqual({})
    expect(next.leaders).toEqual({ ses_b1: true })
    expect(next.inspect).toBeNull()
    expect(next.selectedSessionId).toBeNull()
  })

  it.each([
    ['space', { spaceFor: { agentDid: A } }],
    ['keeps', { keepsFor: A }],
    ['admin', { adminFor: A }],
    ['steward', { stewardFor: { agentDid: A } }],
    ['shared', { sharedFor: { agentDid: A } }],
    ['accounts', { accountsFor: { agentDid: A } }],
    ['notifications', { notificationsFor: { agentDid: A } }],
  ] as const)('a page of the agent that is open (%s) closes, back to the list', (view, page) => {
    const next = withAgentForgotten(held({ view, ...page }), A, [])
    expect(next.view).toBe('list')
    for (const key of Object.keys(page)) expect(next[key as keyof typeof next]).toBeNull()
  })

  it("a page of another agent stays open, and the agent's sheet of a memory closes behind it", () => {
    const next = withAgentForgotten(
      held({ view: 'space', spaceFor: { agentDid: B }, memoryFor: { agentDid: A }, keepsFor: B }),
      A,
      []
    )
    expect(next.view).toBe('space')
    expect(next.spaceFor).toEqual({ agentDid: B })
    expect(next.keepsFor).toBe(B)
    expect(next.memoryFor).toBeNull()
  })

  it("one of the agent's conversations on screen gives way to the list; another agent's stays", () => {
    expect(withAgentForgotten(held({ view: 'conversation', selectedSessionId: 'ses_a1' }), A, ['ses_a1']).view).toBe(
      'list'
    )
    const other = withAgentForgotten(held({ view: 'conversation', selectedSessionId: 'ses_b1' }), A, ['ses_a1'])
    expect(other.view).toBe('conversation')
    expect(other.selectedSessionId).toBe('ses_b1')
  })

  it('an agent of which nothing is held leaves the state as it was', () => {
    const before = held()
    const next = withAgentForgotten(before, 'did:web:c.test', [])
    expect(next.spaces).toBe(before.spaces)
    expect(next.transcripts).toBe(before.transcripts)
    expect(next.view).toBe('list')
  })
})
