/**
 * The owner's Tools segment of a space (UI-CONV-050, UI-CONV-049, UI-CONV-052; profile 3.4 §3.10; agent D97, D98):
 * every source the space's template names, with its state in words, and for each a panel with its settings, its
 * account, what each of its tools asks, who can use it, and Remove. The settings (bindings and rules) and the account
 * are saved by two Saves. A change that grants something waits for the owner's phone: its Save becomes the code and
 * the time left, a stream stays open so that `ayni.space.tools.changed` reaches this page, and it can be withdrawn; a
 * change that only narrows applies at once, also while another waits. The token of a space's account is typed in a
 * masked field that is never prefilled, is emptied as its request leaves, and is kept nowhere.
 */
import {
  type AgentRecord,
  bindingValueFits,
  canAdd,
  changeOutcomeKeyOf,
  isAdded,
  loosens,
  missingOf,
  type PendingToolChange,
  ProfileError,
  ruleChoicesFor,
  type SpaceInfo,
  type SpaceTool,
  type SpaceToolAnswer,
  type ToolRule,
  timeLeftOf,
  tokenFits,
  toolRefusalOf,
  toolRowStateOf,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, ChevronRight, CircleAlert, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { organizationNameOf, spaceTitle } from './SpaceParts.js'
import { useSpaceTools } from './Tools.js'

type T = (key: string, options?: Record<string, unknown>) => string

/**
 * The control a request came from, under which its answer, its wait and its refusal are shown (UI-CONV-052): the Save
 * of the settings (Add, for a source not added), the Save of the account, Remove; `loaded` for a change found waiting
 * when the panel opened.
 */
type From = 'settings' | 'account' | 'remove' | 'loaded'

/** A row's state in words (UI-CONV-050, UI-CONV-052): "Needs setup: Workspace, account". */
function stateWords(tool: SpaceTool, t: T): string {
  const state = toolRowStateOf(tool)
  const words = t(`tools.state.${state}`)
  if (state !== 'needsSetup') return words
  const missing = missingOf(tool)
  const parts = [...missing.bindings, ...(missing.account ? [t('tools.missingAccount')] : [])]
  return parts.length ? `${words}: ${parts.join(', ')}` : words
}

/** Re-renders every second while `on`: the time left of a change that waits. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return now
}

export function ToolsSegment({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const { t } = useTranslation()
  const { tools, error, reload, setTool } = useSpaceTools(agent, space, true)
  const [open, setOpen] = useState<string | null>(null)
  // while a change shown here waits for the phone, a stream stays open for its outcome (UI-CONV-050, PROF-TOOL-006)
  const waiting = !!tools?.some((x) => x.pending)
  useEffect(() => (waiting ? hub.holdStream(agent.did) : undefined), [waiting, agent.did, hub])
  const tool = tools?.find((x) => x.source === open)
  if (tool)
    return (
      <ToolPanel
        agent={agent}
        space={space}
        tool={tool}
        onTool={setTool}
        onReload={reload}
        onBack={() => setOpen(null)}
      />
    )
  return (
    <section className="space-section">
      {error ? <div className="banner warning">{error}</div> : null}
      {tools === null ? (
        <div className="muted">{t('app.loading')}</div>
      ) : tools.length ? (
        <ul className="tool-list">
          {tools.map((x) => {
            const state = toolRowStateOf(x)
            return (
              <li key={x.source} className="tool-row" data-state={state}>
                <button type="button" className="tool-row-main" onClick={() => setOpen(x.source)}>
                  <span className="space-text">
                    <span className="space-name">{x.title}</span>
                    {x.description ? <span className="space-sub">{x.description}</span> : null}
                  </span>
                  <span className={state === 'ready' ? 'tag' : 'state-tag'}>{stateWords(x, t)}</span>
                  <ChevronRight size={16} aria-hidden="true" className="tool-row-chevron" />
                </button>
                {canAdd(x) && !x.pending ? (
                  <button type="button" className="btn small" onClick={() => setOpen(x.source)}>
                    {t('tools.add')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="muted empty">{t('tools.empty')}</div>
      )}
    </section>
  )
}

/** What waits, what was answered, or why it was refused, under the control the request came from. */
interface PanelState {
  /**
   * `since`: the last change of tools heard when this one started waiting, only a later one can end it; `rules` and
   * `values`: what the owner is confirming on the phone, which the fields keep meanwhile
   */
  waiting: {
    change: PendingToolChange
    from: From
    since: number
    rules?: Record<string, ToolRule>
    values?: Record<string, string>
  } | null
  outcome: { from: From; key: 'saved' | 'declined' | 'expired' | 'withdrawn' } | null
  error: { from: From; text: string } | null
}

/**
 * A source's panel (UI-CONV-050), in this order: Settings of the tool, Account (once the source is added), What each
 * tool asks, Who can use it, Remove from <space>. The Save of the settings, after what each tool asks, sends the
 * bindings and the rules together; for a source not added it is Add to <space>.
 */
function ToolPanel({
  agent,
  space,
  tool,
  onTool,
  onReload,
  onBack,
}: {
  agent: AgentRecord
  space: SpaceInfo
  tool: SpaceTool
  onTool: (tool: SpaceTool) => void
  onReload: () => void
  onBack: () => void
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t, i18n } = useTranslation()
  const title = spaceTitle(space, t)
  const adding = canAdd(tool)
  const added = isAdded(tool)
  const ownerValues = () =>
    Object.fromEntries(tool.bindings.filter((b) => b.setBy === 'owner').map((b) => [b.name, b.value ?? '']))
  const toolRules = () =>
    Object.fromEntries(tool.tools.filter((x) => x.name).map((x) => [x.name as string, x.rule])) as Record<
      string,
      ToolRule
    >
  const heardLast = () => snap.toolChanges[snap.toolChanges.length - 1]?.n ?? 0
  const [values, setValues] = useState<Record<string, string>>(ownerValues)
  const [rules, setRules] = useState<Record<string, ToolRule>>(toolRules)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [state, setState] = useState<PanelState>({
    waiting: tool.pending ? { change: tool.pending, from: 'loaded', since: heardLast() } : null,
    outcome: null,
    error: null,
  })
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<'account' | 'remove' | null>(null)
  // the token: never in React state, a draft or a store; read once at Save, the field emptied as the request leaves
  const tokenRef = useRef<HTMLInputElement>(null)
  const now = useNow(!!state.waiting)

  // what the agent says the tool is now, once a change applied or the list was read again; while settings wait for
  // the phone, the fields keep what the owner is confirming
  useEffect(() => {
    const kept = state.waiting?.from === 'settings' ? state.waiting : undefined
    setValues({ ...ownerValues(), ...(kept?.values ?? {}) })
    setRules({ ...toolRules(), ...(kept?.rules ?? {}) })
  }, [tool])

  // the change that waits for the phone ends when the agent says so (`ayni.space.tools.changed`, PROF-TOOL-006)
  const waitingFor = state.waiting
  const heard = snap.toolChanges.find(
    (c) =>
      !!waitingFor &&
      c.n > waitingFor.since &&
      c.agentDid === agent.did &&
      c.change.spaceId === space.id &&
      c.change.source === tool.source &&
      c.change.changeId === waitingFor.change.changeId
  )
  useEffect(() => {
    if (!heard) return
    const key = changeOutcomeKeyOf(heard.change.outcome)
    setState((s) => ({ waiting: null, error: null, outcome: s.waiting ? { from: s.waiting.from, key } : null }))
    onReload()
  }, [heard?.n])

  /** The changed values and rules a request sends, kept while it waits. */
  const answered = (
    answer: SpaceToolAnswer,
    from: From,
    sent: { rules?: Record<string, ToolRule>; values?: Record<string, string> } = {}
  ) => {
    if (answer.status === 202 && answer.tool.pending)
      setState({
        waiting: { change: answer.tool.pending, from, since: heardLast(), ...sent },
        outcome: null,
        error: null,
      })
    // applied at once: a change that waits meanwhile, of another control, goes on waiting
    else setState((s) => ({ waiting: s.waiting, outcome: { from, key: 'saved' }, error: null }))
    onTool(answer.tool)
  }

  const refused = (e: unknown, from: From) => {
    if (!(e instanceof ProfileError)) {
      setState((s) => ({ ...s, error: { from, text: String((e as Error).message) } }))
      return
    }
    const r = toolRefusalOf(e)
    if (r.at === 'binding')
      setFieldErrors({
        [r.name]: t(r.reason === 'badBinding' ? 'tools.badValue' : 'tools.pinnedByPack', { agent: agent.name }),
      })
    else if (r.at === 'rule') {
      // the rule in force stays
      setRules(toolRules())
      setFieldErrors({ [`calls.${r.name}`]: t('tools.looserThanPack', { agent: agent.name }) })
    } else if (r.at === 'token')
      setFieldErrors({ token: t('tools.badToken', { agent: agent.name, label: tool.account.label ?? '' }) })
    else {
      const text =
        r.reason === 'phoneNeeded'
          ? t('tools.phoneNeeded', { agent: agent.name })
          : r.reason === 'other'
            ? e.message
            : t(`tools.${r.reason}`)
      setState((s) => ({ ...s, error: { from, text } }))
    }
  }

  const send = async (
    from: From,
    request: () => Promise<SpaceToolAnswer>,
    sent?: { rules?: Record<string, ToolRule>; values?: Record<string, string> }
  ) => {
    setBusy(true)
    setFieldErrors({})
    setState((s) => ({ ...s, outcome: null, error: null }))
    try {
      answered(await request(), from, sent)
    } catch (e) {
      refused(e, from)
    } finally {
      setBusy(false)
    }
  }

  /** The owner's binding values typed, checked against their patterns first (UI-CONV-050); null when one is wrong. */
  const checkedBindings = (onlyChanged: boolean): Record<string, string> | null => {
    const out: Record<string, string> = {}
    const errors: Record<string, string> = {}
    for (const b of tool.bindings) {
      if (b.setBy !== 'owner') continue
      const value = (values[b.name] ?? '').trim()
      if (!value || (onlyChanged && value === (b.value ?? ''))) continue
      if (!bindingValueFits(b, value)) errors[b.name] = t('tools.badValue', { agent: agent.name })
      else out[b.name] = value
    }
    setFieldErrors(errors)
    return Object.keys(errors).length ? null : out
  }

  /** The rules chosen that differ from those in force. */
  const changedRules = () =>
    Object.fromEntries(
      tool.tools
        .filter((x) => x.name && rules[x.name] && rules[x.name] !== x.rule)
        .map((x) => [x.name as string, rules[x.name as string] as ToolRule])
    )

  /** The Save of the settings (UI-CONV-050): the bindings and the rules in one request; Add for a source not added. */
  const saveSettings = () => {
    const bindings = checkedBindings(!adding)
    if (!bindings) return
    const calls = changedRules()
    const sent = { rules: calls, values: bindings }
    if (adding) {
      void send(
        'settings',
        () =>
          hub.addSpaceTool(agent.did, space.id, {
            source: tool.source,
            ...(Object.keys(bindings).length ? { bindings } : {}),
            ...(Object.keys(calls).length ? { calls } : {}),
          }),
        sent
      )
      return
    }
    if (!Object.keys(bindings).length && !Object.keys(calls).length) return
    void send(
      'settings',
      () =>
        hub.patchSpaceTool(agent.did, space.id, tool.source, {
          ...(Object.keys(bindings).length ? { bindings } : {}),
          ...(Object.keys(calls).length ? { calls } : {}),
        }),
      sent
    )
  }

  const saveToken = () => {
    const field = tokenRef.current
    if (!field) return
    const secret = field.value
    // emptied as soon as it is read: nothing typed in it is ever shown back
    field.value = ''
    if (!tokenFits(tool.account, secret)) {
      setFieldErrors({ token: t('tools.badToken', { agent: agent.name, label: tool.account.label ?? '' }) })
      return
    }
    void send('account', () => hub.setSpaceToolAccount(agent.did, space.id, tool.source, secret))
  }

  /** A change that only narrows applies at once, also while another waits (PROF-TOOL-003). */
  const narrow = async (from: From, request: () => Promise<SpaceTool>, then?: () => void) => {
    setConfirming(null)
    setBusy(true)
    setState((s) => ({ ...s, outcome: null, error: null }))
    try {
      onTool(await request())
      if (then) then()
      else setState((s) => ({ waiting: s.waiting, outcome: { from, key: 'saved' }, error: null }))
    } catch (e) {
      refused(e, from)
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    const from = state.waiting?.from ?? 'loaded'
    setBusy(true)
    try {
      await hub.withdrawSpaceToolChange(agent.did, space.id, tool.source)
    } catch (e) {
      // nothing waits any more: the change ended meanwhile
      if (!(e instanceof ProfileError && e.status === 404)) {
        refused(e, from)
        setBusy(false)
        return
      }
    }
    setState({ waiting: null, outcome: { from, key: 'withdrawn' }, error: null })
    setBusy(false)
    onReload()
  }

  const waiting = !!state.waiting
  /** In place of the Save that sent it: the code and the time left; then the outcome; or the refusal (UI-CONV-052). */
  const status = (from: From) => (
    <>
      {state.waiting?.from === from ? (
        <div className="tool-pending" role="status">
          <Smartphone size={16} aria-hidden="true" className="tool-pending-icon" />
          <span className="tool-pending-text">
            {t('tools.confirmOnPhone', { code: state.waiting.change.code })}
            <span className="muted small tool-time-left">
              {' '}
              {t('tools.timeLeft', { time: timeLeftOf(state.waiting.change.expiresAt, now) })}
            </span>
          </span>
          <button type="button" className="btn small" disabled={busy} onClick={() => void withdraw()}>
            {t('tools.withdraw')}
          </button>
        </div>
      ) : null}
      {state.outcome?.from === from ? (
        <div className="tool-change-outcome" role="status">
          {t(`tools.${state.outcome.key}`)}
        </div>
      ) : null}
      {state.error?.from === from ? (
        <div className="tool-error" role="alert">
          {state.error.text}
        </div>
      ) : null}
    </>
  )
  const fieldError = (key: string) =>
    fieldErrors[key] ? (
      <span className="field-error" role="alert">
        <CircleAlert size={13} aria-hidden="true" className="field-error-icon" /> {fieldErrors[key]}
      </span>
    ) : null

  const ownerBindings = tool.bindings.filter((b) => b.setBy === 'owner')
  const account = tool.account
  const date = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso)) : ''
  // while a change waits, only what narrows can be sent: a binding, a token or a looser rule would be refused
  const grantsLocked = waiting && !adding
  const hasSettings = adding || ownerBindings.length > 0 || tool.tools.some((x) => x.name)
  const settingsSave = hasSettings ? (
    <div className="tool-actions">
      {state.waiting?.from === 'settings' ? null : (
        <button
          type="button"
          className={adding ? 'btn primary settings-save' : 'btn settings-save'}
          disabled={busy || (adding && waiting)}
          onClick={saveSettings}
        >
          {adding ? t('tools.addTo', { space: title }) : t('tools.save')}
        </button>
      )}
      {status('settings')}
    </div>
  ) : null

  return (
    <div className="tool-panel">
      <div className="tool-panel-head">
        <button type="button" className="link" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> {t('tools.back')}
        </button>
        <h3 className="tool-panel-title">{tool.title}</h3>
        {tool.description ? <p className="muted tool-panel-description">{tool.description}</p> : null}
        <span className={toolRowStateOf(tool) === 'ready' ? 'tag' : 'state-tag'}>{stateWords(tool, t)}</span>
      </div>
      {status('loaded')}

      {tool.bindings.length ? (
        <section className="space-section tool-section" aria-label={t('tools.settings')}>
          <h4 className="section-label">{t('tools.settings')}</h4>
          {tool.bindings.map((b) =>
            b.setBy === 'pack' ? (
              <div key={b.name} className="field tool-fixed">
                <span>{b.label}</span>
                <span className="tool-fixed-value">{b.value ?? ''}</span>
                <span className="muted small">{t('tools.setByAgent', { agent: agent.name })}</span>
              </div>
            ) : (
              <label key={b.name} className="field">
                {b.label}
                <input
                  className="input"
                  value={values[b.name] ?? ''}
                  disabled={grantsLocked}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={fieldErrors[b.name] ? true : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [b.name]: e.target.value }))}
                />
                {fieldError(b.name)}
              </label>
            )
          )}
          {tool.tools.length ? null : settingsSave}
        </section>
      ) : null}

      {account.kind === 'agent' ? (
        <section className="space-section tool-section" aria-label={t('tools.accountTitle')}>
          <h4 className="section-label">{t('tools.accountTitle')}</h4>
          <p className="rule-line">{t('tools.account.agent', { agent: agent.name })}</p>
        </section>
      ) : account.kind === 'space' && added ? (
        // a space's account, once the source is added (UI-CONV-050): before, the agent would answer `409 not-added`
        <section className="space-section tool-section" aria-label={t('tools.accountTitle')}>
          <h4 className="section-label">{t('tools.accountTitle')}</h4>
          <div className="tool-account-status">
            <span>{account.label}</span>
            <span className="muted small">
              {account.set
                ? t('tools.accountSetBy', { name: account.setBy?.name ?? '', date: date(account.setAt) })
                : t('tools.notSet')}
            </span>
          </div>
          <label className="field">
            <span className="sr-only">{account.label}</span>
            <input
              ref={tokenRef}
              className="input"
              type="password"
              name={`token-${tool.source}`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              placeholder={t('tools.paste', { label: account.label })}
              disabled={waiting}
              aria-invalid={fieldErrors.token ? true : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveToken()
                }
              }}
            />
            {fieldError('token')}
          </label>
          <div className="tool-actions">
            {state.waiting?.from === 'account' ? null : (
              <button type="button" className="btn" disabled={busy || waiting} onClick={saveToken}>
                {account.set ? t('tools.replace') : t('tools.save')}
              </button>
            )}
            {account.set ? (
              <button
                type="button"
                className="btn tool-remove"
                disabled={busy}
                onClick={() => setConfirming('account')}
              >
                {t('tools.removeAccount')}
              </button>
            ) : null}
            {status('account')}
          </div>
          {confirming === 'account' ? (
            <div className="box tool-confirm" role="alertdialog" aria-label={t('tools.removeAccount')}>
              <span>{t('tools.removeAccountConfirm', { tool: tool.title })}</span>
              <div className="tool-actions">
                <button type="button" className="btn" onClick={() => setConfirming(null)}>
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  className="btn tool-remove"
                  onClick={() =>
                    void narrow('account', () => hub.clearSpaceToolAccount(agent.did, space.id, tool.source))
                  }
                >
                  {t('tools.removeAccount')}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tool.tools.length ? (
        <section className="space-section tool-section" aria-label={t('tools.asks')}>
          <h4 className="section-label">{t('tools.asks')}</h4>
          <ul className="tool-rules">
            {tool.tools.map((x) => {
              const name = x.name ?? x.title
              const current = rules[name] ?? x.rule
              return (
                <li key={name} className="tool-rule-row">
                  <span className="tool-rule-name">
                    {/* the step-up is the agent-pack's: said after the title, not chosen (UI-CONV-049) */}
                    <span>
                      {x.title}
                      {x.stepUp ? <span className="tool-step-up">{t(`tools.stepUp.${x.stepUp}`)}</span> : null}
                    </span>
                    <span className="muted small">{t(`tools.effect.${x.effect}`)}</span>
                  </span>
                  <span className="tool-rule-choice">
                    <select
                      className="input"
                      aria-label={x.title}
                      value={current}
                      disabled={busy || !x.name || (adding && waiting)}
                      aria-invalid={fieldErrors[`calls.${name}`] ? true : undefined}
                      onChange={(e) => setRules((r) => ({ ...r, [name]: e.target.value as ToolRule }))}
                    >
                      {ruleChoicesFor(x).map((r) => (
                        // while a change waits, a rule looser than the one in force would be refused
                        <option key={r} value={r} disabled={grantsLocked && loosens(r, x.rule)}>
                          {t(`tools.ownerRule.${r}`)}
                        </option>
                      ))}
                    </select>
                  </span>
                  {fieldError(`calls.${name}`)}
                </li>
              )
            })}
          </ul>
          {settingsSave}
        </section>
      ) : tool.bindings.length ? null : (
        settingsSave
      )}

      <section className="space-section tool-section" aria-label={t('tools.who')}>
        <h4 className="section-label">{t('tools.who')}</h4>
        <p className="rule-line">
          {tool.guests ? t('tools.guests') : t('tools.onlyMembers', { organization: organizationNameOf(agent) })}
        </p>
      </section>

      {added ? (
        <div className="tool-actions">
          <button type="button" className="btn tool-remove" disabled={busy} onClick={() => setConfirming('remove')}>
            {t('tools.remove', { space: title })}
          </button>
          {status('remove')}
        </div>
      ) : null}
      {confirming === 'remove' ? (
        <div className="box tool-confirm" role="alertdialog" aria-label={t('tools.remove', { space: title })}>
          <span>{t('tools.removeConfirm', { tool: tool.title, space: title })}</span>
          <div className="tool-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              {t('app.cancel')}
            </button>
            <button
              type="button"
              className="btn tool-remove"
              onClick={() => void narrow('remove', () => hub.removeSpaceTool(agent.did, space.id, tool.source), onBack)}
            >
              {t('tools.remove', { space: title })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
