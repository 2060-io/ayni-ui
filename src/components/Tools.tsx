/**
 * Tools in a conversation and in a space's About (profile 3.4; agent D96 to D100): the confirmation card of a tool
 * call (UI-CONV-045, UI-CONV-046), the exact action on the approval of one (UI-APPR-006), the sources a reply used in
 * its Info (UI-CONV-047), the sources shown before a conversation is shared (UI-CONV-048), and the tools a space's
 * members read in About (UI-CONV-031, UI-CONV-049). The cards are the transcript's card (`.card`).
 */
import {
  type AgentRecord,
  type ApprovalStatus,
  CONVERSATION_DESIGN,
  type ConversationSource,
  canStopAllowing,
  confirmationOf,
  confirmationOutcomeOf,
  looksLikeJson,
  type MessageSource,
  readyToolsOf,
  requesterNameOf,
  ruleGroupsOf,
  type SpaceInfo,
  type SpaceTool,
  sourcesOf,
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
import { Dialog } from './Dialog.js'

const D = CONVERSATION_DESIGN.toolCard

type Tr = (key: string, options?: Record<string, unknown>) => string

/** The account line of an action (UI-CONV-045): the space's, the agent's, or none. */
function accountLine(action: ToolAction, agentName: string, t: Tr): string {
  if (action.account.kind === 'space') return t('tools.card.accountSpace', { space: action.account.space?.title ?? '' })
  if (action.account.kind === 'agent') return t('tools.card.accountAgent', { agent: agentName })
  return ''
}

/**
 * The exact action (UI-CONV-045, UI-APPR-006): the source in small muted words, the action's title in bold, the account
 * in a muted line, the amber notice of untrusted content, then every field whole, the pinned ones first with a lock.
 * Nothing is cut, folded or reworded. Once the message that asked for it was deleted, a line says the details went.
 */
export function ToolActionView({
  action,
  agentName,
  untrusted,
}: {
  action: ToolAction
  agentName: string
  untrusted?: string[]
}) {
  const { t } = useTranslation()
  const account = accountLine(action, agentName, t)
  return (
    <>
      <div className="tool-source">{action.source.title}</div>
      <h3 className="tool-title">{action.title}</h3>
      {account ? <div className="tool-account">{account}</div> : null}
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
      aria-label={t('tools.card.label', { title: card.action.title, source: card.action.source.title })}
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
 * The approval of a tool call (UI-APPR-006, PROF-TOOL-009): the exact action as the confirmation card shows it, and
 * the space. To the approver, "<requester> asks to <action> in <space>" with Approve and Reject and the optional
 * note; to the requester, "Waiting for <approver>'s approval" with Cancel. It follows `ayni.approval.update`.
 */
export function ToolApprovalCard({
  sessionId,
  content,
}: {
  sessionId: string
  content: Record<string, unknown> & { canDecide?: boolean; own?: boolean; grantExpiresAt?: string }
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t, i18n } = useTranslation()
  const [note, setNote] = useState('')
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
    ? snap.spaces[agent?.did ?? '']?.spaces.find((x) => x.id === space.id)?.owner.name || undefined
    : undefined
  const heading = content.canDecide
    ? space
      ? t('approval.asksIn', { requester, action: action.title, space: space.title })
      : t('approval.asks', { requester, action: action.title })
    : owner
      ? t('approval.waitingFor', { approver: owner })
      : t('approval.waiting')
  const expiresAt = typeof content.expiresAt === 'string' ? content.expiresAt : undefined
  return (
    <section className="card tool-card tool-approval" data-status={status} aria-label={heading}>
      <div className="tool-approval-head">{heading}</div>
      {space && !content.canDecide ? <div className="tool-account">{`${t('spaces.in')} ${space.title}`}</div> : null}
      <ToolActionView action={action} agentName={agentName} />
      <div className="row">
        <span>{t('approval.title')}</span>
        <span>{t(`approval.status.${status}`)}</span>
      </div>
      {content.grantExpiresAt ? (
        <div className="muted">
          {t('approval.grantUntil', { time: formatTime(content.grantExpiresAt, i18n.language) })}
        </div>
      ) : null}
      {status === 'PENDING' && expiresAt ? (
        <div className="muted">{t('approval.expires', { time: formatTime(expiresAt, i18n.language) })}</div>
      ) : null}
      {status === 'PENDING' && content.canDecide && approvalId ? (
        <>
          <input
            className="input"
            placeholder={t('approval.note')}
            aria-label={t('approval.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                void hub.act(sessionId, {
                  kind: 'approval.decide',
                  approvalId,
                  decision: 'approve',
                  note: note || undefined,
                })
              }
            >
              {t('approval.approve')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void hub.act(sessionId, {
                  kind: 'approval.decide',
                  approvalId,
                  decision: 'reject',
                  note: note || undefined,
                })
              }
            >
              {t('approval.reject')}
            </button>
          </div>
        </>
      ) : null}
      {status === 'PENDING' && content.own && approvalId ? (
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => void hub.act(sessionId, { kind: 'approval.cancel', approvalId })}
          >
            {t('approval.cancel')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** One source a reply used, in the words of its Info (UI-CONV-047): with whose account, none for `none`. */
export function sourceWords(source: MessageSource, agentName: string, t: Tr): string {
  if (source.account === 'space') return t('tools.sources.space', { source: source.title })
  if (source.account === 'agent') return t('tools.sources.agent', { source: source.title, agent: agentName })
  return source.title
}

/**
 * The sources a reply used, in its Info (UI-CONV-047): read from history when the reply came live (against an agent
 * that serves tools); nothing for a reply that used none, and nothing claimed before history says.
 */
export function MessageSources({
  sessionId,
  message,
  agent,
}: {
  sessionId?: string
  message: TranscriptMessage
  agent: AgentRecord
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
      <dd className="info-desc sources">{sources.map((s) => sourceWords(s, agent.name, t)).join(' · ')}</dd>
    </>
  )
}

/** One source a conversation holds, before sharing it (UI-CONV-048). */
function shareLine(source: ConversationSource, agentName: string, t: Tr): string {
  const kind = source.account.kind === 'space' ? 'space' : source.account.kind === 'agent' ? 'agent' : 'none'
  return t(`tools.share.${kind}`, { source: source.title, agent: agentName, count: source.results })
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

/** A group of a source's tools in About (UI-CONV-049): "Asks you first: Add a note, Add a task". */
function groupWords(group: ToolRuleGroup, owner: string, t: Tr): string {
  const rule = t(`tools.rule.${group.rule}`, { owner })
  const stepUp = group.stepUp ? t(`tools.stepUp.${group.stepUp}`) : ''
  return `${rule}: ${group.titles.join(', ')}${stepUp}`
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
  }, [agent.did, space.id, wanted, hub, lastAnnounced, version])
  return {
    tools: wanted ? tools : null,
    error,
    reload: () => setVersion((v) => v + 1),
    setTool: (tool) => setTools((list) => (list ?? []).map((x) => (x.source === tool.source ? tool : x))),
  }
}

/**
 * The tools a space's members read in About (UI-CONV-031, UI-CONV-049): its `ready` sources, each with its title,
 * description, whose account it uses and what its tools ask before they act, grouped by rule; a tool `off` is not
 * shown. Against an agent that serves tools only, and when the space has a ready one.
 */
export function AboutTools({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const { t } = useTranslation()
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
          return (
            <li key={tool.source} className="about-tool">
              <span className="about-tool-title">{tool.title}</span>
              {tool.description ? <span className="about-tool-description">{tool.description}</span> : null}
              {tool.account.kind !== 'none' ? (
                <span className="about-tool-account">
                  {tool.account.kind === 'space'
                    ? t('tools.account.space')
                    : t('tools.account.agent', { agent: agent.name })}
                </span>
              ) : null}
              {groups.length ? (
                <span className="about-tool-rules">
                  {groups.map((g, i) => (
                    <span key={`${g.rule}-${g.stepUp ?? ''}`}>
                      {i ? ' · ' : ''}
                      {groupWords(g, space.owner.name, t)}
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
