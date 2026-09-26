'use client'
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

/**
 * "Andere paden naast je doelscenario" — de scenario-kaarten in katern Doelen (ADR 0179
 * D4, fase 4; spec §4.3 wireframe Doelen, §5 "ScenarioKaarten → 2"). Verhuisd uit de
 * Plan-verdieping ("Wat het betekent").
 *
 * De preset-gate verhuist mee (ADR 0145 D7a, kaart V1): `useInViewOnce` draait híér,
 * naast de sectie die hij observeert, en meldt "in beeld" aan de ouder
 * (`markeerDuidingInView`, een grendel in de sim-hook). Onder `solved` start de
 * preset-batch dus pas als dit paneel in beeld komt; onder een vast anker draait hij
 * altijd (die gate staat in `use-toekomst-sim.ts`, niet hier). Doelen klapt dit paneel op
 * mobiel niet in, dus de voorwaarde is alleen "in beeld".
 *
 * Alleen Volledig (spec §4.7: "andere paden: nee" in Eenvoudig). Leest de route niet (D8).
 */

import { useEffect, useRef } from 'react'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { ScenarioKaarten } from '@/components/app/horizon/scenario-kaarten'
import { SectionLabel } from '@/components/editorial'
import type { ScenarioPresetResult } from '@/lib/horizon/scenario-presets'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { ANDERE_PADEN_KOP, ANDERE_PADEN_UITLEG } from '@/lib/horizon/katern-copy'
import { useInViewOnce } from '@/components/toekomst/plan/use-in-view-once'
import { useToekomstEuroContext, useToekomstSimContext } from '@/components/toekomst/state/toekomst-state-provider'

export interface AnderePadenProps {
  /** Heeft de hoofdrun een uitkomst? Dan mount de sectie (en haakt de observer aan). */
  hasRun: boolean
  scenarioPresets: ScenarioPresetResult[] | null
  scenarioPresetsLoading: boolean
  viewScenarioPresets: ScenarioPresetResult[] | null
  /** Wordt aangeroepen zodra de sectie (bijna) in beeld is; de ouder latcht hem (nooit terug). */
  onDuidingInView: () => void
}

export function AnderePaden({
  hasRun,
  scenarioPresets,
  scenarioPresetsLoading,
  viewScenarioPresets,
  onDuidingInView,
}: AnderePadenProps) {
  const { mode: displayMode } = useDisplayMode()
  // De sectie mount pas als de hoofdrun er is én de modus Volledig (HideInSimple). Een
  // ref-wissel triggert geen effect, dus de mount-conditie gaat mee als remountKey — anders
  // haakt de observer nooit aan en draaien de presets onder solved nooit (review fase 1, W5).
  const sectieRef = useRef<HTMLElement | null>(null)
  const inBeeld = useInViewOnce(sectieRef, '600px', `${hasRun}:${displayMode}`)
  useEffect(() => {
    if (inBeeld) onDuidingInView()
  }, [inBeeld, onDuidingInView])

  if (!hasRun) return null
  // Zonder kaarten (batch nog niet gestart, mislukt of leeg) geen kop en geen intro: een
  // lege sectie zegt niets. De sectie zélf blijft gemount, want zij is het doel van de
  // observer — anders start de batch onder `solved` nooit (NP-bevinding na S8).
  const heeftInhoud =
    scenarioPresetsLoading || (scenarioPresets !== null && (viewScenarioPresets ?? []).length > 0)
  return (
    <HideInSimple>
      <section
        ref={sectieRef}
        className={heeftInhoud ? 'mt-8 sm:mt-10' : ''}
        data-testid="doelen-andere-paden"
        data-leeg={heeftInhoud ? undefined : true}
        aria-hidden={heeftInhoud ? undefined : true}
      >
        {heeftInhoud && (
          <>
            {/* Visueel de sectiekicker; voor de koppenboom een h2 (ADR 0110: de shell draagt de h1). */}
            <h2 className="sr-only">{ANDERE_PADEN_KOP}</h2>
            <div aria-hidden="true">
              <SectionLabel num="III">{ANDERE_PADEN_KOP}</SectionLabel>
            </div>
            <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">{ANDERE_PADEN_UITLEG}</p>
            <ScenarioKaarten kaarten={viewScenarioPresets ?? []} isLoading={scenarioPresetsLoading} />
          </>
        )}
      </section>
    </HideInSimple>
  )
}

/** De host in katern Doelen: leest de provider en geeft de grendel-setter door. */
export function DoelenAnderePaden() {
  const { scenarioPresets, scenarioPresetsLoading, markeerDuidingInView, simResult } = useToekomstSimContext()
  const { viewScenarioPresets } = useToekomstEuroContext()
  return (
    <AnderePaden
      hasRun={simResult != null}
      scenarioPresets={scenarioPresets}
      scenarioPresetsLoading={scenarioPresetsLoading}
      viewScenarioPresets={viewScenarioPresets}
      onDuidingInView={markeerDuidingInView}
    />
  )
}
