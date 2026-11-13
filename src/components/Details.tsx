/** The side sheet (UI-SHELL-014): message info (UI-CONV-019). */
import { quoteLabel } from '@ayni.org/ayni-ui-core'
import { Copy, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { nameOf } from '../emoji.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { plainText } from './MessageActions.js'

/** What the UI knows about one message: time, outcome, the steps behind a reply, reactions, ids. */
export function MessageInfo() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const target = snap.inspect
  const session = snap.sessions.find((s) => s.sessionId === target?.sessionId)
  const agent = snap.agents.find((a) => a.did === session?.agentDid)
  const transcript = target ? snap.transcripts[target.sessionId] : undefined
  const m = transcript?.messages.find((x) => x.id === target?.messageId)
  if (!target || !session || !m) return null
  const close = () => hub.inspect(target.sessionId, null)
  const copy = (text: string) => void navigator.clipboard.writeText(text).catch(() => undefined)
  const reactions = transcript?.reactions[m.id] ?? []
  const me = session.principal?.displayName
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso))
  const text = m.role === 'activity' ? '' : m.content
  return (
    <div className="message-info">
      <div className="row-between">
        <h2>{t('details.message')}</h2>
        <button type="button" className="icon-btn" aria-label={t('app.close')} onClick={close}>
          <X size={18} />
        </button>
      </div>
      <section className="info-card">
        <h3>
          {m.role === 'user'
            ? t('details.fromYou')
            : m.role === 'assistant'
              ? t('details.fromAgent', { name: agent?.name ?? '' })
              : t('details.fromSystem')}
        </h3>
        <dl>
          <dt>{t('details.sent')}</dt>
          <dd>{when(m.at)}</dd>
          {m.role !== 'activity' && m.interrupted ? (
            <>
              <dt>{t('details.outcome')}</dt>
              <dd>{t('conversation.interrupted')}</dd>
            </>
          ) : null}
          {m.role !== 'activity' && m.replyTo ? (
            <>
              <dt>{t('conversation.reply')}</dt>
              <dd className="muted">{quoteLabel(m.replyTo, (kind) => t(`conversation.media.${kind}`))}</dd>
            </>
          ) : null}
          {reactions.length ? (
            <>
              <dt>{t('details.reactions')}</dt>
              <dd>
                {reactions.map((r) => (
                  <span key={r.by} className="info-reaction" title={nameOf(r.emoji)}>
                    {r.emoji} {r.by === me ? t('conversation.you') : r.by}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
      </section>
      {m.role === 'assistant' && m.steps?.length ? (
        <section className="info-card">
          <h3>{t('details.steps')}</h3>
          <ol>
            {m.steps.map((s, i) => (
              <li key={`${s}-${i}`}>{s}</li>
            ))}
          </ol>
        </section>
      ) : null}
      <section className="info-card">
        <h3>{t('details.record')}</h3>
        <dl>
          <dt>{t('details.messageId')}</dt>
          <dd className="mono">{m.id}</dd>
          <dt>{t('details.sessionId')}</dt>
          <dd className="mono">{session.sessionId}</dd>
        </dl>
        <div className="actions">
          <button type="button" className="btn small" onClick={() => copy(m.id)}>
            <Copy size={14} /> {t('details.copyId')}
          </button>
          {text ? (
            <button type="button" className="btn small" onClick={() => copy(plainText(text))}>
              <Copy size={14} /> {t('conversation.copyText')}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
