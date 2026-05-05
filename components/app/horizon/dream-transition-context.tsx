'use client'

/**
 * DreamTransitionContext — Horizon-specifieke per-module transitie (gouden veil
 * bij navigatie tussen Horizon-routes). Plan §8.1: blijft als per-module override
 * actief naast de generieke shell-stack-transition.
 *
 * BELANGRIJK voor portal-componenten (ShellOverlay, BottomSheet, SlideInPane):
 * Deze context is NIET beschikbaar in componenten die via `createPortal` naar
 * `document.body` renderen. Aanroepen van `triggerDream` in panes of sheets
 * vallen terug op de no-op default hieronder. Als je vanuit een open pane wilt
 * navigeren met dream-transitie, sluit eerst de pane (URL-cleanup) en gebruik
 * `triggerDream` in de pagina-content of een ancestor-component.
 */

import { createContext, useContext } from 'react'

export type DreamPhase = 'idle' | 'dissolve' | 'threshold' | 'reveal'

export interface DreamTransitionValue {
  triggerDream: (href: string) => void
  phase: DreamPhase
}

export const DreamTransitionContext = createContext<DreamTransitionValue>({
  // No-op default — actief in portals waar de Provider niet bereikbaar is.
  triggerDream: () => {},
  phase: 'idle',
})

export function useDreamTransition() {
  return useContext(DreamTransitionContext)
}
