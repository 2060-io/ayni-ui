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
} as const

export type ConversationDesign = typeof CONVERSATION_DESIGN

/** The colour roles both palettes define, in the browser as custom properties and in the app as theme colours. */
export type ColorRole = 'bg' | 'surface' | 'text' | 'muted' | 'border' | 'accent' | 'accentContrast' | 'warning'

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
