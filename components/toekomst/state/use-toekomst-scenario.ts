'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 13 en 14).
//
// Scenario en lab (het doelscenario van Doelen). Twee hooks, één concern:
//  - `useToekomstScenarioState` (stap 13): de state van de knoppen, het doelblok en de sheets.
//    Die voedt de scenario-run van de kernel en moet dus vóór `useToekomstSim` bestaan.
//  - `useToekomstScenario` (stap 14): alles wat de sim-uitkomst nodig heeft — de lab-uitkomst,
//    de grenzen-batch (E15), de knoppen, de doel-lijn, de doel-handlers, de hydratie (E11)
//    en de autosave (E16). (De duiding-rijen voor strook en radar vervielen met het
//    addendum van 26 sep op ADR 0179.)
// De provider voegt beide samen tot één context-waarde.
//
// Pure move: de statements staan in dezelfde onderlinge volgorde als in horizon-client, met
// dezelfde dependency-arrays. `labKnoppen`, `nalatenschapMarker` en `labFormatters` kwamen uit
// de euro-render-grens (stap 12): ze deflateren niets en horen bij de knoppen.

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { useToast } from '@/components/app/toast-provider'
import { formatMaskedCurrency, formatCurrency, MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  zoneVanHuidig,
  type HefboomBereik,
  type HefboomKey,
  type LabGrenzenResultaat,
  zoneVanWaarde,
  HEFBOOM_RICHTING,
} from '@/lib/horizon/lab-grenzen-types'
import type { LabOpslaanToestand } from '@/components/app/horizon/lab-opslaan-balk'
import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'
import { selectDoelLijnBron } from '@/lib/horizon/doel-lijn-bron'
import {
  dekkingDeltaBadge,
  dekkingPreviewWaarde,
  dekkingVastgelegdToast,
  eindvermogenVastgelegdToast,
  formatStopAge,
} from '@/lib/horizon/anker-copy'
import { resolveLabUitkomst, type LabUitkomst } from '@/lib/horizon/lab-uitkomst'
import { GOAL_TYPE_LABELS } from '@/lib/goal-data'
import {
  buildCategorieReturnGroups,
  isDoelConceptGewijzigd,
  stripStopKeuze,
  type DoelParameter,
  KNOP_WEERGAVE_STANDAARD,
  knopWeergaveVoor,
  type KnopBreekpunt,
  type ToekomstScenarioDoel,
} from '@/lib/horizon/toekomst-scenario'
import { doelGewogenRendement } from '@/lib/horizon/toekomst-doel'
import { doelStandNaarLab } from '@/lib/horizon/doel-stand'
import { buildLiveStand, buildScenarioPersistPayload, type DoelParameterPreview } from '@/components/app/horizon/doel-vastleg-sheet'
import { planDraftFromSettings, planDraftToFireSettingsBody, validatePlanDraft } from '@/lib/horizon/plan-draft'
import {
  applySliderEvent,
  buildSliderEvent,
  computeSliderUiRange,
  readSliderValueFromEvents,
  stopKnopBereik,
  uitgaveNaPensioenRange,
  UITGAVE_NA_PENSIOEN_STAP,
  type SliderKey,
  savingsEuroForPp,
} from '@/lib/scenario-events'
import { resolveScenarioContext, type HorizonScenarioOverrides } from '@/lib/hooks/use-horizon-fire-sim'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { runLabGrenzenAsync } from '@/lib/horizon-kernel/worker/run-in-worker'
import type { ScenarioOverlay } from '@/components/app/horizon/sim-chart'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import { simRowsToChartPoints } from '@/lib/horizon/sim-chart-geometry'
import { buildBaselineOverrides } from '@/lib/whatif-overrides'
import type { WhatIfOverrides, WhatIfEvent } from '@/lib/types/horizon-whatif'
import { formatAge } from '@/lib/horizon/fire-format'
import type { LabKnopConfig, LabKnopFormatters, LabKnopWeergave } from '@/components/app/horizon/lab-knoppen'
import { useStabielObject } from './use-stabiel-object'
import type { ToekomstSim } from './use-toekomst-sim'

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
   * De vorm van de doelscenario-knoppen per breekpunt (ADR 0179 D7): standaard harp op
   * desktop, rad op mobiel. Server-side bewaard naast de andere weergavevlag
   * (`showScenarioLine`), dus cross-device — het is een keuze over hoe je je plan wilt lezen,
   * niet een "even niet tonen" per apparaat. Elk breekpunt schrijft alleen zijn eigen sleutel.
   */
  const [knopWeergave, setKnopWeergaveRecord] = useState<Record<KnopBreekpunt, LabKnopWeergave>>(() => ({
    desktop: knopWeergaveVoor(initialData.toekomstScenarioPrefs, 'desktop'),
    mobiel: knopWeergaveVoor(initialData.toekomstScenarioPrefs, 'mobiel'),
  }))
  const setKnopWeergave = useCallback(
    (breekpunt: KnopBreekpunt, vorm: LabKnopWeergave) =>
      setKnopWeergaveRecord((prev) => (prev[breekpunt] === vorm ? prev : { ...prev, [breekpunt]: vorm })),
    [],
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

export function useToekomstScenario({ initialData, scenarioState, sim }: { initialData: HorizonPageData; scenarioState: ToekomstScenarioState; sim: ToekomstSim }) {
  const {
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
    scenarioHydratedRef,
    scenarioNalatenschap,
    setScenarioNalatenschap,
    doelBlok,
    setDoelBlok,
    setDoelSheetOpen,
    setDoelSaving,
    setDoelLoslatenOpen,
    setStopPlanConfirmOpen,
    setStopPlanSaving,
    setStopPlanError,
    markFirstSliderDrag,
    hasScenario,
    hasStopKeuze,
    doelActief,
    doelLijnLabel,
    scenarioOverrides,
  } = scenarioState
  const {
    input,
    fireParams,
    kernelRawProfile,
    aowRows,
    userAowAge,
    debts,
    events,
    haalbareUitgave,
    startRefresh,
    simResult,
    kernelMaandHint,
    scenario,
    stopPad,
    loadData,
    effectiveInput,
    currentAge,
    planAnchor,
    isFixedAnchorMode,
    isPensioenMode,
    displayEndAge,
  } = sim
  const { masked } = useMaskedAmounts()
  const { addToast } = useToast()
  const router = useRouter()

  // ── Baseline overrides for inline what-if sliders (feature #795) ───────
  // effectiveSavingsRatePct: server-canoniek getal (grondslag-geresolveerd)
  // zodat de slider start op dezelfde spaarquote als de cashflow-pagina.
  const whatIfBaseline = useMemo<WhatIfOverrides | null>(() => {
    if (!effectiveInput) return null
    return buildBaselineOverrides(effectiveInput, fireParams.grossReturn, initialData.healthScoreInput.effectiveSavingsRatePct)
  }, [effectiveInput, fireParams.grossReturn, initialData.healthScoreInput.effectiveSavingsRatePct])

  // ── Wat-als-hydratie + koppel-semantiek (stap 4) ──────────────────────────
  // Slider-standen reconstrueren uit de bewaarde pref zodra de baseline + leeftijd
  // bekend zijn (pref-keys camelCase → kernel-`SliderKey` snake_case). Eén keer.
  useEffect(() => {
    if (scenarioHydratedRef.current) return
    if (!whatIfBaseline || currentAge === null) return
    scenarioHydratedRef.current = true
    const prefs = initialData.toekomstScenarioPrefs
    if (!prefs?.sliders) return
    // income is geen lab-parameter meer (spec §2, 15 sep 2026) — een legacy pref met
    // sliders.income wordt hier bewust genegeerd (de parser leest 'm tolerant, deze
    // hydratie bouwt er geen event meer voor).
    const KEY_MAP: Record<string, SliderKey> = {
      savings: 'savings',
      extraInleg: 'extra_inleg',
    }
    const evs: WhatIfEvent[] = []
    for (const [prefKey, sliderKey] of Object.entries(KEY_MAP)) {
      const val = prefs.sliders[prefKey as keyof typeof prefs.sliders]
      if (val === undefined) continue
      const ev = buildSliderEvent(sliderKey, val, whatIfBaseline, currentAge)
      if (ev) evs.push(ev)
    }
    if (evs.length > 0) setScenarioSliderEvents(evs)
  }, [whatIfBaseline, currentAge, initialData.toekomstScenarioPrefs])

  // Verwacht-FIRE van het actieve pad (scenario indien actief, anders basis).
  // `Settled` is null zolang de scenario-run nog onderweg is: de koppel-machinerie
  // (marge vergrendelen/corrigeren) mag nooit tegen de tijdelijke basis-fallback
  // rekenen — die joeg na een herlaad de stopleeftijd weg (marge vergrendeld op
  // basis-FIRE, daarna "gecorrigeerd" tegen scenario-FIRE). Weergave gebruikt de
  // fallback wél (kort basis tonen tot de run landt is prima).
  const scenarioVerwachtSettled = hasScenario
    ? (scenario != null ? scenario.result.fireAgeFractional : null)
    : (simResult?.fireAgeFractional ?? null)
  const scenarioVerwachtFireAge = scenarioVerwachtSettled ?? simResult?.fireAgeFractional ?? null

  // ── Lab-uitkomst — ÉÉN uitkomst-switch per anker (ADR 0145) ─────────────────────────
  // Onder `solved` bewegen de knoppen de vrijheidsleeftijd (passthrough van vandaag);
  // onder een vast stopmoment de DEKKING. De switch bepaalt óók de promotie-gate
  // ("mag hier een doel uit het lab komen?"). Consume-only: de dekking komt uit
  // `computeRunwayCoveragePct` binnen de helper, op dezelfde runs die hier al draaien.
  const labUitkomst: LabUitkomst = useMemo(
    () =>
      resolveLabUitkomst({
        planAnchor,
        currentAge,
        basis: simResult,
        scenario: hasScenario && scenario != null ? scenario.result : null,
        stopPad: stopPad ?? null,
        kernelMaandHint,
        hasScenario,
        hasStopKeuze,
      }),
    [planAnchor, currentAge, simResult, hasScenario, scenario, stopPad, kernelMaandHint, hasStopKeuze],
  )
  const labPromotie = labUitkomst.promotie
  // Eindreview M10 — een eindvermogen-doel pas aanbieden als het scenario-BEDRAG bekend is
  // (de worker kan nog lopen): anders opent de sheet zonder de vaste rij en stuurt de klik
  // geen doelwaarde mee.
  const eindvermogenDoelBekend =
    labUitkomst.kind === 'dekking' && labUitkomst.scenarioEindvermogen?.kind === 'bedrag'
  const doelVastleggenMogelijk =
    labPromotie.kind !== 'geen' && (labPromotie.kind !== 'eindvermogen' || eindvermogenDoelBekend)
  // Onder solved: als vóór ADR 0145 (altijd bij een doel). Onder een vast anker alleen
  // wanneer er iets vast te leggen is — anders opent het venster zonder rijen. D12: bij een
  // gedekt plan is dat het eindvermogen.
  const doelBijwerkenMogelijk =
    doelActief &&
    (labUitkomst.kind === 'vrijheidsleeftijd' ||
      labPromotie.kind === 'dekking' ||
      (labPromotie.kind === 'eindvermogen' && eindvermogenDoelBekend))
  // De dekking-uitkomst als losse afleiding (null onder `solved`) — alle dekking-
  // oppervlakken hieronder lezen deze ene waarde.
  const labDekking = labUitkomst.kind === 'dekking' ? labUitkomst : null
  // ── Doel-/wat-als-lijn (2e projectielijn, plan §E + ADR 0085) ───────────────
  // De BRON kiest `selectDoelLijnBron`: het geforceerde stop-pad wanneer er een
  // (betekenisvolle) stopleeftijd staat — opbouw tot je stopleeftijd, daarna
  // onttrekking — anders de gesolvede scenario-run. Rijen, stip én ruis-drempel
  // komen altijd uit dezelfde (deferred) run; de rauwe `scenarioStopAge` is hier
  // bewust GEEN dependency, zodat een 0,5-slider-tick de chart-identiteit niet
  // per tick ververst (review M1). Losgekoppeld van de zichtbaarheids-toggle,
  // zodat de pill dezelfde waarheid leest als de lijn (review H1 — geen dode knop).
  const doelLijnBron = useMemo(
    () =>
      selectDoelLijnBron({
        stopPad,
        // Zonder actief wat-als bestaat er geen scenario-lijn (gedrag van vóór ADR 0085).
        scenario: hasScenario ? scenario : null,
        stopKeuzeActief: hasStopKeuze,
        verwachtFireAge: scenarioVerwachtFireAge,
        hasScenario,
        isPensioenMode,
      }),
    [stopPad, hasScenario, scenario, hasStopKeuze, scenarioVerwachtFireAge, isPensioenMode],
  )
  /** Is er écht iets te tekenen als tweede, gestippelde lijn? Stuurt ALLEEN de
   *  toggle-pill en de overlay — dezelfde bron-waarheid, dus nooit een zichtbare
   *  pill zonder lijn. Alle overige consumenten blijven op `hasScenario`. */
  const hasDoelLijn = doelLijnBron != null

  // Gestippelde ink-lijn + FIRE-stip via `variant: 'scenario'` (chart-static-layers);
  // kleur wordt genegeerd (inkt vast). Sinds ADR 0179 fase 2 ongeacht de toggle: in
  // katern Doelen is de lijn een vaste laag, in Plan een keuze. Het canvas beslist of
  // hij getekend wordt (`canvas-stand.ts`, laag `doelscenario`), op naam `'wat-als'`.
  const scenarioLineOverlay = useMemo<ScenarioOverlay | null>(() => {
    if (doelLijnBron == null) return null
    return {
      name: 'wat-als',
      // "Jouw doel" · "Jouw wat-als" · "Jouw stopkeuze" (zelfde drieslag als de pill).
      label: `Jouw ${doelLijnLabel.toLowerCase()}`,
      color: 'var(--ink-2)',
      // Clip op dezelfde `displayEndAge` als de hoofdlijn (zie displaySimRows) — anders
      // loopt de gestippelde lijn een jaar verder door dan de basislijn.
      points: simRowsToChartPoints(clipRowsToPlanEnd(doelLijnBron.rows, displayEndAge)),
      variant: 'scenario',
      fireAgeFractional: doelLijnBron.fireAgeFractional,
      // Stop-bron ⇒ legenda toont "(stop 63)" i.p.v. de gesolvede "(57j)".
      ageLabel: doelLijnBron.bron === 'stop' ? 'stop' : 'fire',
    }
  }, [doelLijnBron, displayEndAge, doelLijnLabel])

  // Gewogen baseline-rendement per bezeten categorie (Marktbias-UI). Gememoized zodat
  // de inline-call in de JSX niet elke render een verse array-identiteit oplevert.
  // `fireParams.grossReturn` = dezelfde terugval als de kernel voor een bezitting
  // zonder eigen rendement (TPR-02) — zo toont de Marktbias wat de simulatie rekent.
  const categorieReturnGroups = useMemo(
    () => buildCategorieReturnGroups(initialData.assets, fireParams.grossReturn),
    [initialData.assets, fireParams.grossReturn],
  )

  // ── Vrijheidsas + stop-marge (plan §D) ──────────────────────────────────────
  const scenarioBaseFireAge = simResult?.fireAgeFractional ?? null

  // Effectieve stopleeftijd — de knop werkt controlled op dit getal; is er nog niets
  // gekozen dan default naar de (afgeronde) verwacht-FIRE, anders currentAge+1.
  // ADR 0129 F3b — onder een vast anker is de default het STOPMOMENT VAN HET PLAN
  // (halve jaren): de knop is dan een verkenning tegen het plan, niet tegen de
  // gesolvede FIRE-leeftijd.
  const planStopAgeDefault: number | null =
    simResult?.vastStopLeeftijd ??
    (planAnchor.kind === 'age' ? planAnchor.age : planAnchor.kind === 'aow' ? userAowAge.fractional : null)
  const effectiveStopAge =
    scenarioStopAge ??
    (isFixedAnchorMode && planStopAgeDefault != null && Number.isFinite(planStopAgeDefault)
      ? Math.round(planStopAgeDefault * 2) / 2
      : scenarioVerwachtFireAge !== null
        // Naar BOVEN op het 0,5-raster van de knop, nooit `Math.round`: sinds ADR 0170 voedt
        // deze waarde het kern-oordeel (de geankerde run op de stop-stand), niet meer alleen
        // een marker. Een fractionele vrijheidsleeftijd van 55,417 naar beneden afronden zet
        // het anker vóór het gesolvede punt en levert `anchor_shortfall` — dan zou de schaal
        // "reikt niet" zeggen puur door de afronding, en per gebruiker verschillend.
        ? Math.ceil(scenarioVerwachtFireAge * 2) / 2
        : currentAge !== null
          ? Math.round(currentAge) + 1
          : 60)

  // Marge-criterium van het vrijheidsleeftijd-doel (`fire_age`-metadata): de afstand tussen
  // de gekozen stopleeftijd en de verwachte vrijheidsleeftijd. ADR 0170 haalde de marge-BAND
  // weg (er is geen driezone tegen een voorzichtige variant meer), maar het doel-criterium
  // "vrij op X, met ten minste Y jaar marge" blijft — nu als losse afleiding in plaats van
  // via `computeStopMarge`.
  const doelMargeRuw = scenarioVerwachtFireAge !== null ? effectiveStopAge - scenarioVerwachtFireAge : null

  // ── ADR 0170 — de vijf knoppen: bereik, grenzen-batch, zone ──────────────────────────
  /**
   * De "nu"-waarde van de stop-knop: waar het plan mee rekent. Onder een vast anker het
   * stopmoment van het plan, anders de gesolvede vrijheidsleeftijd. ÉÉN afleiding, twee
   * lezers (het bereik hieronder en het "nu"-streepje op de knop) — twee kopieën zouden het
   * streepje uit het midden van de schaal laten lopen zodra er één tak bijkomt.
   */
  const stopKnopBasis =
    isFixedAnchorMode && planStopAgeDefault != null && Number.isFinite(planStopAgeDefault)
      ? Math.round(planStopAgeDefault * 2) / 2
      : (scenarioBaseFireAge ?? effectiveStopAge)
  // De basiswaarden ("nu") van de twee profielparameter-knoppen. `haalbareUitgave` levert de
  // uitgave waarmee het plan rekent (ADR 0160) met de bundel-uitgaven als terugval; de
  // nalatenschap komt uit het plan zelf en is 0 zodra de eind-vorm er geen kent.
  const uitgaveNaPensioenBasis = haalbareUitgave?.huidigPerJaar ?? input?.yearlyMustExpenses ?? 0
  const planEindVorm = initialData.firePlan?.endForm ?? 'deplete'
  const nalatenschapBasis =
    planEindVorm === 'legacy' ? Math.max(0, initialData.firePlan?.legacyAmount ?? 0) : 0

  /**
   * Zichtbaar bereik per knop, in de eenheid van de knop. Eén bron voor de UI-schaal én voor
   * de bisectie (het bereik reist mee in de grenzen-context, en de stap ís de precisie).
   * Een knop die hier ONTBREEKT wordt niet getoond en niet gesolved: de stopleeftijd onder het
   * nu-anker (het plan rekent met vandaag) en de nalatenschap onder een eind-vorm die er geen
   * kent (opeten of in stand houden).
   */
  const labKnopBereik = useMemo<Partial<Record<HefboomKey, HefboomBereik>>>(() => {
    const out: Partial<Record<HefboomKey, HefboomBereik>> = {}
    if (whatIfBaseline) {
      const extraNu = readSliderValueFromEvents('extra_inleg', scenarioSliderEvents, whatIfBaseline)
      const verdienen = computeSliderUiRange('extra_inleg', whatIfBaseline.monthlyIncome, extraNu)
      out.verdienen = { ...verdienen, stap: 50 }
      const savingsNu = readSliderValueFromEvents('savings', scenarioSliderEvents, whatIfBaseline)
      const uitgeven = computeSliderUiRange('savings', whatIfBaseline.savingsRate, savingsNu)
      // In procentpunten onder de motorkap (het spaarquote-event en het `savings_rate`-doel
      // blijven ongewijzigd); de knop TOONT euro per maand (ADR 0170 B4).
      out.uitgeven = { ...uitgeven, stap: 1 }
    }
    if (uitgaveNaPensioenBasis > 0) {
      const r = uitgaveNaPensioenRange(uitgaveNaPensioenBasis, scenarioUitgaveNaPensioen ?? uitgaveNaPensioenBasis)
      out.uitgaveNaPensioen = { ...r, stap: UITGAVE_NA_PENSIOEN_STAP }
    }
    if (planEindVorm === 'legacy') {
      const stap = 5_000
      const bovenkant = Math.max(nalatenschapBasis * 2, 250_000, scenarioNalatenschap ?? 0)
      out.nalatenschap = { min: 0, max: Math.ceil(bovenkant / stap) * stap, stap }
    }
    if (currentAge != null && planAnchor.kind !== 'now') {
      // Tien jaar naar beide kanten rond waar het plan mee rekent, hard geklemd op de huidige
      // leeftijd en de eindleeftijd. De schaal woont bij haar zusters in `scenario-events.ts`
      // (één plek voor alle knopbereiken) en is daar apart getest.
      const r = stopKnopBereik({
        basis: stopKnopBasis,
        huidig: effectiveStopAge,
        huidigeLeeftijd: currentAge,
        eindLeeftijd: simResult?.displayEndAge ?? null,
      })
      if (r) out.stop = { ...r, stap: 0.5 }
    }
    return out
  }, [
    whatIfBaseline,
    scenarioSliderEvents,
    uitgaveNaPensioenBasis,
    scenarioUitgaveNaPensioen,
    planEindVorm,
    nalatenschapBasis,
    scenarioNalatenschap,
    currentAge,
    planAnchor.kind,
    simResult?.displayEndAge,
    stopKnopBasis,
    effectiveStopAge,
  ])

  /**
   * De twee grenzen per knop (rood→oranje = precies gedekt, oranje→groen = 10 % marge) plus
   * het oordeel over de huidige stand. ÉÉN batch in de worker (lane `grenzen`), debounced op
   * 300 ms: elke knopbeweging verschuift de grenzen van álle knoppen, dus dat hoort in één run.
   * Consume-only voor de UI — hier wordt niets herrekend.
   */
  const [labGrenzen, setLabGrenzen] = useState<LabGrenzenResultaat | null>(null)
  const [labGrenzenPending, setLabGrenzenPending] = useState(false)
  /**
   * Volgnummer van de LAATST gedispatchte batch. `runLabGrenzenAsync` geeft `null` voor
   * zowel een verdrongen batch als een kern-/worker-FOUT (kernel-protocol vangt een throw als
   * `{ ok: false }`), en die twee moeten verschillend aflopen: bij verdringing is er een
   * nieuwere run onderweg en blijft de rekenstand staan, bij een fout niet — dan bleef
   * `aria-busy` eeuwig aan. Is de landende batch de laatste, dan eindigt de rekenstand altijd.
   */
  const labGrenzenSeqRef = useRef(0)
  useEffect(() => {
    const kanRekenen =
      kernelRawProfile != null &&
      effectiveInput != null &&
      currentAge != null &&
      whatIfBaseline != null &&
      Object.keys(labKnopBereik).length > 0
    if (!kanRekenen) {
      setLabGrenzen(null)
      setLabGrenzenPending(false)
      return
    }
    setLabGrenzenPending(true)
    let cancelled = false
    const handle = setTimeout(() => {
      const seq = ++labGrenzenSeqRef.current
      // De marktbias-delta's horen in de assets van élke iteratie — via de canonieke
      // scenario-context-assemblage (`resolveScenarioContext`), niet via een tweede afleiding
      // hier. De slider-events en de twee profielparameter-knoppen zet de engine zélf uit
      // `waarden`, dus die geven we NIET voorgekauwd mee: anders staan ze er dubbel in en zou
      // de bisectie tegen een al verschoven stand rekenen.
      const marktbiasAssets = resolveScenarioContext(
        initialData.assets ?? [],
        [],
        scenarioOverrides,
        kernelRawProfile,
      ).assets
      runLabGrenzenAsync(
        {
          // ADR 0103 — dezelfde grondslag-injectie als elke andere kernel-run.
          profile: withResolvedKernelBedragen(kernelRawProfile, {
            monthlyIncome: effectiveInput.monthlyIncome,
            monthlyExpenses: effectiveInput.monthlyExpenses,
          }),
          assets: marktbiasAssets,
          debts,
          lifeEvents: events,
          aowRows,
          baseline: whatIfBaseline,
          currentAge,
          waarden: {
            verdienen: readSliderValueFromEvents('extra_inleg', scenarioSliderEvents, whatIfBaseline),
            uitgeven: readSliderValueFromEvents('savings', scenarioSliderEvents, whatIfBaseline),
            uitgaveNaPensioen: scenarioUitgaveNaPensioen,
            nalatenschap: scenarioNalatenschap,
            stop: effectiveStopAge,
          },
          planAnkerVast: isFixedAnchorMode,
          planStopAge: planAnchor.kind === 'now' ? currentAge : planStopAgeDefault,
          eindVorm: planEindVorm,
          bereik: labKnopBereik,
        },
        { lane: 'grenzen' },
      )
        .then((res) => {
          if (cancelled) return
          // `null` = verdrongen óf een kern-/worker-fout. Alleen een echt resultaat overschrijft
          // de grenzen (bij verdringing blijven de vorige staan i.p.v. leeg te knipperen).
          if (res != null) setLabGrenzen(res)
          // De rekenstand eindigt zodra de LAATST gedispatchte batch landt — ook als die niets
          // opleverde. Was dit een oudere, verdrongen batch, dan blijft pending aan voor de
          // nieuwere die nog onderweg is.
          if (seq === labGrenzenSeqRef.current) setLabGrenzenPending(false)
        })
        .catch((err) => {
          console.warn('[horizon-worker] grenzen-run faalde', err)
          if (cancelled) return
          if (seq === labGrenzenSeqRef.current) setLabGrenzenPending(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kernelRawProfile,
    effectiveInput,
    currentAge,
    whatIfBaseline,
    labKnopBereik,
    scenarioSliderEvents,
    scenarioReturnDeltas,
    scenarioUitgaveNaPensioen,
    scenarioNalatenschap,
    effectiveStopAge,
    isFixedAnchorMode,
    planAnchor.kind,
    planStopAgeDefault,
    planEindVorm,
    debts,
    events,
    aowRows,
  ])

  /** Zone van de HUIDIGE stand (rood/oranje/groen) — kleurt het zone-woord en de delta's. */
  const labZone = zoneVanHuidig(labGrenzen?.huidig ?? null)

  /** De verkende stopleeftijd ÍS al het plan-anker — dan valt "maak dit mijn stopmoment" weg. */
  const planIsDezeStop = planAnchor.kind === 'age' && planAnchor.age === effectiveStopAge


  // ── Stopmoment vastzetten: uitsluitend via de strategie-modal ──────────────
  // Hier stond de handler achter de CTA onder de vrijheidsas, die een PUT deed
  // van het volledige plan met anker `age` en de sliderwaarde. (Zijn naam staat
  // hier bewust niet uitgeschreven: de grendel in
  // `horizon-client.nu-stoppen.test.ts` toetst op afwezigheid van die
  // identifier, en een herdenkingsregel zou dat vals rood maken.)
  // Melding B-038 haalt die knop weg: hij schreef één van de vijf
  // plan-keuzes en verborg daarmee de andere vier. De vrijheidsas verwijst nu
  // naar `setActiveModal('strategie')`, en die modal schrijft hetzelfde
  // volledige plan via `planDraftToFireSettingsBody` — één schrijfpad in plaats
  // van twee, en het pad dat álle keuzes toont.

  const handleStopAgeChange = useCallback((v: number) => setScenarioStopAge(v), [])
  /**
   * Zet één knop-waarde als slider-event. De twee euro-knoppen (`verdienen` = extra inleg,
   * `uitgeven` = spaarquote in procentpunten) reizen als `WhatIfEvent` naar de kern; de andere
   * drie zijn profielparameters en hebben hun eigen setter. Zelfde bouwer als de grenzen-batch
   * (`buildSliderEvent`/`applySliderEvent`), zodat de knop en zijn schaal één parameterisatie delen.
   */
  const handleScenarioSliderValue = useCallback(
    (key: 'extra_inleg' | 'savings', value: number) => {
      if (!whatIfBaseline || currentAge === null) return
      markFirstSliderDrag()
      const ev = buildSliderEvent(key, value, whatIfBaseline, currentAge)
      setScenarioSliderEvents((prev) => applySliderEvent(prev, key, ev))
    },
    [whatIfBaseline, currentAge, markFirstSliderDrag],
  )
  // Globale reset "Terug naar basis": wist sliders + rendement-delta's (stopAge/koppel/
  // toggle blijven bewust staan). Reset blijft één klik (geen bevestigingsvraag),
  // maar een snapshot + undo-toast (5s) maakt 'm binnen dat venster exact
  // terugdraaibaar. De debounced persist pikt zowel het wissen als het herstel
  // vanzelf op (beide zetten scenario-state).
  const handleScenarioReset = useCallback(() => {
    // Snapshot beperkt tot wat de reset daadwerkelijk wist — stopAge/stopKoppel
    // blijven staan bij reset, dus undo mag ze ook niet terugzetten (dat zou
    // een tussentijdse stop-wijziging binnen het undo-venster overschrijven).
    const snapshot = {
      sliderEvents: scenarioSliderEvents,
      returnDeltas: scenarioReturnDeltas,
      uitgaveNaPensioen: scenarioUitgaveNaPensioen,
      nalatenschap: scenarioNalatenschap,
    }
    const hadSomething =
      snapshot.sliderEvents.length > 0 ||
      Object.keys(snapshot.returnDeltas).length > 0 ||
      snapshot.uitgaveNaPensioen != null ||
      snapshot.nalatenschap != null

    setScenarioSliderEvents([])
    setScenarioReturnDeltas({})
    setScenarioUitgaveNaPensioen(null)
    setScenarioNalatenschap(null)

    // Niets te wissen → geen undo-toast (voorkomt een misleidende "Ongedaan maken").
    if (!hadSomething) return

    addToast({
      type: 'info',
      title: 'Scenario gewist',
      duration: 5000,
      action: {
        label: 'Ongedaan maken',
        onClick: () => {
          // Exact terug wat de reset wiste: sliders + rendement-delta's + de twee
          // profielparameter-knoppen (uitgave na pensioen, nalatenschap).
          setScenarioSliderEvents(snapshot.sliderEvents)
          setScenarioReturnDeltas(snapshot.returnDeltas)
          setScenarioUitgaveNaPensioen(snapshot.uitgaveNaPensioen)
          setScenarioNalatenschap(snapshot.nalatenschap)
        },
      },
    })
  }, [scenarioSliderEvents, scenarioReturnDeltas, scenarioUitgaveNaPensioen, scenarioNalatenschap, addToast])

  // ── Doel: één stand-bouwer (gedeeld met persist), concept-detectie, previews ──────
  // EXACT dezelfde inclusie-/afrondingsregels als het (oude) persist-effect — nu via de
  // pure `buildLiveStand`-helper, zodat het vastgelegde `doel.stand`, de concept-detectie
  // én de PUT-payload één vorm delen.
  const buildLiveStandNow = useCallback(
    () =>
      buildLiveStand({
        baseline: whatIfBaseline,
        sliderEvents: scenarioSliderEvents,
        returnDeltas: scenarioReturnDeltas,
        stopAge: scenarioStopAge,
        uitgaveNaPensioen: scenarioUitgaveNaPensioen,
        nalatenschap: scenarioNalatenschap,
      }),
    [
      whatIfBaseline,
      scenarioSliderEvents,
      scenarioReturnDeltas,
      scenarioStopAge,
      scenarioUitgaveNaPensioen,
      scenarioNalatenschap,
    ],
  )

  // Opslaan-balk (ADR 0170): wijkt de live-stand af van het vastgelegde doel? Onder een vast
  // stopmoment telt de stopkeuze niet mee (ADR 0145 D4): de knop verkent daar alleen.
  // Sinds ADR 0170 dragen `buildLiveStand` en `doel.stand` óók de twee profielparameter-knoppen
  // (uitgave na pensioen, nalatenschap), dus de losse noodgreep-vergelijking die daarvóór
  // "elke actieve override IS drift" moest afdwingen is vervallen — `isDoelConceptGewijzigd`
  // ziet ze nu zelf, en een doel dat mét die knoppen is vastgelegd blijft dus "ongewijzigd".
  const conceptGewijzigd = useMemo(
    () =>
      doelActief &&
      isDoelConceptGewijzigd(buildLiveStandNow(), doelBlok?.stand, { stopKeuzeTelt: !isFixedAnchorMode }),
    [doelActief, doelBlok, buildLiveStandNow, isFixedAnchorMode],
  )

  /**
   * De vier standen van de opslaan-balk (ADR 0170), afgeleid uit wat er al is: ligt er een
   * doel, staat er een verkenning, en wijkt die af van het doel. Onder het nu-anker legt het
   * lab nooit een doel vast (ADR 0145 D6) — dan zegt de balk dát, in plaats van een knop aan
   * te bieden die de route zou weigeren.
   */
  const labOpslaanToestand: LabOpslaanToestand = doelActief
    ? conceptGewijzigd
      ? 'gewijzigd'
      : 'opgeslagen'
    : labPromotie.kind === 'geen' && labPromotie.reden === 'nu-anker'
      ? 'nu-anker'
      : hasScenario || hasStopKeuze
        ? 'nieuw'
        : 'rust'

  // Doel-gewogen totaalrendement (%) uit de live rendement-delta's; null → geen rendement-doel.
  const doelRendementPct = useMemo(
    () =>
      doelGewogenRendement(
        initialData.assets,
        scenarioReturnDeltas as Partial<Record<AssetCategorie, number>>,
        fireParams.grossReturn, // TPR-02: zelfde terugval als de kernel
      ),
    [initialData.assets, scenarioReturnDeltas, fireParams.grossReturn],
  )
  // FIRE-doelwaarden: L = gekozen stop, anders verwacht-FIRE naar boven op 0,5; M = marge op 0,5, ≥ 0.
  const doelFireLeeftijd =
    scenarioStopAge ??
    (scenarioVerwachtFireAge !== null ? Math.ceil(scenarioVerwachtFireAge * 2) / 2 : null)
  const doelMargeJaren = Math.max(0, Math.round((doelMargeRuw ?? 0) * 2) / 2)

  // De afwijkende parameters → sheet-previews (label + waarde-string). Rendement verdwijnt
  // als het doel-rendement null is (geen bezittingen); FIRE verschijnt zodra er een stopkeuze
  // (expliciet of gekoppeld) ligt. Alleen wanneer de bijbehorende live-stand afwijkt.
  const doelPreviews = useMemo<DoelParameterPreview[]>(() => {
    const stand = buildLiveStandNow()
    const previews: DoelParameterPreview[] = []
    // DE DRIE KNOP-DOELEN (20 sep 2026 — vijf knoppen, vijf doelen). Zelfde conditie-stijl
    // als de buren: `buildLiveStand` zet deze velden ALLEEN wanneer de knop van de
    // plan-waarde afwijkt, dus "veld aanwezig" ís de afwijkingstoets — geen tweede
    // vergelijking hier. De extra `> 0`-toets spiegelt de weigering in `buildRow`: een
    // knop op nul (of negatief: "minder salaris") levert geen doelrij, dus beloof 'm ook
    // niet in de sheet. Bedragen volgen de privacy-weergave zoals elders op deze pagina
    // (`formatMaskedCurrency`) en zijn op hele euro's afgerond, net als in de builder.
    //
    // DE RIJ-ORDE VOLGT DE KNOPPEN OP HET SCHERM (`HEFBOOM_KEYS`: verdienen · uitgeven ·
    // uitgave na pensioen · nalatenschap · stop), niet de `DOEL_PARAMETERS`-orde waarin de
    // server de rijen bouwt — de sheet is wat de gebruiker net heeft aangeraakt.
    if (whatIfBaseline && stand.sliders?.extraInleg !== undefined && stand.sliders.extraInleg > 0) {
      previews.push({
        parameter: 'extraInleg',
        label: GOAL_TYPE_LABELS.extra_deposit,
        waarde: `${formatMaskedCurrency(Math.round(stand.sliders.extraInleg), masked)}/mnd`,
      })
    }
    if (whatIfBaseline && stand.sliders?.savings !== undefined) {
      const savings = readSliderValueFromEvents('savings', scenarioSliderEvents, whatIfBaseline)
      previews.push({ parameter: 'spaarquote', label: 'Spaarquote', waarde: `${Math.round(savings)}%` })
    }
    if (stand.uitgaveNaPensioen !== undefined && stand.uitgaveNaPensioen > 0) {
      previews.push({
        parameter: 'uitgaveNaPensioen',
        label: GOAL_TYPE_LABELS.retirement_expense,
        waarde: `${formatMaskedCurrency(Math.round(stand.uitgaveNaPensioen), masked)}/jaar`,
      })
    }
    if (stand.nalatenschap !== undefined && stand.nalatenschap > 0) {
      previews.push({
        parameter: 'nalatenschap',
        label: GOAL_TYPE_LABELS.legacy_amount,
        waarde: formatMaskedCurrency(Math.round(stand.nalatenschap), masked),
      })
    }
    if (stand.returnDeltaByCategorie !== undefined && doelRendementPct !== null) {
      previews.push({
        parameter: 'rendement',
        label: 'Verwacht rendement',
        waarde: `${doelRendementPct.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
      })
    }
    // Onder een vast stopmoment is er geen vrijheidsleeftijd om vast te leggen (ADR 0145).
    if (!isFixedAnchorMode && stand.stopAge != null && doelFireLeeftijd !== null) {
      const fmt = (v: number) => v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
      previews.push({
        parameter: 'fire',
        label: 'Vrijheidsleeftijd',
        waarde: `Vrij op ${fmt(doelFireLeeftijd)} jr · ≥ ${fmt(doelMargeJaren)} jr marge`,
      })
    }
    // ADR 0145 — het uitkomstdoel onder een vast stopmoment: altijd inbegrepen (`vast`).
    if (
      labPromotie.kind === 'dekking' &&
      labDekking != null &&
      labDekking.basisPct != null
    ) {
      previews.push({
        parameter: 'dekking',
        label: GOAL_TYPE_LABELS.plan_coverage,
        waarde: dekkingPreviewWaarde(labDekking.basisPct, labDekking.scenarioPct ?? labDekking.basisPct, labDekking.eind),
        vast: true,
      })
    }
    return previews
  }, [
    buildLiveStandNow,
    whatIfBaseline,
    scenarioSliderEvents,
    doelRendementPct,
    doelFireLeeftijd,
    doelMargeJaren,
    isFixedAnchorMode,
    labPromotie,
    labDekking,
    masked,
  ])

  // Vastleggen/bijwerken: bouw de doelwaarden voor de aangevinkte parameters en promoveer via
  // de dunne server-route. Bij ok → doel-blok lokaal zetten (server-gezette `gezetOp` komt niet
  // terug → client-ISO), lijn default aan, sheet dicht, toast. Foutpad muteert niets lokaal.
  const handleDoelVastleggen = useCallback(
    async (gekozen: Partial<Record<DoelParameter, true>>) => {
      const stand = buildLiveStandNow()
      const doelwaarden = {
        spaarquotePct:
          gekozen.spaarquote && whatIfBaseline
            ? readSliderValueFromEvents('savings', scenarioSliderEvents, whatIfBaseline)
            : undefined,
        rendementPct: gekozen.rendement ? doelRendementPct ?? undefined : undefined,
        fireLeeftijd: gekozen.fire ? doelFireLeeftijd ?? undefined : undefined,
        margeJaren: gekozen.fire ? doelMargeJaren : undefined,
        // ADR 0145 D12 — het doelbedrag is NOMINAAL (zoals `end_balance` het live meet via
        // `pickEndBalanceAtEndAge`), dus uit de lab-uitkomst zelf en NIET de gedeflateerde
        // lab-weergave. De server voegt de plan-velden toe.
        // Alleen een `bedrag` (de scenario-run haalt de eindleeftijd, eindreview I1) — een
        // opgeraakte run heeft geen eindvermogen om vast te leggen.
        eindvermogen:
          gekozen.eindvermogen && labDekking?.scenarioEindvermogen?.kind === 'bedrag'
            ? labDekking.scenarioEindvermogen.nominaal
            : undefined,
        // De drie KNOP-doelwaarden (20 sep 2026): recht uit dezelfde `stand` die ook de
        // preview voedde en als `doel.stand` wordt vastgelegd — één bron, dus de rij in
        // de sheet en de rij in `goals` kunnen niet uiteenlopen. Staat de knop op de
        // plan-waarde, dan ontbreekt het veld in de stand en is er niets te promoveren.
        extraInlegMnd: gekozen.extraInleg ? stand.sliders?.extraInleg : undefined,
        uitgaveNaPensioenJaar: gekozen.uitgaveNaPensioen ? stand.uitgaveNaPensioen : undefined,
        nalatenschapBedrag: gekozen.nalatenschap ? stand.nalatenschap : undefined,
      }
      setDoelSaving(true)
      try {
        const res = await fetch('/api/toekomst-doel', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'vastleggen', parameters: gekozen, stand, doelwaarden }),
        })
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean
          goalIds?: Partial<Record<DoelParameter, string>>
          error?: unknown
          code?: unknown
        } | null
        if (!res.ok || !json?.ok) {
          // ADR 0145 — de route bepaalt het anker server-side; een anker-weigering
          // (`anchor_now`, `dekking_vereist_vast_anker`) draagt een eigen, client-veilige
          // tekst. Zonder `code` blijft de generieke melding van vandaag staan.
          const ankerFout = typeof json?.code === 'string' && typeof json?.error === 'string' ? json.error : null
          addToast({ type: 'error', title: 'Doel niet vastgelegd', message: ankerFout ?? 'Probeer het zo nog eens.' })
          return
        }
        setDoelBlok({
          gezetOp: new Date().toISOString(),
          parameters: gekozen,
          // Onder een vast stopmoment is de stopkeuze geen doelstand (D4) — de server strips
          // 'm óók; lokaal gelijk trekken zodat banner en herstel geen stopvelden vergelijken.
          stand: isFixedAnchorMode ? stripStopKeuze(stand) : stand,
          ...(json.goalIds ? { goalIds: json.goalIds } : {}),
        })
        setShowScenarioLine(true)
        setDoelSheetOpen(false)
        // ADR 0175 — het plan-stoplicht (kop, menupunt) weegt het vastgelegde doel mee en
        // komt van de server; zonder refresh bleef de kop op het oude doel staan.
        startRefresh(() => router.refresh())
        addToast({
          type: 'success',
          title: doelActief ? 'Doel bijgewerkt' : 'Doel vastgelegd',
          message: gekozen.dekking
            ? dekkingVastgelegdToast(labDekking?.eind ?? null)
            : gekozen.eindvermogen
              ? eindvermogenVastgelegdToast(labDekking?.eind ?? null)
              : 'Je verkenning is nu je doel.',
        })
      } catch {
        addToast({ type: 'error', title: 'Doel niet vastgelegd', message: 'Probeer het zo nog eens.' })
      } finally {
        setDoelSaving(false)
      }
    },
    [buildLiveStandNow, whatIfBaseline, scenarioSliderEvents, doelRendementPct, doelFireLeeftijd, doelMargeJaren, doelActief, addToast, isFixedAnchorMode, labDekking, router],
  )

  // Loslaten: verwijder de parameter-doelen + het doel-blok (server-route) en wis de client-state.
  // De bevestiging loopt via de gedeelde DoelLoslatenConfirm (ShellOverlay); deze handler is
  // de bevestig-actie zelf. Fouten worden via toast gemeld (de confirm blijft dan open voor
  // een retry); bij succes sluiten we de confirm.
  const handleDoelLoslaten = useCallback(async () => {
    setDoelSaving(true)
    try {
      const res = await fetch('/api/toekomst-doel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'loslaten' }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null
      if (!res.ok || !json?.ok) {
        addToast({ type: 'error', title: 'Doel niet losgelaten', message: 'Probeer het zo nog eens.' })
        return
      }
      setDoelBlok(null)
      setDoelLoslatenOpen(false)
      // ADR 0175 — zonder doel valt het oranje "je doel nog niet" weg; kop en menupunt
      // komen van de server.
      startRefresh(() => router.refresh())
      addToast({ type: 'success', title: 'Doel losgelaten', message: 'Je verkent weer vrij.' })
    } catch {
      addToast({ type: 'error', title: 'Doel niet losgelaten', message: 'Probeer het zo nog eens.' })
    } finally {
      setDoelSaving(false)
    }
  }, [addToast, router])

  // TPR-09 — de verkenning wordt het plan. Twee stopleeftijden stonden naast elkaar
  // (scenario-marker `toekomst_scenario_prefs.stopAge` vs. plan-anker `fire_stop_age`)
  // zonder brug; dit is de brug. Schrijft het VOLLEDIGE plan (route-contract R3):
  // het gelezen plan uit GET /api/fire-settings (eindleeftijd, eind-vorm,
  // nalatenschap blijven wat ze zijn) met alleen het anker op `age` + de verkende
  // leeftijd. Dezelfde toets als de eindstrategie-body (`validatePlanDraft`:
  // stopleeftijd < eindleeftijd, halve jaren) vóór de PUT; de route toetst 'm nogmaals.
  // Ná succes: de scenario-marker wissen (de verkenning ís nu het plan, de slider
  // landt op het plan-stopmoment), koppelmodus uit (anders schuift de marker meteen
  // weer weg van het zojuist gekozen plan), en de pagina verversen zoals na de
  // strategie-modal (`loadData` = `router.refresh`).
  const handleStopPlanBevestigen = useCallback(async () => {
    setStopPlanSaving(true)
    setStopPlanError('')
    try {
      const fsRes = await fetch('/api/fire-settings')
      if (!fsRes.ok) {
        setStopPlanError('Je huidige plan kon niet worden gelezen. Probeer het zo nog eens.')
        return
      }
      const huidig = planDraftFromSettings(await fsRes.json())
      const draft = { ...huidig, anchor: 'age' as const, stopAge: effectiveStopAge }
      const check = validatePlanDraft(draft, { aowAge: userAowAge.fractional })
      if (!check.ok) {
        setStopPlanError(
          check.errors.stopAge ?? check.errors.endAge ?? check.errors.legacyAmount ?? 'Dit stopmoment past niet in je plan.',
        )
        return
      }
      const res = await fetch('/api/fire-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planDraftToFireSettingsBody(draft)),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null
        setStopPlanError(typeof data?.error === 'string' ? data.error : 'Opslaan mislukt. Probeer het zo nog eens.')
        return
      }
      setScenarioStopAge(null)
      setStopPlanConfirmOpen(false)
      addToast({
        type: 'success',
        title: 'Plan bijgewerkt',
        message: `Je plan rekent nu met stoppen op ${formatStopAge(effectiveStopAge)}.`,
      })
      loadData()
    } catch {
      setStopPlanError('Opslaan mislukt. Probeer het zo nog eens.')
    } finally {
      setStopPlanSaving(false)
    }
  }, [effectiveStopAge, userAowAge.fractional, addToast, loadData])

  // "Herstel mijn doel": kopieer de vastgelegde `doel.stand` terug naar de live-states, via
  // `doelStandNaarLab` — dezelfde vertaling waarmee het plan-stoplicht het doel beoordeelt
  // (ADR 0175), zodat kop en lab na herstel op dezelfde stand rekenen.
  const handleDoelHerstellen = useCallback(() => {
    const stand = doelBlok?.stand
    if (!stand) return
    const lab = doelStandNaarLab(stand, whatIfBaseline, currentAge)
    setScenarioSliderEvents(lab.sliderEvents)
    setScenarioReturnDeltas(lab.returnDeltaByCategorie)
    // Onder een vast stopmoment is de stopkeuze geen doelstand (ADR 0145 D4): de
    // verkende stop blijft staan waar hij staat.
    if (!isFixedAnchorMode) {
      setScenarioStopAge(lab.stopAge)
    }
    // ADR 0170 — de twee profielparameter-knoppen reizen wél mee in `doel.stand`. Afwezig
    // betekent daar "wat het plan rekent", dus `null`: dan staat de knop weer op de plan-waarde.
    setScenarioUitgaveNaPensioen(lab.uitgaveNaPensioen)
    setScenarioNalatenschap(lab.nalatenschap)
  }, [doelBlok, whatIfBaseline, currentAge, isFixedAnchorMode])

  // Compacte FIRE-delta voor de toggle-pill ("−30 mnd" = eerder vrij; beslishulp-conventie).
  const scenarioFireDeltaMonths =
    scenarioVerwachtFireAge !== null && scenarioBaseFireAge !== null
      ? Math.round((scenarioVerwachtFireAge - scenarioBaseFireAge) * 12)
      : null
  // ADR 0145 — onder een vast stopmoment is de uitkomstmaat de dekking: de pil en de
  // afwijkings-badges tonen dan de dekking-delta (scenario − basis, beide uit de
  // lab-uitkomst). Onder `solved` blijft de vrijheidsleeftijd-delta ongewijzigd.
  const labDekkingDelta =
    isFixedAnchorMode && labDekking != null && labDekking.basisPct != null && labDekking.scenarioPct != null
      ? { scenarioPct: labDekking.scenarioPct, label: dekkingDeltaBadge(labDekking.scenarioPct - labDekking.basisPct) }
      : null
  const scenarioFireDeltaLabel =
    isFixedAnchorMode
      ? (labDekkingDelta?.label ?? null)
      : scenarioFireDeltaMonths === null
        ? null
        : Math.abs(scenarioFireDeltaMonths) < 1
          ? 'gelijk'
          : `${scenarioFireDeltaMonths > 0 ? '+' : '−'}${Math.abs(scenarioFireDeltaMonths)} mnd`

  // ── Persistentie (plan §H): debounced fire-and-forget PUT; eerste render overslaan ──
  const scenarioSaveSkipRef = useRef(true)
  // D-03: waarschuw hooguit één keer per mount als de scenario-persist faalt.
  // De 600ms-debounce zou anders bij aanhoudende uitval de gebruiker spammen.
  const scenarioPersistWarnedRef = useRef(false)
  useEffect(() => {
    if (scenarioSaveSkipRef.current) {
      scenarioSaveSkipRef.current = false
      return
    }
    if (!whatIfBaseline || currentAge === null) return
    // Persist-gate: schrijf geen default-blob voor gebruikers die niets deden (bv. na
    // een perspectiefwissel of late baseline). Wél schrijven zodra de staat van de
    // defaults afwijkt (defaults: geen scenario, geen stopAge, koppel uit, toggle aan),
    // óf er eerder iets bewaard was — dan moet een reset die ene keer nog wissen.
    // Ook schrijven zodra er een doel ligt (dat moet in elke PUT mee — anders wist de
    // volledige-overwrite-route het bij de eerstvolgende sliderbeweging).
    const deviatesFromDefaults =
      hasScenario ||
      scenarioStopAge !== null ||
      !showScenarioLine ||
      knopWeergave.desktop !== KNOP_WEERGAVE_STANDAARD.desktop ||
      knopWeergave.mobiel !== KNOP_WEERGAVE_STANDAARD.mobiel ||
      doelBlok != null
    if (!deviatesFromDefaults && initialData.toekomstScenarioPrefs == null) return
    const handle = setTimeout(() => {
      // KRITIEK: het doel-blok gaat via `buildScenarioPersistPayload` in ELKE PUT mee.
      const payload = buildScenarioPersistPayload({
        stand: buildLiveStand({
          baseline: whatIfBaseline,
          sliderEvents: scenarioSliderEvents,
          returnDeltas: scenarioReturnDeltas,
          stopAge: scenarioStopAge,
          uitgaveNaPensioen: scenarioUitgaveNaPensioen,
          nalatenschap: scenarioNalatenschap,
        }),
        showScenarioLine,
        knopWeergave,
        doel: doelBlok,
      })
      fetch('/api/toekomst-scenario', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => {
        // Geslaagde save reset de guard, zodat een écht nieuwe uitval later
        // in dezelfde sessie opnieuw één melding geeft.
        if (r.ok) scenarioPersistWarnedRef.current = false
      }).catch(() => {
        // Persistentie is niet kritisch, maar een aanhoudende uitval moet de
        // gebruiker niet stil zijn scenario laten verliezen. Eén subtiele
        // waarschuwing per mount (ref-guard) — de debounce zou anders spammen.
        if (!scenarioPersistWarnedRef.current) {
          scenarioPersistWarnedRef.current = true
          addToast({
            type: 'warning',
            title: 'Scenario niet bewaard',
            message: 'Wijzig iets om het opnieuw te proberen.',
          })
        }
      })
    }, 600)
    return () => clearTimeout(handle)
  }, [scenarioSliderEvents, scenarioReturnDeltas, scenarioStopAge, scenarioUitgaveNaPensioen, scenarioNalatenschap, showScenarioLine, knopWeergave, whatIfBaseline, currentAge, hasScenario, doelBlok, initialData.toekomstScenarioPrefs, addToast])

  /**
   * De vijf knoppen als props: huidige waarde, basiswaarde ("nu"), bereik, de twee grenzen en
   * de detailregel. Een knop die niet in `labKnopBereik` staat, staat hier ook niet — dan is
   * hij verborgen (stopleeftijd onder het nu-anker, nalatenschap zonder nalatenschap-eindvorm).
   * De twee euro-knoppen draaien onder de motorkap op hun bestaande grootheid: `verdienen` is
   * het extra-inleg-event, `uitgeven` de spaarquote in procentpunten (ADR 0170 B4).
   */
  const labKnoppen = useMemo<Partial<Record<HefboomKey, LabKnopConfig>>>(() => {
    const out: Partial<Record<HefboomKey, LabKnopConfig>> = {}
    const grens = (k: HefboomKey) => labGrenzen?.grenzen?.[k] ?? null
    if (whatIfBaseline && labKnopBereik.verdienen) {
      out.verdienen = {
        value: readSliderValueFromEvents('extra_inleg', scenarioSliderEvents, whatIfBaseline),
        basis: 0,
        bereik: labKnopBereik.verdienen,
        grenzen: grens('verdienen'),
        onChange: (v) => handleScenarioSliderValue('extra_inleg', v),
      }
    }
    if (whatIfBaseline && labKnopBereik.uitgeven) {
      const pp = readSliderValueFromEvents('savings', scenarioSliderEvents, whatIfBaseline)
      out.uitgeven = {
        value: pp,
        basis: whatIfBaseline.savingsRate,
        bereik: labKnopBereik.uitgeven,
        grenzen: grens('uitgeven'),
        // De spaarquote hoort erbij als duiding: de knop TOONT euro's, maar het doel dat het
        // lab schrijft is een spaarquote-doel (`savings_rate`) — dan moet dat getal in beeld.
        detail: `spaarquote ${Math.round(whatIfBaseline.savingsRate)}% → ${Math.round(pp)}%`,
        onChange: (v) => handleScenarioSliderValue('savings', v),
      }
    }
    if (labKnopBereik.uitgaveNaPensioen) {
      const waarde = scenarioUitgaveNaPensioen ?? uitgaveNaPensioenBasis
      out.uitgaveNaPensioen = {
        value: waarde,
        basis: uitgaveNaPensioenBasis,
        bereik: labKnopBereik.uitgaveNaPensioen,
        grenzen: grens('uitgaveNaPensioen'),
        detail: masked ? null : `≈ ${formatCurrency(Math.round(waarde / 12))}/mnd`,
        // Binnen een halve stap van de plan-waarde terug naar `null`: de knop staat dan weer
        // op "wat het plan rekent" en zet geen override (spiegel ADR 0160 F1).
        onChange: (v) =>
          setScenarioUitgaveNaPensioen(
            Math.abs(v - uitgaveNaPensioenBasis) < UITGAVE_NA_PENSIOEN_STAP / 2 ? null : v,
          ),
      }
    }
    if (labKnopBereik.nalatenschap) {
      const stap = labKnopBereik.nalatenschap.stap
      out.nalatenschap = {
        value: scenarioNalatenschap ?? nalatenschapBasis,
        basis: nalatenschapBasis,
        bereik: labKnopBereik.nalatenschap,
        grenzen: grens('nalatenschap'),
        onChange: (v) => setScenarioNalatenschap(Math.abs(v - nalatenschapBasis) < stap / 2 ? null : v),
      }
    }
    if (labKnopBereik.stop) {
      out.stop = {
        value: effectiveStopAge,
        // Zelfde bron als het midden van de schaal — zie `stopKnopBasis`.
        basis: stopKnopBasis,
        bereik: labKnopBereik.stop,
        grenzen: grens('stop'),
        onChange: handleStopAgeChange,
      }
    }
    return out
  }, [
    whatIfBaseline,
    labKnopBereik,
    labGrenzen,
    scenarioSliderEvents,
    handleScenarioSliderValue,
    scenarioUitgaveNaPensioen,
    uitgaveNaPensioenBasis,
    scenarioNalatenschap,
    nalatenschapBasis,
    effectiveStopAge,
    stopKnopBasis,
    handleStopAgeChange,
    masked,
  ])

  /**
   * De nalatenschap-marker voor de grafiek: de bol op het eind van de wat-als-lijn
   * (eigenaarsbesluit 20 sep 2026). Alleen wanneer de knop BESTAAT — onder eind-vorm
   * `perpetual` staat hij niet in `labKnoppen` en dan hoort er ook geen bol te zijn.
   *
   * Consume, don't recompute: het oordeel wordt hier geveld (dezelfde `zoneVanWaarde` op
   * dezelfde kernel-grenzen als de knop zelf) en reist als kale zone naar de grafiek; de
   * geometrie bepaalt alleen nog de positie. Zo kunnen de bol en de knop niet uit elkaar lopen.
   */
  const nalatenschapMarker = useMemo(() => {
    const knop = labKnoppen.nalatenschap
    if (!knop) return undefined
    return { zone: zoneVanWaarde(knop.value, knop.grenzen, HEFBOOM_RICHTING.nalatenschap) }
  }, [labKnoppen])

  /**
   * Per knop de drie formatters (waarde, delta, grens). De privacy-weergave maskeert hier —
   * één plek, zodat er geen tweede maskeer-pad in de knop-component ontstaat.
   * `uitgeven` rekent van procentpunten naar euro's per maand via `savingsEuroForPp`
   * (één som, ADR 0170 B4): de knop toont wat je minder uitgeeft, niet het percentage.
   */
  const labFormatters = useMemo<Record<HefboomKey, LabKnopFormatters>>(() => {
    const geld = (v: number) => (masked ? MASKED_AMOUNT_PLACEHOLDER : formatCurrency(Math.round(v)))
    const perMaand = (v: number) => `${geld(v)}/mnd`
    const ppNaarEuro = (pp: number) =>
      whatIfBaseline ? savingsEuroForPp(whatIfBaseline, pp) : 0
    return {
      // Geen `delta` op deze twee: hun WAARDE is al relatief aan "nu" (verdienen staat op 0 op
      // de basis, uitgeven toont het verschil in euro's), dus een badge zou hetzelfde getal
      // een tweede keer laten zien.
      verdienen: {
        value: (v) => (v === 0 ? `${geld(0)}/mnd` : `${v > 0 ? '+' : '−'}${geld(Math.abs(v))}/mnd`),
        grens: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${geld(Math.abs(v))}`,
      },
      uitgeven: {
        value: (pp) => {
          const euro = ppNaarEuro(pp)
          return euro === 0 ? `${geld(0)}/mnd` : `${euro > 0 ? '−' : '+'}${geld(Math.abs(euro))}/mnd`
        },
        grens: (pp) => {
          const euro = ppNaarEuro(pp)
          return `${euro > 0 ? '−' : '+'}${geld(Math.abs(euro))}`
        },
      },
      uitgaveNaPensioen: {
        value: (v) => `${geld(v)}/jr`,
        delta: (d) => `${d > 0 ? '+' : '−'}${geld(Math.abs(d))}`,
        grens: (v) => geld(v),
      },
      nalatenschap: {
        value: (v) => geld(v),
        delta: (d) => `${d > 0 ? '+' : '−'}${geld(Math.abs(d))}`,
        grens: (v) => geld(v),
      },
      stop: {
        value: (v) => `${formatAge(v)} jr`,
        delta: (d) => `${d > 0 ? '+' : '−'}${formatAge(Math.abs(d))} jr`,
        grens: (v) => formatAge(v),
      },
    }
  }, [masked, whatIfBaseline])

  return useStabielObject({
    whatIfBaseline,
    scenarioVerwachtFireAge,
    labUitkomst,
    labPromotie,
    doelVastleggenMogelijk,
    doelBijwerkenMogelijk,
    labDekking,
    hasDoelLijn,
    scenarioLineOverlay,
    categorieReturnGroups,
    effectiveStopAge,
    planEindVorm,
    labGrenzen,
    labGrenzenPending,
    labZone,
    planIsDezeStop,
    handleScenarioReset,
    labOpslaanToestand,
    doelPreviews,
    handleDoelVastleggen,
    handleDoelLoslaten,
    handleStopPlanBevestigen,
    handleDoelHerstellen,
    scenarioFireDeltaLabel,
    labKnoppen,
    nalatenschapMarker,
    labFormatters,
  })
}

/** De scenario-context: de state plus de afgeleide lab-feeds (samengevoegd in de provider). */
export type ToekomstScenario = ToekomstScenarioState & ReturnType<typeof useToekomstScenario>
