import { awaitsConfirmation } from './tools.js'

/**
 * The design of a conversation, written once for the two renderers of the Ayni UI: the browser (CSS) and the Ayni
 * app (React Native styles). The numbers are CSS pixels, which React Native reads as density-independent points.
 *
 * The browser's stylesheet is the reference: a test in this repository compares it with these values, so the two
 * cannot drift apart. The app builds its styles from them. A change of the conversation's look starts here.
 */
export const CONVERSATION_DESIGN = {
  transcript: { paddingTop: 16, paddingX: 20, paddingBottom: 20, gap: 18 },
  bubble: {
    /** a bubble never grows wider than this, nor than its row */
    maxWidth: 640,
    paddingTop: 9,
    paddingX: 14,
    paddingBottom: 8,
    radius: 16,
    /** the one tighter corner: bottom right on the person's messages, top left on the agent's */
    tailRadius: 4,
    /** between the quote, the body and the meta line */
    gap: 4,
    /** room for the reaction pill, which overlaps the bubble's bottom edge */
    reactedPaddingBottom: 16,
    reactedMarginBottom: 12,
  },
  /** a system line: centred, no bubble */
  system: { fontSize: 13 },
  /** the time and "interrupted", at the end of the bubble */
  meta: { fontSize: 11, gap: 6, userTextOpacity: 0.78 },
  /** the message a reply answers, at the top of the bubble */
  quote: {
    paddingY: 5,
    paddingX: 10,
    borderWidth: 3,
    radius: 6,
    fontSize: 13,
    gap: 1,
    marginBottom: 2,
    whoWeight: 600,
    textOpacity: 0.9,
    /** the share of the text colour mixed into a transparent background */
    tint: 0.07,
    /** on the person's bubble: the share of the contrast colour in the background and in the border */
    userTint: 0.16,
    userBorderOpacity: 0.7,
  },
  /** the reactions of a message: one pill on the inner bottom corner, the same on both sides (UI-CONV-011) */
  reactionPill: {
    height: 26,
    paddingX: 8,
    radius: 13,
    borderWidth: 1,
    fontSize: 14,
    gap: 3,
    /** how far the pill hangs below the bubble, and how far it steps out sideways */
    overlap: 13,
    outset: 6,
    /** the share of the accent mixed into the background of a pill that holds the person's own reaction */
    mineTint: 0.12,
  },
  /** the button that returns to the latest message */
  latestButton: { size: 36, right: 20, bottom: 12, awayBeyond: 320 },
  /**
   * A message of the person that the AI never received (UI-CONV-044, APP-CONV-045, D95): the person's bubble, in its
   * shape (`bubble`), with no fill, so the transcript's ground shows through, and an edge; in its meta line a lock,
   * then "Not shared with the AI" and the time.
   */
  withheld: { borderWidth: 1.5, iconSize: 11, iconGap: 3 },
  /**
   * The line "<agent> updated a memory" (UI-CONV-035, APP-CONV-037): a centred chip, the whole of it the button that
   * opens the memory's sheet, with a bookmark before the words and a chevron after them. No fill.
   */
  memoryChip: {
    paddingY: 4,
    paddingX: 10,
    radius: 999,
    borderWidth: 1,
    fontSize: 12.5,
    gap: 5,
    iconSize: 13,
    /**
     * the share of the edge's colour mixed into a transparent ground: the border role hardly shows on the dark ground
     * and faintly on white, the muted colour at this share reads on both
     */
    borderShare: 0.45,
  },
  /**
   * The agent is working (UI-CONV-016): a bubble on the agent's side with three bouncing dots, then the steps of
   * the run in progress or "Thinking…".
   */
  progress: { fontSize: 13, gap: 10, paddingY: 10, paddingX: 14, radius: 16, tailRadius: 4 },
  /**
   * The three dots: each rises and brightens, one after the other. Over one period a dot is at rest until it
   * starts, at its peak at `peakAt` of the period and back at rest from `restFrom`; the second and third dots
   * start `delayMs` and twice `delayMs` later.
   */
  dots: { size: 7, gap: 4, periodMs: 1200, delayMs: 150, lift: 4, restOpacity: 0.35, peakAt: 0.4, restFrom: 0.8 },
  /**
   * The exact action of a tool call (UI-CONV-045, UI-APPR-006, APP-CONV-046, APP-CONV-051), on the card of its
   * confirmation and of its approval, which is the transcript's card: the source's title in small muted words, the
   * action's title in bold, the account in a muted line, then every field, its label above its whole value, with its
   * line breaks (a value of indented JSON in a monospaced face), a pinned field with a lock before its label.
   */
  toolCard: {
    sourceFontSize: 12,
    titleFontSize: 15,
    titleWeight: 600,
    accountFontSize: 13,
    /** between the fields, and above the first */
    fieldsGap: 10,
    labelFontSize: 12,
    valueFontSize: 14,
    monoFontSize: 12.5,
    lockIconSize: 12,
    /** the outcome that replaces the buttons once decided */
    outcomeFontSize: 14,
    outcomeWeight: 600,
    /** "Your answer was not sent. Try again.": the danger colour at this share over the card, the words in the text colour */
    errorTint: 0.12,
  },
  /**
   * The amber notice of a confirmation asked because the reply read content from outside the organization
   * (UI-CONV-045): before the fields, a ground tinted with the warning colour (`tint` of it over the card), an edge and
   * an icon in it, the words in the text colour.
   */
  untrustedNotice: {
    paddingY: 8,
    paddingX: 10,
    radius: 8,
    borderWidth: 1,
    fontSize: 13,
    iconSize: 15,
    gap: 8,
    tint: 0.12,
  },
  /**
   * The Connect card (UI-CONV-057, APP-CONV-057): the transcript's card, on the agent's side. The source's title in
   * bold; its description and the binding in muted lines; then the state of the person's account in the text colour,
   * with an icon before it (a check once connected, an alert in the warning colour for one to reconnect), and Connect
   * or Reconnect. It holds no field.
   */
  connectCard: {
    titleFontSize: 15,
    titleWeight: 600,
    descriptionFontSize: 13,
    stateFontSize: 14,
    iconSize: 15,
    gap: 4,
  },
} as const

