'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.2 (swipe-back-gesture)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Visuele wrapper rond MobileStackShell die tijdens een edge-swipe-from-left
 * de hele tray-of-three meeschuift met de vinger. Bij commit (≥50% of hoge
 * velocity) wordt `pop()` op de NavStackProvider aangeroepen; bij cancel
 * (release onder threshold) animeert de transform terug naar 0.
 *
 * Coordinatie met agent A (NavStackProvider + MobileStackShell):
 *  - SwipeBackTracker zit BUITEN MobileStackShell. We schuiven onze eigen
 *    wrapper-laag tijdens de swipe; agent A's interne `key={stackDepth}`
 *    keyframe-animatie blijft inactief tot we daadwerkelijk pop()-en.
 *  - Bij commit zetten we eerst `progress=0` (snap terug naar 0) en roepen
 *    dan `pop()` aan. De stack-depth verandert, agent A's keyframe loopt
 *    één animatie-cycle voor de nieuwe top-entry — geen dubbele transform.
 *  - Bij cancel laten we onze wrapper via een korte CSS-transition (240ms,
 *    matcht agent A's slide-duur) terug naar 0. Agent A's keyframe wordt
 *    niet aangeroepen want de stack verandert niet.
 *
 * Op tab-root (stack.length ≤ 1) is er niets om naar terug te keren; dan
 * disablen we de hook automatisch zodat een per ongeluk uitgevoerde swipe
 * niets doet.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useNavStack } from './nav-stack-provider'
import { useSwipeBack } from '@/lib/hooks/use-swipe-back'

type SwipeBackTrackerProps = {
  /**
   * Externe override om de gesture uit te schakelen (bv. tijdens een
   * lopende stack-transitie of op pagina's die hun eigen horizontale
   * gesture gebruiken). Default true. Wordt gecombineerd met de auto-uit
   * op tab-root.
   */
  enabled?: boolean
  children: ReactNode
}

/** Cancel-animatie-duur in ms — matcht agent A's slide-in animatie (240ms). */
const CANCEL_TRANSITION_MS = 240

/** iOS-spring easing voor consistentie met dual-content-animatie (plan §4.2). */
const CANCEL_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

export function SwipeBackTracker({ enabled = true, children }: SwipeBackTrackerProps) {
  const { currentStack, pop } = useNavStack()
  const ref = useRef<HTMLDivElement>(null)

  // Swipe progress in [0, 1]. We bewaren dit als state zodat React per
  // touchmove re-rendert met de nieuwe transform — voor 60fps is dit
  // acceptabel; bij performance-druk kan dit later naar imperative
  // ref-update worden geüpgrade. Voor sandbox is state-driven prima.
  const [progress, setProgress] = useState(0)

  // Animeren-naar-0-modus voor de cancel-flow. Tijdens drag: false (transform
  // volgt vinger 1:1, géén CSS-transition want anders sleept de UI achter).
  // Na release-zonder-commit: true (transform animeert terug via CSS).
  const [animating, setAnimating] = useState(false)

  // Auto-disable op tab-root: zonder dieper niveau is er geen pop mogelijk.
  // Combineren met de externe `enabled`-prop zodat consumers nog kunnen
  // overrulen (bv. uit zetten tijdens een dual-content-transitie).
  const stackDepth = currentStack.length
  const canPop = stackDepth > 1
  const hookEnabled = enabled && canPop

  const handleProgress = useCallback((p: number) => {
    // Tijdens drag geen CSS-transition — dat zou laggy voelen omdat de
    // wrapper dan met vertraging de vinger volgt. We schakelen
    // `animating` UIT zodra een nieuwe gesture begint.
    setAnimating(false)
    setProgress(p)
  }, [])

  const handleCommit = useCallback(() => {
    // Snap eerst terug naar 0 zodat onze wrapper geen residuale transform
    // op het scherm laat staan terwijl agent A's slide-in-keyframe (op
    // de nieuwe top-entry na pop) speelt. Geen transition — pop()
    // gebeurt onmiddellijk daarna en de visuele continuïteit komt
    // van agent A.
    setAnimating(false)
    setProgress(0)
    pop()
  }, [pop])

  const handleCancel = useCallback(() => {
    // Transition AAN: laat CSS de transform terugbrengen naar 0 in
    // CANCEL_TRANSITION_MS. Daarna progress nul zetten als nette state.
    setAnimating(true)
    setProgress(0)
  }, [])

  useSwipeBack(ref, {
    enabled: hookEnabled,
    onProgress: handleProgress,
    onCommit: handleCommit,
    onCancel: handleCancel,
  })

  // Tijdens swipe schuift de hele tray mee met de vinger. We gebruiken
  // `translate3d` om de browser tot GPU-compositie te dwingen — voorkomt
  // jank op low-end Android-toestellen.
  const translateX = `${(progress * 100).toFixed(2)}%`

  // CSS-transition wordt alleen aangezet TIJDENS een cancel-terugkeer,
  // niet tijdens drag (anders sleept de UI achter de vinger aan).
  const transition = animating
    ? `transform ${CANCEL_TRANSITION_MS}ms ${CANCEL_TRANSITION_EASING}`
    : 'none'

  return (
    <div
      ref={ref}
      // touch-action: pan-y zorgt dat verticale scroll buiten de edge-zone
      // gewoon blijft werken. Onze hook beslist binnen de edge-zone of we
      // de gesture overnemen (en dan preventDefault'en op touchmove).
      style={{
        transform: `translate3d(${translateX}, 0, 0)`,
        transition,
        touchAction: 'pan-y',
        willChange: progress > 0 ? 'transform' : 'auto',
      }}
    >
      {children}
    </div>
  )
}
