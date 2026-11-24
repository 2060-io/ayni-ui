/**
 * The icon of each entry of the menus the browser and the Ayni app both draw, by the entry's key, as a lucide name
 * (lucide.dev): an entry shows the same icon in both, and two entries that mean the same show the same icon. The app
 * draws its menus as a sheet at the foot of the screen (ayni-spec APP-NAV-015) and the browser as a popover under the
 * button that opens it, each at its own size; the icon is drawn in the entry's colour, the danger red for an entry
 * that cannot be undone, and is hidden from assistive technology: the entry's words are its name. An entry the
 * service defines (an item of an agent's contextual menu) has its words alone, in both.
 *
 * The keys are the app's keys of its entries; the browser's own entries are named here too.
 */
export const MENU_ICON = {
  // the menu of an agent, behind the three dots of its card on Home (APP-HOME-020)
  notifications: 'bell',
  devices: 'monitor-smartphone',
  /** Show archived conversations */
  archived: 'archive',
  /** Show active conversations, while the archived ones show */
  active: 'messages-square',
  keeps: 'book-user',
  accounts: 'key-round',
  authenticate: 'user-check',
  /** the app's alone: the sign-in methods the person adds or removes (APP-SESS-028) */
  signInMethods: 'lock-keyhole',
  disconnect: 'unplug',
  /** Reconnect in the app, Link again in the browser: the connection back after Disconnect */
  reconnect: 'plug',
  remove: 'trash',
  details: 'info',
  /** the browser's alone: a space from a template (UI-CONV-039), with the icon of New space where a space is chosen */
  newSpace: 'plus',
  /** the browser's alone: the admin view of roles (UI-CONV-042) */
  roles: 'user-cog',
  /** the browser's alone: Spaces you steward (UI-CONV-068), for a steward of a template of spaces */
  steward: 'shield-user',
  /** Show Admin, for a person who holds `auditor` or `operator` (UI-ADMIN-001, APP-ADMIN-001) */
  showAdmin: 'shield-user',
  /** Hide Admin, in its place while the grant is open */
  hideAdmin: 'shield-off',
  // the rows of the ADMIN area of an agent's card while the grant is open (UI-ADMIN-003, APP-ADMIN-002), by their page
  /** Audit, for an `auditor` */
  audit: 'file-search',
  /** Operations, for an `operator` */
  operations: 'wrench',
  // the menu of a conversation from a list (APP-CONV-008/040), and the app's entries of the menu in a conversation
  rename: 'pencil',
  share: 'share-2',
  unshare: 'link-2-off',
  archive: 'archive',
  /** lucide 1.66 calls the same drawing archive-arrow-up and keeps this name as its alias */
  unarchive: 'archive-restore',
  close: 'trash',
  elevation: 'shield-plus',
  search: 'search',
} as const

export type MenuEntryKey = keyof typeof MENU_ICON
export type MenuIconName = (typeof MENU_ICON)[MenuEntryKey]

/**
 * The entries of an agent's menu, behind the three dots of its card: the column's card in the browser (UI-AGENTS-009)
 * and the service's card on the app's Home (APP-HOME-020). Both clients list the entries they offer in this one order
 * and with the words of `AGENT_MENU_COPY`: what the agent offers the person, then the connection, then the service's
 * page. An entry one client alone offers keeps its place among the others: New space, Spaces you steward and Roles are
 * the browser's; Sign-in methods, Authenticate and Service details the app's.
 */
export const AGENT_MENU_ORDER = [
  'notifications',
  'devices',
  /** Show archived conversations, or Show active conversations in its place while the archived ones show */
  'archived',
  'active',
  'newSpace',
  'keeps',
  'accounts',
  'steward',
  'roles',
  /** Show Admin, or Hide Admin in its place while the grant is open */
  'showAdmin',
  'hideAdmin',
  'signInMethods',
  'authenticate',
  'disconnect',
  'reconnect',
  'remove',
  'details',
] as const satisfies readonly MenuEntryKey[]

export type AgentMenuKey = (typeof AGENT_MENU_ORDER)[number]

/**
 * The English words of each entry of an agent's menu, the same in the browser and the app, by their path in the
 * browser's translation file (`agentMenu.<key>`): the browser's English file must say the same (a test compares them).
 * `{{agent}}` is the agent's name.
 */
