/**
 * The agent rail (UI-SHELL-001/002/011): pinned agents above a separator, in the order the person
 * arranged them; the others below by recency, not-linked last. Dragging an agent across the
 * separator pins or unpins it; dragging within the pinned area reorders.
 */
import { orderAgents } from '@2060.io/hologram-ui-core'
import { Pin, Plus, Search, Settings as SettingsIcon } from 'lucide-react'
import { type DragEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'

const MIME = 'application/x-hologram-agent'

export function Rail() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const linked = (did: string) => snap.sessions.some((s) => s.agentDid === did && s.state === 'bound')
  const agents = orderAgents(snap.agents, (a) => linked(a.did))
  const pinned = agents.filter((a) => a.pinned)
  const rest = agents.filter((a) => !a.pinned)

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

  const item = (a: (typeof agents)[number]) => {
    const unread = snap.sessions.filter((s) => s.agentDid === a.did).reduce((n, s) => n + s.unreadCount, 0)
    const waiting = snap.sessions.some((s) => s.agentDid === a.did && (s.hologram?.pendingApprovals ?? 0) > 0)
    const selected = snap.selectedAgentDid === a.did
    return (
      <button
        key={a.did}
        type="button"
        className={[
          'rail-item',
          selected ? 'selected' : '',
          linked(a.did) ? '' : 'inactive',
          dragging === a.did ? 'dragging' : '',
          over === a.did && dragging && dragging !== a.did ? 'drop-before' : '',
        ].join(' ')}
        title={a.name}
        aria-label={unread ? `${a.name}, ${t('rail.unread', { count: unread })}` : a.name}
        aria-current={selected ? 'true' : undefined}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(MIME, a.did)
          e.dataTransfer.effectAllowed = 'move'
          setDragging(a.did)
        }}
        onDragEnd={finish}
        onDragOver={(e) => {
          accept(e)
          if (a.pinned) setOver(a.did)
        }}
        onDragLeave={() => setOver((o) => (o === a.did ? null : o))}
        onDrop={a.pinned ? dropOn('pinned', a.did) : dropOn('rest', null)}
        onClick={() => hub.selectAgent(a.did)}
      >
        <Avatar name={a.name} src={a.logoRef} />
        {unread ? <span className="badge">{unread}</span> : null}
        {waiting ? <span className="dot" aria-hidden="true" /> : null}
      </button>
    )
  }

  return (
    <nav className="rail" aria-label={t('app.agents')}>
      <fieldset
        className={['rail-zone', dragging ? 'droppable' : ''].join(' ')}
        aria-label={t('rail.pinned')}
        onDragOver={accept}
        onDrop={dropOn('pinned', null)}
      >
        {pinned.map(item)}
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
        {rest.map(item)}
        <button
          type="button"
          className="rail-item ghost"
          title={t('app.addAgent')}
          aria-label={t('app.addAgent')}
          onClick={() => hub.setView('add')}
        >
          <Plus size={22} />
        </button>
      </fieldset>
      <div className="spacer" />
      <button
        type="button"
        className="rail-item ghost"
        title={t('app.findAgents')}
        aria-label={t('app.findAgents')}
        onClick={() => hub.setView('directory')}
      >
        <Search size={22} />
      </button>
      <button
        type="button"
        className="rail-item ghost"
        title={t('app.settings')}
        aria-label={t('app.settings')}
        onClick={() => hub.setView('settings')}
      >
        <SettingsIcon size={22} />
      </button>
    </nav>
  )
}
