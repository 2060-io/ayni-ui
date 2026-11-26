/**
 * A team space's managed folder (AG-UI profile package 3.5.9: §3.7, §3.10, §3.12, PROF-SPACE-003, PROF-TOOL-040 to 043;
 * agent D145 to D150; UI-CONV-051, UI-CONV-052, UI-CONV-069 to 071). In a team space Files has two modes: the folder
 * the agent makes at the provider when the owner adds Files, owned by the organization (a Google shared drive, a
 * Nextcloud team folder), whose members it keeps in step with the space's people; or a folder that already exists,
 * whose members it never changes. The wire types are written here as the readers fill them; the rules a screen follows
 * (which modes Add offers, what the folder's state says and which control it offers, what a member's access reads, the
 * line a removal adds to its question) are here too, so that the browser and the Ayni app apply the same ones.
 */
import type { AddSpaceToolInput, FeatureRef, SpaceTool, SpaceToolPatchInput } from './tools.js'

/** The modes of Files in a team space (PROF-TOOL-040, agent D145): a folder the agent makes and keeps, or one that exists. */
export type SpaceToolLocation = 'managed' | 'existing'
/** In the order a screen offers them: the managed one first (UI-CONV-069). */
export const SPACE_TOOL_LOCATIONS: readonly SpaceToolLocation[] = ['managed', 'existing']

/** Where the managed folder stands (PROF-TOOL-041): being made, in use, without a manager the agent can act through, failed. */
export type FolderState = 'creating' | 'ready' | 'needs-manager' | 'failed'
/**
 * Why the folder is not `ready` (PROF-TOOL-041, agent decision 86): the managing account is not connected or lacks a
 * scope (also while it is `creating`), no account the agent holds manages it, the store refused, or did not answer.
 */
export type FolderReason = 'not-connected' | 'scope-missing' | 'manager-gone' | 'permission-denied' | 'unavailable'

/** A member's own access to the folder, as the item of Files tells them (PROF-TOOL-041). */
export type MyFolderAccess = 'in-place' | 'pending' | 'failed'

/**
 * The managed folder of a space's Files (PROF-TOOL-041). The owner's view: its `title`, `state` and `reason`, whose
 * account manages it (`owner`: the owner's own, a Google shared drive; `manager`: the managing account, a Nextcloud team
 * folder), its `webUrl` when the store gives one, how many members' access is in place, waits or failed, and how many
 * people the store lists that the agent did not add. Any other member's view: its `title`, `webUrl` and their own
 * access.
 */
export type SpaceToolFolder =
  | {
      view: 'owner'
      title: string
      webUrl: string | null
      state: FolderState
      reason: FolderReason | null
      managedWith: 'owner' | 'manager'
      access: { inPlace: number; pending: number; failed: number }
      addedOutside: number
    }
  | { view: 'member'; title: string; webUrl: string | null; myAccess: MyFolderAccess }

/** The owner's view of the folder. */
export type OwnerFolder = Extract<SpaceToolFolder, { view: 'owner' }>

/** Why a member has no access to the managed folder (PROF-SPACE-003, agent TOOL-FEAT-028). */
export type FolderAccessReason =
  | 'no-address'
  | 'no-account'
  | 'not-allowed'
  | 'too-many'
  | 'permission-denied'
  | 'unavailable'
  /** a managing account that cannot act (the 3.5.9 type's; profile.md and UI-CONV-052 do not list it) */
  | 'not-connected'
export const FOLDER_ACCESS_REASONS: readonly FolderAccessReason[] = [
  'no-address',
  'no-account',
  'not-allowed',
  'too-many',
  'permission-denied',
  'unavailable',
  'not-connected',
]
/** The reasons UI-CONV-052 words; a member whose access failed for another one reads "No access yet". */
export type WordedAccessReason = Exclude<FolderAccessReason, 'not-connected'>
const WORDED: readonly WordedAccessReason[] = [
  'no-address',
  'no-account',
  'not-allowed',
  'too-many',
  'permission-denied',
  'unavailable',
]

/**
 * A member's access to the managed folder, to the owner (`folderAccess` of `GET {sessions}/spaces/{id}`,
 * PROF-SPACE-003): `none` for a member given no access (no tool of Files, or a guest where guests have none); `role`
 * once one is given; `reason` while it is not in place.
 */
export interface MemberFolderAccess {
  state: 'in-place' | 'pending' | 'failed' | 'none'
  role?: 'reader' | 'editor' | 'manager'
  reason?: FolderAccessReason
}

/**
 * An item `folder-access` of a space's Notifications, to its owner alone (PROF-TOOL-042): the member whose access
 * failed, the feature and its provider, the folder, and why; `waiting` while it is not in place.
 */
