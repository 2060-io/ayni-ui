/**
 * A team space's managed folder on the web (profile package 3.5.9; agent D145 to D150), in the browser of Jonas Weber,
 * owner of Project Alpha, and of Ana Ríos, a member: Add with the two modes of Files (UI-CONV-069), the folder on the
 * row, in the panel and in About with its state and its controls (UI-CONV-070), the members' access in Members and the
 * people added outside, the item `folder-access` of the Notifications with its badge (UI-CONV-071), the folder in
 * Activity (UI-CONV-051), the words said before removing Files or changing its provider (UI-CONV-052, agent
 * TOOL-FEAT-032), and every refusal of the wire at its field.
 */
import type { SpaceInfo } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SpacePage } from '../src/components/SpacePage.js'
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
  setup,
  space,
  tab,
  teardown,
  type,
  until,
} from './spacesFixture.js'

beforeAll(setup)
afterEach(teardown)

const ALPHA: SpaceInfo = space({
  id: 'spc_alpha',
  title: 'Project Alpha',
  role: 'owner',
  owner: { name: 'Jonas Weber' },
})
const ALPHA_ANA: SpaceInfo = { ...ALPHA, role: 'member' }
const TOOLS_PATH = '/spaces/spc_alpha/tools'
const FEATURES = { tools: true, connections: true, notifications: true }

/** The page of Project Alpha on a segment, as Jonas (its owner) or Ana (a member) reads it. */
async function alpha(
  routes: [string | RegExp, (call: Call) => Response | Promise<Response>][],
  options: { segment?: string; member?: boolean; waiting?: number } = {}
) {
  const agent = fakeAgent(routes)
  const listed = { ...(options.member ? ALPHA_ANA : ALPHA), notificationsWaiting: options.waiting ?? 0 }
  const hub = await tab({
    sessions: [record({ sessionId: 's1' })],
    spaces: { spaces: [PERSONAL, listed], templates: [] },
    features: FEATURES,
    profileVersion: '3.5',
    snapshot: {
      view: 'space',
      spaceFor: { agentDid: AGENT, spaceId: ALPHA.id, segment: (options.segment ?? 'tools') as never },
    },
  })
  const el = await render(hub, <SpacePage />)
  return { agent, hub, el }
}

/** The agent says, on Jonas's session stream, that one of his notifications changed (PROF-TOOL-025). */
async function announceNotice(hub: Hub, value: Record<string, unknown>) {
  // @ts-expect-error private: the event as the session's stream delivers it
  await hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.space.notifications.changed', value }, undefined, false)
}

const tabOf = (el: HTMLElement, name: RegExp) =>
  [...el.querySelectorAll<HTMLElement>('[role="tab"]')].find((x) => name.test(x.textContent ?? ''))

// ---------------------------------------------------------------------------------------------- the Notifications

/** Piet's access refused, as §3.12 gives it to Jonas (PROF-TOOL-042). */
const folderAccessItem = (over: Record<string, unknown> = {}, reason = 'not-allowed') => ({
  id: 'ntc_piet',
  kind: 'folder-access',
  at: '2026-11-25T10:00:00Z',
  waiting: true,
  folderAccess: {
    member: { name: 'Piet de Vries' },
    feature: { id: 'files', title: 'Files' },
    source: { id: 'drive', title: 'Google Drive' },
    folder: { title: 'Project Alpha' },
    reason,
  },
  ...over,
})
const notices = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.notice[data-kind="folder-access"]')]

describe('the item folder-access of the Notifications (UI-CONV-071, PROF-TOOL-042)', () => {
  it('shows the member and the reason, counts it in the badge, and Try again checks the folder again', async () => {
    let waiting = true
    const { el, agent } = await alpha(
      [
        [
          /^GET \/spaces\/spc_alpha\/notifications\?/,
          () => json({ notifications: [folderAccessItem({ waiting })], nextBefore: null, waiting: waiting ? 1 : 0 }),
        ],
        [
          `PATCH ${TOOLS_PATH}/drive`,
          () => {
            waiting = false
            return json({ tool: MANAGED }, 202)
          },
        ],
      ],
      { segment: 'notifications', waiting: 1 }
    )
    await until(() => notices(el).length === 1)
    expect(tabOf(el, /^Notifications/)?.querySelector('.notifications-count')?.textContent).toContain('1')
    const n = notices(el)[0] as HTMLElement
    const words =
      'Piet de Vries has no access to the folder Project Alpha yet: your organization does not let this folder take people outside it'
    expect(n.querySelector('.notice-text')?.textContent).toBe(words)
    expect(n.getAttribute('aria-label')).toBe(words)
    await click(byText(n, 'button', 'Try again'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/drive`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/drive`)[0]?.body).toEqual({ folder: { check: true } })
    // read again: in place now, it reads as past, with no control
    await until(() => notices(el)[0]?.classList.contains('past'))
    expect(byText(notices(el)[0] as HTMLElement, 'button', 'Try again')).toBeUndefined()
  })

  it('words each reason with the provider and the agent, and one the table does not word as the activity does', async () => {
    const reasons: [string, string][] = [
      ['no-address', 'their directory entry has no email'],
      ['no-account', 'they have no account at Google Drive'],
      ['too-many', 'the folder holds as many people as Google Drive allows'],
      ['permission-denied', 'Google Drive refused it'],
      ['unavailable', 'Google Drive did not answer; Fleet support is trying again'],
    ]
    const { el } = await alpha(
      [
        [
          /^GET \/spaces\/spc_alpha\/notifications\?/,
          () =>
            json({
              notifications: [
                ...reasons.map(([reason], i) => folderAccessItem({ id: `ntc_${i}` }, reason)),
                folderAccessItem({ id: 'ntc_nc' }, 'not-connected'),
              ],
              nextBefore: null,
              waiting: 6,
            }),
        ],
      ],
      { segment: 'notifications', waiting: 6 }
    )
    await until(() => notices(el).length === 6)
    expect(notices(el).map((n) => n.querySelector('.notice-text')?.textContent)).toEqual([
      ...reasons.map(([, words]) => `Piet de Vries has no access to the folder Project Alpha yet: ${words}`),
      'Piet de Vries has no access to the folder Project Alpha yet',
    ])
  })

  it('follows the event: the badge drops once the access is in place', async () => {
    let waiting = 1
    const { el, hub } = await alpha(
      [
        [
          /^GET \/spaces\/spc_alpha\/notifications\?/,
          () => json({ notifications: [folderAccessItem({ waiting: !!waiting })], nextBefore: null, waiting }),
        ],
      ],
      { segment: 'notifications', waiting: 1 }
    )
    await until(() => notices(el).length === 1)
    waiting = 0
    await announceNotice(hub, { spaceId: ALPHA.id, id: 'ntc_piet', kind: 'folder-access', waiting: false, count: 0 })
    await until(() => notices(el)[0]?.classList.contains('past'))
    expect(tabOf(el, /^Notifications/)?.querySelector('.notifications-count')).toBeNull()
  })

  it('says a refusal of Try again under the item', async () => {
    const { el } = await alpha(
      [
        [
          /^GET \/spaces\/spc_alpha\/notifications\?/,
          () => json({ notifications: [folderAccessItem()], nextBefore: null, waiting: 1 }),
        ],
        [`PATCH ${TOOLS_PATH}/drive`, () => json({ error: 'not-owner' }, 403)],
      ],
      { segment: 'notifications', waiting: 1 }
    )
    await until(() => notices(el).length === 1)
    await click(byText(notices(el)[0] as HTMLElement, 'button', 'Try again'))
    await until(() => notices(el)[0]?.querySelector('.tool-error'))
    expect(notices(el)[0]?.querySelector('.tool-error')?.textContent).toBe(
      'Only the owner of the space changes its tools.'
    )
  })
})

