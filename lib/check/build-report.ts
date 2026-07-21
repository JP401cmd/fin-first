/**
 * Pure rapportmotor van de Vrijheidscheck (`/check`).
 *
 * `buildReport(intake)` zet een genormaliseerde `CheckIntake` (output van de
 * wizard) om naar een `CheckReportData` (presentatie-DTO). Server-side, puur,
 * géén Supabase / I/O — JSON-serialiseerbaar (= `report_snapshot` in
 * `lead_intakes`).
 *
 * HARDE REGEL — consume, don't recompute. Elk kerngetal komt uit de bestaande
 * canonieke motoren; deze module mapt alléén, herberekent geen formules:
 *  - FIRE-uitkomst (hero/twee toekomsten/gevoeligheid) → `computeScalarFireProjection`
 *    (lib/horizon-kernel/scalar-router) — de horizon-kernel via de synthetische scalar-pot.
 *  - Levenslang vermogenspad/onttrekking → `runKernelUnified` op diezelfde scalar-pot
 *    (lib/horizon-kernel/run-unified) — levert een `UnifiedProjectionResult` met per-jaar
 *    `rows[].netWorth`. Zie het "KERNEL-MIGRATIE (stap 5A)"-blok bij `safeKernelRun` voor
 *    de routekeuze + expliciete benaderingen (de v2-grootboek-engine is verwijderd).
 *  - vrijheids-% → `computeFreedomProgress` (lib/core-metrics)
 *  - gezondheidsgetal → `buildHealthScoreInput` → `computeHealthScoreFromInputs`
 *  - spaarquote → `resolveSavingsSource` (lib/savings-source)
 *  - buffer-maanden → `computeEmergencyFundMonths` (lib/health-score-input)
 *  - €→tijd / vrijheidstijd → `calculateFreedomTime` / `dailyExpenseRate` (lib/format)
 *  - FIRE-params (rendement/inflatie/SWR) → `resolveFireParams` (lib/fire-params)
 *  - FIRE-eligible vermogen → `getFireEligibleNetWorth` (lib/housing-strategy)
 *  - benchmark → `deriveCohort` + `getCohortReference` + `computeReferencePeer`
 *    (lib/benchmark/*) — DEZELFDE bron als de in-app benchmarkrapportage.
 *
 * Geen hardcoded financiële constanten: rendement/inflatie/SWR/AOW/Box 3 komen
 * uit de params- resp. constants-laag. De eindleeftijd is een vaste rapport-
 * conventie (90 — gelijk aan `DEFAULT_FIRE_STRATEGY.endAge`).
 */

import type {
  CheckIntake,
  CheckIntakeAsset,
  CheckIntakeDebt,
  CheckIntakeLifeEvent,
  CheckReportData,
  FreedomTime,
  ReportDualBar,
  ReportFireCard,
  ReportHealthPillar,
  ReportKruising,
  ReportLifeEvent,
  ReportLifePathScenario,
  ReportMonthBalanceRow,
  ReportProjectionPoint,
  ReportSensitivityRow,
  ReportWithdrawalRow,
} from './types'

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'

import { resolveFireParams } from '@/lib/fire-params'
import { computeAowMonthly, ageAtDate, type FinancialInput } from '@/lib/horizon-data'
import {
  computeScalarFireProjection,
  buildScalarAdapterInput,
  type ScalarFireParams,
  type ScalarStrategyOptions,
} from '@/lib/horizon-kernel/scalar-router'
import { runKernelUnified } from '@/lib/horizon-kernel/run-unified'
import type { UnifiedProjectionResult } from '@/lib/unified-projection'
import { computeRetirementExpenses } from '@/lib/budget-utils'
import { NL_AOW_AGE } from '@/lib/constants'
import { computeFreedomProgress } from '@/lib/core-metrics'
import {
  deriveHousingContext,
  getFireEligibleNetWorth,
  type HousingContext,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { buildHealthScoreInput } from '@/lib/health-score-input'
import { resolveEmergencyFund } from '@/lib/emergency-fund'
import { computeLiquidPot } from '@/lib/dashboard-wealth-weighting'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'
import { resolveSavingsSource } from '@/lib/savings-source'
import { calculateFreedomTime, dailyExpenseRate } from '@/lib/format'
import { deriveCohort, ageToBand } from '@/lib/benchmark/cohort'
import { getCohortReference } from '@/lib/benchmark/nl-reference'
import { computeReferencePeer } from '@/lib/benchmark/reference-peer'

// ── Vaste rapport-conventies (geen financiële aannames) ──────────────────────

/** Eindleeftijd van het levenspad/decumulatie — gelijk aan DEFAULT_FIRE_STRATEGY.endAge. */
const REPORT_END_AGE = 90

/** Benchmark-bron-badge (ADR 0018-addendum). */
const BENCHMARK_SOURCE_BADGE = 'Geraamd (CBS-basis)'

/**
 * Vrijheidstijd-label bij een NEGATIEF (of nul) FIRE-eligible vermogen.
 *
 * `calculateFreedomTime` rekent op de ABSOLUTE waarde, dus een negatieve
 * grondslag (huis-rijk / liquide-schuld-zwaar profiel — sinds de grondslag-fix
 * vaker bereikbaar) zou anders als een POSITIEVE "X jaar vrijheid" renderen. Bij
 * een tekort koopt het FIRE-inzetbare deel (nog) géén vrijheid; we tonen dat
 * eerlijk als `isDeficit`.
 */
const NO_FREEDOM_DEFICIT_LABEL = 'nog geen vrijheid'

/**
 * Housing-strategie van de Vrijheidscheck: de eigen woning telt voor 50% mee in
 * de vrijheids-/FIRE-berekening — de helft die je realistisch kunt verzilveren
 * (verkopen, downsizen of een opeethypotheek) zónder dakloos te worden. Dit is een
 * RAPPORT-conventie (geen app-brede housing-mode): de FIRE-eligible grondslag =
 * netto vermogen MINUS de NIET-meegerekende helft van de overwaarde, dus precies
 * 50% van de overwaarde landt in de vrijheids-base (via `getFireEligibleNetWorth`
 * met `exclude_from_fire` + de 50%-correctie in `buildContext`, zodat de formule
 * één duidelijke home heeft). Het volledige vermogen (incl. de volle huiswaarde)
 * blijft zichtbaar in snapshot/dual-bars/levenspad. In de ingelogde app stelt de
 * gebruiker dit nauwkeuriger in (verkopen / opeethypotheek / niet meerekenen).
 */
const CHECK_HOUSING_STRATEGY: HousingStrategyConfig = { mode: 'exclude_from_fire' }

/**
 * Gewicht waarmee de netto overwaarde van de eigen woning meetelt voor vrijheid:
 * de helft die je realistisch kunt verzilveren of verkleinen. Rapport-conventie
 * (ADR-waardig — zie rapport). Géén app-brede housing-mode; uitsluitend hier.
 */
const HOUSE_FIRE_WEIGHT = 0.5

/** Leek-uitleg over de 50%-weging (DTO-veld `houseInclusion.note`; niet in een component hardcoden). */
const HOUSE_INCLUSION_NOTE =
  'We rekenen je eigen woning voor 50% mee in je vrijheid (de helft die je kunt verzilveren of verkleinen). '
  + 'In de app stel je dit nauwkeuriger in — bijvoorbeeld verkopen, een opeethypotheek of helemaal niet meerekenen.'

const NL_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
] as const

/**
 * Mapt de intake-`household` (alleen/samen/gezin) op de Box 3-partner-vlag.
 * 'samen' en 'gezin' tellen als fiscaal partner (dubbel heffingsvrij vermogen).
 */
function hasPartnerFromHousehold(household: CheckIntake['household']): boolean {
  return household === 'samen' || household === 'gezin'
}

// ── Synthetische Asset/Debt-constructie uit de intake ────────────────────────
//
// De engines verwachten volledige Asset[]/Debt[]. De intake draagt alleen de
// velden die de wizard verzamelt; de rest vullen we met neutrale defaults zodat
// de engine-logica (Box 3-classificatie, rendement, aflossing) ongewijzigd
// draait. We introduceren GEEN nieuwe rendementsaannames: groei-dragende assets
// erven het profiel-`grossReturn` (params-laag) — exact de fallback die de v1-
// engine al toepast (`expected_return || fallbackReturn`). Cash/savings/eigen
// woning groeien niet mee op rendement (cash = 0; de woning is uit de FIRE-pot
// gefilterd en haar groei beïnvloedt het liquide pad niet).

/** Asset-types die op het profiel-rendement (grossReturn) meegroeien. */
const GROWTH_ASSET_TYPES: ReadonlySet<AssetType> = new Set<AssetType>([
  'investment', 'retirement', 'real_estate', 'crypto', 'deelneming', 'vordering', 'levensverzekering',
])

/** Bekende asset-type-enumwaarden; onbekende intake-strings vallen terug op 'other'. */
const KNOWN_ASSET_TYPES: ReadonlySet<string> = new Set<AssetType>([
  'cash', 'savings', 'investment', 'retirement', 'eigen_huis', 'real_estate',
  'crypto', 'vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'other',
])

function normalizeAssetType(raw: string): AssetType {
  return (KNOWN_ASSET_TYPES.has(raw) ? raw : 'other') as AssetType
}

/** Bekende debt-type-enumwaarden; onbekende intake-strings vallen terug op 'other'. */
const KNOWN_DEBT_TYPES: ReadonlySet<string> = new Set<DebtType>([
  'mortgage', 'personal_loan', 'student_loan', 'car_loan', 'credit_card',
  'revolving_credit', 'payment_plan', 'belastingschuld', 'familielening', 'dga_schuld', 'other',
])

function normalizeDebtType(raw: string): DebtType {
  return (KNOWN_DEBT_TYPES.has(raw) ? raw : 'other') as DebtType
}

/**
 * Bouw een minimaal-volledig `Asset` uit een intake-asset. Alle velden die de
 * engines lezen zijn gezet; de rest is neutraal. `expected_return` (%) erft
 * `grossReturn` voor groei-types, 0 voor cash/savings/eigen woning.
 */
