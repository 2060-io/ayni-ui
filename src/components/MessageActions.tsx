/**
 * Per-message actions (UI-CONV-017/018): the hover toolbar (react, reply, more), the quick reaction
 * bar, the full emoji picker, the context menu, and the touch sheet. One reaction per person per
 * message (UI-CONV-011): picking another replaces it, picking the current one removes it.
 */
import type { TranscriptMessage } from '@2060.io/hologram-ui-core'
import { Copy, FileText, Info, MoreHorizontal, PenLine, Reply, SmilePlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, type EmojiEntry, nameOf, QUICK, searchEmoji } from '../emoji.js'
import { useHub, useSnapshot } from '../state/useHub.js'

export type Reaction = { emoji: string; by: string }
export type Popover = 'quick' | 'picker' | 'menu' | null

export const isCoarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

type TextMessage = Extract<TranscriptMessage, { role: 'user' | 'assistant' | 'system' }>

interface Props {
  sessionId: string
  message: TextMessage
  reactions: Reaction[]
  /** the viewer's display name, to tell their own reaction apart */
  me: string | undefined
  canReact: boolean
  open: Popover
  setOpen: (p: Popover) => void
  /** the composer gets the message to quote */
  onReply: () => void
}

/** The toolbar at the edge of a message and the popovers it opens; `open` is owned by the message. */
export function MessageTools({ sessionId, message, reactions, me, canReact, open, setOpen, onReply }: Props) {
  const { t } = useTranslation()
  const hub = useHub()
  const mine = reactions.find((r) => r.by === me)?.emoji
  const react = async (emoji: string) => {
    setOpen(null)
    const remove = mine === emoji
    if (!remove) void hub.rememberEmoji(emoji)
    await hub
      .act(sessionId, { kind: 'reaction', messageId: message.id, emoji, action: remove ? 'remove' : 'add' })
      .catch((e) => hub.notify('error', String((e as Error).message)))
  }
  const copy = async (text: string) => {
    setOpen(null)
    try {
      await navigator.clipboard.writeText(text)
      hub.notify('info', t('conversation.copied'))
    } catch {
      hub.notify('error', t('conversation.copyFailed'))
    }
  }
  const info = () => {
    setOpen(null)
    hub.inspect(sessionId, message.id)
  }
  const reply = () => {
    setOpen(null)
    onReply()
  }
  const sheet = isCoarse()
  const menu = (
    <div className={sheet ? 'sheet' : 'popover menu-popover msg-menu'} role="menu" aria-label={t('conversation.more')}>
      {sheet ? <span className="grip" aria-hidden="true" /> : null}
      <button type="button" role="menuitem" onClick={reply}>
        <Reply size={16} aria-hidden="true" /> {t('conversation.reply')}
      </button>
      {canReact ? (
        <button type="button" role="menuitem" onClick={() => setOpen('quick')}>
          <SmilePlus size={16} aria-hidden="true" /> {t('conversation.react')}
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={() => void copy(plainText(message.content))}>
        <Copy size={16} aria-hidden="true" /> {t('conversation.copyText')}
      </button>
      {message.role === 'assistant' ? (
        <button type="button" role="menuitem" onClick={() => void copy(message.content)}>
          <FileText size={16} aria-hidden="true" /> {t('conversation.copyMarkdown')}
        </button>
      ) : null}
      {message.role === 'user' ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(null)
            hub.prefill(sessionId, message.content)
          }}
        >
          <PenLine size={16} aria-hidden="true" /> {t('conversation.editResend')}
        </button>
      ) : null}
      <span className="separator" aria-hidden="true" />
      <button type="button" role="menuitem" onClick={info}>
        <Info size={16} aria-hidden="true" /> {t('conversation.info')}
      </button>
    </div>
  )
  return (
    <div className="tools-anchor">
      <div className={['tools', open ? 'open' : ''].join(' ')}>
        {canReact ? (
          <button
            type="button"
            className="tool"
            aria-label={t('conversation.react')}
            aria-expanded={open === 'quick' || open === 'picker'}
            onClick={() => setOpen(open === 'quick' ? null : 'quick')}
          >
            <SmilePlus size={18} />
          </button>
        ) : null}
        <button type="button" className="tool" aria-label={t('conversation.reply')} onClick={reply}>
          <Reply size={18} />
        </button>
        <button
          type="button"
          className="tool"
          aria-label={t('conversation.more')}
          aria-expanded={open === 'menu'}
          onClick={() => setOpen(open === 'menu' ? null : 'menu')}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      {open === 'quick' ? (
        <QuickBar mine={mine} onPick={(e) => void react(e)} onMore={() => setOpen('picker')} sheet={sheet} />
      ) : null}
      {open === 'picker' ? (
        <EmojiPicker mine={mine} onPick={(e) => void react(e)} onClose={() => setOpen(null)} />
      ) : null}
      {open === 'menu' ? menu : null}
    </div>
  )
}