// ---------------------------------------------------------------------------------------------- fixtures of Files

const FILES_FEATURE = { id: 'files', title: 'Files', profile: { id: 'org.ayni/files', version: '1.0' } }
const DRIVE = {
  source: 'drive',
  title: 'Google Drive',
  description: 'A shared drive of the organization',
  account: { kind: 'personal' },
  default: true,
  locations: ['managed', 'existing'],
}
const CLOUD = {
  source: 'cloud-team',
  title: 'Nextcloud',
  description: "The organization's Nextcloud",
  account: { kind: 'personal' },
  default: false,
  locations: ['managed', 'existing'],
}
const WEBDAV = {
  source: 'webdav',
  title: 'WebDAV',
  description: 'A plain WebDAV server',
  account: { kind: 'space' },
  default: false,
  locations: ['existing'],
}
const OWNER_FOLDER = {
  title: 'Project Alpha',
  state: 'ready',
  reason: null,
  managedWith: 'owner',
  webUrl: 'https://drive.example/folders/0AB',
  access: { inPlace: 4, pending: 0, failed: 1 },
  addedOutside: 1,
}
/** Files of Project Alpha in the managed mode, as Jonas reads it (profile §3.10). */
const MANAGED = {
  feature: FILES_FEATURE,
  providers: [DRIVE, CLOUD, WEBDAV],
  source: 'drive',
  title: 'Google Drive',
  description: DRIVE.description,
  state: 'ready',
  add: 'owner',
  guests: true,
  conformant: true,
  capabilities: ['share', 'team-roots'],
  locations: ['managed', 'existing'],
  location: 'managed',
  folder: OWNER_FOLDER,
  account: { kind: 'personal', connected: true },
  bindings: [],
  list: {
    label: 'Folders',
    any: false,
    entries: [{ values: { root: '0AB' }, label: 'Project Alpha' }],
    anyAllowed: false,
    anyLabel: 'Any folder you can reach',
    choices: false,
    typed: false,
    maxEntries: 1,
  },
  tools: [{ name: 'files_read', title: 'Read a file', effect: 'read', rule: 'none', packRule: 'none', stepUp: null }],
  pending: null,
}

/** Files of Project Alpha offered and not added: each provider with its modes, the default's on the item. */
const OFFERED = {
  feature: FILES_FEATURE,
  providers: [DRIVE, CLOUD, WEBDAV],
  source: null,
  title: null,
  state: 'available',
  add: 'owner',
  guests: true,
  locations: ['managed', 'existing'],
  pending: null,
}
const SUMMARY =
  'Use Google Drive for Files in Project Alpha. Fleet support makes a shared drive named Project Alpha, owned by your organization, with you as its manager, and gives each member of the space access to it. People outside your organization included.'
const waitingFor = (tool: Record<string, unknown>, summary = SUMMARY, code = '48 21') => ({
  ...tool,
  pending: { changeId: 'chg_1', summary, code, expiresAt: new Date(Date.now() + 300_000).toISOString() },
})
const modeTexts = (el: HTMLElement) =>
  [...el.querySelectorAll('.tool-locations .tool-location-option')].map((o) => ({
    title: o.querySelector('.tool-provider-title')?.textContent,
    line: o.querySelector('.muted')?.textContent,
    checked: (o.querySelector('input') as HTMLInputElement).checked,
  }))
const mode = (el: HTMLElement, i: number) =>
  el.querySelectorAll<HTMLInputElement>('.tool-locations .tool-location-option input')[i]
const providerInput = (el: HTMLElement, title: string) =>
  [...el.querySelectorAll<HTMLElement>('.tool-providers:not(.tool-locations) .tool-provider-option')]
    .find((o) => o.querySelector('.tool-provider-title')?.textContent?.startsWith(title))
    ?.querySelector('input')
const openFiles = async (el: HTMLElement) => {
  await until(() => el.querySelector('.tool-row'))
  await click(el.querySelector('.tool-row-main'))
}

