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
 *
 * ── Waarom `touchmove` niet via een React-prop loopt ────────────────────
 * React 19 registreert `touchstart`/`touchmove`/`wheel` hard als PASSIVE
 * listener op de (portal-)root. In een passive listener negeert de browser
 * `preventDefault()`; de sheet volgde dus wel de vinger, maar de browser vatte
 * hetzelfde gebaar óók op als pull-to-refresh en verversde de pagina. Daarom
 * hangt dit gebaar `touchmove` (+ `touchend`/`touchcancel`) ZELF aan
 * `document`, met `{ passive: false }`, en alleen zolang er een gebaar loopt:
 * bij `touchstart` erbij, bij het einde eraf. Geen luisteraars in ruststand,
 * precies één tijdens een veeg, en `preventDefault()` doet weer wat het zegt.
 *
 * `touchstart` mag wél een React-prop blijven: daar wordt niets voorkomen
 * (dat zou de sluit-knop onklikbaar maken), alleen de drag opgezet.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { scrimColor, SCRIM_OPACITY } from '@/lib/overlay-scrim'

const DISMISS_VELOCITY = 800   // px/s — fast flick always dismisses
const DISMISS_PERCENT = 0.3    // 30% of sheet height
const VELOCITY_SAMPLES = 5
/** Beweging (px) die nodig is voordat we scroll vs. drag beslissen. */
const DECISION_THRESHOLD = 5
/** Weerstand op een opwaartse drag — het paneel volgt de vinger maar voor 15%. */
const RUBBER_BAND = 0.15
const DEFAULT_BACKDROP_OPACITY = SCRIM_OPACITY

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
  /**
   * Voor het HELE paneel: één `onTouchStart` op de buitenste div die zelf
   * routeert — begint de aanraking binnen `contentRef` dan geldt de
   * scroll-vs-drag-beslissing, daarbuiten (header, footer, alle tussenruimte)
   * sleept 'ie meteen. Dit is de aanbevolen bevestiging: zonder dit was er
   * letterlijk een dode strook "net onder het greepje" waar niets sleepte én
   * de browser het gebaar oppakte.
   */
  handleSheetTouchStart: (e: React.TouchEvent) => void
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
  const dragStartX = useRef(0)
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
      backdrop.style.backgroundColor = scrimColor(0)
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

    const restingBackdrop = scrimColor(backdropOpacity)

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

  // ── Niet-passieve gebaar-listeners ─────────────────────────
  //
  // Stabiele dispatchers: ze lezen de verse handler uit een ref, zodat
  // add/removeEventListener altijd dezelfde functie-identiteit zien — ook als
  // `enabled` halverwege een gebaar verandert en de useCallbacks vernieuwen.
  const moveHandlerRef = useRef<(e: TouchEvent) => void>(() => {})
  const endHandlerRef = useRef<() => void>(() => {})
  const listenersAttached = useRef(false)

  const dispatchMove = useRef((e: TouchEvent) => moveHandlerRef.current(e)).current
  const dispatchEnd = useRef(() => endHandlerRef.current()).current

  const attachGestureListeners = useCallback(() => {
    if (listenersAttached.current || typeof document === 'undefined') return
    listenersAttached.current = true
    // `passive: false` is de hele reden dat dit niet via React-props loopt:
    // alleen zo mag `preventDefault()` de native pull-to-refresh tegenhouden.
    document.addEventListener('touchmove', dispatchMove, { passive: false })
    // Op `document` (niet op de sheet) zodat een vinger die buiten het paneel
    // loslaat het gebaar netjes afsluit i.p.v. de sheet halverwege te laten staan.
    document.addEventListener('touchend', dispatchEnd)
    document.addEventListener('touchcancel', dispatchEnd)
  }, [dispatchMove, dispatchEnd])

  const detachGestureListeners = useCallback(() => {
    if (!listenersAttached.current || typeof document === 'undefined') return
    listenersAttached.current = false
    document.removeEventListener('touchmove', dispatchMove)
    document.removeEventListener('touchend', dispatchEnd)
    document.removeEventListener('touchcancel', dispatchEnd)
  }, [dispatchMove, dispatchEnd])

  // Vangnet: unmount midden in een gebaar (bv. de consumer sluit programmatisch
  // terwijl de vinger nog op het scherm ligt) laat anders listeners achter.
  useEffect(() => detachGestureListeners, [detachGestureListeners])

  // `enabled` kan tijdens een actieve sleep omlaag gaan (bv. ChatPanel zet
  // 'm uit zodra een melding-verzending start). De handlers zelf bailen dan
  // stil uit (`if (!enabled) return`) — zonder deze reset blijft de sheet met
  // een vastzittende inline transform staan, want er komt geen touchend meer
  // om dat op te ruimen.
  useEffect(() => {
    if (enabled) return
    detachGestureListeners()
    if (!isDragging.current && gestureDecision.current !== 'drag') return
    isDragging.current = false
    gestureDecision.current = 'undecided'
    touchSource.current = 'handle'
    animateSnapBack()
  }, [enabled, animateSnapBack, detachGestureListeners])

  // ── Touch handlers ─────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    dragStartY.current = e.touches[0].clientY
    // `?? 0`: sommige synthetische touch-events (tests, enkele webviews) dragen
    // geen clientX; zonder deze default rekent de horizontaal-guard met NaN.
    dragStartX.current = e.touches[0].clientX ?? 0
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
    attachGestureListeners()
  }, [enabled, sheetRef, attachGestureListeners])

  const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    dragStartY.current = e.touches[0].clientY
    // `?? 0`: sommige synthetische touch-events (tests, enkele webviews) dragen
    // geen clientX; zonder deze default rekent de horizontaal-guard met NaN.
    dragStartX.current = e.touches[0].clientX ?? 0
    dragCurrentY.current = 0
    isDragging.current = false // don't drag yet — wait for decision
    velocityTracker.current = [{ y: e.touches[0].clientY, t: Date.now() }]
    touchSource.current = 'content'
    gestureDecision.current = 'undecided'
    attachGestureListeners()
  }, [enabled, attachGestureListeners])

  /**
   * Eén touchstart voor het hele paneel; routeert op basis van het doelwit.
   * Alles buiten de scroll-content (greepje, header, footer, tussenruimte) is
   * greep — dat maakt "de modal in zijn geheel wegslepen" waar.
   *
   * GENESTE OVERLAYS EERST UITSLUITEN. React-events propageren door de REACT-
   * boom, niet door de DOM-boom: een geneste sheet leeft als React-kind ín dit
   * paneel maar portalt zijn DOM naar `document.body`. Zonder deze guard zag de
   * ouder een `touchstart` uit dat kind, vond het doelwit niet in zijn eigen
   * scroll-content, concludeerde "greep" en zette meteen een drag op — waarna
   * élke `touchmove` `preventDefault()` kreeg en de kind-sheet zich niet meer
   * liet scrollen ("Gevonden patronen" boven de rekeningdetail). Een gebaar dat
   * buiten ONS paneel begint is per definitie niet van ons.
   */
  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    const sheetEl = sheetRef.current
    if (sheetEl && !sheetEl.contains(e.target as Node)) return
    const scrollEl = contentRef?.current ?? null
    if (scrollEl && scrollEl.contains(e.target as Node)) handleContentTouchStart(e)
    else handleTouchStart(e)
  }, [sheetRef, contentRef, handleContentTouchStart, handleTouchStart])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled) return
    if (!sheetRef.current) return
    // Zodra de browser het gebaar zelf heeft overgenomen (scroll gestart) is
    // het event niet meer te annuleren; dan niets forceren.
    const stopNative = () => { if (e.cancelable) e.preventDefault() }

    const rawDelta = e.touches[0].clientY - dragStartY.current

    // Content-area touch: decide between scroll and drag
    if (touchSource.current === 'content') {
      if (gestureDecision.current === 'scroll') return // let native scroll handle it

      if (gestureDecision.current === 'undecided') {
        const rawDeltaX = (e.touches[0].clientX ?? 0) - dragStartX.current
        // Overwegend horizontaal (carrousel, horizontale tabel) is nooit een
        // dismiss — meteen loslaten, anders blokkeren we hun scroll.
        if (Math.abs(rawDeltaX) > Math.abs(rawDelta) && Math.abs(rawDeltaX) >= DECISION_THRESHOLD) {
          gestureDecision.current = 'scroll'
          return
        }

        const scrollEl = contentRef?.current ?? null
        const atTop = !scrollEl || scrollEl.scrollTop <= 0
        const swipingDown = rawDelta > 0

        // Zolang de content bovenaan staat én de vinger omlaag gaat kan dit nog
        // een dismiss worden. De browser moet dán al stilgehouden worden: wachten
        // tot de beslissing valt (5px verderop) is te laat — pull-to-refresh is
        // tegen die tijd al begonnen en negeert elke latere preventDefault.
        if (atTop && swipingDown) stopNative()

        // Need enough movement to decide (5px threshold)
        if (Math.abs(rawDelta) < DECISION_THRESHOLD) return

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

    // Een actieve sleep is van ons — in beide richtingen (omhoog = uitklappen).
    // De browser mag er niets meer mee doen.
    stopNative()

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
      backdrop.style.backgroundColor = scrimColor(backdropOpacity * (1 - dragPercent))
      backdrop.style.transition = 'none'
    }
  }, [enabled, sheetRef, backdropRef, contentRef, backdropOpacity, getSheetHeight])

  const handleTouchEnd = useCallback(() => {
    detachGestureListeners()
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
  }, [enabled, sheetRef, getSheetHeight, animateDismiss, animateSnapBack, detachGestureListeners])

  // De dispatchers lezen de handlers hier vandaan, zodat een listener die bij
  // `touchstart` is aangehangen tijdens hetzelfde gebaar de VERSE closure ziet.
  moveHandlerRef.current = handleTouchMove
  endHandlerRef.current = handleTouchEnd

  return { handleTouchStart, handleContentTouchStart, handleSheetTouchStart }
}
