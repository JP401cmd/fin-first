'use client'

import { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue, type RefObject } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useDreamTransition } from '@/components/app/horizon/dream-transition-context'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { HORIZON_EXIT_NOTICE_DISMISSED_SLUG } from '@/lib/horizon-data-loader'
import { useHorizonFireSim } from '@/lib/hooks/use-horizon-fire-sim'
import { type SimRow, type SimResult } from '@/lib/fire-simulation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/app/toast-provider'

import { calculateFreedomTime, formatFreedomTimeString, formatCurrency, formatMaskedCurrency, formatMaskedApproxCurrency, formatWithFreedom, dailyExpenseRate } from '@/lib/format'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  computeFireProjection, computeFireRange,
  formatFireAge,
  ageAtDate, deriveCountdown,
  LIFE_EVENT_CATALOG, nibudChildrenCost, berekenSchenkbelasting, berekenAutoMaandkosten, berekenErfbelasting, berekenKinderopvangNetto, kinderbijslagPerMaand, WERELDREIS_STIJL_PRESETS, VERBOUWING_TYPE_KOSTEN, STUDIE_TYPE_KOSTEN, BRUILOFT_BUDGET_PRESETS,
  type FinancialInput, type FireProjection, type FireRange,
  type LifeEvent, type LifeEventImpact,
  type CatalogField,
  type UserDefinedCashflow,
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
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, SAVINGS_RATE_WINDOW_MONTHS, STARTERSVRIJSTELLING_MAX } from '@/lib/constants'
import { savingsRateWindow } from '@/lib/savings-source'
import { isTransferType } from '@/lib/transactions/transfer-marking'
import { computeKostenKoper } from '@/lib/kosten-koper'
import { lookupAowAge, type AowLeeftijdRow, type AowAge } from '@/lib/aow-leeftijd'
import { shouldSkipKernelContextFetch, keepRefIfEqual } from '@/lib/horizon/kernel-context-sync'
import { computeSuggestedEventValues, type SuggestedEventValues } from '@/lib/horizon/event-prefill'
import {
  berekenOverlijdenPartnerImpact,
  berekenWerkloosheidImpact,
  werkloosheidNaFireWaarschuwing,
} from '@/lib/horizon/risico-event-regels'
import { isKernelReachedNowDisplay, kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import { buildConvergentieAdapterProfile, computeConvergentieProjection, type ConvergentieRawContext, type ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp, deriveEigenHuisIds, type KernelAdapterInput } from '@/lib/horizon-kernel/adapter'
import { evaluateFireAt } from '@/lib/horizon-kernel/solver'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import { deriveMarginaalTarief } from '@/lib/box1-tax'
import { type WithdrawalStrategyType, type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import { computeRetirementExpenses, computeYearlyMustExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { deriveRetirementExpenseBasis } from '@/lib/retirement-expense-basis'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import type { Debt } from '@/lib/debt-data'
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
  Hourglass, TrendingUp, Percent, Info,
  AlertTriangle, Calendar, BarChart3, FlaskConical, Landmark,
  X, Edit3, Zap, Target, Sparkles,
  TableProperties, GitBranch,
  ChevronDown, ChevronUp, Compass,
  Home, Lightbulb,
  Play,
  Pause,
  Receipt,
  Minus,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import {
  isHousingStrategyEvent,
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
import { buildDeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'
import { useDeficitNotice } from '@/components/app/horizon/deficit-notice-provider'
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
  type HouseholdRetirementMethod,
} from '@/lib/household-projection'
import { HouseholdRetirementPane } from '@/components/app/horizon/household-retirement-pane'
import { usePerspective } from '@/components/app/perspective-provider'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { PensionParseSummaryCard, PensionInstructionPanel, computeCumulativeImpacts, type SnapshotForTrend } from '@/components/app/horizon/horizon-helpers'
import { MaskedAmount } from '@/components/app/masked-amount'
import { PageInfoButton, GlossaryTerm, SectionLabel, Kicker } from '@/components/editorial'
import { Vrijheidsas, computeCoupledStopAge, formatAge, formatMargeShort } from '@/components/app/horizon/vrijheidsas'
import { ScenarioChip, VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'
import { Dekkingsradar } from '@/components/app/horizon/dekkingsradar'
import { ScenarioKaarten } from '@/components/app/horizon/scenario-kaarten'
import { computeDekkingsradar, type RadarAs } from '@/lib/horizon/dekkingsradar'
import { type ScenarioPresetResult } from '@/lib/horizon/scenario-presets'
import { computeStopMarge } from '@/lib/horizon/stop-marge'
import { buildVrijheidsleeftijdZin } from '@/lib/horizon/vrijheidsleeftijd-zin'
import { selectDoelLijnBron } from '@/lib/horizon/doel-lijn-bron'
import {
  resolveHeroFireAge,
  formatHeroFireAge,
  heroFireAgeCaption,
  isHeroAnswerPending,
  isHeroAnswerInvalid,
} from '@/lib/horizon/hero-fire-age'
import {
  NU_STOPPEN_KPI_LABEL,
  NU_STOPPEN_KPI_LABEL_KORT,
  nuStoppenKpiCaption,
  nuStoppenReachFromSim,
  nuStoppenZin,
  nuStoppenZinKort,
  type NuStoppenReach,
} from '@/lib/horizon/nu-stoppen-copy'
import {
  guardFireTarget,
  guardFreedomMoment,
  guardRetirementExpense,
  HORIZON_MISSENDE_GEGEVENS_LABEL,
  type HorizonOutcomeGuard,
} from '@/lib/horizon/outcome-guard'
import {
  scenarioMonthlySpendDelta,
  buildCategorieReturnGroups,
  isDoelConceptGewijzigd,
  type DoelParameter,
  type ToekomstScenarioDoel,
} from '@/lib/horizon/toekomst-scenario'
import { doelGewogenRendement } from '@/lib/horizon/toekomst-doel'
import {
  DoelVastlegSheet,
  buildLiveStand,
  buildScenarioPersistPayload,
  type DoelParameterPreview,
} from '@/components/app/horizon/doel-vastleg-sheet'
import { WhatIfMarketAssumptions } from '@/components/app/horizon/whatif-market-assumptions'
import { DoelLoslatenConfirm } from '@/components/future/doel-loslaten-confirm'
import { buildSliderEvent, readSliderValueFromEvents, type SliderKey } from '@/lib/scenario-events'
import type { HorizonScenarioOverrides } from '@/lib/hooks/use-horizon-fire-sim'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { runMarktcheckAsync, runScenarioPresetsAsync } from '@/lib/horizon-kernel/worker/run-in-worker'
import { getPageInfo } from '@/lib/page-info-content'

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
import { PensionPdfUpload, uploadPensionPdfToStorage } from '@/components/app/horizon/pension-pdf-upload'
import { SimChart, buildScenarioVariants, SCENARIO_VARIANTS, type ScenarioOverlay, type MonteCarloOverlay, type HouseholdPartnerOverlay } from '@/components/app/horizon/sim-chart'
import { computeVerwachtingsband } from '@/components/app/horizon/verwachtingsband'
import { ZoomableChartContainer } from '@/components/app/horizon/zoomable-chart-container'
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
import { FIRE_PLAN_COLUMNS, parseFireStrategy, DEFAULT_FIRE_STRATEGY, type FireStrategyConfig, STRATEGY_LABELS, resolveFreedomFraming, fireAgeForDisplay } from '@/lib/fire-strategy'
import { toSimResult } from '@/lib/unified-projection'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import { buildDeeplinkCleanupUrl } from '@/lib/horizon/deeplink-cleanup'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import { ScenarioOverlayPicker } from '@/components/app/horizon/scenario-overlay-picker'
import { WHATIF_SCENARIO_COLORS, type SavedScenario } from '@/lib/scenario-types'
import { inflight } from '@/lib/inflight'
import { applyWhatIfOverrides, buildBaselineOverrides } from '@/lib/whatif-overrides'
import { WhatIfSliders, DeltaBadge, type WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import { ChartOverlayExplainer } from '@/components/app/horizon/chart-overlay-explainer'
import { ChartTips } from '@/components/editorial/chart-tips'
import {
  getFireProjectionTips,
  getWealthCompositionTips,
  getIncomeExpenseTips,
} from '@/lib/chart-tips'
import { ToekomstOverlay, type OverlayBalloonDef, type ToekomstOverlayGeometry } from '@/components/app/horizon/toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from '@/components/app/horizon/toekomst-overlay-balloons'
import { ToekomstWelcome } from '@/components/app/horizon/toekomst-welcome'
import { WidgetEmpty } from '@/components/widgets/widget-empty'
import { resolveUnlinkedCashShare, unlinkedCashTotal } from '@/lib/unlinked-cash'

type ActiveModal = null | 'scenarios' | 'simulations' | 'withdrawal' | 'backtesting' | 'strategie'

// Household FIRE data shape (from /api/household/fire-projections)
interface HouseholdHeroData {
  householdName: string
  fireAge: number | null
  fireTarget: number
  freedomPercentage: number
  countdownDays: number
  fireDate: string
  freedomYears: number
  freedomMonths: number
  savingsRate: number
  /** Jaarlijkse uitgave ná pensioen voor dit perspectief (huishouden = gecombineerd,
   *  methode-afhankelijk; partner = diens eigen bedrag). Voedt de "Na pensioen"-KPI. */
  retirementExpense: number
}

/**
 * Tap-affordance op een KPI-tegel die een kassabon opent (bevinding M5).
 *
 * De hero-KPI's waren al `<button>`-elementen met een kassabon eronder, maar dat
 * was uitsluitend af te lezen aan een hover-tint — op touch dus nergens. Een
 * prognose-kopgetal zonder zichtbaar spoor naar zijn aannames leest als een
 * vaststaand feit; dít bonnetje is dat spoor. Klein en in `--ink-4`, zodat het
 * de cijferregel niet beconcurreert, mét sr-only tekst zodat een schermlezer de
 * belofte óók hoort.
 *
 * Hoort in de kicker-rij van de tegel (`ml-auto` duwt hem naar rechts).
 */
function ReceiptCue() {
  return (
    <>
      <Receipt className="ml-auto h-3 w-3 shrink-0 text-[var(--ink-4)]" aria-hidden />
      <span className="sr-only">— tik voor de aannames achter dit getal</span>
    </>
  )
}

/**
 * De "we missen gegevens"-melding ín een hero-KPI-tegel — ÉÉN vorm voor alle
 * tegels van de figures-strip (bevinding UR2-05).
 *
 * De melding bestond al, maar alleen op de Doelbedrag-tegel en tweemaal met de
 * hand uitgeschreven (desktop + mobiel). Daardoor kon een buur-KPI met dezelfde
 * ontbrekende brondata rustig een exact getal blijven tonen: er was geen vorm om
 * te hergebruiken, alleen markup om te kopiëren. Dit component ís die vorm —
 * kop (`guard.label`) in de cijferregel, uitleg (`guard.hint`) op de plek van
 * het bijschrift, zodat de tegel even hoog blijft als zijn buren en de rij niet
 * verspringt.
 *
 * `compact` = de mobiele 2×2-strip (kleinere typografie, krappere marges).
 * Tekst komt uitsluitend uit `lib/horizon/outcome-guard.ts` — nooit hier.
 */
function HeroKpiNotice({
  guard,
  compact = false,
  label,
}: {
  guard: HorizonOutcomeGuard
  compact?: boolean
  /**
   * ADR 0127 — kop-override. De guard geeft app-breed één kop (zie
   * HORIZON_MISSENDE_GEGEVENS_LABEL), en die klopt voor elk gegevensprobleem.
   * Onder 'Nu stoppen' is `geen-doelvermogen` echter geen ontbrekend gegeven
   * maar een EIGENSCHAP van de strategie: er ís geen doelbedrag. De hint van
   * de guard blijft leidend.
   */
  label?: string
}) {
  return (
    <>
      <div
        className={`${compact ? 'text-[13px]' : 'text-[16px] sm:text-[18px]'} font-black leading-tight tracking-[-0.01em]`}
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {label ?? guard.label}
      </div>
      <div
        className={`italic text-[var(--ink-3)] ${compact ? 'text-[10px] mt-1' : 'text-[11px] mt-1.5'}`}
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {guard.hint}
      </div>
    </>
  )
}

/**
 * Zichtbaarheids-gate (Task 4.2): `true` zodra het gegeven element (bijna) in beeld komt.
 * Gebruikt om de zware duiding-secties (scenario-presets) pas te laten
 * rekenen wanneer de gebruiker er (dreigt te) scrollen — niet meer eager in idle. Blijft
 * `true` na de eerste keer (unobserve): een eenmaal-berekende sectie hoeft niet te herrekenen
 * op scroll-terug. SSR-veilig: `IntersectionObserver` ontbreekt server-side → `true`
 * (degradeert naar het oude altijd-berekenen-gedrag, geen regressie).
 * `remountKey`: mount het geobserveerde element pas later (conditioneel gerenderd),
 * geef dan de mount-conditie mee — een wissel re-runt het effect zodat de observer
 * alsnog aanhaakt (een ref-wissel triggert zelf géén effect).
 */
function useInViewOnce(ref: RefObject<HTMLElement | null>, rootMargin = '600px', remountKey: unknown = null): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (inView) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          obs.disconnect()
        }
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, rootMargin, inView, remountKey])
  return inView
}

/**
 * De euro-velden van `SimRow` — expliciet, nooit "alles wat een getal is".
 * `age` en `phase` zijn geen euro's en mogen dus nooit meegedeeld worden
 * (klasse R resp. metadata, zie ADR 0090 / het deflatieklasse-besluit D1).
 */
const SIM_ROW_MONEY_FIELDS = [
  'startPortfolio',
  'growth',
  'savings',
  'withdrawal',
  'cashflowNet',
  'oneTimeNet',
  'endPortfolio',
  'grossIncome',
  'grossExpenses',
  'flowIn',
  'flowOut',
] as const satisfies readonly (keyof SimRow)[]

/**
 * De overige velden van `SimRow`, met per veld de reden dat ze NIET meedeflateren.
 * Deze lijst bestaat alleen om de gard hieronder te laten werken.
 *
 *  - `age`   — klasse R (een leeftijd, geen euro; ADR 0090).
 *  - `phase` — metadata (opbouw/opname).
 *  - `incomeBreakdown` / `expenseBreakdown` — dragen WÉL bedragen, maar zijn geen
 *    getalvelden: `deflateRowsByAge` deflateert alleen `typeof === 'number'` en
 *    laat de items dus ongemoeid passeren. Vandaag inert (`toSimRow` vult ze niet,
 *    de inkomsten/uitgaven-strook loopt via een eigen pad); `lib/unified-projection.test.ts`
 *    grendelt dat vast, zodat het moment waarop de kernel ze wél gaat vullen als
 *    falende test opvalt in plaats van als ongedeflateerd bedrag op het scherm.
 */
const SIM_ROW_NON_MONEY_FIELDS = [
  'age',
  'phase',
  'incomeBreakdown',
  'expenseBreakdown',
] as const satisfies readonly (keyof SimRow)[]

/**
 * De gard die de ANDERE kant op werkt.
 *
 * `satisfies readonly (keyof SimRow)[]` controleert alleen dat de genoemde
 * sleutels BESTAAN — niet dat alle geldvelden genoemd zijn. Een nieuw euro-veld
 * op `SimRow` zou dus stil ongedeflateerd de rendergrens kruisen binnen een
 * `InEuroView<SimRow>`, zónder compile-fout. Daarom eisen we hier dat beide
 * lijsten SAMEN élk veld van `SimRow` dekken: een nieuw veld valt in geen van
 * beide en laat `never` klappen, wat de auteur dwingt te kiezen tussen "dit is
 * een euro" (meedeflateren) en "dit is het niet" (met reden hierboven).
 */
type OngeclassificeerdSimRowVeld = Exclude<
  keyof SimRow,
  (typeof SIM_ROW_MONEY_FIELDS)[number] | (typeof SIM_ROW_NON_MONEY_FIELDS)[number]
>
type AlleSimRowVeldenGeclassificeerd<T extends never> = T
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- puur een compile-gard; het type dráágt de controle
type _SimRowDekking = AlleSimRowVeldenGeclassificeerd<OngeclassificeerdSimRowVeld>

/**
 * De euro-velden van `StackedRow` (vermogensopbouw-staven) — jaarstanden per
 * vermogensgroep, klasse S op de eigen leeftijd-as. `age` is klasse R en blijft
 * er bewust buiten. Bewaakt door horizon-client.euro-view.test.ts.
 */
const STACKED_ROW_MONEY_FIELDS = [
  'spaargeld',
  'beleggingen',
  'pensioen',
  'vastgoed',
  'overig',
  'schulden',
] as const satisfies readonly (keyof StackedRow)[]

/**
 * Deflator-map voor een feed die zijn EIGEN leeftijd-as draagt (partner- en
 * huishoudlijn). Positie `k` in zo'n reeks is jaar `k` vanaf vandaag, maar
 * `rows[k].age` is de leeftijd van de PARTNER. Een `factorByAge`-lookup op die
 * leeftijd pakt daarom de verkeerde jaarfactor zodra de partner niet even oud
 * is — en het resultaat oogt plausibel, dus je ziet het niet.
 *
 * Deze helper hangt daarom de jaarfactor van jaar `k` (uit de EIGEN kernelrijen)
 * aan de leeftijd die dezelfde positie in de vreemde reeks draagt, zodat
 * `deflateRowsByAge` er alsnog op sleutelt. Er wordt hier niets gedeeld en niets
 * uitgerekend — alleen omgesleuteld.
 *
 * Geëxporteerd omdat dit de enige plek is waar een verkeerde sleutelkeuze
 * ONZICHTBAAR fout gaat: het bedrag blijft plausibel. Zo'n fout moet in een test
 * vast te pinnen zijn, niet alleen in een review op te merken.
 */
export function factorMapByPosition(
  rows: readonly { age: number }[],
  factorByOffset: readonly number[],
): Map<number, number> {
  const map = new Map<number, number>()
  rows.forEach((row, index) => {
    const factor = factorByOffset[index]
    if (factor !== undefined) map.set(row.age, factor)
  })
  return map
}

export default function HorizonPage({
  initialData,
  embedded = false,
  goals,
}: {
  initialData: HorizonPageData
  /**
   * K-02 — dubbele-hero-ontstapeling. Op /toekomst rendert de pagina al een
   * eigen `PageOpening` ("Je tijdas") + PageInfoButton; dan degradeert de
   * horizon-client-kop tot sectie-niveau (kicker + Tips-toggle, géén tweede
   * H1-formaat, géén eigen PageInfoButton). Op de legacy-route /horizon staat
   * geen paginakop, dus daar blijft `embedded={false}` de volle hero renderen.
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
  const { triggerDream } = useDreamTransition()
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
  const [householdMainLine, setHouseholdMainLine] = useState<{
    rows: SimRow[]
    fireAge: number | null
    fireAgeFractional: number | null
    currentAge: number | null
  } | null>(null)
  // Partner-projectie-pad (voor het wisselen van de hoofdlijn in partner-view).
  // `rows` is leeg wanneer de partner alleen 'totals' deelt of z'n toekomst
  // verbergt — dan tonen we geen partner-lijn (graceful degrade).
  const [partnerLine, setPartnerLine] = useState<{
    rows: SimRow[]
    fireAge: number | null
    fireAgeFractional: number | null
    currentAge: number | null
  } | null>(null)
  // Levensgebeurtenissen van de PARTNER (read-only markers op de grafiek in
  // huishouden- + partner-view). Alleen naam + leeftijd + icoon — nooit
  // bewerkbaar (geen sourceId), nooit de partner's natuurlijke mijlpalen.
  const [partnerLifeEvents, setPartnerLifeEvents] = useState<
    Array<{ id: string; name: string; targetAge: number | null; icon?: string }>
  >([])
  const [fireParams, setFireParams] = useState<FireParams>(initialData.fireParams)
  const [wsConfig, setWsConfig] = useState<{ strategy: WithdrawalStrategyType; floor: number; ceiling: number } | null>(
    initialData?.withdrawalStrategy
      ? { strategy: initialData.withdrawalStrategy.strategy, floor: initialData.withdrawalStrategy.guardrailFloor, ceiling: initialData.withdrawalStrategy.guardrailCeiling }
      : null,
  )
  const [withdrawalStrategyConfig, setWithdrawalStrategyConfig] = useState<WithdrawalStrategyConfig>(
    initialData?.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
  )
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
  const [input, setInput] = useState<FinancialInput | null>(initialData.effectiveInput)
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

  const [avgIncome6m, setAvgIncome6m] = useState<number | null>(initialData.avgIncome6m)
  const [avgExpenses6m, setAvgExpenses6m] = useState<number | null>(initialData.avgExpenses6m)
  const [resilienceSnapshots, setResilienceSnapshots] = useState<SnapshotForTrend[]>(initialData.resilienceSnapshots)
  const [healthChartOpen, setHealthChartOpen] = useState(false)
  const [fireAgeChartOpen, setFireAgeChartOpen] = useState(false)
  const [events, setEvents] = useState<LifeEvent[]>(initialData.events)
  const [impacts, setImpacts] = useState<LifeEventImpact[]>(initialData.impacts)
  const [actions, setActions] = useState<Action[]>(initialData.actions)
  const [debts, setDebts] = useState<Debt[]>(initialData.debts)
  // Doorrekening-inline needs raw profile data + extrapolated income
  const [profileRaw, setProfileRaw] = useState<Record<string, unknown> | null>(null)
  const [estimatedYearlyIncome, setEstimatedYearlyIncome] = useState(0)
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(initialData?.fireStrategy ?? undefined)
  /**
   * AOW-leeftijd. SYNCHROON geseed uit de server-voorgeladen wettelijke tabel
   * (`initialData.aowRows`) i.p.v. de hardcoded 67-terugval; de mount-fetch
   * (regel ±1358) ververst 'm daarna alleen nog bij een legacy-DB zonder tabel.
   *
   * WAAROM (bevinding C1): in pensioen-modus TOONT de hero deze leeftijd als
   * kernantwoord. Startte hij op de terugval, dan las de gebruiker eerst "67
   * jaar" en daarna zijn echte AOW-leeftijd — de "exact 67" uit de bevinding.
   * `lookupAowAge` geeft zelf de 67-terugval als de tabel leeg is, dus dit is
   * gedragsidentiek waar er niets te seeden valt.
   */
  const [userAowAge, setUserAowAge] = useState<AowAge>(() =>
    lookupAowAge(initialData.aowRows ?? [], initialData.effectiveInput?.dateOfBirth ?? null),
  )
  // ── Kernel-context (horizon-kernel = de enige motor) ──
  /** Rauwe profiel-rij (incl. kernel-instellingen-kolommen + geïnjecteerde
   *  yearly_essential_expenses) — kern-invoerbron voor de convergentie-router. Server-
   *  side voorgeladen via `initialData.rawProfile` (bevat al `yearly_essential_expenses`),
   *  zodat de EERSTE render meteen de kernel-projectie heeft i.p.v. een null-flits; de
   *  mount-fetch (loadKernelContext) + loadData verversen 'm daarna. Los van `profileRaw`
   *  (doorrekening-inline). */
  const [kernelRawProfile, setKernelRawProfile] = useState<ConvergentieRawProfileRow | null>(
    initialData.rawProfile ?? null,
  )
  /** Rauwe AOW-tabel — voor de kern-tijdas (lookupAowAge) in de adapter. Server-
   *  side voorgeladen via `initialData.aowRows` zodat de kernel-context (samen met
   *  `kernelRawProfile`) al bij de EERSTE render compleet is en de mount-fetch kan
   *  worden overgeslagen — geen tweede solve. Leeg = legacy DB / tabel ontbreekt. */
  const [aowRows, setAowRows] = useState<AowLeeftijdRow[]>(() => initialData.aowRows ?? [])
  const [loading] = useState(true)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  // Voorkeurs-tab bij het openen van de StrategieModal (bv. direct naar 'woning'
  // vanuit de "huis wordt nooit verkocht"-melding). Reset naar null bij sluiten.
  const [strategieInitialTab, setStrategieInitialTab] = useState<'eind' | 'onttrekking' | 'woning' | null>(null)
  const [simModalOpen, setSimModalOpen] = useState(false)
  const [activeFaseModal, setActiveFaseModal] = useState<'opbouw' | 'overgang' | 'onttrekking' | null>(null)

  // AOW-stop toggle state (local, non-persistent)
  const [aowStopToggle, setAowStopToggle] = useState<'doorgaan' | 'stoppen'>('doorgaan')

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
  const [ieViewMode, setIeViewMode] = useState<'lines' | 'breakdown'>('lines')
  const [chartMode, setChartMode] = useState<'vermogenspad' | 'vermogensopbouw'>('vermogenspad')

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
  const [retirementMethod, setRetirementMethod] = useState<RetirementExpenseMethod>('essential_budgets')
  const [uitgavenPaneOpen, setUitgavenPaneOpen] = useState(false)
  // Huishoud-aanpasflow (uitgave na pensioen) — geopend vanaf de "Na pensioen"-KPI
  // in huishoudweergave. candidates/method komen uit de combined-projectie.
  const [householdRetireOpen, setHouseholdRetireOpen] = useState(false)
  const [householdRetireInfo, setHouseholdRetireInfo] = useState<{
    candidates: { autoShared: number; sumPartners: number; custom: number | null }
    method: HouseholdRetirementMethod
  } | null>(null)
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
  const [eventPaneMode, setEventPaneMode] = useState<'catalog' | 'view' | 'edit'>('catalog')
  const [clusterSheet, setClusterSheet] = useState<{ events: LifeEvent[]; centerAge: number } | null>(null)
  const [showFireAgeReceipt, setShowFireAgeReceipt] = useState(false)
  const [showCountdownReceipt, setShowCountdownReceipt] = useState(false)
  const [showFireTargetReceipt, setShowFireTargetReceipt] = useState(false)
  const [showResilienceReceipt, setShowResilienceReceipt] = useState(false)
  const [showSwrReceipt, setShowSwrReceipt] = useState(false)
  // Mobile KPI's tonen nu volledig 2x2 — `horizonHeroExpanded` toggle is verwijderd.

  // ── Inline what-if sliders state (feature #795) ──────────────
  const [whatIfInlineOpen, setWhatIfInlineOpen] = useState(false)

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
  const [scenarioStopKoppel, setScenarioStopKoppel] = useState<boolean>(
    () => initialData.toekomstScenarioPrefs?.stopKoppel ?? false,
  )
  const [showScenarioLine, setShowScenarioLine] = useState<boolean>(
    () => initialData.toekomstScenarioPrefs?.showScenarioLine ?? true,
  )
  const scenarioHydratedRef = useRef(false)
  // Vastgehouden koppel-marge — bij koppelmodus is DIT de bewaarde waarheid (pref
  // `stopMarge`); de stopleeftijd is dan afgeleid (verwacht + marge). Direct uit de
  // pref initialiseren: herleiden uit een nog niet bezonken scenario-run is onmogelijk
  // (twee-fasen-hydratie) en joeg de stopleeftijd weg.
  const lockedMargeRef = useRef<number | null>(
    initialData.toekomstScenarioPrefs?.stopKoppel
      ? (initialData.toekomstScenarioPrefs?.stopMarge ?? null)
      : null,
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
  // KATERN II ("Jouw doel" / "Wat als je draait") — standaard INGEKLAPT, in
  // béíde weergavemodi (bewuste afwijking van het DepthSection-gedrag waar
  // Volledig standaard opent): de sectie is een werkbank, geen leesstof. De
  // ingeklapte regel toont een 1-regel-samenvatting; ?whatif=open en de
  // ScenarioChip klappen eerst open vóór de scroll. Ephemeral, geen persist.
  const [verkenOpen, setVerkenOpen] = useState(false)

  // Zichtbaarheids-gate voor de zware duiding-secties (scenario-presets):
  // die rekenen pas via de worker wanneer de "Wat het betekent"-sectie (bijna) in beeld komt
  // (Task 4.2), i.p.v. eager in idle. De duiding-sectie klapt mee met KATERN II
  // (doel dicht = duiding dicht) en mount dus pas bij openklappen — verkenOpen
  // als remountKey laat de observer dan alsnog aanhaken.
  const duidingSectionRef = useRef<HTMLElement | null>(null)
  const duidingInView = useInViewOnce(duidingSectionRef, '600px', verkenOpen)

  // Saved scenario overlay state (multi-select)
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set())

  const toggleScenarioId = useCallback((id: string) => {
    setSelectedScenarioIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearAllScenarioIds = useCallback(() => {
    setSelectedScenarioIds(new Set())
  }, [])

  // ── Toekomst-overlay (ballonnen) + welkomsttekst ─────────────────
  // De grafiek wordt sinds juni 2026 altijd getoond (de oude setup-pane is
  // verwijderd). In plaats daarvan: (a) een eenmalige welkomsttekst en (b) een
  // toggle-bare ballonnen-overlay die wijst naar de inline-editors.
  //
  // welcomeDismissed: lokale "weg"-state voor de welkomstbanner. Initieel
  // afgeleid uit de server-marker (hasSeenWelcome) — al gezien → meteen weg.
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(initialData.hasSeenWelcome)
  // overlayVisible: zichtbaarheid van de ballonnen-laag. Default AAN de eerste
  // keer (geen localStorage-key), daarna gepersisteerd. Onafhankelijk van de
  // welkomsttekst-state.
  const [overlayVisible, setOverlayVisible] = useState(true)
  // overlayEmphasis: welke grafiekfase een gehoverde/gefocuste ballon accentueert.
  const [overlayEmphasis, setOverlayEmphasis] = useState<'accumulation' | 'withdrawal' | 'fire' | null>(null)
  // monthlySavingsOverride wordt doorgegeven aan useHorizonFireSim zodat
  // de prognose de override-waarde gebruikt boven het asset-aggregaat.
  const [monthlySavingsOverride] = useState<number | null>(initialData.monthlySavingsOverride)

  // Deep-link: open modal via ?modal= URL param (from dashboard widgets)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // /toekomst krijgt nieuwe overzicht-tekst; /horizon-fallback voor legacy bezoeken
  const pageInfoText = getPageInfo(pathname, '/horizon')
  useEffect(() => {
    const modal = searchParams.get('modal')
    const strategieParam = searchParams.get('strategie')
    let shouldReplace = false

    if (modal) {
      if (modal === 'scenarios' || modal === 'simulations' || modal === 'withdrawal' || modal === 'backtesting' || modal === 'strategie') {
        setActiveModal(modal)
      } else if (modal === 'life_events') {
        setShowForm(true)
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

  }, [searchParams, router, pathname, triggerDream])

  // Event form state
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formType] = useState('custom')
  const [formAge, setFormAge] = useState<number | ''>('')
  const [formDuration, setFormDuration] = useState<number | ''>(0)
  const [formIsIndexed, setFormIsIndexed] = useState(true)
  const [formDirection, setFormDirection] = useState<'income' | 'expense'>('expense')
  const [formDurationType, setFormDurationType] = useState<'one_time' | 'period' | 'continuous'>('one_time')
  const [formAmount, setFormAmount] = useState<number | ''>(0)
  const [formMetadata, setFormMetadata] = useState<Record<string, unknown>>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [formWarnings, setFormWarnings] = useState<string[]>([])
  const [showCatalogFields, setShowCatalogFields] = useState(false)
  const [useSuggestedSettings, setUseSuggestedSettings] = useState(true)

  // Pension PDF auto-fill state
  const [pensionParseResult, setPensionParseResult] = useState<{
    aowBedrag: number | null
    regelingen: Array<{ fondsNaam: string; brutoBedrag: number; ingangLeeftijd: number; isGeindexeerd: boolean; type: string }>
    nabestaandenpensioen: number | null
    samenvatting: string
  } | null>(null)
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set())
  const [selectedRegelingIndex, setSelectedRegelingIndex] = useState(0)
  const pendingPensionFileRef = useRef<File | null>(null)

  // Compact life events UI state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [viewModalMode, setViewModalMode] = useState<'view' | 'edit'>('view')
  const [formCashflows, setFormCashflows] = useState<UserDefinedCashflow[]>([])
  const [editingCashflowId, setEditingCashflowId] = useState<string | null>(null)

  // Eerste-sleep-hint: éénmalig (per apparaat) een aanwijzer naar de gestippelde grafieklijn
  // bij de allereerste sliderbeweging. "Even niet meer tonen"-klasse → localStorage (patroon
  // use-insight-visibility), géén server-pref.
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
  // te wijzigen (WhatIfSliders bare krijgt deze i.p.v. de kale setter).
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
  const hasScenario = scenarioSliderEvents.length > 0 || Object.keys(scenarioReturnDeltas).length > 0
  /** Staat er een gekozen stopleeftijd? (Koppelmodus schrijft óók `scenarioStopAge`.) */
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
    }
  }, [hasScenario, scenarioSliderEvents, scenarioReturnDeltas])

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
  const { result: simResult, cashflows: simCashflows, error: simError, unifiedRows, effectiveLifeEvents, kernelStatus, kernelMaandHint, kernelHousingSale, scenario, stopPad, scenarioPending, stopPadPending, isRefining: kernelIsRefining, firstPaintFireAge, firstPaintFreedomPct, firstPaintRequiredPortfolio } = useHorizonFireSim(
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
          monthlySavingsOverride,
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
        }
      : null,
  )

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
      monthlySavingsOverride,
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
  }, [input, fireStrategy, withdrawalStrategyConfig, fireParams.grossReturn, fireParams.inflationRate, userAowAge.fractional, debts, monthlySavingsOverride, initialData, kernelRawProfile, aowRows])

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
  // die `use-horizon-fire-sim` voor de (lichtere) hoofdlijn al maakt, en die
  // /toekomst/whatif via `deferredWhatIfSimInput` ook al toepaste.
  const deferredMarktcheckContext = useDeferredValue(marktcheckContext)
  // Het ANKER van de rendement-marge: de gekozen stopleeftijd. Bewust de RAUWE
  // keuze (`scenarioStopAge`, `null` = geen keuze) en niet `effectiveStopAge` —
  // die valt terug op de afgeronde verwacht-FIRE, en een marge op de gesolvede
  // leeftijd is per constructie ≈ 0 (dezelfde val als de 51%-kans). Zonder eigen
  // keuze ankert de motor zelf op de AOW-leeftijd; de copy zegt dat ook.
  // Uitgesteld om dezelfde reden als de context: één job per gebaar.
  const deferredMarktcheckStopAge = useDeferredValue(scenarioStopAge)

  // Opgeslagen wat-als-scenario's voor de overlay-picker — deferred na first paint.
  // De picker rendert null bij een lege lijst en is zélf de open-trigger (bewezen
  // in review 1.3: lazy-op-open breekt 'm). Daarom niet lazy, maar uitgesteld tot
  // idle (setTimeout-fallback voor Safari) zodat de fetch niet met hydration/LCP
  // concurreert maar de picker wél verschijnt zodra de data er is. Dubbele mounts
  // delen één roundtrip via de inflight-dedupe.
  useEffect(() => {
    let cancelled = false
    const run = () => {
      inflight<{ scenarios?: SavedScenario[] }>('horizon-scenarios', () =>
        fetch('/api/scenarios').then(r => (r.ok ? r.json() : { scenarios: [] })),
      )
        .then(data => { if (!cancelled) setSavedScenarios(data.scenarios ?? []) })
        .catch(() => {})
    }
    const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback(run) : null
    const timer = ric === null ? setTimeout(run, 1) : null
    return () => {
      cancelled = true
      if (ric !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(ric)
      if (timer !== null) clearTimeout(timer)
    }
  }, [])

  // ── Kernel-context laden op mount ─────────────────────────────────────────
  // De kernel-context (`kernelRawProfile` + `aowRows`) is server-side voorgeladen
  // via `initialData` (rawProfile + aowRows). Zijn beide compleet, dan is de eerste
  // render al volledig en slaan we deze mount-fetch VOLLEDIG over — anders levert
  // de tweede `setKernelRawProfile`/`setAowRows` (verse referenties) een
  // gegarandeerde TWEEDE volledige kernel-solve op (beide zijn deps van de
  // kernel-input-memo in use-horizon-fire-sim).
  //
  // Fallback-pad (profiel-query faalde server-side → rawProfile null, óf lege
  // AOW-tabel op legacy DB): we halen de context alsnog client-side op, maar
  // schrijven de state via een structurele-gelijkheidsguard (`keepRefIfEqual`) —
  // identieke data behoudt de vorige referentie → geen re-solve.
  useEffect(() => {
    if (shouldSkipKernelContextFetch(initialData)) return
    let cancelled = false
    async function loadKernelContext() {
      try {
        const supabase = createClient()
        const { data: profileData } = await supabase
          .from('profiles')
          // `income_source`/`expenses_source` erbij (ADR 0103): de kernel-context
          // droeg wél `net_monthly_income`/`estimated_monthly_expenses` maar niet
          // de bijbehorende bronsignalen, terwijl de `loadData`-select ze al
          // meenam. Zonder die twee kan de rekenlaag hier niet zien welke
          // grondslag geldt en leest ze een profielbedrag alsof het de waarheid is.
          .select(`date_of_birth, retirement_expense_method, retirement_expense_custom_amount, ${FIRE_PLAN_COLUMNS}, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source, box3_method, marginaal_tarief, feature_preferences, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, withdrawal_profile_config, deficit_loan_rate, housing_strategy_config, pot_rules`)
          .single()
        if (cancelled || !profileData) return
        // Jaarlijkse essentiële uitgaven — zelfde grondslag (echte essentiële
        // budgetten, NIET de retirement-expenses) als v2/loadData, zodat de
        // 'essential_budgets'-pensioenuitgave-methode in de kernel klopt.
        const [essentialBudgetsResult, childBudgetsResult, aowResult] = await Promise.all([
          supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
          supabase.from('budgets').select('id, name, parent_id, default_limit, is_essential, interval, budget_type').not('parent_id', 'is', null).not('budget_type', 'in', '("archive","income","savings")'),
          supabase.from('aow_leeftijd').select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source').order('birth_date_from', { ascending: true }),
        ])
        if (cancelled) return
        const { yearlyMustExpenses } = computeYearlyMustExpenses(
          essentialBudgetsResult.data ?? [],
          childBudgetsResult.data ?? [],
        )
        // Gelijkheidsguard: is de verse context deep-equal aan de al-geseedde
        // state, dan behoudt keepRefIfEqual de vorige referentie → de kernel-memo
        // herrekent niet (geen re-solve). Anders is het een echte wijziging.
        const nextProfile: ConvergentieRawProfileRow = {
          ...(profileData as ConvergentieRawProfileRow),
          yearly_essential_expenses: yearlyMustExpenses,
        }
        setKernelRawProfile(prev => keepRefIfEqual(prev, nextProfile))
        if (aowResult.data && aowResult.data.length > 0) {
          const nextRows = aowResult.data as AowLeeftijdRow[]
          setAowRows(prev => keepRefIfEqual(prev, nextRows))
        }
      } catch {
        // Non-critical — zonder kern-context rekent de hook byte-identiek v2.
      }
    }
    loadKernelContext()
    return () => { cancelled = true }
  }, [initialData])

  // Client-side data reload (used after event CRUD operations)
  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
      const oneYearFromNow = new Date(Date.UTC(now.getFullYear() + 1, now.getMonth(), now.getDate())).toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]
      const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
      // 6-maands venster uit de CANONIEKE bron (lib/savings-source.ts): zes
      // VOLTOOIDE kalendermaanden, de lopende maand EXCLUSIEF — dezelfde grenzen
      // als de SSR-loader (lib/horizon/raw-data-loader.ts) waar
      // `initialData.avgIncome6m`/`avgExpenses6m` vandaan komen. Stond hier als
      // `getMonth() - 5` t/m `monthEnd` (lopende maand INCLUSIEF, het pre-C6-
      // patroon), waardoor de gezondheidsscore-ankers na een client-herlading
      // (event-CRUD) konden verspringen t.o.v. de eerste render.
      const window6m = savingsRateWindow(now)

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, actionsResult, childBudgetsResult, fullDebtsResult, snapshotsResult, income12Result, earliestIncomeResult, tx6mResult, bankAccountsResult, cashflowSettings] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('profiles').select(`date_of_birth, retirement_expense_method, retirement_expense_custom_amount, ${FIRE_PLAN_COLUMNS}, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source, box3_method, marginaal_tarief, feature_preferences, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, withdrawal_profile_config, deficit_loan_rate, housing_strategy_config, pot_rules`).single(),
        supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase
          .from('actions')
          .select('*, recommendation:recommendations(title, recommendation_type)')
          .eq('status', 'open')
          .not('scheduled_week', 'is', null)
          .gte('scheduled_week', today)
          .lte('scheduled_week', oneYearFromNow)
          .order('scheduled_week', { ascending: true }),
        supabase.from('budgets').select('id, name, parent_id, default_limit, is_essential, interval, budget_type').not('parent_id', 'is', null).not('budget_type', 'in', '("archive","income","savings")'),
        supabase.from('debts').select('*').eq('is_active', true).limit(200),
        supabase
          .from('net_worth_snapshots')
          .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age, score_version')
          .order('snapshot_date', { ascending: true })
          .limit(60),
        supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
        // Vroegste inkomstendatum ALL-TIME (geen 12-maands-venster) — deler-anker
        // voor de extrapolatie. Spiegelt de canonieke getEarliestIncomeDate
        // (SSR-loader / API-route); een gecapt venster gaf een te recente datum →
        // afwijkend jaarbedrag (WF-TOEK-02-bug2).
        supabase.from('transactions').select('date').gt('amount', 0).order('date', { ascending: true }).limit(1),
        // 6-month transactions for stable resilience calculation — canoniek
        // venster; `transaction_type` erbij voor de transfer-filter (zoals SSR).
        supabase.from('transactions').select('amount, transaction_type').gte('date', window6m.fromDate).lt('date', window6m.toDate),
        // `ownership` erbij: de SELECT-policy is huishoud-verbreed, dus een
        // gedeelde rekening komt hier ook binnen en telt op het eigen aandeel.
        supabase.from('bank_accounts').select('id, name, balance, ownership').eq('is_active', true).is('linked_asset_id', null),
        // GEDEELDE GRONDSLAG (ADR 0103) — het jaarinkomen dat `current_income`
        // als pensioenuitgave (en dus als FIRE-doel) gebruikt, komt uit dezelfde
        // bundel als de inkomenskaart op /overzicht/cashflow. Zonder dit rekende
        // deze refresh nog puur op de transactie-extrapolatie.
        fetch('/api/overzicht/cashflow-settings')
          .then((r) => (r.ok ? (r.json() as Promise<CashflowSettingsData>) : null))
          .catch(() => null),
      ])

      // Check for profile query errors
      if (profileResult.error) {
        console.warn(
          `[horizon-client] Profile query failed: code=${profileResult.error.code}, message=${profileResult.error.message}`,
          profileResult.error,
        )
      }

      let monthlyIncome = 0
      let monthlyExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) monthlyIncome += amt
        else monthlyExpenses += Math.abs(amt)
      }

      // Canonieke income/expenses-resolutie (lib/effective-financials.ts): een
      // expliciete handmatige bron (income_source/expenses_source === 'manual')
      // wint ALTIJD van de mogelijk-onvolledige lopende-maand-transactiesom.
      // Consumeert de ene bron i.p.v. een eigen inline fallback — voorheen zakte
      // de wat-als-baseline naar een partiële maandsom (WF-TOEK-10-bug1,
      // ADR 0058 "consume, don't recompute"). Spiegelt de SSR-loader
      // (lib/horizon-data-loader.ts).
      const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
      const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
        resolveEffectiveIncomeExpenses(
          (profileResult.data ?? {}) as IncomeExpenseSources,
          monthlyIncome,
          monthlyExpenses,
          // Budgetgrondslag erbij (ADR 0103) zodra de gedeelde bundel binnen is.
          cashflowSettings
            ? {
                income: cashflowSettings.budgetIncome.monthlyTotal,
                expenses: cashflowSettings.budgetExpenses.monthlyTotal,
              }
            : undefined,
        )

      // 6-month average income/expenses for stable resilience calculation —
      // TRANSFER-EXCLUSIEF, zoals de SSR-loader (realOnly:true): eigen-rekening-
      // overboekingen tellen nergens mee in de health-grondslag.
      let totalIncome6m = 0
      let totalExpenses6m = 0
      for (const tx of tx6mResult.data ?? []) {
        if (isTransferType(tx.transaction_type)) continue
        const amt = Number(tx.amount)
        if (amt > 0) totalIncome6m += amt
        else totalExpenses6m += Math.abs(amt)
      }
      const avgInc6 = totalIncome6m > 0 ? totalIncome6m / SAVINGS_RATE_WINDOW_MONTHS : effectiveMonthlyIncome
      const avgExp6 = totalExpenses6m > 0 ? totalExpenses6m / SAVINGS_RATE_WINDOW_MONTHS : effectiveMonthlyExpenses
      setAvgIncome6m(avgInc6)
      setAvgExpenses6m(avgExp6)

      const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) =>
        s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
      // DE canonieke, huishoud-gewogen optelling (lib/unlinked-cash.ts) — geen
      // eigen reduce, anders drift deze client-herlading met de server-bundel.
      const unlinkedCash = unlinkedCashTotal(
        bankAccountsResult.data,
        await resolveUnlinkedCashShare(supabase, bankAccountsResult.data),
      )
      const totalAssets = totalAssetsOnly + unlinkedCash
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
        s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
      const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

      const last12Income = income12Result.data?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
      const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date

      const allChildren = childBudgetsResult.data ?? []
      const { yearlyMustExpenses } = computeYearlyMustExpenses(
        essentialBudgetsResult.data ?? [],
        allChildren,
      )

      // Jaarinkomen + pensioenuitgave-methode.
      //
      // Het jaarinkomen komt op de GEDEELDE grondslag (ADR 0103): budgetten,
      // transacties, eigen bedrag of profielschatting — hetzelfde getal dat de
      // inkomenskaart op /overzicht/cashflow toont. Dat is hier de zwaarste
      // consequentie van het besluit: bij `retirement_expense_method =
      // 'current_income'` ÍS dit jaarinkomen de pensioenuitgave, en dus het
      // FIRE-doel.
      //
      // Terugval wanneer de bundel niet beschikbaar is: de gedeelde
      // extrapolatie-helper (lib/retirement-expense-basis.ts) op de rauwe
      // 12-maands transactiesom — nooit een eigen, vierde afleiding.
      const fallbackBasis = deriveRetirementExpenseBasis({
        method: profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
        yearlyMustExpenses,
        last12Income,
        earliestIncomeDate,
        customAmount: profileResult.data?.retirement_expense_custom_amount,
        estimatedYearlyExpenses: profileMonthlyExpenses * 12,
        now,
      })
      const extrapolatedIncome = cashflowSettings
        ? cashflowSettings.effectiveAnnualIncome
        : fallbackBasis.extrapolatedIncome
      const yearlyRetirementExpenses = cashflowSettings
        ? computeRetirementExpenses(
            profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
            yearlyMustExpenses,
            extrapolatedIncome,
            profileResult.data?.retirement_expense_custom_amount,
            profileMonthlyExpenses * 12,
          )
        : fallbackBasis.yearlyRetirementExpenses

      setRetirementMethod((profileResult.data?.retirement_expense_method ?? 'essential_budgets') as RetirementExpenseMethod)

      // Store raw profile + extrapolated income for doorrekening-inline
      setProfileRaw((profileResult.data as Record<string, unknown>) ?? null)
      setEstimatedYearlyIncome(extrapolatedIncome)

      // Kernel-context ná elke loadData verversen (los van profileRaw hierboven).
      // yearly_essential_expenses = de al-berekende essentiële jaaruitgaven (NIET de
      // retirement-expenses) zodat de kernel dezelfde grondslag gebruikt.
      setKernelRawProfile({
        ...(profileResult.data as ConvergentieRawProfileRow),
        yearly_essential_expenses: yearlyMustExpenses,
      })

      const dob = profileResult.data?.date_of_birth ?? null

      // FIRE strategy from profile — use API for pensioen fallback
      try {
        const fsRes = await fetch('/api/fire-settings')
        if (fsRes.ok) {
          const fsData = await fsRes.json()
          if (['perpetual', 'legacy', 'deplete', 'pensioen'].includes(fsData.fire_end_strategy)) {
            setFireStrategy({ strategy: fsData.fire_end_strategy, endAge: fsData.fire_end_age ?? 90, legacyAmount: Number(fsData.fire_legacy_amount ?? 0) })
          } else {
            setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
          }
        } else {
          setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
        }
      } catch {
        setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
      }

      // Berekeningsparameters uit profiel
      setFireParams(resolveFireParams(profileResult.data ?? {}))

      // AOW-leeftijd ophalen op basis van geboortedatum
      try {
        const aowRes = await supabase
          .from('aow_leeftijd')
          .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
          .order('birth_date_from', { ascending: true })
        if (aowRes.data && aowRes.data.length > 0) {
          setUserAowAge(lookupAowAge(aowRes.data as AowLeeftijdRow[], dob))
          // FASE 5, stap 2b — rauwe AOW-tabel voor de kern-tijdas (adapter).
          setAowRows(aowRes.data as AowLeeftijdRow[])
        }
      } catch {
        // Non-critical — fallback to 67
      }

      // Load withdrawal strategy config (refreshes server-side initial data)
      try {
        const wsRes = await fetch('/api/withdrawal-strategy')
        if (wsRes.ok) {
          const wsData = await wsRes.json()
          setWsConfig({
            strategy: wsData.withdrawal_strategy ?? 'static',
            floor: wsData.guardrail_floor ?? 0.80,
            ceiling: wsData.guardrail_ceiling ?? 1.20,
          })
          setWithdrawalStrategyConfig({
            strategy: wsData.withdrawal_strategy ?? WITHDRAWAL_DEFAULTS.strategy,
            guardrailFloor: wsData.guardrail_floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
            guardrailCeiling: wsData.guardrail_ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
            guardrailCutStep: wsData.guardrail_cut_step ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
            guardrailRaiseStep: wsData.guardrail_raise_step ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
          })
        }
      } catch { /* defaults */ }

      const horizonInput: FinancialInput = {
        totalAssets, totalDebts, monthlyIncome: effectiveMonthlyIncome, monthlyExpenses: effectiveMonthlyExpenses,
        monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses, dateOfBirth: dob,
      }

      // Snapshots voeden uitsluitend de historische trendlijn; het huidige
      // gezondheidsgetal komt van de live score (SSoT, Defect A).
      const allSnapshots = (snapshotsResult.data ?? []) as SnapshotForTrend[]
      setResilienceSnapshots(allSnapshots)

      setInput(horizonInput)

      const loadedEvents = (eventsResult.data ?? []) as LifeEvent[]
      // Virtuele housing-strategy events leven in initialData (server-side
      // gegenereerd) en hebben geen DB-row. Plak ze achter de echte events
      // zodat ze blijven verschijnen na een loadData() refresh.
      const housingFromInitial = initialData.events.filter(isHousingStrategyEvent)
      const merged: LifeEvent[] = [...loadedEvents, ...housingFromInitial]
      setEvents(merged)
      setActions((actionsResult.data ?? []) as Action[])
      setDebts((fullDebtsResult.data ?? []) as Debt[])

      const cumImpacts = computeCumulativeImpacts(horizonInput, merged)
      setImpacts(cumImpacts)
    } catch (err) {
      console.error('Error reloading horizon data:', err)
    }
  }, [initialData.events])

  // Lightweight refetch used after life-event CRUD, so a single failing parallel
  // query in `loadData` cannot silently block the events update.
  const refreshEvents = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('life_events')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('Failed to refresh life events:', error)
      return
    }
    const loaded = (data ?? []) as LifeEvent[]
    // Behoud virtuele housing-strategy events (geen DB-rij — komen via
    // initialData.events server-side).
    const housingFromInitial = initialData.events.filter(isHousingStrategyEvent)
    const merged: LifeEvent[] = [...loaded, ...housingFromInitial]
    setEvents(merged)
    if (input) {
      setImpacts(computeCumulativeImpacts(input, merged))
    }
  }, [input, initialData.events])

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
          const oldestDob = result.partners
            .map(p => p.financials.dateOfBirth)
            .filter((d): d is string => !!d)
            .sort((a, b) => a.localeCompare(b))[0] ?? null
          setHouseholdInput({
            totalAssets: result.comparison.combinedNetWorth,
            totalDebts: 0,
            monthlyIncome: result.comparison.combinedMonthlyIncome,
            monthlyExpenses: result.comparison.combinedMonthlyExpenses,
            yearlyMustExpenses: result.comparison.combinedRetirementExpenses,
            monthlyContributions: cp.monthlySavings,
            dateOfBirth: oldestDob,
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
            })
          } else {
            setHouseholdMainLine(null)
          }
          // Eigen lijn als overlay — ALLEEN wanneer de huidige gebruiker de oudste
          // partner (head) is, zodat de leeftijds-as klopt (de gecombineerde lijn
          // loopt op de head-as). Bron = household-projectie (matcht de partnerkaart),
          // niet de losse pagina-sim. Anders tonen we enkel de gezamenlijke lijn.
          const me = result.partners.find(p => p.isCurrentUser)
          const headCurrentAge = Math.max(...result.partners.map(p => p.settings.currentAge ?? 0))
          const ownOverlays: HouseholdPartnerOverlay[] = []
          if (me && me.rows.length > 0 && (me.settings.currentAge ?? 0) >= headCurrentAge) {
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
        // partner (gedeelde events tonen we al via de eigen overlay).
        setPartnerLifeEvents(
          partnerEntry
            ? partnerEntry.lifeEvents
                .filter(ev => ev.ownership !== 'shared')
                .map(ev => ({ id: ev.id, name: ev.name, targetAge: ev.targetAge, icon: ev.icon }))
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
    const fPct = computeFreedomProgressWithBasis({
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
    if (displayEvents.length > 0) {
      setImpacts(computeCumulativeImpacts(effectiveInput, displayEvents))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, fireSwr, fireParams, avgIncome6m, avgExpenses6m, fireStrategy])

  // Houd de impact-lijst in sync met de client-geregenereerde housing-events.
  // De setImpacts-callsites in loadData/refreshEvents werken op de ruwe
  // `events`-state (met het server-trigger-moment); zodra de hook de
  // housing-events met de actuele parameters heeft geregenereerd, wint deze
  // sync — anders zou de impact-lijst het verkoop-event op een andere
  // leeftijd kunnen tonen dan de marker/grafiek.
  useEffect(() => {
    if (!input || displayEvents.length === 0) return
    setImpacts(computeCumulativeImpacts(input, displayEvents))
  }, [input, displayEvents])

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
  //  1. DEFERRED context — spiegel van `deferredKernelInput` in de hoofd-hook (en
  //     van `deferredWhatIfSimInput` op /toekomst/whatif). Zonder dit draait de
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
  // savingsRate6m: server-canoniek getal (incl. spaarbudgetten + aflossing)
  // zodat de slider start op dezelfde spaarquote als de cashflow-pagina.
  const whatIfBaseline = useMemo<WhatIfOverrides | null>(() => {
    if (!effectiveInput) return null
    return buildBaselineOverrides(effectiveInput, fireParams.grossReturn, initialData.healthScoreInput.savingsRate6m)
  }, [effectiveInput, fireParams.grossReturn, initialData.healthScoreInput.savingsRate6m])

  // ── Wat-als-hydratie + koppel-semantiek (stap 4) ──────────────────────────
  // Slider-standen reconstrueren uit de bewaarde pref zodra de baseline + leeftijd
  // bekend zijn (pref-keys camelCase → kernel-`SliderKey` snake_case). Eén keer.
  useEffect(() => {
    if (scenarioHydratedRef.current) return
    if (!whatIfBaseline || currentAge === null) return
    scenarioHydratedRef.current = true
    const prefs = initialData.toekomstScenarioPrefs
    if (!prefs?.sliders) return
    const KEY_MAP: Record<string, SliderKey> = {
      income: 'income',
      workdays: 'workdays',
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

  // Koppelmodus: als de verwacht-FIRE verschuift terwijl "schuift mee" aan staat, beweegt
  // de stopleeftijd zó dat de vastgehouden marge (`lockedMargeRef`) constant blijft.
  useEffect(() => {
    if (!scenarioStopKoppel) return
    if (scenarioVerwachtSettled === null || lockedMargeRef.current === null) return
    const next = computeCoupledStopAge(scenarioVerwachtSettled, lockedMargeRef.current)
    if (next === null) return
    setScenarioStopAge(prev => (prev !== next ? next : prev))
  }, [scenarioVerwachtSettled, scenarioStopKoppel])

  // ── Scenario's naast elkaar: 5 preset-kaarten, via de worker bij zichtbaarheid ─────────
  // De context hangt UITSLUITEND van de basis-data af (geen scenario-overrides): profiel +
  // basis-lifeEvents + basis-jaaruitgaven, verwachtFireAge = basis-FIRE. De vijf volle
  // kernel-solves (~1s samen) draaien nooit per slider-tick, en Task 4.2: pas wanneer de
  // duiding-sectie (bijna) in beeld komt (`duidingInView`) én via de web worker (of synchrone
  // fallback) — niet meer eager in idle op de main thread. Leunt erop dat de sliders de
  // hoofd-input niet muteren (het scenario loopt via het gescheiden scenario-veld).
  useEffect(() => {
    if (displayMode !== 'full' || !duidingInView) { setScenarioPresets(null); setScenarioPresetsLoading(false); return }
    if (!kernelRawProfile || !effectiveInput || currentAge == null) return
    const yearlyExp = effectiveInput.yearlyMustExpenses > 0 ? effectiveInput.yearlyMustExpenses : 0
    if (yearlyExp <= 0) return
    const strat = fireStrategy ?? DEFAULT_FIRE_STRATEGY
    const downsizeActief =
      initialData.housingStrategy.mode === 'downsize' || initialData.housingStrategy.mode === 'reverse_mortgage'
    setScenarioPresetsLoading(true)
    let cancelled = false
    runScenarioPresetsAsync({
      profile: kernelRawProfile,
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
    })
      // ADR 0129 D7 — de batch draagt naast de kaarten ook `solvedFireAge` ("vrij
      // mogelijk vanaf", de tweede run onder een vast anker). F3b toont dat getal in de
      // hero-drieslag; hier wordt alleen de kaartenlijst uitgepakt.
      .then((batch) => { if (!cancelled) { setScenarioPresets(batch.presets as ScenarioPresetResult[]); setScenarioPresetsLoading(false) } })
      .catch((err) => {
        console.warn('[horizon-worker] preset-run faalde', err)
        if (!cancelled) setScenarioPresetsLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode, duidingInView, kernelRawProfile, simResult?.fireAgeFractional, currentAge, debts, events, aowRows, fireStrategy, initialData])

  // Deeplink `?whatif=open` (en ScenarioChip-klik) → scroll naar de slider-lab.
  // De sectie start ingeklapt — eerst openklappen, dan scrollen, anders landt
  // de gebruiker op een dichte regel zonder sliders.
  useEffect(() => {
    if (!whatIfInlineOpen) return
    setVerkenOpen(true)
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

  const eventsForTimeline = useMemo(() => {
    const base = showLifeEvents ? displayEvents : []
    return showNaturalMilestones ? [...base, ...naturalMilestonesAsEvents] : base
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

  // ── Chart event-overlay (markers boven/onder de bar) ───────────────────
  // Bouw één lijst met ChartEventOverlay-items uit gebruiker-events +
  // natuurlijke mijlpalen. De chart bepaalt zelf side+positie via xScale;
  // wij leveren alleen de raw lijst met side-hint en kleur.
  const COLOR_LIFE_INCOME = 'var(--color-horizon-500, #c4a06b)'
  const COLOR_LIFE_EXPENSE = 'var(--color-kern-500, #6b4339)'
  const COLOR_NAT_ASSET = 'var(--color-horizon-500, #c4a06b)'
  const COLOR_NAT_DEBT = 'var(--color-kern-500, #6b4339)'
  const COLOR_NAT_SIM = 'var(--ink-2, #4a453d)'
  const COLOR_NAT_DANGER = 'var(--negative, #b91c1c)'
  // Distinctieve partner-kleur voor read-only partner-event-markers (teal) —
  // verschilt van eigen events (goud/bruin) en natuurlijke mijlpalen.
  const COLOR_PARTNER_EVENT = '#0d9488'
  // Doel-markers (M36) dragen het Wil-accent: `doelen` hoort in de module
  // `inzicht_acties` → navModule 'wil' (lib/module-registry.ts). Dat token is
  // door de gebruiker instelbaar, dus geen losse hex — de fallback benadert
  // alleen de standaard-wil uit globals.css voor het geval de var ontbreekt.
  // Een verstreken streefdatum is SEMANTIEK (stoplicht-rood) en volgt de
  // accentkeuze bewust niet.
  const COLOR_GOAL = 'var(--color-wil-600, #3a2f52)'
  const COLOR_GOAL_OVERDUE = 'var(--negative, #b91c1c)'

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
    if ((isHouseholdView || isPartnerView) && partnerLifeEvents.length > 0) {
      for (const ev of partnerLifeEvents) {
        if (ev.targetAge == null) continue
        out.push({
          id: `partner-${ev.id}`,
          label: ev.name,
          age: ev.targetAge,
          side: 'above',
          color: COLOR_PARTNER_EVENT,
          icon: ev.icon || 'Calendar',
          kind: 'life_event',
          // GEEN sourceId + readOnly → geen edit/drag-routing (read-only marker).
          readOnly: true,
        })
      }
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
    return out
  }, [showLifeEvents, showNaturalMilestones, showGoals, goalChartMarkers, displayEvents, naturalMilestones, isHouseholdView, isPartnerView, partnerLine, partnerLifeEvents, deficitLoanNotice])

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
    [currentAge],
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
      }
    },
    [currentAge, events],
  )
  const baseFireStratOpts = fireStrategy ? { strategy: fireStrategy.strategy, endAge: fireStrategy.endAge } : undefined
  const baseFire = effectiveInput ? computeFireProjection(effectiveInput, fireParams.grossReturn, fireSwr, undefined, baseFireStratOpts) : null
  const totalDelayMonths = impacts.reduce((s, i) => s + i.fireDelayMonths, 0)
  const adjustedFireAge = baseFire?.fireAge != null ? baseFire.fireAge + totalDelayMonths / 12 : null

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
  const effectiveRequiredNetWorthInclHome =
    simResult?.requiredFireNetWorth ??
    inclHomeTargetFromScalar(
      effectiveFireTarget > 0 ? effectiveFireTarget : null,
      effectiveNetWorth,
      effectiveFireEligibleNetWorth,
    )
  const effectiveFreedomPct = effectiveFireTarget > 0
    ? computeFreedomProgressWithBasis({
        homeExcludedFromFire: homeExcludedFromProgress,
        netWorthInclHome: effectiveNetWorth,
        fireEligibleNetWorth: effectiveFireEligibleNetWorth,
        requiredNetWorthInclHome: effectiveRequiredNetWorthInclHome,
        requiredPortfolioExclHome: effectiveFireTarget,
      })
    : (firstPaintFreedomPct ?? fire?.freedomPercentage ?? 0)

  // ── Pensioen-modus afgeleid ──────────────────────────────────────────────
  const isPensioenMode = simResult?.strategy === 'pensioen'

  // ── 'Nu stoppen'-modus afgeleid (ADR 0127) ───────────────────────────────
  // SPIEGEL van `isPensioenMode`, geen kopie: beide zijn STOP-ANKERS (D1), maar
  // ze ankeren op een andere datum en beantwoorden een andere vraag. Waar
  // pensioen-modus "wat heb ik op mijn AOW-leeftijd" toont, toont deze modus
  // "hoe ver reikt mijn vermogen als ik vandaag stop". Elke `isPensioenMode`-
  // gebruik hieronder is daarom afzonderlijk gewogen — sommige krijgen een eigen
  // tak, sommige horen zich als 'fire' te gedragen (overgangsfase, fasebalk,
  // doel-lijn), en de AOW-specifieke afleidingen blijven onaangeraakt.
  //
  // `planningMode` blijft bewust TWEEWAARDIG: dit is een vijfde eindstrategie
  // binnen de bestaande modi, geen derde planningsmodus (D6).
  const isNuStoppenMode = simResult?.strategy === 'nu-stoppen'

  // Het kernantwoord onder dit anker: tot welke leeftijd reikt het vermogen.
  // Consume-only uit DEZELFDE run — onder 'nu-stoppen' ís de hoofdrun de
  // stop-nu-run (FIRE op maand 0), dus `kernelDepletionMonth` is de runway.
  // `kernelDepletionMonth` bewust RAUW doorgegeven (geen `?? null`): undefined =
  // geen kernel-antwoord, null = geen uitputting binnen de horizon.
  const nuStoppenReach: NuStoppenReach | null = useMemo(
    () =>
      simResult != null && simResult.strategy === 'nu-stoppen'
        ? nuStoppenReachFromSim({
            // Onder dit anker is `fireAge` per constructie de startleeftijd (D1).
            startAge: simResult.fireAge ?? currentAge,
            kernelDepletionMonth: simResult.kernelDepletionMonth,
            endAge: simResult.displayEndAge,
          })
        : null,
    [simResult, currentAge],
  )

  /**
   * Dezelfde uitkomst in de vorm die `resolveHeroFireAge` verwacht.
   * `depletionAgeFractional: null` betekent daar "reikt tot de eindleeftijd", dus
   * 'onbekend' mag NOOIT die vorm aannemen — anders leest een ontbrekend antwoord
   * op het scherm als volledige dekking. Die tak levert `null` (→ 'berekenen'
   * zolang de kernel draait, anders 'onbekend'). Bij 'nu-op' is de uitputting nú,
   * dus de startleeftijd.
   */
  const nuStoppenRunway = useMemo(() => {
    if (!isNuStoppenMode || simResult == null || nuStoppenReach == null) return null
    switch (nuStoppenReach.kind) {
      case 'gedekt':
        return { depletionAgeFractional: null, endAge: simResult.displayEndAge }
      case 'reikt-tot':
        return { depletionAgeFractional: nuStoppenReach.age, endAge: simResult.displayEndAge }
      case 'nu-op':
        return {
          depletionAgeFractional: simResult.fireAge ?? currentAge ?? 0,
          endAge: simResult.displayEndAge,
        }
      case 'onbekend':
        return null
    }
  }, [isNuStoppenMode, simResult, nuStoppenReach, currentAge])

  // ── Dubbele FIRE-grondslag (incl./excl. eigen woning) ────────────────────
  // Bij downsize/opeethypotheek/uitsluiten (showDualHousingBasis) toont /toekomst
  // BEIDE doelen: incl. woning (requiredFireNetWorth = totaal netto vermogen bij
  // FIRE — valt samen met de vermogenslijn) én excl. woning/liquide
  // (requiredFirePortfolio). Valt de sim weg (requiredFireNetWorth == null) dan
  // blijft het bestaande enkelvoudige gedrag intact. Puur al-doorgeleide velden.
  const fireTargetInclHome = simResult?.requiredFireNetWorth ?? null
  const fireTargetExclHome = simResult?.requiredFirePortfolio ?? null
  const showDualFireTarget =
    initialData.showDualHousingBasis &&
    !isPensioenMode &&
    // ADR 0127 D4 — onder 'nu-stoppen' is er geen doelbedrag (het "benodigde"
    // bedrag ís het huidige vermogen), dus ook geen incl./excl.-woning-paar.
    !isNuStoppenMode &&
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
  // (fireTargetInclHome = requiredFireNetWorth) tenzij de woning is uitgesloten
  // (exclude_from_fire) → dan het liquide excl.-doel. Consistent met de noemer
  // van effectiveFreedomPct, zodat de balk-fill en het balk-label niet botsen.
  // Zelfde C1-regel als bij `effectiveFireTarget`: alleen kernel-afgeleide bronnen.
  const balkVrijheidDoel = homeExcludedFromProgress
    ? (simResult?.requiredFirePortfolio ?? firstPaintRequiredPortfolio ?? 0)
    : (fireTargetInclHome ?? simResult?.requiredFirePortfolio ?? firstPaintRequiredPortfolio ?? 0)

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
    // ADR 0127 D4 — 'nu-stoppen': de guard geeft dan 'geen-doelvermogen' terug en
    // de tegel toont die duiding i.p.v. een bedrag dat toevallig het huidige
    // vermogen is.
    isStartPortfolio: simResult?.requiredFireIsStartPortfolio === true,
  })
  const showFireTargetNotice = !isPensioenMode && !fireTargetGuard.ok

  // ── AOW-stop shortfall detectie ────────────────────────────────────────
  // ADR 0127 — 'nu-stoppen' uitgesloten: `fireAge` is daar de HUIDIGE leeftijd,
  // dus bij iemand die ná zijn AOW nog werkt zou `fireAge > AOW` waar zijn en
  // verscheen de AOW-stop-toggle — een tweede stopmoment naast een stopmoment
  // dat al vastligt.
  const isShortfallScenario = !isPensioenMode
    && !isNuStoppenMode
    && !isHouseholdView && !isPartnerView
    && simResult?.fireReachable === true
    && simResult?.fireAge != null
    && simResult.fireAge > Math.round(userAowAge.fractional)
  const isAowStopActive = isShortfallScenario && aowStopToggle === 'stoppen'
  const planningMode: 'fire' | 'pensioen' = isPensioenMode || isAowStopActive ? 'pensioen' : 'fire'

  // Reset AOW-stop toggle when strategy changes
  useEffect(() => { setAowStopToggle('doorgaan') }, [fireStrategy?.strategy])

  // Pensioen-specific computed values
  const aowAgeFormatted = userAowAge.months > 0
    ? `${userAowAge.years}j + ${userAowAge.months}m`
    : `${userAowAge.years} jaar`

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
    isPensioenMode,
    // ADR 0127 D6 — eigen tak: het kopgetal is dan de leeftijd tot waar het
    // vermogen reikt, niet de kernel-`fireAge` (die is de startleeftijd).
    isNuStoppenMode,
    nuStoppenRunway: nuStoppenRunway,
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
  // Use startPortfolio of the first retirement row at AOW age = actual portfolio AT AOW
  // (not endPortfolio which is after a year of withdrawals). Fallback to firePortfolioAtFire
  // which is the actual projected portfolio, NOT requiredFirePortfolio (binary-search minimum). (#473)
  const aowRow = isPensioenMode && simResult
    ? simResult.rows.find(r => r.age === aowAgeInt && r.phase === 'retirement')
      ?? simResult.rows.find(r => r.age === aowAgeInt)
    : null
  const portfolioAtAow = isPensioenMode && simResult
    ? (aowRow?.startPortfolio ?? simResult.firePortfolioAtFire)
    : null
  // Use actual withdrawal from the sim engine (guardrails-aware) instead of simple SWR calc (#473)
  const monthlyWithdrawalAtAow = isPensioenMode && aowRow != null && aowRow.withdrawal > 0
    ? aowRow.withdrawal / 12
    : isPensioenMode && portfolioAtAow != null
      ? (fireSwr * portfolioAtAow) / 12
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
    const withdrawal = scenario === 'gap' ? yearlyExp : Math.max(yearlyExp - yearlyAow, 0)
    return { scenario, start, end, fireAge: oFireAge, aowAge: oAowAge, yearlyExp, yearlyAow, portfolioAtStart, withdrawal }
  })()

  // ── Onttrekking (withdrawal phase) berekening ──────────────────────────────
  const onttrekkingData = (() => {
    if (!simResult || !simResult.fireReachable || simResult.fireAge == null) return null
    const wRows = (unifiedRows ?? []).filter(r => r.phase === 'withdrawal')
    if (wRows.length === 0) return null
    const yearlyExp = (effectiveInput?.monthlyExpenses ?? 0) * 12
    const baseAow = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
    const yearlyAow = baseAow * 12
    const avgWithdrawal = wRows.reduce((s, r) => s + r.withdrawal, 0) / wRows.length
    return {
      start: wRows[0].age,
      end: simResult.displayEndAge,
      startPortfolio: wRows[0].startNetWorth,
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
  // ── "Wat hoort daarbij?" — het omgekeerde antwoord op de gekozen stopleeftijd (M2) ──
  // De pagina beantwoordde drie vragen (kan ik dit · wanneer · wat als) en liet de vierde
  // liggen: wat hoort er dan bij? Het getal bestónd al — de solver rekent voor élke
  // doorgerekende stand P!B96 uit — maar het stop-pad gooide het weg, dus het bereikte het
  // scherm alleen in de zeldzame hoofdrun-status `unreachable_within_horizon`.
  //
  // PURE CONSUME-LAAG: leest `stopPad.maandHint` (dezelfde run die de radar, de strook en de
  // doel-lijn al voeden) en `canonicalDailyRate` uit de bundel. Geen eigen som, geen tweede
  // bron — precies de drift die CLAUDE.md's "consume, don't recompute" verbiedt.
  //
  // GATE = `maandHint > 0`. Dat ÍS per constructie "dekking onder 100% op de gekozen
  // stopleeftijd": de solver zet de hint op `−gap ÷ maanden`, dus positief ⟺ gap < 0 ⟺ de
  // modelwaarde blijft onder het doelbedrag. Bewust géén eigen dekkingspercentage afleiden:
  // dat zou een tweede lezing van dezelfde vraag zijn, naast de radar.
  const stopPadTekortHint = useMemo(() => {
    if (stopPad == null || duidingStopAge == null) return null
    const perMaand = stopPad.maandHint
    if (!Number.isFinite(perMaand) || perMaand <= 0) return null
    // €→vrijheidstijd via de canonieke helper op de canonieke dagbasis (bundel-veld).
    // `totalDays` is de eigen uitvoer van die helper — geen deling met de hand.
    const dagen = canonicalDailyRate > 0
      ? Math.round(calculateFreedomTime(perMaand, canonicalDailyRate).totalDays)
      : 0
    return { stopAge: duidingStopAge, perMaand, dagen }
  }, [stopPad, duidingStopAge, canonicalDailyRate])
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
          fireAge: isAowStopActive ? Math.ceil(userAowAge.fractional) : simResult.fireAge,
          fireAgeFractional: isAowStopActive ? userAowAge.fractional : simResult.fireAgeFractional,
          aowAge: userAowAge.fractional,
          endAge: displayEndAge ?? rows[rows.length - 1].age + 1,
          fireReachable: simResult.fireReachable,
          isPensioenMode: isAowStopActive || isPensioenMode,
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
  }, [displayUnifiedRows, lifelineAge, currentAge, effectiveInput, simResult, isAowStopActive, userAowAge.fractional, displayEndAge, isPensioenMode])

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

  // ── AOW-stop simulatie (lokale wat-als bij shortfall) ───────────────────
  // Kernel-only. Deze wat-als forceert een FIRE-moment op de AOW-leeftijd met een
  // deplete-eindstrategie. De convergentie-router SOLVET de FIRE-leeftijd zelf en kan
  // geen forced-fireAge-deplete-run uitdrukken; `evaluateFireAt(input, fireAge)`
  // (solver.ts) draait daarom ÉÉN geforceerde kernel-run via de bestaande lib-helpers
  // (adapter → solver → bridge, geen bisectie) met de deplete-op-AOW-vorm. Zonder
  // rauwe kernel-context of bij een kern-fout: `null` → de AOW-stop-wat-als degradeert
  // zichtbaar (de toggle valt terug op de gewone grafiek, zie `effectiveSimRows`).
  const aowStopSimResult = useMemo(() => {
    if (!isShortfallScenario || !effectiveInput || currentAge == null) return null
    if (!kernelRawProfile) return null
    const aowAgeInt = Math.ceil(userAowAge.fractional)
    const yearlyExp = effectiveInput.yearlyMustExpenses > 0 ? effectiveInput.yearlyMustExpenses : 0
    if (yearlyExp <= 0) return null
    const strat = fireStrategy ?? DEFAULT_FIRE_STRATEGY
    const pensioenEndAge = Math.max(strat.endAge, 90)

    // Gedeelde pensioen-post-wrap: forceer FIRE = AOW (weergave-integer), pensioen-modus.
    const wrapPensioen = (result: SimResult) => ({
      ...result,
      strategy: 'pensioen' as const,
      fireAge: aowAgeInt,
      fireAgeFractional: userAowAge.fractional,
      fireReachable: true,
      requiredFirePortfolio: result.firePortfolioAtFire,
    })

    // Bouw de adapter-invoer zoals de convergentie-router (rauwe context van de
    // pagina) MET de deplete-op-AOW-overrides, en forceer FIRE op de fractionele
    // AOW-leeftijd (maandnauwkeurig — de kernel rekent op maanden). De weergave-
    // velden (fireAge = ceil) worden via `wrapPensioen` gezet. Een kern-fout → null.
    try {
      const adapterInput: KernelAdapterInput = {
        profile: {
          ...buildConvergentieAdapterProfile(kernelRawProfile),
          fire_end_strategy: 'deplete',
          fire_end_age: pensioenEndAge,
        },
        assets: initialData.assets ?? [],
        debts,
        lifeEvents: events,
        aowRows,
      }
      const kernelInput = buildKernelInputFromApp(adapterInput)
      const solve = evaluateFireAt(kernelInput, userAowAge.fractional)
      const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
        initialData.assets ?? [],
        debts,
        deriveEigenHuisIds(initialData.assets ?? []),
      )
      const kernelUnified = kernelToUnifiedResult(solve, {
        input: kernelInput,
        yearlyExpenses: yearlyExp,
        assetSlotMeta,
        debtSlotMeta,
      })
      return wrapPensioen(toSimResult(kernelUnified))
    } catch {
      // Kern-fout → geen AOW-stop-wat-als (zichtbare degradatie, geen tweede motor).
      return null
    }
  }, [isShortfallScenario, effectiveInput, currentAge, userAowAge.fractional, fireStrategy, debts, events, aowRows, initialData.assets, kernelRawProfile])

  const effectiveSimRows = isAowStopActive && aowStopSimResult ? aowStopSimResult.rows : (simResult?.rows ?? [])

  // Weergave-clip voor de SimRow-oppervlakken (Pad-grafiek + Inkomen&Uitgaven-
  // strip): t/m eindleeftijd − 1, spiegelbeeld van `displayUnifiedRows`. De
  // AOW-stop-wat-als heeft een eigen eindleeftijd → clip die op de eigen grens.
  const displaySimRows = useMemo(
    () => clipRowsToPlanEnd(simResult?.rows ?? null, displayEndAge),
    [simResult?.rows, displayEndAge],
  )
  const displayEffectiveSimRows = useMemo(
    () =>
      clipRowsToPlanEnd(
        effectiveSimRows,
        isAowStopActive && aowStopSimResult ? aowStopSimResult.displayEndAge : displayEndAge,
      ),
    [effectiveSimRows, isAowStopActive, aowStopSimResult, displayEndAge],
  )
  // Partner-view: vervang de hoofdlijn door het PARTNER-pad (eigen as + FIRE-
  // markers op de partner). Alleen wanneer er een precies partner-pad is
  // (`partnerLine` niet-null); anders degraderen we naar de eigen lijn zodat de
  // grafiek nooit leeg/kapot is. In persoonlijk + huishouden-view blijft de
  // hoofdlijn de EIGEN lijn (huishouden voegt de gecombineerde overlay toe).
  const usePartnerMainLine = isPartnerView && partnerLine !== null
  // Huishouden-view: de gecombineerde lijn is de hoofdlijn (matcht de hero-FIRE).
  const useHouseholdMainLine = isHouseholdView && householdMainLine !== null

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
    liquidWealthPoints != null && !usePartnerMainLine && !useHouseholdMainLine && !isAowStopActive
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
      aowAge: userAowAge.fractional,
      displayEndAge,
      isPensioenMode,
      homeExcludedFromFire: homeExcludedFromProgress,
      peakText: formatMaskedCurrency(deficitLoanNotice.peak, masked),
      freedomText,
    })
  }, [deficitLoanNotice, deficitNoticeVisible, canonicalDailyRate, masked, userAowAge.fractional, displayEndAge, isPensioenMode, homeExcludedFromProgress])
  const aowAgeIntForDepletion = Math.ceil(userAowAge.fractional)
  // Tijdstip-conventie: rij `age` is het leeftijdsJAAR; `endPortfolio <= 0`
  // betekent "op aan het EIND van dat jaar" = op leeftijd `age + 1`. Het jaar
  // zelf melden las de uitputting een jaar te vroeg (D, nazorg R2+R3).
  const depletionRow = isAowStopActive && aowStopSimResult
    ? aowStopSimResult.rows.find(r => r.age >= aowAgeIntForDepletion && r.endPortfolio <= 0) ?? null
    : null
  const depletionAge = depletionRow ? depletionRow.age + 1 : null

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

  // Nabestaandenpensioen from pension parse (monthly amount, if available)
  const nabestaandenPensioenBedrag = pensionParseResult?.nabestaandenpensioen != null
    ? pensionParseResult.nabestaandenpensioen
    : undefined

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
  const wealthCompositionRows: StackedRow[] = useMemo(() => {
    if (chartMode !== 'vermogensopbouw') return []
    if (!displayUnifiedRows.length) return []
    const baseRows = unifiedRowsToStackedRows(displayUnifiedRows)

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
    })
  }, [chartMode, displayUnifiedRows, initialData, displayEvents])

  // Lazy compute income/expense breakdown only when user toggles to 'breakdown' mode.
  // Consume de geclipte weergaverijen zodat de bronnen-breakdown niet tot het
  // (verborgen) laatste jaar doorloopt.
  const ieBreakdownResult = useMemo(() => {
    if (ieViewMode !== 'breakdown' || !displayUnifiedRows.length || !displaySimRows.length) return null
    return buildBreakdown(displayUnifiedRows, displaySimRows, debts)
  }, [ieViewMode, displayUnifiedRows, displaySimRows, debts])

  // Saved scenario ghost overlays — re-runs simulation for each selected scenario's overrides
  // applied to the current financial data, then renders as ghost lines over the main chart.
  const scenarioOverlayDataList = useMemo(() => {
    if (selectedScenarioIds.size === 0) return []

    const { effectiveInput: initialEffectiveInput, fireParams: initialFireParams } = initialData
    const currentAgeVal = initialEffectiveInput.dateOfBirth ? ageAtDate(initialEffectiveInput.dateOfBirth) : null
    if (currentAgeVal === null) return []
    // Kernel-only: zonder rauwe kernel-context is er geen doorrekening → geen ghosts
    // (ze verschijnen zodra de mount-fetch de kern-context heeft geladen).
    if (!kernelRawProfile) return []

    const results: Array<{
      overlay: ScenarioOverlay
      rows: SimRow[]
      events: Array<{ id: string; name: string; event_type: string; target_age: number | null; one_time_cost: number; monthly_cost_change: number; monthly_income_change: number; duration_months: number; is_active: boolean; sort_order: number; is_indexed: boolean; icon: string; metadata?: Record<string, unknown> }>
      color: string
      scenarioName: string
    }> = []

    for (const scenarioId of selectedScenarioIds) {
      const scenario = savedScenarios.find(s => s.id === scenarioId)
      if (!scenario) continue

      const baselineOvr = buildBaselineOverrides(initialEffectiveInput, initialFireParams.grossReturn, initialData.healthScoreInput.savingsRate6m)
      const { adjustedInput, annualSavings } = applyWhatIfOverrides(initialEffectiveInput, scenario.overrides, baselineOvr)

      // Scenario-events → LifeEvent-vorm (numerieke velden normaliseren; sommige kunnen
      // als string zijn opgeslagen). Deze gaan als rauwe events de kernel-context in.
      const scenarioEvents: LifeEvent[] = (scenario.events ?? [])
        .filter(e => !e.whatIfDisabled)
        .map(e => ({
          id: e.id,
          name: e.name,
          event_type: e.event_type,
          target_age: e.target_age,
          target_date: null as string | null,
          one_time_cost: Number(e.one_time_cost ?? 0),
          monthly_cost_change: Number(e.monthly_cost_change ?? 0),
          monthly_income_change: Number(e.monthly_income_change ?? 0),
          duration_months: Number(e.duration_months ?? 0),
          is_active: true,
          sort_order: 0,
          is_indexed: false,
          icon: '',
          metadata: e.metadata,
        }))

      const yearlyExpenses = adjustedInput.yearlyMustExpenses > 0 ? adjustedInput.yearlyMustExpenses : 0
      if (yearlyExpenses <= 0) continue

      // Kernel-pad (geen tweede motor): het opgeslagen what-if-scenario muteert een
      // SCALAIR spaarbedrag (`annualSavings`, uit de inkomen-/spaarquote-sliders) plus
      // rendement en uitgaven. We drukken dat uit als een profiel-override op de RAUWE
      // kernel-context (inkomen − uitgaven = spaarbedrag; scenario-rendement; scenario-
      // uitgavengrondslag) en draaien via de convergentie-router — dezelfde per-asset-
      // context/motor als de hoofdlijn, zodat de ghost consistent is met de kernel-
      // grafiek. Bekende beperking: de scenario-overrides op het AGGREGAAT-vermogen mappen
      // niet per-asset; het startvermogen blijft de echte per-asset-context (zoals de hoofdlijn).
      const monthlyExpenses = adjustedInput.monthlyExpenses
      const overriddenProfile: ConvergentieRawProfileRow = {
        ...kernelRawProfile,
        estimated_monthly_expenses: monthlyExpenses,
        net_monthly_income: monthlyExpenses + annualSavings / 12,
        yearly_essential_expenses: yearlyExpenses,
        expected_return: adjustedInput.expectedReturn ?? kernelRawProfile.expected_return ?? null,
      }
      const outcome = computeConvergentieProjection({
        rawContext: {
          profile: overriddenProfile,
          assets: initialData.assets ?? [],
          debts,
          lifeEvents: scenarioEvents,
          aowRows,
          yearlyExpenses,
          marktVolatiliteit: initialData.marktVolatiliteit,
        },
      })
      if (!outcome.ok) continue
      const result = toSimResult(outcome.result)

      const color = WHATIF_SCENARIO_COLORS[scenario.colorIndex ?? 0]

      results.push({
        overlay: {
          name: scenario.name,
          label: scenario.name,
          color: color.hex,
          points: simRowsToChartPoints(result.rows),
        },
        rows: result.rows,
        events: scenarioEvents,
        color: color.hex,
        scenarioName: scenario.name,
      })
    }

    return results
  }, [selectedScenarioIds, savedScenarios, initialData, kernelRawProfile, debts, aowRows])

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
  // De wat-als-lijn staat vooraan (bovenop de saved-ghosts).
  const combinedScenarioOverlays = useMemo(() => [
    ...(scenarioLineOverlay ? [scenarioLineOverlay] : []),
    ...(scenarioOverlays ?? []),
    ...scenarioOverlayDataList.map(d => d.overlay),
  ], [scenarioLineOverlay, scenarioOverlays, scenarioOverlayDataList])

  // Gewogen baseline-rendement per bezeten categorie (Marktbias-UI). Gememoized zodat
  // de inline-call in de JSX niet elke render een verse array-identiteit oplevert.
  const categorieReturnGroups = useMemo(
    () => buildCategorieReturnGroups(initialData.assets),
    [initialData.assets],
  )

  // ── Vrijheidsas + stop-marge (plan §D) ──────────────────────────────────────
  // De verwachtingsband ("waarschijnlijk vrij tussen vroegst en laatst") van het ACTIEVE
  // pad — ÉÉN memo, ÉÉN `buildScenarioPathsFromSim`-aanroep, beide randen eruit (consume,
  // géén extra kernel-run). De grondslag-keuze (drempel = requiredFireNetWorth, want de
  // rijen dragen netto vermogen INCL. eigen woning) leeft in `computeVerwachtingsband`.
  const scenarioBaseFireAge = simResult?.fireAgeFractional ?? null
  const verwachtingsband = useMemo(
    () =>
      computeVerwachtingsband(
        hasScenario && scenario != null ? scenario.result : simResult,
        fireParams.grossReturn,
      ),
    [hasScenario, scenario, simResult, fireParams.grossReturn],
  )
  /** Late rand: FIRE-leeftijd van de VOORZICHTIGE variant (pessimist, −0,02). */
  const laatstFireAge = verwachtingsband.laatstFireAge
  /** Vroege rand: FIRE-leeftijd van de OPTIMISTISCHE variant (+0,02). */
  const vroegstFireAge = verwachtingsband.vroegstFireAge

  // Effectieve stopleeftijd — de slider werkt controlled op dit getal; is er nog niets
  // gekozen dan default naar de (afgeronde) verwacht-FIRE, anders currentAge+1.
  const effectiveStopAge =
    scenarioStopAge ??
    (scenarioVerwachtFireAge !== null
      ? Math.round(scenarioVerwachtFireAge)
      : currentAge !== null
        ? Math.round(currentAge) + 1
        : 60)

  const stopMarge = useMemo(
    () =>
      computeStopMarge({
        stopAge: effectiveStopAge,
        verwachtFireAgeFractional: scenarioVerwachtFireAge,
        laatstFireAgeFractional: laatstFireAge,
        baseFireAgeFractional: scenarioBaseFireAge,
      }),
    [effectiveStopAge, scenarioVerwachtFireAge, laatstFireAge, scenarioBaseFireAge],
  )

  // 1-regel-samenvatting voor de ingeklapte KATERN II-regel ("Jouw doel" /
  // "Wat als je draait"). Consumeert uitsluitend al afgeleide waarden —
  // verwachte vrijheidsleeftijd, gekozen stopleeftijd, marge — met dezelfde
  // formatters als de Vrijheidsas-cijferrij (formatAge/formatMargeShort):
  // geen eigen som, geen tweede weergave van hetzelfde getal.
  const verkenSamenvatting = useMemo(() => {
    if (currentAge === null) {
      return doelActief
        ? 'Je vastgelegde doel — klap uit voor de details'
        : 'Draai aan je aannames — je basislijn blijft staan'
    }
    const delen: string[] = []
    // ADR 0127 — onder 'Nu stoppen' zijn "vrij op X", "stop X" en "marge" alle drie
    // uitspraken over een stopKEUZE die er niet is (het stopmoment ligt vast op
    // vandaag). De ingeklapte kop noemt dan het bereik, uit dezelfde bron als de
    // hero-KPI — geen tweede weergave van hetzelfde getal.
    if (isNuStoppenMode) {
      const reikwijdte = nuStoppenReach != null ? nuStoppenZinKort(nuStoppenReach) : 'je bereik'
      return doelActief
        ? `Vastgelegd doel — ${reikwijdte}`
        : hasScenario
          ? `Wat-als actief — ${reikwijdte}`
          : `Verken je pad — ${reikwijdte}`
    }
    if (scenarioVerwachtFireAge !== null) delen.push(`vrij op ${formatAge(scenarioVerwachtFireAge)} jr`)
    delen.push(`stop ${effectiveStopAge}`)
    if (stopMarge.margeJaren !== null) delen.push(`marge ${formatMargeShort(stopMarge.margeJaren)}`)
    const cijfers = delen.join(' · ')
    if (doelActief) return `Vastgelegd doel — ${cijfers}`
    return hasScenario ? `Wat-als actief — ${cijfers}` : `Verken je pad — ${cijfers}`
  }, [currentAge, doelActief, hasScenario, scenarioVerwachtFireAge, effectiveStopAge, stopMarge, isNuStoppenMode, nuStoppenReach])

  // Slepen aan de stop-slider legt (bij koppel aan) een nieuwe vast te houden marge vast.
  // Vergrendelen alléén tegen de bezonken verwacht-waarde (nooit de basis-fallback).
  const handleStopAgeChange = useCallback(
    (v: number) => {
      setScenarioStopAge(v)
      if (scenarioStopKoppel && scenarioVerwachtSettled !== null) {
        lockedMargeRef.current = v - scenarioVerwachtSettled
      }
    },
    [scenarioStopKoppel, scenarioVerwachtSettled],
  )
  // Aanzetten van de koppeling legt de HUIDIGE marge vast; uitzetten laat de stop staan.
  const handleStopKoppelChange = useCallback(
    (v: boolean) => {
      setScenarioStopKoppel(v)
      if (v && scenarioVerwachtSettled !== null) {
        lockedMargeRef.current = effectiveStopAge - scenarioVerwachtSettled
      }
    },
    [effectiveStopAge, scenarioVerwachtSettled],
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
    }
    const hadSomething =
      snapshot.sliderEvents.length > 0 || Object.keys(snapshot.returnDeltas).length > 0

    setScenarioSliderEvents([])
    setScenarioReturnDeltas({})

    // Niets te wissen → geen undo-toast (voorkomt een misleidende "Ongedaan maken").
    if (!hadSomething) return

    addToast({
      type: 'info',
      title: 'Scenario gewist',
      duration: 5000,
      action: {
        label: 'Ongedaan maken',
        onClick: () => {
          // Exact terug wat de reset wiste: sliders + rendement-delta's.
          setScenarioSliderEvents(snapshot.sliderEvents)
          setScenarioReturnDeltas(snapshot.returnDeltas)
        },
      },
    })
  }, [scenarioSliderEvents, scenarioReturnDeltas, addToast])

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
        stopKoppel: scenarioStopKoppel,
        lockedMarge: lockedMargeRef.current,
      }),
    [whatIfBaseline, scenarioSliderEvents, scenarioReturnDeltas, scenarioStopAge, scenarioStopKoppel],
  )

  // "Je draait aan je doel"-banner: wijkt de live-stand af van het vastgelegde doel?
  const conceptGewijzigd = useMemo(
    () => doelActief && isDoelConceptGewijzigd(buildLiveStandNow(), doelBlok?.stand),
    [doelActief, doelBlok, buildLiveStandNow],
  )

  // Doel-gewogen totaalrendement (%) uit de live rendement-delta's; null → geen rendement-doel.
  const doelRendementPct = useMemo(
    () =>
      doelGewogenRendement(
        initialData.assets,
        scenarioReturnDeltas as Partial<Record<AssetCategorie, number>>,
      ),
    [initialData.assets, scenarioReturnDeltas],
  )
  // FIRE-doelwaarden: L = gekozen stop, anders verwacht-FIRE naar boven op 0,5; M = marge op 0,5, ≥ 0.
  const doelFireLeeftijd =
    scenarioStopAge ??
    (scenarioVerwachtFireAge !== null ? Math.ceil(scenarioVerwachtFireAge * 2) / 2 : null)
  const doelMargeJaren = Math.max(0, Math.round((stopMarge.margeJaren ?? 0) * 2) / 2)

  // De afwijkende parameters → sheet-previews (label + waarde-string). Rendement verdwijnt
  // als het doel-rendement null is (geen bezittingen); FIRE verschijnt zodra er een stopkeuze
  // (expliciet of gekoppeld) ligt. Alleen wanneer de bijbehorende live-stand afwijkt.
  const doelPreviews = useMemo<DoelParameterPreview[]>(() => {
    const stand = buildLiveStandNow()
    const previews: DoelParameterPreview[] = []
    if (whatIfBaseline && stand.sliders?.savings !== undefined) {
      const savings = readSliderValueFromEvents('savings', scenarioSliderEvents, whatIfBaseline)
      previews.push({ parameter: 'spaarquote', label: 'Spaarquote', waarde: `${Math.round(savings)}%` })
    }
    if (whatIfBaseline && stand.sliders?.income !== undefined) {
      const income = readSliderValueFromEvents('income', scenarioSliderEvents, whatIfBaseline)
      previews.push({ parameter: 'salaris', label: 'Salaris', waarde: `${formatCurrency(income)}/mnd` })
    }
    if (stand.returnDeltaByCategorie !== undefined && doelRendementPct !== null) {
      previews.push({
        parameter: 'rendement',
        label: 'Verwacht rendement',
        waarde: `${doelRendementPct.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
      })
    }
    if ((stand.stopAge != null || stand.stopKoppel) && doelFireLeeftijd !== null) {
      const fmt = (v: number) => v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
      previews.push({
        parameter: 'fire',
        label: 'Vrijheidsleeftijd',
        waarde: `Vrij op ${fmt(doelFireLeeftijd)} jr · ≥ ${fmt(doelMargeJaren)} jr marge`,
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
        salarisMnd:
          gekozen.salaris && whatIfBaseline
            ? readSliderValueFromEvents('income', scenarioSliderEvents, whatIfBaseline)
            : undefined,
        rendementPct: gekozen.rendement ? doelRendementPct ?? undefined : undefined,
        fireLeeftijd: gekozen.fire ? doelFireLeeftijd ?? undefined : undefined,
        margeJaren: gekozen.fire ? doelMargeJaren : undefined,
      }
      setDoelSaving(true)
      try {
        const res = await fetch('/api/toekomst-doel', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'vastleggen', parameters: gekozen, stand, doelwaarden }),
        })
        const json = (await res.json().catch(() => null)) as { ok?: boolean; goalIds?: Partial<Record<DoelParameter, string>> } | null
        if (!res.ok || !json?.ok) {
          addToast({ type: 'error', title: 'Doel niet vastgelegd', message: 'Probeer het zo nog eens.' })
          return
        }
        setDoelBlok({
          gezetOp: new Date().toISOString(),
          parameters: gekozen,
          stand,
          ...(json.goalIds ? { goalIds: json.goalIds } : {}),
        })
        setShowScenarioLine(true)
        setDoelSheetOpen(false)
        addToast({
          type: 'success',
          title: doelActief ? 'Doel bijgewerkt' : 'Doel vastgelegd',
          message: 'Je verkenning is nu je doel.',
        })
      } catch {
        addToast({ type: 'error', title: 'Doel niet vastgelegd', message: 'Probeer het zo nog eens.' })
      } finally {
        setDoelSaving(false)
      }
    },
    [buildLiveStandNow, whatIfBaseline, scenarioSliderEvents, doelRendementPct, doelFireLeeftijd, doelMargeJaren, doelActief, addToast],
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
      addToast({ type: 'success', title: 'Doel losgelaten', message: 'Je verkent weer vrij.' })
    } catch {
      addToast({ type: 'error', title: 'Doel niet losgelaten', message: 'Probeer het zo nog eens.' })
    } finally {
      setDoelSaving(false)
    }
  }, [addToast])

  // "Herstel mijn doel": kopieer de vastgelegde `doel.stand` terug naar de live-states.
  // Sliders reconstrueren zoals de pref-hydratie (buildSliderEvent per key); rendement-delta's,
  // stopAge/koppel en de koppel-marge direct terugzetten.
  const handleDoelHerstellen = useCallback(() => {
    const stand = doelBlok?.stand
    if (!stand) return
    if (whatIfBaseline && currentAge !== null) {
      const KEY_MAP: Record<string, SliderKey> = {
        income: 'income',
        workdays: 'workdays',
        savings: 'savings',
        extraInleg: 'extra_inleg',
      }
      const evs: WhatIfEvent[] = []
      for (const [prefKey, sliderKey] of Object.entries(KEY_MAP)) {
        const val = stand.sliders?.[prefKey as keyof NonNullable<typeof stand.sliders>]
        if (val === undefined) continue
        const ev = buildSliderEvent(sliderKey, val, whatIfBaseline, currentAge)
        if (ev) evs.push(ev)
      }
      setScenarioSliderEvents(evs)
    } else {
      setScenarioSliderEvents([])
    }
    setScenarioReturnDeltas({ ...(stand.returnDeltaByCategorie ?? {}) })
    setScenarioStopAge(stand.stopAge ?? null)
    setScenarioStopKoppel(stand.stopKoppel ?? false)
    lockedMargeRef.current = stand.stopMarge ?? null
  }, [doelBlok, whatIfBaseline, currentAge])

  // Compacte FIRE-delta voor de toggle-pill ("−30 mnd" = eerder vrij; beslishulp-conventie).
  const scenarioFireDeltaMonths =
    scenarioVerwachtFireAge !== null && scenarioBaseFireAge !== null
      ? Math.round((scenarioVerwachtFireAge - scenarioBaseFireAge) * 12)
      : null
  const scenarioFireDeltaLabel =
    scenarioFireDeltaMonths === null
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
      hasScenario || scenarioStopAge !== null || scenarioStopKoppel || !showScenarioLine || doelBlok != null
    if (!deviatesFromDefaults && initialData.toekomstScenarioPrefs == null) return
    const handle = setTimeout(() => {
      // KRITIEK: het doel-blok gaat via `buildScenarioPersistPayload` in ELKE PUT mee.
      const payload = buildScenarioPersistPayload({
        stand: buildLiveStand({
          baseline: whatIfBaseline,
          sliderEvents: scenarioSliderEvents,
          returnDeltas: scenarioReturnDeltas,
          stopAge: scenarioStopAge,
          stopKoppel: scenarioStopKoppel,
          // Bij koppelmodus is de marge de bewaarde waarheid (zie lockedMargeRef-doc);
          // ref lezen op schrijfmoment — elke marge-wijziging loopt via een handler die
          // ook state zet, dus dit effect vuurt dan sowieso.
          lockedMarge: lockedMargeRef.current,
        }),
        showScenarioLine,
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
  }, [scenarioSliderEvents, scenarioReturnDeltas, scenarioStopAge, scenarioStopKoppel, showScenarioLine, whatIfBaseline, currentAge, hasScenario, doelBlok, initialData.toekomstScenarioPrefs, addToast])

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

  /** Compute suggested (catalog-default) values for a given event type, using profile data */
  function computeSuggestedValues(type: string): SuggestedEventValues {
    return computeSuggestedEventValues(type, {
      userAowAge,
      currentAge,
      effectiveInput,
      isHouseholdView,
      effectiveNetWorth,
      debts,
    })
  }

  /** Validate event form — returns true if valid, false if errors found */
  function validateEventForm(): boolean {
    const errors: string[] = []
    const warnings: string[] = []

    // Required: naam
    if (!formName.trim()) {
      errors.push('Vul een naam in voor dit evenement.')
    }

    // Amount validation: no negative amounts
    const amt = Number(formAmount)
    if (typeof formAmount === 'number' && amt < 0) {
      errors.push('Bedrag mag niet negatief zijn. Gebruik de keuze Inkomen/Kosten voor de richting.')
    }

    // Duration validation for period type
    if (formDurationType === 'period') {
      const dur = Number(formDuration)
      if (!dur || dur <= 0) {
        errors.push('Vul een geldige duur in (minimaal 1 maand).')
      } else if (dur > 600) {
        warnings.push('Een duur van meer dan 50 jaar is ongebruikelijk. Controleer of dit klopt.')
      }
    }

    // Age validation
    if (formAge !== '' && typeof formAge === 'number') {
      if (formAge < 0) {
        errors.push('Leeftijd kan niet negatief zijn.')
      } else if (formAge > 120) {
        errors.push('Leeftijd mag niet hoger zijn dan 120 jaar.')
      }
    }

    // AOW-specific: warn if age deviates significantly from personal AOW age
    if (formType === 'aow' && typeof formAge === 'number' && formAge < 60) {
      warnings.push(`Let op: je persoonlijke AOW-leeftijd is ${userAowAge.months > 0 ? `${userAowAge.years} jaar en ${userAowAge.months} maanden` : `${userAowAge.years} jaar`}. Een eerdere leeftijd dan 60 is onrealistisch.`)
    }

    // Children-specific: validate aantalKinderen
    if (formType === 'children') {
      const aantalKinderen = Number(formMetadata.aantalKinderen ?? 0)
      if (aantalKinderen <= 0) {
        errors.push('Selecteer minimaal 1 kind bij het Kinderen-evenement.')
      }
    }

    // Early retirement: warn if retirement age < 40
    if (formType === 'early_retirement' && typeof formAge === 'number' && formAge < 40) {
      warnings.push('Vervroegd pensioen voor je 40e is zeer ongebruikelijk. Controleer de leeftijd.')
    }

    // Werkloosheid ná de vrijheidsleeftijd: de kern telt een vrije Geb-rij
    // onvoorwaardelijk door, óók ná FIRE — voor een baanverlies klopt dat niet.
    // Grondslag vastgelegd in RISICO_EVENT_NA_FIRE (lib/horizon/risico-event-regels.ts).
    if (formType === 'werkloosheid') {
      const naFire = werkloosheidNaFireWaarschuwing(
        typeof formAge === 'number' ? formAge : null,
        simResult?.fireAgeFractional ?? simResult?.fireAge ?? null,
      )
      if (naFire) warnings.push(naFire)
    }

    setFormErrors(errors)
    setFormWarnings(warnings)
    return errors.length === 0
  }

  async function saveEvent() {
    // Run validation — block save on errors (warnings are advisory)
    if (!validateEventForm()) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const icon = LIFE_EVENT_CATALOG[formType]?.icon ?? 'Calendar'
    const amount = Number(formAmount) || 0
    let durMonths = formDurationType === 'period' ? Number(formDuration) || 0 : 0

    let oneTimeCost = 0
    let monthlyCostChange = 0
    let monthlyIncomeChange = 0

    if (formDurationType === 'one_time') {
      oneTimeCost = formDirection === 'expense' ? amount : -amount
    } else if (formDirection === 'income') {
      monthlyIncomeChange = amount
    } else {
      monthlyCostChange = amount
    }

    // Special handling for house_sale: also include monthly cost difference
    if (formType === 'house_sale') {
      const oudeLasten = Number(formMetadata.oudeHypotheeklasten) || 0
      const nieuweLasten = Number(formMetadata.nieuweWoonlasten) || 0
      const verschil = oudeLasten - nieuweLasten // positive = saving money
      if (verschil > 0) {
        // Old costs were higher → monthly income (savings)
        monthlyIncomeChange = verschil
      } else if (verschil < 0) {
        // New costs are higher → monthly expense increase
        monthlyCostChange = Math.abs(verschil)
      }
    }

    // Special handling for house_purchase: kosten koper + monthly cost change (mortgage + onderhoud - rent)
    if (formType === 'house_purchase') {
      const huidigeHuur = Number(formMetadata.huidigeHuur) || 0
      const hypotheekLasten = Number(formMetadata.hypotheekLasten) || 1200
      const aankoopprijs = Number(formMetadata.aankoopprijs) || 350000
      const onderhoudMaand = Math.round((aankoopprijs * 0.01) / 12) // ~1% woningwaarde/jaar
      const bruteMaandlast = hypotheekLasten + onderhoudMaand
      const nettoMaandlast = bruteMaandlast - huidigeHuur
      if (nettoMaandlast > 0) {
        monthlyCostChange = nettoMaandlast
        monthlyIncomeChange = 0
      } else {
        monthlyCostChange = 0
        monthlyIncomeChange = Math.abs(nettoMaandlast) // saving money
      }
    }

    // Special handling for scheiding: combine all monthly costs
    if (formType === 'scheiding') {
      const alimentatiePartner = Number(formMetadata.partneralimentatieBedrag) || 0
      const alimentatieKinderen = Number(formMetadata.kinderalimentatieBedrag) || 0
      const extraWoon = Number(formMetadata.extraWoonlasten) || 0
      const richting = formMetadata.partneralimentatieRichting ?? 'betalen'
      // Alimentatie: betalen = cost, ontvangen = income
      if (richting === 'betalen') {
        monthlyCostChange = alimentatiePartner + alimentatieKinderen + extraWoon
      } else {
        // Ontvangen partner alimentatie, but still pay kinderalimentatie + extra woonlasten
        monthlyIncomeChange = alimentatiePartner
        monthlyCostChange = alimentatieKinderen + extraWoon
      }
      // Use longest duration among alimentatie and extra woonlasten
      const maxDuur = Math.max(
        Number(formMetadata.partneralimentatieDuur) || 0,
        Number(formMetadata.kinderalimentatieDuur) || 0,
        60 // extra woonlasten default 5 years
      )
      if (maxDuur > 0) durMonths = maxDuur
    }

    // Special handling for werkloosheid: transitievergoeding + income gap.
    // Canonieke rekenregel (incl. de wettelijke 75%/70%-trap en het maximum-
    // dagloon) staat in lib/horizon/risico-event-regels.ts — hier alleen consumeren.
    if (formType === 'werkloosheid') {
      const impact = berekenWerkloosheidImpact(formMetadata)
      oneTimeCost = impact.oneTimeCost
      monthlyCostChange = impact.monthlyCostChange
      monthlyIncomeChange = impact.monthlyIncomeChange
      durMonths = impact.durMonths
    }

    // Special handling for career_change: three-phase salary model
    // Phase 1: gap (0 income), Phase 2: transition (lower salary), Phase 3: new normal
    if (formType === 'career_change') {
      const huidig = Number(formMetadata.huidigNettoSalaris) || 3000
      const nieuw = Number(formMetadata.verwachtNieuwNettoSalaris) || 3000
      const gapMaanden = Number(formMetadata.periodeZonderInkomen) || 3
      const overgangMaanden = Number(formMetadata.overgangsperiodeMaanden) || 12
      const omscholing = Number(formMetadata.omscholingskosten) || 0

      // Omscholingskosten as one-time expense
      oneTimeCost = omscholing

      // Average monthly income loss across all three phases:
      // Phase 1: full income loss (gapMaanden months at -huidig)
      // Phase 2: partial loss (overgangMaanden months at midpoint between huidig and nieuw)
      // Phase 3: new salary (permanent, modeled separately if different from huidig)
      const overgangSalaris = Math.round((huidig + nieuw) / 2) // midpoint during transition
      const totalMaanden = gapMaanden + overgangMaanden

      if (totalMaanden > 0) {
        // Weighted average income loss per month during gap+transition
        const totalLoss = (gapMaanden * huidig) + (overgangMaanden * (huidig - overgangSalaris))
        const gemiddeldVerlies = Math.round(totalLoss / totalMaanden)
        monthlyIncomeChange = -gemiddeldVerlies
        durMonths = totalMaanden
      }

      // If new salary is permanently different, that's a separate ongoing change
      // We don't model permanent salary change here — only the transition period
      // The user can adjust their profile income after the switch
    }

    // Special handling for move: verhuiskosten + inrichting + dubbele lasten + maandlastenverschil
    if (formType === 'move') {
      const verhuiskosten = Number(formMetadata.verhuiskosten) || 1500
      const inrichtingskosten = Number(formMetadata.inrichtingskosten) || 3000
      const dubbeleLastenMaanden = Number(formMetadata.dubbeleLastenMaanden) || 2
      const dubbeleLastenBedrag = Number(formMetadata.dubbeleLastenBedrag) || 1200
      const huurverschil = Number(formMetadata.huurverschil) || 0
      const verschilPermanent = formMetadata.verschilPermanent !== undefined ? Boolean(formMetadata.verschilPermanent) : true
      const dubbeleLastenTotaal = dubbeleLastenMaanden * dubbeleLastenBedrag
      // One-time = verhuiskosten + inrichting + dubbele lasten
      oneTimeCost = verhuiskosten + inrichtingskosten + dubbeleLastenTotaal
      // Monthly = huurverschil (positive = duurder = expense, negative = goedkoper = saving)
      if (huurverschil > 0) {
        monthlyCostChange = huurverschil
      } else if (huurverschil < 0) {
        monthlyIncomeChange = Math.abs(huurverschil) // savings modeled as income change
      }
      // Duration: permanent (0 = until FIRE) or use formDuration
      durMonths = verschilPermanent ? 0 : (Number(formDuration) || 60)
    }

    // Special handling for wedding: bruiloft + huwelijksreis + optional huwelijksvoorwaarden
    if (formType === 'wedding') {
      const bruiloftBudget = Number(formAmount) || 20000
      const huwelijksreis = Number(formMetadata.huwelijksreis) || 0
      const huwelijksvoorwaarden = Boolean(formMetadata.huwelijksvoorwaarden)
      const notariskosten = huwelijksvoorwaarden ? 1200 : 0
      const totaal = bruiloftBudget + huwelijksreis + notariskosten
      // Sign convention (zie inheritance): expense = positief one_time_cost, income = negatief
      oneTimeCost = formDirection === 'income' ? -totaal : totaal
      monthlyCostChange = 0
      monthlyIncomeChange = 0
      durMonths = 0
    }

    // Special handling for schenking: calculate total including belasting
    if (formType === 'schenking') {
      const bedrag = Number(formAmount) || 0
      const aantalOntvangers = Math.max(1, Number(formMetadata.aantalOntvangers) || 1)
      const relatie = String(formMetadata.relatieOntvanger ?? 'kind')
      const frequentie = String(formMetadata.eenmaligOfJaarlijks ?? 'eenmalig')
      const bedragPerOntvanger = bedrag / aantalOntvangers
      const { belasting } = berekenSchenkbelasting(bedragPerOntvanger, relatie)
      const totaleBelasting = belasting * aantalOntvangers
      // Total cost = schenking + belasting
      oneTimeCost = bedrag + totaleBelasting
      monthlyCostChange = 0
      monthlyIncomeChange = 0
      if (frequentie === 'jaarlijks') {
        const jaren = Math.max(1, Number(formMetadata.aantalJaren) || 10)
        durMonths = jaren * 12
        // Convert to monthly: yearly total / 12
        monthlyCostChange = Math.round((bedrag + totaleBelasting) / 12)
        oneTimeCost = 0
      }
    }

    // Special handling for side_hustle: brutoOmzet - kosten = netto + opstartkosten
    if (formType === 'side_hustle') {
      const brutoOmzet = Number(formMetadata.brutoOmzet ?? 1500)
      const kosten = Number(formMetadata.kostenPerMaand ?? 300)
      const opstartkosten = Number(formMetadata.opstartkosten ?? 1000)
      const nettoPM = Math.max(0, brutoOmzet - kosten)
      const isDoorlopend = formMetadata.doorlopend !== undefined ? Boolean(formMetadata.doorlopend) : true
      oneTimeCost = opstartkosten
      monthlyIncomeChange = nettoPM
      monthlyCostChange = 0
      durMonths = isDoorlopend ? 0 : (Number(formDuration) || 36)
    }

    // Special handling for world_trip: vertrekkosten + reisbudget + vaste lasten
    if (formType === 'world_trip') {
      const reisstijl = String(formMetadata.reisstijl ?? 'budget')
      const preset = WERELDREIS_STIJL_PRESETS[reisstijl]
      const reisbudgetPerPersoon = preset?.bedrag ?? 1200
      const aantalPersonen = Math.max(1, Number(formMetadata.aantalPersonen) || 1)
      // Scale for multiple travelers: 2 people ≈ 1.6× one person
      const personFactor = aantalPersonen === 1 ? 1 : 1 + (aantalPersonen - 1) * 0.6
      const reisbudget = Math.round(reisbudgetPerPersoon * personFactor)
      const vertrekkosten = Number(formMetadata.vertrekkosten ?? 4000)
      const vasteLastenThuis = Boolean(formMetadata.vasteLastenThuis ?? true)
      const vasteLastenBedrag = vasteLastenThuis ? (Number(formMetadata.vasteLastenBedrag) || 800) : 0
      // One-time cost = vertrekkosten
      oneTimeCost = vertrekkosten
      // Monthly cost = reisbudget + vaste lasten thuis
      monthlyCostChange = reisbudget + vasteLastenBedrag
      // Income loss during trip (default from catalog)
      monthlyIncomeChange = LIFE_EVENT_CATALOG.world_trip?.defaultMonthlyIncome ?? -3000
      // Duration
      durMonths = Number(formDuration) || LIFE_EVENT_CATALOG.world_trip?.defaultDuration || 12
    }

    // Special handling for study: collegegeld + salary increase after completion
    if (formType === 'study') {
      const collegegeld = Number(formMetadata.collegegeld ?? formAmount) || 5000
      const salarisstijging = Number(formMetadata.salarisstijging) || 0
      const studiePreset = STUDIE_TYPE_KOSTEN[String(formMetadata.studieType ?? 'master')]
      const studieDuur = Number(formDuration) || studiePreset?.duur || 12
      // One-time cost = collegegeld
      oneTimeCost = collegegeld
      monthlyCostChange = 0
      // Salary increase after completion (continuous positive income change)
      if (salarisstijging > 0) {
        monthlyIncomeChange = salarisstijging
      }
      durMonths = studieDuur
    }

    // Special handling for inheritance: calculate netto erfenis after erfbelasting
    if (formType === 'inheritance') {
      const brutoBedrag = Number(formMetadata.brutoBedrag ?? 50000)
      const relatie = String(formMetadata.erfbelastingSchijf ?? 'kind')
      const erf = berekenErfbelasting(brutoBedrag, relatie)
      // Netto erfenis as one-time income (negative cost = income)
      oneTimeCost = -erf.netto
      monthlyCostChange = 0
      monthlyIncomeChange = 0
      durMonths = 0
    }

    // Special handling for sabbatical: inkomensverlies + extra kosten
    if (formType === 'sabbatical') {
      const nettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
      const doorbetalingsPct = Math.min(100, Math.max(0, Number(formMetadata.doorbetalingsPct ?? 0)))
      const extraKosten = Number(formMetadata.extraKosten ?? 2000)
      // Income loss = netto * (1 - doorbetaling%)
      const inkomensverlies = Math.round(nettoInkomen * (1 - doorbetalingsPct / 100))
      monthlyIncomeChange = -inkomensverlies // negative = loss of income
      monthlyCostChange = 0
      // Extra kosten as one-time expense
      oneTimeCost = extraKosten
    }

    // Special handling for overlijden_partner: net income impact + cost reduction.
    // Canonieke rekenregel (incl. het Anw-bedrag uit lib/sociale-zekerheid.ts)
    // staat in lib/horizon/risico-event-regels.ts — hier alleen consumeren.
    if (formType === 'overlijden_partner') {
      const impact = berekenOverlijdenPartnerImpact(formMetadata, {
        maandlastenHuishouden: effectiveInput?.monthlyExpenses ?? 0,
      })
      oneTimeCost = impact.oneTimeCost
      monthlyCostChange = impact.monthlyCostChange
      monthlyIncomeChange = impact.monthlyIncomeChange
      durMonths = impact.durMonths
    }

    // Special handling for pension: brutoBedrag → monthlyIncomeChange, uitkeringsduur → duration
    if (formType === 'pension') {
      const brutoBedrag = Number(formMetadata.brutoBedrag ?? 675)
      monthlyIncomeChange = brutoBedrag
      monthlyCostChange = 0
      oneTimeCost = 0
      const uitkeringsduur = String(formMetadata.uitkeringsduur ?? 'levenslang')
      if (uitkeringsduur === 'levenslang') {
        durMonths = 0
      } else {
        durMonths = Number(uitkeringsduur) * 12
      }
    }

    // Special handling for part_time: income loss from hours reduction
    if (formType === 'part_time') {
      const huidigUren = Number(formMetadata.huidigUren ?? 40)
      const nieuwUren = Number(formMetadata.nieuwUren ?? 32)
      const nettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
      const reductie = huidigUren > 0 ? 1 - (nieuwUren / huidigUren) : 0
      const inkomensVerlies = Math.round(nettoInkomen * Math.max(0, reductie))
      monthlyIncomeChange = -inkomensVerlies
      monthlyCostChange = 0
      oneTimeCost = 0
      const isPermanent = Boolean(formMetadata.isPermanent ?? false)
      durMonths = isPermanent ? 0 : (Number(formDuration) || 60)
    }

    // Special handling for early_retirement: income loss from pensioenleeftijd to AOW
    if (formType === 'early_retirement') {
      const pensioenLeeftijd = Number(formMetadata.pensioenLeeftijd ?? 62)
      const aowLeeftijd = Math.ceil(userAowAge.fractional)
      const aowGapMaanden = Math.max(0, (aowLeeftijd - pensioenLeeftijd) * 12)
      const maanduitgaven = effectiveInput?.monthlyExpenses ?? 3000
      const overbrugging = Number(formMetadata.overbruggingsUitkering ?? 0)
      // Net monthly income loss = -(expenses - any bridging income)
      monthlyIncomeChange = -(maanduitgaven - overbrugging)
      monthlyCostChange = 0
      oneTimeCost = 0
      durMonths = aowGapMaanden
      // formAge is already set to pensioenLeeftijd via setFormAge in openAddForm
    }

    // Special handling for children: add one-time baby costs (babyuitzet)
    if (formType === 'children') {
      const babyuitzet = Number(formMetadata.babyuitzet ?? 3000)
      if (babyuitzet > 0) {
        oneTimeCost = babyuitzet
      }
    }

    // Special handling for car_purchase: compute monthly costs from breakdown
    if (formType === 'car_purchase') {
      const brandstof = String(formMetadata.brandstof ?? 'benzine')
      const jaarlijkseKm = Number(formMetadata.jaarlijkseKm ?? 15000)
      const breakdown = berekenAutoMaandkosten(brandstof, jaarlijkseKm)
      const vervangt = Boolean(formMetadata.vervangtHuidigeAuto)
      const huidigeKosten = vervangt ? Number(formMetadata.huidigeAutoKosten ?? 300) : 0
      const nettoMaand = breakdown.totaal - huidigeKosten
      if (nettoMaand > 0) {
        monthlyCostChange = nettoMaand
        monthlyIncomeChange = 0
      } else {
        monthlyCostChange = 0
        monthlyIncomeChange = Math.abs(nettoMaand) // saving money
      }
    }

    // Store custom cashflows and toelichting in metadata and compute backward-compatible flat fields
    const metaWithCashflows: Record<string, unknown> = { ...formMetadata, toelichting: formDescription || undefined, uses_suggested: useSuggestedSettings }
    if (formCashflows.length > 0) {
      metaWithCashflows.cashflows = formCashflows
      // Backward-compatible flat fields from cashflows
      const cfOneTimeCost = formCashflows
        .filter(cf => cf.type === 'one_time' && cf.direction === 'expense')
        .reduce((s, cf) => s + cf.amount, 0)
        - formCashflows
        .filter(cf => cf.type === 'one_time' && cf.direction === 'income')
        .reduce((s, cf) => s + cf.amount, 0)
      const cfMonthlyCost = formCashflows
        .filter(cf => cf.type === 'recurring' && cf.direction === 'expense')
        .reduce((s, cf) => s + cf.amount, 0)
      const cfMonthlyIncome = formCashflows
        .filter(cf => cf.type === 'recurring' && cf.direction === 'income')
        .reduce((s, cf) => s + cf.amount, 0)
      const cfMaxDuration = Math.max(0, ...formCashflows.map(cf => cf.durationMonths))
      oneTimeCost = cfOneTimeCost
      monthlyCostChange = cfMonthlyCost
      monthlyIncomeChange = cfMonthlyIncome
      durMonths = cfMaxDuration
    }

    const payload = {
      user_id: user.id,
      name: formName,
      event_type: formType,
      target_age: formAge || null,
      one_time_cost: oneTimeCost,
      monthly_cost_change: monthlyCostChange,
      monthly_income_change: monthlyIncomeChange,
      duration_months: durMonths,
      is_indexed: formIsIndexed,
      icon,
      sort_order: events.length,
      is_active: true,
      metadata: metaWithCashflows,
    }

    let savedEventId: string | null = null

    if (editingEvent) {
      const { error: updateError } = await supabase.from('life_events').update(payload).eq('id', editingEvent.id)
      if (updateError) {
        console.error('Failed to update life event:', updateError.message, updateError.code, updateError.details)
        setFormErrors([`Bijwerken mislukt: ${updateError.message || updateError.code || 'Onbekende fout'}`])
        return
      }
      savedEventId = editingEvent.id
    } else {
      const { data: insertedData, error: insertError } = await supabase.from('life_events').insert(payload).select('id').single()
      if (insertError) {
        console.error('Failed to save life event:', insertError.message, insertError.code, insertError.details)
        setFormErrors([`Opslaan mislukt: ${insertError.message || insertError.code || 'Onbekende fout'}`])
        return
      }
      savedEventId = insertedData?.id ?? null
    }

    // Upload pending pension PDF to storage after save
    if (savedEventId && pendingPensionFileRef.current && (formType === 'pension' || formType === 'early_retirement')) {
      await uploadPensionPdfToStorage(pendingPensionFileRef.current, savedEventId)
      pendingPensionFileRef.current = null
    }

    setShowForm(false)
    setEditingEvent(null)
    setFormErrors([])
    setFormWarnings([])
    setFormCashflows([])
    setEditingCashflowId(null)
    setFormDescription('')
    setShowCatalogFields(false)
    setPensionParseResult(null)
    setAutoFilledFields(new Set())
    setSelectedRegelingIndex(0)
    pendingPensionFileRef.current = null
    if (selectedEventId) {
      setSelectedEventId(null)
      setViewModalMode('view')
    }
    await refreshEvents()
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
          await loadData()
          addToast({ type: 'success', title: `${ev.name} terug op ${originalAge}j`, duration: 3000 })
        },
      },
    })

    // Full reload to recalculate projections with new event position
    await loadData()
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
  // Spookrand van het eerste opgeslagen scenario in de Inkomsten&Uitgaven-strook:
  // eigen leeftijd-as, `SimRow[]` ⇒ leeftijd-sleutel.
  const viewGhostOverlayRows = useMemo(() => {
    const rows = scenarioOverlayDataList[0]?.rows
    return rows == null ? undefined : deflateRowsByAge(rows, factorByAge, SIM_ROW_MONEY_FIELDS, euroView)
  }, [scenarioOverlayDataList, factorByAge, euroView])

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
  // De FIRE-doelen horen bij de FIRE-leeftijd, "vermogen op AOW" en de
  // maandonttrekking bij de AOW-leeftijd. Een generieke "factor van nu" zou hier
  // stelselmatig te weinig deflateren; de leeftijd is juist wat het bedrag zijn
  // koopkracht geeft.
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
  const viewFireTargetExclHome = fireTargetExclHome == null ? null : deflate(fireTargetExclHome, fireFactor, euroView)
  const viewBalkVrijheidDoel = deflate(balkVrijheidDoel, fireFactor, euroView)
  const viewEffectiveFireTarget = deflate(effectiveFireTarget, fireFactor, euroView)
  const viewPortfolioAtAow = portfolioAtAow == null ? null : deflate(portfolioAtAow, aowFactor, euroView)
  const viewMonthlyWithdrawalAtAow =
    monthlyWithdrawalAtAow == null ? null : deflate(monthlyWithdrawalAtAow, aowFactor, euroView)

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
  // Consume-only: `homeExcludedFromProgress` is dezelfde vlag die
  // `balkVrijheidDoel` hierboven al koos — hier wordt niets herbepaald.
  // Geen kwalificatie waar ze niet klopt of niets betekent: in pensioen-modus is
  // het getal een projectie (geen doel), onder 'nu stoppen' bestaat er geen
  // doelbedrag (ADR 0127 D4) en bij een huishoud-/partnerweergave komt het
  // bedrag uit een andere bron dan deze vlag.
  const fireTargetCaption = isPensioenMode
    ? 'geprojecteerd'
    : hasPerspectiveHero || isNuStoppenMode
      ? 'benodigd'
      : homeExcludedFromProgress
        ? 'benodigd — zonder je huis'
        : 'benodigd — met je huis'

  // ── Reeds-vrij / met-pensioen framing voor de hero-leeftijdsstat ───────────
  // Consume-only (ADR 0009): leest de reeds-berekende vrijheidsvoortgang +
  // leeftijden, herberekent niets. Zodra de gebruiker financieel vrij is toont
  // de "vrijheidsleeftijd"-stat anders het feitelijk huidige (FIRE≈huidige)
  // leeftijd-getal — verwarrend. Dan tonen we i.p.v. een getal "Je bent vrij" /
  // "Je bent met pensioen". Alleen voor de eigen view (niet huishouden/partner).
  const heroFreedomFraming = resolveFreedomFraming({
    freedomPct: effectiveFreedomPct,
    currentAge,
    // Consume-only: exact hetzelfde kernantwoord als de KPI eronder — nooit
    // een eigen precedentieketen (dat was juist de drift-bron van C1).
    fireAge: heroFireAge.age,
    strategy: fireStrategy?.strategy,
    aowAge: userAowAge.fractional,
  })
  // ADR 0127 — 'nu-stoppen' uitgezonderd: bij volledige tijdsdekking geeft
  // `resolveFreedomFraming` daar 'nu-stoppen' terug, maar de zin "Je bent vrij"
  // in de plaats van het getal is dan juist mis. Onder dit anker ís het getal het
  // antwoord (tot welke leeftijd het reikt) — alleen het LABEL verandert.
  const showFreeHero =
    !hasPerspectiveHero && heroFreedomFraming !== 'building' && heroFreedomFraming !== 'nu-stoppen'
  const freeHeroPhrase = heroFreedomFraming === 'pensioen' ? 'Je bent met pensioen' : 'Je bent vrij'
  const freeHeroLabel = heroFreedomFraming === 'pensioen' ? 'Pensioen' : 'Vrijheid'

  // ── KPI-koppen van de leeftijds-tegel (ADR 0127) ───────────────────────
  // Één plek voor de drie varianten, zodat desktop- en mobiele tegel (en hun
  // kassabon) niet uiteen kunnen lopen.
  const heroAgeLabel = isNuStoppenMode
    ? NU_STOPPEN_KPI_LABEL
    : isPensioenMode
      ? 'Pensioenleeftijd'
      : 'Vrijheidsleeftijd'
  const heroAgeLabelKort = isNuStoppenMode
    ? NU_STOPPEN_KPI_LABEL_KORT
    : isPensioenMode
      ? 'Pensioenlft'
      : 'Vrijheidslft'
  const heroAgeCaptionBase = isNuStoppenMode
    ? (nuStoppenReach != null ? nuStoppenKpiCaption(nuStoppenReach) : 'jaar')
    : isPensioenMode
      ? 'AOW-leeftijd'
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
  // ADR 0127 D4 — 'nu-stoppen' is uitgezonderd: de doelbedrag-guard is daar
  // bewust NIET ok ('geen-doelvermogen'). Dat is geen ontbrekend gegeven maar
  // een eigenschap van de strategie; het moment (tot waar het vermogen reikt)
  // is er wél en hoort te blijven staan. Zonder die uitzondering zou de tegel
  // op elke nu-stoppen-run de gegevensmelding tonen.
  const showFireAgeNotice =
    !hasPerspectiveHero &&
    !isPensioenMode &&
    !isNuStoppenMode &&
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
  // uitleg in "Geld is opgeslagen tijd"-geest; de gewogen layout + emphasis-
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
          {/* Embedded (op /toekomst): geen eigen PageInfoButton — de paginakop
              (PageOpening "Je tijdas") levert 'm al. Alleen op de legacy-route
              /horizon (standalone) rendert de i-knop hier. */}
          {!embedded && <PageInfoButton content={pageInfoText} />}
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
        {/* Headline met italic-em "vrij" — alleen als volwaardige pagina-kop.
            Embedded op /toekomst zou dit een tweede H1 náást "Je tijdas" geven
            (dubbele hero, K-02); dan blijft de kop op kicker/sectie-niveau. */}
        {!embedded && (
          <h1
            className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            Wanneer ben je{' '}
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              vrij
            </em>
            ?
          </h1>
        )}
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
          {/* Header rij: kicker + Details pill.
              `relative z-[46]` (M9): de tips-scrim van ToekomstOverlay is een
              klik-vanger die als portal-kind van [data-scroll-container] op
              z-[45] over de VOLLE paginahoogte ligt — hij vervaagt bewust ook
              deze kop. Zonder eigen stapelniveau viel de Details-pill dus
              ónder die vanger: de eerste klik sloot de tips i.p.v. de
              jaar-op-jaar-tabel te openen. 46 tilt de rij precies één stap
              boven de scrim, en blijft ruim onder de grafiek+markers (z-[50])
              en onder elke overlay (z-[70]). Werkt omdat de hero-kaart in
              tips-modus `no-hover-lift` draagt en dus géén eigen
              stacking-context via hover-transform opent. */}
          <div className="relative z-[46] mb-3 sm:mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {hasPerspectiveHero && (
                <div>
                  <p className="label-editorial text-horizon-600">
                    {isPartnerView
                      ? `${perspectiveHero!.householdName} — Horizon`
                      : `${perspectiveHero!.householdName} — Gezamenlijke horizon`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                    {isPartnerView
                      ? `FIRE-projectie van ${perspectiveHero!.householdName}`
                      : 'Gecombineerde financiën van het huishouden'}
                  </p>
                </div>
              )}
            </div>
            {simResult && (
              <button
                type="button"
                onClick={() => setSimModalOpen(true)}
                // Pointerdown-guard, zelfde patroon als de ✕ en de markers in
                // toekomst-overlay.tsx: houd de pointerdown weg bij alles wat
                // hem zou kunnen kapen (pointer-capture/klik-vangers) zodat de
                // knop zijn eigen `onClick` gegarandeerd krijgt.
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-[var(--r-sm)] border border-horizon-200 bg-horizon-50 px-2 py-0.5 font-sans text-[10px] text-horizon-600 transition-all hover:bg-horizon-100"
              >
                <TableProperties className="h-3 w-3" />
                Details
              </button>
            )}
          </div>

          {/* Mobile: Primary number */}
          <div className="sm:hidden mb-3">
            <button type="button" onClick={() => setShowFireAgeReceipt(true)} className="text-left">
              {showFreeHero ? (
                <span className="font-serif text-[28px] font-bold tracking-tight text-[var(--ink)]">{freeHeroPhrase}.</span>
              ) : (
                <>
                  <span
                    className="font-display text-[36px] font-bold tracking-tight text-[var(--ink)]"
                    aria-busy={!hasPerspectiveHero && heroFireAgePending}
                  >
                    {hasPerspectiveHero
                      ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '-')
                      : heroFireAgeTextMobile}
                  </span>
                  <span className="ml-3 font-serif italic text-lg text-[var(--ink-3)]">
                    {hasPerspectiveHero
                      ? (isPensioenMode ? 'pensioenleeftijd' : 'vrijheidsleeftijd')
                      : heroFireAgeCaption(heroFireAge, heroAgeLabel.toLowerCase())}
                  </span>
                  {/* M5 — hetzelfde bonnetje-spoor als op de figures-strip: dit
                      grote getal is óók een knop naar zijn eigen aannames. */}
                  <Receipt className="ml-2 inline h-3.5 w-3.5 shrink-0 align-middle text-[var(--ink-4)]" aria-hidden />
                  <span className="sr-only">— tik voor de aannames achter dit getal</span>
                </>
              )}
            </button>
          </div>

          {/* Desktop: 4-col figures-strip — editorial blueprint */}
          <div className="hidden sm:grid sm:grid-cols-4 items-start border-t border-b border-[var(--ink)] mb-5">
            {/* KPI 1: Vrijheidsleeftijd / Pensioenleeftijd — winner met highlight-marker */}
            <button
              type="button"
              onClick={() => setShowFireAgeReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-fire-age"
              // Hardheid van het kernantwoord machineleesbaar (C1) — voedt de
              // UAT-controle "3-5x herladen geeft hetzelfde antwoord".
              data-fire-age-status={hasPerspectiveHero ? 'perspectief' : heroFireAge.status}
              aria-busy={!hasPerspectiveHero && heroFireAgePending}
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-leeftijd van ${perspectiveHero!.householdName}` : 'Gezamenlijke FIRE-leeftijd op basis van gecombineerd vermogen en gedeelde uitgaven') : isPensioenMode ? 'AOW-leeftijd op basis van je geboortedatum' : undefined}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
                <span>{showFireAgeNotice ? 'Vrijheidsleeftijd' : showFreeHero ? freeHeroLabel : heroAgeLabel}</span>
                <ReceiptCue />
              </div>
              {showFireAgeNotice ? (
                /* UR2-05: geen onderbouwd kernantwoord — dezelfde melding als de
                   Doelbedrag-tegel ernaast, niet een kaal getal of een streepje. */
                <HeroKpiNotice guard={fireAgeNoticeGuard} />
              ) : (
                <>
              <div
                className={`${showFreeHero ? 'text-[18px] sm:text-[20px] leading-tight' : 'text-[28px] sm:text-[32px] leading-none'} font-black tracking-[-0.02em] tabular-nums`}
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {showFreeHero
                    ? freeHeroPhrase
                    : hasPerspectiveHero
                      ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '–')
                      : heroFireAgeText}
                </span>
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {showFreeHero
                  ? ''
                  : hasPerspectiveHero
                    ? (isPartnerView ? `jaar (${perspectiveHero!.householdName})` : 'jaar (huishouden)')
                    : heroFireAgeCaption(heroFireAge, heroAgeCaptionBase)}
              </div>
                </>
              )}
            </button>

            {/* KPI 2: Doelbedrag / Verwacht vermogen op AOW */}
            <button
              type="button"
              onClick={() => setShowFireTargetReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-fire-target"
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-doelbedrag van ${perspectiveHero!.householdName}` : 'Gezamenlijk FIRE-doelbedrag op basis van gedeelde uitgaven') : isPensioenMode ? 'Geprojecteerd vermogen op je AOW-leeftijd' : undefined}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Target className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Vermogen op AOW' : 'Doelbedrag'}</span>
                <ReceiptCue />
              </div>
              {!hasPerspectiveHero && showFireTargetNotice ? (
                /* M6: onmogelijk/niet-berekenbaar doelbedrag — melding i.p.v. getal. */
                <HeroKpiNotice guard={fireTargetGuard} label={isNuStoppenMode ? 'Geen doelbedrag' : undefined} />
              ) : !hasPerspectiveHero && showDualFireTarget ? (
                <>
                  {/* Doel MET je huis — het grote doel; kwalificatie inline zodat de kaart even hoog blijft als de buur-KPI's */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <div
                      className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={viewFireTargetInclHome!} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[11px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      met je huis
                    </span>
                  </div>
                  {/* Doel ZONDER je huis (liquide) — het kleinere doel in horizon-accent, inline kwalificatie */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-1.5">
                    <div
                      className="text-[16px] sm:text-[18px] font-black leading-none tracking-[-0.02em] text-[var(--module-active-800)]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={viewFireTargetExclHome!} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[11px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      zonder je huis
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em]"
                    style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                  >
                    {hasPerspectiveHero
                      ? <MaskedAmount value={viewPerspectiveHeroFireTarget ?? perspectiveHero!.fireTarget} tone="horizon" monoWhenVisible={false} approx />
                      : <MaskedAmount value={isPensioenMode ? (viewPortfolioAtAow ?? 0) : viewBalkVrijheidDoel} tone="horizon" monoWhenVisible={false} approx />}
                  </div>
                  <div
                    className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {fireTargetCaption}
                  </div>
                </>
              )}
            </button>

            {/* KPI 3: Opnamerate / Maandelijkse onttrekking — secundaire diepte,
                verborgen in Eenvoudig-modus (hard-hide). */}
            <HideInSimple>
            <button
              type="button"
              onClick={() => setShowSwrReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-swr"
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Percent className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Mnd. onttrekking' : isKernelDepleteRate ? 'Onttrekking' : 'Opnamerate'}</span>
                <ReceiptCue />
              </div>
              <div
                className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {isPensioenMode && viewMonthlyWithdrawalAtAow != null
                  ? <MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" monoWhenVisible={false} />
                  : isKernelDepleteRate
                    ? 'Interen'
                    : simResult?.implicitWithdrawalRate != null
                      ? `${(simResult.implicitWithdrawalRate * 100).toFixed(2)}%`
                      : `${(fireSwr * 100).toFixed(2)}%`}
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'per maand' : isKernelDepleteRate ? 'je teert op je vermogen — geen vaste opnamerate' : simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld'}
              </div>
            </button>
            </HideInSimple>

            {/* KPI 4: Uitgave na pensioen — linkt naar verdiepingspagina */}
            <button
              type="button"
              onClick={openRetirementExpensePane}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-retirement-expense"
              title={
                hasPerspectiveHero
                  ? (isPartnerView
                      ? `Uitgave na pensioen van ${perspectiveHero!.householdName}`
                      : 'Gezamenlijke uitgave na pensioen — pas de methode aan in de huishoud-FIRE-sectie')
                  : retirementMethod === 'custom_amount'
                    ? 'Zelf samengesteld — aanpassen of herzien'
                    : retirementMethod === 'current_income'
                      ? 'Op basis van huidig inkomen — verfijnen'
                      : 'Op basis van essentiële budgetten — verfijnen'
              }
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Compass className="h-3 w-3 shrink-0" aria-hidden />
                <span>Na pensioen</span>
              </div>
              {showRetirementExpenseNotice ? (
                /* UR2-05: de methode viel terug op de profielschatting en daarna
                   op 0 — dat is geen bestedingspatroon, dus geen bedrag. */
                <HeroKpiNotice guard={retirementExpenseGuard} />
              ) : (
                <>
              <div
                className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <MaskedAmount value={hasPerspectiveHero ? perspectiveHero!.retirementExpense : (input?.yearlyMustExpenses ?? 0)} tone="horizon" monoWhenVisible={false} />
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                per jaar
              </div>
                </>
              )}
            </button>
          </div>

          {/* ── Duiding onder het kerngetal (S15) ────────────────────────────
              Wat de KPI's laten zien is een getal; wat de gebruiker wil weten
              is wat dat getal betekent. Die zin bestond al in de tips-overlay en
              op de welkomstkaart — allebei tijdelijk zichtbaar — maar niet op de
              pagina zelf, en juist in Eenvoudig (waar de Opnamerate-KPI wegvalt)
              stonden er drie kale cijfers zonder vertaling.

              Deze plek in de DOM dekt beide layouts met één instantie: op
              desktop valt hij onder de figures-strip hierboven, op mobiel onder
              het grote primaire getal (de desktop-strip is daar `hidden` en de
              2×2-strip volgt pas ná de balk).

              Beide weergavemodi (eigenaarsbesluit D1): Volledig zou anders
              mínder tekst tonen dan Eenvoudig, en dat keert het contract van
              `HideInSimple` om. De duiding staat náást de expert-KPI, niet in
              plaats daarvan.

              Woorden én afronding komen uit `lib/horizon/vrijheidsleeftijd-zin.ts`
              — dezelfde bron als de overlay en de welkomstkaart, en dezelfde
              afrondingsregel als het kopgetal hierboven. Consume-only: geen
              eigen leeftijdsafleiding, geen bedrag (dus buiten de deflator- en
              maskeringsregels). */}
          {(() => {
            const zin = buildVrijheidsleeftijdZin({
              freedomAge: hasPerspectiveHero ? perspectiveHero!.fireAge : heroFireAge.age,
              framing: heroFreedomFraming,
              isPensioen: isPensioenMode,
              // ADR 0127 — onder 'Nu stoppen' gaat deze zin over BEREIK, niet over
              // een moment: `heroFireAge.age` is daar de runway-leeftijd, en
              // "werken wordt een keuze rond je 78e" zou daar een belofte van maken.
              nuStoppenReach: hasPerspectiveHero ? null : nuStoppenReach,
              // Nog geen antwoord (kernel rekent) of een gegevensprobleem (M6 /
              // UR2-05): dan draagt de KPI zelf al een melding. Een duidingszin
              // eronder zou daar tegenin praten — `showFireAgeNotice` dekt óók
              // het geval waarin het doelbedrag de melding veroorzaakt.
              pending:
                !hasPerspectiveHero &&
                (heroFireAge.status === 'berekenen' || showFireAgeNotice),
              subjectName: hasPerspectiveHero ? perspectiveHero!.householdName : null,
            })
            if (zin.kind === 'berekenen') return null
            return (
              <p
                data-testid="hero-duiding"
                className="mb-3 sm:mb-4 max-w-[60ch] text-[13px] italic leading-snug text-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {zin.lead}
                {zin.ageLabel && (
                  <span className="not-italic font-semibold text-[var(--module-active-700)]">
                    {zin.ageLabel}
                  </span>
                )}
                {zin.tail}
              </p>
            )
          })()}

          {/* Voortgangsbalk */}
          <div className="mb-3 sm:mb-6">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-horizon-600 via-horizon-400 to-horizon-300 transition-all duration-1000"
                style={{ width: `${hasPerspectiveHero ? Math.max(Math.min(perspectiveHero!.freedomPercentage, 100), 0) : effectiveFreedomPct}%` }}
              />
            </div>
            {/* Balk-label = HETZELFDE bedrag als de Doelbedrag-KPI hierboven, in
                de actieve euro-weergave. Eigenaar-besluit 27-08-2026 (addendum
                ADR 0034, conventie ADR 0093): het label leest voor een gebruiker
                als een doelbedrag, niet als de wiskundige noemer van de
                balk-vulling — twee bedragen voor hetzelfde doel op één scherm
                ("ca. €180.000" in de KPI naast €200.032 onder de balk) leest als
                een fout, ook al was de eerdere nominale keuze intern
                verdedigbaar. Daarmee vervalt de euro-view-uitzondering die hier
                stond (D12/D13).
                Wat NIET meebeweegt: de vulling blijft `effectiveFreedomPct`,
                canoniek uit computeFreedomProgressWithBasis — een ratio (klasse
                R, ADR 0093) deflateert nooit. Gevolg dat de eigenaar accepteert:
                in 'real' is de breuk onder de balk niet meer letterlijk
                teller/label. Ook de grondslag-keuze (excl. woning bij
                `isHomeExcludedFromFire`) is ongewijzigd — ADR 0034.
                Deflatie loopt via de canonieke route en exact één keer:
                `viewBalkVrijheidDoel`/`viewPortfolioAtAow` zijn binnen de
                render-grens gedeeld door `factorAtAge` op het FIRE- resp.
                AOW-jaar. Gepind in horizon-client.euro-view.test.ts. */}
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>0%</span>
              <span className="font-mono">
                {hasPerspectiveHero
                  ? `${formatMaskedApproxCurrency(viewPerspectiveHeroFireTarget ?? perspectiveHero!.fireTarget, masked)} — ${isPartnerView ? `${perspectiveHero!.householdName}'s vrijheid` : 'gezamenlijke vrijheid'}`
                  : isPensioenMode
                    ? `${formatMaskedApproxCurrency(viewPortfolioAtAow ?? 0, masked)} — vermogen op AOW`
                    // ADR 0127 D5 — de balk meet hier TIJDSDEKKING, geen kapitaal:
                    // een doelbedrag noemen zou een noemer suggereren die niet
                    // bestaat (D4). Het label noemt daarom de eindleeftijd.
                    : isNuStoppenMode
                      ? (simResult != null
                          ? `tot je ${Math.round(simResult.displayEndAge)}e — einde van je plan`
                          : 'einde van je plan')
                      : `${formatMaskedApproxCurrency(viewBalkVrijheidDoel, masked)} — volledige vrijheid`}
              </span>
              <span>100%</span>
            </div>
          </div>

          {/* Mobile: 2x2 figures-strip — editorial blueprint.
              Cellen stretchen (géén items-start): de rand tussen de cellen moet
              doorlopen tot de volle rijhoogte, ook als één KPI (dual doelbedrag)
              hoger uitvalt dan zijn buur. */}
          <div className="grid grid-cols-2 sm:hidden border-t border-b border-[var(--ink)] mb-5">
            {/* KPI 1: Vrijheidsleeftijd / Pensioenleeftijd — winner */}
            <button
              type="button"
              onClick={() => setShowFireAgeReceipt(true)}
              className="p-3 border-r border-b border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
                <span>{showFireAgeNotice ? 'Vrijheidslft' : showFreeHero ? freeHeroLabel : heroAgeLabelKort}</span>
                <ReceiptCue />
              </div>
              {showFireAgeNotice ? (
                /* UR2-05 — zie de desktop-tegel. */
                <HeroKpiNotice guard={fireAgeNoticeGuard} compact />
              ) : (
                <>
              <div
                className={`${showFreeHero ? 'text-[15px] leading-tight' : 'text-[22px] leading-none'} font-black tracking-[-0.02em] tabular-nums`}
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {showFreeHero
                    ? freeHeroPhrase
                    : hasPerspectiveHero
                      ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '–')
                      : heroFireAgeText}
                </span>
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {showFreeHero ? '' : hasPerspectiveHero ? 'jaar' : heroFireAgeCaption(heroFireAge, 'jaar')}
              </div>
                </>
              )}
            </button>

            {/* KPI 2: Doelbedrag */}
            <button
              type="button"
              onClick={() => setShowFireTargetReceipt(true)}
              className="p-3 border-b border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Target className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Vermogen' : 'Doelbedrag'}</span>
                <ReceiptCue />
              </div>
              {!hasPerspectiveHero && showFireTargetNotice ? (
                /* M6: onmogelijk/niet-berekenbaar doelbedrag — melding i.p.v. getal. */
                <HeroKpiNotice guard={fireTargetGuard} compact label={isNuStoppenMode ? 'Geen doelbedrag' : undefined} />
              ) : !hasPerspectiveHero && showDualFireTarget ? (
                <>
                  {/* Doel MET je huis — het grote doel; kwalificatie inline zodat de kaart even hoog blijft als de buur-KPI's */}
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <div
                      className="text-[18px] font-black leading-none tracking-[-0.02em]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={viewFireTargetInclHome!} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[10px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      met je huis
                    </span>
                  </div>
                  {/* Doel ZONDER je huis (liquide) — het kleinere doel in horizon-accent, inline kwalificatie */}
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1">
                    <div
                      className="text-[13px] font-black leading-none tracking-[-0.02em] text-[var(--module-active-800)]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={viewFireTargetExclHome!} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[10px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      zonder je huis
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="text-[18px] font-black leading-none tracking-[-0.02em]"
                    style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                  >
                    {hasPerspectiveHero
                      ? <MaskedAmount value={viewPerspectiveHeroFireTarget ?? perspectiveHero!.fireTarget} tone="horizon" monoWhenVisible={false} approx />
                      : <MaskedAmount value={isPensioenMode ? (viewPortfolioAtAow ?? 0) : viewBalkVrijheidDoel} tone="horizon" monoWhenVisible={false} approx />}
                  </div>
                  <div
                    className="italic text-[10px] text-[var(--ink-3)] mt-1"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {fireTargetCaption}
                  </div>
                </>
              )}
            </button>

            {/* KPI 3: Opnamerate — verborgen in Eenvoudig-modus (hard-hide). */}
            <HideInSimple>
            <button
              type="button"
              onClick={() => setShowSwrReceipt(true)}
              className="p-3 border-r border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Percent className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Mnd.' : isKernelDepleteRate ? 'Onttrekking' : 'Opnamerate'}</span>
                <ReceiptCue />
              </div>
              <div
                className="text-[18px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {isPensioenMode && viewMonthlyWithdrawalAtAow != null
                  ? <MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" monoWhenVisible={false} />
                  : isKernelDepleteRate
                    ? 'Interen'
                    : simResult?.implicitWithdrawalRate != null
                      ? `${(simResult.implicitWithdrawalRate * 100).toFixed(2)}%`
                      : `${(fireSwr * 100).toFixed(2)}%`}
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'per maand' : isKernelDepleteRate ? 'teert op vermogen' : simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld'}
              </div>
            </button>
            </HideInSimple>

            {/* KPI 4: Uitgave na pensioen — linkt naar verdiepingspagina */}
            <button
              type="button"
              onClick={openRetirementExpensePane}
              className="p-3 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-retirement-expense"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Compass className="h-3 w-3 shrink-0" aria-hidden />
                <span>Na pensioen</span>
              </div>
              {showRetirementExpenseNotice ? (
                /* UR2-05 — zie de desktop-tegel. */
                <HeroKpiNotice guard={retirementExpenseGuard} compact />
              ) : (
                <>
              <div
                className="text-[18px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <MaskedAmount value={hasPerspectiveHero ? perspectiveHero!.retirementExpense : (input?.yearlyMustExpenses ?? 0)} tone="horizon" monoWhenVisible={false} />
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                per jaar
              </div>
                </>
              )}
            </button>
          </div>

          {/* Profile error warning — shown when profile query failed but page loads with defaults */}
          {simError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="font-sans text-[12px] text-amber-700">
                Je profielgegevens konden niet worden geladen — de grafiek toont standaardwaarden. Probeer de pagina te verversen.
              </p>
            </div>
          )}

          {/* Grafiekgedeelte. De !hasCompletedHorizonSetup-staat wordt
              paginabreed afgevangen door de guard-clause bovenaan de render,
              dus hier hoeven we alleen de geladen/lege/gevulde staten te tonen. */}
          {!simResult && !loading ? (
            <div className="py-8" style={{ minHeight: 320 }}>
              {simError ? (
                <WidgetEmpty
                  variant="first-use"
                  icon={AlertTriangle}
                  title="Projectie"
                  description="Er is een fout opgetreden bij het berekenen van je FIRE-projectie. Controleer je gegevens of probeer opnieuw."
                  action={{ label: 'Opnieuw berekenen', onClick: () => loadData() }}
                />
              ) : (
                <WidgetEmpty
                  variant="first-use"
                  icon={TrendingUp}
                  title="Projectie"
                  description="Voeg vermogen toe in Het Overzicht zodat De Toekomst een projectie kan berekenen."
                  action={{ label: 'Vermogen toevoegen', href: '/overzicht/bezittingen' }}
                />
              )}
            </div>
          ) : simResult ? (
            <>
              <div className="my-2 border-b border-dashed border-[var(--border-ed)]" />

              {!simResult.fireReachable && !isPensioenMode && !isNuStoppenMode && (
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

              {/* V12 — kernel pensioen-tekort: vóór AOW komt het vermogen tekort, ná AOW
                  dekt het inkomen het wél. Beschrijvend (Wft-veilig); eigen oranje regel
                  omdat de banner hierboven pensioen-modus overslaat. */}
              {kernelStatus === 'pension_shortfall' && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="font-sans text-[12px] text-amber-800">
                    Tot je AOW-leeftijd komt je vermogen tekort — in die periode teer je in op een tekort-lening. Vanaf je AOW-leeftijd dekt je inkomen je uitgaven wél.
                  </p>
                </div>
              )}

              {/* ADR 0127 D2 — kernel stop-nu-tekort. EIGEN status naast
                  `pension_shortfall`, en dus een eigen blok: dat blok noemt de
                  AOW-leeftijd, terwijl een tekort onder 'Nu stoppen' ook NÁ de AOW
                  kan vallen — een andere boodschap voor een andere oorzaak. De zin
                  is beschrijvend (hoe ver reikt het) en spoort nergens toe aan;
                  woorden uit één bron (lib/horizon/nu-stoppen-copy.ts), zodat de
                  hero-KPI, deze melding en de grafiek-uitleg hetzelfde zeggen. */}
              {kernelStatus === 'stop_now_shortfall' && nuStoppenReach != null && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="font-sans text-[12px] text-amber-800">
                    {nuStoppenZin(nuStoppenReach)}
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
                    {/* ADR 0127 — onder 'Nu stoppen' is "je kunt nu al stoppen" een
                        tautologie: je hébt gezegd dat je stopt. De informatieve
                        uitspraak is dan hoe ver het vermogen reikt — en die reikt
                        in deze tak per D7-invariant tot de eindleeftijd. */}
                    {isNuStoppenMode
                      ? (nuStoppenReach != null
                          ? nuStoppenZin(nuStoppenReach)
                          : 'Als je nu stopt, reikt je vermogen tot het einde van je plan.')
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
                        {deficitLoanCopy.knoppen}
                      </p>
                      <p className="mt-2 font-sans text-[11px] text-[var(--ink-3)]">
                        {deficitLoanCopy.disclaimer}
                      </p>
                    </div>
                  </div>
                )}
              </section>

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
                {/* AOW-stop toggle — alleen bij shortfall scenario (FIRE > AOW) */}
                {isShortfallScenario && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAowStopToggle('doorgaan')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        aowStopToggle === 'doorgaan'
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={aowStopToggle === 'doorgaan'}
                      aria-label="Doorgaan met FIRE-pad"
                      title="Doorgaan"
                    >
                      <TrendingUp className="h-3 w-3" />
                      <span data-pill-label className="hidden sm:inline">Doorgaan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAowStopToggle('stoppen')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        aowStopToggle === 'stoppen'
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-amber-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={aowStopToggle === 'stoppen'}
                      aria-label="Stop op AOW-leeftijd"
                      title="Stop op AOW"
                    >
                      <Landmark className="h-3 w-3" />
                      <span data-pill-label className="hidden sm:inline">Stop op AOW</span>
                    </button>
                    <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--border-ed)]" />
                  </>
                )}
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
                    >
                      <FlaskConical className="h-3 w-3" />
                      {/* Het label mag NIET wegvallen zolang de datawaarde staat
                          (H21/F2): op smal scherm bleef anders een kaal getal over,
                          dat naast een "succeskans" als kans gelezen werd. Zonder
                          waarde blijft het label op `sm:` verborgen — dan is er ook
                          niets te misduiden en telt de compacte pillenbalk. */}
                      <span
                        data-pill-label
                        className={mcExpanded && !mcPending && mcMarge ? 'inline' : 'hidden sm:inline'}
                      >
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

                {/* ── Saved scenario overlay picker — ghost-lijnen alleen op line-chart ── */}
                {chartMode === 'vermogenspad' && (
                  <ScenarioOverlayPicker
                    scenarios={savedScenarios}
                    selectedIds={selectedScenarioIds}
                    onToggle={toggleScenarioId}
                    onClearAll={clearAllScenarioIds}
                  />
                )}

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
                          aowAge: Math.round(userAowAge.fractional),
                          currentAge: currentAge ?? 30,
                          hasMonteCarlo: !!monteCarloOverlay,
                          hasScenario: scenarioOverlayDataList.length > 0,
                          hasBaseline: false,
                          planningMode,
                        })
                      : getWealthCompositionTips({
                          fireAge: simResult.fireAge,
                          aowAge: Math.round(userAowAge.fractional),
                          currentAge: currentAge ?? 30,
                        })
                  }
                  align="right"
                />
              </PillRow>

              {/* ── Editorial quote-explainers per actieve overlay/optie ── */}
              <ChartOverlayExplainer active={isAowStopActive}>
                <em>Stop op AOW</em> simuleert wat er gebeurt als je tot je
                AOW-leeftijd doorwerkt en daarna pas onttrekt — zo zie je of
                je geplande pensioenleeftijd haalbaar is zónder voortijdig <GlossaryTerm term="fire">FIRE</GlossaryTerm> te bereiken.
              </ChartOverlayExplainer>

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

              <ChartOverlayExplainer active={scenarioOverlayDataList.length > 0}>
                {scenarioOverlayDataList.length === 1
                  ? <>Het <em>opgeslagen scenario</em> verschijnt als spookrand naast
                    je huidige pad — zo vergelijk je in één oogopslag hoe een eerder
                    doorgerekend wat-als zich verhoudt tot je actuele plan.</>
                  : <><em>{scenarioOverlayDataList.length} opgeslagen scenario&apos;s</em> verschijnen
                    als gekleurde lijnen naast je huidige pad — zo vergelijk je meerdere
                    toekomstpaden tegelijk.</>
                }
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

              {/* ── AOW-stop waarschuwingsbanner ── */}
              {isAowStopActive && (
                <div className={`mb-3 flex items-start gap-2.5 border px-3 py-2.5 ${depletionAge != null ? 'border-amber-200 bg-amber-50/60' : 'border-[var(--border-ed)] bg-[var(--subtle)]/40'}`}>
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${depletionAge != null ? 'text-amber-500' : 'text-[var(--ink-3)]'}`} />
                  <div>
                    <p className={`font-sans text-[12px] font-medium ${depletionAge != null ? 'text-amber-800' : 'text-[var(--ink-2)]'}`}>
                      {depletionAge != null
                        ? 'Vermogen raakt op voor eindleeftijd'
                        : 'Simulatie: stoppen op AOW-leeftijd'}
                    </p>
                    <p className={`mt-0.5 font-sans text-[11px] ${depletionAge != null ? 'text-amber-700' : 'text-[var(--ink-3)]'}`}>
                      {depletionAge != null
                        ? `Bij stoppen op AOW-leeftijd (${aowAgeFormatted}) is je vermogen rond leeftijd ${depletionAge} op — je haalt de ingestelde eindleeftijd van ${aowStopSimResult?.displayEndAge ?? (fireStrategy?.endAge ?? 90)} niet.`
                        : `De grafiek toont wat er gebeurt als je stopt met werken op je AOW-leeftijd (${aowAgeFormatted}) en gaat onttrekken uit je opgebouwde vermogen.`}
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 3a: eenmalige welkomsttekst — staat LOS van de overlay. */}
              <ToekomstWelcome
                visible={!welcomeDismissed}
                netWorth={effectiveNetWorth}
                dailyExpenseRate={canonicalDailyRate}
                freedomAge={hasPerspectiveHero ? perspectiveHero!.fireAge : heroFireAge.age}
                isPensioen={isPensioenMode}
                nuStoppenReach={hasPerspectiveHero ? null : nuStoppenReach}
                masked={masked}
                // Stil sluiten (✕/Escape/achtergrond): alleen wegklikken, de
                // tip-overlay NIET openen.
                onDismiss={() => setWelcomeDismissed(true)}
                // Primaire CTA "Bekijk je grafiek": wegklikken én de uitgelichte
                // grafiek met tip-bubbels tonen.
                onViewChart={() => { setWelcomeDismissed(true); persistOverlayVisible(true) }}
              />

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
                              : isAowStopActive
                                ? userAowAge.fractional
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
                          // Netto vermogen: zelfde canonieke afleiding als ToekomstWelcome.
                          netWorth: effectiveNetWorth,
                          // Vrijheidsleeftijd: EXACT dezelfde bron + precedentie als de
                          // hero-KPI "vrijheidsleeftijd" (single-source, niet herberekend).
                          freedomAge: hasPerspectiveHero ? perspectiveHero!.fireAge : heroFireAge.age,
                          masked,
                          isPensioen: isPensioenMode,
                          nuStoppenReach: hasPerspectiveHero ? null : nuStoppenReach,
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
                            rows={useHouseholdMainLine ? viewHouseholdMainLineRows! : usePartnerMainLine ? viewPartnerLineRows! : (isAowStopActive ? viewDisplayEffectiveSimRows : viewDisplaySimRows)}
                            fireAge={useHouseholdMainLine ? householdMainLine!.fireAge : usePartnerMainLine ? partnerLine!.fireAge : (isAowStopActive ? Math.ceil(userAowAge.fractional) : simResult.fireAge)}
                            fireAgeFractional={useHouseholdMainLine ? householdMainLine!.fireAgeFractional : usePartnerMainLine ? partnerLine!.fireAgeFractional : (isAowStopActive ? userAowAge.fractional : simResult.fireAgeFractional)}
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
                            fireTargetInclHome={(usePartnerMainLine || useHouseholdMainLine || isAowStopActive) ? undefined : (showDualFireTarget ? viewFireTargetInclHome! : undefined)}
                            strategy={simResult.strategy}
                            targetEndPortfolio={viewTargetEndPortfolio}
                            // Meegroeiende doellijn alleen op de basis-projectie (niet op
                            // partner-/huishoud-/AOW-stop-lijnen — die hebben eigen rijen).
                            targetInflationFactors={(usePartnerMainLine || useHouseholdMainLine || isAowStopActive) ? undefined : viewTargetInflationFactors}
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
                            scenarioOverlays={(isAowStopActive || usePartnerMainLine || useHouseholdMainLine) ? undefined : viewCombinedScenarioOverlays}
                            scenarioPending={scenarioPending || stopPadPending}
                            monteCarloOverlay={(isAowStopActive || usePartnerMainLine || useHouseholdMainLine) ? undefined : viewMonteCarloOverlay}
                            // euro-view: exempt — het dagtarief (€→vrijheidstijd) is per
                            // definitie een grootheid van VANDAAG en deflateert nooit (D15).
                            // Deflateert het bedrag wél, dan volgt de vrijheidstijd
                            // automatisch mee; ook de noemer aanpakken zou de deflatie
                            // twee keer toepassen.
                            dailyExpenseRate={(effectiveInput?.yearlyMustExpenses ?? 0) / 365}
                            householdOverlays={viewHouseholdOverlays ?? undefined}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                            aowAgeFractional={userAowAge.fractional}
                            planningMode={planningMode}
                            showDepletionWarning={isAowStopActive && !usePartnerMainLine && !useHouseholdMainLine}
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
                                aowAge: Math.round(userAowAge.fractional),
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
                          rows={isAowStopActive ? viewDisplayEffectiveSimRows : viewDisplaySimRows}
                          currentAge={currentAge ?? 30}
                          endAge={chartEndAge!}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          fireAge={isAowStopActive ? Math.ceil(userAowAge.fractional) : simResult.fireAge}
                          planningMode={planningMode}
                          aowAgeFractional={userAowAge.fractional}
                          viewMode={ieViewMode}
                          breakdownResult={viewIeBreakdownResult}
                          ghostOverlayRows={viewGhostOverlayRows}
                          ghostColor={scenarioOverlayDataList[0]?.color}
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
                          scenarioEvents={scenarioOverlayDataList[0]?.events}
                          scenarioColor={scenarioOverlayDataList[0]?.color}
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
                        />
                      )}

                      {/* ── Fase-balk (Opbouw / Overgang / Onttrekking) ──
                          Secundaire diepte → verborgen in Eenvoudig-modus. */}
                      {simResult && currentAge != null && (
                        <HideInSimple>
                        <div className="mt-2" style={{ marginLeft: CHART_PAD.left, marginRight: CHART_PAD.right }}>
                          <PhaseBar
                            currentAge={currentAge}
                            fireAge={isAowStopActive ? Math.ceil(userAowAge.fractional) : simResult.fireAge}
                            fireAgeFractional={isAowStopActive ? userAowAge.fractional : simResult.fireAgeFractional}
                            aowAge={userAowAge.fractional}
                            endAge={chartEndAge!}
                            fireReachable={simResult.fireReachable}
                            isPensioenMode={isAowStopActive || isPensioenMode}
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
                {isNuStoppenMode
                  ? <>Nu-stoppen-modus actief &middot; <span className="ml-0.5 underline underline-offset-2">Instellingen &rarr;</span></>
                  : isPensioenMode
                    ? <>Pensioen-modus actief &middot; <span className="ml-0.5 underline underline-offset-2">Instellingen &rarr;</span></>
                    : <>Berekend als FIRE-pad &middot; <span className="ml-0.5 underline underline-offset-2">Pensioen-modus beschikbaar &rarr;</span></>}
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
          een what-if scenario" gebruikt dat pad). Zonder deze derde tak zette
          die deeplink in Eenvoudig zónder vastgelegd doel state op een sectie
          die niet gemonteerd is en no-opte de scroll stil: een dode
          verwijzing op precies het beginnersoppervlak waar Eenvoudig voor is.
          `whatIfInlineOpen` kan alleen wáár worden via die deeplink of via een
          control binnen deze sectie zelf, dus de gate blijft dicht zolang er
          niemand hierheen verwezen heeft. */}
      {!(usePartnerMainLine || useHouseholdMainLine) &&
        (displayMode === 'full' || doelActief || whatIfInlineOpen) && (
      <>
        <section
          id={VERKEN_SECTION_ID}
          ref={verkenSectionRef}
          className="mt-8 scroll-mt-24 sm:mt-10"
        >
          <SectionLabel num="II">{doelActief ? 'Jouw doel' : 'Wat als je draait'}</SectionLabel>
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            {/* Kop = toggle. De sectie start INGEKLAPT (beide weergavemodi);
                het chevron volgt het DepthSection-gebaar, de typografie blijft
                de editorial sectiekop. Actieknoppen alleen in open stand. */}
            <button
              type="button"
              onClick={() => setVerkenOpen(prev => !prev)}
              aria-expanded={verkenOpen}
              className="group flex min-w-0 items-center gap-1.5 text-left"
            >
              <h2 className="label-editorial text-[var(--ink-2)]">
                {doelActief ? 'Jouw doelsituatie' : 'Verken je aannames'}
              </h2>
              <ChevronDown
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-3)] transition-transform duration-200 motion-reduce:transition-none group-hover:text-[var(--ink-2)] ${verkenOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {verkenOpen && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {doelActief ? (
                <>
                  <button
                    type="button"
                    onClick={() => setDoelSheetOpen(true)}
                    disabled={doelSaving}
                    className="rounded-[var(--r)] border border-horizon-300 px-2.5 py-1 font-sans text-[11px] font-medium text-horizon-700 transition-colors hover:bg-horizon-50 disabled:opacity-50"
                  >
                    Doel bijwerken
                  </button>
                  <button
                    type="button"
                    onClick={() => setDoelLoslatenOpen(true)}
                    disabled={doelSaving}
                    className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-2.5 py-1 font-sans text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink-2)] disabled:opacity-50"
                  >
                    Doel loslaten
                  </button>
                </>
              ) : (
                <>
                  {hasScenario && (
                    <button
                      type="button"
                      onClick={() => setDoelSheetOpen(true)}
                      className="rounded-[var(--r)] border border-horizon-300 px-2.5 py-1 font-sans text-[11px] font-medium text-horizon-700 transition-colors hover:bg-horizon-50"
                    >
                      Maak dit mijn doel
                    </button>
                  )}
                  {hasScenario && (
                    <button
                      type="button"
                      onClick={handleScenarioReset}
                      className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-2.5 py-1 font-sans text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:border-horizon-300 hover:text-horizon-700"
                    >
                      Terug naar basis
                    </button>
                  )}
                </>
              )}
            </div>
            )}
          </div>
          {verkenOpen ? (
            <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
              {doelActief
                ? 'Dit is je vastgelegde doel — de gestippelde lijn in de grafiek is Jouw doel en loopt door tot je gekozen stopleeftijd. Draai gerust verder; leg opnieuw vast of herstel je doel wanneer je klaar bent.'
                : 'Draai aan je aannames — je basislijn blijft staan; je wat-als verschijnt als gestippelde lijn in de grafiek en kleurt de blokken hieronder.'}
            </p>
          ) : (
            /* Ingeklapte regel — 1-regel-samenvatting, klik = uitklappen. */
            <button
              type="button"
              onClick={() => setVerkenOpen(true)}
              aria-label="Doelsectie uitklappen"
              className="mb-1 block w-full text-left font-sans text-[12px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
            >
              {verkenSamenvatting}
            </button>
          )}

          {/* (c) Concept gewijzigd — smalle banner boven de sectie-inhoud.
              role="status" + aria-live="polite" zodat de wijziging voor
              screenreaders wordt aangekondigd zonder de focus te stelen. */}
          {conceptGewijzigd && (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-[var(--ink-2)] border-l-4 border-l-horizon-500 bg-[var(--paper)] px-3 py-2"
            >
              <p className="font-serif text-[12px] leading-snug text-[var(--ink-2)]">
                Je draait aan je doel — leg opnieuw vast of herstel je doel.
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDoelSheetOpen(true)}
                  disabled={doelSaving}
                  className="rounded-[var(--r)] bg-[var(--ink)] px-2.5 py-1 font-sans text-[11px] font-semibold text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Leg opnieuw vast
                </button>
                <button
                  type="button"
                  onClick={handleDoelHerstellen}
                  className="rounded-[var(--r)] border border-[var(--border-md)] px-2.5 py-1 font-sans text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)]"
                >
                  Herstel mijn doel
                </button>
              </div>
            </div>
          )}

          {/* Uitgeklapte sectie-inhoud: afwijkings-badges + de werkbank-kaart.
              De concept-gewijzigd-banner hierboven blijft bewust ALTIJD zichtbaar
              (ook ingeklapt): die draagt de herstel-/vastleg-acties. */}
          {verkenOpen && (
          <>
          {/* Dichtgeklapte-kop-afwijkingssamenvatting (DeltaBadge-hergebruik). */}
          {hasScenario && whatIfBaseline && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <DeltaBadge
                current={readSliderValueFromEvents('income', scenarioSliderEvents, whatIfBaseline)}
                base={whatIfBaseline.monthlyIncome}
                format={v => formatCurrency(v) + '/mnd'}
              />
              <DeltaBadge
                current={readSliderValueFromEvents('savings', scenarioSliderEvents, whatIfBaseline)}
                base={whatIfBaseline.savingsRate}
                format={v => `${Math.round(v)}%`}
              />
              <DeltaBadge
                current={readSliderValueFromEvents('extra_inleg', scenarioSliderEvents, whatIfBaseline)}
                base={0}
                format={v => formatCurrency(v) + '/mnd'}
              />
            </div>
          )}

          <div
            className={`card-editorial space-y-6 p-4 sm:p-5 ${
              hasScenario ? 'border-dashed border-[var(--ink-2)]' : ''
            }`}
          >
            {/* Vrijheidsas — twee vragen (streep + marge), netjes gescheiden.
                De draaiknoppen + rendement-per-groep vullen het linker vlak via de
                `draaiknoppen`-slot; de stop-slider/marge het rechter vlak. */}
            {currentAge !== null && (
              <div>
                <div className="mb-3">
                  <Kicker className="mb-1">Vrijheidsas</Kicker>
                  {/* ADR 0127 — onder 'Nu stoppen' is "wanneer ben je vrij?" al beantwoord
                      (vandaag); de open vraag is hoe ver je vermogen reikt. */}
                  <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">
                    {isNuStoppenMode ? 'Hoe ver reikt je vermogen?' : 'Wanneer ben je vrij?'}
                  </h2>
                </div>
                <Vrijheidsas
                  currentAge={currentAge}
                  baseFireAge={scenarioBaseFireAge}
                  verwachtFireAge={scenarioVerwachtFireAge}
                  laatstFireAge={laatstFireAge}
                  vroegstFireAgeFractional={vroegstFireAge}
                  hasScenario={hasScenario}
                  stopAge={effectiveStopAge}
                  onStopAgeChange={handleStopAgeChange}
                  stopKoppel={scenarioStopKoppel}
                  onStopKoppelChange={handleStopKoppelChange}
                  zone={stopMarge.zone}
                  margeJaren={stopMarge.margeJaren}
                  doelActief={doelActief}
                  // ADR 0127 — stop-slider + koppel-checkbox weg: het stopmoment is
                  // hier een INSTELLING (eindstrategie), geen schuif. Twee schuiven
                  // die hetzelfde besturen is een bug in de maak.
                  stopKeuzeVerborgen={isNuStoppenMode}
                  stopKeuzeNotitie={
                    nuStoppenReach != null ? (
                      <p className="font-sans text-[12px] leading-snug text-[var(--ink-2)]">
                        {nuStoppenZin(nuStoppenReach)}
                      </p>
                    ) : null
                  }
                  draaiknoppen={
                    <>
                      {/* De vier bestaande sliders (platgeslagen via `bare`) */}
                      {whatIfBaseline && (
                        <div>
                          <p className="mb-2 label-editorial text-[var(--ink-3)]">Draaiknoppen</p>
                          {/* Eerste-sleep-hint — wijst naar de gestippelde grafieklijn (boven). */}
                          {firstDragHintVisible && (
                            <div
                              role="status"
                              className="animate-fade-in mb-3 flex items-start justify-between gap-2 border border-[var(--ink-2)] border-l-4 border-l-horizon-500 bg-[var(--paper)] px-3 py-2"
                            >
                              <p className="font-sans text-[11px] leading-snug text-[var(--ink-2)]">
                                Kijk naar de gestippelde lijn in de grafiek ↑ — dat is jouw wat-als.
                              </p>
                              <button
                                type="button"
                                onClick={dismissFirstDragHint}
                                aria-label="Tip sluiten"
                                className="-m-2 shrink-0 p-2 text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          <WhatIfSliders
                            bare
                            baseline={whatIfBaseline}
                            events={scenarioSliderEvents}
                            setEvents={handleScenarioSliderEvents}
                            currentAge={currentAge}
                          />
                        </div>
                      )}

                      {/* Rendement per groep (genest collapsible; default dicht) */}
                      <div className="border-t border-[var(--border-ed)] pt-5">
                        <p className="mb-2 label-editorial text-[var(--ink-3)]">Rendement per groep</p>
                        <WhatIfMarketAssumptions
                          value={scenarioReturnDeltas}
                          onChange={setScenarioReturnDeltas}
                          assetGroups={categorieReturnGroups}
                        />
                      </div>
                    </>
                  }
                />
                {/* ── Wat hoort daarbij? (bevinding M2) ──────────────────────────────
                    Permanent tekstblok, direct ónder de stop-slider: dáár kiest de
                    gebruiker het doel, dus dáár hoort het omgekeerde antwoord. Verschijnt
                    zodra de gekozen stopleeftijd niet gedekt is (`maandHint > 0`) en
                    verdwijnt zodra hij dat wél is — geen edge-case-gate op de hoofdrun.
                    TOON (Wft): feitelijk inzicht, geen aanbeveling. "hoort daar … bij" is
                    een rekenuitkomst; bewust géén "je moet", geen "verhoog je spaarquote",
                    geen belofte dat het doel dan gehaald wordt. Sluitregel volgt de
                    bestaande app-conventie ("Indicatie, geen advies — …"). */}
                {/* ADR 0127 — een "om op X te stoppen"-hint hoort niet bij een plan
                    waarin het stopmoment al vastligt op vandaag. */}
                {stopPadTekortHint !== null && !isNuStoppenMode && (
                  <div className="mt-4 border border-[var(--ink-2)] border-l-4 border-l-horizon-500 bg-[var(--paper)] px-3 py-2.5">
                    <p className="mb-1 label-editorial text-[var(--ink-3)]">Wat hoort daarbij?</p>
                    <p className="font-sans text-[12px] leading-snug text-[var(--ink-2)]">
                      Om op {formatAge(stopPadTekortHint.stopAge)} jr te stoppen hoort daar{' '}
                      <span className="font-mono tabular-nums">
                        {formatMaskedApproxCurrency(stopPadTekortHint.perMaand, masked)}
                      </span>{' '}
                      per maand extra sparen bij, bovenop wat je nu opzij zet
                      {!masked && stopPadTekortHint.dagen >= 1 && (
                        <> — omgerekend {stopPadTekortHint.dagen} {stopPadTekortHint.dagen === 1 ? 'dag' : 'dagen'} vrijheid per maand</>
                      )}.
                    </p>
                    <p className="mt-1.5 font-sans text-[11px] leading-snug text-[var(--ink-3)]">
                      Indicatie, geen advies — een rekenuitkomst bij je huidige aannames, uitgesmeerd over de maanden tot je eindleeftijd.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Footer — draaien hier, archiveren daar.
                De dream-gate stuurt naar de CANONIEKE route, niet de legacy
                `/horizon/whatif`: die redirect op de routing-laag, en een
                client-push náár een redirect-only pad is de gedocumenteerde
                React #310-trigger (zie het redirect-blok in next.config.ts en
                de comment in whatif-page-client.tsx). */}
            <div className="border-t border-[var(--border-ed)] pt-3">
              <button
                type="button"
                onClick={() => triggerDream('/toekomst/whatif')}
                className="font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700"
              >
                Scenario&apos;s vergelijken &rarr;
              </button>
            </div>
          </div>
          </>
          )}
        </section>

        {/* Vastleg-/bijwerk-sheet (BottomSheet, boven de nav-pill). */}
        <DoelVastlegSheet
          open={doelSheetOpen}
          onClose={() => setDoelSheetOpen(false)}
          previews={doelPreviews}
          bijwerken={doelActief}
          saving={doelSaving}
          onSubmit={handleDoelVastleggen}
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
      </>
      )}

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
        // De duiding klapt mee met KATERN II ("Jouw doel"): is die sectie
        // zichtbaar maar dichtgeklapt, dan blijft ook "Wat het betekent"
        // verborgen — doel dicht = alles dicht. In partner-/huishouden-view
        // bestaat KATERN II niet; dan blijft de duiding gewoon staan.
        const katernIIZichtbaar =
          !(usePartnerMainLine || useHouseholdMainLine) &&
          (displayMode === 'full' || doelActief || whatIfInlineOpen)
        if (katernIIZichtbaar && !verkenOpen) return null
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
                          {(hasScenario || hasStopKeuze) && !(usePartnerMainLine || useHouseholdMainLine) && <ScenarioChip doelActief={doelActief} hasScenario={hasScenario} onBeforeScroll={() => setVerkenOpen(true)} />}
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
                          {(hasScenario || hasStopKeuze) && !(usePartnerMainLine || useHouseholdMainLine) && <ScenarioChip doelActief={doelActief} hasScenario={hasScenario} onBeforeScroll={() => setVerkenOpen(true)} />}
                        </div>
                      </div>
                      {/* De grondslag hoort in beeld: op wélk scenario (en welke stopleeftijd) rekenen
                          deze assen? Zelfde gelande bron als de assen zelf (duidingStopAge). */}
                      <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                        {stopPad != null && duidingStopAge != null
                          ? `Vier dekkingsratio’s — gerekend op je doelscenario: stoppen op ${formatAge(duidingStopAge)} jr.`
                          : scenarioVerwachtFireAge != null
                            ? `Vier dekkingsratio’s — gerekend op je verwachte pad (vrij rond ${formatAge(scenarioVerwachtFireAge)} jr).`
                            : 'Vier dekkingsratio’s — op elk front.'}
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


      {/* === Event Form Modal === */}
      {showForm && (() => {
        // Compute summary card values
        const amt = typeof formAmount === 'number' ? formAmount : 0
        const dur = typeof formDuration === 'number' ? formDuration : 0
        const isOneTime = formDurationType === 'one_time'
        const isPeriod = formDurationType === 'period'
        const isExpense = formDirection === 'expense'
        const sign = isExpense ? -1 : 1
        const totalImpact = isOneTime
          ? amt * sign
          : isPeriod && dur > 0
            ? amt * dur * sign
            : amt * 12 * 10 * sign // continuous: show 10-year estimate
        const dailyExp = canonicalDailyRate
        const freedomBreakdown = dailyExp > 0 ? calculateFreedomTime(Math.abs(totalImpact), dailyExp) : null
        const freedomStr = freedomBreakdown ? formatFreedomTimeString(freedomBreakdown, 'short') : null
        const hasCatalogFields = LIFE_EVENT_CATALOG[formType]?.fields && LIFE_EVENT_CATALOG[formType].fields!.length > 0

        return (
        <BottomSheet open={true} onClose={() => {
          if (selectedEventId && viewModalMode === 'edit') {
            setShowForm(false); setEditingEvent(null); setFormErrors([]); setFormWarnings([])
            setViewModalMode('view')
          } else {
            setShowForm(false); setEditingEvent(null); setFormErrors([]); setFormWarnings([])
          }
          setPensionParseResult(null); setAutoFilledFields(new Set()); setSelectedRegelingIndex(0)
        }} title={editingEvent ? 'Evenement bewerken' : 'Nieuw evenement'}>
          <div className="space-y-5 p-6">
            {/* Back button when editing from view modal */}
            {selectedEventId && viewModalMode === 'edit' && (
              <button
                onClick={() => {
                  setShowForm(false)
                  setEditingEvent(null)
                  setFormErrors([])
                  setFormWarnings([])
                  setViewModalMode('view')
                  setEditingCashflowId(null)
                }}
                className="flex items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)]"
              >
                ← Terug naar details
              </button>
            )}
            {/* Template tip */}
            {LIFE_EVENT_CATALOG[formType]?.tip && !editingEvent && (
              <div className="rounded-[var(--r)] border border-horizon-100 bg-horizon-50/50 p-3 text-sm italic text-[var(--ink-3)]">
                <span className="not-italic font-medium text-horizon-700">Tip:</span> {LIFE_EVENT_CATALOG[formType].tip}
              </div>
            )}

            {/* ── Instructiepanel: mijnpensioenoverzicht.nl (pension & early_retirement) ── */}
            {(formType === 'pension' || formType === 'early_retirement') && (
              <>
                <PensionInstructionPanel />
                <PensionPdfUpload
                  lifeEventId={editingEvent?.id ?? null}
                  existingPdfPath={editingEvent?.metadata?.pensionPdfPath as string | null ?? null}
                  onFileSelected={(f) => {
                    console.log('[pension] PDF selected:', f.name)
                    pendingPensionFileRef.current = f
                  }}
                  onFileRemoved={() => {
                    console.log('[pension] PDF removed')
                    pendingPensionFileRef.current = null
                    setPensionParseResult(null)
                    setAutoFilledFields(new Set())
                    setSelectedRegelingIndex(0)
                  }}
                  onParseResult={(result) => {
                    console.log('[pension] Parse result:', result)
                    if (result && typeof result === 'object' && 'regelingen' in result) {
                      const data = result as {
                        aowBedrag: number | null
                        regelingen: Array<{ fondsNaam: string; brutoBedrag: number; ingangLeeftijd: number; isGeindexeerd: boolean; type: string }>
                        nabestaandenpensioen: number | null
                        samenvatting: string
                      }
                      setPensionParseResult(data)
                      setSelectedRegelingIndex(0)

                      // Auto-fill from first regeling
                      const firstRegeling = data.regelingen?.[0]
                      if (firstRegeling) {
                        const newAutoFilled = new Set<string>()

                        if (firstRegeling.brutoBedrag != null) {
                          setFormMetadata(prev => ({ ...prev, brutoBedrag: firstRegeling.brutoBedrag }))
                          setFormAmount(firstRegeling.brutoBedrag)
                          newAutoFilled.add('brutoBedrag')
                        }
                        if (firstRegeling.ingangLeeftijd != null) {
                          setFormMetadata(prev => ({ ...prev, ingangLeeftijd: firstRegeling.ingangLeeftijd }))
                          setFormAge(firstRegeling.ingangLeeftijd)
                          newAutoFilled.add('ingangLeeftijd')
                        }
                        if (firstRegeling.isGeindexeerd != null) {
                          setFormMetadata(prev => ({ ...prev, isGeindexeerd: firstRegeling.isGeindexeerd }))
                          newAutoFilled.add('isGeindexeerd')
                        }
                        // Map pension type to form pensioenType
                        const typeMap: Record<string, string> = {
                          'ouderdomspensioen': 'bedrijf',
                          'nabestaandenpensioen': 'bedrijf',
                          'arbeidsongeschiktheidspensioen': 'bedrijf',
                          'overig': 'bedrijf',
                        }
                        setFormMetadata(prev => ({ ...prev, pensioenType: typeMap[firstRegeling.type] || 'bedrijf' }))
                        newAutoFilled.add('pensioenType')

                        // Set name from fondsNaam
                        if (firstRegeling.fondsNaam) {
                          setFormName(`Pensioen - ${firstRegeling.fondsNaam}`)
                          newAutoFilled.add('name')
                        }

                        // Store nabestaandenpensioen in metadata if available
                        if (data.nabestaandenpensioen != null) {
                          setFormMetadata(prev => ({ ...prev, nabestaandenpensioen: data.nabestaandenpensioen }))
                          newAutoFilled.add('nabestaandenpensioen')
                        }

                        setAutoFilledFields(newAutoFilled)
                        // Disable suggested settings — we have real data from the PDF
                        setUseSuggestedSettings(false)
                      }
                    }
                  }}
                />
                {/* Summary card with parsed pension data */}
                {pensionParseResult && (
                  <PensionParseSummaryCard
                    result={pensionParseResult}
                    selectedIndex={selectedRegelingIndex}
                    onSelectRegeling={(idx) => {
                      setSelectedRegelingIndex(idx)
                      const regeling = pensionParseResult.regelingen[idx]
                      if (regeling) {
                        const newAutoFilled = new Set<string>()
                        setFormMetadata(prev => ({
                          ...prev,
                          brutoBedrag: regeling.brutoBedrag,
                          ingangLeeftijd: regeling.ingangLeeftijd,
                          isGeindexeerd: regeling.isGeindexeerd,
                          pensioenType: 'bedrijf',
                        }))
                        setFormAmount(regeling.brutoBedrag)
                        setFormAge(regeling.ingangLeeftijd)
                        if (regeling.fondsNaam) {
                          setFormName(`Pensioen - ${regeling.fondsNaam}`)
                          newAutoFilled.add('name')
                        }
                        newAutoFilled.add('brutoBedrag')
                        newAutoFilled.add('ingangLeeftijd')
                        newAutoFilled.add('isGeindexeerd')
                        newAutoFilled.add('pensioenType')
                        if (pensionParseResult.nabestaandenpensioen != null) {
                          newAutoFilled.add('nabestaandenpensioen')
                        }
                        setAutoFilledFields(newAutoFilled)
                        setUseSuggestedSettings(false)
                      }
                    }}
                    onReupload={() => {
                      setPensionParseResult(null)
                      setAutoFilledFields(new Set())
                      setSelectedRegelingIndex(0)
                    }}
                  />
                )}
              </>
            )}

            {/* ── SECTIE: Naam & Toelichting ── */}
            <div className="space-y-4">
              {/* Naam */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                  Naam
                  {autoFilledFields.has('name') && (
                    <span className="inline-flex items-center bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                  )}
                </label>
                <input
                  type="text" value={formName} onChange={e => {
                    setFormName(e.target.value); setFormErrors([])
                    if (autoFilledFields.has('name')) {
                      setAutoFilledFields(prev => { const next = new Set(prev); next.delete('name'); return next })
                    }
                  }}
                  className={`mt-1 w-full border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('naam')) ? 'border-red-400 bg-red-50/30' : autoFilledFields.has('name') ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                />
              </div>

              {/* Toelichting */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">Toelichting</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none resize-none"
                  placeholder="Optioneel: beschrijf waarom of wat je verwacht"
                />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--border-ed)]" />

            {/* ── SECTIE: Financiële impact ── */}
            <div className="space-y-4">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Financiële impact</p>

              {/* Impact #1 */}
              <div className="space-y-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                {/* Type */}
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Type</label>
                  <div className="mt-1 flex gap-2">
                    {(['one_time', 'period', 'continuous'] as const).map(dt => (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => setFormDurationType(dt)}
                        className={`flex-1 rounded-[var(--r)] border px-3 py-2 text-xs font-medium transition-colors ${
                          formDurationType === dt
                            ? 'border-horizon-400 bg-horizon-50 text-horizon-700'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200'
                        }`}
                      >
                        {dt === 'one_time' ? 'Eenmalig' : dt === 'period' ? 'Tijdelijk' : 'Continu'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Leeftijd */}
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                    Vanaf welke leeftijd?
                    {autoFilledFields.has('ingangLeeftijd') && (
                      <span className="inline-flex items-center bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                    )}
                  </label>
                  <input
                    type="number" value={formAge} onChange={e => {
                      setFormAge(e.target.value ? Number(e.target.value) : ''); setFormErrors([]); setFormWarnings([])
                      if (autoFilledFields.has('ingangLeeftijd')) {
                        setAutoFilledFields(prev => { const next = new Set(prev); next.delete('ingangLeeftijd'); return next })
                      }
                    }}
                    className={`mt-1 w-full border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${(formErrors.some(e => e.includes('eeftijd')) || formWarnings.some(w => w.includes('AOW'))) ? 'border-amber-400 bg-amber-50/30' : autoFilledFields.has('ingangLeeftijd') ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                    placeholder="bijv. 45"
                  />
                  {/* AOW: voorgestelde leeftijd op basis van geboortedatum */}
                  {formType === 'aow' && (
                    <div className="mt-1.5 border border-horizon-200 bg-horizon-50/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Jouw AOW-leeftijd</p>
                          <p className="text-xs text-[var(--ink-2)]">
                            {userAowAge.months > 0
                              ? `${userAowAge.years} jaar en ${userAowAge.months} maanden`
                              : `${userAowAge.years} jaar`}
                            <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                              userAowAge.isDefinitive
                                ? 'bg-positive-bg text-positive'
                                : 'bg-warning-bg text-warning'
                            }`}>
                              {userAowAge.isDefinitive ? 'Definitief' : 'Verwacht'}
                            </span>
                          </p>
                        </div>
                        {formAge !== Math.ceil(userAowAge.fractional) && (
                          <button
                            type="button"
                            onClick={() => { setFormAge(Math.ceil(userAowAge.fractional)); setFormErrors([]); setFormWarnings([]) }}
                            className="shrink-0 rounded-[var(--r)] border border-horizon-300 bg-horizon-50 px-2.5 py-1 text-[11px] font-medium text-horizon-700 hover:bg-horizon-100 transition-colors"
                          >
                            Overnemen
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--ink-4)]">
                        Op basis van je geboortedatum. Bron: SVB / CBS-prognose.
                      </p>
                    </div>
                  )}
                </div>

                {/* Richting + bedrag */}
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                    {formDurationType === 'one_time' ? 'Bedrag' : 'Maandbedrag'}
                    {autoFilledFields.has('brutoBedrag') && (
                      <span className="inline-flex items-center bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                    )}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <div className="flex overflow-hidden rounded-[var(--r)] border border-[var(--border-ed)]">
                      <button
                        type="button"
                        onClick={() => setFormDirection('income')}
                        className={`px-3 py-2 text-xs font-medium transition-colors ${
                          formDirection === 'income'
                            ? 'bg-positive text-white'
                            : 'bg-[var(--paper)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                        }`}
                      >
                        Inkomen
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormDirection('expense')}
                        className={`px-3 py-2 text-xs font-medium transition-colors ${
                          formDirection === 'expense'
                            ? 'bg-negative text-white'
                            : 'bg-[var(--paper)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                        }`}
                      >
                        Kosten
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formAmount}
                      onChange={e => {
                        setFormAmount(e.target.value ? Number(e.target.value) : ''); setFormErrors([])
                        if (autoFilledFields.has('brutoBedrag')) {
                          setAutoFilledFields(prev => { const next = new Set(prev); next.delete('brutoBedrag'); return next })
                        }
                      }}
                      className={`min-w-0 flex-1 border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('edrag')) ? 'border-red-400 bg-red-50/30' : autoFilledFields.has('brutoBedrag') ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Duur (alleen bij Tijdelijk) */}
                {formDurationType === 'period' && (
                  <div>
                    <label className="text-xs font-medium text-[var(--ink-3)]">Duur (maanden)</label>
                    <input
                      type="number"
                      value={formDuration}
                      onChange={e => { setFormDuration(e.target.value ? Number(e.target.value) : ''); setFormErrors([]) }}
                      className={`mt-1 w-full border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('duur')) ? 'border-red-400 bg-red-50/30' : 'border-[var(--border-ed)]'}`}
                      placeholder="bijv. 12"
                    />
                  </div>
                )}

                {/* Indexering (alleen bij recurring) */}
                {formDurationType !== 'one_time' && (
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formIsIndexed}
                      onChange={e => setFormIsIndexed(e.target.checked)}
                      className="h-4 w-4 border-[var(--border-md)] accent-horizon-600"
                    />
                    <span className="text-sm text-[var(--ink-2)]">Bedrag groeit mee met inflatie (~2%/jaar)</span>
                  </label>
                )}
              </div>

              {/* Extra impacts (geldstromen) worden hieronder getoond via de Geldstromen sectie */}
            </div>

            {/* ── Voorgestelde vs eigen instellingen ── */}
            {hasCatalogFields && (
              <div className="space-y-3">
                {/* Toggle: voorgestelde vs eigen waarden */}
                <label className="flex cursor-pointer items-start gap-3 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={useSuggestedSettings}
                    onChange={e => {
                      const checked = e.target.checked
                      setUseSuggestedSettings(checked)
                      if (checked) {
                        const suggested = computeSuggestedValues(formType)
                        setFormAmount(suggested.amount)
                        setFormAge(suggested.age)
                        setFormDirection(suggested.direction)
                        setFormDurationType(suggested.durationType)
                        setFormDuration(suggested.duration)
                        setFormIsIndexed(suggested.isIndexed)
                        setFormMetadata({ ...suggested.metadata })
                      }
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 border-[var(--border-md)] accent-horizon-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink)]">Gebruik voorgestelde waarden</span>
                    <p className="text-xs text-[var(--ink-3)]">Op basis van je profiel en actuele gegevens</p>
                  </div>
                </label>

                {/* Read-only summary when using suggested values */}
                {useSuggestedSettings && (() => {
                  const suggested = computeSuggestedValues(formType)
                  const catalog = LIFE_EVENT_CATALOG[formType]
                  return (
                    <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-4 space-y-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ink-2)]">
                        {suggested.age !== '' && (
                          <span>Leeftijd: <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{suggested.age} jaar</span></span>
                        )}
                        <span>Bedrag: <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{<MaskedAmount value={suggested.amount} tone="horizon" />}{suggested.durationType !== 'one_time' ? '/mnd' : ''}</span></span>
                        <span>{suggested.durationType === 'one_time' ? 'Eenmalig' : suggested.durationType === 'continuous' ? 'Continu' : `${suggested.duration} maanden`}</span>
                      </div>
                      {catalog?.fields && (() => {
                        const visibleFields = catalog.fields!.filter((f: CatalogField) => {
                          const val = suggested.metadata[f.key]
                          return val !== undefined && val !== null
                        })
                        if (visibleFields.length === 0) return null
                        return (
                          <div className="border-t border-horizon-200 pt-2 space-y-0.5">
                            {visibleFields.slice(0, 6).map((f: CatalogField) => {
                              const val = suggested.metadata[f.key]
                              const formatted = f.fieldType === 'toggle' ? (val ? 'Ja' : 'Nee')
                                : f.fieldType === 'select' ? (f.options?.find(o => o.value === val)?.label ?? String(val))
                                : f.fieldType === 'percentage' ? `${val}%`
                                : String(val)
                              return (
                                <div key={f.key} className="flex justify-between text-xs text-[var(--ink-3)]">
                                  <span>{f.label}</span>
                                  <span className="font-mono tabular-nums">{formatted}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}

                {/* Editable catalog fields when not using suggested values */}
                {!useSuggestedSettings && (<>
                <div className="space-y-3 rounded-[var(--r)] border border-dashed border-horizon-200 bg-horizon-50/30 p-4">
                  {LIFE_EVENT_CATALOG[formType].fields!.map((field: CatalogField) => {
                    // Conditionally hide huidigeAutoKosten when vervangtHuidigeAuto is false
                    if (formType === 'car_purchase' && field.key === 'huidigeAutoKosten' && !formMetadata.vervangtHuidigeAuto) {
                      return null
                    }
                    // Conditionally hide vasteLastenBedrag when vasteLastenThuis is false
                    if (formType === 'world_trip' && field.key === 'vasteLastenBedrag' && !formMetadata.vasteLastenThuis && formMetadata.vasteLastenThuis !== undefined) {
                      return null
                    }
                    return (
                    <div key={field.key}>
                      <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                        {field.label}
                        {field.tip && (
                          <span className="font-normal text-[var(--ink-4)]" title={field.tip}>ⓘ</span>
                        )}
                        {autoFilledFields.has(field.key) && (
                          <span className="inline-flex items-center bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                        )}
                      </label>
                      {field.fieldType === 'number' || field.fieldType === 'percentage' ? (
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            value={formMetadata[field.key] !== undefined ? String(formMetadata[field.key]) : String(field.default)}
                            onChange={e => {
                              const val = e.target.value ? Number(e.target.value) : ''
                              const updated = { ...formMetadata, [field.key]: val }
                              setFormMetadata(updated)
                              // Clear auto-fill marking when user manually changes a field
                              if (autoFilledFields.has(field.key)) {
                                setAutoFilledFields(prev => { const next = new Set(prev); next.delete(field.key); return next })
                              }
                              // Auto-calculate netto overwaarde for house_sale
                              if (formType === 'house_sale' && ['verkoopprijs', 'resterendeHypotheek', 'makelaarskosten'].includes(field.key)) {
                                const vp = Number(updated.verkoopprijs) || 0
                                const rh = Number(updated.resterendeHypotheek) || 0
                                const mkPct = Number(updated.makelaarskosten) || 1.5
                                const mkBedrag = Math.round(vp * mkPct / 100)
                                const netto = vp - rh - mkBedrag
                                setFormAmount(Math.abs(netto))
                                setFormDirection(netto >= 0 ? 'income' : 'expense')
                                setFormDurationType('one_time')
                              }
                              // Auto-calculate netto bijverdienste for side_hustle
                              if (formType === 'side_hustle' && ['brutoOmzet', 'kostenPerMaand'].includes(field.key)) {
                                const brutoOmzet = Number(updated.brutoOmzet ?? 1500)
                                const kosten = Number(updated.kostenPerMaand ?? 300)
                                const netto = Math.max(0, brutoOmzet - kosten)
                                setFormAmount(netto)
                                setFormDirection('income')
                                const isDoorlopend = updated.doorlopend !== undefined ? Boolean(updated.doorlopend) : true
                                setFormDurationType(isDoorlopend ? 'continuous' : 'period')
                              }
                              // Auto-calculate transitievergoeding for werkloosheid
                              if (formType === 'werkloosheid' && ['huidigBruto', 'dienstjaren'].includes(field.key)) {
                                const bruto = Number(updated.huidigBruto ?? 4000)
                                const jaren = Number(updated.dienstjaren ?? 5)
                                const transitie = Math.round(bruto / 3 * jaren)
                                setFormMetadata(prev => ({ ...prev, transitievergoeding: transitie }))
                                // Transitievergoeding as one-time income (negative cost)
                                setFormAmount(transitie)
                                setFormDirection('income')
                                setFormDurationType('one_time')
                              }
                              // Auto-update AOW amount based on jarenBuitenNL
                              if (formType === 'aow' && field.key === 'jarenBuitenNL') {
                                const leefsituatie = String(updated.leefsituatie ?? 'alleenstaand')
                                const baseAmount = leefsituatie === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
                                const jarenBuiten = Math.min(50, Math.max(0, Number(val) || 0))
                                const factor = (50 - jarenBuiten) / 50
                                setFormAmount(Math.round(baseAmount * factor))
                              }
                              // Auto-calculate kosten koper for house_purchase (canonieke bron — lib/kosten-koper.ts)
                              if (formType === 'house_purchase' && field.key === 'aankoopprijs') {
                                const { totaal } = computeKostenKoper({
                                  aankoopprijs: Number(val) || 0,
                                  isStarter: Boolean(updated.eersteWoning ?? true),
                                  hasNHG: Boolean(updated.nhg ?? false),
                                })
                                setFormAmount(totaal)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Auto-calculate vermogensverlies + totale kosten for scheiding
                              if (formType === 'scheiding' && ['vermogensBehoudPct', 'advocaatKosten'].includes(field.key)) {
                                const behoudPct = Number(updated.vermogensBehoudPct ?? 50)
                                const advocaat = Number(updated.advocaatKosten ?? 7500)
                                const vermogensverlies = Math.round(effectiveNetWorth * (1 - behoudPct / 100))
                                setFormAmount(Math.max(0, vermogensverlies + advocaat))
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Pension: auto-update amount from brutoBedrag, age from ingangLeeftijd
                              if (formType === 'pension' && field.key === 'brutoBedrag') {
                                setFormAmount(Number(val) || 0)
                              }
                              if (formType === 'pension' && field.key === 'ingangLeeftijd') {
                                setFormAge(Number(val) || 68)
                              }
                              // Early retirement: auto-update AOW gap when pensioenLeeftijd changes
                              if (formType === 'early_retirement' && field.key === 'pensioenLeeftijd') {
                                const leeftijd = Number(val) || 62
                                const aowGapMaanden = Math.max(0, (67 - leeftijd) * 12)
                                setFormAge(leeftijd)
                                setFormDuration(aowGapMaanden)
                              }
                              // Part-time: auto-update income loss when hours or income changes
                              if (formType === 'part_time' && ['huidigUren', 'nieuwUren', 'nettoInkomen'].includes(field.key)) {
                                const huidig = Number(field.key === 'huidigUren' ? val : updated.huidigUren ?? 40)
                                const nieuw = Number(field.key === 'nieuwUren' ? val : updated.nieuwUren ?? 32)
                                const inkomen = Number(field.key === 'nettoInkomen' ? val : updated.nettoInkomen ?? 3000)
                                const reductie = huidig > 0 ? 1 - (nieuw / huidig) : 0
                                setFormAmount(Math.round(inkomen * Math.max(0, reductie)))
                              }
                              // Auto-update car monthly costs when km changes
                              if (formType === 'car_purchase' && field.key === 'jaarlijkseKm') {
                                const brandstof = String(updated.brandstof ?? 'benzine')
                                const km = Number(val) || 15000
                                const breakdown = berekenAutoMaandkosten(brandstof, km)
                                setFormAmount(breakdown.totaal)
                                setFormDirection('expense')
                                setFormDurationType('period')
                              }
                              // Auto-update car monthly costs when huidigeAutoKosten changes
                              if (formType === 'car_purchase' && field.key === 'huidigeAutoKosten') {
                                // Just update metadata, the breakdown card will show the difference
                              }
                              // Auto-update netto erfenis when brutoBedrag changes
                              if (formType === 'inheritance' && field.key === 'brutoBedrag') {
                                const relatie = String(updated.erfbelastingSchijf ?? 'kind')
                                const erf = berekenErfbelasting(Number(val) || 0, relatie)
                                setFormAmount(erf.netto)
                                setFormDirection('income')
                                setFormDurationType('one_time')
                              }
                              // Auto-update sabbatical income loss when nettoInkomen or doorbetalingsPct changes
                              if (formType === 'sabbatical' && (field.key === 'nettoInkomen' || field.key === 'doorbetalingsPct')) {
                                const inkomen = Number(field.key === 'nettoInkomen' ? val : (updated.nettoInkomen ?? 3000))
                                const pct = Math.min(100, Math.max(0, Number(field.key === 'doorbetalingsPct' ? val : (updated.doorbetalingsPct ?? 0))))
                                const verlies = Math.round(inkomen * (1 - pct / 100))
                                setFormAmount(verlies)
                                setFormDirection('income')
                                setFormDurationType('period')
                              }
                              // World trip: auto-update vertrekkosten as one-time cost
                              if (formType === 'world_trip' && field.key === 'vertrekkosten') {
                                const vertrek = Number(val) || 4000
                                setFormAmount(vertrek)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Study: auto-update cost when collegegeld changes
                              if (formType === 'study' && field.key === 'collegegeld') {
                                setFormAmount(Number(val) || 0)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Wedding: auto-update total when huwelijksreis changes
                              if (formType === 'wedding' && field.key === 'huwelijksreis') {
                                // formAmount already reflects bruiloft cost; we'll add huwelijksreis in save
                                // No need to change formAmount here — save handler combines them
                              }
                            }}
                            className={`min-w-0 flex-1 border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${autoFilledFields.has(field.key) ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                          />
                          {field.suffix && (
                            <span className="shrink-0 text-xs text-[var(--ink-3)]">{field.suffix}</span>
                          )}
                        </div>
                      ) : field.fieldType === 'select' ? (
                        <select
                          value={String(formMetadata[field.key] ?? field.default)}
                          onChange={e => {
                            const val = e.target.value
                            const numVal = field.options?.some(o => typeof o.value === 'number') ? Number(val) : val
                            setFormMetadata(prev => ({ ...prev, [field.key]: numVal }))
                            if (autoFilledFields.has(field.key)) {
                              setAutoFilledFields(prev => { const next = new Set(prev); next.delete(field.key); return next })
                            }
                            if (formType === 'children' && field.key === 'aantalKinderen') {
                              setFormAmount(nibudChildrenCost(Number(val)))
                            }
                            // Move: auto-update verhuiskosten when afstand changes
                            if (formType === 'move' && field.key === 'afstand') {
                              const kostenMap: Record<string, number> = { lokaal: 1500, regionaal: 3000, internationaal: 8000 }
                              const kosten = kostenMap[val] ?? 3000
                              setFormMetadata(prev => ({ ...prev, afstand: val, verhuiskosten: kosten }))
                            }
                            // Auto-update car monthly costs when brandstof changes
                            if (formType === 'car_purchase' && field.key === 'brandstof') {
                              const km = Number(formMetadata.jaarlijkseKm ?? 15000)
                              const breakdown = berekenAutoMaandkosten(val, km)
                              setFormAmount(breakdown.totaal)
                              setFormDirection('expense')
                              setFormDurationType('period')
                            }
                            // Auto-update netto erfenis when relatie changes
                            if (formType === 'inheritance' && field.key === 'erfbelastingSchijf') {
                              const bruto = Number(formMetadata.brutoBedrag ?? 50000)
                              const erf = berekenErfbelasting(bruto, val)
                              setFormAmount(erf.netto)
                              setFormDirection('income')
                              setFormDurationType('one_time')
                            }
                            // Auto-update AOW amount based on leefsituatie
                            // Renovation: auto-update cost based on type preset
                            if (formType === 'renovation' && field.key === 'type') {
                              const preset = VERBOUWING_TYPE_KOSTEN[val]
                              if (preset) {
                                setFormAmount(preset.bedrag)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                                setFormMetadata(prev => ({ ...prev, type: val, waardevermeerdering: preset.waardePct }))
                              }
                            }
                            // Study: auto-update cost and duration based on type preset
                            if (formType === 'study' && field.key === 'studieType') {
                              const preset = STUDIE_TYPE_KOSTEN[val]
                              if (preset) {
                                setFormAmount(preset.bedrag)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                                setFormDuration(preset.duur)
                                setFormMetadata(prev => ({ ...prev, studieType: val, collegegeld: preset.bedrag }))
                              }
                            }
                            // Wedding: auto-update budget when preset changes
                            if (formType === 'wedding' && field.key === 'budgetPreset') {
                              const preset = BRUILOFT_BUDGET_PRESETS[val]
                              if (preset) {
                                setFormAmount(preset.bedrag)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                                setFormMetadata(prev => ({ ...prev, budgetPreset: val, aantalGasten: preset.gasten }))
                              }
                            }
                            if (formType === 'aow' && field.key === 'leefsituatie') {
                              const baseAmount = val === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
                              const jarenBuiten = Number(formMetadata.jarenBuitenNL ?? 0)
                              const factor = Math.min(1, Math.max(0, (50 - jarenBuiten) / 50))
                              setFormAmount(Math.round(baseAmount * factor))
                            }
                            // World trip: auto-update monthly cost based on reisstijl preset
                            if (formType === 'world_trip' && field.key === 'reisstijl') {
                              const preset = WERELDREIS_STIJL_PRESETS[val]
                              if (preset) {
                                // Update the vertrekkosten as one-time cost, monthly cost handled in save
                                const vertrek = Number(formMetadata.vertrekkosten ?? 4000)
                                setFormAmount(vertrek)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                            }
                            if (formType === 'schenking' && field.key === 'eenmaligOfJaarlijks') {
                              if (val === 'jaarlijks') {
                                setFormDurationType('period')
                                const jaren = Number(formMetadata.aantalJaren) || 10
                                setFormDuration(jaren * 12)
                              } else {
                                setFormDurationType('one_time')
                                setFormDuration(0)
                              }
                            }
                          }}
                          className={`mt-1 w-full border bg-[var(--paper)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${autoFilledFields.has(field.key) ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                        >
                          {field.options?.map(opt => (
                            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                          ))}
                        </select>
                      ) : field.fieldType === 'toggle' ? (
                        <label className="mt-1 flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={formMetadata[field.key] !== undefined ? Boolean(formMetadata[field.key]) : Boolean(field.default)}
                            onChange={e => {
                              const checked = e.target.checked
                              if (autoFilledFields.has(field.key)) {
                                setAutoFilledFields(prev => { const next = new Set(prev); next.delete(field.key); return next })
                              }
                              setFormMetadata(prev => {
                                const updated = { ...prev, [field.key]: checked }
                                // Recalculate kosten koper when eersteWoning or nhg toggles (canonieke bron — lib/kosten-koper.ts)
                                if (formType === 'house_purchase' && (field.key === 'eersteWoning' || field.key === 'nhg')) {
                                  const { totaal } = computeKostenKoper({
                                    aankoopprijs: Number(updated.aankoopprijs ?? 350000),
                                    isStarter: Boolean(updated.eersteWoning ?? true),
                                    hasNHG: Boolean(updated.nhg ?? false),
                                  })
                                  setFormAmount(totaal)
                                  setFormDirection('expense')
                                  setFormDurationType('one_time')
                                }
                                // Pension: sync isGeindexeerd toggle with formIsIndexed
                                if (formType === 'pension' && field.key === 'isGeindexeerd') {
                                  setFormIsIndexed(checked)
                                }
                                // Part-time: toggle permanent ↔ tijdelijk
                                if (formType === 'part_time' && field.key === 'isPermanent') {
                                  if (checked) {
                                    setFormDurationType('continuous')
                                    setFormDuration(0)
                                  } else {
                                    setFormDurationType('period')
                                    setFormDuration(60)
                                  }
                                }
                                // Side hustle: toggle doorlopend ↔ tijdelijk project
                                if (formType === 'side_hustle' && field.key === 'doorlopend') {
                                  if (checked) {
                                    setFormDurationType('continuous')
                                    setFormDuration(0)
                                  } else {
                                    setFormDurationType('period')
                                    setFormDuration(36)
                                  }
                                }
                                return updated
                              })
                            }}
                            className="h-4 w-4 border-[var(--border-md)] accent-horizon-600"
                          />
                          <span className="text-xs text-[var(--ink-2)]">{field.tip ?? ''}</span>
                        </label>
                      ) : null}
                      {formType === 'aow' && field.key === 'jarenBuitenNL' && (() => {
                        const jarenBuiten = Math.min(50, Math.max(0, Number(formMetadata.jarenBuitenNL ?? 0)))
                        const opbouwPct = Math.round(((50 - jarenBuiten) / 50) * 100)
                        const leefsituatie = String(formMetadata.leefsituatie ?? 'alleenstaand')
                        const baseAmount = leefsituatie === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
                        const gecorrigeerdBedrag = Math.round(baseAmount * opbouwPct / 100)
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">AOW-opbouw</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Opbouwjaren in NL</span>
                                <span className="font-mono tabular-nums">{50 - jarenBuiten} van 50 jaar</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Opbouwpercentage</span>
                                <span className={`font-mono tabular-nums font-semibold ${opbouwPct < 100 ? 'text-amber-600' : 'text-positive'}`}>{opbouwPct}%</span>
                              </div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Gecorrigeerd bedrag</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={gecorrigeerdBedrag} tone="horizon" />}/mnd netto</span>
                              </div>
                            </div>
                            {jarenBuiten > 0 && (
                              <p className="text-[10px] text-[var(--ink-4)]">
                                2% korting per jaar niet woonachtig in NL. Vrijwillige verzekering mogelijk via SVB.
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'house_purchase' && field.key === 'nhg' && (() => {
                        const prijs = Number(formMetadata.aankoopprijs ?? 350000)
                        const isStarter = Boolean(formMetadata.eersteWoning ?? true)
                        // Canonieke bron — lib/kosten-koper.ts (geen lokale herberekening)
                        const { overdracht, notaris, taxatie, bankgarantie, nhgKosten, totaal } = computeKostenKoper({
                          aankoopprijs: prijs,
                          isStarter,
                          hasNHG: Boolean(formMetadata.nhg ?? false),
                        })
                        const pct = prijs > 0 ? ((totaal / prijs) * 100).toFixed(1) : '0.0'
                        const hypotheekLasten = Number(formMetadata.hypotheekLasten ?? 1200)
                        const huidigeHuur = Number(formMetadata.huidigeHuur ?? 1000)
                        const onderhoudMaand = Math.round((prijs * 0.01) / 12)
                        const bruteMaandlast = hypotheekLasten + onderhoudMaand
                        const nettoMaandlast = bruteMaandlast - huidigeHuur
                        return (
                          <div className="mt-2 space-y-2">
                            <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Kosten koper ({pct}%)</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Overdrachtsbelasting (2%)</span>
                                  <span className="font-mono tabular-nums">
                                    {overdracht === 0 ? (
                                      <span className="text-positive">Vrijgesteld (starter &lt;35j)</span>
                                    ) : (
                                      <MaskedAmount value={overdracht} tone="horizon" />
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between"><span>Notariskosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={notaris} tone="horizon" />}</span></div>
                                <div className="flex justify-between"><span>Taxatiekosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={taxatie} tone="horizon" />}</span></div>
                                <div className="flex justify-between"><span>Bankgarantie (0,1%)</span><span className="font-mono tabular-nums">{<MaskedAmount value={bankgarantie} tone="horizon" />}</span></div>
                                {nhgKosten > 0 && (
                                  <div className="flex justify-between"><span>NHG-premie (0,4%)</span><span className="font-mono tabular-nums">{<MaskedAmount value={nhgKosten} tone="horizon" />}</span></div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Totaal kosten koper</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={totaal} tone="horizon" />}</span>
                                </div>
                              </div>
                              {isStarter && prijs > STARTERSVRIJSTELLING_MAX && (
                                <p className="text-[10px] text-amber-600">
                                  Let op: startersvrijstelling geldt alleen tot €555.000 (2026).
                                </p>
                              )}
                            </div>
                            <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto maandlasten</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between"><span>Hypotheeklasten</span><span className="font-mono tabular-nums">{<MaskedAmount value={hypotheekLasten} tone="horizon" />}/mnd</span></div>
                                <div className="flex justify-between"><span>Onderhoud (~1% woningwaarde/jaar)</span><span className="font-mono tabular-nums">{<MaskedAmount value={onderhoudMaand} tone="horizon" />}/mnd</span></div>
                                <div className="flex justify-between"><span>Huidige huur (besparing)</span><span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={huidigeHuur} tone="horizon" />}/mnd</span></div>
                                <div className="h-px bg-horizon-200 my-1" />
                                <div className="flex justify-between font-semibold">
                                  <span>Netto extra maandlast</span>
                                  <span className={`font-mono tabular-nums ${nettoMaandlast > 0 ? 'text-negative' : 'text-positive'}`}>
                                    {nettoMaandlast > 0 ? '+' : ''}{<MaskedAmount value={nettoMaandlast} tone="horizon" />}/mnd
                                  </span>
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] leading-relaxed text-amber-600">
                              Tip: vergeet niet je woning als asset toe te voegen in Overzicht → Bezittingen, zodat je vermogensoverzicht klopt.
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'children' && field.key === 'aantalKinderen' && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-4)]">
                          Kosten schalen niet lineair (NIBUD): 1 kind ~&#8364;500/mnd, 2 kinderen ~&#8364;830/mnd, 3 ~&#8364;1.100/mnd, 4 ~&#8364;1.320/mnd. Het bedrag hierboven is automatisch aangepast, maar blijft handmatig aanpasbaar.
                        </p>
                      )}
                      {formType === 'children' && field.key === 'kinderopvangDagen' && (() => {
                        const opvangDagen = Number(formMetadata.kinderopvangDagen ?? 0)
                        const aantalKinderen = Number(formMetadata.aantalKinderen ?? 1)
                        if (opvangDagen <= 0) return null
                        const nettoOpvang = berekenKinderopvangNetto(opvangDagen, aantalKinderen)
                        const brutoOpvang = opvangDagen * 440 * aantalKinderen
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/30 p-2.5 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Geschatte opvangkosten</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bruto opvang ({opvangDagen} dgn × {aantalKinderen} {aantalKinderen === 1 ? 'kind' : 'kinderen'})</span><span className="font-mono tabular-nums">{<MaskedAmount value={brutoOpvang} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between text-positive"><span>Kinderopvangtoeslag (~70%)</span><span className="font-mono tabular-nums">-{<MaskedAmount value={brutoOpvang - nettoOpvang} tone="horizon" />}/mnd</span></div>
                              <div className="h-px bg-horizon-200 my-0.5" />
                              <div className="flex justify-between font-semibold"><span>Netto eigen bijdrage</span><span className="font-mono tabular-nums text-negative">+{<MaskedAmount value={nettoOpvang} tone="horizon" />}/mnd</span></div>
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] leading-relaxed">
                              Kinderopvangtoeslag dekt 33–96% afhankelijk van je inkomen. Hier is uitgegaan van ~70% dekking (modaal inkomen). Check <span className="underline">toeslagen.nl</span> voor je persoonlijke situatie.
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'children' && field.key === 'babyuitzet' && (() => {
                        const aantalKinderen = Number(formMetadata.aantalKinderen ?? 1)
                        const basiskosten = Number(formAmount) || nibudChildrenCost(aantalKinderen)
                        const babyuitzet = Number(formMetadata.babyuitzet ?? 3000)
                        const duurMaanden = Number(formDuration) || 216
                        const opvangDagen = Number(formMetadata.kinderopvangDagen ?? 0)
                        const nettoOpvang = berekenKinderopvangNetto(opvangDagen, aantalKinderen)
                        // Kinderopvang is typically 0-4 years (48 months)
                        const opvangMaanden = Math.min(48, duurMaanden)
                        const useKinderbijslag = formMetadata.kinderbijslag !== false
                        const kbPerMaand = useKinderbijslag ? kinderbijslagPerMaand(aantalKinderen) : 0
                        const nettoMaandkosten = basiskosten + nettoOpvang - kbPerMaand
                        const totaalBasis = basiskosten * duurMaanden
                        const totaalOpvang = nettoOpvang * opvangMaanden
                        const totaalKb = kbPerMaand * duurMaanden
                        const totaal = babyuitzet + totaalBasis + totaalOpvang - totaalKb
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht kinderen</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Eenmalige kosten</p>
                              <div className="flex justify-between"><span>Babyuitzet &amp; kinderkamer</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={babyuitzet} tone="horizon" />}</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Netto maandkosten</p>
                              <div className="flex justify-between"><span>Basiskosten ({aantalKinderen} {aantalKinderen === 1 ? 'kind' : 'kinderen'})</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={basiskosten} tone="horizon" />}/mnd</span></div>
                              {opvangDagen > 0 && (
                                <div className="flex justify-between"><span>Kinderopvang netto ({opvangDagen} dgn/wk, ~4 jr)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={nettoOpvang} tone="horizon" />}/mnd</span></div>
                              )}
                              {useKinderbijslag && (
                                <div className="flex justify-between text-positive"><span>Kinderbijslag (~{<MaskedAmount value={kbPerMaand * 3} tone="horizon" />}/kwt × {aantalKinderen})</span><span className="font-mono tabular-nums">+{<MaskedAmount value={kbPerMaand} tone="horizon" />}/mnd</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-0.5" />
                              <div className="flex justify-between font-semibold"><span>Netto maandkosten</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={Math.max(0, nettoMaandkosten)} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between text-[var(--ink-4)]"><span>Duur</span><span>{Math.round(duurMaanden / 12)} jaar ({duurMaanden} mnd)</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totale geschatte kosten</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={Math.max(0, totaal)} tone="horizon" />}</span></div>
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'pension' && field.key === 'brutoBedrag' && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-4)]">
                          Gemiddeld aanvullend pensioen Nederland: ca. &#8364;675/mnd bruto. Check <span className="underline">mijnpensioenoverzicht.nl</span> voor je persoonlijke verwachte uitkering.
                        </p>
                      )}
                      {formType === 'part_time' && field.key === 'behoudtPensioen' && (() => {
                        const ptHuidigUren = Number(formMetadata.huidigUren ?? 40)
                        const ptNieuwUren = Number(formMetadata.nieuwUren ?? 32)
                        const ptNettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
                        const ptReductie = ptHuidigUren > 0 ? 1 - (ptNieuwUren / ptHuidigUren) : 0
                        const ptInkomensVerlies = Math.round(ptNettoInkomen * Math.max(0, ptReductie))
                        const ptUrenPct = ptHuidigUren > 0 ? Math.round((ptNieuwUren / ptHuidigUren) * 100) : 100
                        const ptBehoudtPensioen = Boolean(formMetadata.behoudtPensioen ?? false)
                        const ptPensioenReductie = ptBehoudtPensioen ? 0 : Math.min(100, Math.round(ptReductie * 1.65 * 100))
                        return (
                          <div className="mt-2 space-y-3">
                            <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Inkomensverlies berekening</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Huidig</span>
                                  <span className="font-mono tabular-nums">{ptHuidigUren} uur/week — {<MaskedAmount value={ptNettoInkomen} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Nieuw</span>
                                  <span className="font-mono tabular-nums">{ptNieuwUren} uur/week ({ptUrenPct}%)</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Inkomensverlies</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ptInkomensVerlies} tone="horizon" />}/mnd</span>
                                </div>
                              </div>
                            </div>
                            {!ptBehoudtPensioen && ptReductie > 0 && (
                              <div className="flex gap-2 border border-amber-200 bg-amber-50/50 p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <div className="text-xs text-amber-800 space-y-1">
                                  <p className="font-semibold">Pensioenimpact (franchise-effect)</p>
                                  <p>
                                    {Math.round(ptReductie * 100)}% minder uren kan leiden tot ~{ptPensioenReductie}% minder pensioenopbouw.
                                    Dit komt door de franchise (drempel van ca. &#8364;16.300): je bouwt alleen pensioen op over het salaris <em>boven</em> de franchise. Bij parttime daalt je salaris, maar de franchise blijft gelijk.
                                  </p>
                                  <p className="text-[10px] text-amber-600">
                                    Tip: vraag je werkgever of je pensioen over het voltijdsalaris kunt opbouwen.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'inheritance' && field.key === 'erfbelastingSchijf' && (() => {
                        const bruto = Number(formMetadata.brutoBedrag ?? 50000)
                        const relatie = String(formMetadata.erfbelastingSchijf ?? 'kind')
                        const erf = berekenErfbelasting(bruto, relatie)
                        const tariefLabel: Record<string, string> = { kind: '10–20%', partner: '10–20%', kleinkind: '18–36%', overig: '30–40%' }
                        return (
                          <div className="mt-2 space-y-1.5 border border-horizon-200 bg-horizon-50/50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Erfbelasting berekening (2026)</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bruto erfenis</span><span className="font-mono tabular-nums">{<MaskedAmount value={bruto} tone="horizon" />}</span></div>
                              <div className="flex justify-between text-positive"><span>Vrijstelling ({relatie})</span><span className="font-mono tabular-nums">-{<MaskedAmount value={erf.vrijstelling} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Belastbaar bedrag</span><span className="font-mono tabular-nums">{<MaskedAmount value={erf.belastbaar} tone="horizon" />}</span></div>
                              {erf.belastingLaag > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 1 ({tariefLabel[relatie]})</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={erf.belastingLaag} tone="horizon" />}</span></div>)}
                              {erf.belastingHoog > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 2</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={erf.belastingHoog} tone="horizon" />}</span></div>)}
                              <div className="flex justify-between"><span>Totaal erfbelasting</span><span className={`font-mono tabular-nums ${erf.totaalBelasting > 0 ? 'text-negative' : ''}`}>{erf.totaalBelasting > 0 ? <MaskedAmount value={erf.totaalBelasting} signPrefix="-" tone="horizon" /> : <MaskedAmount value={0} tone="horizon" />}</span></div>
                              {erf.effectiefTarief > 0 && (<div className="flex justify-between text-[var(--ink-4)]"><span>Effectief tarief</span><span className="font-mono tabular-nums">{erf.effectiefTarief}%</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Netto erfenis</span><span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={erf.netto} tone="horizon" />}</span></div>
                            </div>
                            {relatie === 'partner' && bruto <= erf.vrijstelling && (<p className="text-[10px] text-emerald-700">Volledig vrijgesteld: de partnervrijstelling ({<MaskedAmount value={erf.vrijstelling} tone="horizon" />}) overschrijdt het bedrag.</p>)}
                          </div>
                        )
                      })()}
                      {formType === 'sabbatical' && field.key === 'doorbetalingsPct' && (() => {
                        const nettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
                        const doorbetalingsPct = Math.min(100, Math.max(0, Number(formMetadata.doorbetalingsPct ?? 0)))
                        const inkomensverlies = Math.round(nettoInkomen * (1 - doorbetalingsPct / 100))
                        const doorbetaling = Math.round(nettoInkomen * doorbetalingsPct / 100)
                        const extraKosten = Number(formMetadata.extraKosten ?? 2000)
                        const durMnd = Number(formDuration) || 6
                        const totaalVerlies = (inkomensverlies * durMnd) + extraKosten
                        return (
                          <div className="mt-2 space-y-1.5 border border-horizon-200 bg-horizon-50/50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Inkomensverlies berekening</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Netto maandinkomen</span><span className="font-mono tabular-nums">{<MaskedAmount value={nettoInkomen} tone="horizon" />}/mnd</span></div>
                              {doorbetalingsPct > 0 && (<div className="flex justify-between text-positive"><span>Doorbetaling werkgever ({doorbetalingsPct}%)</span><span className="font-mono tabular-nums">+{<MaskedAmount value={doorbetaling} tone="horizon" />}/mnd</span></div>)}
                              <div className="flex justify-between font-semibold"><span>Maandelijks inkomensverlies</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={inkomensverlies} tone="horizon" />}/mnd</span></div>
                              {extraKosten > 0 && (<div className="flex justify-between"><span>Extra kosten (eenmalig)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={extraKosten} tone="horizon" />}</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Totaal impact ({durMnd} mnd)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalVerlies} tone="horizon" />}</span></div>
                            </div>
                            {doorbetalingsPct === 0 && (<p className="text-[10px] text-[var(--ink-4)]">Tip: vraag je werkgever naar sabbaticalregelingen. Sommige cao&#39;s bieden gedeeltelijke doorbetaling.</p>)}
                            {doorbetalingsPct === 100 && (<p className="text-[10px] text-emerald-700">Volledig doorbetaald sabbatical — alleen extra kosten zijn van toepassing.</p>)}
                          </div>
                        )
                      })()}
                      {formType === 'early_retirement' && field.key === 'overbruggingsUitkering' && (() => {
                        const pensioenLeeftijd = Number(formMetadata.pensioenLeeftijd ?? 62)
                        const aowLeeftijd = Math.ceil(userAowAge.fractional)
                        const aowGapJaren = Math.max(0, aowLeeftijd - pensioenLeeftijd)
                        const aowGapMaanden = aowGapJaren * 12
                        const maanduitgaven = effectiveInput?.monthlyExpenses ?? 3000
                        const overbrugging = Number(formMetadata.overbruggingsUitkering ?? 0)
                        const vroegpensioen = Number(formMetadata.vroegpensioenUitkering ?? 0)
                        const vroegpensioenVanaf = Number(formMetadata.vroegpensioenVanafLeeftijd ?? 63)
                        // Calculate total bridging cost
                        // From pensioenLeeftijd to vroegpensioenVanaf: full expenses minus overbrugging only
                        // From vroegpensioenVanaf to AOW: expenses minus overbrugging minus vroegpensioen
                        const phase1Maanden = Math.max(0, Math.min(vroegpensioenVanaf, aowLeeftijd) - pensioenLeeftijd) * 12
                        const phase2Maanden = Math.max(0, aowLeeftijd - Math.max(vroegpensioenVanaf, pensioenLeeftijd)) * 12
                        const phase1Tekort = Math.max(0, maanduitgaven - overbrugging)
                        const phase2Tekort = Math.max(0, maanduitgaven - overbrugging - vroegpensioen)
                        const totaalOverbrugging = (phase1Tekort * phase1Maanden) + (phase2Tekort * phase2Maanden)
                        const vermogenPct = effectiveNetWorth > 0 ? Math.round((totaalOverbrugging / effectiveNetWorth) * 100) : 0
                        return (
                          <div className="mt-2 space-y-3">
                            <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">AOW-gat berekening</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Gewenste pensioenleeftijd</span>
                                  <span className="font-mono tabular-nums font-semibold">{pensioenLeeftijd} jaar</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>AOW-leeftijd</span>
                                  <span className="font-mono tabular-nums">{aowLeeftijd} jaar</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>AOW-gat</span>
                                  <span className={`font-mono tabular-nums ${aowGapJaren > 5 ? 'text-negative' : 'text-amber-600'}`}>
                                    {aowGapJaren} jaar ({aowGapMaanden} maanden)
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Geschatte overbruggingskosten</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Maanduitgaven</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={maanduitgaven} tone="horizon" />}/mnd</span>
                                </div>
                                {overbrugging > 0 && (
                                  <div className="flex justify-between">
                                    <span>Overbruggingsuitkering</span>
                                    <span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={overbrugging} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {vroegpensioen > 0 && phase2Maanden > 0 && (
                                  <div className="flex justify-between">
                                    <span>Vroegpensioen (vanaf {vroegpensioenVanaf}j)</span>
                                    <span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={vroegpensioen} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {phase1Maanden > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span className="pl-3">Tekort fase 1 ({pensioenLeeftijd}–{Math.min(vroegpensioenVanaf, aowLeeftijd)}j): {phase1Maanden} mnd × {<MaskedAmount value={phase1Tekort} tone="horizon" />}</span>
                                  </div>
                                )}
                                {phase2Maanden > 0 && vroegpensioen > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span className="pl-3">Tekort fase 2 ({Math.max(vroegpensioenVanaf, pensioenLeeftijd)}–{aowLeeftijd}j): {phase2Maanden} mnd × {<MaskedAmount value={phase2Tekort} tone="horizon" />}</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Totaal overbruggen uit vermogen</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalOverbrugging} tone="horizon" />}</span>
                                </div>
                                {effectiveNetWorth > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span>Dit is {vermogenPct}% van je netto vermogen</span>
                                    <span className="font-mono tabular-nums">{<MaskedAmount value={effectiveNetWorth} tone="horizon" />}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {aowGapJaren > 5 && (
                              <div className="flex gap-2 border border-red-200 bg-red-50/50 p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                                <p className="text-xs text-red-800">
                                  Een AOW-gat van meer dan 5 jaar is aanzienlijk. Zorg voor voldoende vermogen of overweeg een latere pensioenleeftijd. Je moet {<MaskedAmount value={totaalOverbrugging} tone="horizon" />} overbruggen.
                                </p>
                              </div>
                            )}
                            {vermogenPct > 50 && effectiveNetWorth > 0 && (
                              <div className="flex gap-2 border border-amber-200 bg-amber-50/50 p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <p className="text-xs text-amber-800">
                                  De overbruggingskosten beslaan {vermogenPct}% van je vermogen. Dit laat weinig ruimte voor onvoorziene uitgaven na pensionering.
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'car_purchase' && field.key === 'jaarlijkseKm' && (() => {
                        const brandstof = String(formMetadata.brandstof ?? 'benzine')
                        const km = Number(formMetadata.jaarlijkseKm ?? 15000)
                        const breakdown = berekenAutoMaandkosten(brandstof, km)
                        const vervangt = Boolean(formMetadata.vervangtHuidigeAuto)
                        const huidigeKosten = vervangt ? Number(formMetadata.huidigeAutoKosten ?? 300) : 0
                        const netto = breakdown.totaal - huidigeKosten
                        const brandstofLabel: Record<string, string> = { benzine: 'Benzine', diesel: 'Diesel', elektrisch: 'Laden (thuis)', hybride: 'Brandstof/laden' }
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Maandkosten breakdown (NIBUD/ANWB)</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Verzekering</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.verzekering} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Wegenbelasting</span>
                                <span className={`font-mono tabular-nums ${breakdown.wegenbelasting === 0 ? 'text-positive' : ''}`}>
                                  {breakdown.wegenbelasting === 0 ? 'Vrijgesteld (EV)' : <><MaskedAmount value={breakdown.wegenbelasting} tone="horizon" />/mnd</>}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Onderhoud</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.onderhoud} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{brandstofLabel[brandstof] ?? 'Brandstof'} ({km.toLocaleString('nl-NL')} km/jr)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.brandstof} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totaal nieuwe auto</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.totaal} tone="horizon" />}/mnd</span>
                              </div>
                              {vervangt && (
                                <>
                                  <div className="flex justify-between text-positive">
                                    <span>Huidige autokosten</span>
                                    <span className="font-mono tabular-nums">-{<MaskedAmount value={huidigeKosten} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                    <span>Netto verschil</span>
                                    <span className={`font-mono tabular-nums ${netto <= 0 ? 'text-positive' : 'text-negative'}`}>
                                      {netto <= 0 ? '-' : '+'}{<MaskedAmount value={Math.abs(netto)} tone="horizon" />}/mnd
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                            {brandstof === 'elektrisch' && (
                              <p className="text-[10px] text-emerald-700">
                                Elektrisch rijden: vrijstelling wegenbelasting t/m 2025, daarna gereduceerd tarief. Laadkosten thuis ca. &#8364;0,05/km.
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'house_sale' && field.key === 'makelaarskosten' && (() => {
                        const vp = Number(formMetadata.verkoopprijs) || 0
                        const rh = Number(formMetadata.resterendeHypotheek) || 0
                        const mkPct = Number(formMetadata.makelaarskosten) || 1.5
                        const mkBedrag = Math.round(vp * mkPct / 100)
                        const netto = vp - rh - mkBedrag
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto overwaarde</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Verkoopprijs</span><span className="font-mono tabular-nums">{<MaskedAmount value={vp} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Resterende hypotheek</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={rh} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Makelaarskosten ({mkPct}%)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={mkBedrag} tone="horizon" />}</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Netto overwaarde</span>
                                <span className={`font-mono tabular-nums ${netto >= 0 ? 'text-positive' : 'text-negative'}`}>
                                  {netto >= 0 ? '+' : ''}{<MaskedAmount value={netto} tone="horizon" />}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'house_sale' && field.key === 'oudeHypotheeklasten' && (() => {
                        const oudeLasten = Number(formMetadata.oudeHypotheeklasten) || 0
                        const nieuweLasten = Number(formMetadata.nieuweWoonlasten) || 0
                        const verschil = oudeLasten - nieuweLasten
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Verschil maandlasten</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Oude hypotheeklasten</span><span className="font-mono tabular-nums">{<MaskedAmount value={oudeLasten} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between"><span>Nieuwe woonlasten</span><span className="font-mono tabular-nums">{<MaskedAmount value={nieuweLasten} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Verschil</span>
                                <span className={`font-mono tabular-nums ${verschil >= 0 ? 'text-positive' : 'text-negative'}`}>
                                  {verschil >= 0 ? '+' : ''}{<MaskedAmount value={verschil} tone="horizon" />}/mnd
                                </span>
                              </div>
                            </div>
                            {verschil !== 0 && (
                              <p className="text-[10px] text-[var(--ink-4)]">
                                {verschil > 0 ? 'Je bespaart ' : 'Je betaalt '}{<MaskedAmount value={Math.abs(verschil)} tone="horizon" />}/mnd {verschil > 0 ? 'aan woonlasten' : 'meer aan woonlasten'}
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'werkloosheid' && field.key === 'zoektijd' && (() => {
                        // Consume-don't-recompute: exact dezelfde rekenregel als de
                        // som die het event voedt (lib/horizon/risico-event-regels.ts).
                        const impact = berekenWerkloosheidImpact(formMetadata)
                        const transitie = impact.transitievergoeding
                        const wwMaand75 = impact.ww.maandEerstePeriode
                        const wwMaand70 = impact.ww.maandDaarna
                        const gemWW = impact.ww.gemiddeldPerMaand
                        const inkomensgat = impact.inkomensgatPerMaand
                        const totaleDuur = impact.totaleDuurMaanden
                        const totaalInkomensVerlies = impact.totaalInkomensverlies
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht werkloosheid</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Transitievergoeding</span>
                                <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={transitie} tone="horizon" />}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>WW-uitkering (gem. over {totaleDuur} mnd)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={gemWW} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between text-[var(--ink-4)]">
                                <span className="pl-3">Eerste {impact.ww.wettelijkeEerstePeriodeMaanden} mnd ({Math.round(impact.ww.pctEerstePeriode * 100)}%)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={wwMaand75} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between text-[var(--ink-4)]">
                                <span className="pl-3">Daarna ({Math.round(impact.ww.pctDaarna * 100)}%)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={wwMaand70} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between">
                                <span>Inkomensgat per maand</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={inkomensgat} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between font-semibold">
                                <span>Totaal inkomensverlies ({totaleDuur} mnd)</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalInkomensVerlies} tone="horizon" />}</span>
                              </div>
                              {transitie >= totaalInkomensVerlies && (
                                <p className="text-[10px] text-positive mt-1">
                                  ✓ Transitievergoeding dekt het geschatte inkomensverlies
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'career_change' && field.key === 'omscholingskosten' && (() => {
                        const ccHuidig = Number(formMetadata.huidigNettoSalaris) || 3000
                        const ccNieuw = Number(formMetadata.verwachtNieuwNettoSalaris) || 3000
                        const ccGapMnd = Number(formMetadata.periodeZonderInkomen) || 3
                        const ccOvergangMnd = Number(formMetadata.overgangsperiodeMaanden) || 12
                        const ccOmscholing = Number(formMetadata.omscholingskosten) || 0
                        const ccOvergangSalaris = Math.round((ccHuidig + ccNieuw) / 2)
                        const ccVerliesFase1 = ccHuidig * ccGapMnd
                        const ccVerliesFase2 = (ccHuidig - ccOvergangSalaris) * ccOvergangMnd
                        const ccTotaalVerlies = ccVerliesFase1 + ccVerliesFase2
                        const ccTotaalKosten = ccTotaalVerlies + ccOmscholing
                        const ccDelta = ccNieuw - ccHuidig
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht carrière switch</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Fase 1 — Geen inkomen ({ccGapMnd} mnd)</p>
                              <div className="flex justify-between"><span>Inkomensverlies</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccVerliesFase1} tone="horizon" />}</span></div>
                              <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Fase 2 — Overgangsperiode ({ccOvergangMnd} mnd)</p>
                              <div className="flex justify-between"><span>Salaris tijdens overgang</span><span className="font-mono tabular-nums">{<MaskedAmount value={ccOvergangSalaris} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between"><span>Inkomensverlies t.o.v. huidig</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccVerliesFase2} tone="horizon" />}</span></div>
                              <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Fase 3 — Nieuw normaal</p>
                              <div className="flex justify-between"><span>Nieuw netto salaris</span><span className="font-mono tabular-nums">{<MaskedAmount value={ccNieuw} tone="horizon" />}/mnd</span></div>
                              {ccDelta !== 0 && (
                                <div className="flex justify-between"><span>Salarisverschil</span><span className={`font-mono tabular-nums ${ccDelta > 0 ? 'text-positive' : 'text-negative'}`}>{ccDelta > 0 ? '+' : ''}{<MaskedAmount value={ccDelta} tone="horizon" />}/mnd</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-1" />
                              {ccOmscholing > 0 && (
                                <div className="flex justify-between"><span>Omscholingskosten (eenmalig)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccOmscholing} tone="horizon" />}</span></div>
                              )}
                              <div className="flex justify-between font-semibold"><span>Totale kosten overgangsperiode</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccTotaalKosten} tone="horizon" />}</span></div>
                            </div>
                            {ccDelta > 0 && ccTotaalKosten > 0 && (
                              <p className="text-[10px] text-positive mt-1">✓ Na de overgang verdien je {<MaskedAmount value={ccDelta} tone="horizon" />}/mnd meer — terugverdiend in {Math.ceil(ccTotaalKosten / ccDelta)} maanden</p>
                            )}
                            {ccDelta < 0 && (
                              <p className="text-[10px] text-[var(--ink-4)] mt-1">Let op: je nieuwe salaris is {<MaskedAmount value={Math.abs(ccDelta)} tone="horizon" />}/mnd lager dan je huidige inkomen</p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'move' && field.key === 'verschilPermanent' && (() => {
                        const verhuiskosten = Number(formMetadata.verhuiskosten) || 1500
                        const inrichtingskosten = Number(formMetadata.inrichtingskosten) || 3000
                        const dubbeleLastenMaanden = Number(formMetadata.dubbeleLastenMaanden) || 2
                        const dubbeleLastenBedrag = Number(formMetadata.dubbeleLastenBedrag) || 1200
                        const dubbeleLastenTotaal = dubbeleLastenMaanden * dubbeleLastenBedrag
                        const huurverschil = Number(formMetadata.huurverschil) || 0
                        const verschilPermanent = formMetadata.verschilPermanent !== undefined ? Boolean(formMetadata.verschilPermanent) : true
                        const eenmaligTotaal = verhuiskosten + inrichtingskosten + dubbeleLastenTotaal
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht verhuizing</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Eenmalige kosten</p>
                              <div className="flex justify-between"><span>Verhuiskosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={verhuiskosten} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Inrichtingskosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={inrichtingskosten} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Dubbele lasten ({dubbeleLastenMaanden} mnd × {<MaskedAmount value={dubbeleLastenBedrag} tone="horizon" />})</span><span className="font-mono tabular-nums">{<MaskedAmount value={dubbeleLastenTotaal} tone="horizon" />}</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totaal eenmalig</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={eenmaligTotaal} tone="horizon" />}</span></div>
                              {huurverschil !== 0 && (
                                <>
                                  <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Structureel maandlastenverschil</p>
                                  <div className="flex justify-between">
                                    <span>{huurverschil > 0 ? 'Duurder wonen' : 'Goedkoper wonen'}</span>
                                    <span className={`font-mono tabular-nums ${huurverschil > 0 ? 'text-negative' : 'text-positive'}`}>{huurverschil > 0 ? '+' : ''}{<MaskedAmount value={huurverschil} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span>Duur</span>
                                    <span>{verschilPermanent ? 'Permanent (tot FIRE)' : 'Tijdelijk'}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'wedding' && field.key === 'huwelijksvoorwaarden' && (() => {
                        const bruiloftBudget = Number(formAmount) || 20000
                        const huwelijksreis = Number(formMetadata.huwelijksreis) || 0
                        const huwelijksvoorwaarden = Boolean(formMetadata.huwelijksvoorwaarden)
                        const notariskosten = huwelijksvoorwaarden ? 1200 : 0
                        const totaal = bruiloftBudget + huwelijksreis + notariskosten
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht trouwerij</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bruiloftsbudget</span><span className="font-mono tabular-nums">{<MaskedAmount value={bruiloftBudget} tone="horizon" />}</span></div>
                              {huwelijksreis > 0 && (
                                <div className="flex justify-between"><span>Huwelijksreis</span><span className="font-mono tabular-nums">{<MaskedAmount value={huwelijksreis} tone="horizon" />}</span></div>
                              )}
                              {huwelijksvoorwaarden && (
                                <div className="flex justify-between"><span>Notaris huwelijksvoorwaarden</span><span className="font-mono tabular-nums">{<MaskedAmount value={notariskosten} tone="horizon" />}</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totale kosten</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaal} tone="horizon" />}</span></div>
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] mt-1">💍 Na trouwen word je fiscaal partners — <GlossaryTerm term="box_3">Box 3</GlossaryTerm> vermogen en vrijstelling ({formatCurrency(BOX3_PARAMS[CURRENT_TAX_YEAR].heffingsvrijSingle)} p.p.) worden gezamenlijk berekend.</p>
                          </div>
                        )
                      })()}
                      {formType === 'schenking' && field.key === 'eenmaligOfJaarlijks' && (() => {
                        const bedrag = Number(formAmount) || 10000
                        const aantalOntvangers = Math.max(1, Number(formMetadata.aantalOntvangers) || 1)
                        const relatie = String(formMetadata.relatieOntvanger ?? 'kind')
                        const frequentie = String(formMetadata.eenmaligOfJaarlijks ?? 'eenmalig')
                        const bedragPerOntvanger = bedrag / aantalOntvangers
                        const result = berekenSchenkbelasting(bedragPerOntvanger, relatie)
                        const totaleBelasting = result.belasting * aantalOntvangers
                        const totaleVrijstelling = result.vrijstelling * aantalOntvangers
                        const isJaarlijks = frequentie === 'jaarlijks'
                        const jaren = isJaarlijks ? Math.max(1, Number(formMetadata.aantalJaren) || 10) : 1
                        const totaalOverJaren = (bedrag + totaleBelasting) * jaren
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Schenkingsoverzicht</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bedrag per ontvanger</span><span className="font-mono tabular-nums">{<MaskedAmount value={bedragPerOntvanger} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Vrijstelling ({relatie === 'kind' ? 'kind' : 'overig'})</span><span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={result.vrijstelling} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Belastbaar per ontvanger</span><span className="font-mono tabular-nums">{<MaskedAmount value={result.belastbaar} tone="horizon" />}</span></div>
                              {result.belasting > 0 && (
                                <div className="flex justify-between"><span>Schenkbelasting per ontvanger ({relatie === 'kind' ? '10–20%' : relatie === 'kleinkind' ? '18–36%' : '30–40%'})</span><span className="font-mono tabular-nums text-negative">{<MaskedAmount value={result.belasting} tone="horizon" />}</span></div>
                              )}
                              {aantalOntvangers > 1 && (
                                <>
                                  <div className="h-px bg-horizon-200 my-1" />
                                  <div className="flex justify-between"><span>Totale vrijstelling ({aantalOntvangers}×)</span><span className="font-mono tabular-nums text-positive">{<MaskedAmount value={totaleVrijstelling} tone="horizon" />}</span></div>
                                  {totaleBelasting > 0 && (
                                    <div className="flex justify-between"><span>Totale schenkbelasting ({aantalOntvangers}×)</span><span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totaleBelasting} tone="horizon" />}</span></div>
                                  )}
                                </>
                              )}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totale kosten{isJaarlijks ? ` (${jaren} jaar)` : ''}</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalOverJaren} tone="horizon" />}</span>
                              </div>
                            </div>
                            {result.belasting === 0 && (
                              <p className="text-[10px] text-positive">
                                ✓ Volledig binnen de vrijstelling — geen schenkbelasting verschuldigd
                              </p>
                            )}
                            {isJaarlijks && (
                              <p className="text-[10px] text-[var(--ink-4)]">
                                Jaarlijkse schenking verlaagt je <GlossaryTerm term="box_3">Box 3</GlossaryTerm> vermogen en daarmee je belasting
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'world_trip' && field.key === 'woningVerhuren' && (() => {
                        const reisstijl = String(formMetadata.reisstijl ?? 'budget')
                        const preset = WERELDREIS_STIJL_PRESETS[reisstijl]
                        const reisbudgetPP = preset?.bedrag ?? 1200
                        const aantalPersonen = Math.max(1, Number(formMetadata.aantalPersonen) || 1)
                        const personFactor = aantalPersonen === 1 ? 1 : 1 + (aantalPersonen - 1) * 0.6
                        const reisbudget = Math.round(reisbudgetPP * personFactor)
                        const vasteLastenThuis = Boolean(formMetadata.vasteLastenThuis ?? true)
                        const vasteLastenBedrag = vasteLastenThuis ? (Number(formMetadata.vasteLastenBedrag) || 800) : 0
                        const vertrekkosten = Number(formMetadata.vertrekkosten ?? 4000)
                        const inkomensverlies = Math.abs(LIFE_EVENT_CATALOG.world_trip?.defaultMonthlyIncome ?? -3000)
                        const totaalMaandlast = reisbudget + vasteLastenBedrag + inkomensverlies
                        const duur = Number(formDuration) || LIFE_EVENT_CATALOG.world_trip?.defaultDuration || 12
                        const totaalKosten = vertrekkosten + (totaalMaandlast * duur)
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Kostenopbouw wereldreis</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Vertrekkosten (eenmalig)</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={vertrekkosten} tone="horizon" />}</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between">
                                <span>Reisbudget ({preset?.label ?? 'Budget'})</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={reisbudget} tone="horizon" />}/mnd</span>
                              </div>
                              {aantalPersonen > 1 && (
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span className="pl-3">{aantalPersonen} reizigers (factor {personFactor.toFixed(1)}×)</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={reisbudget} tone="horizon" />}</span>
                                </div>
                              )}
                              {vasteLastenThuis ? (
                                <div className="flex justify-between">
                                  <span>Vaste lasten thuis (aanhouden)</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={vasteLastenBedrag} tone="horizon" />}/mnd</span>
                                </div>
                              ) : (
                                <div className="flex justify-between text-positive">
                                  <span>Vaste lasten thuis (opgezegd)</span>
                                  <span className="font-mono tabular-nums">€0/mnd</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span>Inkomensverlies</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={inkomensverlies} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold">
                                <span>Totale maandlast</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totaalMaandlast} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between font-semibold">
                                <span>Geschatte totaalkosten ({duur} mnd)</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totaalKosten} tone="horizon" />}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'renovation' && field.key === 'waardevermeerdering' && (() => {
                        const verbouwType = String(formMetadata.type ?? 'keuken')
                        const preset = VERBOUWING_TYPE_KOSTEN[verbouwType]
                        const kosten = Number(formAmount) || preset?.bedrag || 15000
                        const waardePct = Number(formMetadata.waardevermeerdering ?? preset?.waardePct ?? 50)
                        const waardevermeerdering = Math.round(kosten * waardePct / 100)
                        const nettoImpact = kosten - waardevermeerdering
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto impact verbouwing</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Verbouwingskosten ({preset?.label ?? 'Keuken'})</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={kosten} tone="horizon" />}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Geschatte waardevermeerdering ({waardePct}%)</span>
                                <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={waardevermeerdering} tone="horizon" />}</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold">
                                <span>Netto impact</span>
                                <span className={`font-mono tabular-nums ${nettoImpact > 0 ? 'text-negative' : 'text-positive'}`}>
                                  {nettoImpact > 0 ? '' : '+'}{<MaskedAmount value={Math.abs(nettoImpact)} tone="horizon" />}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] mt-1">
                              Vergeet niet je woningwaarde bij te werken na de verbouwing
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'study' && field.key === 'salarisstijging' && (() => {
                        const studieType = String(formMetadata.studieType ?? 'master')
                        const preset = STUDIE_TYPE_KOSTEN[studieType]
                        const collegegeld = Number(formMetadata.collegegeld ?? preset?.bedrag ?? 5000)
                        const salarisstijging = Number(formMetadata.salarisstijging ?? 300)
                        const studieDuur = Number(formDuration) || preset?.duur || 12
                        const studieDuurJaren = (studieDuur / 12).toFixed(1)
                        const terugverdientijd = salarisstijging > 0 ? Math.ceil(collegegeld / salarisstijging) : 0
                        const terugverdientijdJaren = (terugverdientijd / 12).toFixed(1)
                        // Canoniek dagtarief uit de bundel. Was
                        // `(effectiveInput?.monthlyExpenses ?? 3000) / 30`: de door
                        // lib/format.ts expliciet als FOUT gedocumenteerde /30-conversie
                        // (impliciet jaar van 360 dagen, ~1,4% te laag) bovenop de
                        // effective grondslag én een verzonnen €3.000/mnd-terugval.
                        const dagKosten = canonicalDailyRate
                        const freedomDaysInvestment = dagKosten > 0 ? Math.round(collegegeld / dagKosten) : 0
                        const freedomDaysPerYear = salarisstijging > 0 && dagKosten > 0 ? Math.round((salarisstijging * 12) / dagKosten) : 0
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Rendement studie-investering</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Studiekosten ({preset?.label ?? 'Studie'})</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={collegegeld} tone="horizon" />}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Studieduur</span>
                                <span className="font-mono tabular-nums">{studieDuurJaren} jaar ({studieDuur} mnd)</span>
                              </div>
                              {salarisstijging > 0 && (
                                <>
                                  <div className="h-px bg-horizon-200 my-1" />
                                  <div className="flex justify-between">
                                    <span>Salarisverhoging na afronding</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={salarisstijging} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Terugverdientijd</span>
                                    <span className="font-mono tabular-nums">{terugverdientijdJaren} jaar ({terugverdientijd} mnd)</span>
                                  </div>
                                  {freedomDaysPerYear > 0 && (
                                    <div className="flex justify-between font-semibold">
                                      <span>Extra vrijheidstijd per jaar</span>
                                      <span className="font-mono tabular-nums text-positive">+{freedomDaysPerYear} dagen</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {freedomDaysInvestment > 0 && (
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span>Investering in vrijheidstijd</span>
                                  <span className="font-mono tabular-nums">{freedomDaysInvestment} dagen</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] mt-1">
                              STAP-budget (max €1.000) en scholingsaftrek kunnen de kosten verlagen
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'overlijden_partner' && field.key === 'kostendalingPct' && (() => {
                        // Consume-don't-recompute: exact dezelfde rekenregel als de
                        // som die het event voedt (lib/horizon/risico-event-regels.ts).
                        const maandlasten = effectiveInput?.monthlyExpenses ?? 0
                        const impact = berekenOverlijdenPartnerImpact(formMetadata, {
                          maandlastenHuishouden: maandlasten,
                        })
                        const partnerInkomen = impact.partnerInkomen
                        const nabestaanden = impact.nabestaandenpensioen
                        const anwNetto = impact.anwNetto
                        const verzekering = impact.levensverzekering
                        const kostendalingPct = impact.kostendalingPct
                        const kostendaling = impact.kostendaling
                        const nettoMaandImpact = impact.nettoMaandImpact
                        return (
                          <div className="mt-2 space-y-3">
                            {/* Reference: current shared monthly costs */}
                            {maandlasten > 0 && (
                              <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Huidige gedeelde maandlasten</p>
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span>Totale maanduitgaven huishouden</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={maandlasten} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span>Verwachte daling ({kostendalingPct}%)</span>
                                  <span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={kostendaling} tone="horizon" />}/mnd</span>
                                </div>
                              </div>
                            )}
                            {/* Netto impact breakdown */}
                            <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto maandelijkse impact</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Wegvallend partnerinkomen</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={partnerInkomen} tone="horizon" />}/mnd</span>
                                </div>
                                {nabestaanden > 0 && (
                                  <div className="flex justify-between">
                                    <span>Nabestaandenpensioen</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={nabestaanden} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {anwNetto > 0 && (
                                  <div className="flex justify-between">
                                    <span>Anw-uitkering (netto)</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={anwNetto} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {kostendaling > 0 && (
                                  <div className="flex justify-between">
                                    <span>Kostendaling ({kostendalingPct}%)</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={kostendaling} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Netto impact per maand</span>
                                  <span className={`font-mono tabular-nums ${nettoMaandImpact < 0 ? 'text-negative' : 'text-positive'}`}>
                                    {nettoMaandImpact < 0 ? '-' : '+'}{<MaskedAmount value={Math.abs(nettoMaandImpact)} tone="horizon" />}/mnd
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Levensverzekering one-time */}
                            {verzekering > 0 && (
                              <div className="border border-positive/30 bg-positive-bg p-3">
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span className="font-semibold">Eenmalige uitkering levensverzekering</span>
                                  <span className="font-mono tabular-nums text-positive font-semibold">+{<MaskedAmount value={verzekering} tone="horizon" />}</span>
                                </div>
                              </div>
                            )}
                            {/* ORV tip */}
                            {nettoMaandImpact < -500 && (
                              <div className="flex gap-2 border border-amber-200 bg-amber-50/50 p-3">
                                <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <p className="text-xs text-amber-800">
                                  Het inkomensverlies is aanzienlijk ({<MaskedAmount value={Math.abs(nettoMaandImpact)} tone="horizon" />}/mnd). Overweeg een overlijdensrisicoverzekering (ORV) als buffer. Een ORV van {<MaskedAmount value={Math.abs(nettoMaandImpact) * 120} tone="horizon" />} dekt 10 jaar inkomensverlies.
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'side_hustle' && field.key === 'doorlopend' && (() => {
                        const brutoOmzet = Number(formMetadata.brutoOmzet ?? 1500)
                        const kosten = Number(formMetadata.kostenPerMaand ?? 300)
                        const opstartkosten = Number(formMetadata.opstartkosten ?? 1000)
                        const opbouwMaanden = Number(formMetadata.opbouwperiode ?? 0)
                        const opbouwPct = Number(formMetadata.opbouwOmzetPct ?? 30)
                        const nettoPM = Math.max(0, brutoOmzet - kosten)
                        const jaarResultaat = nettoPM * 12
                        // Marginaal tarief (fractie) per belastingjaar uit BOX1_PARAMS
                        // via de canonieke vuistregel — vervangt de losse 2024-hardcode
                        // 49,5/37,07 (37,07 was bovendien een typefout voor 36,97).
                        const marginaalTarief = deriveMarginaalTarief({ netMonthlyIncome: nettoPM })
                        const geschatteBelasting = Math.round(nettoPM * marginaalTarief)
                        const nettoNaBelasting = nettoPM - geschatteBelasting
                        const opbouwNetto = opbouwMaanden > 0 ? Math.max(0, Math.round(brutoOmzet * opbouwPct / 100) - kosten) : 0
                        return (
                          <div className="mt-2 space-y-3">
                            <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto berekening bijverdienste</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Bruto omzet per maand</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={brutoOmzet} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Kosten per maand</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={kosten} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Netto verdienste per maand</span>
                                  <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={nettoPM} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span className="pl-3">Geschat jaarresultaat</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={jaarResultaat} tone="horizon" />}/jaar</span>
                                </div>
                                {opstartkosten > 0 && (
                                  <div className="flex justify-between">
                                    <span>Eenmalige opstartkosten</span>
                                    <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={opstartkosten} tone="horizon" />}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 border border-amber-200 bg-amber-50/50 p-3">
                              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                              <div className="text-xs text-amber-800 space-y-1">
                                <p className="font-semibold">Let op: extra inkomen wordt belast tegen je marginale tarief ({marginaalTarief}%)</p>
                                <p>Na belasting blijft ca. {<MaskedAmount value={nettoNaBelasting} tone="horizon" />}/mnd over van je netto verdienste van {<MaskedAmount value={nettoPM} tone="horizon" />}/mnd.</p>
                                {jaarResultaat > 7500 && (
                                  <p>Boven &#8364;7.500/jaar resultaat geldt Box 1-heffing. Zelfstandigenaftrek 2026: ca. &#8364;2.470.</p>
                                )}
                              </div>
                            </div>
                            {opbouwMaanden > 0 && (
                              <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Opbouwperiode ({opbouwMaanden} maanden)</p>
                                <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                  <div className="flex justify-between">
                                    <span>Omzet tijdens opbouw ({opbouwPct}%)</span>
                                    <span className="font-mono tabular-nums">{<MaskedAmount value={Math.round(brutoOmzet * opbouwPct / 100)} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Netto tijdens opbouw</span>
                                    <span className={`font-mono tabular-nums ${opbouwNetto > 0 ? 'text-positive' : 'text-negative'}`}>
                                      {opbouwNetto > 0 ? '+' : ''}{<MaskedAmount value={opbouwNetto} tone="horizon" />}/mnd
                                    </span>
                                  </div>
                                  {opbouwNetto <= 0 && (
                                    <p className="text-[10px] text-amber-600 mt-1">
                                      Tijdens de opbouw zijn de kosten hoger dan de omzet. Zorg voor een buffer.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'scheiding' && field.key === 'vermogensBehoudPct' && (() => {
                        const behoudPct = Number(formMetadata.vermogensBehoudPct ?? 50)
                        const vermogensverlies = Math.round(effectiveNetWorth * (1 - behoudPct / 100))
                        const advocaat = Number(formMetadata.advocaatKosten ?? 7500)
                        return (
                          <div className="mt-2 border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Geschat vermogensverlies</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Huidig netto vermogen</span><span className="font-mono tabular-nums">{<MaskedAmount value={effectiveNetWorth} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Je behoudt {behoudPct}%</span><span className="font-mono tabular-nums">{<MaskedAmount value={Math.round(effectiveNetWorth * behoudPct / 100)} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Vermogensverlies</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={vermogensverlies} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Advocaat/mediation</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={advocaat} tone="horizon" />}</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totale eenmalige klap</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={vermogensverlies + advocaat} tone="horizon" />}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    )
                  })}
                </div>

                {/* Vergelijking met voorgestelde waarden */}
                {(() => {
                  const suggested = computeSuggestedValues(formType)
                  const suggestedAmt = suggested.amount
                  const currentAmt = typeof formAmount === 'number' ? formAmount : 0
                  const amtDiff = suggestedAmt !== currentAmt
                  const ageDiff = suggested.age !== formAge
                  const dirDiff = suggested.direction !== formDirection
                  const durTypeDiff = suggested.durationType !== formDurationType
                  if (!amtDiff && !ageDiff && !dirDiff && !durTypeDiff) return null
                  const durLabel = (dt: string, dur: number | '') =>
                    dt === 'one_time' ? 'Eenmalig' : dt === 'continuous' ? 'Continu' : `${dur} mnd`
                  return (
                    <div className="rounded-[var(--r)] border border-horizon-200 bg-[var(--subtle)] p-3 space-y-1.5">
                      <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Vergelijking</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-[var(--ink-3)]">
                          <span>Voorgesteld</span>
                          <span className="font-mono tabular-nums">
                            {suggested.age !== '' ? `${suggested.age} jaar, ` : ''}{<MaskedAmount value={suggestedAmt} tone="horizon" />}{suggested.durationType !== 'one_time' ? '/mnd' : ''} · {durLabel(suggested.durationType, suggested.duration)}
                          </span>
                        </div>
                        <div className="flex justify-between font-medium text-[var(--ink)]">
                          <span>Jouw keuze</span>
                          <span className="font-mono tabular-nums">
                            {formAge !== '' ? `${formAge} jaar, ` : ''}{<MaskedAmount value={currentAmt} tone="horizon" />}{formDurationType !== 'one_time' ? '/mnd' : ''} · {durLabel(formDurationType, formDuration)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </>)}
            </div>
            )}

            {/* ── SECTIE: Scheiding huishouden-impact ── */}
            {formType === 'scheiding' && isHouseholdView && (() => {
              const behoudPct = Number(formMetadata.vermogensBehoudPct ?? 50)
              const partnerPct = 100 - behoudPct
              const totalAssets = effectiveInput?.totalAssets ?? 0
              const totalDebts = effectiveInput?.totalDebts ?? 0
              const combinedNetWorth = totalAssets - totalDebts
              const myShare = Math.round(combinedNetWorth * behoudPct / 100)
              const partnerShare = Math.round(combinedNetWorth * partnerPct / 100)
              const myDebts = Math.round(totalDebts * behoudPct / 100)
              const partnerDebts = Math.round(totalDebts * partnerPct / 100)
              return (
                <div className="space-y-3">
                  <div className="border border-horizon-200 bg-horizon-50/50 p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
                      Huishouden — vermogensverdeling
                    </p>
                    <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                      <div className="flex justify-between">
                        <span>Gezamenlijk netto vermogen</span>
                        <span className="font-mono tabular-nums">{<MaskedAmount value={combinedNetWorth} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gezamenlijke schulden</span>
                        <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totalDebts} tone="horizon" />}</span>
                      </div>
                      <div className="h-px bg-horizon-200 my-1" />
                      <div className="flex justify-between font-semibold">
                        <span>Jouw deel ({behoudPct}%)</span>
                        <span className="font-mono tabular-nums">{<MaskedAmount value={myShare} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between text-[var(--ink-3)]">
                        <span className="pl-3">— waarvan schulden</span>
                        <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={myDebts} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>{partnerName || 'Partner'} ({partnerPct}%)</span>
                        <span className="font-mono tabular-nums">{<MaskedAmount value={partnerShare} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between text-[var(--ink-3)]">
                        <span className="pl-3">— waarvan schulden</span>
                        <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={partnerDebts} tone="horizon" />}</span>
                      </div>
                    </div>
                    {/* Per-partner FIRE age estimate */}
                    {fire && (() => {
                      // tweede-motor: exempt — GEEN kernantwoord. Dit is de losse
                      // scheidings-schatting in de what-if: hij vergelijkt een
                      // ruwe vóór/ná op één en dezelfde scalar-basis. Het getal
                      // wordt nergens naast het hero-antwoord getoond. Zie C1.
                      const currentFireAge = fire.fireAge
                      // Rough estimate: after scheiding, net worth drops by (1-behoudPct/100), monthly costs change
                      const alimentatiePartner = Number(formMetadata.partneralimentatieBedrag) || 0
                      const extraWoon = Number(formMetadata.extraWoonlasten) || 0
                      const richting = formMetadata.partneralimentatieRichting ?? 'betalen'
                      const monthlyImpact = richting === 'betalen'
                        ? -(alimentatiePartner + extraWoon)
                        : (alimentatiePartner - extraWoon)
                      // Simple estimate: extra monthly cost delays FIRE by ~months
                      const monthlySavings = effectiveInput?.monthlyIncome && effectiveInput?.monthlyExpenses
                        ? effectiveInput.monthlyIncome - effectiveInput.monthlyExpenses
                        : 0
                      const adjustedSavings = Math.max(0, monthlySavings + monthlyImpact)
                      const delayYears = monthlySavings > 0 && adjustedSavings > 0
                        ? (myShare > 0 ? 0 : 0) // Net worth loss impact is in the one-time cost
                        : 0
                      return currentFireAge != null ? (
                        <div className="mt-2 pt-2 border-t border-horizon-200 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
                            Geschatte FIRE-impact
                          </p>
                          <div className="flex justify-between text-xs">
                            <span>Jouw FIRE-leeftijd nu</span>
                            <span className="font-mono tabular-nums">{formatFireAge(currentFireAge)}</span>
                          </div>
                          {monthlySavings > 0 && (
                            <div className="flex justify-between text-xs">
                              <span>Maandelijkse spaarkracht na scheiding</span>
                              <span className={`font-mono tabular-nums ${adjustedSavings < monthlySavings ? 'text-negative' : ''}`}>
                                {<MaskedAmount value={adjustedSavings} tone="horizon" />}/mnd
                              </span>
                            </div>
                          )}
                          <p className="text-[10px] text-[var(--ink-4)] italic mt-1">
                            De exacte impact op je FIRE-leeftijd wordt berekend na opslaan via de simulatie.
                          </p>
                        </div>
                      ) : null
                    })()}
                  </div>
                  {/* Tip about shared items */}
                  <div className="flex gap-2 border border-amber-200 bg-amber-50/50 p-3">
                    <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Bij scheiding worden gedeelde items persoonlijk. Pas daarna je profiel aan: verwijder gedeelde rekeningen, pas schulden aan, en update je vermogen naar je individuele deel.
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Divider */}
            <div className="h-px bg-[var(--border-ed)]" />

            {/* ── SECTIE: Extra financiële impacts ── */}
            <div className="space-y-3">
              {formCashflows.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const newCf: UserDefinedCashflow = {
                      id: crypto.randomUUID(),
                      name: '',
                      type: 'recurring',
                      direction: 'expense',
                      amount: 0,
                      durationMonths: 0,
                      indexed: true,
                    }
                    setFormCashflows(prev => [...prev, newCf])
                    setEditingCashflowId(newCf.id)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-dashed border-[var(--border-md)] py-2.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-horizon-300 hover:text-horizon-600"
                >
                  + Extra impact toevoegen
                </button>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Extra impacts</p>
                  <button
                    type="button"
                    onClick={() => {
                      const newCf: UserDefinedCashflow = {
                        id: crypto.randomUUID(),
                        name: '',
                        type: 'recurring',
                        direction: 'expense',
                        amount: 0,
                        durationMonths: 0,
                        indexed: true,
                      }
                      setFormCashflows(prev => [...prev, newCf])
                      setEditingCashflowId(newCf.id)
                    }}
                    className="text-xs font-medium text-horizon-600 hover:text-horizon-800"
                  >
                    + Toevoegen
                  </button>
                </div>
              )}

              {formCashflows.map((cf) => (
                <div key={cf.id} className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
                  {editingCashflowId === cf.id ? (
                    /* Expanded edit form */
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Naam</label>
                        <input
                          type="text"
                          value={cf.name}
                          onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, name: e.target.value } : c))}
                          className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-horizon-500 focus:outline-none"
                          placeholder="Bv. Hypotheeklasten"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Type</label>
                          <select
                            value={cf.type}
                            onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, type: e.target.value as 'one_time' | 'recurring' } : c))}
                            className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]"
                          >
                            <option value="recurring">Maandelijks</option>
                            <option value="one_time">Eenmalig</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Richting</label>
                          <div className="mt-1 flex rounded-[var(--r)] border border-[var(--border-ed)] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, direction: 'income' } : c))}
                              className={`flex-1 py-2 text-xs font-medium transition ${cf.direction === 'income' ? 'bg-positive-bg text-positive' : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]'}`}
                            >
                              Inkomen
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, direction: 'expense' } : c))}
                              className={`flex-1 py-2 text-xs font-medium transition ${cf.direction === 'expense' ? 'bg-negative-bg text-negative' : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]'}`}
                            >
                              Kosten
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Bedrag</label>
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-sm text-[var(--ink-3)]">&euro;</span>
                            <input
                              type="number"
                              min="0"
                              value={cf.amount || ''}
                              onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, amount: Math.max(0, Number(e.target.value) || 0) } : c))}
                              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-horizon-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Duur (maanden)</label>
                          <input
                            type="number"
                            min="0"
                            value={cf.durationMonths || ''}
                            onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, durationMonths: Math.max(0, Number(e.target.value) || 0) } : c))}
                            className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-horizon-500 focus:outline-none"
                            placeholder="0 = eenmalig"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                          <input
                            type="checkbox"
                            checked={cf.indexed}
                            onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, indexed: e.target.checked } : c))}
                            className="border-[var(--border-ed)]"
                          />
                          Geïndexeerd
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditingCashflowId(null)}
                          className="rounded-[var(--r)] bg-horizon-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-horizon-700"
                        >
                          Klaar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Collapsed row */
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--ink)]">{cf.name || 'Naamloze geldstroom'}</p>
                        <p className="text-xs text-[var(--ink-3)]">
                          {cf.direction === 'income' ? 'Inkomen' : 'Kosten'}
                          {' · '}
                          <span className={`font-mono tabular-nums ${cf.direction === 'income' ? 'text-positive' : 'text-negative'}`}>
                            {cf.direction === 'income' ? '+' : '-'}{<MaskedAmount value={cf.amount} tone="horizon" />}
                            {cf.type === 'recurring' ? '/mnd' : ''}
                          </span>
                          {cf.durationMonths > 0 ? ` · ${cf.durationMonths} mnd` : ''}
                          {cf.indexed ? ' · ↑' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingCashflowId(cf.id)}
                          className="p-1 text-[var(--ink-4)] hover:text-[var(--ink-2)]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormCashflows(prev => prev.filter(c => c.id !== cf.id))}
                          className="p-1 text-[var(--ink-4)] hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Netto summary */}
              {formCashflows.length > 0 && (() => {
                const netRecurring = formCashflows
                  .filter(cf => cf.type === 'recurring')
                  .reduce((s, cf) => s + (cf.direction === 'income' ? cf.amount : -cf.amount), 0)
                const netOneTime = formCashflows
                  .filter(cf => cf.type === 'one_time')
                  .reduce((s, cf) => s + (cf.direction === 'income' ? cf.amount : -cf.amount), 0)
                const dailyExpCf = canonicalDailyRate
                const totalNetImpact = Math.abs(netRecurring * 12 * 10 + netOneTime) // 10yr estimate
                const freedomBdCf = dailyExpCf > 0 && totalNetImpact >= 100
                  ? calculateFreedomTime(totalNetImpact, dailyExpCf)
                  : null
                const freedomStrCf = freedomBdCf ? formatFreedomTimeString(freedomBdCf, 'short') : null
                return (
                  <div className="rounded-[var(--r)] border-t border-[var(--border-ed)] pt-2 text-xs text-[var(--ink-2)]">
                    {netRecurring !== 0 && (
                      <p>Netto: <span className={`font-mono tabular-nums font-semibold ${netRecurring >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {netRecurring >= 0 ? '+' : ''}{<MaskedAmount value={netRecurring} tone="horizon" />}/mnd
                      </span></p>
                    )}
                    {netOneTime !== 0 && (
                      <p>Eenmalig: <span className={`font-mono tabular-nums font-semibold ${netOneTime >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {netOneTime >= 0 ? '+' : ''}{<MaskedAmount value={netOneTime} tone="horizon" />}
                      </span></p>
                    )}
                    {freedomStrCf && (
                      <p className="mt-1 text-[var(--ink-3)]">≈ {freedomStrCf} vrijheidstijd</p>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--border-ed)]" />

            {/* ── SECTIE: Financiele impact ── */}
            <div className="space-y-3">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Financiele impact</p>

              {amt > 0 && (
                <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Eenmalige kosten */}
                    {isOneTime && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Eenmalig</p>
                        <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-negative' : 'text-positive'}`}>
                          {isExpense ? '-' : '+'}{<MaskedAmount value={amt} tone="horizon" />}
                        </p>
                      </div>
                    )}

                    {/* Maandelijkse impact */}
                    {!isOneTime && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Per maand</p>
                        <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-negative' : 'text-positive'}`}>
                          {isExpense ? '-' : '+'}{<MaskedAmount value={amt} tone="horizon" />}/mnd
                        </p>
                      </div>
                    )}

                    {/* Totale impact */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                        {isOneTime ? 'Totaal' : isPeriod && dur > 0 ? `Totaal (${dur} mnd)` : 'Totaal (10 jaar)'}
                      </p>
                      <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-negative' : 'text-positive'}`}>
                        {isExpense ? '-' : '+'}{<MaskedAmount value={Math.abs(totalImpact)} tone="horizon" />}
                      </p>
                    </div>
                  </div>

                  {/* Freedom time equivalent */}
                  {freedomStr && (
                    <div className="border-t border-[var(--border-ed)] pt-3 flex items-center gap-2">
                      <Hourglass className="h-3.5 w-3.5 text-horizon-500 shrink-0" />
                      <p className="text-xs text-[var(--ink-2)]">
                        {isExpense
                          ? <><span className="font-medium text-negative">{freedomStr}</span> aan vrijheid die dit kost</>
                          : <><span className="font-medium text-positive">{freedomStr}</span> aan vrijheid die dit oplevert</>
                        }
                      </p>
                    </div>
                  )}

                  {/* Continuous disclaimer */}
                  {formDurationType === 'continuous' && (
                    <p className="text-[10px] text-[var(--ink-4)]">* Schatting op basis van 10 jaar</p>
                  )}
                </div>
              )}

              {amt === 0 && (
                <p className="text-xs text-[var(--ink-4)] italic">Vul een bedrag in om de impact te berekenen</p>
              )}
            </div>

            {/* Validation errors */}
            {formErrors.length > 0 && (
              <div className="rounded-[var(--r)] border border-red-200 bg-red-50 p-3 space-y-1">
                {formErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{err}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Validation warnings (advisory — don't block save) */}
            {formWarnings.length > 0 && formErrors.length === 0 && (
              <div className="rounded-[var(--r)] border border-amber-200 bg-amber-50 p-3 space-y-1">
                {formWarnings.map((warn, i) => (
                  <p key={i} className="text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{warn}</span>
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={saveEvent}
              className="w-full rounded-[var(--r)] bg-horizon-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-horizon-700 disabled:opacity-50"
            >
              {editingEvent ? 'Opslaan' : 'Toevoegen'}
            </button>
          </div>
        </BottomSheet>
        )
      })()}

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
          expectedReturn={fireParams.grossReturn}
          inflationRate={fireParams.inflationRate}
          rows={unifiedRows ?? []}
          assets={initialData.assets}
          debts={debts}
          events={displayEvents}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          monthlyIncome={effectiveInput?.monthlyIncome}
          savingsRate6m={healthScoreInput.savingsRate6m}
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
          nabestaandenPensioen={nabestaandenPensioenBedrag}
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
                {isNuStoppenMode
                  ? 'Runway uit de simulatie-engine — stoppen op vandaag'
                  : isPensioenMode ? 'AOW-leeftijd op basis van geboortedatum' : simResult?.fireAgeFractional != null ? 'Simulatie-engine berekening' : 'Statische projectie'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isNuStoppenMode
                ? 'De leeftijd tot waar je vermogen je uitgaven dekt als je vandaag stopt met werken.'
                : isPensioenMode
                  ? 'Je AOW-leeftijd bepaalt wanneer je staatspensioen ingaat. De simulatie berekent je vermogen op dat moment.'
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
              {isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">AOW-leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{aowAgeFormatted}</span>
                </div>
              )}
              {/* Beide zijn puntbedragen op de AOW-leeftijd (klasse S resp. F) en
                  moeten hetzelfde tonen als de KPI hierboven — anders spreekt de
                  onderbouwing de kaart tegen. */}
              {isPensioenMode && viewPortfolioAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Vermogen op AOW</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(viewPortfolioAtAow)} tone="horizon" />}</span>
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
            {!isPensioenMode && !isNuStoppenMode && range && range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null && (
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
              <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> {isNuStoppenMode
                ? 'Onttrekking start op maand 0. Het bereik is de eerste maand waarin je liquide vermogen aanhoudend op nul staat — omgerekend naar een leeftijd.'
                : isPensioenMode
                  ? 'AOW-leeftijd is wettelijk bepaald op basis van je geboortedatum. Vermogen op AOW = simulatie-projectie op die leeftijd.'
                  : 'Portfolio groeit met rendement + jaarlijkse besparing. FIRE is bereikt wanneer portfolio ≥ doelbedrag.'}</p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">{isNuStoppenMode ? 'Nu-stoppen-modus — gerekend vanaf vandaag' : isPensioenMode ? 'Pensioen-modus — gebaseerd op AOW-leeftijd' : 'Berekend op basis van huidig vermogen, spaargedrag en verwacht rendement'}</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showCountdownReceipt} onClose={() => setShowCountdownReceipt(false)} title={isNuStoppenMode ? 'Je stopt vandaag' : isPensioenMode ? 'Aftellen naar pensioen' : 'Aftellen naar vrijheid'}>
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{isPensioenMode ? 'AFTELLEN NAAR PENSIOEN' : 'AFTELLEN NAAR VRIJHEID'}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">{isPensioenMode ? 'resterende tijd tot AOW-leeftijd' : 'resterende tijd tot volledige vrijheid'}</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isPensioenMode
                ? 'Het aantal dagen tot je AOW-leeftijd, het moment waarop je staatspensioen ingaat.'
                : 'Het aantal dagen tot je verwachte moment van volledige financiële vrijheid.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              {currentAge != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Huidige leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{currentAge} jaar</span>
                </div>
              )}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">{isPensioenMode ? 'Pensioenleeftijd' : 'Vrijheidsleeftijd'}</span>
                <span className="tabular-nums text-[var(--ink)]">{heroFireAgeReceiptText}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">{isPensioenMode ? 'Jaren tot pensioen' : 'Jaren tot vrijheid'}</span>
                <span className="tabular-nums text-[var(--ink)]">
                  {`${effectiveCountdown.countdownYears} jaar en ${effectiveCountdown.countdownMonths} maanden`}
                </span>
              </div>
              {effectiveCountdown.fireDate && effectiveCountdown.countdownDays > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Verwachte datum</span>
                  <span className="tabular-nums capitalize text-[var(--ink)]">{effectiveCountdown.fireDate}</span>
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Nog</span>
              <span className="tabular-nums text-[var(--ink)]">
                {effectiveCountdown.countdownDays > 0 ? `${effectiveCountdown.countdownDays.toLocaleString('nl-NL')} dagen` : '0 dagen'}
              </span>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">{isPensioenMode ? 'Berekend vanuit je geboortedatum en AOW-leeftijd' : 'Berekend vanuit je geboortedatum en verwachte vrijheidsleeftijd'}</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showFireTargetReceipt} onClose={() => setShowFireTargetReceipt(false)} title={isNuStoppenMode ? 'Geen doelbedrag' : isPensioenMode ? 'Verwacht vermogen op AOW' : 'FIRE Doelbedrag'}>
        <div className="p-5">
          <KassabonShell>
            {/* M6: dezelfde vangrail als op de KPI-tegel — de bon mag nooit een
                bedrag onderbouwen dat de tegel als "we missen gegevens" toont. */}
            {showFireTargetNotice && (
              <div className="mb-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5 font-sans text-[11px] leading-relaxed text-[var(--ink-2)]">
                <strong className="font-semibold text-[var(--ink)]">{isNuStoppenMode ? 'Geen doelbedrag' : HORIZON_MISSENDE_GEGEVENS_LABEL}.</strong>{' '}
                {fireTargetGuard.hint}
              </div>
            )}
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{isNuStoppenMode ? 'GEEN DOELBEDRAG' : isPensioenMode ? 'VERWACHT VERMOGEN OP AOW' : 'FIRE DOELBEDRAG'}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {isPensioenMode
                  ? 'Geprojecteerd vermogen op AOW-leeftijd'
                  : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : `Klassieke FIRE-berekening (${(fireSwr * 100).toFixed(2)}% SWR)`}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isPensioenMode
                ? 'Het verwachte vermogen op het moment dat je AOW ingaat, op basis van je huidige situatie en spaargedrag.'
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
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Opnamerate (SWR)</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
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
              <span className="text-[var(--ink)]">{isPensioenMode ? 'Verwacht vermogen' : 'Benodigd'}</span>
              <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={isPensioenMode ? (viewPortfolioAtAow ?? 0) : viewEffectiveFireTarget} tone="horizon" />}</span>
            </div>

            <div className="mt-3 flex justify-center">
              {/* De vrijheidstijd volgt automatisch het (eventueel gedeflateerde)
                  bedrag — het dagtarief zelf blijft een grootheid van vandaag (D15). */}
              <FreedomTimeBadge amount={isPensioenMode ? (viewPortfolioAtAow ?? 0) : viewEffectiveFireTarget} />
            </div>

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p>
                <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                {isPensioenMode
                  ? 'Vermogensprojectie op AOW-leeftijd via simulatie-engine (incl. Box 3, inflatie en levensgebeurtenissen)'
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
              {isPensioenMode ? 'Pensioen-modus — geprojecteerd op AOW-leeftijd' : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : fireStrategy?.strategy === 'deplete' ? 'Deplete strategie — PV-annuïteitsformule' : fireStrategy?.strategy === 'legacy' ? 'Legacy strategie — erfenis-gebaseerd doelbedrag' : 'Klassieke FIRE-berekening'}
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
                : 'Ingesteld via Identiteit → Instellingen'}
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
        onClose={() => { setActiveModal(null); setStrategieInitialTab(null); loadData(); router.refresh() }}
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

