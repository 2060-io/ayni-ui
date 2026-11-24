/**
 * A space's page, in the main pane where a conversation opens (UI-CONV-031): its header, then Conversations, Your
 * memories and About; for its owner, on the web, Members, Tools, Settings and Activity (UI-CONV-040, UI-CONV-050,
 * UI-CONV-041), Tools against an agent that serves them. Against an agent that serves the Notifications, every
 * member's page has Notifications right after Conversations, with the badge of what waits there (UI-APPR-007). A space
 * the person left says so, and offers no new conversation (UI-CONV-043).
 */
import {
  type AgentRecord,
  isPersonalConversation,
  lawfulBasisKeyOf,
  notificationsWaitingOf,
  type SharedConversation,
  type SpaceInfo,
  type SpaceSegment,
  spaceSegmentsOf,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, Cpu, Eye, EyeOff, Globe, History, Lock, Plus, Scale, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { NotificationsBadge } from './ApprovalWords.js'
import { Avatar } from './Avatar.js'
import { ConversationRow } from './Column.js'
import { MemoryList } from './Memories.js'
import { NotificationList } from './Notifications.js'
import { ActivitySegment, MembersSegment, SettingsSegment } from './SpaceAdmin.js'
import { languageName, membersLong, organizationNameOf, SpaceIcon, spaceTitle, useSpaceDetail } from './SpaceParts.js'
import { ToolsSegment } from './SpaceTools.js'
import { AboutTools } from './Tools.js'

export function SpacePage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const ref = snap.spaceFor
  const agent = snap.agents.find((a) => a.did === ref?.agentDid)
  const space = snap.spaces[ref?.agentDid ?? '']?.spaces.find((s) => s.id === ref?.spaceId)
  if (!ref || !agent) return <div className="center" />
  const back = (
    <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
      <ArrowLeft size={20} />
    </button>
  )
  if (!space)
    return (
      <header className="conv-header">
        {back}
        <div className="conv-title">
          <h1>{t('app.loading')}</h1>
        </div>
      </header>
    )
  const title = spaceTitle(space, t)
  const kind = t(`spaces.kind.${space.kind}`)
  const segments = spaceSegmentsOf(space, {
    tools: hub.takesTools(agent.did),
    notifications: hub.takesNotifications(agent.did),
  })
  const segment: SpaceSegment = segments.includes(ref.segment) ? ref.segment : 'conversations'
  const left = space.state === 'left'
  return (
    <div className="space-page">
      <header className="conv-header space-header">
        {back}
        <span className="space-tile big">
          <SpaceIcon kind={space.kind} size={20} />
        </span>
        <div className="conv-title">
          <h1>{title}</h1>
          <span className="conv-sub">
            {space.kind === 'personal'
              ? kind
              : space.role === 'owner'
                ? t('spaces.ownerLineYou', { kind })
                : space.owner
                  ? t('spaces.ownerLine', { kind, name: space.owner.name })
                  : // its owner left with no successor, until a steward names one (agent D136)
                    t('spaces.ownerLineNone', { kind })}
          </span>
        </div>
      </header>
      {left ? (
        <div className="banner info" role="status">
          {t('spaces.left', { space: title })}
        </div>
      ) : null}
      <div className="segments" role="tablist" aria-label={title}>
        {segments.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === segment}
            className={s === segment ? 'seg on' : 'seg'}
            onClick={() => hub.setSpaceSegment(s)}
          >
            {t(`spaces.segments.${s}`)}
            {s === 'notifications' ? <NotificationsBadge count={notificationsWaitingOf(space)} /> : null}
          </button>
        ))}
      </div>
      <div className="space-body" role="tabpanel">
        {segment === 'conversations' ? (
          <ConversationsSegment agent={agent} space={space} />
        ) : segment === 'notifications' ? (
          <NotificationList key={space.id} agent={agent} spaceId={space.id} focus={ref.approvalId} />
        ) : segment === 'memories' ? (
          <MemoriesSegment agent={agent} space={space} />
        ) : segment === 'about' ? (
          <AboutSegment agent={agent} space={space} />
        ) : segment === 'members' ? (
          <MembersSegment agent={agent} space={space} />
        ) : segment === 'tools' ? (
          <ToolsSegment key={ref.source ?? ''} agent={agent} space={space} source={ref.source} />
        ) : segment === 'settings' ? (
          <SettingsSegment agent={agent} space={space} />
        ) : (
          <ActivitySegment agent={agent} space={space} />
        )}
      </div>
    </div>
  )
}

