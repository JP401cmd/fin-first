/**
 * Persona → horizon-rekenmotor-fixture adapter.
 *
 * Zet de seedbare "Tessa Compleet"-persona (`PERSONAS.compleet` in
 * `lib/test-personas.ts`) om naar de volledige `Asset[]` / `Debt[]` /
 * `LifeEvent[]` / `FinancialInput` die `buildHorizonInput` verwacht. Eén bron:
 * dezelfde persona die je op `/beheer/testdata` in de database kunt laden voedt
 * de horizon-strategie-regressietest (zie `matrix.ts`).
 *
 * DETERMINISME (golden-waarden mogen niet driften met de kalender):
 *   - `currentAge` komt in `buildHorizonInput` uit `ageAtDate(dateOfBirth)` —
 *     een geheel jaar t.o.v. *vandaag*. We pinnen daarom `dateOfBirth` op
 *     1 januari, `pinnedAge` jaar geleden (runtime berekend). `ageAtDate` geeft
 *     dan elke dag exact `pinnedAge`.
 *   - Hypotheek-`end_date = null` → vermijdt het `Date.now()`-pad in
 *     `projectMortgageDetailsAt`.
 * De motor zelf rekent in leeftijd-ruimte en is verder deterministisch.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType, RepaymentType } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import type { FinancialInput, LifeEvent } from '@/lib/horizon-data'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import {
  PERSONAS,
  type PersonaAsset,
  type PersonaDebt,
  type PersonaLifeEvent,
} from '@/lib/test-personas'

/** Leeftijd waarop we de persona pinnen voor de projectie (zie determinisme). */
export const COMPLEET_PINNED_AGE = 42

/**
 * Jaarlijkse pensioen-uitgaven (geïndexeerd, "must"-niveau) die de FIRE-pot moet
 * dekken. Drijft het doelbedrag (`requiredFirePortfolio ≈ yearlyExpenses / SWR`).
 * Bewust iets onder de huidige volledige uitgaven: in de FIRE-fase vallen
 * hypotheek-aflossing en kindkosten weg.
 */
export const COMPLEET_RETIREMENT_YEARLY_EXPENSES = 48_000

export interface CompleetHorizonFixture {
  financialInput: FinancialInput
  assets: Asset[]
  debts: Debt[]
  lifeEvents: LifeEvent[]
  hasPartner: boolean
  box3Method: Box3Method
  /** Jaarlijks spaarbedrag (inkomen − uitgaven), expliciet doorgegeven aan buildHorizonInput. */
  baseAnnualSavingsFromCashflow: number
  grossReturn: number
  inflation: number
  /** De gepinde leeftijd waarmee de fixture is gebouwd (= currentAge in de motor). */
  currentAge: number
}

