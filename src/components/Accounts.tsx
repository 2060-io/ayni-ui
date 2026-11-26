/**
 * Each person's own accounts (profile 3.5 §3.11, §6; agent D104 to D110): Your accounts of an agent (UI-CONV-053),
 * the sign-in of an account of OAuth in a new tab (UI-CONV-054), the fields of an account of fields (UI-CONV-055),
 * Disconnect (UI-CONV-056) and the Connect card of a conversation (UI-CONV-057), in the words of UI-CONV-058. The page
 * and the cards draw what the agent says of each account, read again on `ayni.connections.changed` and when the tab is
 * in front again; nothing is ever taken from the link the agent sends the browser back to.
 */
import {
  type AgentRecord,
  accountValuesOf,
  attemptWaits,
  CONVERSATION_DESIGN,
  type Connection,
  type ConnectionAttempt,
  type ConnectionNotice,
  type ConnectionRef,
  connectCardOf,
  connectionControlsOf,
  connectionFor,
  connectionKeyOf,
  connectionRefusalOf,
  connectionStateKeyOf,
  disconnectedKeyOf,
  outcomeNoticeOf,
  ProfileError,
  type SpaceToolAccountField,
  signInUrlAllowed,
  sinceDateOf,
  sourceNameOf,
  spaceIdFor,
  timeLeftOf,
  usageOfConnection,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, CircleAlert, CircleCheck, ExternalLink, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'

type T = (key: string, options?: Record<string, unknown>) => string

/** Re-renders every second while `on`: the time left of a sign-in, or of a change of a space's tools, that waits. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    // from the moment it starts waiting, not from when the screen opened
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return now
}

/** A line said under a row, a card or a control: an outcome (`status`), or a refusal (`alert`). */
export interface AccountNotice {
  text: string
  alert: boolean
}

/** What the words of a row, a card or a sign-in put in. */
type Names = {
  agent: string
  source: string
  revokesAtSource?: boolean
}

/** The words of an outcome (UI-CONV-058). */
export function noticeWords(n: ConnectionNotice, names: Names, t: T): AccountNotice {
  switch (n.key) {
    case 'connected':
      return {
        text: n.label ? t('accounts.outcome.connected', { label: n.label }) : t('accounts.outcome.connectedNoLabel'),
        alert: false,
      }
    case 'cancelled':
      return { text: t('accounts.outcome.cancelled'), alert: false }
    case 'disconnected':
      return {
        text: t(`accounts.outcome.${disconnectedKeyOf({ revokesAtSource: names.revokesAtSource === true })}`, names),
        alert: false,
      }
    case 'wrongBinding':
      return { text: t('accounts.outcome.wrongBinding', { expected: n.expected, chosen: n.chosen }), alert: true }
    default:
      return { text: t(`accounts.outcome.${n.key}`, names), alert: true }
  }
}

/** The words of a refusal of a request of §3.11 that is not shown at a field (UI-CONV-058). */
export function refusalWords(error: unknown, names: Names, t: T): AccountNotice {
  if (!(error instanceof ProfileError)) return { text: String((error as Error)?.message ?? error), alert: true }
  const r = connectionRefusalOf(error)
  if (r.at === 'field') return { text: t('accounts.changed'), alert: true }
  switch (r.reason) {
    case 'wrongBinding':
      return { text: t('accounts.outcome.wrongBinding', { expected: r.expected, chosen: r.chosen }), alert: true }
    case 'wrongPerson':
      return { text: t('accounts.outcome.wrongPerson', names), alert: true }
    case 'unavailable':
      return { text: t('accounts.unavailable', names), alert: true }
    case 'notOffered':
      return { text: t('accounts.notOffered'), alert: true }
    case 'changed':
      return { text: t('accounts.changed'), alert: true }
    default:
      return { text: error.message, alert: true }
  }
}

/**
 * The sign-in of an account of OAuth (UI-CONV-054, PROF-TOOL-018): a new tab opened at the press, so that no pop-up
 * blocker stops it, cut from this page (`opener`), then pointed at the service's sign-in once the agent answers, and
 * closed when it refuses. Nothing of this page goes into it: no token, no cookie of the UI, no value; and the page
 * never frames, reads or fills the service's sign-in. A URL that is not the service's sign-in over HTTPS is not
 * opened: the tab is of this page's origin until it navigates.
 */
export async function openSignIn(
  start: () => Promise<ConnectionAttempt>,
  drop: (attempt: ConnectionAttempt) => void
): Promise<{ attempt: ConnectionAttempt } | { error: unknown } | { noTab: true } | { badUrl: true }> {
  const tab = window.open('', '_blank')
  if (!tab) return { noTab: true }
  try {
    tab.opener = null
  } catch {
    // a browser that does not let it be set opened it without one
  }
  let attempt: ConnectionAttempt
  try {
    attempt = await start()
  } catch (error) {
    tab.close()
    return { error }
  }
  if (!signInUrlAllowed(attempt.authorizationUrl)) {
    tab.close()
    drop(attempt)
    return { badUrl: true }
  }
  tab.location.replace(attempt.authorizationUrl)
  return { attempt }
}

/** The sign-in of one account: started here, or listed by the agent as waiting; its outcome when the agent says it. */
export interface SignIn {
  /** the attempt that waits, this tab's or the one the agent lists, while its time lasts */
  attempt: { id: string; expiresAt: string } | null
  timeLeft: string
  notice: AccountNotice | null
  setNotice: (notice: AccountNotice | null) => void
  busy: boolean
  start: () => void
  cancel: () => void
}

/**
 * One account's sign-in (UI-CONV-054): Connect opens the tab, sends `authorize` and points the tab at the service;
 * while it waits, a stream of one of the person's sessions stays open so that `ayni.connections.changed` reaches this
 * page (PROF-TOOL-019), and the time left is counted every second; the outcome the agent announces for this attempt,
 * or for this account, is said in the words of UI-CONV-058.
 */
export function useSignIn(
  agent: AgentRecord,
  target: {
    source: string
    title: string
    bindingValue?: string
    spaceId?: string
    listed?: { id: string; expiresAt: string } | null
    revokesAtSource?: boolean
  }
): SignIn {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  const heardLast = () => snap.connectionChanges[snap.connectionChanges.length - 1]?.n ?? 0
  // only what the agent says from now on is an outcome of this page's
  const [since, setSince] = useState(heardLast)
  const [attempt, setAttempt] = useState<{ id: string; expiresAt: string } | null>(null)
  // the attempts that ended here, which the agent's list may still name until it is read again
  const [ended, setEnded] = useState<string[]>([])
  const [notice, setNotice] = useState<AccountNotice | null>(null)
  const [busy, setBusy] = useState(false)
  const listed = target.listed && !ended.includes(target.listed.id) ? target.listed : null
  const held = attempt && !ended.includes(attempt.id) ? attempt : listed
  const now = useNow(!!held)
  const waits = attemptWaits(held, now)
  useEffect(() => (waits ? hub.holdStream(agent.did) : undefined), [waits, agent.did, hub])
  const names: Names = { agent: agent.name, source: target.title, revokesAtSource: target.revokesAtSource }

  const heard = snap.connectionChanges
    .filter(
      (c) =>
        c.agentDid === agent.did &&
        c.n > since &&
        !!c.change.outcome &&
        ((!!held && c.change.attemptId === held.id) ||
          (c.change.source === target.source &&
            (target.bindingValue === undefined || !c.change.binding || c.change.binding.value === target.bindingValue)))
    )
    .pop()
  useEffect(() => {
    if (!heard) return
    setSince(heard.n)
    if (heard.change.attemptId) setEnded((e) => [...e, heard.change.attemptId as string])
    setAttempt(null)
    const said = outcomeNoticeOf(heard.change)
    if (said) setNotice(noticeWords(said, names, t))
  }, [heard?.n])

  const start = async () => {
    setBusy(true)
    setNotice(null)
    setSince(heardLast())
    const result = await openSignIn(
      () => hub.authorizeConnection(agent.did, target.source, target.spaceId),
      (dropped) => void hub.cancelConnectionAttempt(agent.did, dropped.attemptId).catch(() => undefined)
    )
    setBusy(false)
    if ('noTab' in result) setNotice({ text: t('accounts.noTab'), alert: true })
    else if ('badUrl' in result) setNotice({ text: t('accounts.outcome.failed', names), alert: true })
    else if ('error' in result) setNotice(refusalWords(result.error, names, t))
    else {
      const id = result.attempt.attemptId
      setEnded((list) => list.filter((x) => x !== id))
      setAttempt({ id, expiresAt: result.attempt.expiresAt })
    }
  }

  const cancel = async () => {
    if (!held) return
    const id = held.id
    setBusy(true)
    try {
      await hub.cancelConnectionAttempt(agent.did, id)
      setNotice({ text: t('accounts.outcome.cancelled'), alert: false })
    } catch (e) {
      // a 404: it no longer waits, it ended meanwhile; its outcome comes from the agent
      if (!(e instanceof ProfileError && e.status === 404)) setNotice(refusalWords(e, names, t))
    } finally {
      setEnded((list) => [...list, id])
      setAttempt(null)
      setBusy(false)
    }
  }

  return {
    attempt: waits ? held : null,
    timeLeft: held ? timeLeftOf(held.expiresAt, now) : '0:00',
    notice,
    setNotice,
    busy,
    start: () => void start(),
    cancel: () => void cancel(),
  }
}

/** While a sign-in waits: "Finish in the browser · 4:32 left", with Cancel (UI-CONV-054). */
export function SignInWaiting({ signIn }: { signIn: SignIn }) {
  const { t } = useTranslation()
  if (!signIn.attempt) return null
  return (
    <div className="tool-pending account-waiting" role="status">
      <ExternalLink size={16} aria-hidden="true" className="tool-pending-icon" />
      <span className="tool-pending-text">{t('accounts.waiting', { time: signIn.timeLeft })}</span>
      <button type="button" className="btn small" disabled={signIn.busy} onClick={signIn.cancel}>
        {t('accounts.cancel')}
      </button>
    </div>
  )
}

/** An outcome or a refusal, under what it is about. */
export function AccountNoticeLine({ notice }: { notice: AccountNotice | null }) {
  if (!notice) return null
  return notice.alert ? (
    <div className="tool-error account-notice" role="alert">
      {notice.text}
    </div>
  ) : (
    <div className="tool-change-outcome account-notice" role="status">
      {notice.text}
    </div>
  )
}

/** Your accounts of an agent (UI-CONV-053): from its menu, a conversation's, About, a Connect card, the return link. */
export function AccountsPage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const target = snap.accountsFor
  const agent = snap.agents.find((a) => a.did === target?.agentDid)
  const connections = agent ? snap.connections[agent.did] : undefined
  const [error, setError] = useState('')
  // read when the page opens, then on every `ayni.connections.changed` and each time the tab is in front again
  useEffect(() => {
    if (!agent) return
    let live = true
    hub
      .loadConnections(agent.did)
      .then(() => live && setError(''))
      .catch((e) => live && setError(String((e as Error).message)))
    const unwatch = hub.watchConnections(agent.did)
    return () => {
      live = false
      unwatch()
    }
  }, [agent?.did, hub])
  if (!agent) return <div className="center" />
  const focused = connections && target?.focus ? connectionFor(connections, target.focus) : undefined
  return (
    <div className="accounts-page">
      <header className="conv-header">
        <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
          <ArrowLeft size={20} />
        </button>
        <div className="conv-title">
          <h1>{t('accounts.title', { agent: agent.name })}</h1>
        </div>
      </header>
      <div className="panel accounts-body">
        <p className="muted accounts-intro">{t('accounts.intro', { agent: agent.name })}</p>
        {error ? <div className="banner warning">{error}</div> : null}
        {connections === undefined ? (
          error ? null : (
            <div className="muted">{t('app.loading')}</div>
          )
        ) : connections.length ? (
          <ul className="account-list">
            {connections.map((c) => (
              <AccountRow
                key={connectionKeyOf(c)}
                agent={agent}
                connection={c}
                focused={!!focused && connectionKeyOf(focused) === connectionKeyOf(c)}
              />
            ))}
          </ul>
        ) : (
          <div className="muted empty">{t('accounts.empty', { agent: agent.name })}</div>
        )}
      </div>
    </div>
  )
}

