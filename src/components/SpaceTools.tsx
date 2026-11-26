/**
 * The owner's Tools segment of a space (UI-CONV-050, UI-CONV-049, UI-CONV-052, UI-CONV-065; profile 3.5.8 §3.10; agent
 * D97, D98, D120, D122): every feature the space's template names, in its order, each with the line of its provider
 * and its state in words; Add chooses the provider, among several under "Choose a provider for <feature>", the
 * template's default "Suggested" and selected, or at once when there is one. The panel of a provider in use has its
 * settings, its account, what each of its tools asks, who can use it, and Remove. The settings (bindings and rules) and the account
 * are saved by two Saves. A change that grants something waits for the owner's phone: its Save becomes the code and
 * the time left, a stream stays open so that `ayni.space.tools.changed` reaches this page, and it can be withdrawn; a
 * change that only narrows applies at once, also while another waits. A space's account is typed in one masked field
 * per value its agent declares, in the agent's order: never prefilled, sent all together once each holds a value that
 * fits, emptied as their request leaves and with the panel, and kept nowhere. A source of each person's own account
 * (profile 3.5) has no account of the space; the binding its accounts are for is chosen from the owner's own accounts,
 * never typed, and an owner who holds none connects one to choose (UI-CONV-050, PROF-TOOL-021). Each tool whose rule is
 * `approval` shows its approval policy under its rule (UI-CONV-067, profile 3.5.4), sent with the settings; a policy
 * that needs attention says so on the tool's line and on its source's row. A provider's list, for a feature with a
 * contract its location (UI-CONV-059, PROF-TOOL-022, PROF-TOOL-023), is edited in Settings of the tool: its entries
 * with Remove, Add with a search of the owner's account, each choice added or "In the list", and, where the template
 * allows it, "Only these" or any; the Save of the settings sends it whole. For Files in a team space (UI-CONV-069,
 * profile package 3.5.9), Add, and Change provider, show the two modes where the provider has both, the managed one
 * first and selected, and send the mode chosen; in the managed mode the page shows, under the code, the question the
 * phone asks. In the managed mode (UI-CONV-070) the row of Files shows the folder's line, its state and the members
 * without access, with "Open in <provider>" beside it, and its panel the folder in place of the choice of folder.
 */
import {
  type AgentRecord,
  type ApprovalPolicyInput,
  accountSourceOf,
  accountValuesOf,
  addInputOf,
  bindingValueFits,
  CHOICES_PAUSE_MS,
  CHOICES_TEXT_MAX,
  type ChoicesRefusal,
  canAdd,
  canChangeProvider,
  changeOutcomeKeyOf,
  choiceInList,
  choicesRefusalOf,
  choicesTextOf,
  choosesLocation,
  choosesProvider,
  concernsFeature,
  defaultLocationOf,
  defaultProviderOf,
  folderLineOf,
  isAdded,
  isConformant,
  type ListChoice,
  type ListForm,
  listChanged,
  listFormOf,
  listInputOf,
  listIsFull,
  locationsFor,
  loosens,
  missingPartsOf,
  otherProvidersOf,
  ownerFolderOf,
  type PendingToolChange,
  type PolicyForm,
  type PolicyRefusal,
  ProfileError,
  policyChanged,
  policyFormOf,
  policyInputOf,
  providerChangeInputOf,
  providerChangeOf,
  ruleChoicesFor,
  type SpaceInfo,
  type SpaceTool,
  type SpaceToolAccountField,
  type SpaceToolAnswer,
  type SpaceToolBinding,
  type SpaceToolList,
  type SpaceToolLocation,
  type SpaceToolProvider,
  sourceNameOf,
  type ToolRule,
  timeLeftOf,
  toolRefusalOf,
  toolRowStateOf,
  toolsNeedingAttention,
  withListEntry,
  withoutListEntry,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, ChevronRight, CircleAlert, Smartphone, TriangleAlert } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { AccountNoticeLine, bindingWords, SignInWaiting, useNow, useSignIn } from './Accounts.js'
import { AttentionLine, PolicyEditor, policyRefusalText } from './ApprovalPolicy.js'
import { FolderLines, FolderOpen, FolderSection, folderReleaseWords, LocationChoice } from './ManagedFolder.js'
import { organizationNameOf, spaceTitle } from './SpaceParts.js'
import { accountWords, providerLineWords, useSpaceTools } from './Tools.js'

type T = (key: string, options?: Record<string, unknown>) => string

/**
 * The control a request came from, under which its answer, its wait and its refusal are shown (UI-CONV-052): the Save
 * of the settings (Add, for a feature with no provider), the Save of the account, Change provider, Remove; `loaded`
 * for a change found waiting when the panel opened.
 */
type From = 'settings' | 'account' | 'provider' | 'remove' | 'loaded'

/**
 * A row's state in words (UI-CONV-050, UI-CONV-052): "Needs setup: Folders, account"; while the agent makes the managed
 * folder, "Making the folder at <provider>…".
 */
function stateWords(tool: SpaceTool, t: T): string {
  const state = toolRowStateOf(tool)
  if (state === 'makingFolder') return t('tools.folder.creating', { provider: tool.title ?? tool.source ?? '' })
  const words = t(`tools.state.${state}`)
  if (state !== 'needsSetup') return words
  const missing = missingPartsOf(tool)
  const parts = [...missing.labels, ...(missing.account ? [t('tools.missingAccount')] : [])]
  return parts.length ? `${words}: ${parts.join(', ')}` : words
}

/**
 * The words of a provider that does not offer its feature as its contract says (UI-CONV-065, UI-CONV-052), on its row
 * in place of its state and atop its panel: "Google Drive does not offer Files as Fleet support expects. Choose
 * another provider."
 */
function NotConformant({ agent, tool }: { agent: AgentRecord; tool: SpaceTool }) {
  const { t } = useTranslation()
  return (
    <span className="tool-not-conformant" role="note">
      <TriangleAlert size={13} aria-hidden="true" className="tool-not-conformant-icon" />{' '}
      {t('tools.notConformant', { provider: tool.title ?? '', feature: tool.feature.title, agent: agent.name })}
    </span>
  )
}

/** The state of a feature in words, or, for a provider that does not offer its feature, why (UI-CONV-065). */
function StateLine({ agent, tool }: { agent: AgentRecord; tool: SpaceTool }) {
  const { t } = useTranslation()
  const state = toolRowStateOf(tool)
  if (state === 'notConformant') return <NotConformant agent={agent} tool={tool} />
  return <span className={state === 'ready' ? 'tag' : 'state-tag'}>{stateWords(tool, t)}</span>
}