export interface FolderAccessNotice {
  member: { name: string }
  feature: FeatureRef
  source: { id: string; title: string }
  folder: { title: string }
  reason: FolderAccessReason
}

// ---------------------------------------------------------------------------------------------------- reading

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as never) : {})
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
const STATES: readonly FolderState[] = ['creating', 'ready', 'needs-manager', 'failed']
const REASONS: readonly FolderReason[] = [
  'not-connected',
  'scope-missing',
  'manager-gone',
  'permission-denied',
  'unavailable',
]
const MY_ACCESS: readonly MyFolderAccess[] = ['in-place', 'pending', 'failed']

/** The modes of a provider or an item, each once, the managed one first; none for a value that names none. */
export function locationsOf(value: unknown): SpaceToolLocation[] {
  const given = Array.isArray(value) ? value : []
  return SPACE_TOOL_LOCATIONS.filter((mode) => given.includes(mode))
}

/** The mode in use of an item; null for none. */
export function locationOf(value: unknown): SpaceToolLocation | null {
  return SPACE_TOOL_LOCATIONS.find((mode) => mode === value) ?? null
}

/**
 * The address of a folder, kept only when it is an `https` one: it is opened as a link, and it comes from a store
 * (UI-CONV-070).
 */
export function httpsUrlOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

/**
 * The managed folder as the agent gives it (PROF-TOOL-041); null for a value with no title. An answer with a `state` is
 * the owner's; any other, a member's.
 */
export function spaceToolFolderOf(value: unknown): SpaceToolFolder | null {
  const f = obj(value)
  if (typeof f.title !== 'string') return null
  const webUrl = httpsUrlOf(f.webUrl)
  if (STATES.includes(f.state as FolderState)) {
    const access = obj(f.access)
    return {
      view: 'owner',
      title: f.title,
      webUrl,
      state: f.state as FolderState,
      reason: REASONS.includes(f.reason as FolderReason) ? (f.reason as FolderReason) : null,
      managedWith: f.managedWith === 'owner' ? 'owner' : 'manager',
      access: { inPlace: count(access.inPlace), pending: count(access.pending), failed: count(access.failed) },
      addedOutside: count(f.addedOutside),
    }
  }
  return {
    view: 'member',
    title: f.title,
    webUrl,
    myAccess: MY_ACCESS.includes(f.myAccess as MyFolderAccess) ? (f.myAccess as MyFolderAccess) : 'pending',
  }
}

/** A member's access as the owner's answer gives it (PROF-SPACE-003); undefined for none. */
export function memberFolderAccessOf(value: unknown): MemberFolderAccess | undefined {
  const a = obj(value)
  const states = ['in-place', 'pending', 'failed', 'none'] as const
  const state = states.find((s) => s === a.state)
  if (!state) return undefined
  return {
    state,
    ...(a.role === 'reader' || a.role === 'editor' || a.role === 'manager' ? { role: a.role } : {}),
    ...(FOLDER_ACCESS_REASONS.includes(a.reason as FolderAccessReason)
      ? { reason: a.reason as FolderAccessReason }
      : {}),
  }
}

/** The people the folder holds that the agent did not add (`addedOutside`, PROF-SPACE-003); undefined for none given. */
export function addedOutsideOf(value: unknown): { name: string }[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map(obj).flatMap((p) => (typeof p.name === 'string' && p.name ? [{ name: p.name }] : []))
}

/** The body of an item `folder-access` (PROF-TOOL-042); null for one with no member or no source. */
export function folderAccessNoticeOf(value: unknown): FolderAccessNotice | null {
  const n = obj(value)
  const member = obj(n.member)
  const source = obj(n.source)
  const feature = obj(n.feature)
  if (typeof member.name !== 'string' || typeof source.id !== 'string' || !source.id) return null
  return {
    member: { name: member.name },
    feature: { id: str(feature.id), title: str(feature.title, str(feature.id)) },
    source: { id: source.id, title: str(source.title, source.id) },
    folder: { title: str(obj(n.folder).title) },
    reason: FOLDER_ACCESS_REASONS.includes(n.reason as FolderAccessReason)
      ? (n.reason as FolderAccessReason)
      : 'unavailable',
  }
}

// ---------------------------------------------------------------------------------------------------- Add

/**
 * The modes Add, or Change provider, offers for a provider of Files (UI-CONV-069, PROF-TOOL-040): the provider's own
 * `locations` among the item's `providers`, or the item's `locations` for the provider it describes (the one in use, or
 * the default while none is); the managed one first. Empty for a feature with no modes.
 */