/** kebab-case id uit een entiteitsnaam (stabiel; geen Date/Random). */
function slugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${slug}`
}

/** Gepinde geboortedatum zodat `ageAtDate` elke dag exact `age` teruggeeft. */
function pinnedDateOfBirth(age: number): string {
  const now = new Date()
  // 1 januari, `age` jaar geleden → ageAtDate() = age (geen verjaardag-flip).
  const dob = new Date(now.getFullYear() - age, 0, 1)
  return dob.toISOString().slice(0, 10)
}

function toAsset(p: PersonaAsset): Asset {
  return {
    id: slugId('asset', p.name),
    user_id: 'persona-compleet',
    name: p.name,
    asset_type: p.asset_type as AssetType,
    current_value: p.current_value,
    purchase_value: p.purchase_value,
    purchase_date: p.purchase_date ?? null,
    expected_return: p.expected_return,
    monthly_contribution: p.monthly_contribution,
    institution: p.institution || null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: p.subtype ?? null,
    risk_profile: (p.risk_profile as Asset['risk_profile']) ?? null,
    tax_benefit: p.tax_benefit ?? null,
    is_liquid: p.is_liquid ?? null,
    lock_end_date: p.lock_end_date ?? null,
    ticker_symbol: p.ticker_symbol ?? null,
    rental_income: p.rental_income ?? null,
    woz_value: p.woz_value ?? null,
    retirement_provider_type: (p.retirement_provider_type as Asset['retirement_provider_type']) ?? null,
    depreciation_rate: p.depreciation_rate ?? null,
    address_postcode: p.address_postcode ?? null,
    address_house_number: p.address_house_number ?? null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_holdings_tracking: p.has_holdings_tracking ?? false,
    has_woonbalans_tracking: p.has_woonbalans_tracking ?? false,
    has_rental_tracking: p.has_rental_tracking ?? false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  }
}

function toDebt(p: PersonaDebt, assetIdByName: Map<string, string>): Debt {
  return {
    id: slugId('debt', p.name),
    user_id: 'persona-compleet',
    name: p.name,
    debt_type: p.debt_type as DebtType,
    original_amount: p.original_amount,
    current_balance: p.current_balance,
    interest_rate: p.interest_rate,
    minimum_payment: p.minimum_payment,
    monthly_payment: p.monthly_payment,
    start_date: p.start_date,
    end_date: null, // determinisme — geen Date.now()-pad in projectMortgageDetailsAt
    creditor: p.creditor || null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: p.subtype ?? null,
    is_tax_deductible: p.is_tax_deductible ?? false,
    fixed_rate_end_date: null,
    nhg: p.nhg ?? null,
    linked_asset_id: p.linked_asset_name ? assetIdByName.get(p.linked_asset_name) ?? null : null,
    credit_limit: p.credit_limit ?? null,
    repayment_type: (p.repayment_type as RepaymentType) ?? null,
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
    has_hypotheekplanner_tracking: p.has_hypotheekplanner_tracking ?? false,
  }
}

function toLifeEvent(p: PersonaLifeEvent): LifeEvent {
  return {
    id: slugId('event', p.name),
    name: p.name,
    event_type: p.event_type,
    target_age: p.target_age,
    target_date: p.target_date,
    one_time_cost: p.one_time_cost,
    monthly_cost_change: p.monthly_cost_change,
    monthly_income_change: p.monthly_income_change,
    duration_months: p.duration_months,
    icon: p.icon,
    is_active: p.is_active,
    sort_order: p.sort_order,
    is_indexed: p.is_indexed ?? false,
    metadata: p.metadata,
  }
}

/**
 * Bouw de drop-in fixture voor `buildHorizonInput` uit de complete persona.
 * `pinnedAge` bepaalt de (deterministische) huidige leeftijd in de projectie.
 */
/**
 * Generieke, niet-liquide bezitting-typen die `build-input.ts` (ADR 0020) bij een
 * ONTBREKENDE `sale_config` standaard op `wanneer_nodig` (on_demand-liquidatie) zet —
 * en die de horizon-kernel NIET kan uitdrukken (`detectV2OnlyMachinery` → v2-terugval).
 * Spiegelt `build-input.ts#LIQUIDATABLE_NON_LIQUID` / `adapter/potten.ts`.
 */
const FIXTURE_GENERIC_NON_LIQUID: ReadonlySet<AssetType> = new Set<AssetType>([
  'vehicle',
  'physical',
  'other',
  'deelneming',
  'real_estate',
])

/**
 * Bouw de drop-in fixture voor `buildHorizonInput` uit de complete persona.
 * `pinnedAge` bepaalt de (deterministische) huidige leeftijd in de projectie.
 *
 * KERNEL-EXPRESSEERBAARHEID (FASE 6, stap 2 — bewuste fixture-keuze, gedocumenteerd):
 * de persona draagt vijf generieke niet-liquide bezittingen (auto, kunst, BV-belang,
 * verhuurd appartement, aanhangwagen) zónder `sale_config`. `build-input.ts` geeft die
 * dan de resolve-time-default `wanneer_nodig` → een `on_demand`-`AssetLiquidation`, en
 * de convergentie-router valt daarop VERPLICHT terug op v2 (`detectV2OnlyMachinery` —
 * de kern kent geen dynamische liquidatie-trigger voor generieke potten). Om de matrix
 * daadwerkelijk op de KERNEL te meten (task-eis: engine === 'kernel'), pinnen we die
 * bezittingen op `niet_verkopen`: dan liquideert géén van beide motoren ze on-demand
 * (v2 én kernel houden ze als niet-liquide bezit in het grootboek — dezelfde
 * behandeling, eerlijke vergelijking). Dit is óók trouwer aan de persona-intentie
 * ("belegbaar vermogen vs. niet-liquide BV-belang en vastgoed" — die assets zijn
 * bewust NIET liquide). Gevolg: zowel de kernel- als de v2-goldens zijn t.o.v. de
 * pre-FASE-6-matrix her-gebaseerd (de v2-baseline verschuift doordat de generieke
 * on-demand-verkoop wegvalt) — zie de golden-blokken in `matrix.ts`.
 */
