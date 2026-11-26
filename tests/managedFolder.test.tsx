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