export function locationsFor(
  tool: Pick<SpaceTool, 'providers' | 'locations' | 'source'>,
  source: string
): SpaceToolLocation[] {
  const provider = tool.providers.find((p) => p.source === source)
  if (provider?.locations.length) return provider.locations
  const described = tool.source ?? (tool.providers.find((p) => p.default) ?? tool.providers[0])?.source
  return described === source ? tool.locations : []
}

/** Whether Add shows the choice of the two modes (UI-CONV-069): a provider that has both. */
export function choosesLocation(locations: readonly SpaceToolLocation[]): boolean {
  return locations.length > 1
}

/** The mode selected first (UI-CONV-069): the managed one where it is offered, the one there is, none for no mode. */
export function defaultLocationOf(locations: readonly SpaceToolLocation[]): SpaceToolLocation | null {
  return locations.includes('managed') ? 'managed' : (locations[0] ?? null)
}

/**
 * The request of Add (PROF-TOOL-002, PROF-TOOL-040): the provider chosen, with the mode chosen where the provider has
 * modes (the one there is, when it has one), and none for a feature with no modes.
 */
export function addInputOf(source: string, location: SpaceToolLocation | null): AddSpaceToolInput {
  return { source, ...(location ? { location } : {}) }
}

// ---------------------------------------------------------------------------------------------------- the folder

/** Whether the agent manages the feature's folder: the owner's mode in use, or a member's item that carries a folder. */
export function isManaged(tool: Pick<SpaceTool, 'location' | 'folder'>): boolean {
  return tool.location === 'managed' || tool.folder !== null
}

/** The owner's view of the managed folder of an item; null for a member's or for none. */
export function ownerFolderOf(tool: Pick<SpaceTool, 'folder'>): OwnerFolder | null {
  return tool.folder?.view === 'owner' ? tool.folder : null
}

/**
 * The line of a managed folder, on the row of Files and in About (UI-CONV-052, UI-CONV-070): "Folder: <folder> ·
 * Managed by <agent>", then "Open in <provider>" where the folder has a `webUrl`, which opens it in a new tab. Null for
 * an item with no managed folder.
 */
export interface FolderLine {
  folder: string
  provider: string
  webUrl: string | null
}

export function folderLineOf(tool: Pick<SpaceTool, 'folder' | 'title' | 'source'>): FolderLine | null {
  if (!tool.folder) return null
  return { folder: tool.folder.title, provider: tool.title ?? tool.source ?? '', webUrl: tool.folder.webUrl }
}

/**
 * What the owner reads of the folder's state (UI-CONV-052, UI-CONV-070), and the control it offers: `allow`, the
 * managing account is not connected or lacks a scope ("Allow <provider> to manage this space's folder", with Allow,
 * which starts the sign-in of the account for the space); `creating` ("Making the folder at <provider>…");
 * `needsManager` (with Check again); `failed` (with Try again); `ready`.
 */
export type FolderStatus = 'allow' | 'creating' | 'needsManager' | 'failed' | 'ready'

export function folderStatusOf(folder: Pick<OwnerFolder, 'state' | 'reason'>): FolderStatus {
  if (folder.state !== 'ready' && (folder.reason === 'not-connected' || folder.reason === 'scope-missing'))
    return 'allow'
  if (folder.state === 'creating') return 'creating'
  if (folder.state === 'needs-manager') return 'needsManager'
  if (folder.state === 'failed') return 'failed'
  return 'ready'
}

/** The control that checks the folder again (`folder.check`, PROF-TOOL-043): Check again, Try again, or none. */
export function folderCheckOf(status: FolderStatus): 'checkAgain' | 'tryAgain' | null {
  return status === 'needsManager' ? 'checkAgain' : status === 'failed' ? 'tryAgain' : null
}

/** How many members have no access yet (UI-CONV-052): those whose access waits or failed. */
export function membersWithoutAccessOf(folder: Pick<OwnerFolder, 'access'>): number {
  return folder.access.pending + folder.access.failed
}

/**
 * What a member reads of their own Files while their access is not in place (UI-CONV-070, UI-CONV-052): "No access yet.
 * <agent> is giving you access to this space's folder."
 */
export function myAccessWaits(tool: Pick<SpaceTool, 'folder'>): boolean {
  return tool.folder?.view === 'member' && tool.folder.myAccess !== 'in-place'
}

/**
 * The kind of folder the words name (UI-CONV-052, agent TOOL-FEAT-024): a `shared drive` where the owner's own account
 * manages it (Google Drive, `managedWith: "owner"`), a `team folder` where the managing account does (Nextcloud).
 */
export type FolderKind = 'sharedDrive' | 'teamFolder'

