/**
 * A tool's step-up in the settings of a space (profile 3.5.6, PROF-TOOL-001; agent D127; UI-CONV-049): `device`, or the
 * list of the types of the methods a re-authentication asks, read from the agent's answer and said after the tool's
 * title in the words of TOOLS_COPY.
 */
import { describe, expect, it } from 'vitest'
import { fillText } from '../src/proofOfTrustDesign.js'
import { ruleGroupsOf, STEP_UP_METHODS, spaceToolsOf, stepUpOf, stepUpWords } from '../src/tools.js'
import { TOOLS_COPY } from '../src/toolsCopy.js'

/** The words as the app fills them, from the core's English copy. */
const english = (key: string, values?: Record<string, string>) =>
  fillText(TOOLS_COPY[key as keyof typeof TOOLS_COPY] ?? `<${key}>`, values)

/** Relaticle CRM in a member's answer, one tool per step-up the agent gives. */
const crm = (tools: Record<string, unknown>[]) =>
  spaceToolsOf({
    tools: [
      {
        feature: { id: 'crm', title: 'CRM', profile: null },
        source: 'relaticle',
        title: 'Relaticle CRM',
        state: 'ready',
        guests: false,
        account: { kind: 'space' },
        bindings: [],
        tools,
      },
    ],
  })[0]

describe("a tool's step-up (PROF-TOOL-001, UI-CONV-049)", () => {
  it('reads the list of the methods a re-authentication asks, as the agent gives it since profile 3.5.6', () => {
    const tool = crm([
      { title: 'Delete note', effect: 'delete', rule: 'approval', stepUp: ['face-match'] },
      { title: 'Export', effect: 'external', rule: 'approval', stepUp: ['credential'] },
      { title: 'Archive note', effect: 'write', rule: 'confirm', stepUp: 'device' },
      { title: 'Get company', effect: 'read', rule: 'none', stepUp: null },
    ])
    expect(tool.tools.map((x) => x.stepUp)).toEqual([['face-match'], ['credential'], 'device', null])
    // About groups them by rule, each tool with its own step-up
    expect(ruleGroupsOf(tool)).toEqual([
      { rule: 'none', tools: [{ title: 'Get company', stepUp: null }] },
      { rule: 'confirm', tools: [{ title: 'Archive note', stepUp: 'device' }] },
      {
        rule: 'approval',
        tools: [
          { title: 'Delete note', stepUp: ['face-match'] },
          { title: 'Export', stepUp: ['credential'] },
        ],
      },
    ])
  })

  it("keeps the agent's order, reads a type once, and leaves out what is not a method's type", () => {
    expect(stepUpOf(['email', 'face-match'])).toEqual(['email', 'face-match'])
    expect(stepUpOf(['face-match', 'document'])).toEqual(['face-match', 'document'])
    expect(stepUpOf(['credential', 'credential', 'face-match'])).toEqual(['credential', 'face-match'])
    // a method's name is not its type: the agent gives types (D127)
    expect(stepUpOf(['badge', 'face-match'])).toEqual(['face-match'])
    expect(stepUpOf(['badge'])).toBeNull()
    expect(stepUpOf([])).toBeNull()
    // a bare method is no longer on the wire (profile 3.5.6): only `device` is a string
    expect(stepUpOf('face-match')).toBeNull()
    expect(stepUpOf('device')).toBe('device')
    expect(stepUpOf(null)).toBeNull()
    expect(stepUpOf(undefined)).toBeNull()
    expect(STEP_UP_METHODS).toEqual(['credential', 'email', 'document', 'face-match', 'authenticator-app', 'passkey'])
  })

  it("names a step-up in the spec's words, and each method of a re-authentication by its check", () => {
    expect(stepUpWords('device', english)).toBe(', then a check on your phone')
    expect(stepUpWords(['face-match'], english)).toBe(', then a face check')
    expect(stepUpWords(['document'], english)).toBe(', then a passport check')
    // the client's own words, for what UI-CONV-049 does not word (decision 57)
    expect(stepUpWords(['credential'], english)).toBe(', then a badge check')
    expect(stepUpWords(['email'], english)).toBe(', then an email check')
    expect(stepUpWords(['authenticator-app'], english)).toBe(', then an authenticator app check')
    expect(stepUpWords(['passkey'], english)).toBe(', then a passkey check')
    expect(stepUpWords(['email', 'face-match'], english)).toBe(', then an email check and a face check')
    expect(stepUpWords(['credential', 'email', 'face-match'], english)).toBe(
      ', then a badge check and an email check and a face check'
    )
    expect(stepUpWords(null, english)).toBe('')
    // every method has its words in the copy
    for (const m of STEP_UP_METHODS) expect(TOOLS_COPY).toHaveProperty([`tools.stepUp.method.${m}`])
  })
})
