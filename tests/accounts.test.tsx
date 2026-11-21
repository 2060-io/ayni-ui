/**
 * Your accounts (tools, phase 2; profile 3.5 §3.11; agent D104 to D110), for Ana Ríos and the Fleet support agent:
 * the page of each agent, reached from its menu, a conversation's and the link the agent sends the browser back to
 * (UI-CONV-053, UI-LINK-001, PROF-LINK-004); the sign-in of an account of OAuth in a new tab, its time left, Cancel and
 * every outcome the agent announces (UI-CONV-054); an account of fields typed in its row (UI-CONV-055); Disconnect
 * (UI-CONV-056); read again on `ayni.connections.changed` and when the tab is in front; nothing of it against an agent
 * that does not declare `features.connections` (PROF-DESC-010).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountsPage } from '../src/components/Accounts.js'
import { Column, ConversationRow } from '../src/components/Column.js'
import type { Hub } from '../src/state/hub.js'
import {
  AGENT,
  byText,
  type Call,
  click,
  fakeAgent,
  json,
  record,
  render,
  SPACES,
  settle,
  setup,
  tab,
  teardown,
  type,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(() => {
  teardown()
  vi.restoreAllMocks()
})

const inMinutes = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()
const RELATICLE = {
  source: 'relaticle',
  title: 'Relaticle CRM',
  description: "The companies, people, notes and tasks of the space's workspace",
  method: 'oauth',
  binding: { name: 'workspace', label: 'Workspace', value: '01JD8Q4W6Z0KX3V7N2M5B9C1TA', valueLabel: 'ayni-dev-agent' },
  usedIn: [{ kind: 'space', id: 'spc_sales', title: 'Sales EU' }],
  state: 'connected',
  reason: null,
  moreAccess: false,
  account: {
    id: 'acc_1',
    label: 'ana@2060.io · ayni-dev-agent',
    connectedAt: '2026-11-21T10:02:00Z',
    lastUsedAt: '2026-11-21T10:40:00Z',
  },
  attempt: null,
  revokesAtSource: false,
}
const GITHUB = {
  source: 'github',
  title: 'GitHub',
  description: 'Code, issues and pull requests in GitHub',
  method: 'oauth',
  binding: null,
  usedIn: [{ kind: 'personal' }, { kind: 'space', id: 'spc_repo', title: 'Test repo' }],
  state: 'not-connected',
  reason: null,
  moreAccess: false,
  account: null,
  attempt: null,
  revokesAtSource: false,
}
const TASKS = {
  source: 'my_tasks',
  title: 'My tasks',
  description: 'Lists your open tasks in the task tracker',
  method: 'fields',
  fields: [{ name: 'token', label: 'API token', pattern: '^tt_[A-Za-z0-9]{32}$' }],
  binding: null,
  usedIn: [{ kind: 'personal' }],
  state: 'not-connected',
  reason: null,
  moreAccess: false,
  account: null,
  attempt: null,
  revokesAtSource: false,
}
const GITHUB_CONNECTED = {
  ...GITHUB,
  state: 'connected',
  account: { id: 'acc_2', label: 'ana-rios', connectedAt: '2026-11-21T10:05:00Z', lastUsedAt: null },
}
const SIGN_IN = 'https://github.com/login/oauth/authorize?client_id=Iv1.x&state=s&code_challenge=c'
const TASK_TOKEN = `tt_${'A1b2C3d4'.repeat(4)}`

/** A tab that the browser opens for a sign-in: what the page did to it. */
function fakeTab(log: string[] = []) {
  const tab = { opener: window as unknown, location: { replace: vi.fn() }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockImplementation((() => {
    log.push('open')
    return tab
  }) as never)
  return { tab, open }
}

/** Ana's tab on Your accounts of Fleet support, against an agent of profile 3.5. */
async function accounts(
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][] = [],
  options: { list?: () => unknown[]; features?: Record<string, unknown> } = {}
) {
  const list = options.list ?? (() => [RELATICLE, GITHUB, TASKS])
  const agent = fakeAgent([...routes, ['GET /connections', () => json({ connections: list() })]])
  const hub = await tab({
    sessions: [record({ sessionId: 's1' })],
    spaces: SPACES,
    features: options.features ?? { tools: true, connections: true },
    profileVersion: '3.5',
    snapshot: { view: 'accounts', accountsFor: { agentDid: AGENT } },
  })
  const el = await render(hub, <AccountsPage />)
  await until(() => el.querySelector('.account-row') || el.querySelector('.empty'))
  const row = (title: string) =>
    [...el.querySelectorAll<HTMLElement>('.account-row')].find(
      (r) => r.querySelector('.account-title')?.textContent === title
    )
  return { agent, hub, el, row }
}