export type ConversationDesign = typeof CONVERSATION_DESIGN

/** The colour roles both palettes define, in the browser as custom properties and in the app as theme colours. */
export type ColorRole =
  | 'bg'
  | 'surface'
  | 'text'
  | 'muted'
  | 'border'
  | 'accent'
  | 'accentContrast'
  | 'warning'
  | 'ok'
  | 'danger'

/** Which colour role paints what in a conversation. */
export const CONVERSATION_COLORS = {
  userBubble: { background: 'accent', text: 'accentContrast' },
  assistantBubble: { background: 'surface', text: 'text' },
  system: { text: 'muted' },
  meta: { text: 'muted' },
  interrupted: { text: 'warning' },
  quote: { border: 'accent', who: 'accent' },
  reactionPill: { background: 'bg', border: 'border', text: 'text', mineBorder: 'accent' },
  latestButton: { background: 'bg', border: 'border', icon: 'text' },
  progress: { background: 'surface', text: 'muted' },
  dots: { color: 'accent' },
  /** no background: the transcript's ground shows through; the meta line, its lock included, in the accent */
  withheldBubble: { border: 'accent', text: 'text', meta: 'accent' },
  /** no background; the edge is `border` at `memoryChip.borderShare` */
  memoryChip: { border: 'muted', text: 'muted', icon: 'muted' },
  /** the exact action of a tool call, on the transcript's card (`surface`, `border`); `error`: a tint of it, the words in `text` */
  toolCard: {
    source: 'muted',
    title: 'text',
    account: 'muted',
    label: 'muted',
    value: 'text',
    lock: 'muted',
    outcome: 'text',
    error: 'danger',
    errorText: 'text',
  },
  /** the ground is `tint` at `untrustedNotice.tint` over the card's `surface` */
  untrustedNotice: { tint: 'warning', border: 'warning', icon: 'warning', text: 'text' },
  /** the Connect card, on the transcript's card (`surface`); `reconnect`: the icon of an account to connect again */
  connectCard: {
    title: 'text',
    description: 'muted',
    binding: 'muted',
    state: 'text',
    icon: 'muted',
    reconnect: 'warning',
  },
} as const satisfies Record<string, Record<string, ColorRole>>

