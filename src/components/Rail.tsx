/**
 * The controller rail (UI-SHELL-001/002/011, D32): one tile per organization or persona behind the
 * person's agents, pinned ones above a separator; an unverified agent stands alone, greyed. Dragging a
 * tile across the separator pins or unpins it; dragging within the pinned area reorders.
 * The rail ends with the settings tile and, below it, the brand mark from the brand configuration (UI-THEME-004).
 */
import { orderControllers } from '@2060.io/ayni-ui-core'
import { Pin, Plus, Settings as SettingsIcon } from 'lucide-react'
import { type DragEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'

const MIME = 'application/x-ayni-controller'

export function Rail() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const agentsOf = (did: string) => snap.agents.filter((a) => a.controllerDid === did)
  const lastMessageAt = (did: string) => agentsOf(did).reduce((m, a) => (a.lastMessageAt > m ? a.lastMessageAt : m), '')
  const controllers = orderControllers(snap.controllers, (c) => lastMessageAt(c.did))
  const pinned = controllers.filter((c) => c.pinned)
  const rest = controllers.filter((c) => !c.pinned)

  const accept = (e: DragEvent) => {
    if (!dragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const finish = () => {
    setDragging(null)
    setOver(null)
  }
  const dropOn = (zone: 'pinned' | 'rest', beforeDid: string | null) => (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const did = dragging ?? e.dataTransfer.getData(MIME)
    finish()
    if (!did) return
    void hub.movePin(did, zone === 'pinned', beforeDid).catch((err) => hub.notify('error', String(err.message ?? err)))
  }

  const tile = (c: (typeof controllers)[number]) => {
    const dids = new Set(agentsOf(c.did).map((a) => a.did))
    const unread = snap.sessions.filter((s) => dids.has(s.agentDid)).reduce((n, s) => n + s.unreadCount, 0)
    const waiting = snap.sessions.some((s) => dids.has(s.agentDid) && (s.ayni?.pendingApprovals ?? 0) > 0)
    const selected = snap.selectedControllerDid === c.did
    return (
      <button
        key={c.did}
        type="button"
        className={[
          'rail-item',
          selected ? 'selected' : '',
          c.kind === 'unverified' ? 'inactive' : '',
          dragging === c.did ? 'dragging' : '',
          over === c.did && dragging && dragging !== c.did ? 'drop-before' : '',
        ].join(' ')}
        title={c.kind === 'unverified' ? `${c.name} · ${t('rail.unverified')}` : c.name}
        aria-label={unread ? `${c.name}, ${t('rail.unread', { count: unread })}` : c.name}
        aria-current={selected ? 'true' : undefined}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(MIME, c.did)
          e.dataTransfer.effectAllowed = 'move'
          setDragging(c.did)
        }}
        onDragEnd={finish}
        onDragOver={(e) => {
          accept(e)
          if (c.pinned) setOver(c.did)
        }}
        onDragLeave={() => setOver((o) => (o === c.did ? null : o))}
        onDrop={c.pinned ? dropOn('pinned', c.did) : dropOn('rest', null)}
        onClick={() => hub.selectController(c.did)}
      >
        <Avatar name={c.name} src={c.logoRef} size={48} />
        {unread ? <span className="badge">{unread}</span> : null}
        {waiting ? <span className="dot" aria-hidden="true" /> : null}
      </button>
    )
  }

  return (
    <nav className="rail" aria-label={t('app.controllers')}>
      <fieldset
        className={['rail-zone', dragging ? 'droppable' : ''].join(' ')}
        aria-label={t('rail.pinned')}
        onDragOver={accept}
        onDrop={dropOn('pinned', null)}
      >
        {pinned.map(tile)}
      </fieldset>
      {pinned.length || dragging ? (
        <div className="rail-separator-wrap" onDragOver={accept} onDrop={dropOn('pinned', null)} aria-hidden="true">
          <hr className={['rail-separator', dragging ? 'droppable' : ''].join(' ')} title={t('rail.pinnedHint')} />
          <Pin size={11} className="rail-pin" />
        </div>
      ) : null}
      <fieldset
        className={['rail-zone', 'rail-rest', dragging ? 'droppable' : ''].join(' ')}
        aria-label={t('rail.recent')}
        onDragOver={accept}
        onDrop={dropOn('rest', null)}
      >
        {rest.map(tile)}
        <button
          type="button"
          className={['rail-item', 'ghost', snap.view === 'add' || snap.view === 'directory' ? 'selected' : ''].join(
            ' '
          )}
          title={t('app.addAgent')}
          aria-label={t('app.addAgent')}
          onClick={() => hub.setView(snap.view === 'add' || snap.view === 'directory' ? 'list' : 'add')}
        >
          <Plus size={22} />
        </button>
      </fieldset>
      <div className="spacer" />
      <button
        type="button"
        className={['rail-item', 'ghost', snap.view === 'settings' ? 'selected' : ''].join(' ')}
        title={t('app.settings')}
        aria-label={t('app.settings')}
        aria-pressed={snap.view === 'settings'}
        onClick={() => hub.setView(snap.view === 'settings' ? 'list' : 'settings')}
      >
        <SettingsIcon size={22} />
      </button>
      {snap.brand.logo ? (
        <img
          className="rail-brand"
          src={snap.brand.logo}
          alt={snap.brand.appName}
          title={snap.brand.appName}
          width={32}
          height={32}
          draggable={false}
        />
      ) : null}
    </nav>
  )
}
