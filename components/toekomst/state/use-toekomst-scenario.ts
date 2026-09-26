'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 13).
//
// Scenario-/lab-STATE (de knoppen, het doelblok, de sheets van Doelen): de state die de
// scenario-run van de kernel voedt en dus vóór `useToekomstSim` moet bestaan.
//
// Pure move: de statements staan in dezelfde onderlinge volgorde als in horizon-client,
// met dezelfde dependency-arrays. De provider (`toekomst-state-provider.tsx`) roept deze
// hook aan en deelt het resultaat per concern via een eigen context.

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { LabKnopWeergave } from '@/components/app/horizon/lab-knoppen'
import { type ToekomstScenarioDoel, KNOP_WEERGAVE_STANDAARD } from '@/lib/horizon/toekomst-scenario'
import type { HorizonScenarioOverrides } from '@/lib/hooks/use-horizon-fire-sim'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import { useStabielObject } from './use-stabiel-object'

export function useToekomstScenarioState({ initialData }: { initialData: HorizonPageData }) {
  /**
   * Knop "Uitgave na pensioen" (€/jaar); `null` = wat het plan rekent, geen override.
   * Sinds ADR 0170 reist deze knop méé in de scenario-pref (`uitgaveNaPensioen`), zodat een
   * herlaad de verkenning terugbrengt — net als de slider-events en de rendement-delta's.
   */
  const [scenarioUitgaveNaPensioen, setScenarioUitgaveNaPensioen] = useState<number | null>(
    () => initialData.toekomstScenarioPrefs?.uitgaveNaPensioen ?? null,
  )

  // Heeft de gebruiker deze sessie zijn doel losgelaten? (melding B-031)
  // ── Wat-als-scenariolaag (2e projectielijn, plan §B — stap 4) ─────────────
  // Slider-events leven hier GESCHEIDEN van de DB-events (`events`, :257) zodat de
  // hoofdlijn ongemoeid blijft; ze voeden uitsluitend de scenario-run. Hydratie uit
  // `initialData.toekomstScenarioPrefs` (sliders reconstrueren via `buildSliderEvent`
  // zodra `whatIfBaseline` + `currentAge` beschikbaar zijn — zie hydratie-effect).
  const [scenarioSliderEvents, setScenarioSliderEvents] = useState<WhatIfEvent[]>([])
  const [scenarioReturnDeltas, setScenarioReturnDeltas] = useState<Record<string, number>>(
    () => ({ ...(initialData.toekomstScenarioPrefs?.returnDeltaByCategorie ?? {}) }),
  )
  const [scenarioStopAge, setScenarioStopAge] = useState<number | null>(
    () => initialData.toekomstScenarioPrefs?.stopAge ?? null,
  )
  const [showScenarioLine, setShowScenarioLine] = useState<boolean>(
    () => initialData.toekomstScenarioPrefs?.showScenarioLine ?? true,
  )
  /**
   * De vorm van de doelscenario-knoppen (ADR 0170): balken of wijzers. Server-side bewaard
   * naast de andere weergavevlag (`showScenarioLine`), dus cross-device — het is een keuze
   * over hoe je je plan wilt lezen, niet een "even niet tonen" per apparaat.
   */
  const [knopWeergave, setKnopWeergave] = useState<LabKnopWeergave>(
    () => initialData.toekomstScenarioPrefs?.knopWeergave ?? KNOP_WEERGAVE_STANDAARD,
  )
  const scenarioHydratedRef = useRef(false)
  // ADR 0170 — de koppelmodus (`stopKoppel`/`stopMarge`, `lockedMargeRef`) verviel met de
  // marge-band: er is geen verwacht-streep meer om een marge tegen aan te houden. De
  // stopleeftijd is voortaan altijd een absolute keuze.
  //
  // Knop 4 — nalatenschap (€) als VERKENNING; `null` = wat het plan rekent. Spiegel van
  // `scenarioUitgaveNaPensioen`: beide zijn profielparameters, geen slider-events, en reizen
  // dus niet in `scenarioSliderEvents` mee maar via `scenarioOverrides`.
  const [scenarioNalatenschap, setScenarioNalatenschap] = useState<number | null>(
    () => initialData.toekomstScenarioPrefs?.nalatenschap ?? null,
  )

  // ── Vastgelegd doelscenario ("verkennen wordt richten", ronde 4) ─────────────
  // Client-state, gehydrateerd uit de pref. GEEN her-read na de route-respons: het blok
  // blijft leidend in de UI én gaat via `buildScenarioPersistPayload` in ELKE scenario-PUT
  // mee (anders wist de volledige-overwrite-route het bij de eerste sliderbeweging).
  const [doelBlok, setDoelBlok] = useState<ToekomstScenarioDoel | null>(
    () => initialData.toekomstScenarioPrefs?.doel ?? null,
  )
  // Vastleg-/bijwerk-sheet + PUT-in-flight.
  const [doelSheetOpen, setDoelSheetOpen] = useState(false)
  const [doelSaving, setDoelSaving] = useState(false)
  // "Doel loslaten"-bevestiging (gedeelde ShellOverlay-confirm i.p.v. window.confirm).
  const [doelLoslatenOpen, setDoelLoslatenOpen] = useState(false)
  // TPR-09 — "Maak dit mijn plan": de verkende stopleeftijd wordt het plan-anker.
  // Bevestiging (ShellOverlay-confirm) + PUT-in-flight + inline fout (validatie/route).
  const [stopPlanConfirmOpen, setStopPlanConfirmOpen] = useState(false)
  const [stopPlanSaving, setStopPlanSaving] = useState(false)
  const [stopPlanError, setStopPlanError] = useState('')

  // Eerste-sleep-hint: éénmalig (per apparaat) een aanwijzer naar de gestippelde grafieklijn
  // bij de allereerste sliderbeweging. "Even niet meer tonen"-klasse → localStorage,
  // géén server-pref.
  const [firstDragHintVisible, setFirstDragHintVisible] = useState(false)
  const firstDragHandledRef = useRef(false)
  const markFirstSliderDrag = useCallback(() => {
    if (firstDragHandledRef.current) return
    firstDragHandledRef.current = true
    let seen = false
    try { seen = !!window.localStorage.getItem('trifinity:whatif-first-drag-hint') } catch { /* private mode */ }
    if (seen) return
    try { window.localStorage.setItem('trifinity:whatif-first-drag-hint', '1') } catch { /* private mode */ }
    setFirstDragHintVisible(true)
  }, [])
  const dismissFirstDragHint = useCallback(() => setFirstDragHintVisible(false), [])
  // Wrapper om de scenario-slider-setter: markeert de eerste sleep zonder het setEvents-contract
  // te wijzigen (WhatIfSliders krijgt deze i.p.v. de kale setter).
  const handleScenarioSliderEvents = useCallback(
    (updater: (prev: WhatIfEvent[]) => WhatIfEvent[]) => {
      markFirstSliderDrag()
      setScenarioSliderEvents(updater)
    },
    [markFirstSliderDrag],
  )
  // Auto-verdwijnen: de hint sluit vanzelf na een korte tijd (de dismissal is al persistent).
  useEffect(() => {
    if (!firstDragHintVisible) return
    const t = setTimeout(() => setFirstDragHintVisible(false), 7000)
    return () => clearTimeout(t)
  }, [firstDragHintVisible])

  // Afgeleid: is er een actief wat-als-scenario? (≥1 afwijkende slider of rendement-delta.)
  // `stopAge` telt bewust NIET mee voor de scenario-RUN — die blijft de gesolvede "wanneer
  // kán ik vrij zijn"-projectie. Voor de gestippelde DOEL-LIJN telt de stopkeuze wél mee
  // (ADR 0085): dan wint het geforceerde stop-pad als bron. Zie `doelLijnBron` verderop.
  const hasScenario =
    scenarioSliderEvents.length > 0 ||
    Object.keys(scenarioReturnDeltas).length > 0 ||
    scenarioUitgaveNaPensioen != null ||
    scenarioNalatenschap != null
  /**
   * De gestippelde wat-als-lijn verschijnt zodra je aan een knop draait (ADR 0170, 20 sep
   * 2026). Zonder die lijn zie je de knoppen wél kleuren maar niet wát er in de grafiek
   * verandert — en juist die lijn is waar de knoppen over gaan.
   *
   * Alleen op de OVERGANG van "geen verkenning" naar "wel een verkenning", niet bij elke
   * knopbeweging: zet de gebruiker de lijn daarna bewust uit, dan blijft dat zo tot hij
   * terug naar basis gaat en opnieuw begint. Een ref houdt de vorige stand vast, zodat het
   * effect bij het laden van een bewaarde verkenning niet alsnog een opgeslagen "uit"
   * overschrijft.
   */
  const hadScenarioRef = useRef(hasScenario)
  useEffect(() => {
    const had = hadScenarioRef.current
    hadScenarioRef.current = hasScenario
    if (!had && hasScenario) setShowScenarioLine(true)
  }, [hasScenario])

  /** Staat er een gekozen stopleeftijd? */
  const hasStopKeuze = scenarioStopAge != null
  // Is er een doel vastgelegd? Stuurt de doel-taal (kop/chip/as/legenda) en de sectie-states.
  const doelActief = doelBlok != null
  /** Naam van de gestippelde tweede lijn — drieslag: vastgelegd doel → live wat-als →
   *  alleen een gekozen stopleeftijd. Eén bron voor pill, aria-label en legenda. */
  const doelLijnLabel = doelActief ? 'Doel' : hasScenario ? 'Wat-als' : 'Stopkeuze'
  // Overrides voor de gescheiden 2e run in de hook; null ⇒ geen scenario-run.
  const scenarioOverrides = useMemo<HorizonScenarioOverrides | null>(() => {
    if (!hasScenario) return null
    return {
      extraLifeEvents: scenarioSliderEvents,
      returnDeltaByCategorie: scenarioReturnDeltas as Partial<Record<AssetCategorie, number>>,
      ...(scenarioUitgaveNaPensioen != null
        ? { uitgaveNaPensioenPerJaar: scenarioUitgaveNaPensioen }
        : {}),
      ...(scenarioNalatenschap != null ? { nalatenschap: scenarioNalatenschap } : {}),
    }
  }, [
    hasScenario,
    scenarioSliderEvents,
    scenarioReturnDeltas,
    scenarioUitgaveNaPensioen,
    scenarioNalatenschap,
  ])

  return useStabielObject({
    scenarioUitgaveNaPensioen,
    setScenarioUitgaveNaPensioen,
    scenarioSliderEvents,
    setScenarioSliderEvents,
    scenarioReturnDeltas,
    setScenarioReturnDeltas,
    scenarioStopAge,
    setScenarioStopAge,
    showScenarioLine,
    setShowScenarioLine,
    knopWeergave,
    setKnopWeergave,
    scenarioHydratedRef,
    scenarioNalatenschap,
    setScenarioNalatenschap,
    doelBlok,
    setDoelBlok,
    doelSheetOpen,
    setDoelSheetOpen,
    doelSaving,
    setDoelSaving,
    doelLoslatenOpen,
    setDoelLoslatenOpen,
    stopPlanConfirmOpen,
    setStopPlanConfirmOpen,
    stopPlanSaving,
    setStopPlanSaving,
    stopPlanError,
    setStopPlanError,
    firstDragHintVisible,
    markFirstSliderDrag,
    dismissFirstDragHint,
    hasScenario,
    hasStopKeuze,
    doelActief,
    doelLijnLabel,
    scenarioOverrides,
  })
}

export type ToekomstScenarioState = ReturnType<typeof useToekomstScenarioState>
