'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { GoalMarkerInput } from '@/lib/horizon/goal-chart-markers'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { SectionLabel } from '@/components/editorial'
import { isHeroAnswerInvalid } from '@/lib/horizon/hero-fire-age'
import { fireDoelPaarInLeesvolgorde, FIRE_DOEL_ONDERSCHRIFT } from '@/lib/horizon/fire-doel-weergave'
import {
  ANKER_KPI_LABEL,
  ANKER_KPI_LABEL_KORT,
  ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT,
  ankerKpiCaption,
  haalbaarBijUitgaveRegel,
} from '@/lib/horizon/anker-copy'
import { guardFreedomMoment, guardRetirementExpense } from '@/lib/horizon/outcome-guard'
import { resolveFreedomFraming, isAtOrPastAow, stopAnchorFromKernel } from '@/lib/fire-strategy'
import type { OverlayBalloonDef } from '@/components/app/horizon/toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from '@/components/app/horizon/toekomst-overlay-balloons'
import type { OverlayEmphasis } from '@/components/toekomst/state/types'
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
import { ToekomstStateProvider, useToekomstBron, useToekomstPerspectiefContext, useToekomstOverlayContext, useToekomstScenarioContext, useToekomstSimContext, useToekomstMeldingenContext, useToekomstLagenContext, useToekomstEuroContext } from '@/components/toekomst/state/toekomst-state-provider'

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
 * De compositie van /toekomst (ADR 0179 fase 1 stap 13–14): leest de gedeelde state per
 * concern uit `ToekomstStateProvider` (euro-bedragen alleen als `view*`-feeds uit de
 * euro-context) en rendert de blokken. Lokaal blijft alleen UI-state die één blok leest:
 * de kassabons en verloopgrafieken van Plan, de IE-uitklap en de ballon-nadruk van het
 * canvas. Stap 15 verdeelt deze compositie over layout, canvas en katern-panelen.
 */
function HorizonCompositie() {
  const { initialData } = useToekomstBron()
  const {
    partnerName,
    refreshData,
    isHouseholdView,
    isPartnerView,
    householdHero,
    partnerHero,
    householdInput,
    householdMainLine,
    partnerLine,
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
    scenarioReturnDeltas,
    setScenarioReturnDeltas,
    showScenarioLine,
    setShowScenarioLine,
    knopWeergave,
    setKnopWeergave,
    doelBlok,
    doelSheetOpen,
    setDoelSheetOpen,
    doelSaving,
    doelLoslatenOpen,
    setDoelLoslatenOpen,
    stopPlanConfirmOpen,
    setStopPlanConfirmOpen,
    stopPlanSaving,
    stopPlanError,
    setStopPlanError,
    firstDragHintVisible,
    dismissFirstDragHint,
    hasScenario,
    hasStopKeuze,
    doelActief,
    doelLijnLabel,
    whatIfBaseline,
    scenarioVerwachtFireAge,
    coverageNodes,
    duidingStopAge,
    labPromotie,
    doelVastleggenMogelijk,
    doelBijwerkenMogelijk,
    radarAssen,
    hasDoelLijn,
    categorieReturnGroups,
    effectiveStopAge,
    planEindVorm,
    labGrenzenPending,
    labZone,
    planIsDezeStop,
    handleScenarioReset,
    labOpslaanToestand,
    handleDoelVastleggen,
    handleDoelLoslaten,
    handleStopPlanBevestigen,
    handleDoelHerstellen,
    scenarioFireDeltaLabel,
    labKnoppen,
    nalatenschapMarker,
    labFormatters,
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
    simResult,
    simCashflows,
    simError,
    unifiedRows,
    kernelStatus,
    kernelMaandHint,
    kernelHousingSale,
    aowOntbreekt,
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
    showDualFireTarget,
    showLiquidWealthLine,
    fireTargetGuard,
    showFireTargetNotice,
    planningMode,
    aowAgeFormatted,
    heroFireAge,
    heroFireAgePending,
    heroFireAgeText,
    heroFireAgeTextMobile,
    heroFireAgeReceiptText,
    overgangData,
    onttrekkingData,
    displayUnifiedRows,
    chartEndAge,
    liquidWealthPoints,
    displaySimRows,
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
  const {
    scenariosExpanded,
    setScenariosExpanded,
    scenarioData,
    mcExpanded,
    setMcExpanded,
    mcData,
    mcPending,
    mcFailed,
    ieViewMode,
    setIeViewMode,
    chartMode,
    setChartMode,
    lifelineAge,
    setLifelineAge,
    isPlaying,
    setIsPlaying,
    showNaturalMilestones,
    showLifeEvents,
    showGoals,
    showLiquidLine,
    overlayPrefRestored,
    persistOverlayVisible,
    handleOverlayExit,
    persistNaturalMilestones,
    persistLifeEvents,
    persistGoals,
    persistLiquidLine,
    overlayVisible,
    naturalMilestones,
    eventsForTimeline,
    goalChartMarkers,
    chartEventOverlay,
    handleChartEventClick,
    handleChartClusterOpen,
    handleChartEventDragMove,
    handleChartEventDragEnd,
    dualBasisAvailable,
    effectiveChartPrimaryBasis,
    secondaryLineVisible,
    mcMarge,
    monteCarloOverlay,
    handleEventDragEnd,
  } = useToekomstLagenContext()
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
    viewDoelPreviews,
    viewReadoutData,
    viewIeBreakdownResult,
    viewScenarioPresets,
    viewHouseholdHeroFireTarget,
    viewPartnerHeroFireTarget,
  } = useToekomstEuroContext()
  const { masked } = useMaskedAmounts()
  const router = useRouter()

  const [healthChartOpen, setHealthChartOpen] = useState(false)
  const [fireAgeChartOpen, setFireAgeChartOpen] = useState(false)
  const [incomeExpenseExpanded, setIncomeExpenseExpanded] = useState(false)
  const [showFireAgeReceipt, setShowFireAgeReceipt] = useState(false)
  const [showFireTargetReceipt, setShowFireTargetReceipt] = useState(false)
  const [showResilienceReceipt, setShowResilienceReceipt] = useState(false)
  const [showSwrReceipt, setShowSwrReceipt] = useState(false)
  // overlayEmphasis: welke grafiekfase een gehoverde/gefocuste ballon accentueert.
  const [overlayEmphasis, setOverlayEmphasis] = useState<OverlayEmphasis>(null)

  // De foutstaat-guard staat bewust ONDER alle hooks (de render-grens woont sinds stap
  // 12–14 in de provider): alle hooks van
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