export const AGENT_MENU_COPY = {
  'agentMenu.notifications': 'Notifications',
  'agentMenu.devices': 'Linked devices',
  'agentMenu.archived': 'Show archived conversations',
  'agentMenu.active': 'Show active conversations',
  'agentMenu.newSpace': 'New space',
  'agentMenu.keeps': 'What {{agent}} keeps about you',
  'agentMenu.accounts': 'Your accounts',
  'agentMenu.steward': 'Spaces you steward',
  'agentMenu.roles': 'Roles',
  'agentMenu.showAdmin': 'Show Admin',
  'agentMenu.hideAdmin': 'Hide Admin',
  'agentMenu.signInMethods': 'Sign-in methods',
  'agentMenu.authenticate': 'Authenticate',
  'agentMenu.disconnect': 'Disconnect',
  'agentMenu.reconnect': 'Reconnect',
  'agentMenu.remove': 'Remove',
  'agentMenu.details': 'Service details',
} as const satisfies Record<`agentMenu.${AgentMenuKey}`, string>

/** The entries of an agent's menu that cannot be undone, drawn in the danger red by both clients. */
export const AGENT_MENU_DANGER: ReadonlySet<AgentMenuKey> = new Set(['disconnect', 'remove'])

/** What a client offers in an agent's menu, beyond the connection, which `connected` decides. */
export interface AgentMenuOffer {
  /**
   * The client is connected to the agent: the app holds the connection, the browser is linked (UI-AGENTS-007). A
   * connected client offers Disconnect; one that is not offers Reconnect and Remove, and nothing read from the agent.
   */
  connected: boolean
  /** the agent's Notifications (UI-APPR-007, APP-CONV-061) */
  notifications?: boolean
  /** Linked devices: the app offers them always, the browser while it is linked (UI-AGENTS-006) */
  devices?: boolean
  /** the archived conversations show: Show active conversations in place of Show archived conversations */
  archivedShown?: boolean
  /** the browser's New space, for a person who may create a space (UI-CONV-039) */
  newSpace?: boolean
  /** What <agent> keeps about you (UI-CONV-033, APP-CONV-035) */
  keeps?: boolean
  /** Your accounts (UI-CONV-053, APP-CONV-053) */
  accounts?: boolean
  /** the browser's Spaces you steward (UI-CONV-068) */
  steward?: boolean
  /** the browser's Roles (UI-CONV-042) */
  roles?: boolean
  /** Show Admin or Hide Admin (UI-ADMIN-001, APP-ADMIN-001), as `adminMenuEntryOf` gives it */
  admin?: 'showAdmin' | 'hideAdmin' | null
  /** the app's Sign-in methods (APP-SESS-028) */
  signInMethods?: boolean
  /** the app's Authenticate, for a visitor (APP-SESS-018) */
  authenticate?: boolean
  /** the app's Service details, the service's page */
  details?: boolean
}

/** What needs the connection: read from the agent, or asked of it. */
const CONNECTED_ONLY: ReadonlySet<AgentMenuKey> = new Set([
  'notifications',
  'keeps',
  'accounts',
  'showAdmin',
  'hideAdmin',
  'signInMethods',
  'authenticate',
])

/**
 * The entries of an agent's menu a client shows, in the order of `AGENT_MENU_ORDER`: Show archived or Show active
 * conversations always; Disconnect while connected; Reconnect and Remove only while not connected; what needs the
 * connection only while connected; every other entry when the client offers it.
 */
export function agentMenuOf(offer: AgentMenuOffer): AgentMenuKey[] {
  const shown: Record<AgentMenuKey, boolean> = {
    notifications: !!offer.notifications,
    devices: !!offer.devices,
    archived: !offer.archivedShown,
    active: !!offer.archivedShown,
    newSpace: !!offer.newSpace,
    keeps: !!offer.keeps,
    accounts: !!offer.accounts,
    steward: !!offer.steward,
    roles: !!offer.roles,
    showAdmin: offer.admin === 'showAdmin',
    hideAdmin: offer.admin === 'hideAdmin',
    signInMethods: !!offer.signInMethods,
    authenticate: !!offer.authenticate,
    disconnect: offer.connected,
    reconnect: !offer.connected,
    remove: !offer.connected,
    details: !!offer.details,
  }
  return AGENT_MENU_ORDER.filter((key) => shown[key] && (offer.connected || !CONNECTED_ONLY.has(key)))
}
