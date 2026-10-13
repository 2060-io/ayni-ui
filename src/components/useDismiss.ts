/** Closes a popover on a pointer press outside its container or on Escape (UI-SHELL-016). */
import { type RefObject, useEffect } from 'react'

export function useDismiss(open: boolean, container: RefObject<HTMLElement | null>, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && container.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, container, close])
}
