'use client'

/**
 * Pull-to-refresh voor de mobiele tray-scroller.
 *
 * De app draait als PWA (`display: standalone`). Daar is de browser-chrome weg:
 * op Android chaint een drag-down bovenaan door naar de root en levert een kale
 * native reload, op iOS-standalone is er helemaal GEEN ververs-mogelijkheid. Dit
 * gebaar vervangt beide door één eigen, editorial verversing.
 *
 * ── Waarom `touchmove` niet via een React-prop loopt ────────────────────
 * Identiek aan `use-swipe-to-dismiss`: React 19 registreert touch-listeners hard
 * PASSIVE, en in een passive listener negeert de browser `preventDefault()`. Het
 * gebaar hangt `touchmove` daarom ZELF aan `document` met `{ passive: false }`,
 * en alleen zolang er een gebaar loopt. `touchstart` mag passief blijven (daar
 * wordt niets voorkomen) maar hangt hier wél native aan de scroller, omdat de
 * consument (de indicator) het `<main>`-element niet zelf rendert.
 *
 * ── Wat het gebaar NIET kaapt ──────────────────────────────────────────
 * Drie poorten bij `touchstart`, alle drie nodig gebleken bij vergelijkbare
 * gebaren in deze repo:
 *  1. `scrollTop <= 0` — anders grijpt de handler tijdens gewoon omhoog-scrollen
 *     en zit de gebruiker vast. (`<=` en niet `===`: iOS rapporteert negatief
 *     tijdens rubber-band.)
 *  2. `getComputedStyle(el).overflowY === 'auto'` — op desktop (≥lg) valt de
 *     tray-`<main>` terug op `overflow: visible`; het gebaar is daar dus een
 *     no-op zonder JS-breakpoint-branch. Muis/desktop raken we sowieso niet aan:
 *     er wordt alleen naar touch-events geluisterd.
 *  3. Geen open overlay (`useOverlayOpen`) — anders vecht dit met de
 *     swipe-down-to-dismiss van BottomSheet/ShellOverlay.
 * Daarbovenop wint een overwegend horizontale beweging (carrousel, brede tabel)
 * altijd van de pull, en meten we op touch-delta's i.p.v. scroll-events, omdat
 * iOS' rubber-band op interne scrollers niet te onderdrukken is.
 *
 * ── Voltooiing ─────────────────────────────────────────────────────────
 * `router.refresh()` geeft geen promise terug. De consument draait 'm daarom in
 * een `startTransition` en geeft `isPending` terug als `refreshing`; die vlag
 * bepaalt hoelang de indicator in "Bijwerken…"-stand blijft. Een minimum-duur
 * voorkomt een flits bij een instant refresh, een harde vangnet-timer voorkomt
 * een indicator die blijft hangen als het pending-signaal nooit terugkomt.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useOverlayOpen } from '@/lib/overlay-signal'

/** Pull (px, ná weerstand) waarboven loslaten daadwerkelijk ververst. */
export const PULL_THRESHOLD_PX = 72
/** Rusthoogte van de indicator tijdens het verversen. */
export const PULL_REST_PX = 56
/** Verder dan dit rekt de indicator niet mee — voorkomt een halve pagina lint. */
const MAX_PULL_PX = 132
/** Weerstand: de vinger legt ruim twee keer zoveel af als de indicator. */
const RESISTANCE = 0.45
/** Beweging (px) die nodig is voordat we scroll vs. pull beslissen. */
const DECISION_THRESHOLD = 5
/** Minimale zichtbaarheid van de "Bijwerken…"-stand — anders flitst het. */
const MIN_REFRESH_MS = 550
/** Vangnet: hierna valt de indicator sowieso terug, pending of niet. */
const MAX_REFRESH_MS = 8000

export type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing'