/** Conversations (UI-CONV-031): New conversation; the person's own, private; those shared with the space, read-only. */
function ConversationsSegment({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [shared, setShared] = useState<SharedConversation[] | null>(null)
  const spaces = snap.spaces[agent.did]?.spaces ?? []
  const mine = snap.sessions
    .filter(
      (s) =>
        s.agentDid === agent.did &&
        !s.archived &&
        (space.kind === 'personal' ? isPersonalConversation(s.spaceId, spaces) : s.spaceId === space.id)
    )
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
  const takesShares = space.kind !== 'personal' && space.state === 'active'
  useEffect(() => {
    if (!takesShares) return
    let live = true
    hub
      .sharedConversations(agent.did, space.id)
      .then((list) => live && setShared(list))
      .catch(() => live && setShared([]))
    return () => {
      live = false
    }
  }, [agent.did, space.id, takesShares, hub])
  const own = new Set(mine.map((s) => s.conversationId))
  const others = (shared ?? []).filter((c) => !own.has(c.id))
  return (
    <>
      <button
        type="button"
        className="btn wide-btn"
        disabled={space.state === 'left'}
        onClick={() =>
          void hub
            .newConversation(agent.did, undefined, space.id)
            .catch((e) => hub.notify('error', String((e as Error).message)))
        }
      >
        <Plus size={17} aria-hidden="true" /> {t('spaces.newConversation')}
      </button>
      <section className="space-section">
        <h3 className="section-label">{t('spaces.yours')}</h3>
        <p className="muted hint">
          <Lock size={13} aria-hidden="true" /> {t('spaces.onlyYouRead')}
        </p>
        {mine.length ? (
          <div className="space-conversations">
            {mine.map((s) => (
              <ConversationRow key={s.sessionId} session={s} selected={false} />
            ))}
          </div>
        ) : (
          <div className="muted empty">{t('spaces.noConversations')}</div>
        )}
      </section>
      {takesShares ? (
        <section className="space-section">
          <h3 className="section-label">{t('spaces.sharedWithSpace')}</h3>
          <p className="muted hint">
            <Eye size={13} aria-hidden="true" /> {t('spaces.sharedHint')}
          </p>
          {shared === null ? (
            <div className="muted">{t('app.loading')}</div>
          ) : others.length ? (
            others.map((c) => (
              <button
                key={c.id}
                type="button"
                className="shared-row"
                onClick={() => hub.openShared(agent.did, space.id, c)}
              >
                <Avatar name={c.author.name} size={32} />
                <span className="space-text">
                  <span className="space-name">{c.title || t('column.untitled')}</span>
                  <span className="space-sub">
                    {t('spaces.sharedBy', { name: c.author.name, time: formatTime(c.sharedAt, i18n.language) })}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <div className="muted empty">{t('spaces.noShared')}</div>
          )}
        </section>
      ) : null}
    </>
  )
}

/** Your memories (UI-CONV-031): the person's own memories of the space, newest first. */
function MemoriesSegment({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const { t } = useTranslation()
  return (
    <section className="space-section">
      <p className="muted hint">
        <Lock size={13} aria-hidden="true" /> {t('spaces.onlyYouSee')}
      </p>
      <p className="muted hint">{t('spaces.memoriesHint', { agent: agent.name, space: spaceTitle(space, t) })}</p>
      <MemoryList agentDid={agent.did} spaceId={space.id} />
    </section>
  )
}

/**
 * About (UI-CONV-031): the purpose with its owner's name, the brief, the language, the rules in plain words, the
 * members, the tools the agent uses in the space (UI-CONV-049), and what managers do not see.
 */
function AboutSegment({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const { t, i18n } = useTranslation()
  const detail = useSpaceDetail(agent.did, space)
  const days = space.rules.retentionDays
  const basisKey = lawfulBasisKeyOf(space.rules.lawfulBasis)
  const basis = t(`spaces.basis.${basisKey}`, { basis: space.rules.lawfulBasis })
  return (
    <div className="space-about">
      {space.purpose ? (
        <section className="space-section">
          <h3 className="section-label">{t('spaces.purpose')}</h3>
          <blockquote className="space-purpose">{space.purpose}</blockquote>
          {space.owner?.name ? <div className="muted small purpose-by">{space.owner.name}</div> : null}
        </section>
      ) : null}
      {space.brief ? (
        <section className="space-section">
          <h3 className="section-label">{t('spaces.brief')}</h3>
          <p className="space-brief">{space.brief}</p>
        </section>
      ) : null}
      {space.language ? (
        <section className="space-section">
          <h3 className="section-label">{t('spaces.language')}</h3>
          <p className="rule-line">
            <Globe size={17} aria-hidden="true" className="rule-icon" />
            <span>
              {t('spaces.writesIn', { agent: agent.name, language: languageName(space.language, i18n.language) })}
            </span>
          </p>
        </section>
      ) : null}
      <section className="space-section">
        <h3 className="section-label">{t('spaces.rules')}</h3>
        <p className="rule-line">
          <History size={17} aria-hidden="true" className="rule-icon" />
          <span>{days === null ? t('spaces.keptForever') : t('spaces.kept', { count: days })}</span>
        </p>
        <p className="rule-line">
          <Scale size={17} aria-hidden="true" className="rule-icon" />
          <span>{t('spaces.why', { agent: agent.name, basis })}</span>
        </p>
        <p className="rule-line">
          <Cpu size={17} aria-hidden="true" className="rule-icon" />
          <span>
            {space.rules.allowedProviders.length
              ? t('spaces.modelsAllowed', { providers: space.rules.allowedProviders.join(', ') })
              : t('spaces.noModels')}
          </span>
        </p>
        <p className="rule-line">
          <Share2 size={17} aria-hidden="true" className="rule-icon" />
          <span>{space.rules.handover ? t('spaces.handoverYes') : t('spaces.handoverNo')}</span>
        </p>
      </section>
      <section className="space-section">
        <h3 className="section-label">{t('spaces.membersTitle')}</h3>
        <p className="members-line">{membersLong(space, organizationNameOf(agent), t)}</p>
        {detail?.members?.length ? (
          <ul className="member-list">
            {detail.members
              .filter((m) => m.state !== 'left')
              .map((m) => (
                <li key={m.memberId} className="member-row">
                  <Avatar name={m.name} size={30} />
                  <span className="space-text">
                    <span className="space-name">{m.name}</span>
                    {m.organization ? <span className="space-sub">{m.organization}</span> : null}
                  </span>
                  {m.role === 'owner' ? <span className="tag">{t('spaces.state.owner')}</span> : null}
                </li>
              ))}
          </ul>
        ) : null}
      </section>
      <AboutTools agent={agent} space={space} />
      <div className="callout">
        <EyeOff size={17} aria-hidden="true" className="callout-icon" />
        <span>{t('spaces.managers')}</span>
      </div>
    </div>
  )
}
