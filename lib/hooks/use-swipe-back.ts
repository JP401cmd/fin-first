/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.2 (swipe-back-gesture)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * iOS-stijl edge-swipe-from-left voor mobile-stack-pop. Gedrag:
 *  - Alleen actief op `(pointer: coarse)` (touch-devices). Op desktop met
 *    muis doet de hook niets — geen listeners aangehangen.
 *  - Touchstart wordt alleen gegrijpt als `clientX < edgeWidth` (default 24px).
 *    Buiten de edge-zone reageert de hook niet, zodat horizontale scroll-
 *    content (charts, tables) niet wordt gehijackt.
 *  - Tijdens een gesture vergelijken we horizontale vs verticale beweging:
 *    als de eerste 8px overwegend verticaal zijn, geven we de gesture op
 *    (de browser mag scrollen).
 *  - Commit-criteria: progress > 50% van viewport-breedte OF velocity > 0.5 px/ms.
 *  - prefers-reduced-motion: hook werkt nog (commit/cancel detectie blijft),
 *    maar `onProgress` wordt niet aangeroepen — geen visuele meeschuif-feedback.
 */

'use client'

import { useEffect, type RefObject } from 'react'

// ── Defaults ─────────────────────────────────────────────────────

/** Edge-zone breedte in px vanaf links. iOS zelf gebruikt ~20px; 24 geeft wat marge op kleine vingers. */
const DEFAULT_EDGE_WIDTH = 24

/** Minimum % progress om te committen (50% van viewport-breedte). */
const DEFAULT_MIN_PROGRESS = 0.5

/** Minimum velocity (px/ms) om te committen ondanks lage progress. 0.5 px/ms ≈ 500 px/s. */
const DEFAULT_MIN_VELOCITY = 0.5

/**
 * Threshold waarboven we beslissen of de gesture "horizontaal genoeg" is
 * om als swipe-back te tellen. Onder deze drempel laten we de browser nog
 * vrij scrollen — pas wanneer een richting duidelijk is, kapen we de gesture.
 */
const HORIZONTAL_DECISION_PX = 8

// ── Types ────────────────────────────────────────────────────────