export type UsePullToRefreshOptions = {
  /** De scroll-container waarop het gebaar leeft (de tray-`<main>`). */
  scrollRef: RefObject<HTMLElement | null>
  /** Aangeroepen precies één keer per gebaar dat de drempel haalt. */
  onRefresh: () => void
  /** Loopt de verversing nog? Houdt de indicator in "Bijwerken…"-stand. */
  refreshing?: boolean
  /** Zet het gebaar uit. Default true. */
  enabled?: boolean
}

export type PullToRefreshState = {
  phase: PullPhase
  /** Hoogte (px) die de indicator nu moet innemen. */
  distance: number
  /** 0..1 — voortgang richting de drempel. */
  progress: number
}

export function usePullToRefresh({
  scrollRef,
  onRefresh,
  refreshing = false,
  enabled = true,
}: UsePullToRefreshOptions): PullToRefreshState {
  const overlayOpen = useOverlayOpen()
  const [phase, setPhase] = useState<PullPhase>('idle')
  const [distance, setDistance] = useState(0)
  const [minElapsed, setMinElapsed] = useState(true)

  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  // Fase via ref meelezen in de touchstart-listener: zou die effect-dependency
  // zijn, dan werd de listener midden in élke pull opnieuw aangehangen.
  const phaseRef = useRef<PullPhase>(phase)
  phaseRef.current = phase

  // Gebaar-state buiten React: touchmove vuurt op frame-tempo, dus alleen de
  // afgeleide `distance`/`phase` gaan door setState.
  const startY = useRef(0)
  const startX = useRef(0)
  const decision = useRef<'undecided' | 'scroll' | 'pull'>('undecided')
  const pulled = useRef(0)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  const reset = useCallback(() => {
    decision.current = 'undecided'
    pulled.current = 0
    setDistance(0)
    setPhase('idle')
  }, [])

  // ── Niet-passieve gebaar-listeners ─────────────────────────────
  // Stabiele dispatchers, zodat add/removeEventListener altijd dezelfde
  // functie-identiteit zien ook als de handlers vernieuwen (zelfde truc als
  // use-swipe-to-dismiss).
  const moveHandlerRef = useRef<(e: TouchEvent) => void>(() => {})
  const endHandlerRef = useRef<() => void>(() => {})
  const attached = useRef(false)

  const dispatchMove = useRef((e: TouchEvent) => moveHandlerRef.current(e)).current
  const dispatchEnd = useRef(() => endHandlerRef.current()).current

  const attachGestureListeners = useCallback(() => {
    if (attached.current || typeof document === 'undefined') return
    attached.current = true
    // `passive: false` is de hele reden dat dit niet via React-props loopt.
    document.addEventListener('touchmove', dispatchMove, { passive: false })
    document.addEventListener('touchend', dispatchEnd)
    document.addEventListener('touchcancel', dispatchEnd)
  }, [dispatchMove, dispatchEnd])

  const detachGestureListeners = useCallback(() => {
    if (!attached.current || typeof document === 'undefined') return
    attached.current = false
    document.removeEventListener('touchmove', dispatchMove)
    document.removeEventListener('touchend', dispatchEnd)
    document.removeEventListener('touchcancel', dispatchEnd)
  }, [dispatchMove, dispatchEnd])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (decision.current === 'scroll') return
      const touch = e.touches[0]
      if (!touch) return

      const rawDeltaY = touch.clientY - startY.current
      const rawDeltaX = (touch.clientX ?? 0) - startX.current
      const stopNative = () => {
        if (e.cancelable) e.preventDefault()
      }

      if (decision.current === 'undecided') {
        // Overwegend horizontaal (carrousel, brede tabel) is nooit een pull.
        if (Math.abs(rawDeltaX) > Math.abs(rawDeltaY) && Math.abs(rawDeltaX) >= DECISION_THRESHOLD) {
          decision.current = 'scroll'
          return
        }
        // De browser moet al stilgehouden worden vóór de beslissing valt:
        // wachten tot 5px verderop is te laat — de native pull-to-refresh is
        // dan al begonnen en negeert elke latere preventDefault.
        if (rawDeltaY > 0) stopNative()
        if (Math.abs(rawDeltaY) < DECISION_THRESHOLD) return
        if (rawDeltaY <= 0) {
          decision.current = 'scroll'
          return
        }
        decision.current = 'pull'
        // Herijk het nulpunt op de beslissing, zodat de indicator vanaf 0 mee
        // beweegt i.p.v. met een sprong van 5px te beginnen.
        startY.current = touch.clientY
        return
      }

      stopNative()
      const next = Math.min(MAX_PULL_PX, Math.max(0, rawDeltaY * RESISTANCE))
      pulled.current = next
      setDistance(Math.round(next))
      setPhase(next >= PULL_THRESHOLD_PX ? 'ready' : 'pulling')
    },
    [],
  )

  const handleTouchEnd = useCallback(() => {
    detachGestureListeners()
    if (decision.current !== 'pull') {
      decision.current = 'undecided'
      return
    }
    const reached = pulled.current >= PULL_THRESHOLD_PX
    decision.current = 'undecided'
    pulled.current = 0

    if (!reached) {
      setDistance(0)
      setPhase('idle')
      return
    }

    setDistance(PULL_REST_PX)
    setPhase('refreshing')
    setMinElapsed(false)
    clearTimers()
    timers.current.push(window.setTimeout(() => setMinElapsed(true), MIN_REFRESH_MS))
    // Vangnet: `refreshing` komt uit een externe transition; blijft die om wat
    // voor reden dan ook hangen, dan mag de indicator niet eeuwig blijven staan.
    timers.current.push(
      window.setTimeout(() => {
        setMinElapsed(true)
        setDistance(0)
        setPhase('idle')
      }, MAX_REFRESH_MS),
    )
    onRefreshRef.current()
  }, [clearTimers, detachGestureListeners])

  // De dispatchers lezen de handlers hier vandaan, zodat een listener die bij
  // `touchstart` is aangehangen tijdens hetzelfde gebaar de VERSE closure ziet.
  moveHandlerRef.current = handleTouchMove
  endHandlerRef.current = handleTouchEnd

  // ── touchstart op de scroller (passief; we voorkomen hier niets) ─
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!enabled || overlayOpen) return

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current === 'refreshing') return
      // Multi-touch (pinch-zoom op een grafiek) is nooit een pull.
      if (e.touches.length !== 1) return
      if (el.scrollTop > 0) return
      // Desktop-poort: daar is de tray-`<main>` geen scroll-container.
      if (typeof window !== 'undefined' && window.getComputedStyle(el).overflowY !== 'auto') return

      const touch = e.touches[0]
      startY.current = touch.clientY
      startX.current = touch.clientX ?? 0
      decision.current = 'undecided'
      pulled.current = 0
      attachGestureListeners()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    return () => el.removeEventListener('touchstart', onTouchStart)
  }, [scrollRef, enabled, overlayOpen, attachGestureListeners])

  // Een overlay die halverwege een pull opengaat (of `enabled` dat uitvalt) mag
  // geen half opgetrokken indicator achterlaten.
  useEffect(() => {
    if (enabled && !overlayOpen) return
    detachGestureListeners()
    if (phase === 'idle' || phase === 'refreshing') return
    reset()
  }, [enabled, overlayOpen, phase, detachGestureListeners, reset])

  // Verversing klaar → indicator terug naar rust, maar niet vóór de
  // minimum-zichtbaarheid.
  useEffect(() => {
    if (phase !== 'refreshing') return
    if (refreshing || !minElapsed) return
    clearTimers()
    setDistance(0)
    setPhase('idle')
  }, [phase, refreshing, minElapsed, clearTimers])

  // Unmount midden in een gebaar laat anders listeners + timers achter.
  useEffect(
    () => () => {
      detachGestureListeners()
      clearTimers()
    },
    [detachGestureListeners, clearTimers],
  )

  return {
    phase,
    distance,
    progress: Math.min(1, distance / PULL_THRESHOLD_PX),
  }
}
