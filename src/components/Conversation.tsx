/** The conversation pane (UI-CONV-*, UI-SESS-003/007/009, UI-TRUST-004/007, UI-CAP-001): banners, transcript, composer; binding while provisional. */
import { ACTIVITY, CLOSURE_REASONS } from '@2060.io/hologram-agui-profile'
import { CLOSURE_REASON_KEYS, type TranscriptMessage } from '@2060.io/hologram-ui-core'
import { ArrowLeft, Menu as MenuIcon, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { AttachmentView } from './AttachmentView.js'
import { Binding } from './Binding.js'
import { ApprovalCard, CapabilityCard, ElevationForm, GeneratingCard, MenuCard } from './Cards.js'
import { Composer } from './Composer.js'
import { Markdown } from './Markdown.js'
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

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId, lastContent, session?.sessionId])

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

  return (
    <>
      <header className="conv-header relative">
        <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
          <ArrowLeft size={20} />
        </button>
        <h1>{session.title || t('column.untitled')}</h1>
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
      {session.state === 'provisional' ? (
        <Binding session={session} />
      ) : (
        <>
          <div className="transcript" ref={listRef} aria-live="polite" aria-relevant="additions text">
            {!transcript?.complete && messages.length ? (
              <button
                type="button"
                className="btn small"
                style={{ alignSelf: 'center' }}
                onClick={() => void hub.loadOlder(session.sessionId)}
              >
                {t('directory.more')}
              </button>
            ) : null}
            {messages.map((m) => (
              <Message
                key={m.id}
                m={m}
                sessionId={session.sessionId}
                reactions={transcript?.reactions[m.id]}
                agentFeatures={agent.descriptor.features}
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
                {transcript.run.steps.map((s) => (
                  <span key={s}>{s}…</span>
                ))}
              </div>
            ) : transcript?.run && !messages.some((m) => m.role !== 'activity' && m.streaming) ? (
              <div className="progress" aria-live="polite">
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

function Message({
  m,
  sessionId,
  reactions,
  agentFeatures,
}: {
  m: TranscriptMessage
  sessionId: string
  reactions?: { emoji: string; by: string }[]
  agentFeatures: { reactions: boolean }
}) {
  const { t, i18n } = useTranslation()
  const hub = useHub()
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
  const _mine = m.role === 'user'
  return (
    <div className={`msg ${m.role}`}>
      {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
      <div className="meta">
        {formatTime(m.at, i18n.language)}
        {m.interrupted ? <span className="interrupted">({t('conversation.interrupted')})</span> : null}
        {m.role === 'assistant' && agentFeatures.reactions && !m.streaming ? (
          <fieldset className="reactions">
            {['👍', '👎', '❤️'].map((emoji) => {
              const has = reactions?.some((r) => r.emoji === emoji)
              return (
                <button
                  key={emoji}
                  type="button"
                  className="react-btn"
                  aria-pressed={has}
                  onClick={() =>
                    void hub.act(sessionId, {
                      kind: 'reaction',
                      messageId: m.id,
                      emoji,
                      action: has ? 'remove' : 'add',
                    })
                  }
                >
                  {emoji}
                </button>
              )
            })}
          </fieldset>
        ) : reactions?.length ? (
          <span className="reactions">
            {reactions.map((r, i) => (
              <span key={i} title={r.by}>
                {r.emoji}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
