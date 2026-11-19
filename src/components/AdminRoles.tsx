/**
 * The admin view of roles (UI-CONV-042, PROF-DIR-003, agent D92): for the holders of the admin role, who holds which
 * role and why (the entry of the employee list that gives it), and the changes of the list, newest first.
 */
import type { AdminChange, AdminRoleEntry } from '@ayni.org/ayni-ui-core'
import { ProfileError } from '@ayni.org/ayni-ui-core'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime } from '../i18n/index.js'
import { useHub, useSnapshot } from '../state/useHub.js'

export function AdminPage() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t, i18n } = useTranslation()
  const agent = snap.agents.find((a) => a.did === snap.adminFor)
  const [tab, setTab] = useState<'roles' | 'changes'>('roles')
  const [entries, setEntries] = useState<AdminRoleEntry[] | null>(null)
  const [changes, setChanges] = useState<AdminChange[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState('')
  const refused = (e: unknown) =>
    setError(e instanceof ProfileError && e.status === 403 ? t('admin.notAdmin') : String((e as Error).message))
  const loadChanges = (before?: string) => {
    if (!agent) return
    hub
      .adminChanges(agent.did, before)
      .then((page) => {
        setChanges((list) => [...(before ? (list ?? []) : []), ...page.changes])
        setNext(page.nextBefore)
      })
      .catch(refused)
  }
  useEffect(() => {
    if (!agent) return
    let live = true
    hub
      .adminRoles(agent.did)
      .then((list) => live && setEntries(list))
      .catch((e) => live && refused(e))
    loadChanges()
    return () => {
      live = false
    }
  }, [agent?.did, hub])
  if (!agent) return <div className="center" />
  const list = (items: string[]) => (items.length ? items.join(', ') : t('admin.none'))
  return (
    <div className="admin-page">
      <header className="conv-header">
        <button type="button" className="icon-btn back" aria-label={t('app.back')} onClick={() => hub.setView('list')}>
          <ArrowLeft size={20} />
        </button>
        <div className="conv-title">
          <h1>{t('admin.title')}</h1>
          <span className="conv-sub">{agent.name}</span>
        </div>
      </header>
      <div className="segments" role="tablist">
        {(['roles', 'changes'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === s}
            className={tab === s ? 'seg on' : 'seg'}
            onClick={() => setTab(s)}
          >
            {t(`admin.${s}`)}
          </button>
        ))}
      </div>
      <div className="space-body" role="tabpanel">
        {error ? <div className="banner warning">{error}</div> : null}
        {tab === 'roles' ? (
          entries === null ? (
            error ? null : (
              <div className="muted">{t('app.loading')}</div>
            )
          ) : (
            <div className="table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>{t('admin.name')}</th>
                    <th>{t('admin.department')}</th>
                    <th>{t('admin.groups')}</th>
                    <th>{t('admin.rolesCol')}</th>
                    <th>{t('admin.why')}</th>
                    <th>{agent.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.directoryId}>
                      <td>
                        <b>{e.name}</b>
                      </td>
                      <td>{e.department ?? ''}</td>
                      <td>{list(e.groups)}</td>
                      <td>{list(e.roles)}</td>
                      <td className="muted">{t('admin.entry', { id: e.directoryId })}</td>
                      <td>
                        {e.onAgent
                          ? t('admin.onAgent', { agent: agent.name })
                          : t('admin.notOnAgent', { agent: agent.name })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : changes === null ? (
          error ? null : (
            <div className="muted">{t('app.loading')}</div>
          )
        ) : changes.length ? (
          <>
            <ol className="activity-list">
              {changes.map((c, i) => (
                <li key={`${c.at}-${c.directoryId}-${i}`}>
                  <span className="time">{formatTime(c.at, i18n.language)}</span>
                  <span>
                    {c.kind === 'changed'
                      ? t('admin.changed', { name: c.name, fields: c.fields.join(', ') })
                      : t(`admin.${c.kind}`, { name: c.name })}
                    {c.rolesBefore || c.rolesAfter ? (
                      <span className="muted small">
                        {' '}
                        ·{' '}
                        {t('admin.rolesFromTo', { before: list(c.rolesBefore ?? []), after: list(c.rolesAfter ?? []) })}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            {next ? (
              <button type="button" className="btn small" onClick={() => loadChanges(next)}>
                {t('admin.more')}
              </button>
            ) : null}
          </>
        ) : (
          <div className="muted empty">{t('admin.empty')}</div>
        )}
      </div>
    </div>
  )
}