describe('Add with the two modes of Files (UI-CONV-069, PROF-TOOL-040)', () => {
  it('shows the two modes, the managed one first and selected; Add sends it, with the code and the question of the phone', async () => {
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [OFFERED] })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: waitingFor(OFFERED) }, 202)],
    ])
    await openFiles(el)
    expect(el.querySelector('.tool-locations legend')?.textContent).toBe('The folder of Files')
    expect(modeTexts(el)).toEqual([
      {
        title: 'A new folder for this space',
        line: "Fleet support makes it at Google Drive, owned by your organization, and gives the space's members access to it.",
        checked: true,
      },
      {
        title: 'A folder that already exists',
        line: "You choose it; Fleet support changes nobody's access to it.",
        checked: false,
      },
    ])
    // in the managed mode the panel shows no choice of folder
    expect(el.querySelector('.tool-list-editor')).toBeNull()
    await click(byText(el, 'button', 'Add to Project Alpha'))
    await until(() => el.querySelector('.tool-pending'))
    expect(agent.find('POST', TOOLS_PATH)[0]?.body).toEqual({ source: 'drive', location: 'managed' })
    expect(el.querySelector('.tool-pending-text')?.textContent).toMatch(/^Confirm on your phone · Code 48 21/)
    // the page shows the question the phone asks (UI-CONV-052)
    expect(el.querySelector('.tool-pending-question')?.textContent).toBe(SUMMARY)
    // while it waits, neither the providers nor the modes can be picked
    expect(el.querySelector('.tool-locations')).toBeNull()
  })

  it('sends the existing mode once picked, and shows no question of the managed mode', async () => {
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [OFFERED] })],
      [
        `POST ${TOOLS_PATH}`,
        () => json({ tool: waitingFor(OFFERED, 'Use Google Drive for Files in Project Alpha') }, 202),
      ],
    ])
    await openFiles(el)
    await click(mode(el, 1))
    expect(modeTexts(el).map((m) => m.checked)).toEqual([false, true])
    await click(byText(el, 'button', 'Add to Project Alpha'))
    await until(() => el.querySelector('.tool-pending'))
    expect(agent.find('POST', TOOLS_PATH)[0]?.body).toEqual({ source: 'drive', location: 'existing' })
    expect(el.querySelector('.tool-pending-question')).toBeNull()
  })

  it('shows the modes of the provider picked: none for one the agent cannot manage, which sends the existing mode', async () => {
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [OFFERED] })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: waitingFor(OFFERED, 'Use WebDAV for Files in Project Alpha') }, 202)],
    ])
    await openFiles(el)
    await click(providerInput(el, 'WebDAV'))
    expect(el.querySelector('.tool-locations')).toBeNull()
    // another provider with both modes: its own, the managed one selected, its line naming it
    await click(providerInput(el, 'Nextcloud'))
    expect(modeTexts(el)[0]).toMatchObject({
      line: "Fleet support makes it at Nextcloud, owned by your organization, and gives the space's members access to it.",
      checked: true,
    })
    await click(providerInput(el, 'WebDAV'))
    await click(byText(el, 'button', 'Add to Project Alpha'))
    await until(() => agent.find('POST', TOOLS_PATH).length === 1)
    expect(agent.find('POST', TOOLS_PATH)[0]?.body).toEqual({ source: 'webdav', location: 'existing' })
  })

  it('sends the one mode of a template that allows one, with no choice: managed only, existing only', async () => {
    const only = (locations: string[]) => ({ ...OFFERED, locations, providers: [{ ...DRIVE, locations }] })
    for (const locations of [['managed'], ['existing']]) {
      const { el, agent } = await alpha([
        [`GET ${TOOLS_PATH}`, () => json({ tools: [only(locations)] })],
        [`POST ${TOOLS_PATH}`, () => json({ tool: waitingFor(only(locations)) }, 202)],
      ])
      await openFiles(el)
      expect(el.querySelector('.tool-locations'), locations[0]).toBeNull()
      await click(byText(el, 'button', 'Add to Project Alpha'))
      await until(() => el.querySelector('.tool-pending'))
      expect(agent.find('POST', TOOLS_PATH)[0]?.body).toEqual({ source: 'drive', location: locations[0] })
      expect(!!el.querySelector('.tool-pending-question'), locations[0]).toBe(locations[0] === 'managed')
      teardown()
    }
  })

  it('says each refusal of the mode under the choice, and reads the modes again', async () => {
    const refusals: [Response, string][] = [
      [
        json({ error: 'cannot-manage', message: 'Fleet support cannot make a folder at Google Drive' }, 409),
        'Fleet support cannot make a folder at Google Drive. Choose a folder that already exists.',
      ],
      [
        json({ error: 'location-not-allowed', field: 'location', message: 'the template allows existing' }, 422),
        'Fleet support does not allow this choice in this space.',
      ],
      [
        json(
          { error: 'bad-request', field: 'location', message: 'choose a folder the agent makes, or one that exists' },
          400
        ),
        'choose a folder the agent makes, or one that exists',
      ],
      [
        json(
          {
            error: 'bad-request',
            field: 'list',
            message: 'a folder the agent makes is the one location: send no list',
          },
          400
        ),
        'a folder the agent makes is the one location: send no list',
      ],
    ]
    for (const [answer, words] of refusals) {
      const { el, agent } = await alpha([
        [`GET ${TOOLS_PATH}`, () => json({ tools: [OFFERED] })],
        [`POST ${TOOLS_PATH}`, () => answer],
      ])
      await openFiles(el)
      await click(byText(el, 'button', 'Add to Project Alpha'))
      await until(() => el.querySelector('.tool-locations .field-error'))
      expect(el.querySelector('.tool-locations .field-error')?.textContent?.trim(), words).toBe(words)
      // said once, at the choice, not under Add
      expect(el.querySelector('.tool-panel > .tool-actions .tool-error'), words).toBeNull()
      await until(() => agent.find('GET', TOOLS_PATH).length === 2)
      teardown()
    }
  })

  it('says cannot-manage under Add once the modes read again hold the existing one alone', async () => {
    let tools: unknown[] = [OFFERED]
    const { el } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools })],
      [
        `POST ${TOOLS_PATH}`,
        () => {
          tools = [{ ...OFFERED, locations: ['existing'], providers: [{ ...DRIVE, locations: ['existing'] }, CLOUD] }]
          return json({ error: 'cannot-manage' }, 409)
        },
      ],
    ])
    await openFiles(el)
    await click(byText(el, 'button', 'Add to Project Alpha'))
    await until(() => !el.querySelector('.tool-locations') && el.querySelector('.tool-error'))
    expect(el.querySelector('.tool-error')?.textContent).toBe(
      'Fleet support cannot make a folder at Google Drive. Choose a folder that already exists.'
    )
  })
})

/** Files of Project Alpha with WebDAV, a folder that exists, in use (PROF-TOOL-040). */
const EXISTING = {
  ...MANAGED,
  source: 'webdav',
  title: 'WebDAV',
  description: WEBDAV.description,
  locations: ['existing'],
  location: 'existing',
  folder: undefined,
  account: { kind: 'space', fields: [{ name: 'token', label: 'Token' }], set: true, setAt: null, setBy: null },
  list: { ...MANAGED.list, entries: [{ values: { root: '/alpha' }, label: '/alpha' }], choices: true, maxEntries: 10 },
}

describe('Change provider to a provider of two modes (UI-CONV-069, UI-CONV-066, PROF-TOOL-040)', () => {
  it('shows the modes of the new provider, and sends the one chosen with the change', async () => {
    const summary =
      'Use Google Drive for Files in Project Alpha, in place of WebDAV. Fleet support makes a shared drive named Project Alpha.'
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [EXISTING] })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: waitingFor(EXISTING, summary) }, 202)],
    ])
    await openFiles(el)
    await click(byText(el, 'button', 'Change provider'))
    expect(el.querySelector('.tool-change-provider .tool-locations')).toBeNull()
    await click(providerInput(el, 'Google Drive'))
    expect(modeTexts(el).map((m) => [m.title, m.checked])).toEqual([
      ['A new folder for this space', true],
      ['A folder that already exists', false],
    ])
    await click(byText(el, '.tool-change-provider button', 'Change'))
    await until(() => agent.find('POST', TOOLS_PATH).length === 1)
    expect(agent.find('POST', TOOLS_PATH)[0]?.body).toEqual({
      source: 'drive',
      replaces: 'webdav',
      location: 'managed',
    })
    await until(() => el.querySelector('.tool-pending-question'))
    expect(el.querySelector('.tool-pending-question')?.textContent).toBe(summary)
  })

  it('says a refusal of the mode under the modes of the new provider', async () => {
    const { el } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [EXISTING] })],
      [`POST ${TOOLS_PATH}`, () => json({ error: 'cannot-manage' }, 409)],
    ])
    await openFiles(el)
    await click(byText(el, 'button', 'Change provider'))
    await click(providerInput(el, 'Nextcloud'))
    await click(mode(el, 0))
    await click(byText(el, '.tool-change-provider button', 'Change'))
    // the question closes as the request leaves; the refusal is said under Change provider
    await until(() => el.querySelector('.tool-change-provider .tool-error'))
    expect(el.querySelector('.tool-change-provider .tool-error')?.textContent).toBe(
      'Fleet support cannot make a folder at Nextcloud. Choose a folder that already exists.'
    )
  })
})