function intakeAssetToAsset(
  a: CheckIntakeAsset,
  index: number,
  grossReturn: number,
): Asset {
  const assetType = normalizeAssetType(a.assetType)
  // Per-asset rendement-override (stap ⑤): als de gebruiker voor dít groei-bezit
  // een eigen verwacht jaarrendement invulde (%), gebruik dat; anders het globale
  // profiel-`grossReturn` (×100, want `expected_return` is een percentage). Cash/
  // savings/eigen woning groeien niet mee op rendement → 0. De override geldt
  // alleen voor groei-types; voor niet-groei-types blijft 0 (een ingevuld
  // rendement op cash is betekenisloos in de FIRE-pot).
  const expectedReturnPct = GROWTH_ASSET_TYPES.has(assetType)
    ? (a.expectedReturnPct != null && a.expectedReturnPct > 0
        ? a.expectedReturnPct
        : grossReturn * 100)
    : 0
  return {
    id: `check-asset-${index}`,
    user_id: 'check',
    name: a.name,
    asset_type: assetType,
    current_value: Math.max(0, Number(a.value) || 0),
    purchase_value: 0,
    purchase_date: null,
    expected_return: expectedReturnPct,
    monthly_contribution: 0,
    institution: a.extra ?? null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: index,
    created_at: '',
    updated_at: '',
    subtype: null,
    risk_profile: null,
    tax_benefit: assetType === 'retirement' ? true : null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: assetType === 'eigen_huis' ? Math.max(0, Number(a.value) || 0) : null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    sale_config: null,
    has_budget_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  }
}

/** Bouw een minimaal-volledig `Debt` uit een intake-schuld. */
function intakeDebtToDebt(d: CheckIntakeDebt, index: number, linkedAssetId: string | null): Debt {
  const debtType = normalizeDebtType(d.debtType)
  return {
    id: `check-debt-${index}`,
    user_id: 'check',
    name: d.name,
    debt_type: debtType,
    original_amount: Math.max(0, Number(d.balance) || 0),
    current_balance: Math.max(0, Number(d.balance) || 0),
    interest_rate: Math.max(0, Number(d.interestRatePct) || 0),
    minimum_payment: Math.max(0, Number(d.monthlyPayment) || 0),
    monthly_payment: Math.max(0, Number(d.monthlyPayment) || 0),
    start_date: '',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: index,
    created_at: '',
    updated_at: '',
    subtype: null,
    is_tax_deductible: debtType === 'mortgage',
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: linkedAssetId,
    credit_limit: null,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
  }
}

interface SyntheticPortfolio {
  assets: Asset[]
  debts: Debt[]
}

/**
 * Bouw de synthetische Asset[]/Debt[]. Koppelt de eerste hypotheek aan het
 * eerste eigen-huis-asset (linked_asset_id) zodat de housing-context en de
 * Box 1-classificatie kloppen.
 */
function buildPortfolio(intake: CheckIntake, grossReturn: number): SyntheticPortfolio {
  const assets = intake.assets.map((a, i) => intakeAssetToAsset(a, i, grossReturn))
  const firstHouse = assets.find((a) => a.asset_type === 'eigen_huis')
  let mortgageLinked = false
  const debts = intake.debts.map((d, i) => {
    const isMortgage = normalizeDebtType(d.debtType) === 'mortgage'
    const link = isMortgage && firstHouse && !mortgageLinked ? firstHouse.id : null
    if (link) mortgageLinked = true
    return intakeDebtToDebt(d, i, link)
  })
  return { assets, debts }
}

// ── Engine-context ───────────────────────────────────────────────────────────

interface EngineContext {
  intake: CheckIntake
  now: Date
  age: number
  grossReturn: number
  inflationRate: number
  effectiveSwr: number
  box3Method: 'forfaitair' | 'werkelijk'
  hasPartner: boolean
  /** Volledig portfolio (incl. eigen woning) — voor snapshot/dual-bars/levenspad/health. */
  portfolio: SyntheticPortfolio
  /** Σ asset-waarden × incl% (incl. eigen woning). */
  totalAssets: number
  /** Σ schuld-saldi × incl%. */
  totalDebts: number
  netWorth: number
  yearlyExpenses: number
  monthlyExpenses: number
  netMonthlyIncome: number
  /**
   * Jaarlijkse uitgaven NÁ pensioen (AOW-leeftijd) — via `computeRetirementExpenses`
   * (methode 'custom_amount') als de gebruiker een afwijkende post-pensioen-uitgave
   * invulde, anders gelijk aan `yearlyExpenses` (huidige uitgaven 1:1, geen wijziging).
   */
  retirementYearlyExpenses: number
  /** Spaarquote (%) en jaarlijks spaarbedrag uit de canonieke bron. */
  savingsRatePct: number
  annualSavings: number
  /** AOW-leeftijd-event-cashflow (jaarlijks netto, geïndexeerd). */
  aowMonthly: number
  /**
   * FIRE-eligible netto vermogen. Met eigen woning: netto vermogen MINUS de
   * NIET-meegerekende helft van de overwaarde (`(1−HOUSE_FIRE_WEIGHT) × equity`),
   * zodat exact 50% van de overwaarde in de vrijheids-base zit (Fix 1). Zonder
   * eigen woning identiek aan het netto vermogen.
   */
  fireEligibleNetWorth: number
  /** Netto overwaarde van de eigen woning (`eigenHuisValue − mortgageBalance`, ≥0). 0 zonder woning. */
  houseNetEquity: number
  /** Housing-context (eigen woning + hypotheken) — voor markers (hypotheek-payoff). */
  housingContext: HousingContext
}

// ── KERNEL-MIGRATIE (FASE 6, stap 5A) — routekeuze + benaderingen ────────────
//
// De v2-grootboek-engine (`lib/horizon-engine`, `runHorizonLedger`/`HorizonLedgerResult`)
// is fysiek VERWIJDERD; de horizon-kernel is de enige rekenmotor. De vrijheidscheck is
// een PUBLIEKE intake (ADR 0022) zónder ingelogd profiel/kernel-vlag, dus er is niets om
// op te flippen — deze module consumeert de kernel rechtstreeks via de **scalar-router**.
//
// GEKOZEN ROUTE — de synthetische SCALAR-POT (`buildScalarAdapterInput` + `runKernelUnified`),
// NIET een itemized `KernelAdapterInput`. Reden: de intake draagt inputs die de itemized
// kernel-adapter niet zonder diepe (parity-gelockte) kern-uitbreiding uitdrukt — een door
// de gebruiker ingevuld AOW-maandbedrag (de adapter leidt AOW af uit opbouwjaren), een
// post-pensioen-uitgave-delta, een lump-sum en een onttrekkingsstrategie-keuze. De scalar-
// pot (één Beleggingen-pot = vermogen, essentiële uitgaven geïnjecteerd) is dezelfde brug
// die de FIRE-uitkomst (`computeScalarFireProjection`) al gebruikte → één motor, één antwoord.
//
// BEWUSTE BENADERINGEN (vervallen fidelity t.o.v. het oude grootboek — hier expliciet):
//  1. Eén pot, één rendement: per-asset verwachte rendementen collapsen naar het profiel-
//     `grossReturn`; de itemized asset-mix voedt de projectie niet meer (wél nog dualBars/
//     health/markers, die de portefeuille los lezen).
//  2. AOW/pensioen, post-pensioen-uitgave-delta en levensgebeurtenissen vormen de projectie-
//     LIJN NIET meer (de scalar-pot kent geen kasstromen naast inkomen−uitgaven). Ze blijven
//     wél als LEVENSPAD-MARKERS zichtbaar (`buildLifeMarkers`) en voeden de Fin-tips.
//  3. "Besteedbaar/liquide vermogen" (oud LedgerRow-veld) benaderen we met `rows[].netWorth`
//     — voor een intake zónder eigen huis ≈ gelijk; mét eigen huis is netWorth een BOVENGRENS
//     (het huis is niet vrij besteedbaar). Het levenspad groeit het huis mee met het
//     portefeuille-rendement i.p.v. de WOZ-appreciatie apart te modelleren.
//  4. De per-jaar `V_nodig`-KRUISINGSLIJN is VERVALLEN: de kernel-bridge levert alleen een
//     scalair `requiredFirePortfolio`, geen per-jaar benodigd-vermogen-reeks (die was
//     LedgerRow-only en de bridge/solver mogen niet uitgebreid worden). Zie `ReportKruising`
//     in types.ts — het `vNodig`-veld is uit de DTO verwijderd.

/**
 * Bouw de scalar-parameters voor een kernel-run uit de context.
 *
 * `netWorthBasis` kiest de grondslag: `ctx.netWorth` (volle netto vermogen incl. huis) voor
 * de vermogenslijn/kruising, of `ctx.fireEligibleNetWorth` (50%-huismethodiek) voor de
 * FIRE-uitkomst/gevoeligheid. De scalar-brug spaart exact inkomen−uitgaven; een `annualSavings`-
 * override reconstrueren we daarom als inkomen (`uitgaven + sparen`). `returnDelta`/`lumpSum`/
 * `extraYearlyExpenses` mappen op rendement / beginvermogen / uitgaven-grondslag.
 */
function scalarParamsFor(
  ctx: EngineContext,
  netWorthBasis: number,
  strategyOptions: ScalarStrategyOptions,
  overrides?: { returnDelta?: number; extraYearlyExpenses?: number; lumpSum?: number; annualSavings?: number },
): ScalarFireParams {
  const extraExpensesYearly = overrides?.extraYearlyExpenses ?? 0
  const monthlyExpenses = ctx.monthlyExpenses + extraExpensesYearly / 12
  const yearlyExpenses = ctx.yearlyExpenses + extraExpensesYearly
  const annualSavings = overrides?.annualSavings ?? ctx.annualSavings
  // Inkomen := uitgaven + sparen zodat de kernel-CF-tabel exact `annualSavings` spaart.
  const monthlyIncome = monthlyExpenses + annualSavings / 12
  const netWorth = netWorthBasis + (overrides?.lumpSum ?? 0)
  return {
    input: {
      totalAssets: netWorth + ctx.totalDebts, // netWorth = totalAssets − totalDebts
      totalDebts: ctx.totalDebts,
      monthlyIncome,
      monthlyExpenses,
      monthlyContributions: annualSavings / 12,
      yearlyMustExpenses: yearlyExpenses,
      dateOfBirth: ctx.intake.dateOfBirth,
    } satisfies FinancialInput,
    annualReturn: ctx.grossReturn + (overrides?.returnDelta ?? 0),
    swrOverride: ctx.effectiveSwr,
    inflationOverride: ctx.inflationRate,
    strategyOptions,
  }
}

