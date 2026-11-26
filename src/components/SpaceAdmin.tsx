/**
 * What the owner of a space manages on the web (UI-CONV-040, UI-CONV-041; agent D80, D81, D90, D136, D138): its
 * members, picked from the employee list or invited from another organization by email; its settings within the
 * template's bounds, the approval timeouts among them, its successor and the transfer of its ownership; its activity.
 */
import {
  type AgentRecord,
  type DirectoryPerson,
  handoverCandidatesOf,
  lawfulBasisKeyOf,
  looksLikeEmail,
  memberAccessLineOf,
  memberRefusalOf,
  memberStateOf,
  type OrganizationInfo,
  ProfileError,
  ruleChoicesOf,
  type SpaceActivityItem,
  type SpaceInfo,
  type SpacePatch,
  type SpaceRules,
  type TimeoutChoice,
  timeoutChoicesOf,
  timeoutFits,
} from '@ayni.org/ayni-ui-core'
import { Building2, Search, ShieldCheck, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'
import { Dialog } from './Dialog.js'
import { languageName, membersLong, organizationNameOf, spaceTitle, useSpaceDetail } from './SpaceParts.js'
import { useSpaceTools } from './Tools.js'

/** The sentence of a refusal of the agent, for an addition, an invitation, a removal or a change. */
function useRefusal(agent: AgentRecord) {
  const { t } = useTranslation()
  return (e: unknown) => {
    const key = memberRefusalOf(e instanceof ProfileError ? e : undefined)
    return key === 'other' && !(e instanceof ProfileError)
      ? String((e as Error).message)
      : t(`spaces.refused.${key}`, { organization: organizationNameOf(agent), agent: agent.name })
  }
}

/** A search typed by the person, sent to the agent after a pause. */
function useSearch<T>(search: (q: string) => Promise<T[]>, query: string): { results: T[] | null; error: string } {
  const [results, setResults] = useState<T[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      search(q)
        .then((r) => {
          if (live) {
            setResults(r)
            setError('')
          }
        })
        .catch((e) => live && setError(String((e as Error).message)))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, search])
  return { results, error }
}