// ---------------------------------------------------------------------------------------------- the folder

const folderOf = (over: Record<string, unknown>, tool: Record<string, unknown> = {}) => ({
  ...MANAGED,
  ...tool,
  folder: { ...OWNER_FOLDER, ...over },
})
const rowLines = (el: HTMLElement) =>
  [...(el.querySelector('.tool-row .space-text')?.children ?? [])].map((x) => x.textContent?.trim())
const rowState = (el: HTMLElement) =>
  el.querySelector('.tool-row > .tool-row-main > .tag, .tool-row > .tool-row-main > .state-tag')?.textContent
const section = (el: HTMLElement) => el.querySelector<HTMLElement>('.tool-folder')
async function toolsChanged(hub: Hub, value: Record<string, unknown>) {
  // @ts-expect-error private: the event as the session's stream delivers it
  await hub.onEvent('s1', { type: 'CUSTOM', name: 'ayni.space.tools.changed', value }, undefined, false)
}

describe("the managed folder on the owner's row and in the panel (UI-CONV-070, UI-CONV-052)", () => {
  it('reads its line, the members without access, and Open in <provider>, which opens the folder in a new tab', async () => {
    const { el } = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })]])
    await until(() => el.querySelector('.tool-row'))
    expect(rowLines(el)).toEqual([
      'Files',
      'Google Drive · Folders: Project Alpha · Each person uses their own account',
      'Folder: Project Alpha · Managed by Fleet support',
      '1 member has no access yet',
    ])
    expect(rowState(el)).toBe('Ready')
    const open = el.querySelector<HTMLAnchorElement>('.tool-row > a.folder-open')
    expect(open?.textContent).toBe('Open in Google Drive')
    expect(open?.href).toBe('https://drive.example/folders/0AB')
    expect(open?.target).toBe('_blank')
    expect(open?.rel).toBe('noopener noreferrer')
    // two members without access read so; none, no line; a folder with no link, no Open in
    teardown()
    const more = await alpha([
      [
        `GET ${TOOLS_PATH}`,
        () => json({ tools: [folderOf({ access: { inPlace: 2, pending: 1, failed: 1 }, webUrl: undefined })] }),
      ],
    ])
    await until(() => more.el.querySelector('.tool-row'))
    expect(rowLines(more.el)[3]).toBe('2 members have no access yet')
    expect(more.el.querySelector('.folder-open')).toBeNull()
    teardown()
    const all = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [folderOf({ access: { inPlace: 5, pending: 0, failed: 0 } })] })],
    ])
    await until(() => all.el.querySelector('.tool-row'))
    expect(rowLines(all.el)).toHaveLength(3)
  })

  it('shows in the panel the folder in place of the choice of folder, its line, the count and Rename folder', async () => {
    const { el } = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })]])
    await openFiles(el)
    expect(el.querySelector('.tool-list-editor')).toBeNull()
    const f = section(el) as HTMLElement
    expect(f.closest('.tool-section')?.getAttribute('aria-label')).toBe('Settings of the tool')
    expect(f.querySelector('.tool-folder-line')?.textContent).toBe('Folder: Project Alpha · Managed by Fleet support')
    expect(f.querySelector('a.folder-open')?.getAttribute('href')).toBe('https://drive.example/folders/0AB')
    expect(f.querySelector('.tool-folder-without')?.textContent).toBe('1 member has no access yet')
    expect(f.querySelector('.tool-folder-status')).toBeNull()
    expect(byText(f, 'button', 'Rename folder')).toBeTruthy()
    // no Save of a list that cannot change: the rules' Save only
    expect(el.querySelectorAll('.settings-save')).toHaveLength(1)
  })

  it('keeps a stream of the agent open while the folder is made, for the change of its state (PROF-TOOL-041)', async () => {
    const { hub, el } = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })]])
    await until(() => el.querySelector('.tool-row'))
    expect(hub.getSnapshot().leaders.s1).toBeUndefined()
    teardown()
    let tools = [folderOf({ state: 'creating' }, { state: 'setup' })]
    const making = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools })]])
    await until(() => making.el.querySelector('.tool-row'))
    await until(() => making.hub.getSnapshot().leaders.s1 !== undefined)
    // made: the agent says so, and the row follows
    tools = [MANAGED]
    await toolsChanged(making.hub, {
      spaceId: ALPHA.id,
      feature: 'files',
      source: 'drive',
      state: 'ready',
      outcome: 'applied',
    })
    await until(() => rowState(making.el) === 'Ready')
  })

  it('says "Making the folder at <provider>…" in place of the state while it is made, with no Rename', async () => {
    const creating = folderOf(
      { state: 'creating', access: { inPlace: 0, pending: 0, failed: 0 } },
      { state: 'setup', list: { ...MANAGED.list, entries: [] } }
    )
    const { el } = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [creating] })]])
    await until(() => el.querySelector('.tool-row'))
    expect(rowState(el)).toBe('Making the folder at Google Drive…')
    // the list of a managed folder is not what is missing
    expect(el.textContent).not.toContain('Needs setup')
    await openFiles(el)
    expect(el.querySelector('.tool-panel-head .state-tag')?.textContent).toBe('Making the folder at Google Drive…')
    expect(section(el)?.querySelector('.tool-folder-status')?.textContent?.trim()).toBe(
      'Making the folder at Google Drive…'
    )
    expect(byText(section(el) as HTMLElement, 'button', 'Rename folder')).toBeUndefined()
  })

  it('asks to allow the provider while its account is not connected or lacks a scope; Allow starts the sign-in for the space', async () => {
    const tab = { opener: window as unknown, location: { replace: vi.fn() }, close: vi.fn() }
    vi.spyOn(window, 'open').mockImplementation((() => tab) as never)
    const signIn = 'https://accounts.example/o/oauth2/auth?client_id=x'
    for (const reason of ['not-connected', 'scope-missing']) {
      const allow = folderOf({ state: 'creating', reason }, { state: 'setup' })
      const { el, agent } = await alpha([
        [`GET ${TOOLS_PATH}`, () => json({ tools: [allow] })],
        [
          'POST /connections/drive/authorize',
          () =>
            json(
              { attemptId: 'att_1', authorizationUrl: signIn, expiresAt: new Date(Date.now() + 600_000).toISOString() },
              202
            ),
        ],
      ])
      await until(() => el.querySelector('.tool-row'))
      expect(rowState(el), reason).toBe('Needs setup')
      expect(rowLines(el), reason).toContain("Allow Google Drive to manage this space's folder")
      await openFiles(el)
      const f = section(el) as HTMLElement
      expect(f.querySelector('.tool-folder-status')?.textContent?.trim()).toBe(
        "Allow Google Drive to manage this space's folder"
      )
      await click(byText(f, 'button', 'Allow'))
      await until(() => agent.find('POST', '/connections/drive/authorize').length === 1)
      expect(agent.find('POST', '/connections/drive/authorize')[0]?.body).toEqual({ spaceId: ALPHA.id })
      await until(() => tab.location.replace.mock.calls.length > 0)
      expect(tab.location.replace).toHaveBeenLastCalledWith(signIn)
      teardown()
      vi.spyOn(window, 'open').mockImplementation((() => tab) as never)
    }
  })

  it("signs in for the provider alone when its account is one several sources use, its outcome on the account's row (UI-CONV-061, PROF-TOOL-029)", async () => {
    const tab = { opener: window as unknown, location: { replace: vi.fn() }, close: vi.fn() }
    vi.spyOn(window, 'open').mockImplementation((() => tab) as never)
    const signIn = 'https://accounts.example.org/o/oauth2/v2/auth?client_id=x'
    // Google Drive uses the Google account of Google Drive and Google Calendar (package 3.5.10, agent decision 87)
    const missing = folderOf(
      { state: 'creating', reason: 'scope-missing' },
      { state: 'setup', account: { kind: 'personal', connected: true, source: 'google' } }
    )
    const { el, agent, hub } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [missing] })],
      [
        'POST /connections/drive/authorize',
        () =>
          json(
            { attemptId: 'att_m', authorizationUrl: signIn, expiresAt: new Date(Date.now() + 600_000).toISOString() },
            202
          ),
      ],
    ])
    await until(() => el.querySelector('.tool-row'))
    await openFiles(el)
    await click(byText(section(el) as HTMLElement, 'button', 'Allow'))
    await until(() => agent.find('POST', '/connections/drive/authorize').length === 1)
    // the provider in the space: the scopes of its tools and of the folder's management, never Calendar's too
    expect(agent.find('POST', '/connections/drive/authorize')[0]?.body).toEqual({ spaceId: ALPHA.id })
    expect(agent.find('POST', '/connections/google/authorize')).toHaveLength(0)
    await until(() => tab.location.replace.mock.calls.length > 0)
    await until(() => section(el)?.querySelector('.account-waiting'))
    // the agent names the account in its event: the section hears it
    // @ts-expect-error private: the event as the session's stream delivers it
    await hub.onEvent(
      's1',
      {
        type: 'CUSTOM',
        name: 'ayni.connections.changed',
        value: {
          source: 'google',
          state: 'connected',
          label: 'jonas@example.org',
          attemptId: 'att_m',
          outcome: 'connected',
        },
      },
      undefined,
      false
    )
    await until(() => section(el)?.querySelector('.account-notice')?.textContent === 'Connected as jonas@example.org')
    expect(section(el)?.querySelector('.account-waiting')).toBeNull()
  })

  it('says a folder that needs a manager, and Check again checks it again', async () => {
    const needs = folderOf({ state: 'needs-manager', reason: 'manager-gone' })
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [needs] })],
      [`PATCH ${TOOLS_PATH}/drive`, () => json({ tool: MANAGED }, 202)],
    ])
    const words =
      'Fleet support can no longer manage this folder. Ask a Google Workspace administrator to make you a manager of the shared drive Project Alpha, then press Check again.'
    await until(() => el.querySelector('.tool-row'))
    expect(rowLines(el)).toContain(words)
    await openFiles(el)
    expect(section(el)?.querySelector('.tool-folder-status')?.textContent?.trim()).toBe(words)
    // made: it can be renamed
    expect(byText(section(el) as HTMLElement, 'button', 'Rename folder')).toBeTruthy()
    await click(byText(section(el) as HTMLElement, 'button', 'Check again'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/drive`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/drive`)[0]?.body).toEqual({ folder: { check: true } })
    // the item it answers: ready, the words gone
    await until(() => !section(el)?.querySelector('.tool-folder-status'))
    expect(byText(section(el) as HTMLElement, 'button', 'Check again')).toBeUndefined()
  })

  it('says a folder the provider did not let the agent make, and Try again checks it again', async () => {
    const failed = folderOf({ state: 'failed', reason: 'permission-denied' }, { state: 'setup' })
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [failed] })],
      [`PATCH ${TOOLS_PATH}/drive`, () => json({ tool: failed }, 202)],
    ])
    const words =
      'Google Drive did not let Fleet support make this folder. Your organization may not allow it; ask its administrator.'
    await until(() => el.querySelector('.tool-row'))
    expect(rowLines(el)).toContain(words)
    await openFiles(el)
    expect(section(el)?.querySelector('.tool-folder-status')?.textContent?.trim()).toBe(words)
    expect(byText(section(el) as HTMLElement, 'button', 'Rename folder')).toBeUndefined()
    await click(byText(section(el) as HTMLElement, 'button', 'Try again'))
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/drive`).length === 1)
    expect(agent.find('PATCH', `${TOOLS_PATH}/drive`)[0]?.body).toEqual({ folder: { check: true } })
  })

  it('renames the folder at once: the field Name of the folder, Save and Cancel; "Saved", the line follows', async () => {
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })],
      [`PATCH ${TOOLS_PATH}/drive`, () => json({ tool: folderOf({ title: 'Alpha files' }) })],
    ])
    await openFiles(el)
    await click(byText(section(el) as HTMLElement, 'button', 'Rename folder'))
    const field = () => section(el)?.querySelector<HTMLInputElement>('.tool-folder-rename input')
    expect(section(el)?.querySelector('.tool-folder-rename label')?.childNodes[0]?.textContent).toBe(
      'Name of the folder'
    )
    expect(field()?.value).toBe('Project Alpha')
    // unchanged or empty: nothing to save
    const save = () => byText(section(el) as HTMLElement, 'button', 'Save') as HTMLButtonElement
    expect(save().disabled).toBe(true)
    await type(field(), '   ')
    expect(save().disabled).toBe(true)
    // Cancel changes nothing
    await click(byText(section(el) as HTMLElement, 'button', 'Cancel'))
    expect(field()).toBeFalsy()
    expect(agent.find('PATCH', `${TOOLS_PATH}/drive`)).toHaveLength(0)
    await click(byText(section(el) as HTMLElement, 'button', 'Rename folder'))
    await type(field(), '  Alpha files ')
    await click(save())
    await until(() => agent.find('PATCH', `${TOOLS_PATH}/drive`).length === 1)
    // trimmed, and no phone: it applies at once
    expect(agent.find('PATCH', `${TOOLS_PATH}/drive`)[0]?.body).toEqual({ folder: { title: 'Alpha files' } })
    await until(() => section(el)?.querySelector('.tool-change-outcome')?.textContent === 'Saved')
    expect(section(el)?.querySelector('.tool-folder-line')?.textContent).toBe(
      'Folder: Alpha files · Managed by Fleet support'
    )
    expect(el.querySelector('.tool-pending')).toBeNull()
  })

  it('says each refusal of the rename: the name at its field, any other under the folder', async () => {
    const cases: [Response, string, string][] = [
      [
        json({ error: 'bad-name', field: 'folder.title', message: 'Google Drive does not take this name' }, 422),
        '.tool-folder-rename .field-error',
        'This value is not in the form Fleet support expects.',
      ],
      [
        json({ error: 'not-owner' }, 403),
        '.tool-folder > .tool-error',
        'Only the owner of the space changes its tools.',
      ],
      [
        json({ error: 'not-managed', message: 'the folder is not made yet' }, 409),
        '.tool-folder > .tool-error',
        'the folder is not made yet',
      ],
      [
        json({ error: 'source-unavailable', message: 'Google Drive did not rename the folder' }, 502),
        '.tool-folder > .tool-error',
        'Google Drive did not rename the folder',
      ],
      [
        json({ error: 'bad-request', field: 'folder', message: 'folder takes a title or check' }, 400),
        '.tool-folder > .tool-error',
        'folder takes a title or check',
      ],
    ]
    for (const [answer, where, words] of cases) {
      const { el, agent } = await alpha([
        [`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })],
        [`PATCH ${TOOLS_PATH}/drive`, () => answer],
      ])
      await openFiles(el)
      await click(byText(section(el) as HTMLElement, 'button', 'Rename folder'))
      await type(section(el)?.querySelector('.tool-folder-rename input'), 'Alpha/files')
      await click(byText(section(el) as HTMLElement, 'button', 'Save'))
      await until(() => el.querySelector(where))
      expect(el.querySelector(where)?.textContent?.trim(), words).toBe(words)
      // a 409 reads the tools again
      if (answer.status === 409) await until(() => agent.find('GET', TOOLS_PATH).length === 2)
      teardown()
    }
  })

  it('says the agent manages the folder when a list is refused with 409 managed-location, and reads the tools again', async () => {
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [EXISTING] })],
      [`PATCH ${TOOLS_PATH}/webdav`, () => json({ error: 'managed-location' }, 409)],
    ])
    await openFiles(el)
    await click(byText(el, '.tool-list-entry button', 'Remove'))
    await click(el.querySelector('.settings-save'))
    await until(() => el.querySelector('.tool-error'))
    expect(el.querySelector('.tool-error')?.textContent).toBe(
      'Fleet support manages this folder: it cannot be changed.'
    )
    await until(() => agent.find('GET', TOOLS_PATH).length === 2)
  })
})