export type UseSwipeBackOptions = {
  /** Edge-zone breedte in px vanaf links. Default 24. */
  edgeWidth?: number
  /** Minimale percent-progress om pop te triggeren. Default 0.5 (50% van viewport). */
  minProgressToCommit?: number
  /** Minimale velocity (px/ms) om pop te triggeren ondanks lage progress. Default 0.5. */
  minVelocityToCommit?: number
  /** Disable de hook (bv. tijdens een transitie of op tab-root). */
  enabled?: boolean
  /** Callback bij commit (gebruiker zwaait genoeg om pop te triggeren). */
  onCommit: () => void
  /** Callback tijdens swipe — voor visuele feedback (translateX van outgoing/incoming). */
  onProgress?: (progress: number) => void
  /** Callback bij annuleer (release zonder commit). */
  onCancel?: () => void
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * SSR-safe match-media-check: alleen op de client kijken we naar
 * `(pointer: coarse)`. Server retourneert altijd false zodat de hook
 * tijdens server-render niets aanhangt en geen listeners-cleanup nodig
 * heeft (er zijn er geen).
 */
function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/**
 * SSR-safe reduced-motion-check. Bij `reduce` doet de hook nog steeds zijn
 * werk (commit/cancel detectie), maar de `onProgress`-callback wordt
 * gesuppressed zodat er geen meeschuivende transform-animatie ontstaat.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Numeriek clampen tussen [min, max] zonder externe util. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

// ── Hook ─────────────────────────────────────────────────────────

/**
 * Edge-swipe-from-left gesture voor stack-pop op touch-devices. Alle
 * listener-setup gebeurt binnen `useEffect` zodat de hook SSR-safe is en
 * geen window-access tijdens render uitvoert.
 *
 * Implementatie-detail: we registreren `touchstart` als `passive: true`
 * (we roepen geen preventDefault aan op touchstart zelf) en `touchmove`
 * met `passive: false` zodat we op het juiste moment scroll kunnen
 * blokkeren als de gesture is overgenomen. Dat blokkeren gebeurt alleen
 * NA de horizontaal-genoeg-beslissing — voor die tijd respecteren we de
 * browser-scroll volledig.
 */
export function useSwipeBack(
  ref: RefObject<HTMLElement | null>,
  options: UseSwipeBackOptions,
): void {
  const {
    edgeWidth = DEFAULT_EDGE_WIDTH,
    minProgressToCommit = DEFAULT_MIN_PROGRESS,
    minVelocityToCommit = DEFAULT_MIN_VELOCITY,
    enabled = true,
    onCommit,
    onProgress,
    onCancel,
  } = options

  useEffect(() => {
    // Disabled of geen target-element: niets aanhangen, niets opruimen.
    if (!enabled) return
    const node = ref.current
    if (!node) return

    // Niet-touch-device: hook is no-op. Bewust géén listeners aangehangen
    // zodat muis-clicks en mouse-drags onaangetast blijven.
    if (!isCoarsePointer()) return

    // Reduced-motion: we onderdrukken visuele feedback (onProgress wordt
    // niet aangeroepen) maar we blijven swipes wel detecteren — anders kan
    // een gebruiker met deze setting nooit terug-swipen.
    const reduceMotion = prefersReducedMotion()

    // Per-gesture state. Lift naar effect-scope ipv module-scope om
    // meerdere instanties van de hook (theoretisch) te ondersteunen.
    let active = false
    let startX = 0
    let startY = 0
    let startTime = 0
    let lastX = 0
    let lastTime = 0
    let decided = false

    const reset = () => {
      active = false
      decided = false
      startX = 0
      startY = 0
      startTime = 0
      lastX = 0
      lastTime = 0
    }

    const handleTouchStart = (event: TouchEvent) => {
      // Multi-touch (zoom, pinch): niet onze gesture. Negeren.
      if (event.touches.length !== 1) return

      const touch = event.touches[0]
      // Edge-zone-detectie: enkel reageren als de touch begint binnen
      // edgeWidth pixels vanaf links. Hierdoor laten we horizontale scroll-
      // content (charts, tables midden op het scherm) ongemoeid — die
      // touchstarts vallen buiten deze zone en worden hier niet opgepakt.
      if (touch.clientX > edgeWidth) return

      active = true
      decided = false
      startX = touch.clientX
      startY = touch.clientY
      startTime = performance.now()
      lastX = startX
      lastTime = startTime
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!active) return
      const touch = event.touches[0]
      if (!touch) return

      const deltaX = touch.clientX - startX
      const deltaY = touch.clientY - startY
      lastX = touch.clientX
      lastTime = performance.now()

      // Beslismoment: tot `HORIZONTAL_DECISION_PX` aan beweging gokken we
      // op de richting. Als verticaal sterker is dan horizontaal, geven we
      // de gesture op — de browser scrolt verder. Pas zodra we beslist
      // hebben dat het horizontaal IS, kapen we voor de rest van de gesture.
      if (!decided) {
        const absX = Math.abs(deltaX)
        const absY = Math.abs(deltaY)
        if (absX < HORIZONTAL_DECISION_PX && absY < HORIZONTAL_DECISION_PX) {
          // Te weinig beweging — wacht nog op meer signaal.
          return
        }
        if (absY > absX) {
          // Verticale beweging wint → cancel: de gebruiker scrollt.
          // Geen onCancel hier — die is voor "release zonder commit",
          // niet voor "deze gesture was sowieso geen swipe-back".
          reset()
          return
        }
        decided = true
      }

      // Vanaf hier IS de gesture een swipe-back. We blokkeren de native
      // browser-scroll voor deze beweging zodat alleen onze visuele
      // tracker schuift. preventDefault op touchmove vereist
      // passive: false (zie addEventListener-opties hieronder).
      if (event.cancelable) event.preventDefault()

      // Negatieve deltaX (gesture naar links) is hier 0 — we tonen geen
      // "negatieve" progress. Cap op 1.0 zodat we nooit verder dan
      // viewport-breedte schuiven, zelfs als de vinger overshoot.
      const viewportWidth = window.innerWidth || 1
      const progress = clamp(deltaX / viewportWidth, 0, 1)

      // Reduced-motion: visuele feedback uit. Commit-detectie werkt nog
      // op basis van startX/lastX/lastTime — die tracken we hierboven.
      if (!reduceMotion && onProgress) {
        onProgress(progress)
      }
    }

    const handleTouchEnd = () => {
      if (!active) {
        // Geen actieve gesture (was bv. al gecancelled door verticale beweging).
        return
      }
      // Niet beslist als swipe → behandel als no-op (geen cancel-callback).
      if (!decided) {
        reset()
        return
      }

      const deltaX = lastX - startX
      const duration = Math.max(1, lastTime - startTime) // /0-bescherming
      const velocity = deltaX / duration // px/ms
      const viewportWidth = window.innerWidth || 1
      const progress = clamp(deltaX / viewportWidth, 0, 1)

      const shouldCommit =
        progress >= minProgressToCommit || velocity >= minVelocityToCommit

      // Reset eerst zodat een synchrone re-render in `onCommit/onCancel`
      // (bv. `pop()`) niet meer terugzakt naar de oude gesture-state.
      reset()

      if (shouldCommit) {
        onCommit()
      } else {
        onCancel?.()
      }
    }

    const handleTouchCancel = () => {
      // Bv. multitasking-gesture, telefoongesprek, OS-onderbreking. Behandel
      // als cancel zonder commit. Alleen aanroepen wanneer er een actieve
      // beslissing tot swipe was — anders is er niets om te annuleren.
      if (active && decided) {
        reset()
        onCancel?.()
        return
      }
      reset()
    }

    // touchstart kan passive blijven — we doen geen preventDefault tijdens
    // start. touchmove moet niet-passive zijn omdat we daar de scroll
    // selectief blokkeren (zie comment in handleTouchMove).
    node.addEventListener('touchstart', handleTouchStart, { passive: true })
    node.addEventListener('touchmove', handleTouchMove, { passive: false })
    node.addEventListener('touchend', handleTouchEnd)
    node.addEventListener('touchcancel', handleTouchCancel)

    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
      node.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [
    ref,
    enabled,
    edgeWidth,
    minProgressToCommit,
    minVelocityToCommit,
    onCommit,
    onProgress,
    onCancel,
  ])
}
