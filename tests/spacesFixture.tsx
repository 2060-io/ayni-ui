/**
 * A browser tab with Ana Ríos and the Fleet support agent of Northwind Logistics (ayni-spec, spaces example), for the
 * tests of spaces, memories, people and deletion (UI-CONV-028..043): an agent of profile 3.3, its answers mocked as
 * the profile gives them, a hub whose store and snapshot are set directly, and helpers to render and to wait.
 */
import {
  MemoryDeviceStore,
  type SessionRecord,
  type SpaceInfo,
  type Spaces,
  type Transcript,
} from '@ayni.org/ayni-ui-core'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { vi } from 'vitest'
import { initI18n } from '../src/i18n/index.js'
import { Hub, type Snapshot } from '../src/state/hub.js'
import { HubContext } from '../src/state/useHub.js'

export const AGENT = 'did:webvh:fleet'
export const SESSIONS = 'http://agent.test/agui/v3/sessions'
export const config = {
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

export function agentRecord(features: Record<string, unknown> = {}, profileVersion = '3.3') {
  return {
    did: AGENT,
    descriptorUrl: 'http://agent.test/.well-known/ayni-agent.json',
    descriptor: {
      did: AGENT,
      name: 'Fleet support',
      profileVersion,
      sessions: SESSIONS,
      locales: ['en', 'nl'],
      features: {
        reactions: true,
        receipts: false,
        history: true,
        contextualMenu: true,
        approvals: true,
        erasure: { windowSeconds: 600 },
        ...features,
      },
    } as never,
    name: 'Fleet support',
    trust: {
      result: 'trusted' as const,
      checkedAt: '',
      did: AGENT,
      reasons: [],
      // read once already: a reload asks the indexer nothing
      links: { read: true },
      operator: { kind: 'organization', name: 'Northwind Logistics', countryCode: 'NL', registryId: 'northwind' },
    },
    controllerDid: 'org:nl:northwind',
    pinned: true,
    pinOrder: 1,
    addedAt: '2026-11-01T00:00:00.000Z',
    lastMessageAt: '2026-11-18T10:00:00.000Z',
    deviceHandle: 'dev_1',
    deviceSecret: 'dsk_1',
    linkedAt: '2026-11-01T00:00:00.000Z',
  }
}

const rules = (over: Partial<SpaceInfo['rules']> = {}): SpaceInfo['rules'] => ({
  retentionDays: 365,
  lawfulBasis: 'contract',
  allowedProviders: ['kimi'],
  handover: true,
  ...over,
})

export function space(over: Partial<SpaceInfo> & Pick<SpaceInfo, 'id' | 'title'>): SpaceInfo {
  return {
    kind: 'team',
    purpose: '',
    brief: '',
    templateId: 'project',
    language: null,
    rules: rules(),
    membership: { mode: 'list', memberCount: 5 },
    owner: { name: 'Jonas Weber' },
    role: 'member',
    state: 'active',
    unread: 0,
    lastActivityAt: '2026-11-17T09:00:00.000Z',
    ...over,
  }
}

export const PERSONAL = space({
  id: 'spc_personal',
  kind: 'personal',
  title: 'Personal',
  templateId: null,
  rules: rules({ handover: false }),
  membership: { mode: 'list', memberCount: 1 },
  owner: { name: 'Ana Ríos' },
  role: 'owner',
})
export const TRUCK = space({
  id: 'spc_truck14',
  title: 'Truck 14 recall',
  purpose: 'Get every truck affected by recall R-2291 inspected and signed off by 30 November.',
  brief: 'Five trucks, three depots. Form F-12, photos of both calipers.',
  language: 'en',
  lastActivityAt: '2026-11-18T10:46:00.000Z',
})
export const DEPOT = space({
  id: 'spc_depot',
  title: 'Depot Rotterdam',
  templateId: 'department',
  membership: { mode: 'rule', rule: { department: 'Depot Rotterdam' }, memberCount: 48 },
  owner: { name: 'Marta Kovač' },
  lastActivityAt: '2026-11-17T08:00:00.000Z',
})
export const NORTHWIND = space({
  id: 'spc_org',
  kind: 'organization',
  title: 'Northwind Logistics',
  templateId: 'organization',
  membership: { mode: 'rule', rule: { organization: true }, memberCount: 312 },
  lastActivityAt: '2026-11-16T08:00:00.000Z',
})
export const FORKLIFT = space({
  id: 'spc_forklift',
  title: 'Forklift licence',
  lastActivityAt: '2026-11-10T08:00:00.000Z',
})

export const TEMPLATES: Spaces['templates'] = [{ id: 'project', title: 'Project', kind: 'team', membership: 'list' }]

export function record(over: Partial<SessionRecord> & Pick<SessionRecord, 'sessionId'>): SessionRecord {
  return {
    agentDid: AGENT,
    sessionToken: `t_${over.sessionId}`,
    title: 'A conversation',
    createdAt: '2026-11-18T09:00:00.000Z',
    state: 'bound',
    principal: { displayName: 'Ana Ríos' } as never,
    lastEventId: 0,
    unreadCount: 0,
    lastPreview: '',
    lastMessageAt: '2026-11-18T09:00:00.000Z',
    draft: '',
    ayni: null,
    conversationId: `conv_${over.sessionId}`,
    ...over,
  }
}

export function transcript(sessionId: string, messages: Transcript['messages'] = []): Transcript {
  return { sessionId, messages, oldestLoadedId: null, complete: true, run: null, routed: {}, reactions: {} }
}

export const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export interface Call {
  method: string
  url: string
  body: unknown
  auth: string | null
}

/**
 * The agent: each request is answered by the first route whose `METHOD path` (path after `{sessions}`, with its
 * query) matches, as a string or a pattern; anything else answers 404. Every request is recorded.
 */
export function fakeAgent(routes: [string | RegExp, (call: Call) => Response | Promise<Response>][]) {
  const calls: Call[] = []
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    let body: unknown
    if (typeof init?.body === 'string') body = JSON.parse(init.body)
    const call = { method, url, body, auth: headers.get('authorization') }
    calls.push(call)
    const path = url.startsWith(SESSIONS) ? url.slice(SESSIONS.length) : url
    const key = `${method} ${path}`
    for (const [match, answer] of routes) {
      if (typeof match === 'string' ? match === key : match.test(key)) return answer(call)
    }
    return json({ error: 'not-found', message: key }, 404)
  }
  vi.stubGlobal('fetch', fetchFn)
  return {
    calls,
    fetchFn,
    find: (method: string, path: string) => calls.filter((c) => c.method === method && c.url === `${SESSIONS}${path}`),
  }
}

