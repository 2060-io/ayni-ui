/**
 * The owner's Tools segment of a space (UI-CONV-050, UI-CONV-049; profile 3.4 §3.10; agent D97, D98): every source the
 * space's template names, with its state in words, and for each a panel with its settings, its account, what each of
 * its tools asks, who can use it, and Remove. A change that grants something waits for the owner's phone: the panel
 * shows the code and the time left, follows `ayni.space.tools.changed`, and can withdraw it. The token of a space's
 * account is typed in a masked field that is never prefilled, is emptied as its request leaves, and is kept nowhere.
 */
import {
  type AgentRecord,
  bindingValueFits,
  canAdd,
  changeOutcomeKeyOf,
  isAdded,
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

/** The part of the panel a request came from: its answer, its wait and its refusal are shown there. */
type From = 'add' | 'bindings' | 'account' | 'rules' | 'loaded'

/** A row's state in words (UI-CONV-050): "Needs setup" followed by what is missing. */
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
  const { t } = useTranslation()
  const { tools, error, reload, setTool } = useSpaceTools(agent, space, true)
  const [open, setOpen] = useState<string | null>(null)
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

/** What waits, what was answered, or why it was refused, in the part of the panel the request came from. */
interface PanelState {
  /** `since`: the last change of tools heard when this one started waiting; only a later one can end it */
  waiting: { change: PendingToolChange; from: From; since: number } | null
  outcome: { from: From; key: 'saved' | 'declined' | 'expired' } | null
  error: { from: From; text: string } | null
}

/**
 * A source's panel (UI-CONV-050), in this order: Settings of the tool, Account, What each tool asks, Who can use it,
 * Remove from <space>. A source not added offers Add to <space>, which sends its settings and rules with it.
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
  const [values, setValues] = useState<Record<string, string>>(ownerValues)
  const [rules, setRules] = useState<Record<string, ToolRule>>(toolRules)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const heardLast = () => snap.toolChanges[snap.toolChanges.length - 1]?.n ?? 0
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

  // what the agent says the tool is now, once a change applied or the list was read again; while a change waits, the
  // fields keep what the owner is confirming on the phone
  useEffect(() => {
    if (state.waiting) return
    setValues(ownerValues())
    setRules(toolRules())
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
    setState((s) => ({ waiting: null, error: null, outcome: key && s.waiting ? { from: s.waiting.from, key } : null }))
    onReload()
  }, [heard?.n])

  const answered = (answer: SpaceToolAnswer, from: From) => {
    onTool(answer.tool)
    if (answer.status === 202 && answer.tool.pending)
      setState({ waiting: { change: answer.tool.pending, from, since: heardLast() }, outcome: null, error: null })
    else setState({ waiting: null, outcome: { from, key: 'saved' }, error: null })
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
          : r.reason === 'other' || r.reason === 'personalSpace' || r.reason === 'noSpaceAccount'
            ? e.message
            : t(`tools.${r.reason}`)
      setState((s) => ({ ...s, error: { from, text } }))
    }
  }

  const send = async (from: From, request: () => Promise<SpaceToolAnswer>) => {
    setBusy(true)
    setFieldErrors({})
    setState((s) => ({ ...s, outcome: null, error: null }))
    try {
      answered(await request(), from)
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

  const add = () => {
    const bindings = checkedBindings(false)
    if (!bindings) return
    const calls = Object.fromEntries(
      tool.tools
        .filter((x) => x.name && rules[x.name] !== x.rule)
        .map((x) => [x.name as string, rules[x.name as string]])
    )
    void send('add', () =>
      hub.addSpaceTool(agent.did, space.id, {
        source: tool.source,
        ...(Object.keys(bindings).length ? { bindings } : {}),
        ...(Object.keys(calls).length ? { calls } : {}),
      })
    )
  }

  const saveBindings = () => {
    const bindings = checkedBindings(true)
    if (!bindings || !Object.keys(bindings).length) return
    void send('bindings', () => hub.patchSpaceTool(agent.did, space.id, tool.source, { bindings }))
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

  const chooseRule = (name: string, rule: ToolRule) => {
    setRules((r) => ({ ...r, [name]: rule }))
    // not added yet: the rules go with Add; added: a stricter rule applies at once, a looser one waits for the phone
    if (adding) return
    void send('rules', () => hub.patchSpaceTool(agent.did, space.id, tool.source, { calls: { [name]: rule } }))
  }

  const clearAccount = async () => {
    setConfirming(null)
    setBusy(true)
    try {
      onTool(await hub.clearSpaceToolAccount(agent.did, space.id, tool.source))
      setState({ waiting: null, outcome: { from: 'account', key: 'saved' }, error: null })
    } catch (e) {
      refused(e, 'account')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setConfirming(null)
    setBusy(true)
    try {
      onTool(await hub.removeSpaceTool(agent.did, space.id, tool.source))
      onBack()
    } catch (e) {
      refused(e, 'loaded')
      setBusy(false)
    }
  }

  const withdraw = async () => {
    setBusy(true)
    try {
      await hub.withdrawSpaceToolChange(agent.did, space.id, tool.source)
    } catch (e) {
      // nothing waits any more: the change ended meanwhile
      if (!(e instanceof ProfileError && e.status === 404)) {
        refused(e, state.waiting?.from ?? 'loaded')
        setBusy(false)
        return
      }
    }
    setState({ waiting: null, outcome: null, error: null })
    setBusy(false)
    onReload()
  }

  const waiting = !!state.waiting
  /** In place of the Save of the part that asked: the code and the time left, the outcome, or the refusal. */
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
                  disabled={waiting}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={fieldErrors[b.name] ? true : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [b.name]: e.target.value }))}
                />
                {fieldError(b.name)}
              </label>
            )
          )}
          {added && ownerBindings.length ? (
            <div className="tool-actions">
              {state.waiting?.from === 'bindings' ? null : (
                <button type="button" className="btn" disabled={busy || waiting} onClick={saveBindings}>
                  {t('tools.save')}
                </button>
              )}
              {status('bindings')}
            </div>
          ) : null}
        </section>
      ) : null}

      {account.kind !== 'none' ? (
        <section className="space-section tool-section" aria-label={t('tools.accountTitle')}>
          <h4 className="section-label">{t('tools.accountTitle')}</h4>
          {account.kind === 'agent' ? (
            <p className="rule-line">{t('tools.account.agent', { agent: agent.name })}</p>
          ) : (
            <>
              <div className="tool-account-status">
                <span>{account.label}</span>
                <span className="muted small">
                  {account.set
                    ? t('tools.accountSetBy', { name: account.setBy?.name ?? '', date: date(account.setAt) })
                    : t('tools.notSet')}
                </span>
              </div>
              {added ? (
                <>
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
                        <button type="button" className="btn tool-remove" onClick={() => void clearAccount()}>
                          {t('tools.removeAccount')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
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
                    <span>{x.title}</span>
                    <span className="muted small">{t(`tools.effect.${x.effect}`)}</span>
                  </span>
                  <span className="tool-rule-choice">
                    <select
                      className="input"
                      aria-label={x.title}
                      value={current}
                      disabled={busy || waiting || !x.name}
                      aria-invalid={fieldErrors[`calls.${name}`] ? true : undefined}
                      onChange={(e) => chooseRule(name, e.target.value as ToolRule)}
                    >
                      {ruleChoicesFor(x).map((r) => (
                        <option key={r} value={r}>
                          {t(`tools.ownerRule.${r}`)}
                        </option>
                      ))}
                    </select>
                    {/* the step-up is the agent-pack's: said in words, not chosen (UI-CONV-049) */}
                    {x.stepUp && current !== 'off' ? (
                      <span className="tool-step-up">{t(`tools.stepUp.${x.stepUp}`)}</span>
                    ) : null}
                  </span>
                  {fieldError(`calls.${name}`)}
                </li>
              )
            })}
          </ul>
          {status('rules')}
        </section>
      ) : null}

      <section className="space-section tool-section" aria-label={t('tools.who')}>
        <h4 className="section-label">{t('tools.who')}</h4>
        <p className="rule-line">
          {tool.guests ? t('tools.guests') : t('tools.onlyMembers', { organization: organizationNameOf(agent) })}
        </p>
      </section>

      {adding ? (
        <div className="tool-actions">
          {state.waiting?.from === 'add' ? null : (
            <button type="button" className="btn primary" disabled={busy || waiting} onClick={add}>
              {t('tools.addTo', { space: title })}
            </button>
          )}
          {status('add')}
        </div>
      ) : added ? (
        <div className="tool-actions">
          <button type="button" className="btn tool-remove" disabled={busy} onClick={() => setConfirming('remove')}>
            {t('tools.remove', { space: title })}
          </button>
        </div>
      ) : null}
      {confirming === 'remove' ? (
        <div className="box tool-confirm" role="alertdialog" aria-label={t('tools.remove', { space: title })}>
          <span>{t('tools.removeConfirm', { tool: tool.title, space: title })}</span>
          <div className="tool-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              {t('app.cancel')}
            </button>
            <button type="button" className="btn tool-remove" onClick={() => void remove()}>
              {t('tools.remove', { space: title })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
