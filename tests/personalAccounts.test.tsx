/**
 * Each person's own account wherever a conversation or a space shows it (tools, phase 2; profile 3.5; agent D104 to
 * D110): the Connect card (UI-CONV-057), a message held back because it carried a credential (UI-CONV-044), the
 * account line of a confirmation and of an approval (UI-CONV-045, UI-APPR-006), the sources of a reply and of a
 * conversation (UI-CONV-047, UI-CONV-048), the tools of a space in About and in its owner's Tools segment, the
 * workspace chosen from the owner's own account (UI-CONV-049, UI-CONV-050), a link to Your accounts in a reply
 * (UI-LINK-001), the words of UI-CONV-058 in the four languages, and the colours of the new surfaces in both themes.
 */
import {
  CONNECTIONS_COPY,
  CONVERSATION_COLORS,
  CONVERSATION_DESIGN,
  type SpaceInfo,
  type TranscriptMessage,
} from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountsPage } from '../src/components/Accounts.js'
import { ConversationRow } from '../src/components/Column.js'
import { Conversation } from '../src/components/Conversation.js'
import { MessageInfo } from '../src/components/Details.js'
import { SharedConversationView } from '../src/components/SharedConversation.js'
import { SpacePage } from '../src/components/SpacePage.js'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'
import type { Hub } from '../src/state/hub.js'
import {
  AGENT,
  byText,
  type Call,
  click,
  fakeAgent,
  json,
  PERSONAL,
  record,
  render,
  SPACES,
  setup,
  space,
  TRUCK,
  tab,
  teardown,
  transcript,
  until,
} from './spacesFixture.js'
import { css, rule } from './stylesheet.js'

beforeAll(setup)
afterEach(() => {
  teardown()
  vi.restoreAllMocks()
})

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const FEATURES = { tools: true, connections: true, queue: true }
const GITHUB = {
  source: 'github',
  title: 'GitHub',
  description: 'Code, issues and pull requests in GitHub',
  method: 'oauth',
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
const RELATICLE = {
  source: 'relaticle',
  title: 'Relaticle CRM',
  description: "The companies, people, notes and tasks of the space's workspace",
  method: 'oauth',
  binding: { name: 'workspace', label: 'Workspace', value: '01JD8', valueLabel: 'ayni-dev-agent' },
  usedIn: [{ kind: 'space', id: 'spc_sales', title: 'Sales EU' }],
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
const SIGN_IN = 'https://github.com/login/oauth/authorize?client_id=Iv1.x'

function fakeTab() {
  const tab = { opener: window as unknown, location: { replace: vi.fn() }, close: vi.fn() }
  vi.spyOn(window, 'open').mockImplementation((() => tab) as never)
  return tab
}

async function announce(hub: Hub, value: Record<string, unknown>) {
  // @ts-expect-error private: the event as the session's stream delivers it
  await hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.connections.changed', value }, undefined, false)
}

// ---------------------------------------------------------------------------------------------------- the Connect card

const connectCard = (content: Record<string, unknown>, id = 'act_c'): TranscriptMessage => ({
  id,
  role: 'activity',
  activityType: 'ayni.connect',
  content,
  at: at(1),
})
const asked: TranscriptMessage = { id: 'u1', role: 'user', content: 'Which issues are open for me?', at: at(3) }
const answered: TranscriptMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'I need your GitHub account for that.',
  at: at(2),
}

async function conversation(
  messages: TranscriptMessage[],
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][] = [],
  list: () => unknown[] = () => [GITHUB, RELATICLE, TASKS]
) {
  const agent = fakeAgent([...routes, ['GET /connections', () => json({ connections: list() })]])
  const hub = await tab({
    sessions: [record({ sessionId: 's1', title: 'Issues' })],
    transcripts: [transcript('s1', messages)],
    spaces: SPACES,
    features: FEATURES,
    profileVersion: '3.5',
    snapshot: { selectedSessionId: 's1', view: 'conversation', leaders: { s1: true } },
  })
  const el = await render(hub, <Conversation />)
  const card = () => el.querySelector<HTMLElement>('.connect-card')
  return { hub, el, agent, card }
}