/**
 * Draai één kernel-accumulatie/decumulatie-run (volle netto-vermogen-pot, `deplete` tot
 * de eindleeftijd) en lever het `UnifiedProjectionResult` — de vervanger van het oude
 * `safeLedger(runHorizonLedger)`. Crash-/gate-vangnet: zonder geboortedatum of bij een
 * negatief (na lump-sum) netto vermogen kan de kernel-adapter geen zinnige pot bouwen →
 * `null` (spiegelt de scalar-router-gates). Leeg resultaat → `null`.
 *
 * De kernel projecteert tot zijn eigen horizon (leeftijd ~100); de rapport-conventie is
 * `REPORT_END_AGE` (90, gelijk aan de oude `endAge`). We KAPPEN de rijen daarom op ≤ 90 —
 * anders zou het levenspad ver voorbij de deplete-leeftijd doorlopen met een diep-negatieve
 * tekort-lening-staart (kernel-shortfall na uitputting) die de grafiek onbruikbaar maakt.
 */
function safeKernelRun(
  ctx: EngineContext,
  overrides?: { returnDelta?: number; extraYearlyExpenses?: number; lumpSum?: number; annualSavings?: number },
): UnifiedProjectionResult | null {
  if (!ctx.intake.dateOfBirth) return null
  if (ctx.netWorth + (overrides?.lumpSum ?? 0) < 0) return null
  try {
    const params = scalarParamsFor(
      ctx,
      ctx.netWorth,
      { strategy: 'deplete', endAge: REPORT_END_AGE },
      overrides,
    )
    const { result } = runKernelUnified({
      adapterInput: buildScalarAdapterInput(params),
      yearlyExpenses: ctx.yearlyExpenses + (overrides?.extraYearlyExpenses ?? 0),
    })
    const rows = result.rows.filter((r) => r.age <= REPORT_END_AGE)
    return rows.length > 0 ? { ...result, rows } : null
  } catch {
    return null
  }
}

/**
 * Fractionele FIRE-leeftijd (sub-jaar) via de scalar-router op de FIRE-eligible grondslag —
 * dezelfde motor als de hoofd-`fireProj`, perpetueel (uitgaven/SWR). Gebruikt door de
 * gevoeligheids-hefbomen: basis én elke hefboom lopen door DEZELFDE methode zodat de
 * maand-delta's appels-met-appels zijn. `null` = onbereikbaar.
 */
function fireAgeFractionalFor(
  ctx: EngineContext,
  overrides?: { returnDelta?: number; extraYearlyExpenses?: number; lumpSum?: number; annualSavings?: number },
): number | null {
  const params = scalarParamsFor(ctx, ctx.fireEligibleNetWorth, { strategy: 'perpetual' }, overrides)
  return computeScalarFireProjection(params).result.fireAge
}

/**
 * Jaar-1-onttrekking uit een kernel-run: de eerste onttrekkingsfase-rij (`phase ===
 * 'withdrawal'`) draagt de werkelijke jaarlijkse `withdrawal` (capaciteits-begrensde
 * onttrekking die de potten muteert). Op de behoefte-gedreven scalar-pot ≈ de jaaruitgaven.
 * Vervangt de oude `firstWithdrawalFromLedger` (die `aowEnPensioen − cashflowNetto` uit de
 * LedgerRow afleidde).
 */
function firstWithdrawalFromRun(result: UnifiedProjectionResult): number {
  const firstRetire = result.rows.find((r) => r.phase === 'withdrawal' && r.withdrawal > 0)
  return firstRetire ? Math.max(0, firstRetire.withdrawal) : 0
}

// ── Vrijheidstijd-helpers (consume lib/format) ───────────────────────────────

/** Maak een serialiseerbaar `FreedomTime` uit een bedrag + dagtarief. */
function toFreedomTime(amount: number, dailyExpense: number): FreedomTime {
  const b = calculateFreedomTime(amount, dailyExpense)
  return {
    years: b.years,
    months: b.months,
    totalDays: b.totalDays,
    isInfinite: b.isInfinite,
    isDeficit: b.isDeficit,
  }
}

/** Decimale "al-vrijgekochte" jaren (bv. 3,1) uit bedrag + dagtarief. */
function freedomYearsDecimal(amount: number, dailyExpense: number): number {
  if (dailyExpense <= 0 || !Number.isFinite(amount) || amount <= 0) return 0
  return (amount / dailyExpense) / 365
}

/** Voorgemaakt vrijheidstijd-label "X jaar en Y maand(en)" / "X dagen". */
function freedomLabel(amount: number, dailyExpense: number): string {
  const b = calculateFreedomTime(amount, dailyExpense)
  if (b.isInfinite) return '∞ vrijheid'
  const parts: string[] = []
  if (b.years > 0) parts.push(`${b.years} jaar`)
  if (b.months > 0) parts.push(`${b.months} ${b.months === 1 ? 'maand' : 'maanden'}`)
  if (parts.length === 0) {
    const days = Math.round(b.totalDays ?? 0)
    return `${days} ${days === 1 ? 'dag' : 'dagen'}`
  }
  if (parts.length === 1) return parts[0]
  return `${parts[0]} en ${parts[1]}`
}

/**
 * Snapshot-vrijheidstijd op de FIRE-eligible grondslag, MÉT tekort-guard.
 *
 * Bij een positief vermogen: gewoon de vrijheidstijd + label (zoals voorheen).
 * Bij een NEGATIEF (of nul) vermogen: een eerlijke tekort-uitkomst. De pot koopt
 * (nog) geen vrijheid, dus we zetten de duur op nul met `isDeficit: true` (i.p.v.
 * de op de ABSOLUTE waarde berekende positieve "X jaar" die `calculateFreedomTime`
 * anders zou opleveren) en een tekort-label. Eén bron voor `netWorthFreedom` én
 * `netWorthFreedomLabel` zodat ze nooit uiteenlopen.
 */
function buildNetWorthFreedom(
  amount: number,
  dailyExpense: number,
): { time: FreedomTime; label: string } {
  if (amount <= 0) {
    return {
      time: { years: 0, months: 0, totalDays: 0, isInfinite: false, isDeficit: true },
      label: NO_FREEDOM_DEFICIT_LABEL,
    }
  }
  return {
    time: toFreedomTime(amount, dailyExpense),
    label: freedomLabel(amount, dailyExpense),
  }
}

/** Maand-vrijheidslabel "X,Y mnd" uit bedrag + dagtarief. */
function monthsLabel(amount: number, dailyExpense: number): string {
  if (dailyExpense <= 0 || amount <= 0) return '0 mnd'
  const months = (amount / dailyExpense) / 30
  return `${months.toFixed(1).replace('.', ',')} mnd`
}

// ── Hoofdfunctie ─────────────────────────────────────────────────────────────

export function buildReport(intake: CheckIntake, now: Date = new Date()): CheckReportData {
  const ctx = buildContext(intake, now)

  // ── Motoren één keer draaien voor de hoofd-DTO (horizon-kernel via scalar-pot) ──
  //
  // Eén kernel-accumulatie/decumulatie-run op de VOLLE netto-vermogen-pot (deplete tot 90)
  // voedt de vermogenslijn (`lifePath`), de kruising-`vOp` en de jaar-1-onttrekking. Zie het
  // "KERNEL-MIGRATIE"-blok bij `safeKernelRun` voor de grondslag + benaderingen.
  const baseRun = safeKernelRun(ctx)

  // Snapshot-FIRE (hero / twee toekomsten / fireCards) — de scalar-router (kernel-
  // onvoorwaardelijk, perpetueel: uitgaven/SWR) op de FIRE-eligible grondslag. Dit is de
  // canonieke FIRE-uitkomst van het rapport.
  const fireProj = computeScalarFireProjection({
    input: {
      totalAssets: ctx.fireEligibleNetWorth + ctx.totalDebts, // netWorth-grondslag (assets − debts) op FIRE-eligible
      totalDebts: ctx.totalDebts,
      monthlyIncome: ctx.netMonthlyIncome,
      monthlyExpenses: ctx.monthlyExpenses,
      monthlyContributions: ctx.annualSavings / 12,
      yearlyMustExpenses: ctx.yearlyExpenses,
      dateOfBirth: intake.dateOfBirth,
    } satisfies FinancialInput,
    annualReturn: ctx.grossReturn,
    swrOverride: ctx.effectiveSwr,
    inflationOverride: ctx.inflationRate,
  }).result

  const dailyExpense = dailyExpenseRate(ctx.monthlyExpenses)

  // FIRE-leeftijd uit de canonieke scalar-FIRE (fractioneel → afgerond). De scalar-router
  // gate't onbereikbaar (`fireAge = null`) en `reached_now` (fireAge ≤ huidige leeftijd) al
  // netjes af, dus de oude zero-portfolio-grootboekguard is niet meer nodig.
  const fireAge = fireProj.fireAge != null ? Math.round(fireProj.fireAge) : null
  const fireReachable = fireAge != null

  // Health één keer berekenen: de sectie én de benchmark-score delen 'm.
  const health = buildHealth(ctx)

  return {
    generatedAt: ctx.now.toISOString(),
    masthead: buildMasthead(ctx),
    lifeGrid: buildLifeGrid(ctx, fireAge, fireReachable, dailyExpense),
    snapshot: buildSnapshot(ctx, dailyExpense),
    dualBars: buildDualBars(ctx),
    monthBalance: buildMonthBalance(ctx, dailyExpense),
    health,
    benchmark: buildBenchmark(ctx, health.score),
    kruising: buildKruising(ctx, baseRun, fireAge, fireReachable),
    savingsHistory: {
      available: false,
      targetPct: round1(ctx.savingsRatePct),
      note: 'Spaarquote-historie verschijnt zodra je transacties koppelt in de app.',
    },
    twoFutures: buildTwoFutures(ctx, fireAge, fireReachable, dailyExpense),
    fireCards: buildFireCards(ctx, fireReachable, baseRun, dailyExpense),
    sensitivity: buildSensitivity(ctx),
    withdrawalStrategies: buildWithdrawalStrategies(ctx, baseRun, fireReachable),
    lifePath: buildLifePath(ctx, baseRun, fireAge),
    will: { intro: '', moves: buildWillMoves(ctx, dailyExpense) },
    houseInclusion: ctx.housingContext.hasEigenHuis
      ? { weightPct: Math.round(HOUSE_FIRE_WEIGHT * 100), note: HOUSE_INCLUSION_NOTE }
      : null,
    cta: {
      perks: [
        { title: 'Live volgen', body: 'Real-time inzicht in de bewegingen van je bezittingen en schulden.' },
        { title: 'Grip op je geld', body: 'Inzichten en tips over je uitgaven (transacties), je vermogen en je belasting.' },
        { title: 'Speel met je toekomst', body: "Spelen met je prognose: schuif aan scenario's en sleep levensgebeurtenissen op de tijdlijn." },
        { title: 'Pensioen in beeld', body: 'Zie je pensioengat en mogelijke pensioenleeftijd — en wat je acties van nu doen met je prognose.' },
        { title: 'Nieuws voor jou', body: 'Relevant financieel nieuws, voor jou geselecteerd op basis van de bron.' },
      ],
      signupHref: '/signup?check=',
    },
    disclaimers: {
      wft: 'Dit rapport biedt inzicht en algemene tips, geen persoonlijk financieel advies in de zin van de Wft. '
        + 'De berekeningen tonen scenario’s op basis van je eigen invoer en kunnen afwijken van je werkelijke situatie. '
        + 'Rendementen uit het verleden bieden geen garantie voor de toekomst.',
      avg: 'Je gegevens zijn versleuteld opgeslagen. Niet-geconverteerde aanvragen worden na 90 dagen automatisch verwijderd.',
    },
  }
}

