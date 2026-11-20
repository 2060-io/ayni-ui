/**
 * A conversation shared with a space, read by a member of it (UI-CONV-038, PROF-SPACE-007): its messages from the
 * shared history, its author and when it was shared; no message form, and nothing that changes it. A reply's Info
 * lists the sources its tools read, as in the author's own conversation (UI-CONV-047).
 */
import { ACTIVITY } from '@ayni.org/ayni-agui-profile'
import {
  type AgentRecord,
  isWithheld,
  ProfileError,
  type TranscriptMessage,
  toTranscriptMessage,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, Eye, Info } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { AttachmentLoader, AttachmentView } from './AttachmentView.js'
import { FlowCard } from './Cards.js'
import { WithheldLabel } from './Conversation.js'
import { Dialog } from './Dialog.js'
import { Markdown } from './Markdown.js'
import { MessageSources } from './Tools.js'

export function SharedConversationView() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const ref = snap.sharedFor
  const agent = snap.agents.find((a) => a.did === ref?.agentDid)
  const [messages, setMessages] = useState<TranscriptMessage[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState('')
  const load = (before?: string) => {
    if (!ref) return
    hub
      .sharedHistory(ref.agentDid, ref.spaceId, ref.conversation.id, before)
      .then((page) => {
        const older = (page.messages as Record<string, unknown>[]).map(toTranscriptMessage)
        setMessages((list) => {
          const known = new Set((list ?? []).map((m) => m.id))
          return [...older.filter((m) => !known.has(m.id)), ...(before ? (list ?? []) : [])]
        })
        setNext(page.nextBefore)
      })
      .catch((e) => {
        // no longer shared, or the reader left the space (PROF-SPACE-007)
        if (e instanceof ProfileError && e.status === 404) setGone(true)
        else setError(String((e as Error).message))
      })
  }
  useEffect(() => {
    setMessages(null)
    setGone(false)
    load()
  }, [ref?.agentDid, ref?.spaceId, ref?.conversation.id])
  const loader = useMemo(
    () =>
      ref
        ? (attachmentId: string) => hub.sharedAttachment(ref.agentDid, ref.spaceId, ref.conversation.id, attachmentId)
        : null,
    [ref, hub]
  )
  if (!ref || !agent) return <div className="center" />
  const { conversation } = ref
  return (
    <div className="shared-view">
      <header className="conv-header">
        <button
          type="button"
          className="icon-btn back"
          aria-label={t('app.back')}
          onClick={() => hub.openSpace(ref.agentDid, ref.spaceId)}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="conv-title">
          <h1>{conversation.title || t('column.untitled')}</h1>
          <span className="conv-sub">
            {agent.name} ·{' '}
            {t('spaces.sharedView.by', {
              name: conversation.author.name,
              time: formatTime(conversation.sharedAt, i18n.language),
            })}
          </span>
        </div>
      </header>
      <div className="banner info" role="note">
        <Eye size={15} aria-hidden="true" /> {t('spaces.sharedView.readOnly')}
      </div>
      {error ? <div className="banner warning">{error}</div> : null}
      <AttachmentLoader.Provider value={loader}>
        <div className="transcript read-only">
          {gone ? (
            <div className="muted center">{t('spaces.sharedView.gone')}</div>
          ) : messages === null ? (
            <div className="muted">{t('app.loading')}</div>
          ) : (
            <>
              {next ? (
                <button type="button" className="btn small load-older" onClick={() => load(next)}>
                  {t('spaces.sharedView.loadOlder')}
                </button>
              ) : null}
              {messages.map((m) => (
                <ReadOnlyMessage key={m.id} m={m} author={conversation.author.name} agent={agent} />
              ))}
            </>
          )}
        </div>
      </AttachmentLoader.Provider>
    </div>
  )
}

/**
 * One message, as the shared history gives it: no toolbar, no reaction, nothing to answer (UI-CONV-038); a reply has
 * its Info, which changes nothing (UI-CONV-047).
 */
function ReadOnlyMessage({ m, author, agent }: { m: TranscriptMessage; author: string; agent: AgentRecord }) {
  const { t, i18n } = useTranslation()
  const [info, setInfo] = useState(false)
  const agentName = agent.name
  if (m.role === 'activity') {
    if (m.activityType === ACTIVITY.attachment) {
      const theirs = (m.content as { role?: string }).role === 'user'
      return (
        <article className={['row', theirs ? 'mine' : 'theirs'].join(' ')} aria-label={theirs ? author : agentName}>
          <div className="bubble-wrap">
            <AttachmentView sessionId="" attachment={m.content as never} mine={theirs} />
          </div>
        </article>
      )
    }
    if (m.activityType === ACTIVITY.flow) return <FlowCard flow={m.content as never} />
    return null
  }
  if (m.role === 'system') return <div className="msg system">{m.content}</div>
  const theirs = m.role === 'user'
  return (
    <article className={['row', theirs ? 'mine' : 'theirs'].join(' ')} aria-label={theirs ? author : agentName}>
      <div className="bubble-wrap">
        {/* a message of the author the AI never received is drawn as in their own transcript (UI-CONV-044) */}
        <div className={['msg', m.role, isWithheld(m) ? 'withheld' : ''].filter(Boolean).join(' ')}>
          <span className="body">{m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}</span>
          <span className="meta">
            {isWithheld(m) ? <WithheldLabel /> : null}
            {formatTime(m.at, i18n.language)}
          </span>
        </div>
      </div>
      {m.role === 'assistant' ? (
        <button
          type="button"
          className="icon-btn shared-info"
          aria-label={t('details.message')}
          onClick={() => setInfo(true)}
        >
          <Info size={15} aria-hidden="true" />
        </button>
      ) : null}
      {info ? (
        <Dialog title={t('details.message')} onClose={() => setInfo(false)}>
          <dl className="shared-info-list">
            <dt className="info-term">{t('details.sent')}</dt>
            <dd className="info-desc">
              {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' }).format(
                new Date(m.at)
              )}
            </dd>
            <MessageSources message={m} agent={agent} />
          </dl>
        </Dialog>
      ) : null}
    </article>
  )
}
