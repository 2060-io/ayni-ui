/** The conversation pane (UI-CONV-*, UI-SESS-003/007/009, UI-TRUST-004/007, UI-CAP-001, UI-SHELL-014): banners, transcript, composer; binding while provisional. */
import { ACTIVITY, CLOSURE_REASONS } from '@2060.io/hologram-agui-profile'
import { CLOSURE_REASON_KEYS, findOccurrences, type TranscriptMessage } from '@2060.io/hologram-ui-core'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Menu as MenuIcon,
  PanelRight,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { AttachmentView } from './AttachmentView.js'
import { Binding } from './Binding.js'
import { ApprovalCard, CapabilityCard, ElevationForm, GeneratingCard, MenuCard } from './Cards.js'
import { Composer } from './Composer.js'
import { type HighlightSpec, highlight } from './Highlight.js'
import { Markdown } from './Markdown.js'
import { MessageTools, type Popover, plainText, ReactionPill, useLongPress } from './MessageActions.js'
import { TrustCardDialog } from './TrustCard.js'

export function Conversation() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const [trustOpen, setTrustOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [elevation, setElevation] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const session = snap.sessions.find((s) => s.sessionId === snap.selectedSessionId)
  const agent = snap.agents.find((a) => a.did === session?.agentDid)
  const transcript = session ? snap.transcripts[session.sessionId] : undefined
  const messages = transcript?.messages ?? []
  const lastId = messages[messages.length - 1]?.id
  const lastContent =
    messages[messages.length - 1] && messages[messages.length - 1].role !== 'activity'
      ? (messages[messages.length - 1] as { content: string }).content.length
      : 0
  const stickToBottom = useRef(true)
  const loadingOlder = session ? !!snap.loadingOlder[session.sessionId] : false
  const search = session ? snap.search[session.sessionId] : undefined
  const hits = useMemo(() => (search ? findOccurrences(messages, search.query) : []), [messages, search])
  const current = search ? Math.min(search.current, Math.max(0, hits.length - 1)) : 0
  const currentHit = hits[current]
  const searchInput = useRef<HTMLInputElement>(null)

  // Ctrl+F / Cmd+F opens the bar unless the person is typing somewhere else (UI-CONV-020)
  useEffect(() => {
    if (!session) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return
      const active = document.activeElement as HTMLElement | null
      if (active && /^(input|textarea)$/i.test(active.tagName) && !active.closest('.conversation')) return
      e.preventDefault()
      hub.openSearch(session.sessionId, snap.search[session.sessionId]?.query ?? '')
      requestAnimationFrame(() => searchInput.current?.select())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [session, hub, snap.search])

  // the current hit scrolls into view
  useEffect(() => {
    if (!currentHit) return
    stickToBottom.current = false
    const el = listRef.current?.querySelector(`[data-hit="${currentHit.messageId}:${currentHit.ordinal}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [currentHit])

  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [lastId, lastContent, session?.sessionId])

  // older pages load as the top comes into view, keeping the scroll position (UI-CONV-012)
  const onScroll = () => {
    const el = listRef.current
    if (!el || !session) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (el.scrollTop < 80 && transcript && !transcript.complete && !loadingOlder && messages.length) {
      const before = el.scrollHeight
      void hub.loadOlder(session.sessionId).then(() => {
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop += listRef.current.scrollHeight - before
        })
      })
    }
  }

  // viewed receipts for agent messages on screen in a visible tab (UI-CONV-010)
  const receipted = useRef(new Set<string>())
  useEffect(() => {
    if (session?.state !== 'bound' || !agent?.descriptor.features.receipts || document.visibilityState !== 'visible')
      return
    const ids = messages
      .filter((m) => m.role === 'assistant' && !m.streaming && !receipted.current.has(m.id))
      .map((m) => m.id)
    if (!ids.length) return
    for (const id of ids) receipted.current.add(id)
    void hub.act(session.sessionId, { kind: 'receipt', messageIds: ids, state: 'viewed' }).catch(() => undefined)
  }, [messages, session, agent, hub])

  if (!session || !agent) {
    if (snap.view === 'conversation' && !session) return <div className="center" />
    const first = snap.agents.find((a) => a.did === snap.selectedAgentDid)
    return (
      <div className="center">
        {first && !snap.sessions.some((s) => s.agentDid === first.did) ? (
          <div>
            <p>{first.name}</p>
            <button type="button" className="btn primary" onClick={() => setTrustOpen(true)}>
              <ShieldCheck size={16} /> {t('trust.connect')}
            </button>
            {trustOpen ? <TrustCardDialog agent={first} connect onClose={() => setTrustOpen(false)} /> : null}
          </div>
        ) : null}
      </div>
    )
  }

  const trustBlocked = agent.trust.result !== 'trusted' && !agent.trustAcknowledged
  const closed = session.state === 'closed'
  const reasonKey = CLOSURE_REASON_KEYS[session.closedReason ?? 'agent'] ?? 'closure.agent'
  const contextual = session.hologram?.contextualMenu.items ?? []
  const detailsOpen = snap.prefs.detailsOpen !== false
  const me = session.principal?.displayName
  const thinking = transcript?.run && !messages.some((m) => m.role !== 'activity' && m.streaming)
  const step = (delta: number) => {
    if (!hits.length) return
    hub.setSearch(session.sessionId, { current: (current + delta + hits.length) % hits.length })
  }

  return (
    <>
      <header className="conv-header relative">
        <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
          <ArrowLeft size={20} />
        </button>
        <div className="conv-title">
          <h1>{session.title || t('column.untitled')}</h1>
          <span className="conv-sub">
            {agent.name}
            {agent.trust.result === 'trusted' ? (
              <span className="trusted">
                <ShieldCheck size={13} aria-hidden="true" /> {t('trust.trusted')}
                {agent.trust.operator?.name ? ` · ${agent.trust.operator.name}` : ''}
              </span>
            ) : (
              <span className={`result ${agent.trust.result}`}>{t(`trust.${agent.trust.result}`)}</span>
            )}
          </span>
        </div>
        {session.state === 'bound' && contextual.length ? (
          <button
            type="button"
            className="icon-btn"
            aria-label={t('conversation.approvals')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MenuIcon size={20} />
            {session.hologram?.pendingApprovals ? (
              <span className="badge">{session.hologram.pendingApprovals}</span>
            ) : null}
          </button>
        ) : null}
        <button type="button" className="icon-btn" aria-label={t('trust.title')} onClick={() => setTrustOpen(true)}>
          <ShieldCheck size={20} />
        </button>
        {session.state !== 'provisional' ? (
          <button
            type="button"
            className={['icon-btn', search ? 'on' : ''].join(' ')}
            aria-label={t('conversation.search')}
            aria-pressed={!!search}
            onClick={() => {
              if (search) hub.closeSearch(session.sessionId)
              else {
                hub.openSearch(session.sessionId)
                requestAnimationFrame(() => searchInput.current?.focus())
              }
            }}
          >
            <Search size={20} />
          </button>
        ) : null}
        <button
          type="button"
          className={['icon-btn', 'details-toggle', detailsOpen ? 'on' : ''].join(' ')}
          aria-label={detailsOpen ? t('app.hidePanel') : t('app.showPanel')}
          aria-pressed={detailsOpen}
          onClick={() => void hub.toggleDetails()}
        >
          <PanelRight size={20} />
        </button>
        {menuOpen ? (
          <div className="menu-popover" role="menu">
            {contextual.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
                  else void hub.act(session.sessionId, { kind: 'contextual.select', itemId: item.id }, item.label)
                }}
              >
                {item.label}
                {item.badge ? ` (${item.badge})` : ''}
              </button>
            ))}
            {session.hologram?.purposes?.length ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setElevation(true)
                }}
              >
                {t('conversation.requestElevation')}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>
      {!snap.online ? <div className="banner warning">{t('app.offline')}</div> : null}
      {agent.trust.result !== 'trusted' && agent.trustAcknowledged ? (
        <div className="banner warning">{t('trust.warning')}</div>
      ) : null}
      {trustBlocked && session.state === 'bound' ? (
        <div className="banner danger">
          {t('trust.changed')}
          <button type="button" className="btn small" onClick={() => void hub.acknowledgeTrust(agent.did)}>
            {t('trust.acknowledge')}
          </button>
          <button type="button" className="btn small danger" onClick={() => void hub.removeAgent(agent.did)}>
            {t('column.remove')}
          </button>
        </div>
      ) : null}
      {closed ? (
        <div className="banner info" role="status">
          <strong>{t('closure.title')}:</strong> {t(reasonKey)}
          {t('closure.writeToReconnect')}
        </div>
      ) : null}
      {search && session.state !== 'provisional' ? (
        <search className="search-bar" aria-label={t('conversation.search')}>
          <input
            ref={searchInput}
            className="input"
            type="search"
            placeholder={t('conversation.searchPlaceholder')}
            aria-label={t('conversation.searchPlaceholder')}
            value={search.query}
            onChange={(e) => hub.setSearch(session.sessionId, { query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                step(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') hub.closeSearch(session.sessionId)
            }}
          />
          <span className="count" aria-live="polite">
            {search.query.trim()
              ? hits.length
                ? t('conversation.matchCount', { current: current + 1, total: hits.length })
                : t('conversation.noMatches')
              : ''}
          </span>
          <button
            type="button"
            className="tool"
            aria-label={t('conversation.prevMatch')}
            disabled={!hits.length}
            onClick={() => step(-1)}
          >
            <ChevronUp size={18} />
          </button>
          <button
            type="button"
            className="tool"
            aria-label={t('conversation.nextMatch')}
            disabled={!hits.length}
            onClick={() => step(1)}
          >
            <ChevronDown size={18} />
          </button>
          {transcript && !transcript.complete ? (
            <button
              type="button"
              className="btn small"
              disabled={loadingOlder}
              onClick={() =>
                void hub.loadAll(session.sessionId).catch((e) => hub.notify('error', String(e.message ?? e)))
              }
            >
              {t('conversation.searchEarlier')}
            </button>
          ) : search.query.trim() ? (
            <span className="muted" style={{ fontSize: 12 }}>
              {t('conversation.searchedAll')}
            </span>
          ) : null}
          <button
            type="button"
            className="tool"
            aria-label={t('conversation.closeSearch')}
            onClick={() => hub.closeSearch(session.sessionId)}
          >
            <X size={18} />
          </button>
        </search>
      ) : null}
      {session.state === 'provisional' ? (
        <Binding session={session} />
      ) : (
        <>
          <div
            className="transcript"
            ref={listRef}
            onScroll={onScroll}
            aria-live="polite"
            aria-relevant="additions text"
          >
            {loadingOlder ? (
              <div className="loading-older" role="status">
                <Loader2 size={14} className="spin" aria-hidden="true" /> {t('conversation.loadingOlder')}
              </div>
            ) : null}
            {messages.map((m) => (
              <Message
                key={m.id}
                m={m}
                sessionId={session.sessionId}
                reactions={transcript?.reactions[m.id] ?? []}
                me={me}
                canReact={!!agent.descriptor.features.reactions && session.state === 'bound'}
                hl={
                  search?.query.trim()
                    ? {
                        query: search.query.trim(),
                        messageId: m.id,
                        current: currentHit?.messageId === m.id ? currentHit.ordinal : -1,
                        counter: { n: 0 },
                      }
                    : undefined
                }
              />
            ))}
            {Object.entries(transcript?.routed ?? {})
              .filter(([, r]) => r.status === 'pending' || Date.now() - Date.parse(r.at) < 60_000)
              .map(([key, r]) => (
                <CapabilityCard
                  key={key}
                  capability={{
                    kind: r.kind as never,
                    challengeType: r.challengeType as never,
                    status: r.status as never,
                    message: r.message,
                  }}
                />
              ))}
            {transcript?.run?.steps.length ? (
              <div className="progress steps" aria-live="polite">
                <Dots />
                {transcript.run.steps.map((s) => (
                  <span key={s}>{s}…</span>
                ))}
              </div>
            ) : thinking ? (
              <div className="progress thinking" role="status" aria-live="polite">
                <Dots />
                {t('conversation.thinking')}
              </div>
            ) : null}
            {elevation ? <ElevationForm session={session} onClose={() => setElevation(false)} /> : null}
          </div>
          {session.state === 'bound' || closed ? (
            <Composer sessionId={session.sessionId} disabled={trustBlocked} />
          ) : null}
        </>
      )}
      {trustOpen ? <TrustCardDialog agent={agent} onClose={() => setTrustOpen(false)} /> : null}
      <span className="sr-only">{CLOSURE_REASONS.length}</span>
    </>
  )
}

/** Three bouncing dots: the agent is working (UI-CONV-016). */
function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function Message({
  m,
  sessionId,
  reactions,
  me,
  canReact,
  hl,
}: {
  m: TranscriptMessage
  sessionId: string
  reactions: { emoji: string; by: string }[]
  me: string | undefined
  canReact: boolean
  hl?: HighlightSpec
}) {
  const { t, i18n } = useTranslation()
  const hub = useHub()
  const [open, setOpen] = useState<Popover>(null)
  const longPress = useLongPress(() => setOpen('menu'))
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      setOpen(null)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [open])
  if (m.role === 'activity') {
    switch (m.activityType) {
      case ACTIVITY.menu:
        return <MenuCard sessionId={sessionId} menu={m.content as never} />
      case ACTIVITY.attachment:
        return <AttachmentView sessionId={sessionId} attachment={m.content as never} mine={false} />
      case ACTIVITY.approval:
        return <ApprovalCard sessionId={sessionId} approval={m.content as never} />
      case ACTIVITY.capability:
        return <CapabilityCard capability={m.content as never} />
      case ACTIVITY.generating:
        return <GeneratingCard />
      default:
        return null
    }
  }
  if (m.role === 'system') return <div className="msg system">{m.content}</div>
  const mine = m.role === 'user'
  const reply = () =>
    hub.setReply(sessionId, {
      id: m.id,
      text: plainText(m.content).slice(0, 200),
      role: m.role as 'user' | 'assistant',
    })
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <article
      className={['row', mine ? 'mine' : 'theirs', open ? 'open' : ''].join(' ')}
      aria-label={mine ? t('conversation.you') : t('conversation.agent')}
      onContextMenu={(e) => {
        if (window.getSelection()?.toString()) return
        e.preventDefault()
        setOpen('menu')
      }}
      onPointerDown={stop}
      {...longPress}
    >
      <div className={`bubble-wrap ${reactions.length ? 'reacted' : ''}`}>
        <div className={`msg ${m.role}`}>
          {m.replyTo ? (
            <a
              className="quote"
              href={`#msg-${m.replyTo.id}`}
              onClick={(e) => {
                e.preventDefault()
                document
                  .getElementById(`msg-${m.replyTo?.id ?? ''}`)
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }}
            >
              <span className="quote-who">
                {m.replyTo.role === 'user' ? t('conversation.you') : t('conversation.agent')}
              </span>
              <span className="quote-text">{m.replyTo.text}</span>
            </a>
          ) : null}
          <span id={`msg-${m.id}`} className="body">
            {m.role === 'assistant' ? <Markdown text={m.content} hl={hl} /> : highlight(m.content, hl, m.id)}
          </span>
          <span className="meta">
            {m.interrupted ? <span className="interrupted">{t('conversation.interrupted')}</span> : null}
            {formatTime(m.at, i18n.language)}
          </span>
        </div>
        <ReactionPill reactions={reactions} me={me} onOwn={canReact ? () => setOpen('quick') : undefined} />
      </div>
      {!m.streaming ? (
        <MessageTools
          sessionId={sessionId}
          message={m}
          reactions={reactions}
          me={me}
          canReact={canReact}
          open={open}
          setOpen={setOpen}
          onReply={reply}
        />
      ) : null}
    </article>
  )
}