export function folderKindOf(folder: Pick<OwnerFolder, 'managedWith'>): FolderKind {
  return folder.managedWith === 'owner' ? 'sharedDrive' : 'teamFolder'
}

/**
 * The line that removing Files, or changing its provider, adds to its question while the agent manages its folder
 * (UI-CONV-052, agent TOOL-FEAT-032): "<agent> stops managing the <kind of folder> <folder>. It stays at <provider>
 * with its members and its files." The agent's `DELETE` releases the folder at once and says nothing: the client says
 * it before it sends. Null for an item whose folder the agent does not manage.
 */
export function folderReleaseOf(
  tool: Pick<SpaceTool, 'folder' | 'location' | 'title' | 'source'>
): { kind: FolderKind; folder: string; provider: string } | null {
  const folder = ownerFolderOf(tool)
  if (!folder || tool.location !== 'managed') return null
  return { kind: folderKindOf(folder), folder: folder.title, provider: tool.title ?? tool.source ?? '' }
}

/** The longest name of a folder the profile takes (agent decision 86, PROF-TOOL-043). */
export const FOLDER_TITLE_MAX = 100

/** The name a rename sends (PROF-TOOL-043): trimmed; null for none, which sends nothing. */
export function folderTitleOf(typed: string): string | null {
  const title = typed.trim()
  return title ? title : null
}

/** `PATCH …/tools/{source}` that renames the managed folder, at once (`200 { tool }`, PROF-TOOL-043). */
export function folderRenameOf(title: string): SpaceToolPatchInput {
  return { folder: { title } }
}

/** `PATCH …/tools/{source}` that checks the folder again, and the members whose access failed (`202 { tool }`). */
export const FOLDER_CHECK: SpaceToolPatchInput = { folder: { check: true } }

// ---------------------------------------------------------------------------------------------------- Members

/**
 * A member's access, in Members (UI-CONV-052, UI-CONV-070): nothing when in place, or for a member given none;
 * "No access yet" while it waits; "No access yet: <reason>" once it failed, for a reason UI-CONV-052 words, and "No
 * access yet" for one it does not.
 */
export type MemberAccessLine = { key: 'noAccess' } | { key: 'noAccessBecause'; reason: WordedAccessReason }

export function memberAccessLineOf(access: MemberFolderAccess | undefined): MemberAccessLine | null {
  if (!access || access.state === 'in-place' || access.state === 'none') return null
  if (access.state === 'failed' && access.reason && isWordedReason(access.reason))
    return { key: 'noAccessBecause', reason: access.reason }
  return { key: 'noAccess' }
}

/** Whether UI-CONV-052 words a reason of a member's access. */
export function isWordedReason(reason: FolderAccessReason): reason is WordedAccessReason {
  return (WORDED as readonly string[]).includes(reason)
}

// ---------------------------------------------------------------------------------------------------- Notifications

/**
 * The words of an item `folder-access` (UI-CONV-052, UI-CONV-071): "<member> has no access to the folder <folder> yet:
 * <reason>", the reason worded with the provider's title; with no worded reason, the words end at "yet".
 */
export function folderAccessWordsOf(notice: FolderAccessNotice): {
  member: string
  folder: string
  provider: string
  reason: WordedAccessReason | null
} {
  return {
    member: notice.member.name,
    folder: notice.folder.title,
    provider: notice.source.title,
    reason: isWordedReason(notice.reason) ? notice.reason : null,
  }
}

// ---------------------------------------------------------------------------------------------------- Activity

/** The kinds of activity of a managed folder (PROF-TOOL-043), whose words name the folder (UI-CONV-051). */
export const FOLDER_ACTIVITY_KINDS = [
  'folder-created',
  'folder-renamed',
  'folder-released',
  'access-failed',
  'manager-needed',
] as const
export type FolderActivityKind = (typeof FOLDER_ACTIVITY_KINDS)[number]

export function isFolderActivity(kind: string): kind is FolderActivityKind {
  return (FOLDER_ACTIVITY_KINDS as readonly string[]).includes(kind)
}

/**
 * The folder a line of activity names (UI-CONV-051). A line carries no name of the folder (profile §3.7): it is the
 * folder of the line's feature as the space's tools name it now, else the space's title, after which the agent names
 * the folder it makes (agent D149).
 */
export function activityFolderOf(
  line: { feature?: { id: string }; tool?: { source: string } },
  tools: readonly Pick<SpaceTool, 'feature' | 'source' | 'folder'>[] | null | undefined,
  spaceTitle: string
): string {
  const tool = (tools ?? []).find(
    (x) => (line.feature?.id ? x.feature.id === line.feature.id : x.source === line.tool?.source) && x.folder
  )
  return tool?.folder?.title ?? spaceTitle
}
