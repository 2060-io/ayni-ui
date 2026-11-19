/**
 * "What <agent> keeps about you" (UI-CONV-033, PROF-MEM-003): the person's preferences, used in every space; their
 * memories by space, each opening that space's list; their conversations in each space with how long the space keeps
 * them; and what the agent verified about them, read-only.
 */
import type { AboutMe } from '@ayni.org/ayni-ui-core'
import { ArrowLeft, BadgeCheck, ChevronDown, ChevronRight, MessageSquare, SlidersHorizontal, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { MemoryList } from './Memories.js'

export function KeepsPage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const agent = snap.agents.find((a) => a.did === snap.keepsFor)
  const [about, setAbout] = useState<AboutMe | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const version = snap.memoriesVersion
  useEffect(() => {
    if (!agent) return
    let live = true
    hub
      .aboutMe(agent.did)
      .then((a) => live && setAbout(a))
      .catch((e) => live && setError(String((e as Error).message)))
    return () => {
      live = false
    }
  }, [agent, version, hub])
  if (!agent) return <div className="center" />
  const spaces = snap.spaces[agent.did]?.spaces ?? []
  // Personal in the UI's own word; another space by the title the agent gives
  const titleOf = (spaceId: string, given: string) => {
    const space = spaces.find((s) => s.id === spaceId)
    return space?.kind === 'personal' ? t('spaces.personal') : given || space?.title || ''
  }
  const date = (iso: string) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso)) : ''
  return (
    <div className="keeps-page">
      <header className="conv-header">
        <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
          <ArrowLeft size={20} />
        </button>
        <div className="conv-title">
          <h1>{t('keeps.title', { agent: agent.name })}</h1>
        </div>
      </header>
      <div className="panel keeps-body">
        <p className="muted">{t('keeps.intro', { agent: agent.name })}</p>
        {error ? <div className="banner warning">{error}</div> : null}
        {!about ? (
          error ? null : (
            <div className="muted">{t('app.loading')}</div>
          )
        ) : (
          <>
            <section className="space-section">
              <h3 className="section-label">
                <SlidersHorizontal size={13} aria-hidden="true" /> {t('keeps.preferences')}
              </h3>
              {about.preferences.length ? (
                about.preferences.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="keeps-row"
                    onClick={() => hub.openMemory({ agentDid: agent.did, preferenceKey: p.key })}
                  >
                    <span className="space-text">
                      <span className="space-name">{p.value}</span>
                      <span className="space-sub">
                        {[t('keeps.usedEverywhere'), date(p.updatedAt)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))
              ) : (
                <div className="muted empty">{t('keeps.noPreferences')}</div>
              )}
            </section>
            <section className="space-section">
              <h3 className="section-label">
                <User size={13} aria-hidden="true" /> {t('keeps.memories')}
              </h3>
              {about.memoriesBySpace.length ? (
                about.memoriesBySpace.map((m) => {
                  const expanded = open === m.spaceId
                  return (
                    <div key={m.spaceId}>
                      <button
                        type="button"
                        className="keeps-row"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : m.spaceId)}
                      >
                        <span className="keeps-name">
                          {t('keeps.spaceCount', { space: titleOf(m.spaceId, m.title), count: m.count })}
                        </span>
                        {expanded ? (
                          <ChevronDown size={16} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={16} aria-hidden="true" />
                        )}
                      </button>
                      {expanded ? <MemoryList agentDid={agent.did} spaceId={m.spaceId} /> : null}
                    </div>
                  )
                })
              ) : (
                <div className="muted empty">{t('keeps.noMemories')}</div>
              )}
              <p className="muted hint">{t('spaces.onlyYouSee')}</p>
            </section>
            <section className="space-section">
              <h3 className="section-label">
                <MessageSquare size={13} aria-hidden="true" /> {t('keeps.conversations')}
              </h3>
              {about.conversations.map((c) => (
                <div key={c.spaceId} className="keeps-row static">
                  <span className="space-text">
                    <span className="space-name">
                      {t('keeps.conversationCount', { space: titleOf(c.spaceId, c.title), count: c.count })}
                    </span>
                    <span className="space-sub">
                      {c.retentionDays === null ? t('keeps.keptForever') : t('keeps.kept', { count: c.retentionDays })}
                    </span>
                  </span>
                </div>
              ))}
            </section>
            <section className="space-section">
              <h3 className="section-label">
                <BadgeCheck size={13} aria-hidden="true" /> {t('keeps.verified')}
              </h3>
              {about.verified.length ? (
                about.verified.map((v, i) => (
                  <div key={`${v.label}-${i}`} className="box verified">
                    <b>{v.label}</b>
                    <span className="muted small">
                      {t('keeps.verifiedLine', { source: v.source, time: date(v.verifiedAt) })}
                      {v.expiresAt ? ` · ${t('keeps.until', { time: date(v.expiresAt) })}` : ''}
                    </span>
                  </div>
                ))
              ) : (
                <div className="muted empty">{t('keeps.noVerified')}</div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
