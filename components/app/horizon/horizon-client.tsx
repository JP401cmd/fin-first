'use client'

import { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { HORIZON_EXIT_NOTICE_DISMISSED_SLUG } from '@/lib/horizon-data-loader'
import { useHorizonFireSim } from '@/lib/hooks/use-horizon-fire-sim'
import { useHorizonBron } from '@/lib/hooks/use-horizon-bron'
import { type SimResult } from '@/lib/fire-simulation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/app/toast-provider'

import { calculateFreedomTime, formatFreedomTimeString, formatCurrency, formatMaskedCurrency, formatWithFreedom, dailyExpenseRate } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  computeFireProjection, computeFireRange,
  ageAtDate, deriveCountdown,
  type FinancialInput, type FireProjection, type FireRange,
  type LifeEvent,
} from '@/lib/horizon-data'
import { MARKTCHECK_DEBOUNCE_MS, type MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import {
  margeAnkerKort,
  margeKort,
  margeLegenda,
  margeZin,
} from '@/lib/horizon/marktcheck-copy'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import { computeEffectiveExpenses, computeFireTarget, computeFreedomProgressWithBasis, inclHomeTargetFromScalar } from '@/lib/core-metrics'
import { computeEmergencyFundMonths } from '@/lib/health-score-input'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { formatAowAgeKort } from '@/lib/aow-leeftijd'
import { isKernelReachedNowDisplay } from '@/lib/horizon-kernel/bridge'
import { type ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import type { ActionStatus } from '@/lib/recommendation-data'
import { deriveNaturalMilestones, naturalMilestoneToLifeEvent, type NaturalMilestone } from '@/lib/natural-milestones'
import {
  chartEventOverlayToClusterRow,
  lifeEventSide,
  naturalMilestoneSide,
  type ChartEventKind,
  type ChartEventOverlay,
} from '@/lib/chart-event-overlay'
import {
  buildGoalChartMarkers,
  isGoalMarkerId,
  type GoalMarkerInput,
} from '@/lib/horizon/goal-chart-markers'
import { NaturalMilestoneSheet } from '@/components/app/horizon/natural-milestone-sheet'
import { ActionCard } from '@/components/app/action-card'
import dynamic from 'next/dynamic'
import {
  TrendingUp,
  AlertTriangle, Calendar, BarChart3, FlaskConical, Landmark,
  Zap, Target, Sparkles,
  GitBranch,
  ChevronDown, ChevronUp,
  Home, Lightbulb,
  Play,
  Pause,
  Minus,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import {
  getFireEligibleNetWorth,
  isHomeExcludedFromFire,
} from '@/lib/housing-strategy'
import {
  shouldShowLiquidWealthLine,
  buildLiquidWealthPoints,
  primaryChartBasis,
} from '@/lib/horizon/liquid-wealth-line'
import { applyHousingToComposition } from '@/lib/horizon/wealth-composition-housing'
import { detectDeficitLoanFromRows } from '@/lib/horizon/deficit-loan-display'
import { detectReverseMortgageStartAge } from '@/lib/horizon/reverse-mortgage-start'
import { buildDeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'
import { nettoLiquideAtAge } from '@/lib/horizon/vrijheidsdagen'
import { useDeficitNotice } from '@/components/app/horizon/deficit-notice-provider'
import { useAowNotice } from '@/components/app/horizon/aow-notice-provider'
import { AOW_ONTBREEKT_COPY } from '@/lib/horizon/aow-notice-minimize'
import { useEindsituatieNotice } from '@/components/app/horizon/eindsituatie-notice-provider'
import { EindsituatieNotice } from '@/components/app/horizon/eindsituatie-notice'
import { detectEindsituatie } from '@/lib/horizon/eindsituatie-duiding'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { HorizonTrendGrid } from '@/components/app/horizon/horizon-trend-grid'
import { LifelineReadout } from '@/components/app/horizon/lifeline-readout'
import { LevensinkomenStrook } from '@/components/app/horizon/levensinkomen-strook'
import { buildCoverageStrip } from '@/lib/horizon/coverage-strip'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import {
  buildHouseholdProjectionInput,
  type HouseholdProjectionResult,
} from '@/lib/household-projection'
import { HouseholdRetirementPane } from '@/components/app/horizon/household-retirement-pane'
import { usePerspective } from '@/components/app/perspective-provider'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { MaskedAmount } from '@/components/app/masked-amount'
import { GlossaryTerm, SectionLabel, Kicker } from '@/components/editorial'
import { formatAge } from '@/lib/horizon/fire-format'
import {
  zoneVanHuidig,
  zoneVanWaarde,
  HEFBOOM_RICHTING,
  type HefboomBereik,
  type HefboomKey,
  type LabGrenzenResultaat,
} from '@/lib/horizon/lab-grenzen-types'
// ADR 0170 — het doelscenario is vijf knoppen met een driekleurige schaal. `Vrijheidsas`
// (marge-band) en `Dekkingsbalk` (drie tegels) vervielen daarmee.
import {
  LabKnoppen,
  type LabKnopConfig,
  type LabKnopFormatters,
  type LabKnopWeergave,
  type LabUitkomstRegel,
} from '@/components/app/horizon/lab-knoppen'
import { LabIndicatieRegel, LabOpslaanBalk, type LabOpslaanToestand } from '@/components/app/horizon/lab-opslaan-balk'
import { ScenarioChip, VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'
import { Dekkingsradar } from '@/components/app/horizon/dekkingsradar'
import { ScenarioKaarten } from '@/components/app/horizon/scenario-kaarten'
import { computeDekkingsradar, type RadarAs } from '@/lib/horizon/dekkingsradar'
import { type ScenarioPresetResult } from '@/lib/horizon/scenario-presets'
import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'
import { selectDoelLijnBron } from '@/lib/horizon/doel-lijn-bron'
import {
  resolveHeroFireAge,
  formatHeroFireAge,
  isHeroAnswerPending,
  isHeroAnswerInvalid,
  heroFireAgeYear,
} from '@/lib/horizon/hero-fire-age'
import {
  resolveFireDoelWeergave,
  fireDoelPaarInLeesvolgorde,
  FIRE_DOEL_ONDERSCHRIFT,
} from '@/lib/horizon/fire-doel-weergave'
import {
  ANKER_KPI_LABEL,
  ANKER_KPI_LABEL_KORT,
  ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT,
  ankerKpiCaption,
  ankerReachFromSim,
  ankerStopFromSim,
  ankerTitel,
  ankerVraag,
  ankerZin,
  ankerZinKort,
  ankerReachYear,
  ankerKort,
  dekkingBadge,
  dekkingDeltaBadge,
  dekkingPreviewWaarde,
  dekkingSheetToelichting,
  dekkingVastgelegdToast,
  eindvermogenOpTegel,
  LAB_COPY,
  EINDVERMOGEN_DELTA_DREMPEL,
  eindvermogenDeltaBadge,
  eindvermogenOpgeslagenNoot,
  eindvermogenPreviewWaarde,
  eindvermogenSheetToelichting,
  eindvermogenVastgelegdToast,
  formatStopAge,
  haalbaarBijUitgaveRegel,
  radarSubtitel,
  type AnkerReach,
  type AnkerStop,
} from '@/lib/horizon/anker-copy'
import { describeEventDuration, eventStopAgeFromSim } from '@/lib/horizon/event-duration-copy'
import type { HaalbareUitgave } from '@/lib/horizon/haalbare-uitgave'
import {
  dekkingVanRun,
  resolveLabUitkomst,
  type LabEindvermogen,
  type LabUitkomst,
} from '@/lib/horizon/lab-uitkomst'
import { GOAL_TYPE_LABELS } from '@/lib/goal-data'
import {
  guardFireTarget,
  guardFreedomMoment,
  guardRetirementExpense,
  HORIZON_MISSENDE_GEGEVENS_LABEL,
} from '@/lib/horizon/outcome-guard'
import {
  scenarioMonthlySpendDelta,
  buildCategorieReturnGroups,
  isDoelConceptGewijzigd,
  stripStopKeuze,
  type DoelParameter,
  type ToekomstScenarioDoel, KNOP_WEERGAVE_STANDAARD } from '@/lib/horizon/toekomst-scenario'
import { doelGewogenRendement } from '@/lib/horizon/toekomst-doel'
import { doelStandNaarLab } from '@/lib/horizon/doel-stand'
import {
  DoelVastlegSheet,
  buildLiveStand,
  buildScenarioPersistPayload,
  type DoelParameterPreview,
} from '@/components/app/horizon/doel-vastleg-sheet'
import { WhatIfMarketAssumptions } from '@/components/app/horizon/whatif-market-assumptions'
import { DoelLoslatenConfirm } from '@/components/future/doel-loslaten-confirm'
import { StopPlanConfirm } from '@/components/app/horizon/stop-plan-confirm'
import { planDraftFromSettings, planDraftToFireSettingsBody, validatePlanDraft } from '@/lib/horizon/plan-draft'
import {
  applySliderEvent,
  buildSliderEvent,
  computeSliderUiRange,
  readSliderValueFromEvents,
  savingsEuroForPp,
  stopKnopBereik,
  uitgaveNaPensioenRange,
  UITGAVE_NA_PENSIOEN_STAP,
  type SliderKey,
} from '@/lib/scenario-events'
import { resolveScenarioContext, type HorizonScenarioOverrides } from '@/lib/hooks/use-horizon-fire-sim'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { runLabGrenzenAsync, runMarktcheckAsync, runScenarioPresetsAsync } from '@/lib/horizon-kernel/worker/run-in-worker'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

const ScenariosModal = dynamic(() =>
  import('@/components/app/horizon/scenarios-modal').then(m => ({ default: m.ScenariosModal })),
  { ssr: false }
)
const SimulationsModal = dynamic(() =>
  import('@/components/app/horizon/simulations-modal').then(m => ({ default: m.SimulationsModal })),
  { ssr: false }
)
const WithdrawalModal = dynamic(() =>
  import('@/components/app/horizon/withdrawal-modal').then(m => ({ default: m.WithdrawalModal })),
  { ssr: false }
)
const BacktestingModal = dynamic(() =>
  import('@/components/app/horizon/backtesting-modal').then(m => ({ default: m.BacktestingModal })),
  { ssr: false }
)
const StrategieModal = dynamic(() =>
  import('@/components/app/horizon/strategie-modal').then(m => ({ default: m.StrategieModal })),
  { ssr: false }
)
const UitgavenPane = dynamic(() =>
  import('@/components/app/horizon/uitgaven-pane').then(m => ({ default: m.UitgavenPane })),
  { ssr: false }
)
const EventPane = dynamic(() =>
  import('@/components/app/horizon/event-pane').then(m => ({ default: m.EventPane })),
  { ssr: false }
)
const PhaseModalOpbouw = dynamic(() =>
  import('@/components/app/horizon/phase-modal-opbouw').then(m => ({ default: m.PhaseModalOpbouw })),
  { ssr: false }
)
const PhaseModalOvergang = dynamic(() =>
  import('@/components/app/horizon/phase-modal-overgang').then(m => ({ default: m.PhaseModalOvergang })),
  { ssr: false }
)
const PhaseModalOnttrekking = dynamic(() =>
  import('@/components/app/horizon/phase-modal-onttrekking').then(m => ({ default: m.PhaseModalOnttrekking })),
  { ssr: false }
)
const SimChartModal = dynamic(() =>
  import('@/components/app/horizon/sim-chart-widget').then(m => ({ default: m.SimChartModal })),
  { ssr: false }
)
// Zwaar-maar-conditionele sub-componenten uit de first-load JS van /toekomst
// gehaald (bundle ronde 2). Mount-condities blijven ONGEWIJZIGD zodat gedrag +
// animaties identiek blijven — dynamic({ssr:false}) haalt de code enkel uit de
// synchrone first-load-bundle en laadt de chunk na hydratatie. Bewust géén
// mount-gate: de year-details-sheet (BottomSheet) heeft een intern open→exit-
// animatie-statemachine die alleen speelt als het gemount blijft, en
// HouseholdFireSection rendert vaak null (solo-gebruiker) + beheert z'n eigen
// laadstaat, dus een skeleton-fallback zou flitsen. `loading` = null (default).
const HorizonYearDetailsSheet = dynamic(() =>
  import('@/components/app/horizon/horizon-year-details-sheet').then(m => ({ default: m.HorizonYearDetailsSheet })),
  { ssr: false }
)
const HouseholdFireSection = dynamic(() =>
  import('@/components/app/household-fire-section').then(m => ({ default: m.HouseholdFireSection })),
  { ssr: false }
)
const IncomeExpenseChart = dynamic(() =>
  import('@/components/app/horizon/income-expense-chart').then(m => ({ default: m.IncomeExpenseChart })),
  { ssr: false }
)
// HealthScoreReceipt (1011 r) uit het first-load-chunk van /toekomst (perf Task
// 3.2) — hij zit alleen in een BottomSheet die pas opent na een klik op de
// gezondheidsscore-kaart. `loading: null` (default) omdat een skeleton hier
// zou flitsen — zelfde afweging als de andere dynamics hierboven.
const HealthScoreReceipt = dynamic(() =>
  import('@/components/app/horizon/health-score-receipt').then(m => ({ default: m.HealthScoreReceipt })),
  { ssr: false }
)
import { SimChart, buildScenarioVariants, SCENARIO_VARIANTS, type ScenarioOverlay, type MonteCarloOverlay, type HouseholdPartnerOverlay } from '@/components/app/horizon/sim-chart'
import { ZoomableChartContainer } from '@/components/app/horizon/zoomable-chart-container'
import { ProjectieLaadlaag } from '@/components/app/horizon/projectie-laadlaag'
import { EventsTimeline } from '@/components/app/horizon/events-timeline'
import { EventClusterSheet } from '@/components/app/horizon/event-cluster-sheet'
import { PhaseBar } from '@/components/app/horizon/phase-bar'
import { faseAtAge } from '@/lib/horizon/phase-bar-segments'
import { CHART_PAD } from '@/lib/chart-constants'
import { buildBreakdown } from '@/lib/income-expense-breakdown'
import { WealthCompositionChart } from '@/components/app/horizon/wealth-composition-chart'
import { unifiedRowsToStackedRows, type StackedRow } from '@/lib/wealth-composition'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import { simRowsToChartPoints } from '@/lib/horizon/sim-chart-geometry'
import {
  buildFactorByAge,
  buildFactorByOffset,
  deflate,
  deflatePoints,
  deflateRowsByAge,
  deflateSeriesByOffset,
  factorAtAge,
} from '@/lib/euro-display'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { PillRow } from '@/components/app/pill-row'
import { DEFAULT_FIRE_STRATEGY, type StopAnchor, STRATEGY_LABELS, resolveFreedomFraming, fireAgeForDisplay, isAtOrPastAow, isFixedAnchor, stopAnchorFromKernel, resolveFirePlanWithOverride } from '@/lib/fire-strategy'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import { buildDeeplinkCleanupUrl } from '@/lib/horizon/deeplink-cleanup'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import { buildBaselineOverrides } from '@/lib/whatif-overrides'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import { ChartOverlayExplainer } from '@/components/app/horizon/chart-overlay-explainer'
import { ChartTips } from '@/components/editorial/chart-tips'
import {
  getFireProjectionTips,
  getWealthCompositionTips,
  getIncomeExpenseTips,
} from '@/lib/chart-tips'
import { ToekomstOverlay, type OverlayBalloonDef, type ToekomstOverlayGeometry } from '@/components/app/horizon/toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from '@/components/app/horizon/toekomst-overlay-balloons'
import type {
  ActiveModal,
  ChartMode,
  ClusterSheet,
  EventPaneMode,
  HouseholdHeroData,
  HouseholdMainLine,
  HouseholdRetireInfo,
  IeViewMode,
  ActiveFaseModal,
  OverlayEmphasis,
  PartnerLine,
  StrategieInitialTab,
} from '@/components/toekomst/state/types'
import { SIM_ROW_MONEY_FIELDS, STACKED_ROW_MONEY_FIELDS, factorMapByPosition } from '@/components/toekomst/state/euro-view-feeds'
import {
  COLOR_LIFE_INCOME, COLOR_LIFE_EXPENSE, COLOR_NAT_ASSET, COLOR_NAT_DEBT, COLOR_NAT_SIM,
  COLOR_NAT_DANGER, COLOR_PARTNER_EVENT, COLOR_GOAL, COLOR_GOAL_OVERDUE,
} from '@/components/toekomst/canvas/marker-kleuren'
import { PlanHeroKop } from '@/components/toekomst/plan/plan-hero-kop'
import { PlanKerngetalMobiel, PlanKpiStripDesktop, PlanKpiStripMobiel } from '@/components/toekomst/plan/plan-kpi-strip'
import { PlanHeroDuiding } from '@/components/toekomst/plan/plan-hero-duiding'
import { PlanGegevensmelding } from '@/components/toekomst/plan/plan-gegevensmelding'
import { useInViewOnce } from '@/components/toekomst/plan/use-in-view-once'

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
  const { masked } = useMaskedAmounts()
  const { addToast } = useToast()
  const { perspective, partnerName, perspectiveVersion, refreshData } = usePerspective()
  const isHouseholdView = perspective === 'household'
  const isPartnerView = perspective === 'partner'
  const [householdHero, setHouseholdHero] = useState<HouseholdHeroData | null>(null)
  const [partnerHero, setPartnerHero] = useState<HouseholdHeroData | null>(null)
  const [householdInput, setHouseholdInput] = useState<FinancialInput | null>(null)
  const [householdOverlays, setHouseholdOverlays] = useState<HouseholdPartnerOverlay[] | null>(null)
  // Gezamenlijke lijn als HOOFDLIJN in huishoudweergave (matcht de hero-FIRE),
  // zodat de prominente lijn + marker het huishouden tonen i.p.v. de eigen lijn.
  const [householdMainLine, setHouseholdMainLine] = useState<HouseholdMainLine | null>(null)
  // Partner-projectie-pad (voor het wisselen van de hoofdlijn in partner-view).
  // `rows` is leeg wanneer de partner alleen 'totals' deelt of z'n toekomst
  // verbergt — dan tonen we geen partner-lijn (graceful degrade).
  const [partnerLine, setPartnerLine] = useState<PartnerLine | null>(null)
  // Levensgebeurtenissen van de PARTNER (read-only markers op de grafiek in
  // huishouden- + partner-view). Alleen naam + leeftijd + icoon — nooit
  // bewerkbaar (geen sourceId), nooit de partner's natuurlijke mijlpalen.
  const [partnerLifeEvents, setPartnerLifeEvents] = useState<
    Array<{
      id: string
      name: string
      /** Leeftijd op de as van de PARTNER (zoals opgeslagen). */
      targetAge: number | null
      /** Dezelfde gebeurtenis op de as van de KIJKER (DOB-verschoven; TPR-07 fase 2a). */
      targetAgeOnOwnAxis: number | null
      icon?: string
    }>
  >([])
  // Props-als-bron (ADR 0179 fase 1 stap 3): de projectie-invoer volgt `initialData`.
  // Een mutatie ververst de server-bundel met `router.refresh()` (zie `loadData`);
  // de hook neemt de nieuwe props referentie-stabiel over. `events` blijft lokale
  // state voor de optimistische drag en resynct op elke nieuwe server-lijst.
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
    avgIncome6m,
    avgExpenses6m,
    retirementMethod,
    events,
    setEvents,
  } = useHorizonBron(initialData)
  const fireSwr = fireParams.effectiveSwr
  /**
   * Canoniek dagtarief (€/dag) voor ÉLKE €→vrijheidstijd-vertaling op deze
   * pagina — geconsumeerd uit de bundel (`HorizonPageData.dailyExpenseRate`,
   * 12-mnd rolling via lib/expense-rate.ts), NOOIT zelf gerekend.
   *
   * Was op elk van deze call-sites `dailyExpenseRate(effectiveInput?.monthlyExpenses)`.
   * `effectiveInput.monthlyExpenses` is FIRE-PROJECTIE-INVOER op de EFFECTIVE
   * grondslag (losse huidige kalendermaand, of de profielschatting bij
   * `income_source='manual'`) — en in what-if bovendien scenario-aangepast. Als
   * weergave-dagtarief gaf dat hetzelfde bedrag hier een ander aantal "jaren
   * vrijheid" dan de widgets, de balans en de belasting-hub (vervolg KRUIS-20),
   * en liet het de vrijheidstijd meebewegen met een scenario dat de werkelijke
   * levenskosten van vandaag niet verandert.
   *
   * 0 = geen eerlijke dagbasis → de oppervlakken hieronder tonen dan geen
   * tijdregel (ze guarden allemaal al op `> 0`).
   */
  const canonicalDailyRate = initialData.dailyExpenseRate
  // Strategy-aware fallback: thread fireStrategy into computeFireProjection/computeFireRange
  // so fire.fireTarget matches the user's chosen end strategy (deplete/legacy/perpetual)
  const initStrategyOpts = initialData?.fireStrategy
    ? { strategy: initialData.fireStrategy.strategy, endAge: initialData.fireStrategy.endAge }
    : undefined
  const [fire, setFire] = useState<FireProjection | null>(() =>
    computeFireProjection(initialData.effectiveInput, initialData.fireParams.grossReturn, initialData.fireParams.effectiveSwr, undefined, initStrategyOpts)
  )
  const [range, setRange] = useState<FireRange | null>(() =>
    computeFireRange(initialData.effectiveInput, initialData.fireParams.effectiveSwr, undefined, initialData.fireParams.grossReturn, initStrategyOpts)
  )
  const [healthScore, setHealthScore] = useState<HealthScore | null>(() => initialData.healthScore)
  const [healthScoreInput, setHealthScoreInput] = useState<HealthScoreInput>(initialData.healthScoreInput)
  const [budgetingActive] = useState(initialData.budgetingActive)

  const [healthChartOpen, setHealthChartOpen] = useState(false)
  const [fireAgeChartOpen, setFireAgeChartOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  // Voorkeurs-tab bij het openen van de StrategieModal (bv. direct naar 'woning'
  // vanuit de "huis wordt nooit verkocht"-melding). Reset naar null bij sluiten.
  const [strategieInitialTab, setStrategieInitialTab] = useState<StrategieInitialTab>(null)
  const [simModalOpen, setSimModalOpen] = useState(false)
  const [activeFaseModal, setActiveFaseModal] = useState<ActiveFaseModal>(null)

  // ADR 0129 D7 — de tweede kernel-run onder een vast anker ("vrij mogelijk vanaf"),
  // uitgepakt uit dezelfde worker-batch als de scenariokaarten. `null` = nog niet
  // gedraaid of `solved` (dan ís de hoofdrun de opgeloste run).
  const [solvedRun, setSolvedRun] = useState<{ fireAge: number | null; endAge: number | null } | null>(null)
  /** De gesolvede uitgave na pensioen uit de scenario-batch (spec 2026-09-18). */
  const [haalbareUitgave, setHaalbareUitgave] = useState<HaalbareUitgave | null>(null)
  /**
   * Knop "Uitgave na pensioen" (€/jaar); `null` = wat het plan rekent, geen override.
   * Sinds ADR 0170 reist deze knop méé in de scenario-pref (`uitgaveNaPensioen`), zodat een
   * herlaad de verkenning terugbrengt — net als de slider-events en de rendement-delta's.
   */
  const [scenarioUitgaveNaPensioen, setScenarioUitgaveNaPensioen] = useState<number | null>(
    () => initialData.toekomstScenarioPrefs?.uitgaveNaPensioen ?? null,
  )

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
  // Scenario's-naast-elkaar (5 preset-kaarten) — deferred doorgerekend op de BASIS-grondslag.
  const [scenarioPresets, setScenarioPresets] = useState<ScenarioPresetResult[] | null>(null)
  const [scenarioPresetsLoading, setScenarioPresetsLoading] = useState(false)
  const [incomeExpenseExpanded, setIncomeExpenseExpanded] = useState(false)
  const [ieViewMode, setIeViewMode] = useState<IeViewMode>('lines')
  const [chartMode, setChartMode] = useState<ChartMode>('vermogenspad')

  // Weergavemodus (eenvoudig/volledig) — de zwevende chart-tooltip verdwijnt in de
  // volledige weergave omdat de meebewegende cijferbar (LifelineReadout) die vervangt.
  const { mode: displayMode } = useDisplayMode()

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

  // Kassabon modal state
  const [uitgavenPaneOpen, setUitgavenPaneOpen] = useState(false)
  // Huishoud-aanpasflow (uitgave na pensioen) — geopend vanaf de "Na pensioen"-KPI
  // in huishoudweergave. candidates/method komen uit de combined-projectie.
  const [householdRetireOpen, setHouseholdRetireOpen] = useState(false)
  const [householdRetireInfo, setHouseholdRetireInfo] = useState<HouseholdRetireInfo>(null)
  // Klik op de "Na pensioen"-KPI (desktop + mobiel delen deze ene handler).
  // De huishoud-variant bestaat alleen als `householdRetireInfo` gevuld is — dat
  // gebeurt uitsluitend wanneer buildHouseholdProjectionInput() hasHousehold=true
  // teruggeeft (>= 2 geaccepteerde leden). De perspectief-switcher biedt
  // 'Huishouden' al eerder aan (app/api/perspective/route.ts: profielveld
  // 'samen'/'gezin' óf >= 1 lid), dus `isHouseholdView` alleen is geen bewijs
  // dat de pane kán renderen: bij die kloof opende de klik voorheen niets
  // (WF-REKEN-23-bug4). Zonder huishoud-info valt de klik terug op het eigen
  // uitgavenpaneel, dat altijd gerenderd wordt.
  const openRetirementExpensePane = useCallback(() => {
    if (isHouseholdView && householdRetireInfo) setHouseholdRetireOpen(true)
    else setUitgavenPaneOpen(true)
  }, [isHouseholdView, householdRetireInfo])
  const [eventPaneOpen, setEventPaneOpen] = useState(false)
  const [eventPaneEditingId, setEventPaneEditingId] = useState<string | null>(null)
  const [eventPaneMode, setEventPaneMode] = useState<EventPaneMode>('catalog')
  const [clusterSheet, setClusterSheet] = useState<ClusterSheet>(null)
  const [showFireAgeReceipt, setShowFireAgeReceipt] = useState(false)
  const [showFireTargetReceipt, setShowFireTargetReceipt] = useState(false)
  const [showResilienceReceipt, setShowResilienceReceipt] = useState(false)
  const [showSwrReceipt, setShowSwrReceipt] = useState(false)
  // Mobile KPI's tonen nu volledig 2x2 — `horizonHeroExpanded` toggle is verwijderd.

  // ── Inline what-if sliders state (feature #795) ──────────────
  const [whatIfInlineOpen, setWhatIfInlineOpen] = useState(false)

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
  const verkenSectionRef = useRef<HTMLElement | null>(null)

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
  // Zichtbaarheids-gate voor de zware duiding-secties (scenario-presets): die rekenen pas via
  // de worker wanneer de "Wat het betekent"-sectie (bijna) in beeld komt (Task 4.2), i.p.v.
  // eager in idle. De sectie klapte tot ADR 0170 mee met het in-/uitklappen van KATERN II;
  // dat inklappen bestaat niet meer (het doelscenario staat altijd open in de grafiekkaart),
  // dus is er ook geen remountKey meer nodig.
  const duidingSectionRef = useRef<HTMLElement | null>(null)
  const duidingInView = useInViewOnce(duidingSectionRef)

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

  // Deep-link: open modal via ?modal= URL param (from dashboard widgets)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // B-057 — het venster dat de kernel-hook zelf niet ziet: `router.refresh()` (ook via
  // `loadData`) rendert de server-context opnieuw. Samen met `mainPending` uit de hook
  // vormt het `projectiePending` → de Fin-laadlaag op de grafiek + gedempte hoofdlijn.
  const [refreshPending, startRefresh] = useTransition()
  useEffect(() => {
    const modal = searchParams.get('modal')
    const strategieParam = searchParams.get('strategie')
    let shouldReplace = false

    if (modal) {
      if (modal === 'scenarios' || modal === 'simulations' || modal === 'withdrawal' || modal === 'backtesting' || modal === 'strategie') {
        setActiveModal(modal)
      } else if (modal === 'life_events') {
        // Het legacy-gebeurtenisformulier is weg (ADR 0179 fase 1 stap 2): deze
        // oude deeplink opent voortaan de EventPane-catalogus, net als `?event=new`.
        setEventPaneEditingId(null)
        setEventPaneMode('catalog')
        setEventPaneOpen(true)
      }
      shouldReplace = true
    }

    // Support ?strategie=open query param (redirect from /horizon/strategie)
    if (strategieParam === 'open') {
      setActiveModal('strategie')
      shouldReplace = true
    }

    // Support ?uitgaven=open query param (redirect from /horizon/uitgaven-na-pensioen)
    const uitgavenParam = searchParams.get('uitgaven')
    if (uitgavenParam === 'open') {
      setUitgavenPaneOpen(true)
      shouldReplace = true
    }

    // Support ?event=new | ?event=<id> | ?event=<id>&edit=true
    const eventParam = searchParams.get('event')
    const eventEditParam = searchParams.get('edit')
    if (eventParam) {
      if (eventParam === 'new') {
        setEventPaneEditingId(null)
        setEventPaneMode('catalog')
        setEventPaneOpen(true)
      } else {
        setEventPaneEditingId(eventParam)
        setEventPaneMode(eventEditParam === 'true' ? 'edit' : 'view')
        setEventPaneOpen(true)
      }
      shouldReplace = true
    }

    // Feature #795+#800: ?whatif=open — opens inline what-if sliders (was: dream gate).
    const whatifParam = searchParams.get('whatif')
    if (whatifParam === 'open') {
      setWhatIfInlineOpen(true)
      shouldReplace = true
    }

    // Opschonen mag NOOIT van route wisselen. Dit stond hier als een
    // hardgecodeerd `router.replace('/horizon')`, en `/horizon` redirect op de
    // routing-laag naar `/toekomst` (next.config.ts). Elke deeplink maakte
    // zichzelf daarmee ongedaan: state gezet → router wisselt van route → boom
    // remount → `whatIfInlineOpen` c.s. weer op de beginwaarde, gebruiker op een
    // kale /toekomst zonder paneel (UR2-11). Zie `lib/horizon/deeplink-cleanup.ts`.
    if (shouldReplace) {
      router.replace(buildDeeplinkCleanupUrl(pathname, searchParams), { scroll: false })
    }

  }, [searchParams, router, pathname])

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

  // Server FIRE-leeftijd voor de progressieve first paint (Task 4.2): de
  // kernel-leeftijd uit de canonieke server-run (`computeHorizonFireSim` via
  // `loadHorizonData`), niet meer de laatst weggeschreven
  // `net_worth_snapshots.fire_age`.
  //
  // WAAROM DE SNAPSHOT WEG IS (H21 / ADR 0107): die kolom wordt door de RAUWE
  // scalar-lus (`lib/horizon/fire-scalar.ts`) geschreven — een ándere motor dan
  // de kernel-worker die hier landt. De eerste paint toonde dus stelselmatig een
  // andere vrijheidsleeftijd dan de tweede, en de historie kon dagen oud zijn.
  // Eén motor, geen sprong. Valt de server-run weg (geen geboortedatum, negatief
  // vermogen), dan is dit `null` en toont het oppervlak NIETS in plaats van een
  // getal uit een andere rekenwijze.
  const serverFireAge = initialData.fireAgeFractional

  // Simulatie-engine met echte app-data (fractionele FIRE-leeftijd + kasstromen)
  // Fase 2b (#495): gemigreerd naar runUnifiedProjection() met per-asset-type rendement
  // Task 4.2: de kernel-runs draaien in een web worker (met synchrone jsdom/SSR-fallback);
  // `firstPaint*` levert de server-scalars zolang de worker-run nog niet geland is.
  const { result: simResult, cashflows: simCashflows, error: simError, unifiedRows, effectiveLifeEvents, kernelStatus, kernelMaandHint, kernelHousingSale, aowOntbreekt, scenario, stopPad, scenarioPending, stopPadPending, mainPending, isRefining: kernelIsRefining, firstPaintFireAge, firstPaintFreedomPct, firstPaintRequiredPortfolio, firstPaintRequiredNetWorth } = useHorizonFireSim(
    input
      ? {
          horizonInput: input,
          lifeEvents: events,
          fireStrategy,
          withdrawalStrategy: withdrawalStrategyConfig,
          grossReturn: fireParams.grossReturn,
          inflation: fireParams.inflationRate,
          profileError: initialData.profileError,
          aowAgeFractional: userAowAge.fractional,
          assets: initialData.assets,
          debts,
          box3Method: initialData.box3Method,
          hasPartner: initialData.hasPartner,
          bankAccountCash: initialData.unlinkedCash,
          baseAnnualSavingsFromCashflow: initialData.baseAnnualSavingsFromCashflow,
          housingStrategy: initialData.housingStrategy,
          kernelRawProfile,
          aowRows,
          scenarioOverrides,
          // Alleen de expliciet gezette stop voedt het duiding-stop-pad; null = geen stop-pad.
          stopPadAge: scenarioStopAge,
          // Server-scalars voor de progressieve first paint (Task 4.2).
          initialFireAge: serverFireAge,
          initialFreedomPct: initialData.freedomPct,
          initialRequiredPortfolio: initialData.requiredPortfolioExclHome,
          // Prognose!I moet MET Prognose!J meereizen: de tegel kiest per
          // woonstrategie welke van de twee hij toont, en die keuze mag niet
          // afhangen van de vraag of de worker al geland is (UR3-07 defect 3).
          initialRequiredNetWorth: initialData.requiredNetWorthInclHome,
        }
      : null,
  )

  // B-057 — één signaal voor "de getoonde projectie is verouderd": server-refresh
  // (grondslag-herlaad) of hersolve van de hoofdlijn. Voedt de Fin-laadlaag op de grafiek
  // én de demping van de hoofdpaden. Bewust NIET gekoppeld aan `kernelIsRefining`
  // (first paint — de hero draagt die staat al).
  const projectiePending = refreshPending || mainPending === true

  // Events voor weergave: echte events + client-side geregenereerde
  // housing-strategy-events uit de hook. De hook resolved het
  // on_depletion-trigger-moment uit dezelfde unified projection als de
  // grafiek — tijdlijn, chart-markers en EventPane consumeren deze set
  // zodat het getoonde verkoop-moment per constructie samenvalt met het
  // uitputtingsmoment in de grafiek. Fallback op de server-events zolang
  // de sim nog niet gedraaid heeft.
  const displayEvents = useMemo<LifeEvent[]>(
    () => (effectiveLifeEvents.length > 0 ? effectiveLifeEvents : events),
    [effectiveLifeEvents, events],
  )

  // ── EventPane preview-baseline (kernel-only) ─────────────────────────────
  // De EventPane-delta-previews draaien op DEZELFDE motor als de Tijdas-grafiek:
  // de horizon-kernel via `computeConvergentieProjection` (zie event-preview-sim →
  // strategy-preview). De baseline draagt de rauwe kernel-context mínus lifeEvents;
  // de preview-run injecteert de events per aanroep. Zonder rauwe kernel-context
  // (bv. vóór de mount-fetch of zonder geboortedatum) is er geen doorrekening →
  // geen baseline (de pane toont dan z'n lege staat, geen tweede motor).
  const eventPanePreviewBaseline = useMemo<PreviewBaseline | null>(() => {
    if (!kernelRawProfile) return null
    // buildHorizonInput levert de reële jaaruitgave (grondslag voor de bridge-
    // implicitWithdrawalRate) + de null-guards; de events komen per preview-aanroep.
    const built = buildHorizonInput({
      horizonInput: input,
      lifeEvents: [],
      fireStrategy,
      withdrawalStrategy: withdrawalStrategyConfig,
      grossReturn: fireParams.grossReturn,
      inflation: fireParams.inflationRate,
      aowAgeFractional: userAowAge.fractional,
      assets: initialData.assets,
      debts,
      box3Method: initialData.box3Method,
      hasPartner: initialData.hasPartner,
      bankAccountCash: initialData.unlinkedCash,
      baseAnnualSavingsFromCashflow: initialData.baseAnnualSavingsFromCashflow,
      housingStrategy: initialData.housingStrategy,
    })
    if (!built) return null
    return {
      rawContext: {
        profile: kernelRawProfile,
        assets: initialData.assets ?? [],
        debts,
        aowRows,
        yearlyExpenses: built.input.yearlyExpenses,
        // ADR 0117 — de beheerde jaarlaag `fire_assumptions.volatility` (server-side
        // geresolveerd in de horizon-loader) voedt MC!B3. Zonder dit veld zou de
        // marktcheck op deze pagina met een ándere spreiding rekenen dan de jaarlaag
        // die beheer heeft gezet — dezelfde grondslagdrift die
        // `resolveFireParamsWithAssumptions` voor rendement/inflatie uitsluit.
        marktVolatiliteit: initialData.marktVolatiliteit,
      },
    }
  }, [input, fireStrategy, withdrawalStrategyConfig, fireParams.grossReturn, fireParams.inflationRate, userAowAge.fractional, debts, initialData, kernelRawProfile, aowRows])

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

  // Grondslag verversen na een mutatie (ADR 0179 fase 1 stap 3). De server-bundel is
  // de enige bron: `router.refresh()` levert een nieuwe `initialData`, en
  // `useHorizonBron` neemt die referentie-stabiel over. Vervangt de oude client-
  // herlading (15 Supabase-reads + 3 fetches die de SSR-loader spiegelden) en de
  // mount-fetch `loadKernelContext`. De naam blijft, zodat de aanroepers (modals,
  // panes, EventPane, tijdlijn-drag, acties) ongewijzigd zijn.
  const loadData = useCallback(() => {
    startRefresh(() => router.refresh())
  }, [router])

  // Laad huishouden-/partner-FIRE-data bij perspectief-wissel.
  //
  // BRON VAN WAARHEID: buildHouseholdProjectionInput — DEZELFDE engine die de
  // HouseholdFireSection en de gecombineerde FIRE-leeftijd voedt. Hierdoor komt
  // de gecombineerde lijn in de grafiek EXACT overeen met de getoonde
  // gezamenlijke FIRE-leeftijd (de oude /api/household/fire-projections gebruikte
  // de lichtgewicht projectForward → inconsistente lijn).
  useEffect(() => {
    if (!isHouseholdView && !isPartnerView) {
      setHouseholdHero(null)
      setPartnerHero(null)
      setHouseholdInput(null)
      setHouseholdOverlays(null)
      setHouseholdMainLine(null)
      setPartnerLine(null)
      setPartnerLifeEvents([])
      setHouseholdRetireInfo(null)
      return
    }
    let cancelled = false
    async function loadHouseholdData() {
      try {
        const supabase = createClient()
        const result: HouseholdProjectionResult = await buildHouseholdProjectionInput(supabase)
        if (cancelled) return
        if (!result.hasHousehold) return

        // Niet-huidige partner-entry (voor partner-lijn + partner-events).
        const partnerEntry = result.partners.find(p => !p.isCurrentUser) ?? null

        if (isHouseholdView) {
          const cp = result.combined.projection
          setHouseholdHero({
            householdName: result.householdName,
            fireAge: cp.fireAge,
            fireTarget: cp.fireTarget,
            freedomPercentage: cp.freedomPercentage,
            countdownDays: cp.countdownDays,
            fireDate: cp.fireDate,
            freedomYears: cp.freedomYears,
            freedomMonths: cp.freedomMonths,
            savingsRate: cp.savingsRate,
            // Methode-afhankelijke gecombineerde uitgave na pensioen (auto/som/eigen).
            retirementExpense: result.comparison.combinedRetirementExpenses,
          })
          // Gecombineerde FinancialInput voor het backtesting-/Monte-Carlo-modal
          // (huishouden-perspectief). Afgeleid uit dezelfde combined-projectie
          // zodat het modal het gezamenlijke vermogen backtest i.p.v. eigen-data.
          // Head = de KIJKER (TPR-07 fase 2a): de gecombineerde projectie loopt op de
          // eigen as, dus het backtest-/MC-modal krijgt de eigen geboortedatum.
          const headDob = result.partners.find(p => p.isCurrentUser)?.financials.dateOfBirth ?? null
          setHouseholdInput({
            totalAssets: result.comparison.combinedNetWorth,
            totalDebts: 0,
            monthlyIncome: result.comparison.combinedMonthlyIncome,
            monthlyExpenses: result.comparison.combinedMonthlyExpenses,
            yearlyMustExpenses: result.comparison.combinedRetirementExpenses,
            monthlyContributions: cp.monthlySavings,
            dateOfBirth: headDob,
          })
          // Huishouden-view: de GECOMBINEERDE lijn is de HOOFDLIJN (matcht de
          // hero-FIRE-leeftijd), zodat de prominente lijn + marker het huishouden
          // tonen i.p.v. de eigen lijn (die anders een afwijkende FIRE-leeftijd
          // liet zien). Het pad komt 1-op-1 uit de unified combined-projectie.
          if (result.combined.rows.length > 0) {
            setHouseholdMainLine({
              rows: result.combined.rows,
              fireAge: cp.fireAge,
              fireAgeFractional: result.combined.fireAgeFractional,
              currentAge: cp.currentAge,
              partnerAowAge: result.combined.partnerAowAge,
            })
          } else {
            setHouseholdMainLine(null)
          }
          // Eigen lijn als overlay. Sinds TPR-07 fase 2a is de kijker altijd de head
          // (de gecombineerde lijn loopt op de eigen as), dus de overlay klopt voor
          // élke partner — de oude "alleen als je de oudste bent"-regel is vervallen.
          // Bron = household-projectie (matcht de partnerkaart), niet de losse pagina-sim.
          const me = result.partners.find(p => p.isCurrentUser)
          const ownOverlays: HouseholdPartnerOverlay[] = []
          if (me && me.rows.length > 0) {
            ownOverlays.push({
              name: 'Jouw projectie',
              color: '#b89968', // lichter horizon
              points: simRowsToChartPoints(me.rows),
              fireAge: me.projection.fireAge,
              fireAgeFractional: me.fireAgeFractional,
              isDashed: true,
            })
          }
          setHouseholdOverlays(ownOverlays.length > 0 ? ownOverlays : null)
          setHouseholdRetireInfo({
            candidates: result.comparison.householdRetirementCandidates,
            method: result.comparison.householdRetirementMethod,
          })
          setPartnerHero(null)
          setPartnerLine(null)
        } else if (isPartnerView && partnerEntry) {
          const pp = partnerEntry.projection
          setPartnerHero({
            householdName: partnerEntry.fullName ?? partnerName ?? 'Partner',
            fireAge: pp.fireAge,
            fireTarget: pp.fireTarget,
            freedomPercentage: pp.freedomPercentage,
            countdownDays: pp.countdownDays,
            fireDate: pp.fireDate,
            freedomYears: pp.freedomYears,
            freedomMonths: pp.freedomMonths,
            savingsRate: pp.savingsRate,
            // Eigen uitgave na pensioen van de partner.
            retirementExpense: partnerEntry.financials.yearlyMustExpenses ?? 0,
          })
          setHouseholdHero(null)
          setHouseholdOverlays(null)
          setHouseholdMainLine(null)
          setHouseholdInput(null)
          setHouseholdRetireInfo(null)
          // Partner-view: vervang de hoofdlijn door het partner-pad zodat de
          // as + FIRE-markers op de partner uitlijnen. Leeg pad ('totals' of
          // toekomst verborgen) → null → degradeer naar de eigen lijn.
          setPartnerLine(
            partnerEntry.rows.length > 0
              ? {
                  rows: partnerEntry.rows,
                  fireAge: pp.fireAge,
                  fireAgeFractional: partnerEntry.fireAgeFractional,
                  currentAge: partnerEntry.settings.currentAge,
                }
              : null,
          )
        }

        // Partner-levensgebeurtenissen (read-only markers) — in zowel
        // huishouden- als partner-view. Alleen de PERSOONLIJKE events van de
        // partner (gedeelde events tonen we al via de eigen overlay). De
        // `target_age` staat op de as van de PARTNER; voor de huishoudblik (eigen
        // as, TPR-07 fase 2a) schuiven we 'm met het leeftijdsverschil op. Zonder
        // beide leeftijden geen verschuiving mogelijk → geen marker op de eigen as.
        const myAge = result.partners.find(p => p.isCurrentUser)?.settings.currentAge ?? null
        const partnerAge = partnerEntry?.settings.currentAge ?? null
        const ageShift = myAge != null && partnerAge != null ? partnerAge - myAge : null
        setPartnerLifeEvents(
          partnerEntry
            ? partnerEntry.lifeEvents
                .filter(ev => ev.ownership !== 'shared')
                .map(ev => ({
                  id: ev.id,
                  name: ev.name,
                  targetAge: ev.targetAge,
                  targetAgeOnOwnAxis: ev.targetAge != null && ageShift != null ? ev.targetAge - ageShift : null,
                  icon: ev.icon,
                }))
            : [],
        )
      } catch {
        // Niet kritisch — val terug op persoonlijke data.
      }
    }
    loadHouseholdData()
    return () => { cancelled = true }
    // perspectiveVersion: herlaad ook na een data-wijziging (bv. aangepaste
    // huishoud-uitgave na pensioen) zodat hero + grafieklijn meteen bijwerken.
  }, [isHouseholdView, isPartnerView, partnerName, perspectiveVersion])

  // Compute effective input: base data from DB
  const effectiveInput: FinancialInput | null = input

  // Recalculate projections when input or FIRE method changes
  useEffect(() => {
    if (!effectiveInput) return
    const stratOpts = fireStrategy ? { strategy: fireStrategy.strategy, endAge: fireStrategy.endAge } : undefined
    setFire(computeFireProjection(effectiveInput, fireParams.grossReturn, fireSwr, undefined, stratOpts))
    setRange(computeFireRange(effectiveInput, fireSwr, undefined, fireParams.grossReturn, stratOpts))
    // Health score: recompute with updated inputs — DEZELFDE semantiek als de
    // loader (horizon-data-loader.ts), zodat /toekomst niet van /overzicht
    // afwijkt en de badge niet flikkert van SSR-score naar een client-score.
    // savingsRate6m + budgetCategories: server-canoniek (transactiedata wijzigt
    // niet client-side).
    const expensesForHealth = avgExpenses6m ?? effectiveInput.monthlyExpenses
    // Noodfonds: server-canoniek. De norm is 3 × netto maandsalaris en zowel het
    // salaris als de liquide pot wijzigen niet onder de what-if-sliders (die
    // raken totalAssets/totalDebts, niet je betaal-/spaarsaldo), dus hier valt
    // niets te herrekenen — consume, don't recompute.
    const emergencyMonths = healthScoreInput.emergencyFundMonths
    // Vrijheidsvoortgang: zelfde TELLER-grondslag als de loader en de hero —
    // FIRE-eligible netto vermogen (huis gefilterd via de housing-strategie)
    // via computeFreedomProgress (NIET de oude computeFreedomPercentage op het
    // volle nettovermogen). De NOEMER is hier een lokaal herbouwd strategie-
    // bewust fireTarget (geen sim-required portfolio zoals de hero): deze
    // recompute moet ook onder what-if-sliders draaien zonder her-sim.
    //
    // What-if: effectiveInput.totalAssets/totalDebts kunnen scenario-aangepast
    // zijn. De eigen-woning-overwaarde (eigenHuisValue − mortgageBalance) is een
    // vaste offset uit de werkelijke eigen_huis-data en wordt door de cashflow-
    // sliders niet verstoord; getFireEligibleNetWorth past die offset toe op het
    // (eventueel aangepaste) nettovermogen — dus what-if blijft correct.
    const nw = effectiveInput.totalAssets - effectiveInput.totalDebts
    const hsFireEligibleNetWorth = getFireEligibleNetWorth(
      nw,
      initialData.housingContext,
      initialData.housingStrategy,
    )
    const hsCurrentAge = effectiveInput.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null
    const hsYearsInRetirement = (fireStrategy?.strategy === 'deplete' && hsCurrentAge != null)
      ? Math.max(1, (fireStrategy.endAge ?? 90) - Math.round(hsCurrentAge))
      : undefined
    const hsRealReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
    const hsFireTarget = computeFireTarget(
      computeEffectiveExpenses(effectiveInput.yearlyMustExpenses, expensesForHealth * 12),
      fireSwr,
      { strategy: fireStrategy?.strategy ?? 'deplete', yearsInRetirement: hsYearsInRetirement, realReturn: hsRealReturn },
    )
    // Grondslag-keuze (ADR 0009 herzien): standaard telt de eigen woning mee →
    // INCL.-woning grondslag; alleen bij exclude_from_fire → EXCL. (liquide). Deze
    // what-if-recompute kent geen her-sim, dus incl.-noemer via scalar-fallback.
    const hsHomeExcludedFromFire =
      initialData.housingContext.hasEigenHuis && isHomeExcludedFromFire(initialData.housingStrategy)
    const hsRequiredPortfolioExcl = hsFireTarget > 0 ? hsFireTarget : null
    // ADR 0129 B3/D5 — dezelfde anker-splitsing als de hero hieronder, want de
    // vrijheids-pijler mag niet op een ándere definitie draaien dan het getal dat
    // erboven staat. Onder een vast anker is een kapitaalratio betekenisloos (de
    // noemer IS de geprojecteerde stand op het anker): dan de DEKKING van dezelfde
    // run, en zonder kernel-antwoord exact dezelfde terugvalketen als de hero —
    // `firstPaintFreedomPct ?? initialData.freedomPct`, beide `computeFreedomPctForPlan`
    // uit de loader. Nooit een eigen som, en bewust NIET `healthScoreInput.freedomPct`:
    // dat is de waarde die dít effect zelf schreef, dus een stale waarde zou zichzelf
    // voeden zodra de run een keer geen antwoord gaf. `isFixedAnchorMode` staat lager in
    // het bestand maar is hier veilig: deze effect-body draait ná de render, niet
    // tijdens (anders dan een deps-array) — en hij hangt alleen aan `simResult`, dat wél
    // in de deps staat.
    const fPct = isFixedAnchorMode
      ? (dekkingVanRun(simResult, hsCurrentAge) ?? firstPaintFreedomPct ?? initialData.freedomPct)
      : computeFreedomProgressWithBasis({
          homeExcludedFromFire: hsHomeExcludedFromFire,
          netWorthInclHome: nw,
          fireEligibleNetWorth: hsFireEligibleNetWorth,
          requiredNetWorthInclHome: inclHomeTargetFromScalar(hsRequiredPortfolioExcl, nw, hsFireEligibleNetWorth),
          requiredPortfolioExclHome: hsRequiredPortfolioExcl,
        })
    const newInput: HealthScoreInput = {
      ...healthScoreInput,
      totalAssets: effectiveInput.totalAssets,
      totalDebts: effectiveInput.totalDebts,
      emergencyFundMonths: emergencyMonths,
      freedomPct: fPct,
    }
    setHealthScoreInput(newInput)
    setHealthScore(computeHealthScoreFromInputs(newInput, budgetingActive))
  // `simResult` + `firstPaintFreedomPct` zijn GEEN cosmetische toevoeging: sinds de
  // anker-splitsing hierboven leest deze body de kernel-run. Zonder die deps bleef de
  // vrijheids-pijler hangen op de dekking van vóór de laatste run (en vóór een
  // strategie-wijziging), terwijl de hero ernaast al was bijgewerkt — precies de
  // twee-definities-op-één-scherm die we hier repareren. `isFixedAnchorMode` zelf kan
  // niet in de array (het is een latere `const`; TDZ tijdens de render) en hoeft dat ook
  // niet: hij is een pure functie van `simResult` en de stabiele `initialData`-prop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, fireSwr, fireParams, avgIncome6m, avgExpenses6m, fireStrategy, simResult, firstPaintFreedomPct])

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

  const currentAge = effectiveInput?.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null

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

  // ── Scenario's naast elkaar: 5 preset-kaarten, via de worker bij zichtbaarheid ─────────
  // De context hangt UITSLUITEND van de basis-data af (geen scenario-overrides): profiel +
  // basis-lifeEvents + basis-jaaruitgaven, verwachtFireAge = basis-FIRE. De vijf volle
  // kernel-solves (~1s samen) draaien nooit per slider-tick, en Task 4.2: pas wanneer de
  // duiding-sectie (bijna) in beeld komt (`duidingInView`) én via de web worker (of synchrone
  // fallback) — niet meer eager in idle op de main thread. Leunt erop dat de sliders de
  // hoofd-input niet muteren (het scenario loopt via het gescheiden scenario-veld).
  //
  // ── Het STOP-ANKER van het plan — de énige sleutel (ADR 0129, ontwerpprincipe 1) ──
  // Uit de kernel-echo van de run (`simResult.stopAnker`); vóór de run het plan-anker
  // uit de bundel. `isFixedAnchor` is DE toets op "het stopmoment ligt vast"; nooit
  // meer een string-vergelijking op de strategienaam ('pensioen'/'nu-stoppen').
  // Hier gedeclareerd (vóór het effect hieronder) omdat de dependency-array tijdens
  // de render wordt geëvalueerd — een latere `const` zou daar in de TDZ vallen.
  const planAnchor: StopAnchor = simResult
    ? stopAnchorFromKernel(simResult.stopAnker)
    : (initialData.firePlan?.anchor ?? { kind: 'solved' })
  const isFixedAnchorMode = isFixedAnchor({ anchor: planAnchor })
  useEffect(() => {
    // Onder een VAST anker draagt de batch de tweede run ("vrij mogelijk vanaf", ADR 0129
    // D7) die de hero-tegel bovenaan voedt — die mag niet wachten tot de gebruiker naar de
    // duiding scrolt (lab-haalbaarheid Task 0, 15 sep 2026: tegel bleef "—", en met
    // `?whatif=open` haakte de observer soms nooit aan). Onder `solved` blijft het lui.
    const presetBatchNodig = isFixedAnchorMode || (displayMode === 'full' && duidingInView)
    if (!presetBatchNodig) { setScenarioPresets(null); setScenarioPresetsLoading(false); setHaalbareUitgave(null); return }
    if (!kernelRawProfile || !effectiveInput || currentAge == null) return
    const yearlyExp = effectiveInput.yearlyMustExpenses > 0 ? effectiveInput.yearlyMustExpenses : 0
    // Zonder uitgaven-grondslag draait er geen batch — ook dan geen eindeloze rekenstand.
    if (yearlyExp <= 0) { setSolvedRun({ fireAge: null, endAge: null }); setHaalbareUitgave(null); return }
    const strat = fireStrategy ?? DEFAULT_FIRE_STRATEGY
    const downsizeActief =
      initialData.housingStrategy.mode === 'downsize' || initialData.housingStrategy.mode === 'reverse_mortgage'
    setScenarioPresetsLoading(true)
    let cancelled = false
    runScenarioPresetsAsync({
      // ADR 0103 × ADR 0129 D7 — dezelfde grondslag-injectie als elke andere kernel-run
      // (use-horizon-fire-sim.ts#kernelProfileWithBasis): onder een budget-/transactie-
      // grondslag is de rauwe `net_monthly_income` 0/null.
      profile: withResolvedKernelBedragen(kernelRawProfile, {
        monthlyIncome: effectiveInput.monthlyIncome,
        monthlyExpenses: effectiveInput.monthlyExpenses,
      }),
      assets: initialData.assets ?? [],
      debts,
      lifeEvents: events,
      aowRows,
      yearlyExpenses: yearlyExp,
      currentAge,
      verwachtFireAge: simResult?.fireAgeFractional ?? null,
      fireEndAge: strat.endAge,
      hasEigenHuis: initialData.housingContext.hasEigenHuis,
      downsizeStrategyActief: downsizeActief,
    }, { lane: 'presets' })
      // B-057/B4 — rijstrook: een nieuwere batch verdringt een nog niet geposte
      // oudere (de batch is ~20 kernel-runs; per commit én per gelande hoofdrun
      // opnieuw gepost). Verdrongen batches landen als lege batch op een al
      // gecancelde effect-run → genegeerd. De debounce/guard zelf (B3) staat op een
      // aparte kaart.
      // ADR 0129 D7 — de batch draagt naast de kaarten ook `solvedFireAge` ("vrij
      // mogelijk vanaf", de tweede run onder een vast anker). F3b toont dat getal in de
      // hero-drieslag; hier wordt alleen de kaartenlijst uitgepakt.
      .then((batch) => {
        if (cancelled) return
        setScenarioPresets(batch.presets as ScenarioPresetResult[])
        setSolvedRun({ fireAge: batch.solvedFireAge ?? null, endAge: batch.solvedFireEndAge ?? null })
        setHaalbareUitgave(batch.haalbareUitgave ?? null)
        setScenarioPresetsLoading(false)
      })
      .catch((err) => {
        console.warn('[horizon-worker] preset-run faalde', err)
        if (cancelled) return
        setScenarioPresetsLoading(false)
        // Een gefaalde batch beëindigt de rekenstand van de hero-tegel ("wordt berekend"):
        // géén leeftijd, maar ook geen eindeloos wachten.
        setSolvedRun({ fireAge: null, endAge: null })
        setHaalbareUitgave(null)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode, duidingInView, isFixedAnchorMode, kernelRawProfile, effectiveInput?.monthlyIncome, effectiveInput?.monthlyExpenses, simResult?.fireAgeFractional, currentAge, debts, events, aowRows, fireStrategy, initialData])

  // Deeplink `?whatif=open` (en ScenarioChip-klik) → scroll naar het doelscenario.
  // Sinds ADR 0170 staat dat blok altijd open, dus alleen nog scrollen.
  useEffect(() => {
    if (!whatIfInlineOpen) return
    const t = setTimeout(
      () => verkenSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      120,
    )
    return () => clearTimeout(t)
  }, [whatIfInlineOpen])

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

  // ── V7 tekort-lening-zichtbaarheid ──────────────────────────────────────
  // De grafiek plot netWorth (tekort al gesaldeerd) en vloert op 0 — een
  // aangesproken tekort-lening is dan onzichtbaar. We detecteren 'm uit de rijen
  // (eerste leeftijd + piek) voor een expliciete stoplicht-melding + tijdlijn-
  // marker. Alleen de kernel-bridge levert debtBalances['tekort-lening'], dus dit
  // is per constructie kernel-only (v2-rijen → null). Vóór chartEventOverlay
  // gedeclareerd zodat de marker-builder 'm mag consumeren (geen TDZ).
  //
  // Besluit 4 juli 2026: de tekort-lening-staart op/na de eindleeftijd is
  // modelmarge en wordt niet gemeld → cutoff op `displayEndAge − 1`.
  // `simResult.displayEndAge` = `solve.eindleeftijd` = de eindleeftijd die de
  // kernel voor DÉZE run hanteerde: bij 'Vermogen opeten'/'Nalatenschap' de
  // plan-eindleeftijd (fire_end_age, bv. 93), bij perpetual/pensioen de
  // horizon-cap 100 (geen bewuste deplete-staart → een tekort vóór 100 is een
  // echt signaal, geen marge). Dat is precies de "eindleeftijd" uit het besluit.
  const deficitLoanNotice = useMemo(
    () => detectDeficitLoanFromRows(unifiedRows, { endAge: simResult?.displayEndAge }),
    [unifiedRows, simResult?.displayEndAge],
  )

  // Werkelijk startmoment van de opeethypotheek in DEZE run — bij "wanneer nodig"
  // volgt dat uit de projectie, niet uit de instelling.
  const reverseMortgageStartAge = useMemo(
    () =>
      initialData.housingStrategy?.mode === 'reverse_mortgage'
        ? detectReverseMortgageStartAge(unifiedRows)
        : null,
    [initialData.housingStrategy, unifiedRows],
  )


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

  // Stopmoment van de HOOFDRUN voor de looptijd-tekst van "tot ik stop met werken"-
  // gebeurtenissen (Notion 3daf9e8d): vast anker ?? gevonden vrijheidsleeftijd, nooit
  // fireAge (ceil). Bewust de hoofdrun, niet de lab-/stop-slider-run — anders verspringt
  // de tekst bij elke schuifbeweging. null = geen bereikbaar stopmoment (geen leeftijd tonen).
  const eventStopAge = useMemo(() => eventStopAgeFromSim(simResult), [simResult])

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

  // ── Natuurlijke-mijlpaal info-sheet state ─────────────────────────────
  const [selectedNaturalMilestone, setSelectedNaturalMilestone] =
    useState<NaturalMilestone | null>(null)

  // ── Year-details sheet state — kassabon per jaar ──────────────────────
  // Opent bij klik op een kolom in de WealthCompositionChart. Toont de
  // opbouw van bezittingen, schulden, kosten/inkomsten + gebeurtenissen
  // voor dat specifieke projectiejaar.
  const [selectedYearAge, setSelectedYearAge] = useState<number | null>(null)

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

  // Gebruik simulatie-FIRE-bedrag als authoritative vrijheidspercentage wanneer beschikbaar.
  // Task 4.2 (progressieve first paint): zolang de worker-run nog niet geland is, wint de
  // server-scalar (`firstPaintRequiredPortfolio`) boven de client-side `fire`-fallback, zodat
  // de hero meteen het canonieke doelbedrag toont (consume, don't recompute) i.p.v. te flitsen.
  // C1: `fire?.fireTarget` (computeFireProjection) is hier VERWIJDERD als laatste
  // terugval — dat is een tweede motor op hetzelfde doelbedrag. Blijft over: de
  // kernel, en anders de server-scalar die zélf uit de kernel komt.
  const effectiveFireTarget = simResult?.requiredFirePortfolio ?? firstPaintRequiredPortfolio ?? 0
  const effectiveNetWorth = (effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)
  // Canonieke grondslag (ADR 0009): FIRE-eligible vermogen (huis gefilterd via
  // de housing-strategie) ÷ benodigde portfolio via computeFreedomProgress —
  // dezelfde teller/noemer als de "nog X jaar"-aftelling. NIET meer het volle
  // nettovermogen als teller (toonde 100% terwijl de aftelling nog jaren
  // beweerde). NB: de health-score-recompute (zie hsFireTarget hierboven)
  // deelt deze TELLER maar herbouwt zijn NOEMER als strategie-bewust
  // fireTarget i.p.v. de sim-required portfolio — bewust, zodat hij ook onder
  // what-if-sliders werkt zonder her-sim; klein noemer-verschil mogelijk.
  const effectiveFireEligibleNetWorth = getFireEligibleNetWorth(
    effectiveNetWorth,
    initialData.housingContext,
    initialData.housingStrategy,
  )
  // Grondslag-keuze (ADR 0009 herzien): standaard telt de eigen woning mee →
  // INCL.-woning grondslag (teller = volledig netto vermogen incl. huis + niet-
  // liquide; noemer = requiredFireNetWorth = Prognose!I@FIRE, scalar-fallback als de
  // sim wegvalt). Alleen bij exclude_from_fire → EXCL. (liquide). De voortgangsbalk,
  // de perspectiveHero én het balk-label erven deze effectieve grondslag.
  const homeExcludedFromProgress =
    initialData.housingContext.hasEigenHuis && isHomeExcludedFromFire(initialData.housingStrategy)
  // Zelfde precedentie als het getoonde doelbedrag hieronder: client-kernel,
  // dan de SERVER-kernelrun (die Prognose!I al canoniek in de bundel legt), en
  // pas dán de scalar-reconstructie. Zonder de middelste stap bouwde de eerste
  // paint dit getal hier lokaal na uit Prognose!J terwijl de server het al had —
  // een tweede route naar hetzelfde cijfer, en dus de noemer van de balk-vulling
  // die kon afwijken van het balk-label ernaast (UR3-07 defect 3).
  const effectiveRequiredNetWorthInclHome =
    simResult?.requiredFireNetWorth ??
    firstPaintRequiredNetWorth ??
    inclHomeTargetFromScalar(
      effectiveFireTarget > 0 ? effectiveFireTarget : null,
      effectiveNetWorth,
      effectiveFireEligibleNetWorth,
    )
  // ── Het ANKER kiest de definitie van het vrijheids-% (ADR 0129 B3/D5) ──────
  // Onder `solved` is het de KAPITAALRATIO hierboven: hoe vol is de pot t.o.v. het
  // FIRE-doel. Onder een VAST anker (aow/now/age) is het de DEKKING van het plan, en
  // dat is geen smaakverschil: `requiredFirePortfolio`/`requiredFireNetWorth` zijn
  // daar de GEPROJECTEERDE STAND op het anker (bridge-vlag
  // `requiredFireIsAnchorPortfolio`, ADR 0129 D4) — teller en noemer zijn dezelfde
  // grootheid, dus de ratio komt per constructie op ~100 % uit. Dit scherm rekende
  // die ratio onvoorwaardelijk en overschreef daarmee de bundelwaarde die de loader
  // al correct had gekozen (`computeFreedomPctForPlan`, lib/horizon-data-loader.ts):
  // bij een anker op vandaag (ankermaand 0) zei de hero "Je bent vrij" — de gate
  // `isFinanciallyFree` opent bij ≥ 100 % ∧ anker bereikt — naast een tekort-lening
  // van vier ton en een plan dat maar tot 47 van de 90 reikte. De voortgangsbalk
  // stond vol terwijl het LABEL ernaast de tijd-uitspraak "tot je 90e — einde van je
  // plan" deed: vulling en label maten twee verschillende dingen.
  // De dekking komt uit `dekkingVanRun` — letterlijk de loader-formule op DEZELFDE
  // run (lib/horizon/lab-uitkomst.ts), zodat hero, lab-dekkingsas en bundel niet
  // uiteen kunnen lopen. Dat is de HOOFDRUN: de wat-als-sliders draaien een eigen,
  // gescheiden projectie (`scenario` uit use-horizon-fire-sim.ts) en bewegen dit
  // getal dus niet mee — net zomin als de oude kapitaalratio dat deed. Geen
  // regressie, wel een grens om te kennen; de dekking van een scenario staat in de
  // lab-dekkingsas (`labDekking`), niet in de hero.
  // Zonder kernel-antwoord (eerste paint, of een gedegradeerde run) consumeren we de
  // bundel: die is via dezelfde ene home gekozen. Nooit 0 en nooit een ratio.
  const ankerDekkingPct = dekkingVanRun(simResult, currentAge)
  const effectiveFreedomPct = isFixedAnchorMode
    ? (ankerDekkingPct ?? firstPaintFreedomPct ?? initialData.freedomPct)
    : effectiveFireTarget > 0
      ? computeFreedomProgressWithBasis({
          homeExcludedFromFire: homeExcludedFromProgress,
          netWorthInclHome: effectiveNetWorth,
          fireEligibleNetWorth: effectiveFireEligibleNetWorth,
          requiredNetWorthInclHome: effectiveRequiredNetWorthInclHome,
          requiredPortfolioExclHome: effectiveFireTarget,
        })
      : (firstPaintFreedomPct ?? fire?.freedomPercentage ?? 0)

  // (`planAnchor` / `isFixedAnchorMode` staan hoger, vóór het preset-batch-effect dat ze leest.)
  // Pensioen-WEERGAVE: alleen het aow-anker splitst de grafiek en de fasebalk op de
  // AOW-leeftijd (`planningMode: 'pensioen'`); `now`/`age` splitsen op het anker via
  // de gewone FIRE-weergave. Het is een grafiek-keuze, geen modus-label.
  const isPensioenMode = planAnchor.kind === 'aow'
  // Het nu-anker: het stopmoment is vandaag — dan is er geen stopkeuze (slider) en geen
  // "om op X te stoppen"-hint.
  const isNuStoppenMode = planAnchor.kind === 'now'

  // Het kernantwoord onder een vast anker: tot welke leeftijd reikt het LIQUIDE
  // vermogen. Consume-only uit DEZELFDE run. `kernelDepletionMonth` bewust RAUW
  // doorgegeven (geen `?? null`): undefined = geen kernel-antwoord, null = geen
  // uitputting binnen de horizon. De startleeftijd is de kernel-tijdas (`currentAge`),
  // niet `fireAge`: onder een aow-/age-anker is `fireAge` het anker zelf.
  const ankerReach: AnkerReach | null = useMemo(
    () =>
      simResult != null && simResult.stopAnker != null
        ? ankerReachFromSim({
            startAge: currentAge,
            kernelDepletionMonth: simResult.kernelDepletionMonth,
            endAge: simResult.displayEndAge,
          })
        : null,
    [simResult, currentAge],
  )
  // Het stopmoment van de run als zin-onderwerp ("nu" / "op 58,5") — uit
  // `vastStopLeeftijd`, nooit `fireAge` (bevinding 11).
  const ankerStop: AnkerStop | null = useMemo(
    () =>
      simResult != null
        ? ankerStopFromSim({ stopAnker: simResult.stopAnker, vastStopLeeftijd: simResult.vastStopLeeftijd })
        : planAnchor.kind === 'now'
          ? { kind: 'now' }
          : planAnchor.kind === 'age'
            ? { kind: 'age', stopAge: planAnchor.age }
            : null,
    [simResult, planAnchor],
  )
  // De vraag die de modus draagt (B10): kop van de hero én van de vrijheidsas.
  const heroVraag = ankerVraag(isFixedAnchorMode ? ankerStop : null)

  // ── Dubbele FIRE-grondslag (incl./excl. eigen woning) ────────────────────
  // Bij downsize/opeethypotheek/uitsluiten (showDualHousingBasis) toont /toekomst
  // BEIDE doelen: incl. woning (requiredFireNetWorth = totaal netto vermogen bij
  // FIRE — valt samen met de vermogenslijn) én excl. woning/liquide
  // (requiredFirePortfolio). Levert géén van beide runs het paar, dan blijft het
  // bestaande enkelvoudige gedrag intact. Puur al-doorgeleide velden.
  //
  // BEWUSTE KEUZE (UR3-07 defect 3): het paar komt uit dezelfde samenvoeging als
  // het enkelvoudige bedrag, dus `showDualFireTarget` slaat óók op de
  // SERVER-waarden aan. Zonder dat zou de tegel behalve van GETAL ook nog van
  // VORM verspringen — eerst één bedrag, dan twee — en dat is dezelfde bevinding
  // in een ander jasje. De dual-tak schrijft zijn grondslagen ("met je huis" /
  // "zonder je huis") zelf al bij het getal, dus hij is bij de eerste paint net
  // zo eerlijk als daarna.
  //
  // ÉÉN BESLISSER (UR3-07 defect 3): `resolveFireDoelWeergave` voegt per
  // grootheid de client-kernelrun en de SERVER-kernelrun samen en kiest daarna
  // pas — op de woonstrategie, niet op de vraag of de worker al geland is —
  // welke van de twee de tegel toont. Vóór deze stap las de tegel Prognose!J bij
  // de eerste paint en Prognose!I daarna: dezelfde tegel, twee grootheden
  // (gemeten € 140.000 → € 620.000 op een huis-zware downsize-fixture). Het
  // onderschrift komt uit dezelfde uitkomst, zodat label en getal niet uit
  // elkaar kunnen lopen. Consume-only: hier wordt niets herrekend.
  const fireDoel = resolveFireDoelWeergave({
    homeExcludedFromProgress,
    kernelRequiredNetWorthInclHome: simResult?.requiredFireNetWorth,
    kernelRequiredPortfolioExclHome: simResult?.requiredFirePortfolio,
    serverRequiredNetWorthInclHome: firstPaintRequiredNetWorth,
    serverRequiredPortfolioExclHome: firstPaintRequiredPortfolio,
  })
  const fireTargetInclHome = fireDoel.inclHuis
  const fireTargetExclHome = fireDoel.exclHuis
  const showDualFireTarget =
    initialData.showDualHousingBasis &&
    // ADR 0129 D4 — onder een vast anker is er geen doelbedrag (de kernel bisecteert
    // op tijd, niet op kapitaal), dus ook geen incl./excl.-woning-paar.
    !isFixedAnchorMode &&
    fireTargetInclHome != null && fireTargetInclHome > 0 &&
    fireTargetExclHome != null && fireTargetExclHome > 0

  // Tweede vermogenslijn in Pad-modus: het vermogen ZONDER JE HUIS naast het
  // totaal. Alleen bij een eigen woning ÉN een niet-meetellen-strategie — bij
  // `include_full` is niets niet-liquide en valt de lijn pixel-exact samen met de
  // totaallijn (J ≡ I). Zie de uitleg in `lib/horizon/liquid-wealth-line.ts`.
  const showLiquidWealthLine = shouldShowLiquidWealthLine(
    initialData.housingContext,
    initialData.housingStrategy.mode,
  )

  // Doelbedrag dat bij de voortgangsbalk-grondslag hoort: incl. woning
  // (Prognose!I) tenzij de woning is uitgesloten (exclude_from_fire) → dan het
  // liquide excl.-doel (Prognose!J). Consistent met de noemer van
  // `effectiveFreedomPct` in de `solved`-tak, zodat de balk-fill en het balk-label
  // daar niet botsen. Onder een VAST anker geldt die uitspraak NIET meer: de vulling
  // meet daar dekking (tijd, ADR 0129 D5) en heeft dus geen euro-noemer, het
  // balk-label noemt het einde van het plan i.p.v. een bedrag, en de KPI-tegel toont
  // `vermogenOpAnker`. Dit bedrag doet daar alleen nog mee in `fireTargetGuard`.
  // Zelfde C1-regel als bij `effectiveFireTarget`: alleen kernel-afgeleide
  // bronnen — en sinds UR3-07 defect 3 óók dezelfde grondslag vóór en ná de
  // worker-run, want beide runs leveren nu allebei de grootheden.
  const balkVrijheidDoel = fireDoel.bedrag

  // ── M6-vangrail op het GETOONDE doelbedrag ────────────────────────────────
  // Tweede verdedigingslinie (de rekenkant is bij de bron gefixt: solver-scoping
  // op een negatief doelbedrag + de gemarkeerde eind-horizon-terugval in de
  // bridge). Een doelbedrag ≤ 0, of een bedrag dat uit de eind-horizon-terugval
  // komt (= geprojecteerde stand op ~100, een ándere grootheid dan "benodigd"),
  // gaat NOOIT als kaal bedrag op het scherm — daar komt een gegevensmelding.
  // Geldt alleen voor de FIRE-doelbedrag-tegel: in pensioen-modus toont die tegel
  // het GEPROJECTEERDE vermogen op AOW, wat een uitkomst is en geen doel.
  const fireTargetGuard = guardFireTarget(balkVrijheidDoel, {
    isEndOfHorizonFallback: simResult?.requiredFireIsEndOfHorizonFallback === true,
    // ADR 0129 D4 — vast anker (aow/now/age): de guard geeft dan 'geen-doelvermogen'
    // terug en de tegel toont die duiding i.p.v. een bedrag dat de geprojecteerde
    // stand op het anker is.
    isAnchorPortfolio: simResult?.requiredFireIsAnchorPortfolio === true,
  })
  // Onder een vast anker toont de tegel het GEPROJECTEERDE vermogen op het stopmoment
  // (een uitkomst, geen doel) — de 'geen-doelvermogen'-guard is daar dus geen melding.
  const showFireTargetNotice = !isFixedAnchorMode && !fireTargetGuard.ok

  // Grafiek-weergave afgeleid van het ANKER (ADR 0129 B11): `aow` → pensioen-weergave
  // (split op AOW), `solved`/`now`/`age` → FIRE-weergave (split op het stopmoment).
  // De vroegere AOW-stop-toggle — een eigen `evaluateFireAt`-run met deplete-override
  // in `useState` — is weg; de snelkoppeling "Op AOW-leeftijd" die haar opvolgde is
  // met melding B-038 ook vervallen. Het AOW-stopmoment kies je in de strategie-modal.
  const planningMode: 'fire' | 'pensioen' = isPensioenMode ? 'pensioen' : 'fire'

  // Pensioen-specific computed values
  // UR3-24: hero-KPI en kassabon-waardecellen zijn krappe, tabular-nums-cellen —
  // dus de VASTGELEGDE korte vorm ("67+9m"), dezelfde die de AOW-stippellijn op de
  // tijdas-grafiek draagt. Voorheen een eigen negende schrijfwijze ("67j + 9m").
  const aowAgeFormatted = formatAowAgeKort(userAowAge)

  // ── KERNANTWOORD: één bron voor de vrijheids-/pensioenleeftijd (bevinding C1) ─
  // De hero-KPI, de kassabon eronder en de welkomst-/exit-overlay tonen dezelfde
  // vraag. Voorheen mocht elk oppervlak zelf een terugval kiezen zodra de kernel
  // nog niet klaar was — waaronder `fire.fireAge` uit computeFireProjection, een
  // TWEEDE motor met eigen aannames. Daardoor gaf dezelfde ongewijzigde invoer
  // per laadbeurt een ander antwoord. Nu beslist één pure resolver welk getal
  // wint én hoe hard het is; is er geen kernel-antwoord, dan zeggen we dat
  // ("voorlopig" / "wordt berekend") in plaats van een tweede getal te tonen.
  const heroFireAge = resolveHeroFireAge({
    hasKernelResult: simResult != null,
    kernelFireAgeFractional: simResult?.fireAgeFractional ?? null,
    kernelFireAge: simResult?.fireAge ?? null,
    // ADR 0129 F3a — één anker-tak: onder elk vast anker is het kopgetal de leeftijd
    // tot waar het vermogen reikt; stopmoment en tweede run reizen mee als drieslag
    // (F3b tekent de tegels). `stopAnker` uit de run, nooit de strategienaam.
    stopAnker: simResult?.stopAnker ?? null,
    ankerReach,
    vastStopLeeftijd: simResult?.vastStopLeeftijd ?? null,
    // D7 — "vrij mogelijk vanaf": de tweede run uit de scenario-batch.
    solvedFireAgeFractional: solvedRun?.fireAge ?? null,
    currentAge,
    aowAgeFractional: userAowAge.fractional,
    // De wettelijke tabel is server-voorgeladen; is hij leeg, dan staat
    // `userAowAge` nog op de 67-terugval en is het getal dus voorlopig.
    aowTableLoaded: aowRows.length > 0,
    serverFireAge: firstPaintFireAge,
    isRefining: kernelIsRefining,
  })
  const heroFireAgePending = isHeroAnswerPending(heroFireAge)
  const heroFireAgeText = formatHeroFireAge(heroFireAge, { aowText: aowAgeFormatted, dash: '–', pendingText: '···' })
  const heroFireAgeTextMobile = formatHeroFireAge(heroFireAge, { aowText: aowAgeFormatted, dash: '-', pendingText: '···' })
  /** Kassabon-vorm: mét eenheid, en "Niet bereikbaar" i.p.v. een streepje. */
  const heroFireAgeReceiptText =
    heroFireAge.bron === 'aow-tabel'
      ? aowAgeFormatted
      : heroFireAge.age != null
        ? `${heroFireAge.age.toFixed(1)} jaar` // kassabon: exact
        : heroFireAge.status === 'berekenen'
          ? 'Wordt berekend…'
          : 'Niet bereikbaar'
  const aowAgeInt = Math.floor(userAowAge.fractional)
  // De jaarrij op de AOW-leeftijd. Draagt nog precies één ding: de ONTTREKKING
  // (een stroom). De voorraad-kant is hieronder weg — zie de grondslag-noot.
  const aowRow = isPensioenMode && simResult
    ? simResult.rows.find(r => r.age === aowAgeInt && r.phase === 'retirement')
      ?? simResult.rows.find(r => r.age === aowAgeInt)
    : null
  // ── Het vermogen op het STOPMOMENT — één grondslag: Prognose!J (liquide) ──────
  // ADR 0129: onder élk vast anker toont de tegel de GEPROJECTEERDE stand op de
  // ankermaand. `firePortfolioAtFire` (= `requiredFirePortfolio`, bridge.ts) IS die
  // stand, op de netto-LIQUIDE grondslag — zonder eigen woning, ná aftrek van de
  // niet-woningschulden.
  //
  // Vóór deze fix stond er een rij-lookup vóór: `aowRow.startPortfolio`. Dat veld is
  // `row.startNetWorth` = Prognose!**I** (netto vermogen INCL. eigen woning; zie de
  // GRONDSLAG-WAARSCHUWING bij `startNettoLiquide` in lib/unified-projection.ts). Eén
  // kop, twee grootheden — en onder het aow-anker won in de praktijk altijd de I-tak,
  // dus dezelfde tegel stond bij de ene gebruiker op I en bij de andere op J. Dat is
  // exact wat CLAUDE.md verbiedt (`nettoVermogen` en `liquideVermogen` nooit op één
  // oppervlak mengen), en het onderschrift eronder belooft nu expliciet "zonder je
  // huis, na schulden". De voortgangsbalk ernaast meet al op liquide uitputting.
  // Bewust zichtbaar: voor aow-anker-gebruikers mét overwaarde valt dit getal fors
  // lager uit — dát is de correctie.
  const vermogenOpAnker = isFixedAnchorMode && simResult ? simResult.firePortfolioAtFire : null
  // Use actual withdrawal from the sim engine (guardrails-aware) instead of simple SWR calc (#473)
  // De SWR-terugval draait mee op de J-grondslag: je onttrekt uit je liquide pot, niet
  // uit je huis — dus dit is óók de juistere noemer voor die terugval.
  const monthlyWithdrawalAtAow = isPensioenMode && aowRow != null && aowRow.withdrawal > 0
    ? aowRow.withdrawal / 12
    : isPensioenMode && vermogenOpAnker != null
      ? (fireSwr * vermogenOpAnker) / 12
      : null

  // ── Overgang (transition phase) berekening ──────────────────────────────────
  const overgangData = (() => {
    if (!simResult || currentAge == null || simResult.fireAge == null || !simResult.fireReachable || isPensioenMode) return null
    const oFireAge = simResult.fireAge  // integer fire age from unified projection
    const oAowAge = Math.round(userAowAge.fractional)
    const scenario = oFireAge < oAowAge ? 'gap' as const : oFireAge > oAowAge ? 'shortfall' as const : 'none' as const
    if (scenario === 'none') return null
    const start = scenario === 'gap' ? oFireAge : oAowAge
    const end = scenario === 'gap' ? oAowAge : oFireAge
    const yearlyExp = (effectiveInput?.monthlyExpenses ?? 0) * 12
    const baseAow = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
    const yearlyAow = baseAow * 12
    const transRows = (unifiedRows ?? []).filter(r => r.phase === 'transition')
    const portfolioAtStart = transRows.length > 0
      ? transRows[0].startNetWorth
      : simResult.firePortfolioAtFire
    // UR3-08: de J-grondslag (netto LIQUIDE, excl. eigen woning) apart naast de
    // I-grondslag hierboven. Alleen J is eerlijk te vertalen naar op te leven
    // vrijheidsdagen; de kassabon houdt bewust I.
    //
    // LET OP — `transRows` is op productie ALTIJD leeg: de kernel kent geen
    // overbrugging en zet `phase` uitsluitend op 'accumulation' of 'withdrawal'
    // (bridge.ts:44 en :728). De filter hierboven is legacy en houdt alleen stand
    // omdat `portfolioAtStart` een terugval draagt. Zonder eigen terugval zou deze
    // waarde dus overal `undefined` zijn en de vrijheidsdagen-regel op élk echt
    // account verdwijnen in plaats van kloppen.
    //
    // De terugval is J→J, niet J→I: dezelfde grootheid op dezelfde leeftijd, uit
    // de volle rijenset. Terugvallen op de I-grondslag blijft verboden — dan telt
    // de eigen woning mee als op te leven vrijheidsdagen. Ontbreekt ook die rij,
    // dan vervalt de regel liever dan dat hij liegt.
    const nettoLiquideAtStart =
      transRows.length > 0
        ? transRows[0].startNettoLiquide
        : nettoLiquideAtAge(unifiedRows, start)
    const withdrawal = scenario === 'gap' ? yearlyExp : Math.max(yearlyExp - yearlyAow, 0)
    return { scenario, start, end, fireAge: oFireAge, aowAge: oAowAge, yearlyExp, yearlyAow, portfolioAtStart, nettoLiquideAtStart, withdrawal }
  })()

  // ── Onttrekking (withdrawal phase) berekening ──────────────────────────────
  const onttrekkingData = (() => {
    if (!simResult || !simResult.fireReachable || simResult.fireAge == null) return null
    const wRows = (unifiedRows ?? []).filter(r => r.phase === 'withdrawal')
    if (wRows.length === 0) return null
    // (UR3-08 bijvangst) Hier stond een `yearlyExp` die nooit werd geretourneerd
    // — dode code, verwijderd.
    const baseAow = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
    const yearlyAow = baseAow * 12
    const avgWithdrawal = wRows.reduce((s, r) => s + r.withdrawal, 0) / wRows.length
    return {
      start: wRows[0].age,
      end: simResult.displayEndAge,
      startPortfolio: wRows[0].startNetWorth,
      // UR3-08: J-grondslag naast I — zie de toelichting bij `overgangData`.
      nettoLiquideAtStart: wRows[0].startNettoLiquide,
      strategy: simResult.strategy,
      targetEndPortfolio: simResult.targetEndPortfolio,
      yearlyWithdrawal: avgWithdrawal,
      yearlyAow,
    }
  })()

  // ── Weergave-clip: t/m eindleeftijd − 1 (besluit 4 juli 2026) ───────────────
  // Het laatste levensjaar is terminale modelmarge en verdwijnt uit BEELD. We
  // clippen op databron-niveau (`clipRowsToPlanEnd`, puur + getest) zodat de
  // chart-componenten (incl. de sibling-owned sim-chart) onaangeraakt blijven.
  // Grens = kernel-`displayEndAge` (perpetual/pensioen = horizon-cap 100, deplete/
  // legacy = fire_end_age). Idempotent → veilig als een consument elders ook clipt.
  // `displaySimRows` (SimRow[]) volgt verderop, ná `effectiveSimRows`.
  const displayEndAge = simResult?.displayEndAge ?? null
  const displayUnifiedRows = useMemo(
    () => clipRowsToPlanEnd(unifiedRows, displayEndAge),
    [unifiedRows, displayEndAge],
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

  // Chart-x-domein-eindleeftijd = één jaar vóór `displayEndAge`. De projectie-
  // data stopt op `displayEndAge − 1` (het laatste modeljaar dat de kernel als
  // "gemeld" beschouwt; het eindjaar zelf is een cutoff-grens, niet een datapunt
  // — zie de displayRows-clip hierboven). Zonder deze −1 loopt de as door tot
  // `displayEndAge` terwijl er geen data meer is → lege rechtermarge in álle
  // grafieken. Eén afgeleide, gebruikt door alle zes chart-consumers zodat de
  // `useChartZoom`-visibleMax (= endAge van ZoomableChartContainer) vanzelf mee
  // cascadeert. Null-safe: null iff `simResult`/`displayEndAge` ontbreekt, en de
  // consumers hieronder staan alle in de `simResult`-gegate JSX-regio.
  const chartEndAge = useMemo(
    () => (displayEndAge != null ? displayEndAge - 1 : null),
    [displayEndAge],
  )

  // Inflatie-indexfactor per leeftijd (consume-only uit de geclipte weergaverijen).
  // Voedt de meegroeiende erfenis/koopkracht-doellijn in SimChart: het reële
  // doel-van-nu groeit met inflatie mee naar de nominale eindwaarde. Geen eigen
  // inflatie-som. Geclipt zodat de doellijn niet tot het (verborgen) laatste jaar loopt.
  // Dit is de NOMINALE bron van de meegroeiende doellijn, geen weergave-omzetting.
  // De euro-weergave grijpt pas aan in het render-grensblok, waar dit in 'real'
  // een unit-factorlijst wordt (`viewTargetInflationFactors`, N2b).
  const targetInflationFactors = useMemo(
    // euro-view: exempt — nominale bron; de omzetting leeft in het render-grensblok.
    () => displayUnifiedRows.map(r => ({ age: r.age, factor: r.inflationFactor })),
    [displayUnifiedRows],
  )

  // Besteedbaar-vermogenspunten voor de tweede lijn in Pad-modus. Consume-only:
  // `nettoLiquide` (Prognose!J) komt rechtstreeks uit de kernel-rijen — geen eigen
  // som "totaal − overwaarde". Zelfde clip als de hoofdlijn, dus beide lijnen
  // lopen tot dezelfde eindleeftijd. undefined = geen lijn.
  const liquidWealthPoints = useMemo(
    () =>
      showLiquidWealthLine && displayUnifiedRows.length > 1
        ? buildLiquidWealthPoints(displayUnifiedRows)
        : undefined,
    [showLiquidWealthLine, displayUnifiedRows],
  )

  // "Huis wordt nooit verkocht"-melding (Wft-veilig, beschrijvend). Verschijnt
  // wanneer downsize + on_depletion nooit triggert: het huis blijft staan en
  // domineert het getoonde eindvermogen. Alle bedragen consume-only uit de
  // laatste unifiedRow + de strategie-config — geen eigen scommen.
  const housingHeldNotice = useMemo(() => {
    // "Huis wordt nooit verkocht": alleen bij een downsize-strategie met de
    // "wanneer nodig"-trigger (on_depletion) waar de kernel binnen de horizon géén
    // verkoop deed (`kernelHousingSale === null`). Bij een verkoop levert de kernel
    // een verkoop-event; andere modi/triggers passen niet bij de melding-tekst.
    const hs = initialData.housingStrategy
    const housingHeldToEnd =
      hs?.mode === 'downsize' && hs.trigger === 'on_depletion' && kernelHousingSale === null
    if (!housingHeldToEnd) return null
    const rows = unifiedRows ?? []
    if (rows.length === 0) return null
    const lastRow = rows[rows.length - 1]
    const houseValue = Math.round(lastRow.assetBuckets.eigen_huis?.endValue ?? 0)
    const netWorth = Math.round(lastRow.netWorth)
    if (houseValue <= 0 || netWorth <= 0) return null
    const sharePct = Math.round((houseValue / netWorth) * 100)
    // Reëel erfenisdoel: het door de gebruiker ingestelde (niet-geïndexeerde)
    // bedrag indien legacy-strategie; anders het nominale eind-doel terug naar
    // "nu" gerekend via de inflatie-indexfactor op eindleeftijd.
    const realLegacyTarget =
      fireStrategy?.strategy === 'legacy' && (fireStrategy.legacyAmount ?? 0) > 0
        ? Math.round(fireStrategy.legacyAmount)
        // Dit bedrag is PER DEFINITIE het reële erfenisdoel ("je doel in geld van
        // vandaag"), ongeacht de gekozen weergave: geen omzetting, maar de
        // betekenis van de melding zelf. In 'real' nóg een keer delen zou het doel
        // stilletjes verkleinen — precies de dubbele deflatie die dit werk uitsluit.
        // euro-view: exempt — reëel by design, ongeacht de weergave.
        : lastRow.inflationFactor > 0
          // euro-view: exempt — zelfde reden als hierboven: dit is het doel-van-nu.
          ? Math.round((simResult?.targetEndPortfolio ?? 0) / lastRow.inflationFactor)
          : 0
    return {
      houseValue,
      sharePct,
      endAge: lastRow.age,
      realLegacyTarget,
    }
  }, [initialData.housingStrategy, kernelHousingSale, unifiedRows, fireStrategy, simResult])

  // De AOW-stop-wat-als (eigen `evaluateFireAt`-run met deplete-override) is weg —
  // ADR 0129 B11: de snelkoppeling zet alleen de stop-slider; de hoofdrun is de bron.
  const effectiveSimRows = simResult?.rows ?? []

  // Weergave-clip voor de SimRow-oppervlakken (Pad-grafiek + Inkomen&Uitgaven-
  // strip): t/m eindleeftijd − 1, spiegelbeeld van `displayUnifiedRows`. De
  // AOW-stop-wat-als heeft een eigen eindleeftijd → clip die op de eigen grens.
  const displaySimRows = useMemo(
    () => clipRowsToPlanEnd(simResult?.rows ?? null, displayEndAge),
    [simResult?.rows, displayEndAge],
  )
  const displayEffectiveSimRows = useMemo(
    () =>
      clipRowsToPlanEnd(effectiveSimRows, displayEndAge),
    [effectiveSimRows, displayEndAge],
  )
  // Partner-view: vervang de hoofdlijn door het PARTNER-pad (eigen as + FIRE-
  // markers op de partner). Alleen wanneer er een precies partner-pad is
  // (`partnerLine` niet-null); anders degraderen we naar de eigen lijn zodat de
  // grafiek nooit leeg/kapot is. In persoonlijk + huishouden-view blijft de
  // hoofdlijn de EIGEN lijn (huishouden voegt de gecombineerde overlay toe).
  const usePartnerMainLine = isPartnerView && partnerLine !== null
  // Huishouden-view: de gecombineerde lijn is de hoofdlijn (matcht de hero-FIRE).
  const useHouseholdMainLine = isHouseholdView && householdMainLine !== null

  // Rendert KATERN II ("Verken je aannames" / "Jouw doelsituatie")?
  //
  // ÉÉN afleiding, twee lezers: de sectie zelf en de meeklap-toets van KATERN III
  // ("doel dicht = alles dicht"). Die stonden tot melding B-031 als twee
  // handgetypte kopieën in het bestand — precies de constructie die stil uiteen
  // loopt zodra er een tak bijkomt.
  //
  // Perspectief-gate: alleen solo (géén partner/huishouden), spiegelt de
  // chart-overlay. Op een partner-/huishoudlijn slaan de knoppen nergens op —
  // die tekent andere rijen dan waar het lab op rekent.
  //
  // Verder GEEN gate meer op de weergavemodus (eigenaarskeuze 20 sep 2026): het
  // doelscenario staat óók in Eenvoudig. De oude voorwaarde ("alleen als er al
  // een doel is") paste bij het blok van vóór ADR 0170 — twee genummerde panelen
  // met duidingslagen. Wat er nu staat zijn vijf knoppen die zélf hun grens
  // dragen; dat is juist de eenvoudige vorm, en het achterhouden ervan verbergt
  // de manier waaróp je een doel maakt voor precies de lezer die de eenvoudige
  // weergave koos.
  const verkenSectieZichtbaar = !(usePartnerMainLine || useHouseholdMainLine)

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

  // ── Tekort-lening-melding: zichtbaarheid + minimaliseer-toestand ─────────
  // View-gating spiegelt de tijdlijn-marker: in partner-weergave mét partner-pad
  // plot de grafiek de pártnerlijn — dan hoort het eigen tekort-verhaal er niet.
  // De piek wordt aan de `DeficitNoticeProvider` gemeld (paginakop op /toekomst),
  // die bepaalt of de melding uitgeklapt is of ingeklapt tot het statuspunt naast
  // de pagina-'i'. Buiten die provider (legacy /horizon) blijft 'ie uitgeklapt.
  const deficitNoticeVisible = deficitLoanNotice != null && !usePartnerMainLine
  const {
    display: deficitDisplay,
    canMinimize: canMinimizeDeficit,
    minimize: minimizeDeficitNotice,
  } = useDeficitNotice(deficitNoticeVisible ? deficitLoanNotice!.peak : null)

  // ── "AOW ontbreekt"-melding (TPR-04) ───────────────────────────────────────
  // De adapter-notice (code `aow_ontbreekt`) komt via de run mee (`aowOntbreekt`);
  // zelfde view-gating als de tekort-melding: in partner-weergave mét partner-pad
  // hoort het eigen AOW-verhaal er niet. Zusje van de tekort-provider in de /toekomst-kop.
  const aowNoticeVisible = Boolean(aowOntbreekt) && !usePartnerMainLine
  const {
    display: aowDisplay,
    canMinimize: canMinimizeAow,
    minimize: minimizeAowNotice,
  } = useAowNotice(aowNoticeVisible)

  // ── Eindsituatie-duiding: "waarom blijft er aan het eind zoveel over?" ─────
  // Pure detector op DEZELFDE kernelrijen als de grafiek (`unifiedRows`); plan uit de
  // rauwe profielrij via dezelfde resolver als de kernel-adapter (incl. schaduwpad),
  // jaaruitgaven = de grondslag van deze run (`buildHorizonInput`: yearlyMustExpenses).
  // Bedragen blijven NOMINAAL; `EindsituatieNotice` deflateert exact één keer.
  // View-gating als de tekort-melding; niet in pensioen-modus (vast stopmoment).
  const eindsituatiePlan = useMemo(
    () => (kernelRawProfile ? resolveFirePlanWithOverride(kernelRawProfile) : null),
    [kernelRawProfile],
  )
  const eindsituatieDuiding = useMemo(() => {
    if (!eindsituatiePlan || !unifiedRows || currentAge == null || isPensioenMode || usePartnerMainLine) return null
    return detectEindsituatie({
      rows: unifiedRows,
      endForm: eindsituatiePlan.endForm,
      endAge: simResult?.displayEndAge ?? eindsituatiePlan.endAge,
      legacyAmount: eindsituatiePlan.legacyAmount,
      legacyIncludeIlliquid: kernelRawProfile?.fire_legacy_include_illiquid === true,
      vastStopmoment: simResult?.stopAnker != null,
      fireAgeFractional: simResult?.fireAgeFractional ?? null,
      currentAge,
      geenTekortLeningAan: kernelRawProfile?.fire_no_deficit_loan !== false,
      jaarUitgavenNu: input?.yearlyMustExpenses ?? 0,
    })
  }, [eindsituatiePlan, unifiedRows, currentAge, isPensioenMode, usePartnerMainLine, simResult?.displayEndAge, simResult?.stopAnker, simResult?.fireAgeFractional, kernelRawProfile?.fire_legacy_include_illiquid, kernelRawProfile?.fire_no_deficit_loan, input?.yearlyMustExpenses])
  const {
    display: eindsituatieDisplay,
    canMinimize: canMinimizeEindsituatie,
    minimize: minimizeEindsituatieNotice,
  } = useEindsituatieNotice(eindsituatieDuiding != null)

  // Situatie-specifieke uitleg bij de melding. Alle getallen komen uit DEZELFDE
  // run (detector + `displayEndAge` + AOW-leeftijd + woonstrategie); de copy
  // zelf woont in een pure sibling-module met eigen toon-grendel. Bedragen gaan
  // er RÉÉDS geformatteerd in via de canonieke helpers (`formatMaskedCurrency` /
  // `formatWithFreedom` op de bundel-dagbasis) — geen tweede som, geen eigen
  // dag/jaar-conversie.
  const deficitLoanCopy = useMemo(() => {
    if (!deficitLoanNotice || !deficitNoticeVisible) return null
    const freedomText = canonicalDailyRate > 0 && !masked
      ? formatWithFreedom(deficitLoanNotice.peak, canonicalDailyRate, { includeCurrency: false, format: 'long', includeDays: false })
      : null
    return buildDeficitLoanCopy({
      firstAge: deficitLoanNotice.firstAge,
      clearedAge: deficitLoanNotice.clearedAge,
      terugkeerAge: deficitLoanNotice.terugkeerAge,
      housing: initialData.housingContext.hasEigenHuis && initialData.housingStrategy
        ? {
            mode: initialData.housingStrategy.mode,
            saleAge: kernelHousingSale?.age ?? null,
            reverseMortgageStartAge,
          }
        : null,
      aowAge: userAowAge.fractional,
      displayEndAge,
      isPensioenMode,
      homeExcludedFromFire: homeExcludedFromProgress,
      geenTekortLeningAan: kernelRawProfile?.fire_no_deficit_loan !== false,
      vastStopmoment: simResult?.stopAnker != null,
      peakText: formatMaskedCurrency(deficitLoanNotice.peak, masked),
      freedomText,
    })
  }, [deficitLoanNotice, deficitNoticeVisible, canonicalDailyRate, masked, userAowAge.fractional, displayEndAge, isPensioenMode, initialData.housingContext.hasEigenHuis, initialData.housingStrategy, kernelHousingSale, reverseMortgageStartAge, kernelRawProfile?.fire_no_deficit_loan, simResult?.stopAnker, homeExcludedFromProgress])

  // ── Erfgenamen (heirs) derivation for End-of-Life analysis ───────────────
  const erfgenamen = useMemo(() => {
    const heirs: { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[] = []
    const numChildren = initialData.numberOfChildren ?? 0
    const partner = initialData.hasPartner

    if (partner && numChildren > 0) {
      // Dutch default: partner gets child's share (1 / (numChildren + 1))
      const totalShares = numChildren + 1
      heirs.push({ relatie: 'partner', fractie: 1 / totalShares })
      for (let i = 0; i < numChildren; i++) {
        heirs.push({ relatie: 'kind', fractie: 1 / totalShares })
      }
    } else if (partner) {
      // No children: partner inherits everything
      heirs.push({ relatie: 'partner', fractie: 1.0 })
    } else if (numChildren > 0) {
      // No partner: children split equally
      for (let i = 0; i < numChildren; i++) {
        heirs.push({ relatie: 'kind', fractie: 1 / numChildren })
      }
    }
    // If no partner and no children: return empty → engine uses default [kind: 100%]
    return heirs.length > 0 ? heirs : undefined
  }, [initialData.hasPartner, initialData.numberOfChildren])

  // Partner AOW bedrag for end-of-life partner continuation analysis
  const partnerAowBedrag = initialData.hasPartner ? NL_AOW_MONTHLY : undefined

  // V12 — kernel + opeten (deplete): een "impliciete opnamerate" is hier
  // betekenisloos. Bij interen wordt het vermogen bewust opgegeten, dus de
  // jaaronttrekking t.o.v. het (kleine) FIRE-vermogen kan tientallen procenten
  // zijn (bv. 83%) — dat is geen SWR maar een artefact van de deplete-strategie.
  // De Opnamerate-KPI toont dan een teer-op-vermogen-duiding i.p.v. een %.
  const isKernelDepleteRate =
    fireStrategy?.strategy === 'deplete' && !isPensioenMode

  // Countdown afgeleid uit simulatie-engine (consistent met fireAgeFractional). Task 4.2:
  // zolang de worker-run nog niet geland is, telt de server-scalar FIRE-leeftijd
  // (`firstPaintFireAge` uit net_worth_snapshots) — daarna wint de verse projectie.
  const effectiveCountdown = simResult?.fireAgeFractional != null && currentAge != null
    ? deriveCountdown(simResult.fireAgeFractional, currentAge)
    : firstPaintFireAge != null && currentAge != null
      ? deriveCountdown(firstPaintFireAge, currentAge)
      : { countdownYears: fire?.countdownYears ?? 0, countdownMonths: fire?.countdownMonths ?? 0,
          countdownDays: fire?.countdownDays ?? 0, fireDate: fire?.fireDate ?? 'Niet haalbaar' }

  // Eén bron van waarheid voor de PERSOONLIJKE FIRE: de hero-projectie (deze
  // pagina, runUnifiedProjection) is leidend. We geven 'm door aan de
  // huishoud-sectie zodat de "Jouw FIRE-projectie"-kaart EXACT dezelfde
  // leeftijd + doelbedrag toont (i.p.v. een eigen, afwijkende herberekening).
  const personalHeroProjection = simResult
    ? (() => {
        const nw = (effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)
        const yexp = effectiveInput?.yearlyMustExpenses ?? 0
        const yof = yexp > 0 ? nw / yexp : 0
        return {
          fireAge: simResult.fireAge,
          fireAgeFractional: simResult.fireAgeFractional,
          fireTarget: simResult.requiredFirePortfolio,
          freedomPercentage: effectiveFreedomPct,
          fireDate: effectiveCountdown.fireDate,
          freedomYears: Math.max(0, Math.floor(yof)),
          freedomMonths: Math.max(0, Math.round((yof - Math.floor(yof)) * 12)),
        }
      })()
    : null

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

  // Wealth composition projection — directe mapping van UnifiedProjectionRow.assetBuckets
  // Fase 2d (#497): werkelijke per-asset-type data i.p.v. ratio-based deriveWealthCompositionFromSim
  //
  // Fix #3 (eerlijke strategie-weergave): bij niet-include_full-strategieën
  // injecteren we het eigen huis (vastgoed) en/of de hypotheek (schulden)
  // terug in de chart, zodat de gebruiker eerlijk ziet wat de strategie
  // betekent. `filterAssetsForFire` haalt eigen_huis + linked mortgage uit
  // de engine-projectie voor exclude/downsize; voor display willen we ze
  // wél tonen (anders verdwijnt het vastgoed/hypotheek-balkje).
  /**
   * Alleen de hypotheken OP DE EIGEN WONING — dezelfde koppeling die
   * `filterAssetsForFire` gebruikt om ze mét het huis uit de FIRE-pot te halen;
   * een hypotheek op een ander pand telt gewoon mee. Eén bron voor twee
   * oppervlakken: de demping in de Opbouw-grafiek en de buiten-doel-markering
   * in de jaar-kassabon moeten per definitie dezelfde regels raken.
   */
  const eigenHuisMortgageIds = useMemo(
    () => new Set(initialData.housingContext.eigenHuisMortgages.map((d) => d.id)),
    [initialData.housingContext.eigenHuisMortgages],
  )

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

  async function handleActionStatusChange(id: string, status: ActionStatus, data?: Record<string, unknown>) {
    const res = await fetch(`/api/ai/actions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...data }),
    })
    if (res.ok) {
      loadData()
    }
  }

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

  // ── EURO-WEERGAVE: DE RENDER-GRENS ─────────────────────────────────────────
  //   Alles hierboven is NOMINAAL. Alles hieronder consumeert `view*`-waarden.
  //   Buiten dit blok staat in dit bestand géén deflate()/deflateRowsByAge()/
  //   deflatePoints()/deflateSeriesByOffset() en geen deling door inflationFactor.
  //
  //   WAAROM ÉÉN BLOK: dit bestand is >8000 regels. Verspreide deflatie is hier
  //   niet reviewbaar, en een bedrag dat twee keer gedeeld wordt ziet er op het
  //   scherm nog steeds plausibel uit. Eén grens + één factorbron + het merk
  //   `InEuroView<T>` (compile-fout bij een tweede omzetting) is de enige
  //   bescherming die schaalt. Bewaakt door `horizon-client.euro-view.test.ts`.
  //
  //   NAAMCONVENTIE (hard): nominaal = ongesuffixt (`displaySimRows`,
  //   `targetInflationFactors`), gedeflateerd = `view`-prefix (`viewSimRows`).
  //   De JSX verwijst voor euro-bedragen uitsluitend naar `view*`.
  //
  //   TWEE KRUIS-REGIMES (D4): chart-feeds en puntbedragen kruisen de grens in
  //   VIEW-SPACE en gemerkt; rekenrijen (`UnifiedProjectionRow[]` naar de
  //   fase-modals, `PhaseDetailTable`, `HorizonYearDetailsSheet`,
  //   `WealthCompositionChart`) kruisen NOMINAAL en onveranderd — die
  //   componenten lezen `useEuroView()` zelf en deflateren per klasse. Zij
  //   dragen kruis-jaar-identiteiten (kassabons) die een blanket-deling breekt.
  const { view: euroView } = useEuroView()

  // Twee sleutelvormen van ÉÉN bron (`displayUnifiedRows`, dus automatisch de
  // wat-als-rijen zodra een wat-als actief is — de deflator volgt de what-if-
  // inflatie, nooit de basisinflatie uit het profiel):
  //   • op leeftijd  → de eigen lijn en alles wat op de eigen leeftijd-as loopt
  //   • op jaar-offset → feeds waarvan de x-as NIET de eigen leeftijd is
  //                      (partner, huishouden, Monte-Carlo-band)
  const factorByAge = useMemo(() => buildFactorByAge(displayUnifiedRows), [displayUnifiedRows])
  const factorByOffset = useMemo(() => buildFactorByOffset(displayUnifiedRows), [displayUnifiedRows])

  // ── Chart-feeds: rijen ────────────────────────────────────────────────────
  // In 'nominal' geven de helpers dezelfde array-REFERENTIE terug, zodat de
  // memo-/React.memo-keten van dit bestand niet in een re-render-cascade valt.
  const viewDisplaySimRows = useMemo(
    () => deflateRowsByAge(displaySimRows, factorByAge, SIM_ROW_MONEY_FIELDS, euroView),
    [displaySimRows, factorByAge, euroView],
  )
  const viewDisplayEffectiveSimRows = useMemo(
    () => deflateRowsByAge(displayEffectiveSimRows, factorByAge, SIM_ROW_MONEY_FIELDS, euroView),
    [displayEffectiveSimRows, factorByAge, euroView],
  )
  // Vermogensopbouw-staven (WealthCompositionChart): jaarstanden per groep op de
  // eigen leeftijd-as ⇒ leeftijd-sleutel. Deze feed draagt zelf geen deflate/
  // inflationFactor en was daardoor onzichtbaar voor grendel-regels 2 en 3 —
  // de bron-test pint 'm sindsdien expliciet op de callsite.
  const viewWealthCompositionRows = useMemo(
    () => deflateRowsByAge(wealthCompositionRows, factorByAge, STACKED_ROW_MONEY_FIELDS, euroView),
    [wealthCompositionRows, factorByAge, euroView],
  )
  // Partner-/huishoudlijn: eigen leeftijd-as ⇒ op POSITIE sleutelen (K4).
  const viewPartnerLineRows = useMemo(
    () =>
      partnerLine == null
        ? null
        : deflateRowsByAge(
            partnerLine.rows,
            factorMapByPosition(partnerLine.rows, factorByOffset),
            SIM_ROW_MONEY_FIELDS,
            euroView,
          ),
    [partnerLine, factorByOffset, euroView],
  )
  const viewHouseholdMainLineRows = useMemo(
    () =>
      householdMainLine == null
        ? null
        : deflateRowsByAge(
            householdMainLine.rows,
            factorMapByPosition(householdMainLine.rows, factorByOffset),
            SIM_ROW_MONEY_FIELDS,
            euroView,
          ),
    [householdMainLine, factorByOffset, euroView],
  )

  // ── Chart-feeds: puntenreeksen ────────────────────────────────────────────
  // Besteedbaar-reeks: `buildLiquidWealthPoints` seedt op de beginleeftijd met
  // het J(0)-anker en plot daarna de waarde van rij `age` op `age + 1` (zie
  // lib/horizon/liquid-wealth-line.ts). De factor hoort dus bij het BRONJAAR —
  // vandaar de expliciete `x - 1`-sleutel. Zonder die sleutel deflateert deze
  // reeks stil één jaar te ver. Het SEED-punt mapt naar startleeftijd − 1, die
  // bewust niet in `factorByAge` zit: `deflatePoints` laat dat bedrag dan
  // ongemoeid, en dat is exact goed — jaar 0 draagt factor 1.0 (ADR 0093).
  const viewLiquidWealthPoints = useMemo(
    () =>
      liquidWealthPoints == null
        ? undefined
        : deflatePoints(liquidWealthPoints, factorByAge, euroView, x => x - 1),
    [liquidWealthPoints, factorByAge, euroView],
  )
  // Scenario-overlays lopen op de EIGEN leeftijd-as (wat-als/stop-pad/ghosts van
  // dezelfde gebruiker) ⇒ leeftijd-sleutel, met BRONJAAR-sleutel (`x - 1`).
  // Waarom `x - 1`: `simRowsToChartPoints` plot de eindstand van rij `age` op
  // `age + 1` (zie lib/horizon/sim-chart-geometry.ts). De HOOFDLIJN deflateert
  // diezelfde eindstand met de factor van de RIJ (`deflateRowsByAge` op
  // `SIM_ROW_MONEY_FIELDS`, dus f(age)) en tekent hem daarna op `age + 1`. Een
  // overlay die op x=age+1 f(age+1) zou pakken, krijgt één jaar extra deflatie
  // en zakt ~π onder de lijn waar hij tegen afgezet wordt. Zelfde sleutel en
  // zelfde reden als de besteedbaar-lijn hierboven en de Monte-Carlo-band
  // hieronder. Het STAARTpunt (x = laatste leeftijd + 1) valt zonder deze
  // sleutel bovendien buiten `factorByAge` en zou nominaal blijven staan — een
  // zichtbare haak omhoog in 'real'. Het SEED-punt (x = startleeftijd) mapt naar
  // startleeftijd − 1, die bewust niet in de map zit: `deflatePoints` laat het
  // bedrag dan ongemoeid, en dat is exact goed — jaar 0 draagt factor 1.0.
  const viewCombinedScenarioOverlays = useMemo(
    () =>
      euroView === 'nominal'
        ? combinedScenarioOverlays
        : combinedScenarioOverlays.map(o => ({
            ...o,
            points: deflatePoints(o.points, factorByAge, euroView, x => x - 1),
          })),
    [combinedScenarioOverlays, factorByAge, euroView],
  )
  // Huishoud-/partner-overlays: vreemde leeftijd-as ⇒ positie-sleutel (K4).
  const viewHouseholdOverlays = useMemo(
    () =>
      householdOverlays == null || euroView === 'nominal'
        ? householdOverlays
        : householdOverlays.map(o => ({
            ...o,
            // `[1, ...factorByOffset]`: de puntenreeks draagt sinds
            // `simRowsToChartPoints` een SEED op de startleeftijd, gevolgd door
            // één punt per rij op `age + 1`. Positie j=0 is dus de stand van nu
            // (factor 1.0) en positie j=i+1 draagt de eindstand van rij i — die
            // op de hoofdlijn met de factor van díe rij (offset i) wordt
            // gedeflateerd. Het vooropgezette 1-element schuift de offsets één
            // plek op zodat elk punt de factor van zijn BRONrij krijgt; zonder
            // die shift pakt elk punt er één te ver en zakt de overlay ~π onder
            // de hoofdlijn. Leeftijd-as is hier vreemd (partner/huishouden), dus
            // positie draagt de tijd — niet de leeftijd (K4).
            points: deflatePoints(
              o.points,
              factorMapByPosition(
                o.points.map(([age]) => ({ age })),
                [1, ...factorByOffset],
              ),
              euroView,
            ),
          })),
    [householdOverlays, factorByOffset, euroView],
  )
  // Monte-Carlo-band: `number[]` geïndexeerd op jaar-offset vanaf `startAge`.
  // BRONJAAR-SLEUTEL (`i - 1`), om dezelfde reden als de `x - 1` van de
  // besteedbaar-lijn hierboven: band-index `i` staat op leeftijd `startAge + i`,
  // maar draagt de EINDstand van jaar-blok `i − 1` — precies de waarde die de
  // hoofdlijn daar tekent met `rows[i-1].inflationFactor = (1+π)^(i-1)`. Zonder
  // de sleutel krijgt de band één jaar extra deflatie en zakt hij ~π onder de
  // lijn die hij hoort te omvatten. Index 0 (de stand van vandaag) mapt naar
  // factor[0] = 1 en blijft dus ongemoeid.
  const mcBandSourceYear = useCallback((i: number) => Math.max(i - 1, 0), [])
  const viewMonteCarloOverlay = useMemo(
    () =>
      monteCarloOverlay == null || euroView === 'nominal'
        ? monteCarloOverlay
        : {
            ...monteCarloOverlay,
            p10: deflateSeriesByOffset(monteCarloOverlay.p10, factorByOffset, euroView, mcBandSourceYear),
            p25: deflateSeriesByOffset(monteCarloOverlay.p25, factorByOffset, euroView, mcBandSourceYear),
            p50: deflateSeriesByOffset(monteCarloOverlay.p50, factorByOffset, euroView, mcBandSourceYear),
            p75: deflateSeriesByOffset(monteCarloOverlay.p75, factorByOffset, euroView, mcBandSourceYear),
            p90: deflateSeriesByOffset(monteCarloOverlay.p90, factorByOffset, euroView, mcBandSourceYear),
          },
    [monteCarloOverlay, factorByOffset, euroView, mcBandSourceYear],
  )

  // ── Puntbedragen (klasse S — stock op één leeftijd) ───────────────────────
  // De factor hoort bij de leeftijd waar het bedrag bij hoort, niet bij "nu".
  //
  // ÉÉN leeftijdsbron voor élke FIRE-moment-factor, en die loopt door de
  // canonieke weergave-seam `fireAgeForDisplay` (= Math.round). Waarom: de
  // kernelrijen staan op HELE leeftijden, en `factorAtAge` pakt bij een
  // tussenliggende leeftijd de dichtstbijzijnde rij — waarbij een leeftijd exact
  // op .5 naar BENEDEN valt (eerste kleinste afstand wint, rijen oplopend).
  // /overzicht voedt zijn lookup met de al-afgeronde weergave-leeftijd uit
  // diezelfde seam en zou dan naar BOVEN vallen: twee oppervlakken, hetzelfde
  // bedrag, twee deflatoren. Normaliseren bij de bron houdt het rij-keuzegedrag
  // los van de vraag of de aanroeper fractioneel of afgerond aanlevert
  // (AC-F4 / UAT-KRUIS-27).
  const fireFactorAge = useMemo(
    () => fireAgeForDisplay(simResult?.fireAgeFractional ?? simResult?.fireAge ?? null),
    [simResult],
  )
  const viewFireTarget = useMemo(
    () =>
      simResult == null
        ? undefined
        : deflate(
            simResult.requiredFirePortfolio,
            factorAtAge(displayUnifiedRows, fireFactorAge),
            euroView,
          ),
    [simResult, displayUnifiedRows, fireFactorAge, euroView],
  )
  const viewFireTargetInclHome = useMemo(
    () =>
      fireTargetInclHome == null
        ? null
        : deflate(
            fireTargetInclHome,
            factorAtAge(displayUnifiedRows, fireFactorAge),
            euroView,
          ),
    [fireTargetInclHome, displayUnifiedRows, fireFactorAge, euroView],
  )
  const viewTargetEndPortfolio = useMemo(
    () =>
      simResult == null
        ? undefined
        : deflate(simResult.targetEndPortfolio, factorAtAge(displayUnifiedRows, chartEndAge), euroView),
    [simResult, displayUnifiedRows, chartEndAge, euroView],
  )
  // N2b — het geschreven contract met de grafiek (brok C). De geometrie tekent
  // ZONDER factorlijst géén doellijn (`sim-chart-geometry.ts`: geen factoren ⇒
  // `targetLine === null`), dus `undefined` doorgeven zou de erfenis-/koopkracht-
  // lijn in 'real' laten VERDWIJNEN i.p.v. vlak leggen. We leveren daarom een
  // UNIT-factorlijst: dezelfde leeftijdenreeks met factor 1 overal. Dan geldt in
  // de geometrie `endFactor = 1` ⇒ `realTargetNow = het gedeflateerde doel` ⇒ een
  // vlakke polyline op het reële doel-van-nu, met nul wijziging in de geometrie.
  const viewTargetInflationFactors = useMemo(
    () =>
      euroView === 'nominal'
        ? targetInflationFactors
        : targetInflationFactors.map(f => ({ age: f.age, factor: 1 })),
    [targetInflationFactors, euroView],
  )

  // ── Hero-KPI's: puntbedragen op een specifieke leeftijd ───────────────────
  // De FIRE-doelen horen bij de FIRE-leeftijd, het vermogen op het stopmoment bij
  // de ANKERLEEFTIJD en de maandonttrekking bij de AOW-leeftijd. Een generieke
  // "factor van nu" zou hier stelselmatig te weinig deflateren; de leeftijd is juist
  // wat het bedrag zijn koopkracht geeft — dus ook: de leeftijd die bij dít bedrag
  // hoort, niet die van de buurwaarde.
  // Zelfde genormaliseerde leeftijdsbron als `viewFireTarget` hierboven — anders
  // zouden twee FIRE-doelbedragen op dezelfde pagina op een andere rij landen.
  const fireFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, fireFactorAge),
    [displayUnifiedRows, fireFactorAge],
  )
  const aowFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, userAowAge.fractional),
    [displayUnifiedRows, userAowAge.fractional],
  )
  // `vermogenOpAnker` staat op de ANKERMAAND, niet op de AOW-leeftijd — dus de factor
  // van het STOPMOMENT van de run (`SimResult.vastStopLeeftijd`, fractioneel; bridge.ts).
  // Met `aowFactor` werd een `age`-anker van 46 bij een AOW van 68,5 ruim twintig jaar te
  // ver teruggerekend zodra de gebruiker "huidige euro's" aanzette. Onder het aow-anker is
  // `vastStopLeeftijd` gelijk aan de AOW-leeftijd, dus dát pad blijft numeriek identiek.
  // Onder `solved` is het veld `null` en geeft `factorAtAge` 1 — en dan is `vermogenOpAnker`
  // sowieso `null`. Eén deflatie per bedrag (ADR 0090/0093), geen eigen `Math.pow`.
  const ankerFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, simResult?.vastStopLeeftijd ?? null),
    [displayUnifiedRows, simResult?.vastStopLeeftijd],
  )
  const viewFireTargetExclHome = fireTargetExclHome == null ? null : deflate(fireTargetExclHome, fireFactor, euroView)
  const viewBalkVrijheidDoel = deflate(balkVrijheidDoel, fireFactor, euroView)
  const viewEffectiveFireTarget = deflate(effectiveFireTarget, fireFactor, euroView)
  const viewVermogenOpAnker = vermogenOpAnker == null ? null : deflate(vermogenOpAnker, ankerFactor, euroView)
  const viewMonthlyWithdrawalAtAow =
    monthlyWithdrawalAtAow == null ? null : deflate(monthlyWithdrawalAtAow, aowFactor, euroView)

  // ── Lab-dekkingsas: eindvermogen als derde component (ADR 0145 D12) ───────
  // Klasse S — één bedrag op de EINDLEEFTIJD van het plan, dus de factor van díé leeftijd
  // (zelfde patroon als `viewTargetEndPortfolio`/`viewEffectiveFireTarget`). Basis en wat-als
  // delen die ene factor: `displayUnifiedRows` volgt de wat-als-rijen, en twee deflatoren
  // zouden de delta-badge een inflatie-artefact laten tonen i.p.v. het effect van de knoppen.
  // `labDekking.*Eindvermogen` blijft NOMINAAL (dat is ook het doelbedrag dat de sheet
  // schrijft); alleen de weergave hieronder is gedeflateerd.
  const eindvermogenFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, labDekking?.eind ?? chartEndAge),
    [displayUnifiedRows, labDekking, chartEndAge],
  )
  // Eindreview I1 — alleen een `bedrag` (de run haalt de eindleeftijd) wordt omgezet; een
  // opgeraakte run (`op`) heeft geen bedrag en dus niets om te deflateren.
  const basisEindvermogenUitkomst = labDekking?.basisEindvermogen ?? null
  const scenarioEindvermogenUitkomst = labDekking?.scenarioEindvermogen ?? null
  const viewBasisEindvermogen =
    basisEindvermogenUitkomst?.kind === 'bedrag'
      ? deflate(basisEindvermogenUitkomst.nominaal, eindvermogenFactor, euroView)
      : null
  const viewScenarioEindvermogen =
    scenarioEindvermogenUitkomst?.kind === 'bedrag'
      ? deflate(scenarioEindvermogenUitkomst.nominaal, eindvermogenFactor, euroView)
      : null
  /**
   * De uitkomstregel boven de knoppen — AL GEFORMATTEERD (het component formatteert niets).
   * Onder een vast stopmoment de drie grootheden die de dekkingsbalk-tegels toonden
   * (reikt tot · gedekt · eindvermogen), onder `solved` de vrijheidsleeftijd en het verschil.
   * Consume-only: elk getal komt uit `labUitkomst` (ADR 0145) en de euro's uit het
   * euro-weergave-blok hierboven — hier wordt niets herrekend en niets gedeflateerd.
   */
  const labUitkomstRegel = useMemo<LabUitkomstRegel | null>(() => {
    const pijl = (a: string, b: string | null) => (b != null && b !== a ? `${a} → ${b}` : a)
    if (labDekking != null) {
      if (labDekking.basisPct == null) return null
      const euro = (v: number | null, uitkomst: LabEindvermogen | null): string | null => {
        if (uitkomst == null) return null
        if (uitkomst.kind === 'op') return eindvermogenOpTegel(labDekking.eind)
        if (masked || v == null) return MASKED_AMOUNT_PLACEHOLDER
        return formatCurrency(v)
      }
      const basisEuro = euro(viewBasisEindvermogen, basisEindvermogenUitkomst)
      return {
        kind: 'dekking',
        reikt: pijl(
          ankerKort(labDekking.basisReach),
          labDekking.scenarioReach != null ? ankerKort(labDekking.scenarioReach) : null,
        ),
        gedekt: pijl(
          dekkingBadge(labDekking.basisPct),
          labDekking.scenarioPct != null ? dekkingBadge(labDekking.scenarioPct) : null,
        ),
        eindvermogen:
          basisEuro == null
            ? null
            : pijl(basisEuro, euro(viewScenarioEindvermogen, scenarioEindvermogenUitkomst)),
      }
    }
    if (labUitkomst.kind !== 'vrijheidsleeftijd' || labUitkomst.basisFireAge == null) return null
    const { basisFireAge, scenarioFireAge, deltaMaanden } = labUitkomst
    return {
      kind: 'vrijheidsleeftijd',
      vrijOp: pijl(formatAge(basisFireAge), scenarioFireAge != null ? formatAge(scenarioFireAge) : null),
      verschil:
        deltaMaanden == null || Math.abs(deltaMaanden) < 1
          ? 'gelijk'
          : `${Math.abs(deltaMaanden)} mnd ${deltaMaanden < 0 ? 'eerder' : 'later'} vrij`,
    }
  }, [
    labDekking,
    labUitkomst,
    masked,
    viewBasisEindvermogen,
    viewScenarioEindvermogen,
    basisEindvermogenUitkomst,
    scenarioEindvermogenUitkomst,
  ])

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

  // De delta-badge naast `lab-dekking-badge`: alleen als basis ÉN wat-als allebei een bedrag
  // hebben (I1 — bij een (dreigend) tekort draagt de dekkings-badge de beweging al), weg bij
  // maskeren, en weg onder de drempel (M5: een paar euro verschil is ruis).
  const viewLabEindvermogenVerschil =
    !masked && viewBasisEindvermogen != null && viewScenarioEindvermogen != null
      ? Math.round(viewScenarioEindvermogen - viewBasisEindvermogen)
      : 0
  const viewLabEindvermogenDelta =
    Math.abs(viewLabEindvermogenVerschil) >= EINDVERMOGEN_DELTA_DREMPEL ? viewLabEindvermogenVerschil : 0
  // De vaste preview-rij "Eindvermogen" in het vastleg-venster (promotie `eindvermogen`):
  // toont de bedragen in de actieve weergave — de doelwaarde die de sheet schrijft blijft
  // nominaal (`handleDoelVastleggen`). Eindreview I4: staat de weergave op huidige euro's en
  // wijkt het opgeslagen (nominale) bedrag ≥ 1 % af, dan noemt de rij dat bedrag erbij, zodat
  // de doelkaart na de klik geen onverklaard ander getal toont. Aan de overige rijen
  // (`doelPreviews`) verandert niets.
  const viewDoelPreviews = useMemo<DoelParameterPreview[]>(() => {
    if (
      labPromotie.kind !== 'eindvermogen' ||
      viewBasisEindvermogen == null ||
      viewScenarioEindvermogen == null ||
      scenarioEindvermogenUitkomst?.kind !== 'bedrag'
    ) {
      return doelPreviews
    }
    const opgeslagen = scenarioEindvermogenUitkomst.nominaal
    const noot =
      euroView === 'real' && !masked && Math.abs(opgeslagen - viewScenarioEindvermogen) >= 0.01 * Math.abs(opgeslagen)
        ? ` ${eindvermogenOpgeslagenNoot(opgeslagen)}`
        : ''
    return [
      ...doelPreviews,
      {
        parameter: 'eindvermogen',
        label: 'Eindvermogen',
        waarde: `${eindvermogenPreviewWaarde(viewBasisEindvermogen, viewScenarioEindvermogen, labDekking?.eind ?? null, masked)}${noot}`,
        vast: true,
      },
    ]
  }, [doelPreviews, labPromotie, viewBasisEindvermogen, viewScenarioEindvermogen, scenarioEindvermogenUitkomst, euroView, labDekking, masked])

  // ── Cijferbar (LifelineReadout) ───────────────────────────────────────────
  // `netWorth` is klasse S op de gehoverde leeftijd, `monthlyAmount` klasse F in
  // datzelfde jaar — beide dus met de factor van díé rij. De vrijheidstijd volgt
  // het bedrag automatisch: het dagtarief is per definitie een grootheid van
  // VANDAAG en deflateert nooit (D15). Zou je de noemer "voor de consistentie"
  // ook aanpakken, dan pas je de deflatie twee keer toe.
  const viewReadoutData = useMemo(() => {
    if (readoutData == null) return null
    if (euroView === 'nominal') return readoutData
    const factor = factorAtAge(displayUnifiedRows, readoutData.age)
    const netWorth = deflate(readoutData.netWorth, factor, euroView)
    return {
      ...readoutData,
      netWorth,
      monthlyAmount: deflate(readoutData.monthlyAmount, factor, euroView),
      freedomTime: formatFreedomTimeString(
        calculateFreedomTime(Math.max(0, netWorth), canonicalDailyRate),
        'short',
      ),
    }
  }, [readoutData, displayUnifiedRows, euroView, effectiveInput])

  // ── Inkomsten & uitgaven-strook (bronnen-breakdown) ───────────────────────
  // Elke waarde is een jaarstroom in één projectiejaar (klasse F) ⇒ de factor van
  // díé rij. De `*BySource`-records lopen per sleutel door `deflate()` — geen
  // handgerolde deling, zodat de onbruikbare-factor-regel (0/NaN/∞ ⇒ ongemoeid)
  // óók hier geldt. Zonder dit zou wisselen tussen 'totalen' en 'bronnen' twee
  // verschillende grondslagen in dezelfde grafiek tonen.
  const viewIeBreakdownResult = useMemo(() => {
    if (ieBreakdownResult == null || euroView === 'nominal') return ieBreakdownResult
    const deflateRecord = (record: Record<string, number>, factor: number) =>
      Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, deflate(value, factor, euroView)]),
      )
    return {
      ...ieBreakdownResult,
      rows: ieBreakdownResult.rows.map(row => {
        const factor = factorByAge.get(row.age) ?? 1
        return {
          ...row,
          incomeBySource: deflateRecord(row.incomeBySource, factor),
          expenseBySource: deflateRecord(row.expenseBySource, factor),
          totalIncome: deflate(row.totalIncome, factor, euroView),
          totalExpenses: deflate(row.totalExpenses, factor, euroView),
          surplus: deflate(row.surplus, factor, euroView),
        }
      }),
    }
  }, [ieBreakdownResult, factorByAge, euroView])

  // ── Scenario-kaarten ──────────────────────────────────────────────────────
  // `laagsteBuffer` is klasse S: één bedrag op één leeftijd (de kaart toont die
  // leeftijd er letterlijk naast, "op 63") ⇒ de factor van díé leeftijd.
  // `maandruimteOfDelta` blijft ongemoeid: dat is de INSTELLING van de kaart
  // (−€300/mnd, +€250/mnd) — een bedrag van vandaag, geen projectiebedrag.
  // De status-flag (BASIS/GROEN/AMBER/ROOD) blijft op de nominale buffers staan:
  // die vergelijkt de PLANNEN onderling en is geen euro (klasse R).
  const viewScenarioPresets = useMemo(
    () =>
      scenarioPresets == null || euroView === 'nominal'
        ? scenarioPresets
        : scenarioPresets.map(kaart => ({
            ...kaart,
            laagsteBuffer:
              kaart.laagsteBuffer == null
                ? null
                : {
                    ...kaart.laagsteBuffer,
                    bedrag: deflate(
                      kaart.laagsteBuffer.bedrag,
                      factorAtAge(displayUnifiedRows, kaart.laagsteBuffer.age),
                      euroView,
                    ),
                  },
          })),
    [scenarioPresets, displayUnifiedRows, euroView],
  )

  // ── Huishoud-/partner-doel (5a, nazorg R2+R3) ─────────────────────────────
  // `householdHero`/`partnerHero` dragen `fireTarget` als puntbedrag op hun
  // FIRE-leeftijd, uitgedrukt op de leeftijd-as van de ingelogde gebruiker
  // (dezelfde as als de hero-KPI's die `Math.round(fireAge)` tonen). De
  // deflator hangt alleen af van het aantal jaren tot dat moment, dus dezelfde
  // genormaliseerde lookup als het solo-doel (`fireAgeForDisplay`, KRUIS-27).
  // Tot 3 sep 2026 gingen deze bedragen NOMINAAL de approx-naad in, onder
  // hetzelfde "ca."-voorbehoud als het (wél gedeflateerde) solo-doel — één
  // voorbehoud dat twee conventies verborg.
  const viewHouseholdHeroFireTarget = useMemo(
    () =>
      householdHero == null
        ? null
        : deflate(
            householdHero.fireTarget,
            factorAtAge(displayUnifiedRows, fireAgeForDisplay(householdHero.fireAge)),
            euroView,
          ),
    [householdHero, displayUnifiedRows, euroView],
  )
  const viewPartnerHeroFireTarget = useMemo(
    () =>
      partnerHero == null
        ? null
        : deflate(
            partnerHero.fireTarget,
            factorAtAge(displayUnifiedRows, fireAgeForDisplay(partnerHero.fireAge)),
            euroView,
          ),
    [partnerHero, displayUnifiedRows, euroView],
  )

  // ── EINDE EURO-WEERGAVE ────────────────────────────────────────────────────

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
          {/* STEP 3b: overlay-toggle naast de "i" — wijst-tips aan/uit. */}
          <button
            type="button"
            onClick={() => { if (overlayVisible) handleOverlayExit(); else persistOverlayVisible(true) }}
            aria-pressed={overlayVisible}
            aria-label={overlayVisible ? 'Aanscherp-tips verbergen' : 'Aanscherp-tips tonen'}
            title={overlayVisible ? 'Tips verbergen' : 'Tips tonen'}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
              overlayVisible
                ? 'border-[var(--module-active-300)] bg-[var(--module-active-50)] text-[var(--module-active-700)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <Lightbulb className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Tips</span>
          </button>
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

              {!simResult.fireReachable && !isFixedAnchorMode && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="font-sans text-[12px] text-amber-800">
                    {simResult.strategy === 'legacy' ? (
                      <>Je haalt je nalatenschapsdoel{fireStrategy?.legacyAmount ? ` van ${formatMaskedCurrency(fireStrategy.legacyAmount, masked)}` : ''} niet binnen je projectie (tot leeftijd {simResult.displayEndAge}). Verlaag het nalatenschapsbedrag, verhoog je <GlossaryTerm term="spaarquote">spaarquote</GlossaryTerm> of verlaag je uitgaven.</>
                    ) : simResult.strategy === 'perpetual' ? (
                      <>Je vermogen is niet groot genoeg om er blijvend van te leven binnen je projectie (tot leeftijd {simResult.displayEndAge}). Verhoog je <GlossaryTerm term="spaarquote">spaarquote</GlossaryTerm> of verlaag je uitgaven.</>
                    ) : (
                      <>FIRE niet haalbaar binnen je projectie (tot leeftijd {simResult.displayEndAge}). Verhoog je <GlossaryTerm term="spaarquote">spaarquote</GlossaryTerm> of verlaag je uitgaven.</>
                    )}
                    {/* V12 — kernel-hint: hoeveel €/mnd extra sparen het wél haalbaar maakt. */}
                    {kernelStatus === 'unreachable_within_horizon' && kernelMaandHint != null && kernelMaandHint > 0 && (
                      <> Zo&apos;n {formatMaskedCurrency(Math.ceil(kernelMaandHint), masked)}/mnd extra opzij zetten maakt het wél haalbaar binnen je projectie.</>
                    )}
                  </p>
                </div>
              )}

              {/* ADR 0129 D3 — ÉÉN tekort-blok voor elk vast anker (`anchor_shortfall`).
                  `pension_shortfall` en `stop_now_shortfall` blijven tot F4 als aliassen op
                  hetzelfde blok. De zin komt uit anker-copy en noemt de AOW bewust NIET:
                  een tekort kan ook ná de AOW vallen — de oude pensioen-kopij ("vanaf je
                  AOW-leeftijd dekt je inkomen je uitgaven wél") beloofde iets dat de run
                  niet draagt. Beschrijvend (hoe ver reikt het), nergens aansporend. */}
              {(kernelStatus === 'anchor_shortfall' || kernelStatus === 'pension_shortfall' || kernelStatus === 'stop_now_shortfall') && ankerReach != null && (
                <div data-testid="anchor-shortfall-blok" className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="font-sans text-[12px] text-amber-800">
                    {ankerZin(ankerReach, ankerStop ?? { kind: 'now' })}
                  </p>
                </div>
              )}

              {/* V12 — kernel reached_now: nu al genoeg. Stoplicht-"goed"-status
                  (emerald, volgt de accentkeuze bewust NIET — CLAUDE.md-kleurconventie).
                  B93-doel=0-quirk: bij deplete is de status ALTIJD `reached_now`, óók bij
                  een echte latere FIRE-maand — toon deze "nu al stoppen"-banner daarom alleen
                  als de gevonden FIRE-leeftijd (echte solver-waarde) ~ je huidige leeftijd is;
                  anders krijgt /toekomst gewoon de normale grafiek/countdown (reached_at). */}
              {kernelStatus === 'reached_now' && isKernelReachedNowDisplay(simResult.fireAgeFractional, currentAge) && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-positive/30 bg-positive-bg px-3 py-2.5">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                  <p className="font-sans text-[12px] text-[var(--ink-2)]">
                    {/* ADR 0129 — onder een VAST anker is "je kunt nu al stoppen" een
                        tautologie: het stopmoment ligt al vast. De informatieve
                        uitspraak is dan hoe ver het liquide vermogen reikt — de
                        bereik-zin uit anker-copy (statusblok gedekt). */}
                    {isFixedAnchorMode
                      ? (ankerReach != null
                          ? ankerZin(ankerReach, ankerStop ?? { kind: 'now' })
                          : 'Als je op je stopmoment stopt, reikt je liquide vermogen tot het einde van je plan.')
                      : 'Volgens je huidige cijfers kun je nu al stoppen met werken.'}
                  </p>
                </div>
              )}

              {/* V7 — tekort-lening aangesproken: expliciete, uitlegbare melding.
                  De lijn plot netWorth (tekort al gesaldeerd) en vloert op 0, dus een
                  aangesproken tekort-lening is in Pad-modus onzichtbaar. De 0-vloer
                  blijft bewust staan (y-schaal-invariant over meerdere render-sites;
                  netWorth is rekenkundig al de waarheid) — daarom deze melding + de
                  tijdlijn-marker i.p.v. de lijn ontvloeren. Stoplicht-oranje (aandacht),
                  volgt de module-accentkeuze bewust NIET (CLAUDE.md-kleurconventie).
                  View-gating spiegelt de marker: in partner-weergave (met partner-pad)
                  plot de grafiek de pártnerlijn — dan geen eigen tekort-verhaal tonen.

                  MINIMALISEERBAAR (CLAUDE.md-meldingen-conventie): uitgeklapt = deze
                  melding; na "Minimaliseren" blijft alleen het gekleurde statuspunt
                  links naast de pagina-'i' over (`DeficitNoticeDot` in de /toekomst-kop).
                  De aria-live-regio blijft ALTIJD gemount, zodat een screenreader zowel
                  het minimaliseren als het heropenen meekrijgt.

                  KLEUR: amber = de canonieke stoplicht-'warn'-familie (dezelfde die
                  `LEVERAGE_STATUS_DOT.warn` aan het statuspunt geeft), zodat melding en
                  punt één familie zijn. Semantische status, dus bewust GEEN module-accent.
                  De naburige oranje meldingen hierboven zijn pre-existing drift — buiten
                  scope van deze wijziging. */}
              <section role="status" aria-live="polite">
                {deficitLoanCopy && deficitDisplay === 'minimized' && (
                  <span className="sr-only">
                    Melding over je tekort-lening geminimaliseerd. Activeer de gekleurde
                    stip naast de informatie-knop om de melding opnieuw te tonen.
                  </span>
                )}
                {deficitLoanCopy && deficitLoanNotice && deficitDisplay === 'expanded' && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-sans text-[12px] font-semibold text-amber-900">
                          Tekort-lening aangesproken vanaf leeftijd {Math.floor(deficitLoanNotice.firstAge)}
                        </p>
                        {/* Minimaliseren alleen tonen waar de keuze ook onthouden
                            wordt (binnen de provider) — geen knop die niets doet. */}
                        {canMinimizeDeficit && (
                          <button
                            type="button"
                            onClick={minimizeDeficitNotice}
                            aria-label="Minimaliseren"
                            title="Minimaliseren"
                            className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            Minimaliseren
                          </button>
                        )}
                      </div>
                      <p className="mt-1 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.periode} {deficitLoanCopy.waarom}
                      </p>
                      {deficitLoanCopy.woning && (
                        <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                          {deficitLoanCopy.woning}
                        </p>
                      )}
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.piek} {deficitLoanCopy.lijn}
                      </p>
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.instelling}
                      </p>
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.knoppen}
                      </p>
                      {deficitLoanCopy.toonInstellingLink && (
                        <button
                          type="button"
                          onClick={() => router.push('/toekomst/voorkeuren?regel=eindstrategie')}
                          className="mt-1.5 mr-4 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-amber-900 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                          style={{ minHeight: 44 }}
                        >
                          Bekijk of wijzig of een tekort-lening mag &rarr;
                        </button>
                      )}
                      {deficitLoanCopy.toonWoonstrategieLink && (
                        <button
                          type="button"
                          onClick={() => { setStrategieInitialTab('woning'); setActiveModal('strategie') }}
                          className="mt-1.5 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-amber-900 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                          style={{ minHeight: 44 }}
                        >
                          Bekijk of wijzig je woonstrategie &rarr;
                        </button>
                      )}
                      <p className="mt-2 font-sans text-[11px] text-[var(--ink-3)]">
                        {deficitLoanCopy.disclaimer}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* TPR-04 — geen actief AOW-event: de kern rekent bewust met €0 AOW
                  (eigenaarsbesluit, geen terugval op volledige opbouw), maar niet meer
                  stil. Bron = de adapter-notice `aow_ontbreekt` uit dezelfde run; kopij
                  (keuze · effect · waarom) uit `lib/horizon/aow-notice-minimize.ts`, ook
                  de bron van de kassabon-regel. Minimaliseerbaar via `AowNoticeProvider`
                  (statuspunt naast de pagina-'i'); kleur = stoplicht-'aandacht'. Staat
                  bewust NÁ de tekort-sectie: de bron-grendel
                  horizon-client.tekort-lening.test.ts leest de éérste aria-live-sectie. */}
              <section role="status" aria-live="polite">
                {aowDisplay === 'minimized' && (
                  <span className="sr-only">
                    Melding over je AOW geminimaliseerd. Activeer de gekleurde stip naast de
                    informatie-knop om de melding opnieuw te tonen.
                  </span>
                )}
                {aowDisplay === 'expanded' && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-sans text-[12px] font-semibold text-amber-900">
                          {AOW_ONTBREEKT_COPY.kop}
                        </p>
                        {canMinimizeAow && (
                          <button
                            type="button"
                            onClick={minimizeAowNotice}
                            aria-label="Minimaliseren"
                            title="Minimaliseren"
                            className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            Minimaliseren
                          </button>
                        )}
                      </div>
                      <p className="mt-1 font-sans text-[12px] leading-relaxed text-amber-800">
                        {AOW_ONTBREEKT_COPY.keuze} {AOW_ONTBREEKT_COPY.effect}
                      </p>
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {AOW_ONTBREEKT_COPY.waarom}
                      </p>
                      <Link
                        href={AOW_ONTBREEKT_COPY.actieHref}
                        className="mt-2 inline-flex items-center gap-1 font-sans text-[12px] font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                      >
                        {AOW_ONTBREEKT_COPY.actieLabel}
                      </Link>
                    </div>
                  </div>
                )}
              </section>

              {/* Eindsituatie-duiding (plan 17 sep, D) — "waarom blijft er aan het eind
                  zoveel over?". Minimaliseerbaar via `EindsituatieNoticeProvider`
                  (statuspunt naast de pagina-'i'); neutrale horizon-stijl. Staat NÁ de
                  tekort-sectie: de bron-grendel leest de éérste aria-live-sectie. */}
              {eindsituatiePlan && (
                <EindsituatieNotice
                  duiding={eindsituatieDuiding}
                  endForm={eindsituatiePlan.endForm}
                  display={eindsituatieDisplay}
                  canMinimize={canMinimizeEindsituatie}
                  onMinimize={minimizeEindsituatieNotice}
                  canonicalDailyRate={canonicalDailyRate}
                  dailyRateSource={initialData.dailyExpenseRateDetail.source}
                  overschotIsLiquide={!(eindsituatiePlan.endForm === 'legacy' && kernelRawProfile?.fire_legacy_include_illiquid === true)}
                />
              )}

              {/* "Huis wordt nooit verkocht" — beschrijvende info (geen advies, Wft-veilig).
                  Neutrale horizon-toon, niet de rode "fout"-stijl. */}
              {housingHeldNotice && !isPensioenMode && (() => {
                const dRate = canonicalDailyRate
                const freedom = dRate > 0
                  ? formatWithFreedom(housingHeldNotice.houseValue, dRate, { includeCurrency: false, format: 'long', includeDays: false })
                  : null
                return (
                  <div className="mb-4 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/50 px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                      <Home className="mt-0.5 h-4 w-4 shrink-0 text-horizon-600" />
                      <div className="min-w-0">
                        <p className="font-sans text-[13px] font-semibold text-horizon-800">
                          Je huis wordt in deze projectie nooit verkocht
                        </p>
                        <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--ink-2)]">
                          Je hebt ingesteld: verkopen zodra je geld opraakt — maar je inkomen blijft je
                          uitgaven dekken, dus dat moment komt niet. Daardoor blijft je huis staan en
                          groeit het mee in je vermogen:{' '}
                          <span className="font-semibold text-[var(--ink)]">
                            {formatMaskedCurrency(housingHeldNotice.houseValue, masked)}
                          </span>
                          {freedom && !masked ? <> ({freedom} vrijheid)</> : null}, oftewel{' '}
                          <span className="font-semibold text-[var(--ink)]">{housingHeldNotice.sharePct}%</span>{' '}
                          van je vermogen op leeftijd {housingHeldNotice.endAge}. Daardoor ligt je getoonde
                          nalatenschap ver boven je doel
                          {housingHeldNotice.realLegacyTarget > 0
                            ? <> van {formatMaskedCurrency(housingHeldNotice.realLegacyTarget, masked)}</>
                            : null}.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setStrategieInitialTab('woning'); setActiveModal('strategie') }}
                          className="mt-2 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-horizon-800 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                          style={{ minHeight: 44 }}
                        >
                          Wil je je huis eerder verkopen of een andere woonstrategie? Pas je woonstrategie aan &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* ── Overlay toggles boven de grafiek ──
                  `PillRow` houdt deze rij op ÉÉN regel: passen de labels niet,
                  dan vallen ze allemaal weg en blijven de iconen over. Twee rijen
                  pillen aten verticale ruimte die de grafiek zelf nodig heeft.
                  Labels dragen daarom `data-pill-label`.

                  De euro-weergave-badge stond hier; die is verhuisd naar de
                  weergave-sectie bovenaan de sidebar (`EuroViewBadge`).
                  De schakelaar zelf woont in het zoekscherm (⌘K) — één plek voor
                  de status, één voor de knop, in plaats van een badge per
                  grafiek. */}
              <PillRow className="mb-2" ariaLabel="Grafiek-opties">
                {/* De AOW-stop-toggle stond hier (ADR 0129 B11): die is een
                    snelkoppeling op de stop-slider van de vrijheidsas geworden. */}
                {/* Scenario- en Monte-Carlo-toggles zijn line-chart-overlays —
                    niet zinvol op de vermogensopbouw-stack. Verbergen in
                    barchart-mode i.p.v. uitgrijzen: minder visuele ruis,
                    en de gebruiker kan altijd terug-toggelen naar 'Pad'. */}
                {chartMode === 'vermogenspad' && (
                  <>
                  <HideInSimple>
                    <button
                      type="button"
                      onClick={() => setScenariosExpanded(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        scenariosExpanded
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-label="Scenario-lijnen tonen"
                      title="Scenario's"
                    >
                      <GitBranch className="h-3 w-3" />
                      <span data-pill-label className="hidden sm:inline">Scenario&apos;s</span>
                      {scenarioData && scenariosExpanded && (
                        <span data-pill-badge className="flex items-center gap-0.5">
                          {scenarioData.map(s => (
                            <span key={s.name} className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                          ))}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMcExpanded(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        mcExpanded
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-label={mcMarge
                        ? `Marktcheck — ${margeZin(mcMarge)}`
                        : 'Marktcheck tonen — hoeveel je rendement mag tegenvallen'}
                      title={mcFailed
                        ? 'Marktcheck kon niet worden doorgerekend'
                        : mcMarge
                          ? margeZin(mcMarge)
                          : 'Marktcheck: je plan doorgerekend onder wisselende markten'}
                      aria-busy={mcExpanded && mcPending}
                      /* Het label mag NIET wegvallen zolang de datawaarde staat
                         (H21/F2): op smal scherm bleef anders een kaal getal over,
                         dat naast een "succeskans" als kans gelezen werd. Dat liep
                         via `className="inline"` op het label (0,1,0) en verloor
                         altijd van de compact-regel (0,3,0) — B-025. Nu draagt de
                         PIL het keep-signaal, en garandeert de CSS dat label en
                         badge samen reizen. Zonder badge geen keep: dan doet de pil
                         gewoon mee met de compacte stand. */
                      data-pill-keep={mcExpanded && (mcPending || mcFailed || Boolean(mcMarge)) ? '' : undefined}
                    >
                      <FlaskConical className="h-3 w-3" />
                      <span data-pill-label className="hidden sm:inline">
                        Marktcheck
                      </span>
                      {mcExpanded && mcPending && (
                        <span data-pill-badge className="font-mono text-[10px] tabular-nums opacity-60">…</span>
                      )}
                      {mcExpanded && !mcPending && mcFailed && (
                        <span data-pill-badge className="font-mono text-[10px] tabular-nums opacity-60">—</span>
                      )}
                      {/* De datawaarde blijft ook in de compacte pillenbalk staan (daar
                          valt alleen het label weg) — vandaar de korte vorm. */}
                      {mcExpanded && !mcPending && mcMarge && (
                        <span data-pill-badge className="font-mono text-[10px] tabular-nums opacity-75">
                          {margeKort(mcMarge)}
                        </span>
                      )}
                    </button>
                  </HideInSimple>
                  {/* ── Doel-/wat-als-lijn toggle (alleen wanneer er écht een
                      gestippelde lijn te tonen is — zelfde bron-waarheid als de
                      overlay, ADR 0085). Bewust BUITEN HideInSimple: de doellijn
                      zelf rendert in béíde weergavemodi, dus ook in Eenvoudig
                      hoort de gebruiker 'm aan/uit te kunnen zetten. */}
                  {hasDoelLijn && (
                    <>
                    <button
                      type="button"
                      onClick={() => setShowScenarioLine(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        showScenarioLine
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={showScenarioLine}
                      aria-label={`${doelLijnLabel}-lijn tonen`}
                      title={`${doelLijnLabel}-lijn`}
                      /* De delta is hier het punt van de pil → label en badge
                         blijven samen staan zolang die delta er is (B-025). */
                      data-pill-keep={hasScenario && scenarioFireDeltaLabel ? '' : undefined}
                    >
                      {/* Ink-dash-swatch (zelfde SVG als legenda/ScenarioChip) draagt de
                          wat-als-identiteit; de pill volgt verder de horizon-chroom van de rij. */}
                      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="var(--ink-2)" strokeWidth="2" strokeDasharray="6 4" />
                      </svg>
                      <span data-pill-label className="hidden sm:inline">{doelLijnLabel}</span>
                      {/* Delta t.o.v. de basislijn is alleen betekenisvol bij een echt
                          wat-als; een stop-only-lijn zou hier "gelijk" tonen. */}
                      {hasScenario && scenarioFireDeltaLabel && (
                        <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                          {scenarioFireDeltaLabel}
                        </span>
                      )}
                    </button>
                    <span aria-live="polite" className="font-mono text-[10px] text-[var(--ink-3)]">
                      {showScenarioLine && (scenarioPending || stopPadPending) ? 'bijwerken…' : ''}
                    </span>
                    </>
                  )}
                  {/* ── Tweede-grondslag-toggle ──
                      Alleen zichtbaar zodra er écht een tweede lijn te tonen is
                      (`dualBasisAvailable`) — bij "Meerekenen" valt J exact samen
                      met I, dus daar verdwijnt de pill in plaats van een lijn aan te
                      bieden die al zichtbaar is. In Eenvoudig verdwijnt de pill
                      helemaal: het onderscheid mét/zonder huis is secundaire
                      diepte. De lijn zelf blijft door de opgeslagen voorkeur
                      gestuurd en rendert in béíde weergavemodi.

                      LABEL VOLGT DE ROL (ADR 0114): de pill benoemt de lijn die
                      hij schakelt, niet een vaste grondslag. Bij "Uitsluiten" is
                      de J-lijn de hóófdlijn en schakelt deze pill dus de
                      totaallijn ("Met je huis"); in de andere modi andersom.
                      Een pill die "Zonder je huis" heet terwijl die lijn er
                      altijd staat, zou een aan/uit-knop voor niets zijn. */}
                  {dualBasisAvailable && (() => {
                    const secondaryLabel =
                      effectiveChartPrimaryBasis === 'liquid' ? 'Met je huis' : 'Zonder je huis'
                    return (
                    <HideInSimple>
                    <button
                      type="button"
                      onClick={() => persistLiquidLine(!showLiquidLine)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        showLiquidLine
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={showLiquidLine}
                      aria-label={`Lijn ${secondaryLabel.toLowerCase()} tonen`}
                      title={secondaryLabel}
                    >
                      {/* Zelfde swatch als de legenda en de tooltip-regel: fijne
                          horizon-streep. Kleur uit de module-token, niet uit een
                          losse hex (`secondaryStroke` in lib/horizon/sim-chart-geometry.ts). */}
                      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="var(--color-horizon-600)" strokeWidth="1.8" strokeDasharray="2 3" strokeLinecap="round" />
                      </svg>
                      <span data-pill-label className="hidden sm:inline">{secondaryLabel}</span>
                    </button>
                    </HideInSimple>
                    )
                  })()}
                  </>
                )}

                {/* ── Levensgebeurtenissen toggle ── */}
                <button
                  type="button"
                  onClick={() => persistLifeEvents(!showLifeEvents)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    showLifeEvents
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                  aria-pressed={showLifeEvents}
                  aria-label="Levensgebeurtenissen op de tijdlijn tonen"
                  title="Toon je eigen levensgebeurtenissen op de tijdlijn"
                >
                  <Calendar className="h-3 w-3" />
                  <span data-pill-label className="hidden sm:inline">Levensgebeurtenissen</span>
                  {showLifeEvents && events.length > 0 && (
                    <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                      {events.length}
                    </span>
                  )}
                </button>

                {/* ── Doelen toggle (M36) ──
                    Alleen zichtbaar zodra er écht doel-markers te tonen zijn:
                    zonder doelen met streefdatum voegt een lege pill niets toe. */}
                {goalChartMarkers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => persistGoals(!showGoals)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      showGoals
                        ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                        : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                    }`}
                    aria-pressed={showGoals}
                    aria-label="Doelen met een streefdatum op de tijdlijn tonen"
                    title="Toon je doelen op de tijdlijn, op hun streefdatum"
                  >
                    <Target className="h-3 w-3" />
                    <span data-pill-label className="hidden sm:inline">Doelen</span>
                    {showGoals && (
                      <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                        {goalChartMarkers.length}
                      </span>
                    )}
                  </button>
                )}

                {/* ── Natuurlijke mijlpalen toggle ── */}
                <button
                  type="button"
                  onClick={() => persistNaturalMilestones(!showNaturalMilestones)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    showNaturalMilestones
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                  aria-pressed={showNaturalMilestones}
                  aria-label="Natuurlijke mijlpalen tonen"
                  title="Toon automatisch afgeleide mijlpalen (hypotheek afgelost, eerste miljoen, vermogen op, …)"
                >
                  <Sparkles className="h-3 w-3" />
                  <span data-pill-label className="hidden sm:inline">Natuurlijke mijlpalen</span>
                  {showNaturalMilestones && naturalMilestones.length > 0 && (
                    <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                      {naturalMilestones.length}
                    </span>
                  )}
                </button>

                {/* ── Chart mode toggle (compact pill, right-aligned) ──
                    Op mobiel: alleen icon. Op desktop: icon + label.
                    TrendingUp = pad/line; BarChart3 = opbouw/stack. */}
                <div className="ml-auto flex items-center gap-1">
                  {/* "Speel af" — animeert de levenslijn 40→einde; alleen in de
                      volledige weergave en op de pad-grafiek (uitgebreide diepte). */}
                  {chartMode === 'vermogenspad' && (
                    <HideInSimple>
                      <button
                        type="button"
                        onClick={() => setIsPlaying(p => !p)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-horizon-300 bg-horizon-50 px-2.5 py-1 text-[11px] font-medium text-horizon-700 transition-colors hover:bg-horizon-100"
                        aria-pressed={isPlaying}
                        aria-label={isPlaying ? 'Pauzeer afspelen' : 'Speel de levenslijn af'}
                        title={isPlaying ? 'Pauze' : 'Speel af'}
                      >
                        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        <span data-pill-label className="hidden sm:inline">{isPlaying ? 'Pauze' : 'Speel af'}</span>
                      </button>
                    </HideInSimple>
                  )}
                  {(['vermogenspad', 'vermogensopbouw'] as const).map((mode) => {
                    const btn = (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setChartMode(mode)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none ${
                          chartMode === mode
                            ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                        }`}
                        aria-pressed={chartMode === mode}
                        aria-label={mode === 'vermogenspad' ? 'Pad-modus' : 'Opbouw-modus'}
                        title={mode === 'vermogenspad' ? 'Pad' : 'Opbouw'}
                      >
                        {mode === 'vermogenspad'
                          ? <TrendingUp className="h-3.5 w-3.5" />
                          : <BarChart3 className="h-3.5 w-3.5" />}
                        <span data-pill-label className="hidden sm:inline">
                          {mode === 'vermogenspad' ? 'Pad' : 'Opbouw'}
                        </span>
                      </button>
                    )
                    // Beide varianten blijven in béíde weergavemodi staan: de
                    // opbouw-staafgrafiek is een andere blik op dezelfde cijfers,
                    // geen extra diepte — en juist in Eenvoudig de begrijpelijkste.
                    return btn
                  })}
                </div>

                {/* ── Inline ChartTips: kleine "i" met editorial popover ── */}
                <ChartTips
                  storageKey="horizon_main_chart"
                  tips={
                    chartMode === 'vermogenspad'
                      ? getFireProjectionTips({
                          fireAge: simResult.fireAge,
                          aowAge: userAowAge.fractional,
                          currentAge: currentAge ?? 30,
                          hasMonteCarlo: !!monteCarloOverlay,
                          hasBaseline: false,
                          planningMode,
                          // ADR 0129 — onder een vast anker noemt de spotlight het
                          // stopmoment, niet "op 47 bereik je vrijheid" (bevinding 6).
                          stopAnchorFixed: isFixedAnchorMode,
                          stopAge: simResult.vastStopLeeftijd ?? null,
                        })
                      : getWealthCompositionTips({
                          fireAge: simResult.fireAge,
                          aowAge: userAowAge.fractional,
                          currentAge: currentAge ?? 30,
                        })
                  }
                  align="right"
                />
              </PillRow>

              {/* ── Editorial quote-explainers per actieve overlay/optie ── */}
              <ChartOverlayExplainer active={scenariosExpanded && !!scenarioData}>
                De <em>scenario-lijnen</em> tonen je vermogenspad onder een
                voorzichtiger en optimistischer <GlossaryTerm term="rendement">rendement</GlossaryTerm> (±2 procentpunt).
                Zo zie je hoe gevoelig je pad is voor onzekere markten.
              </ChartOverlayExplainer>

              <ChartOverlayExplainer active={mcExpanded && !!mcData}>
                De <GlossaryTerm term="Monte_Carlo"><em>marktcheck</em></GlossaryTerm> rekent je hele plan
                {mcData ? ` ${mcData.runs} ` : ' '}keer opnieuw door met een ander marktverloop —
                opbouw, stoppen én onttrekking. De band toont waar je <GlossaryTerm term="netto_vermogen">netto vermogen</GlossaryTerm> dan
                uitkomt: de middelste helft van de marktverlopen (p25–p75), met de mediaan
                als lijn.
                {mcMarge && (
                  <> Het getal ernaast is je <em>speling</em>: {margeZin(mcMarge)}{' '}
                  {mcMarge.anker === 'aow'
                    ? 'Je hebt nog geen eigen stopleeftijd gekozen, dus rekenen we met je AOW-leeftijd — schuif de stopleeftijd en het getal beweegt mee.'
                    : 'Schuif je stopleeftijd en je ziet direct wat een jaar langer of korter doorwerken aan speling oplevert.'}</>
                )}
                {!mcMarge && (
                  <> Een speling-getal tonen we hier niet: op de gekozen stopleeftijd is er
                  binnen dit plan geen onttrekkingsfase om te toetsen.</>
                )}
                {liquidWealthPoints != null && (
                  <> Let op de <em>grondslag</em>: de band telt je huis mee, de speling kijkt
                  alleen naar het geld waar je bij kunt — dezelfde grondslag als de lijn
                  &ldquo;zonder je huis&rdquo;. Daardoor kan de band ruim boven nul eindigen
                  terwijl de speling krap is: die overwaarde zit in je huis, niet in je
                  portefeuille.</>
                )}
              </ChartOverlayExplainer>

              <ChartOverlayExplainer active={mcExpanded && mcFailed}>
                De <em>marktcheck</em> kon niet worden doorgerekend — er is nu geen band en geen
                percentage. Je plan-lijn zelf klopt gewoon; alleen de doorrekening met wisselende
                markten ontbreekt. Zet de pil uit en weer aan om het opnieuw te proberen.
              </ChartOverlayExplainer>

              {/* Waarom de twee lijnen uit elkaar lopen — feitelijk, geen advies.
                  Het verhaal is hetzelfde, ongeacht welke van de twee de dikke
                  lijn is; alleen de aanwijzing verschilt. */}
              <ChartOverlayExplainer
                active={chartMode === 'vermogenspad' && secondaryLineVisible}
              >
                De lijn <em>zonder je huis</em> toont het deel van je vermogen waar
                je direct bij kunt. Je huis zit daar niet in — daardoor kan de lijn
                met je huis doorgroeien terwijl die andere lijn daalt.
                {effectiveChartPrimaryBasis === 'liquid' && (
                  <> Omdat je je huis buiten je vrijheidsdoel houdt, is de lijn
                  <em> zonder je huis</em> hier de dikke lijn — dezelfde grondslag
                  als de balk eronder.</>
                )}
              </ChartOverlayExplainer>

              <ChartOverlayExplainer active={chartMode === 'vermogensopbouw'}>
                In <em>opbouw</em>-modus zie je de samenstelling van je vermogen —
                hoeveel komt uit eigen bijdragen, hoeveel uit <GlossaryTerm term="rendement">rendement</GlossaryTerm>, en hoe
                schulden je <GlossaryTerm term="netto_vermogen">netto vermogen</GlossaryTerm> drukken. Geeft inzicht in waar je
                groei vandaan komt.
              </ChartOverlayExplainer>

              {/* Cijferbar boven de grafiek — beweegt mee met hover/playback en
                  vervangt de zwevende tooltip. Alleen volledige weergave + pad-modus. */}
              <HideInSimple>
                {chartMode === 'vermogenspad' && viewReadoutData && (
                  <div className="mb-2">
                    <LifelineReadout
                      age={viewReadoutData.age}
                      year={viewReadoutData.year}
                      phaseLabel={viewReadoutData.phaseLabel}
                      phaseColor={viewReadoutData.phaseColor}
                      netWorth={viewReadoutData.netWorth}
                      freedomTime={viewReadoutData.freedomTime}
                      monthlyLabel={viewReadoutData.monthlyLabel}
                      monthlyAmount={viewReadoutData.monthlyAmount}
                      netWorthMoment={viewReadoutData.netWorthMoment}
                      isResting={lifelineAge === null}
                    />
                  </div>
                )}
              </HideInSimple>

              <div className="-mx-4 sm:-mx-6 md:-mx-8 overflow-hidden">
                <ZoomableChartContainer currentAge={currentAge ?? 30} endAge={chartEndAge!}>
                  {(visibleMin, visibleMax, controls) => (
                    <>
                      {/* B-057 — Fin's wachtstand op de grafiek zolang de projectie
                          verouderd is (herlaad / refresh / hersolve). Eerst in de
                          fragment zodat de zoom-knoppen (zelfde z-10) erboven blijven. */}
                      <ProjectieLaadlaag pending={projectiePending} />
                      {/* STEP 3b/4: tips-laag wikkelt de grafiek — markers in een rij
                          boven + onder; de grafiek vervaagt zolang de tips aan staan. */}
                      <ToekomstOverlay
                        visible={overlayVisible && chartMode === 'vermogenspad'}
                        autoScrollIntoView={overlayPrefRestored}
                        onEmphasisChange={setOverlayEmphasis}
                        balloons={toekomstOverlayBalloons}
                        geometry={((): ToekomstOverlayGeometry => {
                          // FIRE-fractie binnen het zichtbare leeftijdsbereik —
                          // dezelfde bron + precedentie als de SimChart hieronder
                          // (single-source, niet herberekend). De plot-insets
                          // matchen CHART_PAD zodat de leader-lines/kaders precies
                          // over het tekengebied vallen.
                          const fireFrac = useHouseholdMainLine
                            ? householdMainLine!.fireAgeFractional
                            : usePartnerMainLine
                              ? partnerLine!.fireAgeFractional
                              : simResult.fireAgeFractional
                          const lo = visibleMin
                          const span = visibleMax - lo
                          const fraction =
                            fireFrac != null && span > 0
                              ? Math.min(Math.max((fireFrac - lo) / span, 0), 1)
                              : null
                          return {
                            padLeft: CHART_PAD.left,
                            padRight: CHART_PAD.right,
                            padTop: CHART_PAD.top,
                            padBottom: CHART_PAD.bottom,
                            fireFraction: fraction,
                          }
                        })()}
                        summary={{
                          // Netto vermogen: canonieke afleiding uit de effectieve input
                          // (totalAssets − totalDebts), niet lokaal herberekend.
                          netWorth: effectiveNetWorth,
                          // Vrijheidsleeftijd: EXACT dezelfde bron + precedentie als de
                          // hero-KPI "vrijheidsleeftijd" (single-source, niet herberekend).
                          freedomAge: hasPerspectiveHero ? perspectiveHero!.fireAge : heroFireAge.age,
                          masked,
                          anchor: planAnchor,
                          ankerReach: hasPerspectiveHero ? null : ankerReach,
                          ankerStop: hasPerspectiveHero ? null : ankerStop,
                        }}
                        onClose={handleOverlayExit}
                      >
                      <div className="relative">
                        {/* Vermogenspad (SimChart) */}
                        <div
                          className="transition-opacity duration-300 ease-in-out"
                          style={{
                            opacity: chartMode === 'vermogenspad' ? 1 : 0,
                            pointerEvents: chartMode === 'vermogenspad' ? 'auto' : 'none',
                            position: chartMode === 'vermogenspad' ? 'relative' : 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                          }}
                          aria-hidden={chartMode !== 'vermogenspad'}
                        >
                          <SimChart
                            emphasis={overlayEmphasis}
                            disableCrosshair={overlayVisible && chartMode === 'vermogenspad'}
                            hoverAge={lifelineAge}
                            onHoverAge={setLifelineAge}
                            hideValueTooltip={displayMode === 'full'}
                            rows={useHouseholdMainLine ? viewHouseholdMainLineRows! : usePartnerMainLine ? viewPartnerLineRows! : (viewDisplaySimRows)}
                            fireAge={useHouseholdMainLine ? householdMainLine!.fireAge : usePartnerMainLine ? partnerLine!.fireAge : (simResult.fireAge)}
                            fireAgeFractional={useHouseholdMainLine ? householdMainLine!.fireAgeFractional : usePartnerMainLine ? partnerLine!.fireAgeFractional : (simResult.fireAgeFractional)}
                            currentAge={useHouseholdMainLine ? (householdMainLine!.currentAge ?? currentAge ?? 30) : usePartnerMainLine ? (partnerLine!.currentAge ?? currentAge ?? 30) : (currentAge ?? 30)}
                            endAge={chartEndAge!}
                            // euro-view: exempt — `cashflows` levert géén zichtbaar bedrag in
                            // SimChart (de prop wordt daar gedestructureerd maar nergens in de
                            // teken-body gebruikt; de tooltip-bedragen komen alle uit `rows`).
                            // Nominaal doorgeven is dus het juiste én het gedrag-neutrale pad.
                            cashflows={simCashflows}
                            fireTarget={viewFireTarget}
                            // Tweede doellijn (incl. woning) alleen op de basis-projectie,
                            // net als targetInflationFactors — niet op partner-/huishoud-/
                            // AOW-stop-lijnen. Bij de dubbele-woning-grondslag (downsize/
                            // opeethypotheek/uitsluiten); anders undefined → één doellijn.
                            fireTargetInclHome={(usePartnerMainLine || useHouseholdMainLine) ? undefined : (showDualFireTarget ? viewFireTargetInclHome! : undefined)}
                            strategy={simResult.strategy}
                            targetEndPortfolio={viewTargetEndPortfolio}
                            // Meegroeiende doellijn alleen op de basis-projectie (niet op
                            // partner-/huishoud-/AOW-stop-lijnen — die hebben eigen rijen).
                            targetInflationFactors={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewTargetInflationFactors}
                            // Besteedbaar-reeks alleen op de basis-projectie: partner-/
                            // huishoud-/AOW-stop-lijnen tekenen andere rijen, waar deze
                            // punten niet bij horen (`dualBasisAvailable`).
                            //
                            // Deze reeks is de PRIMAIRE lijn zodra `primaryBasis`
                            // 'liquid' is — dan moet 'ie er altijd zijn en schakelt de
                            // pill de tweede (totaal)lijn. Staat de primaire lijn op
                            // 'total', dan is dít de tweede lijn en schakelt dezelfde
                            // pill hem uit. Eén schakelaar, twee richtingen:
                            // `secondaryLineVisible`. Valt de tweede lijn weg, dan valt
                            // ook de bijbehorende drempel mee weg (`showExclTargetLine`
                            // resp. `showInclTargetLine` in chart-static-layers.tsx).
                            liquidPoints={dualBasisAvailable ? viewLiquidWealthPoints : undefined}
                            primaryBasis={effectiveChartPrimaryBasis}
                            secondaryLineVisible={secondaryLineVisible}
                            mainLineLabel={useHouseholdMainLine ? 'Gezamenlijk' : usePartnerMainLine ? (partnerName ?? 'Partner') : undefined}
                            // Partner- én huishoud-projectie krijgen dezelfde teal als de
                            // partner-event-markers, zodat de lijn + de partner-gebeurtenissen
                            // visueel bij elkaar horen. FIRE-annotaties blijven goud (COLOR_OPBOUW).
                            mainLineColor={(usePartnerMainLine || useHouseholdMainLine) ? COLOR_PARTNER_EVENT : undefined}
                            scenarioOverlays={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewCombinedScenarioOverlays}
                            // Het verschilvlak onder de basislijn kleurt neutraal zolang het
                            // plan gedekt is, en alleen rood als het plan niet reikt.
                            planZone={labZone}
                            // Bol op het eind van de wat-als-lijn in de stoplichtkleur van de
                            // nalatenschap-knop. Op een partner-/huishoudlijn rekent het lab
                            // niet, dus daar staat ook geen wat-als-lijn om 'm op te zetten.
                            nalatenschapMarker={(usePartnerMainLine || useHouseholdMainLine) ? undefined : nalatenschapMarker}
                            scenarioPending={scenarioPending || stopPadPending}
                            mainPending={projectiePending}
                            monteCarloOverlay={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewMonteCarloOverlay}
                            // euro-view: exempt — het dagtarief (€→vrijheidstijd) is per
                            // definitie een grootheid van VANDAAG en deflateert nooit (D15).
                            // Deflateert het bedrag wél, dan volgt de vrijheidstijd
                            // automatisch mee; ook de noemer aanpakken zou de deflatie
                            // twee keer toepassen.
                            //
                            // Consume, don't recompute: hier stond
                            // `(effectiveInput?.yearlyMustExpenses ?? 0) / 365` — de
                            // PROJECTIE-uitgave als weergave-koers. De grafiek-tooltip gaf
                            // daardoor een andere vrijheidstijd dan élk ander tijdgetal op
                            // deze pagina, die al op `canonicalDailyRate` staan
                            // (eigenaarsbesluit C bij UR3-08, vervolg KRUIS-20).
                            dailyExpenseRate={canonicalDailyRate}
                            householdOverlays={viewHouseholdOverlays ?? undefined}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                            aowAgeFractional={userAowAge.fractional}
                            planningMode={planningMode}
                            stopAnchorFixed={isFixedAnchorMode}
                            showDepletionWarning={false}
                            eventOverlay={chartEventOverlay}
                            onEventClick={handleChartEventClick}
                            onEventDragEnd={handleChartEventDragEnd}
                            onEventDragMove={handleChartEventDragMove}
                            onClusterOpen={handleChartClusterOpen}
                          />
                        </div>

                        {/* Vermogensopbouw (WealthCompositionChart) */}
                        <div
                          className="transition-opacity duration-300 ease-in-out"
                          style={{
                            opacity: chartMode === 'vermogensopbouw' ? 1 : 0,
                            pointerEvents: chartMode === 'vermogensopbouw' ? 'auto' : 'none',
                            position: chartMode === 'vermogensopbouw' ? 'relative' : 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                          }}
                          aria-hidden={chartMode !== 'vermogensopbouw'}
                        >
                          <WealthCompositionChart
                            stackedRows={viewWealthCompositionRows}
                            currentAge={currentAge ?? 30}
                            endAge={chartEndAge!}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                            fireAge={simResult.fireAge}
                            fireAgeFractional={simResult.fireAgeFractional}
                            planningMode={planningMode}
                            aowAgeFractional={userAowAge.fractional}
                            housingSaleAge={kernelHousingSale?.age ?? null}
                            // Het huis blijft in de staaf staan (het is echt bezit), maar
                            // gedempt zodra het buiten het doel valt — dezelfde
                            // strategie-beslissing als de doelbedrag-grondslag hierboven.
                            homeExcludedFromFire={homeExcludedFromProgress}
                            eventOverlay={chartEventOverlay}
                            onEventClick={handleChartEventClick}
                            onClusterOpen={handleChartClusterOpen}
                            onYearClick={(age) => setSelectedYearAge(age)}
                          />
                        </div>
                      </div>
                      </ToekomstOverlay>
                      {/* ── Inkomen & Uitgaven toggle + collapsible chart ── */}
                      <div className="flex w-full items-center border-t border-[var(--border-ed)]">
                        <button
                          type="button"
                          onClick={() => setIncomeExpenseExpanded(prev => !prev)}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors cursor-pointer select-none"
                          style={{ minHeight: 44 }}
                          aria-expanded={incomeExpenseExpanded}
                          aria-controls="income-expense-panel"
                          aria-label={incomeExpenseExpanded ? 'Inkomen & Uitgaven grafiek verbergen' : 'Inkomen & Uitgaven grafiek tonen'}
                        >
                          <span>Inkomen &amp; Uitgaven</span>
                          {incomeExpenseExpanded
                            ? <ChevronUp size={14} />
                            : <ChevronDown size={14} />
                          }
                        </button>
                        {incomeExpenseExpanded && (
                          <div className="flex items-center gap-2 pr-3" onPointerDown={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {(['lines', 'breakdown'] as const).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setIeViewMode(mode)}
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none cursor-pointer ${
                                    ieViewMode === mode
                                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                                  }`}
                                  aria-pressed={ieViewMode === mode}
                                >
                                  {mode === 'lines' ? 'Lijnen' : 'Bronnen'}
                                </button>
                              ))}
                            </div>
                            <ChartTips
                              storageKey="income_expense_chart"
                              tips={getIncomeExpenseTips({
                                fireAge: simResult.fireAge,
                                aowAge: userAowAge.fractional,
                                viewMode: ieViewMode,
                              })}
                              align="right"
                            />
                          </div>
                        )}
                      </div>
                      <div
                        id="income-expense-panel"
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{
                          maxHeight: incomeExpenseExpanded ? (ieViewMode === 'breakdown' ? 420 : 280) : 0,
                          opacity: incomeExpenseExpanded ? 1 : 0,
                        }}
                      >
                        <IncomeExpenseChart
                          rows={viewDisplaySimRows}
                          currentAge={currentAge ?? 30}
                          endAge={chartEndAge!}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          fireAge={simResult.fireAge}
                          planningMode={planningMode}
                          aowAgeFractional={userAowAge.fractional}
                          viewMode={ieViewMode}
                          breakdownResult={viewIeBreakdownResult}
                        />
                      </div>

                      {/* Events timeline aligned to same age axis.
                          Alleen op line-chart (vermogenspad): de bar-chart
                          (vermogensopbouw) toont events al inline boven/onder
                          de bars via ChartEventMarkers — een aparte timeline
                          eronder zou dubbele informatie zijn. */}
                      {chartMode === 'vermogenspad' && eventsForTimeline.length > 0 && (
                        <EventsTimeline
                          events={eventsForTimeline}
                          currentAge={currentAge ?? 30}
                          endAge={chartEndAge!}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          onClusterOpen={(clusterEvents, centerAge) => setClusterSheet({ events: clusterEvents, centerAge })}
                          onViewEvent={id => {
                            // Natuurlijke mijlpalen hebben geen edit-pane; deeplink
                            // naar bron-asset/debt indien beschikbaar.
                            if (id.startsWith('nat-')) {
                              const m = naturalMilestones.find(x => x.id === id)
                              if (m?.category === 'debt') router.push('/core/debts')
                              else if (m?.category === 'asset') router.push('/core/assets')
                              return
                            }
                            setEventPaneEditingId(id)
                            setEventPaneMode('view')
                            setEventPaneOpen(true)
                          }}
                          onEditEvent={id => {
                            if (id.startsWith('nat-')) return // natuurlijke mijlpalen niet bewerkbaar
                            setEventPaneEditingId(id)
                            setEventPaneMode('edit')
                            setEventPaneOpen(true)
                          }}
                          onEventDragEnd={handleEventDragEnd}
                          stopAge={eventStopAge}
                        />
                      )}

                      {/* ── Fase-balk (Opbouw / Overgang / Onttrekking) ──
                          Secundaire diepte → verborgen in Eenvoudig-modus. */}
                      {simResult && currentAge != null && (
                        <HideInSimple>
                        <div className="mt-2" style={{ marginLeft: CHART_PAD.left, marginRight: CHART_PAD.right }}>
                          <PhaseBar
                            currentAge={currentAge}
                            fireAge={simResult.fireAge}
                            fireAgeFractional={simResult.fireAgeFractional}
                            aowAge={userAowAge.fractional}
                            endAge={chartEndAge!}
                            fireReachable={simResult.fireReachable}
                            isPensioenMode={isPensioenMode}
                            onSegmentClick={(fase) => setActiveFaseModal(fase)}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                          />
                        </div>
                        </HideInSimple>
                      )}
                    </>
                  )}
                </ZoomableChartContainer>
              </div>

              {/* ── Doelscenario: vijf knoppen met een driekleurige schaal (ADR 0170) ──
                  Staat IN de grafiekkaart, direct onder de fasering: de knoppen bewegen de
                  gestippelde lijn hierboven, dus ze horen bij die grafiek en niet in een eigen
                  katern eronder. Wat hier stond — twee genummerde panelen, de marge-band, de
                  dekkingsbalk met drie tegels, per-knop antwoordregels, "Wat hoort daarbij?",
                  een uitleg-disclosure en een concept-banner — is vervangen door één blok:
                  uitkomstregel → vijf gekleurde knoppen → opslaan-balk. De grens staat op de
                  knop; dat maakt de duidingslagen overbodig. */}
              {verkenSectieZichtbaar && (
                <section
                  id={VERKEN_SECTION_ID}
                  ref={verkenSectionRef}
                  className="mt-6 scroll-mt-24 border-t border-[var(--border-ed)] pt-4"
                >
                  {/* Eerste-sleep-hint: éénmalig per apparaat een pijl naar de gestippelde
                      lijn, zodat de eerste knopbeweging niet onopgemerkt blijft. */}
                  {firstDragHintVisible && (
                    <p className="mb-2 flex flex-wrap items-baseline gap-x-2 font-sans text-[11px] text-[var(--ink-3)]">
                      <span>Kijk naar de gestippelde lijn in de grafiek ↑ — dat is jouw wat-als.</span>
                      <button
                        type="button"
                        onClick={dismissFirstDragHint}
                        className="font-semibold text-horizon-700 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                      >
                        Begrepen
                      </button>
                    </p>
                  )}

                  <LabKnoppen
                    vraag={heroVraag}
                    knoppen={labKnoppen}
                    nalatenschapNotitie={planEindVorm === 'perpetual' ? LAB_COPY.nalatenschapPerpetual : null}
                    uitkomst={labUitkomstRegel}
                    zone={labZone}
                    pending={labGrenzenPending}
                    weergave={knopWeergave}
                    onWeergaveChange={setKnopWeergave}
                    formatters={labFormatters}
                    stopSlot={
                      // TPR-09 + melding B-038 — de stop-knop is een VERKENNING. Hier staat de
                      // enige plek waar die verkenning het plan kan worden (het volledige plan,
                      // via `planDraftToFireSettingsBody`), náást de verwijzing naar de plek waar
                      // álle plan-keuzes staan. Alleen zichtbaar als de knop van het plan afwijkt.
                      <div className="flex flex-wrap items-center gap-x-4">
                        {!planIsDezeStop && (
                          <button
                            type="button"
                            onClick={() => {
                              setStopPlanError('')
                              setStopPlanConfirmOpen(true)
                            }}
                            disabled={stopPlanSaving}
                            className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-semibold text-horizon-700 underline underline-offset-2 transition-colors hover:text-horizon-800 disabled:no-underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                          >
                            {stopPlanSaving ? 'Opslaan…' : `Maak ${formatAge(effectiveStopAge)} mijn stopmoment`}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveModal('strategie')}
                          className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-medium text-[var(--ink-2)] underline underline-offset-2 transition-colors hover:text-horizon-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                        >
                          Je plan-keuzes &rarr;
                        </button>
                      </div>
                    }
                    marktbias={
                      whatIfBaseline && categorieReturnGroups.length > 0 ? (
                        <WhatIfMarketAssumptions
                          value={scenarioReturnDeltas}
                          onChange={setScenarioReturnDeltas}
                          assetGroups={categorieReturnGroups}
                        />
                      ) : null
                    }
                  />

                  <LabOpslaanBalk
                    toestand={labOpslaanToestand}
                    gezetOp={doelBlok?.gezetOp ?? null}
                    busy={doelSaving}
                    vastleggenMogelijk={doelVastleggenMogelijk}
                    bijwerkenMogelijk={doelBijwerkenMogelijk}
                    onVastleggen={() => setDoelSheetOpen(true)}
                    onHerstel={handleDoelHerstellen}
                    onLoslaten={() => setDoelLoslatenOpen(true)}
                    onReset={handleScenarioReset}
                  />
                  <LabIndicatieRegel />
                </section>
              )}

              {/* ── Legenda + detail-links onder de grafiek ── */}
              <div className="mt-2 space-y-2">
                {/* Scenario legenda */}
                {scenariosExpanded && scenarioData && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {scenarioData.map((s, i) => (
                      <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                        <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: s.color, opacity: 0.7 }} />
                        {s.label}
                        <span className="font-mono tabular-nums text-[var(--ink-4)]">
                          {((fireParams.grossReturn + SCENARIO_VARIANTS[i].delta) * 100).toFixed(1)}%
                        </span>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setActiveModal('scenarios')}
                      className="font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700"
                    >
                      Verdiepen &rarr;
                    </button>
                  </div>
                )}

                {/* Marktcheck-legenda */}
                {mcExpanded && mcData && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {/* Alleen p25–p75 staat in de legenda: dat is sinds 2026-08-09
                        ook exact wat er getekend wordt (en wat de Y-as bepaalt). */}
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                      <span className="inline-block h-2.5 w-3.5 bg-[var(--hor-t,#8a6e42)] opacity-[0.18]" />
                      p25–p75
                    </span>
                    {mcMarge && (
                      <span
                        className="text-[11px] text-[var(--ink-2)]"
                        title={liquidWealthPoints != null
                          ? `${margeZin(mcMarge)} Gemeten op je besteedbaar vermogen (zonder je huis) — de band toont je netto vermogen mét huis.`
                          : margeZin(mcMarge)}
                      >
                        {margeLegenda(mcMarge)}{' '}
                        <span className="text-[var(--ink-4)]">
                          {margeAnkerKort(mcMarge)}
                          {liquidWealthPoints != null && ', zonder huis'}
                        </span>
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--ink-2)]">
                      <span className="font-mono tabular-nums text-[var(--ink-3)]">{mcData.runs}</span> marktverlopen
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveModal('simulations')}
                      className="font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700"
                    >
                      Verdiepen &rarr;
                    </button>
                  </div>
                )}
              </div>

              {/* Voetnoot. "Details" is hier nu zélf de knop (M9): de echte
                  Details-pill staat helemaal bovenin dezelfde kaart, dus wie
                  naar deze regel gescrold heeft ziet 'm niet staan — dat is de
                  "de knop viel buiten het zichtbare deel"-waarneming uit de
                  bevinding. Zelfde handler, geen tweede pad. */}
              <p className="mt-3 font-sans text-[10px] text-[var(--ink-4)]">
                {STRATEGY_LABELS[simResult.strategy].name} &middot; Weergave t/m leeftijd {simResult.displayEndAge - 1} (eindleeftijd {simResult.displayEndAge}) &middot;{' '}
                <button
                  type="button"
                  onClick={() => setSimModalOpen(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="underline underline-offset-2 transition-colors hover:text-horizon-600"
                >
                  Open de jaar-op-jaar-tabel
                </button>
              </p>

              {/* Context-hint: modus indicator + link to StrategieModal */}
              <button
                type="button"
                onClick={() => setActiveModal('strategie')}
                className="mt-1 block font-sans text-[10px] text-[var(--ink-4)] transition-colors hover:text-horizon-600"
                style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}
              >
                {/* ADR 0129 B10 — geen modus-label maar het plan in gewone taal. */}
                {isFixedAnchorMode && ankerStop != null
                  ? <>{ankerTitel(ankerStop)} &middot; <span className="ml-0.5 underline underline-offset-2">Stopmoment wijzigen &rarr;</span></>
                  : <>De app rekent je stopmoment uit &middot; <span className="ml-0.5 underline underline-offset-2">Zelf een stopmoment kiezen &rarr;</span></>}
              </button>

              {/* De wat-als-slider-lab is verplaatst naar de eigen sectie
                  "Verken je aannames" (katern II) onder de grafiek — zie hieronder. */}
            </>
          ) : null}
        </div>
      </section>

      {/* Detail modal (enige interactiepunt voor simulatie) */}
      {simResult && (
        <SimChartModal
          open={simModalOpen}
          onClose={() => setSimModalOpen(false)}
          simResult={simResult}
          cashflows={simCashflows}
          currentAge={currentAge}
          retirementExpenseMethod={null}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          grossReturn={fireParams.grossReturn}
          canonicalDailyRate={canonicalDailyRate}
          unifiedRows={unifiedRows ?? undefined}
        />
      )}

      {/* === KATERN II — Verken je aannames (wat-als slider-lab) ===
          Perspectief-gate blijft intact: alleen solo (géén partner/household —
          spiegelt de chart-overlay: usePartnerMainLine || useHouseholdMainLine
          → géén wat-als-lijn). Weergave: in Volledig altijd; in Eenvoudig
          alléén met een vastgelegd doel (doelActief) — een vástgelegd doel is
          kernfunctionaliteit waar de Doelen-tab naartoe deep-linkt, pure
          verkenning blijft volledig-weergave-diepte.

          S6 (tier 1) — ÉN wanneer er expliciet naartoe gedeeplinkt is:
          `?whatif=open` zet `whatIfInlineOpen` (de welkomstgids-stap "Speel met
          je aannames" gebruikt dat pad). Zonder deze derde tak zette
          die deeplink in Eenvoudig zónder vastgelegd doel state op een sectie
          die niet gemonteerd is en no-opte de scroll stil: een dode
          verwijzing op precies het beginnersoppervlak waar Eenvoudig voor is.
          `whatIfInlineOpen` kan alleen wáár worden via die deeplink of via een
          control binnen deze sectie zelf, dus de gate blijft dicht zolang er
          niemand hierheen verwezen heeft. */}
        {/* Vastleg-/bijwerk-sheet (BottomSheet, boven de nav-pill). */}
        <DoelVastlegSheet
          open={doelSheetOpen}
          onClose={() => setDoelSheetOpen(false)}
          previews={viewDoelPreviews}
          bijwerken={doelActief}
          saving={doelSaving}
          onSubmit={handleDoelVastleggen}
          // ADR 0129/0145 — onder een vast stopmoment schrijft het lab geen fire_age-doel
          // (de sheet filtert de fire-rij als vangnet); de toelichting zegt wat het lab
          // dáár wél vastlegt: of het plan reikt.
          // D12 — bij een GEDEKT plan legt het lab het eindvermogen vast; de toelichting zegt dat.
          fireAgeNietVanToepassing={
            isFixedAnchorMode && planAnchor.kind !== 'solved'
              ? (labPromotie.kind === 'eindvermogen' ? eindvermogenSheetToelichting : dekkingSheetToelichting)(
                  ankerStop ?? (planAnchor.kind === 'age' ? { kind: 'age', stopAge: planAnchor.age } : { kind: 'now' }),
                  simResult?.displayEndAge ?? initialData.firePlan?.endAge ?? null,
                )
              : null
          }
        />

        {/* Gedeelde "Doel loslaten"-bevestiging — zelfde ShellOverlay-confirm
            als /toekomst/doelen. Horizon meldt fouten via toast, dus error="". */}
        <DoelLoslatenConfirm
          open={doelLoslatenOpen}
          busy={doelSaving}
          error=""
          onConfirm={handleDoelLoslaten}
          onClose={() => setDoelLoslatenOpen(false)}
        />

        {/* TPR-09 — "Maak dit mijn plan": bevestiging vóór de verkenning het plan wordt.
            Fouten (validatie/route) inline in de confirm, zodat de gebruiker ze ziet
            naast de keuze die ze afwijzen. */}
        <StopPlanConfirm
          open={stopPlanConfirmOpen}
          busy={stopPlanSaving}
          error={stopPlanError}
          stopAge={effectiveStopAge}
          planAnchor={planAnchor}
          planEndAge={simResult?.displayEndAge ?? initialData.firePlan?.endAge ?? null}
          aowAge={userAowAge.fractional}
          onConfirm={handleStopPlanBevestigen}
          onClose={() => setStopPlanConfirmOpen(false)}
        />

      {/* === KATERN III — Wat het betekent ===
          Eén katern-kaart: SectionLabel + één card-editorial met de drie delen
          (Levensinkomenstrook / Dekkingsradar / Scenario's) als interne segmenten,
          gescheiden door hairlines. Label én kaart renderen zodra ten minste één
          segment rendert (per-segment-condities blijven ongewijzigd). */}
      {(() => {
        const heeftKaternIII =
          coverageNodes.length > 0 ||
          radarAssen !== null ||
          scenarioPresets !== null ||
          scenarioPresetsLoading
        if (!heeftKaternIII) return null
        // Tot ADR 0170 klapte deze duiding mee met KATERN II ("doel dicht = alles
        // dicht"). Dat inklappen bestaat niet meer — het doelscenario staat altijd
        // open in de grafiekkaart — dus is die koppeling vervallen; ze hield de
        // duiding anders permanent verborgen.
        return (
          <>
            <HideInSimple>
              <SectionLabel className="mt-8 sm:mt-10" num="III">Wat het betekent</SectionLabel>
            </HideInSimple>
            <HideInSimple>
              <section ref={duidingSectionRef} className="mt-6 sm:mt-8">
                <div className="card-editorial no-hover-lift divide-y divide-[var(--border-ed)]">
                  {/* === 4b. Levensinkomenstrook (dekkingsgraad per leeftijd) === */}
                  {coverageNodes.length > 0 && (
                    <div className="p-4 sm:p-5">
                      <div className="mb-1">
                        <Kicker className="mb-1">Levensinkomenstrook</Kicker>
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">Dekt je inkomen straks je uitgaven?</h2>
                          {(hasScenario || hasStopKeuze) && !(usePartnerMainLine || useHouseholdMainLine) && <ScenarioChip doelActief={doelActief} hasScenario={hasScenario} />}
                        </div>
                      </div>
                      <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                        Dekkingsgraad per leeftijd — rekent met je gekozen stopleeftijd zodra je die zet.
                      </p>
                      {(() => {
                        const first = coverageNodes[0].age
                        const last = coverageNodes[coverageNodes.length - 1].age
                        const span = Math.max(1, last - first)
                        // Fasegrens = het gekozen stopmoment zodra een expliciete stop gezet is —
                        // de GELANDE stop-run-leeftijd (duidingStopAge), zodat de opbouw/brug-grens
                        // én de dekkingsdip in de strook bij dezelfde rijen horen; anders het
                        // verwacht-FIRE-moment.
                        const fire = Math.round(
                          stopPad != null && duidingStopAge != null
                            ? duidingStopAge
                            : (simResult?.fireAgeFractional ?? simResult?.fireAge ?? first),
                        )
                        const aow = Math.round(userAowAge?.fractional ?? fire)
                        const pct = (a: number) => Math.max(0, Math.min(100, ((a - first) / span) * 100))
                        // Onttrekking begint pas op max(stop, AOW): wie vóórbij de AOW
                        // doorwerkt heeft geen brug én nog geen onttrekking — anders
                        // tellen de segmentbreedtes op tot >100% en spreekt de balk de
                        // (nog groene) opbouw-stippen 67–74 tegen.
                        const segments = [
                          { label: 'Opbouw', color: 'var(--hor-t, #8a6e42)', widthPct: pct(fire) },
                          { label: 'Brug FIRE → AOW', color: 'var(--color-horizon-500)', widthPct: Math.max(0, pct(aow) - pct(fire)) },
                          { label: 'Onttrekking', color: 'var(--kern-t, #58362d)', widthPct: Math.max(0, 100 - pct(Math.max(fire, aow))) },
                        ]
                        // 0%-brede fasen niet meegeven: anders toont de legenda een
                        // "Brug FIRE → AOW"-swatch bij een band die niet bestaat (stop ≥ AOW).
                        return <LevensinkomenStrook nodes={coverageNodes} activeAge={lifelineAge} segments={segments.filter((s) => s.widthPct > 0)} />
                      })()}
                    </div>
                  )}

                  {/* === 4c. Dekkingsradar (vier dekkingsratio's) === */}
                  {radarAssen !== null && (
                    <div className="p-4 sm:p-5">
                      <div className="mb-1">
                        <Kicker className="mb-1">Dekkingsradar</Kicker>
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">Hoe stevig staat je plan?</h2>
                          {(hasScenario || hasStopKeuze) && !(usePartnerMainLine || useHouseholdMainLine) && <ScenarioChip doelActief={doelActief} hasScenario={hasScenario} />}
                        </div>
                      </div>
                      {/* De grondslag hoort in beeld: op wélk scenario (en welke stopleeftijd) rekenen
                          deze assen? Zelfde gelande bron als de assen zelf (duidingStopAge). */}
                      <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                        {/* ADR 0145 — onder een vast stopmoment rekent de radar op het plan
                            (of op een verkend stopmoment); onder `solved` blijft de tekst van vandaag. */}
                        {(isFixedAnchorMode
                          ? radarSubtitel({ stop: ankerStop, verkendStopAge: stopPad != null ? duidingStopAge : null })
                          : null) ??
                          (stopPad != null && duidingStopAge != null
                          ? `Vier dekkingsratio’s — gerekend op je doelscenario: stoppen op ${formatAge(duidingStopAge)} jr.`
                          : scenarioVerwachtFireAge != null
                            ? `Vier dekkingsratio’s — gerekend op je verwachte pad (vrij rond ${formatAge(scenarioVerwachtFireAge)} jr).`
                            : 'Vier dekkingsratio’s — op elk front.')}
                      </p>
                      <Dekkingsradar assen={radarAssen} />
                    </div>
                  )}

                  {/* === 4d. Scenario's naast elkaar (5 preset-kaarten, tegen je basispad) === */}
                  {(scenarioPresets !== null || scenarioPresetsLoading) && (
                    <div className="p-4 sm:p-5">
                      <div className="mb-1">
                        <Kicker className="mb-1">Scenario&apos;s naast elkaar</Kicker>
                        <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">Wat als het anders loopt?</h2>
                      </div>
                      <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                        Vijf paden — één basispad, verbeteringen en één waarschuwing; elk pad wordt afgezet tegen je basispad.
                      </p>
                      <ScenarioKaarten kaarten={viewScenarioPresets ?? []} isLoading={scenarioPresetsLoading} />
                    </div>
                  )}
                </div>
              </section>
            </HideInSimple>
          </>
        )
      })()}

      {/* === 5. Household FIRE Projections === */}
      <HideInSimple>
        <HouseholdFireSection personalProjection={personalHeroProjection} />
      </HideInSimple>



      {/* === 5b. Verloop-grid: Gezondheid + FIRE-leeftijd (Deep Dive) === */}
      <HideInSimple>
        <HorizonTrendGrid
          resilienceSnapshots={resilienceSnapshots}
          healthScoreTotal={healthScore.total}
          healthChartOpen={healthChartOpen}
          onToggleHealth={() => setHealthChartOpen(v => !v)}
          fireAgeChartOpen={fireAgeChartOpen}
          onToggleFireAge={() => setFireAgeChartOpen(v => !v)}
          onOpenResilienceReceipt={() => setShowResilienceReceipt(true)}
        />
      </HideInSimple>


      {/* === 9. Acties (Primary Content) === */}
      {actions.length > 0 && (
        <HideInSimple>
          <section className="mt-4 sm:mt-8">
            <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
              <Zap className="mr-1.5 inline h-3.5 w-3.5 text-horizon-600" />
              Geplande acties (komend jaar)
            </h2>
            <div className="space-y-2">
              {actions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onStatusChange={handleActionStatusChange}
                />
              ))}
            </div>
          </section>
        </HideInSimple>
      )}

      {/* === Phase Modals === */}
      {simResult && currentAge != null && simResult.fireAge != null && (
        <PhaseModalOpbouw
          open={activeFaseModal === 'opbouw'}
          onClose={() => setActiveFaseModal(null)}
          currentAge={currentAge}
          fireAge={simResult.fireAge}
          currentNetWorth={unifiedRows?.[0]?.startNetWorth ?? ((effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0))}
          expectedPortfolioAtFire={simResult.firePortfolioAtFire}
          yearlySavings={(fire?.monthlySavings ?? 0) * 12}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          canonicalDailyRate={canonicalDailyRate}
          dailyRateSource={initialData.dailyExpenseRateDetail.source}
          expectedReturn={fireParams.grossReturn}
          inflationRate={fireParams.inflationRate}
          rows={unifiedRows ?? []}
          assets={initialData.assets}
          debts={debts}
          events={displayEvents}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          monthlyIncome={effectiveInput?.monthlyIncome}
          savingsRate6m={healthScoreInput.effectiveSavingsRatePct}
          // tweede-motor: exempt — fase-modal-invoer, geen hero-KPI; de modal
          // rekent zijn eigen strategie-bewuste doel door. Zie C1.
          fireTarget={fire?.fireTarget}
          hasPartner={initialData.hasPartner}
          marginaalTarief={fireParams.marginaalTarief}
          dateOfBirth={kernelRawProfile?.date_of_birth ?? null}
        />
      )}
      {/* Overgang phase modal */}
      {overgangData && (
        <PhaseModalOvergang
          open={activeFaseModal === 'overgang'}
          onClose={() => setActiveFaseModal(null)}
          transitionScenario={overgangData.scenario}
          startAge={overgangData.start}
          endAge={overgangData.end}
          fireAge={overgangData.fireAge}
          aowAge={overgangData.aowAge}
          yearlyWithdrawal={overgangData.withdrawal}
          yearlyAowIncome={overgangData.yearlyAow}
          yearlyExpenses={overgangData.yearlyExp}
          portfolioAtTransitionStart={overgangData.portfolioAtStart}
          nettoLiquideAtStart={overgangData.nettoLiquideAtStart}
          canonicalDailyRate={canonicalDailyRate}
          dailyRateSource={initialData.dailyExpenseRateDetail.source}
          rows={unifiedRows ?? []}
          inflationRate={fireParams.inflationRate}
          debts={debts}
          events={displayEvents}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          expectedReturn={fireParams.grossReturn}
          currentAge={currentAge ?? overgangData.fireAge}
          annualSavings={(fire?.monthlySavings ?? 0) * 12}
          fireStrategy={fireStrategy}
          currentPortfolio={(effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)}
          monthlyIncome={effectiveInput?.monthlyIncome}
        />
      )}
      {/* Onttrekking phase modal */}
      {onttrekkingData && (unifiedRows ?? simResult) && (
        <PhaseModalOnttrekking
          open={activeFaseModal === 'onttrekking'}
          onClose={() => setActiveFaseModal(null)}
          startAge={onttrekkingData.start}
          endAge={onttrekkingData.end}
          startPortfolio={onttrekkingData.startPortfolio}
          nettoLiquideAtStart={onttrekkingData.nettoLiquideAtStart}
          canonicalDailyRate={canonicalDailyRate}
          dailyRateSource={initialData.dailyExpenseRateDetail.source}
          strategy={onttrekkingData.strategy}
          targetEndPortfolio={onttrekkingData.targetEndPortfolio}
          yearlyWithdrawal={onttrekkingData.yearlyWithdrawal}
          yearlyAowIncome={onttrekkingData.yearlyAow}
          rows={unifiedRows ?? []}
          inflationRate={fireParams.inflationRate}
          debts={debts}
          events={displayEvents}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          expectedReturn={fireParams.grossReturn}
          assets={initialData.assets}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          hasPartner={initialData.hasPartner}
          erfgenamen={erfgenamen}
          partnerAowBedrag={partnerAowBedrag}
          currentAge={currentAge ?? undefined}
        />
      )}

      {/* === KPI Kassabon Modals === */}
      <BottomSheet open={showFireAgeReceipt} onClose={() => setShowFireAgeReceipt(false)} title={heroAgeLabel}>
        <div className="p-5">
          <KassabonShell>
            {/* M6: de motor gaf een leeftijd op/voorbij het horizonplafond — dat is
                de parkeerstand, geen antwoord. Melding vóór de onderbouwing. */}
            {showFireAgeNotice && (
              <div className="mb-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5 font-sans text-[11px] leading-relaxed text-[var(--ink-2)]">
                <strong className="font-semibold text-[var(--ink)]">{HORIZON_MISSENDE_GEGEVENS_LABEL}.</strong>{' '}
                {fireAgeNoticeGuard.hint}
              </div>
            )}
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{heroAgeLabel.toUpperCase()}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {isFixedAnchorMode
                  ? 'Bereik uit de simulatie-engine — onttrekking vanaf je stopmoment'
                  : simResult?.fireAgeFractional != null ? 'Simulatie-engine berekening' : 'Statische projectie'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isFixedAnchorMode
                ? (ankerReach != null
                    ? ankerZin(ankerReach, ankerStop ?? { kind: 'now' })
                    : 'De leeftijd tot waar je liquide vermogen je uitgaven dekt als je op je stopmoment stopt.')
                : 'De leeftijd waarop je vermogen voldoende is om je uitgaven te dekken zonder te werken.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Huidig netto vermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={(effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)} tone="horizon" />}</span>
              </div>
              {/* Zelfde conditie als de besteedbaar-vermogenslijn: eigen woning ÉN een
                  niet-meetellen-strategie (bij include_full is J ≡ I, dus "belegbaar"
                  zou hier het totaal herhalen). Consumeert de gedeelde helper i.p.v.
                  de conditie letterlijk te dupliceren. */}
              {showLiquidWealthLine && (
                  <div className="flex justify-between py-0.5">
                    <span
                      className="font-sans text-sm text-[var(--ink-2)]"
                      title="Het deel van je vermogen dat de FIRE-engine gebruikt — eigen woning telt niet automatisch mee."
                    >
                      Belegbaar voor pensioen
                    </span>
                    <span className="tabular-nums text-[var(--ink)]">
                      <MaskedAmount value={initialData.fireEligibleNetWorth} tone="horizon" />
                    </span>
                  </div>
                )}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse besparing</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={(fire?.monthlySavings ?? 0) * 12} tone="horizon" />}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwacht rendement</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.grossReturn * 100).toFixed(1)}%</span>
              </div>
              {/* M5 — de tweede aanname onder élk prognosegetal. De bevinding
                  wees erop dat rendement wél in de kassabon stond en inflatie
                  niet, terwijl juist die twee samen bepalen hoeveel het bedrag
                  straks wáárd is. Bron is `fireParams.inflationRate` (profiel →
                  resolveFireParams) — dezelfde waarde waarmee de kernel rekent,
                  niet een eigen aanname. */}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwachte inflatie</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.inflationRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Pensioenuitgaven/jr</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              {/* TPR-04 — de stille €0 benoemd: zonder actief AOW-event rekent de run
                  (adapter-notice `aow_ontbreekt`) met €0 AOW. Zelfde bron en kopij als
                  de melding boven de grafiek; geen eigen event-telling hier. */}
              {aowOntbreekt && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">{AOW_ONTBREEKT_COPY.kassabonLabel}</span>
                  <span className="tabular-nums text-[var(--ink)]">{AOW_ONTBREEKT_COPY.kassabonWaarde}</span>
                </div>
              )}
              {/* ADR 0129 — het stopmoment als aanname in de bon (uit `vastStopLeeftijd`, nooit `fireAge`). */}
              {isFixedAnchorMode && ankerStop != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Stopmoment</span>
                  <span className="tabular-nums text-[var(--ink)]">{ankerStop.kind === 'now' ? 'nu' : `${formatStopAge(ankerStop.stopAge)} jaar`}</span>
                </div>
              )}
              {isFixedAnchorMode && heroFireAge.anker?.solvedFireAge != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Vrij mogelijk vanaf</span>
                  <span className="tabular-nums text-[var(--ink)]">{heroFireAgeYear(heroFireAge.anker.solvedFireAge)} jaar</span>
                </div>
              )}
              {isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">AOW-leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{aowAgeFormatted}</span>
                </div>
              )}
              {/* Beide zijn puntbedragen op de AOW-leeftijd (klasse S resp. F) en
                  moeten hetzelfde tonen als de KPI hierboven — anders spreekt de
                  onderbouwing de kaart tegen. Onder het aow-anker valt de ankermaand
                  samen met de AOW-leeftijd, dus dit bedrag hoort hier; de grondslag is
                  netto LIQUIDE (Prognose!J), zoals het onderschrift bij de KPI zegt. */}
              {isPensioenMode && viewVermogenOpAnker != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Vermogen op AOW</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(viewVermogenOpAnker)} tone="horizon" />}</span>
                </div>
              )}
              {isPensioenMode && viewMonthlyWithdrawalAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Mnd. onttrekking</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" />}</span>
                </div>
              )}
              {!isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]"><GlossaryTerm term="swr">Opnamerate</GlossaryTerm></span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">{heroAgeLabel}</span>
              <span className="tabular-nums text-[var(--ink)]">{heroFireAgeReceiptText}</span>
            </div>

            {/* Optimistisch/pessimistisch zijn FIRE-leeftijden uit de scenarioband —
                onder 'Nu stoppen' bestaat er geen FIRE-moment om te spreiden (D1). */}
            {!isFixedAnchorMode && range && range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null && (
              <div className="mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Optimistisch</span>
                  <span className="tabular-nums text-[var(--ink)]">{Math.round(range.optimistic.fireAge)} jaar</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Pessimistisch</span>
                  <span className="tabular-nums text-[var(--ink)]">{Math.round(range.pessimistic.fireAge)} jaar</span>
                </div>
              </div>
            )}


            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> {isFixedAnchorMode
                ? 'Onttrekking start op je stopmoment. Het bereik is de eerste maand waarin je liquide vermogen aanhoudend op nul staat — omgerekend naar een leeftijd.'
                : 'Portfolio groeit met rendement + jaarlijkse besparing. FIRE is bereikt wanneer portfolio ≥ doelbedrag.'}</p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">{isFixedAnchorMode && ankerStop != null ? `${ankerTitel(ankerStop)} — gerekend vanaf dat moment` : 'Berekend op basis van huidig vermogen, spaargedrag en verwacht rendement'}</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      {/* De aftel-kassabon ("Aftellen naar vrijheid") is verwijderd: er was geen enkele
          aanroeper van `setShowCountdownReceipt(true)` meer (dode code sinds de
          figures-strip), en onder een vast anker is er niets om naar af te tellen. */}
      <BottomSheet open={showFireTargetReceipt} onClose={() => setShowFireTargetReceipt(false)} title={isFixedAnchorMode ? 'Vermogen op je stopmoment' : 'FIRE Doelbedrag'}>
        <div className="p-5">
          <KassabonShell>
            {/* M6: dezelfde vangrail als op de KPI-tegel — de bon mag nooit een
                bedrag onderbouwen dat de tegel als "we missen gegevens" toont. */}
            {showFireTargetNotice && (
              <div className="mb-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5 font-sans text-[11px] leading-relaxed text-[var(--ink-2)]">
                <strong className="font-semibold text-[var(--ink)]">{HORIZON_MISSENDE_GEGEVENS_LABEL}.</strong>{' '}
                {fireTargetGuard.hint}
              </div>
            )}
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{isFixedAnchorMode ? 'VERMOGEN OP JE STOPMOMENT' : 'FIRE DOELBEDRAG'}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {isFixedAnchorMode
                  ? 'Geprojecteerd — een uitkomst, geen doel'
                  : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : `Klassieke FIRE-berekening (${(fireSwr * 100).toFixed(2)}% SWR)`}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {/* ADR 0129 D4 — onder een vast anker bestaat er geen doelbedrag (de kernel
                  bisecteert op tijd, niet op kapitaal); de bon onderbouwt de PROJECTIE. */}
              {isFixedAnchorMode
                ? 'Het geprojecteerde liquide vermogen op je stopmoment. Onder een vast stopmoment is er geen doelbedrag: de vraag is niet hoeveel je nodig hebt, maar tot welke leeftijd dit vermogen reikt.'
                : 'Het minimale vermogen waarmee je jaarlijkse pensioenuitgaven volledig kunt dekken.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              {isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">AOW-leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{aowAgeFormatted}</span>
                </div>
              )}
              {/* Onder een vast anker geen opnamerate-regel: uitgaven ÷ huidig vermogen
                  is daar betekenisloos (bevinding 6). */}
              {!isFixedAnchorMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Opnamerate (SWR)</span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>
              )}
              {/* M5 — de twee aannames waaruit die SWR volgt (rendement − Box 3-
                  druk − inflatie). Zonder deze regels is het doelbedrag een kaal
                  getal en de opnamerate een onverklaarde constante. Beide uit
                  `fireParams`, dus dezelfde waarden als de kernel gebruikt. */}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwacht rendement</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.grossReturn * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwachte inflatie</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.inflationRate * 100).toFixed(1)}%</span>
              </div>
              {isPensioenMode && viewMonthlyWithdrawalAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Mnd. onttrekking op AOW</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" />}</span>
                </div>
              )}
              {!isPensioenMode && simResult?.requiredFirePortfolio != null && (
                <div className="py-0.5 font-sans text-[11px] italic text-[var(--ink-3)]">
                  Simulatie houdt rekening met AOW, pensioen en levensgebeurtenissen
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              {/* ADR 0129 — geen "Benodigd"-totaalregel onder een vast anker: het bedrag is
                  de geprojecteerde stand op het stopmoment, geen doel. */}
              <span className="text-[var(--ink)]">{isFixedAnchorMode ? 'Vermogen op je stopmoment (geprojecteerd)' : 'Benodigd'}</span>
              <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={isFixedAnchorMode ? (viewVermogenOpAnker ?? 0) : viewEffectiveFireTarget} tone="horizon" />}</span>
            </div>

            <div className="mt-3 flex justify-center">
              {/* De vrijheidstijd volgt automatisch het (eventueel gedeflateerde)
                  bedrag — het dagtarief zelf blijft een grootheid van vandaag (D15). */}
              <FreedomTimeBadge amount={isFixedAnchorMode ? (viewVermogenOpAnker ?? 0) : viewEffectiveFireTarget} />
            </div>

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p>
                <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                {isFixedAnchorMode
                  ? 'Vermogensprojectie op je stopmoment via de simulatie-engine (incl. Box 3, inflatie en levensgebeurtenissen)'
                  : simResult?.requiredFirePortfolio != null
                    ? 'Levenslange simulatie (opbouw + verbruik tot leeftijd 90, incl. Box 3 en inflatie)'
                    : fireStrategy?.strategy === 'deplete'
                      ? `Doelbedrag = PV-annuïteit: uitgaven × (1 − (1+r)⁻ⁿ) / r — vermogen ≈ €0 op leeftijd ${fireStrategy.endAge}`
                      : fireStrategy?.strategy === 'legacy'
                        ? `Doelbedrag = Jaaruitgaven ÷ SWR + erfenisbuffer (${formatMaskedCurrency(fireStrategy.legacyAmount, masked)})`
                        : `Doelbedrag = Jaaruitgaven ÷ SWR = ${formatMaskedCurrency(effectiveInput?.yearlyMustExpenses ?? 0, masked)} ÷ ${(fireSwr * 100).toFixed(2)}%`}
              </p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              {isFixedAnchorMode ? 'Geprojecteerd op je stopmoment — een uitkomst, geen doel' : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : fireStrategy?.strategy === 'deplete' ? 'Deplete strategie — PV-annuïteitsformule' : fireStrategy?.strategy === 'legacy' ? 'Legacy strategie — erfenis-gebaseerd doelbedrag' : 'Klassieke FIRE-berekening'}
            </p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showSwrReceipt} onClose={() => setShowSwrReceipt(false)} title="Opnamepercentage">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">OPNAMEPERCENTAGE</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {simResult?.implicitWithdrawalRate != null ? 'Simulatie vs. ingestelde SWR' : 'Ingestelde SWR (Safe Withdrawal Rate)'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Het opnamepercentage bepaalt hoeveel je jaarlijks uit je vermogen opneemt na FIRE.
              {simResult?.implicitWithdrawalRate != null
                ? ' De simulatie berekent een impliciet percentage dat afwijkt van je ingestelde SWR, omdat toekomstige inkomsten (AOW, pensioen) je onttrekkingsbehoefte verlagen.'
                : ' Een lager percentage betekent meer veiligheid — je vermogen gaat langer mee.'}
            </div>

            {/* ── Sectie 1: Klassieke SWR berekening ── */}
            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Klassieke berekening</p>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Ingestelde SWR</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Klassiek doelvermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr)} tone="horizon" />}</span>
              </div>
              <p className="mt-1 font-sans text-[10px] italic text-[var(--ink-4)]">
                Uitgaven ÷ SWR = {<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />} ÷ {(fireSwr * 100).toFixed(2)}% = {<MaskedAmount value={Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr)} tone="horizon" />}
              </p>
            </div>

            {/* ── Sectie 2: Simulatie-berekening (alleen als simResult beschikbaar) ── */}
            {simResult?.implicitWithdrawalRate != null && (() => {
              const yearlyExp = effectiveInput?.yearlyMustExpenses ?? 0
              const fireAge = simResult.fireAgeFractional ?? simResult.fireAge ?? 0
              const fireAgeInt = Math.ceil(fireAge)

              // Inkomstenkasstromen actief op FIRE-leeftijd
              const incomeCfAtFire = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge <= fireAgeInt && (cf.toAge === null || cf.toAge > fireAgeInt)
              )
              const yearlyIncomeAtFire = incomeCfAtFire.reduce((s, cf) => s + cf.amount * 12, 0)

              // Inkomstenkasstromen actief op AOW-leeftijd (dynamisch uit aow_leeftijd tabel)
              const aowAge = Math.ceil(userAowAge.fractional)
              const incomeCfAtAow = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge <= aowAge && (cf.toAge === null || cf.toAge > aowAge)
              )
              const yearlyIncomeAtAow = incomeCfAtAow.reduce((s, cf) => s + cf.amount * 12, 0)

              // Pensioen-fase rijen uit de simulatie
              const pensionRows = simResult.rows.filter(r => r.phase === 'retirement')
              const firstPensionRow = pensionRows.length > 0 ? pensionRows[0] : null
              const rowAtAow = pensionRows.find(r => r.age === aowAge) ?? null

              // Heeft de gebruiker kasstromen na AOW-leeftijd die nog niet op FIRE-moment actief zijn?
              const laterCashflows = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge > fireAgeInt
              )

              const implicitPct = simResult.implicitWithdrawalRate * 100
              const ingesteldPct = fireSwr * 100
              const diff = implicitPct - ingesteldPct
              const classicTarget = yearlyExp / fireSwr
              const portfolioDiff = classicTarget - simResult.requiredFirePortfolio

              return (
                <>
                  <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                    <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-horizon-600">Simulatie-berekening</p>
                    <div className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                      <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={yearlyExp} tone="horizon" />}</span>
                    </div>

                    {/* Inkomsten na FIRE die de onttrekking verlagen */}
                    {(incomeCfAtFire.length > 0 || laterCashflows.length > 0) && (
                      <>
                        {incomeCfAtFire.map(cf => (
                          <div key={cf.id} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-horizon-600">
                              − {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name}
                              <span className="ml-1 text-[10px] text-[var(--ink-4)]">vanaf {cf.fromAge} jr</span>
                            </span>
                            <span className="tabular-nums text-horizon-600">− {<MaskedAmount value={Math.round(cf.amount * 12)} tone="horizon" />}/jr</span>
                          </div>
                        ))}
                        {laterCashflows.map(cf => (
                          <div key={cf.id} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-[var(--ink-3)]">
                              − {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name}
                              <span className="ml-1 text-[10px] text-[var(--ink-4)]">vanaf {cf.fromAge} jr</span>
                            </span>
                            <span className="tabular-nums text-[var(--ink-3)]">− {<MaskedAmount value={Math.round(cf.amount * 12)} tone="horizon" />}/jr</span>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">Benodigd FIRE-vermogen</span>
                      <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(simResult.requiredFirePortfolio)} tone="horizon" />}</span>
                    </div>
                  </div>

                  {/* Totaalregel: impliciet opnamepercentage */}
                  <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                    <span className="text-[var(--ink)]">Impliciet opnamepercentage</span>
                    <span className="tabular-nums text-[var(--ink)]">{implicitPct.toFixed(2)}%</span>
                  </div>

                  {/* Verschil-indicator */}
                  {Math.abs(diff) > 0.01 && (
                    <div className={`mt-2 rounded-[var(--r-sm)] border border-dashed px-3 py-2 font-sans text-[11px] ${
                      diff < 0
                        ? 'border-horizon-300 bg-horizon-50/50 text-horizon-700'
                        : 'border-kern-300 bg-kern-50/50 text-kern-700'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span>{diff < 0 ? '↓' : '↑'} {Math.abs(diff).toFixed(2)}pp {diff < 0 ? 'lager' : 'hoger'} dan ingesteld ({ingesteldPct.toFixed(2)}%)</span>
                        {diff < 0 && <span className="text-[10px] font-medium">= veiliger</span>}
                      </div>
                      {portfolioDiff > 0 && (
                        <p className="mt-1 text-[10px]">
                          Je hebt {<MaskedAmount value={Math.round(portfolioDiff)} tone="horizon" />} minder vermogen nodig dan de klassieke berekening.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Fase-breakdown: onttrekking per levensfase ── */}
                  {firstPensionRow && (
                    <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
                      <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Onttrekking per fase</p>
                      <div className="space-y-1.5">
                        {/* Bij FIRE */}
                        <div className="rounded-[var(--r-sm)] bg-[var(--subtle)]/40 px-2.5 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-sans text-[11px] text-[var(--ink-2)]">Bij FIRE (leeftijd {firstPensionRow.age})</span>
                            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(Math.abs(firstPensionRow.withdrawal))} tone="horizon" />}/jr</span>
                          </div>
                          {firstPensionRow.cashflowNet > 0 && (
                            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-4)]">
                              waarvan {<MaskedAmount value={Math.round(firstPensionRow.cashflowNet)} tone="horizon" />}/jr gedekt door inkomsten
                            </p>
                          )}
                          {firstPensionRow.startPortfolio > 0 && (
                            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-4)]">
                              effectief {((Math.abs(firstPensionRow.withdrawal) / firstPensionRow.startPortfolio) * 100).toFixed(2)}% van vermogen
                            </p>
                          )}
                        </div>

                        {/* Na AOW (als AOW later start dan FIRE) */}
                        {rowAtAow && rowAtAow.age > firstPensionRow.age && (
                          <div className="rounded-[var(--r-sm)] bg-horizon-50/40 px-2.5 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-sans text-[11px] text-horizon-700">Na AOW (leeftijd {rowAtAow.age})</span>
                              <span className="font-mono text-[11px] tabular-nums text-horizon-700">{<MaskedAmount value={Math.round(Math.abs(rowAtAow.withdrawal))} tone="horizon" />}/jr</span>
                            </div>
                            {rowAtAow.cashflowNet > 0 && (
                              <p className="mt-0.5 font-sans text-[10px] text-horizon-500">
                                waarvan {<MaskedAmount value={Math.round(rowAtAow.cashflowNet)} tone="horizon" />}/jr gedekt door AOW + inkomsten
                              </p>
                            )}
                            {rowAtAow.startPortfolio > 0 && (
                              <p className="mt-0.5 font-sans text-[10px] text-horizon-500">
                                effectief {((Math.abs(rowAtAow.withdrawal) / rowAtAow.startPortfolio) * 100).toFixed(2)}% van vermogen
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Uitleg waarom het verschilt */}
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                    <p>
                      <strong className="font-semibold text-[var(--ink-3)]">Waarom verschilt dit?</strong>
                    </p>
                    <p className="mt-1">
                      De <strong className="font-semibold">ingestelde SWR</strong> ({ingesteldPct.toFixed(2)}%) gaat uit van een eenvoudige formule: je dekt 100% van je uitgaven uit je vermogen. Doelvermogen = uitgaven ÷ SWR.
                    </p>
                    <p className="mt-1">
                      De <strong className="font-semibold">simulatie</strong> modelleert je hele levenspad jaar voor jaar.
                      {laterCashflows.length > 0
                        ? ` Toekomstige inkomsten (${laterCashflows.map(cf => cf.id === 'aow-prefill' ? 'AOW' : cf.name).join(', ')}) verlagen je jaarlijkse onttrekking na leeftijd ${Math.min(...laterCashflows.map(cf => cf.fromAge))}. Daardoor heb je een kleiner startvermogen nodig, en is het impliciete opnamepercentage ${diff < 0 ? 'lager' : 'hoger'}.`
                        : incomeCfAtFire.length > 0
                          ? ` Inkomsten die al actief zijn bij FIRE (${incomeCfAtFire.map(cf => cf.id === 'aow-prefill' ? 'AOW' : cf.name).join(', ')}) dekken een deel van je uitgaven. Daardoor is het impliciete percentage ${diff < 0 ? 'lager' : 'hoger'}.`
                          : ` Het verschil komt door de nauwkeurigere modellering van rendement, inflatie en Box 3-belasting over de tijd.`}
                    </p>
                  </div>

                  {/* Formule */}
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                    <p>
                      <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>
                    </p>
                    <p className="mt-1">
                      Klassiek: SWR = Jaaruitgaven ÷ Doelvermogen = {<MaskedAmount value={yearlyExp} tone="horizon" />} ÷ {<MaskedAmount value={Math.round(yearlyExp / fireSwr)} tone="horizon" />} = {ingesteldPct.toFixed(2)}%
                    </p>
                    <p className="mt-0.5">
                      {/* euro-view: exempt — deze regel toont een DELING die op het
                          scherm moet kloppen: een uitgavenbedrag van vandaag gedeeld
                          door het simulatie-vermogen levert het getoonde percentage.
                          Deflateer je alleen de noemer, dan klopt de zichtbare som niet
                          meer. De grondslag van de teller en de noemer verschilt hier
                          bewust; dat is de definitie van de opnamerate. */}
                      Impliciet: Jaaruitgaven ÷ Simulatie-vermogen = {<MaskedAmount value={yearlyExp} tone="horizon" />} ÷ {<MaskedAmount value={Math.round(simResult.requiredFirePortfolio)} tone="horizon" />} = {implicitPct.toFixed(2)}%
                    </p>
                  </div>
                </>
              )
            })()}

            {/* Fallback als geen simResult: eenvoudige kassabon */}
            {simResult?.implicitWithdrawalRate == null && (
              <>
                <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                  <span className="text-[var(--ink)]">Opnamepercentage</span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>

                <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                  <p>
                    <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                    {/* euro-view: exempt — zelfde reden als de impliciete regel: dit is
                        een zichtbare deling die moet uitkomen op het getoonde
                        percentage, niet een los te lezen doelbedrag. */}
                    SWR = Jaaruitgaven ÷ Doelvermogen = {<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />} ÷ {<MaskedAmount value={effectiveFireTarget} tone="horizon" />}
                  </p>
                </div>
              </>
            )}

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              {simResult?.implicitWithdrawalRate != null
                ? 'Levenslange simulatie (opbouw + verbruik, incl. Box 3 en inflatie)'
                : 'Ingesteld via Toekomst → Voorkeuren'}
            </p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showResilienceReceipt} onClose={() => setShowResilienceReceipt(false)} title="Financiële Gezondheid">
        <div className="p-5">
          {healthScore && (
            <HealthScoreReceipt
              health={healthScore}
              footer={
                <>
                  {/* Backtesting samenvatting */}
                  <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">HISTORISCHE VEERKRACHTCHECK</p>
                    <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                      Backtesting over 55 jaar marktgeschiedenis (1970–heden) toont hoe je plan standhoudt onder historische crises.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowResilienceReceipt(false); setActiveModal('backtesting') }}
                      className="mt-2 font-serif text-sm italic text-horizon-600 transition-colors hover:text-horizon-800"
                    >
                      Bekijk volledige backtesting →
                    </button>
                  </div>
                  <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
                    Live berekend uit huidige financiële gegevens
                  </p>
                </>
              }
            />
          )}
        </div>
      </BottomSheet>

      {/* === Deep-dive Modals === */}
      {effectiveInput && (
        <>
          <ScenariosModal input={effectiveInput} debts={debts} baseHealthInput={healthScoreInput} open={activeModal === 'scenarios'} onClose={() => setActiveModal(null)} />
          <SimulationsModal
            input={effectiveInput}
            open={activeModal === 'simulations'}
            onClose={() => setActiveModal(null)}
            // BEWUST GEEN `precomputedMc` meer: de grafiek-band draait sinds de
            // marktcheck-fix op de horizon-kernel (volledige plan-curve), deze
            // modal nog op de losstaande `runMonteCarlo`-motor uit horizon-data.
            // Data van de een in de ander tonen zou twee grondslagen mengen; de
            // modal rekent zijn eigen, expliciet gelabelde FIRE-kans.
            // euro-view: exempt — dit is INVOER voor een tweede simulatie, geen
            // weergavebedrag. Een gedeflateerd doel zou daar een andere som opleveren.
            authoritativeFireTarget={effectiveFireTarget}
            defaultProjYears={
              simResult && currentAge != null
                ? Math.max(simResult.displayEndAge - currentAge, 10)
                : undefined
            }
          />
          <WithdrawalModal input={effectiveInput} open={activeModal === 'withdrawal'} onClose={() => setActiveModal(null)} />
          <BacktestingModal
            input={isHouseholdView && householdInput ? householdInput : effectiveInput}
            swr={fireSwr}
            open={activeModal === 'backtesting'}
            onClose={() => setActiveModal(null)}
            perspectiveLabel={isHouseholdView && householdInput ? 'huishouden' : undefined}
          />
        </>
      )}
      <StrategieModal
        open={activeModal === 'strategie'}
        onClose={() => { setActiveModal(null); setStrategieInitialTab(null); loadData() }}
        // B-057/B1 — na een geslaagde autosave van het plan herlaadt de grafiek
        // meteen (pane blijft open). Sinds fase 1 stap 3 is `loadData` zelf de
        // `router.refresh()`; sluiten ververst nog één keer.
        onSaved={() => { void loadData() }}
        housingStrategy={initialData.housingStrategy}
        initialTab={strategieInitialTab}
        // Kernel-context: de onttrekking-tab vergelijkt de vier PROFIELEN via de kernel.
        kernelRawProfile={kernelRawProfile}
        kernelAssets={initialData.assets}
        kernelDebts={debts}
        kernelLifeEvents={displayEvents}
        kernelAowRows={aowRows}
      />
      <UitgavenPane open={uitgavenPaneOpen} onClose={() => { setUitgavenPaneOpen(false); loadData() }} />

      {/* Huishoud-aanpasflow — geopend vanaf de "Na pensioen"-KPI in huishoudweergave.
          onSaved bumpt de perspectief-versie zodat hero + grafiek + huishoud-FIRE-sectie
          meteen het nieuwe gezamenlijke bedrag tonen. */}
      {householdRetireInfo && (
        <HouseholdRetirementPane
          open={householdRetireOpen}
          onClose={() => setHouseholdRetireOpen(false)}
          candidates={householdRetireInfo.candidates}
          currentMethod={householdRetireInfo.method}
          onSaved={refreshData}
        />
      )}
      {input && fireParams && fireStrategy && withdrawalStrategyConfig && (
        <EventPane
          open={eventPaneOpen}
          onClose={() => setEventPaneOpen(false)}
          editingId={eventPaneEditingId}
          initialMode={eventPaneMode}
          events={displayEvents}
          baselineInput={input}
          baselineFire={fire}
          fireParams={fireParams}
          fireStrategy={fireStrategy}
          withdrawalStrategy={withdrawalStrategyConfig}
          endAge={fireStrategy.endAge ?? 90}
          householdMode={initialData.hasPartner ?? false}
          previewBaseline={eventPanePreviewBaseline}
          onChanged={() => loadData()}
        />
      )}

      {/*
        Natuurlijke-mijlpaal info-sheet — opent bij klik op een natural-marker
        in de chart. Geen edit-flow (afgeleide momenten zijn niet bewerkbaar);
        wel kind-specifieke uitleg + deeplink naar de bron-asset/debt.
      */}
      <NaturalMilestoneSheet
        open={selectedNaturalMilestone !== null}
        milestone={selectedNaturalMilestone}
        onClose={() => setSelectedNaturalMilestone(null)}
      />

      {/*
        Cluster-sheet — opent bij klik op een +N cluster-marker, zowel in de
        EventsTimeline onder de lijn-grafiek als (sinds M16) op de markers ÓP de
        grafiek in BEIDE chartmodi. Bewust buiten elke chartMode-conditie
        gemount: in `vermogensopbouw` staat er geen EventsTimeline onder de
        staven, dus daar is dit de enige uitgang naar een geclusterde
        gebeurtenis. Toont alle events in dat cluster gegroepeerd per type
        (levensgebeurtenissen + natuurlijke mijlpalen). Klik op een rij volgt
        dezelfde routing als de directe marker-klik: life-event opent EventPane,
        natural milestone deeplinkt naar bron-asset/debt.
      */}
      <EventClusterSheet
        open={clusterSheet !== null}
        events={clusterSheet?.events ?? []}
        centerAge={clusterSheet?.centerAge ?? 0}
        stopAge={eventStopAge}
        onClose={() => setClusterSheet(null)}
        onSelectEvent={(id) => {
          if (id.startsWith('nat-')) {
            const m = naturalMilestones.find(x => x.id === id)
            if (m?.category === 'debt') router.push('/core/debts')
            else if (m?.category === 'asset') router.push('/core/assets')
            return
          }
          setEventPaneEditingId(id)
          setEventPaneMode('view')
          setEventPaneOpen(true)
        }}
      />

      {/*
        Year-details kassabon — opent bij klik op een jaar-kolom in de
        WealthCompositionChart. Toont editorial breakdown van bezittingen,
        schulden, kosten/inkomsten en gebeurtenissen voor dat specifieke
        projectiejaar. Werkt direct op `unifiedRows` — geen aparte
        sim-pipeline of conversie nodig.
      */}
      <HorizonYearDetailsSheet
        open={selectedYearAge !== null}
        age={selectedYearAge}
        onClose={() => setSelectedYearAge(null)}
        unifiedRows={displayUnifiedRows}
        simRows={displaySimRows}
        currentAge={currentAge ?? 30}
        inflationRate={fireParams.inflationRate}
        debts={debts}
        lifeEvents={events}
        cashflows={simCashflows ?? []}
        aowAge={userAowAge.fractional}
        fireAge={simResult?.fireAge ?? null}
        // De bon blijft de volledige jaarbalans op de I-grondslag; deze prop
        // zorgt alleen dat het getal waarop de gebruiker klikte er als
        // "waarvan besteedbaar"-regel bij staat (ADR 0114 D3).
        primaryBasis={effectiveChartPrimaryBasis}
        // Zelfde Set als de Opbouw-grafiek: klikt de gebruiker op een gedempte
        // band, dan markeert de bon exact dezelfde regels als "telt niet mee
        // voor je doel". De optelling blijft ongemoeid — de bon sluit op I.
        eigenHuisMortgageIds={eigenHuisMortgageIds}
        onChangeAge={(newAge) => {
          // Clamp op de geclipte weergaverijen: de gebruiker mag niet naar het
          // (verborgen) laatste jaar bladeren.
          const rows = displaySimRows
          if (rows.length === 0) return
          const minA = rows[0].age
          const maxA = rows[rows.length - 1].age
          setSelectedYearAge(Math.max(minA, Math.min(newAge, maxA)))
        }}
      />
    </div>
  )
}

