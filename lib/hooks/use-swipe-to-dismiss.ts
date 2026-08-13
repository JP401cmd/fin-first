'use client'

/**
 * Swipe-down-to-dismiss voor modale oppervlakken (BottomSheet, ChatPanel).
 *
 * Eén implementatie voor het hele gebaar: velocity-tracking, de scroll-vs-drag
 * beslissing voor touches die in de scroll-content beginnen, rubber-banding op
 * een opwaartse drag, de dismiss-drempel en de twee exit-animaties
 * (weg-swipen vs. terugveren). Alles wat sheet-specifiek is (uitklappen naar
 * volle hoogte, sluit-bookkeeping) blijft bij de consumer via `onDragMove`,
 * `onDismissStart` en `onDismiss` — zo bestaat er geen tweede kopie van het
 * gebaar die uit elkaar kan lopen.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react'

const DISMISS_VELOCITY = 800   // px/s — fast flick always dismisses
const DISMISS_PERCENT = 0.3    // 30% of sheet height
const VELOCITY_SAMPLES = 5
/** Beweging (px) die nodig is voordat we scroll vs. drag beslissen. */
const DECISION_THRESHOLD = 5
/** Weerstand op een opwaartse drag — het paneel volgt de vinger maar voor 15%. */
const RUBBER_BAND = 0.15
const DEFAULT_BACKDROP_OPACITY = 0.5

/** Gedeelde spring-curve voor sheet-animaties (ook buiten dit gebaar bruikbaar). */
export const SPRING_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'

export type UseSwipeToDismissOptions = {
  /** Het element dat meebeweegt en wegschuift. */
  sheetRef: RefObject<HTMLElement | null>
  /**
   * Optionele gedimde achtergrond: de dekking volgt de vinger en fade't mee in
   * de exit. Weglaten (of een ref zonder element) is veilig — dan gebeurt er
   * niets met de achtergrond.
   */
  backdropRef?: RefObject<HTMLElement | null>
  /**
   * Optionele scroll-container. Alleen mét deze ref kan een touch die in de
   * content begint uitgroeien tot een dismiss-drag (en dan pas wanneer de
   * content bovenaan staat én de vinger omlaag gaat).
   */
  contentRef?: RefObject<HTMLElement | null>
  /** Aangeroepen wanneer het paneel daadwerkelijk weg is (na de exit-animatie). */
  onDismiss: () => void
  /**
   * Aangeroepen bij de start van de dismiss-animatie. Geef `false` terug om de
   * dismiss af te breken (bv. wanneer er al een exit loopt).
   */
  onDismissStart?: () => boolean | void
  /**
   * Extensiehaak: aangeroepen zodra de drag actief is, vóór rubber-banding, met
   * de rauwe delta (positief = omlaag). Geef `true` terug wanneer de consumer de
   * beweging overneemt — de drag stopt dan (BottomSheet's uitklappen naar volle
   * hoogte).
   */
  onDragMove?: (rawDelta: number) => boolean | void
  /** Dekking van de achtergrond in ruststand. Default 0.5. */
  backdropOpacity?: number
  /** Zet het gebaar uit (bv. tijdens een lopende verzending). Default true. */
  enabled?: boolean
}

export type SwipeToDismissHandlers = {
  /** Voor het greep-gebied (drag handle / header): meteen slepen. */
  handleTouchStart: (e: React.TouchEvent) => void
  /** Voor de scroll-container: eerst scroll-vs-drag beslissen. */
  handleContentTouchStart: (e: React.TouchEvent) => void
  handleTouchMove: (e: React.TouchEvent) => void
  handleTouchEnd: () => void
}