describe('the Connect card (UI-CONV-057, PROF-TOOL-020)', () => {
  const GITHUB_CARD = {
    source: 'github',
    title: 'GitHub',
    description: 'Code, issues and pull requests in GitHub',
    method: 'oauth',
    why: 'connect',
  }

  it('shows the source, what it is for, and Connect, at its place in the reply; Connect opens the sign-in', async () => {
    const opened = fakeTab()
    let list: unknown[] = [GITHUB, RELATICLE, TASKS]
    const { el, card, agent, hub } = await conversation(
      [asked, answered, connectCard(GITHUB_CARD)],
      [
        [
          'POST /connections/github/authorize',
          () => json({ attemptId: 'att_1', authorizationUrl: SIGN_IN, expiresAt: at(-10) }, 202),
        ],
      ],
      () => list
    )
    await until(() => card()?.querySelector('.connect-state'))
    const c = card() as HTMLElement
    expect(c.closest('.transcript')).toBeTruthy()
    // after the reply it belongs to
    const reply = byText(el, '.msg .body', 'I need your GitHub account for that.') as HTMLElement
    expect(reply.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(c.getAttribute('aria-label')).toBe('GitHub')
    expect(c.querySelector('.connect-title')?.textContent).toBe('GitHub')
    expect(c.querySelector('.connect-description')?.textContent).toBe('Code, issues and pull requests in GitHub')
    expect(c.querySelector('.connect-state')?.textContent).toBe(
      'Connect your GitHub account so that Fleet support can use it with your rights.'
    )
    // it never holds a field
    expect(c.querySelector('input, textarea')).toBeNull()
    await click(byText(c, 'button', 'Connect'))
    await until(() => opened.location.replace.mock.calls.length === 1)
    expect(opened.location.replace).toHaveBeenCalledWith(SIGN_IN)
    expect(agent.find('POST', '/connections/github/authorize')[0]?.body).toEqual({})
    await until(() => card()?.querySelector('.account-waiting'))
    // connected, here or on another device: the card says so, with no control
    list = [GITHUB_CONNECTED, RELATICLE, TASKS]
    await announce(hub, {
      source: 'github',
      state: 'connected',
      label: 'ana-rios',
      attemptId: 'att_1',
      outcome: 'connected',
    })
    await until(() => card()?.querySelector('.connect-state')?.textContent === 'Connected as ana-rios')
    expect(card()?.querySelector('button')).toBeNull()
    expect(card()?.querySelector('.connect-icon')?.tagName.toLowerCase()).toBe('svg')
  })

  it("names the workspace of a space's source, and sends the card's space with the sign-in", async () => {
    fakeTab()
    const { card, agent } = await conversation(
      [
        asked,
        connectCard({
          source: 'relaticle',
          title: 'Relaticle CRM',
          description: "The companies, people, notes and tasks of the space's workspace",
          method: 'oauth',
          why: 'connect',
          binding: { label: 'Workspace', value: '01JD8', valueLabel: 'ayni-dev-agent' },
          spaceId: 'spc_sales',
        }),
      ],
      [
        [
          'POST /connections/relaticle/authorize',
          () => json({ attemptId: 'att_2', authorizationUrl: SIGN_IN, expiresAt: at(-10) }, 202),
        ],
      ]
    )
    await until(() => card()?.querySelector('.connect-state'))
    expect(card()?.querySelector('.connect-binding')?.textContent).toBe('Workspace: ayni-dev-agent')
    await click(byText(card() as HTMLElement, 'button', 'Connect'))
    await until(() => agent.find('POST', '/connections/relaticle/authorize').length === 1)
    expect(agent.find('POST', '/connections/relaticle/authorize')[0]?.body).toEqual({ spaceId: 'spc_sales' })
  })

  it('says why an account must be connected again, with Reconnect', async () => {
    const { card } = await conversation([asked, connectCard({ ...GITHUB_CARD, why: 'reconnect' })], [], () => [
      { ...GITHUB_CONNECTED, state: 'reconnect', reason: 'expired' },
    ])
    await until(() => card()?.querySelector('.connect-state'))
    expect(card()?.querySelector('.connect-state')?.textContent).toBe(
      'GitHub signed you out. Reconnect to use it again.'
    )
    expect(card()?.querySelector('.connect-reconnect-icon')).toBeTruthy()
    expect(byText(card() as HTMLElement, 'button', 'Reconnect')).toBeTruthy()
  })

  it('opens Your accounts at the row of an account of fields, its fields ready there', async () => {
    const { card, hub } = await conversation([
      asked,
      connectCard({
        source: 'my_tasks',
        title: 'My tasks',
        description: 'Lists your open tasks',
        method: 'fields',
        why: 'connect',
      }),
    ])
    await until(() => card()?.querySelector('button'))
    const open = vi.spyOn(window, 'open')
    await click(byText(card() as HTMLElement, 'button', 'Connect'))
    expect(open).not.toHaveBeenCalled()
    expect(hub.getSnapshot().view).toBe('accounts')
    expect(hub.getSnapshot().accountsFor).toEqual({ agentDid: AGENT, focus: { source: 'my_tasks' } })
    teardown()
    const page = await render(hub, <AccountsPage />)
    await until(() => page.querySelector('.account-row'))
    const row = [...page.querySelectorAll<HTMLElement>('.account-row')].find(
      (r) => r.querySelector('.account-title')?.textContent === 'My tasks'
    )
    expect(row?.querySelector('input[type="password"]')).toBeTruthy()
    expect([...page.querySelectorAll('input')]).toHaveLength(1)
  })

  it('is not shown in a conversation shared with its space', async () => {
    fakeAgent([
      [
        /^GET \/spaces\/spc_truck14\/shared\/conv_9\/messages/,
        () =>
          json({
            messages: [
              { id: 'a1', role: 'assistant', content: 'I need your GitHub account.', metadata: { createdAt: at(2) } },
              {
                id: 'act_c',
                role: 'activity',
                activityType: 'ayni.connect',
                content: GITHUB_CARD,
                metadata: { createdAt: at(1) },
              },
            ],
            nextBefore: null,
          }),
      ],
    ])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: {
        view: 'shared',
        sharedFor: {
          agentDid: AGENT,
          spaceId: TRUCK.id,
          conversation: {
            id: 'conv_9',
            title: 'Issues',
            author: { name: 'Jonas Weber' },
            sharedAt: at(1),
            lastActivityAt: at(1),
          },
        },
      },
    })
    const el = await render(hub, <SharedConversationView />)
    await until(() => byText(el, '.msg .body', 'I need your GitHub account.'))
    expect(el.querySelector('.connect-card')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------- a credential

describe('a message held back because it carried a credential (UI-CONV-044, agent D109)', () => {
  const SENT = 'my token is ghp_abcdefghijklmnopqrstuvwxyz0123456789 use it'
  const KEPT = 'my token is ghp_… use it'

  it('takes the text the agent kept, in the transcript, the store and the row, drawn as not shared with the AI', async () => {
    const mine: TranscriptMessage = { id: 'u_run1', role: 'user', content: SENT, at: at(1) }
    fakeAgent([])
    const hub = await tab({
      sessions: [record({ sessionId: 's1', title: SENT.slice(0, 60), lastPreview: SENT })],
      transcripts: [transcript('s1', [mine])],
      spaces: SPACES,
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', view: 'conversation' },
    })
    const el = await render(hub, <Conversation />)
    // @ts-expect-error private: the event in the run that carried the message
    await hub.onEvent(
      's1',
      {
        type: 'CUSTOM',
        name: 'ayni.messages.withheld',
        value: {
          conversationId: 'conv_s1',
          messageIds: ['msg_9'],
          clientIds: ['u_run1'],
          reason: 'credential',
          texts: { msg_9: KEPT },
        },
      },
      undefined,
      true
    )
    await until(() => el.querySelector('.msg.user.withheld'))
    const bubble = el.querySelector('.msg.user.withheld') as HTMLElement
    expect(bubble.querySelector('.body')?.textContent).toBe(KEPT)
    expect(bubble.querySelector('.withheld-label')?.textContent).toBe('Not shared with the AI')
    // @ts-expect-error private: the device's store
    const store = hub.store
    expect((await store.getTranscript('s1'))?.messages[0]?.content).toBe(KEPT)
    const held = await store.getSession('s1')
    expect([held?.title, held?.lastPreview]).toEqual([KEPT, KEPT])
    expect(JSON.stringify(hub.getSnapshot())).not.toContain('abcdefghijklmnopqrstuvwxyz')
    expect(el.innerHTML).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })

  it('its Info says it looked like a password or a key, from history too', async () => {
    fakeAgent([])
    const message = { id: 'msg_9', role: 'user', content: KEPT, at: at(1), modelVisible: false, withheld: 'credential' }
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      transcripts: [transcript('s1', [message as TranscriptMessage])],
      spaces: SPACES,
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', inspect: { sessionId: 's1', messageId: 'msg_9' } },
    })
    const el = await render(hub, <MessageInfo />)
    expect(el.querySelector('.withheld-note')?.textContent).toBe(
      'This looked like a password or a key. Fleet support did not keep it and did not show it to the AI. To connect an account, open Your accounts.'
    )
    teardown()
    // an email code keeps its own words
    const code = await tab({
      sessions: [record({ sessionId: 's1' })],
      transcripts: [transcript('s1', [{ ...message, withheld: undefined } as TranscriptMessage])],
      snapshot: { selectedSessionId: 's1', inspect: { sessionId: 's1', messageId: 'msg_9' } },
    })
    const other = await render(code, <MessageInfo />)
    expect(other.querySelector('.withheld-note')?.textContent).toBe(
      "Only the service's code read this. It was not shared with the AI."
    )
  })
})

// ---------------------------------------------------------------------------------------------------- call cards

const confirmation = (account: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  approvalId: 'apr_1',
  kind: 'confirmation',
  status: 'PENDING',
  expiresAt: at(-5),
  requester: { displayName: 'Ana Ríos', role: 'sales' },
  tool: 'add_issue_comment',
  action: {
    title: 'Comment on an issue',
    source: { id: 'github', title: 'GitHub' },
    account,
    fields: [{ label: 'Comment', value: 'Fixed in #12.' }],
    erased: false,
  },
  allowForConversation: true,
  ...over,
})
const approvalCard = (content: Record<string, unknown>): TranscriptMessage => ({
  id: 'act_1',
  role: 'activity',
  activityType: 'ayni.approval',
  content,
  at: at(1),
})

describe("the account line of a call made with the person's own account (UI-CONV-045, UI-APPR-006)", () => {
  it('reads "With your account <label>" on the person\'s card, "With your own account" with no label', async () => {
    const labelled = await conversation([asked, approvalCard(confirmation({ kind: 'personal', label: 'ana-rios' }))])
    expect(labelled.el.querySelector('.tool-account')?.textContent).toBe('With your account ana-rios')
    teardown()
    const bare = await conversation([asked, approvalCard(confirmation({ kind: 'personal' }))])
    expect(bare.el.querySelector('.tool-account')?.textContent).toBe('With your own account')
  })

  it("reads \"With <requester>'s own account\" on the approver's card, and the label on the requester's", async () => {
    const approval = (over: Record<string, unknown>, account: Record<string, unknown>) => ({
      approvalId: 'apr_2',
      kind: 'sensitivity',
      status: 'PENDING',
      tool: 'issue_write',
      requester: { displayName: 'Ana Ríos', role: 'engineer' },
      policy: 'approval',
      expiresAt: at(-30),
      action: {
        title: 'Open or change an issue',
        source: { id: 'github-project', title: 'GitHub repository' },
        account,
        fields: [{ label: 'Title', value: 'Flaky test' }],
        erased: false,
      },
      ...over,
    })
    const approver = await conversation([approvalCard(approval({ canDecide: true }, { kind: 'personal' }))])
    expect(approver.el.querySelector('.tool-approval-head')?.textContent).toBe('Ana Ríos asks for your approval')
    expect(approver.el.querySelector('.tool-account')?.textContent).toBe("With Ana Ríos's own account")
    teardown()
    const requester = await conversation([
      approvalCard(approval({ own: true }, { kind: 'personal', label: 'ana-rios' })),
    ])
    expect(requester.el.querySelector('.tool-account')?.textContent).toBe('With your account ana-rios')
  })
})

// ---------------------------------------------------------------------------------------------------- sources

describe("the sources read with the person's own account (UI-CONV-047, UI-CONV-048)", () => {
  const PERSONAL_SOURCE = { source: 'github', title: 'GitHub', account: 'personal' }

  it('reads "<source>, your own account" in a reply\'s Info', async () => {
    fakeAgent([])
    const reply = { id: 'a1', role: 'assistant', content: 'Two issues.', at: at(1), sources: [PERSONAL_SOURCE] }
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      transcripts: [transcript('s1', [reply as TranscriptMessage])],
      spaces: SPACES,
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: { selectedSessionId: 's1', inspect: { sessionId: 's1', messageId: 'a1' } },
    })
    const el = await render(hub, <MessageInfo />)
    expect(el.querySelector('dd.sources')?.textContent).toBe('GitHub, your own account')
  })

  it('reads "<source>, <author>\'s own account" in a conversation shared with the space', async () => {
    fakeAgent([
      [
        /^GET \/spaces\/spc_truck14\/shared\/conv_9\/messages/,
        () =>
          json({
            messages: [
              {
                id: 'a1',
                role: 'assistant',
                content: 'Two issues.',
                metadata: { createdAt: at(1), sources: [PERSONAL_SOURCE] },
              },
            ],
            nextBefore: null,
          }),
      ],
    ])
    const hub = await tab({
      sessions: [record({ sessionId: 's1' })],
      spaces: SPACES,
      features: FEATURES,
      profileVersion: '3.5',
      snapshot: {
        view: 'shared',
        sharedFor: {
          agentDid: AGENT,
          spaceId: TRUCK.id,
          conversation: {
            id: 'conv_9',
            title: 'Issues',
            author: { name: 'Jonas Weber' },
            sharedAt: at(1),
            lastActivityAt: at(1),
          },
        },
      },
    })
    const el = await render(hub, <SharedConversationView />)
    await until(() => el.querySelector('.shared-info'))
    await click(el.querySelector('.shared-info'))
    await until(() => document.querySelector('[role="dialog"] dd.sources'))
    expect(document.querySelector('[role="dialog"] dd.sources')?.textContent).toBe("GitHub, Jonas Weber's own account")
  })

  it("names the person's own account before sharing", async () => {
    fakeAgent([
      [
        'GET /conversations/conv_s3/sources',
        () =>
          json({
            sources: [{ source: 'github', title: 'GitHub', account: { kind: 'personal' }, results: 2, lastAt: 'x' }],
          }),
      ],
    ])
    const hub = await tab({
      sessions: [record({ sessionId: 's3', title: 'Issues', spaceId: TRUCK.id })],
      spaces: SPACES,
      features: FEATURES,
      profileVersion: '3.5',
    })
    const el = await render(hub, <ConversationRow session={hub.getSnapshot().sessions[0]} selected={false} />)
    await click(el.querySelector('[aria-label="Agent options"]'))
    await click(byText(el, '[role="menuitem"]', 'Share with Truck 14 recall'))
    await until(() => document.querySelector('.share-sources li'))
    expect(document.querySelector('.share-sources li')?.textContent).toBe('GitHub, with your own account · 2 results')
  })
})

