/**
 * The person's memories and preferences (UI-CONV-032..035): the sheet of one, the list of a space's, what a reply
 * used in its Info, and the line "<agent> updated a memory" in the transcript. Only the person sees them; the agent
 * writes them; the person deletes them, and changes one by telling the agent.
 */
import {
  type Memories,
  type MemoryInfo,
  type PreferenceInfo,
  type TranscriptMessage,
  usageOf,
  usageSummaryOf,
} from '@ayni.org/ayni-ui-core'
import { ChevronRight, Lock, MessageSquare, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Dialog } from './Dialog.js'
import { spaceTitle } from './SpaceParts.js'

/** The person's memories with an agent, of one space or of all, read again whenever one is deleted. */
export function useMemories(
  agentDid: string | undefined,
  spaceId?: string
): { memories: Memories | null; error: string } {
  const hub = useHub()
  const snap = useSnapshot()
  const [memories, setMemories] = useState<Memories | null>(null)
  const [error, setError] = useState('')
  const version = snap.memoriesVersion
  useEffect(() => {
    if (!agentDid) return
    let live = true
    hub
      .memories(agentDid, spaceId)
      .then((m) => {
        if (live) {
          setMemories(m)
          setError('')
        }
      })
      .catch((e) => live && setError(String((e as Error).message)))
    return () => {
      live = false
    }
  }, [agentDid, spaceId, version, hub])
  return { memories, error }
}

const useWhen = () => {
  const { i18n } = useTranslation()
  return (iso: string) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : ''
}

/** A space's memories, newest first, each opening its sheet (UI-CONV-031, UI-CONV-033). */
export function MemoryList({ agentDid, spaceId }: { agentDid: string; spaceId: string }) {
  const hub = useHub()
  const { t } = useTranslation()
  const when = useWhen()
  const { memories, error } = useMemories(agentDid, spaceId)
  if (error) return <div className="banner warning">{error}</div>
  if (!memories) return <div className="muted">{t('app.loading')}</div>
  const mine = memories.memories.filter((m) => !m.spaceId || m.spaceId === spaceId)
  if (!mine.length) return <div className="muted empty">{t('spaces.noMemories')}</div>
  return (
    <ul className="memory-list">
      {mine.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            className="memory-item"
            onClick={() => hub.openMemory({ agentDid, memoryId: m.id, spaceId })}
          >
            <span className="memory-text">{m.content}</span>
            <span className="memory-by">
              <MessageSquare size={12} aria-hidden="true" />
              {[m.source ? t('memories.from', { title: m.source.title }) : '', when(m.updatedAt)]
                .filter(Boolean)
                .join(' · ')}
              <ChevronRight size={14} aria-hidden="true" className="memory-chevron" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The sheet of a memory or a preference (UI-CONV-032): what it says, its space, when the agent wrote it, where it came
 * from, how to change it, and Delete. No field edits it.
 */
export function MemorySheet() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const when = useWhen()
  const ref = snap.memoryFor
  const agent = snap.agents.find((a) => a.did === ref?.agentDid)
  const { memories, error } = useMemories(ref?.agentDid, ref?.memoryId ? ref.spaceId : undefined)
  const [busy, setBusy] = useState(false)
  if (!ref || !agent) return null
  const close = () => hub.openMemory(null)
  const spaces = snap.spaces[agent.did]?.spaces ?? []
  const memory: MemoryInfo | undefined = ref.memoryId
    ? memories?.memories.find((m) => m.id === ref.memoryId)
    : undefined
  const preference: PreferenceInfo | undefined = ref.preferenceKey
    ? memories?.preferences.find((p) => p.key === ref.preferenceKey)
    : undefined
  const remove = async () => {
    setBusy(true)
    try {
      if (memory) await hub.deleteMemory(agent.did, memory.id)
      else if (preference) await hub.deletePreference(agent.did, preference.key)
      hub.notify('info', t('memories.deleted'))
      close()
    } catch (e) {
      setBusy(false)
      hub.notify('error', String((e as Error).message))
    }
  }
  const deleteButton = (
    <button type="button" className="btn danger-soft full" disabled={busy} onClick={() => void remove()}>
      <Trash2 size={16} aria-hidden="true" /> {t('memories.delete')}
    </button>
  )
  if (ref.preferenceKey) {
    return (
      <Dialog
        title={t('memories.preferenceTitle')}
        subtitle={preference ? t('memories.preferenceSubtitle', { time: when(preference.updatedAt) }) : undefined}
        onClose={close}
      >
        {error ? <div className="banner warning">{error}</div> : null}
        {!memories ? (
          <div className="muted">{t('app.loading')}</div>
        ) : preference ? (
          <>
            <div className="memory-field">
              <span className="muted memory-key">{preference.key}</span>
              {preference.value}
            </div>
            <div className="callout">
              <MessageSquare size={17} aria-hidden="true" className="callout-icon" />
              <span>{t('memories.changePreference', { agent: agent.name })}</span>
            </div>
            {deleteButton}
          </>
        ) : (
          <div className="muted">{t('memories.notKept')}</div>
        )}
      </Dialog>
    )
  }
  const space = spaces.find((s) => s.id === (memory?.spaceId ?? ref.spaceId))
  const title = spaceTitle(space, t)
  const source = memory?.source
  const sourceRecord = source
    ? snap.sessions.find((s) => s.agentDid === agent.did && s.conversationId === source.conversationId)
    : undefined
  return (
    <Dialog
      title={t('memories.title')}
      subtitle={
        memory ? t('memories.subtitle', { space: title, agent: agent.name, time: when(memory.updatedAt) }) : undefined
      }
      onClose={close}
    >
      {error ? <div className="banner warning">{error}</div> : null}
      {!memories ? (
        <div className="muted">{t('app.loading')}</div>
      ) : memory ? (
        <>
          <div className="memory-field">{memory.content}</div>
          <div className="memory-source muted">
            <MessageSquare size={13} aria-hidden="true" />
            {source ? (
              sourceRecord ? (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    close()
                    hub.selectSession(sourceRecord.sessionId)
                  }}
                >
                  {t('memories.from', { title: source.title || sourceRecord.title })}
                </button>
              ) : (
                <span>{t('memories.from', { title: source.title })}</span>
              )
            ) : (
              <span>{t('memories.fromGone')}</span>
            )}
          </div>
          <div className="callout">
            <MessageSquare size={17} aria-hidden="true" className="callout-icon" />
            <span>{t('memories.changeMemory', { agent: agent.name, space: title })}</span>
          </div>
          {deleteButton}
        </>
      ) : (
        <div className="muted">{t('memories.notKept')}</div>
      )}
    </Dialog>
  )
}