export function useSwipeToDismiss({
  sheetRef,
  backdropRef,
  contentRef,
  onDismiss,
  onDismissStart,
  onDragMove,
  backdropOpacity = DEFAULT_BACKDROP_OPACITY,
  enabled = true,
}: UseSwipeToDismissOptions): SwipeToDismissHandlers {
  // Touch / drag state
  const dragStartY = useRef(0)
  const dragCurrentY = useRef(0)
  const isDragging = useRef(false)
  const velocityTracker = useRef<{ y: number; t: number }[]>([])
  // 'handle' = drag handle touch, 'content' = content area touch
  const touchSource = useRef<'handle' | 'content'>('handle')
  // Once we decide scroll vs drag for a content touch, lock it in
  const gestureDecision = useRef<'undecided' | 'scroll' | 'drag'>('undecided')
  // Bewaakt tegen een tweede overlappende dismiss (bv. een snelle dubbele
  // flick): zonder deze guard herschrijft de tweede aanroep de lopende
  // transition/transform en vuurt `onDismiss` twee keer. Intern, dus elke
  // consumer krijgt 'm gratis — niet afhankelijk van een zelf-aangeleverde
  // `onDismissStart`.
  const isDismissing = useRef(false)

  // Callbacks via refs: de handlers houden zo een stabiele identiteit én lezen
  // altijd de verse closure (expandedToFull e.d.).
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const onDismissStartRef = useRef(onDismissStart)
  onDismissStartRef.current = onDismissStart
  const onDragMoveRef = useRef(onDragMove)
  onDragMoveRef.current = onDragMove

  // Reduced-motion preference
  const prefersReducedMotion = useRef(false)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.current = mql.matches
    const handler = (e: MediaQueryListEvent) => { prefersReducedMotion.current = e.matches }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const getSheetHeight = useCallback(() => sheetRef.current?.offsetHeight ?? 400, [sheetRef])

  /** Dismiss animation for swipe gesture — velocity-based duration */
  const animateDismiss = useCallback((velocity: number) => {
    if (isDismissing.current) return
    if (onDismissStartRef.current?.() === false) return
    isDismissing.current = true

    const sheet = sheetRef.current
    const backdrop = backdropRef?.current ?? null
    const sheetHeight = getSheetHeight()
    const remaining = sheetHeight - Math.max(0, dragCurrentY.current)

    if (prefersReducedMotion.current || !sheet) {
      isDismissing.current = false
      onDismissRef.current()
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

    let finished = false
    const cleanup = () => {
      if (finished) return
      finished = true
      isDismissing.current = false
      onDismissRef.current()
    }
    sheet.addEventListener('transitionend', cleanup, { once: true })
    setTimeout(cleanup, duration + 50)
  }, [sheetRef, backdropRef, getSheetHeight])

  /** Spring snap-back when drag doesn't meet dismiss threshold */
  const animateSnapBack = useCallback(() => {
    const sheet = sheetRef.current
    const backdrop = backdropRef?.current ?? null
    if (!sheet) return

    const restingBackdrop = `rgba(0,0,0,${backdropOpacity})`

    if (prefersReducedMotion.current) {
      sheet.style.transform = ''
      sheet.style.transition = ''
      sheet.style.willChange = ''
      if (backdrop) {
        backdrop.style.backgroundColor = restingBackdrop
        backdrop.style.transition = ''
      }
      return
    }

    sheet.style.transition = `transform 350ms ${SPRING_CURVE}`
    sheet.style.transform = ''

    if (backdrop) {
      backdrop.style.transition = `background-color 350ms ${SPRING_CURVE}`
      backdrop.style.backgroundColor = restingBackdrop
    }

    const onEnd = () => {
      sheet.style.transition = ''
      sheet.style.willChange = ''
      if (backdrop) backdrop.style.transition = ''
    }
    sheet.addEventListener('transitionend', onEnd, { once: true })
    setTimeout(onEnd, 400)
  }, [sheetRef, backdropRef, backdropOpacity])

  // `enabled` kan tijdens een actieve sleep omlaag gaan (bv. ChatPanel zet
  // 'm uit zodra een melding-verzending start). De handlers zelf bailen dan
  // stil uit (`if (!enabled) return`) — zonder deze reset blijft de sheet met
  // een vastzittende inline transform staan, want er komt geen touchend meer
  // om dat op te ruimen.
  useEffect(() => {
    if (enabled) return
    if (!isDragging.current && gestureDecision.current !== 'drag') return
    isDragging.current = false
    gestureDecision.current = 'undecided'
    touchSource.current = 'handle'
    animateSnapBack()
  }, [enabled, animateSnapBack])

  // ── Touch handlers ─────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
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
  }, [enabled, sheetRef])

  const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    dragStartY.current = e.touches[0].clientY
    dragCurrentY.current = 0
    isDragging.current = false // don't drag yet — wait for decision
    velocityTracker.current = [{ y: e.touches[0].clientY, t: Date.now() }]
    touchSource.current = 'content'
    gestureDecision.current = 'undecided'
  }, [enabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    if (!sheetRef.current) return

    const rawDelta = e.touches[0].clientY - dragStartY.current

    // Content-area touch: decide between scroll and drag
    if (touchSource.current === 'content') {
      if (gestureDecision.current === 'scroll') return // let native scroll handle it

      if (gestureDecision.current === 'undecided') {
        // Need enough movement to decide (5px threshold)
        if (Math.abs(rawDelta) < DECISION_THRESHOLD) return

        const scrollEl = contentRef?.current ?? null
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

    const currentRawDelta = e.touches[0].clientY - dragStartY.current

    // Consumer-extensie (BottomSheet: uitklappen naar volle hoogte bij een
    // opwaartse drag). Neemt hij over, dan stopt de drag hier.
    if (onDragMoveRef.current?.(currentRawDelta) === true) {
      isDragging.current = false
      return
    }

    // Rubber-banding for upward drag (15% resistance)
    const deltaY = currentRawDelta < 0 ? currentRawDelta * RUBBER_BAND : currentRawDelta

    sheetRef.current.style.transform = `translateY(${deltaY}px)`
    dragCurrentY.current = deltaY

    // Velocity tracking (last N samples)
    const now = Date.now()
    velocityTracker.current.push({ y: e.touches[0].clientY, t: now })
    if (velocityTracker.current.length > VELOCITY_SAMPLES) {
      velocityTracker.current.shift()
    }

    // Backdrop opacity follows finger
    const backdrop = backdropRef?.current ?? null
    if (backdrop && currentRawDelta > 0) {
      const sheetHeight = getSheetHeight()
      const dragPercent = Math.min(1, currentRawDelta / sheetHeight)
      backdrop.style.backgroundColor = `rgba(0,0,0,${backdropOpacity * (1 - dragPercent)})`
      backdrop.style.transition = 'none'
    }

    if (currentRawDelta > 0) e.preventDefault()
  }, [enabled, sheetRef, backdropRef, contentRef, backdropOpacity, getSheetHeight])

  const handleTouchEnd = useCallback(() => {
    if (!enabled) return
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
  }, [enabled, sheetRef, getSheetHeight, animateDismiss, animateSnapBack])

  return { handleTouchStart, handleContentTouchStart, handleTouchMove, handleTouchEnd }
}
