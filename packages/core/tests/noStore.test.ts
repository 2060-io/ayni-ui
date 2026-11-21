/**
 * Every call to an agent goes with the fetch cache mode `no-store` (UI-SESS-020, profile PROF-ERR-003). Found by
 * Fabrice on devnet, 2026-11-21: Chrome had stored one `410` of `GET {sessions}/conversations`, which carried no
 * `Cache-Control`, and answered the list of every later session with it, whatever the token, without asking the agent;
 * the spaces, read after the list, never showed.
 */
import { describe, expect, it } from 'vitest'
import { ProfileClient } from '../src/profileClient.js'
import { discoverAgent } from '../src/trust.js'

const SESSIONS = 'http://agent.test/agui/v3/sessions'

/** The arguments of the methods that take more than strings; every other method gets strings. */
const ARGS: Record<string, unknown[]> = {
  revokeDevice: ['dev_1', { token: 't' }],
  stream: ['ses_1', 't', undefined, () => undefined, new AbortController().signal],
  run: ['ses_1', 't', { runId: 'run_1', text: 'hi' }, () => undefined, new AbortController().signal],
  upload: ['ses_1', 't', new Blob(['x'], { type: 'audio/mp4' }), 'x.m4a'],
}
/** The helpers every call goes through: not called on their own. */
const HELPERS = ['constructor', 'url', 'headers', 'getJson', 'send', 'sendFor', 'toolChange']

describe('every call to an agent goes with the cache mode no-store (UI-SESS-020)', () => {
  it('sends each call of ProfileClient, every method of it, with cache: no-store', async () => {
    const calls: { method: string; url: string; cache: RequestCache | undefined }[] = []
    let current = ''
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: current, url: String(input), cache: init?.cache })
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const client = new ProfileClient(SESSIONS, fetchFn as typeof fetch)
    const methods = Object.getOwnPropertyNames(ProfileClient.prototype).filter((name) => !HELPERS.includes(name))
    // a method added later is covered with no change here
    expect(methods.length).toBeGreaterThan(40)
    for (const name of methods) {
      current = name
      const call = (client as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name]
      // an answer of `{}` does not read as some answers: only the request matters here
      await call?.apply(client, ARGS[name] ?? ['x', 'x', 'x', 'x']).catch(() => undefined)
    }
    expect(methods.filter((name) => !calls.some((c) => c.method === name))).toEqual([])
    expect(calls.filter((c) => c.cache !== 'no-store')).toEqual([])
  })

  it("keeps the caller's own init, the method, the headers, the body and the signal", async () => {
    const inits: RequestInit[] = []
    const fetchFn = async (_input: RequestInfo | URL, init?: RequestInit) => {
      inits.push(init ?? {})
      return new Response(null, { status: 204 })
    }
    const signal = new AbortController().signal
    const client = new ProfileClient(SESSIONS, fetchFn as typeof fetch)
    await client.patchConversation('t', 'conv_1', { title: 'New title' })
    await client.stream('ses_1', 't', 7, () => undefined, signal)
    expect(inits[0]).toMatchObject({ method: 'PATCH', body: '{"title":"New title"}', cache: 'no-store' })
    expect(new Headers(inits[0]?.headers).get('authorization')).toBe('Bearer t')
    expect(inits[1]).toMatchObject({ signal, cache: 'no-store' })
    expect(new Headers(inits[1]?.headers).get('last-event-id')).toBe('7')
  })

  it('reads the descriptor with cache: no-store', async () => {
    const inits: { url: string; cache: RequestCache | undefined }[] = []
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      inits.push({ url: String(input), cache: init?.cache })
      return new Response(
        JSON.stringify({ profileVersion: '3.4', did: 'did:webvh:agent', sessions: SESSIONS, features: {} }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    await discoverAgent('https://agent.test', 'https://idx.test', fetchFn as typeof fetch)
    expect(inits).toEqual([{ url: 'https://agent.test/.well-known/ayni-agent.json', cache: 'no-store' }])
  })
})
