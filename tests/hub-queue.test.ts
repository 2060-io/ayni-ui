/**
 * Sending while the agent answers (UI-CONV-025, PROF-RUN-011/012/013). Against an agent that declares
 * `features.queue` a message sent during a run goes out at once and waits on the agent: the run in progress stays
 * the one shown, Stop ends that one, a waiting message can be withdrawn, and a run that gets no turn of its own
 * changes nothing on screen. Against any other agent, one run at a time. A fake agent holds each run's response
 * open until the test ends it.
 */
import { MemoryDeviceStore } from '@ayni.org/ayni-ui-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hub } from '../src/state/hub.js'

const config = {
  publicUrl: 'http://ui.test',
  singleAgent: false,
  trustPolicy: 'refuse' as const,
  trustRecheckIntervalSeconds: 600,
  veranaIndexerUrl: 'http://indexer.test',
  veranaGraphUrl: 'http://graph.test',
  allowedAgentOrigins: [],
  locales: ['en'],
  soundsEnabled: false,
  installPromptEnabled: false,
}
const SESSIONS = 'http://agent.test/agui/v3/sessions'
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 1))
}

/** An agent whose run responses the test writes to and closes. */
function fakeAgent() {
  const enc = new TextEncoder()
  const runs = new Map<string, { text: string; write(event: object): void; close(): void; aborted: boolean }>()
  const cancelled: string[] = []
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const cancel = /\/runs\/([^/]+)\/cancel$/.exec(url)
    if (cancel) {
      cancelled.push(cancel[1] as string)
      return new Response(null, { status: 202 })
    }
    if (url === `${SESSIONS}/s1/runs`) {
      const body = JSON.parse(String(init?.body)) as { runId: string; messages: { content: string }[] }
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      const run = {
        text: body.messages[0]?.content ?? '',
        write: (event: object) => controller?.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`)),
        close: () => controller?.close(),
        aborted: false,
      }
      init?.signal?.addEventListener('abort', () => {
        run.aborted = true
        try {
          controller?.close()
        } catch {
          // closed already
        }
      })
      runs.set(body.runId, run)
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const byText = (text: string) => {
    const found = [...runs.entries()].find(([, r]) => r.text === text)
    if (!found) throw new Error(`no run for "${text}"`)
    // the run itself, not a copy: the test reads what happens to it later
    return Object.assign(found[1], { runId: found[0] })
  }
  return { fetchFn, runs, cancelled, byText }
}

async function setup(features: Record<string, unknown>) {
  const agent = fakeAgent()
  vi.stubGlobal('fetch', agent.fetchFn)
  const hub = new Hub(config, { appName: 'Ayni' })
  const store = new MemoryDeviceStore()
  // @ts-expect-error private
  hub.store = store
  await store.putAgent({
    did: 'did:x',
    descriptorUrl: 'http://agent.test/agui',
    descriptor: { did: 'did:x', name: 'Agent', profileVersion: '3.1', sessions: SESSIONS, features } as never,
    name: 'Agent',
    trust: { result: 'trusted', checkedAt: '', did: 'did:x', reasons: [] } as never,
    pinned: true,
    pinOrder: 1,
    addedAt: '',
    lastMessageAt: '',
  })
  await store.putSession({
    sessionId: 's1',
    agentDid: 'did:x',
    sessionToken: 't1',
    title: 'Talk',
    createdAt: '2026-01-01T00:00:00.000Z',
    state: 'bound',
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: '',
    lastMessageAt: '2026-01-01T00:00:01.000Z',
    draft: '',
    ayni: null,
    conversationId: 'conv1',
  })
  await hub.reload()
  // @ts-expect-error private: this tab leads the session, so a send runs here
  hub.snapshot = { ...hub.getSnapshot(), leaders: { s1: true }, online: true }
  const transcript = () => hub.getSnapshot().transcripts.s1
  const said = () =>
    (transcript()?.messages ?? []).map((m) => (m.role === 'activity' ? m.activityType : `${m.role}:${m.content}`))
  return { agent, hub, store, transcript, said }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sending while the agent answers', () => {
  it('sends at once, keeps the run in progress as the one shown, and shows nothing of a run merged into another', async () => {
    const { agent, hub, transcript, said } = await setup({ queue: true })
    const first = hub.send('s1', 'first')
    await settle()
    const one = agent.byText('first')
    one.write({ type: 'RUN_STARTED', threadId: 's1', runId: one.runId })
    one.write({ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' })
    one.write({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Answering the first' })
    await settle()
    expect(hub.isRunning('s1')).toBe(true)

    // two more while it answers: both go out, both show, and the run shown is still the first
    const second = hub.send('s1', 'second')
    const third = hub.send('s1', 'third')
    await settle()
    expect(agent.runs.size).toBe(3)
    expect(said()).toEqual(['user:first', 'assistant:Answering the first', 'user:second', 'user:third'])
    expect(transcript()?.run?.runId).toBe(one.runId)

    // the first reply ends
    one.write({ type: 'TEXT_MESSAGE_END', messageId: 'm1' })
    one.write({ type: 'RUN_FINISHED', threadId: 's1', runId: one.runId })
    one.close()
    await first
    // the agent takes what waited together: the third's run carries the turn, the second's is merged into it
    const two = agent.byText('second')
    const three = agent.byText('third')
    three.write({ type: 'RUN_STARTED', threadId: 's1', runId: three.runId })
    three.write({ type: 'TEXT_MESSAGE_START', messageId: 'm2', role: 'assistant' })
    three.write({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm2', delta: 'Both' })
    await settle()
    expect(transcript()?.run?.runId).toBe(three.runId)
    // the merged run's events arrive after: the run shown must not move nor end
    two.write({ type: 'RUN_STARTED', threadId: 's1', runId: two.runId, noTurn: 'merged', mergedInto: three.runId })
    two.write({
      type: 'RUN_FINISHED',
      threadId: 's1',
      runId: two.runId,
      outcome: { type: 'merged', runId: three.runId },
    })
    two.close()
    await second
    await settle()
    expect(transcript()?.run?.runId).toBe(three.runId)
    expect(hub.isRunning('s1')).toBe(true)

    three.write({ type: 'TEXT_MESSAGE_END', messageId: 'm2' })
    three.write({ type: 'RUN_FINISHED', threadId: 's1', runId: three.runId })
    three.close()
    await third
    await settle()
    expect(hub.isRunning('s1')).toBe(false)
    expect(said()).toEqual([
      'user:first',
      'assistant:Answering the first',
      'user:second',
      'user:third',
      'assistant:Both',
    ])
  })

  it('Stop ends the run in progress, not one that waits', async () => {
    const { agent, hub } = await setup({ queue: true })
    void hub.send('s1', 'first')
    await settle()
    const one = agent.byText('first')
    one.write({ type: 'RUN_STARTED', threadId: 's1', runId: one.runId })
    void hub.send('s1', 'second')
    await settle()
    await hub.stop('s1')
    await settle()
    expect(agent.cancelled).toEqual([one.runId])
    expect(one.aborted).toBe(true)
    expect(agent.byText('second').aborted).toBe(false)
  })

  it('withdraws a waiting message: its run is cancelled and the message leaves the transcript', async () => {
    const { agent, hub, said, transcript } = await setup({ queue: true })
    void hub.send('s1', 'first')
    await settle()
    const one = agent.byText('first')
    one.write({ type: 'RUN_STARTED', threadId: 's1', runId: one.runId })
    const second = hub.send('s1', 'not this one')
    await settle()
    const two = agent.byText('not this one')
    expect(said()).toEqual(['user:first', 'user:not this one'])

    await hub.withdraw('s1', two.runId)
    await second
    await settle()
    expect(agent.cancelled).toEqual([two.runId])
    expect(two.aborted).toBe(true)
    expect(said()).toEqual(['user:first'])
    // the run in progress goes on
    expect(transcript()?.run?.runId).toBe(one.runId)
    expect(one.aborted).toBe(false)
  })

  it('takes a message the agent refused out of the transcript and says why', async () => {
    const { agent, hub, said, transcript } = await setup({ queue: true })
    void hub.send('s1', 'first')
    await settle()
    const one = agent.byText('first')
    one.write({ type: 'RUN_STARTED', threadId: 's1', runId: one.runId })
    const second = hub.send('s1', 'one too many')
    await settle()
    const two = agent.byText('one too many')
    two.write({ type: 'RUN_STARTED', threadId: 's1', runId: two.runId, noTurn: 'refused' })
    two.write({ type: 'RUN_ERROR', message: 'too many', code: 'too-many-waiting' })
    two.close()
    await expect(second).rejects.toThrow()
    await settle()
    expect(said()).toEqual(['user:first'])
    expect(transcript()?.run?.runId).toBe(one.runId)
  })

  it('takes a waiting message whose response was lost out of the transcript: nothing will answer it', async () => {
    const { agent, hub, said, transcript } = await setup({ queue: true })
    void hub.send('s1', 'first')
    await settle()
    const one = agent.byText('first')
    one.write({ type: 'RUN_STARTED', threadId: 's1', runId: one.runId })
    const second = hub.send('s1', 'lost on the way')
    await settle()
    expect(said()).toEqual(['user:first', 'user:lost on the way'])
    // the response ends with no event: the agent withdrew the message when it closed
    agent.byText('lost on the way').close()
    await second
    await settle()
    expect(said()).toEqual(['user:first'])
    expect(transcript()?.run?.runId).toBe(one.runId)
  })

  it('against an agent that does not take it, allows one run at a time', async () => {
    const { agent, hub, said } = await setup({})
    void hub.send('s1', 'first')
    await settle()
    const one = agent.byText('first')
    one.write({ type: 'RUN_STARTED', threadId: 's1', runId: one.runId })
    await settle()
    expect(hub.takesQueue('s1')).toBe(false)
    await expect(hub.send('s1', 'second')).rejects.toThrow('a run is in progress')
    expect(agent.runs.size).toBe(1)
    expect(said()).toEqual(['user:first'])
  })
})
