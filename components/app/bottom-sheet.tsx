'use client'

import { useState, useEffect, useCallback, useRef, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Desktop max-width: 'sm' (448px) | 'md' (512px, default) | 'lg' (640px) | 'xl' (768px) | 'full' (1024px) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** Initial mobile height (e.g. '60vh'). Drag up expands to full 92vh. Desktop ignores this. */
  initialMobileHeight?: string
  /**
   * Optionele sticky footer-slot, gerenderd buiten de scroll-content. Gebruikt
   * door `<ShellOverlay kind="pane">` voor de mobile-fallback om dezelfde
   * primary/secondary action-bar te tonen als de desktop SlideInPane-footer.
   * Slot leeft binnen de tray (niet `position: fixed`), zodat detent-strategie
   * (peek/mid/full) intact blijft. Wanneer leeggelaten: geen footer.
   */
  footerSlot?: ReactNode
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

export function BottomSheet({ open, onClose, title, children, size = 'md', initialMobileHeight, footerSlot }: BottomSheetProps) {
  const [visible, setVisible] = useState(false)
  const [expandedToFull, setExpandedToFull] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Touch / drag state
  const dragStartY = useRef(0)
  const dragCurrentY = useRef(0)
  const isDragging = useRef(false)
  const velocityTracker = useRef<{ y: number; t: number }[]>([])
  const contentRef = useRef<HTMLDivElement>(null)
  // 'handle' = drag handle touch, 'content' = content area touch
  const touchSource = useRef<'handle' | 'content'>('handle')
  // Once we decide scroll vs drag for a content touch, lock it in
  const gestureDecision = useRef<'undecided' | 'scroll' | 'drag'>('undecided')

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
      setExpandedToFull(false)

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

  // ── Focus management + trap ────────────────────────────────

  useFocusTrap({ active: visible, containerRef: sheetRef })

  // ── Escape key ─────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleProgrammaticClose()
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
    // Touch from drag handle: always drag immediately
    touchSource.current = 'handle'
    gestureDecision.current = 'drag'
    if (sheetRef.current) {
      sheetRef.current.style.animation = 'none'
      sheetRef.current.style.transition = 'none'
      sheetRef.current.style.willChange = 'transform'
    }
  }, [])

  const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragCurrentY.current = 0
    isDragging.current = false // don't drag yet — wait for decision
    velocityTracker.current = [{ y: e.touches[0].clientY, t: Date.now() }]
    touchSource.current = 'content'
    gestureDecision.current = 'undecided'
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!sheetRef.current) return

    const rawDelta = e.touches[0].clientY - dragStartY.current

    // Content-area touch: decide between scroll and drag
    if (touchSource.current === 'content') {
      if (gestureDecision.current === 'scroll') return // let native scroll handle it

      if (gestureDecision.current === 'undecided') {
        // Need enough movement to decide (5px threshold)
        if (Math.abs(rawDelta) < 5) return

        const scrollEl = contentRef.current
        const atTop = !scrollEl || scrollEl.scrollTop <= 0
        const swipingDown = rawDelta > 0

        if (atTop && swipingDown) {
          // Activate drag-dismiss
          gestureDecision.current = 'drag'
          isDragging.current = true
          // Reset start to current position for smooth drag start
          dragStartY.current = e.touches[0].clientY
          if (sheetRef.current) {
            sheetRef.current.style.animation = 'none'
            sheetRef.current.style.transition = 'none'
            sheetRef.current.style.willChange = 'transform'
          }
          velocityTracker.current = [{ y: e.touches[0].clientY, t: Date.now() }]
          return
        } else {
          // Let native scroll take over
          gestureDecision.current = 'scroll'
          return
        }
      }
    }

    // From here: active drag (handle or content-decided drag)
    if (!isDragging.current) return

    // Expand-to-full: if initialMobileHeight is set and not yet expanded,
    // upward drag (negative delta) expands the sheet instead of rubber-banding
    const currentRawDelta = e.touches[0].clientY - dragStartY.current
    if (currentRawDelta < -30 && initialMobileHeight && !expandedToFull) {
      setExpandedToFull(true)
      // Reset drag state so sheet snaps cleanly
      isDragging.current = false
      if (sheetRef.current) {
        sheetRef.current.style.transition = `max-height 350ms ${SPRING_CURVE}`
        sheetRef.current.style.transform = ''
        sheetRef.current.style.willChange = ''
      }
      return
    }

    // Rubber-banding for upward drag (15% resistance)
    const deltaY = currentRawDelta < 0 ? currentRawDelta * 0.15 : currentRawDelta

    sheetRef.current.style.transform = `translateY(${deltaY}px)`
    dragCurrentY.current = deltaY

    // Velocity tracking (last N samples)
    const now = Date.now()
    velocityTracker.current.push({ y: e.touches[0].clientY, t: now })
    if (velocityTracker.current.length > VELOCITY_SAMPLES) {
      velocityTracker.current.shift()
    }

    // Backdrop opacity follows finger
    if (backdropRef.current && currentRawDelta > 0) {
      const sheetHeight = getSheetHeight()
      const dragPercent = Math.min(1, currentRawDelta / sheetHeight)
      backdropRef.current.style.backgroundColor = `rgba(0,0,0,${0.5 * (1 - dragPercent)})`
      backdropRef.current.style.transition = 'none'
    }

    if (currentRawDelta > 0) e.preventDefault()
  }, [getSheetHeight, initialMobileHeight, expandedToFull])

  const handleTouchEnd = useCallback(() => {
    // Content touch that stayed as scroll — just clean up
    if (touchSource.current === 'content' && gestureDecision.current !== 'drag') {
      gestureDecision.current = 'undecided'
      touchSource.current = 'handle'
      return
    }
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
    gestureDecision.current = 'undecided'
    touchSource.current = 'handle'
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
        className={`flex w-full flex-col bg-[var(--paper)] rounded-t-[var(--r-lg)] shadow-[var(--s2)] md:mx-4 ${sizeClasses[size]} md:rounded-[var(--r-lg)] safe-bottom animate-sheet-enter`}
        style={{
          maxHeight: initialMobileHeight && !expandedToFull
            ? `min(${initialMobileHeight}, 92vh)`
            : '92vh',
          transition: expandedToFull ? `max-height 350ms ${SPRING_CURVE}` : undefined,
        }}
      >
        {/* Drag handle — mobile only (44px touch target) */}
        <div
          className="flex shrink-0 justify-center py-5 cursor-grab md:hidden"
          style={{ touchAction: 'none' }}
          onTouchStart={handleTouchStart}
        >
          <div className="h-1 w-10 rounded-full bg-[var(--border-md)]" />
        </div>

        {/* Header — blueprint Type 5 (Modal) met kicker-streep + Playfair titel */}
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span
                aria-hidden
                className="inline-block h-px w-7 shrink-0"
                style={{ background: 'var(--module-active-500)' }}
              />
              <h3
                id={titleId}
                className="font-bold text-[var(--ink)] truncate"
                style={{ fontFamily: 'var(--font-playfair, serif)' }}
              >
                {title}
              </h3>
            </div>
            <button
              onClick={handleProgrammaticClose}
              aria-label="Sluiten"
              className="touch-target rounded-md text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] shrink-0 ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        <div
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ overscrollBehaviorY: 'contain' }}
          onTouchStart={handleContentTouchStart}
          onScroll={initialMobileHeight && !expandedToFull ? (e) => {
            const el = e.currentTarget
            // Expand when user scrolls near bottom of initial height
            if (el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
              setExpandedToFull(true)
            }
          } : undefined}
        >
          {children}
        </div>

        {/* Optionele sticky footer-slot — staat buiten de scroll-content zodat
            primary/secondary acties altijd zichtbaar blijven. Border-top en
            paper-bg zijn consistent met de desktop SlideInPane-footer, zodat
            beide rendermodi visueel uitwisselbaar zijn. */}
        {footerSlot && (
          <div className="shrink-0 border-t border-[var(--border-ed)] bg-[var(--paper)] px-5 py-3">
            {footerSlot}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
