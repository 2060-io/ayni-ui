/**
 * Audit (UI-ADMIN-004, UI-ADMIN-006; profile 3.5.5 §3.14, PROF-ADMIN-005; agent D133): for an `auditor` while the
 * browser's grant is open, opened from the ADMIN area of the agent's card. A reason is asked before the first read and
 * kept for the next reads of the grant, with Change; every read carries the reason in force. It offers the conversations
 * found by person, space and period, each opening its messages, decrypted, as a transcript nothing can be written to;
 * the evidence of a person; the call records, filtered; and the admin audit, newest first. Nothing here writes. A
 * person is found by name and picked from what the agent answers (name and department); the filter sends its id.
 */
import { ACTIVITY } from '@ayni.org/ayni-agui-profile'
import {
  ADMIN_REFUSAL_WORDS,
  type AdminAuditItem,
  type AgentRecord,
  type AuditConversation,
  type AuditEvidenceResponse,
  type AuditPerson,
  adminReasonFits,
  adminRefusalOf,
  auditPeopleQueryOf,
  auditPeriodOf,
  auditValueOf,
  deletionIdOf,
  TOOL_CALL_FIELDS,
  type TranscriptMessage,
  toTranscriptMessage,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, CircleAlert, Eye, Paperclip, X } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { untilWords } from './AdminArea.js'
import { FlowCard } from './Cards.js'
import { Markdown } from './Markdown.js'

type T = (key: string, options?: Record<string, unknown>) => string

/** The words of a refusal of Audit or Operations (UI-ADMIN-006), or the error's own. */
export function adminErrorWords(e: unknown, t: T): string {
  const refusal = adminRefusalOf(e)
  return refusal ? t(ADMIN_REFUSAL_WORDS[refusal]) : String((e as Error)?.message ?? e)
}

/** A refusal or a failure, under what it concerns. */
export function AdminError({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="banner warning admin-error" role="alert">
      <CircleAlert size={15} aria-hidden="true" /> {text}
    </div>
  )
}

/** The header of Audit and Operations: back, the page's name, the agent and the time the grant ends. */
export function AdminHeader({ agent, title }: { agent: AgentRecord; title: string }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const grant = snap.adminAccess[agent.did]?.grant
  return (
    <header className="conv-header">
      <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
        <ArrowLeft size={20} />
      </button>
      <div className="conv-title">
        <h1>{title}</h1>
        <span className="conv-sub">
          {agent.name}
          {grant ? ` · ${t('adminAccess.until', { time: untilWords(grant.expiresAt, i18n.language) })}` : ''}
        </span>
      </div>
    </header>
  )
}

/** A reason typed for a read or an action (UI-ADMIN-004, UI-ADMIN-005): at least one letter or digit. */
export function ReasonField({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  return (
    <label className="field">
      {t('adminAccess.reason')}
      <input
        className="input admin-reason"
        // biome-ignore lint/a11y/noAutofocus: the reason is what the page asks first
        autoFocus={autoFocus}
        maxLength={500}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

type Segment = 'conversations' | 'evidence' | 'calls' | 'log'
const SEGMENTS: Segment[] = ['conversations', 'evidence', 'calls', 'log']

export function AuditPage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const agent = snap.agents.find((a) => a.did === snap.adminPageFor)
  const reason = agent ? hub.auditReasonOf(agent.did) : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [segment, setSegment] = useState<Segment>('conversations')
  if (!agent) return <div className="center" />
  const asking = !reason || editing
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!adminReasonFits(draft)) return
    hub.setAuditReason(agent.did, draft)
    setEditing(false)
  }
  return (
    <div className="admin-page audit-page">
      <AdminHeader agent={agent} title={t('adminAccess.audit')} />
      {asking ? (
        <div className="space-body">
          <form className="box dialog-form audit-reason-form" onSubmit={submit}>
            <ReasonField value={draft} onChange={setDraft} autoFocus />
            <span className="muted small">{t('adminAccess.reasonHint')}</span>
            <div className="dialog-actions">
              {reason ? (
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  {t('app.cancel')}
                </button>
              ) : null}
              <button type="submit" className="btn primary" disabled={!adminReasonFits(draft)}>
                {t('adminAccess.useReason')}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="banner info audit-reason" role="note">
            <span className="ellipsis">{t('adminAccess.reasonInForce', { reason })}</span>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setDraft(reason ?? '')
                setEditing(true)
              }}
            >
              {t('adminAccess.changeReason')}
            </button>
          </div>
          <div className="segments" role="tablist">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={segment === s}
                className={segment === s ? 'seg on' : 'seg'}
                onClick={() => setSegment(s)}
              >
                {t(`adminAccess.auditPage.${s}`)}
              </button>
            ))}
          </div>
          <div className="space-body" role="tabpanel">
            {segment === 'conversations' ? (
              <ConversationsPanel agent={agent} reason={reason as string} />
            ) : segment === 'evidence' ? (
              <EvidencePanel agent={agent} reason={reason as string} />
            ) : segment === 'calls' ? (
              <CallsPanel agent={agent} reason={reason as string} />
            ) : (
              <LogPanel agent={agent} reason={reason as string} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the label's child
    <label className="field audit-field">
      {label}
      {children}
    </label>
  )
}

