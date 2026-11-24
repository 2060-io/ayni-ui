/**
 * Spaces you steward (UI-CONV-068; profile 3.5.4 PROF-SPACE-009; agent D136): for a person whom the agent gives spaces
 * of the templates whose steward roles they hold, a page in the main pane listing those spaces, the ones with no owner
 * first, each with its title, its template, its owner's name or "No owner", and its successor when it has one. Opening
 * one shows who could own it, by name and department, a required Reason, and Name the owner. Nothing else of a space is
 * shown, and no space page opens from here: a steward reads nothing else of a space they are not a member of.
 */
import {
  type AgentRecord,
  type OwnerCandidate,
  ProfileError,
  STEWARD_REASON_MAX,
  type StewardedSpace,
  stewardReasonFits,
  stewardRefusalOf,
} from '@ayni.org/ayni-ui-core'
import { ArrowLeft, ChevronRight, CircleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { SpaceIcon } from './SpaceParts.js'

type T = (key: string, options?: Record<string, unknown>) => string

/** The words of a refusal of a steward's request (UI-CONV-052). */
function refusalWords(e: unknown, t: T): string {
  if (!(e instanceof ProfileError)) return String((e as Error).message)
  switch (stewardRefusalOf(e)) {
    case 'notSteward':
      return t('steward.notSteward')
    case 'reason':
      return t('steward.reasonRequired')
    case 'notEligible':
      return t('steward.notEligible')
    default:
      return e.message
  }
}

export function StewardshipPage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const target = snap.stewardFor
  const agent = snap.agents.find((a) => a.did === target?.agentDid)
  const [spaces, setSpaces] = useState<StewardedSpace[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(target?.spaceId ?? null)
  useEffect(() => {
    if (!agent) return
    let live = true
    hub
      .stewardship(agent.did)
      .then((list) => live && setSpaces(list))
      .catch((e) => live && setError(refusalWords(e, t)))
    return () => {
      live = false
    }
  }, [agent?.did, hub])
  useEffect(() => setOpen(target?.spaceId ?? null), [target?.spaceId])
  if (!agent) return <div className="center" />
  const templateTitle = (id: string) => snap.spaces[agent.did]?.templates.find((x) => x.id === id)?.title ?? id
  const named = (space: StewardedSpace) =>
    // the answer is the space as this list gives it: its row reads the new owner, and it goes after those with none
    setSpaces((list) => {
      const next = (list ?? []).map((s) => (s.id === space.id ? space : s))
      return [...next.filter((s) => !s.owner), ...next.filter((s) => s.owner)]
    })
  const chosen = spaces?.find((s) => s.id === open)
  return (
    <div className="steward-page">
      <header className="conv-header">
        <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
          <ArrowLeft size={20} />
        </button>
        <div className="conv-title">
          <h1>{t('steward.title')}</h1>
          <span className="conv-sub">{agent.name}</span>
        </div>
      </header>
      <div className="space-body">
        {error ? <div className="banner warning">{error}</div> : null}
        {spaces === null ? (
          error ? null : (
            <div className="muted">{t('app.loading')}</div>
          )
        ) : spaces.length ? (
          <ul className="steward-list">
            {spaces.map((s) => (
              <li key={s.id} className={s.id === open ? 'steward-row open' : 'steward-row'}>
                <button
                  type="button"
                  className="tool-row-main"
                  aria-expanded={s.id === open}
                  onClick={() => setOpen((o) => (o === s.id ? null : s.id))}
                >
                  <span className="space-tile">
                    <SpaceIcon kind={s.kind} size={16} />
                  </span>
                  <span className="space-text">
                    <span className="space-name">{s.title}</span>
                    <span className="space-sub">{templateTitle(s.templateId)}</span>
                  </span>
                  <span className="space-text steward-owner">
                    <span className={s.owner ? 'steward-owner-name' : 'state-tag'}>
                      {s.owner ? s.owner.name : t('steward.noOwner')}
                    </span>
                    {s.successor ? (
                      <span className="space-sub">{t('steward.successor', { name: s.successor.name })}</span>
                    ) : null}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="tool-row-chevron" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted empty">{t('steward.empty')}</div>
        )}
        {chosen ? <NameOwner key={chosen.id} agent={agent} space={chosen} onNamed={named} /> : null}
      </div>
    </div>
  )
}

/**
 * Who could own a space, by name and department, a required Reason, and Name the owner (UI-CONV-068): disabled until a
 * candidate is chosen and the reason holds 1 to 500 characters.
 */
function NameOwner({
  agent,
  space,
  onNamed,
}: {
  agent: AgentRecord
  space: StewardedSpace
  onNamed: (space: StewardedSpace) => void
}) {
  const hub = useHub()
  const { t } = useTranslation()
  const [candidates, setCandidates] = useState<OwnerCandidate[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    hub
      .ownerCandidates(agent.did, space.id)
      .then((list) => live && setCandidates(list))
      .catch((e) => live && setError(refusalWords(e, t)))
    return () => {
      live = false
    }
  }, [agent.did, space.id, hub])
  const keyOf = (c: OwnerCandidate) => ('memberId' in c ? `m:${c.memberId}` : `d:${c.directoryId}`)
  const candidate = candidates?.find((c) => keyOf(c) === chosen)
  const submit = async () => {
    if (!candidate || !stewardReasonFits(reason)) return
    setBusy(true)
    setError('')
    try {
      const to = 'memberId' in candidate ? { memberId: candidate.memberId } : { directoryId: candidate.directoryId }
      const named = await hub.nameOwner(agent.did, space.id, to, reason.trim())
      onNamed(named)
      hub.notify('info', t('steward.named', { name: named.owner?.name ?? candidate.name, space: named.title }))
      setReason('')
      setChosen('')
    } catch (e) {
      setError(refusalWords(e, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="box steward-name" aria-label={t('steward.nameOwner')}>
      <h3 className="section-label">{space.title}</h3>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <fieldset className="field">
          <legend>{t('steward.candidates')}</legend>
          {candidates === null ? (
            <div className="muted">{t('app.loading')}</div>
          ) : candidates.length ? (
            candidates.map((c) => (
              <label key={keyOf(c)} className="check steward-candidate">
                <input
                  type="radio"
                  name={`candidate-${space.id}`}
                  checked={chosen === keyOf(c)}
                  onChange={() => setChosen(keyOf(c))}
                />
                <span className="space-text">
                  <span className="space-name">{c.name}</span>
                  {c.department ? <span className="space-sub">{c.department}</span> : null}
                </span>
              </label>
            ))
          ) : (
            <div className="muted">{t('steward.noCandidates')}</div>
          )}
        </fieldset>
        <label className="field">
          {t('steward.reason')}
          <textarea
            className="input"
            rows={2}
            required
            maxLength={STEWARD_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error ? (
          <span className="field-error" role="alert">
            <CircleAlert size={13} aria-hidden="true" className="field-error-icon" /> {error}
          </span>
        ) : null}
        <div className="dialog-actions">
          <button
            type="submit"
            className="btn primary steward-submit"
            disabled={busy || !candidate || !stewardReasonFits(reason)}
          >
            {t('steward.nameOwner')}
          </button>
        </div>
      </form>
    </section>
  )
}
