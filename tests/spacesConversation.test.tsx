/**
 * A conversation and its space (UI-CONV-029, UI-CONV-030, UI-CONV-038, UI-CONV-043): the chip of an empty conversation
 * and its chooser, until the first message; the grey chip of the header, which opens the space's page; the share in
 * the header; a space the person left takes no more messages. And the line "<agent> updated a memory" (UI-CONV-035).
 */
import type { TranscriptMessage } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Conversation } from '../src/components/Conversation.js'
import {
  AGENT,
  byText,
  click,
  DEPOT,
  fakeAgent,
  json,
  NORTHWIND,
  PERSONAL,
  record,
  render,
  SPACES,
  setup,
  TRUCK,
  tab,
  teardown,
  transcript,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const said = (
  id: string,
  role: 'user' | 'assistant',
  minutesAgo = 1
): Extract<TranscriptMessage, { role: 'user' | 'assistant' | 'system' }> => ({
  id,
  role,
  content: `${role} ${id}`,
  at: at(minutesAgo),
})
const ayniWith = (space?: { id: string; title: string; kind: string }) =>
  ({
    contextualMenu: { items: [] },
    pendingApprovals: 0,
    generating: [],
    principal: null,
    ...(space ? { space } : {}),
  }) as never

async function conversation(options: {
  messages?: TranscriptMessage[]
  spaceId?: string
  space?: { id: string; title: string; kind: string }
  spaces?: typeof SPACES
  shared?: boolean
}) {
  const s1 = record({
    sessionId: 's1',
    title: 'Caliper check',
    spaceId: options.spaceId ?? PERSONAL.id,
    ayni: ayniWith(options.space),
    shared: options.shared,
  })
  const hub = await tab({
    sessions: [s1],
    transcripts: [transcript('s1', options.messages ?? [])],
    spaces: options.spaces ?? SPACES,
    snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true } },
  })
  const el = await render(hub, <Conversation />)
  return { hub, el }
}