/** The words of a binding: "Workspace: ayni-dev-agent" (UI-CONV-058). */
export function bindingWords(binding: { label: string; valueLabel: string } | null | undefined, t: T): string {
  return binding ? t('accounts.binding', { label: binding.label, value: binding.valueLabel }) : ''
}

/** Where an account serves (UI-CONV-058): "Used in Personal, Test repo", "Used in all your conversations". */
export function usedInWords(c: Pick<Connection, 'usedIn'>, t: T): string {
  const usage = usageOfConnection(c)
  if (usage.kind === 'all') return t('accounts.usedIn.all')
  if (usage.kind === 'none') return t('accounts.usedIn.none')
  const places = [...(usage.personal ? [t('spaces.personal')] : []), ...usage.spaces]
  return t('accounts.usedIn.places', { places: places.join(', ') })
}

/** The state of an account (UI-CONV-058): connected as whom and since when, or why it must be connected again. */
export function stateWords(c: Connection, agentName: string, locale: string, t: T): string {
  const key = connectionStateKeyOf(c)
  const names = { agent: agentName, source: c.title }
  if (key === 'notConnected') return t('accounts.state.notConnected')
  if (key === 'connected' || key === 'moreAccess') {
    const date = sinceDateOf(c.account?.connectedAt ?? '', locale)
    return c.account?.label
      ? t('accounts.state.connected', { label: c.account.label, date })
      : t('accounts.state.connectedNoLabel', { date })
  }
  return t(`accounts.state.${key}`, names)
}

