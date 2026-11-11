/**
 * The controller rail (UI-SHELL-001/002/011, D32): one tile per organization or persona behind the
 * person's agents, pinned ones above a separator; an unverified agent stands alone, greyed. The whole
 * rail is the drop surface: a tile dropped above the separator is pinned, before the pinned tile under
 * the pointer or last; a tile dropped anywhere below the separator is unpinned. The separator and its
 * pin stay visible when nothing is pinned, so the pinned area can be found. A tile's context menu
 * (right-click, long press, the keyboard's context-menu key) offers Pin or Unpin for touch and keyboard.
 * The rail ends with the settings tile and, below it, the brand mark from the brand configuration (UI-THEME-004), which opens the About page (UI-SHELL-017).
 */
import { HOME_DESIGN, orderControllers } from '@ayni.org/ayni-ui-core'
import { Pin, PinOff, Plus, Settings as SettingsIcon } from 'lucide-react'
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'
import { Avatar } from './Avatar.js'
import { useDismiss } from './useDismiss.js'

const MIME = 'application/x-ayni-controller'
const D = HOME_DESIGN.rail

/** Where a drop would land: among the pinned, before a tile (last when `before` is null), or among the rest. */
interface DropTarget {
  zone: 'pinned' | 'rest'
  before: string | null
}

export function Rail() {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const railRef = useRef<HTMLElement>(null)
  const separatorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [target, setTarget] = useState<DropTarget | null>(null)
  const [menu, setMenu] = useState<{ did: string; top: number; left: number } | null>(null)
  useDismiss(
    !!menu,
    menuRef,
    useCallback(() => setMenu(null), [])
  )
  useEffect(() => {
    if (menu) menuRef.current?.querySelector('button')?.focus()
  }, [menu])

  const agentsOf = (did: string) => snap.agents.filter((a) => a.controllerDid === did)
  // connection order: when the controller's first agent was added; activity never reorders the rail (D37)
  const connectedAt = (did: string) => agentsOf(did).reduce((m, a) => (m === '' || a.addedAt < m ? a.addedAt : m), '')
  const controllers = orderControllers(snap.controllers, (c) => connectedAt(c.did))
  const pinned = controllers.filter((c) => c.pinned)
  const rest = controllers.filter((c) => !c.pinned)
  const menuController = menu ? controllers.find((c) => c.did === menu.did) : undefined

  /** The zone and insertion point under the pointer; the separator's midline divides the two zones. */
  const targetAt = (e: DragEvent): DropTarget => {
    const sep = separatorRef.current?.getBoundingClientRect()
    if (sep && e.clientY > sep.top + sep.height / 2) return { zone: 'rest', before: null }
    const tiles = railRef.current?.querySelectorAll<HTMLElement>('[data-pinned-did]') ?? []
    for (const el of tiles) {
      const did = el.dataset.pinnedDid
      if (!did || did === dragging) continue
      const r = el.getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) return { zone: 'pinned', before: did }
    }
    return { zone: 'pinned', before: null }
  }
  const ours = (e: DragEvent) => !!dragging || Array.from(e.dataTransfer.types).includes(MIME)
  const finish = () => {
    setDragging(null)
    setTarget(null)
  }
  const onDragOver = (e: DragEvent) => {
    if (!ours(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const next = targetAt(e)
    setTarget((cur) => (cur && cur.zone === next.zone && cur.before === next.before ? cur : next))
  }
  const onDragLeave = (e: DragEvent) => {
    const to = e.relatedTarget as Node | null
    if (!to || !railRef.current?.contains(to)) setTarget(null)
  }
  const onDrop = (e: DragEvent) => {
    if (!ours(e)) return
    e.preventDefault()
    const did = dragging ?? e.dataTransfer.getData(MIME)
    const where = targetAt(e)
    finish()
    if (!did) return
    void hub
      .movePin(did, where.zone === 'pinned', where.before)
      .catch((err) => hub.notify('error', String(err.message ?? err)))
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
          target?.zone === 'pinned' && target.before === c.did ? 'drop-before' : '',
        ].join(' ')}
        title={c.kind === 'unverified' ? `${c.name} · ${t('rail.unverified')}` : c.name}
        aria-label={unread ? `${c.name}, ${t('rail.unread', { count: unread })}` : c.name}
        aria-current={selected ? 'true' : undefined}
        data-pinned-did={c.pinned ? c.did : undefined}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(MIME, c.did)
          e.dataTransfer.effectAllowed = 'move'
          // after the browser took its drag image, so the faded tile is not what travels with the pointer
          setTimeout(() => setDragging(c.did), 0)
        }}
        onDragEnd={finish}
        onClick={() => hub.selectController(c.did)}
        onContextMenu={(e) => {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ did: c.did, top: r.top, left: r.right + 6 })
        }}
      >
        <Avatar name={c.name} src={c.logoRef} size={D.tile.size} />
        {unread ? <span className="badge">{unread}</span> : null}
        {waiting ? <span className="dot" aria-hidden="true" /> : null}
      </button>
    )
  }

  const zoneClass = (zone: DropTarget['zone']) =>
    [dragging ? 'droppable' : '', target?.zone === zone ? 'target' : ''].join(' ')

  return (
    <nav
      className="rail"
      aria-label={t('app.controllers')}
      ref={railRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <fieldset className={['rail-zone', 'rail-pinned', zoneClass('pinned')].join(' ')} aria-label={t('rail.pinned')}>
        {pinned.map(tile)}
      </fieldset>
      <div className="rail-separator-wrap" ref={separatorRef} aria-hidden="true">
        <hr
          className={['rail-separator', target?.zone === 'pinned' ? 'target' : ''].join(' ')}
          title={t('rail.pinnedHint')}
        />
        <Pin size={D.separator.pinSize} className="rail-pin" />
      </div>
      <fieldset className={['rail-zone', 'rail-rest', zoneClass('rest')].join(' ')} aria-label={t('rail.recent')}>
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
          <Plus size={D.ghost.iconSize} />
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
        <SettingsIcon size={D.ghost.iconSize} />
      </button>
      {(snap.brand.mark ?? snap.brand.logo) ? (
        <button
          type="button"
          className={['rail-item', 'brand', snap.view === 'about' ? 'selected' : ''].join(' ')}
          title={t('app.about')}
          aria-label={t('app.about')}
          aria-pressed={snap.view === 'about'}
          onClick={() => hub.setView(snap.view === 'about' ? 'list' : 'about')}
        >
          <img
            className="rail-brand"
            src={snap.brand.mark ?? snap.brand.logo}
            alt=""
            width={44}
            height={44}
            draggable={false}
          />
        </button>
      ) : null}
      {menu && menuController ? (
        <div
          ref={menuRef}
          className="menu-popover rail-menu"
          role="menu"
          aria-label={menuController.name}
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              void hub.togglePin(menuController.did).catch((err) => hub.notify('error', String(err.message ?? err)))
            }}
          >
            {menuController.pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
            {menuController.pinned ? t('rail.unpin') : t('rail.pin')}
          </button>
        </div>
      ) : null}
    </nav>
  )
}
