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
  /**
   * "Nog een …?" ná een toegevoegde post. In de bezittingen-sectie is `qIndex`
   * de index in de ja/nee-vragenlijst; in de schulden-sectie (raster-first
   * sinds B-054, 19 sep 2026) de index in `QUICK_ADD_DEBT_ORDER` — daar
   * bestaat geen vragenlijst meer en hoort de vervolgvraag bij de collect-queue.
   */
  | { kind: 'more'; qIndex: number }
  | { kind: 'other-ask' }
  /**
   * Aanvinkraster: één scherm waarop de gebruiker meerdere soorten tegelijk
   * aanvinkt; daarna opent de wizard één keer per aangevinkt type (collect-
   * queue). Vervangt de staart van losse ja/nee-vragen in de schulden-sectie.
   * De bezittingen-sectie gebruikt 'm (nog) niet — additief, dus veilig gedeeld.
   *
   * De aangevinkte types leven bewust in component-state (en dus hoogstens in
   * de gelifte fase/orchestrator-state), NOOIT in `NonSensitiveDraft`: dat zou
   * de veiligheidskeuze van 3 jul 2026 (gevoelige velden niet persisteren)
   * stilzwijgend omkeren.
   */
  | { kind: 'pick-many' }
  /**
   * Eenmalig tussenscherm in de bezittingen-sectie: "Telt je woning mee voor je
   * vrijheid?" (ADR 0133). Wordt gepusht direct nadat de eerste `eigen_huis`-post
   * is toegevoegd — dus ná de hypotheek-vraag van de wizard — en nooit wanneer er
   * geen woning is. De schulden-sectie gebruikt 'm niet; additief en dus veilig
   * gedeeld, net als `pick-many`.
   */
  | { kind: 'woning-keuze' }
  | { kind: 'other-pick' }
  | { kind: 'other-more' }
  | { kind: 'review' }

/** Stabiele key per interne fase — voedt de scherm-overgang per vraag. */
export function phaseKey(phase: SectionPhase): string {
  return `${phase.kind}-${'qIndex' in phase ? phase.qIndex : ''}`
}

/** Begin-stack van de bezittingen-sub-machine: één scherm (de eerste ja/nee-vraag). */
export function initialSectionPhases(): SectionPhase[] {
  return [{ kind: 'ask', qIndex: 0 }]
}

/**
 * Begin-stack van de schulden-sub-machine: het aanvinkraster (raster-first,
 * B-054 — herziening van H13, eigenaarsbesluit 19 sep 2026).
 */
export function initialSchuldenPhases(): SectionPhase[] {
  return [{ kind: 'pick-many' }]
}

/**
 * Heel een herstelde schulden-stack van vóór raster-first: de ja/nee-kop
 * (`ask`) en haar vervolgvraag (`more`) bestaan als scherm niet meer en de
 * collect-queue waar `more` sinds B-054 bij hoort wordt niet gepersisteerd. Beide
 * landen op het raster; opeenvolgende rasters vouwen samen tot één; een lege
 * stack wordt de beginstack. Alles ná het raster (review, other-pick) blijft.
 */
export function healSchuldenPhases(phases: readonly SectionPhase[]): SectionPhase[] {
  const out: SectionPhase[] = []
  for (const phase of phases) {
    const next: SectionPhase =
      phase.kind === 'ask' || phase.kind === 'more' ? { kind: 'pick-many' } : phase
    const top = out[out.length - 1]
    if (top && top.kind === 'pick-many' && next.kind === 'pick-many') continue
    out.push(next)
  }
  return out.length > 0 ? out : initialSchuldenPhases()
}

export interface SectionPhaseNav {
  /** Huidige fase (top of stack). */
  phase: SectionPhase
  /** Duw een nieuwe fase bovenop de stack (vooruit navigeren). */
  push: (next: SectionPhase) => void
  /**
   * Vervang de bovenste fase (bv. "nog een?" → review): één state-update, zodat
   * een pop + push niet op een verouderde stack rekent.
   */
  replace: (next: SectionPhase) => void
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
 *
 * `initialPhases` bepaalt de uncontrolled beginstack (default: de ja/nee-kop);
 * de schulden-sectie geeft `initialSchuldenPhases` mee.
 */
export function useSectionPhaseNav(
  controlledPhases: SectionPhase[] | undefined,
  onControlledChange: ((phases: SectionPhase[]) => void) | undefined,
  onExitSection: () => void,
  initialPhases: () => SectionPhase[] = initialSectionPhases,
): SectionPhaseNav {
  const [internal, setInternal] = useState<SectionPhase[]>(initialPhases)
  const phases = controlledPhases ?? internal
  const setPhases = useCallback(
    (next: SectionPhase[]) => {
      if (onControlledChange) onControlledChange(next)
      else setInternal(next)
    },
    [onControlledChange],
  )
  const phase = phases[phases.length - 1] ?? initialPhases()[0]
  const push = useCallback(
    (next: SectionPhase) => setPhases([...phases, next]),
    [phases, setPhases],
  )
  const replace = useCallback(
    (next: SectionPhase) => setPhases([...phases.slice(0, -1), next]),
    [phases, setPhases],
  )
  const back = useCallback(() => {
    if (phases.length > 1) setPhases(phases.slice(0, -1))
    else onExitSection()
  }, [phases, setPhases, onExitSection])
  return { phase, push, replace, back }
}
