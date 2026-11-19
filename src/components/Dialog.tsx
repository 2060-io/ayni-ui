/** A modal sheet over the page: its title, a close button, Escape and a press outside close it. */
import { X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.dialog-close)')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={ref} className={wide ? 'dialog wide' : 'dialog'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="muted dialog-sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="icon-btn dialog-close" aria-label={t('app.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
