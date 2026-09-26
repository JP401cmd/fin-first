'use client'

/**
 * De state-provider van /toekomst (ADR 0179 D1/D8, fase 1 stap 13).
 *
 * Draagt de state, de afgeleide feeds en de euro-render-grens van de
 * pagina, zodat canvas en katern-panelen straks kinderen van één server-layout kunnen
 * zijn en hun data hier halen in plaats van uit de route (D8). Tot de route-groep
 * (stap 15) is `horizon-client.tsx` de enige host.
 *
 * REGELS (ADR 0179 "Gevolgen" — de provider mag niet de nieuwe god-component worden):
 *  - geen JSX-blokken: dit bestand rendert alleen de contexts en `children`;
 *  - één hook per concern, elk in een eigen bestand; de volgorde van de hooks binnen
 *    een concern is die van horizon-client;
 *  - één context per concern, met een waarde die alleen verandert als een veld van dat
 *    concern verandert (`useStabielObject`). Waarom gesplitst en niet één grote waarde:
 *    een katern dat alleen het perspectief of de meldingen leest, rendert dan niet mee
 *    op elke knopbeweging in het lab of elke kernel-run.
 *
 * VOLGORDE van de concern-hooks (dataflow, geen smaak):
 *   perspectief → overlays → scenario-state → sim → meldingen → scenario → lagen → euro.
 * De sim heeft de scenario-state nodig (de wat-als-run van de kernel), de meldingen
 * lezen de sim, de overlay-opener "Na pensioen" leest het perspectief, de lab-afleidingen
 * (scenario) lezen de sim, de lagen tekenen de doel-lijn van het scenario, en de euro-grens
 * zet als laatste de nominale feeds van alle concerns om (precies één grens, ADR 0090/0093).
 *
 * Het scenario-concern bestaat uit twee hooks (state vóór de sim, afleidingen erna); de
 * provider voegt ze samen tot één context-waarde.
 */

import { createContext, useContext, type Context, type ReactNode } from 'react'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { GoalMarkerInput } from '@/lib/horizon/goal-chart-markers'
import { useStabielObject } from './use-stabiel-object'
import { useToekomstPerspectief, type ToekomstPerspectief } from './use-toekomst-perspectief'
import { useToekomstOverlayState, type ToekomstOverlayState } from './use-toekomst-overlay-state'
import { useToekomstScenarioState, useToekomstScenario, type ToekomstScenario } from './use-toekomst-scenario'
import { useToekomstSim, type ToekomstSim } from './use-toekomst-sim'
import { useToekomstMeldingen, type ToekomstMeldingen } from './use-toekomst-meldingen'
import { useToekomstLagen, type ToekomstLagen } from './use-toekomst-lagen'
import { useToekomstEuro, type ToekomstEuro } from './use-euro-view-feeds'

/** De server-bundel zoals de pagina hem kreeg (props-als-bron, ADR 0179 stap 3). */
export interface ToekomstBron {
  initialData: HorizonPageData
  /** M36 — doelen met een streefdatum, als markers op de tijdas. */
  goals: readonly GoalMarkerInput[] | undefined
}

const BronContext = createContext<ToekomstBron | null>(null)
const PerspectiefContext = createContext<ToekomstPerspectief | null>(null)
const OverlayContext = createContext<ToekomstOverlayState | null>(null)
const ScenarioContext = createContext<ToekomstScenario | null>(null)
const SimContext = createContext<ToekomstSim | null>(null)
const MeldingenContext = createContext<ToekomstMeldingen | null>(null)
const LagenContext = createContext<ToekomstLagen | null>(null)
/** De `view*`-feeds van de euro-render-grens: het enige wat katernen aan euro-bedragen lezen. */
const EuroContext = createContext<ToekomstEuro | null>(null)

function useVerplicht<T>(context: Context<T | null>, naam: string): T {
  const waarde = useContext(context)
  if (waarde == null) throw new Error(`${naam}() werkt alleen binnen <ToekomstStateProvider>`)
  return waarde
}

export const useToekomstBron = () => useVerplicht(BronContext, 'useToekomstBron')
export const useToekomstPerspectiefContext = () => useVerplicht(PerspectiefContext, 'useToekomstPerspectiefContext')
export const useToekomstOverlayContext = () => useVerplicht(OverlayContext, 'useToekomstOverlayContext')
export const useToekomstScenarioContext = () => useVerplicht(ScenarioContext, 'useToekomstScenarioContext')
export const useToekomstSimContext = () => useVerplicht(SimContext, 'useToekomstSimContext')
export const useToekomstMeldingenContext = () => useVerplicht(MeldingenContext, 'useToekomstMeldingenContext')
export const useToekomstLagenContext = () => useVerplicht(LagenContext, 'useToekomstLagenContext')
export const useToekomstEuroContext = () => useVerplicht(EuroContext, 'useToekomstEuroContext')

export function ToekomstStateProvider({
  initialData,
  goals,
  children,
}: {
  initialData: HorizonPageData
  goals?: readonly GoalMarkerInput[]
  children: ReactNode
}) {
  const bron = useStabielObject<ToekomstBron>({ initialData, goals })
  const perspectief = useToekomstPerspectief()
  const overlays = useToekomstOverlayState({ perspectief })
  const scenarioState = useToekomstScenarioState({ initialData })
  const sim = useToekomstSim({ initialData, perspectief, scenarioState })
  const meldingen = useToekomstMeldingen({ initialData, perspectief, sim })
  const scenarioAfgeleid = useToekomstScenario({ initialData, scenarioState, sim })
  const scenario = useStabielObject({ ...scenarioState, ...scenarioAfgeleid })
  const lagen = useToekomstLagen({ initialData, goals, perspectief, overlays, scenarioState, sim, meldingen, lab: scenario })
  const euro = useToekomstEuro({ perspectief, sim, scenario, lagen })

  return (
    <BronContext.Provider value={bron}>
      <PerspectiefContext.Provider value={perspectief}>
        <OverlayContext.Provider value={overlays}>
          <ScenarioContext.Provider value={scenario}>
            <SimContext.Provider value={sim}>
              <MeldingenContext.Provider value={meldingen}>
                <LagenContext.Provider value={lagen}>
                  <EuroContext.Provider value={euro}>{children}</EuroContext.Provider>
                </LagenContext.Provider>
              </MeldingenContext.Provider>
            </SimContext.Provider>
          </ScenarioContext.Provider>
        </OverlayContext.Provider>
      </PerspectiefContext.Provider>
    </BronContext.Provider>
  )
}