/** Files of Project Alpha as Ana, a member, reads it: the folder's title, its link and her own access. */
const memberFiles = (myAccess: string) => ({
  feature: FILES_FEATURE,
  source: 'drive',
  title: 'Google Drive',
  description: DRIVE.description,
  state: 'ready',
  guests: true,
  account: { kind: 'personal', connected: true },
  bindings: [],
  list: { label: 'Folders', any: false, entries: [{ label: 'Project Alpha' }] },
  folder: { title: 'Project Alpha', webUrl: 'https://drive.example/folders/0AB', myAccess },
  tools: [{ title: 'Read a file', effect: 'read', rule: 'none', stepUp: null }],
})
const aboutFiles = (el: HTMLElement) =>
  [...(el.querySelector('.about-tool')?.children ?? [])].map((x) => x.textContent?.trim())

describe('the managed folder in About (UI-CONV-070)', () => {
  it("reads to a member the folder's line and Open in <provider>, and No access yet while their access is not in place", async () => {
    let myAccess = 'pending'
    const { el, hub, agent } = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [memberFiles(myAccess)] })]], {
      segment: 'about',
      member: true,
    })
    await until(() => el.querySelector('.about-tool'))
    expect(aboutFiles(el)).toEqual([
      'Files',
      'Google Drive · Folders: Project Alpha · Each person uses their own account',
      'Folder: Project Alpha · Managed by Fleet support',
      "No access yet. Fleet support is giving you access to this space's folder.",
      'Open in Google Drive',
      'A shared drive of the organization',
      expect.stringContaining('Your account'),
      'Runs without asking: Read a file',
    ])
    expect(el.querySelector<HTMLAnchorElement>('.about-tool a.folder-open')?.target).toBe('_blank')
    // her access put in place: the agent tells her session, with no change id (PROF-TOOL-041), and About follows
    myAccess = 'in-place'
    await toolsChanged(hub, {
      spaceId: ALPHA.id,
      feature: 'files',
      source: 'drive',
      state: 'ready',
      outcome: 'applied',
    })
    await until(() => !el.querySelector('.tool-folder-my-access'))
    expect(agent.find('GET', TOOLS_PATH)).toHaveLength(2)
    // and a failed access reads the same
    teardown()
    const failed = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [memberFiles('failed')] })]], {
      segment: 'about',
      member: true,
    })
    await until(() => failed.el.querySelector('.about-tool'))
    expect(failed.el.querySelector('.tool-folder-my-access')?.textContent).toBe(
      "No access yet. Fleet support is giving you access to this space's folder."
    )
  })

  it("reads to the owner the folder's line, its state and the members without access", async () => {
    const needs = folderOf({ state: 'needs-manager', reason: 'manager-gone' })
    const { el } = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [needs] })]], { segment: 'about' })
    await until(() => el.querySelector('.about-tool'))
    expect(aboutFiles(el).slice(0, 6)).toEqual([
      'Files',
      'Google Drive · Folders: Project Alpha · Each person uses their own account',
      'Folder: Project Alpha · Managed by Fleet support',
      'Fleet support can no longer manage this folder. Ask a Google Workspace administrator to make you a manager of the shared drive Project Alpha, then press Check again.',
      '1 member has no access yet',
      'Open in Google Drive',
    ])
    expect(el.querySelector('.tool-folder-my-access')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------- Members

/** Project Alpha as `GET /spaces/{id}` gives it to Jonas: each member's access to the folder (PROF-SPACE-003). */
const alphaDetail = (members: Record<string, unknown>[], addedOutside?: { name: string }[]) => ({
  ...ALPHA,
  createdAt: '2026-11-20T09:00:00Z',
  updatedAt: '2026-11-25T09:00:00Z',
  members: [
    {
      memberId: 'mem_jonas',
      name: 'Jonas Weber',
      organization: 'Northwind Logistics',
      state: 'active',
      role: 'owner',
      folderAccess: { state: 'in-place', role: 'manager' },
    },
    ...members,
  ],
  ...(addedOutside ? { addedOutside } : {}),
})
const member = (name: string, folderAccess: Record<string, unknown> | undefined, role = 'member') => ({
  memberId: `mem_${name.split(' ')[0]?.toLowerCase()}`,
  name,
  organization: role === 'guest' ? 'Partner BV' : 'Northwind Logistics',
  state: 'active',
  role,
  ...(folderAccess ? { folderAccess } : {}),
})
const memberRows = (el: HTMLElement) =>
  [...el.querySelectorAll('.members-table tbody tr')].map((r) => [
    r.querySelector('.member-name b')?.textContent,
    r.querySelector('.member-folder-access')?.textContent ?? null,
  ])

describe("each member's access to the managed folder, and the people added outside, in Members (UI-CONV-070)", () => {
  it('reads nothing in place, "No access yet" while it waits, and each reason once it failed', async () => {
    const reasons: [string, string][] = [
      ['no-address', 'their directory entry has no email'],
      ['no-account', 'they have no account at Google Drive'],
      ['not-allowed', 'your organization does not let this folder take people outside it'],
      ['too-many', 'the folder holds as many people as Google Drive allows'],
      ['permission-denied', 'Google Drive refused it'],
      ['unavailable', 'Google Drive did not answer; Fleet support is trying again'],
    ]
    const names = ['Tom Berg', 'Lena Fischer', 'Piet de Vries', 'Kim Ito', 'Zoe Laan', 'Noa Smit']
    const { el } = await alpha(
      [
        [
          'GET /spaces/spc_alpha',
          () =>
            json(
              alphaDetail(
                [
                  member('Ana Ríos', { state: 'in-place', role: 'editor' }),
                  member('Max Roth', { state: 'pending', role: 'editor', reason: 'unavailable' }),
                  member('Eva Kok', { state: 'none' }, 'guest'),
                  member('Ivo Dam', { state: 'failed', role: 'editor', reason: 'not-connected' }),
                  ...reasons.map(([reason], i) =>
                    member(
                      names[i] as string,
                      { state: 'failed', role: 'editor', reason },
                      i === 2 ? 'guest' : 'member'
                    )
                  ),
                ],
                [{ name: 'Marta Kova' }, { name: 'a person' }]
              )
            ),
        ],
        [`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })],
      ],
      { segment: 'members' }
    )
    await until(() => el.querySelector('.member-folder-access'))
    expect(memberRows(el)).toEqual([
      ['Jonas Weber', null],
      ['Ana Ríos', null],
      // a member that waits reads no reason
      ['Max Roth', 'No access yet'],
      // given no access: nothing
      ['Eva Kok', null],
      // a reason UI-CONV-052 does not word
      ['Ivo Dam', 'No access yet'],
      ...reasons.map(([, words], i) => [names[i], `No access yet: ${words}`]),
    ])
    expect(el.querySelector('.members-added-outside')?.textContent).toBe(
      'Added outside Fleet support: Marta Kova, a person'
    )
  })

  it('reads none of it for a space whose folder the agent does not manage, and asks no tools', async () => {
    const { el, agent } = await alpha(
      [
        [
          'GET /spaces/spc_alpha',
          () => json({ ...alphaDetail([member('Ana Ríos', undefined)]), members: [member('Ana Ríos', undefined)] }),
        ],
        [`GET ${TOOLS_PATH}`, () => json({ tools: [EXISTING] })],
      ],
      { segment: 'members' }
    )
    await until(() => el.querySelectorAll('.members-table tbody tr').length === 1)
    expect(el.querySelector('.member-folder-access')).toBeNull()
    expect(el.querySelector('.members-added-outside')).toBeNull()
    expect(agent.find('GET', TOOLS_PATH)).toHaveLength(0)
  })

  it("reads the members again when the agent says a member's access changed", async () => {
    let piet: Record<string, unknown> = { state: 'failed', role: 'editor', reason: 'not-allowed' }
    const { el, hub, agent } = await alpha(
      [
        ['GET /spaces/spc_alpha', () => json(alphaDetail([member('Piet de Vries', piet, 'guest')]))],
        [`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })],
      ],
      { segment: 'members' }
    )
    await until(() => el.querySelector('.member-folder-access'))
    piet = { state: 'in-place', role: 'editor' }
    await toolsChanged(hub, {
      spaceId: ALPHA.id,
      feature: 'files',
      source: 'drive',
      state: 'ready',
      outcome: 'applied',
    })
    await until(() => !el.querySelector('.member-folder-access'))
    expect(agent.find('GET', '/spaces/spc_alpha').length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------------------------- Activity

describe('the activity of the managed folder (UI-CONV-051, PROF-TOOL-043)', () => {
  const lines = (tool: Record<string, unknown>) =>
    [
      { kind: 'manager-needed' },
      { kind: 'access-failed', member: { name: 'Piet de Vries' }, reason: 'not-allowed' },
      { kind: 'folder-released', by: { name: 'Jonas Weber' } },
      { kind: 'folder-renamed', by: { name: 'Jonas Weber' } },
      { kind: 'folder-created', by: { name: 'Jonas Weber' } },
    ].map((a, i) => ({
      id: `act_${i}`,
      at: `2026-11-25T10:0${5 - i}:00Z`,
      tool: { source: 'drive', title: 'Google Drive' },
      feature: { id: 'files', title: 'Files' },
      ...a,
      ...tool,
    }))
  const texts = (el: HTMLElement) =>
    [...el.querySelectorAll('.activity-list li span:last-child')].map((x) => x.textContent)

  it('names the agent, the folder and the member, the folder as the space tools name it now', async () => {
    const { el, agent } = await alpha(
      [
        [`GET ${TOOLS_PATH}`, () => json({ tools: [folderOf({ title: 'Alpha files' })] })],
        [/^GET \/spaces\/spc_alpha\/activity/, () => json({ activity: lines({}), nextBefore: null })],
      ],
      { segment: 'activity' }
    )
    await until(() => texts(el)[0]?.includes('Alpha files'))
    expect(texts(el)).toEqual([
      'Fleet support can no longer manage the folder Alpha files',
      'Piet de Vries has no access to the folder Alpha files yet',
      'Fleet support stopped managing the folder Alpha files',
      'Jonas Weber renamed the folder to Alpha files',
      'Fleet support made the folder Alpha files at Google Drive',
    ])
    expect(agent.find('GET', TOOLS_PATH)).toHaveLength(1)
  })

  it("names the folder by the space's title once the space's tools hold none", async () => {
    const { el } = await alpha(
      [
        [`GET ${TOOLS_PATH}`, () => json({ tools: [OFFERED] })],
        [/^GET \/spaces\/spc_alpha\/activity/, () => json({ activity: lines({}).slice(2, 3), nextBefore: null })],
      ],
      { segment: 'activity' }
    )
    await until(() => texts(el).length === 1)
    expect(texts(el)).toEqual(['Fleet support stopped managing the folder Project Alpha'])
  })

  /** The lines as the agent gives them from package 3.5.11, each with the folder as it was named then, newest first. */
  const named = (tool: Record<string, unknown>) =>
    [
      { kind: 'folder-released', by: { name: 'Jonas Weber' }, folder: { title: 'Alpha Files' } },
      {
        kind: 'access-failed',
        member: { name: 'Piet de Vries' },
        reason: 'not-allowed',
        folder: { title: 'Alpha Files' },
      },
      { kind: 'folder-renamed', by: { name: 'Jonas Weber' }, folder: { title: 'Alpha Files' } },
      { kind: 'manager-needed', folder: { title: 'Alpha' } },
      { kind: 'folder-created', by: { name: 'Jonas Weber' }, folder: { title: 'Alpha' } },
    ].map((a, i) => ({
      id: `act_n${i}`,
      at: `2026-11-26T10:0${5 - i}:00Z`,
      tool: { source: 'drive', title: 'Google Drive' },
      feature: { id: 'files', title: 'Files' },
      ...a,
      ...tool,
    }))

  it("names the folder each line carries, as it was named then, though the space's tools name another now (package 3.5.11)", async () => {
    // a line recorded before the agent kept the name, the oldest, is the one that reads the space's tools
    const before = {
      id: 'act_old',
      at: '2026-11-20T10:00:00Z',
      kind: 'manager-needed',
      tool: { source: 'drive', title: 'Google Drive' },
      feature: { id: 'files', title: 'Files' },
    }
    const { el, agent } = await alpha(
      [
        [`GET ${TOOLS_PATH}`, () => json({ tools: [folderOf({ title: 'Team drive now' })] })],
        [/^GET \/spaces\/spc_alpha\/activity/, () => json({ activity: [...named({}), before], nextBefore: null })],
      ],
      { segment: 'activity' }
    )
    await until(() => texts(el).at(-1)?.includes('Team drive now'))
    expect(texts(el)).toEqual([
      'Fleet support stopped managing the folder Alpha Files',
      'Piet de Vries has no access to the folder Alpha Files yet',
      'Jonas Weber renamed the folder to Alpha Files',
      'Fleet support can no longer manage the folder Alpha',
      'Fleet support made the folder Alpha at Google Drive',
      'Fleet support can no longer manage the folder Team drive now',
    ])
    expect(agent.find('GET', TOOLS_PATH)).toHaveLength(1)
  })

  it("names the folder each line carries once the space's tools hold none, and reads no tools for it", async () => {
    const { el, agent } = await alpha(
      [
        [`GET ${TOOLS_PATH}`, () => json({ tools: [OFFERED] })],
        [/^GET \/spaces\/spc_alpha\/activity/, () => json({ activity: named({}), nextBefore: null })],
      ],
      { segment: 'activity' }
    )
    await until(() => texts(el).length === 5)
    expect(texts(el)).toEqual([
      'Fleet support stopped managing the folder Alpha Files',
      'Piet de Vries has no access to the folder Alpha Files yet',
      'Jonas Weber renamed the folder to Alpha Files',
      'Fleet support can no longer manage the folder Alpha',
      'Fleet support made the folder Alpha at Google Drive',
    ])
    // every line names its folder: neither the space's tools nor its title are needed
    expect(agent.find('GET', TOOLS_PATH)).toHaveLength(0)
    expect(texts(el).join(' ')).not.toContain('Project Alpha')
  })
})

// ---------------------------------------------------------------------------------------------- the release

describe('the words before removing Files, or changing its provider, with a managed folder (UI-CONV-052, TOOL-FEAT-032)', () => {
  const release = (el: HTMLElement) => el.querySelector('.tool-confirm .tool-confirm-release')?.textContent

  it('says in the question of Remove that the folder stays, before the DELETE, which says nothing of it', async () => {
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })],
      [`DELETE ${TOOLS_PATH}/drive`, () => json({ tool: { ...OFFERED } })],
    ])
    await openFiles(el)
    await click(byText(el, 'button', 'Remove from Project Alpha'))
    expect(el.querySelector('.tool-confirm')?.textContent).toContain(
      'Remove Google Drive from Project Alpha? Its account and settings are deleted.'
    )
    expect(release(el)).toBe(
      'Fleet support stops managing the shared drive Project Alpha. It stays at Google Drive with its members and its files.'
    )
    expect(agent.find('DELETE', `${TOOLS_PATH}/drive`)).toHaveLength(0)
    // Cancel sends nothing
    await click(byText(el, '.tool-confirm button', 'Cancel'))
    expect(el.querySelector('.tool-confirm')).toBeNull()
    expect(agent.find('DELETE', `${TOOLS_PATH}/drive`)).toHaveLength(0)
    await click(byText(el, 'button', 'Remove from Project Alpha'))
    await click(byText(el, '.tool-confirm button', 'Remove from Project Alpha'))
    await until(() => agent.find('DELETE', `${TOOLS_PATH}/drive`).length === 1)
  })

  it('names a team folder for a folder of the managing account, and adds nothing in the existing mode', async () => {
    const nextcloud = folderOf(
      { managedWith: 'manager', webUrl: undefined },
      { source: 'cloud-team', title: 'Nextcloud', description: CLOUD.description }
    )
    const { el } = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [nextcloud] })]])
    await openFiles(el)
    await click(byText(el, 'button', 'Remove from Project Alpha'))
    expect(release(el)).toBe(
      'Fleet support stops managing the team folder Project Alpha. It stays at Nextcloud with its members and its files.'
    )
    teardown()
    const existing = await alpha([[`GET ${TOOLS_PATH}`, () => json({ tools: [EXISTING] })]])
    await openFiles(existing.el)
    await click(byText(existing.el, 'button', 'Remove from Project Alpha'))
    expect(existing.el.querySelector('.tool-confirm')).toBeTruthy()
    expect(release(existing.el)).toBeUndefined()
  })

  it('adds the line to the question of a change of provider, before it is sent', async () => {
    const { el, agent } = await alpha([
      [`GET ${TOOLS_PATH}`, () => json({ tools: [MANAGED] })],
      [`POST ${TOOLS_PATH}`, () => json({ tool: waitingFor(MANAGED, 'Use WebDAV for Files in Project Alpha') }, 202)],
    ])
    await openFiles(el)
    await click(byText(el, 'button', 'Change provider'))
    await click(providerInput(el, 'WebDAV'))
    const question = [...(el.querySelector('.tool-change-provider .tool-confirm')?.querySelectorAll('p') ?? [])].map(
      (p) => p.textContent
    )
    expect(question).toEqual([
      'Use WebDAV for Files in Project Alpha, in place of Google Drive?',
      'Fleet support stops using Google Drive in this space.',
      'Nothing is copied from Google Drive to WebDAV.',
      'What earlier conversations read from Google Drive stays in them.',
      'Fleet support stops managing the shared drive Project Alpha. It stays at Google Drive with its members and its files.',
    ])
    expect(agent.find('POST', TOOLS_PATH)).toHaveLength(0)
    await click(byText(el, '.tool-change-provider button', 'Change'))
    await until(() => agent.find('POST', TOOLS_PATH).length === 1)
    expect(agent.find('POST', TOOLS_PATH)[0]?.body).toEqual({
      source: 'webdav',
      replaces: 'drive',
      location: 'existing',
    })
  })
})