/** The agent says one of Ana's accounts, or an attempt, changed, on one of her session streams (PROF-TOOL-019). */
async function announce(hub: Hub, value: Record<string, unknown>) {
  // @ts-expect-error private: the event as the session's stream delivers it
  await hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.connections.changed', value }, undefined, false)
}

const texts = (row: HTMLElement | undefined) => ({
  title: row?.querySelector('.account-title')?.textContent,
  description: row?.querySelector('.account-description')?.textContent,
  binding: row?.querySelector('.account-binding')?.textContent,
  used: row?.querySelector('.account-used')?.textContent,
  state: row?.querySelector('.account-state')?.textContent,
  controls: [...(row?.querySelectorAll('.account-controls button') ?? [])].map((b) => b.textContent),
})

describe('Your accounts of an agent (UI-CONV-053)', () => {
  it('lists each account with its binding, where it is used, its state and its controls', async () => {
    const { el, row } = await accounts()
    expect(el.querySelector('h1')?.textContent).toBe('Your accounts in Fleet support')
    expect(el.querySelector('.accounts-intro')?.textContent).toBe(
      'Fleet support uses these accounts with your own rights at each service. Only you connect them.'
    )
    expect(texts(row('Relaticle CRM'))).toEqual({
      title: 'Relaticle CRM',
      description: "The companies, people, notes and tasks of the space's workspace",
      binding: 'Workspace: ayni-dev-agent',
      used: 'Used in Sales EU',
      state: 'Connected as ana@2060.io · ayni-dev-agent · since Nov 21',
      controls: ['Disconnect'],
    })
    expect(texts(row('GitHub'))).toMatchObject({
      binding: undefined,
      used: 'Used in Personal, Test repo',
      state: 'Not connected',
      controls: ['Connect'],
    })
    expect(texts(row('My tasks'))).toMatchObject({
      used: 'Used in Personal',
      state: 'Not connected',
      controls: ['Connect'],
    })
    // a screen reader reads each row as its title, its binding and its state, then its controls
    expect(row('Relaticle CRM')?.getAttribute('aria-label')).toBe(
      'Relaticle CRM, Workspace: ayni-dev-agent, Connected as ana@2060.io · ayni-dev-agent · since Nov 21'
    )
    expect(row('GitHub')?.getAttribute('aria-label')).toBe('GitHub, Not connected')
  })

  it('says why an account must be connected again, and where an account serves everywhere or nowhere', async () => {
    const { row } = await accounts([], {
      list: () => [
        { ...RELATICLE, state: 'reconnect', reason: 'expired' },
        { ...GITHUB_CONNECTED, moreAccess: true, usedIn: [{ kind: 'agent' }] },
        { ...TASKS, state: 'reconnect', reason: 'revoked', account: { id: 'acc_3', label: '', connectedAt: 'x' } },
        { ...GITHUB, source: 'gitlab', title: 'GitLab', state: 'reconnect', reason: 'changed', usedIn: [] },
      ],
    })
    expect(texts(row('Relaticle CRM'))).toMatchObject({
      state: 'Relaticle CRM signed you out. Reconnect to use it again.',
      controls: ['Reconnect', 'Disconnect'],
    })
    const github = row('GitHub') as HTMLElement
    expect(texts(github).used).toBe('Used in all your conversations')
    expect([...github.querySelectorAll('.account-state')].map((s) => s.textContent)).toEqual([
      'Connected as ana-rios · since Nov 21',
      'GitHub asks for more access. Reconnect to give it.',
    ])
    expect(texts(github).controls).toEqual(['Reconnect', 'Disconnect'])
    expect(texts(row('My tasks')).state).toBe('My tasks no longer accepts this connection. Reconnect to use it again.')
    expect(texts(row('GitLab'))).toMatchObject({
      used: 'Not used now',
      state: 'Fleet support changed how it connects to GitLab. Reconnect to use it again.',
      // no account held: nothing to disconnect
      controls: ['Reconnect'],
    })
    // the icons are drawn, never typed
    expect(row('Relaticle CRM')?.querySelector('.account-reconnect-icon')?.tagName.toLowerCase()).toBe('svg')
  })

  it('is read again on `ayni.connections.changed` and when the tab is in front again', async () => {
    let list: unknown[] = [RELATICLE, GITHUB, TASKS]
    const { agent, hub, row } = await accounts([], { list: () => list })
    const reads = () => agent.find('GET', '/connections').length
    const before = reads()
    // GitHub connected on the phone: the laptop's row follows, without a reload
    list = [RELATICLE, GITHUB_CONNECTED, TASKS]
    await announce(hub, { source: 'github', state: 'connected', accountId: 'acc_2', label: 'ana-rios' })
    await until(() => texts(row('GitHub')).state === 'Connected as ana-rios · since Nov 21')
    expect(reads()).toBe(before + 1)
    // the same event heard on a second session is one change
    await announce(hub, { source: 'github', state: 'connected', accountId: 'acc_2', label: 'ana-rios' })
    await settle()
    expect(reads()).toBe(before + 1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await until(() => reads() === before + 2)
  })

  it('follows a change another tab heard, and tells the other tabs of one this tab heard', async () => {
    let list: unknown[] = [RELATICLE, GITHUB, TASKS]
    const { agent, hub, row } = await accounts([], { list: () => list })
    const messages: { kind: string }[] = []
    const posted = () => messages.filter((m) => m.kind === 'connections-changed')
    // @ts-expect-error private: the tab sync bus of this test tab
    hub.bus = { ...hub.bus, post: (m: { kind: string }) => messages.push(m) }
    const before = agent.find('GET', '/connections').length
    list = [RELATICLE, GITHUB_CONNECTED, TASKS]
    // @ts-expect-error private: a message of the tab that streams the session that heard it
    hub.onBus({
      kind: 'connections-changed',
      agentDid: AGENT,
      change: { source: 'github', state: 'connected', label: 'ana-rios' },
    })
    await until(() => texts(row('GitHub')).state === 'Connected as ana-rios · since Nov 21')
    expect(agent.find('GET', '/connections').length).toBe(before + 1)
    // heard on a stream of this tab: told to the others, once
    expect(posted()).toEqual([])
    await announce(hub, { source: 'github', state: 'reconnect', reason: 'revoked' })
    expect(posted()).toEqual([
      {
        kind: 'connections-changed',
        agentDid: AGENT,
        change: { source: 'github', state: 'reconnect', reason: 'revoked' },
      },
    ])
  })

  it('is offered by the menu of the agent and of a conversation, only for an agent that declares it', async () => {
    fakeAgent([['GET /connections', () => json({ connections: [] })]])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      features: { tools: true, connections: true },
      profileVersion: '3.5',
    })
    const el = await render(hub, <Column />)
    await click(el.querySelector('.agent-row [aria-label="Agent options"]'))
    await click(byText(el, '[role="menuitem"]', 'Your accounts'))
    expect(hub.getSnapshot().view).toBe('accounts')
    expect(hub.getSnapshot().accountsFor).toEqual({ agentDid: AGENT })
    teardown()
    const row = await render(hub, <ConversationRow session={hub.getSnapshot().sessions[0]} selected={false} />)
    await click(row.querySelector('[aria-label="Agent options"]'))
    expect(byText(row, '[role="menuitem"]', 'Your accounts')).toBeTruthy()
    teardown()
    // an agent of 3.4: no Your accounts anywhere
    fakeAgent([])
    const old = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      features: { tools: true },
      profileVersion: '3.4',
    })
    const column = await render(old, <Column />)
    await click(column.querySelector('.agent-row [aria-label="Agent options"]'))
    expect(byText(column, '[role="menuitem"]', 'Keeps')).toBeUndefined()
    expect(byText(column, '[role="menuitem"]', 'Your accounts')).toBeUndefined()
    expect(column.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0)
  })

  it('says when there is nothing to connect', async () => {
    const { el } = await accounts([], { list: () => [] })
    expect(el.querySelector('.empty')?.textContent).toBe('Fleet support offers you no account of your own to connect.')
  })
})

