'use client'

import { useCallback, useState } from 'react'

/**
 * Interne fase van de begeleide Bezittingen/Schulden-sub-machines. Beide secties
 * delen exact dezelfde fasenstructuur (ask → more → other-ask → other-pick →
 * other-more → review).
 *
 * De fase leeft als een STACK zodat "Terug" bínnen de sectie één scherm per klik
 * terugloopt i.p.v. de hele groep over te slaan. De orchestrator LIFT de stack
 * (controlled props) zodat terugkeer uit een latere groep op het laatst getoonde
 * scherm landt (bv. het review-overzicht) i.p.v. op vraag 1 — dat was de
 * terugknop-bug: de sub-machine remountte en reset z'n interne fase naar Q1.
 */
export type SectionPhase =
  | { kind: 'ask'; qIndex: number }
  | { kind: 'more'; qIndex: number }
  | { kind: 'other-ask' }
  | { kind: 'other-pick' }
  | { kind: 'other-more' }
  | { kind: 'review' }

/** Stabiele key per interne fase — voedt de scherm-overgang per vraag. */
export function phaseKey(phase: SectionPhase): string {
  return `${phase.kind}-${'qIndex' in phase ? phase.qIndex : ''}`
}

/** Begin-stack van een sub-machine: één scherm (de eerste ja/nee-vraag). */
export function initialSectionPhases(): SectionPhase[] {
  return [{ kind: 'ask', qIndex: 0 }]
}

export interface SectionPhaseNav {
  /** Huidige fase (top of stack). */
  phase: SectionPhase
  /** Duw een nieuwe fase bovenop de stack (vooruit navigeren). */
  push: (next: SectionPhase) => void
  /**
   * Terug: pop de bovenste fase; op de eerste fase (stack-bodem) valt dit
   * terug op de groep-brede `onExitSection` (de orchestrator-`onBack`).
   */
  back: () => void
}

/**
 * Beheert de fase-stack van een sub-machine. Controlled wanneer de orchestrator
 * `controlledPhases` + `onControlledChange` levert (de fase overleeft dan een
 * remount doordat 'ie in de orchestrator-state leeft); anders uncontrolled via
 * interne `useState` — bv. in unit-tests die de sectie los renderen.
 */
export function useSectionPhaseNav(
  controlledPhases: SectionPhase[] | undefined,
  onControlledChange: ((phases: SectionPhase[]) => void) | undefined,
  onExitSection: () => void,
): SectionPhaseNav {
  const [internal, setInternal] = useState<SectionPhase[]>(initialSectionPhases)
  const phases = controlledPhases ?? internal
  const setPhases = useCallback(
    (next: SectionPhase[]) => {
      if (onControlledChange) onControlledChange(next)
      else setInternal(next)
    },
    [onControlledChange],
  )
  const phase = phases[phases.length - 1] ?? { kind: 'ask', qIndex: 0 }
  const push = useCallback(
    (next: SectionPhase) => setPhases([...phases, next]),
    [phases, setPhases],
  )
  const back = useCallback(() => {
    if (phases.length > 1) setPhases(phases.slice(0, -1))
    else onExitSection()
  }, [phases, setPhases, onExitSection])
  return { phase, push, back }
}
