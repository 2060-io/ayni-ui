/**
 * A team space's managed folder in the core (package 3.5.9: §3.7, §3.10, §3.12, PROF-SPACE-003, PROF-TOOL-040 to 043;
 * agent D145 to D150; UI-CONV-051, UI-CONV-052, UI-CONV-069 to 071): the answers read as the agent gives them, the modes
 * Add offers and sends, what the folder's state says and the control it offers, a member's access, the item
 * `folder-access`, the five kinds of activity, the refusals at their field, and the calls of the client.
 */
import { describe, expect, it } from 'vitest'
import {
  activityFolderOf,
  addInputOf,
  choosesLocation,
  defaultLocationOf,
  FOLDER_CHECK,
  folderAccessWordsOf,
  folderCheckOf,
  folderKindOf,
  folderLineOf,
  folderReleaseOf,
  folderRenameOf,
  folderStatusOf,
  folderTitleOf,
  isFolderActivity,
  isManaged,
  locationsFor,
  memberAccessLineOf,
  membersWithoutAccessOf,
  myAccessWaits,
  ownerFolderOf,
  spaceToolFolderOf,
} from '../src/managedFolder.js'
import {
  FOLDER_ACCESS,
  folderAccessControlOf,
  isFolderAccessItem,
  notificationOf,
  notificationsChangeOf,
  notificationsPageOf,
} from '../src/notifications.js'
import { ProfileClient, ProfileError } from '../src/profileClient.js'
import { spaceActivityOf, spaceDetailOf } from '../src/spaces.js'
import {
  missingPartsOf,
  providerChangeInputOf,
  providerLineOf,
  type SpaceTool,
  spaceToolOf,
  toolRefusalOf,
  toolRowStateOf,
} from '../src/tools.js'
import { TOOLS_COPY } from '../src/toolsCopy.js'

