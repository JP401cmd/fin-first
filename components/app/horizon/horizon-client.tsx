'use client'

import { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue } from 'react'
import { useRouter } from 'next/navigation'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { HORIZON_EXIT_NOTICE_DISMISSED_SLUG } from '@/lib/horizon-data-loader'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/app/toast-provider'
import { calculateFreedomTime, formatFreedomTimeString, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ageAtDate, type LifeEvent } from '@/lib/horizon-data'
import { MARKTCHECK_DEBOUNCE_MS, type MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { deriveNaturalMilestones, naturalMilestoneToLifeEvent } from '@/lib/natural-milestones'
import {
  chartEventOverlayToClusterRow,
  lifeEventSide,
  naturalMilestoneSide,
  type ChartEventKind,
  type ChartEventOverlay,
} from '@/lib/chart-event-overlay'
import { buildGoalChartMarkers, isGoalMarkerId, type GoalMarkerInput } from '@/lib/horizon/goal-chart-markers'
import { Landmark } from 'lucide-react'
import { primaryChartBasis } from '@/lib/horizon/liquid-wealth-line'
import { applyHousingToComposition } from '@/lib/horizon/wealth-composition-housing'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { buildCoverageStrip } from '@/lib/horizon/coverage-strip'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { SectionLabel } from '@/components/editorial'
import { zoneVanHuidig, type HefboomBereik, type HefboomKey, type LabGrenzenResultaat } from '@/lib/horizon/lab-grenzen-types'
import type { LabOpslaanToestand } from '@/components/app/horizon/lab-opslaan-balk'
import { computeDekkingsradar, type RadarAs } from '@/lib/horizon/dekkingsradar'
import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'
import { selectDoelLijnBron } from '@/lib/horizon/doel-lijn-bron'
import { isHeroAnswerInvalid } from '@/lib/horizon/hero-fire-age'
import { fireDoelPaarInLeesvolgorde, FIRE_DOEL_ONDERSCHRIFT } from '@/lib/horizon/fire-doel-weergave'
import {
  ANKER_KPI_LABEL,
  ANKER_KPI_LABEL_KORT,
  ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT,
  ankerKpiCaption,
  dekkingDeltaBadge,
  dekkingPreviewWaarde,
  dekkingVastgelegdToast,
  eindvermogenVastgelegdToast,
  formatStopAge,
  haalbaarBijUitgaveRegel,
} from '@/lib/horizon/anker-copy'
import { describeEventDuration } from '@/lib/horizon/event-duration-copy'
import { resolveLabUitkomst, type LabUitkomst } from '@/lib/horizon/lab-uitkomst'
import { GOAL_TYPE_LABELS } from '@/lib/goal-data'
import { guardFreedomMoment, guardRetirementExpense } from '@/lib/horizon/outcome-guard'
import {
  scenarioMonthlySpendDelta,
  buildCategorieReturnGroups,
  isDoelConceptGewijzigd,
  stripStopKeuze,
  type DoelParameter,
  KNOP_WEERGAVE_STANDAARD,
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
} from '@/lib/scenario-events'
import { resolveScenarioContext } from '@/lib/hooks/use-horizon-fire-sim'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { runLabGrenzenAsync, runMarktcheckAsync } from '@/lib/horizon-kernel/worker/run-in-worker'
import { buildScenarioVariants, type ScenarioOverlay, type MonteCarloOverlay } from '@/components/app/horizon/sim-chart'
import { faseAtAge } from '@/lib/horizon/phase-bar-segments'
import { buildBreakdown } from '@/lib/income-expense-breakdown'
import { unifiedRowsToStackedRows, type StackedRow } from '@/lib/wealth-composition'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import { simRowsToChartPoints } from '@/lib/horizon/sim-chart-geometry'
import {
  DEFAULT_FIRE_STRATEGY,
  resolveFreedomFraming,
  isAtOrPastAow,
  stopAnchorFromKernel,
} from '@/lib/fire-strategy'
import { buildBaselineOverrides } from '@/lib/whatif-overrides'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import type { OverlayBalloonDef } from '@/components/app/horizon/toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from '@/components/app/horizon/toekomst-overlay-balloons'
import type {
  ChartMode,
  IeViewMode,
  OverlayEmphasis,
} from '@/components/toekomst/state/types'
import { useEuroViewFeeds } from '@/components/toekomst/state/use-euro-view-feeds'
import {
  COLOR_LIFE_INCOME,
  COLOR_LIFE_EXPENSE,
  COLOR_NAT_ASSET,
  COLOR_NAT_DEBT,
  COLOR_NAT_SIM,
  COLOR_NAT_DANGER,
  COLOR_PARTNER_EVENT,
  COLOR_GOAL,
  COLOR_GOAL_OVERDUE,
} from '@/components/toekomst/canvas/marker-kleuren'
import { PlanHeroKop } from '@/components/toekomst/plan/plan-hero-kop'
import { PlanKerngetalMobiel, PlanKpiStripDesktop, PlanKpiStripMobiel } from '@/components/toekomst/plan/plan-kpi-strip'
import { PlanHeroDuiding } from '@/components/toekomst/plan/plan-hero-duiding'
import { PlanGegevensmelding } from '@/components/toekomst/plan/plan-gegevensmelding'
import { PlanMeldingen } from '@/components/toekomst/plan/plan-meldingen'
import { PlanVerdieping } from '@/components/toekomst/plan/plan-verdieping'
import { DoelenLab } from '@/components/toekomst/doelen/doelen-lab'
import { DoelenLabSheets } from '@/components/toekomst/doelen/doelen-lab-sheets'
import { ToekomstOverlays } from '@/components/toekomst/overlays/toekomst-overlays'
import {
  PlanKassabonVrijheidsleeftijd,
  PlanKassabonDoelbedrag,
  PlanKassabonOpnamerate,
  PlanKassabonGezondheid,
} from '@/components/toekomst/plan/plan-kassabons'
import { CanvasTipsToggle } from '@/components/toekomst/canvas/canvas-tips-toggle'
import { CanvasPills } from '@/components/toekomst/canvas/canvas-pills'
import { CanvasUitleg } from '@/components/toekomst/canvas/canvas-uitleg'
import { CanvasGrafiek } from '@/components/toekomst/canvas/canvas-grafiek'
import { CanvasLegenda } from '@/components/toekomst/canvas/canvas-legenda'
import { ToekomstStateProvider, useToekomstBron, useToekomstPerspectiefContext, useToekomstOverlayContext, useToekomstScenarioContext, useToekomstSimContext, useToekomstMeldingenContext } from '@/components/toekomst/state/toekomst-state-provider'

export default function HorizonPage({
  initialData,
  goals,
}: {
  initialData: HorizonPageData
  /**
   * @deprecated Genegeerd. K-02 — de enige aanroeper (/toekomst) gaf altijd
   * `embedded`; de standalone-tak (eigen PageInfoButton + h1) was dood en is
   * weg (ADR 0179 fase 1 stap 1, ADR 0110). Het veld blijft alleen staan tot
   * de page-verhuizing (stap 15) de prop bij de aanroeper schrapt.
   */
  embedded?: boolean
  /**
   * M36 — financiële doelen met een streefdatum als markers op de tijdas.
   * Bewust een PROP en geen extra query in de horizon-bundel: `/toekomst` laadt
   * deze doelen toch al (`loadFinData`) voor de Doelen-navkaart, dus de grafiek
   * leest exact DEZELFDE slice als de dashboard-widget — geen tweede bron, geen
   * extra egress. Ontbreekt de prop (legacy `/horizon`-route), dan gedraagt de
   * grafiek zich als voorheen.
   */
  goals?: readonly GoalMarkerInput[]
}) {
  return (
    <ToekomstStateProvider initialData={initialData} goals={goals}>
      <HorizonCompositie />
    </ToekomstStateProvider>
  )
}

/**
 * De compositie van /toekomst (ADR 0179 fase 1 stap 13): leest de gedeelde state uit
 * `ToekomstStateProvider` en rendert de blokken. Bevat nog de scenario-afleidingen en de
 * lagen, tot stap 14 ze naar de provider brengt.
 */
function HorizonCompositie() {
  const { initialData, goals } = useToekomstBron()
  const {
    partnerName,
    refreshData,
    isHouseholdView,
    isPartnerView,
    householdHero,
    partnerHero,
    householdInput,
    householdOverlays,
    householdMainLine,
    partnerLine,
    partnerLifeEvents,
    householdRetireInfo,
    usePartnerMainLine,
    useHouseholdMainLine,
    verkenSectieZichtbaar,
  } = useToekomstPerspectiefContext()
  const {
    activeModal,
    setActiveModal,
    strategieInitialTab,
    setStrategieInitialTab,
    simModalOpen,
    setSimModalOpen,
    activeFaseModal,
    setActiveFaseModal,
    uitgavenPaneOpen,
    setUitgavenPaneOpen,
    householdRetireOpen,
    setHouseholdRetireOpen,
    openRetirementExpensePane,
    eventPaneOpen,
    setEventPaneOpen,
    eventPaneEditingId,
    setEventPaneEditingId,
    eventPaneMode,
    setEventPaneMode,
    clusterSheet,
    setClusterSheet,
    verkenSectionRef,
    selectedNaturalMilestone,
    setSelectedNaturalMilestone,
    selectedYearAge,
    setSelectedYearAge,
  } = useToekomstOverlayContext()
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
  } = useToekomstScenarioContext()
  const {
    input,
    fireParams,
    withdrawalStrategyConfig,
    fireStrategy,
    kernelRawProfile,
    aowRows,
    userAowAge,
    debts,
    actions,
    resilienceSnapshots,
    retirementMethod,
    events,
    setEvents,
    fireSwr,
    canonicalDailyRate,
    fire,
    range,
    healthScore,
    healthScoreInput,
    solvedRun,
    haalbareUitgave,
    scenarioPresets,
    scenarioPresetsLoading,
    displayMode,
    markeerDuidingInView,
    startRefresh,
    simResult,
    simCashflows,
    simError,
    unifiedRows,
    kernelStatus,
    kernelMaandHint,
    kernelHousingSale,
    aowOntbreekt,
    scenario,
    stopPad,
    scenarioPending,
    stopPadPending,
    projectiePending,
    displayEvents,
    eventPanePreviewBaseline,
    loadData,
    effectiveInput,
    currentAge,
    planAnchor,
    isFixedAnchorMode,
    eventStopAge,
    effectiveFireTarget,
    effectiveNetWorth,
    homeExcludedFromProgress,
    effectiveFreedomPct,
    isPensioenMode,
    isNuStoppenMode,
    ankerReach,
    ankerStop,
    heroVraag,
    fireDoel,
    fireTargetInclHome,
    fireTargetExclHome,
    showDualFireTarget,
    showLiquidWealthLine,
    balkVrijheidDoel,
    fireTargetGuard,
    showFireTargetNotice,
    planningMode,
    aowAgeFormatted,
    heroFireAge,
    heroFireAgePending,
    heroFireAgeText,
    heroFireAgeTextMobile,
    heroFireAgeReceiptText,
    vermogenOpAnker,
    monthlyWithdrawalAtAow,
    overgangData,
    onttrekkingData,
    displayEndAge,
    displayUnifiedRows,
    chartEndAge,
    targetInflationFactors,
    liquidWealthPoints,
    displaySimRows,
    displayEffectiveSimRows,
    erfgenamen,
    partnerAowBedrag,
    isKernelDepleteRate,
    effectiveCountdown,
    personalHeroProjection,
    eigenHuisMortgageIds,
    handleActionStatusChange,
  } = useToekomstSimContext()
  const {
    deficitLoanNotice,
    reverseMortgageStartAge,
    housingHeldNotice,
    deficitDisplay,
    canMinimizeDeficit,
    minimizeDeficitNotice,
    aowDisplay,
    canMinimizeAow,
    minimizeAowNotice,
    eindsituatiePlan,
    eindsituatieDuiding,
    eindsituatieDisplay,
    canMinimizeEindsituatie,
    minimizeEindsituatieNotice,
    deficitLoanCopy,
  } = useToekomstMeldingenContext()
  const { masked } = useMaskedAmounts()
  const { addToast } = useToast()
  const router = useRouter()

  const [healthChartOpen, setHealthChartOpen] = useState(false)
  const [fireAgeChartOpen, setFireAgeChartOpen] = useState(false)

  // Scenario overlay state
  const [scenariosExpanded, setScenariosExpanded] = useState(false)
  const [scenarioData, setScenarioData] = useState<ScenarioOverlay[] | null>(null)

  // Marktcheck-overlay ("Monte Carlo"-pil) — de geslaagde uitkomst van de
  // kernel-marktcheck: percentielband op de netto-vermogensgrondslag + de
  // RENDEMENT-MARGE (hoeveel het rendement mag tegenvallen voordat het plan
  // omvalt, op een vaste stopleeftijd). Die marge verving het standhoud-
  // percentage, dat op de gesolvede FIRE-leeftijd per constructie ~51% was.
  // `mcPending` dekt de wachttijd (n volledige kernel-projecties in de worker).
  const [mcExpanded, setMcExpanded] = useState(false)
  const [mcData, setMcData] = useState<Extract<MarktcheckOutcome, { ok: true }> | null>(null)
  const [mcPending, setMcPending] = useState(false)
  /** Laatste marktcheck-run mislukt (geen worker / kern-fout) → faal-affordance. */
  const [mcFailed, setMcFailed] = useState(false)
  /** Monotone generatie: alleen het antwoord van de NIEUWSTE aanvraag telt. */
  const marktcheckGenRef = useRef(0)
  const [incomeExpenseExpanded, setIncomeExpenseExpanded] = useState(false)
  const [ieViewMode, setIeViewMode] = useState<IeViewMode>('lines')
  const [chartMode, setChartMode] = useState<ChartMode>('vermogenspad')

  // Levenslijn cijferbar + "speel af" (alleen volledige weergave): de actieve leeftijd
  // wordt gedeeld door de SimChart-hover én de playback-animatie.
  const [lifelineAge, setLifelineAge] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRafRef = useRef<number | null>(null)

  // Natuurlijke mijlpalen toggle — afgeleide events op de tijdlijn
  // (hypotheek afgelost, autolening afgelost, vermogen op, eerste miljoen, etc.).
  // Persistent via localStorage zodat de gebruiker zijn voorkeur niet
  // bij elke refresh opnieuw moet aanvinken.
  const [showNaturalMilestones, setShowNaturalMilestones] = useState(true)
  // Levensgebeurtenissen toggle — handmatig aangemaakte life events tonen/verbergen.
  // Default true. Persistent zoals natuurlijke mijlpalen.
  const [showLifeEvents, setShowLifeEvents] = useState(true)
  // Doelen toggle (M36) — financiële doelen met streefdatum op de as. Default
  // true; zelfde per-apparaat localStorage-voorkeur als de twee buur-pills.
  const [showGoals, setShowGoals] = useState(true)
  // ── Grondslag van de PRIMAIRE vermogenslijn (ADR 0114 D1) ────────────────
  // Server-props, dus stabiel over de hydratie heen — daarom hier bovenaan: de
  // voorkeur-sleutel van de tweede-lijn-pill hangt eraan.
  const chartPrimaryBasis = primaryChartBasis(
    initialData.housingContext,
    initialData.housingStrategy.mode,
  )
  // Tweede-grondslag-lijn toggle — de dunne gestippelde lijn in Pad-modus.
  //
  // STANDAARD UIT in álle strategieën (ADR 0114 D5). De eerdere uitzondering
  // (AAN bij uitsluiten) bestond enkel omdat de grafiek daar anders uit de pas
  // liep met de voortgangsbalk; nu de PRIMAIRE lijn daar zelf op J staat is die
  // reden vervallen, en een standaard-tweede lijn zou de "te druk"-melding die
  // spoor A oploste opnieuw openen.
  const [showLiquidLine, setShowLiquidLine] = useState(false)
  // De pill schakelt bij "Uitsluiten" een ÁNDERE lijn (de totaallijn) dan in de
  // overige strategieën (de besteedbaar-lijn). Daarom per rol een eigen
  // localStorage-sleutel: anders zou een oude "zonder je huis: uit" ineens de
  // hoofd-tegenhanger van iemands grafiek uitzetten (ADR 0114 D5).
  const secondaryLinePrefKey =
    chartPrimaryBasis === 'liquid' ? 'horizon_show_total_line' : 'horizon_show_liquid_line'
  // overlayPrefRestored: pas `true` nadat de localStorage-voorkeur ná hydratie is
  // ingelezen. Gate voor het auto-scroll-effect van de overlay — zo scrolt de
  // pre-restore default `overlayVisible={true}` op de eerste render NIET naar de
  // grafiek wanneer de gebruiker de tips eerder had uitgezet (race-fix). De
  // gerenderde DOM hangt NIET van deze flag af → geen hydratie-mismatch.
  const [overlayPrefRestored, setOverlayPrefRestored] = useState(false)
  useEffect(() => {
    try {
      const storedNat = localStorage.getItem('horizon_show_natural_milestones')
      if (storedNat !== null) setShowNaturalMilestones(storedNat === 'true')
      const storedLife = localStorage.getItem('horizon_show_life_events')
      if (storedLife !== null) setShowLifeEvents(storedLife === 'true')
      const storedGoals = localStorage.getItem('horizon_show_goals')
      if (storedGoals !== null) setShowGoals(storedGoals === 'true')
      // Tweede grondslag-lijn: géén key ⇒ de default UIT blijft staan. De sleutel
      // hangt aan de ROL van de pill (zie `secondaryLinePrefKey`).
      const storedLiquid = localStorage.getItem(secondaryLinePrefKey)
      if (storedLiquid !== null) setShowLiquidLine(storedLiquid === 'true')
      // Overlay-zichtbaarheid: default AAN de eerste keer (geen key), daarna
      // de opgeslagen voorkeur. Onafhankelijk van de welkomsttekst-state.
      const storedOverlay = localStorage.getItem('horizon_overlay_visible')
      if (storedOverlay !== null) setOverlayVisible(storedOverlay === 'true')
    } catch {
      // ignore — localStorage kan disabled zijn (private mode)
    } finally {
      // Voorkeur is nu (al dan niet) toegepast → auto-scroll mag voortaan vuren
      // op een échte open. Bij voorkeur `false` is `overlayVisible` hierboven al
      // op false gezet, dus scrolt het effect niet.
      setOverlayPrefRestored(true)
    }
    // `secondaryLinePrefKey` is uit server-props afgeleid en dus stabiel; hij
    // staat hier zodat de sleutelkeuze zichtbaar bij het effect hoort.
  }, [secondaryLinePrefKey])
  const persistOverlayVisible = useCallback((val: boolean) => {
    setOverlayVisible(val)
    try { localStorage.setItem('horizon_overlay_visible', String(val)) } catch { /* noop */ }
  }, [])
  // ── Tips verlaten: sluiten sluit direct (M38) ────────────────────────────
  //
  // Élke exit van de tips-overlay — ✕, Escape, klik op de achtergrond of de
  // Tips-toggle — verbergt de tips METEEN en onthoudt dat
  // (`horizon_overlay_visible`). De bevestiging komt daarná, als
  // niet-blokkerende toast die vertelt waar je de tips terugvindt, met "Niet
  // meer melden" als optie ter plekke.
  //
  // Hiervóór stond hier een gecentreerde modal (`ToekomstExitNotice`) die de
  // sluiting ophield tot je in een tweede venster nóg een keuze maakte; en de
  // eerste sluiting navigeerde ongevraagd naar /overzicht. Beide zijn weg: het
  // eerste las als "sluiten sluit niet", het tweede stond in geen enkele
  // knoptekst. Terug naar de tips gaat via de Tips-knop boven de grafiek.
  const [exitNoticeDismissed, setExitNoticeDismissed] = useState<boolean>(
    initialData.exitNoticeDismissed,
  )
  /**
   * "Niet meer melden": zet de bevestigings-toast cross-device uit
   * (user_feature_visits, zelfde fire-and-forget-stijl als de welkomstkaart).
   * Raakt de tips-zichtbaarheid NIET — die hangt aan `horizon_overlay_visible`.
   */
  const dismissExitNoticeForever = useCallback(() => {
    setExitNoticeDismissed(true)
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: HORIZON_EXIT_NOTICE_DISMISSED_SLUG }),
    }).catch(() => {})
  }, [])
  const handleOverlayExit = useCallback(() => {
    persistOverlayVisible(false)
    if (exitNoticeDismissed) return
    addToast({
      type: 'info',
      title: 'Tips verborgen',
      message: 'Je zet ze terug aan met de Tips-knop boven de grafiek.',
      duration: 8000,
      action: { label: 'Niet meer melden', onClick: dismissExitNoticeForever },
    })
  }, [exitNoticeDismissed, persistOverlayVisible, addToast, dismissExitNoticeForever])
  const persistNaturalMilestones = useCallback((val: boolean) => {
    setShowNaturalMilestones(val)
    try { localStorage.setItem('horizon_show_natural_milestones', String(val)) } catch { /* noop */ }
  }, [])
  const persistLifeEvents = useCallback((val: boolean) => {
    setShowLifeEvents(val)
    try { localStorage.setItem('horizon_show_life_events', String(val)) } catch { /* noop */ }
  }, [])
  const persistGoals = useCallback((val: boolean) => {
    setShowGoals(val)
    try { localStorage.setItem('horizon_show_goals', String(val)) } catch { /* noop */ }
  }, [])
  const persistLiquidLine = useCallback((val: boolean) => {
    setShowLiquidLine(val)
    try { localStorage.setItem(secondaryLinePrefKey, String(val)) } catch { /* noop */ }
  }, [secondaryLinePrefKey])
  const [showFireAgeReceipt, setShowFireAgeReceipt] = useState(false)
  const [showFireTargetReceipt, setShowFireTargetReceipt] = useState(false)
  const [showResilienceReceipt, setShowResilienceReceipt] = useState(false)
  const [showSwrReceipt, setShowSwrReceipt] = useState(false)

  // ── Toekomst-overlay (ballonnen) ─────────────────────────────────
  // De grafiek wordt sinds juni 2026 altijd getoond (de oude setup-pane is
  // verwijderd). In plaats daarvan een toggle-bare ballonnen-overlay die wijst
  // naar de inline-editors. De eenmalige welkomstkaart is per ADR 0130
  // verdwenen: het welkom woont nu in de rondleiding op /overzicht.
  //
  // overlayVisible: zichtbaarheid van de ballonnen-laag. Default AAN de eerste
  // keer (geen localStorage-key), daarna gepersisteerd.
  const [overlayVisible, setOverlayVisible] = useState(true)
  // overlayEmphasis: welke grafiekfase een gehoverde/gefocuste ballon accentueert.
  const [overlayEmphasis, setOverlayEmphasis] = useState<OverlayEmphasis>(null)

  // ── Marktcheck-context ────────────────────────────────────────────────────
  // De rauwe kernel-context voor de Monte-Carlo-band: de preview-baseline (die de
  // convergentie-context al canoniek assembleert) + de events van de hoofdrun.
  // BEWUST dezelfde `events` als `useHorizonFireSim` — niet `displayEvents` — zodat
  // band en hoofdlijn per constructie van hetzelfde plan komen.
  const marktcheckContext = useMemo<ConvergentieRawContext | null>(() => {
    if (!eventPanePreviewBaseline) return null
    return { ...eventPanePreviewBaseline.rawContext, lifeEvents: events }
  }, [eventPanePreviewBaseline, events])
  // De marktcheck is ~200× zwaarder dan de hoofdprojectie en deelt met haar één
  // seriële worker. Hij draait daarom op de UITGESTELDE context — dezelfde keuze
  // die `use-horizon-fire-sim` voor de (lichtere) hoofdlijn al maakt.
  const deferredMarktcheckContext = useDeferredValue(marktcheckContext)
  // Het ANKER van de rendement-marge: de gekozen stopleeftijd. Bewust de RAUWE
  // keuze (`scenarioStopAge`, `null` = geen keuze) en niet `effectiveStopAge` —
  // die valt terug op de afgeronde verwacht-FIRE, en een marge op de gesolvede
  // leeftijd is per constructie ≈ 0 (dezelfde val als de 51%-kans). Zonder eigen
  // keuze ankert de motor zelf op de AOW-leeftijd; de copy zegt dat ook.
  // Uitgesteld om dezelfde reden als de context: één job per gebaar.
  const deferredMarktcheckStopAge = useDeferredValue(scenarioStopAge)

  // Lazy scenario computation — replay main sim with variant returns
  useEffect(() => {
    if (!scenariosExpanded) { setScenarioData(null); return }
    if (!simResult || simResult.rows.length === 0) return
    setScenarioData(buildScenarioVariants(simResult.rows, fireParams.grossReturn))
  }, [scenariosExpanded, simResult, fireParams.grossReturn])

  // ── Marktcheck-overlay (de "Monte Carlo"-pil) ───────────────────────────────
  // Alleen bij expand (de expand-klik is de zichtbaarheids-gate). Draait
  // `computeMarktcheck` in de web worker: n VOLLEDIGE kernel-projecties op EXACT
  // dezelfde `ConvergentieRawContext` als de hoofdlijn, zodat de band de hele
  // plan-curve volgt (opbouw, overgang én onttrekking) op dezelfde leeftijdsas en
  // dezelfde grondslag (netto vermogen).
  //
  // DRIE REMMEN, want één marktcheck is ~200× duurder dan de hoofdprojectie en
  // deelt met haar één seriële worker:
  //  1. DEFERRED context — spiegel van `deferredKernelInput` in de hoofd-hook.
  //     Zonder dit draait de
  //     zwaarste run op de rauwste waarde.
  //  2. DEBOUNCE — een marker-drag muteert `events` per hele jaarstap. De
  //     `cancelled`-closure negeert alleen het ANTWOORD; de worker rekent een
  //     eenmaal verstuurde job volledig uit. Een drag over 20 jaar zou dus tot 20
  //     jobs × 200 projecties in de wachtrij zetten, met de hoofdlijn erachter.
  //     Deze rem zorgt dat zulke tussenstanden nooit verstuurd worden.
  //  3. GENERATIE-GUARD — een nieuwere aanvraag VERVANGT de oudere: alleen het
  //     antwoord met de hoogste generatie mag nog state schrijven.
  useEffect(() => {
    if (!mcExpanded) {
      marktcheckGenRef.current += 1
      setMcData(null); setMcPending(false); setMcFailed(false)
      return
    }
    if (!deferredMarktcheckContext) {
      // Context (tijdelijk) weg — niet blijven hangen op "…".
      marktcheckGenRef.current += 1
      setMcPending(false)
      return
    }
    const gen = ++marktcheckGenRef.current
    // Tijdens het herrekenen NOOIT de vorige band laten staan: die hoort bij het
    // vorige plan en zou seconden lang over de al bijgewerkte hoofdlijn liggen —
    // precies de "band en lijn zijn verschillende plannen"-fout die deze motor
    // opruimt.
    setMcData(null)
    setMcFailed(false)
    setMcPending(true)
    const timer = setTimeout(() => {
      runMarktcheckAsync(deferredMarktcheckContext, undefined, deferredMarktcheckStopAge)
        .then((res) => {
          if (gen !== marktcheckGenRef.current) return
          const ok = res !== null && res.ok
          setMcData(ok ? res : null)
          setMcFailed(!ok)
          setMcPending(false)
        })
        .catch((err) => {
          if (gen === marktcheckGenRef.current) { setMcFailed(true); setMcPending(false) }
          console.warn('[horizon-worker] marktcheck faalde', err)
        })
    }, MARKTCHECK_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [mcExpanded, deferredMarktcheckContext, deferredMarktcheckStopAge])

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

  // ── Natuurlijke mijlpalen ───────────────────────────────────────────────
  // Afgeleide events op de tijdlijn — hypotheek afgelost, autolening
  // afgelost, vermogen op, eerste miljoen, etc. Geen DB-mutatie; puur
  // berekend uit assets/debts/simResult. Toggle persisteert in localStorage.
  const naturalMilestones = useMemo(() => {
    if (!showNaturalMilestones) return []
    return deriveNaturalMilestones({
      debts,
      assets: initialData.assets,
      simResult: simResult ?? null,
      // Schuld-payoff-mijlpaal leest de kernel-rijen (huisverkoop-bewust) i.p.v.
      // het statische amortisatieschema — zie lib/natural-milestones.ts.
      unifiedRows,
      dob: effectiveInput?.dateOfBirth ?? null,
      hasPartner: initialData.hasPartner,
    })
  }, [showNaturalMilestones, debts, initialData.assets, simResult, unifiedRows, effectiveInput?.dateOfBirth, initialData.hasPartner])

  const naturalMilestonesAsEvents = useMemo<LifeEvent[]>(
    () => naturalMilestones.map(naturalMilestoneToLifeEvent),
    [naturalMilestones],
  )

  // Bijvangst B-025: kernel-afgeleide events dragen een FRACTIONELE target_age
  // (de kernel verkoopt de woning in een maand, niet op een verjaardag). De
  // tijdlijn zet die rauw onder de marker — "73.16666666666666j" naast
  // buurlabels als "49j". Gebruikers-events komen uit een integer-kolom, dus
  // dit raakt alleen de afgeleide markers. We ronden op hele jaren af, precies
  // zoals `handleEventDragEnd` dat doet vóór het wegschrijven; label én
  // markerpositie blijven zo bij elkaar.
  //
  // Alleen deze weergave-lijst wordt afgerond. `displayEvents` (EventPane,
  // chart-markers, simulatie-invoer) houdt de exacte kernel-waarde — afronden
  // dáár zou een rekenwaarde verschuiven, en dat is geen weergavekwestie.
  const eventsForTimeline = useMemo(() => {
    const base = showLifeEvents ? displayEvents : []
    const alle = showNaturalMilestones ? [...base, ...naturalMilestonesAsEvents] : base
    return alle.map(e =>
      e.target_age != null && !Number.isInteger(e.target_age)
        ? { ...e, target_age: Math.round(e.target_age) }
        : e,
    )
  }, [showLifeEvents, showNaturalMilestones, displayEvents, naturalMilestonesAsEvents])


  // Doelen met een kalender-streefdatum → markers op de leeftijd-as. De
  // omzetting (en alle uitsluitingen) leeft in lib/horizon/goal-chart-markers.ts;
  // hier gebeurt geen enkele doel-berekening — `computeGoalProgress` blijft de
  // enige bron voor voortgang.
  const goalChartMarkers = useMemo<ChartEventOverlay[]>(
    () =>
      buildGoalChartMarkers(goals ?? [], {
        dateOfBirth: effectiveInput?.dateOfBirth ?? null,
        currentAge,
        color: COLOR_GOAL,
        overdueColor: COLOR_GOAL_OVERDUE,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- COLOR_* zijn module-constante strings
    [goals, effectiveInput?.dateOfBirth, currentAge],
  )

  const chartEventOverlay = useMemo<ChartEventOverlay[]>(() => {
    const out: ChartEventOverlay[] = []
    // Partner-view met een precies partner-pad: de hoofdlijn IS de partner z'n
    // lijn, dus de EIGEN events + natuurlijke mijlpalen (op de eigen as) horen
    // er niet bij — we tonen dan uitsluitend de partner-events. Bij privacy-
    // degrade (geen partner-pad) val je terug op de eigen lijn + eigen events.
    const showOwnEvents = !(isPartnerView && partnerLine !== null)
    if (showLifeEvents && showOwnEvents) {
      for (const ev of displayEvents) {
        if (ev.target_age == null) continue
        const side = lifeEventSide(ev)
        out.push({
          id: ev.id,
          label: ev.name,
          age: ev.target_age,
          side,
          color: side === 'above' ? COLOR_LIFE_INCOME : COLOR_LIFE_EXPENSE,
          icon: ev.icon || 'Calendar',
          kind: 'life_event',
          // Looptijd van het maandbedrag als tooltip-detail (gedeelde helper) — alleen
          // bij een maandbedrag; een eenmalige post heeft geen looptijd.
          ...(ev.monthly_cost_change > 0 || ev.monthly_income_change > 0
            ? { detail: describeEventDuration(ev, eventStopAge) }
            : {}),
          // F-1 drag-handler heeft sourceId nodig om de supabase-update
          // te kunnen routeren. Voor life_events is dat de event-id zelf.
          sourceId: ev.id,
        })
      }
    }
    if (showNaturalMilestones && showOwnEvents) {
      for (const m of naturalMilestones) {
        const side = naturalMilestoneSide(m)
        const color =
          m.kind === 'sim_out_of_cash'
            ? COLOR_NAT_DANGER
            : m.category === 'debt'
              ? COLOR_NAT_DEBT
              : m.category === 'asset'
                ? COLOR_NAT_ASSET
                : COLOR_NAT_SIM
        out.push({
          id: m.id,
          label: m.name,
          age: m.target_age,
          side,
          color,
          icon: m.icon,
          kind: 'natural',
          sourceId: m.sourceId,
        })
      }
    }
    // M36 — financiële doelen met streefdatum. Volgen `showOwnEvents`: in een
    // precies partner-perspectief is de hoofdlijn die van de partner, dus horen
    // de EIGEN doelen daar net zo min bij als de eigen levensgebeurtenissen.
    if (showGoals && showOwnEvents) {
      out.push(...goalChartMarkers)
    }
    // Partner-levensgebeurtenissen als READ-ONLY markers (huishouden- +
    // partner-view). Distinctieve partner-kleur (teal) zodat ze visueel
    // verschillen van de eigen events (goud/bruin) én van natuurlijke
    // mijlpalen. Géén sourceId → de click/drag-handlers raken niets aan
    // (de viewer kan de events van de partner niet bewerken). Alleen
    // PERSOONLIJKE partner-events; gedeelde + natuurlijke mijlpalen niet.
    // As-keuze (TPR-07 fase 2a): loopt de hoofdlijn op de as van de partner
    // (partner-view mét partner-pad), dan de opgeslagen leeftijd; anders — huishoud-
    // blik of privacy-degrade naar de eigen lijn — de DOB-verschoven eigen as.
    const partnerAxis = isPartnerView && partnerLine !== null
    if ((isHouseholdView || isPartnerView) && partnerLifeEvents.length > 0) {
      for (const ev of partnerLifeEvents) {
        const age = partnerAxis ? ev.targetAge : ev.targetAgeOnOwnAxis
        if (age == null) continue
        out.push({
          id: `partner-${ev.id}`,
          label: ev.name,
          age,
          side: 'above',
          color: COLOR_PARTNER_EVENT,
          icon: ev.icon || 'Calendar',
          kind: 'life_event',
          // GEEN sourceId + readOnly → geen edit/drag-routing (read-only marker).
          readOnly: true,
        })
      }
    }
    // Partner-AOW op de eigen as (TPR-07 fase 2a) — uit de PT-laag van de kernel
    // via de bridge (consume, don't recompute). De BROWSER-hoofdrun draagt geen
    // partnerblok (rawContextZonderPartner), dus de bron is de gecombineerde run
    // van de huishoud-sectie (`householdMainLine.partnerAowAge`), met de eigen
    // `simResult` als terugval voor een run die het blok wél draagt. Alleen in de
    // huishoudblik; read-only, geen sourceId → geen klik-/sleeproute. Kind 'natural'
    // zodat de zichtbaarheid de natuurlijke mijlpalen volgt (net als de tekort-lening-marker).
    const partnerAowAge = householdMainLine?.partnerAowAge ?? simResult?.partnerAowAge
    if (isHouseholdView && showNaturalMilestones && partnerAowAge != null && Number.isFinite(partnerAowAge)) {
      out.push({
        id: 'partner-aow',
        label: 'AOW partner',
        age: partnerAowAge,
        side: 'above',
        color: COLOR_PARTNER_EVENT,
        icon: 'Landmark',
        kind: 'natural',
        detail: `Je partner bereikt de AOW-leeftijd — op jouw as ${formatStopAge(Math.round(partnerAowAge * 10) / 10)}`,
        readOnly: true,
      })
    }
    // V7 — tekort-lening als read-only waarschuwingsmarker op de eerste leeftijd
    // waarop de lening wordt aangesproken (stoplicht-rood, geen module-accent). Kind
    // 'natural' zonder sourceId → klik is een no-op (geen milestone-sheet) en de
    // marker is niet sleepbaar; volgt de natuurlijke-mijlpaal-zichtbaarheid.
    if (deficitLoanNotice && showNaturalMilestones && showOwnEvents) {
      out.push({
        id: 'deficit-loan',
        label: 'Tekort-lening aangesproken',
        age: deficitLoanNotice.firstAge,
        side: 'below',
        color: COLOR_NAT_DANGER,
        icon: 'AlertTriangle',
        kind: 'natural',
        readOnly: true,
      })
    }
    if (reverseMortgageStartAge != null && showNaturalMilestones && showOwnEvents) {
      out.push({
        id: 'reverse-mortgage-start',
        label: 'Eerste opname opeethypotheek',
        age: reverseMortgageStartAge,
        side: 'above',
        color: COLOR_NAT_ASSET,
        icon: 'Home',
        kind: 'natural',
        readOnly: true,
      })
    }
    return out
  }, [showLifeEvents, showNaturalMilestones, showGoals, goalChartMarkers, displayEvents, naturalMilestones, isHouseholdView, isPartnerView, partnerLine, partnerLifeEvents, deficitLoanNotice, reverseMortgageStartAge, eventStopAge, householdMainLine?.partnerAowAge, simResult?.partnerAowAge])

  // Klik-handler voor markers op de chart. Life-events openen de EventPane
  // (bestaande slide-in/stack-push flow), natuurlijke mijlpalen openen onze
  // krant-stijl info-sheet, doelen deeplinken naar de doelenpagina.
  const handleChartEventClick = useCallback(
    (id: string, kind: ChartEventKind) => {
      // Read-only partner-marker (id-prefix 'partner-'): geen edit-pane openen —
      // de viewer mag de levensgebeurtenissen van de partner niet bewerken.
      if (id.startsWith('partner-')) return
      // M36 — een doel bewerk je op /toekomst/doelen (daar wordt ook de
      // voortgang herrekend); de tijdas toont 'm alleen.
      if (kind === 'goal' || isGoalMarkerId(id)) {
        router.push('/toekomst/doelen')
        return
      }
      if (kind === 'life_event') {
        setEventPaneEditingId(id)
        setEventPaneMode('view')
        setEventPaneOpen(true)
        return
      }
      const m = naturalMilestones.find(x => x.id === id)
      if (m) setSelectedNaturalMilestone(m)
    },
    [naturalMilestones, router],
  )

  /**
   * M16 — uitgang van een cluster op de chart-markers. Bij de standaard
   * uitgezoomde stand liggen markers uit aangrenzende jaren binnen een paar
   * pixels van elkaar; ze worden dan gebundeld tot een "+N"-badge en dít is wat
   * die badge opent. Hergebruikt bewust `EventClusterSheet` — dezelfde sheet die
   * de EventsTimeline eronder al gebruikt, met dezelfde rij-routing.
   *
   * De marker-laag levert `ChartEventOverlay`s; de sheet leest `LifeEvent`s.
   * Waar een echt LifeEvent bestaat (levensgebeurtenissen + natuurlijke
   * mijlpalen) pakken we dát object, zodat de bedragregel klopt. Doel-markers
   * (M36), read-only partner-gebeurtenissen en de tekort-lening hebben geen
   * LifeEvent-tegenhanger; die gaan door `chartEventOverlayToClusterRow` en
   * dragen een vooraf gezette tekstregel i.p.v. een verzonnen bedrag. Ze
   * WEGLATEN is geen optie: dan telt de badge er meer dan de lijst toont.
   */
  const handleChartClusterOpen = useCallback(
    (clusterEvents: ChartEventOverlay[], centerAge: number) => {
      if (clusterEvents.length === 0) return
      const byId = new Map(eventsForTimeline.map(e => [e.id, e]))
      setClusterSheet({
        events: clusterEvents.map(o => byId.get(o.id) ?? chartEventOverlayToClusterRow(o)),
        centerAge,
      })
    },
    [eventsForTimeline],
  )

  /**
   * F-1 directe manipulatie: drag-and-drop op chart-events. Wanneer de
   * gebruiker een marker horizontaal sleept en loslaat, persisteren we
   * de nieuwe target_age direct in supabase en triggeren een re-load
   * van de events-state. Alleen life_events zijn dragbaar; natural
   * milestones zijn auto-afgeleid en niet bewerkbaar.
   */
  /**
   * F-5 live curve-update: tijdens een drag krijgen we per kwartaal-
   * crossing een nieuwe target_age aangeleverd. We werken events lokaal
   * bij zonder supabase-call zodat de SimChart-NW-curve live mee
   * beweegt. Bij release commit handleChartEventDragEnd de definitieve
   * waarde naar de DB.
   */
  const handleChartEventDragMove = useCallback(
    (
      id: string,
      sourceId: string | undefined,
      newAge: number,
      kind: ChartEventKind,
    ) => {
      if (kind !== 'life_event') return
      const eventId = sourceId ?? id
      if (!eventId) return
      // Persist als geheel jaar (DB-schema beperking) maar respecteer
      // wel het clamp-bereik van de drag.
      const rounded = Math.max(currentAge ?? 18, Math.min(120, Math.round(newAge)))
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId && e.target_age !== rounded
            ? { ...e, target_age: rounded, target_date: null }
            : e,
        ),
      )
    },
    [currentAge, setEvents],
  )

  const handleChartEventDragEnd = useCallback(
    async (
      id: string,
      sourceId: string | undefined,
      newAge: number,
      kind: ChartEventKind,
    ) => {
      if (kind !== 'life_event') return
      // Voor life_events is sourceId === id (zie chartEventOverlay-build).
      // Val terug op id wanneer sourceId om welke reden ook ontbreekt.
      const eventId = sourceId ?? id
      if (!eventId) return
      const clamped = Math.max(currentAge ?? 18, Math.min(120, newAge))
      const target = events.find((e) => e.id === eventId)
      if (target && target.target_age === clamped) return

      // Optimistic update vóór de async supabase-call. Voorkomt dat de
      // marker terugschiet naar zijn oude positie tussen pointer-release
      // en server-response. Oude waarden bewaren voor rollback.
      const oldTargetAge = target?.target_age ?? null
      const oldTargetDate =
        (target as { target_date?: string | null } | undefined)?.target_date ?? null
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? { ...e, target_age: clamped, target_date: null }
            : e,
        ),
      )

      const supabase = createClient()
      const { error } = await supabase
        .from('life_events')
        .update({ target_age: clamped, target_date: null })
        .eq('id', eventId)
      if (error) {
        console.error('[F-1 drag] life_events update faalde:', error)
        // Rollback optimistic update naar oorspronkelijke waarden.
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventId
              ? { ...e, target_age: oldTargetAge, target_date: oldTargetDate }
              : e,
          ),
        )
        return
      }
      // Props-als-bron (fase 1 stap 3): na de write de server-bundel verversen, zodat
      // `initialData.events` niet achterloopt op de optimistische lokale lijst.
      loadData()
    },
    [currentAge, events, loadData, setEvents],
  )

  // ── Doorwerking wat-als in de duidingsblokken (plan §F) ─────────────────────
  // De scenario-rijen worden identiek geclipt als de basisrijen; bij een actief
  // scenario voeden ze de strook + de dekkingsradar i.p.v. de basisrijen (chip +
  // reset maken dat zichtbaar). Cijferbar, PhaseBar en hero-KPI's blijven basis.
  const scenarioDisplayRows = useMemo(
    () => (scenario != null ? clipRowsToPlanEnd(scenario.unifiedRows, displayEndAge) : null),
    [scenario, displayEndAge],
  )
  const activeUnifiedRows =
    hasScenario && scenario != null ? (scenarioDisplayRows ?? displayUnifiedRows) : displayUnifiedRows

  // ── Duiding-rijen (ronde 3): het gekozen-stop-pad wint zodra een expliciete stopleeftijd
  // gezet is, zodat de dekkingsblokken (strook + radar) de éChte dekking van dat gekozen
  // stopmoment tonen (bv. <100% in de rode zone) i.p.v. altijd het volledig-gedekte basispad.
  // Geen stop gezet ⇒ de gewone actieve rijen (basis of scenario). Zelfde clip als de basis.
  const duidingUnifiedRows = useMemo(
    () => (stopPad != null ? clipRowsToPlanEnd(stopPad.unifiedRows, displayEndAge) : activeUnifiedRows),
    [stopPad, displayEndAge, activeUnifiedRows],
  )

  // ── Uitgebreide-view blokken (levensinkomenstrook + dekkingsradar + cijferbar) ──
  // Alles consumeert de bestaande unified-rijen / config — geen herberekening.
  const coverageNodes = useMemo(
    () => buildCoverageStrip(duidingUnifiedRows ?? []),
    [duidingUnifiedRows],
  )
  // Bij een actief scenario schuift de bestedingsgrondslag mee met de scenario-events die
  // de motor óók als permanente uitgavenwijziging telt (`monthly_cost_change` op een vrije
  // Geb-rij). De spaarquote-slider valt daar per 29-jul BUITEN: die is inkomensgebonden en
  // loopt via het FIRE-gegate salaris-kanaal, dus hij verlaagt het FIRE-doelbedrag niet en
  // mag hier de onttrekkings-bestedingsgrondslag evenmin verlagen (`scenarioMonthlySpendDelta`
  // past dezelfde `isSliderWorkEvent`-gate toe). Basis zonder scenario.
  const activeMonthlySpend =
    (effectiveInput?.monthlyExpenses ?? 0) + (hasScenario ? scenarioMonthlySpendDelta(scenarioSliderEvents) : 0)
  // Gelande stopleeftijd van de stop-run — de duiding (radar-assen, subtitle, fasebalk)
  // leest deze i.p.v. de rauwe slider-state: tijdens het slepen loopt scenarioStopAge vóór
  // op de deferred stopPad-run, en de duiding hoort bij de rijen die er al stáán (zelfde
  // les als doel-lijn-bron.ts: alles uit hetzelfde result-object). Fallback op de
  // slider-stand voor het theoretische geval dat de geforceerde run geen leeftijd meldt.
  const duidingStopAge = stopPad != null ? (stopPad.result.fireAgeFractional ?? scenarioStopAge) : null
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
  // ── Dekkingsradar-assen — pure consume-laag over de duiding-rijen ──────
  // Alle grootheden komen elders vandaan: de duiding-rijen (stop-pad wint), de actieve-pad
  // FIRE/benodigd-vermogen/doel-eindvermogen en de canonieke bestedingsgrondslag
  // (activeMonthlySpend×12). null = nog geen leeftijd/rijen → blok blijft verborgen.
  // Bij een expliciete stop meet de radar vanaf jouw stopleeftijd: stopPad wint dan óók
  // voor de FIRE-leeftijd (= duidingStopAge, de gelande stop-run-leeftijd), het benodigd-/
  // doel-eindvermogen (uit stopPad.result) én het woning-verkoopmoment — de sale-bron volgt altijd de rijen-bron
  // (stop-pad → scenario → hoofd-run), anders duidt de wonen-as een noodverkoop uit het
  // verkeerde scenario.
  const radarAssen = useMemo<RadarAs[] | null>(() => {
    if (currentAge == null) return null
    const rows = duidingUnifiedRows ?? []
    if (rows.length === 0) return null
    const strat = fireStrategy ?? DEFAULT_FIRE_STRATEGY
    const requiredFire = stopPad != null
      ? stopPad.result.requiredFirePortfolio
      : hasScenario && scenario != null
        ? scenario.result.requiredFirePortfolio
        : (simResult?.requiredFirePortfolio ?? 0)
    const targetEnd = stopPad != null
      ? stopPad.result.targetEndPortfolio
      : hasScenario && scenario != null
        ? scenario.result.targetEndPortfolio
        : (simResult?.targetEndPortfolio ?? null)
    const radarHousingSale = stopPad != null
      ? stopPad.kernelHousingSale
      : hasScenario && scenario != null
        ? scenario.kernelHousingSale
        : kernelHousingSale
    return computeDekkingsradar({
      rows,
      currentAge,
      fireAgeFractional: stopPad != null ? duidingStopAge : scenarioVerwachtFireAge,
      aowAgeFractional: userAowAge.fractional,
      requiredFirePortfolio: requiredFire,
      targetEndPortfolio: targetEnd,
      endStrategy: strat.strategy,
      housingStrategy: initialData.housingStrategy,
      hasEigenHuis: initialData.housingContext.hasEigenHuis,
      kernelHousingSale: radarHousingSale,
      jaarBesteding: activeMonthlySpend * 12,
      // ADR 0145 D5 — de bridge-vlag van de run die de RIJEN levert (zelfde volgorde:
      // stop-pad → scenario → hoofd-run). `true` ⇒ requiredFirePortfolio is de stand op
      // het anker, geen doel; as 4 (behoud-tak) wordt dan n.v.t.
      anchorPortfolio:
        (stopPad != null
          ? stopPad.result
          : hasScenario && scenario != null
            ? scenario.result
            : simResult
        )?.requiredFireIsAnchorPortfolio === true,
    })
  }, [duidingUnifiedRows, currentAge, scenarioVerwachtFireAge, stopPad, duidingStopAge, userAowAge.fractional, hasScenario, scenario, simResult, fireStrategy, initialData.housingStrategy, initialData.housingContext.hasEigenHuis, kernelHousingSale, activeMonthlySpend])
  // Cijferbar-waarden bij de actieve leeftijd (hover/playback); consumeert de
  // unified-rij + format-helpers, herberekent niets.
  const readoutData = useMemo(() => {
    const rows = displayUnifiedRows ?? []
    if (!rows.length) return null
    const target = lifelineAge ?? (currentAge != null ? Math.round(currentAge) : rows[0].age)
    let row = rows[0]
    let bestDiff = Math.abs(rows[0].age - target)
    for (const r of rows) {
      const d = Math.abs(r.age - target)
      if (d < bestDiff) { bestDiff = d; row = r }
    }
    const dRate = canonicalDailyRate
    // ── PEILMOMENT (H21/F1) ────────────────────────────────────────────────
    // `row.netWorth` is per contract de EINDstand van het blok (bridge.ts:
    // Prognose!I op m = 12k+11), `row.startNetWorth` de BEGINstand (m = 12k−1).
    // De kassabon toonde de eindstand onder het label "leeftijd X · jaar Y",
    // terwijl de zin eronder het netto vermogen van VANDAAG toont. Op k=0 scheelt
    // dat precies één jaar rendement + inleg — in productie €1.731.640 boven
    // €1.619.700, vijf regels uit elkaar, beide gepresenteerd als "nu".
    // (Deflatie verhult het juist: bij k=0 is de inflatiefactor exact 1,0.)
    //
    // Eén peilmoment voor de hele bar: de stand ÓP die leeftijd = het begin van
    // het blok. Daarmee klopt de kassabon per constructie met het leeftijd- en
    // jaarlabel ernaast, en is `k=0` letterlijk het bedrag van vandaag.
    const readoutNetWorth = row.startNetWorth
    const freedomTime = formatFreedomTimeString(calculateFreedomTime(Math.max(0, readoutNetWorth), dRate), 'short')
    const isAcc = row.phase === 'accumulation'
    // Fase uit dezelfde bron als de fasebalk (buildSegments): kernel-rijen
    // kennen geen 'transition' (bridge.ts), dus row.phase ziet Overgang niet.
    const faseId = (simResult != null
      ? faseAtAge({
          currentAge: currentAge ?? rows[0].age,
          fireAge: simResult.fireAge,
          fireAgeFractional: simResult.fireAgeFractional,
          aowAge: userAowAge.fractional,
          endAge: displayEndAge ?? rows[rows.length - 1].age + 1,
          fireReachable: simResult.fireReachable,
          isPensioenMode,
        }, row.age)?.id
      : null) ?? (isAcc ? 'opbouw' : 'onttrekking')
    const phaseLabel = faseId === 'opbouw' ? 'Opbouw' : faseId === 'overgang' ? 'Overgang' : 'Onttrekking'
    const phaseColor = faseId === 'opbouw'
      ? 'var(--hor-t, #8a6e42)'
      : faseId === 'overgang'
        ? 'var(--color-horizon-500)'
        : 'var(--kern-t, #58362d)'
    return {
      age: row.age,
      year: new Date().getFullYear() + row.year,
      phaseLabel,
      phaseColor,
      netWorth: readoutNetWorth,
      // Grondslag in het label: op de huidige leeftijd is de beginstand van het
      // blok letterlijk "nu"; verderop de tijdas is het het begin van dat jaar.
      netWorthMoment:
        currentAge != null && row.age === Math.round(currentAge)
          ? 'nu'
          : `begin ${new Date().getFullYear() + row.year}`,
      freedomTime,
      monthlyLabel: isAcc ? 'Inleg / maand' : 'Ruimte / maand',
      monthlyAmount: isAcc
        ? Math.max(0, row.savings) / 12
        : (row.withdrawalNeed?.totaalNeed ?? (effectiveInput?.monthlyExpenses ?? 0) * 12) / 12,
    }
  }, [displayUnifiedRows, lifelineAge, currentAge, effectiveInput, simResult, userAowAge.fractional, displayEndAge, isPensioenMode])

  // "Speel af": animeer de actieve leeftijd van de eerste naar de laatste rij.
  useEffect(() => {
    if (!isPlaying) return
    const rows = displayUnifiedRows ?? []
    if (rows.length < 2) { setIsPlaying(false); return }
    const startAge = rows[0].age
    const endAgeVal = rows[rows.length - 1].age
    const durationMs = 7000
    let startTs = 0
    const step = (ts: number) => {
      if (!startTs) startTs = ts
      const t = Math.min(1, (ts - startTs) / durationMs)
      setLifelineAge(Math.round(startAge + t * (endAgeVal - startAge)))
      if (t < 1) {
        playbackRafRef.current = requestAnimationFrame(step)
      } else {
        setIsPlaying(false)
      }
    }
    playbackRafRef.current = requestAnimationFrame(step)
    return () => {
      if (playbackRafRef.current != null) cancelAnimationFrame(playbackRafRef.current)
    }
  }, [isPlaying, displayUnifiedRows])

  // ── Welke grondslagen tekent de grafiek? (ADR 0114 D1/D6) ───────────────
  //
  // `chartPrimaryBasis` (bovenaan, uit server-props) zegt wat de woonstrategie
  // wil; hier komt daar de runtime-werkelijkheid bij. Bij "Uitsluiten" stonden de
  // voortgangsbalk en het vrijheids-% eronder al op de J-grondslag
  // (`homeExcludedFromProgress`) terwijl de grafiek op I stond — dát was het
  // defect.
  //
  // Is er überhaupt een tweede grondslag te tónen? Geen J-punten (o.a.
  // `include_full` — daar valt J exact samen met I) of een vreemde hoofdlijn
  // (partner/huishouden/AOW-stop, die andere rijen tekenen waar deze punten niet
  // bij horen) ⇒ één lijn op de totaal-grondslag, en dus ook geen pill.
  const dualBasisAvailable =
    liquidWealthPoints != null && !usePartnerMainLine && !useHouseholdMainLine
  // De grondslag die de grafiek daadwerkelijk tekent: 'liquid' alleen als de
  // woonstrategie erom vraagt ÉN de J-reeks er ook echt is.
  const effectiveChartPrimaryBasis: 'total' | 'liquid' =
    dualBasisAvailable && chartPrimaryBasis === 'liquid' ? 'liquid' : 'total'
  // De pill schakelt de TWEEDE (dunne, gestippelde) lijn — welke van de twee
  // grondslagen dat is, volgt uit `effectiveChartPrimaryBasis`.
  const secondaryLineVisible = dualBasisAvailable && showLiquidLine

  // Scenario overlays for SimChart (only when expanded + data available)
  const scenarioOverlays = scenariosExpanded && scenarioData ? scenarioData : undefined

  // De rendement-marge van de marktcheck — één bron voor pil, legenda, explainer
  // en aria-label (`lib/horizon/marktcheck-copy.ts` formuleert alle vier).
  // `null` = degeneratie (geen onttrekkingsfase op het anker) ⇒ geen getal tonen.
  const mcMarge = mcExpanded && mcData ? mcData.marge : null

  // Marktcheck-band voor SimChart. `startAge` komt UIT de band (de kernel-as
  // `round(startLeeftijd)`), niet uit een tweede leeftijdsberekening hier — anders
  // kan de band één jaar naast de hoofdlijn komen te liggen.
  //
  // GRONDSLAG (ADR 0114): de band MOET dezelfde grootheid dragen als de primaire
  // lijn die erin ligt. Tekent de grafiek J, dan komt de band uit `bandLiquide`
  // (de J-spiegel uit dezelfde MC-runs, op dezelfde blokranden) — anders omhult
  // hij een ándere grootheid dan de lijn, en bepaalt hij via de bandtop ook nog
  // de ashoogte mee. Bij `include_full` zijn beide banden per constructie gelijk.
  const mcBand = mcData
    ? (effectiveChartPrimaryBasis === 'liquid' ? mcData.bandLiquide : mcData.band)
    : null
  const monteCarloOverlay: MonteCarloOverlay | undefined = mcExpanded && mcBand
    ? {
        startAge: mcBand.startAge,
        p10: [...mcBand.p10],
        p25: [...mcBand.p25],
        p50: [...mcBand.p50],
        p75: [...mcBand.p75],
        p90: [...mcBand.p90],
      }
    : undefined

  const wealthCompositionRows: StackedRow[] = useMemo(() => {
    if (chartMode !== 'vermogensopbouw') return []
    if (!displayUnifiedRows.length) return []
    const baseRows = unifiedRowsToStackedRows(
      displayUnifiedRows,
      new Map(debts.map((d) => [d.id, d.debt_type])),
      eigenHuisMortgageIds,
    )

    const currentAgeFloor = initialData.effectiveInput.dateOfBirth
      ? Math.floor(ageAtDate(initialData.effectiveInput.dateOfBirth))
      : null
    if (currentAgeFloor === null) return baseRows

    // Woonstrategie-injectie (pure helper). De kernel houdt huis + hypotheek (én de
    // verkoop-/opeet-kasstromen) voor ELKE woonstrategie al in het grootboek →
    // `houseInLedger: true` voorkomt dubbeltellen. Dat kort-sluit vóór `isV2` (die
    // daardoor een no-op is; de param blijft alleen omdat de lib-helper 'm nog vereist).
    return applyHousingToComposition(baseRows, {
      housingCfg: initialData.housingStrategy,
      ctx: initialData.housingContext,
      displayEvents,
      currentAgeFloor,
      fireEndAge: initialData.fireStrategy.endAge,
      isV2: true,
      houseInLedger: true,
      // Terugval voor een woning zonder eigen rendement (ADR 0166) — inert onder
      // `houseInLedger`, maar dezelfde grondslag als de kernel zodra het pad leeft.
      terugvalRendement: initialData.fireParams.grossReturn,
    })
  }, [chartMode, displayUnifiedRows, initialData, displayEvents, debts, eigenHuisMortgageIds])

  // Lazy compute income/expense breakdown only when user toggles to 'breakdown' mode.
  // Consume de geclipte weergaverijen zodat de bronnen-breakdown niet tot het
  // (verborgen) laatste jaar doorloopt.
  const ieBreakdownResult = useMemo(() => {
    if (ieViewMode !== 'breakdown' || !displayUnifiedRows.length || !displaySimRows.length) return null
    return buildBreakdown(displayUnifiedRows, displaySimRows, debts)
  }, [ieViewMode, displayUnifiedRows, displaySimRows, debts])

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
  // kleur wordt genegeerd (inkt vast). Alleen wanneer de toggle aan staat.
  const scenarioLineOverlay = useMemo<ScenarioOverlay | null>(() => {
    if (!showScenarioLine || doelLijnBron == null) return null
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
  }, [showScenarioLine, doelLijnBron, displayEndAge, doelLijnLabel])

  // Gememoized samenstelling voor de SimChart-prop: een inline spread op de
  // callsite gaf per render een verse array-identiteit, waardoor de memo() van
  // SimChart bij élke monoliet-setState bail-de en de volledige SVG herbouwde.
  // De wat-als-lijn staat vooraan.
  const combinedScenarioOverlays = useMemo(() => [
    ...(scenarioLineOverlay ? [scenarioLineOverlay] : []),
    ...(scenarioOverlays ?? []),
  ], [scenarioLineOverlay, scenarioOverlays])

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
      knopWeergave !== KNOP_WEERGAVE_STANDAARD ||
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

  /** Drag-and-drop: update event target_age when dragged to a new position on the timeline. */
  async function handleEventDragEnd(eventId: string, newAge: number) {
    const ev = events.find(e => e.id === eventId)
    // target_age is een integer-kolom; drag-posities kunnen fractioneel zijn
    // (bv. 59.5) → afronden, anders weigert Postgres de update ("invalid input
    // syntax for type integer").
    const roundedAge = Math.round(newAge)
    if (!ev || ev.target_age === roundedAge) return

    const originalAge = ev.target_age

    // Optimistic local update for instant feedback
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, target_age: roundedAge } : e))

    const supabase = createClient()
    const { error } = await supabase.from('life_events').update({ target_age: roundedAge }).eq('id', eventId)
    if (error) {
      console.error('Failed to update life event age:', error)
      // Revert optimistic update
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, target_age: originalAge } : e))
      return
    }

    // Show undo toast after successful drag
    addToast({
      type: 'info',
      title: `${ev.name} verplaatst naar ${newAge}j`,
      message: `Was ${originalAge}j`,
      duration: 5000,
      action: {
        label: 'Ongedaan maken',
        onClick: async () => {
          // Revert to original age optimistically
          setEvents(prev => prev.map(e => e.id === eventId ? { ...e, target_age: originalAge } : e))
          const undoSupabase = createClient()
          const { error: undoErr } = await undoSupabase
            .from('life_events')
            .update({ target_age: originalAge })
            .eq('id', eventId)
          if (undoErr) {
            console.error('Failed to undo event drag:', undoErr)
            // Revert back to the new age if undo failed
            setEvents(prev => prev.map(e => e.id === eventId ? { ...e, target_age: newAge } : e))
            addToast({ type: 'error', title: 'Ongedaan maken mislukt', duration: 3000 })
            return
          }
          // Reload data to recalculate projections with restored position
          loadData()
          addToast({ type: 'success', title: `${ev.name} terug op ${originalAge}j`, duration: 3000 })
        },
      },
    })

    // Full reload to recalculate projections with new event position
    loadData()
  }

  // De euro-render-grens woont sinds ADR 0179 fase 1 stap 12 in `useEuroViewFeeds`
  // (components/toekomst/state/use-euro-view-feeds.ts). Hierboven is alles NOMINAAL;
  // hieronder consumeert dit bestand voor euro-bedragen uitsluitend de `view*`-feeds
  // die de hook teruggeeft. Dit bestand deflateert niets zelf.
  const {
    viewDisplaySimRows,
    viewWealthCompositionRows,
    viewPartnerLineRows,
    viewHouseholdMainLineRows,
    viewLiquidWealthPoints,
    viewCombinedScenarioOverlays,
    viewHouseholdOverlays,
    viewMonteCarloOverlay,
    viewFireTarget,
    viewFireTargetInclHome,
    viewTargetEndPortfolio,
    viewTargetInflationFactors,
    viewFireTargetExclHome,
    viewBalkVrijheidDoel,
    viewEffectiveFireTarget,
    viewVermogenOpAnker,
    viewMonthlyWithdrawalAtAow,
    labUitkomstRegel,
    labKnoppen,
    nalatenschapMarker,
    labFormatters,
    viewDoelPreviews,
    viewReadoutData,
    viewIeBreakdownResult,
    viewScenarioPresets,
    viewHouseholdHeroFireTarget,
    viewPartnerHeroFireTarget,
  } = useEuroViewFeeds({
    displayUnifiedRows,
    displaySimRows,
    displayEffectiveSimRows,
    wealthCompositionRows,
    partnerLine,
    householdMainLine,
    liquidWealthPoints,
    combinedScenarioOverlays,
    householdOverlays,
    monteCarloOverlay,
    simResult,
    fireTargetInclHome,
    chartEndAge,
    targetInflationFactors,
    userAowAge,
    fireTargetExclHome,
    balkVrijheidDoel,
    effectiveFireTarget,
    vermogenOpAnker,
    monthlyWithdrawalAtAow,
    labDekking,
    labUitkomst,
    masked,
    labGrenzen,
    whatIfBaseline,
    labKnopBereik,
    scenarioSliderEvents,
    handleScenarioSliderValue,
    scenarioUitgaveNaPensioen,
    uitgaveNaPensioenBasis,
    setScenarioUitgaveNaPensioen,
    scenarioNalatenschap,
    nalatenschapBasis,
    setScenarioNalatenschap,
    effectiveStopAge,
    stopKnopBasis,
    handleStopAgeChange,
    labPromotie,
    doelPreviews,
    readoutData,
    canonicalDailyRate,
    effectiveInput,
    ieBreakdownResult,
    scenarioPresets,
    householdHero,
    partnerHero,
  })

  // De foutstaat-guard staat bewust ONDER het render-grensblok: alle hooks van
  // dit component moeten in elke render in dezelfde volgorde draaien, dus geen
  // enkele `useMemo` mag achter een early return liggen. De memo's hierboven zijn
  // stuk voor stuk null-safe en hebben geen neveneffecten, dus dit verandert
  // niets aan wat de gebruiker ziet.
  if (!fire || !range || !healthScore) {
    return (
      <div className="mx-auto max-w-6xl py-5 sm:py-12 px-4 sm:px-6">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">Er ging iets mis bij het berekenen van je projecties.</p>
        </div>
      </div>
    )
  }

  // Unified perspective hero: household or partner override
  const perspectiveHero = isHouseholdView ? householdHero : isPartnerView ? partnerHero : null
  const hasPerspectiveHero = perspectiveHero != null
  // Het bijbehorende doelbedrag in de gekozen euro-weergave (omzetting in het
  // render-grensblok hierboven; hier alleen de perspectief-keuze).
  const viewPerspectiveHeroFireTarget = isHouseholdView
    ? viewHouseholdHeroFireTarget
    : isPartnerView
      ? viewPartnerHeroFireTarget
      : null

  // ── Onderschrift bij het ENKELVOUDIGE doelbedrag (UR2-17) ─────────────────
  // De dual-tak (showDualFireTarget) noemt zijn grondslag al bij naam ("met je
  // huis" / "zonder je huis"); de single-tak — de standaardstrategie, en dus de
  // meeste gebruikers — zei alleen "benodigd". Daardoor leest hetzelfde
  // kerngetal op /toekomst en op /toekomst/doelen als een tegenspraak van
  // honderdduizenden euro's, terwijl het twee bewuste grondslagen zijn.
  // Consume-only: de kwalificatie komt uit `fireDoel.grondslag` — de uitkomst
  // die het getoonde bedrag zélf koos, niet uit een tweede afleiding op
  // `homeExcludedFromProgress`. Dat is het verzwarende deel van UR3-07 defect 3:
  // bij downsize/opeethypotheek stond het J-bedrag van de eerste paint ónder het
  // bijschrift "benodigd — met je huis" — het label sprak het getal tegen. Nu
  // kán dat niet meer: wisselt de grondslag, dan wisselt het onderschrift mee.
  // Geen kwalificatie waar ze niet klopt of niets betekent: in pensioen-modus is
  // het getal een projectie (geen doel), onder 'nu stoppen' bestaat er geen
  // doelbedrag (ADR 0127 D4) en bij een huishoud-/partnerweergave komt het
  // bedrag uit een andere bron dan deze keuze.
  // Onder een vast anker is dat bedrag `vermogenOpAnker` = de kernel-stand van
  // Prognose!J op de ankermaand, dus altijd de LIQUIDE grondslag — die kwalificatie
  // ontbrak en liet het getal als een (te laag) doelbedrag lezen. De woorden staan
  // náást die grondslag in `anker-copy.ts`, net zoals FIRE_DOEL_ONDERSCHRIFT dat
  // doet voor de solved-tak; de tegel schrijft ze niet zelf uit.
  const fireTargetCaption = isFixedAnchorMode
    ? ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT
    : hasPerspectiveHero
      ? 'benodigd'
      : FIRE_DOEL_ONDERSCHRIFT[fireDoel.grondslag]

  // ── Leesvolgorde van het DUBBELE doelbedrag ────────────────────────────────
  // Het grote getal is een bewering over wat het antwoord IS. De tak hieronder
  // zette daar onvoorwaardelijk het incl.-huis-doel neer — ook bij 'Uitsluiten',
  // waar de grondslag juist het liquide doel is. Op één scherm stond dan
  // "ca. € 1.900.000 met je huis" bóven een balk die "ca. € 530.000 — volledige
  // vrijheid" zei en een kassabon die € 530.000 onderbouwde. De volgorde volgt
  // nu dezelfde ene grondslagkeuze als het bedrag, het onderschrift en de balk;
  // beide doelen blijven staan, alleen de nadruk verhuist. Consume-only: de
  // bedragen zijn de al gedeflateerde weergavewaarden, hier alleen geordend.
  const dualDoelRegels =
    showDualFireTarget && viewFireTargetInclHome != null && viewFireTargetExclHome != null
      ? fireDoelPaarInLeesvolgorde(fireDoel.grondslag, {
          'incl-huis': viewFireTargetInclHome,
          'excl-huis': viewFireTargetExclHome,
        })
      : null

  // ── Reeds-vrij / met-pensioen framing voor de hero-leeftijdsstat ───────────
  // Consume-only (ADR 0009): leest de reeds-berekende vrijheidsvoortgang +
  // leeftijden, herberekent niets. Zodra de gebruiker financieel vrij is toont
  // de "vrijheidsleeftijd"-stat anders het feitelijk huidige (FIRE≈huidige)
  // leeftijd-getal — verwarrend. Dan tonen we i.p.v. een getal "Je bent vrij" /
  // "Je bent met pensioen". Alleen voor de eigen view (niet huishouden/partner).
  const heroFreedomState = {
    freedomPct: effectiveFreedomPct,
    currentAge,
    // Consume-only: exact hetzelfde kernantwoord als de KPI eronder — nooit
    // een eigen precedentieketen (dat was juist de drift-bron van C1).
    fireAge: heroFireAge.age,
    strategy: fireStrategy?.strategy,
    // ADR 0129 D8 — het anker van de run is de sleutel voor de gate (anker bereikt ∧
    // dekking ≥ 100); vóór de run het plan-anker uit de bundel.
    anchor: simResult ? stopAnchorFromKernel(simResult.stopAnker) : (initialData.firePlan?.anchor ?? null),
    aowAge: userAowAge.fractional,
  }
  const heroFreedomFraming = resolveFreedomFraming(heroFreedomState)
  // ADR 0129 — het nu-anker uitgezonderd: bij volledige dekking staat de gate open,
  // maar de zin "Je bent vrij" in de plaats van het getal is dan juist mis. Onder dat
  // anker ís het getal het antwoord (tot welke leeftijd het reikt) — alleen het LABEL
  // verandert. 'anchored' (vast anker, nog niet vrij) toont evenmin de vrij-hero.
  const showFreeHero =
    !hasPerspectiveHero && heroFreedomFraming === 'free' && simResult?.stopAnker?.soort !== 'nu'
  const heroFreeAsPensioen = heroFreedomFraming === 'free' && isAtOrPastAow(heroFreedomState)
  const freeHeroPhrase = heroFreeAsPensioen ? 'Je bent met pensioen' : 'Je bent vrij'
  const freeHeroLabel = heroFreeAsPensioen ? 'Pensioen' : 'Vrijheid'

  // ── KPI-koppen van de leeftijds-tegel (ADR 0127) ───────────────────────
  // Één plek voor de drie varianten, zodat desktop- en mobiele tegel (en hun
  // kassabon) niet uiteen kunnen lopen.
  // ADR 0129 — onder ÉLK vast anker (aow/now/age) is het kopgetal de leeftijd tot waar
  // het liquide vermogen reikt; de drieslag eronder draagt stopmoment en "vrij mogelijk
  // vanaf". Geen "Pensioenleeftijd" meer als kop: de AOW is een stopmoment, geen antwoord.
  const heroAgeLabel = isFixedAnchorMode ? ANKER_KPI_LABEL : 'Vrijheidsleeftijd'
  const heroAgeLabelKort = isFixedAnchorMode ? ANKER_KPI_LABEL_KORT : 'Vrijheidslft'
  const heroAgeCaptionBase = isFixedAnchorMode
    ? (ankerReach != null ? ankerKpiCaption(ankerReach) : 'jaar')
    : 'jaar'

  // ── Gelijke behandeling van ontbrekende brondata op de hele KPI-rij (UR2-05) ─
  // De Doelbedrag-tegel had als enige een gegevensmelding (`showFireTargetNotice`,
  // M6). Op een leeg profiel stond die melding dus naast een "Vrijheidsleeftijd"
  // van 83 en een "Na pensioen" met een exact jaarbedrag — drie tegels, één
  // ontbrekende grondslag, drie verschillende beloftes. Elke tegel toetst nu zijn
  // EIGEN bron met dezelfde guard-familie; de vorm van de melding is één
  // component (`HeroKpiNotice`).
  //
  // Vrijheidsleeftijd volgt bewust het DOELBEDRAG en niet een eigen toets: het
  // moment en het doel zijn twee helften van hetzelfde kernantwoord (zie
  // horizon-client.hero-fire-age.test.ts) — kunnen we het doel niet noemen, dan
  // is het moment ernaartoe evenmin een antwoord. `berekenen` wordt uitgezonderd:
  // zolang de kernel nog rekent is er geen gegevensprobleem maar een lege hand,
  // en dáár heeft de tegel al zijn eigen "···".
  const fireAgeNoticeGuard = guardFreedomMoment({
    ageIsInvalid: isHeroAnswerInvalid(heroFireAge),
    fireTarget: fireTargetGuard,
  })
  //
  // ADR 0129 D4 — een VAST anker is uitgezonderd: de doelbedrag-guard is daar
  // bewust NIET ok ('geen-doelvermogen'). Dat is geen ontbrekend gegeven maar
  // een eigenschap van het plan; het bereik (tot waar het vermogen reikt) is er
  // wél en hoort te blijven staan. Zonder die uitzondering zou de tegel op elke
  // run onder een vast anker de gegevensmelding tonen.
  const showFireAgeNotice =
    !hasPerspectiveHero &&
    !isFixedAnchorMode &&
    heroFireAge.status !== 'berekenen' &&
    !fireAgeNoticeGuard.ok
  // De uitgave ná pensioen toetst zijn eigen grondslag: de methode-uitkomst uit
  // `computeRetirementExpenses` valt stil terug op de profielschatting en dan op
  // 0 — een terugval die op het scherm niet van een meting te onderscheiden was.
  // Net als de doelbedrag-guard alléén in de EIGEN weergave: huishoud-/
  // partnercijfers komen uit de perspectief-loader en hebben hun eigen keten;
  // ze hier half meeguarden zou de rij juist opnieuw uit de pas laten lopen.
  const retirementExpenseGuard = guardRetirementExpense(input?.yearlyMustExpenses ?? null)
  const showRetirementExpenseNotice = !hasPerspectiveHero && !retirementExpenseGuard.ok

  /**
   * De regel onder het bedrag in de KPI-tegel "Na pensioen"; null = niets te melden.
   * F2b (eindreview 19 sep) — onder 'nu stoppen' zet `labAntwoordenPerKnop` het
   * antwoord onder de vierde knop al op `[]` (bestaande ADR 0145-regel); zonder
   * dezelfde uitzondering hier zou de tegelregel wél verschijnen terwijl het antwoord
   * eronder verdwijnt — de twee helften van AC-6 (mede-aanwezigheid) die uit elkaar
   * vallen. Of deze hefboom onder 'nu stoppen' juist wél relevant is, ligt apart bij
   * de eigenaar — dit is alleen de symmetrie-fix.
   */
  const haalbareUitgaveRegel =
    !isNuStoppenMode && haalbareUitgave ? haalbaarBijUitgaveRegel(haalbareUitgave, masked) : null
  /** Donkerrood = minder moeten uitgeven, donkergroen = meer mogen. Semantische tokens. */
  const haalbareUitgaveToon =
    haalbareUitgave?.richting === 'minder' ? 'text-negative' : 'text-positive'
  /**
   * De grondslag voor de vierde draaiknop, ONAFHANKELIJK van of er een opgelost
   * antwoord is (F3, eindreview 19 sep). Onder een `solved`-anker bestaat
   * `haalbareUitgave` niet (geen vast stopmoment om tegen te solven), maar de spec
   * ("Uit scope → plannen zonder vast stopmoment") eist dat de knop dan als
   * VERKENNING bruikbaar blijft — alleen de tegelregel en het antwoord eronder
   * blijven weg. Bij een vast anker is `haalbareUitgave.huidigPerJaar` de precieze
   * grondslag (herleid via de nice-fractie-aware profielrij); zonder anker valt hij
   * terug op dezelfde ruwe grondslag als `retirementExpenseGuard` hierboven.
   */
  // (`uitgaveNaPensioenBasis` staat bij de knop-afleidingen hierboven — één declaratie.)

  const hasNoDob = !effectiveInput?.dateOfBirth
  const fireNotReachable = effectiveCountdown.fireDate === 'Niet haalbaar'
  const hasDebt = (effectiveInput?.totalDebts ?? 0) > 0

  // ── STEP 2: geen paginabrede setup-gate meer ─────────────────────────
  // De grafiek wordt nu altijd getoond. De projectie handelt simResult===null
  // / fireAge===null netjes af (lege/foutmelding in de grafiek-sectie). Alle
  // voorkeuren zijn bereikbaar via de inline-editors (uitgaven-pane,
  // strategie-modal, event-pane) — geapunteerd door de ToekomstOverlay.

  // ── STEP 4: ballon-definities — puur informatieve uitleg bij de grafiek ──
  // De drie fase-bubbels (Opbouw / Financiële vrijheid / Afbouw) komen uit de
  // module-level constante TOEKOMST_OVERLAY_BALLOONS (zie onder), zodat de
  // regressietest ze kan vastpinnen. Geen eigen rekenlogica/bedragen — leke-
  // uitleg in "Geld levert tijd op"-geest; de gewogen layout + emphasis-
  // koppeling zit in ToekomstOverlay.
  const toekomstOverlayBalloons: OverlayBalloonDef[] = TOEKOMST_OVERLAY_BALLOONS

  return (
    <div className="mx-auto max-w-6xl py-5 sm:py-8 px-4 sm:px-6">
      {/* === Editorial header — blueprint Type 1 (Module-landing) === */}
      <header className="relative mb-6 space-y-2">
        <div className="absolute right-4 top-0 flex items-center gap-1.5 sm:right-6">
          <CanvasTipsToggle
            overlayVisible={overlayVisible}
            handleOverlayExit={handleOverlayExit}
            persistOverlayVisible={persistOverlayVisible}
          />
          {/* Geen eigen PageInfoButton: de paginakop (PageOpening "Je tijdas")
              levert 'm al. */}
        </div>
        {/* Kicker met 28×1px Horizon-streep */}
        <div className="flex items-center gap-2.5 pr-20 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] sm:pr-24">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Horizon · jouw vrijheidshorizon
          <PerspectiveContextLabel className="normal-case tracking-normal" />
        </div>
        {/* Geen eigen kop: onder "Je tijdas" (PageOpening) zou dat een tweede
            paginakop geven (dubbele hero, K-02). De kop blijft op
            kicker/sectie-niveau (ADR 0110: de shell draagt de enige h1). */}
      </header>

      {/* === KATERN I — Waar je staat === */}
      <HideInSimple>
        <SectionLabel num="I">Waar je staat</SectionLabel>
      </HideInSimple>

      {/* === 1. Hero + Simulatie (één gecombineerd blok) === */}
      <section data-testid="horizon-hero" className={`card-editorial overflow-hidden ${overlayVisible && chartMode === 'vermogenspad' ? 'no-hover-lift' : ''}`}>
        {/* Module-active accent (Horizon-500 op /horizon/**) */}
        <div className="h-1.5" style={{ background: 'var(--module-active-500)' }} />

        <div className="p-4 sm:p-6 md:p-8">
          <PlanHeroKop
            hasPerspectiveHero={hasPerspectiveHero}
            isPartnerView={isPartnerView}
            perspectiveHero={perspectiveHero}
            simResult={simResult}
            setSimModalOpen={setSimModalOpen}
          />

          <PlanKerngetalMobiel
            setShowFireAgeReceipt={setShowFireAgeReceipt}
            showFreeHero={showFreeHero}
            freeHeroPhrase={freeHeroPhrase}
            hasPerspectiveHero={hasPerspectiveHero}
            heroFireAgePending={heroFireAgePending}
            perspectiveHero={perspectiveHero}
            heroFireAgeTextMobile={heroFireAgeTextMobile}
            isPensioenMode={isPensioenMode}
            heroFireAge={heroFireAge}
            heroAgeLabel={heroAgeLabel}
          />

          <PlanKpiStripDesktop
            isFixedAnchorMode={isFixedAnchorMode}
            hasPerspectiveHero={hasPerspectiveHero}
            setShowFireAgeReceipt={setShowFireAgeReceipt}
            heroFireAge={heroFireAge}
            heroFireAgePending={heroFireAgePending}
            isPartnerView={isPartnerView}
            perspectiveHero={perspectiveHero}
            showFireAgeNotice={showFireAgeNotice}
            showFreeHero={showFreeHero}
            freeHeroLabel={freeHeroLabel}
            heroAgeLabel={heroAgeLabel}
            fireAgeNoticeGuard={fireAgeNoticeGuard}
            freeHeroPhrase={freeHeroPhrase}
            heroFireAgeText={heroFireAgeText}
            heroAgeCaptionBase={heroAgeCaptionBase}
            setShowFireTargetReceipt={setShowFireTargetReceipt}
            showFireTargetNotice={showFireTargetNotice}
            fireTargetGuard={fireTargetGuard}
            isNuStoppenMode={isNuStoppenMode}
            dualDoelRegels={dualDoelRegels}
            viewPerspectiveHeroFireTarget={viewPerspectiveHeroFireTarget}
            viewVermogenOpAnker={viewVermogenOpAnker}
            viewBalkVrijheidDoel={viewBalkVrijheidDoel}
            fireTargetCaption={fireTargetCaption}
            setShowSwrReceipt={setShowSwrReceipt}
            isPensioenMode={isPensioenMode}
            isKernelDepleteRate={isKernelDepleteRate}
            viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
            simResult={simResult}
            fireSwr={fireSwr}
            openRetirementExpensePane={openRetirementExpensePane}
            retirementMethod={retirementMethod}
            showRetirementExpenseNotice={showRetirementExpenseNotice}
            retirementExpenseGuard={retirementExpenseGuard}
            input={input}
            haalbareUitgaveRegel={haalbareUitgaveRegel}
            haalbareUitgaveToon={haalbareUitgaveToon}
          />

          <PlanHeroDuiding
            hasPerspectiveHero={hasPerspectiveHero}
            heroFireAge={heroFireAge}
            currentAge={currentAge}
            solvedRun={solvedRun}
            simResult={simResult}
            isFixedAnchorMode={isFixedAnchorMode}
            perspectiveHero={perspectiveHero}
            heroFreedomFraming={heroFreedomFraming}
            planAnchor={planAnchor}
            ankerReach={ankerReach}
            ankerStop={ankerStop}
            showFireAgeNotice={showFireAgeNotice}
            effectiveFreedomPct={effectiveFreedomPct}
            viewPerspectiveHeroFireTarget={viewPerspectiveHeroFireTarget}
            masked={masked}
            isPartnerView={isPartnerView}
            viewBalkVrijheidDoel={viewBalkVrijheidDoel}
          />

          <PlanKpiStripMobiel
            setShowFireAgeReceipt={setShowFireAgeReceipt}
            showFireAgeNotice={showFireAgeNotice}
            showFreeHero={showFreeHero}
            freeHeroLabel={freeHeroLabel}
            heroAgeLabelKort={heroAgeLabelKort}
            fireAgeNoticeGuard={fireAgeNoticeGuard}
            freeHeroPhrase={freeHeroPhrase}
            hasPerspectiveHero={hasPerspectiveHero}
            perspectiveHero={perspectiveHero}
            heroFireAgeText={heroFireAgeText}
            heroFireAge={heroFireAge}
            setShowFireTargetReceipt={setShowFireTargetReceipt}
            isFixedAnchorMode={isFixedAnchorMode}
            showFireTargetNotice={showFireTargetNotice}
            fireTargetGuard={fireTargetGuard}
            isNuStoppenMode={isNuStoppenMode}
            dualDoelRegels={dualDoelRegels}
            viewPerspectiveHeroFireTarget={viewPerspectiveHeroFireTarget}
            viewVermogenOpAnker={viewVermogenOpAnker}
            viewBalkVrijheidDoel={viewBalkVrijheidDoel}
            fireTargetCaption={fireTargetCaption}
            setShowSwrReceipt={setShowSwrReceipt}
            isPensioenMode={isPensioenMode}
            isKernelDepleteRate={isKernelDepleteRate}
            viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
            simResult={simResult}
            fireSwr={fireSwr}
            openRetirementExpensePane={openRetirementExpensePane}
            showRetirementExpenseNotice={showRetirementExpenseNotice}
            retirementExpenseGuard={retirementExpenseGuard}
            input={input}
            haalbareUitgaveRegel={haalbareUitgaveRegel}
            haalbareUitgaveToon={haalbareUitgaveToon}
          />

          <PlanGegevensmelding
            showFireAgeNotice={showFireAgeNotice}
            showFireTargetNotice={showFireTargetNotice}
            showRetirementExpenseNotice={showRetirementExpenseNotice}
            simError={simError}
          />

          {/* Grafiekgedeelte. De !hasCompletedHorizonSetup-staat wordt
              paginabreed afgevangen door de guard-clause bovenaan de render.
              Zonder simResult rendert dit blok niets (de vroegere
              WidgetEmpty-lege-staat hing aan een constante `loading = true`
              en was onbereikbaar — fase 1 stap 1). */}
          {simResult ? (
            <>
              <div className="my-2 border-b border-dashed border-[var(--border-ed)]" />

              <PlanMeldingen
                simResult={simResult}
                isFixedAnchorMode={isFixedAnchorMode}
                fireStrategy={fireStrategy}
                masked={masked}
                kernelStatus={kernelStatus}
                kernelMaandHint={kernelMaandHint}
                ankerReach={ankerReach}
                ankerStop={ankerStop}
                currentAge={currentAge}
                deficitLoanCopy={deficitLoanCopy}
                deficitDisplay={deficitDisplay}
                deficitLoanNotice={deficitLoanNotice}
                canMinimizeDeficit={canMinimizeDeficit}
                minimizeDeficitNotice={minimizeDeficitNotice}
                router={router}
                setStrategieInitialTab={setStrategieInitialTab}
                setActiveModal={setActiveModal}
                aowDisplay={aowDisplay}
                canMinimizeAow={canMinimizeAow}
                minimizeAowNotice={minimizeAowNotice}
                eindsituatiePlan={eindsituatiePlan}
                eindsituatieDuiding={eindsituatieDuiding}
                eindsituatieDisplay={eindsituatieDisplay}
                canMinimizeEindsituatie={canMinimizeEindsituatie}
                minimizeEindsituatieNotice={minimizeEindsituatieNotice}
                canonicalDailyRate={canonicalDailyRate}
                initialData={initialData}
                kernelRawProfile={kernelRawProfile}
                housingHeldNotice={housingHeldNotice}
                isPensioenMode={isPensioenMode}
              />

              <CanvasPills
                chartMode={chartMode}
                scenariosExpanded={scenariosExpanded}
                setScenariosExpanded={setScenariosExpanded}
                scenarioData={scenarioData}
                mcExpanded={mcExpanded}
                setMcExpanded={setMcExpanded}
                mcMarge={mcMarge}
                mcFailed={mcFailed}
                mcPending={mcPending}
                hasDoelLijn={hasDoelLijn}
                showScenarioLine={showScenarioLine}
                setShowScenarioLine={setShowScenarioLine}
                doelLijnLabel={doelLijnLabel}
                hasScenario={hasScenario}
                scenarioFireDeltaLabel={scenarioFireDeltaLabel}
                scenarioPending={scenarioPending}
                stopPadPending={stopPadPending}
                dualBasisAvailable={dualBasisAvailable}
                effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
                showLiquidLine={showLiquidLine}
                persistLiquidLine={persistLiquidLine}
                showLifeEvents={showLifeEvents}
                persistLifeEvents={persistLifeEvents}
                events={events}
                goalChartMarkers={goalChartMarkers}
                showGoals={showGoals}
                persistGoals={persistGoals}
                showNaturalMilestones={showNaturalMilestones}
                persistNaturalMilestones={persistNaturalMilestones}
                naturalMilestones={naturalMilestones}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                setChartMode={setChartMode}
                simResult={simResult}
                userAowAge={userAowAge}
                currentAge={currentAge}
                monteCarloOverlay={monteCarloOverlay}
                planningMode={planningMode}
                isFixedAnchorMode={isFixedAnchorMode}
              />

              <CanvasUitleg
                scenariosExpanded={scenariosExpanded}
                scenarioData={scenarioData}
                mcExpanded={mcExpanded}
                mcData={mcData}
                mcMarge={mcMarge}
                mcFailed={mcFailed}
                liquidWealthPoints={liquidWealthPoints}
                chartMode={chartMode}
                secondaryLineVisible={secondaryLineVisible}
                effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
                viewReadoutData={viewReadoutData}
                lifelineAge={lifelineAge}
              />

              <CanvasGrafiek
                currentAge={currentAge}
                chartEndAge={chartEndAge}
                projectiePending={projectiePending}
                overlayVisible={overlayVisible}
                chartMode={chartMode}
                overlayPrefRestored={overlayPrefRestored}
                setOverlayEmphasis={setOverlayEmphasis}
                toekomstOverlayBalloons={toekomstOverlayBalloons}
                useHouseholdMainLine={useHouseholdMainLine}
                householdMainLine={householdMainLine}
                usePartnerMainLine={usePartnerMainLine}
                partnerLine={partnerLine}
                simResult={simResult}
                effectiveNetWorth={effectiveNetWorth}
                hasPerspectiveHero={hasPerspectiveHero}
                perspectiveHero={perspectiveHero}
                heroFireAge={heroFireAge}
                masked={masked}
                planAnchor={planAnchor}
                ankerReach={ankerReach}
                ankerStop={ankerStop}
                handleOverlayExit={handleOverlayExit}
                overlayEmphasis={overlayEmphasis}
                lifelineAge={lifelineAge}
                setLifelineAge={setLifelineAge}
                displayMode={displayMode}
                viewHouseholdMainLineRows={viewHouseholdMainLineRows}
                viewPartnerLineRows={viewPartnerLineRows}
                viewDisplaySimRows={viewDisplaySimRows}
                simCashflows={simCashflows}
                viewFireTarget={viewFireTarget}
                showDualFireTarget={showDualFireTarget}
                viewFireTargetInclHome={viewFireTargetInclHome}
                viewTargetEndPortfolio={viewTargetEndPortfolio}
                viewTargetInflationFactors={viewTargetInflationFactors}
                dualBasisAvailable={dualBasisAvailable}
                viewLiquidWealthPoints={viewLiquidWealthPoints}
                effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
                secondaryLineVisible={secondaryLineVisible}
                partnerName={partnerName}
                viewCombinedScenarioOverlays={viewCombinedScenarioOverlays}
                labZone={labZone}
                nalatenschapMarker={nalatenschapMarker}
                scenarioPending={scenarioPending}
                stopPadPending={stopPadPending}
                viewMonteCarloOverlay={viewMonteCarloOverlay}
                canonicalDailyRate={canonicalDailyRate}
                viewHouseholdOverlays={viewHouseholdOverlays}
                userAowAge={userAowAge}
                planningMode={planningMode}
                isFixedAnchorMode={isFixedAnchorMode}
                chartEventOverlay={chartEventOverlay}
                handleChartEventClick={handleChartEventClick}
                handleChartEventDragEnd={handleChartEventDragEnd}
                handleChartEventDragMove={handleChartEventDragMove}
                handleChartClusterOpen={handleChartClusterOpen}
                viewWealthCompositionRows={viewWealthCompositionRows}
                kernelHousingSale={kernelHousingSale}
                homeExcludedFromProgress={homeExcludedFromProgress}
                setSelectedYearAge={setSelectedYearAge}
                incomeExpenseExpanded={incomeExpenseExpanded}
                setIncomeExpenseExpanded={setIncomeExpenseExpanded}
                ieViewMode={ieViewMode}
                setIeViewMode={setIeViewMode}
                viewIeBreakdownResult={viewIeBreakdownResult}
                eventsForTimeline={eventsForTimeline}
                setClusterSheet={setClusterSheet}
                naturalMilestones={naturalMilestones}
                router={router}
                setEventPaneEditingId={setEventPaneEditingId}
                setEventPaneMode={setEventPaneMode}
                setEventPaneOpen={setEventPaneOpen}
                handleEventDragEnd={handleEventDragEnd}
                eventStopAge={eventStopAge}
                isPensioenMode={isPensioenMode}
                setActiveFaseModal={setActiveFaseModal}
              />

              <DoelenLab
                verkenSectieZichtbaar={verkenSectieZichtbaar}
                verkenSectionRef={verkenSectionRef}
                firstDragHintVisible={firstDragHintVisible}
                dismissFirstDragHint={dismissFirstDragHint}
                heroVraag={heroVraag}
                labKnoppen={labKnoppen}
                planEindVorm={planEindVorm}
                labUitkomstRegel={labUitkomstRegel}
                labZone={labZone}
                labGrenzenPending={labGrenzenPending}
                knopWeergave={knopWeergave}
                setKnopWeergave={setKnopWeergave}
                labFormatters={labFormatters}
                planIsDezeStop={planIsDezeStop}
                setStopPlanError={setStopPlanError}
                setStopPlanConfirmOpen={setStopPlanConfirmOpen}
                stopPlanSaving={stopPlanSaving}
                effectiveStopAge={effectiveStopAge}
                setActiveModal={setActiveModal}
                whatIfBaseline={whatIfBaseline}
                categorieReturnGroups={categorieReturnGroups}
                scenarioReturnDeltas={scenarioReturnDeltas}
                setScenarioReturnDeltas={setScenarioReturnDeltas}
                labOpslaanToestand={labOpslaanToestand}
                doelBlok={doelBlok}
                doelSaving={doelSaving}
                doelVastleggenMogelijk={doelVastleggenMogelijk}
                doelBijwerkenMogelijk={doelBijwerkenMogelijk}
                setDoelSheetOpen={setDoelSheetOpen}
                handleDoelHerstellen={handleDoelHerstellen}
                setDoelLoslatenOpen={setDoelLoslatenOpen}
                handleScenarioReset={handleScenarioReset}
              />

              <CanvasLegenda
                scenariosExpanded={scenariosExpanded}
                scenarioData={scenarioData}
                fireParams={fireParams}
                setActiveModal={setActiveModal}
                mcExpanded={mcExpanded}
                mcData={mcData}
                mcMarge={mcMarge}
                liquidWealthPoints={liquidWealthPoints}
                simResult={simResult}
                setSimModalOpen={setSimModalOpen}
                isFixedAnchorMode={isFixedAnchorMode}
                ankerStop={ankerStop}
              />

              {/* De wat-als-slider-lab is verplaatst naar de eigen sectie
                  "Verken je aannames" (katern II) onder de grafiek — zie hieronder. */}
            </>
          ) : null}
        </div>
      </section>

        <DoelenLabSheets
          doelSheetOpen={doelSheetOpen}
          setDoelSheetOpen={setDoelSheetOpen}
          viewDoelPreviews={viewDoelPreviews}
          doelActief={doelActief}
          doelSaving={doelSaving}
          handleDoelVastleggen={handleDoelVastleggen}
          isFixedAnchorMode={isFixedAnchorMode}
          planAnchor={planAnchor}
          labPromotie={labPromotie}
          ankerStop={ankerStop}
          simResult={simResult}
          initialData={initialData}
          doelLoslatenOpen={doelLoslatenOpen}
          handleDoelLoslaten={handleDoelLoslaten}
          setDoelLoslatenOpen={setDoelLoslatenOpen}
          stopPlanConfirmOpen={stopPlanConfirmOpen}
          stopPlanSaving={stopPlanSaving}
          stopPlanError={stopPlanError}
          effectiveStopAge={effectiveStopAge}
          userAowAge={userAowAge}
          handleStopPlanBevestigen={handleStopPlanBevestigen}
          setStopPlanConfirmOpen={setStopPlanConfirmOpen}
        />

      <PlanVerdieping
        coverageNodes={coverageNodes}
        radarAssen={radarAssen}
        scenarioPresets={scenarioPresets}
        scenarioPresetsLoading={scenarioPresetsLoading}
        hasScenario={hasScenario}
        hasStopKeuze={hasStopKeuze}
        usePartnerMainLine={usePartnerMainLine}
        useHouseholdMainLine={useHouseholdMainLine}
        doelActief={doelActief}
        stopPad={stopPad}
        duidingStopAge={duidingStopAge}
        simResult={simResult}
        userAowAge={userAowAge}
        lifelineAge={lifelineAge}
        isFixedAnchorMode={isFixedAnchorMode}
        ankerStop={ankerStop}
        scenarioVerwachtFireAge={scenarioVerwachtFireAge}
        viewScenarioPresets={viewScenarioPresets}
        personalHeroProjection={personalHeroProjection}
        resilienceSnapshots={resilienceSnapshots}
        healthScore={healthScore}
        healthChartOpen={healthChartOpen}
        setHealthChartOpen={setHealthChartOpen}
        fireAgeChartOpen={fireAgeChartOpen}
        setFireAgeChartOpen={setFireAgeChartOpen}
        setShowResilienceReceipt={setShowResilienceReceipt}
        actions={actions}
        handleActionStatusChange={handleActionStatusChange}
        onDuidingInView={markeerDuidingInView}
      />

      <PlanKassabonVrijheidsleeftijd
        showFireAgeReceipt={showFireAgeReceipt}
        setShowFireAgeReceipt={setShowFireAgeReceipt}
        heroAgeLabel={heroAgeLabel}
        showFireAgeNotice={showFireAgeNotice}
        fireAgeNoticeGuard={fireAgeNoticeGuard}
        isFixedAnchorMode={isFixedAnchorMode}
        simResult={simResult}
        ankerReach={ankerReach}
        ankerStop={ankerStop}
        effectiveInput={effectiveInput}
        showLiquidWealthLine={showLiquidWealthLine}
        initialData={initialData}
        fire={fire}
        fireParams={fireParams}
        aowOntbreekt={aowOntbreekt}
        heroFireAge={heroFireAge}
        isPensioenMode={isPensioenMode}
        aowAgeFormatted={aowAgeFormatted}
        viewVermogenOpAnker={viewVermogenOpAnker}
        viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
        fireSwr={fireSwr}
        heroFireAgeReceiptText={heroFireAgeReceiptText}
        range={range}
      />

      <PlanKassabonDoelbedrag
        showFireTargetReceipt={showFireTargetReceipt}
        setShowFireTargetReceipt={setShowFireTargetReceipt}
        isFixedAnchorMode={isFixedAnchorMode}
        showFireTargetNotice={showFireTargetNotice}
        fireTargetGuard={fireTargetGuard}
        simResult={simResult}
        fireSwr={fireSwr}
        effectiveInput={effectiveInput}
        isPensioenMode={isPensioenMode}
        aowAgeFormatted={aowAgeFormatted}
        fireParams={fireParams}
        viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
        viewVermogenOpAnker={viewVermogenOpAnker}
        viewEffectiveFireTarget={viewEffectiveFireTarget}
        fireStrategy={fireStrategy}
        masked={masked}
      />

      <PlanKassabonOpnamerate
        showSwrReceipt={showSwrReceipt}
        setShowSwrReceipt={setShowSwrReceipt}
        simResult={simResult}
        effectiveInput={effectiveInput}
        fireSwr={fireSwr}
        simCashflows={simCashflows}
        userAowAge={userAowAge}
        effectiveFireTarget={effectiveFireTarget}
      />

      <PlanKassabonGezondheid
        showResilienceReceipt={showResilienceReceipt}
        setShowResilienceReceipt={setShowResilienceReceipt}
        healthScore={healthScore}
        setActiveModal={setActiveModal}
      />

      <ToekomstOverlays
        simResult={simResult}
        simModalOpen={simModalOpen}
        setSimModalOpen={setSimModalOpen}
        simCashflows={simCashflows}
        currentAge={currentAge}
        effectiveInput={effectiveInput}
        fireParams={fireParams}
        canonicalDailyRate={canonicalDailyRate}
        unifiedRows={unifiedRows}
        activeFaseModal={activeFaseModal}
        setActiveFaseModal={setActiveFaseModal}
        fire={fire}
        initialData={initialData}
        debts={debts}
        displayEvents={displayEvents}
        healthScoreInput={healthScoreInput}
        kernelRawProfile={kernelRawProfile}
        overgangData={overgangData}
        fireStrategy={fireStrategy}
        onttrekkingData={onttrekkingData}
        erfgenamen={erfgenamen}
        partnerAowBedrag={partnerAowBedrag}
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        effectiveFireTarget={effectiveFireTarget}
        isHouseholdView={isHouseholdView}
        householdInput={householdInput}
        fireSwr={fireSwr}
        setStrategieInitialTab={setStrategieInitialTab}
        loadData={loadData}
        router={router}
        strategieInitialTab={strategieInitialTab}
        aowRows={aowRows}
        uitgavenPaneOpen={uitgavenPaneOpen}
        setUitgavenPaneOpen={setUitgavenPaneOpen}
        householdRetireInfo={householdRetireInfo}
        householdRetireOpen={householdRetireOpen}
        setHouseholdRetireOpen={setHouseholdRetireOpen}
        refreshData={refreshData}
        input={input}
        withdrawalStrategyConfig={withdrawalStrategyConfig}
        eventPaneOpen={eventPaneOpen}
        setEventPaneOpen={setEventPaneOpen}
        eventPaneEditingId={eventPaneEditingId}
        eventPaneMode={eventPaneMode}
        eventPanePreviewBaseline={eventPanePreviewBaseline}
        selectedNaturalMilestone={selectedNaturalMilestone}
        setSelectedNaturalMilestone={setSelectedNaturalMilestone}
        clusterSheet={clusterSheet}
        setClusterSheet={setClusterSheet}
        eventStopAge={eventStopAge}
        naturalMilestones={naturalMilestones}
        setEventPaneEditingId={setEventPaneEditingId}
        setEventPaneMode={setEventPaneMode}
        selectedYearAge={selectedYearAge}
        setSelectedYearAge={setSelectedYearAge}
        displayUnifiedRows={displayUnifiedRows}
        displaySimRows={displaySimRows}
        events={events}
        userAowAge={userAowAge}
        effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
        eigenHuisMortgageIds={eigenHuisMortgageIds}
      />
    </div>
  )
}

