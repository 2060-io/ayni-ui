/**
 * Spaces in the column and in a conversation (UI-CONV-028..030, UI-CONV-039): the rows of the agent's card, the grey
 * chip of the header, the chip above the message form of an empty conversation with its chooser, and New space.
 */
import {
  type AgentRecord,
  chooserSpacesOf,
  hasOtherSpace,
  isPersonsMessage,
  membersLineOf,
  notificationsWaitingOf,
  ProfileError,
  personalSpaceOf,
  type SessionRecord,
  type SpaceDetail,
  type SpaceInfo,
  type SpaceKind,
  type SpaceRef,
  type SpaceTemplate,
  showsHeaderChip,
  showsSpaceChooser,
  spaceRefOf,
  spaceRowsOf,
  spacesWithLocal,
} from '@ayni.org/ayni-ui-core'
import { Building2, Check, ChevronDown, Plus, User, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { NotificationsBadge } from './ApprovalWords.js'
import { Dialog } from './Dialog.js'

const KIND_ICON = { personal: User, team: Users, organization: Building2 }

type T = (key: string, options?: Record<string, unknown>) => string

export function SpaceIcon({ kind, size = 16 }: { kind: SpaceKind; size?: number }) {
  const Icon = KIND_ICON[kind] ?? Users
  return <Icon size={size} aria-hidden="true" />
}

/** A space's title as the person reads it: Personal in the UI's own word (profile §3.7). */
export function spaceTitle(space: Pick<SpaceInfo, 'kind' | 'title'> | undefined, t: T): string {
  if (!space) return ''
  return space.kind === 'personal' ? t('spaces.personal') : space.title
}

/** How long a space keeps its conversations, for the chip and the chooser: "kept 365 days". */
export function chipRules(space: Pick<SpaceInfo, 'rules'>, t: T): string {
  const days = space.rules.retentionDays
  return days === null ? t('spaces.chipKeptForever') : t('spaces.chipKept', { count: days })
}

/** The organization behind the agent, for "<organization> employee list" (UI-CONV-040). */
export function organizationNameOf(agent: AgentRecord | undefined): string {
  return agent?.trust.operator?.name || agent?.name || ''
}

/** A space's members in a few words: "5 members", "By rule", "Only you" (UI-CONV-028). */
export function membersShort(space: Pick<SpaceInfo, 'kind' | 'membership'>, t: T): string {
  const line = membersLineOf(space)
  if (line.kind === 'personal') return t('spaces.onlyYou')
  return line.kind === 'list' ? t('spaces.members', { count: line.count }) : t('spaces.byRule')
}

/** A space's members in words (UI-CONV-031): the rule with its count, or the list with its keeper. */
export function membersLong(space: SpaceInfo, organization: string, t: T): string {
  const line = membersLineOf(space)
  switch (line.kind) {
    case 'personal':
      return t('spaces.onlyYou')
    case 'list':
      return space.owner
        ? t('spaces.listKept', { count: line.count, name: space.owner.name })
        : t('spaces.members', { count: line.count })
    case 'department':
      return t('spaces.ruleDepartment', { count: line.count, name: line.name })
    case 'group':
      return t('spaces.ruleGroup', { count: line.count, name: line.name })
    case 'organization':
      return t('spaces.ruleOrganization', { count: line.count, name: organization })
    default:
      return t('spaces.ruleOther', { count: line.count })
  }
}

/** The models a space allows, in a line. */
export function modelsLine(space: Pick<SpaceInfo, 'rules'>, t: T): string {
  return space.rules.allowedProviders.length
    ? t('spaces.models', { providers: space.rules.allowedProviders.join(', ') })
    : t('spaces.noModels')
}

/**
 * The space of a conversation: the one its state names (PROF-STREAM-009), else the one the agent's list gives it,
 * else Personal once the list is known.
 */
export function spaceOfSession(session: SessionRecord, spaces: readonly SpaceInfo[]): SpaceRef | undefined {
  const fromState = spaceRefOf(session.ayni)
  if (fromState) return fromState
  const listed = spaces.find((s) => s.id === session.spaceId) ?? (session.spaceId ? undefined : personalSpaceOf(spaces))
  return listed ? { id: listed.id, title: listed.title, kind: listed.kind } : undefined
}

/** The rows of the agent's card (UI-CONV-028): the spaces with the latest activity, then "N more spaces". */
export function SpaceRows({ agent, query }: { agent: AgentRecord; query: string }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [all, setAll] = useState(false)
  const data = snap.spaces[agent.did]
  if (!data || !hasOtherSpace(data.spaces)) return null
  const spaces = spacesWithLocal(
    data.spaces,
    snap.sessions.filter((s) => s.agentDid === agent.did)
  )
  const { rows, more } = spaceRowsOf(spaces, query)
  if (query.trim() && !rows.length) return null
  const shown = all ? [...rows, ...more] : rows
  return (
    <div className="space-rows">
      <div className="section-label">{t('spaces.label')}</div>
      {shown.map((space) => {
        const selected = snap.view === 'space' && snap.spaceFor?.spaceId === space.id
        return (
          <button
            key={space.id}
            type="button"
            className={['space-row', selected ? 'selected' : ''].join(' ')}
            aria-current={selected ? 'true' : undefined}
            onClick={() => hub.openSpace(agent.did, space.id)}
          >
            <span className="space-tile">
              <SpaceIcon kind={space.kind} />
            </span>
            <span className="space-text">
              <span className="space-name">{space.title}</span>
              <span className="space-sub">
                {space.state === 'left'
                  ? t('spaces.state.left')
                  : [
                      membersShort(space, t),
                      space.lastActivityAt ? formatTime(space.lastActivityAt, i18n.language) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </span>
            {/* the space's notifications that wait for the person, beside its unread messages (PROF-TOOL-025) */}
            <span className="space-counts">
              {hub.takesNotifications(agent.did) ? (
                <NotificationsBadge count={notificationsWaitingOf(space)} bell />
              ) : null}
              {space.unread ? <span className="count">{space.unread}</span> : null}
            </span>
          </button>
        )
      })}
      {more.length ? (
        <button type="button" className="space-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t('spaces.fewer') : t('spaces.more', { count: more.length })}
        </button>
      ) : null}
    </div>
  )
}

/** The grey chip of the header: the conversation's space, which opens its page (UI-CONV-030). */
export function SpaceHeaderChip({ session }: { session: SessionRecord }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const spaces = snap.spaces[session.agentDid]?.spaces ?? []
  const space = spaceOfSession(session, spaces)
  if (!space || !showsHeaderChip(space, spaces)) return null
  const title = spaceTitle(space, t)
  return (
    <button
      type="button"
      className="space-chip"
      aria-label={t('spaces.headerChip', { space: title })}
      onClick={() => hub.openSpace(session.agentDid, space.id)}
    >
      <SpaceIcon kind={space.kind} size={13} />
      <span className="ellipsis">{title}</span>
    </button>
  )
}

/**
 * Above the message form of an empty conversation (UI-CONV-029): "In <space> · kept 365 days", which opens the
 * chooser, until the person's first message. Shown once the person has another space or may create one.
 */
export function SpaceComposerChip({ session, agent }: { session: SessionRecord; agent: AgentRecord }) {
  const snap = useSnapshot()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const data = snap.spaces[agent.did]
  if (!data || !showsSpaceChooser(data)) return null
  if (session.state !== 'bound' || !session.conversationId) return null
  if ((snap.transcripts[session.sessionId]?.messages ?? []).some(isPersonsMessage)) return null
  const ref = spaceOfSession(session, data.spaces)
  const space = data.spaces.find((s) => s.id === ref?.id) ?? personalSpaceOf(data.spaces)
  if (!space) return null
  const title = spaceTitle(space, t)
  const rules = chipRules(space, t)
  return (
    <>
      <div className="space-chip-line">
        <span>{t('spaces.in')}</span>
        <button
          type="button"
          className="space-chip lg"
          aria-haspopup="dialog"
          aria-label={t('spaces.chipLabel', { space: title, rules })}
          onClick={() => setOpen(true)}
        >
          <SpaceIcon kind={space.kind} size={14} />
          <span className="ellipsis">{title}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <span className="muted">· {rules}</span>
      </div>
      {open ? <SpaceChooser agent={agent} session={session} current={space} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

/** The chooser (UI-CONV-029): the spaces the person is active in, the current one marked, New space at the end. */
function SpaceChooser({
  agent,
  session,
  current,
  onClose,
}: {
  agent: AgentRecord
  session: SessionRecord
  current: SpaceInfo
  onClose: () => void
}) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const data = snap.spaces[agent.did]
  const options = chooserSpacesOf(data?.spaces ?? [])
  const choose = async (space: SpaceInfo) => {
    if (space.id === current.id) return onClose()
    try {
      await hub.setConversationSpace(session.sessionId, space.id)
      hub.notify('info', t('spaces.moved', { space: spaceTitle(space, t) }))
      onClose()
    } catch (e) {
      setError(String((e as Error).message))
    }
  }
  if (creating)
    return (
      <CreateSpaceDialog
        agent={agent}
        onClose={onClose}
        onCreated={async (space) => {
          // the conversation the person was starting goes to the space they just made
          await hub.setConversationSpace(session.sessionId, space.id).catch(() => undefined)
          hub.openSpace(agent.did, space.id)
        }}
      />
    )
  return (
    <Dialog title={t('spaces.chooserTitle')} subtitle={t('spaces.chooserHint')} onClose={onClose}>
      {error ? <div className="banner warning">{error}</div> : null}
      <fieldset className="choices">
        <legend className="sr-only">{t('spaces.chooserTitle')}</legend>
        {options.map((space) => {
          const on = space.id === current.id
          return (
            <label key={space.id} className={['choice', on ? 'on' : ''].join(' ')}>
              <input
                type="radio"
                className="sr-only"
                name="space"
                value={space.id}
                checked={on}
                onChange={() => void choose(space)}
              />
              <span className="space-tile">
                <SpaceIcon kind={space.kind} size={17} />
              </span>
              <span className="choice-text">
                <b>{spaceTitle(space, t)}</b>
                <span className="muted">
                  {[
                    t(`spaces.kind.${space.kind}`),
                    membersShort(space, t),
                    modelsLine(space, t),
                    chipRules(space, t),
                  ].join(' · ')}
                </span>
              </span>
              {on ? (
                <span className="choice-mark">
                  <Check size={18} aria-hidden="true" />
                  <span className="sr-only">{t('spaces.current')}</span>
                </span>
              ) : null}
            </label>
          )
        })}
        {data?.templates.length ? (
          <button type="button" className="choice dashed" onClick={() => setCreating(true)}>
            <span className="space-tile accent">
              <Plus size={17} aria-hidden="true" />
            </span>
            <span className="choice-text">
              <b>{t('spaces.newSpace')}</b>
              <span className="muted">{t('spaces.fromTemplate', { agent: agent.name })}</span>
            </span>
          </button>
        ) : null}
      </fieldset>
    </Dialog>
  )
}

/**
 * New space (UI-CONV-039): a step to choose the template, then its title and purpose, required, and its brief,
 * optional; created through the profile (PROF-SPACE-002), then its page opens.
 */
export function CreateSpaceDialog({
  agent,
  onClose,
  onCreated,
}: {
  agent: AgentRecord
  onClose: () => void
  onCreated?: (space: SpaceInfo) => void | Promise<void>
}) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const templates = snap.spaces[agent.did]?.templates ?? []
  const [template, setTemplate] = useState<SpaceTemplate | null>(null)
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = !!template && !!title.trim() && !!purpose.trim() && !busy
  const create = async () => {
    if (!template || !ready) return
    setBusy(true)
    setError('')
    try {
      const space = await hub.createSpace(agent.did, {
        templateId: template.id,
        title: title.trim(),
        purpose: purpose.trim(),
        ...(brief.trim() ? { brief: brief.trim() } : {}),
      })
      hub.notify('info', t('spaces.create.created', { space: space.title }))
      onClose()
      if (onCreated) await onCreated(space)
      else hub.openSpace(agent.did, space.id)
    } catch (e) {
      setBusy(false)
      setError(
        e instanceof ProfileError && e.status === 403
          ? t('spaces.create.notCreator')
          : e instanceof ProfileError && e.status === 400
            ? t('spaces.settings.required')
            : String((e as Error).message)
      )
    }
  }
  return (
    <Dialog
      title={t('spaces.create.title')}
      subtitle={template ? template.title : t('spaces.create.chooseTemplate')}
      onClose={onClose}
    >
      {error ? <div className="banner warning">{error}</div> : null}
      {!template ? (
        <ul className="choices">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <button type="button" className="choice" onClick={() => setTemplate(tpl)}>
                <span className="space-tile">
                  <SpaceIcon kind={tpl.kind} size={17} />
                </span>
                <span className="choice-text">
                  <b>{tpl.title}</b>
                  <span className="muted">
                    {t(tpl.membership === 'rule' ? 'spaces.create.membersRule' : 'spaces.create.membersList', {
                      kind: t(`spaces.kind.${tpl.kind}`),
                    })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <label className="field">
            {t('spaces.create.titleLabel')}
            <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            {t('spaces.create.purposeLabel')}
            <textarea
              className="input"
              required
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <label className="field">
            {t('spaces.create.briefLabel')}
            <textarea className="input" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setTemplate(null)}>
              {t('spaces.create.back')}
            </button>
            <button type="submit" className="btn primary" disabled={!ready}>
              {t('spaces.create.create')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

/** A language tag in the person's language: "English" for `en` when the UI is in English. */
export function languageName(tag: string, uiLanguage: string): string {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

/** The members of a list space, for an active member of it (PROF-SPACE-003). */
export function useSpaceDetail(agentDid: string, space: SpaceInfo, version = 0): SpaceDetail | null {
  const hub = useHub()
  const [detail, setDetail] = useState<SpaceDetail | null>(null)
  const wanted = space.kind !== 'personal' && space.membership.mode === 'list' && space.state === 'active'
  useEffect(() => {
    if (!wanted) return
    let live = true
    hub
      .spaceDetail(agentDid, space.id)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail(null))
    return () => {
      live = false
    }
  }, [agentDid, space.id, wanted, version, hub])
  return wanted ? detail : null
}