const bus = {
  tabId: 'tab',
  post: () => undefined,
  subscribe: () => () => undefined,
  tryLead: async () => false,
  close: () => undefined,
}

/** A tab with the agent, the given conversations and the person's spaces, the snapshot set as the shell would. */
export async function tab(
  options: {
    sessions?: SessionRecord[]
    transcripts?: Transcript[]
    spaces?: Spaces | undefined
    features?: Record<string, unknown>
    profileVersion?: string
    snapshot?: Partial<Snapshot>
  } = {}
): Promise<Hub> {
  const hub = new Hub(config, { appName: 'Ayni' })
  const store = new MemoryDeviceStore()
  // @ts-expect-error private: the store and the bus of a test tab
  hub.store = store
  // @ts-expect-error private
  hub.bus = bus
  const agent = agentRecord(options.features, options.profileVersion)
  await store.putAgent(agent as never)
  await store.putController({
    did: 'org:nl:northwind',
    kind: 'organization',
    name: 'Northwind Logistics',
    countryCode: 'NL',
    pinned: true,
    pinOrder: 1,
  })
  for (const s of options.sessions ?? []) await store.putSession(s)
  for (const t of options.transcripts ?? []) await store.putTranscript(t)
  await hub.reload()
  // @ts-expect-error private: the in-memory snapshot, as the shell sets it
  hub.snapshot = {
    ...hub.getSnapshot(),
    ready: true,
    online: true,
    selectedControllerDid: 'org:nl:northwind',
    selectedAgentDid: AGENT,
    expandedAgents: { [AGENT]: true },
    transcripts: Object.fromEntries((options.transcripts ?? []).map((t) => [t.sessionId, t])),
    spaces: options.spaces === undefined ? {} : { [AGENT]: options.spaces },
    admins: { [AGENT]: false },
    ...options.snapshot,
  }
  return hub
}

let root: Root | undefined
let host: HTMLDivElement | undefined

export function setup(): void {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  initI18n(['en'], 'en', 'en')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  })
}

export function teardown(): void {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  vi.unstubAllGlobals()
}

export async function render(hub: Hub, node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(<HubContext.Provider value={hub}>{node}</HubContext.Provider>)
  })
  return host
}

/** Lets pending promises and renders settle. */
export async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
}

/** Waits until `check` holds, letting renders settle in between. */
export async function until(check: () => unknown, timeout = 2000): Promise<void> {
  const end = Date.now() + timeout
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met in time')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
  }
}

export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click')
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}

/** Types into a React-controlled field. */
export async function type(el: Element | null | undefined, value: string): Promise<void> {
  if (!el) throw new Error('nothing to type into')
  const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

/** The element whose text is exactly `text`, among those `selector` finds. */
export function byText(root: ParentNode, selector: string, text: string | RegExp): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(selector)].find((e) =>
    typeof text === 'string' ? e.textContent?.trim() === text : text.test(e.textContent ?? '')
  )
}

export const SPACES: Spaces = { spaces: [PERSONAL, TRUCK, DEPOT, NORTHWIND], templates: TEMPLATES }