const FEATURE = { id: 'files', title: 'Files', profile: { id: 'org.ayni/files', version: '1.0' } }
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
  account: { kind: 'personal' },
  default: false,
  locations: ['existing', 'managed'],
}
const WEBDAV = {
  source: 'webdav',
  title: 'WebDAV',
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
/** Files of Project Alpha in the managed mode, as its owner reads it (profile §3.10). */
const MANAGED = {
  feature: FEATURE,
  providers: [DRIVE, CLOUD, WEBDAV],
  source: 'drive',
  title: 'Google Drive',
  state: 'ready',
  guests: true,
  conformant: true,
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
  tools: [],
  pending: null,
}
/** Files offered and not added: the modes of the default provider on the item, each provider's own on it. */
const OFFERED = {
  feature: FEATURE,
  providers: [DRIVE, CLOUD, WEBDAV],
  source: null,
  title: null,
  state: 'available',
  add: 'owner',
  guests: true,
  locations: ['managed', 'existing'],
  pending: null,
}
const tool = (value: unknown) => spaceToolOf(value) as SpaceTool

describe('the item of Files as the agent gives it (PROF-TOOL-040, PROF-TOOL-041)', () => {
  it("reads the modes, the mode in use and the owner's folder", () => {
    const t = tool(MANAGED)
    expect(t.locations).toEqual(['managed', 'existing'])
    expect(t.location).toBe('managed')
    expect(t.providers.map((p) => p.locations)).toEqual([
      ['managed', 'existing'],
      ['managed', 'existing'],
      ['existing'],
    ])
    expect(t.folder).toEqual({
      view: 'owner',
      title: 'Project Alpha',
      webUrl: 'https://drive.example/folders/0AB',
      state: 'ready',
      reason: null,
      managedWith: 'owner',
      access: { inPlace: 4, pending: 0, failed: 1 },
      addedOutside: 1,
    })
    expect(isManaged(t)).toBe(true)
    expect(ownerFolderOf(t)?.state).toBe('ready')
  })

  it("reads a member's folder: its title, its link and their own access", () => {
    const member = tool({
      feature: FEATURE,
      source: 'drive',
      title: 'Google Drive',
      state: 'ready',
      guests: true,
      account: { kind: 'personal', connected: true },
      folder: { title: 'Project Alpha', webUrl: 'https://drive.example/folders/0AB', myAccess: 'pending' },
      tools: [],
    })
    expect(member.folder).toEqual({
      view: 'member',
      title: 'Project Alpha',
      webUrl: 'https://drive.example/folders/0AB',
      myAccess: 'pending',
    })
    expect(member.location).toBeNull()
    expect(isManaged(member)).toBe(true)
    expect(ownerFolderOf(member)).toBeNull()
    expect(myAccessWaits(member)).toBe(true)
    expect(myAccessWaits({ folder: { ...member.folder, myAccess: 'failed' } as never })).toBe(true)
    expect(myAccessWaits({ folder: { ...member.folder, myAccess: 'in-place' } as never })).toBe(false)
  })

  it('reads no mode in use and no folder for a feature with no provider, nor for one in the existing mode', () => {
    const offered = tool({ ...OFFERED, location: 'managed', folder: OWNER_FOLDER })
    expect(offered.location).toBeNull()
    expect(offered.folder).toBeNull()
    expect(offered.locations).toEqual(['managed', 'existing'])
    const existing = tool({ ...MANAGED, location: 'existing', folder: undefined })
    expect(existing.location).toBe('existing')
    expect(isManaged(existing)).toBe(false)
    // another feature carries no modes
    expect(tool({ ...MANAGED, locations: undefined, location: undefined, folder: undefined }).locations).toEqual([])
  })

  it('fills in what a folder leaves out, and reads none with no title', () => {
    expect(spaceToolFolderOf({ title: 'X', state: 'creating' })).toEqual({
      view: 'owner',
      title: 'X',
      webUrl: null,
      state: 'creating',
      reason: null,
      managedWith: 'manager',
      access: { inPlace: 0, pending: 0, failed: 0 },
      addedOutside: 0,
    })
    expect(spaceToolFolderOf({ title: 'X' })).toEqual({ view: 'member', title: 'X', webUrl: null, myAccess: 'pending' })
    expect(spaceToolFolderOf({ state: 'ready' })).toBeNull()
  })
})

describe('Add with the two modes of Files (UI-CONV-069, PROF-TOOL-040)', () => {
  it("offers the provider's own modes, the managed one first and selected", () => {
    const t = tool(OFFERED)
    expect(locationsFor(t, 'drive')).toEqual(['managed', 'existing'])
    // in the template's order or not, the managed one first
    expect(locationsFor(t, 'cloud-team')).toEqual(['managed', 'existing'])
    expect(choosesLocation(locationsFor(t, 'drive'))).toBe(true)
    expect(defaultLocationOf(locationsFor(t, 'drive'))).toBe('managed')
    expect(addInputOf('drive', 'managed')).toEqual({ source: 'drive', location: 'managed' })
    expect(addInputOf('drive', 'existing')).toEqual({ source: 'drive', location: 'existing' })
  })

  it('sends the one mode of a template that allows one, and of a provider the agent cannot manage, with no choice', () => {
    // a template whose spaces use the managed mode only
    const managedOnly = tool({ ...OFFERED, locations: ['managed'], providers: [{ ...DRIVE, locations: ['managed'] }] })
    expect(choosesLocation(locationsFor(managedOnly, 'drive'))).toBe(false)
    expect(addInputOf('drive', defaultLocationOf(locationsFor(managedOnly, 'drive')))).toEqual({
      source: 'drive',
      location: 'managed',
    })
    // the existing mode only, by the template or for a provider that cannot manage
    const existingOnly = tool({
      ...OFFERED,
      locations: ['existing'],
      providers: [{ ...DRIVE, locations: ['existing'] }],
    })
    expect(defaultLocationOf(locationsFor(existingOnly, 'drive'))).toBe('existing')
    const t = tool(OFFERED)
    expect(choosesLocation(locationsFor(t, 'webdav'))).toBe(false)
    expect(addInputOf('webdav', defaultLocationOf(locationsFor(t, 'webdav')))).toEqual({
      source: 'webdav',
      location: 'existing',
    })
  })

  it("takes the item's modes for the provider it describes when the provider carries none, and none for another feature", () => {
    const t = tool({
      ...OFFERED,
      providers: [
        { ...DRIVE, locations: undefined },
        { ...CLOUD, locations: undefined },
      ],
    })
    expect(locationsFor(t, 'drive')).toEqual(['managed', 'existing'])
    expect(locationsFor(t, 'cloud-team')).toEqual([])
    const crm = tool({
      feature: { id: 'crm', title: 'CRM', profile: null },
      providers: [{ source: 'relaticle', title: 'Relaticle', account: { kind: 'space' }, default: true }],
      source: null,
      title: null,
      state: 'available',
      guests: false,
      pending: null,
    })
    expect(defaultLocationOf(locationsFor(crm, 'relaticle'))).toBeNull()
    expect(addInputOf('relaticle', null)).toEqual({ source: 'relaticle' })
  })

  it('sends the mode of the new provider with a change of provider', () => {
    expect(providerChangeInputOf({ source: 'webdav' }, 'drive', 'managed')).toEqual({
      source: 'drive',
      replaces: 'webdav',
      location: 'managed',
    })
    expect(providerChangeInputOf({ source: 'drive' }, 'webdav')).toEqual({ source: 'webdav', replaces: 'drive' })
  })
})

describe('the folder, its state and its controls (UI-CONV-070, UI-CONV-052, PROF-TOOL-043)', () => {
  const folder = (over: Record<string, unknown>) =>
    spaceToolFolderOf({ ...OWNER_FOLDER, ...over }) as Extract<SpaceTool['folder'], { view: 'owner' }>

  it('says each state, with its reason, and offers its control', () => {
    const cases: [Record<string, unknown>, string, string | null][] = [
      [{ state: 'creating', reason: null }, 'creating', null],
      [{ state: 'creating', reason: 'unavailable' }, 'creating', null],
      [{ state: 'creating', reason: 'not-connected' }, 'allow', null],
      [{ state: 'creating', reason: 'scope-missing' }, 'allow', null],
      [{ state: 'failed', reason: 'not-connected' }, 'allow', null],
      [{ state: 'needs-manager', reason: 'manager-gone' }, 'needsManager', 'checkAgain'],
      [{ state: 'failed', reason: 'permission-denied' }, 'failed', 'tryAgain'],
      [{ state: 'ready', reason: null }, 'ready', null],
    ]
    for (const [over, status, control] of cases) {
      expect(folderStatusOf(folder(over)), JSON.stringify(over)).toBe(status)
      expect(folderCheckOf(folderStatusOf(folder(over))), JSON.stringify(over)).toBe(control)
    }
  })

  it('reads "Making the folder" on the row while it is made, and nothing of its list in what is missing', () => {
    const creating = tool({
      ...MANAGED,
      state: 'setup',
      folder: { ...OWNER_FOLDER, state: 'creating' },
      list: { ...MANAGED.list, entries: [] },
    })
    expect(toolRowStateOf(creating)).toBe('makingFolder')
    expect(missingPartsOf(creating)).toEqual({ labels: [], account: false })
    // the account to allow: the row needs setup, and its line says why
    const allow = tool({
      ...MANAGED,
      state: 'setup',
      folder: { ...OWNER_FOLDER, state: 'creating', reason: 'scope-missing' },
    })
    expect(toolRowStateOf(allow)).toBe('needsSetup')
    // a change that waits comes first
    expect(toolRowStateOf({ ...creating, pending: { changeId: 'c', summary: '', code: '1', expiresAt: '' } })).toBe(
      'waiting'
    )
    // in the existing mode, a list with no entry is what is missing
    const existing = tool({
      ...MANAGED,
      state: 'setup',
      location: 'existing',
      folder: undefined,
      list: { ...MANAGED.list, entries: [] },
    })
    expect(missingPartsOf(existing).labels).toEqual(['Folders'])
  })

  it('counts the members without access, and names the folder on its line', () => {
    const t = tool(MANAGED)
    expect(membersWithoutAccessOf(ownerFolderOf(t) as never)).toBe(1)
    expect(membersWithoutAccessOf({ access: { inPlace: 1, pending: 2, failed: 1 } })).toBe(3)
    expect(folderLineOf(t)).toEqual({
      folder: 'Project Alpha',
      provider: 'Google Drive',
      webUrl: 'https://drive.example/folders/0AB',
    })
    expect(folderLineOf(tool({ ...MANAGED, folder: { ...OWNER_FOLDER, webUrl: undefined } }))?.webUrl).toBeNull()
    expect(folderLineOf(tool({ ...MANAGED, location: 'existing', folder: undefined }))).toBeNull()
    // the provider's line is as ever, with the line of its list
    expect(providerLineOf(t)?.list).toEqual({ label: 'Folders', values: ['Project Alpha'] })
  })

  it('names the kind of folder by whose account manages it, and the line a removal adds', () => {
    expect(folderKindOf({ managedWith: 'owner' })).toBe('sharedDrive')
    expect(folderKindOf({ managedWith: 'manager' })).toBe('teamFolder')
    expect(folderReleaseOf(tool(MANAGED))).toEqual({
      kind: 'sharedDrive',
      folder: 'Project Alpha',
      provider: 'Google Drive',
    })
    expect(
      folderReleaseOf(
        tool({
          ...MANAGED,
          source: 'cloud-team',
          title: 'Nextcloud',
          folder: { ...OWNER_FOLDER, managedWith: 'manager' },
        })
      )
    ).toEqual({ kind: 'teamFolder', folder: 'Project Alpha', provider: 'Nextcloud' })
    expect(folderReleaseOf(tool({ ...MANAGED, location: 'existing', folder: undefined }))).toBeNull()
  })

  it('renames with the name trimmed, and checks again', () => {
    expect(folderTitleOf('  Alpha files \n')).toBe('Alpha files')
    expect(folderTitleOf('   ')).toBeNull()
    expect(folderRenameOf('Alpha files')).toEqual({ folder: { title: 'Alpha files' } })
    expect(FOLDER_CHECK).toEqual({ folder: { check: true } })
  })
})

describe("the members' access and the people added outside (UI-CONV-070, PROF-SPACE-003)", () => {
  it("reads each member's access and the people added outside, to the owner", () => {
    const detail = spaceDetailOf({
      id: 'spc_alpha',
      kind: 'team',
      title: 'Project Alpha',
      members: [
        {
          memberId: 'm1',
          name: 'Ana Ríos',
          state: 'active',
          role: 'member',
          folderAccess: { state: 'in-place', role: 'editor' },
        },
        {
          memberId: 'm2',
          name: 'Piet de Vries',
          state: 'active',
          role: 'guest',
          folderAccess: { state: 'failed', role: 'editor', reason: 'not-allowed' },
        },
        { memberId: 'm3', name: 'Lena Fischer', state: 'active', role: 'member' },
      ],
      addedOutside: [{ name: 'Marta Kova' }, { name: '' }],
    })
    expect(detail?.members?.map((m) => m.folderAccess)).toEqual([
      { state: 'in-place', role: 'editor' },
      { state: 'failed', role: 'editor', reason: 'not-allowed' },
      undefined,
    ])
    expect(detail?.addedOutside).toEqual([{ name: 'Marta Kova' }])
    expect(spaceDetailOf({ id: 'spc_alpha', members: [] })?.addedOutside).toBeUndefined()
  })

  it('says nothing in place, "No access yet" while it waits, and the reason once it failed', () => {
    expect(memberAccessLineOf(undefined)).toBeNull()
    expect(memberAccessLineOf({ state: 'in-place', role: 'editor' })).toBeNull()
    expect(memberAccessLineOf({ state: 'none' })).toBeNull()
    // a member that waits reads no reason, whatever the agent says
    expect(memberAccessLineOf({ state: 'pending', reason: 'unavailable' })).toEqual({ key: 'noAccess' })
    for (const reason of [
      'no-address',
      'no-account',
      'not-allowed',
      'too-many',
      'permission-denied',
      'unavailable',
    ] as const)
      expect(memberAccessLineOf({ state: 'failed', reason })).toEqual({ key: 'noAccessBecause', reason })
    // a reason UI-CONV-052 does not word
    expect(memberAccessLineOf({ state: 'failed', reason: 'not-connected' })).toEqual({ key: 'noAccess' })
    expect(memberAccessLineOf({ state: 'failed' })).toEqual({ key: 'noAccess' })
  })
})

describe('the item folder-access of the Notifications (UI-CONV-071, PROF-TOOL-042)', () => {
  const ITEM = {
    id: 'ntc_1',
    kind: 'folder-access',
    at: '2026-11-25T10:00:00Z',
    waiting: true,
    folderAccess: {
      member: { name: 'Piet de Vries' },
      feature: { id: 'files', title: 'Files' },
      source: { id: 'drive', title: 'Google Drive' },
      folder: { title: 'Project Alpha' },
      reason: 'not-allowed',
    },
  }

  it('reads it, with Try again while it waits, and counts it in the badge', () => {
    const item = notificationOf(ITEM)
    expect(item).toEqual({ ...ITEM, kind: FOLDER_ACCESS })
    if (!item || !isFolderAccessItem(item)) throw new Error('not a folder-access item')
    expect(folderAccessControlOf(item)).toBe('tryAgain')
    expect(folderAccessControlOf({ ...item, waiting: false })).toBeNull()
    expect(folderAccessWordsOf(item.folderAccess)).toEqual({
      member: 'Piet de Vries',
      folder: 'Project Alpha',
      provider: 'Google Drive',
      reason: 'not-allowed',
    })
    expect(folderAccessWordsOf({ ...item.folderAccess, reason: 'not-connected' }).reason).toBeNull()
    const page = notificationsPageOf({ notifications: [ITEM], nextBefore: null, waiting: 1 })
    expect(page.waiting).toBe(1)
    expect(page.notifications).toHaveLength(1)
    expect(
      notificationsChangeOf({ spaceId: 'spc_alpha', id: 'ntc_1', kind: 'folder-access', waiting: true, count: 1 })
    ).toMatchObject({ kind: 'folder-access', count: 1 })
    // one with no member or no source is not shown
    expect(notificationOf({ ...ITEM, folderAccess: { ...ITEM.folderAccess, source: {} } })).toBeNull()
  })
})

describe('the activity of a managed folder (UI-CONV-051, PROF-TOOL-043)', () => {
  it('reads the five kinds, and names the folder by its feature in the space tools, else the space', () => {
    const page = spaceActivityOf({
      activity: ['folder-created', 'folder-renamed', 'folder-released', 'access-failed', 'manager-needed'].map(
        (kind, i) => ({
          id: `act_${i}`,
          at: `2026-11-25T10:0${i}:00Z`,
          kind,
          ...(kind === 'access-failed' ? { member: { name: 'Piet de Vries' } } : {}),
          tool: { source: 'drive', title: 'Google Drive' },
          feature: { id: 'files', title: 'Files' },
        })
      ),
      nextBefore: null,
    })
    expect(page.activity.map((a) => a.kind)).toEqual([
      'folder-created',
      'folder-renamed',
      'folder-released',
      'access-failed',
      'manager-needed',
    ])
    expect(page.activity.every((a) => isFolderActivity(a.kind))).toBe(true)
    expect(isFolderActivity('tool-added')).toBe(false)
    expect(page.activity[3]?.member).toEqual({ name: 'Piet de Vries' })
    const line = page.activity[0] as (typeof page.activity)[number]
    expect(
      activityFolderOf(line, [tool({ ...MANAGED, folder: { ...OWNER_FOLDER, title: 'Alpha files' } })], 'Project Alpha')
    ).toBe('Alpha files')
    expect(
      activityFolderOf(line, [tool({ ...MANAGED, location: 'existing', folder: undefined })], 'Project Alpha')
    ).toBe('Project Alpha')
    expect(activityFolderOf(line, null, 'Project Alpha')).toBe('Project Alpha')
  })
})

describe('the refusals at their field (UI-CONV-052, PROF-TOOL-040, PROF-TOOL-043)', () => {
  it('places each refusal of the wire', () => {
    expect(toolRefusalOf({ status: 400, code: 'bad-request', field: 'location' })).toEqual({
      at: 'location',
      reason: 'badRequest',
    })
    expect(toolRefusalOf({ status: 400, code: 'bad-request', field: 'list' })).toEqual({
      at: 'location',
      reason: 'badRequest',
    })
    expect(toolRefusalOf({ status: 422, code: 'location-not-allowed', field: 'location' })).toEqual({
      at: 'location',
      reason: 'locationNotAllowed',
    })
    expect(toolRefusalOf({ status: 409, code: 'cannot-manage' })).toEqual({ at: 'location', reason: 'cannotManage' })
    expect(toolRefusalOf({ status: 422, code: 'bad-name', field: 'folder.title' })).toEqual({
      at: 'folderTitle',
      reason: 'badName',
    })
    expect(toolRefusalOf({ status: 409, code: 'managed-location' })).toEqual({ at: 'panel', reason: 'managedLocation' })
    expect(toolRefusalOf({ status: 403, code: 'not-owner' })).toEqual({ at: 'panel', reason: 'notOwner' })
    expect(toolRefusalOf({ status: 409, code: 'not-managed' })).toEqual({ at: 'panel', reason: 'other' })
    expect(toolRefusalOf({ status: 502, code: 'source-unavailable' })).toEqual({ at: 'panel', reason: 'other' })
  })
})

describe('the words of a managed folder (UI-CONV-052, UI-CONV-051)', () => {
  it("are the spec's sentences", () => {
    expect(TOOLS_COPY['tools.folder.managed']).toBe('A new folder for this space')
    expect(TOOLS_COPY['tools.folder.line']).toBe('Folder: {{folder}} · Managed by {{agent}}')
    expect(TOOLS_COPY['tools.folder.creating']).toBe('Making the folder at {{provider}}…')
    expect(TOOLS_COPY['tools.folder.release']).toBe(
      '{{agent}} stops managing the {{kind}} {{folder}}. It stays at {{provider}} with its members and its files.'
    )
    expect(TOOLS_COPY['spaces.activity.folder-created']).toBe('{{agent}} made the folder {{folder}} at {{tool}}')
    expect(TOOLS_COPY['notices.folderAccess']).toBe('{{member}} has no access to the folder {{folder}} yet: {{reason}}')
  })
})

describe('the calls of the managed folder (PROF-TOOL-040, PROF-TOOL-043)', () => {
  const SESSIONS = 'http://agent.test/agui/v3/sessions'
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  function agent(answer: (method: string, body: unknown) => Response) {
    const calls: { method: string; path: string; body: unknown }[] = []
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ method: init?.method ?? 'GET', path: String(input).slice(SESSIONS.length), body })
      return answer(init?.method ?? 'GET', body)
    }
    return { client: new ProfileClient(SESSIONS, fetchFn as typeof fetch), calls }
  }

  it('adds Files with its mode, renames the folder at once, and checks it again', async () => {
    const pending = {
      changeId: 'chg_1',
      summary: 'Use Google Drive for Files in Project Alpha.',
      code: '48 21',
      expiresAt: 'x',
    }
    const { client, calls } = agent((method, body) =>
      method === 'POST'
        ? json({ tool: { ...OFFERED, pending } }, 202)
        : (body as { folder?: { check?: true } }).folder?.check
          ? json({ tool: MANAGED }, 202)
          : json({ tool: { ...MANAGED, folder: { ...OWNER_FOLDER, title: 'Alpha files' } } })
    )
    const added = await client.addSpaceTool('t', 'spc_alpha', addInputOf('drive', 'managed'))
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/spaces/spc_alpha/tools',
      body: { source: 'drive', location: 'managed' },
    })
    expect(added).toMatchObject({ status: 202, tool: { pending: { summary: pending.summary } } })
    const renamed = await client.patchSpaceTool('t', 'spc_alpha', 'drive', folderRenameOf('Alpha files'))
    expect(calls[1]).toEqual({
      method: 'PATCH',
      path: '/spaces/spc_alpha/tools/drive',
      body: { folder: { title: 'Alpha files' } },
    })
    expect(renamed.status).toBe(200)
    expect(renamed.tool.folder?.title).toBe('Alpha files')
    const checked = await client.patchSpaceTool('t', 'spc_alpha', 'drive', FOLDER_CHECK)
    expect(calls[2]?.body).toEqual({ folder: { check: true } })
    expect(checked.status).toBe(202)
    expect(checked.tool.pending).toBeNull()
  })

  it('gives each refusal its field', async () => {
    const { client } = agent(() => json({ error: 'bad-name', field: 'folder.title', message: 'no' }, 422))
    const e = await client.patchSpaceTool('t', 'spc_alpha', 'drive', folderRenameOf('a/b')).catch((x) => x)
    expect(e).toBeInstanceOf(ProfileError)
    expect(toolRefusalOf(e)).toEqual({ at: 'folderTitle', reason: 'badName' })
  })
})