describe('the sign-in of an account of OAuth (UI-CONV-054, PROF-TOOL-018)', () => {
  const attempt = (over: Record<string, unknown> = {}) => ({
    attemptId: 'att_2',
    authorizationUrl: SIGN_IN,
    expiresAt: inMinutes(272),
    ...over,
  })

  it('opens a new tab at the press, then asks the agent, then points the tab at the sign-in, carrying nothing', async () => {
    const log: string[] = []
    const { tab: opened, open } = fakeTab(log)
    const { agent, row, hub } = await accounts([
      [
        'POST /connections/github/authorize',
        () => {
          log.push('authorize')
          return json(attempt(), 202)
        },
      ],
    ])
    await click(byText(row('GitHub') as HTMLElement, 'button', 'Connect'))
    await until(() => opened.location.replace.mock.calls.length === 1)
    expect(log).toEqual(['open', 'authorize'])
    // a tab of its own, cut from this page, never a frame; nothing of this page's in its address
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(opened.opener).toBeNull()
    expect(opened.location.replace).toHaveBeenCalledWith(SIGN_IN)
    expect(document.querySelector('iframe')).toBeNull()
    // GitHub is Personal's: no space is sent
    expect(agent.find('POST', '/connections/github/authorize')[0]?.body).toEqual({})
    // while it waits: the time left and Cancel, and a stream kept open for the outcome
    await until(() => row('GitHub')?.querySelector('.account-waiting'))
    expect(row('GitHub')?.querySelector('.account-waiting .tool-pending-text')?.textContent).toBe(
      'Finish in the browser · 4:32 left'
    )
    expect(byText(row('GitHub') as HTMLElement, 'button', 'Cancel')).toBeTruthy()
    expect(texts(row('GitHub')).controls).toEqual([])
    await until(() => hub.getSnapshot().leaders.s1 !== undefined)
  })

  it('shows the outcome the agent announces under the row, and the row connected', async () => {
    fakeTab()
    let list: unknown[] = [RELATICLE, GITHUB, TASKS]
    const { hub, row } = await accounts([['POST /connections/github/authorize', () => json(attempt(), 202)]], {
      list: () => list,
    })
    await click(byText(row('GitHub') as HTMLElement, 'button', 'Connect'))
    await until(() => row('GitHub')?.querySelector('.account-waiting'))
    list = [RELATICLE, GITHUB_CONNECTED, TASKS]
    await announce(hub, {
      source: 'github',
      state: 'connected',
      accountId: 'acc_2',
      label: 'ana-rios',
      attemptId: 'att_2',
      outcome: 'connected',
    })
    await until(() => row('GitHub')?.querySelector('.account-notice')?.textContent === 'Connected as ana-rios')
    expect(row('GitHub')?.querySelector('.account-waiting')).toBeNull()
    await until(() => texts(row('GitHub')).state === 'Connected as ana-rios · since Nov 21')
    expect(texts(row('GitHub')).controls).toEqual(['Disconnect'])
  })

  it('says every other outcome in the words of UI-CONV-058', async () => {
    fakeTab()
    const outcomes: [Record<string, unknown>, string][] = [
      [{ outcome: 'denied' }, 'Not connected: you did not allow Fleet support at GitHub.'],
      [{ outcome: 'failed' }, 'Not connected: GitHub did not complete the sign-in. Try again.'],
      [{ outcome: 'expired' }, 'Not connected in time. Try again.'],
      [{ outcome: 'cancelled' }, 'Cancelled. Nothing changed.'],
      [{ outcome: 'wrong-person' }, 'Not connected: this GitHub account is not yours. Connect again with your own.'],
      [{ outcome: 'connected' }, 'Connected'],
    ]
    let started = 0
    const { hub, row } = await accounts([
      ['POST /connections/github/authorize', () => json(attempt({ attemptId: `att_${++started}` }), 202)],
    ])
    for (const [value, words] of outcomes) {
      await click(byText(row('GitHub') as HTMLElement, 'button', 'Connect'))
      await until(() => row('GitHub')?.querySelector('.account-waiting'))
      await announce(hub, { source: 'github', state: 'not-connected', attemptId: `att_${started}`, ...value })
      await until(() => row('GitHub')?.querySelector('.account-notice')?.textContent === words)
      const alert = value.outcome !== 'cancelled' && value.outcome !== 'connected'
      expect(row('GitHub')?.querySelector('.account-notice')?.getAttribute('role'), words).toBe(
        alert ? 'alert' : 'status'
      )
    }
  })

  it('names the workspace to choose when the account is for another one, and sends the space (agent D110)', async () => {
    fakeTab()
    const { hub, row, agent } = await accounts(
      [['POST /connections/relaticle/authorize', () => json({ ...attempt(), attemptId: 'att_3' }, 202)]],
      { list: () => [{ ...RELATICLE, state: 'reconnect', reason: 'revoked' }, GITHUB, TASKS] }
    )
    await click(byText(row('Relaticle CRM') as HTMLElement, 'button', 'Reconnect'))
    await until(() => agent.find('POST', '/connections/relaticle/authorize').length === 1)
    expect(agent.find('POST', '/connections/relaticle/authorize')[0]?.body).toEqual({ spaceId: 'spc_sales' })
    await announce(hub, {
      source: 'relaticle',
      binding: { value: '01JD8Q4W6Z0KX3V7N2M5B9C1TA', valueLabel: 'ayni-dev-agent' },
      state: 'reconnect',
      attemptId: 'att_3',
      outcome: 'wrong-binding',
      expected: 'ayni-dev-agent',
      chosen: 'Partners',
    })
    await until(
      () =>
        row('Relaticle CRM')?.querySelector('.account-notice')?.textContent ===
        'Not connected: this account is for Partners. Connect again and choose ayni-dev-agent.'
    )
  })

  it('closes the tab and says why when the agent refuses', async () => {
    const refusals: [number, Record<string, unknown>, string][] = [
      [502, { error: 'source-unavailable' }, 'GitHub cannot be connected now. Try again later.'],
      [404, { error: 'not-found' }, 'This account is not offered to you.'],
      [409, { error: 'not-oauth' }, 'This account has changed. Open Your accounts again.'],
    ]
    for (const [status, body, words] of refusals) {
      const { tab: opened } = fakeTab()
      const { row } = await accounts([['POST /connections/github/authorize', () => json(body, status)]])
      await click(byText(row('GitHub') as HTMLElement, 'button', 'Connect'))
      await until(() => row('GitHub')?.querySelector('.account-notice')?.textContent === words)
      expect(opened.close).toHaveBeenCalledTimes(1)
      expect(opened.location.replace).not.toHaveBeenCalled()
      teardown()
      vi.restoreAllMocks()
    }
  })

  it('never points the tab at an address that is not a sign-in over HTTPS, and ends that attempt', async () => {
    const { tab: opened } = fakeTab()
    const { row, agent } = await accounts([
      ['POST /connections/github/authorize', () => json(attempt({ authorizationUrl: 'javascript:alert(1)' }), 202)],
      ['DELETE /connections/attempts/att_2', () => json(undefined, 204)],
    ])
    await click(byText(row('GitHub') as HTMLElement, 'button', 'Connect'))
    await until(
      () =>
        row('GitHub')?.querySelector('.account-notice')?.textContent ===
        'Not connected: GitHub did not complete the sign-in. Try again.'
    )
    expect(opened.location.replace).not.toHaveBeenCalled()
    expect(opened.close).toHaveBeenCalledTimes(1)
    await until(() => agent.find('DELETE', '/connections/attempts/att_2').length === 1)
  })

  it('asks nothing of the agent when the browser opens no tab', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null)
    const { row, agent } = await accounts()
    await click(byText(row('GitHub') as HTMLElement, 'button', 'Connect'))
    await until(() => row('GitHub')?.querySelector('.account-notice'))
    expect(row('GitHub')?.querySelector('.account-notice')?.textContent).toBe(
      'The browser did not open a new tab. Allow pop-ups for this page and try again.'
    )
    expect(agent.find('POST', '/connections/github/authorize')).toHaveLength(0)
  })

  it('Cancel ends the attempt that waits, also one the agent lists as started elsewhere', async () => {
    const { row, agent } = await accounts([['DELETE /connections/attempts/att_1', () => json(undefined, 204)]], {
      list: () => [RELATICLE, { ...GITHUB, attempt: { id: 'att_1', expiresAt: inMinutes(65) } }, TASKS],
    })
    // a sign-in started on the phone or in another tab waits: this page says so
    expect(row('GitHub')?.querySelector('.account-waiting .tool-pending-text')?.textContent).toBe(
      'Finish in the browser · 1:05 left'
    )
    await click(byText(row('GitHub') as HTMLElement, 'button', 'Cancel'))
    await until(() => row('GitHub')?.querySelector('.account-notice')?.textContent === 'Cancelled. Nothing changed.')
    expect(agent.find('DELETE', '/connections/attempts/att_1')).toHaveLength(1)
    expect(row('GitHub')?.querySelector('.account-waiting')).toBeNull()
    expect(texts(row('GitHub')).controls).toEqual(['Connect'])
  })

  it('counts the time left every second', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    try {
      const { row } = await accounts([], {
        list: () => [RELATICLE, { ...GITHUB, attempt: { id: 'att_1', expiresAt: inMinutes(272) } }, TASKS],
      })
      const left = () => row('GitHub')?.querySelector('.account-waiting .tool-pending-text')?.textContent
      expect(left()).toBe('Finish in the browser · 4:32 left')
      await vi.advanceTimersByTimeAsync(3000)
      await settle(1)
      expect(left()).toBe('Finish in the browser · 4:29 left')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the return link (PROF-LINK-004, UI-LINK-001)', () => {
  it('opens Your accounts of that agent, taking nothing from the link but the page', async () => {
    const agent = fakeAgent([['GET /connections', () => json({ connections: [GITHUB_CONNECTED] })]])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      features: { tools: true, connections: true },
      profileVersion: '3.5',
    })
    const link = `${location.origin}/app/service/${AGENT}/accounts?outcome=denied&code=abc&state=xyz`
    expect(hub.openAppLink(link)).toBe(true)
    expect(hub.getSnapshot().view).toBe('accounts')
    expect(hub.getSnapshot().accountsFor).toEqual({ agentDid: AGENT })
    const el = await render(hub, <AccountsPage />)
    await until(() => el.querySelector('.account-row'))
    // the state is the agent's; no outcome is said, and nothing of the link reaches the agent
    expect(el.querySelector('.account-state')?.textContent).toBe('Connected as ana-rios · since Nov 21')
    expect(el.querySelector('.account-notice')).toBeNull()
    expect(
      agent.calls.every((c) => !c.url.includes('abc') && !c.url.includes('xyz') && !c.url.includes('denied'))
    ).toBe(true)
  })

  it("is the service's link for an agent that does not declare Your accounts", async () => {
    fakeAgent([])
    const hub = await tab({ sessions: [record({ sessionId: 's1' })], features: { tools: true }, profileVersion: '3.4' })
    hub.openAppLink(`${location.origin}/app/service/${AGENT}/accounts`)
    expect(hub.getSnapshot().view).not.toBe('accounts')
    expect(hub.getSnapshot().selectedSessionId).toBe('s1')
  })
})

