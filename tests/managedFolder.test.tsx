/**
 * A team space's managed folder on the web (profile package 3.5.9; agent D145 to D150), in the browser of Jonas Weber,
 * owner of Project Alpha, and of Ana Ríos, a member: Add with the two modes of Files (UI-CONV-069), the folder on the
 * row, in the panel and in About with its state and its controls (UI-CONV-070), the members' access in Members and the
 * people added outside, the item `folder-access` of the Notifications with its badge (UI-CONV-071), the folder in
 * Activity (UI-CONV-051), the words said before removing Files or changing its provider (UI-CONV-052, agent
 * TOOL-FEAT-032), and every refusal of the wire at its field.
 */
import type { SpaceInfo } from '@ayni.org/ayni-ui-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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
