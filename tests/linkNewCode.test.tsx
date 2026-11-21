/**
 * Show a new code (UI-BIND-013), found by Fabrice on devnet on 2026-11-21. Since agent 0.28.1 the binding invitation
 * is a single-use invitation record, and the phone refuses an Out-of-Band invitation it received already ("This code
 * was already scanned. Show a new code in the browser and scan it.", app APP-SCAN-013). After a scan that did not
 * complete (cancelled on the phone, another code tapped, the sheet lost, the session's window ended) the browser kept
 * showing the code the phone refuses, and only a reload gave another one. The agent refreshes material only once it
 * expired (PROF-BIND-007) and tells the browser nothing of a link refused on the phone (the session stays
 * provisional, PROF-BIND-004).
 *
 * Now the link screen has Show a new code: the waiting session is ended on the agent and a new one takes its place,
 * with a new invitation and a new code, in place. A dead code is replaced by itself while the page is visible:
 * material that expired gets fresh material on the same session, a session that closed before the phone linked it
 * gets a new session.
 */
import { CUSTOM_EVENT } from '@ayni.org/ayni-agui-profile'
import { MemoryDeviceStore, type SessionRecord } from '@ayni.org/ayni-ui-core'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Conversation } from '../src/components/Conversation.js'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'
import type { Hub } from '../src/state/hub.js'
import {
  AGENT,
  agentRecord,
  byText,
  type Call,
  click,
  fakeAgent,
  json,
  record,
  render,
  SESSIONS,
  settle,
  setup,
  TRUCK,
  tab,
  teardown,
  until,
} from './spacesFixture.js'
import { css, rule } from './stylesheet.js'

beforeAll(setup)
afterEach(() => {
  setVisibility('visible')
  teardown()
})

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

type Material = NonNullable<SessionRecord['binding']>
const material = (code: string, expiresInMs = 300_000): Material => ({
  oobUrl: `https://agent.test/invite?oob=${code}`,
  walletLink: `https://app.ayni.org/app/connect?oob=${code}`,
  bindingCode: code,
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
})

/** The session of the link on screen: Fabrice scanned its code, and the phone did not link it. */
const LINK = 'ses_link1'
const SCANNED = material('EJ-3N')

/**
 * The agent as it is since 0.28.1: provisional sessions with single-use invitations, the codes it mints next in
 * order, material refreshed only once expired (`409` with the current material before), a closed session `410`.
 */
function linkAgent(first: Material = SCANNED) {
  const next = ['K7-2P', 'Q4-8M', 'R9-5T']
  const sessions = new Map<string, { state: 'provisional' | 'closed'; reason?: string; binding: Material }>([
    [LINK, { state: 'provisional', binding: first }],
  ])
  let minted = 0
  const idOf = (call: Call) => call.url.slice(SESSIONS.length).split('/')[1] as string
  const known = (call: Call) => {
    const s = sessions.get(idOf(call))
    if (!s || call.auth !== `Bearer t_${idOf(call)}`) return { refused: json({ error: 'unauthorized' }, 401) }
    if (s.state === 'closed') return { refused: json({ error: 'closed', reason: s.reason }, 410) }
    return { s }
  }
  const api = fakeAgent([
    [
      // the trust of the agent, read again at each opening
      /^POST http:\/\/indexer\.test\//,
      () =>
        json({
          did: AGENT,
          trusted: true,
          ecsCredentials: [
            { ecsSchema: 'ServiceCredential', credentialSubject: { name: 'Fleet support', type: 'AIAgent' } },
            {
              ecsSchema: 'OrganizationCredential',
              credentialSubject: { name: 'Northwind Logistics', countryCode: 'NL' },
            },
          ],
        }),
    ],
    [
      'POST ',
      () => {
        const id = `ses_new${++minted}`
        const binding = material(next.shift() as string)
        sessions.set(id, { state: 'provisional', binding })
        return json(
          {
            sessionId: id,
            sessionToken: `t_${id}`,
            state: 'provisional',
            agent: { did: AGENT, name: 'Fleet support' },
            binding,
            idleTimeoutSeconds: 1800,
          },
          201
        )
      },
    ],
    [
      /^POST \/ses_\w+\/binding$/,
      (call) => {
        const { s, refused } = known(call)
        if (!s) return refused
        if (Date.parse(s.binding.expiresAt) > Date.now()) return json({ error: 'conflict', binding: s.binding }, 409)
        s.binding = material(next.shift() as string)
        return json({ binding: s.binding })
      },
    ],
    [
      /^DELETE \/ses_\w+$/,
      (call) => {
        const { s, refused } = known(call)
        if (!s) return refused
        s.state = 'closed'
        s.reason = 'user'
        return json(undefined, 204)
      },
    ],
  ])
  return {
    ...api,
    sessions,
    /** the provisional sessions the agent holds open, waiting for a phone */
    waiting: () => [...sessions].filter(([, s]) => s.state === 'provisional').map(([id]) => id),
    created: () => api.calls.filter((c) => c.method === 'POST' && c.url === SESSIONS),
    refreshes: () => api.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/binding')),
    ended: () => api.calls.filter((c) => c.method === 'DELETE').map((c) => `${idOf(c)} ${c.auth}`),
  }
}

