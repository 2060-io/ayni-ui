/**
 * An entry of a menu of this client, a popover under the button that opens it: its icon, the same as the Ayni app's
 * for the same entry (`MENU_ICON` in the core), then its words, then what follows them (a count). The icon takes the
 * entry's colour, the danger red included, in the light and the dark theme, and is hidden from assistive technology:
 * the words name the entry.
 */
import { MENU_ICON, type MenuEntryKey, type MenuIconName } from '@ayni.org/ayni-ui-core'
import {
  Archive,
  ArchiveRestore,
  Bell,
  BookUser,
  FileSearch,
  Info,
  KeyRound,
  Link2Off,
  LockKeyhole,
  type LucideIcon,
  MessagesSquare,
  MonitorSmartphone,
  Pencil,
  Plug,
  Plus,
  Search,
  Share2,
  ShieldOff,
  ShieldPlus,
  ShieldUser,
  Trash,
  Unplug,
  UserCheck,
  UserCog,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'

/** Every icon the core names: a name added there without its icon here fails the types. */
const ICONS: Record<MenuIconName, LucideIcon> = {
  bell: Bell,
  'monitor-smartphone': MonitorSmartphone,
  archive: Archive,
  'messages-square': MessagesSquare,
  'book-user': BookUser,
  'key-round': KeyRound,
  'user-check': UserCheck,
  'lock-keyhole': LockKeyhole,
  'shield-user': ShieldUser,
  unplug: Unplug,
  plug: Plug,
  trash: Trash,
  info: Info,
  plus: Plus,
  'user-cog': UserCog,
  pencil: Pencil,
  'share-2': Share2,
  'link-2-off': Link2Off,
  'archive-restore': ArchiveRestore,
  'shield-plus': ShieldPlus,
  search: Search,
  'shield-off': ShieldOff,
  'file-search': FileSearch,
  wrench: Wrench,
}

/** The icon the core names for an entry, or for a row of the ADMIN area by its page (`MENU_ICON`). */
export function menuIconOf(entry: MenuEntryKey): LucideIcon {
  return ICONS[MENU_ICON[entry]]
}

/** The size of the icon, as the other menus of this client draw theirs (a message's, a tile's). */
const ICON_SIZE = 16

export function MenuEntry({
  entry,
  danger = false,
  onClick,
  after,
  children,
}: {
  entry: MenuEntryKey
  /** it cannot be undone: in the danger red, its icon too */
  danger?: boolean
  onClick(): void
  /** at the end of the entry, after its words: a count */
  after?: ReactNode
  /** the words */
  children: ReactNode
}) {
  const Icon = menuIconOf(entry)
  return (
    <button type="button" role="menuitem" className={danger ? 'menu-entry danger' : 'menu-entry'} onClick={onClick}>
      <Icon size={ICON_SIZE} aria-hidden="true" />
      <span className="menu-label">{children}</span>
      {after}
    </button>
  )
}