/**
 * What a reply used (UI-CONV-034), in its Info: "2 memories of yours in Truck 14 recall · 1 preference", each
 * opening its sheet, a memory deleted since shown as no longer kept. Read from history for a reply received live.
 */
export function UsedMemories({
  sessionId,
  message,
  agentDid,
  spaceId,
}: {
  sessionId: string
  message: TranscriptMessage
  agentDid: string
  spaceId: string | undefined
}) {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  const usage = usageOf(message)
  const [reading, setReading] = useState(!usage)
  useEffect(() => {
    if (usage) return
    let live = true
    setReading(true)
    hub
      .readUsage(sessionId, message.id)
      .catch(() => false)
      .finally(() => live && setReading(false))
    return () => {
      live = false
    }
  }, [sessionId, message.id, !!usage, hub])
  const { memories } = useMemories(usage && (usage.memories.length || usage.preferences.length) ? agentDid : undefined)
  if (!usage) {
    // history does not say (yet): nothing is claimed
    return reading ? (
      <section className="info-card">
        <h3>{t('memories.used')}</h3>
        <div className="muted">{t('memories.reading')}</div>
      </section>
    ) : null
  }
  const spaces = snap.spaces[agentDid]?.spaces ?? []
  const summary = usageSummaryOf(usage, memories ?? { memories: [], preferences: [] }, spaceId)
  const nameOf = (id: string) =>
    spaceTitle(
      spaces.find((s) => s.id === id),
      t
    )
  const line = [
    ...summary.bySpace.map((g) => t('memories.usedInSpace', { count: g.memories.length, space: nameOf(g.spaceId) })),
    ...(summary.preferences.length ? [t('memories.usedPreferences', { count: summary.preferences.length })] : []),
  ].join(' · ')
  return (
    <section className="info-card used-memories">
      <h3>{t('memories.used')}</h3>
      {!line ? (
        <div className="muted">{t('memories.usedNone')}</div>
      ) : (
        <>
          <div className="used-line">{line}</div>
          <ul className="used-list">
            {summary.bySpace.flatMap((g) =>
              g.memories.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="link used-item"
                    onClick={() => hub.openMemory({ agentDid, memoryId: m.id, spaceId: m.spaceId || undefined })}
                  >
                    <Lock size={13} aria-hidden="true" className="used-icon" />
                    {m.memory ? m.memory.content : memories ? t('memories.noLongerKept') : '…'}
                  </button>
                </li>
              ))
            )}
            {summary.preferences.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  className="link used-item"
                  onClick={() => hub.openMemory({ agentDid, preferenceKey: p.key })}
                >
                  <SlidersHorizontal size={13} aria-hidden="true" className="used-icon" />
                  {p.preference ? p.preference.value : memories ? t('memories.noLongerKept') : p.key}
                </button>
              </li>
            ))}
          </ul>
          <div className="muted small">{t('memories.onlyYouList')}</div>
        </>
      )}
    </section>
  )
}

/** The line after a reply whose turn added, changed or removed a memory (UI-CONV-035), opening its sheet. */
export function MemoryLine({
  agentDid,
  agentName,
  content,
}: {
  agentDid: string
  agentName: string
  content: { memoryId?: unknown; spaceId?: unknown }
}) {
  const hub = useHub()
  const { t } = useTranslation()
  if (typeof content.memoryId !== 'string') return null
  const memoryId = content.memoryId
  const spaceId = typeof content.spaceId === 'string' && content.spaceId ? content.spaceId : undefined
  return (
    <div className="memory-line">
      <button type="button" className="link" onClick={() => hub.openMemory({ agentDid, memoryId, spaceId })}>
        <Pencil size={13} aria-hidden="true" />
        {t('memories.updated', { agent: agentName })}
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    </div>
  )
}