function TextInput({ value, onChange, list }: { value: string; onChange: (v: string) => void; list?: string }) {
  return <input className="input" value={value} list={list} onChange={(e) => onChange(e.target.value)} />
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
}

/** How long the typing pauses before the name typed is searched: each search is a read the agent audits. */
export const PERSON_SEARCH_PAUSE_MS = 300

/**
 * The person a filter of Audit takes, found by name: the name typed is searched once the typing pauses, with the
 * reason in force, and the people the agent answers are offered by name and department; the one picked is the filter,
 * by its Principal id, until another is chosen.
 */
function PersonPicker({
  agent,
  reason,
  person,
  onChange,
}: {
  agent: AgentRecord
  reason: string
  person: AuditPerson | null
  onChange: (person: AuditPerson | null) => void
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState('')
  const [people, setPeople] = useState<AuditPerson[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const q = person ? null : auditPeopleQueryOf(text)
    setError('')
    if (!q) {
      setPeople(null)
      return
    }
    let current = true
    const timer = setTimeout(() => {
      hub
        .adminCall(agent.did, (client, token) => client.auditPeople(token, reason, q))
        .then((answer) => {
          if (current) setPeople(answer.people)
        })
        .catch((e) => {
          if (current) setError(adminErrorWords(e, t))
        })
    }, PERSON_SEARCH_PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [text, person, reason, agent.did])
  return (
    <div className="field audit-field person-picker">
      <label htmlFor={id}>{t('adminAccess.auditPage.person')}</label>
      {person ? (
        <div className="person-chosen">
          <span className="space-text">
            <span className="space-name">{person.name}</span>
            {person.department ? <span className="space-sub">{person.department}</span> : null}
          </span>
          <button
            id={id}
            type="button"
            className="icon-btn small"
            aria-label={t('adminAccess.auditPage.otherPerson')}
            onClick={() => {
              setText('')
              onChange(null)
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          <input
            id={id}
            className="input person-search"
            value={text}
            placeholder={t('adminAccess.auditPage.personHint')}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            // Enter picks nothing and runs no search of the form: a person is picked from the list
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
          />
          {people === null ? null : (
            <ul className="person-results" aria-label={t('adminAccess.auditPage.people')}>
              {people.length ? (
                people.map((p) => (
                  <li key={p.principalId}>
                    <button type="button" className="space-row person-option" onClick={() => onChange(p)}>
                      <span className="space-text">
                        <span className="space-name">{p.name}</span>
                        {p.department ? <span className="space-sub">{p.department}</span> : null}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="muted person-none">{t('adminAccess.auditPage.noPeople')}</li>
              )}
            </ul>
          )}
        </>
      )}
      <AdminError text={error} />
    </div>
  )
}

/** The name of the person picked, for the id the agent answers with; the id itself for anyone else. */
const personWords = (person: AuditPerson | null, principalId: string) =>
  person && person.principalId === principalId ? person.name : principalId

/** The spaces the auditor knows, offered by title for the field Space, which takes any space's id. */
function SpaceOptions({ agent, id }: { agent: AgentRecord; id: string }) {
  const snap = useSnapshot()
  return (
    <datalist id={id}>
      {(snap.spaces[agent.did]?.spaces ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </datalist>
  )
}

/** The conversations found by person, space and period, each opening its messages (UI-ADMIN-004). */
function ConversationsPanel({ agent, reason }: { agent: AgentRecord; reason: string }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [person, setPerson] = useState<AuditPerson | null>(null)
  const [space, setSpace] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [found, setFound] = useState<AuditConversation[] | null>(null)
  const [open, setOpen] = useState<AuditConversation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const find = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const answer = await hub.adminCall(agent.did, (client, token) =>
        client.auditConversations(token, reason, {
          principal: person?.principalId,
          space: space.trim() || undefined,
          ...auditPeriodOf(from, to),
        })
      )
      setFound(answer.conversations)
    } catch (err) {
      setError(adminErrorWords(err, t))
    } finally {
      setBusy(false)
    }
  }
  if (open)
    return (
      <AuditTranscript
        agent={agent}
        reason={reason}
        conversation={open}
        personName={personWords(person, open.principalId)}
        onBack={() => setOpen(null)}
      />
    )
  const spaceTitle = (id: string) => snap.spaces[agent.did]?.spaces.find((s) => s.id === id)?.title ?? id
  return (
    <>
      <form className="audit-filters" onSubmit={(e) => void find(e)}>
        <PersonPicker agent={agent} reason={reason} person={person} onChange={setPerson} />
        <Field label={t('adminAccess.auditPage.space')}>
          <TextInput value={space} onChange={setSpace} list="audit-spaces" />
        </Field>
        <SpaceOptions agent={agent} id="audit-spaces" />
        <Field label={t('adminAccess.auditPage.from')}>
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label={t('adminAccess.auditPage.to')}>
          <DateInput value={to} onChange={setTo} />
        </Field>
        <div className="audit-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {t('adminAccess.auditPage.find')}
          </button>
        </div>
      </form>
      <AdminError text={error} />
      {found === null ? null : found.length ? (
        <ul className="audit-list">
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" className="space-row audit-row" onClick={() => setOpen(c)}>
                <span className="space-text">
                  <span className="space-name">{c.title || t('adminAccess.auditPage.untitled')}</span>
                  <span className="space-sub">
                    {[
                      personWords(person, c.principalId),
                      spaceTitle(c.spaceId),
                      t(`adminAccess.auditPage.state.${c.state}`),
                      c.lastActivityAt ? formatTime(c.lastActivityAt, i18n.language) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="muted empty">{t('adminAccess.auditPage.noneFound')}</div>
      )}
    </>
  )
}

/** A conversation's messages, decrypted, as a transcript nothing can be written to (UI-ADMIN-004). */
function AuditTranscript({
  agent,
  reason,
  conversation,
  personName,
  onBack,
}: {
  agent: AgentRecord
  reason: string
  conversation: AuditConversation
  /** the person's name when it was picked, its id otherwise */
  personName: string
  onBack: () => void
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const [messages, setMessages] = useState<TranscriptMessage[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState('')
  const load = (before?: string) => {
    setError('')
    hub
      .adminCall(agent.did, (client, token) => client.auditMessages(token, reason, conversation.id, before))
      .then((page) => {
        // each page oldest first; an older page goes before what is shown
        const older = page.messages.map(toTranscriptMessage)
        setMessages((list) => {
          const known = new Set((list ?? []).map((m) => m.id))
          return [...older.filter((m) => !known.has(m.id)), ...(before ? (list ?? []) : [])]
        })
        setNext(page.nextBefore)
      })
      .catch((e) => setError(adminErrorWords(e, t)))
  }
  // read once per conversation and reason
  useEffect(() => {
    setMessages(null)
    load()
  }, [conversation.id, reason])
  return (
    <section className="audit-transcript" aria-label={conversation.title || t('adminAccess.auditPage.untitled')}>
      <div className="audit-transcript-head">
        <button type="button" className="btn small" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> {t('adminAccess.auditPage.backToList')}
        </button>
        <span className="space-name">{conversation.title || t('adminAccess.auditPage.untitled')}</span>
        <span className="space-sub">{personName}</span>
      </div>
      <div className="banner info" role="note">
        <Eye size={15} aria-hidden="true" /> {t('adminAccess.auditPage.readOnly')}
      </div>
      <AdminError text={error} />
      <div className="transcript read-only audit-messages">
        {messages === null ? (
          error ? null : (
            <div className="muted">{t('app.loading')}</div>
          )
        ) : (
          <>
            {next ? (
              <button type="button" className="btn small load-older" onClick={() => load(next)}>
                {t('adminAccess.auditPage.loadOlder')}
              </button>
            ) : null}
            {messages.length ? (
              messages.map((m) => <AuditMessage key={m.id} m={m} agentName={agent.name} />)
            ) : (
              <div className="muted empty">{t('adminAccess.auditPage.noMessages')}</div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** One message as the agent's store holds it: its words and its entry, with nothing to answer, react or change. */
function AuditMessage({ m, agentName }: { m: TranscriptMessage; agentName: string }) {
  const { t, i18n } = useTranslation()
  const entry = <span className="audit-entry">{t('adminAccess.auditPage.entry', { id: deletionIdOf(m) })}</span>
  if (m.role === 'activity') {
    if (m.activityType === ACTIVITY.flow) return <FlowCard flow={m.content as never} />
    if (m.activityType === ACTIVITY.attachment) {
      const content = m.content as { role?: string; type?: string; filename?: string; textRepr?: string }
      const person = content.role === 'user'
      return (
        <article className={['row', person ? 'mine' : 'theirs'].join(' ')} aria-label={person ? '' : agentName}>
          <div className="bubble-wrap">
            <div className="msg attachment-note">
              <span className="body">
                <Paperclip size={14} aria-hidden="true" />{' '}
                {t('adminAccess.auditPage.attachment', { name: content.filename ?? content.type ?? '' })}
                {content.textRepr ? <span className="muted"> · {content.textRepr}</span> : null}
              </span>
              <span className="meta">
                {entry} {formatTime(m.at, i18n.language)}
              </span>
            </div>
          </div>
        </article>
      )
    }
    return null
  }
  if (m.role === 'system') return <div className="msg system">{m.content}</div>
  const person = m.role === 'user'
  return (
    <article className={['row', person ? 'mine' : 'theirs'].join(' ')} aria-label={person ? '' : agentName}>
      <div className="bubble-wrap">
        <div className={['msg', m.role].join(' ')}>
          <span className="body">{m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}</span>
          <span className="meta">
            {entry} {formatTime(m.at, i18n.language)}
          </span>
        </div>
      </div>
    </article>
  )
}

/** The evidence records of a person: their audit fields and the values stored (PROF-ADMIN-005). */
function EvidencePanel({ agent, reason }: { agent: AgentRecord; reason: string }) {
  const hub = useHub()
  const { t } = useTranslation()
  const [person, setPerson] = useState<AuditPerson | null>(null)
  const [found, setFound] = useState<AuditEvidenceResponse['evidence'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const read = async (e: FormEvent) => {
    e.preventDefault()
    if (!person) return
    setBusy(true)
    setError('')
    try {
      const answer = await hub.adminCall(agent.did, (client, token) =>
        client.auditEvidence(token, reason, person.principalId)
      )
      setFound(answer.evidence)
    } catch (err) {
      setError(adminErrorWords(err, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <form className="audit-filters" onSubmit={(e) => void read(e)}>
        <PersonPicker agent={agent} reason={reason} person={person} onChange={setPerson} />
        <div className="audit-actions">
          <button type="submit" className="btn primary" disabled={busy || !person}>
            {t('adminAccess.auditPage.read')}
          </button>
        </div>
      </form>
      <AdminError text={error} />
      {found === null ? null : found.length ? (
        found.map((e, i) => (
          <section key={auditValueOf(e.record.id) || i} className="box audit-evidence">
            <dl className="audit-fields">
              {Object.entries(e.record).map(([k, v]) => (
                <div key={k} className="audit-field-row">
                  <dt className="audit-field-name">{k}</dt>
                  <dd className="audit-field-value">{auditValueOf(v)}</dd>
                </div>
              ))}
            </dl>
            <h3 className="section-label">{t('adminAccess.auditPage.values')}</h3>
            {Object.keys(e.values).length ? (
              <dl className="audit-fields">
                {Object.entries(e.values).map(([k, v]) => (
                  <div key={k} className="audit-field-row">
                    <dt className="audit-field-name">{k}</dt>
                    <dd className="audit-field-value">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="muted">{t('adminAccess.auditPage.noValues')}</div>
            )}
          </section>
        ))
      ) : (
        <div className="muted empty">{t('adminAccess.auditPage.noneFound')}</div>
      )}
    </>
  )
}

/** The call records, filtered by person, space, conversation, source and period (PROF-ADMIN-005, TOOL-PROV-005). */
function CallsPanel({ agent, reason }: { agent: AgentRecord; reason: string }) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [person, setPerson] = useState<AuditPerson | null>(null)
  const [f, setF] = useState({ space: '', conversation: '', source: '', from: '', to: '' })
  const [calls, setCalls] = useState<Record<string, unknown>[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const read = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const answer = await hub.adminCall(agent.did, (client, token) =>
        client.auditToolCalls(token, reason, {
          principal: person?.principalId,
          space: f.space.trim() || undefined,
          conversation: f.conversation.trim() || undefined,
          source: f.source.trim() || undefined,
          ...auditPeriodOf(f.from, f.to),
        })
      )
      setCalls(answer.calls)
    } catch (err) {
      setError(adminErrorWords(err, t))
    } finally {
      setBusy(false)
    }
  }
  const cell = (row: Record<string, unknown>, field: string) =>
    field === 'at' && typeof row.at === 'string'
      ? formatTime(row.at, i18n.language)
      : field === 'principalId' && typeof row.principalId === 'string'
        ? personWords(person, row.principalId)
        : auditValueOf(row[field])
  return (
    <>
      <form className="audit-filters" onSubmit={(e) => void read(e)}>
        <PersonPicker agent={agent} reason={reason} person={person} onChange={setPerson} />
        <Field label={t('adminAccess.auditPage.space')}>
          <TextInput value={f.space} onChange={set('space')} list="audit-call-spaces" />
        </Field>
        <SpaceOptions agent={agent} id="audit-call-spaces" />
        <Field label={t('adminAccess.auditPage.conversation')}>
          <TextInput value={f.conversation} onChange={set('conversation')} />
        </Field>
        <Field label={t('adminAccess.auditPage.source')}>
          <TextInput value={f.source} onChange={set('source')} />
        </Field>
        <Field label={t('adminAccess.auditPage.from')}>
          <DateInput value={f.from} onChange={set('from')} />
        </Field>
        <Field label={t('adminAccess.auditPage.to')}>
          <DateInput value={f.to} onChange={set('to')} />
        </Field>
        <div className="audit-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {t('adminAccess.auditPage.find')}
          </button>
        </div>
      </form>
      <AdminError text={error} />
      {calls === null ? null : calls.length ? (
        <div className="table-wrap">
          <table className="members-table audit-table">
            <thead>
              <tr>
                {TOOL_CALL_FIELDS.map((k) => (
                  <th key={k}>{t(`adminAccess.auditPage.call.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((c, i) => (
                <tr key={auditValueOf(c.id) || i}>
                  {TOOL_CALL_FIELDS.map((k) => (
                    <td key={k}>{cell(c, k)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted empty">{t('adminAccess.auditPage.noneFound')}</div>
      )}
    </>
  )
}

/** The admin audit, newest first, by pages (PROF-ADMIN-005): each record's time, action, who, reason and detail. */
function LogPanel({ agent, reason }: { agent: AgentRecord; reason: string }) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [records, setRecords] = useState<AdminAuditItem[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState('')
  const load = (before?: string) => {
    setError('')
    hub
      .adminCall(agent.did, (client, token) => client.auditLog(token, reason, before))
      .then((page) => {
        setRecords((list) => [...(before ? (list ?? []) : []), ...page.records])
        setNext(page.nextBefore)
      })
      .catch((e) => setError(adminErrorWords(e, t)))
  }
  // read when the segment opens, and with a new reason
  useEffect(() => {
    setRecords(null)
    load()
  }, [agent.did, reason])
  return (
    <>
      <AdminError text={error} />
      {records === null ? (
        error ? null : (
          <div className="muted">{t('app.loading')}</div>
        )
      ) : records.length ? (
        <>
          <ol className="activity-list audit-log">
            {records.map((r) => (
              <li key={r.id}>
                <span className="time">{r.ts ? formatTime(r.ts, i18n.language) : ''}</span>
                <span className="audit-log-text">
                  <b>{r.action}</b> · {r.breakGlass ? t('adminAccess.auditPage.breakGlass') : r.actor}
                  <span className="audit-log-reason">{t('adminAccess.reasonInForce', { reason: r.reason })}</span>
                  {Object.keys(r.detail).length ? (
                    <span className="muted small audit-log-detail">{auditValueOf(r.detail)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {next ? (
            <button type="button" className="btn small" onClick={() => load(next)}>
              {t('adminAccess.auditPage.more')}
            </button>
          ) : null}
        </>
      ) : (
        <div className="muted empty">{t('adminAccess.auditPage.noneFound')}</div>
      )}
    </>
  )
}