export function buildCompleetHorizonFixture(
  pinnedAge: number = COMPLEET_PINNED_AGE,
): CompleetHorizonFixture {
  const persona = PERSONAS.compleet
  const assets = persona.assets.map(toAsset).map((a) =>
    FIXTURE_GENERIC_NON_LIQUID.has(a.asset_type)
      ? ({ ...a, sale_config: { stand: 'niet_verkopen' } } as Asset)
      : a,
  )

  const assetIdByName = new Map<string, string>()
  for (let i = 0; i < persona.assets.length; i++) {
    assetIdByName.set(persona.assets[i].name, assets[i].id)
  }
  const resolvedDebts = persona.debts.map((d) => toDebt(d, assetIdByName))

  const lifeEvents = persona.life_events.map(toLifeEvent)

  const totalAssets = assets.reduce((s, a) => s + a.current_value, 0)
  const totalDebts = resolvedDebts.reduce((s, d) => s + d.current_balance, 0)
  const monthlyContributions = assets.reduce((s, a) => s + (a.monthly_contribution || 0), 0)

  const monthlyIncome = persona.profile.net_monthly_income ?? 0
  const monthlyExpenses = persona.profile.estimated_monthly_expenses ?? 0
  const baseAnnualSavingsFromCashflow = Math.max(0, (monthlyIncome - monthlyExpenses) * 12)

  const grossReturn = persona.profile.expected_return ?? 0.07
  const inflation = persona.profile.inflation_rate ?? 0.02

  const financialInput: FinancialInput = {
    totalAssets,
    totalDebts,
    monthlyIncome,
    monthlyExpenses,
    yearlyMustExpenses: COMPLEET_RETIREMENT_YEARLY_EXPENSES,
    monthlyContributions,
    dateOfBirth: pinnedDateOfBirth(pinnedAge),
    expectedReturn: grossReturn,
  }

  return {
    financialInput,
    assets,
    debts: resolvedDebts,
    lifeEvents,
    hasPartner: true,
    box3Method: 'forfaitair',
    baseAnnualSavingsFromCashflow,
    grossReturn,
    inflation,
    currentAge: pinnedAge,
  }
}

/**
 * Basis-profielrij voor de **horizon-kernel-arm** van de regressiematrix (FASE 6, stap 2).
 *
 * Spiegelt de context-assemblage van `/toekomst` (`use-horizon-fire-sim` +
 * `horizon-client`): de kernel-adapter leest ditzelfde profiel-rij-contract. De
 * combo-specifieke kolommen (`housing_strategy_config`, `fire_end_*`,
 * `withdrawal_profile_config`) worden in `matrix.ts#runComboKernel` overlay'd; deze
 * basis draagt alleen de persona-brede, combo-onafhankelijke velden.
 *
 * DETERMINISME + GRONDSLAG-PARITEIT met de v2-fixture:
 *  - `date_of_birth` = dezelfde GEPINDE datum als `financialInput.dateOfBirth`
 *    (NIET de echte persona-`date_of_birth` — zie determinisme-doc bovenaan), zodat
 *    `ageAtDate` in de kernel exact `pinnedAge` teruggeeft.
 *  - `retirement_expense_method: 'essential_budgets'` + `yearly_essential_expenses` =
 *    `COMPLEET_RETIREMENT_YEARLY_EXPENSES` (48.000): dezelfde pensioenuitgave-grondslag
 *    als de v2-fixture (`yearlyMustExpenses`) — identieke truc als `buildScalarAdapterInput`
 *    (`scalar-router.ts`) en `buildFeeKernelContext` (`fee-analysis.ts`).
 *  - rendement/inflatie/inkomen/uitgaven/box3/marginaal tarief uit de persona (één bron).
 *
 * AOW-rijen worden NIET meegegeven aan de context (`aowRows: []`) → de adapter valt
 * deterministisch terug op de canonieke AOW-leeftijd (fallback 67).
 */
export function buildCompleetKernelProfileBase(
  pinnedAge: number = COMPLEET_PINNED_AGE,
): ConvergentieRawProfileRow {
  const p = PERSONAS.compleet.profile
  return {
    date_of_birth: pinnedDateOfBirth(pinnedAge),
    net_monthly_income: p.net_monthly_income ?? 0,
    estimated_monthly_expenses: p.estimated_monthly_expenses ?? 0,
    yearly_essential_expenses: COMPLEET_RETIREMENT_YEARLY_EXPENSES,
    retirement_expense_method: 'essential_budgets',
    expected_return: p.expected_return ?? 0.07,
    inflation_rate: p.inflation_rate ?? 0.02,
    box3_method: 'forfaitair',
    marginaal_tarief: p.marginaal_tarief ?? null,
    withdrawal_strategy: p.withdrawal_strategy ?? 'static',
    feature_preferences: p.feature_preferences ?? null,
  }
}
