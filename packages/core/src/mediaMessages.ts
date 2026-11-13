/**
 * Reactions and replies on a media message (UI-CONV-024, APP-MSG-005, PROF-RUN-009/010): a picture, a video, a
 * file or a voice note is a message like a text. The agent knows it by the id of its entry, which each of its
 * attachments carries, never by the id of an attachment: a reaction or a reply names that entry, and the
 * reactions of the message are read under it. A reply quotes a media message by what it is.
 */
import { ACTIVITY } from '@ayni.org/ayni-agui-profile'
import { plainText, REPLY_QUOTE_LENGTH } from './conversationDesign.js'
import type { ReplyQuote, TranscriptMessage } from './types.js'

type Attachment = Extract<TranscriptMessage, { role: 'activity' }>

/** Whether a transcript message is an attachment of a media message. */
export function isAttachment(message: TranscriptMessage): message is Attachment {
  return message.role === 'activity' && message.activityType === ACTIVITY.attachment
}

/** The id the agent knows a message under: a text by its own, a media message by its entry's. */
export function targetIdOf(message: TranscriptMessage): string {
  return isAttachment(message) ? (message.entryId ?? message.id) : message.id
}

/** What a media message is, for the quote of a reply and for its menu. */
export type MediaKind = 'image' | 'voice' | 'video' | 'file'

export function mediaKindOf(message: Attachment): MediaKind {
  const type = (message.content as { type?: string }).type
  return type === 'image' || type === 'voice' || type === 'video' ? type : 'file'
}

/** The words a media message has of its own: a caption, a transcription; not the agent's placeholder for it. */
function ownWords(textRepr: unknown): string {
  const text = typeof textRepr === 'string' ? textRepr.trim() : ''
  return /^\[[^\]]*\]$/.test(text) ? '' : text
}

/** The quote a reply to any message carries (PROF-RUN-009): a text by its words, a media message by what it is. */
export function quoteOf(message: Exclude<TranscriptMessage, { role: 'system' }>): ReplyQuote {
  if (message.role !== 'activity')
    return {
      id: message.id,
      text: plainText(message.content).slice(0, REPLY_QUOTE_LENGTH),
      role: message.role === 'user' ? 'user' : 'assistant',
    }
  const content = message.content as { role?: string; textRepr?: string; filename?: string }
  return {
    id: targetIdOf(message),
    text: ownWords(content.textRepr).slice(0, REPLY_QUOTE_LENGTH),
    role: content.role === 'user' ? 'user' : 'assistant',
    media: mediaKindOf(message),
    ...(content.filename ? { filename: content.filename } : {}),
  }
}

/** The English names of a media message; a UI with its own languages translates the kind. */
export const MEDIA_COPY: Record<MediaKind, string> = {
  image: 'Photo',
  voice: 'Voice note',
  video: 'Video',
  file: 'File',
}

/**
 * What a quote shows: the words of the quoted message, else what it is. A file is named by its file name; `name`
 * gives the word for a kind in the UI's language.
 */
export function quoteLabel(quote: ReplyQuote, name: (kind: MediaKind) => string = (kind) => MEDIA_COPY[kind]): string {
  if (quote.text) return quote.text
  if (!quote.media) return ''
  return quote.media === 'file' && quote.filename ? quote.filename : name(quote.media)
}

/**
 * The last attachment of each media message: the one that shows the message's reactions when the message carries
 * several (UI-CONV-024). Keyed by the message's entry.
 */
export function lastAttachments(messages: readonly TranscriptMessage[]): Map<string, string> {
  const last = new Map<string, string>()
  for (const m of messages) if (isAttachment(m)) last.set(targetIdOf(m), m.id)
  return last
}
