/**
 * Tools in a conversation and in a space's About (profile 3.4; agent D96 to D100): the confirmation card of a tool
 * call (UI-CONV-045, UI-CONV-046), the exact action on the requester's card of the approval of one and on its item of
 * the Notifications (UI-APPR-006, agent D114), the sources a reply used in
 * its Info (UI-CONV-047), the sources shown before a conversation is shared (UI-CONV-048), and the tools a space's
 * members read in About, by feature, each with the line of its provider (UI-CONV-031, UI-CONV-049, UI-CONV-065). The
 * cards are the transcript's card (`.card`).
 */
import {
  type AgentRecord,
  type ApprovalStatus,
  accountLineOf,
  accountSourceOf,
  CONVERSATION_DESIGN,
  type ConversationSource,
  canStopAllowing,
  cardStatusOf,
  confirmationOf,
  confirmationOutcomeOf,
  folderLineOf,
  looksLikeJson,
  type MessageSource,
  providerLineOf,
  readyToolsOf,
  requesterNameOf,
  ruleGroupsOf,
  type SpaceInfo,
  type SpaceTool,
  sourceNameOf,
  sourcesOf,
  type ToolAccountKind,
  type ToolAction,
  type ToolRuleGroup,
  type TranscriptMessage,
  toolApprovalOf,
} from '@ayni.org/ayni-ui-core'
import { Ban, Check, Clock, Lock, OctagonX, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { ApprovalStatusIcon, approvalRuleText, approvalStatusWords } from './ApprovalWords.js'
import { Dialog } from './Dialog.js'
import { FolderLines, FolderOpen } from './ManagedFolder.js'

const D = CONVERSATION_DESIGN.toolCard

type Tr = (key: string, options?: Record<string, unknown>) => string

/**
 * The account line of an action (UI-CONV-045, UI-APPR-006, UI-CONV-058): the space's, the agent's, the person's own
 * ("With your account <label>" on their card, "With <requester>'s own account" on an approver's), or none.
 */
function accountLine(
  action: ToolAction,
  agentName: string,
  t: Tr,
  viewer: 'own' | 'approver' = 'own',
  requester = ''
): string {
  const line = accountLineOf(action.account, viewer)
  if (!line) return ''
  switch (line.key) {
    case 'accountSpace':
      return t('tools.card.accountSpace', { space: line.space })
    case 'accountAgent':
      return t('tools.card.accountAgent', { agent: agentName })
    case 'accountYours':
      return t('tools.card.accountYours', { label: line.label })
    case 'accountRequester':
      return t('tools.card.accountRequester', { requester })
    default:
      return t('tools.card.accountOwn')
  }
}

/**
 * The exact action (UI-CONV-045, UI-APPR-006): the source in small muted words, named "<feature> · <source>"
 * (UI-CONV-064), the action's title in bold, the account in a muted line, the addresses outside the organization the
 * call would reach (`outsideOrganization`), the amber notice of untrusted content, then every field whole, the pinned
 * ones first with a lock. Nothing is cut, folded or reworded. Once the message that asked for it was deleted, a line
 * says the details went.
 */
export function ToolActionView({
  action,
  agentName,
  untrusted,
  titled = true,
  viewer = 'own',
  requester = '',
}: {
  action: ToolAction
  agentName: string
  untrusted?: string[]
  /** false when the card already gave the action's title a line of its own (UI-APPR-006) */
  titled?: boolean
  /** whose card it is: the person who asked, or an approver, who reads whose own account it uses (UI-APPR-006) */
  viewer?: 'own' | 'approver'
  requester?: string
}) {
  const { t } = useTranslation()
  const account = accountLine(action, agentName, t, viewer, requester)
  return (
    <>
      <div className="tool-source">{sourceNameOf(action.source)}</div>
      {titled ? <h3 className="tool-title">{action.title}</h3> : null}
      {account ? <div className="tool-account">{account}</div> : null}
      {action.outsideOrganization && !action.erased ? (
        <div className="tool-outside">
          {t('tools.card.outsideOrganization', { addresses: action.outsideOrganization.join(', ') })}
        </div>
      ) : null}
      {untrusted && !action.erased ? (
        <div className="untrusted-notice" role="note">
          <TriangleAlert
            size={CONVERSATION_DESIGN.untrustedNotice.iconSize}
            aria-hidden="true"
            className="untrusted-icon"
          />
          <span>{t('tools.card.untrusted', { sources: untrusted.join(', ') })}</span>
        </div>
      ) : null}
      {action.erased ? (
        <div className="tool-erased">{t('tools.card.erased')}</div>
      ) : action.fields.length ? (
        <dl className="tool-fields">
          {action.fields.map((f, i) => (
            <div key={`${f.label}-${i}`} className="tool-field">
              <dt>
                {f.pinned ? (
                  <span className="tool-lock" title={t('tools.card.pinned', { agent: agentName })}>
                    <Lock size={D.lockIconSize} aria-hidden="true" />
                    <span className="sr-only">{t('tools.card.pinned', { agent: agentName })}: </span>
                  </span>
                ) : null}
                {f.label}
              </dt>
              <dd className={looksLikeJson(f.value) ? 'mono-value' : undefined}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  )
}

/** The words of a confirmation's outcome (UI-CONV-045, UI-CONV-046). */
const OUTCOME_KEYS = {
  allowed: 'tools.card.allowed',
  allowedForConversation: 'tools.card.allowedConversation',
  allowanceStopped: 'tools.card.stopped',
  refused: 'tools.card.refused',
  expired: 'tools.card.expired',
  cancelled: 'tools.card.cancelled',
} as const

function OutcomeIcon({ outcome }: { outcome: keyof typeof OUTCOME_KEYS }) {
  const size = 15
  if (outcome === 'refused') return <OctagonX size={size} aria-hidden="true" className="tool-outcome-icon" />
  if (outcome === 'expired') return <Clock size={size} aria-hidden="true" className="tool-outcome-icon" />
  if (outcome === 'cancelled') return <Ban size={size} aria-hidden="true" className="tool-outcome-icon" />
  return <Check size={size} aria-hidden="true" className="tool-outcome-icon" />
}

/**
 * The confirmation card of a tool call (UI-CONV-045, UI-CONV-046, PROF-TOOL-007/008/012), on the agent's side of the
 * transcript, the same on every device of the person: the exact action, then Allow, Allow for this conversation (when
 * offered) and Refuse while it waits, and the outcome once decided; Stop allowing while an allowance lasts.
 */
export function ConfirmationCard({
  sessionId,
  content,
  agentName,
}: {
  sessionId: string
  content: Record<string, unknown>
  agentName: string
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const [notSent, setNotSent] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [notStopped, setNotStopped] = useState(false)
  const card = confirmationOf(content)
  if (!card) return null
  const outcome = confirmationOutcomeOf(card)
  const decide = async (decision: 'approve' | 'reject', scope?: 'conversation') => {
    setSending(true)
    setNotSent(false)
    try {
      await hub.decideConfirmation(sessionId, card.approvalId, decision, scope)
    } catch {
      setNotSent(true)
    } finally {
      setSending(false)
    }
  }
  const stop = async () => {
    setStopping(true)
    setNotStopped(false)
    try {
      await hub.stopAllowing(sessionId, card.approvalId)
    } catch {
      setNotStopped(true)
    } finally {
      setStopping(false)
    }
  }
  return (
    <section
      className="card tool-card confirmation"
      data-status={card.status}
      aria-label={t('tools.card.label', { title: card.action.title, source: sourceNameOf(card.action.source) })}
    >
      <ToolActionView action={card.action} agentName={agentName} untrusted={card.untrusted} />
      {outcome === 'pending' ? (
        <>
          <div className="actions">
            <button type="button" className="btn primary" disabled={sending} onClick={() => void decide('approve')}>
              {t('tools.card.allow')}
            </button>
            {card.allowForConversation ? (
              <button
                type="button"
                className="btn"
                disabled={sending}
                onClick={() => void decide('approve', 'conversation')}
              >
                {t('tools.card.allowConversation')}
              </button>
            ) : null}
            <button type="button" className="btn" disabled={sending} onClick={() => void decide('reject')}>
              {t('tools.card.refuse')}
            </button>
          </div>
          {notSent ? (
            <div className="tool-error" role="alert">
              {t('tools.card.notSent')}
            </div>
          ) : null}
        </>
      ) : (
        <div className="tool-outcome" role="status">
          <OutcomeIcon outcome={outcome} />
          <span>{t(OUTCOME_KEYS[outcome])}</span>
          {canStopAllowing(card) ? (
            <button type="button" className="link stop-allowing" disabled={stopping} onClick={() => void stop()}>
              {t('tools.card.stopAllowing')}
            </button>
          ) : null}
        </div>
      )}
      {notStopped ? (
        <div className="tool-error" role="alert">
          {t('tools.card.notStopped')}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The approval of a tool call (UI-APPR-006, PROF-TOOL-009): the requester's one card, in the conversation where they
 * asked. "Waiting for <owner>'s approval" for a tool of a space, "Waiting for approval" for any other, then the
 * action's title and the space's, each on a line of its own, and the exact action as the confirmation card shows it,
 * with Cancel while it waits. Each later status replaces the waiting line in place with the outcome, in the words of
 * UI-CONV-052 ("Approved by Jonas Weber"): never a second card. No title's case is changed to fit it in a sentence.
 * An approver's request is never a card in a conversation (UI-APPR-001): it is in their Notifications.
 */
export function ToolApprovalCard({
  sessionId,
  content,
}: {
  sessionId: string
  content: Record<string, unknown> & { own?: boolean; grantExpiresAt?: string }
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t, i18n } = useTranslation()
  const [sending, setSending] = useState(false)
  const [notSent, setNotSent] = useState(false)
  const approval = toolApprovalOf(content)
  if (!approval) return null
  const session = snap.sessions.find((s) => s.sessionId === sessionId)
  const agent = snap.agents.find((a) => a.did === session?.agentDid)
  const agentName = agent?.name ?? ''
  const status = (typeof content.status === 'string' ? content.status : 'PENDING') as ApprovalStatus
  const approvalId = typeof content.approvalId === 'string' ? content.approvalId : ''
  const requester = requesterNameOf(content)
  const { action, space } = approval
  const owner = space
    ? snap.spaces[agent?.did ?? '']?.spaces.find((x) => x.id === space.id)?.owner?.name || undefined
    : undefined
  const line = cardStatusOf(content, owner)
  const words = approvalStatusWords(line, t, i18n.language, Date.now())
  const pending = status === 'PENDING'
  const expiresAt = typeof content.expiresAt === 'string' ? content.expiresAt : undefined
  const cancel = async () => {
    setSending(true)
    setNotSent(false)
    try {
      await hub.cancelApproval(sessionId, approvalId)
    } catch {
      setNotSent(true)
    } finally {
      setSending(false)
    }
  }
  return (
    <section className="card tool-card tool-approval" data-status={status} aria-label={words}>
      <div className="tool-approval-head" role={pending ? undefined : 'status'}>
        <ApprovalStatusIcon line={line} />
        <span>{words}</span>
      </div>
      <h3 className="tool-title">{action.title}</h3>
      {space ? <div className="tool-approval-space">{space.title}</div> : null}
      <ToolActionView action={action} agentName={agentName} titled={false} viewer="own" requester={requester} />
      {content.grantExpiresAt ? (
        <div className="muted">
          {t('approval.grantUntil', { time: formatTime(content.grantExpiresAt, i18n.language) })}
        </div>
      ) : null}
      {pending && expiresAt ? (
        <div className="muted">{t('approval.expires', { time: formatTime(expiresAt, i18n.language) })}</div>
      ) : null}
      {pending && content.own && approvalId ? (
        <div className="actions">
          <button type="button" className="btn" disabled={sending} onClick={() => void cancel()}>
            {t('approval.cancel')}
          </button>
        </div>
      ) : null}
      {notSent ? (
        <div className="tool-error" role="alert">
          {t('tools.card.notSent')}
        </div>
      ) : null}
    </section>
  )
}

/**
 * One source a reply used, in the words of its Info (UI-CONV-047): named "<feature> · <source>" (UI-CONV-064), with
 * whose account, none for `none`. The person's own account is "your own account", and in a conversation shared with
 * the space, its author's (`author`).
 */
export function sourceWords(source: MessageSource, agentName: string, t: Tr, author?: string): string {
  const name = sourceNameOf(source)
  if (source.account === 'space') return t('tools.sources.space', { source: name })
  if (source.account === 'agent') return t('tools.sources.agent', { source: name, agent: agentName })
  if (source.account === 'personal')
    return author
      ? t('tools.sources.personalOf', { source: name, author })
      : t('tools.sources.personal', { source: name })
  return name
}

/**
 * The sources a reply used, in its Info (UI-CONV-047): read from history when the reply came live (against an agent
 * that serves tools); nothing for a reply that used none, and nothing claimed before history says.
 */
export function MessageSources({
  sessionId,
  message,
  agent,
  author,
}: {
  sessionId?: string
  message: TranscriptMessage
  agent: AgentRecord
  /** in a conversation shared with the space: its author, whose own accounts its replies read */
  author?: string
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const sources = sourcesOf(message)
  const unknown = sources === undefined && message.role === 'assistant' && !!sessionId && hub.takesTools(agent.did)
  useEffect(() => {
    if (!unknown || !sessionId) return
    void hub.readUsage(sessionId, message.id).catch(() => false)
  }, [unknown, sessionId, message.id, hub])
  if (!sources?.length) return null
  return (
    <>
      <dt className="info-term">{t('details.sources')}</dt>
      <dd className="info-desc sources">{sources.map((s) => sourceWords(s, agent.name, t, author)).join(' · ')}</dd>
    </>
  )
}

/** One source a conversation holds, before sharing it (UI-CONV-048), named "<feature> · <source>" (UI-CONV-064). */
function shareLine(source: ConversationSource, agentName: string, t: Tr): string {
  const kind = source.account.kind
  return t(`tools.share.${kind}`, { source: sourceNameOf(source), agent: agentName, count: source.results })
}

/**
 * Before sharing a conversation with its space (UI-CONV-048): where its tool results came from, and the person
 * decides. Share shares it; Cancel, Escape or a press outside leave it as it was.
 */
export function ShareSourcesDialog({
  space,
  agentName,
  sources,
  onShare,
  onCancel,
}: {
  space: string
  agentName: string
  sources: ConversationSource[]
  onShare: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog title={t('tools.share.title', { space })} onClose={onCancel}>
      <p className="share-holds">{t('tools.share.holds')}</p>
      <ul className="share-sources">
        {sources.map((s) => (
          <li key={`${s.source}:${s.account.kind}:${s.account.space?.id ?? ''}`}>{shareLine(s, agentName, t)}</li>
        ))}
      </ul>
      <p className="share-members">{t('tools.share.members', { space })}</p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('app.cancel')}
        </button>
        <button type="button" className="btn primary" onClick={onShare}>
          {t('tools.share.share')}
        </button>
      </div>
    </Dialog>
  )
}

/**
 * A group of a source's tools in About (UI-CONV-049): the rule's words, a colon, and the titles, each followed by its
 * step-up ("Needs Jonas Weber's approval: Delete note, then a check on your phone"). The rule `approval` reads its
 * policy (profile 3.5.4): "Needs your approval" for the one person it names when that is the reader, never their own
 * name, or "Needs 2 approvals: Jonas Weber (required), Marta Kova". From an agent that gives no policy, the owner
 * approves, as before.
 */
function groupWords(
  group: ToolRuleGroup,
  space: Pick<SpaceInfo, 'owner' | 'role'>,
  me: string | undefined,
  t: Tr
): string {
  const isOwner = space.role === 'owner'
  const rule =
    group.rule !== 'approval'
      ? t(`tools.rule.${group.rule}`)
      : group.approval
        ? approvalRuleText(group.approval, { name: me, isOwner }, t)
        : isOwner
          ? t('tools.rule.approvalYou')
          : space.owner
            ? t('tools.rule.approval', { name: space.owner.name })
            : t('tools.ownerRule.approval')
  const titles = group.tools.map((x) => `${x.title}${x.stepUp ? t(`tools.stepUp.${x.stepUp}`) : ''}`)
  return `${rule}: ${titles.join(', ')}`
}

/**
 * Whose account a provider's calls use, in the words of UI-CONV-049: "Uses the space's account", "Uses <agent>'s
 * account", "Each person uses their own account"; nothing for `none`.
 */
export function accountWords(kind: ToolAccountKind, agentName: string, t: Tr): string {
  if (kind === 'space') return t('tools.account.space')
  if (kind === 'agent') return t('tools.account.agent', { agent: agentName })
  if (kind === 'personal') return t('tools.account.personal')
  return ''
}

/**
 * The line of a feature's provider (UI-CONV-065, UI-CONV-060, UI-CONV-052), on its row of Tools and in About: "Nextcloud
 * · Folders: /Projects/Alpha · Uses the space's account", what it is bound to and whose account left out when there is
 * none; "Choose a provider" for a feature with none.
 */
export function providerLineWords(tool: SpaceTool, agentName: string, t: Tr): string {
  const line = providerLineOf(tool)
  if (!line) return t('tools.chooseProvider')
  return [
    line.provider,
    ...line.bindings.map((b) => t('tools.boundTo', { label: b.label, value: b.value })),
    ...(line.list ? [t('tools.boundTo', { label: line.list.label, value: line.list.values.join(', ') })] : []),
    ...(line.account ? [accountWords(line.account, agentName, t)] : []),
  ].join(' · ')
}

/** The tools of a space as its members read them, live: re-read when a change of them is announced. */
export function useSpaceTools(
  agent: AgentRecord,
  space: SpaceInfo,
  wanted: boolean
): {
  tools: SpaceTool[] | null
  error: string
  reload: () => void
  setTool: (tool: SpaceTool) => void
} {
  const hub = useHub()
  const snap = useSnapshot()
  const [tools, setTools] = useState<SpaceTool[] | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const announced = snap.toolChanges.filter((c) => c.agentDid === agent.did && c.change.spaceId === space.id)
  const lastAnnounced = announced[announced.length - 1]?.n ?? 0
  // the reader's own account connected or ended changes `connected`, and the owner's accounts the choices of a
  // binding (PROF-TOOL-021): the list is read again
  const accounts = snap.connectionChanges.filter((c) => c.agentDid === agent.did)
  const lastAccount = accounts[accounts.length - 1]?.n ?? 0
  useEffect(() => {
    if (!wanted) return
    let live = true
    hub
      .spaceTools(agent.did, space.id)
      .then((list) => {
        if (!live) return
        setTools(list)
        setError('')
      })
      .catch((e) => live && setError(String((e as Error).message)))
    return () => {
      live = false
    }
  }, [agent.did, space.id, wanted, hub, lastAnnounced, lastAccount, version])
  return {
    tools: wanted ? tools : null,
    error,
    reload: () => setVersion((v) => v + 1),
    // one item per feature (PROF-TOOL-033): an answer replaces its feature's, whichever provider it names
    setTool: (tool) => setTools((list) => (list ?? []).map((x) => (x.feature.id === tool.feature.id ? tool : x))),
  }
}

/**
 * The tools a space's members read in About (UI-CONV-031, UI-CONV-049, UI-CONV-065): its `ready` features, in the
 * template's order, each with its title, the line of its provider (its title, what it is bound to with the line of its
 * list, whose account it uses), the provider's description, the reader's own account of a provider of each person's
 * account, and what its tools ask before they act, grouped by rule; a tool `off` is not shown. Against an agent that
 * serves tools only, and when the space has a ready one. Files in the managed mode (UI-CONV-070) reads its folder's line
 * with "Open in <provider>", to the owner its state and the members without access, and to a member whose access is not
 * in place "No access yet. <agent> is giving you access to this space's folder."
 */
export function AboutTools({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  // the name the agent shows of the reader, so that a policy naming them alone reads "Needs your approval"
  const me = snap.sessions.find((s) => s.agentDid === agent.did && s.principal?.displayName)?.principal?.displayName
  const wanted = hub.takesTools(agent.did) && space.kind !== 'personal' && space.state === 'active'
  const { tools } = useSpaceTools(agent, space, wanted)
  const ready = readyToolsOf(tools ?? [])
  if (!ready.length) return null
  return (
    <section className="space-section about-tools">
      <h3 className="section-label">{t('tools.aboutTitle', { agent: agent.name })}</h3>
      <ul className="about-tool-list">
        {ready.map((tool) => {
          const groups = ruleGroupsOf(tool)
          const folder = folderLineOf(tool)
          return (
            <li key={tool.feature.id} className="about-tool">
              <span className="about-tool-title">{tool.feature.title}</span>
              <span className="about-tool-provider">{providerLineWords(tool, agent.name, t)}</span>
              <FolderLines agentName={agent.name} tool={tool} lineClass="about-tool-folder" />
              {folder ? <FolderOpen line={folder} className="about-tool-open" /> : null}
              {tool.description ? <span className="about-tool-description">{tool.description}</span> : null}
              {tool.account?.kind === 'personal' ? (
                // the reader's own account of it, for this space; Connect opens Your accounts there (UI-CONV-049)
                <span className="about-tool-yours">
                  {tool.account.connected ? t('tools.yourAccount.connected') : t('tools.yourAccount.notConnected')}
                  {!tool.account.connected && hub.takesConnections(agent.did) ? (
                    <button
                      type="button"
                      className="link about-tool-connect"
                      onClick={() => hub.openAccounts(agent.did, { source: accountSourceOf(tool), spaceId: space.id })}
                    >
                      {t('accounts.connect')}
                    </button>
                  ) : null}
                </span>
              ) : null}
              {groups.length ? (
                <span className="about-tool-rules">
                  {groups.map((g, i) => (
                    <span key={`${g.rule}-${i}`}>
                      {i ? ' · ' : ''}
                      {groupWords(g, space, me, t)}
                    </span>
                  ))}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
