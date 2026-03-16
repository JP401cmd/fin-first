'use client'

import { useState, useEffect, useCallback, useRef, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/use-scroll-lock'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Desktop max-width: 'sm' (448px) | 'md' (512px, default) | 'lg' (640px) | 'xl' (768px) | 'full' (1024px) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const sizeClasses = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-xl',
  xl: 'md:max-w-3xl',
  full: 'md:max-w-5xl',
} as const

const DISMISS_VELOCITY = 800   // px/s — fast flick always dismisses
const DISMISS_PERCENT = 0.3    // 30% of sheet height
const SPRING_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const VELOCITY_SAMPLES = 5

export function BottomSheet({ open, onClose, title, children, size = 'md' }: BottomSheetProps) {
  const [visible, setVisible] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  const titleId = useId()

  // Touch / drag state
  const dragStartY = useRef(0)
  const dragCurrentY = useRef(0)
  const isDragging = useRef(false)
  const velocityTracker = useRef<{ y: number; t: number }[]>([])

  // Animation state machine
  const phaseRef = useRef<'idle' | 'entering' | 'open' | 'closing'>('idle')
  const exitAnimationInProgress = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Reduced-motion preference
  const prefersReducedMotion = useRef(false)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.current = mql.matches
    const handler = (e: MediaQueryListEvent) => { prefersReducedMotion.current = e.matches }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // ── Animation helpers ──────────────────────────────────────

  const getSheetHeight = useCallback(() => sheetRef.current?.offsetHeight ?? 400, [])

  /** Exit animation for programmatic close (X / Escape / backdrop) */
  const animateExit = useCallback(() => {
    if (exitAnimationInProgress.current) return
    exitAnimationInProgress.current = true
    phaseRef.current = 'closing'

    const sheet = sheetRef.current
    const backdrop = backdropRef.current

    if (prefersReducedMotion.current || !sheet) {
      setVisible(false)
      exitAnimationInProgress.current = false
      phaseRef.current = 'idle'
      return
    }

    // Cancel entry animation if still running
    sheet.style.animation = 'none'
    sheet.style.transition = 'transform 250ms ease-out, opacity 250ms ease-out'
    sheet.style.transform = 'translateY(16px)'
    sheet.style.opacity = '0'

    if (backdrop) {
      backdrop.style.transition = 'background-color 200ms ease-out'
      backdrop.style.backgroundColor = 'rgba(0,0,0,0)'
    }

    const cleanup = () => {
      if (!exitAnimationInProgress.current) return
      setVisible(false)
      exitAnimationInProgress.current = false
      phaseRef.current = 'idle'
    }
    sheet.addEventListener('transitionend', cleanup, { once: true })
    // Safety fallback if transitionend doesn't fire
    setTimeout(cleanup, 300)
  }, [])

  /** Dismiss animation for swipe gesture — velocity-based duration */
  const animateDismiss = useCallback((velocity: number) => {
    if (exitAnimationInProgress.current) return
    exitAnimationInProgress.current = true
    phaseRef.current = 'closing'

    const sheet = sheetRef.current
    const backdrop = backdropRef.current
    const sheetHeight = getSheetHeight()
    const remaining = sheetHeight - Math.max(0, dragCurrentY.current)

    if (prefersReducedMotion.current || !sheet) {
      setVisible(false)
      exitAnimationInProgress.current = false
      phaseRef.current = 'idle'
      onCloseRef.current()
      return
    }

    const duration = Math.min(350, Math.max(150, (remaining / Math.max(velocity, 500)) * 1000))

    sheet.style.animation = 'none'
    sheet.style.transition = `transform ${duration}ms ${SPRING_CURVE}`
    sheet.style.transform = `translateY(${sheetHeight}px)`

    if (backdrop) {
      backdrop.style.transition = `background-color ${duration * 0.8}ms ease-out`
      backdrop.style.backgroundColor = 'rgba(0,0,0,0)'
    }

    const cleanup = () => {
      if (!exitAnimationInProgress.current) return
      setVisible(false)
      exitAnimationInProgress.current = false
      phaseRef.current = 'idle'
      onCloseRef.current()
    }
    sheet.addEventListener('transitionend', cleanup, { once: true })
    setTimeout(cleanup, duration + 50)
  }, [getSheetHeight])

  /** Spring snap-back when drag doesn't meet dismiss threshold */
  const animateSnapBack = useCallback(() => {
    const sheet = sheetRef.current
    const backdrop = backdropRef.current
    if (!sheet) return

    if (prefersReducedMotion.current) {
      sheet.style.transform = ''
      sheet.style.transition = ''
      sheet.style.willChange = ''
      if (backdrop) {
        backdrop.style.backgroundColor = 'rgba(0,0,0,0.5)'
        backdrop.style.transition = ''
      }
      return
    }

    sheet.style.transition = `transform 350ms ${SPRING_CURVE}`
    sheet.style.transform = ''

    if (backdrop) {
      backdrop.style.transition = `background-color 350ms ${SPRING_CURVE}`
      backdrop.style.backgroundColor = 'rgba(0,0,0,0.5)'
    }

    const onEnd = () => {
      sheet.style.transition = ''
      sheet.style.willChange = ''
      if (backdrop) backdrop.style.transition = ''
    }
    sheet.addEventListener('transitionend', onEnd, { once: true })
    setTimeout(onEnd, 400)
  }, [])

  // ── Programmatic close (X / Escape / backdrop click) ───────

  const handleProgrammaticClose = useCallback(() => {
    if (phaseRef.current === 'closing') return
    animateExit()
    onCloseRef.current()
  }, [animateExit])

  // ── State machine: open prop → visible state ───────────────

  useEffect(() => {
    if (open) {
      // (Re-)opening — cancel any in-progress exit
      exitAnimationInProgress.current = false
      phaseRef.current = 'entering'
      setVisible(true)

      // Reset leftover inline styles from previous exit/drag
      if (sheetRef.current) {
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform = ''
        sheetRef.current.style.opacity = ''
        sheetRef.current.style.willChange = ''
        sheetRef.current.style.animation = ''
      }
      if (backdropRef.current) {
        backdropRef.current.style.backgroundColor = 'rgba(0,0,0,0.5)'
        backdropRef.current.style.transition = ''
      }

      const timer = setTimeout(() => {
        if (phaseRef.current === 'entering') phaseRef.current = 'open'
      }, 280)
      return () => clearTimeout(timer)
    }

    // open went false — start exit if we haven't already
    if (phaseRef.current === 'idle' || phaseRef.current === 'closing') return
    if (exitAnimationInProgress.current) return
    animateExit()
  }, [open, animateExit])

  // ── Body scroll lock (tied to visible) ─────────────────────

  useScrollLock(visible)

  // ── Focus management ───────────────────────────────────────

  useEffect(() => {
    if (visible) {
      triggerRef.current = document.activeElement
      const timer = requestAnimationFrame(() => {
        if (!sheetRef.current) return
        const focusable = sheetRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        focusable?.focus()
      })
      return () => cancelAnimationFrame(timer)
    } else {
      if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
      triggerRef.current = null
    }
  }, [visible])

  // ── Focus trap + Escape ────────────────────────────────────

  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleProgrammaticClose(); return }
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
  }, [visible, handleProgrammaticClose])

  // ── Touch handlers ─────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragCurrentY.current = 0
    isDragging.current = true
    velocityTracker.current = [{ y: e.touches[0].clientY, t: Date.now() }]
    if (sheetRef.current) {
      sheetRef.current.style.animation = 'none' // cancel entry animation if still running
      sheetRef.current.style.transition = 'none'
      sheetRef.current.style.willChange = 'transform'
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return

    const rawDelta = e.touches[0].clientY - dragStartY.current

    // Rubber-banding for upward drag (15% resistance)
    const deltaY = rawDelta < 0 ? rawDelta * 0.15 : rawDelta

    sheetRef.current.style.transform = `translateY(${deltaY}px)`
    dragCurrentY.current = deltaY

    // Velocity tracking (last N samples)
    const now = Date.now()
    velocityTracker.current.push({ y: e.touches[0].clientY, t: now })
    if (velocityTracker.current.length > VELOCITY_SAMPLES) {
      velocityTracker.current.shift()
    }

    // Backdrop opacity follows finger
    if (backdropRef.current && rawDelta > 0) {
      const sheetHeight = getSheetHeight()
      const dragPercent = Math.min(1, rawDelta / sheetHeight)
      backdropRef.current.style.backgroundColor = `rgba(0,0,0,${0.5 * (1 - dragPercent)})`
      backdropRef.current.style.transition = 'none'
    }

    if (rawDelta > 0) e.preventDefault()
  }, [getSheetHeight])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !sheetRef.current) return
    isDragging.current = false

    // Calculate velocity from tracked samples
    const samples = velocityTracker.current
    let velocity = 0
    if (samples.length >= 2) {
      const last = samples[samples.length - 1]
      const prev = samples[0]
      const dt = last.t - prev.t
      if (dt > 0) velocity = ((last.y - prev.y) / dt) * 1000
    }

    const sheetHeight = getSheetHeight()
    const dragPercent = dragCurrentY.current / sheetHeight

    if (velocity > DISMISS_VELOCITY || dragPercent > DISMISS_PERCENT) {
      animateDismiss(Math.max(velocity, 500))
    } else {
      animateSnapBack()
    }

    dragCurrentY.current = 0
    velocityTracker.current = []
  }, [getSheetHeight, animateDismiss, animateSnapBack])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleProgrammaticClose()
  }, [handleProgrammaticClose])

  if (!visible) return null

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={handleBackdrop}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`flex w-full max-h-[92vh] flex-col bg-[var(--paper)] rounded-t-[var(--r-lg)] shadow-[var(--s2)] md:mx-4 ${sizeClasses[size]} md:rounded-[var(--r-lg)] safe-bottom animate-sheet-enter`}
      >
        {/* Drag handle — mobile only (44px touch target) */}
        <div
          className="flex shrink-0 justify-center py-5 cursor-grab md:hidden"
          style={{ touchAction: 'none' }}
          onTouchStart={handleTouchStart}
        >
          <div className="h-1 w-10 rounded-full bg-[var(--border-md)]" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
            <h3 id={titleId} className="font-semibold text-[var(--ink)]">{title}</h3>
            <button
              onClick={handleProgrammaticClose}
              aria-label="Sluiten"
              className="touch-target rounded-md text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehaviorY: 'contain' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