/** A browser not linked to the agent, with the link screen of `link` on screen. */
async function linkScreen(link: Partial<SessionRecord> | null = {}) {
  const store = new MemoryDeviceStore()
  const shown =
    link &&
    record({
      sessionId: LINK,
      title: '',
      state: 'provisional',
      principal: undefined,
      conversationId: undefined,
      binding: SCANNED,
      ...link,
    })
  const hub = await tab({
    store,
    sessions: shown ? [shown] : [],
    spaces: undefined,
    snapshot: shown ? { selectedSessionId: LINK, view: 'conversation' } : {},
  })
  // not linked: no pairing, so every opening goes through the phone
  await store.putAgent({ ...agentRecord(), deviceHandle: undefined, deviceSecret: undefined, linkedAt: undefined })
  await hub.reload()
  const el = await render(hub, <Conversation />)
  const code = () => el.querySelector('.link-screen .code')?.textContent ?? null
  const button = () => byText(el, '.link-screen button', 'Show a new code') as HTMLButtonElement
  return { hub, store, el, code, button }
}

const shownId = (hub: Hub) => hub.getSnapshot().selectedSessionId

describe('Show a new code (UI-BIND-013)', () => {
  it('ends the waiting session and shows the code of a new one, in place, with focus kept on the button', async () => {
    const agent = linkAgent()
    const { hub, store, el, code, button } = await linkScreen()
    expect(code()).toBe('EJ-3N')
    // the browser is told nothing of a link refused on the phone: the screen says what to do then
    expect(el.querySelector('.link-screen .link-hint')?.textContent).toBe(en.bind.refused)
    expect(button().className).toBe('btn new-code')
    act(() => button().focus())
    const pressed = button()
    await click(pressed)
    await until(() => code() === 'K7-2P')
    // a new provisional session, from the phone's side a new invitation: the agent refreshes nothing before expiry
    expect(agent.created()).toHaveLength(1)
    expect(agent.created()[0]?.auth).toBeNull()
    expect(agent.refreshes()).toHaveLength(0)
    expect(hub.getSnapshot().sessions.find((s) => s.sessionId === 'ses_new1')?.binding).toMatchObject({
      oobUrl: 'https://agent.test/invite?oob=K7-2P',
      bindingCode: 'K7-2P',
    })
    // the old one ended on the agent with its own token: no provisional session left waiting there
    expect(agent.ended()).toEqual([`${LINK} Bearer t_${LINK}`])
    expect(agent.waiting()).toEqual(['ses_new1'])
    // the new session takes the old one's place, here and in the store, with no reload
    expect(shownId(hub)).toBe('ses_new1')
    expect(hub.getSnapshot().sessions.map((s) => s.sessionId)).toEqual(['ses_new1'])
    expect(await store.getSession(LINK)).toBeUndefined()
    // the same button, focus still on it; the new code said to a screen reader
    expect(button()).toBe(pressed)
    expect(document.activeElement).toBe(pressed)
    expect(el.querySelector('.link-renew [role="status"]')?.textContent).toBe('New code: K7-2P')
    // again: each press ends the session it replaces
    await click(button())
    await until(() => code() === 'Q4-8M')
    expect(agent.ended()).toEqual([`${LINK} Bearer t_${LINK}`, 'ses_new1 Bearer t_ses_new1'])
    expect(agent.waiting()).toEqual(['ses_new2'])
    expect(hub.getSnapshot().sessions.map((s) => s.sessionId)).toEqual(['ses_new2'])
  })

  it('opens the new session as the first one was: a new conversation in its space', async () => {
    const agent = linkAgent()
    // nothing waits yet: the link starts here
    agent.sessions.delete(LINK)
    const { hub, el, code, button } = await linkScreen(null)
    // New conversation in "Truck 14 recall", on a browser not linked: the link screen
    const opened = await hub.newConversation(AGENT, undefined, TRUCK.id)
    await settle()
    expect(opened).toMatchObject({ state: 'provisional', newConversation: true, spaceId: TRUCK.id })
    expect(code()).toBe('K7-2P')
    expect(agent.created()[0]?.body).toMatchObject({ newConversation: true, spaceId: TRUCK.id })
    await click(button())
    await until(() => code() === 'Q4-8M')
    expect(agent.created()[1]?.body).toMatchObject({ newConversation: true, spaceId: TRUCK.id })
    expect(agent.ended()).toEqual(['ses_new1 Bearer t_ses_new1'])
    expect(agent.waiting()).toEqual(['ses_new2'])
    expect(hub.getSnapshot().sessions.find((s) => s.sessionId === 'ses_new2')).toMatchObject({
      newConversation: true,
      spaceId: TRUCK.id,
    })
    expect(el.querySelector('.composer-area')).toBeNull()
  })

  it('replaces an expired code by itself, on the same session, once the page is visible', async () => {
    setVisibility('hidden')
    const expired = material('EJ-3N', -1000)
    const agent = linkAgent(expired)
    const { hub, el, code, button } = await linkScreen({ binding: expired })
    await settle()
    // in the background nothing is asked: the dead code is gone, the button waits
    expect(agent.refreshes()).toHaveLength(0)
    expect(code()).toBeNull()
    expect(el.querySelector('.link-screen .link-hint')?.textContent).toBe('The code has expired.')
    expect(button().className).toBe('btn primary')
    act(() => setVisibility('visible'))
    await until(() => code() === 'K7-2P')
    expect(agent.refreshes().map((c) => c.auth)).toEqual([`Bearer t_${LINK}`])
    // fresh material on the same session (PROF-BIND-007): nothing created, nothing ended
    expect(agent.created()).toHaveLength(0)
    expect(agent.ended()).toEqual([])
    expect(shownId(hub)).toBe(LINK)
    expect(button().className).toBe('btn new-code')
  })

  it('replaces the code of a session that closed before the phone linked it with a new session', async () => {
    const agent = linkAgent()
    const { hub, el, code } = await linkScreen()
    expect(code()).toBe('EJ-3N')
    // the session's window ended on the agent (`expired`, profile section 5), told on its stream
    agent.sessions.set(LINK, { state: 'closed', reason: 'expired', binding: SCANNED })
    await act(async () => {
      // @ts-expect-error private: the event as the session stream delivers it
      await hub.onEvent(
        LINK,
        { type: 'CUSTOM', name: CUSTOM_EVENT.sessionState, value: { state: 'closed', reason: 'expired' } },
        7,
        false
      )
    })
    await until(() => code() === 'K7-2P')
    // never an empty conversation with a message form in its place
    expect(el.querySelector('.composer-area')).toBeNull()
    expect(agent.created()).toHaveLength(1)
    // already closed there, so nothing to end; nothing waiting but the new one
    expect(agent.ended()).toEqual([])
    expect(agent.waiting()).toEqual(['ses_new1'])
    expect(shownId(hub)).toBe('ses_new1')
    expect(hub.getSnapshot().sessions.map((s) => s.sessionId)).toEqual(['ses_new1'])
  })

  it('a session whose window ended while its material was refreshed gets a new session', async () => {
    const expired = material('EJ-3N', -1000)
    const agent = linkAgent(expired)
    agent.sessions.set(LINK, { state: 'closed', reason: 'expired', binding: expired })
    const { hub, code } = await linkScreen({ binding: expired })
    await until(() => code() === 'K7-2P')
    // the refresh answered 410: a new session took the place of the one that closed
    expect(agent.refreshes()).toHaveLength(1)
    expect(agent.created()).toHaveLength(1)
    expect(agent.waiting()).toEqual(['ses_new1'])
    expect(shownId(hub)).toBe('ses_new1')
  })

  it('says it in the four languages', () => {
    const files = { en, es, fr, pt } as unknown as Record<string, { bind: Record<string, string> }>
    const keys = ['newCode', 'renewing', 'newCodeShown', 'refused', 'expired', 'ended']
    expect(en.bind.newCode).toBe('Show a new code')
    for (const key of keys)
      for (const lang of ['es', 'fr', 'pt']) {
        const text = files[lang]?.bind[key]
        expect(text, `${lang}.bind.${key}`).toBeTruthy()
        expect(text, `${lang}.bind.${key}`).not.toBe(files.en?.bind[key])
      }
    for (const lang of Object.keys(files)) expect(files[lang]?.bind.newCodeShown).toContain('{{code}}')
  })

  it('reads in both themes: light, dark by choice and dark by system', () => {
    const token = (name: string) => {
      const m = css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))
      if (!m) throw new Error(`no token ${name}`)
      return m[1] as string
    }
    const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lum = (c: number[]) => 0.2126 * lin(c[0] ?? 0) + 0.7152 * lin(c[1] ?? 0) + 0.0722 * lin(c[2] ?? 0)
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x) as [number, number]
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
    }
    // Show a new code while the code waits: the accent on the page; once dead, the primary button
    expect(rule('.btn.new-code')).toEqual({
      background: 'var(--bg)',
      color: 'var(--accent)',
      'border-color': 'var(--accent)',
    })
    expect(rule('.btn.primary')).toMatchObject({ background: 'var(--accent)', color: 'var(--accent-contrast)' })
    expect(rule('.muted')).toEqual({ color: 'var(--muted)' })
    expect(rule(':focus-visible')).toMatchObject({ outline: '2px solid var(--accent)' })
    // dark by choice and dark by system take the same dark tokens
    const dark =
      /--accent: var\(--dark-accent\);\n\s+--accent-contrast: var\(--dark-accentContrast\);\n\s+--bg: var\(--dark-bg\);\n\s+--surface: var\(--dark-surface\);\n\s+--text: var\(--dark-text\);\n\s+--muted: var\(--dark-muted\);/
    const blocks = [/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/, /:root\[data-theme="dark"\] \{([^}]*)\}/]
    for (const block of blocks) expect(css.match(block)?.[1]).toMatch(dark)
    const figures: Record<string, Record<string, number>> = {}
    for (const theme of ['light', 'dark']) {
      const [accent, label, bg, text, muted] = ['accent', 'accentContrast', 'bg', 'text', 'muted'].map((n) =>
        token(`${theme}-${n}`)
      ) as [string, string, string, string, string]
      const f = {
        // the button's label, its edge and its focus ring, on the page
        newCode: ratio(accent, bg),
        // the primary button once the code is dead: its label, and its edge on the page
        primaryLabel: ratio(label, accent),
        primaryEdge: ratio(accent, bg),
        // what to do when the phone did not link, and the other muted lines
        hint: ratio(muted, bg),
        code: ratio(text, bg),
      }
      figures[theme] = f
      expect(f.newCode, `${theme} Show a new code`).toBeGreaterThanOrEqual(4.5)
      expect(f.primaryLabel, `${theme} primary label`).toBeGreaterThanOrEqual(4.5)
      expect(f.primaryEdge, `${theme} primary edge`).toBeGreaterThanOrEqual(3)
      expect(f.hint, `${theme} hint`).toBeGreaterThanOrEqual(4.5)
      expect(f.code, `${theme} code`).toBeGreaterThanOrEqual(4.5)
    }
    expect(figures).toEqual({
      light: { newCode: 5.47, primaryLabel: 5.47, primaryEdge: 5.47, hint: 4.83, code: 17.74 },
      dark: { newCode: 10.06, primaryLabel: 7.77, primaryEdge: 10.06, hint: 7.37, code: 17.01 },
    })
  })
})