describe('the chip of an empty conversation (UI-CONV-029)', () => {
  it('names the space and how long it keeps conversations, above the message form', async () => {
    const { el } = await conversation({})
    const line = el.querySelector('.space-chip-line')
    expect(line?.textContent).toBe('InPersonal· kept 365 days')
    // above the message form
    expect(line?.nextElementSibling?.classList.contains('composer-area')).toBe(true)
  })

  it('a conversation started from a space takes that space', async () => {
    const { el } = await conversation({ spaceId: TRUCK.id, space: { id: TRUCK.id, title: TRUCK.title, kind: 'team' } })
    expect(el.querySelector('.space-chip.lg')?.textContent).toBe('Truck 14 recall')
  })

  it('leaves at the first message, and no way to change the space remains', async () => {
    const { el } = await conversation({ messages: [said('u1', 'user')] })
    expect(el.querySelector('.space-chip-line')).toBeNull()
  })

  it('shows when the person may create a space, not with Personal alone and no template', async () => {
    const alone = await conversation({ spaces: { spaces: [PERSONAL], templates: [] } })
    expect(alone.el.querySelector('.space-chip-line')).toBeNull()
    teardown()
    const creator = await conversation({ spaces: { spaces: [PERSONAL], templates: SPACES.templates } })
    expect(creator.el.querySelector('.space-chip-line')).toBeTruthy()
  })

  it('opens the chooser: the spaces the person is active in, the current one marked, New space at the end', async () => {
    const left = { ...NORTHWIND, state: 'left' as const }
    const { el } = await conversation({ spaces: { ...SPACES, spaces: [PERSONAL, TRUCK, DEPOT, left] } })
    await click(el.querySelector('.space-chip.lg'))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getAttribute('aria-label')).toBe('Where does this conversation go?')
    const options = [...dialog.querySelectorAll('label.choice')]
    expect(options.map((o) => o.querySelector('b')?.textContent)).toEqual([
      'Personal',
      'Truck 14 recall',
      'Depot Rotterdam',
    ])
    expect(options[0].querySelector('input')?.checked).toBe(true)
    expect(options[1].querySelector('.muted')?.textContent).toBe(
      'Team space · 5 members · Models: kimi · kept 365 days'
    )
    expect(options[2].querySelector('.muted')?.textContent).toContain('By rule')
    const choices = [...dialog.querySelectorAll('.choice')]
    expect(choices[choices.length - 1].textContent).toContain('New space')
  })

  it('choosing a space changes the conversation space through the profile', async () => {
    const agent = fakeAgent([['PATCH /conversations/conv_s1', () => new Response(null, { status: 204 })]])
    const { hub, el } = await conversation({})
    await click(el.querySelector('.space-chip.lg'))
    await click(byText(document.body, 'label.choice', /Depot Rotterdam/)?.querySelector('input'))
    await until(() => hub.getSnapshot().sessions[0].spaceId === DEPOT.id)
    expect(agent.find('PATCH', '/conversations/conv_s1')[0].body).toEqual({ spaceId: DEPOT.id })
    expect(hub.getSnapshot().notice?.text).toBe('This conversation now goes to Depot Rotterdam.')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('says so when the conversation already has a message', async () => {
    fakeAgent([['PATCH /conversations/conv_s1', () => json({ error: 'has-messages' }, 409)]])
    const { el } = await conversation({})
    await click(el.querySelector('.space-chip.lg'))
    await click(byText(document.body, 'label.choice', /Truck 14 recall/)?.querySelector('input'))
    await until(() => !!document.querySelector('[role="dialog"] .banner'))
    expect(document.querySelector('[role="dialog"] .banner')?.textContent).toBe(
      'This conversation already has a message: its space stays as it is.'
    )
  })

  it('a new conversation from a space page starts in that space; from the card, in Personal', async () => {
    const agent = fakeAgent([
      ['POST ', () => json({ sessionId: 's9', sessionToken: 't9', state: 'bound', conversationId: 'conv_9' })],
    ])
    const { hub } = await conversation({ messages: [said('u1', 'user')] })
    await hub.newConversation(AGENT, undefined, TRUCK.id)
    await hub.newConversation(AGENT)
    const creates = agent.find('POST', '')
    expect(creates[0].body).toMatchObject({ newConversation: true, spaceId: TRUCK.id })
    expect(creates[1].body).toMatchObject({ newConversation: true })
    expect(creates[1].body).not.toHaveProperty('spaceId')
    expect(hub.getSnapshot().sessions.find((s) => s.sessionId === 's9')?.spaceId).toBe(PERSONAL.id)
  })
})

describe('the space in the header (UI-CONV-030)', () => {
  it('a grey chip with the kind icon and the title of `state.ayni.space`, which opens the space page', async () => {
    const { hub, el } = await conversation({
      messages: [said('u1', 'user')],
      spaceId: TRUCK.id,
      space: { id: TRUCK.id, title: 'Truck 14 recall', kind: 'team' },
    })
    const chip = el.querySelector('.conv-sub .space-chip') as HTMLElement
    expect(chip.textContent).toBe('Truck 14 recall')
    expect(chip.querySelector('svg')).toBeTruthy()
    // grey: neither the colour of unread nor of a request
    expect(chip.className).toBe('space-chip')
    await click(chip)
    expect(hub.getSnapshot()).toMatchObject({ view: 'space', spaceFor: { agentDid: AGENT, spaceId: TRUCK.id } })
  })

  it('names Personal only once the person has another space', async () => {
    const personal = { id: PERSONAL.id, title: 'Personal', kind: 'personal' }
    const alone = await conversation({ space: personal, spaces: { spaces: [PERSONAL], templates: [] } })
    expect(alone.el.querySelector('.conv-sub .space-chip')).toBeNull()
    teardown()
    const joined = await conversation({ space: personal })
    expect(joined.el.querySelector('.conv-sub .space-chip')?.textContent).toBe('Personal')
  })

  it('a shared conversation says so in its header (UI-CONV-038)', async () => {
    const { el } = await conversation({
      spaceId: TRUCK.id,
      space: { id: TRUCK.id, title: TRUCK.title, kind: 'team' },
      shared: true,
      messages: [said('u1', 'user')],
    })
    expect(el.querySelector('.conv-sub .shared-tag')?.textContent).toBe('Shared with Truck 14 recall')
  })
})

describe('a space the person left (UI-CONV-043, PROF-RUN-014)', () => {
  const leftSpaces = { ...SPACES, spaces: [PERSONAL, { ...TRUCK, state: 'left' as const }, DEPOT] }

  it('replaces the message form by "You are no longer in <space>"', async () => {
    const { el } = await conversation({
      spaceId: TRUCK.id,
      space: { id: TRUCK.id, title: TRUCK.title, kind: 'team' },
      spaces: leftSpaces,
      messages: [said('u1', 'user'), said('a1', 'assistant')],
    })
    expect(el.querySelector('.left-line')?.textContent).toBe('You are no longer in Truck 14 recall')
    expect(el.querySelector('.composer')).toBeNull()
    // the transcript stays readable
    expect(el.querySelectorAll('.row')).toHaveLength(2)
  })

  it('a message the agent refuses with 409 space-left leaves the transcript, and the person is told', async () => {
    fakeAgent([
      ['POST /s1/runs', () => json({ error: 'space-left' }, 409)],
      ['GET /spaces', () => json(leftSpaces)],
    ])
    const { hub, el } = await conversation({ spaceId: TRUCK.id, messages: [said('u1', 'user')] })
    const error = await hub.send('s1', 'Anything new?').catch((e) => e)
    expect(error.message).toBe('You are no longer in Truck 14 recall: this conversation is read-only.')
    await until(() => el.querySelector('.left-line') !== null)
    expect(hub.getSnapshot().transcripts.s1.messages.map((m) => m.id)).toEqual(['u1'])
  })
})

describe('the line "<agent> updated a memory" (UI-CONV-035)', () => {
  const line: TranscriptMessage = {
    id: 'ent_1',
    role: 'activity',
    activityType: 'ayni.memory-update',
    content: { memoryId: 'mem_1', spaceId: TRUCK.id, action: 'changed' },
    at: at(1),
    entryId: 'ent_1',
  }

  it('shows after the reply of its turn, and opens the memory', async () => {
    // live, the change can come before the reply's text
    const { hub, el } = await conversation({
      messages: [
        said('u1', 'user', 2),
        line,
        { ...said('a1', 'assistant', 1), usedMemories: ['mem_1'], usedPreferences: [] },
      ],
    })
    const children = [...(el.querySelector('.transcript')?.children ?? [])]
    const reply = children.findIndex((c) => c.textContent?.includes('assistant a1'))
    const memory = children.findIndex((c) => c.classList.contains('memory-line'))
    expect(memory).toBe(reply + 1)
    expect(el.querySelector('.memory-line')?.textContent).toBe('Fleet support updated a memory')
    await click(el.querySelector('.memory-line button'))
    expect(hub.getSnapshot().memoryFor).toEqual({ agentDid: AGENT, memoryId: 'mem_1', spaceId: TRUCK.id })
  })

  it('nothing about memories shows under a reply that used some (UI-CONV-034)', async () => {
    const { el } = await conversation({
      messages: [
        said('u1', 'user', 2),
        { ...said('a1', 'assistant', 1), usedMemories: ['mem_1'], usedPreferences: ['style'] },
      ],
    })
    expect(el.querySelector('.memory-line')).toBeNull()
    expect(el.querySelector('.transcript')?.textContent).not.toMatch(/memor/i)
  })
})