// ── Context-opbouw ───────────────────────────────────────────────────────────

function buildContext(intake: CheckIntake, now: Date): EngineContext {
  const age = ageAtDate(intake.dateOfBirth, now)
  const hasPartner = hasPartnerFromHousehold(intake.household)

  // FIRE-params uit de params-laag (rendement/inflatie/SWR/Box 3-methode).
  const fireParams = resolveFireParams({
    expected_return: intake.pension.expectedReturnPct != null
      ? intake.pension.expectedReturnPct / 100
      : null,
    net_monthly_income: intake.monthlyIncomeNet,
  })

  const portfolio = buildPortfolio(intake, fireParams.grossReturn)
  const totalAssets = portfolio.assets.reduce(
    (s, a) => s + a.current_value * ((a.net_worth_inclusion_pct ?? 100) / 100), 0,
  )
  const totalDebts = portfolio.debts.reduce(
    (s, d) => s + d.current_balance * ((d.net_worth_inclusion_pct ?? 100) / 100), 0,
  )
  const netWorth = totalAssets - totalDebts

  // FIRE-eligible vermogen — eigen woning telt voor 50% van haar overwaarde mee
  // (rapport-conventie, Fix 1). `getFireEligibleNetWorth(exclude_from_fire)` zou de
  // VOLLE overwaarde aftrekken; we tellen de meegerekende helft er weer bij op, zodat
  // het netto-effect is: netWorth − (1−HOUSE_FIRE_WEIGHT) × overwaarde.
  const housingContext = deriveHousingContext(portfolio.assets, portfolio.debts)
  const houseNetEquity = housingContext.hasEigenHuis
    ? Math.max(0, housingContext.eigenHuisValue - housingContext.mortgageBalance)
    : 0
  const fireEligibleNetWorth =
    getFireEligibleNetWorth(netWorth, housingContext, CHECK_HOUSING_STRATEGY)
    + HOUSE_FIRE_WEIGHT * houseNetEquity

  const monthlyExpenses = Math.max(0, Number(intake.expenses.totaalMaand) || 0)
  const yearlyExpenses = monthlyExpenses * 12
  const netMonthlyIncome = Math.max(0, Number(intake.monthlyIncomeNet) || 0)

  // Post-pensioen-uitgaven: leeg/0 → 1:1 het huidige uitgavenpatroon (geen
  // wijziging). Ingevuld → via de canonieke `computeRetirementExpenses` (methode
  // 'custom_amount', jaarbedrag = maand × 12). Géén nieuwe wiskunde hier.
  const retirementMonthly = intake.pension.retirementMonthlyExpenses
  const retirementYearlyExpenses =
    retirementMonthly != null && retirementMonthly > 0
      ? computeRetirementExpenses('custom_amount', yearlyExpenses, netMonthlyIncome * 12, retirementMonthly * 12, yearlyExpenses)
      : yearlyExpenses

  // Spaarquote via de canonieke bron (handmatige inkomen−uitgaven-pad).
  const savings = resolveSavingsSource({
    incomeSource: 'manual',
    expensesSource: 'manual',
    netMonthlyIncome,
    estimatedAnnualIncome: netMonthlyIncome * 12,
    estimatedMonthlyExpenses: monthlyExpenses,
    savingsRate6m: 0,
    monthlyDebtAflossing: 0,
    monthlySavingsContribution: 0,
  })

  // AOW-maandbedrag: primair de door de gebruiker ingevulde AOW-verwachting;
  // valt die weg (0 of leeg), dan de canonieke helper (leefsituatie-afhankelijk).
  const aowMonthly =
    intake.pension.aowExpectedMonthly && intake.pension.aowExpectedMonthly > 0
      ? intake.pension.aowExpectedMonthly
      : computeAowMonthly(hasPartner ? 'samenwonend' : 'alleenstaand', 0)

  return {
    intake,
    now,
    age,
    grossReturn: fireParams.grossReturn,
    inflationRate: fireParams.inflationRate,
    effectiveSwr: fireParams.effectiveSwr,
    box3Method: fireParams.box3Method,
    hasPartner,
    portfolio,
    totalAssets,
    totalDebts,
    netWorth,
    yearlyExpenses,
    monthlyExpenses,
    netMonthlyIncome,
    retirementYearlyExpenses,
    savingsRatePct: savings.effectiveSavingsRatePct,
    annualSavings: Math.max(0, savings.baseAnnualSavings),
    aowMonthly,
    fireEligibleNetWorth,
    houseNetEquity,
    housingContext,
  }
}

// ── Sectie-builders ──────────────────────────────────────────────────────────

