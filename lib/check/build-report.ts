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
 *  - FIRE-pad/decumulatie/onttrekking → `runHorizonLedger` (lib/horizon-engine)
 *  - snapshot-FIRE (hero/twee toekomsten) → `computeFireProjection` (lib/horizon-data)
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
  CheckReportData,
  FreedomTime,
  ReportDualBar,
  ReportFireCard,
  ReportHealthPillar,
  ReportKruising,
  ReportLifeEvent,
  ReportMonthBalanceRow,
  ReportProjectionPoint,
  ReportSensitivityRow,
  ReportWithdrawalRow,
} from './types'

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'

import { resolveFireParams } from '@/lib/fire-params'
import { computeFireProjection, computeAowMonthly, ageAtDate, type FinancialInput } from '@/lib/horizon-data'
import { runHorizonLedger } from '@/lib/horizon-engine/engine'
import type { HorizonLedgerResult } from '@/lib/horizon-engine/types'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { NL_AOW_AGE } from '@/lib/constants'
import { computeFreedomProgress } from '@/lib/core-metrics'
import {
  deriveHousingContext,
  getFireEligibleNetWorth,
  filterAssetsForFire,
  projectEigenHuisValuesAt,
  projectMortgageStateAt,
  type HousingContext,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { buildHealthScoreInput, computeEmergencyFundMonths } from '@/lib/health-score-input'
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
 * Housing-strategie van de Vrijheidscheck: de eigen woning telt NIET mee voor
 * FIRE — conform het rapport-ontwerp ("dat is je dak, niet je rendement"). De
 * woning + gekoppelde hypotheek worden via `filterAssetsForFire` uit de
 * engine-pot gehaald en `getFireEligibleNetWorth` trekt de overwaarde van het
 * netto vermogen af. Het volledige vermogen (incl. huis) blijft zichtbaar in
 * snapshot/dual-bars/levenspad.
 */
const CHECK_HOUSING_STRATEGY: HousingStrategyConfig = { mode: 'exclude_from_fire' }

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
  const expectedReturnPct = GROWTH_ASSET_TYPES.has(assetType) ? grossReturn * 100 : 0
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

// ── Engine-input-assemblage ──────────────────────────────────────────────────

interface EngineContext {
  intake: CheckIntake
  now: Date
  age: number
  grossReturn: number
  inflationRate: number
  effectiveSwr: number
  box3Method: 'forfaitair' | 'werkelijk'
  hasPartner: boolean
  /** Volledig portfolio (incl. eigen woning) — voor snapshot/dual-bars/levenspad. */
  portfolio: SyntheticPortfolio
  /** FIRE-pot: eigen woning + gekoppelde hypotheek gefilterd — voedt de engine. */
  firePortfolio: SyntheticPortfolio
  /** Σ asset-waarden × incl% (incl. eigen woning). */
  totalAssets: number
  /** Σ schuld-saldi × incl%. */
  totalDebts: number
  netWorth: number
  yearlyExpenses: number
  monthlyExpenses: number
  netMonthlyIncome: number
  /** Spaarquote (%) en jaarlijks spaarbedrag uit de canonieke bron. */
  savingsRatePct: number
  annualSavings: number
  /** AOW-leeftijd-event-cashflow (jaarlijks netto, geïndexeerd). */
  aowMonthly: number
  /** FIRE-eligible netto vermogen (eigen woning gefilterd). */
  fireEligibleNetWorth: number
  /** Housing-context (eigen woning + hypotheken) — voor de levenspad-reconstructie. */
  housingContext: HousingContext
}

/**
 * Bouw een `UnifiedProjectionInput` voor `runHorizonLedger` met een gegeven
 * withdrawal-strategie. Eén bron; de gevoeligheids- en strategie-her-runs
 * variëren alleen de meegegeven overrides.
 */
function buildEngineInput(
  ctx: EngineContext,
  withdrawalStrategy: WithdrawalStrategyConfig,
  strategyConfig: FireStrategyConfig,
  overrides?: { returnDelta?: number; extraYearlyExpenses?: number; lumpSum?: number; annualSavings?: number },
): UnifiedProjectionInput {
  const cashflows = buildAowCashflow(ctx)
  // Eenmalige lumpsum als one_time inkomen op de huidige leeftijd (wordt belegd).
  if (overrides?.lumpSum && overrides.lumpSum > 0) {
    cashflows.push({
      id: 'check-lumpsum',
      name: 'Eenmalige inleg',
      type: 'one_time',
      direction: 'income',
      amount: overrides.lumpSum,
      fromAge: ctx.age,
      toAge: null,
      indexed: false,
    })
  }
  return {
    assets: ctx.firePortfolio.assets,
    debts: ctx.firePortfolio.debts,
    currentAge: ctx.age,
    endAge: REPORT_END_AGE,
    yearlyExpenses: ctx.yearlyExpenses + (overrides?.extraYearlyExpenses ?? 0),
    annualSavings: overrides?.annualSavings ?? ctx.annualSavings,
    monthlySurplus: (overrides?.annualSavings ?? ctx.annualSavings) / 12,
    monthlyIncome: ctx.netMonthlyIncome,
    incomeGrowthRate: 0,
    grossReturn: ctx.grossReturn,
    inflationRate: ctx.inflationRate,
    returnDelta: overrides?.returnDelta,
    box3Method: ctx.box3Method,
    cashflows,
    strategyConfig,
    withdrawalStrategy,
    hasPartner: ctx.hasPartner,
    bankAccountCash: 0,
  }
}

/**
 * AOW als recurring inkomens-cashflow vanaf de AOW-leeftijd (constante uit de
 * AOW-helper). Geïndexeerd (koopkracht). Pensioen-pot zit al in de assets
 * (asset_type 'retirement'), dus we tellen het niet apart als inkomen.
 */
function buildAowCashflow(ctx: EngineContext): UnifiedProjectionInput['cashflows'] {
  if (ctx.aowMonthly <= 0) return []
  const aowAge = NL_AOW_AGE
  if (ctx.age >= REPORT_END_AGE) return []
  return [{
    id: 'check-aow',
    name: 'AOW',
    type: 'recurring',
    direction: 'income',
    amount: ctx.aowMonthly,
    fromAge: aowAge,
    toAge: null,
    indexed: true,
  }]
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

/** Maand-vrijheidslabel "X,Y mnd" uit bedrag + dagtarief. */
function monthsLabel(amount: number, dailyExpense: number): string {
  if (dailyExpense <= 0 || amount <= 0) return '0 mnd'
  const months = (amount / dailyExpense) / 30
  return `${months.toFixed(1).replace('.', ',')} mnd`
}

// ── Jaar-1-onttrekking uit het grootboek ─────────────────────────────────────
//
// Keuze (gerapporteerd): de LedgerRow bevat geen expliciet withdrawal-veld. Het
// jaar-1-passief-inkomen leiden we af uit de eerste onttrekkings-fase-rij als
// het netto rendement dat in dat jaar besteedbaar is: het verschil tussen de
// totale uitgaven en de eigen onttrekking is niet los beschikbaar, dus we
// nemen de TOTALE UITGAVEN van de eerste onttrekkings-rij minus het recurring
// inkomen (AOW/pensioen) van dat jaar als de uit het vermogen onttrokken
// behoefte. Dit is per constructie de "withdrawal" die `applyWithdrawalStrategy`
// in dat jaar produceerde (zie engine: cashflowNetto = recurringIncome − withdrawal).
function firstWithdrawalFromLedger(result: HorizonLedgerResult): number {
  const firstRetire = result.rows.find((r) => !r.werkt)
  if (!firstRetire) return 0
  // withdrawal = recurringIncome − cashflowNetto (engine-identiteit in onttrekkingsfase).
  const withdrawal = firstRetire.aowEnPensioen - firstRetire.cashflowNetto
  return Math.max(0, withdrawal)
}

// ── Hoofdfunctie ─────────────────────────────────────────────────────────────

export function buildReport(intake: CheckIntake, now: Date = new Date()): CheckReportData {
  const ctx = buildContext(intake, now)

  // ── Engines één keer draaien voor de hoofd-DTO ──
  const baseStrategy: FireStrategyConfig = { strategy: 'deplete', endAge: REPORT_END_AGE, legacyAmount: 0 }
  const baseLedger = safeLedger(buildEngineInput(ctx, WITHDRAWAL_DEFAULTS, baseStrategy))

  // Snapshot-FIRE (hero / twee toekomsten / fireCards) — perpetuele formule.
  const fireProj = computeFireProjection(
    {
      totalAssets: ctx.fireEligibleNetWorth + ctx.totalDebts, // netWorth-grondslag (assets − debts) op FIRE-eligible
      totalDebts: ctx.totalDebts,
      monthlyIncome: ctx.netMonthlyIncome,
      monthlyExpenses: ctx.monthlyExpenses,
      monthlyContributions: ctx.annualSavings / 12,
      yearlyMustExpenses: ctx.yearlyExpenses,
      dateOfBirth: intake.dateOfBirth,
    } satisfies FinancialInput,
    ctx.grossReturn,
    ctx.effectiveSwr,
    ctx.inflationRate,
  )

  const dailyExpense = dailyExpenseRate(ctx.monthlyExpenses)

  // FIRE-leeftijd: primair uit het grootboek (decumulatie-consistent), fallback
  // op de snapshot-projectie (perpetueel) wanneer het grootboek geen pad vond.
  //
  // Rand-guard (zero-portfolio): het grootboek kan een trivial-late fireAge ≈
  // eindleeftijd melden wanneer de portefeuille leeg is — meetsStrategyTarget
  // toetst alleen de vroege jaren (≤ endAge−2), dus de allerlaatste kandidaat
  // "slaagt" bij gebrek aan een vroeg venster. Zo'n FIRE met €0 liquide vermogen
  // op het snijpunt is geen betekenisvolle vrijheid; behandel 'm als onhaalbaar
  // en val terug op de snapshot-projectie (die hier "Niet haalbaar" geeft).
  const ledgerFireMeaningful =
    baseLedger?.fireReachable === true &&
    baseLedger.fireAge != null &&
    !(baseLedger.liquideAtFire <= 1 && baseLedger.fireAge >= REPORT_END_AGE - 1)
  const fireAge = ledgerFireMeaningful
    ? baseLedger!.fireAge
    : (fireProj.fireAge != null ? Math.round(fireProj.fireAge) : null)
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
    kruising: buildKruising(ctx, baseLedger),
    savingsHistory: {
      available: false,
      targetPct: round1(ctx.savingsRatePct),
      note: 'Spaarquote-historie verschijnt zodra je transacties koppelt in de app.',
    },
    twoFutures: buildTwoFutures(ctx, fireAge, fireReachable, dailyExpense),
    fireCards: buildFireCards(ctx, fireAge, fireReachable, baseLedger, dailyExpense),
    sensitivity: buildSensitivity(ctx, fireAge),
    withdrawalStrategies: buildWithdrawalStrategies(ctx),
    lifePath: buildLifePath(ctx, baseLedger, fireAge),
    will: { intro: '', moves: buildWillMoves(ctx, dailyExpense) },
    cta: {
      perks: [
        { title: 'Live volgen', body: 'Vermogen, buffer en vrijheids-% bewegen automatisch mee.' },
        { title: "Scenario's", body: 'Schuif aan de knoppen en zie direct wat het doet met je FIRE-moment.' },
        { title: 'Will als coach', body: 'Stel je vragen, krijg warme uitleg op het moment dat je het nodig hebt.' },
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

  // FIRE-eligible vermogen (eigen woning gefilterd — rapport-conventie).
  const housingContext = deriveHousingContext(portfolio.assets, portfolio.debts)
  const fireEligibleNetWorth = getFireEligibleNetWorth(netWorth, housingContext, CHECK_HOUSING_STRATEGY)
  // FIRE-pot voor de engine: eigen woning + gekoppelde hypotheek gefilterd.
  const fireFiltered = filterAssetsForFire(CHECK_HOUSING_STRATEGY, portfolio.assets, portfolio.debts)
  const firePortfolio: SyntheticPortfolio = { assets: fireFiltered.assets, debts: fireFiltered.debts }

  const monthlyExpenses = Math.max(0, Number(intake.expenses.totaalMaand) || 0)
  const yearlyExpenses = monthlyExpenses * 12
  const netMonthlyIncome = Math.max(0, Number(intake.monthlyIncomeNet) || 0)

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
    firePortfolio,
    totalAssets,
    totalDebts,
    netWorth,
    yearlyExpenses,
    monthlyExpenses,
    netMonthlyIncome,
    savingsRatePct: savings.effectiveSavingsRatePct,
    annualSavings: Math.max(0, savings.baseAnnualSavings),
    aowMonthly,
    fireEligibleNetWorth,
    housingContext,
  }
}

/** Draai het grootboek met crash-vangnet (lege/onbereikbare uitkomst → null). */
function safeLedger(input: UnifiedProjectionInput): HorizonLedgerResult | null {
  try {
    const r = runHorizonLedger(input)
    return r.rows.length > 0 ? r : null
  } catch {
    return null
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
  const bufferMonths = computeEmergencyFundMonths(
    // Buffer telt de noodfonds-saldo als liquide cash + de liquide assets.
    [...ctx.portfolio.assets, { asset_type: 'cash', current_value: ctx.intake.emergencyFund }],
    0,
    ctx.monthlyExpenses,
  )
  return {
    netWorth: round0(ctx.netWorth),
    netWorthFreedom: toFreedomTime(ctx.netWorth, dailyExpense),
    netWorthFreedomLabel: freedomLabel(ctx.netWorth, dailyExpense),
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
    .map(([bucket, v]) => ({
      name: names[bucket] ?? bucket,
      bucket,
      eur: round0(v.eur),
      pctOfTotal: total > 0 ? round0((v.eur / total) * 100) : 0,
      freedomLabel: v.countsForFire ? monthsLabel(v.eur, dailyExpense) : 'telt niet mee',
      countsForFire: v.countsForFire,
    }))
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
  const bufferMonths = computeEmergencyFundMonths(
    [...ctx.portfolio.assets, { asset_type: 'cash', current_value: ctx.intake.emergencyFund }],
    0,
    ctx.monthlyExpenses,
  )
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

  // Pijler-mapping: Budget blijft inactief (geen budgetten in de funnel).
  const pillarById = new Map(score.pillars.map((p) => [p.id, p]))
  const pillars: ReportHealthPillar[] = [
    mapPillar('rondkomen', 'Rondkomen', pillarById.get('savings_rate'), `${round0(ctx.savingsRatePct)}% spaarquote`),
    mapPillar('buffer', 'Buffer', pillarById.get('emergency_fund'), `${round1(bufferMonths)} maanden gedekt`),
    mapPillar('schuld', 'Schuld', pillarById.get('debt_service_ratio') ?? pillarById.get('debt_ratio'),
      debtMonthly > 0 ? 'Schuldenlast meegewogen' : 'Geen dure schuld'),
    { id: 'budget', name: 'Budget', score: null, status: 'grey', note: 'Nog niet gemeten — meet je in de app.' },
  ]

  return {
    score: score.total,
    label: score.label,
    copy: buildHealthCopy(score.total),
    pillars,
  }
}

function mapPillar(
  id: ReportHealthPillar['id'],
  name: string,
  src: { score: number } | undefined,
  note: string,
): ReportHealthPillar {
  const score = src?.score ?? null
  return { id, name, score, status: statusForScore(score), note }
}

function statusForScore(score: number | null): ReportHealthPillar['status'] {
  if (score == null) return 'grey'
  if (score >= 70) return 'green'
  if (score >= 40) return 'amber'
  return 'red'
}

function buildHealthCopy(score: number): string {
  if (score >= 70) return 'Je fundament staat. De winst zit nu in versnellen, niet repareren.'
  if (score >= 40) return 'Een redelijk fundament met duidelijke groeikansen. Will wijst de eerste zetten aan.'
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

function buildKruising(ctx: EngineContext, ledger: HorizonLedgerResult | null): ReportKruising {
  const realReturnPct = ((1 + ctx.grossReturn) / (1 + ctx.inflationRate) - 1) * 100
  const startYear = ctx.now.getFullYear()
  if (!ledger) {
    return {
      vOp: [], vNodig: [], crossing: null, fireReachable: false,
      startYear, endYear: startYear + (REPORT_END_AGE - ctx.age),
      realReturnPct: round1(realReturnPct), savingsRatePct: round1(ctx.savingsRatePct),
    }
  }
  const vOp: ReportProjectionPoint[] = ledger.rows.map((r) => ({ age: r.leeftijd, value: round0(r.liquideVermogen) }))
  const vNodig: ReportProjectionPoint[] = ledger.rows.map((r, i) => ({ age: r.leeftijd, value: round0(ledger.vNodig[i] ?? 0) }))
  const crossing = ledger.fireReachable && ledger.fireAge != null
    ? { age: ledger.fireAge, value: round0(ledger.liquideAtFire) }
    : null
  return {
    vOp, vNodig, crossing,
    fireReachable: ledger.fireReachable,
    startYear, endYear: startYear + (REPORT_END_AGE - ctx.age),
    realReturnPct: round1(realReturnPct),
    savingsRatePct: round1(ctx.savingsRatePct),
  }
}

function buildTwoFutures(
  ctx: EngineContext,
  fireAge: number | null,
  fireReachable: boolean,
  dailyExpense: number,
): CheckReportData['twoFutures'] {
  const fireYear = fireAge != null ? ctx.now.getFullYear() + (fireAge - ctx.age) : null
  // "Stop vandaag": vrijheidstijd van het FIRE-eligible vermogen op huidige uitgaven.
  const stopToday = toFreedomTime(ctx.fireEligibleNetWorth, dailyExpense)
  return {
    fireAge,
    fireYear,
    yearsUntilFire: fireReachable && fireAge != null ? Math.max(0, fireAge - ctx.age) : null,
    stopToday,
    stopTodayLabel: freedomLabel(ctx.fireEligibleNetWorth, dailyExpense),
    stayFreeYears: fireReachable && fireAge != null ? Math.max(0, REPORT_END_AGE - fireAge) : null,
  }
}

function buildFireCards(
  ctx: EngineContext,
  fireAge: number | null,
  fireReachable: boolean,
  ledger: HorizonLedgerResult | null,
  dailyExpense: number,
): ReportFireCard[] {
  const stopLabel = freedomLabel(ctx.fireEligibleNetWorth, dailyExpense)
  // Vrijheids-% op de canonieke grondslag.
  const fireTarget = ctx.effectiveSwr > 0 && ctx.yearlyExpenses > 0 ? ctx.yearlyExpenses / ctx.effectiveSwr : null
  const freedomPct = computeFreedomProgress({ fireEligibleNetWorth: ctx.fireEligibleNetWorth, requiredPortfolio: fireTarget })
  // Dagen vrijheid die je per maand bijkoopt (sparen / dagtarief).
  const daysPerMonth = dailyExpense > 0 ? Math.round((ctx.annualSavings / 12) / dailyExpense) : 0
  // Passief inkomen later: jaar-1-onttrekking uit het grootboek → maandbedrag.
  const passiveMonthly = ledger && fireReachable ? Math.round(firstWithdrawalFromLedger(ledger) / 12) : 0

  return [
    { key: 'stop_today', value: stopLabel, sub: 'vrij als je vandaag stopt' },
    { key: 'days_per_month', value: `~${daysPerMonth} dg`, sub: 'vrijheid / maand op koers' },
    { key: 'progress', value: `${round0(freedomPct)}%`, sub: 'van doelvermogen' },
    { key: 'passive_income', value: passiveMonthly > 0 ? formatEurShort(passiveMonthly) : '—', sub: 'netto/mnd, geïndexeerd' },
  ]
}

function buildSensitivity(ctx: EngineContext, baseFireAge: number | null): ReportSensitivityRow[] {
  const baseStrategy: FireStrategyConfig = { strategy: 'deplete', endAge: REPORT_END_AGE, legacyAmount: 0 }
  const runFire = (overrides: Parameters<typeof buildEngineInput>[3]): number | null => {
    const r = safeLedger(buildEngineInput(ctx, WITHDRAWAL_DEFAULTS, baseStrategy, overrides))
    return r?.fireReachable ? r.fireAge : null
  }

  // 1) Spaarquote +4pp: hogere annualSavings (inkomen × (quote+4)%).
  const higherSavings = Math.max(0, ctx.netMonthlyIncome * 12 * ((ctx.savingsRatePct + 4) / 100))
  // 2) Rendement +1pp. 3) Uitgaven +€200/mnd. 4) +€20k eenmalig beleggen.
  const levers: { lever: string; fireAge: number | null }[] = [
    { lever: 'Spaarquote +4pp', fireAge: runFire({ annualSavings: higherSavings }) },
    { lever: 'Rendement +1pp', fireAge: runFire({ returnDelta: 0.01 }) },
    { lever: 'Uitgaven +€200/mnd', fireAge: runFire({ extraYearlyExpenses: 200 * 12 }) },
    { lever: 'Eenmalig +€20k beleggen', fireAge: runFire({ lumpSum: 20_000 }) },
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
  const years = Math.floor(abs)
  const months = Math.round((abs - years) * 12)
  const parts: string[] = []
  if (years > 0) parts.push(`${years} jr`)
  parts.push(`${months} mnd`)
  const sign = deltaYears === 0 ? '' : better ? '−' : '+'
  return { lever, effectLabel: deltaYears === 0 ? 'geen verschil' : `${sign}${parts.join(' ')}`, better }
}

function buildWithdrawalStrategies(ctx: EngineContext): ReportWithdrawalRow[] {
  // SWR 3,5% (static), VPW (alleen deplete), Guyton-Klinger (guardrails).
  const depleteStrategy: FireStrategyConfig = { strategy: 'deplete', endAge: REPORT_END_AGE, legacyAmount: 0 }

  const runYear1 = (wd: WithdrawalStrategyConfig): { year1: number; reachable: boolean } => {
    const r = safeLedger(buildEngineInput(ctx, wd, depleteStrategy))
    if (!r || !r.fireReachable) return { year1: 0, reachable: false }
    return { year1: firstWithdrawalFromLedger(r), reachable: true }
  }

  const swr = runYear1({ ...WITHDRAWAL_DEFAULTS, strategy: 'static' })
  const vpw = runYear1({ ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' })
  const gk = runYear1({ ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' })

  return [
    {
      strategy: 'Vast (SWR)', year1: round0(swr.year1),
      sustainableUntil: swr.reachable ? '90+' : '—', risk: 'green', riskLabel: 'laag',
    },
    {
      strategy: 'VPW (herrekend)', year1: round0(vpw.year1),
      sustainableUntil: vpw.reachable ? 'levenslang' : '—', risk: 'amber', riskLabel: 'variabel',
    },
    {
      strategy: 'Guyton-Klinger', year1: round0(gk.year1),
      sustainableUntil: gk.reachable ? '90+' : '—', risk: 'green', riskLabel: 'laag',
    },
  ]
}

function buildLifePath(
  ctx: EngineContext,
  ledger: HorizonLedgerResult | null,
  fireAge: number | null,
): CheckReportData['lifePath'] {
  // De engine-pot heeft de eigen woning gefilterd; voor de NETTO-vermogen-lijn
  // (incl. huis, conform DTO) tellen we de meegroeiende overwaarde er per jaar
  // weer bij op — via de canonieke helpers (geen eigen WOZ/groeiformule). Dit
  // spiegelt buildSimNetWorthRows (calc 'sim-netto-vermogen-projectie').
  const houseEquityAt = (age: number): number => {
    if (!ctx.housingContext.hasEigenHuis) return 0
    const monthsForward = Math.max(0, (age - ctx.age) * 12)
    const house = projectEigenHuisValuesAt(ctx.housingContext.eigenHuisAssets, monthsForward)
    const mortgage = projectMortgageStateAt(ctx.housingContext.eigenHuisMortgages, monthsForward)
    return Math.max(0, house.currentValue - mortgage.balance)
  }
  const points: ReportProjectionPoint[] = ledger
    ? ledger.rows.map((r) => ({ age: r.leeftijd, value: round0(r.nettoVermogen + houseEquityAt(r.leeftijd)) }))
    : []
  const markers = buildLifeMarkers(ctx, fireAge)
  // Piek-notitie: leeftijd waarop netto vermogen het hoogst is.
  let peakNote: string | undefined
  if (points.length > 0) {
    const peak = points.reduce((m, p) => (p.value > m.value ? p : m), points[0])
    peakNote = `Je vermogen piekt rond je ${peak.age}e.`
  }
  return { points, markers, fireAge, endAge: REPORT_END_AGE, peakNote }
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

  return markers.sort((a, b) => a.age - b.age)
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

function buildWillMoves(ctx: EngineContext, dailyExpense: number): CheckReportData['will']['moves'] {
  const moves: CheckReportData['will']['moves'] = []

  // Zet 1 — bufferoverschot boven 4 maanden laten werken.
  const bufferMonths = computeEmergencyFundMonths(
    [{ asset_type: 'cash', current_value: ctx.intake.emergencyFund }],
    0,
    ctx.monthlyExpenses,
  )
  if (bufferMonths > 4) {
    const surplus = Math.max(0, ctx.intake.emergencyFund - ctx.monthlyExpenses * 4)
    const gainDays = dailyExpense > 0 ? Math.round((surplus * ctx.grossReturn) / dailyExpense) : 0
    moves.push({
      title: 'Laat je bufferoverschot werken',
      body: `Je buffer dekt ${round1(bufferMonths)} maanden. Het deel boven 4 maanden (±${formatEurShort(surplus)}) staat stil — breng het naar je beleggingsdeel.`,
      gainLabel: `~${gainDays} dagen vrijheid / jaar`,
      gainDays,
      kind: 'freedom-days',
    })
  }

  // Zet 2 — duurste schuldpost boven het verwachte rendement aflossen.
  const expensiveDebt = ctx.portfolio.debts
    .filter((d) => d.current_balance > 0 && d.interest_rate / 100 > ctx.grossReturn)
    .sort((a, b) => b.interest_rate - a.interest_rate)[0]
  if (expensiveDebt) {
    const annualInterest = expensiveDebt.current_balance * (expensiveDebt.interest_rate / 100)
    const gainDays = dailyExpense > 0 ? Math.round(annualInterest / dailyExpense) : 0
    moves.push({
      title: 'Los je duurste schuldpost eerst af',
      body: `één post (${expensiveDebt.name}) heeft een rente hoger dan je verwachte rendement. Elke euro die je daar aflost levert gegarandeerd meer op dan beleggen.`,
      gainLabel: `~${gainDays} dagen vrijheid / jaar`,
      gainDays,
      kind: 'freedom-days',
    })
  }

  // Zet 3 — spaarquote +4pp.
  moves.push({
    title: `Til je spaarquote van ${round0(ctx.savingsRatePct)}% naar ${round0(ctx.savingsRatePct + 4)}%`,
    body: 'Vier procentpunt klinkt klein, maar over de jaren schuift het je FIRE-moment merkbaar naar voren. Eén automatische verhoging bij je volgende salarisstap doet het meeste werk.',
    gainLabel: 'FIRE eerder',
    kind: 'fire-months',
  })

  return moves
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
