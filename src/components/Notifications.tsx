/**
 * The Notifications of a space and of the agent (UI-APPR-001, 002, 005..011; profile §3.12; agent D114, D142). An approver
 * finds an approval nowhere in their conversations: here, under "<requester> asks for your approval", with the exact
 * action, the space and the time left, and Approve and Reject while it waits, or Decide on your phone when its decision
 * must be attested; the person's own requests read-only, under "Sent by you"; once ended, the outcome, who decided and
 * when. A space's list is its Notifications segment; the agent's, for the approvals no space holds, a page reached from
 * the agent's menu. Each is read when it opens, again on `ayni.space.notifications.changed` (heard here or in another
 * tab) and each time the tab comes back in front; a link names an item, which is shown selected and decided by
 * nothing but the person. For a tool of a space (profile 3.5.4) an item shows where the approval stands, the person's
 * own confirmation of their own request is listed under "Your own request" with Decide on your phone, and the notices
 * of the space's governance are listed read-only, with Open the tool or Name the owner while they wait. To the owner of
 * a team space whose folder the agent manages (UI-CONV-071, profile package 3.5.9), each member whose access to it
 * failed is an item, with Try again while it waits.
 */
import {
  type AgentRecord,
  approvalRefusalOf,
  deciderProgressOf,
  FOLDER_CHECK,
  folderAccessControlOf,
  folderAccessWordsOf,
  type GovernanceNoticeKind,
  isApprovalItem,
  isFolderAccessItem,
  NOTIFICATIONS_PAGE,
  type NotificationApproval,
  type NotificationItem,
  noticeControlOf,
  noticeWordsOf,
  notificationControlsOf,
  notificationHeadingOf,
  notificationStatusOf,
  ProfileError,
  toolRefusalOf,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, FolderX, Info, ShieldAlert, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { useNow } from './Accounts.js'
import { ApprovalStatusIcon, approvalStatusWords, attentionText, progressText } from './ApprovalWords.js'
import { ToolActionView } from './Tools.js'

type T = (key: string, options?: Record<string, unknown>) => string

/**
 * The person's items of a place, kept as the agent lists them now: read when the list opens and again each time the
 * hub says they changed. A read asked while one is in flight is made once more after it, never in parallel and never
 * dropped: every bound session of the person hears the event, and the last read must follow the last change.
 */
function useNotifications(agentDid: string, spaceId: string | null) {
  const hub = useHub()
  const version = useSnapshot().notificationsVersion
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState('')
  const flight = useRef({ reading: false, again: false, loaded: 0, live: true })
  useEffect(() => {
    flight.current.live = true
    return () => {
      flight.current.live = false
    }
  }, [])
  const read = useCallback(async () => {
    const f = flight.current
    if (f.reading) {
      f.again = true
      return
    }
    f.reading = true
    try {
      do {
        f.again = false
        // as many as are on screen, so that a list read again keeps what the person scrolled to
        const limit = Math.min(NOTIFICATIONS_PAGE.max, Math.max(NOTIFICATIONS_PAGE.default, f.loaded))
        const page = await hub.notifications(agentDid, spaceId, undefined, limit)
        if (!f.live) return
        f.loaded = page.notifications.length
        setItems(page.notifications)
        setNext(page.nextBefore)
        setError('')
      } while (f.again)
    } catch (e) {
      if (f.live) setError(String((e as Error).message))
    } finally {
      f.reading = false
    }
  }, [hub, agentDid, spaceId])
  // read when the list opens, then each time the hub says the Notifications changed (`notificationsVersion`)
  useEffect(() => {
    void read()
  }, [read, version])
  const more = useCallback(async () => {
    const f = flight.current
    if (!next || f.reading) return
    f.reading = true
    try {
      const page = await hub.notifications(agentDid, spaceId, next)
      if (!f.live) return
      setItems((held) => {
        const known = new Set((held ?? []).map((n) => n.id))
        const merged = [...(held ?? []), ...page.notifications.filter((n) => !known.has(n.id))]
        f.loaded = merged.length
        return merged
      })
      setNext(page.nextBefore)
    } catch (e) {
      if (f.live) setError(String((e as Error).message))
    } finally {
      f.reading = false
      if (f.again) void read()
    }
  }, [hub, agentDid, spaceId, next, read])
  return { items, next, error, more }
}

/**
 * The list of a place (UI-APPR-007): newest first, more read as the person scrolls to its end (and with Show more,
 * from the keyboard), "No notifications." when it holds none. `focus`: the approval a link named, read up to and
 * shown selected.
 */
export function NotificationList({
  agent,
  spaceId,
  focus,
}: {
  agent: AgentRecord
  spaceId: string | null
  focus?: string
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  const { items, next, error, more } = useNotifications(agent.did, spaceId)
  // the stream held open and the tab's return watched while the list is on screen (PROF-TOOL-025)
  useEffect(() => hub.watchNotifications(agent.did), [hub, agent.did])
  // the item a link names is read up to, a page at a time, when it is not among the first ones
  const sought = useRef(0)
  useEffect(() => {
    if (!focus || !items || !next || items.some((n) => focused(n, focus))) return
    if (sought.current >= 10) return
    sought.current += 1
    void more()
  }, [focus, items, next, more])
  // more is read as the end of the list comes into view
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = end.current
    if (!el || !next || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void more()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [next, more])
  // the name the agent shows of the person, for "you" on their own decision
  const me = snap.sessions.find((s) => s.agentDid === agent.did && s.principal?.displayName)?.principal?.displayName
  return (
    <section className="notifications" aria-label={t('notifications.title')}>
      {error ? <div className="banner warning">{error}</div> : null}
      {items === null ? (
        error ? null : (
          <div className="muted">{t('app.loading')}</div>
        )
      ) : items.length ? (
        <ul className="notification-list">
          {items.map((n) =>
            isApprovalItem(n) ? (
              <NotificationRow key={n.id} agent={agent} item={n} me={me} selected={!!focus && focused(n, focus)} />
            ) : isFolderAccessItem(n) ? (
              spaceId ? (
                <FolderAccessRow
                  key={n.id}
                  agent={agent}
                  spaceId={spaceId}
                  item={n}
                  selected={!!focus && focused(n, focus)}
                />
              ) : null
            ) : (
              <NoticeRow key={n.id} agent={agent} item={n} selected={!!focus && focused(n, focus)} />
            )
          )}
        </ul>
      ) : (
        <div className="muted empty">{t('notifications.empty')}</div>
      )}
      {next ? (
        <div ref={end}>
          <button type="button" className="btn small" onClick={() => void more()}>
            {t('notifications.more')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** Whether an item is the one a link names: by the approval's id, or the item's. */
function focused(item: NotificationItem, focus: string): boolean {
  return item.id === focus || (isApprovalItem(item) && item.approval.approvalId === focus)
}

/** The words of a refusal of a decision or of Decide on your phone (§3.12, PROF-TOOL-026). */
function refusalWords(error: { status?: number; code?: string } | undefined, agentName: string, t: T): string {
  switch (approvalRefusalOf(error)) {
    case 'onPhone':
      return t('notifications.decideOnPhone')
    case 'notEligible':
      return t('notifications.notEligible')
    case 'ended':
      return t('notifications.ended')
    case 'phoneUnreachable':
      return t('notifications.phoneUnreachable', { agent: agentName })
    default:
      return t('notifications.notSent')
  }
}

/** The details of an approval that carries no action: an elevation's purpose and justification, or its tool. */
function RequestDetails({ approval }: { approval: NotificationApproval }) {
  const { t } = useTranslation()
  const rows = [
    ...(approval.tool ? [[t('approval.tool'), approval.tool] as const] : []),
    ...(approval.purpose ? [[t('approval.purpose'), approval.purpose.label] as const] : []),
    ...(approval.justification ? [[t('approval.justification'), approval.justification] as const] : []),
  ]
  if (!rows.length) return null
  return (
    <dl className="tool-fields">
      {rows.map(([label, value]) => (
        <div key={label} className="tool-field">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * One item (UI-APPR-006..008): its heading, the action's title and the space's, each on a line of its own, the exact
 * action whole, its status, then Approve and Reject with the optional note, or Decide on your phone, or nothing. A
 * screen reader reads it as its heading, the action's title and its status (its name), then its controls.
 */
function NotificationRow({
  agent,
  item,
  me,
  selected,
}: {
  agent: AgentRecord
  item: Extract<NotificationItem, { kind: 'approval' }>
  me: string | undefined
  selected: boolean
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t, i18n } = useTranslation()
  const a = item.approval
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; alert: boolean } | null>(null)
  // the agent said this one is decided on the phone: offered at once, before the list is read again
  const [onPhone, setOnPhone] = useState(false)
  const owner = a.space
    ? snap.spaces[agent.did]?.spaces.find((x) => x.id === a.space?.id)?.owner?.name || undefined
    : undefined
  const line = notificationStatusOf(a, me, owner)
  const now = useNow(line.key === 'timeLeft')
  // where it stands, beside the time left of an approver who may decide it (UI-APPR-007, UI-APPR-010)
  const progress = deciderProgressOf(a)
  const status = [progress ? progressText(progress, t) : '', approvalStatusWords(line, t, i18n.language, now, true)]
    .filter(Boolean)
    .join(' · ')
  const head = notificationHeadingOf(a)
  const heading =
    head.key === 'sentByYou'
      ? t('notifications.sentByYou')
      : head.key === 'ownRequest'
        ? t('notifications.ownRequest')
        : t('approval.asksYou', { requester: head.requester })
  const title = a.action?.title ?? t(`approval.${a.kind}`)
  const controls = onPhone && notificationControlsOf(a) === 'decide' ? 'phone' : notificationControlsOf(a)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!selected) return
    ref.current?.scrollIntoView?.({ block: 'center' })
    ref.current?.focus({ preventScroll: true })
  }, [selected])
  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true)
    setNotice(null)
    try {
      const answer = await hub.decideApproval(agent.did, a.approvalId, decision, note.trim() || undefined)
      if (answer.code) {
        if (approvalRefusalOf({ code: answer.code }) === 'onPhone') setOnPhone(true)
        else setNotice({ text: refusalWords({ code: answer.code }, agent.name, t), alert: true })
      }
    } catch (e) {
      setNotice({ text: refusalWords(e as never, agent.name, t), alert: true })
    } finally {
      setBusy(false)
    }
  }
  const resend = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await hub.resendApproval(agent.did, a.approvalId)
      setNotice({ text: t('notifications.sentToPhone'), alert: false })
    } catch (e) {
      setNotice({ text: refusalWords(e as never, agent.name, t), alert: true })
      // ended, decided or no longer the person's: the list says how it stands now
      if (approvalRefusalOf(e as never) !== 'phoneUnreachable') hub.rereadNotifications()
    } finally {
      setBusy(false)
    }
  }
  return (
    <li>
      <article
        ref={ref}
        tabIndex={-1}
        className={['card', 'tool-card', 'notification', selected ? 'selected' : ''].filter(Boolean).join(' ')}
        data-status={a.status}
        aria-current={selected ? 'true' : undefined}
        aria-label={[heading, title, status].join(', ')}
      >
        <div className="notification-head">
          <div className="tool-approval-head">{heading}</div>
          {item.at ? (
            <time className="notification-time" dateTime={item.at}>
              {formatTime(item.at, i18n.language)}
            </time>
          ) : null}
        </div>
        <h3 className="tool-title">{title}</h3>
        {a.space ? <div className="tool-approval-space">{a.space.title}</div> : null}
        {a.action ? (
          <ToolActionView
            action={a.action}
            agentName={agent.name}
            titled={false}
            viewer={a.own ? 'own' : 'approver'}
            requester={a.requester.displayName}
          />
        ) : (
          <RequestDetails approval={a} />
        )}
        <div className="tool-outcome notification-status">
          <ApprovalStatusIcon line={line} />
          <span>{status}</span>
        </div>
        {controls === 'decide' ? (
          <>
            <input
              className="input"
              placeholder={t('approval.note')}
              aria-label={t('approval.note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="actions">
              <button type="button" className="btn primary" disabled={busy} onClick={() => void decide('approve')}>
                {t('approval.approve')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void decide('reject')}>
                {t('approval.reject')}
              </button>
            </div>
          </>
        ) : controls === 'phone' ? (
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void resend()}>
              <Smartphone size={16} aria-hidden="true" /> {t('notifications.decideOnPhone')}
            </button>
          </div>
        ) : null}
        {notice ? (
          <div className={notice.alert ? 'tool-error' : 'notification-notice'} role={notice.alert ? 'alert' : 'status'}>
            {notice.text}
          </div>
        ) : null}
      </article>
    </li>
  )
}

/** The words of a notice of a space's governance (UI-APPR-011, UI-CONV-052). */
function noticeText(item: Extract<NotificationItem, { kind: GovernanceNoticeKind }>, t: T): string {
  const words = noticeWordsOf(item)
  switch (words.key) {
    case 'ownerChanged':
      return t(`notices.ownerChanged.${words.how}`, {
        to: words.to,
        space: words.space,
        from: words.from,
        reason: words.reason,
      })
    case 'policyAttention':
      return t('notices.policyAttention', { tool: words.tool, entries: attentionText(words.entries, t) })
    case 'noApprover':
      return t('notices.noApprover', { requester: words.requester, tool: words.tool })
    default:
      return t('notices.spaceWithoutOwner', { space: words.space })
  }
}

/**
 * A notice of a space's governance (UI-APPR-011), read-only: its words, the space, and while it waits Open the tool
 * (the owner's panel of the tool's source) or Name the owner (Spaces you steward, at that space). Once resolved it reads
 * as past, with no control. A screen reader reads it as its words, then its control.
 */
function NoticeRow({
  agent,
  item,
  selected,
}: {
  agent: AgentRecord
  item: Extract<NotificationItem, { kind: GovernanceNoticeKind }>
  selected: boolean
}) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const text = noticeText(item, t)
  const control = noticeControlOf(item)
  const past = !item.waiting || !!item.notice.resolvedAt
  const words = noticeWordsOf(item)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!selected) return
    ref.current?.scrollIntoView?.({ block: 'center' })
    ref.current?.focus({ preventScroll: true })
  }, [selected])
  const Icon = item.kind === 'owner-changed' ? Info : ShieldAlert
  return (
    <li>
      <article
        ref={ref}
        tabIndex={-1}
        className={['card', 'notice', past ? 'past' : 'waiting', selected ? 'selected' : ''].filter(Boolean).join(' ')}
        data-kind={item.kind}
        aria-current={selected ? 'true' : undefined}
        aria-label={text}
      >
        <div className="notification-head">
          <div className="notice-text">
            <Icon size={16} aria-hidden="true" className="notice-icon" />
            <span>{text}</span>
          </div>
          {item.at ? (
            <time className="notification-time" dateTime={item.at}>
              {formatTime(item.at, i18n.language)}
            </time>
          ) : null}
        </div>
        {control === 'openTool' && words.key === 'policyAttention' ? (
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => hub.openSpace(agent.did, words.spaceId, 'tools', undefined, words.source)}
            >
              {t('notices.openTool')}
            </button>
          </div>
        ) : control === 'nameOwner' && words.key === 'spaceWithoutOwner' ? (
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => hub.openSteward(agent.did, words.spaceId)}>
              {t('notices.nameOwner')}
            </button>
          </div>
        ) : null}
      </article>
    </li>
  )
}

