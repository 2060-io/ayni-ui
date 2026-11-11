import { describe, expect, it } from 'vitest'
import { catchUp, emptyTranscript, type HistoryPage, readCatchUp, reduce } from '../src/index.js'
import type { SessionRecord, Transcript } from '../src/types.js'

const session = (): SessionRecord => ({
  sessionId: 's1',
  agentDid: 'did:x',
  sessionToken: 't',
  title: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  state: 'bound',
  lastEventId: 0,
  unreadCount: 0,
  lastPreview: '',
  lastMessageAt: '',
  draft: '',
  ayni: null,
})
const at = (n: number) => `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`
const message = (n: number, role: 'user' | 'assistant' = n % 2 ? 'user' : 'assistant') => ({
  id: `m${n}`,
  role,
  content: `message ${n}`,
  metadata: { createdAt: at(n) },
})
const held = (from: number, to: number, over: Partial<Transcript> = {}): Transcript => ({
  ...emptyTranscript('s1'),
  messages: Array.from({ length: to - from + 1 }, (_, i) => {
    const m = message(from + i)
    return { id: m.id, role: m.role, content: m.content, at: m.metadata.createdAt }
  }),
  ...over,
})
const page = (from: number, to: number, nextBefore: string | null): HistoryPage => ({
  messages: Array.from({ length: to - from + 1 }, (_, i) => message(from + i)),
  nextBefore,
})
const ids = (t: Transcript) => t.messages.map((m) => m.id)

describe('catching up from history (UI-CONV-022, PROF-HIST-007)', () => {
  it('adds what another device said while this one was away, and keeps its own paging position', () => {
    const transcript = held(5, 8, { oldestLoadedId: 'm5', complete: false })
    const merged = catchUp(transcript, [page(7, 10, 'm7')])
    expect(ids(merged)).toEqual(['m5', 'm6', 'm7', 'm8', 'm9', 'm10'])
    expect(merged.oldestLoadedId).toBe('m5')
    expect(merged.complete).toBe(false)
  })

  it('changes nothing when nothing was missed', () => {
    const transcript = held(5, 8, { oldestLoadedId: 'm5' })
    expect(ids(catchUp(transcript, [page(7, 8, 'm7')]))).toEqual(ids(transcript))
  })

  it('reads further back until a page reaches what is held', async () => {
    const transcript = held(1, 3, { oldestLoadedId: null, complete: true })
    const asked: (string | undefined)[] = []
    const pages: Record<string, HistoryPage> = { latest: page(8, 10, 'm8'), m8: page(5, 7, 'm5'), m5: page(2, 4, 'm2') }
    const merged = await readCatchUp(transcript, async (before) => {
      asked.push(before)
      return pages[before ?? 'latest'] as HistoryPage
    })
    expect(asked).toEqual([undefined, 'm8', 'm5'])
    expect(ids(merged)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'])
    expect(merged.complete).toBe(true)
  })

  it('starts over from what it read when more was missed than it reads: no hole in the transcript', async () => {
    const transcript = held(1, 3, { oldestLoadedId: null, complete: true })
    const merged = await readCatchUp(
      transcript,
      async (before) => (before ? page(40, 44, 'm40') : page(45, 50, 'm45')),
      2
    )
    expect(ids(merged)).toEqual(['m40', 'm41', 'm42', 'm43', 'm44', 'm45', 'm46', 'm47', 'm48', 'm49', 'm50'])
    // older messages load from where the pages stopped
    expect(merged.oldestLoadedId).toBe('m40')
    expect(merged.complete).toBe(false)
  })

  it('reads one page for a transcript that holds nothing', async () => {
    let reads = 0
    const merged = await readCatchUp(emptyTranscript('s1'), async () => {
      reads++
      return page(1, 3, null)
    })
    expect(reads).toBe(1)
    expect(ids(merged)).toEqual(['m1', 'm2', 'm3'])
    expect(merged.complete).toBe(true)
  })

  it('knows a message this device sent under the id it gave it', () => {
    const transcript: Transcript = {
      ...emptyTranscript('s1'),
      messages: [{ id: 'u_local', role: 'user', content: 'hello', at: at(1) }],
    }
    const merged = catchUp(transcript, [
      {
        messages: [
          { id: 'm1', role: 'user', content: 'hello', metadata: { createdAt: at(1), externalId: 'u_local' } },
          { id: 'm2', role: 'assistant', content: 'hi', metadata: { createdAt: at(2) } },
        ],
        nextBefore: 'm1',
      },
    ])
    expect(ids(merged)).toEqual(['m1', 'm2'])
  })
})

describe('a message from another device (PROF-STREAM-005)', () => {
  it("lands on the person's side, and a replay of it after a reconnect leaves it where it is", () => {
    let t = held(1, 2)
    const s = session()
    const feed = (event: Record<string, unknown> & { type: string }) => {
      t = reduce(t, s, event, false, true).transcript
    }
    feed({ type: 'RUN_STARTED', runId: 'r9' })
    feed({ type: 'TEXT_MESSAGE_START', messageId: 'm3', role: 'user' })
    feed({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm3', delta: 'typed on the laptop' })
    feed({ type: 'TEXT_MESSAGE_END', messageId: 'm3' })
    const first = t.messages.find((m) => m.id === 'm3')
    expect(first).toMatchObject({ role: 'user', content: 'typed on the laptop', streaming: false })
    // the stream replays the same message later: one message still, at the same time
    feed({ type: 'TEXT_MESSAGE_START', messageId: 'm3', role: 'user' })
    feed({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm3', delta: 'typed on the laptop' })
    feed({ type: 'TEXT_MESSAGE_END', messageId: 'm3' })
    expect(t.messages.filter((m) => m.id === 'm3')).toHaveLength(1)
    expect(t.messages.find((m) => m.id === 'm3')?.at).toBe(first?.at)
    expect(t.messages.find((m) => m.id === 'm3')?.content).toBe('typed on the laptop')
  })
})

describe('the list of conversations changed elsewhere (PROF-CONV-008)', () => {
  it('tells the client to read the list again, and leaves the transcript alone', () => {
    const t = held(1, 2)
    const out = reduce(
      t,
      session(),
      { type: 'CUSTOM', name: 'ayni.conversation.changed', value: { conversationId: 'c1', title: 'Renamed' } },
      false,
      true
    )
    expect(out.signals).toEqual(['conversations'])
    expect(out.transcript).toBe(t)
  })
})
