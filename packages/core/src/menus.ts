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
  showAdmin: 'eye',
  /** Hide Admin, in its place while the grant is open */
  hideAdmin: 'eye-off',
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
