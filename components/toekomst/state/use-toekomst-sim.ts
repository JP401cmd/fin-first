'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 13).
//
// Sim en kernel: de projectie-invoer uit de server-bundel (`useHorizonBron`), de kernel-runs
// (`useHorizonFireSim`), het plan-anker, fire/range/healthScore (E7), de preset-batch (E12)
// met de duiding-grendel, en de nominale Plan-/hero-afleidingen.
//
// Pure move: de statements staan in dezelfde onderlinge volgorde als in horizon-client,
// met dezelfde dependency-arrays. De provider (`toekomst-state-provider.tsx`) roept deze
// hook aan en deelt het resultaat per concern via een eigen context.

import { useEffect, useState, useCallback, useMemo, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { useHorizonFireSim, type HorizonHoofdrun } from '@/lib/hooks/use-horizon-fire-sim'
import { useHorizonBron } from '@/lib/hooks/use-horizon-bron'
import {
  computeFireProjection,
  computeFireRange,
  ageAtDate,
  deriveCountdown,
  type FinancialInput,
  type FireProjection,
  type FireRange,
  type LifeEvent,
} from '@/lib/horizon-data'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import {
  computeEffectiveExpenses,
  computeFireTarget,
  computeFreedomProgressWithBasis,
  inclHomeTargetFromScalar,
} from '@/lib/core-metrics'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { formatAowAgeKort } from '@/lib/aow-leeftijd'
import type { ActionStatus } from '@/lib/recommendation-data'
import { getFireEligibleNetWorth, isHomeExcludedFromFire } from '@/lib/housing-strategy'
import { shouldShowLiquidWealthLine, buildLiquidWealthPoints } from '@/lib/horizon/liquid-wealth-line'
import { nettoLiquideAtAge } from '@/lib/horizon/vrijheidsdagen'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import type { ScenarioPresetResult } from '@/lib/horizon/scenario-presets'
import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'
import { resolveHeroFireAge, formatHeroFireAge, isHeroAnswerPending } from '@/lib/horizon/hero-fire-age'
import { resolveFireDoelWeergave } from '@/lib/horizon/fire-doel-weergave'
import { ankerReachFromSim, ankerStopFromSim, ankerVraag, type AnkerReach, type AnkerStop } from '@/lib/horizon/anker-copy'
import { eventStopAgeFromSim } from '@/lib/horizon/event-duration-copy'
import type { HaalbareUitgave } from '@/lib/horizon/haalbare-uitgave'
import { dekkingVanRun } from '@/lib/horizon/lab-uitkomst'
import { guardFireTarget } from '@/lib/horizon/outcome-guard'
import { runScenarioPresetsAsync } from '@/lib/horizon-kernel/worker/run-in-worker'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import { DEFAULT_FIRE_STRATEGY, type StopAnchor, isFixedAnchor, stopAnchorFromKernel } from '@/lib/fire-strategy'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import { useStabielObject } from './use-stabiel-object'
import type { ToekomstPerspectief } from './use-toekomst-perspectief'
import type { ToekomstScenarioState } from './use-toekomst-scenario'

/** Geen externe bron: `useSyncExternalStore` dient hier alleen als hydratie-signaal. */
const abonneerNiets = () => () => {}

export function useToekomstSim({ initialData, perspectief, scenarioState }: { initialData: HorizonPageData; perspectief: ToekomstPerspectief; scenarioState: ToekomstScenarioState }) {
  const {
    isHouseholdView,
  } = perspectief
  const {
    scenarioStopAge,
    scenarioOverrides,
  } = scenarioState
  const router = useRouter()
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

  // ADR 0129 D7 — de tweede kernel-run onder een vast anker ("vrij mogelijk vanaf"),
  // uitgepakt uit dezelfde worker-batch als de scenariokaarten. `null` = nog niet
  // gedraaid of `solved` (dan ís de hoofdrun de opgeloste run).
  const [solvedRun, setSolvedRun] = useState<{ fireAge: number | null; endAge: number | null } | null>(null)
  /** De gesolvede uitgave na pensioen uit de scenario-batch (spec 2026-09-18). */
  const [haalbareUitgave, setHaalbareUitgave] = useState<HaalbareUitgave | null>(null)
  // Scenario's-naast-elkaar (5 preset-kaarten) — deferred doorgerekend op de BASIS-grondslag.
  const [scenarioPresets, setScenarioPresets] = useState<ScenarioPresetResult[] | null>(null)
  const [scenarioPresetsLoading, setScenarioPresetsLoading] = useState(false)

  // Weergavemodus (eenvoudig/volledig) — de zwevende chart-tooltip verdwijnt in de
  // volledige weergave omdat de meebewegende cijferbar (LifelineReadout) die vervangt.
  const { mode: displayMode } = useDisplayMode()
  // Zichtbaarheids-gate voor de zware duiding-secties (scenario-presets): die rekenen pas via
  // de worker wanneer de "Wat het betekent"-sectie (bijna) in beeld komt (Task 4.2), i.p.v.
  // eager in idle. De sectie klapte tot ADR 0170 mee met het in-/uitklappen van KATERN II;
  // dat inklappen bestaat niet meer (het doelscenario staat altijd open in de grafiekkaart),
  // dus is er ook geen remountKey meer nodig.
  // ADR 0179 fase 1 (kaart V1): `useInViewOnce` draait in PlanVerdieping, naast de sectie
  // die hij observeert; hier staat alleen de grendel. Eenmaal waar, nooit terug.
  const [duidingInView, setDuidingInView] = useState(false)
  const markeerDuidingInView = useCallback(() => setDuidingInView(true), [])
  // B-057 — het venster dat de kernel-hook zelf niet ziet: `router.refresh()` (ook via
  // `loadData`) rendert de server-context opnieuw. Samen met `mainPending` uit de hook
  // vormt het `projectiePending` → de Fin-laadlaag op de grafiek + gedempte hoofdlijn.
  const [refreshPending, startRefresh] = useTransition()

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
  const { result: simResult, cashflows: simCashflows, error: simError, unifiedRows, effectiveLifeEvents, kernelPensionPots, isLoading: kernelIsLoading, kernelStatus, kernelMaandHint, kernelHousingSale, aowOntbreekt, scenario, stopPad, scenarioPending, stopPadPending, mainPending, isRefining: kernelIsRefining, firstPaintFireAge, firstPaintFreedomPct, firstPaintRequiredPortfolio, firstPaintRequiredNetWorth } = useHorizonFireSim(
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

  // Besluit Q8 (ADR 0179 stap 17): de hoofdrun voor een tweede lezer (katern
  // Instellingen, GebeurtenissenView). Eén run per pagina: een eigen hook-instantie
  // daar verdrong deze run op rijstrook `main` (gemeten: vier verdrongen verzoeken bij
  // een directe lading van /toekomst/instellingen, nul op /toekomst).
  const hoofdrun = useMemo<HorizonHoofdrun>(
    () => ({ result: simResult, unifiedRows, kernelPensionPots, effectiveLifeEvents, isLoading: kernelIsLoading }),
    [simResult, unifiedRows, kernelPensionPots, effectiveLifeEvents, kernelIsLoading],
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

  // Grondslag verversen na een mutatie (ADR 0179 fase 1 stap 3). De server-bundel is
  // de enige bron: `router.refresh()` levert een nieuwe `initialData`, en
  // `useHorizonBron` neemt die referentie-stabiel over. Vervangt de oude client-
  // herlading (15 Supabase-reads + 3 fetches die de SSR-loader spiegelden) en de
  // mount-fetch `loadKernelContext`. De naam blijft, zodat de aanroepers (modals,
  // panes, EventPane, tijdlijn-drag, acties) ongewijzigd zijn.
  const loadData = useCallback(() => {
    startRefresh(() => router.refresh())
  }, [router])

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

  const currentAge = effectiveInput?.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null

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

  // Stopmoment van de HOOFDRUN voor de looptijd-tekst van "tot ik stop met werken"-
  // gebeurtenissen (Notion 3daf9e8d): vast anker ?? gevonden vrijheidsleeftijd, nooit
  // fireAge (ceil). Bewust de hoofdrun, niet de lab-/stop-slider-run — anders verspringt
  // de tekst bij elke schuifbeweging. null = geen bereikbaar stopmoment (geen leeftijd tonen).
  const eventStopAge = useMemo(() => eventStopAgeFromSim(simResult), [simResult])

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
  //
  // Hydratie-grendel (ADR 0179 fase 1 stap 13, afwijking): `kernelIsRefining` is op de
  // server altijd false (daar draait geen worker), maar in de eerste client-render al
  // waar zodra de worker nog moet landen. Zonder vast antwoord (`serverFireAge` null) gaf
  // dat server "-" en client "···" met `aria-busy`: een hydration-mismatch op de
  // kerngetal-tegel. Tijdens de hydratie geldt daarom de server-stand; direct daarna
  // (zelfde commit-cyclus, eigen render) de echte.
  const naHydratie = useSyncExternalStore(abonneerNiets, () => true, () => false)
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
    isRefining: kernelIsRefining && naHydratie,
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

  return useStabielObject({
    hoofdrun,
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
  })
}

export type ToekomstSim = ReturnType<typeof useToekomstSim>
