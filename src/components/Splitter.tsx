/** The draggable line between the column and the conversation (D32): sets the column width, kept per browser profile. */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'

const MIN = 220
const MAX = 560

export function applyColumnWidth(width: number | undefined): void {
  const root = document.documentElement
  if (width) root.style.setProperty('--column', `${Math.min(MAX, Math.max(MIN, width))}px`)
  else root.style.removeProperty('--column')
}

export function Splitter() {
  const hub = useHub()
  const snap = useSnapshot()
  const { t } = useTranslation()
  const dragging = useRef(false)
  useEffect(() => applyColumnWidth(snap.prefs.columnWidth), [snap.prefs.columnWidth])
  const railWidth = () => {
    const rail = document.querySelector<HTMLElement>('.rail')
    return rail && getComputedStyle(rail).display !== 'none' ? rail.getBoundingClientRect().width : 0
  }
  const current = () => snap.prefs.columnWidth ?? 300
  return (
    <hr
      className="splitter"
      aria-orientation="vertical"
      aria-label={t('app.resizeColumn')}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={current()}
      tabIndex={0}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        applyColumnWidth(e.clientX - railWidth())
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        const width = Math.min(MAX, Math.max(MIN, Math.round(e.clientX - railWidth())))
        void hub.setPreferences({ columnWidth: width })
      }}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0
        if (!step) return
        e.preventDefault()
        void hub.setPreferences({ columnWidth: Math.min(MAX, Math.max(MIN, current() + step)) })
      }}
      onDoubleClick={() => void hub.setPreferences({ columnWidth: undefined })}
    />
  )
}