// ---------------------------------------------------------------------------------------------------- a space's tools

const SALES_MEMBER: SpaceInfo = space({
  id: 'spc_sales',
  title: 'Sales EU',
  role: 'member',
  owner: { name: 'Jonas Weber' },
})
const SALES_OWNER: SpaceInfo = { ...SALES_MEMBER, role: 'owner' }
const TOOLS_PATH = '/spaces/spc_sales/tools'
const crm = (over: Record<string, unknown> = {}) => ({
  source: 'relaticle',
  title: 'Relaticle CRM',
  description: "The companies, people, notes and tasks of the space's workspace",
  state: 'ready',
  add: 'auto',
  guests: false,
  account: { kind: 'personal', connected: false },
  bindings: [
    {
      name: 'workspace',
      label: 'Workspace',
      value: '01JD8',
      valueLabel: 'ayni-dev-agent',
      setBy: 'owner',
      fromAccount: true,
      choices: [
        { value: '01JD8', valueLabel: 'ayni-dev-agent' },
        { value: '01JPA', valueLabel: 'Partners' },
      ],
    },
  ],
  tools: [
    {
      name: 'list-companies-tool',
      title: 'List companies',
      effect: 'read',
      rule: 'none',
      packRule: 'none',
      stepUp: null,
    },
    {
      name: 'create-note-tool',
      title: 'Add a note',
      effect: 'write',
      rule: 'confirm',
      packRule: 'confirm',
      stepUp: null,
    },
  ],
  pending: null,
  ...over,
})