/**
 * A member whose access to the space's managed folder failed, to its owner (UI-CONV-071, UI-CONV-052, PROF-TOOL-042):
 * "<member> has no access to the folder <folder> yet: <reason>", with Try again while it waits, which checks the folder
 * again with the members whose access failed (`folder.check`, PROF-TOOL-043) and reads the list again; once the access is
 * in place, or no longer needed, it reads as past, with no control. A screen reader reads it as its words, then its
 * control.
 */
function FolderAccessRow({
  agent,
  spaceId,
  item,
  selected,
}: {
  agent: AgentRecord
  spaceId: string
  item: Extract<NotificationItem, { kind: 'folder-access' }>
  selected: boolean
}) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const words = folderAccessWordsOf(item.folderAccess)
  const names = { member: words.member, folder: words.folder }
  const text = words.reason
    ? t('notices.folderAccess', {
        ...names,
        reason: t(`tools.folder.reason.${words.reason}`, { provider: words.provider, agent: agent.name }),
      })
    : t('notices.folderAccessNoReason', names)
  const control = folderAccessControlOf(item)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!selected) return
    ref.current?.scrollIntoView?.({ block: 'center' })
    ref.current?.focus({ preventScroll: true })
  }, [selected])
  const tryAgain = async () => {
    setBusy(true)
    setError('')
    try {
      await hub.patchSpaceTool(agent.did, spaceId, item.folderAccess.source.id, FOLDER_CHECK)
    } catch (e) {
      const r = toolRefusalOf(e instanceof ProfileError ? e : undefined)
      setError(r.at === 'panel' && r.reason === 'notOwner' ? t('tools.notOwner') : String((e as Error).message))
    } finally {
      setBusy(false)
      // whether its access is in place now: the list says
      hub.rereadNotifications()
    }
  }
  return (
    <li>
      <article
        ref={ref}
        tabIndex={-1}
        className={['card', 'notice', control ? 'waiting' : 'past', selected ? 'selected' : '']
          .filter(Boolean)
          .join(' ')}
        data-kind={item.kind}
        aria-current={selected ? 'true' : undefined}
        aria-label={text}
      >
        <div className="notification-head">
          <div className="notice-text">
            <FolderX size={16} aria-hidden="true" className="notice-icon" />
            <span>{text}</span>
          </div>
          {item.at ? (
            <time className="notification-time" dateTime={item.at}>
              {formatTime(item.at, i18n.language)}
            </time>
          ) : null}
        </div>
        {control === 'tryAgain' ? (
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void tryAgain()}>
              {t('tools.folder.tryAgain')}
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="tool-error" role="alert">
            {error}
          </div>
        ) : null}
      </article>
    </li>
  )
}

/** The agent's Notifications, in the main pane (UI-APPR-007): the approvals no space holds. */
export function NotificationsPage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const target = snap.notificationsFor
  const agent = snap.agents.find((a) => a.did === target?.agentDid)
  if (!agent) return <div className="center" />
  return (
    <div className="notifications-page">
      <header className="conv-header">
        <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
          <ArrowLeft size={20} />
        </button>
        <div className="conv-title">
          <h1>{t('notifications.title')}</h1>
          <span className="conv-sub">{agent.name}</span>
        </div>
      </header>
      <div className="space-body">
        <NotificationList key={agent.did} agent={agent} spaceId={null} focus={target?.approvalId} />
      </div>
    </div>
  )
}