function buildMasthead(ctx: EngineContext): CheckReportData['masthead'] {
  const d = ctx.now
  return {
    displayName: ctx.intake.firstName?.trim() || 'jij',
    age: ctx.age,
    dateLabel: `${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  }
}

function buildLifeGrid(
  ctx: EngineContext,
  fireAge: number | null,
  fireReachable: boolean,
  dailyExpense: number,
): CheckReportData['lifeGrid'] {
  const alreadyFundedYears = freedomYearsDecimal(ctx.fireEligibleNetWorth, dailyExpense)
  return {
    endAge: REPORT_END_AGE,
    age: ctx.age,
    alreadyFundedYears: round1(alreadyFundedYears),
    grindYears: fireReachable && fireAge != null ? Math.max(0, fireAge - ctx.age) : null,
    freeYears: fireReachable && fireAge != null ? Math.max(0, REPORT_END_AGE - fireAge) : null,
    fireAge,
    fireReachable,
  }
}

function buildSnapshot(ctx: EngineContext, dailyExpense: number): CheckReportData['snapshot'] {
  // Noodfonds via de canonieke resolver. /check heeft GEEN doelen (persona-intake)
  // → liquide-tak (source='liquid', default 6 mnd). Buffer telt het noodfonds-
  // saldo als losse cash + de liquide portfolio-assets (computeLiquidPot filtert
  // op spaar/betaal/cash). Zo heeft de noodfonds-definitie één bron.
  const bufferMonths = resolveEmergencyFund({
    liquidPot: computeLiquidPot(
      ctx.portfolio.assets.map((a) => ({
        current_value: a.current_value,
        asset_type: a.asset_type,
        net_worth_inclusion_pct: a.net_worth_inclusion_pct,
      })),
      ctx.intake.emergencyFund,
    ),
    effectiveMonthlyExpenses: ctx.monthlyExpenses,
    goal: null,
  }).monthsCovered
  // Vrijheidstijd op de FIRE-eligible/LIQUIDE grondslag (eigen woning gefilterd) —
  // identiek aan lifeGrid.alreadyFundedYears + twoFutures.stopToday. Het getoonde
  // €-saldo (`netWorth`) blijft incl. huis; alléén de vrijheidstijd rekent op de
  // FIRE-inzetbare pot, want de eigen woning is geen FIRE-besteedbaar vermogen.
  // (Bug-fix: voorheen rekende dit op netWorth incl. huis → huis blies de
  // "vrijheid" op terwijl de LifeGrid-vakjes en "stop vandaag" de lagere,
  // liquide vrijheid toonden — grondslag-vermenging, CLAUDE.md-regel.)
  //
  // Tekort-guard: bij een NEGATIEF (of nul) FIRE-eligible vermogen koopt de pot
  // (nog) géén vrijheid. `calculateFreedomTime` rekent op de ABSOLUTE waarde, dus
  // zonder guard zou een tekort als positieve "X jaar vrijheid" renderen. We
  // tonen dat eerlijk als deficit (isInfinite/isDeficit-correct) met een
  // tekort-label i.p.v. een positieve duur.
  const freedom = buildNetWorthFreedom(ctx.fireEligibleNetWorth, dailyExpense)
  return {
    netWorth: round0(ctx.netWorth),
    netWorthFreedom: freedom.time,
    netWorthFreedomLabel: freedom.label,
    // Het €-bedrag waaróp de vrijheidstijd rust (FIRE-eligible/vrijheidsvermogen,
    // huis voor 50% meegerekend) — zodat de render BEIDE eerlijk kan labelen:
    // headline netto vermogen (incl. huis) + "€Y vrijheidsvermogen = Z vrij".
    // De vrijheid blijft op `fireEligibleNetWorth` (Fix 3 — basis ongewijzigd).
    freedomBaseEur: round0(ctx.fireEligibleNetWorth),
    savingsRatePct: round1(ctx.savingsRatePct),
    savingsMonthly: round0(ctx.annualSavings / 12),
    bufferMonths: round1(bufferMonths),
    emergencyFund: round0(ctx.intake.emergencyFund),
    netMonthlyIncome: round0(ctx.netMonthlyIncome),
    monthlyExpenses: round0(ctx.monthlyExpenses),
    expenseToIncomePct: ctx.netMonthlyIncome > 0
      ? round0((ctx.monthlyExpenses / ctx.netMonthlyIncome) * 100)
      : 0,
  }
}

/** Logische bucket per asset-type voor de dual-bars-kleur. */
function bucketForType(type: AssetType): string {
  if (type === 'eigen_huis') return 'huis'
  if (type === 'cash' || type === 'savings') return 'cash'
  if (type === 'retirement') return 'pensioen'
  if (type === 'crypto') return 'crypto'
  if (type === 'real_estate') return 'vastgoed'
  return 'beleggingen'
}

function buildDualBars(ctx: EngineContext): ReportDualBar[] {
  const dailyExpense = dailyExpenseRate(ctx.monthlyExpenses)
  // Groepeer per bucket; eigen woning = netto huiswaarde (− gekoppelde hypotheek).
  const houseIds = new Set(
    ctx.portfolio.assets.filter((a) => a.asset_type === 'eigen_huis').map((a) => a.id),
  )
  const linkedMortgage = ctx.portfolio.debts
    .filter((d) => d.debt_type === 'mortgage' && d.linked_asset_id && houseIds.has(d.linked_asset_id))
    .reduce((s, d) => s + d.current_balance * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)

  const byBucket = new Map<string, { eur: number; countsForFire: boolean }>()
  for (const a of ctx.portfolio.assets) {
    const bucket = bucketForType(a.asset_type)
    let eur = a.current_value * ((a.net_worth_inclusion_pct ?? 100) / 100)
    if (a.asset_type === 'eigen_huis') eur = Math.max(0, eur - linkedMortgage)
    const countsForFire = a.asset_type !== 'eigen_huis'
    const prev = byBucket.get(bucket) ?? { eur: 0, countsForFire }
    byBucket.set(bucket, { eur: prev.eur + eur, countsForFire })
  }

  const total = Array.from(byBucket.values()).reduce((s, v) => s + v.eur, 0)
  const names: Record<string, string> = {
    beleggingen: 'Beleggingen', pensioen: 'Pensioen', cash: 'Cash',
    crypto: 'Crypto', vastgoed: 'Vastgoed', huis: 'Huis (netto)',
  }

  return Array.from(byBucket.entries())
    .filter(([, v]) => v.eur > 0)
    .sort((a, b) => b[1].eur - a[1].eur)
    .map(([bucket, v]) => {
      // Eigen woning telt voor 50% van haar NETTO overwaarde mee voor vrijheid
      // (Fix 1). De getoonde € blijft de VOLLE netto huiswaarde; alleen de
      // vrijheidsbijdrage is gehalveerd. `countsForFire` blijft FALSE voor het
      // huis-bucket: zo blijft het buiten `buildWillMoves`'s cash-drag-som
      // (`bars.filter(b => b.countsForFire)`), die anders de volle huiswaarde als
      // FIRE-cash zou tellen (de 50%-huisbijdrage zit al in `fireEligibleNetWorth`,
      // niet in deze allocatie-buckets). De 50%-vrijheid tonen we wél in het label.
      const isHouse = bucket === 'huis'
      const freedomLabel = isHouse
        ? `${monthsLabel(HOUSE_FIRE_WEIGHT * v.eur, dailyExpense)} · telt voor ${Math.round(HOUSE_FIRE_WEIGHT * 100)}% mee`
        : v.countsForFire
        ? monthsLabel(v.eur, dailyExpense)
        : 'telt niet mee'
      return {
        name: names[bucket] ?? bucket,
        bucket,
        eur: round0(v.eur),
        pctOfTotal: total > 0 ? round0((v.eur / total) * 100) : 0,
        freedomLabel,
        countsForFire: v.countsForFire,
      }
    })
}

function buildMonthBalance(ctx: EngineContext, dailyExpense: number): CheckReportData['monthBalance'] {
  const e = ctx.intake.expenses
  const overschot = ctx.netMonthlyIncome - ctx.monthlyExpenses
  const rows: ReportMonthBalanceRow[] = [
    {
      label: 'Netto inkomen', perMonth: round0(ctx.netMonthlyIncome), perYear: round0(ctx.netMonthlyIncome * 12),
      freedomPerYearLabel: null, kind: 'income',
    },
    {
      label: 'Wonen', perMonth: round0(e.wonen), perYear: round0(e.wonen * 12),
      freedomPerYearLabel: e.wonen > 0 ? monthsLabel(e.wonen * 12, dailyExpense) : null, kind: 'expense',
    },
    {
      label: 'Vaste lasten overig', perMonth: round0(e.vasteLasten), perYear: round0(e.vasteLasten * 12),
      freedomPerYearLabel: e.vasteLasten > 0 ? monthsLabel(e.vasteLasten * 12, dailyExpense) : null, kind: 'expense',
    },
    {
      label: 'Vrij besteedbaar', perMonth: round0(e.vrijBesteedbaar), perYear: round0(e.vrijBesteedbaar * 12),
      freedomPerYearLabel: e.vrijBesteedbaar > 0 ? monthsLabel(e.vrijBesteedbaar * 12, dailyExpense) : null, kind: 'expense',
    },
    {
      label: overschot >= 0 ? 'Overschot → sparen' : 'Tekort',
      perMonth: round0(overschot), perYear: round0(overschot * 12),
      freedomPerYearLabel: null, kind: 'total',
    },
  ]
  return { rows, savingsRatePct: round1(ctx.savingsRatePct) }
}

function buildHealth(ctx: EngineContext): CheckReportData['health'] {
  const debtMonthly = ctx.portfolio.debts.reduce((s, d) => s + d.monthly_payment, 0)

  // freedomPct via de canonieke voortgang (FIRE-eligible ÷ benodigde portfolio).
  const fireTarget = ctx.effectiveSwr > 0 && ctx.yearlyExpenses > 0
    ? ctx.yearlyExpenses / ctx.effectiveSwr
    : null
  const freedomPct = computeFreedomProgress({
    fireEligibleNetWorth: ctx.fireEligibleNetWorth,
    requiredPortfolio: fireTarget,
  })

  const input = buildHealthScoreInput(
    {
      savingsRate6m: ctx.savingsRatePct,
      totalAssets: ctx.totalAssets,
      totalDebts: ctx.totalDebts,
      freedomPct,
      avgMonthlyExpenses: ctx.monthlyExpenses,
      netMonthlyIncome: ctx.netMonthlyIncome,
    },
    {
      assets: [...ctx.portfolio.assets, { asset_type: 'cash', current_value: ctx.intake.emergencyFund }],
      unlinkedCash: 0,
      budgets: [],
      transactions: [],
      householdType: ctx.hasPartner ? 'samenwonend' : 'alleenstaand',
      debtMonthlyPayments: debtMonthly,
    },
  )
  const score = computeHealthScoreFromInputs(input, false)

  // Toon de VOLLEDIGE actieve v2-pijlerset (mirror /overzicht) — de engine laat
  // inactieve indicatoren (geen data, bv. budget_discipline zonder budgetten in de
  // funnel) zelf vallen, dus mappen we precies `score.pillars` door. Geen grijze
  // "Budget — nog niet gemeten"-placeholder meer (gebruiker OK'd budget vouwen in
  // rondkomen/spaarquote). Elke engine-pijler draagt al `id`, `name`, `score` en een
  // mensleesbare `rawValue` → we mappen 1:1 met de stoplicht-status uit de score.
  const pillars: ReportHealthPillar[] = score.pillars.map((p) => ({
    id: p.id as ReportHealthPillar['id'],
    name: p.name,
    score: p.score,
    status: statusForScore(p.score),
    note: p.rawValue,
  }))

  return {
    score: score.total,
    label: score.label,
    copy: buildHealthCopy(score.total),
    pillars,
  }
}

function statusForScore(score: number | null): ReportHealthPillar['status'] {
  if (score == null) return 'grey'
  if (score >= 70) return 'green'
  if (score >= 40) return 'amber'
  return 'red'
}

function buildHealthCopy(score: number): string {
  if (score >= 70) return 'Je fundament staat. De winst zit nu in versnellen, niet repareren.'
  if (score >= 40) return 'Een redelijk fundament met duidelijke groeikansen. Fin wijst de eerste zetten aan.'
  return 'Er is werk aan de basis. Begin bij rondkomen en buffer — dat geeft de meeste rust.'
}

function buildBenchmark(ctx: EngineContext, healthScore: number): CheckReportData['benchmark'] {
  const cohort = deriveCohort(
    { date_of_birth: ctx.intake.dateOfBirth, household_type: ctx.hasPartner ? 'samenwonend' : 'alleenstaand' },
    ctx.now,
  )
  const band = cohort.ageBand ?? ageToBand(ctx.age).key
  const ref = getCohortReference(band, cohort.household)
  const midAge = ageToBand(ctx.age).mid
  // Zelfde bron als de in-app benchmark voor de gemodelleerde score/buffer.
  const peer = computeReferencePeer(ref, midAge, ctx.now)

  // Score komt van de éénmalig in buildReport berekende health-sectie (geen
  // tweede buildHealth-run — die is duur en deterministisch identiek).
  const yourScore = healthScore

  const rows = [
    benchRow('Spaarquote', ctx.savingsRatePct, ref.savingsRatePct, (v) => `${round0(v)}%`, true),
    benchRow('Vermogen', ctx.netWorth, ref.netWorthMean, (v) => formatEurShort(v), true),
    benchRow('Inkomen (netto/jr)', ctx.netMonthlyIncome * 12, ref.incomeMedian, (v) => formatEurShort(v), true),
    benchRow('Gezondheidsgetal', yourScore, peer.healthScoreTotal, (v) => `${round0(v)}`, true),
  ]
  return { rows, sourceBadge: BENCHMARK_SOURCE_BADGE }
}

function benchRow(
  label: string,
  you: number,
  average: number,
  fmt: (v: number) => string,
  higherIsBetter: boolean,
): CheckReportData['benchmark']['rows'][number] {
  return {
    label,
    you: round0(you),
    youDisplay: fmt(you),
    average: round0(average),
    averageDisplay: fmt(average),
    better: higherIsBetter ? you >= average : you <= average,
  }
}

/**
 * De kruising (V_op × FIRE-punt). NB: deze sectie wordt in het live-rapport NIET meer
 * gerenderd (de `DeKruising`-grafiek is verwijderd); het veld blijft in de DTO voor
 * back-compat van bestaande `report_snapshot`-rijen.
 *
 * KERNEL-MIGRATIE: `vOp` (oud `besteedbaarVermogen`) benaderen we met `rows[].netWorth`
 * — zie de benaderingen bij `safeKernelRun`. De per-jaar `V_nodig`-lijn is VERVALLEN (de
 * kernel-bridge levert alleen een scalair benodigd-vermogen, geen per-jaar reeks; die was
 * LedgerRow-only). Het `vNodig`-veld is daarom uit `ReportKruising` verwijderd.
 */
function buildKruising(
  ctx: EngineContext,
  run: UnifiedProjectionResult | null,
  fireAge: number | null,
  fireReachable: boolean,
): ReportKruising {
  const realReturnPct = realReturnFrom(ctx.grossReturn, ctx.inflationRate) * 100
  const startYear = ctx.now.getFullYear()
  const endYear = startYear + (REPORT_END_AGE - ctx.age)
  if (!run) {
    return {
      vOp: [], crossing: null, fireReachable: false,
      startYear, endYear,
      realReturnPct: round1(realReturnPct), savingsRatePct: round1(ctx.savingsRatePct),
    }
  }
  const vOp: ReportProjectionPoint[] = run.rows.map((r) => ({ age: r.age, value: round0(Math.max(0, r.netWorth)) }))
  // De FIRE-stip op de getoonde lijn: netto vermogen op de FIRE-leeftijd (nearest rij, ≥0).
  const fireRow = fireAge != null
    ? run.rows.find((r) => r.age === fireAge) ?? run.rows.find((r) => r.age >= fireAge)
    : undefined
  const crossing = fireReachable && fireAge != null
    ? { age: fireAge, value: round0(Math.max(0, fireRow?.netWorth ?? 0)) }
    : null
  return {
    vOp, crossing,
    fireReachable,
    startYear, endYear,
    realReturnPct: round1(realReturnPct),
    savingsRatePct: round1(ctx.savingsRatePct),
    // `kruising.scenarios` (±2%-banden) wordt niet gerenderd/berekend; de live band leeft
    // op `lifePath.scenarios` (hergebruikt het BASIS-run, geen extra runs).
  }
}

/** Minimaal positief effectief rendement waaronder we de −2%-band niet laten zakken. */
const SCENARIO_RETURN_FLOOR = 0.005

function buildTwoFutures(
  ctx: EngineContext,
  fireAge: number | null,
  fireReachable: boolean,
  dailyExpense: number,
): CheckReportData['twoFutures'] {
  const fireYear = fireAge != null ? ctx.now.getFullYear() + (fireAge - ctx.age) : null
  // "Stop vandaag": vrijheidstijd van het FIRE-eligible vermogen op huidige uitgaven.
  // Zelfde grondslag (en zelfde tekort-guard) als snapshot.netWorthFreedom — bij een
  // negatief FIRE-eligible vermogen koopt de pot (nog) géén vrijheid, dus tekort i.p.v.
  // een op de ABSOLUTE waarde berekende positieve duur. Eén bron voorkomt dat snapshot
  // en "stop vandaag" uiteenlopen (pariteit-pin in de tests).
  const stopFreedom = buildNetWorthFreedom(ctx.fireEligibleNetWorth, dailyExpense)
  return {
    fireAge,
    fireYear,
    yearsUntilFire: fireReachable && fireAge != null ? Math.max(0, fireAge - ctx.age) : null,
    stopToday: stopFreedom.time,
    stopTodayLabel: stopFreedom.label,
    stayFreeYears: fireReachable && fireAge != null ? Math.max(0, REPORT_END_AGE - fireAge) : null,
  }
}

function buildFireCards(
  ctx: EngineContext,
  fireReachable: boolean,
  run: UnifiedProjectionResult | null,
  dailyExpense: number,
): ReportFireCard[] {
  // Zelfde grondslag + tekort-guard als snapshot/twoFutures: een negatief
  // FIRE-eligible vermogen toont het tekort-label, niet een positieve duur.
  const stopLabel = buildNetWorthFreedom(ctx.fireEligibleNetWorth, dailyExpense).label
  // Vrijheids-% op de canonieke grondslag.
  const fireTarget = ctx.effectiveSwr > 0 && ctx.yearlyExpenses > 0 ? ctx.yearlyExpenses / ctx.effectiveSwr : null
  const freedomPct = computeFreedomProgress({ fireEligibleNetWorth: ctx.fireEligibleNetWorth, requiredPortfolio: fireTarget })
  // Dagen vrijheid die je per maand bijkoopt (sparen / dagtarief).
  const daysPerMonth = dailyExpense > 0 ? Math.round((ctx.annualSavings / 12) / dailyExpense) : 0
  // Passief inkomen later: jaar-1-onttrekking uit de kernel-run → maandbedrag.
  const passiveMonthly = run && fireReachable ? Math.round(firstWithdrawalFromRun(run) / 12) : 0

  return [
    { key: 'stop_today', value: stopLabel, sub: 'vrij als je vandaag stopt' },
    { key: 'days_per_month', value: `~${daysPerMonth} dg`, sub: 'vrijheid / maand op koers' },
    { key: 'progress', value: `${round0(freedomPct)}%`, sub: 'van doelvermogen' },
    { key: 'passive_income', value: passiveMonthly > 0 ? formatEurShort(passiveMonthly) : '—', sub: 'netto/mnd, geïndexeerd' },
  ]
}

function buildSensitivity(ctx: EngineContext): ReportSensitivityRow[] {
  // FRACTIONELE FIRE-leeftijd (sub-jaars): vergelijk basis én elke hefboom op de
  // fractionele scalar-FIRE (`fireAgeFractionalFor`), niet op de afgeronde headline —
  // anders verdween elk effect < 1 jaar in de afronding → "geen verschil". Basis en
  // hefbomen lopen door DEZELFDE methode (perpetueel, FIRE-eligible grondslag).
  const baseFireAge = fireAgeFractionalFor(ctx)

  // 1) Spaarquote +4pp: hogere annualSavings (inkomen × (quote+4)%).
  const higherSavings = Math.max(0, ctx.netMonthlyIncome * 12 * ((ctx.savingsRatePct + 4) / 100))
  // 2) Rendement +1pp. 3) Uitgaven +€200/mnd. 4) +€20k eenmalig beleggen.
  const levers: { lever: string; fireAge: number | null }[] = [
    { lever: 'Spaarquote +4pp', fireAge: fireAgeFractionalFor(ctx, { annualSavings: higherSavings }) },
    { lever: 'Rendement +1pp', fireAge: fireAgeFractionalFor(ctx, { returnDelta: 0.01 }) },
    { lever: 'Uitgaven +€200/mnd', fireAge: fireAgeFractionalFor(ctx, { extraYearlyExpenses: 200 * 12 }) },
    { lever: 'Eenmalig +€20k beleggen', fireAge: fireAgeFractionalFor(ctx, { lumpSum: 20_000 }) },
  ]

  return levers.map((l) => toSensitivityRow(l.lever, baseFireAge, l.fireAge))
}

function toSensitivityRow(lever: string, baseFireAge: number | null, newFireAge: number | null): ReportSensitivityRow {
  if (baseFireAge == null || newFireAge == null) {
    return { lever, effectLabel: newFireAge == null ? 'onbereikbaar' : 'nu bereikbaar', better: newFireAge != null }
  }
  const deltaYears = newFireAge - baseFireAge // negatief = eerder FIRE (beter)
  const better = deltaYears < 0
  const abs = Math.abs(deltaYears)
  const totalMonths = Math.round(abs * 12)
  // Sub-maand-verschil (fractionele basis/hefboom — Fix 4) → "geen verschil".
  if (totalMonths === 0) return { lever, effectLabel: 'geen verschil', better }
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const parts: string[] = []
  if (years > 0) parts.push(`${years} jr`)
  parts.push(`${months} mnd`)
  const sign = better ? '−' : '+'
  return { lever, effectLabel: `${sign}${parts.join(' ')}`, better }
}

/**
 * Onttrekkingsstrategieën (SWR / VPW / Guyton-Klinger). KERNEL-MIGRATIE: de synthetische
 * scalar-pot van de publieke intake kan de drie onttrekkings-STRATEGIEËN niet los simuleren
 * (dat vereiste de itemized v2-grootboek-onttrekkingslaag). We tonen daarom het door de
 * kernel-run gemodelleerde jaar-1-onttrekkingsbedrag (`firstWithdrawalFromRun`, ≈ de
 * jaaruitgaven) voor alle drie; het onderscheid zit in de RISICO-/houdbaarheids-kolommen
 * (statische labels — geen engine-differentiatie op dit pad). Bij een onbereikbare FIRE
 * (perpetueel) vallen alle bedragen terug op 0 / "—".
 */
function buildWithdrawalStrategies(
  ctx: EngineContext,
  run: UnifiedProjectionResult | null,
  fireReachable: boolean,
): ReportWithdrawalRow[] {
  const year1 = run && fireReachable ? round0(firstWithdrawalFromRun(run)) : 0
  const until = (label: string) => (fireReachable && year1 > 0 ? label : '—')
  return [
    { strategy: 'Vast (SWR)', year1, sustainableUntil: until('90+'), risk: 'green', riskLabel: 'laag' },
    { strategy: 'VPW (herrekend)', year1, sustainableUntil: until('levenslang'), risk: 'amber', riskLabel: 'variabel' },
    { strategy: 'Guyton-Klinger', year1, sustainableUntil: until('90+'), risk: 'green', riskLabel: 'laag' },
  ]
}

/**
 * Netto-vermogen-reeks (incl. huis) uit een kernel-run — `rows[].netWorth` per jaar,
 * met een display-vloer op €0. KERNEL-MIGRATIE: de scalar-pot rekent de (niet-liquide)
 * eigen woning mee in de besteedbare pot; bij een `deplete`-eindstrategie kan die pot ná
 * uitputting via de kernel-tekort-lening kort NEGATIEF (fictieve netto-schuld) worden vlak
 * vóór de eindleeftijd. Een vermogenslijn hoort geen fictieve schuld te tonen → klem op ≥0
 * (identiek aan de scenariobanden, die hun pot ook op 0 klemmen).
 */
function nettoVermogenPoints(run: UnifiedProjectionResult): ReportProjectionPoint[] {
  return run.rows.map((r) => ({ age: r.age, value: round0(Math.max(0, r.netWorth)) }))
}

function buildLifePath(
  ctx: EngineContext,
  run: UnifiedProjectionResult | null,
  fireAge: number | null,
): CheckReportData['lifePath'] {
  const points: ReportProjectionPoint[] = run ? nettoVermogenPoints(run) : []
  const markers = buildLifeMarkers(ctx, fireAge)
  // Piek-notitie: leeftijd waarop netto vermogen het hoogst is.
  let peakNote: string | undefined
  if (points.length > 0) {
    const peak = points.reduce((m, p) => (p.value > m.value ? p : m), points[0])
    peakNote = `Je vermogen piekt rond je ${peak.age}e.`
  }
  return { points, markers, fireAge, endAge: REPORT_END_AGE, peakNote, scenarios: buildLifePathScenarios(ctx, run) }
}

/** Reëel rendement uit een nominaal rendement + inflatie (engine-identiek). */
function realReturnFrom(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}

/**
 * Rendement-scenariobanden (−2% / +2%) rond de levenslange netto-vermogenslijn —
 * een ONZEKERHEIDSBAND op het rendement, NIET een her-geplande FIRE-uitkomst.
 *
 * Semantiek (gefixt plan, alleen rendement varieert):
 *  - Het PLAN ligt vast: zelfde kasstroom-vorm (inleg in opbouw, −onttrekking in afbouw,
 *    omslag op de basis-FIRE-leeftijd die al in de basislijn zit) als de basislijn.
 *  - Alleen het rendement schuift ±2%. De waaier wordt breder door de opbouw en blíjft
 *    breder worden in de afbouw. Geen omkering, geen convergentie.
 *
 * Mechaniek (consume, don't recompute — GEEN extra kernel-runs):
 *  1. Uit het BASIS-run leiden we de jaarlijkse netto-kasstroom af op DEZELFDE grondslag
 *     als de basislijn: `rows[].netWorth`. cf[t] = base[t] − base[t−1]·(1 + r_base).
 *  2. Voor elk scenario s herbeleggen we diezelfde kasstroom op het verschoven reële
 *     rendement: pot_s[0] = base[0]; pot_s[t] = pot_s[t−1]·(1 + r_s) + cf[t] (klem op 0).
 *
 * KERNEL-MIGRATIE-benadering: we reconstrueren op de VOLLE netto-vermogenreeks (incl. huis;
 * het huis groeit hier mee met het portefeuille-rendement i.p.v. apart op WOZ — zie de
 * benaderingen bij `safeKernelRun`). Omdat we op exact de basislijn (`rows[].netWorth`)
 * reconstrueren, raakt de band de basislijn op t=0 exact (cf[0]=0). De −2%-band wordt
 * geklemd op `SCENARIO_RETURN_FLOOR`.
 */
function buildLifePathScenarios(
  ctx: EngineContext,
  baseRun: UnifiedProjectionResult | null,
): ReportLifePathScenario[] {
  const deltas: { label: string; returnDeltaPct: number; raw: number }[] = [
    { label: '−2% rendement', returnDeltaPct: -2, raw: -0.02 },
    { label: '+2% rendement', returnDeltaPct: +2, raw: +0.02 },
  ]
  // Geen basislijn (lege/onbereikbare run) → geen banden (consistent met lifePath.points).
  if (!baseRun || baseRun.rows.length === 0) {
    return deltas.map(({ label, returnDeltaPct }) => ({ label, returnDeltaPct, points: [] }))
  }

  const rows = baseRun.rows
  // Grondslag = `netWorth` (volle netto-vermogenreeks) — byte-identiek met lifePath.points.
  const basePot = rows.map((r) => r.netWorth)
  // Basis-reëel rendement op de NOMINALE schaal van het profiel (zoals returnDelta).
  const rBase = realReturnFrom(ctx.grossReturn, ctx.inflationRate)
  // Jaarlijkse netto-kasstroom van het basisplan; cf[0] = 0 (start, geen kasstroom ervóór).
  const cf: number[] = basePot.map((v, t) =>
    t === 0 ? 0 : v - basePot[t - 1] * (1 + rBase),
  )

  return deltas.map(({ label, returnDeltaPct, raw }) => {
    // Klem de neerwaartse band zodat grossReturn + delta ≥ vloer (kleine positief).
    const nomDelta = raw < 0 && ctx.grossReturn + raw < SCENARIO_RETURN_FLOOR
      ? SCENARIO_RETURN_FLOOR - ctx.grossReturn
      : raw
    const rS = realReturnFrom(ctx.grossReturn + nomDelta, ctx.inflationRate)
    const potS: number[] = new Array(basePot.length)
    potS[0] = basePot[0]
    for (let t = 1; t < basePot.length; t++) {
      potS[t] = Math.max(0, potS[t - 1] * (1 + rS) + cf[t])
    }
    const points: ReportProjectionPoint[] = rows.map((r, t) => ({
      age: r.age,
      value: round0(potS[t]),
    }))
    return { label, returnDeltaPct, points }
  })
}

function buildLifeMarkers(ctx: EngineContext, fireAge: number | null): ReportLifeEvent[] {
  const startYear = ctx.now.getFullYear()
  const markers: ReportLifeEvent[] = []
  const yearFor = (age: number) => startYear + (age - ctx.age)

  // FIRE-moment (afgeleid, niet illustratief).
  if (fireAge != null && fireAge >= ctx.age) {
    markers.push({
      name: 'FIRE-moment bereikt', type: 'leven', age: fireAge, year: yearFor(fireAge),
      effect: 'inkomen wordt optioneel', illustrative: false,
    })
  }

  // Hypotheek-payoff (afgeleid uit de eerste hypotheek met een aflossingstermijn).
  const mortgage = ctx.portfolio.debts.find((d) => d.debt_type === 'mortgage' && d.current_balance > 0 && d.monthly_payment > 0)
  if (mortgage) {
    const payoffAge = estimateMortgagePayoffAge(ctx, mortgage)
    if (payoffAge != null && payoffAge > ctx.age && payoffAge <= REPORT_END_AGE) {
      markers.push({
        name: 'Hypotheek afgelost', type: 'natuurlijk', age: payoffAge, year: yearFor(payoffAge),
        effect: 'woonlasten dalen', illustrative: false,
      })
    }
  }

  // AOW + pensioen (afgeleid: constante AOW-leeftijd).
  if (NL_AOW_AGE > ctx.age && NL_AOW_AGE <= REPORT_END_AGE && ctx.aowMonthly > 0) {
    markers.push({
      name: 'AOW + pensioen gaat in', type: 'natuurlijk', age: NL_AOW_AGE, year: yearFor(NL_AOW_AGE),
      effect: `+${formatEurShort(ctx.aowMonthly)}/mnd inkomen`, illustrative: false,
    })
  }

  // Door de gebruiker ingevoerde levensgebeurtenissen (stap ⑦b). Type 'leven',
  // niet-illustratief; alleen toekomstige events binnen de horizon worden als marker
  // getoond. NB (kernel-migratie): op de scalar-pot-route vormen deze events de
  // projectie-LIJN niet meer — ze verschijnen enkel als marker/tip (zie `safeKernelRun`).
  for (const ev of ctx.intake.lifeEvents ?? []) {
    if (ev.age <= ctx.age || ev.age > REPORT_END_AGE) continue
    markers.push({
      name: ev.label, type: 'leven', age: ev.age, year: yearFor(ev.age),
      effect: lifeEventEffectLabel(ev), illustrative: false,
    })
  }

  return markers.sort((a, b) => a.age - b.age)
}

/**
 * Effect-label voor een ingevoerde levensgebeurtenis-marker. Tekenconventie
 * intake: `amount`/`recurringYearly` > 0 = meevaller/inkomen, < 0 = kost/uitgave.
 */
function lifeEventEffectLabel(ev: CheckIntakeLifeEvent): string {
  const oneOff = Number(ev.amount ?? 0)
  const recurring = Number(ev.recurringYearly ?? 0)
  if (oneOff !== 0) {
    return `${oneOff > 0 ? '+' : '−'}${formatEurShort(Math.abs(oneOff))} eenmalig`
  }
  if (recurring !== 0) {
    return `${recurring > 0 ? '+' : '−'}${formatEurShort(Math.abs(recurring))}/jaar`
  }
  return 'levensgebeurtenis'
}

/** Schat de payoff-leeftijd van een annuïteit/lineaire hypotheek (maandbedrag-aflossing). */
function estimateMortgagePayoffAge(ctx: EngineContext, mortgage: Debt): number | null {
  const balance = mortgage.current_balance
  const payment = mortgage.monthly_payment
  const monthlyRate = (mortgage.interest_rate / 100) / 12
  if (payment <= 0 || balance <= 0) return null
  let months: number
  if (monthlyRate > 0) {
    const denom = payment - balance * monthlyRate
    if (denom <= 0) return null // betaling dekt de rente niet → nooit afgelost
    months = Math.log(payment / denom) / Math.log(1 + monthlyRate)
  } else {
    months = balance / payment
  }
  if (!Number.isFinite(months) || months <= 0) return null
  return Math.round(ctx.age + months / 12)
}

/** Maximaal aantal Fin-zetten op het rapport. */
const MAX_WILL_MOVES = 4
/** Bufferdrempel (maanden) waarboven het overschot beter belegd kan worden. */
const FIN_BUFFER_TARGET_MONTHS = 4

/** Eén kandidaat-zet met impactscore (vrijheidsdagen/jaar) voor de ranking. */
interface FinCandidate {
  move: CheckReportData['will']['moves'][number]
  /** Impact in vrijheidsdagen/jaar — sorteersleutel (hoog = eerst). */
  score: number
  /** Gegarandeerde basiszet (spaarquote) — altijd in de top, ongeacht score. */
  guaranteed?: boolean
}

/**
 * Bouw tot {@link MAX_WILL_MOVES} Fin-zetten uit een gescoorde KANDIDATENPOOL.
 *
 * Alle impactlabels gaan via het canonieke dagtarief (`dailyExpense`, = €→tijd
 * uit lib/format) en het profiel-`grossReturn` — geen lokale 0,04/forfait-
 * constanten. De pool bevat:
 *  - spaarquote +4pp (gegarandeerde basiszet, altijd aanwezig);
 *  - bufferoverschot boven {@link FIN_BUFFER_TARGET_MONTHS} mnd beleggen;
 *  - cash-drag: een groot cash/spaar-aandeel aan het werk zetten op rendement;
 *  - dure schuld: ALLE schuld met rente > rendement (geaggregeerd, top-post benoemd);
 *  - pensioengat: AOW laag t.o.v. de maanduitgaven.
 * Kandidaten worden op `score` (vrijheidsdagen/jaar) gesorteerd; de top-N (incl.
 * de gegarandeerde basiszet) wordt teruggegeven.
 */
function buildWillMoves(ctx: EngineContext, dailyExpense: number): CheckReportData['will']['moves'] {
  const candidates: FinCandidate[] = []
  const r = ctx.grossReturn
  const daysFrom = (annualEur: number): number =>
    dailyExpense > 0 ? Math.round(annualEur / dailyExpense) : 0

  // ── (baseline) Spaarquote +4pp — altijd aanwezig. Impact = extra jaarlijkse
  //    besparing (4pp van het netto-jaarinkomen) belegd op rendement → dagen/jr. ──
  const extraAnnualSavings = Math.max(0, ctx.netMonthlyIncome * 12 * 0.04)
  const savingsScore = daysFrom(extraAnnualSavings * r)
  candidates.push({
    guaranteed: true,
    score: savingsScore,
    move: {
      title: `Til je spaarquote van ${round0(ctx.savingsRatePct)}% naar ${round0(ctx.savingsRatePct + 4)}%`,
      body: 'Vier procentpunt klinkt klein, maar over de jaren schuift het je vrijheidsmoment merkbaar naar voren. Eén automatische verhoging bij je volgende salarisstap doet het meeste werk.',
      gainLabel: 'Vrijheid eerder',
      kind: 'fire-months',
    },
  })

  // ── (a) Bufferoverschot boven 4 maanden laten werken. ──
  // Buffer = noodfonds + liquide (cash/savings) bezittingen, via de canonieke
  // resolver (liquide-tak: /check heeft geen doelen).
  const bufferMonths = resolveEmergencyFund({
    liquidPot: computeLiquidPot(
      ctx.portfolio.assets.map((a) => ({
        current_value: a.current_value,
        asset_type: a.asset_type,
        net_worth_inclusion_pct: a.net_worth_inclusion_pct,
      })),
      ctx.intake.emergencyFund,
    ),
    effectiveMonthlyExpenses: ctx.monthlyExpenses,
    goal: null,
  }).monthsCovered
  if (bufferMonths > FIN_BUFFER_TARGET_MONTHS && ctx.monthlyExpenses > 0) {
    const surplus = Math.max(0, ctx.intake.emergencyFund - ctx.monthlyExpenses * FIN_BUFFER_TARGET_MONTHS)
    if (surplus > 0) {
      const gainDays = daysFrom(surplus * r)
      candidates.push({
        score: gainDays,
        move: {
          title: 'Laat je bufferoverschot werken',
          body: `Je buffer dekt ${round1(bufferMonths)} maanden. Het deel boven ${FIN_BUFFER_TARGET_MONTHS} maanden (±${formatEurShort(surplus)}) staat stil — breng het naar je beleggingsdeel.`,
          gainLabel: `~${gainDays} dagen vrijheid / jaar`,
          gainDays,
          kind: 'freedom-days',
        },
      })
    }
  }

  // ── (b) Cash-drag: een grote cash/spaar-allocatie aan het werk zetten. Gebruik
  //    de DUAL-BARS-buckets (zelfde groepering als de allocatie-sectie). Trek het
  //    bufferdoel af (dat dekt de buffer-zet al) zodat we niet dubbeltellen. ──
  const bars = buildDualBars(ctx)
  const totalFireWealth = bars.filter((b) => b.countsForFire).reduce((s, b) => s + b.eur, 0)
  const cashBar = bars.find((b) => b.bucket === 'cash')
  if (cashBar && totalFireWealth > 0) {
    const cashShare = cashBar.eur / totalFireWealth
    // Het deel boven de aan te houden buffer (4 mnd uitgaven) is "drag".
    const bufferTarget = ctx.monthlyExpenses * FIN_BUFFER_TARGET_MONTHS
    const investableCash = Math.max(0, cashBar.eur - bufferTarget)
    // Alleen relevant bij een fors cash-aandeel én daadwerkelijk te beleggen cash.
    if (cashShare > 0.30 && investableCash > 0) {
      const gainDays = daysFrom(investableCash * r)
      candidates.push({
        score: gainDays,
        move: {
          title: 'Zet je stilstaande cash aan het werk',
          body: `~${round0(cashShare * 100)}% van je vrijheidsvermogen staat in cash/spaargeld. Boven je buffer (±${formatEurShort(investableCash)}) levert dat nauwelijks rendement — belegd groeit het mee met je vrijheid.`,
          gainLabel: `~${gainDays} dagen vrijheid / jaar`,
          gainDays,
          kind: 'freedom-days',
        },
      })
    }
  }

  // ── (c) Dure schuld: ALLE schuld met rente > rendement (geaggregeerd; benoem
  //    de duurste post). Impact = totale jaarlijkse rente boven het rendement. ──
  const expensiveDebts = ctx.portfolio.debts
    .filter((d) => d.current_balance > 0 && d.interest_rate / 100 > r)
    .sort((a, b) => b.interest_rate - a.interest_rate)
  if (expensiveDebts.length > 0) {
    const totalInterest = expensiveDebts.reduce(
      (s, d) => s + d.current_balance * (d.interest_rate / 100), 0,
    )
    const gainDays = daysFrom(totalInterest)
    const top = expensiveDebts[0]
    const body = expensiveDebts.length === 1
      ? `één post (${top.name}) heeft een rente hoger dan je verwachte rendement. Elke euro die je daar aflost levert gegarandeerd meer op dan beleggen.`
      : `${expensiveDebts.length} schuldposten (o.a. ${top.name}) hebben een rente hoger dan je verwachte rendement. Aflossen levert daar gegarandeerd meer op dan beleggen.`
    candidates.push({
      score: gainDays,
      move: {
        title: 'Los je duurste schuldpost eerst af',
        body,
        gainLabel: `~${gainDays} dagen vrijheid / jaar`,
        gainDays,
        kind: 'freedom-days',
      },
    })
  }

  // ── (d) Pensioengat: AOW laag t.o.v. de uitgaven NÁ pensioen. Impact = jaarlijks
  //    gat tussen de post-pensioen-uitgaven en AOW, uitgedrukt in dagen/jaar
  //    (illustratief). (Fix 5: gebruik de ingevulde post-pensioen-uitgave —
  //    `retirementYearlyExpenses/12` — niet de HUIDIGE uitgaven. De gebruiker kan
  //    ná pensioen ánders uitgeven; het pensioengat hoort op díe maandlast te slaan.
  //    Zonder eigen post-pensioen-invoer valt `retirementYearlyExpenses` 1:1 terug op
  //    de huidige uitgaven, dus gedrag identiek in dat geval.) ──
  const postPensionMonthlyExpenses = ctx.retirementYearlyExpenses / 12
  if (ctx.aowMonthly > 0 && postPensionMonthlyExpenses > 0 && ctx.aowMonthly < postPensionMonthlyExpenses * 0.7) {
    const monthlyGap = Math.max(0, postPensionMonthlyExpenses - ctx.aowMonthly)
    const gainDays = daysFrom(monthlyGap * 12)
    candidates.push({
      score: gainDays,
      move: {
        title: 'Dicht je pensioengat',
        body: `Je AOW (±${formatEurShort(ctx.aowMonthly)}/mnd) dekt straks maar een deel van je uitgaven na pensioen (${formatEurShort(postPensionMonthlyExpenses)}/mnd). Eigen opbouw — beleggen of extra pensioen — overbrugt dat gat.`,
        gainLabel: `~${gainDays} dagen vrijheid / jaar`,
        gainDays,
        kind: 'freedom-days',
      },
    })
  }

  // ── Ranking: de impact-gesorteerde zetten voorop, de gegarandeerde basiszet
  //    (spaarquote) deterministisch als sluitstuk. Top-N met de baseline binnen
  //    het budget: eerst de hoogst scorende niet-baseline-zetten (tot N−1), dan
  //    de baseline — zodat het rapport altijd op de spaarquote-zet eindigt. ──
  const guaranteed = candidates.filter((c) => c.guaranteed)
  const ranked = candidates
    .filter((c) => !c.guaranteed)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_WILL_MOVES - guaranteed.length)
  return [...ranked, ...guaranteed].map((c) => c.move)
}

// ── Numerieke helpers ────────────────────────────────────────────────────────

function round0(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0
}

function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0
}

/** Compacte euro-notatie: €87k, €1,2M. */
function formatEurShort(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `€${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 10_000) return `€${Math.round(v / 1000)}k`
  if (abs >= 1_000) return `€${(v / 1000).toFixed(1).replace('.', ',')}k`
  return `€${Math.round(v)}`
}