/** The member picker (UI-CONV-040): a search of the employee list (PROF-DIR-001); each person found is added. */
export function PeoplePicker({
  agent,
  title,
  actionLabel,
  onPick,
  onClose,
}: {
  agent: AgentRecord
  title: string
  actionLabel: string
  onPick: (person: DirectoryPerson) => Promise<void>
  onClose: () => void
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const search = useMemo(() => (q: string) => hub.searchPeople(agent.did, q), [hub, agent.did])
  const { results, error } = useSearch(search, query)
  return (
    <Dialog title={title} onClose={onClose}>
      <label className="search-field">
        <Search size={15} aria-hidden="true" />
        <input
          className="input"
          type="search"
          aria-label={title}
          placeholder={t('spaces.searchList', { organization: organizationNameOf(agent) })}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {error ? <div className="banner warning">{error}</div> : null}
      {results && !results.length ? <div className="muted">{t('spaces.noPeople')}</div> : null}
      <ul className="member-list">
        {(results ?? []).map((p) => (
          <li key={p.directoryId} className="member-row">
            <Avatar name={p.name} size={30} />
            <span className="space-text">
              <span className="space-name">{p.name}</span>
              {p.department ? <span className="space-sub">{p.department}</span> : null}
            </span>
            <button
              type="button"
              className="btn small primary"
              disabled={busy !== null}
              onClick={() => {
                setBusy(p.directoryId)
                void onPick(p).finally(() => setBusy(null))
              }}
            >
              {actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

/**
 * Invite someone outside the organization (UI-CONV-040, agent D90): the organization from the trust graph
 * (PROF-DIR-002), then the person's email; the agent sends the invitation.
 */
function InviteDialog({
  agent,
  space,
  onClose,
  onInvited,
}: {
  agent: AgentRecord
  space: SpaceInfo
  onClose: () => void
  onInvited: () => void
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const refusal = useRefusal(agent)
  const organization = organizationNameOf(agent)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<OrganizationInfo | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const search = useMemo(() => (q: string) => hub.searchOrganizations(agent.did, q), [hub, agent.did])
  const { results, error: searchError } = useSearch(search, chosen ? '' : query)
  const invite = async () => {
    if (!chosen) return
    if (!looksLikeEmail(email)) {
      setError(t('spaces.refused.badEmail'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await hub.addMember(agent.did, space.id, { organizationKey: chosen.organizationKey, email: email.trim() })
      hub.notify('info', t('spaces.invite.sent', { email: email.trim() }))
      onInvited()
      onClose()
    } catch (e) {
      setBusy(false)
      setError(refusal(e))
    }
  }
  return (
    <Dialog
      title={t('spaces.invite.title', { organization })}
      subtitle={t('spaces.invite.hint', { space: space.title })}
      onClose={onClose}
    >
      {error ? <div className="banner warning">{error}</div> : null}
      <div className="step">
        <span className="step-n">1</span>
        {t('spaces.invite.organization')}
      </div>
      {chosen ? (
        <button type="button" className="choice on" onClick={() => setChosen(null)}>
          <span className="space-tile">
            <Building2 size={17} aria-hidden="true" />
          </span>
          <span className="choice-text">
            <b>{chosen.name}</b>
            <span className="muted">{chosen.country}</span>
          </span>
          <ShieldCheck size={18} aria-hidden="true" className="ok-mark" />
        </button>
      ) : (
        <>
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <input
              className="input"
              type="search"
              aria-label={t('spaces.invite.search')}
              placeholder={t('spaces.invite.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {searchError ? <div className="banner warning">{searchError}</div> : null}
          {results && !results.length ? <div className="muted">{t('spaces.invite.noOrganizations')}</div> : null}
          <div className="choices">
            {(results ?? []).map((o) => (
              <button key={o.organizationKey} type="button" className="choice" onClick={() => setChosen(o)}>
                <span className="space-tile">
                  <Building2 size={17} aria-hidden="true" />
                </span>
                <span className="choice-text">
                  <b>{o.name}</b>
                  <span className="muted">{o.country}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="muted small">{t('spaces.invite.onlyVerana')}</div>
      <div className="step">
        <span className="step-n">2</span>
        {t('spaces.invite.email')}
      </div>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          void invite()
        }}
      >
        <input
          className="input"
          type="email"
          aria-label={t('spaces.invite.email')}
          disabled={!chosen}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {chosen ? (
          <div className="muted small">{t('spaces.invite.nothingBefore', { organization: chosen.name })}</div>
        ) : null}
        <div className="dialog-actions">
          <button type="submit" className="btn primary" disabled={!chosen || !email.trim() || busy}>
            {t('spaces.invite.send')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Members (UI-CONV-040): a list space's members with their state and the owner marked, Add from the employee list,
 * an invitation outside the organization, Remove; a rule space's rule in words with its count, and nothing to change.
 * In a team space whose folder the agent manages (UI-CONV-070, profile package 3.5.9), each member's access to it beside
 * their state ("No access yet", "No access yet: <reason>", nothing once in place), and under the list the people the
 * folder holds that the agent did not add ("Added outside <agent>: <name>, <name>"); the list is read again when the
 * agent says the space's tools changed, which it does at each change of a member's access (PROF-TOOL-041).
 */
export function MembersSegment({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  const refusal = useRefusal(agent)
  const [version, setVersion] = useState(0)
  const announced = snap.toolChanges.filter((c) => c.agentDid === agent.did && c.change.spaceId === space.id)
  const lastAnnounced = announced[announced.length - 1]?.n ?? 0
  useEffect(() => {
    if (lastAnnounced) setVersion((v) => v + 1)
  }, [lastAnnounced])
  const detail = useSpaceDetail(agent.did, space, version)
  // the provider of the managed folder, which the reasons of a member's access name
  const folderShown = !!detail?.addedOutside || !!detail?.members?.some((m) => m.folderAccess)
  const { tools, error: toolsError } = useSpaceTools(agent, space, folderShown && hub.takesTools(agent.did))
  const provider = tools?.find((x) => x.location === 'managed')
  const accessReady = tools !== null || !!toolsError
  const accessWords = (m: { folderAccess?: Parameters<typeof memberAccessLineOf>[0] }) => {
    const line = memberAccessLineOf(m.folderAccess)
    if (!line || !accessReady) return ''
    if (line.key === 'noAccess') return t('tools.folder.noAccess')
    return t('tools.folder.noAccessBecause', {
      reason: t(`tools.folder.reason.${line.reason}`, { provider: provider?.title ?? '', agent: agent.name }),
    })
  }
  const [picking, setPicking] = useState(false)
  const [inviting, setInviting] = useState(false)
  const organization = organizationNameOf(agent)
  const title = spaceTitle(space, t)
  if (space.membership.mode === 'rule') {
    return (
      <section className="space-section">
        <p className="members-line">{membersLong(space, organization, t)}</p>
        <p className="muted hint">{t('spaces.ruleNoChange')}</p>
      </section>
    )
  }
  const add = async (person: DirectoryPerson) => {
    try {
      await hub.addMember(agent.did, space.id, { directoryId: person.directoryId })
      hub.notify('info', t('spaces.added', { name: person.name, space: title }))
      setVersion((v) => v + 1)
    } catch (e) {
      hub.notify('error', refusal(e))
    }
  }
  const remove = async (memberId: string, name: string) => {
    try {
      await hub.removeMember(agent.did, space.id, memberId)
      hub.notify('info', t('spaces.removed', { name, space: title }))
      setVersion((v) => v + 1)
    } catch (e) {
      hub.notify('error', refusal(e))
    }
  }
  return (
    <section className="space-section">
      <div className="members-tools">
        <button type="button" className="btn" onClick={() => setPicking(true)}>
          <UserPlus size={16} aria-hidden="true" /> {t('spaces.add')}
        </button>
        <button type="button" className="btn" onClick={() => setInviting(true)}>
          <Building2 size={16} aria-hidden="true" /> {t('spaces.inviteOutside', { organization })}
        </button>
      </div>
      {!detail ? (
        <div className="muted">{t('app.loading')}</div>
      ) : (
        <div className="table-wrap">
          <table className="members-table">
            <thead>
              <tr>
                <th>{t('spaces.nameCol')}</th>
                <th>{t('spaces.organizationCol')}</th>
                <th>{t('spaces.stateCol')}</th>
                <th>
                  <span className="sr-only">{t('spaces.remove')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(detail.members ?? []).map((m) => {
                const state = memberStateOf(m)
                return (
                  <tr key={m.memberId}>
                    <td>
                      <span className="member-name">
                        <Avatar name={m.name} size={26} />
                        <b>{m.name}</b>
                      </span>
                    </td>
                    <td className="muted">{m.organization ?? ''}</td>
                    <td>
                      <span className={state === 'active' ? '' : 'state-tag'}>
                        {t(`spaces.state.${state}`, { agent: agent.name })}
                      </span>
                      {accessWords(m) ? <span className="member-folder-access">{accessWords(m)}</span> : null}
                    </td>
                    <td className="actions-cell">
                      {m.role !== 'owner' && m.state !== 'left' ? (
                        <button type="button" className="link" onClick={() => void remove(m.memberId, m.name)}>
                          {t('spaces.remove')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {detail.addedOutside?.length ? (
            <p className="members-added-outside">
              {t('tools.folder.addedOutside', {
                agent: agent.name,
                names: detail.addedOutside.map((p) => p.name).join(', '),
              })}
            </p>
          ) : null}
        </div>
      )}
      {picking ? (
        <PeoplePicker
          agent={agent}
          title={t('spaces.employeeList', { organization })}
          actionLabel={t('spaces.add')}
          onPick={add}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {inviting ? (
        <InviteDialog
          agent={agent}
          space={space}
          onClose={() => setInviting(false)}
          onInvited={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </section>
  )
}

/** The language tags an owner may give a space: the agent's, the UI's, and the current one. */
function languageChoices(agent: AgentRecord, current: string | null, ui: readonly string[]): string[] {
  const tags = [...(agent.descriptor.locales ?? []), ...ui, ...(current ? [current] : [])]
  return [...new Set(tags)]
}

/**
 * Settings (UI-CONV-041): the title, purpose, brief, language and rules, within the template's bounds (only the values
 * it allows, when the agent gives them; the agent refuses the others, naming the field), and the transfer of its
 * ownership to a member.
 */
export function SettingsSegment({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t, i18n } = useTranslation()
  const refusal = useRefusal(agent)
  const template = snap.spaces[agent.did]?.templates.find((x) => x.id === space.templateId)
  const choices = ruleChoicesOf(space, template?.bounds)
  const [title, setTitle] = useState(space.title)
  const [purpose, setPurpose] = useState(space.purpose)
  const [brief, setBrief] = useState(space.brief)
  const [language, setLanguage] = useState(space.language ?? '')
  const [retention, setRetention] = useState(
    space.rules.retentionDays === null ? '' : String(space.rules.retentionDays)
  )
  const [basis, setBasis] = useState(space.rules.lawfulBasis)
  const [providers, setProviders] = useState<string[]>(space.rules.allowedProviders)
  const [handover, setHandover] = useState(space.rules.handover)
  // the approval timeouts, one per kind, in minutes (UI-CONV-041, agent D138)
  const timeouts = timeoutChoicesOf(space, template?.bounds)
  const [minutes, setMinutes] = useState<Record<string, string>>(() =>
    Object.fromEntries(timeouts.map((c) => [c.kind, c.minutes === null ? '' : String(c.minutes)]))
  )
  const timeoutLabel = (kind: string) =>
    kind === 'tool-call' ? t('spaces.settings.timeout.tool-call') : t('spaces.settings.timeoutOther', { kind })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fieldLabel = (field: string) =>
    ({
      title: t('spaces.settings.title'),
      purpose: t('spaces.settings.purpose'),
      brief: t('spaces.settings.brief'),
      language: t('spaces.settings.language'),
      'rules.retentionDays': t('spaces.settings.retention'),
      'rules.lawfulBasis': t('spaces.settings.basis', { agent: agent.name }),
      'rules.allowedProviders': t('spaces.settings.models'),
      'rules.handover': t('spaces.settings.handover'),
    })[field] ??
    (field.startsWith('rules.approvalTimeouts.') ? timeoutLabel(field.slice('rules.approvalTimeouts.'.length)) : field)
  const save = async () => {
    if (!title.trim() || !purpose.trim()) {
      setError(t('spaces.settings.required'))
      return
    }
    const patch: SpacePatch = {}
    if (title.trim() !== space.title) patch.title = title.trim()
    if (purpose.trim() !== space.purpose) patch.purpose = purpose.trim()
    if (brief.trim() !== space.brief) patch.brief = brief.trim()
    if ((language || null) !== space.language) patch.language = language || null
    const rules: Partial<SpaceRules> = {}
    const days = retention.trim() === '' ? null : Number(retention)
    if (days !== space.rules.retentionDays && (days === null || Number.isFinite(days))) rules.retentionDays = days
    if (basis !== space.rules.lawfulBasis) rules.lawfulBasis = basis
    if (providers.join('\n') !== space.rules.allowedProviders.join('\n')) rules.allowedProviders = providers
    if (handover !== space.rules.handover) rules.handover = handover
    const changedTimeouts: Record<string, number> = {}
    for (const choice of timeouts) {
      const typed = minutes[choice.kind] ?? ''
      if (typed.trim() === (choice.minutes === null ? '' : String(choice.minutes))) continue
      // checked against the template's bounds first; the agent refuses the others, naming the field
      if (!timeoutFits(choice, typed)) {
        setError(t('spaces.settings.timeoutBad'))
        return
      }
      changedTimeouts[choice.kind] = Number(typed.trim())
    }
    if (Object.keys(changedTimeouts).length) rules.approvalTimeouts = changedTimeouts
    if (Object.keys(rules).length) patch.rules = rules
    if (!Object.keys(patch).length) return
    setBusy(true)
    setError('')
    try {
      await hub.patchSpace(agent.did, space.id, patch)
      hub.notify('info', t('spaces.settings.saved'))
    } catch (e) {
      setError(
        e instanceof ProfileError && e.code === 'out-of-bounds'
          ? t('spaces.settings.outOfBounds', { field: fieldLabel(e.field ?? '') })
          : e instanceof ProfileError && e.status === 400
            ? t('spaces.settings.required')
            : refusal(e)
      )
    } finally {
      setBusy(false)
    }
  }
  const { min, max } = choices.retention
  const bounds =
    min !== undefined && max !== undefined
      ? t('spaces.settings.retentionBounds', { min, max })
      : min !== undefined
        ? t('spaces.settings.retentionMin', { min })
        : max !== undefined
          ? t('spaces.settings.retentionMax', { max })
          : ''
  return (
    <div className="space-settings">
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {error ? <div className="banner warning">{error}</div> : null}
        <label className="field">
          {t('spaces.settings.title')}
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          {t('spaces.settings.purpose')}
          <textarea className="input" rows={3} required value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </label>
        <label className="field">
          {t('spaces.settings.brief')}
          <textarea className="input" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} />
          <span className="muted small">{t('spaces.settings.briefHint')}</span>
        </label>
        <label className="field">
          {t('spaces.settings.language')}
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">{t('spaces.settings.noLanguage', { agent: agent.name })}</option>
            {languageChoices(agent, space.language, snap.config.locales).map((tag) => (
              <option key={tag} value={tag}>
                {languageName(tag, i18n.language)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('spaces.settings.retention')}
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
          />
          {bounds ? <span className="muted small">{bounds}</span> : null}
        </label>
        <label className="field">
          {t('spaces.settings.basis', { agent: agent.name })}
          <select
            className="input"
            value={basis}
            disabled={choices.lawfulBasis.length < 2}
            onChange={(e) => setBasis(e.target.value)}
          >
            {choices.lawfulBasis.map((b) => (
              <option key={b} value={b}>
                {t(`spaces.basis.${lawfulBasisKeyOf(b)}`, { basis: b })}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="field">
          <legend>{t('spaces.settings.models')}</legend>
          {choices.allowedProviders.map((p) => (
            <label key={p} className="check">
              <input
                type="checkbox"
                checked={providers.includes(p)}
                onChange={(e) =>
                  setProviders((list) => (e.target.checked ? [...list, p] : list.filter((x) => x !== p)))
                }
              />
              {p}
            </label>
          ))}
        </fieldset>
        <fieldset className="field">
          <legend>{t('spaces.settings.handover')}</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={handover}
              disabled={choices.handover.length < 2}
              onChange={(e) => setHandover(e.target.checked)}
            />
            {t('spaces.settings.handoverLabel')}
          </label>
        </fieldset>
        {timeouts.length ? (
          <fieldset className="field">
            <legend>{t('spaces.settings.timeouts')}</legend>
            {timeouts.map((c) => (
              <TimeoutField
                key={c.kind}
                choice={c}
                label={timeoutLabel(c.kind)}
                value={minutes[c.kind] ?? ''}
                onChange={(value) => setMinutes((all) => ({ ...all, [c.kind]: value }))}
              />
            ))}
          </fieldset>
        ) : null}
        <div className="dialog-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {t('spaces.settings.save')}
          </button>
        </div>
      </form>
      <Successor agent={agent} space={space} />
      <Transfer agent={agent} space={space} />
    </div>
  )
}

/** One approval timeout (UI-CONV-041): its minutes, with the template's bounds when the agent gives them. */
function TimeoutField({
  choice,
  label,
  value,
  onChange,
}: {
  choice: TimeoutChoice
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <label className="field timeout-field">
      {label}
      <span className="timeout-input">
        <input
          className="input timeout-minutes"
          type="number"
          inputMode="numeric"
          min={choice.min ?? 1}
          max={choice.max}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="muted small">{t('spaces.settings.minutes')}</span>
      </span>
      {choice.min !== undefined && choice.max !== undefined ? (
        <span className="muted small">{t('spaces.settings.timeoutBounds', { min: choice.min, max: choice.max })}</span>
      ) : null}
    </label>
  )
}

/**
 * The successor (UI-CONV-041, PROF-SPACE-008): the person who becomes the owner when the owner's entry leaves the
 * directory, chosen among the people the space could be handed to (an active member who is not a guest, a person the
 * rule matches), with Clear. Only the owner reads it.
 */
function Successor({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const { t } = useTranslation()
  const refusal = useRefusal(agent)
  const detail = useSpaceDetail(agent.did, space)
  const [memberId, setMemberId] = useState('')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const title = spaceTitle(space, t)
  const organization = organizationNameOf(agent)
  const candidates = handoverCandidatesOf(detail?.members)
  const refused = (e: unknown) =>
    hub.notify(
      'error',
      e instanceof ProfileError && e.code === 'not-eligible' ? t('spaces.settings.notEligible') : refusal(e)
    )
  const name = async (to: { memberId: string } | { directoryId: string }, person: string) => {
    setBusy(true)
    try {
      await hub.setSuccessor(agent.did, space.id, to)
      hub.notify('info', t('spaces.settings.successorSet', { name: person, space: title }))
      setMemberId('')
    } catch (e) {
      refused(e)
    } finally {
      setBusy(false)
    }
  }
  const clear = async () => {
    setBusy(true)
    try {
      await hub.clearSuccessor(agent.did, space.id)
      hub.notify('info', t('spaces.settings.successorCleared', { space: title }))
    } catch (e) {
      refused(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="box successor" aria-label={t('spaces.settings.successor')}>
      <b>{t('spaces.settings.successor')}</b>
      <span className="muted small">{t('spaces.settings.successorHint', { organization })}</span>
      <div className="transfer-row">
        <span className="successor-name">{space.successor?.name ?? t('spaces.settings.noSuccessor')}</span>
        {space.successor ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void clear()}>
            {t('spaces.settings.successorClear')}
          </button>
        ) : null}
      </div>
      {space.membership.mode === 'list' ? (
        <div className="transfer-row">
          <select
            className="input"
            aria-label={t('spaces.settings.successor')}
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">{t('spaces.settings.transferPick')}</option>
            {candidates.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!memberId || busy}
            onClick={() => void name({ memberId }, candidates.find((m) => m.memberId === memberId)?.name ?? '')}
          >
            {t('spaces.settings.setSuccessor')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => setPicking(true)}>
          {t('spaces.settings.transferSearch', { organization })}
        </button>
      )}
      {picking ? (
        <PeoplePicker
          agent={agent}
          title={t('spaces.settings.successor')}
          actionLabel={t('spaces.settings.setSuccessor')}
          onPick={async (p) => {
            await name({ directoryId: p.directoryId }, p.name)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </section>
  )
}

/**
 * The transfer of ownership (UI-CONV-041, PROF-SPACE-006): to an active member of a list space, or to a person of the
 * employee list for a rule space. The person becomes a member, and the owner's segments leave with the space.
 */
function Transfer({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const { t } = useTranslation()
  const refusal = useRefusal(agent)
  const detail = useSpaceDetail(agent.did, space)
  const [memberId, setMemberId] = useState('')
  const [picking, setPicking] = useState(false)
  const title = spaceTitle(space, t)
  const transfer = async (to: { memberId: string } | { directoryId: string }, name: string) => {
    try {
      await hub.transferOwnership(agent.did, space.id, to)
      hub.notify('info', t('spaces.settings.transferred', { name, space: title }))
    } catch (e) {
      hub.notify(
        'error',
        e instanceof ProfileError && e.code === 'not-eligible' ? t('spaces.settings.notEligible') : refusal(e)
      )
    }
  }
  // an active member who is not a guest: the agent refuses any other (`422 not-eligible`)
  const candidates = handoverCandidatesOf(detail?.members)
  return (
    <section className="box transfer">
      <b>{t('spaces.settings.transfer')}</b>
      <span className="muted small">{t('spaces.settings.transferHint')}</span>
      {space.membership.mode === 'list' ? (
        <div className="transfer-row">
          <select
            className="input"
            aria-label={t('spaces.settings.transferTo')}
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">{t('spaces.settings.transferPick')}</option>
            {candidates.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!memberId}
            onClick={() => void transfer({ memberId }, candidates.find((m) => m.memberId === memberId)?.name ?? '')}
          >
            {t('spaces.settings.transfer')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setPicking(true)}>
          {t('spaces.settings.transferSearch', { organization: organizationNameOf(agent) })}
        </button>
      )}
      {picking ? (
        <PeoplePicker
          agent={agent}
          title={t('spaces.settings.transferTo')}
          actionLabel={t('spaces.settings.transfer')}
          onPick={async (p) => {
            await transfer({ directoryId: p.directoryId }, p.name)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </section>
  )
}

/**
 * The words of a line of activity: a change of owner by its `how` (handed over, by succession, named by a steward with
 * the steward's reason; profile 3.5.4), every other by its kind.
 */
function activityKey(a: SpaceActivityItem): string {
  if (a.kind === 'owner-changed' && a.how === 'succession') return 'spaces.activity.ownerSuccession'
  if (a.kind === 'owner-changed' && a.how === 'steward') return 'spaces.activity.ownerSteward'
  return `spaces.activity.${a.kind}`
}

/**
 * Activity (UI-CONV-041, UI-CONV-051): newest first; who did what, never the value of a field nor a token. A change of
 * provider reads "<by> changed the provider of <feature> from <former> to <tool>": the line names the former provider
 * by its id only (`tool.formerSource`, profile §3.7), its title is the feature's `providers`', read from the space's
 * tools when the page holds such a line.
 */
export function ActivitySegment({ agent, space }: { agent: AgentRecord; space: SpaceInfo }) {
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<SpaceActivityItem[] | null>(null)
  const providersWanted = !!items?.some((a) => a.kind === 'provider-changed') && hub.takesTools(agent.did)
  const { tools } = useSpaceTools(agent, space, providersWanted)
  /** The title of a provider the line names by its id: among its feature's providers first, else any feature's. */
  const providerTitle = (a: SpaceActivityItem): string => {
    const source = a.tool?.formerSource
    if (!source) return ''
    const ofFeature = tools?.find((x) => x.feature.id === a.feature?.id)?.providers ?? []
    const any = tools?.flatMap((x) => x.providers) ?? []
    return [...ofFeature, ...any].find((p) => p.source === source)?.title ?? source
  }
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState('')
  const load = (before?: string) =>
    hub
      .spaceActivity(agent.did, space.id, before)
      .then((page) => {
        setItems((list) => [...(before ? (list ?? []) : []), ...page.activity])
        setNext(page.nextBefore)
      })
      .catch((e) => setError(String((e as Error).message)))
  useEffect(() => {
    void load()
  }, [agent.did, space.id])
  const someone = t('spaces.activity.someone')
  return (
    <section className="space-section">
      {error ? <div className="banner warning">{error}</div> : null}
      {items === null ? (
        <div className="muted">{t('app.loading')}</div>
      ) : items.length ? (
        <ol className="activity-list">
          {items.map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <span className="time">{formatTime(a.at, i18n.language)}</span>
              <span>
                {t(activityKey(a), {
                  by: a.by?.name ?? someone,
                  member: a.member?.name ?? someone,
                  tool: a.tool?.title ?? someone,
                  feature: a.feature?.title ?? someone,
                  former: providerTitle(a) || someone,
                  reason: a.reason ?? '',
                })}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="muted empty">{t('spaces.activity.empty')}</div>
      )}
      {next ? (
        <button type="button" className="btn small" onClick={() => void load(next)}>
          {t('spaces.activity.more')}
        </button>
      ) : null}
    </section>
  )
}
