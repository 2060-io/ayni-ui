/**
 * Sending while the agent answers (UI-CONV-025, PROF-RUN-011/012/013). Against an agent that declares
 * `features.queue` a message sent during a run goes out at once: the agent records it and its run ends with no
 * turn, which changes nothing of the run shown; Stop ends the run in progress, whoever started it. Against any
 * other agent, one run at a time. A fake agent holds each run's response open until the test ends it.
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
  /** A conversation with a reply in progress. */
  async function answering(features: Record<string, unknown> = { queue: true }) {
    const ctx = await setup(features)
    const first = ctx.hub.send('s1', 'first')
    await settle()
    const one = ctx.agent.byText('first')
    one.write({ type: 'RUN_STARTED', threadId: 's1', runId: one.runId })
    one.write({ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' })
    one.write({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Answering the first' })
    await settle()
    return { ...ctx, first, one }
  }
  /** What the agent answers to a message sent during a turn: recorded, waiting, no turn for this run. */
  const waits = (run: { runId: string; write(event: object): void; close(): void }, messageId: string) => {
    run.write({ type: 'RUN_STARTED', threadId: 's1', runId: run.runId, noTurn: 'waiting' })
    run.write({ type: 'RUN_FINISHED', threadId: 's1', runId: run.runId, outcome: { type: 'waiting', messageId } })
    run.close()
  }

  it('sends at once; the run that carried the message ends with no turn and changes nothing of the run shown', async () => {
    const { agent, hub, transcript, said, one, first } = await answering()
    expect(hub.isRunning('s1')).toBe(true)

    const second = hub.send('s1', 'second')
    await settle()
    expect(agent.runs.size).toBe(2)
    expect(said()).toEqual(['user:first', 'assistant:Answering the first', 'user:second'])
    expect(transcript()?.run?.runId).toBe(one.runId)

    // the agent recorded it: its run ends at once, and the reply in progress is still the run shown
    waits(agent.byText('second'), 'msg_2')
    await second
    await settle()
    expect(transcript()?.run?.runId).toBe(one.runId)
    expect(hub.isRunning('s1')).toBe(true)
    expect(said()).toEqual(['user:first', 'assistant:Answering the first', 'user:second'])
    // recorded on the agent: no longer a message whose sending may fail
    expect(transcript()?.messages.some((m) => m.role !== 'activity' && m.queued)).toBe(false)

    one.write({ type: 'TEXT_MESSAGE_END', messageId: 'm1' })
    one.write({ type: 'RUN_FINISHED', threadId: 's1', runId: one.runId })
    one.close()
    await first
    await settle()
    expect(hub.isRunning('s1')).toBe(false)
    expect(said()).toEqual(['user:first', 'assistant:Answering the first', 'user:second'])
  })

  it('Stop ends the run in progress', async () => {
    const { agent, hub, one } = await answering()
    const second = hub.send('s1', 'second')
    await settle()
    waits(agent.byText('second'), 'msg_2')
    await second
    await hub.stop('s1')
    await settle()
    expect(agent.cancelled).toEqual([one.runId])
    expect(one.aborted).toBe(true)
  })

  it('Stop reaches a run this tab did not start: the one the agent started for what waited', async () => {
    const { agent, hub, store } = await setup({ queue: true })
    // the agent's own run, shown from the session stream: no run of this tab behind it
    const shown = {
      sessionId: 's1',
      messages: [],
      oldestLoadedId: null,
      complete: true,
      run: { runId: 'run_agent', steps: [], log: [] },
      routed: {},
      reactions: {},
    }
    await store.putTranscript(shown)
    // @ts-expect-error private: the transcript on screen
    hub.snapshot = { ...hub.getSnapshot(), transcripts: { s1: shown } }
    expect(hub.isRunning('s1')).toBe(true)
    await hub.stop('s1')
    await settle()
    expect(agent.cancelled).toEqual(['run_agent'])
  })

  it('takes a message the agent refused out of the transcript and says why', async () => {
    const { agent, hub, said, transcript, one } = await answering()
    const second = hub.send('s1', 'one too many')
    await settle()
    const two = agent.byText('one too many')
    two.write({ type: 'RUN_STARTED', threadId: 's1', runId: two.runId, noTurn: 'refused' })
    two.write({ type: 'RUN_ERROR', message: 'too many', code: 'too-many-waiting' })
    two.close()
    await expect(second).rejects.toThrow()
    await settle()
    expect(said()).toEqual(['user:first', 'assistant:Answering the first'])
    expect(transcript()?.run?.runId).toBe(one.runId)
  })

  it('takes a message whose sending was lost out of the transcript: the agent never recorded it', async () => {
    const { agent, hub, said, transcript, one } = await answering()
    const second = hub.send('s1', 'lost on the way')
    await settle()
    expect(said()).toEqual(['user:first', 'assistant:Answering the first', 'user:lost on the way'])
    // the response ends with no event at all
    agent.byText('lost on the way').close()
    await second
    await settle()
    expect(said()).toEqual(['user:first', 'assistant:Answering the first'])
    expect(transcript()?.run?.runId).toBe(one.runId)
  })

  it('against an agent that does not take it, allows one run at a time', async () => {
    const { agent, hub, said } = await answering({})
    expect(hub.takesQueue('s1')).toBe(false)
    await expect(hub.send('s1', 'second')).rejects.toThrow('a run is in progress')
    expect(agent.runs.size).toBe(1)
    expect(said()).toEqual(['user:first', 'assistant:Answering the first'])
  })
})