describe('an account of fields (UI-CONV-055)', () => {
  it('opens one masked field per field in its row, sends the value trimmed and empties it, keeping it nowhere', async () => {
    const connected = {
      ...TASKS,
      state: 'connected',
      account: { id: 'acc_4', label: '', connectedAt: '2026-11-21T10:06:00Z' },
    }
    let list: unknown[] = [RELATICLE, GITHUB, TASKS]
    const { row, agent, hub } = await accounts(
      [
        [
          'PUT /connections/my_tasks/account',
          () => {
            list = [RELATICLE, GITHUB, connected]
            return json({ connection: connected })
          },
        ],
      ],
      { list: () => list }
    )
    await click(byText(row('My tasks') as HTMLElement, 'button', 'Connect'))
    const field = row('My tasks')?.querySelector<HTMLInputElement>(
      'input[name="connection-my_tasks-token"]'
    ) as HTMLInputElement
    expect(field.type).toBe('password')
    expect(field.placeholder).toBe('Paste the API token')
    expect(field.value).toBe('')
    expect(field.autocomplete).toBe('off')
    const save = () => byText(row('My tasks') as HTMLElement, 'button', 'Save') as HTMLButtonElement
    expect(save().disabled).toBe(true)
    await type(field, `${TASK_TOKEN}\n`)
    expect(save().disabled).toBe(false)
    await click(save())
    await until(() => agent.find('PUT', '/connections/my_tasks/account').length === 1)
    expect(agent.find('PUT', '/connections/my_tasks/account')[0]?.body).toEqual({ values: { token: TASK_TOKEN } })
    expect(field.value).toBe('')
    await until(() => row('My tasks')?.querySelector('.account-notice')?.textContent === 'Connected')
    await until(() => texts(row('My tasks')).state === 'Connected · since Nov 21')
    // nowhere in this page's state, its store or the browser's
    expect(JSON.stringify(hub.getSnapshot())).not.toContain(TASK_TOKEN)
    expect(document.body.innerHTML).not.toContain(TASK_TOKEN)
    expect(JSON.stringify({ ...localStorage })).not.toContain(TASK_TOKEN)
  })

  it('checks the value before it is sent, and shows a refusal at its field', async () => {
    const { row, agent } = await accounts([
      ['PUT /connections/my_tasks/account', () => json({ error: 'bad-token', field: 'account.token' }, 422)],
    ])
    await click(byText(row('My tasks') as HTMLElement, 'button', 'Connect'))
    const field = () => row('My tasks')?.querySelector('input[type="password"]') as HTMLInputElement
    await type(field(), 'not-a-task-token-at-all')
    await click(byText(row('My tasks') as HTMLElement, 'button', 'Save'))
    expect(row('My tasks')?.querySelector('.field-error')?.textContent?.trim()).toBe(
      'Fleet support does not take this API token.'
    )
    expect(agent.find('PUT', '/connections/my_tasks/account')).toHaveLength(0)
    // one the agent refuses is named at its field too
    await type(field(), TASK_TOKEN)
    await click(byText(row('My tasks') as HTMLElement, 'button', 'Save'))
    await until(() => agent.find('PUT', '/connections/my_tasks/account').length === 1)
    await until(
      () =>
        row('My tasks')?.querySelector('.field-error')?.textContent?.trim() ===
        'Fleet support does not take this API token.'
    )
    expect(field().value).toBe('')
  })

  it('Cancel closes the fields, empty', async () => {
    const { row } = await accounts()
    await click(byText(row('My tasks') as HTMLElement, 'button', 'Connect'))
    await type(row('My tasks')?.querySelector('input[type="password"]'), TASK_TOKEN)
    await click(byText(row('My tasks') as HTMLElement, 'button', 'Cancel'))
    expect(row('My tasks')?.querySelector('input')).toBeNull()
    await click(byText(row('My tasks') as HTMLElement, 'button', 'Connect'))
    expect(row('My tasks')?.querySelector<HTMLInputElement>('input')?.value).toBe('')
  })
})

