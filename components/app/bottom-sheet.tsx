'use client'

import { useEffect, useCallback, useRef, useId, type ReactNode } from 'react'
import { X } from 'lucide-react'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Desktop max-width: 'sm' (448px) | 'md' (512px, default) | 'lg' (640px) | 'xl' (768px) */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-xl',
  xl: 'md:max-w-3xl',
} as const

export function BottomSheet({ open, onClose, title, children, size = 'md' }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  const titleId = useId()

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  // Capture trigger element + focus trap + return focus on close
  useEffect(() => {
    if (open) {
      // Remember which element opened the sheet so we can return focus
      triggerRef.current = document.activeElement

      // Focus first interactive element inside the sheet (close button or first focusable)
      const timer = requestAnimationFrame(() => {
        if (!sheetRef.current) return
        const focusable = sheetRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        focusable?.focus()
      })
      return () => cancelAnimationFrame(timer)
    } else {
      // Return focus to trigger element
      if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
      triggerRef.current = null
    }
  }, [open])

  // Focus trap: keep Tab cycling inside the sheet
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !sheetRef.current) return

      const focusableEls = sheetRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusableEls.length === 0) return

      const first = focusableEls[0]
      const last = focusableEls[focusableEls.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center transition-[right] duration-300"
      style={{ right: 'var(--chat-sidebar-width, 0px)' }}
      onClick={handleBackdrop}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`w-full max-h-[92vh] overflow-y-auto bg-[var(--paper)] rounded-t-[var(--r-lg)] shadow-[var(--s2)] md:mx-4 ${sizeClasses[size]} md:rounded-[var(--r-lg)] safe-bottom animate-sheet-enter`}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 md:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-md)]" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
            <h3 id={titleId} className="font-semibold text-[var(--ink)]">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Sluiten"
              className="touch-target rounded-md text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