/**
 * One account (UI-CONV-053): its title, description, the features it serves (UI-CONV-064), binding, where it serves
 * and its state, with its controls; a
 * screen reader reads it as its title, its binding, its state and its controls. Connect and Reconnect of an account
 * of fields open its fields in the row (UI-CONV-055); Disconnect asks in the page (UI-CONV-056).
 */
function AccountRow({
  agent,
  connection: c,
  focused,
}: {
  agent: AgentRecord
  connection: Connection
  focused: boolean
}) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const signIn = useSignIn(agent, {
    source: c.source,
    title: c.title,
    bindingValue: c.binding?.value,
    spaceId: spaceIdFor(c),
    listed: c.attempt,
    revokesAtSource: c.revokesAtSource,
  })
  // opened at this row by a Connect card or About: an account of fields to connect shows its fields at once
  const [typing, setTyping] = useState(focused && c.method === 'fields' && c.state !== 'connected')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  // the values typed: never in React state, a draft or a store; read once at Save, the fields emptied as the request
  // leaves and gone with the page. Only whether each field holds something is kept, for the Save.
  const refs = useRef<Record<string, HTMLInputElement | null>>({})
  const [filled, setFilled] = useState<Record<string, boolean>>({})
  const rowRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (!focused) return
    rowRef.current?.scrollIntoView?.({ block: 'center' })
    rowRef.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [focused])

  const binding = bindingWords(c.binding, t)
  const stateKey = connectionStateKeyOf(c)
  const state = stateWords(c, agent.name, i18n.language, t)
  const names = { agent: agent.name, source: c.title }
  const fields = c.fields
  const badToken = (f: SpaceToolAccountField) => t('tools.badToken', { agent: agent.name, label: f.label })

  const emptyFields = () => {
    for (const input of Object.values(refs.current)) if (input) input.value = ''
    setFilled({})
  }
  const closeFields = () => {
    emptyFields()
    setFieldErrors({})
    setTyping(false)
  }

  const connect = () => {
    if (c.method === 'oauth') signIn.start()
    else {
      signIn.setNotice(null)
      setTyping(true)
    }
  }

  /** The Save of the fields (UI-CONV-055): trimmed and checked as a space's account is, then sent and emptied. */
  const saveFields = async () => {
    if (!fields.length || !fields.every((f) => filled[f.name])) return
    const { values, refused } = accountValuesOf(
      fields,
      Object.fromEntries(fields.map((f) => [f.name, refs.current[f.name]?.value ?? '']))
    )
    if (refused.length) {
      setFieldErrors(
        Object.fromEntries(fields.filter((f) => refused.includes(f.name)).map((f) => [f.name, badToken(f)]))
      )
      return
    }
    emptyFields()
    setFieldErrors({})
    setBusy(true)
    signIn.setNotice(null)
    try {
      const connection = await hub.setConnectionAccount(agent.did, c.source, values, spaceIdFor(c))
      setTyping(false)
      signIn.setNotice(noticeWords({ key: 'connected', label: connection.account?.label ?? '' }, names, t))
    } catch (e) {
      const r = e instanceof ProfileError ? connectionRefusalOf(e) : null
      const field = r?.at === 'field' ? fields.find((f) => f.name === r.field) : undefined
      if (field) setFieldErrors({ [field.name]: badToken(field) })
      else signIn.setNotice(refusalWords(e, names, t))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!c.account) return
    setConfirming(false)
    setBusy(true)
    signIn.setNotice(null)
    try {
      const connection = await hub.disconnectAccount(agent.did, c.account.id)
      signIn.setNotice(
        noticeWords({ key: 'disconnected' }, { ...names, revokesAtSource: connection.revokesAtSource }, t)
      )
    } catch (e) {
      signIn.setNotice(refusalWords(e, names, t))
    } finally {
      setBusy(false)
    }
  }

  const waiting = !!signIn.attempt
  const controls = connectionControlsOf(c).filter((x) => x !== 'disconnect' || !!c.account)
  const reconnecting = stateKey !== 'notConnected' && stateKey !== 'connected'
  return (
    <li ref={rowRef} className="account-item">
      <article
        className="account-row"
        data-state={c.state}
        aria-label={[c.title, binding, state, stateKey === 'moreAccess' ? t('accounts.state.moreAccess', names) : '']
          .filter(Boolean)
          .join(', ')}
      >
        <div className="account-text">
          <h3 className="account-title">{c.title}</h3>
          {c.description ? <span className="account-description">{c.description}</span> : null}
          {/* the features the account serves, under its description: "For Files, Calendar" (UI-CONV-064) */}
          {c.features.length ? (
            <span className="account-features">
              {t('accounts.features', { features: c.features.map((f) => f.title).join(', ') })}
            </span>
          ) : null}
          {binding ? <span className="account-binding">{binding}</span> : null}
          <span className="account-used">{usedInWords(c, t)}</span>
          <span className="account-state">
            {stateKey === 'connected' || stateKey === 'moreAccess' ? (
              <CircleCheck
                size={CONVERSATION_DESIGN.connectCard.iconSize}
                aria-hidden="true"
                className="account-icon"
              />
            ) : reconnecting ? (
              <TriangleAlert
                size={CONVERSATION_DESIGN.connectCard.iconSize}
                aria-hidden="true"
                className="account-reconnect-icon"
              />
            ) : null}
            {state}
          </span>
          {stateKey === 'moreAccess' ? (
            // still connected, and the service asks for more: both are said (UI-CONV-058)
            <span className="account-state account-more">
              <TriangleAlert
                size={CONVERSATION_DESIGN.connectCard.iconSize}
                aria-hidden="true"
                className="account-reconnect-icon"
              />
              {t('accounts.state.moreAccess', names)}
            </span>
          ) : null}
        </div>
        {typing ? (
          <div className="account-fields">
            {fields.map((f) => (
              <label key={f.name} className="field">
                {f.label}
                <input
                  ref={(input) => {
                    refs.current[f.name] = input
                  }}
                  className="input"
                  type="password"
                  name={`connection-${c.source}-${f.name}`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  placeholder={t('tools.paste', { label: f.label })}
                  disabled={busy}
                  aria-invalid={fieldErrors[f.name] ? true : undefined}
                  onChange={(e) => {
                    const holds = e.currentTarget.value.trim() !== ''
                    setFilled((all) => (all[f.name] === holds ? all : { ...all, [f.name]: holds }))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void saveFields()
                    }
                  }}
                />
                {fieldErrors[f.name] ? (
                  <span className="field-error" role="alert">
                    <CircleAlert size={13} aria-hidden="true" className="field-error-icon" /> {fieldErrors[f.name]}
                  </span>
                ) : null}
              </label>
            ))}
            <div className="tool-actions">
              <button
                type="button"
                className="btn primary account-save"
                disabled={busy || !fields.length || !fields.every((f) => filled[f.name])}
                onClick={() => void saveFields()}
              >
                {t('tools.save')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={closeFields}>
                {t('accounts.cancel')}
              </button>
            </div>
          </div>
        ) : waiting ? null : (
          <div className="tool-actions account-controls">
            {controls.map((control) =>
              control === 'disconnect' ? (
                <button
                  key={control}
                  type="button"
                  className="btn tool-remove"
                  disabled={busy || signIn.busy}
                  onClick={() => setConfirming(true)}
                >
                  {t('accounts.disconnect')}
                </button>
              ) : (
                <button
                  key={control}
                  type="button"
                  className="btn primary"
                  disabled={busy || signIn.busy}
                  onClick={connect}
                >
                  {t(`accounts.${control}`)}
                </button>
              )
            )}
          </div>
        )}
        <SignInWaiting signIn={signIn} />
        {confirming ? (
          <div className="box tool-confirm" role="alertdialog" aria-label={t('accounts.disconnect')}>
            <span>{t('accounts.disconnectConfirm', names)}</span>
            <div className="tool-actions">
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                {t('accounts.cancel')}
              </button>
              <button type="button" className="btn tool-remove" onClick={() => void disconnect()}>
                {t('accounts.disconnect')}
              </button>
            </div>
          </div>
        ) : null}
        <AccountNoticeLine notice={signIn.notice} />
      </article>
    </li>
  )
}

