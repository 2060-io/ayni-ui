/**
 * The design of the home page, written once for the two renderers of the Ayni UI: the browser (CSS) and the Ayni
 * app (React Native styles). The home page is the rail of controllers and, beside it, the column of the selected
 * controller: its header and one card per agent, which opens on the agent's conversations.
 *
 * The browser's stylesheet is the reference: a test in this repository compares it with these values. The app
 * builds its styles from them; it leaves out the brand mark at the foot of the rail (its tab bar holds the brand's
 * place) and draws the rest alike. The numbers are CSS pixels, read by React Native as density-independent points.
 */
import type { ColorRole } from './conversationDesign.js'

/** The text every surface starts from: its size, and its line height as a multiple of the size. */
export const BASE_TEXT = { fontSize: 15, lineHeight: 1.45 } as const

export const HOME_DESIGN = {
  rail: {
    width: 64,
    paddingY: 10,
    gap: 6,
    /** a controller's tile, and the bordered tiles that are not controllers (add, settings) */
    tile: { size: 48, radius: 14, initialsFontSize: 15, initialsWeight: 600, inactiveOpacity: 0.5 },
    ghost: { borderWidth: 1, iconSize: 22 },
    /** the bar to the left of the selected tile */
    selectedBar: { left: -8, inset: 10, width: 4, radius: 2 },
    /** unread messages, on the tile's top right corner */
    badge: { top: 2, right: 2, minWidth: 18, height: 18, paddingX: 5, radius: 9, fontSize: 11, fontWeight: 600 },
    /** something waits for the person, on the tile's bottom right corner */
    dot: { bottom: 4, right: 4, size: 9, borderWidth: 2 },
    /** the line under the pinned tiles, with its pin */
    separator: { width: 48, height: 14, lineWidth: 1, pinSize: 11, pinPaddingX: 3 },
    /**
     * The two zones a tile is dragged between, the pinned one above the line and the rest below: while a tile is
     * dragged both show a dashed outline, the one under the pointer a solid one; the empty pinned zone grows to
     * one slot.
     */
    zone: {
      minHeight: 12,
      radius: 12,
      droppableMinHeight: 48,
      droppableOutlineWidth: 1,
      /** the share of the accent in the dashed outline */
      droppableOutlineShare: 0.5,
      outlineOffset: -2,
      targetOutlineWidth: 2,
    },
    /** the tile being dragged, where it stood; and the line above the pinned tile it would land before */
    drag: { opacity: 0.4, scale: 0.96, dropLineWidth: 3 },
  },
  column: {
    header: { height: 64, paddingLeft: 12, paddingRight: 8, gap: 8, fontSize: 16, iconSize: 18, flagFontSize: 16 },
    /** one agent: its logo, its name with the trust mark, its links, its menu */
    agentRow: { gap: 10, paddingTop: 8, paddingRight: 6, paddingBottom: 8, paddingLeft: 10 },
    agentAvatar: { size: 40, radius: 12, initialsFontSize: 14 },
    agentText: { gap: 1 },
    agentTitle: { gap: 6, fontWeight: 600 },
    trustMark: { size: 24, radius: 6, iconSize: 16 },
    links: { gap: 10, fontSize: 11, lineHeight: 1.2 },
    /** the small icon buttons of a card: its menu, new conversation, search */
    smallButton: { size: 36, radius: 12, iconSize: 18 },
    /** the open card: the link state with the tools, then the conversations */
    body: { paddingX: 8, paddingBottom: 8, gap: 6 },
    meta: { paddingX: 4, gap: 8, fontSize: 12, stateGap: 5, iconSize: 12, toolsGap: 2 },
    conversationRow: {
      paddingY: 10,
      paddingLeft: 12,
      /** room for the row's menu button */
      paddingRight: 40,
      minHeight: 44,
      radius: 10,
      rowGap: 2,
      columnGap: 8,
      titleWeight: 600,
      previewFontSize: 13,
      timeFontSize: 12,
      /** the share of the accent mixed into the background of the selected row */
      selectedTint: 0.12,
      menuButtonSize: 36,
      menuIconSize: 16,
    },
    /** unread messages of a conversation, and of a closed card */
    count: { radius: 9, fontSize: 11, paddingY: 1, paddingX: 6 },
    sectionLabel: { fontSize: 12, letterSpacing: 0.04, gap: 6, paddingTop: 4, paddingX: 8, iconSize: 12 },
    empty: { fontSize: 13, paddingY: 6, paddingX: 8 },
  },
} as const

export type HomeDesign = typeof HOME_DESIGN

/** Which colour role paints what on the home page. */
export const HOME_COLORS = {
  rail: { background: 'surface', border: 'border', icon: 'muted' },
  tileInitials: { background: 'border', text: 'text' },
  ghost: { background: 'bg', border: 'border' },
  selectedBar: { background: 'accent' },
  badge: { background: 'danger' },
  dot: { background: 'warning', border: 'surface' },
  separator: { line: 'border', pin: 'muted', pinBackground: 'surface', target: 'accent' },
  zone: { outline: 'accent' },
  drag: { dropLine: 'accent' },
  column: { background: 'bg', border: 'border' },
  header: { icon: 'muted' },
  selectedCard: { background: 'surface' },
  links: { text: 'muted' },
  meta: { text: 'muted' },
  conversationRow: { preview: 'muted', time: 'muted', selectedTitle: 'accent' },
  count: { background: 'accent', text: 'accentContrast' },
  sectionLabel: { text: 'muted' },
} as const satisfies Record<string, Record<string, ColorRole>>

/** The trust mark of an agent, and the verdict of its Proof of Trust: one icon and one colour per result. */
export const TRUST_MARK = {
  trusted: { icon: 'shield-check', color: 'ok' },
  untrusted: { icon: 'shield-alert', color: 'danger' },
  unverified: { icon: 'shield-question', color: 'warning' },
} as const satisfies Record<string, { icon: string; color: ColorRole }>

export type TrustResult = keyof typeof TRUST_MARK

/** The icon before a controller's name: what stands behind its agents. */
export const CONTROLLER_KIND_ICON = {
  organization: 'building',
  persona: 'user',
  unverified: 'shield-question',
} as const

/**
 * The time on a message and on a conversation row: the hour today, the day and the hour before. An unreadable
 * date gives an empty string.
 */
export function formatTime(iso: string, locale: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = now.toDateString() === d.toDateString()
  return new Intl.DateTimeFormat(
    locale,
    today
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  ).format(d)
}