export function ToolsSegment({
  agent,
  space,
  source,
}: {
  agent: AgentRecord
  space: SpaceInfo
  /** the provider whose panel opens first: Open the tool of a notice (UI-APPR-011) */
  source?: string
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const { tools, error, reload, setTool } = useSpaceTools(agent, space, true)
  // the feature whose panel is open; undefined until the feature of `source` is known, null for the list
  const [open, setOpen] = useState<string | null | undefined>(source ? undefined : null)
  // while a change shown here waits for the phone, a stream stays open for its outcome (UI-CONV-050, PROF-TOOL-006); and
  // while the agent makes a managed folder, for the change of its state (PROF-TOOL-041)
  const waiting = !!tools?.some((x) => x.pending || ownerFolderOf(x)?.state === 'creating')
  useEffect(() => (waiting ? hub.holdStream(agent.did) : undefined), [waiting, agent.did, hub])
  const openId = open === undefined ? tools?.find((x) => x.source === source)?.feature.id : open
  const tool = tools?.find((x) => x.feature.id === openId)
  if (tool)
    return (
      <FeaturePanel
        key={tool.feature.id}
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
            const folder = folderLineOf(x)
            return (
              <li key={x.feature.id} className="tool-row" data-state={state}>
                {/* a row opens the panel of its provider, or what Add opens for a feature with none (UI-CONV-050) */}
                <button type="button" className="tool-row-main" onClick={() => setOpen(x.feature.id)}>
                  <span className="space-text">
                    <span className="space-name">{x.feature.title}</span>
                    {/* the line of its provider, or "Choose a provider" (UI-CONV-065) */}
                    <span className="space-sub tool-provider-line">{providerLineWords(x, agent.name, t)}</span>
                    {/* a policy of its tools that needs attention, on the row (UI-CONV-067) */}
                    {toolsNeedingAttention(x).map((item) => (
                      <AttentionLine key={item.name ?? item.title} policy={item.approval} className="space-sub" />
                    ))}
                    {state === 'notConformant' ? <StateLine agent={agent} tool={x} /> : null}
                    {/* the managed folder, its state and the members without access (UI-CONV-070) */}
                    <FolderLines agentName={agent.name} tool={x} lineClass="space-sub" creating={false} />
                  </span>
                  {state === 'notConformant' ? null : <StateLine agent={agent} tool={x} />}
                  <ChevronRight size={16} aria-hidden="true" className="tool-row-chevron" />
                </button>
                {canAdd(x) && !x.pending ? (
                  <button type="button" className="btn small" onClick={() => setOpen(x.feature.id)}>
                    {t('tools.add')}
                  </button>
                ) : null}
                {/* beside the row's button, which a link cannot be inside */}
                {folder ? <FolderOpen line={folder} className="tool-row-open" /> : null}
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

/**
 * The providers a feature's template allows, to choose one (UI-CONV-065, UI-CONV-066): under "Choose a provider for
 * <feature>", in the agent's order, each with its title, its description and whose account it uses (UI-CONV-049), the
 * template's default marked "Suggested".
 */
function ProviderChoice({
  agent,
  tool,
  providers,
  value,
  disabled,
  onChoose,
}: {
  agent: AgentRecord
  tool: SpaceTool
  providers: SpaceToolProvider[]
  value: string
  disabled: boolean
  onChoose: (source: string) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="field tool-providers">
      <legend className="section-label">{t('tools.chooseProviderFor', { feature: tool.feature.title })}</legend>
      {providers.map((p) => {
        const account = accountWords(p.account.kind, agent.name, t)
        return (
          <label key={p.source} className="tool-provider-option">
            <input
              type="radio"
              name={`provider-${tool.feature.id}`}
              value={p.source}
              checked={value === p.source}
              disabled={disabled}
              onChange={() => onChoose(p.source)}
            />
            <span className="tool-provider-text">
              <span className="tool-provider-title">
                {p.title}
                {p.default ? <span className="tag tool-suggested">{t('tools.suggested')}</span> : null}
              </span>
              {p.description ? <span className="muted small">{p.description}</span> : null}
              {account ? <span className="muted small">{account}</span> : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/**
 * The binding a source's personal accounts are for, such as Relaticle's workspace (UI-CONV-050, PROF-TOOL-021, agent
 * D110): chosen from the owner's own accounts of the source, one choice "Use <valueLabel>" each, never typed; the
 * Save of the settings sends it, and the change goes through the phone as any binding. An owner who holds no account
 * of the source connects one to choose: the sign-in of Your accounts for this space, with no value expected; once it
 * is connected the list is read again and its workspace is offered.
 */
function BindingFromAccount({
  agent,
  space,
  tool,
  binding,
  value,
  disabled,
  error,
  onChoose,
}: {
  agent: AgentRecord
  space: SpaceInfo
  tool: SpaceTool
  binding: SpaceToolBinding
  value: string
  disabled: boolean
  error: ReactNode
  onChoose: (value: string) => void
}) {
  const { t } = useTranslation()
  const choices = binding.choices ?? []
  // the row of Your accounts the tool's personal accounts are under: another source's when it uses that one's
  const signIn = useSignIn(agent, { source: accountSourceOf(tool), title: tool.title ?? '', spaceId: space.id })
  const current =
    binding.value !== null && binding.value !== ''
      ? bindingWords({ label: binding.label, valueLabel: binding.valueLabel ?? binding.value }, t)
      : ''
  return (
    <fieldset className="field tool-choice">
      <legend>{binding.label}</legend>
      {current ? <span className="tool-fixed-value tool-choice-current">{current}</span> : null}
      {choices.length ? (
        choices.map((c) => (
          <label key={c.value} className="tool-choice-option">
            <input
              type="radio"
              name={`binding-${tool.feature.id}-${binding.name}`}
              value={c.value}
              checked={value === c.value}
              disabled={disabled}
              onChange={() => onChoose(c.value)}
            />
            {t('tools.useValue', { value: c.valueLabel })}
          </label>
        ))
      ) : signIn.attempt ? null : (
        <div className="tool-actions">
          <button type="button" className="btn" disabled={disabled || signIn.busy} onClick={signIn.start}>
            {t('tools.connectToChoose')}
          </button>
        </div>
      )}
      <SignInWaiting signIn={signIn} />
      <AccountNoticeLine notice={signIn.notice} />
      {error}
    </fieldset>
  )
}

/** Where the agent refused a list (UI-CONV-059): at an entry's row, under Add, or at the choice of any. */
interface ListErrors {
  entries: Record<number, string>
  add?: string
  any?: string
}

/**
 * The list of a provider (UI-CONV-059, UI-CONV-066), for a feature with a contract its location, titled by its label:
 * "Only these" or its `anyLabel` where the template allows any value, the second with its amber warning while it is
 * selected; under "Only these" each entry with Remove, then Add, which shows a search field. Once the typing pauses the
 * agent is asked for the choices of the owner's account (PROF-TOOL-023), each listed by its label with Add, or "In the
 * list" when an entry equals or covers it. A location takes no typed entry (`typed: false`): only a choice. At
 * `maxEntries` entries Add is disabled with the words of `422 too-many-entries`. What changes here is the panel's until
 * the Save of the settings sends the whole list; while a change waits, only what narrows can be done (Remove, Only
 * these).
 */
function ListEditor({
  agent,
  space,
  tool,
  list,
  form,
  locked,
  errors,
  onChange,
}: {
  agent: AgentRecord
  space: SpaceInfo
  tool: SpaceTool
  list: SpaceToolList
  form: ListForm
  /** a change waits: what grants (an entry, any) would be refused */
  locked: boolean
  errors: ListErrors
  onChange: (form: ListForm) => void
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  const [searching, setSearching] = useState(false)
  const [text, setText] = useState('')
  const [found, setFound] = useState<ListChoice[] | null>(null)
  const [refusal, setRefusal] = useState<ChoicesRefusal | null>(null)
  const asked = useRef(0)
  const full = listIsFull(form, list)
  // the owner's own account connected or ended: the search is asked again (UI-CONV-059)
  const accounts = snap.connectionChanges.filter((c) => c.agentDid === agent.did)
  const lastAccount = accounts[accounts.length - 1]?.n ?? 0
  const signIn = useSignIn(agent, { source: accountSourceOf(tool), title: tool.title ?? '', spaceId: space.id })
  const source = tool.source

  // the choices, once the typing pauses; an answer to an earlier text is dropped
  useEffect(() => {
    const query = choicesTextOf(text)
    if (!searching || !query || !source) {
      setFound(null)
      setRefusal(null)
      return
    }
    const n = ++asked.current
    const timer = setTimeout(() => {
      hub
        .spaceToolChoices(agent.did, space.id, source, query)
        .then((choices) => {
          if (n !== asked.current) return
          setFound(choices)
          setRefusal(null)
        })
        .catch((e) => {
          if (n !== asked.current) return
          setFound(null)
          setRefusal(choicesRefusalOf(e instanceof ProfileError ? e : undefined))
        })
    }, CHOICES_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [text, searching, source, agent.did, space.id, hub, lastAccount])

  const refusalWords =
    refusal === 'spaceAccountNotSet'
      ? t('tools.spaceAccountNotSet')
      : refusal === 'unavailable'
        ? t('tools.list.unavailable', { source: tool.title ?? '' })
        : refusal === 'notOwner'
          ? t('tools.notOwner')
          : refusal === 'notFound'
            ? t('tools.notFound')
            : refusal === 'other'
              ? t('tools.list.unavailable', { source: tool.title ?? '' })
              : ''
  const error = (text: string | undefined) =>
    text ? (
      <span className="field-error" role="alert">
        <CircleAlert size={13} aria-hidden="true" className="field-error-icon" /> {text}
      </span>
    ) : null

  return (
    <fieldset className="field tool-list-editor">
      <legend>{list.label}</legend>
      {list.anyAllowed ? (
        <div className="tool-list-modes">
          <label className="tool-choice-option">
            <input
              type="radio"
              name={`list-${tool.feature.id}`}
              checked={!form.any}
              onChange={() => onChange({ ...form, any: false })}
            />
            {t('tools.list.onlyThese')}
          </label>
          <label className="tool-choice-option">
            <input
              type="radio"
              name={`list-${tool.feature.id}`}
              checked={form.any}
              disabled={locked && !list.any}
              onChange={() => onChange({ ...form, any: true })}
            />
            {list.anyLabel}
          </label>
          {form.any ? (
            <div className="untrusted-notice tool-list-any-warning" role="note">
              <TriangleAlert size={15} aria-hidden="true" className="untrusted-icon" />
              <span>{t('tools.list.anyWarning', { agent: agent.name })}</span>
            </div>
          ) : null}
          {error(errors.any)}
        </div>
      ) : null}
      {form.any ? null : (
        <>
          {form.entries.length ? (
            <ul className="tool-list-entries">
              {form.entries.map((e, i) => (
                <li key={JSON.stringify(e.values)} className="tool-list-entry">
                  <span className="tool-list-entry-label">{e.label}</span>
                  <button type="button" className="btn small" onClick={() => onChange(withoutListEntry(form, i))}>
                    {t('tools.list.remove')}
                  </button>
                  {error(errors.entries[i])}
                </li>
              ))}
            </ul>
          ) : null}
          {list.choices ? (
            searching ? (
              <div className="tool-list-search">
                <input
                  className="input"
                  type="search"
                  value={text}
                  maxLength={CHOICES_TEXT_MAX}
                  placeholder={t('tools.list.search')}
                  aria-label={t('tools.list.search')}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={locked || full}
                  onChange={(e) => setText(e.target.value)}
                />
                {refusal === 'notConnected' ? (
                  <div className="tool-actions">
                    <span className="muted small">{t('tools.connectToChoose')}</span>
                    {signIn.attempt ? null : (
                      <button type="button" className="btn small" disabled={signIn.busy} onClick={signIn.start}>
                        {t('accounts.connect')}
                      </button>
                    )}
                  </div>
                ) : refusalWords ? (
                  <div className="tool-error" role="alert">
                    {refusalWords}
                  </div>
                ) : null}
                <SignInWaiting signIn={signIn} />
                <AccountNoticeLine notice={signIn.notice} />
                {found?.length ? (
                  <ul className="tool-list-choices">
                    {found.map((c) => (
                      <li key={JSON.stringify(c.values)} className="tool-list-choice">
                        <span className="tool-list-choice-label">{c.label}</span>
                        {choiceInList(form, c) ? (
                          <span className="muted small">{t('tools.list.inList')}</span>
                        ) : (
                          <button
                            type="button"
                            className="btn small"
                            disabled={locked || full}
                            onClick={() => onChange(withListEntry(form, c, list))}
                          >
                            {t('tools.add')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="tool-actions">
                <button
                  type="button"
                  className="btn small tool-list-add"
                  disabled={locked || full}
                  onClick={() => setSearching(true)}
                >
                  {t('tools.add')}
                </button>
              </div>
            )
          ) : null}
          {full ? <span className="muted small">{t('tools.list.tooMany', { max: list.maxEntries })}</span> : null}
          {error(errors.add)}
        </>
      )}
    </fieldset>
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
    policies?: Record<string, PolicyForm>
    list?: ListForm
    /** Files added, or its provider changed, in the managed mode: the page shows the question the phone asks */
    managed?: boolean
  } | null
  outcome: { from: From; key: 'saved' | 'declined' | 'expired' | 'withdrawn' } | null
  /** `at: "location"`: a refusal of the mode of Files, said under the choice of the modes while it shows */
  error: { from: From; text: string; at?: 'location' } | null
}

/**
 * A feature's panel (UI-CONV-050, UI-CONV-065). With no provider in use, what Add opens: the providers to choose among
 * when the template allows several, then the panel of the one picked, whose Save is Add to <space>; with one, the
 * panel of its provider, in this order: Settings of the tool, Account (once the provider is added), What each tool
 * asks, Who can use it, Change provider (for a feature of several providers, UI-CONV-066), Remove from <space>. The
 * Save of the settings, after what each tool asks, sends the bindings and the rules together. The panel is the
 * feature's: a change that waits, then its outcome, stays shown when its provider comes in or is replaced.
 */
function FeaturePanel({
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
  const adding = canAdd(tool) || tool.source === null
  const added = isAdded(tool)
  // the provider Add chooses: the template's default, selected, until the owner picks another (UI-CONV-065)
  const [picked, setPicked] = useState(defaultProviderOf(tool)?.source ?? '')
  const provider = tool.providers.find((p) => p.source === picked) ?? defaultProviderOf(tool)
  const ownerValues = () =>
    Object.fromEntries(tool.bindings.filter((b) => b.setBy === 'owner').map((b) => [b.name, b.value ?? '']))
  const toolRules = () =>
    Object.fromEntries(tool.tools.filter((x) => x.name).map((x) => [x.name as string, x.rule])) as Record<
      string,
      ToolRule
    >
  const heardLast = () => snap.toolChanges[snap.toolChanges.length - 1]?.n ?? 0
  // the approval policies of the tools whose rule is `approval`, as forms (UI-CONV-067)
  const toolPolicies = () =>
    Object.fromEntries(
      tool.tools.flatMap((x) => (x.name && x.approval ? [[x.name, policyFormOf(x.approval)] as const] : []))
    ) as Record<string, PolicyForm>
  const [values, setValues] = useState<Record<string, string>>(ownerValues)
  const [rules, setRules] = useState<Record<string, ToolRule>>(toolRules)
  const [policies, setPolicies] = useState<Record<string, PolicyForm>>(toolPolicies)
  const [policyError, setPolicyError] = useState<PolicyRefusal | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  // the list of the provider, as the owner changes it until the Save of the settings (UI-CONV-059)
  const toolList = () => (tool.list ? listFormOf(tool.list) : null)
  const [listForm, setListForm] = useState<ListForm | null>(toolList)
  const [listErrors, setListErrors] = useState<ListErrors>({ entries: {} })
  const [state, setState] = useState<PanelState>({
    waiting: tool.pending ? { change: tool.pending, from: 'loaded', since: heardLast() } : null,
    outcome: null,
    error: null,
  })
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<'account' | 'remove' | null>(null)
  // Change provider (UI-CONV-066): the other providers shown, and the one the owner picked, asked about in the page
  const [changing, setChanging] = useState(false)
  const [next, setNext] = useState('')
  // the mode of Files picked for each provider, until then the managed one where it is offered (UI-CONV-069)
  const [modes, setModes] = useState<Record<string, SpaceToolLocation>>({})
  const modeOf = (source: string | undefined): SpaceToolLocation | null =>
    source ? (modes[source] ?? defaultLocationOf(locationsFor(tool, source))) : null
  // the provider a request named, as a refusal of its mode names it
  const asked = useRef('')
  // the values of the account: never in React state, a draft or a store; read once at Save, the fields emptied as the
  // request leaves and gone with the panel. Only whether each field holds something is kept, for the Save.
  const accountRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [filled, setFilled] = useState<Record<string, boolean>>({})
  // once the account is set, its fields show again only for Replace
  const [replacing, setReplacing] = useState(false)
  const now = useNow(!!state.waiting)

  // what the agent says the tool is now, once a change applied or the list was read again; while settings wait for
  // the phone, the fields keep what the owner is confirming
  useEffect(() => {
    const kept = state.waiting?.from === 'settings' ? state.waiting : undefined
    setValues({ ...ownerValues(), ...(kept?.values ?? {}) })
    setRules({ ...toolRules(), ...(kept?.rules ?? {}) })
    setPolicies({ ...toolPolicies(), ...(kept?.policies ?? {}) })
    setListForm(kept?.list ?? toolList())
  }, [tool])

  // the change that waits for the phone ends when the agent says so, for this feature (`ayni.space.tools.changed`,
  // PROF-TOOL-006): its provider may be another by then
  const waitingFor = state.waiting
  const heard = snap.toolChanges.find(
    (c) =>
      !!waitingFor &&
      c.n > waitingFor.since &&
      c.agentDid === agent.did &&
      concernsFeature(c.change, space.id, tool.feature.id) &&
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
    sent: {
      rules?: Record<string, ToolRule>
      values?: Record<string, string>
      policies?: Record<string, PolicyForm>
      list?: ListForm
      managed?: boolean
    } = {}
  ) => {
    if (answer.status === 202 && answer.tool.pending)
      setState({
        waiting: { change: answer.tool.pending, from, since: heardLast(), ...sent },
        outcome: null,
        error: null,
      })
    // applied at once: a change that waits meanwhile, of another control, goes on waiting
    else setState((s) => ({ waiting: s.waiting, outcome: { from, key: 'saved' }, error: null }))
    if (from === 'account') setReplacing(false)
    onTool(answer.tool)
  }

  const accountFields = tool.account?.fields ?? []
  const badTokenWords = (field: SpaceToolAccountField) => t('tools.badToken', { agent: agent.name, label: field.label })

  const refused = (e: unknown, from: From) => {
    if (!(e instanceof ProfileError)) {
      setState((s) => ({ ...s, error: { from, text: String((e as Error).message) } }))
      return
    }
    // the provider in use is no longer the one this page read (`400`, `field: "replaces"`): the list is read again
    if (e.field === 'replaces') onReload()
    const r = toolRefusalOf(e)
    if (r.at === 'location') {
      // at the choice of the modes (UI-CONV-069, UI-CONV-052); the modes are read again, which the agent may have
      // narrowed to the existing one
      const text =
        r.reason === 'cannotManage'
          ? t('tools.folder.cannotManage', { agent: agent.name, provider: asked.current })
          : r.reason === 'locationNotAllowed'
            ? t('tools.list.anyNotAllowed', { agent: agent.name })
            : e.message
      setState((s) => ({ ...s, error: { from, text, at: 'location' } }))
      onReload()
      return
    }
    if (r.at === 'policy') {
      // at the entry, the number needed or the switch the agent names (UI-CONV-067, UI-CONV-052)
      setPolicyError(r.refusal)
      return
    }
    if (r.at === 'entry') {
      // at that entry's row (UI-CONV-059, UI-CONV-066)
      const words =
        r.reason === 'badBinding'
          ? t('tools.badValue', { agent: agent.name })
          : r.reason === 'repeatedEntry'
            ? t('tools.list.repeated')
            : t('tools.notPortable')
      setListErrors({ entries: { [r.index]: words } })
    } else if (r.at === 'entries')
      setListErrors({ entries: {}, add: t('tools.list.tooMany', { max: tool.list?.maxEntries ?? '' }) })
    else if (r.at === 'any') setListErrors({ entries: {}, any: t('tools.list.anyNotAllowed', { agent: agent.name }) })
    else if (r.at === 'binding')
      setFieldErrors({
        [r.name]:
          r.reason === 'notYourAccount'
            ? t('tools.notYourAccount', { source: tool.title ?? '' })
            : t(r.reason === 'badBinding' ? 'tools.badValue' : 'tools.pinnedByPack', { agent: agent.name }),
      })
    else if (r.at === 'rule') {
      // the rule in force stays
      setRules(toolRules())
      setFieldErrors({ [`calls.${r.name}`]: t('tools.looserThanPack', { agent: agent.name }) })
    } else if (r.at === 'account') {
      const field = accountFields.find((f) => f.name === r.field)
      if (field && r.reason === 'badToken') setFieldErrors({ [`account.${field.name}`]: badTokenWords(field) })
      else {
        // the fields changed since the panel was read (UI-CONV-052): they are read again, and shown empty
        setState((s) => ({ ...s, error: { from, text: t('tools.accountFieldsChanged') } }))
        onReload()
      }
    } else if (r.at === 'panel') {
      const text =
        r.reason === 'phoneNeeded'
          ? t('tools.phoneNeeded', { agent: agent.name })
          : r.reason === 'featureHasProvider'
            ? t('tools.featureHasProvider', { feature: tool.feature.title })
            : r.reason === 'managedLocation'
              ? t('tools.folder.managedLocation', { agent: agent.name })
              : r.reason === 'other'
                ? e.message
                : t(`tools.${r.reason}`)
      setState((s) => ({ ...s, error: { from, text } }))
      // the agent manages the folder this panel read as one that exists: the tools are read again
      if (r.reason === 'managedLocation') onReload()
    } else setState((s) => ({ ...s, error: { from, text: e.message } }))
  }

  const send = async (
    from: From,
    request: () => Promise<SpaceToolAnswer>,
    sent?: {
      rules?: Record<string, ToolRule>
      values?: Record<string, string>
      policies?: Record<string, PolicyForm>
      list?: ListForm
      managed?: boolean
    }
  ) => {
    setBusy(true)
    setFieldErrors({})
    setListErrors({ entries: {} })
    setPolicyError(null)
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
  const checkedBindings = (): Record<string, string> | null => {
    const out: Record<string, string> = {}
    const errors: Record<string, string> = {}
    for (const b of tool.bindings) {
      if (b.setBy !== 'owner') continue
      const value = (values[b.name] ?? '').trim()
      if (!value || value === (b.value ?? '')) continue
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

  /**
   * The policies changed of the tools whose rule stays `approval` (UI-CONV-067): each whole. A tool whose rule the owner
   * takes away from `approval` sends none: its policy goes with the rule.
   */
  const changedPolicies = () => {
    const out: Record<string, ApprovalPolicyInput> = {}
    const forms: Record<string, PolicyForm> = {}
    for (const x of tool.tools) {
      const form = x.name ? policies[x.name] : undefined
      if (!x.name || !x.approval || !form || (rules[x.name] ?? x.rule) !== 'approval') continue
      if (!policyChanged(form, x.approval)) continue
      out[x.name] = policyInputOf(form)
      forms[x.name] = form
    }
    return { approvals: out, forms }
  }

  /**
   * Add to <space> (UI-CONV-065, PROF-TOOL-002): the provider chosen for the feature, and for Files the mode chosen
   * (UI-CONV-069, PROF-TOOL-040), the one there is when the provider has one. Its bindings, list and rules are not known
   * before it is in use (the item of a feature with no provider carries none, PROF-TOOL-033): they are set in its panel
   * once the phone confirms.
   */
  const add = () => {
    if (!provider) return
    const location = modeOf(provider.source)
    asked.current = provider.title
    void send('settings', () => hub.addSpaceTool(agent.did, space.id, addInputOf(provider.source, location)), {
      managed: location === 'managed',
    })
  }

  /**
   * The Save of the settings (UI-CONV-050): the bindings, the list (whole, UI-CONV-059), the rules and the approval
   * policies in one request; one that only narrows applies at once ("Saved"), one that grants waits for the phone.
   */
  const saveSettings = () => {
    const source = tool.source
    if (!source) return
    const bindings = checkedBindings()
    if (!bindings) return
    const calls = changedRules()
    const { approvals, forms } = changedPolicies()
    const list = tool.list && listForm && listChanged(listForm, tool.list) ? listForm : null
    const sent = { rules: calls, values: bindings, policies: forms, ...(list ? { list } : {}) }
    if (!Object.keys(bindings).length && !Object.keys(calls).length && !Object.keys(approvals).length && !list) return
    void send(
      'settings',
      () =>
        hub.patchSpaceTool(agent.did, space.id, source, {
          ...(Object.keys(bindings).length ? { bindings } : {}),
          ...(list ? { list: listInputOf(list) } : {}),
          ...(Object.keys(calls).length ? { calls } : {}),
          ...(Object.keys(approvals).length ? { approvals } : {}),
        }),
      sent
    )
  }

  /**
   * Change (UI-CONV-066, PROF-TOOL-034): the provider picked, with the one in use as `replaces`; it waits for the phone,
   * the provider in use staying in force, and in the row and the panel, until the change applies.
   */
  const changeProvider = () => {
    if (!next || !tool.source) return
    const location = modeOf(next)
    asked.current = tool.providers.find((p) => p.source === next)?.title ?? next
    setChanging(false)
    setNext('')
    void send('provider', () => hub.addSpaceTool(agent.did, space.id, providerChangeInputOf(tool, next, location)), {
      managed: location === 'managed',
    })
  }

  /** Empties every field of the account: nothing typed in them is ever shown back. */
  const emptyAccount = () => {
    for (const input of Object.values(accountRefs.current)) if (input) input.value = ''
    setFilled({})
  }

  /**
   * The Save of the account (UI-CONV-050): every field, trimmed and checked against its pattern; one that does not fit
   * keeps its value and shows why, and nothing is sent; else all go in one request, and the fields are emptied.
   */
  const saveAccount = () => {
    const source = tool.source
    if (!source || !accountFields.length || !accountFields.every((f) => filled[f.name])) return
    const { values, refused } = accountValuesOf(
      accountFields,
      Object.fromEntries(accountFields.map((f) => [f.name, accountRefs.current[f.name]?.value ?? '']))
    )
    if (refused.length) {
      setFieldErrors(
        Object.fromEntries(
          accountFields.filter((f) => refused.includes(f.name)).map((f) => [`account.${f.name}`, badTokenWords(f)])
        )
      )
      return
    }
    emptyAccount()
    void send('account', () => hub.setSpaceToolAccount(agent.did, space.id, source, values))
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

  /**
   * Withdraw (PROF-TOOL-005, PROF-TOOL-034): any provider of the feature names its one change, the first choice of a
   * provider included, which no provider in use names yet.
   */
  const withdraw = async () => {
    const from = state.waiting?.from ?? 'loaded'
    const source = tool.source ?? provider?.source
    if (!source) return
    setBusy(true)
    try {
      await hub.withdrawSpaceToolChange(agent.did, space.id, source)
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
  /**
   * In place of the Save that sent it: the code and the time left, and in the managed mode the question the phone asks
   * (UI-CONV-069); then the outcome; or the refusal (UI-CONV-052). A refusal of the mode is said under the choice of
   * the modes while it shows (`modesShown`).
   */
  const status = (from: From, modesShown = false) => (
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
      {state.waiting?.from === from && state.waiting.managed && state.waiting.change.summary ? (
        <p className="tool-pending-question">{state.waiting.change.summary}</p>
      ) : null}
      {state.outcome?.from === from ? (
        <div className="tool-change-outcome" role="status">
          {t(`tools.${state.outcome.key}`)}
        </div>
      ) : null}
      {state.error?.from === from && !(modesShown && state.error.at === 'location') ? (
        <div className="tool-error" role="alert">
          {state.error.text}
        </div>
      ) : null}
    </>
  )
  /** A refusal of the mode, under the choice of the modes (UI-CONV-069). */
  const locationError = (from: From) =>
    state.error?.from === from && state.error.at === 'location' ? state.error.text : null
  const fieldError = (key: string) =>
    fieldErrors[key] ? (
      <span className="field-error" role="alert">
        <CircleAlert size={13} aria-hidden="true" className="field-error-icon" /> {fieldErrors[key]}
      </span>
    ) : null
  const back = (
    <button type="button" className="link" onClick={onBack}>
      <ArrowLeft size={15} aria-hidden="true" /> {t('tools.back')}
    </button>
  )
  const who = (
    <section className="space-section tool-section" aria-label={t('tools.who')}>
      <h4 className="section-label">{t('tools.who')}</h4>
      <p className="rule-line">
        {tool.guests ? t('tools.guests') : t('tools.onlyMembers', { organization: organizationNameOf(agent) })}
      </p>
    </section>
  )
  /** The account a provider's calls run with, before it is added: the agent's, or each person's own (UI-CONV-050). */
  const accountLine = (kind: SpaceToolProvider['account']['kind']) =>
    kind === 'agent' || kind === 'personal' ? (
      <section className="space-section tool-section" aria-label={t('tools.accountTitle')}>
        <h4 className="section-label">{t('tools.accountTitle')}</h4>
        <p className="rule-line">
          {kind === 'agent' ? t('tools.account.agent', { agent: agent.name }) : t('tools.accountPersonal')}
        </p>
      </section>
    ) : null

  if (tool.source === null) {
    // a feature with no provider in use: what Add opens (UI-CONV-065); while the choice of a first provider waits for
    // the phone, its code and Withdraw
    const several = choosesProvider(tool) && !tool.pending && !waiting
    // the two modes of Files for the provider picked, while nothing waits (UI-CONV-069)
    const locations = provider ? locationsFor(tool, provider.source) : []
    const modesShown = !!provider && choosesLocation(locations) && !tool.pending && !waiting
    return (
      <div className="tool-panel">
        <div className="tool-panel-head">
          {back}
          <h3 className="tool-panel-title">
            {several || !provider ? tool.feature.title : sourceNameOf({ title: provider.title, feature: tool.feature })}
          </h3>
          {!several && provider?.description && !waiting ? (
            <p className="muted tool-panel-description">{provider.description}</p>
          ) : null}
          <StateLine agent={agent} tool={tool} />
        </div>
        {status('loaded')}
        {several ? (
          <ProviderChoice
            agent={agent}
            tool={tool}
            providers={tool.providers}
            value={provider?.source ?? ''}
            disabled={busy}
            onChoose={setPicked}
          />
        ) : null}
        {provider && modesShown ? (
          <LocationChoice
            agentName={agent.name}
            feature={tool.feature}
            source={provider.source}
            provider={provider.title}
            locations={locations}
            value={modeOf(provider.source)}
            disabled={busy}
            error={locationError('settings')}
            onChoose={(mode) => setModes((m) => ({ ...m, [provider.source]: mode }))}
          />
        ) : null}
        {provider && state.waiting?.from !== 'loaded' ? accountLine(provider.account.kind) : null}
        {who}
        {provider && state.waiting?.from !== 'loaded' ? (
          <div className="tool-actions">
            {state.waiting?.from === 'settings' ? null : (
              <button
                type="button"
                className="btn primary settings-save"
                disabled={busy || waiting || !adding}
                onClick={add}
              >
                {t('tools.addTo', { space: title })}
              </button>
            )}
            {status('settings', modesShown)}
          </div>
        ) : null}
      </div>
    )
  }
  const source = tool.source

  const ownerBindings = tool.bindings.filter((b) => b.setBy === 'owner')
  const account = tool.account ?? { kind: 'none' as const }
  // the fields of the account: until it is set, and then for Replace
  const typing = !account.set || replacing
  const accountComplete = accountFields.length > 0 && accountFields.every((f) => filled[f.name])
  const date = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso)) : ''
  // while a change waits, only what narrows can be sent: a binding, a token or a looser rule would be refused
  const grantsLocked = waiting
  const conformant = isConformant(tool)
  const toolsShown = conformant ? tool.tools : []
  // the managed folder is the feature's one location, which the owner does not change (UI-CONV-069, PROF-TOOL-041)
  const managed = tool.location === 'managed'
  const hasSettings = ownerBindings.length > 0 || toolsShown.some((x) => x.name) || (!!tool.list && !managed)
  const settingsSave = hasSettings ? (
    <div className="tool-actions">
      {state.waiting?.from === 'settings' ? null : (
        <button type="button" className="btn settings-save" disabled={busy} onClick={saveSettings}>
          {t('tools.save')}
        </button>
      )}
      {status('settings')}
    </div>
  ) : (
    status('settings')
  )

  return (
    <div className="tool-panel">
      <div className="tool-panel-head">
        {back}
        <h3 className="tool-panel-title">{sourceNameOf({ title: tool.title ?? source, feature: tool.feature })}</h3>
        {tool.description ? <p className="muted tool-panel-description">{tool.description}</p> : null}
        <StateLine agent={agent} tool={tool} />
      </div>
      {status('loaded')}

      {tool.bindings.length || tool.list ? (
        <section className="space-section tool-section" aria-label={t('tools.settings')}>
          <h4 className="section-label">{t('tools.settings')}</h4>
          {tool.bindings.map((b) =>
            b.fromAccount ? (
              <BindingFromAccount
                key={b.name}
                agent={agent}
                space={space}
                tool={tool}
                binding={b}
                value={values[b.name] ?? ''}
                disabled={grantsLocked}
                error={fieldError(b.name)}
                onChoose={(value) => setValues((v) => ({ ...v, [b.name]: value }))}
              />
            ) : b.setBy === 'pack' ? (
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
          {/* the managed folder in place of a choice of folder (UI-CONV-070); else the list, in place of the fields of
          the bindings it names (UI-CONV-059) */}
          {managed ? (
            <FolderSection agent={agent} space={space} tool={tool} onTool={onTool} onReload={onReload} />
          ) : tool.list && listForm ? (
            <ListEditor
              agent={agent}
              space={space}
              tool={tool}
              list={tool.list}
              form={listForm}
              locked={grantsLocked}
              errors={listErrors}
              onChange={(next) => {
                setListErrors({ entries: {} })
                setListForm(next)
              }}
            />
          ) : null}
          {toolsShown.length ? null : settingsSave}
        </section>
      ) : null}

      {account.kind === 'agent' ? (
        <section className="space-section tool-section" aria-label={t('tools.accountTitle')}>
          <h4 className="section-label">{t('tools.accountTitle')}</h4>
          <p className="rule-line">{t('tools.account.agent', { agent: agent.name })}</p>
        </section>
      ) : account.kind === 'personal' ? (
        // each member's calls run with their own account: the owner sets none (UI-CONV-050, agent D104)
        <section className="space-section tool-section" aria-label={t('tools.accountTitle')}>
          <h4 className="section-label">{t('tools.accountTitle')}</h4>
          <p className="rule-line">{t('tools.accountPersonal')}</p>
        </section>
      ) : account.kind === 'space' && added ? (
        // a space's account, once the provider is added (UI-CONV-050): before, the agent would answer `409 not-added`
        <section className="space-section tool-section" aria-label={t('tools.accountTitle')}>
          <h4 className="section-label">{t('tools.accountTitle')}</h4>
          <div className="tool-account-status">
            <span className="muted small">
              {account.set
                ? t('tools.accountSetBy', { name: account.setBy?.name ?? '', date: date(account.setAt) })
                : t('tools.notSet')}
            </span>
          </div>
          {typing
            ? accountFields.map((f) => (
                <label key={f.name} className="field">
                  {f.label}
                  <input
                    ref={(input) => {
                      accountRefs.current[f.name] = input
                    }}
                    className="input"
                    type="password"
                    name={`account-${source}-${f.name}`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore="true"
                    data-lpignore="true"
                    placeholder={t('tools.paste', { label: f.label })}
                    disabled={waiting}
                    aria-invalid={fieldErrors[`account.${f.name}`] ? true : undefined}
                    onChange={(e) => {
                      const holds = e.currentTarget.value.trim() !== ''
                      setFilled((all) => (all[f.name] === holds ? all : { ...all, [f.name]: holds }))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveAccount()
                      }
                    }}
                  />
                  {fieldError(`account.${f.name}`)}
                </label>
              ))
            : null}
          <div className="tool-actions">
            {state.waiting?.from === 'account' ? null : typing ? (
              <button
                type="button"
                className="btn account-save"
                disabled={busy || waiting || !accountComplete}
                onClick={saveAccount}
              >
                {t('tools.save')}
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy || waiting} onClick={() => setReplacing(true)}>
                {t('tools.replace')}
              </button>
            )}
            {replacing && account.set ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFieldErrors({})
                  setReplacing(false)
                  setFilled({})
                }}
              >
                {t('app.cancel')}
              </button>
            ) : null}
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
              <span>{t('tools.removeAccountConfirm', { tool: tool.title ?? source })}</span>
              <div className="tool-actions">
                <button type="button" className="btn" onClick={() => setConfirming(null)}>
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  className="btn tool-remove"
                  onClick={() => void narrow('account', () => hub.clearSpaceToolAccount(agent.did, space.id, source))}
                >
                  {t('tools.removeAccount')}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {toolsShown.length ? (
        <section className="space-section tool-section" aria-label={t('tools.asks')}>
          <h4 className="section-label">{t('tools.asks')}</h4>
          <ul className="tool-rules">
            {toolsShown.map((x) => {
              const name = x.name ?? x.title
              const current = rules[name] ?? x.rule
              const form = x.name ? policies[x.name] : undefined
              return (
                <li key={name} className="tool-rule-row">
                  <span className="tool-rule-name">
                    {/* the step-up is the agent-pack's: said after the title, not chosen (UI-CONV-049) */}
                    <span>
                      {x.title}
                      {x.stepUp ? <span className="tool-step-up">{t(`tools.stepUp.${x.stepUp}`)}</span> : null}
                    </span>
                    <span className="muted small">{t(`tools.effect.${x.effect}`)}</span>
                    {/* a policy that needs attention, on the tool's line (UI-CONV-067) */}
                    <AttentionLine policy={x.approval} />
                  </span>
                  <span className="tool-rule-choice">
                    <select
                      className="input"
                      aria-label={x.title}
                      value={current}
                      disabled={busy || !x.name}
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
                  {/* its approval policy, under its rule, while the rule is `approval` (UI-CONV-067) */}
                  {x.name && x.approval && form && current === 'approval' && added ? (
                    <PolicyEditor
                      agent={agent}
                      space={space}
                      toolName={x.name}
                      title={x.title}
                      policy={x.approval}
                      form={form}
                      disabled={busy || state.waiting?.from === 'settings'}
                      error={policyError?.tool === x.name ? policyError : null}
                      onChange={(next) => setPolicies((all) => ({ ...all, [x.name as string]: next }))}
                    />
                  ) : null}
                  {policyError && policyError.tool === name && !x.approval ? (
                    <span className="field-error" role="alert">
                      {policyRefusalText(policyError, agent.name, 1, t)}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {settingsSave}
        </section>
      ) : tool.bindings.length || tool.list ? null : (
        settingsSave
      )}

      {who}

      {canChangeProvider(tool) ? (
        <ChangeProvider
          agent={agent}
          tool={tool}
          space={title}
          changing={changing}
          next={next}
          disabled={busy || (waiting && state.waiting?.from !== 'provider')}
          status={status('provider', changing && !!next && choosesLocation(locationsFor(tool, next)))}
          shown={state.waiting?.from !== 'provider'}
          location={modeOf(next || undefined)}
          locationError={locationError('provider')}
          onLocation={(mode) => setModes((m) => ({ ...m, [next]: mode }))}
          onOpen={() => {
            setChanging(true)
            setNext('')
          }}
          onPick={(source) => {
            setNext(source)
            setState((s) => ({ ...s, error: null }))
          }}
          onCancel={() => {
            setChanging(false)
            setNext('')
          }}
          onChange={changeProvider}
        />
      ) : null}

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
          <span>{t('tools.removeConfirm', { tool: tool.title ?? source, space: title })}</span>
          {/* the folder the agent stops managing, said before the DELETE, which releases it at once (TOOL-FEAT-032) */}
          {folderReleaseWords(tool, agent.name, t) ? (
            <span className="tool-confirm-release">{folderReleaseWords(tool, agent.name, t)}</span>
          ) : null}
          <div className="tool-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              {t('app.cancel')}
            </button>
            <button
              type="button"
              className="btn tool-remove"
              onClick={() => void narrow('remove', () => hub.removeSpaceTool(agent.did, space.id, source), onBack)}
            >
              {t('tools.remove', { space: title })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Change provider (UI-CONV-066, UI-CONV-052), in the panel of a feature whose template allows several: the other
 * providers, shown as Add shows them; once the owner picks one, for Files the two modes where it has both (UI-CONV-069,
 * which the agent asks of a change too), then the question in the page, "Use <new> for <feature> in <space>, in place of
 * <former>?" with its three lines, and Change and Cancel. Change becomes the code, the time left and Withdraw, as any
 * change (UI-CONV-050); Cancel changes nothing.
 */
function ChangeProvider({
  agent,
  tool,
  space,
  changing,
  next,
  disabled,
  status,
  shown,
  location,
  locationError,
  onLocation,
  onOpen,
  onPick,
  onCancel,
  onChange,
}: {
  agent: AgentRecord
  tool: SpaceTool
  /** the space's title, as the question names it */
  space: string
  changing: boolean
  next: string
  disabled: boolean
  /** the code and the time left of the change, then its outcome or its refusal */
  status: ReactNode
  /** false while the change waits: the code stands in place of the control */
  shown: boolean
  /** the mode of Files picked for the new provider (UI-CONV-069), and its refusal */
  location: SpaceToolLocation | null
  locationError: string | null
  onLocation: (location: SpaceToolLocation) => void
  onOpen: () => void
  onPick: (source: string) => void
  onCancel: () => void
  onChange: () => void
}) {
  const { t } = useTranslation()
  const change = next ? providerChangeOf(tool, next) : null
  const locations = next ? locationsFor(tool, next) : []
  const cancel = (
    <button type="button" className="btn" onClick={onCancel}>
      {t('app.cancel')}
    </button>
  )
  return (
    <div className="tool-change-provider">
      <div className="tool-actions">
        {shown && !changing ? (
          <button type="button" className="btn change-provider" disabled={disabled} onClick={onOpen}>
            {t('tools.changeProvider')}
          </button>
        ) : null}
        {status}
      </div>
      {changing ? (
        <>
          <ProviderChoice
            agent={agent}
            tool={tool}
            providers={otherProvidersOf(tool)}
            value={next}
            disabled={disabled}
            onChoose={onPick}
          />
          {change && choosesLocation(locations) ? (
            <LocationChoice
              agentName={agent.name}
              feature={tool.feature}
              source={next}
              provider={change.next}
              locations={locations}
              value={location}
              disabled={disabled}
              error={locationError}
              onChoose={onLocation}
            />
          ) : null}
          {change ? (
            <div
              className="box tool-confirm"
              role="alertdialog"
              aria-label={t('tools.changeQuestion', { ...change, space })}
            >
              <p className="tool-confirm-question">{t('tools.changeQuestion', { ...change, space })}</p>
              <p>{t('tools.changeStops', { agent: agent.name, former: change.former })}</p>
              <p>{t('tools.changeNothingCopied', { former: change.former, next: change.next })}</p>
              <p>{t('tools.changeReadStays', { former: change.former })}</p>
              {/* the folder the agent stops managing, added to the question (UI-CONV-052, TOOL-FEAT-032) */}
              {folderReleaseWords(tool, agent.name, t) ? (
                <p className="tool-confirm-release">{folderReleaseWords(tool, agent.name, t)}</p>
              ) : null}
              <div className="tool-actions">
                {cancel}
                <button type="button" className="btn primary" disabled={disabled} onClick={onChange}>
                  {t('tools.change')}
                </button>
              </div>
            </div>
          ) : (
            <div className="tool-actions">{cancel}</div>
          )}
        </>
      ) : null}
    </div>
  )
}