/**
 * The Connect card (UI-CONV-057, PROF-TOOL-020): on the agent's side, at its place in the reply, on every device. The
 * source's title, its description, the binding; then the person's account as Your accounts gives it: to connect, the
 * sentence and Connect; to connect again, the words of its reason and Reconnect; once connected, "Connected as
 * <label>" and no control. Connect opens the sign-in of an account of OAuth, or Your accounts at the row of an
 * account of fields; the card never holds a field.
 */
export function ConnectCard({ agentDid, content }: { agentDid: string; content: Record<string, unknown> }) {
  const snap = useSnapshot()
  const card = connectCardOf(content)
  const agent = snap.agents.find((a) => a.did === agentDid)
  if (!card || !agent) return null
  return <ConnectCardBody agent={agent} card={card} />
}

function ConnectCardBody({ agent, card }: { agent: AgentRecord; card: NonNullable<ReturnType<typeof connectCardOf>> }) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  const connections = snap.connections[agent.did]
  const [unreadable, setUnreadable] = useState(false)
  const takes = hub.takesConnections(agent.did)
  // the person's accounts, read once for every card of the conversation, and again when the tab is in front
  useEffect(() => (takes ? hub.watchConnections(agent.did) : undefined), [takes, agent.did, hub])
  const wanted = connections === undefined && takes
  useEffect(() => {
    if (!wanted) return
    let live = true
    hub.loadConnections(agent.did).catch(() => live && setUnreadable(true))
    return () => {
      live = false
    }
  }, [wanted, agent.did, hub])
  const ref: ConnectionRef = {
    source: card.source,
    ...(card.binding ? { bindingValue: card.binding.value } : {}),
    ...(card.spaceId ? { spaceId: card.spaceId } : {}),
  }
  const row = connections ? connectionFor(connections, ref) : undefined
  const signIn = useSignIn(agent, {
    source: card.source,
    title: card.title,
    bindingValue: card.binding?.value,
    spaceId: card.spaceId,
    listed: row?.attempt,
  })
  const names = { agent: agent.name, source: card.title }
  // the state of the account, from Your accounts; while they are read, nothing is claimed
  const known = !!row || connections !== undefined || unreadable
  const connected = row?.state === 'connected' && !row.moreAccess
  const reconnect = row ? row.state === 'reconnect' || row.moreAccess : card.why === 'reconnect'
  const method = row?.method ?? card.method
  const press = () => {
    if (method === 'oauth') signIn.start()
    else hub.openAccounts(agent.did, ref)
  }
  const binding = bindingWords(card.binding, t)
  return (
    <section className="card connect-card" aria-label={sourceNameOf(card)} data-state={row?.state ?? 'unknown'}>
      <h3 className="connect-title">{sourceNameOf(card)}</h3>
      {card.description ? <div className="connect-description">{card.description}</div> : null}
      {binding ? <div className="connect-binding">{binding}</div> : null}
      {!known ? null : connected ? (
        <div className="connect-state" role="status">
          <CircleCheck size={CONVERSATION_DESIGN.connectCard.iconSize} aria-hidden="true" className="connect-icon" />
          <span>
            {row?.account?.label
              ? t('accounts.outcome.connected', { label: row.account.label })
              : t('accounts.outcome.connectedNoLabel')}
          </span>
        </div>
      ) : (
        <>
          <div className="connect-state">
            {reconnect ? (
              <TriangleAlert
                size={CONVERSATION_DESIGN.connectCard.iconSize}
                aria-hidden="true"
                className="connect-reconnect-icon"
              />
            ) : null}
            <span>
              {reconnect
                ? row
                  ? t(
                      `accounts.state.${connectionStateKeyOf(row) === 'moreAccess' ? 'moreAccess' : (row.reason ?? 'changed')}`,
                      names
                    )
                  : t('accounts.state.changed', names)
                : // the account, by the card's title, and the feature of the card (UI-CONV-057, UI-CONV-058)
                  t('accounts.card.connect', { account: card.title, feature: card.feature?.title ?? card.title })}
            </span>
          </div>
          {signIn.attempt ? null : (
            <div className="actions">
              <button type="button" className="btn primary" disabled={signIn.busy} onClick={press}>
                {reconnect ? t('accounts.reconnect') : t('accounts.connect')}
              </button>
            </div>
          )}
          <SignInWaiting signIn={signIn} />
        </>
      )}
      <AccountNoticeLine notice={signIn.notice} />
    </section>
  )
}