async function spacePage(
  role: 'member' | 'owner',
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][],
  segment: 'about' | 'tools'
) {
  const agent = fakeAgent(routes)
  const sales = role === 'owner' ? SALES_OWNER : SALES_MEMBER
  const hub = await tab({
    sessions: [record({ sessionId: 's1' })],
    spaces: { spaces: [PERSONAL, sales], templates: [] },
    features: FEATURES,
    profileVersion: '3.5',
    snapshot: { view: 'space', spaceFor: { agentDid: AGENT, spaceId: 'spc_sales', segment } },
  })
  const el = await render(hub, <SpacePage />)
  return { agent, hub, el }
}

describe("a space's tool of each person's own account (UI-CONV-049, UI-CONV-050)", () => {
  it('tells a member in About that each person uses their own, whether theirs is connected, and Connect', async () => {
    let connected = false
    const { el, hub, agent } = await spacePage(
      'member',
      [
        [
          `GET ${TOOLS_PATH}`,
          () => json({ tools: [crm({ account: { kind: 'personal', connected }, add: undefined, bindings: [] })] }),
        ],
      ],
      'about'
    )
    await until(() => el.querySelector('.about-tool'))
    const tool = el.querySelector('.about-tool') as HTMLElement
    expect(tool.querySelector('.about-tool-account')?.textContent).toBe('Each person uses their own account')
    expect(tool.querySelector('.about-tool-yours')?.textContent).toBe('Your account: not connectedConnect')
    await click(byText(tool, 'button', 'Connect'))
    expect(hub.getSnapshot().view).toBe('accounts')
    expect(hub.getSnapshot().accountsFor).toEqual({
      agentDid: AGENT,
      focus: { source: 'relaticle', spaceId: 'spc_sales' },
    })
    // once the person's account is connected, About reads it again and says so
    hub.setView('space')
    connected = true
    const reads = agent.find('GET', TOOLS_PATH).length
    await announce(hub, { source: 'relaticle', state: 'connected', outcome: 'connected', label: 'ana@2060.io' })
    await until(() => agent.find('GET', TOOLS_PATH).length > reads)
    await until(() => el.querySelector('.about-tool-yours')?.textContent === 'Your account: connected')
    expect(byText(el, 'button', 'Connect')).toBeUndefined()
  })

  it("opens the row of the source whose account a tool uses, as the space's tools name it (ayni-spec #110)", async () => {
    // GitHub repository uses the person's GitHub account: Your accounts lists it under GitHub
    const project = {
      source: 'github-project',
      title: 'GitHub repository',
      description: "The issues of the project's repository",
      state: 'ready',
      guests: false,
      account: { kind: 'personal', connected: false, source: 'github' },
      bindings: [],
      tools: [{ title: 'Comment on an issue', effect: 'write', rule: 'confirm', stepUp: null }],
      pending: null,
    }
    const github = { ...GITHUB, usedIn: [{ kind: 'personal' }, { kind: 'space', id: 'spc_sales', title: 'Sales EU' }] }
    const { el, hub } = await spacePage(
      'member',
      [
        [`GET ${TOOLS_PATH}`, () => json({ tools: [project] })],
        ['GET /connections', () => json({ connections: [RELATICLE, github, TASKS] })],
      ],
      'about'
    )
    await until(() => el.querySelector('.about-tool'))
    await click(byText(el.querySelector('.about-tool') as HTMLElement, 'button', 'Connect'))
    expect(hub.getSnapshot().accountsFor).toEqual({
      agentDid: AGENT,
      focus: { source: 'github', spaceId: 'spc_sales' },
    })
    teardown()
    const page = await render(hub, <AccountsPage />)
    await until(() => page.querySelector('.account-row'))
    const row = [...page.querySelectorAll<HTMLElement>('.account-item')].find(
      (r) => r.querySelector('.account-title')?.textContent === 'GitHub'
    )
    expect(row?.contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.textContent).toBe('Connect')
  })

  it('signs the owner in to the source whose account a tool uses, to choose its binding (ayni-spec #110)', async () => {
    fakeTab()
    const { el, agent } = await spacePage(
      'owner',
      [
        [
          `GET ${TOOLS_PATH}`,
          () =>
            json({
              tools: [
                crm({
                  source: 'relaticle-team',
                  state: 'setup',
                  account: { kind: 'personal', connected: false, source: 'relaticle' },
                  bindings: [
                    {
                      name: 'workspace',
                      label: 'Workspace',
                      value: null,
                      setBy: 'owner',
                      fromAccount: true,
                      choices: [],
                    },
                  ],
                }),
              ],
            }),
        ],
        [
          'POST /connections/relaticle/authorize',
          () =>
            json(
              {
                attemptId: 'att_8',
                authorizationUrl: 'https://crm.2060.io/oauth/authorize?x',
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              },
              202
            ),
        ],
      ],
      'tools'
    )
    await until(() => el.querySelector('.tool-row'))
    await click(el.querySelector('.tool-row-main'))
    await click(byText(el, 'button', 'Connect your account to choose'))
    await until(() => agent.find('POST', '/connections/relaticle/authorize').length === 1)
    expect(agent.find('POST', '/connections/relaticle/authorize')[0]?.body).toEqual({ spaceId: 'spc_sales' })
    expect(agent.find('POST', '/connections/relaticle-team/authorize')).toHaveLength(0)
  })

  it("shows the owner no account to set, and the workspace chosen from the owner's own accounts", async () => {
    const { el, agent } = await spacePage(
      'owner',
      [
        [`GET ${TOOLS_PATH}`, () => json({ tools: [crm()] })],
        [
          `PATCH ${TOOLS_PATH}/relaticle`,
          () =>
            json(
              {
                tool: crm({
                  pending: {
                    changeId: 'chg_1',
                    summary: 'Bind Relaticle CRM in Sales EU to Partners',
                    code: '48 21',
                    expiresAt: new Date(Date.now() + 300_000).toISOString(),
                  },
                }),
              },
              202
            ),
        ],
      ],
      'tools'
    )
    await until(() => el.querySelector('.tool-row'))
    await click(el.querySelector('.tool-row-main'))
    const account = el.querySelector('[aria-label="Account"]') as HTMLElement
    expect(account.querySelector('.rule-line')?.textContent).toBe(
      'Each person connects their own account, in Your accounts.'
    )
    expect(el.querySelector('input[type="password"]')).toBeNull()
    // chosen, never typed
    const choice = el.querySelector('.tool-choice') as HTMLElement
    expect(choice.querySelector('legend')?.textContent).toBe('Workspace')
    expect(choice.querySelector('.tool-choice-current')?.textContent).toBe('Workspace: ayni-dev-agent')
    expect(choice.querySelector('input[type="text"], input:not([type])')).toBeNull()
    const options = [...choice.querySelectorAll<HTMLLabelElement>('.tool-choice-option')]
    expect(options.map((o) => o.textContent)).toEqual(['Use ayni-dev-agent', 'Use Partners'])
    expect(options[0]?.querySelector('input')?.checked).toBe(true)
    await click(options[1]?.querySelector('input'))
    await click(byText(el, 'button.settings-save', 'Save'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/relaticle`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/relaticle`)[0]?.body).toEqual({ bindings: { workspace: '01JPA' } })
    // the choice goes through the phone as any binding
    await until(() => el.querySelector('.tool-pending'))
    expect(el.querySelector('.tool-pending-text')?.textContent).toContain('Confirm on your phone · Code 48 21')
  })

  it('lets an owner who holds no account of the source connect one to choose, then offers its workspace', async () => {
    const opened = fakeTab()
    let choices: unknown[] = []
    const { el, agent, hub } = await spacePage(
      'owner',
      [
        [
          `GET ${TOOLS_PATH}`,
          () =>
            json({
              tools: [
                crm({
                  state: 'setup',
                  bindings: [
                    { name: 'workspace', label: 'Workspace', value: null, setBy: 'owner', fromAccount: true, choices },
                  ],
                }),
              ],
            }),
        ],
        [
          'POST /connections/relaticle/authorize',
          () =>
            json(
              {
                attemptId: 'att_7',
                authorizationUrl: 'https://crm.2060.io/oauth/authorize?x',
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              },
              202
            ),
        ],
      ],
      'tools'
    )
    await until(() => el.querySelector('.tool-row'))
    await click(el.querySelector('.tool-row-main'))
    expect(el.querySelector('.tool-choice-option')).toBeNull()
    await click(byText(el, 'button', 'Connect your account to choose'))
    await until(() => agent.find('POST', '/connections/relaticle/authorize').length === 1)
    // for the space, with no value expected
    expect(agent.find('POST', '/connections/relaticle/authorize')[0]?.body).toEqual({ spaceId: 'spc_sales' })
    await until(() => opened.location.replace.mock.calls.length === 1)
    await until(() => el.querySelector('.tool-choice .account-waiting'))
    choices = [{ value: '01JD8', valueLabel: 'ayni-dev-agent' }]
    await announce(hub, {
      source: 'relaticle',
      binding: { value: '01JD8', valueLabel: 'ayni-dev-agent' },
      state: 'connected',
      label: 'jonas@2060.io · ayni-dev-agent',
      attemptId: 'att_7',
      outcome: 'connected',
    })
    await until(() => el.querySelector('.tool-choice-option')?.textContent === 'Use ayni-dev-agent')
    expect(el.querySelector('.tool-choice .account-waiting')).toBeNull()
  })

  it("names a value that is not one of the owner's own accounts at its field", async () => {
    const { el, agent } = await spacePage(
      'owner',
      [
        [`GET ${TOOLS_PATH}`, () => json({ tools: [crm()] })],
        [`PATCH ${TOOLS_PATH}/relaticle`, () => json({ error: 'not-your-account', field: 'bindings.workspace' }, 422)],
      ],
      'tools'
    )
    await until(() => el.querySelector('.tool-row'))
    await click(el.querySelector('.tool-row-main'))
    await click(el.querySelectorAll('.tool-choice-option input')[1])
    await click(byText(el, 'button.settings-save', 'Save'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/relaticle`).length === 1)
    await until(() => el.querySelector('.tool-choice .field-error'))
    expect(el.querySelector('.tool-choice .field-error')?.textContent?.trim()).toBe(
      'Choose one of your own accounts of Relaticle CRM.'
    )
  })
})

// ---------------------------------------------------------------------------------------------------- a link

describe('a link to Your accounts in a reply (UI-LINK-001)', () => {
  it('opens Your accounts of that agent in place, named on hover', async () => {
    const link = `${location.origin}/app/service/${AGENT}/accounts`
    const reply: TranscriptMessage = {
      id: 'a1',
      role: 'assistant',
      content: `Connect it in [Your accounts](${link}).`,
      at: at(1),
    }
    const { el, hub } = await conversation([asked, reply])
    const anchor = el.querySelector<HTMLAnchorElement>('a[data-app-link]') as HTMLAnchorElement
    expect(anchor.title).toBe('Your accounts')
    await click(anchor)
    expect(hub.getSnapshot().view).toBe('accounts')
    expect(hub.getSnapshot().accountsFor).toEqual({ agentDid: AGENT })
  })
})

// ---------------------------------------------------------------------------------------------------- the words

type Tree = { [key: string]: string | Tree }
const at$ = (tree: Tree, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree)

describe("the words of each person's own accounts (UI-CONV-058)", () => {
  /** The table of UI-CONV-058, each row as the spec writes it, with the path of its words here. */
  const TABLE: [string, string][] = [
    ['accounts.menu', 'Your accounts'],
    ['accounts.title', 'Your accounts in {{agent}}'],
    ['accounts.intro', '{{agent}} uses these accounts with your own rights at each service. Only you connect them.'],
    ['accounts.usedIn.all', 'Used in all your conversations'],
    ['accounts.usedIn.places', 'Used in {{places}}'],
    ['spaces.personal', 'Personal'],
    ['accounts.usedIn.none', 'Not used now'],
    ['accounts.binding', '{{label}}: {{value}}'],
    ['accounts.state.notConnected', 'Not connected'],
    ['accounts.state.connected', 'Connected as {{label}} · since {{date}}'],
    ['accounts.state.connectedNoLabel', 'Connected · since {{date}}'],
    ['accounts.state.moreAccess', '{{source}} asks for more access. Reconnect to give it.'],
    ['accounts.state.expired', '{{source}} signed you out. Reconnect to use it again.'],
    ['accounts.state.revoked', '{{source}} no longer accepts this connection. Reconnect to use it again.'],
    ['accounts.state.changed', '{{agent}} changed how it connects to {{source}}. Reconnect to use it again.'],
    ['accounts.connect', 'Connect'],
    ['accounts.reconnect', 'Reconnect'],
    ['accounts.disconnect', 'Disconnect'],
    ['accounts.cancel', 'Cancel'],
    ['accounts.waiting', 'Finish in the browser · {{time}} left'],
    ['accounts.outcome.connected', 'Connected as {{label}}'],
    ['accounts.outcome.connectedNoLabel', 'Connected'],
    ['accounts.outcome.denied', 'Not connected: you did not allow {{agent}} at {{source}}.'],
    ['accounts.outcome.failed', 'Not connected: {{source}} did not complete the sign-in. Try again.'],
    ['accounts.outcome.expired', 'Not connected in time. Try again.'],
    ['accounts.outcome.cancelled', 'Cancelled. Nothing changed.'],
    [
      'accounts.outcome.wrongBinding',
      'Not connected: this account is for {{chosen}}. Connect again and choose {{expected}}.',
    ],
    [
      'accounts.outcome.wrongPerson',
      'Not connected: this {{source}} account is not yours. Connect again with your own.',
    ],
    ['accounts.unavailable', '{{source}} cannot be connected now. Try again later.'],
    ['accounts.notOffered', 'This account is not offered to you.'],
    ['accounts.changed', 'This account has changed. Open Your accounts again.'],
    ['accounts.disconnectConfirm', 'Disconnect {{source}}? {{agent}} deletes its access to your account.'],
    [
      'accounts.outcome.disconnected',
      'Disconnected. {{source}} may still list {{agent}} in your settings there: you can remove it.',
    ],
    ['accounts.outcome.disconnectedRevoked', 'Disconnected'],
    ['accounts.card.connect', 'Connect your {{source}} account so that {{agent}} can use it with your rights.'],
    ['tools.card.accountYours', 'With your account {{label}}'],
    ['tools.card.accountOwn', 'With your own account'],
    ['tools.card.accountRequester', "With {{requester}}'s own account"],
    ['tools.sources.personal', '{{source}}, your own account'],
    ['tools.sources.personalOf', "{{source}}, {{author}}'s own account"],
    ['tools.share.personal_other', '{{source}}, with your own account · {{count}} results'],
    ['tools.share.personal_one', '{{source}}, with your own account · {{count}} result'],
    ['tools.account.personal', 'Each person uses their own account'],
    ['tools.yourAccount.connected', 'Your account: connected'],
    ['tools.yourAccount.notConnected', 'Your account: not connected'],
    ['tools.accountPersonal', 'Each person connects their own account, in Your accounts.'],
    ['tools.useValue', 'Use {{value}}'],
    ['tools.connectToChoose', 'Connect your account to choose'],
    ['tools.notYourAccount', 'Choose one of your own accounts of {{source}}.'],
    [
      'conversation.withheldCredentialInfo',
      'This looked like a password or a key. {{agent}} did not keep it and did not show it to the AI. To connect an account, open Your accounts.',
    ],
  ]

  it('says each row of the table as the spec writes it, as the core gives it to the app', () => {
    for (const [path, words] of TABLE) expect(at$(en as Tree, path), path).toBe(words)
    for (const [path, words] of Object.entries(CONNECTIONS_COPY)) expect(at$(en as Tree, path), path).toBe(words)
    const shared = new Set(Object.keys(CONNECTIONS_COPY))
    for (const [path] of TABLE) if (path !== 'spaces.personal') expect(shared.has(path), path).toBe(true)
  })

  it('says every one of them in the four languages, with what the screen puts in', () => {
    const names = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
    for (const path of [...Object.keys(CONNECTIONS_COPY), 'link.destination.serviceAccounts'])
      for (const [lang, tree] of Object.entries({ es, fr, pt })) {
        const other = at$(tree as Tree, path) as string
        expect(other, `${lang}.${path}`).toBeTruthy()
        expect(names(other), `${lang}.${path}`).toEqual(names(at$(en as Tree, path) as string))
      }
  })
})

// ---------------------------------------------------------------------------------------------------- the colours

/** The relative luminance and contrast of WCAG 2.2, from the stylesheet's tokens. */
const token = (name: string) => {
  const value = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(css)?.[1]
  if (!value) throw new Error(`no --${name}`)
  return value
}
const rgb = (c: string) =>
  c.startsWith('#') ? [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16)) : (c.match(/\d+/g) ?? []).map(Number)
const luminance = (c: string) => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
const blend = (a: string, share: number, b: string) => {
  const [x, y] = [rgb(a), rgb(b)]
  return `rgb(${x.map((v, i) => Math.round(v * share + (y[i] as number) * (1 - share))).join(', ')})`
}
const role = (name: string) => `var(--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`

describe('the new surfaces in both themes: light, dark by choice and dark by system (WCAG 2.2 AA)', () => {
  it('paint the Connect card as the shared design says', () => {
    const d = CONVERSATION_DESIGN.connectCard
    const C = CONVERSATION_COLORS.connectCard
    const title = rule('.connect-card .connect-title')
    expect(title['font-size']).toBe(`${d.titleFontSize}px`)
    expect(title['font-weight']).toBe(String(d.titleWeight))
    expect(title.color).toBe(role(C.title))
    const muted = rule('.connect-card .connect-description,\n.connect-card .connect-binding')
    expect(muted['font-size']).toBe(`${d.descriptionFontSize}px`)
    expect(muted.color).toBe(role(C.description))
    expect(C.binding).toBe(C.description)
    const state = rule('.connect-card .connect-state')
    expect(state['font-size']).toBe(`${d.stateFontSize}px`)
    expect(state.color).toBe(role(C.state))
    expect(rule('.connect-icon').color).toBe(role(C.icon))
    expect(rule('.connect-reconnect-icon').color).toBe(role(C.reconnect))
    expect(rule('.card.connect-card').gap).toBe(`${d.gap}px`)
  })

  it('read on both palettes, the figures as the PR states them', () => {
    // dark by choice and dark by system take the same dark tokens: each dark block maps every role used here
    const block = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`${escaped} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    }
    const system = block('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])')
    const chosen = block(':root[data-theme="dark"]')
    for (const dark of [system, chosen])
      for (const r of ['bg', 'surface', 'text', 'muted', 'border', 'accent'])
        expect(dark, `--${r} in a dark block`).toContain(`--${r}: var(--dark-${r});`)
    // the colours the new rules paint with
    expect(rule('.account-title').color).toBe('var(--text)')
    expect(rule('.account-description,\n.account-binding,\n.account-used').color).toBe('var(--muted)')
    expect(rule('.account-state').color).toBe('var(--text)')
    expect(rule('.account-reconnect-icon').color).toBe('var(--warning)')
    expect(rule('.account-row').background).toBe('var(--bg)')
    expect(rule('.about-tool-yours').color).toBe('var(--text)')
    const figures: Record<string, Record<string, number>> = {}
    for (const scheme of ['light', 'dark']) {
      const of = (r: string) => (r === 'warning' || r === 'danger' ? token(r) : token(`${scheme}-${r}`))
      const page = of('bg')
      const card = of('surface')
      const waiting = blend(of('accent'), 0.1, page)
      const f = {
        // Your accounts, on the page's ground
        rowTitle: contrast(of('text'), page),
        rowMuted: contrast(of('muted'), page),
        rowReconnectIcon: contrast(of('warning'), page),
        waitingWords: contrast(of('text'), waiting),
        waitingIcon: contrast(of('accent'), waiting),
        disconnect: contrast(blend(of('danger'), 0.6, of('text')), blend(of('danger'), 0.08, page)),
        connectButton: contrast(of('accentContrast'), of('accent')),
        // the Connect card, on the transcript's card
        cardTitle: contrast(of(CONVERSATION_COLORS.connectCard.title), card),
        cardMuted: contrast(of(CONVERSATION_COLORS.connectCard.description), card),
        cardIcon: contrast(of(CONVERSATION_COLORS.connectCard.icon), card),
        cardReconnectIcon: contrast(of(CONVERSATION_COLORS.connectCard.reconnect), card),
        // an outcome refused, on the danger tint of the card
        error: contrast(of('text'), blend(of('danger'), 0.12, card)),
        // Connect in About, the accent as a link on the page
        link: contrast(of('accent'), page),
      }
      for (const [name, value] of Object.entries(f)) {
        const text = !name.endsWith('Icon') && name !== 'waitingIcon'
        expect(value, `${scheme}: ${name}`).toBeGreaterThanOrEqual(text ? 4.5 : 3)
      }
      figures[scheme] = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 100) / 100]))
    }
    expect(figures).toEqual({
      light: {
        rowTitle: 17.74,
        rowMuted: 4.83,
        rowReconnectIcon: 5.02,
        waitingWords: 15.42,
        waitingIcon: 4.76,
        disconnect: 9.47,
        connectButton: 5.47,
        cardTitle: 16.98,
        cardMuted: 4.63,
        cardIcon: 4.63,
        cardReconnectIcon: 4.81,
        error: 13.83,
        link: 5.47,
      },
      dark: {
        rowTitle: 17.01,
        rowMuted: 7.37,
        rowReconnectIcon: 3.73,
        waitingWords: 14.39,
        waitingIcon: 8.51,
        disconnect: 5.48,
        connectButton: 7.77,
        cardTitle: 16.12,
        cardMuted: 6.99,
        cardIcon: 6.99,
        cardReconnectIcon: 3.53,
        error: 15.42,
        link: 10.06,
      },
    })
  })
})