function QuickBar({
  mine,
  onPick,
  onMore,
  sheet,
}: {
  mine?: string
  onPick: (emoji: string) => void
  onMore: () => void
  sheet: boolean
}) {
  const { t } = useTranslation()
  // the quick set, with the viewer's current reaction included so it can always be removed
  const items = useMemo(() => {
    const base = QUICK.slice(0, 6)
    if (mine && !base.some((x) => x.e === mine)) return [{ e: mine, name: nameOf(mine) }, ...base.slice(0, 5)]
    return base
  }, [mine])
  return (
    <fieldset
      className={['quick', sheet ? 'quick-sheet' : 'popover quick-popover'].join(' ')}
      aria-label={t('conversation.react')}
    >
      {items.map((x) => (
        <button
          key={x.e}
          type="button"
          className={['quick-emoji', mine === x.e ? 'mine' : ''].join(' ')}
          aria-label={x.name}
          aria-pressed={mine === x.e}
          onClick={() => onPick(x.e)}
        >
          {x.e}
        </button>
      ))}
      <button type="button" className="quick-more" aria-label={t('conversation.allEmojis')} onClick={onMore}>
        <MoreHorizontal size={18} />
      </button>
    </fieldset>
  )
}

export function EmojiPicker({
  mine,
  onPick,
  onClose,
}: {
  mine?: string
  onPick: (emoji: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const snap = useSnapshot()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('recent')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  const recent: EmojiEntry[] = (snap.prefs.recentEmojis ?? []).map((e) => ({ e, name: nameOf(e) }))
  const results = query ? searchEmoji(query) : null
  const sheet = isCoarse()
  const grid = (items: EmojiEntry[]) => (
    <div className="emoji-grid">
      {items.map((x) => (
        <button
          key={x.e}
          type="button"
          className={['emoji-cell', mine === x.e ? 'mine' : ''].join(' ')}
          aria-label={x.name}
          aria-pressed={mine === x.e}
          onClick={() => onPick(x.e)}
        >
          {x.e}
        </button>
      ))}
    </div>
  )
  const shown = category === 'recent' ? recent : (CATEGORIES.find((c) => c.id === category)?.items ?? [])
  return (
    <section className={sheet ? 'sheet picker' : 'popover picker'} aria-label={t('conversation.allEmojis')}>
      <div className="picker-head">
        <input
          ref={inputRef}
          className="input"
          type="search"
          placeholder={t('conversation.searchEmoji')}
          aria-label={t('conversation.searchEmoji')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        />
        <button type="button" className="tool" aria-label={t('app.close')} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="picker-body">
        {results ? (
          results.length ? (
            grid(results)
          ) : (
            <div className="muted">{t('conversation.noEmoji')}</div>
          )
        ) : (
          <>
            <div className="picker-label">{t(`conversation.emoji.${category}`)}</div>
            {shown.length ? grid(shown) : <div className="muted">{t('conversation.noRecent')}</div>}
          </>
        )}
      </div>
      <div className="picker-tabs" role="tablist">
        {['recent', ...CATEGORIES.map((c) => c.id)].map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={category === id && !query}
            className={category === id && !query ? 'selected' : ''}
            onClick={() => {
              setQuery('')
              setCategory(id)
            }}
          >
            {t(`conversation.emoji.${id}`)}
          </button>
        ))}
      </div>
    </section>
  )
}

/** The reaction pill on the bubble corner; the viewer's own reaction is highlighted and clickable. */
export function ReactionPill({
  reactions,
  me,
  onOwn,
}: {
  reactions: Reaction[]
  me: string | undefined
  onOwn?: () => void
}) {
  const { t } = useTranslation()
  if (!reactions.length) return null
  const mine = reactions.find((r) => r.by === me)
  const others = reactions.filter((r) => r.by !== me)
  const title = reactions.map((r) => `${r.emoji} ${r.by === me ? t('conversation.you') : r.by}`).join(', ')
  if (mine && onOwn) {
    return (
      <button
        type="button"
        className="pill mine"
        title={title}
        aria-label={t('conversation.yourReaction', { emoji: nameOf(mine.emoji) })}
        aria-pressed="true"
        onClick={onOwn}
      >
        {mine.emoji}
        {others.map((r) => (
          <span key={r.by}>{r.emoji}</span>
        ))}
      </button>
    )
  }
  return (
    <span className="pill" title={title} role="img" aria-label={title}>
      {reactions.map((r) => (
        <span key={r.by}>{r.emoji}</span>
      ))}
    </span>
  )
}

/** Long press on touch screens opens the sheet (UI-CONV-017). */
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<number | undefined>(undefined)
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = undefined
  }
  return {
    onTouchStart: () => {
      clear()
      timer.current = window.setTimeout(onLongPress, ms)
    },
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
  }
}

/** Markdown markers stripped for the clipboard. */
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