/** The side a message sits on, and the corner its bubble tightens. */
export function bubbleSide(role: 'user' | 'assistant' | 'system'): 'mine' | 'theirs' | 'system' {
  return role === 'user' ? 'mine' : role === 'assistant' ? 'theirs' : 'system'
}

/** The quick row of the reaction picker (UI-CONV-017): the first six, with their English names. */
export const QUICK_REACTIONS = [
  { e: '❤️', name: 'heart' },
  { e: '👍', name: 'thumbs up' },
  { e: '👎', name: 'thumbs down' },
  { e: '😂', name: 'laughing' },
  { e: '😮', name: 'surprised' },
  { e: '😢', name: 'sad' },
] as const

/** Markdown markers stripped: for the clipboard and for the quote of a reply. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/<\/?(u|b|i|em|strong|s)>/g, '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
}

/** The longest quote a reply carries. */
export const REPLY_QUOTE_LENGTH = 200

/** The quote a reply carries (PROF-RUN-009): the message as plain text, shortened. */
export function replyQuoteOf(message: { id: string; role: 'user' | 'assistant' | 'system'; content: string }): {
  id: string
  text: string
  role: 'user' | 'assistant'
} {
  return {
    id: message.id,
    text: plainText(message.content).slice(0, REPLY_QUOTE_LENGTH),
    role: message.role === 'user' ? 'user' : 'assistant',
  }
}

/**
 * The reactions of a message as its one pill shows them (UI-CONV-011): the person's own first, then the others in
 * the order they came. `mine` is the person's emoji, when they reacted: the pill is then a control that changes it.
 */
export function reactionPillOf(
  reactions: readonly { emoji: string; by: string }[] | undefined,
  me: string | undefined
): { emojis: { emoji: string; by: string; own: boolean }[]; mine?: string } | null {
  if (!reactions?.length) return null
  const own = reactions.find((r) => r.by === me)
  const others = reactions.filter((r) => r.by !== me)
  return {
    emojis: [...(own ? [{ ...own, own: true }] : []), ...others.map((r) => ({ ...r, own: false }))],
    mine: own?.emoji,
  }
}

/** The wording of a conversation the two renderers share, in English (the browser's `conversation.*` keys). */
export const CONVERSATION_COPY = {
  thinking: 'Thinking…',
  /** the context line under the message form (UI-CONV-026), with the numbers of `contextLineOf` */
  context: 'Context {{used}} / {{max}}',
  contextCached: 'Context {{used}} / {{max}} · {{cached}} cached',
  /**
   * a message of the person the AI never received (UI-CONV-044): its meta line, before the time, and what screen
   * readers read of it
   */
  withheld: 'Not shared with the AI',
  /** the same message's Info */
  withheldInfo: "Only the service's code read this. It was not shared with the AI.",
  /** under a message one of whose attachments the agent held back for a credential (UI-MEDIA-009, UI-SEC-006) */
  attachmentWithheld: 'One attachment was held back: it contained a credential.',
} as const

/**
 * What the transcript shows while the agent works (UI-CONV-016): the steps of the run in progress when it reports
 * some; else "thinking", from the start of a run until its reply begins to stream; nothing when no run is in
 * progress or the reply is already arriving. A run started from another device of the person counts the same. While
 * the reply waits on a confirmation card, its last item, nothing shows under it (UI-CONV-045).
 */
export function progressOf(
  transcript:
    | {
        run: { steps: readonly string[] } | null
        messages: readonly { role: string; streaming?: boolean; activityType?: string; content?: unknown }[]
      }
    | null
    | undefined
): { kind: 'steps'; steps: readonly string[] } | { kind: 'thinking' } | null {
  const run = transcript?.run
  if (!run) return null
  if (awaitsConfirmation(transcript.messages)) return null
  if (run.steps.length) return { kind: 'steps', steps: run.steps }
  const replying = transcript.messages.some((m) => m.role !== 'activity' && m.streaming)
  return replying ? null : { kind: 'thinking' }
}
