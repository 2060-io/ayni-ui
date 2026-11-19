/**
 * The person's memories and preferences (UI-CONV-032..034): the sheet of a memory and of a preference, with Delete and
 * no edit field; the page "What <agent> keeps about you" and its three entry points; and a reply's Info listing the
 * memories and preferences it used, read from history for a reply received live.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ConversationRow } from '../src/components/Column.js'
import { MessageInfo } from '../src/components/Details.js'
import { KeepsPage } from '../src/components/Keeps.js'
import { MemorySheet } from '../src/components/Memories.js'
import { ProofOfTrust } from '../src/components/ProofOfTrust.js'
import {
  AGENT,
  agentRecord,
  byText,
  click,
  fakeAgent,
  json,
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

const MEMORIES = {
  preferences: [
    { key: 'answer style', value: 'Answer in short, numbered steps', updatedAt: '2026-11-14T00:00:00Z' },
    { key: 'language', value: 'Answer in English', updatedAt: '2026-11-10T00:00:00Z' },
  ],
  memories: [
    {
      id: 'mem_a',
      spaceId: TRUCK.id,
      content: "Recall sign-offs need the depot lead's confirmation before 18:00.",
      createdAt: '2026-11-18T10:47:00Z',
      updatedAt: '2026-11-18T10:47:00Z',
      source: { conversationId: 'conv_s3', title: 'Caliper check' },
    },
    {
      id: 'mem_b',
      spaceId: TRUCK.id,
      content: 'You check the front calipers of the recall trucks at the Rotterdam depot.',
      createdAt: '2026-11-18T10:40:00Z',
      updatedAt: '2026-11-18T10:40:00Z',
    },
  ],
}
const sessions = [
  record({ sessionId: 's3', title: 'Caliper check', spaceId: TRUCK.id }),
  record({ sessionId: 's1', title: 'Overtime for November', spaceId: PERSONAL.id }),
]

describe('the sheet of a memory (UI-CONV-032)', () => {
  it('says what it says, its space, when the agent wrote it, where it came from, how to change it', async () => {
    fakeAgent([[`GET /memories?spaceId=${TRUCK.id}`, () => json(MEMORIES)]])
    const hub = await tab({
      sessions,
      spaces: SPACES,
      snapshot: { memoryFor: { agentDid: AGENT, memoryId: 'mem_a', spaceId: TRUCK.id } },
    })
    await render(hub, <MemorySheet />)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await until(() => !!dialog.querySelector('.memory-field'))
    expect(dialog.getAttribute('aria-label')).toBe('A memory of yours')
    expect(dialog.querySelector('.dialog-sub')?.textContent).toMatch(
      /^Truck 14 recall · written by Fleet support .+ · only you see it$/
    )
    expect(dialog.querySelector('.memory-field')?.textContent).toBe(MEMORIES.memories[0].content)
    expect(dialog.querySelector('.callout')?.textContent).toBe(
      'To change it, tell Fleet support in a conversation of Truck 14 recall'
    )
    // no field edits it
    expect(dialog.querySelector('input, textarea, [contenteditable]')).toBeNull()
    // the conversation it came from, a link while the person can read it
    await click(byText(dialog, 'button.link', 'From Caliper check'))
    expect(hub.getSnapshot()).toMatchObject({ view: 'conversation', selectedSessionId: 's3', memoryFor: null })
  })

  it('Delete deletes it through the profile and closes the sheet', async () => {
    const agent = fakeAgent([
      [`GET /memories?spaceId=${TRUCK.id}`, () => json(MEMORIES)],
      ['DELETE /memories/mem_a', () => new Response(null, { status: 204 })],
    ])
    const hub = await tab({
      sessions,
      spaces: SPACES,
      snapshot: { memoryFor: { agentDid: AGENT, memoryId: 'mem_a', spaceId: TRUCK.id } },
    })
    await render(hub, <MemorySheet />)
    await until(() => !!byText(document.body, 'button', 'Delete'))
    await click(byText(document.body, 'button', 'Delete'))
    await until(() => hub.getSnapshot().memoryFor === null)
    expect(agent.find('DELETE', '/memories/mem_a')).toHaveLength(1)
    expect(hub.getSnapshot().memoriesVersion).toBe(1)
    expect(hub.getSnapshot().notice?.text).toBe('Deleted.')
  })

  it('a preference says to tell the agent in any conversation, and Delete takes its name', async () => {
    const agent = fakeAgent([
      ['GET /memories', () => json(MEMORIES)],
      ['DELETE /preferences/answer%20style', () => new Response(null, { status: 204 })],
    ])
    const hub = await tab({
      sessions,
      spaces: SPACES,
      snapshot: { memoryFor: { agentDid: AGENT, preferenceKey: 'answer style' } },
    })
    await render(hub, <MemorySheet />)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await until(() => !!dialog.querySelector('.memory-field'))
    expect(dialog.getAttribute('aria-label')).toBe('A preference of yours')
    expect(dialog.querySelector('.callout')?.textContent).toBe('To change it, tell Fleet support in any conversation')
    expect(dialog.querySelector('input, textarea')).toBeNull()
    await click(byText(dialog, 'button', 'Delete'))
    await until(() => agent.find('DELETE', '/preferences/answer%20style').length === 1)
  })

  it('a memory no longer kept says so', async () => {
    fakeAgent([['GET /memories', () => json(MEMORIES)]])
    const hub = await tab({
      sessions,
      spaces: SPACES,
      snapshot: { memoryFor: { agentDid: AGENT, memoryId: 'mem_gone' } },
    })
    await render(hub, <MemorySheet />)
    await until(() => document.body.textContent?.includes('This memory is no longer kept.') ?? false)
    expect(byText(document.body, 'button', 'Delete')).toBeUndefined()
  })
})

describe('what the agent keeps about the person (UI-CONV-033)', () => {
  const ABOUT = {
    preferences: MEMORIES.preferences,
    memoriesBySpace: [
      { spaceId: PERSONAL.id, title: 'Personal', count: 4 },
      { spaceId: TRUCK.id, title: 'Truck 14 recall', count: 2 },
    ],
    conversations: [
      { spaceId: PERSONAL.id, title: 'Personal', count: 6, retentionDays: 90 },
      { spaceId: TRUCK.id, title: 'Truck 14 recall', count: 3, retentionDays: 365 },
    ],
    verified: [
      {
        label: 'Employee badge',
        source: 'Northwind Logistics',
        verifiedAt: '2026-11-03T10:00:00Z',
        expiresAt: '2027-11-03T10:00:00Z',
      },
    ],
  }

  it('shows the preferences, the memories by space, the conversations and what the agent verified, in this order', async () => {
    fakeAgent([
      ['GET /about-me', () => json(ABOUT)],
      [`GET /memories?spaceId=${TRUCK.id}`, () => json(MEMORIES)],
    ])
    const hub = await tab({ sessions, spaces: SPACES, snapshot: { view: 'keeps', keepsFor: AGENT } })
    const el = await render(hub, <KeepsPage />)
    await until(() => !!el.querySelector('.keeps-row'))
    expect(el.querySelector('h1')?.textContent).toBe('What Fleet support keeps about you')
    expect([...el.querySelectorAll('.section-label')].map((s) => s.textContent?.trim())).toEqual([
      'Your preferences',
      'Your memories, by space',
      'Conversations',
      'What it verified about you',
    ])
    const text = el.textContent ?? ''
    expect(text).toContain('Answer in short, numbered steps')
    expect(text).toContain('Used in every space')
    expect(text).toContain('Personal (4)')
    expect(text).toContain('Truck 14 recall (2)')
    expect(text).toContain('Personal · 6')
    expect(text).toContain('Kept 90 days')
    expect(text).toContain('Truck 14 recall · 3')
    expect(text).toContain('Kept 365 days')
    // read-only: nothing to press in what it verified
    const verified = el.querySelector('.box.verified') as HTMLElement
    expect(verified.textContent).toMatch(/^Employee badgeFrom Northwind Logistics, .+ · Kept until .+$/)
    expect(verified.querySelector('button')).toBeNull()
    // a space opens the list of its memories
    await click(byText(el, '.keeps-row', /Truck 14 recall \(2\)/))
    await until(() => el.querySelectorAll('.memory-item').length === 2)
    // a preference opens its sheet
    await click(byText(el, '.keeps-row', /Answer in short/))
    expect(hub.getSnapshot().memoryFor).toEqual({ agentDid: AGENT, preferenceKey: 'answer style' })
  })

  it('reads the page again once a preference is deleted there', async () => {
    let reads = 0
    fakeAgent([
      [
        'GET /about-me',
        () => {
          reads++
          return json(ABOUT)
        },
      ],
    ])
    const hub = await tab({ sessions, spaces: SPACES, snapshot: { view: 'keeps', keepsFor: AGENT } })
    await render(hub, <KeepsPage />)
    await until(() => reads === 1)
    // @ts-expect-error private: a deletion moves the version every list of memories follows
    hub.set({ memoriesVersion: 1 })
    await until(() => reads === 2)
  })

  it('opens from the conversation menu', async () => {
    const hub = await tab({ sessions, spaces: SPACES })
    const el = await render(hub, <ConversationRow session={sessions[0]} selected={false} />)
    await click(el.querySelector('[aria-label="Agent options"]'))
    await click(byText(el, '[role="menuitem"]', 'What Fleet support keeps about you'))
    expect(hub.getSnapshot()).toMatchObject({ view: 'keeps', keepsFor: AGENT })
  })

  it("opens from the agent's trust card", async () => {
    fakeAgent([])
    const hub = await tab({ sessions, spaces: SPACES })
    const el = await render(hub, <ProofOfTrust agent={agentRecord() as never} onClose={() => undefined} />)
    const entry = el.querySelector('.pot-keeps') as HTMLElement
    expect(entry.textContent).toBe('What Fleet support keeps about you')
    await click(entry)
    expect(hub.getSnapshot()).toMatchObject({ view: 'keeps', keepsFor: AGENT })
  })
})

describe('the memories a reply used, in its Info (UI-CONV-034)', () => {
  const reply = (over: object = {}) => ({
    id: 'msg_a1',
    role: 'assistant' as const,
    content: 'Check both front calipers.',
    at: '2026-11-18T10:41:00Z',
    ...over,
  })

  async function info(message: ReturnType<typeof reply>) {
    const hub = await tab({
      sessions: [
        record({
          sessionId: 's3',
          spaceId: TRUCK.id,
          ayni: { space: { id: TRUCK.id, title: TRUCK.title, kind: 'team' } } as never,
        }),
      ],
      transcripts: [transcript('s3', [message])],
      spaces: SPACES,
      snapshot: { selectedSessionId: 's3', inspect: { sessionId: 's3', messageId: 'msg_a1' } },
    })
    const el = await render(hub, <MessageInfo />)
    return { hub, el }
  }

  it('lists them by space, with the preference, a memory deleted since as no longer kept', async () => {
    fakeAgent([['GET /memories', () => json(MEMORIES)]])
    const { hub, el } = await info(reply({ usedMemories: ['mem_a', 'mem_deleted'], usedPreferences: ['answer style'] }))
    await until(() => !!el.querySelector('.used-item') && !el.textContent?.includes('…'))
    expect(el.querySelector('.used-memories h3')?.textContent).toBe('Memories it used')
    expect(el.querySelector('.used-line')?.textContent).toBe('2 memories of yours in Truck 14 recall · 1 preference')
    expect([...el.querySelectorAll('.used-item')].map((i) => i.textContent)).toEqual([
      MEMORIES.memories[0].content,
      'No longer kept',
      'Answer in short, numbered steps',
    ])
    await click(el.querySelector('.used-item'))
    expect(hub.getSnapshot().memoryFor).toEqual({ agentDid: AGENT, memoryId: 'mem_a', spaceId: TRUCK.id })
  })

  it('says none were used when history says so', async () => {
    fakeAgent([])
    const { el } = await info(reply({ usedMemories: [], usedPreferences: [] }))
    expect(el.querySelector('.used-memories')?.textContent).toContain('No memory or preference of yours.')
  })

  it('for a reply received live, reads history first', async () => {
    const agent = fakeAgent([
      [
        /^GET \/s3\/messages/,
        () =>
          json({
            messages: [
              {
                id: 'msg_a1',
                role: 'assistant',
                content: 'Check both front calipers.',
                metadata: { createdAt: '2026-11-18T10:41:00Z', usedMemories: ['mem_b'], usedPreferences: [] },
              },
            ],
            nextBefore: null,
          }),
      ],
      ['GET /memories', () => json(MEMORIES)],
    ])
    const { el } = await info(reply())
    await until(() => el.querySelector('.used-line')?.textContent === '1 memory of yours in Truck 14 recall')
    expect(agent.calls.some((c) => c.url.includes('/s3/messages'))).toBe(true)
    expect(el.querySelector('.used-item')?.textContent).toBe(MEMORIES.memories[1].content)
  })

  it('claims nothing for a reply history says nothing about', async () => {
    const agent = fakeAgent([
      [
        /^GET \/s3\/messages/,
        () => json({ messages: [{ id: 'msg_a1', role: 'assistant', content: 'x', metadata: {} }], nextBefore: null }),
      ],
    ])
    const { el } = await info(reply())
    await until(() => agent.calls.length > 0 && !el.textContent?.includes('Reading what this reply used'))
    expect(el.querySelector('.used-memories')).toBeNull()
    expect(el.textContent).not.toMatch(/memor/i)
  })
})