describe('Disconnect (UI-CONV-056)', () => {
  it('asks in the page, then disconnects at once and says where to remove the access at the service too', async () => {
    let list: unknown[] = [RELATICLE, GITHUB, TASKS]
    const gone = { ...RELATICLE, state: 'not-connected', account: null }
    const { row, agent } = await accounts(
      [
        [
          'DELETE /connections/accounts/acc_1',
          () => {
            list = [gone, GITHUB, TASKS]
            return json({ connection: gone })
          },
        ],
      ],
      { list: () => list }
    )
    await click(byText(row('Relaticle CRM') as HTMLElement, 'button', 'Disconnect'))
    const question = row('Relaticle CRM')?.querySelector('[role="alertdialog"]') as HTMLElement
    expect(question.querySelector('span')?.textContent).toBe(
      'Disconnect Relaticle CRM? Fleet support deletes its access to your account.'
    )
    expect(agent.find('DELETE', '/connections/accounts/acc_1')).toHaveLength(0)
    await click(byText(question, 'button', 'Cancel'))
    expect(row('Relaticle CRM')?.querySelector('[role="alertdialog"]')).toBeNull()
    await click(byText(row('Relaticle CRM') as HTMLElement, 'button', 'Disconnect'))
    await click(
      byText(row('Relaticle CRM')?.querySelector('[role="alertdialog"]') as HTMLElement, 'button', 'Disconnect')
    )
    await until(() => agent.find('DELETE', '/connections/accounts/acc_1').length === 1)
    await until(
      () =>
        row('Relaticle CRM')?.querySelector('.account-notice')?.textContent ===
        'Disconnected. Relaticle CRM may still list Fleet support in your settings there: you can remove it.'
    )
    await until(() => texts(row('Relaticle CRM')).state === 'Not connected')
  })

  it('says only "Disconnected" when the agent revoked the access at the service', async () => {
    const gone = { ...RELATICLE, state: 'not-connected', account: null, revokesAtSource: true }
    const { row } = await accounts([['DELETE /connections/accounts/acc_1', () => json({ connection: gone })]], {
      list: () => [{ ...RELATICLE, revokesAtSource: true }],
    })
    await click(byText(row('Relaticle CRM') as HTMLElement, 'button', 'Disconnect'))
    await click(
      byText(row('Relaticle CRM')?.querySelector('[role="alertdialog"]') as HTMLElement, 'button', 'Disconnect')
    )
    await until(() => row('Relaticle CRM')?.querySelector('.account-notice')?.textContent === 'Disconnected')
  })
})
