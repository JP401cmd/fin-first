/**
 * Voorbeeld-persona + input-builder voor de Horizon-tabel-inspector.
 *
 * De grootboek-engine is puur (geen Supabase), dus we draaien 'm client-side op
 * deze representatieve persona. Zelfde cijfers als het referentieprototype
 * (tf-horizon_4.html): netto ~€284k, twee hypotheken, beleggingsinleg, DGA-lening.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType, RepaymentType } from '@/lib/debt-data'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import type { SimCashflow } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { WithdrawalStrategyType } from '@/lib/withdrawal-strategy'

function mkAsset(p: {
  id: string
  name: string
  asset_type: AssetType
  current_value: number
  expected_return?: number
  monthly_contribution?: number
  depreciation_rate?: number | null
}): Asset {
  return {
    id: p.id,
    user_id: 'persona',
    name: p.name,
    asset_type: p.asset_type,
    current_value: p.current_value,
    purchase_value: p.current_value,
    purchase_date: null,
    expected_return: p.expected_return ?? 0,
    monthly_contribution: p.monthly_contribution ?? 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: p.depreciation_rate ?? null,
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
    has_budget_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  }
}

function mkDebt(p: {
  id: string
  name: string
  debt_type: DebtType
  current_balance: number
  interest_rate: number
  monthly_payment: number
  repayment_type: RepaymentType
  is_tax_deductible?: boolean
}): Debt {
  return {
    id: p.id,
    user_id: 'persona',
    name: p.name,
    debt_type: p.debt_type,
    original_amount: p.current_balance,
    current_balance: p.current_balance,
    interest_rate: p.interest_rate,
    minimum_payment: p.monthly_payment,
    monthly_payment: p.monthly_payment,
    start_date: '2020-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    is_tax_deductible: p.is_tax_deductible ?? false,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: p.repayment_type,
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

export const PERSONA_ASSETS: Asset[] = [
  mkAsset({ id: 'a-cash', name: 'Cash / bankrekeningen', asset_type: 'cash', current_value: 22_300, expected_return: 0 }),
  mkAsset({ id: 'a-bel', name: 'Beleggingen (Meesman)', asset_type: 'investment', current_value: 68_000, expected_return: 7, monthly_contribution: 400 }),
  mkAsset({ id: 'a-crypto', name: 'Crypto', asset_type: 'crypto', current_value: 25_510, expected_return: 0 }),
  mkAsset({ id: 'a-huis', name: 'Woning Utrecht', asset_type: 'eigen_huis', current_value: 399_000, expected_return: 2 }),
  mkAsset({ id: 'a-auto', name: 'Voertuig', asset_type: 'vehicle', current_value: 7_000, depreciation_rate: 12 }),
]

export const PERSONA_DEBTS: Debt[] = [
  mkDebt({ id: 'd-hyp1', name: 'Hypotheek 1', debt_type: 'mortgage', current_balance: 172_737, interest_rate: 3.9, monthly_payment: 1038, repayment_type: 'annuiteit', is_tax_deductible: true }),
  mkDebt({ id: 'd-hyp2', name: 'Hypotheek 2', debt_type: 'mortgage', current_balance: 50_000, interest_rate: 2.0, monthly_payment: 185, repayment_type: 'annuiteit', is_tax_deductible: true }),
  mkDebt({ id: 'd-dga', name: 'DGA-lening', debt_type: 'dga_schuld', current_balance: 15_000, interest_rate: 0, monthly_payment: 125, repayment_type: 'lineair' }),
]

export const PERSONA_EVENTS: SimCashflow[] = [
  { id: 'e-auto', name: 'Auto vervangen', type: 'one_time', direction: 'expense', amount: 18_000, fromAge: 45, toAge: null, indexed: false },
  { id: 'e-bruiloft', name: 'Bruiloft / mijlpaal', type: 'one_time', direction: 'expense', amount: 8_000, fromAge: 50, toAge: null, indexed: false },
  { id: 'e-verbouwing', name: 'Verbouwing', type: 'one_time', direction: 'expense', amount: 28_000, fromAge: 55, toAge: null, indexed: false },
  { id: 'e-schenking', name: 'Schenking kinderen', type: 'one_time', direction: 'expense', amount: 24_000, fromAge: 60, toAge: null, indexed: false },
]

export interface InspectorParams {
  currentAge: number
  endAge: number
  grossReturn: number // decimaal
  inflation: number // decimaal
  yearlyExpenses: number
  monthlyIncome: number // bruto
  annualSavings: number
  aowPerYear: number
  pensionPerYear: number
  endStrategy: FireEndStrategy
  legacyAmount: number
  withdrawalStrategy: WithdrawalStrategyType
  eventsOn: boolean
  hasPartner: boolean
}

export const DEFAULT_PARAMS: InspectorParams = {
  currentAge: 38,
  endAge: 90,
  grossReturn: 0.07,
  inflation: 0.02,
  yearlyExpenses: 32_000,
  monthlyIncome: 7_917,
  annualSavings: 18_000,
  aowPerYear: 15_000,
  pensionPerYear: 8_000,
  endStrategy: 'perpetual',
  legacyAmount: 0,
  withdrawalStrategy: 'static',
  eventsOn: true,
  hasPartner: false,
}

const AOW_AGE = 67

/** Bouw een drop-in `UnifiedProjectionInput` uit de persona + sidebar-parameters. */
export function buildPersonaInput(p: InspectorParams): UnifiedProjectionInput {
  const cashflows: SimCashflow[] = [
    // Recurring `amount` is per CONVENTIE een MAANDbedrag (zie lifeEventsToCashflows
    // / computeAowMonthly; beide engines verwachten maand). De parameters zijn als
    // jaarbedrag ingevoerd → delen door 12.
    { id: 'cf-aow', name: 'AOW', type: 'recurring', direction: 'income', amount: p.aowPerYear / 12, fromAge: AOW_AGE, toAge: null, indexed: true },
    { id: 'cf-pension', name: 'Aanvullend pensioen', type: 'recurring', direction: 'income', amount: p.pensionPerYear / 12, fromAge: AOW_AGE, toAge: null, indexed: true },
    ...(p.eventsOn ? PERSONA_EVENTS : []),
  ]
  return {
    assets: PERSONA_ASSETS,
    debts: PERSONA_DEBTS,
    currentAge: p.currentAge,
    endAge: p.endAge,
    yearlyExpenses: p.yearlyExpenses,
    annualSavings: p.annualSavings,
    monthlySurplus: p.annualSavings / 12,
    monthlyIncome: p.monthlyIncome,
    incomeGrowthRate: 0,
    grossReturn: p.grossReturn,
    inflationRate: p.inflation,
    box3Method: 'forfaitair',
    cashflows,
    strategyConfig: { strategy: p.endStrategy, endAge: p.endAge, legacyAmount: p.legacyAmount },
    withdrawalStrategy: { ...WITHDRAWAL_DEFAULTS, strategy: p.withdrawalStrategy },
    forcedFireAge: p.endStrategy === 'pensioen' ? AOW_AGE : undefined,
    hasPartner: p.hasPartner,
  }
}
