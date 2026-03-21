/**
 * Asset types, default seed data, and projection calculations.
 */

// ── Types ────────────────────────────────────────────────────

export type AssetType =
  | 'cash'
  | 'savings'
  | 'investment'
  | 'retirement'
  | 'eigen_huis'
  | 'real_estate'
  | 'crypto'
  | 'vehicle'
  | 'physical'
  | 'deelneming'
  | 'levensverzekering'
  | 'vordering'
  | 'other'

export type RiskProfile = 'laag' | 'middel' | 'hoog'
export type RetirementProviderType = 'bedrijfspensioenfonds' | 'verzekeraar' | 'ppi'

export type CashSubtype = 'checking' | 'savings_account' | 'joint' | 'business' | 'other_cash'
export type SavingsSubtype = 'vrij_opneembaar' | 'deposito' | 'termijndeposito'
export type InvestmentSubtype = 'etf' | 'indexfonds' | 'aandelen' | 'obligaties' | 'mixed'
export type RetirementSubtype = 'uitkeringsregeling' | 'premieregeling' | 'lijfrente'
export type RealEstateSubtype = 'beleggingspand' | 'grond' | 'recreatiewoning'
export type CryptoSubtype = 'bitcoin' | 'ethereum' | 'altcoins' | 'stablecoins' | 'defi'
export type VehicleSubtype = 'auto_eigendom' | 'auto_financial_lease' | 'motor' | 'camper'
export type PhysicalSubtype = 'kunst' | 'sieraden' | 'inboedel' | 'verzameling'
export type DeelnemingSubtype = 'holding_bv' | 'familie_bv' | 'startup' | 'overig_belang'
export type LevensverzekeringSubtype = 'kapitaalverzekering' | 'uitvaartverzekering' | 'gemengde_polis' | 'overig_verzekering'
export type VorderingSubtype = 'lening_derden' | 'dga_lening' | 'familielening' | 'overig_vordering'

export type AssetSubtype =
  | CashSubtype
  | SavingsSubtype
  | InvestmentSubtype
  | RetirementSubtype
  | RealEstateSubtype
  | CryptoSubtype
  | VehicleSubtype
  | PhysicalSubtype
  | DeelnemingSubtype
  | LevensverzekeringSubtype
  | VorderingSubtype

export interface Asset {
  id: string
  user_id: string
  name: string
  asset_type: AssetType
  current_value: number
  purchase_value: number
  purchase_date: string | null
  expected_return: number // annual %
  monthly_contribution: number
  institution: string | null
  account_number: string | null
  notes: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Type-specific fields
  subtype: string | null
  risk_profile: RiskProfile | null
  tax_benefit: boolean | null
  is_liquid: boolean | null
  lock_end_date: string | null
  ticker_symbol: string | null
  rental_income: number | null
  woz_value: number | null
  retirement_provider_type: RetirementProviderType | null
  depreciation_rate: number | null
  address_postcode: string | null
  address_house_number: string | null
  expiry_date: string | null
  beneficiary: string | null
  // Deelneming fields
  kvk_number: string | null
  ownership_percentage: number | null
  annual_dividend: number | null
  // Vordering fields
  linked_asset_id: string | null
  // Household fields
  ownership: 'personal' | 'shared'
  household_id: string | null
  // Net worth inclusion
  net_worth_inclusion_pct: number // 0–100, default 100
  // Budget tracking (cash assets)
  has_budget_tracking: boolean
  // Holdings tracking (investment assets managed by portfolio tracker)
  has_holdings_tracking?: boolean
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  cash: 'Cash / Bankrekeningen',
  savings: 'Spaargeld',
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  eigen_huis: 'Eigen woning',
  real_estate: 'Vastgoed (belegging)',
  crypto: 'Crypto',
  vehicle: 'Voertuig',
  physical: 'Fysieke bezittingen',
  deelneming: 'Deelneming / Aanmerkelijk belang',
  levensverzekering: 'Levensverzekering',
  vordering: 'Vordering / Lening u/g',
  other: 'Overig',
}

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  cash: 'Wallet',
  savings: 'PiggyBank',
  investment: 'TrendingUp',
  retirement: 'Vault',
  eigen_huis: 'Home',
  real_estate: 'Building',
  crypto: 'Bitcoin',
  vehicle: 'Car',
  physical: 'Gem',
  deelneming: 'Building2',
  levensverzekering: 'Shield',
  vordering: 'HandCoins',
  other: 'Briefcase',
}

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  cash: '#22c55e',
  savings: '#3b82f6',
  investment: '#10b981',
  retirement: '#8b5cf6',
  eigen_huis: '#d97706',
  real_estate: '#f59e0b',
  crypto: '#f97316',
  vehicle: '#6366f1',
  physical: '#ec4899',
  deelneming: '#0d9488',
  levensverzekering: '#7c3aed',
  vordering: '#0ea5e9',
  other: '#71717a',
}

/** Typical annual return expectations per asset type (for default suggestions) */
export const TYPICAL_RETURNS: Record<AssetType, number> = {
  cash: 0,
  savings: 2.5,
  investment: 7,
  retirement: 6,
  eigen_huis: 3.5,
  real_estate: 3.5,
  crypto: 0, // too volatile to estimate
  vehicle: -15, // depreciates
  physical: 0,
  deelneming: 0, // waarde is intrinsiek — handmatige waardering
  levensverzekering: 1.5, // conservatief rendement op opbouwwaarde
  vordering: 3, // rente op uitstaande leningen (typisch 2-4%)
  other: 0,
}

// ── Subtypes ─────────────────────────────────────────────────

/** Which asset types have subtypes */
export const ASSET_SUBTYPE_LABELS: Partial<Record<AssetType, Record<string, string>>> = {
  cash: {
    checking: 'Betaalrekening',
    savings_account: 'Spaarrekening',
    joint: 'En/of-rekening',
    business: 'Zakelijke rekening',
    other_cash: 'Overig',
  },
  savings: {
    vrij_opneembaar: 'Vrij opneembaar',
    deposito: 'Deposito',
    termijndeposito: 'Termijndeposito',
  },
  investment: {
    etf: 'ETF',
    indexfonds: 'Indexfonds',
    aandelen: 'Aandelen',
    obligaties: 'Obligaties',
    mixed: 'Mixed',
  },
  retirement: {
    uitkeringsregeling: 'Uitkeringsregeling (DB)',
    premieregeling: 'Premieregeling (DC)',
    lijfrente: 'Lijfrente',
  },
  real_estate: {
    beleggingspand: 'Beleggingspand',
    grond: 'Grond',
    recreatiewoning: 'Recreatiewoning',
  },
  crypto: {
    bitcoin: 'Bitcoin',
    ethereum: 'Ethereum',
    altcoins: 'Altcoins',
    stablecoins: 'Stablecoins',
    defi: 'DeFi',
  },
  vehicle: {
    auto_eigendom: 'Auto (eigendom)',
    auto_financial_lease: 'Auto (financial lease)',
    motor: 'Motor',
    camper: 'Camper',
  },
  physical: {
    kunst: 'Kunst',
    sieraden: 'Sieraden',
    inboedel: 'Inboedel',
    verzameling: 'Verzameling',
  },
  deelneming: {
    holding_bv: 'Eigen holding BV',
    familie_bv: 'Familie-BV',
    startup: 'Startup deelneming',
    overig_belang: 'Overig aanmerkelijk belang',
  },
  levensverzekering: {
    kapitaalverzekering: 'Kapitaalverzekering',
    uitvaartverzekering: 'Uitvaartverzekering met opbouwwaarde',
    gemengde_polis: 'Gemengde polis',
    overig_verzekering: 'Overige levensverzekering',
  },
  vordering: {
    lening_derden: 'Lening aan derden',
    dga_lening: 'DGA-lening aan eigen BV',
    familielening: 'Familielening',
    overig_vordering: 'Overige vordering',
  },
}

export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = {
  laag: 'Laag',
  middel: 'Middel',
  hoog: 'Hoog',
}

export const RETIREMENT_PROVIDER_LABELS: Record<RetirementProviderType, string> = {
  bedrijfspensioenfonds: 'Bedrijfspensioenfonds',
  verzekeraar: 'Verzekeraar',
  ppi: 'PPI',
}

/** Default values applied when a subtype is selected */
export const ASSET_SUBTYPE_DEFAULTS: Record<string, Partial<{
  expected_return: number
  risk_profile: RiskProfile
  is_liquid: boolean
  tax_benefit: boolean
}>> = {
  // Cash
  checking: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  savings_account: { risk_profile: 'laag', is_liquid: true, expected_return: 2.5 },
  joint: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  business: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  other_cash: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  // Savings
  vrij_opneembaar: { risk_profile: 'laag', is_liquid: true, expected_return: 2.5 },
  deposito: { risk_profile: 'laag', is_liquid: false, expected_return: 3.5 },
  termijndeposito: { risk_profile: 'laag', is_liquid: false, expected_return: 3.0 },
  // Investment
  etf: { risk_profile: 'middel', expected_return: 7 },
  indexfonds: { risk_profile: 'middel', expected_return: 7 },
  aandelen: { risk_profile: 'hoog', expected_return: 8 },
  obligaties: { risk_profile: 'laag', expected_return: 3.5 },
  mixed: { risk_profile: 'middel', expected_return: 5.5 },
  // Retirement
  uitkeringsregeling: { risk_profile: 'laag', tax_benefit: true, expected_return: 5 },
  premieregeling: { risk_profile: 'middel', tax_benefit: true, expected_return: 6 },
  lijfrente: { risk_profile: 'laag', tax_benefit: true, expected_return: 4 },
  // Crypto
  bitcoin: { risk_profile: 'hoog', expected_return: 0 },
  ethereum: { risk_profile: 'hoog', expected_return: 0 },
  altcoins: { risk_profile: 'hoog', expected_return: 0 },
  stablecoins: { risk_profile: 'laag', expected_return: 3 },
  defi: { risk_profile: 'hoog', expected_return: 0 },
  // Deelneming
  holding_bv: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  familie_bv: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  startup: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  overig_belang: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  // Levensverzekering
  kapitaalverzekering: { risk_profile: 'laag', is_liquid: false, expected_return: 1.5 },
  uitvaartverzekering: { risk_profile: 'laag', is_liquid: false, expected_return: 1 },
  gemengde_polis: { risk_profile: 'middel', is_liquid: false, expected_return: 1.5 },
  overig_verzekering: { risk_profile: 'laag', is_liquid: false, expected_return: 1.5 },
  // Vordering
  lening_derden: { risk_profile: 'middel', is_liquid: false, expected_return: 4 },
  dga_lening: { risk_profile: 'middel', is_liquid: false, expected_return: 2.5 },
  familielening: { risk_profile: 'middel', is_liquid: false, expected_return: 2 },
  overig_vordering: { risk_profile: 'middel', is_liquid: false, expected_return: 3 },
}

/** Which type-specific fields to show per asset_type */
export const ASSET_TYPE_FIELDS: Record<AssetType, string[]> = {
  cash: ['subtype', 'is_liquid'],
  savings: ['subtype', 'is_liquid', 'lock_end_date'],
  investment: ['subtype', 'risk_profile', 'ticker_symbol'],
  retirement: ['subtype', 'risk_profile', 'tax_benefit', 'retirement_provider_type'],
  eigen_huis: ['woz_value', 'rental_income', 'address_postcode', 'address_house_number'],
  real_estate: ['subtype', 'rental_income', 'woz_value'],
  crypto: ['subtype', 'risk_profile', 'ticker_symbol'],
  vehicle: ['subtype', 'depreciation_rate'],
  physical: ['subtype'],
  deelneming: ['subtype', 'institution', 'kvk_number', 'ownership_percentage', 'annual_dividend', 'risk_profile'],
  levensverzekering: ['subtype', 'risk_profile', 'is_liquid', 'expiry_date', 'beneficiary'],
  vordering: ['subtype', 'institution', 'lock_end_date'],
  other: [],
}

// ── Projection calculations ──────────────────────────────────

export interface ProjectionMonth {
  month: number
  date: string
  value: number
  contribution: number
  growth: number
}

/**
 * Project an asset's value into the future, accounting for:
 * - Monthly compounding of expected return
 * - Monthly contributions
 * Returns month-by-month for `months` months.
 */
export function projectAsset(
  currentValue: number,
  annualReturn: number,
  monthlyContribution: number,
  months: number,
  startDate: Date = new Date(),
): ProjectionMonth[] {
  const monthlyRate = annualReturn / 100 / 12
  const rows: ProjectionMonth[] = []
  let value = currentValue

  for (let m = 1; m <= months; m++) {
    const growth = value * monthlyRate
    value = value + growth + monthlyContribution

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + m)

    rows.push({
      month: m,
      date: date.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
      contribution: monthlyContribution,
      growth: Math.round(growth * 100) / 100,
    })
  }

  return rows
}

/**
 * Project total portfolio value over time.
 */
export function projectPortfolio(
  assets: Asset[],
  months: number,
): { month: number; date: string; total: number; byType: Record<AssetType, number> }[] {
  const activeAssets = assets.filter((a) => a.is_active)
  if (activeAssets.length === 0) return []

  const projections = activeAssets.map((a) => ({
    asset: a,
    rows: projectAsset(
      Number(a.current_value),
      Number(a.expected_return),
      Number(a.monthly_contribution),
      months,
    ),
  }))

  const now = new Date()
  const result: { month: number; date: string; total: number; byType: Record<AssetType, number> }[] = []

  for (let m = 0; m < months; m++) {
    const byType: Record<AssetType, number> = {
      cash: 0, savings: 0, investment: 0, retirement: 0, eigen_huis: 0, real_estate: 0,
      crypto: 0, vehicle: 0, physical: 0, deelneming: 0, levensverzekering: 0, vordering: 0, other: 0,
    }
    let total = 0
    for (const p of projections) {
      const val = p.rows[m]?.value ?? Number(p.asset.current_value)
      byType[p.asset.asset_type] += val
      total += val
    }

    const date = new Date(now)
    date.setMonth(date.getMonth() + m + 1)

    result.push({
      month: m + 1,
      date: date.toISOString().split('T')[0],
      total: Math.round(total),
      byType,
    })
  }

  return result
}

// ── Seed data ────────────────────────────────────────────────

export interface DefaultAsset {
  name: string
  asset_type: AssetType
  current_value: number
  purchase_value: number
  purchase_date: string
  expected_return: number
  monthly_contribution: number
  institution: string
  // Type-specific fields (all optional for seed data)
  subtype?: string
  risk_profile?: RiskProfile
  tax_benefit?: boolean
  is_liquid?: boolean
  lock_end_date?: string
  ticker_symbol?: string
  rental_income?: number
  woz_value?: number
  retirement_provider_type?: RetirementProviderType
  depreciation_rate?: number
  address_postcode?: string
  address_house_number?: string
}

export function getDefaultAssets(): DefaultAsset[] {
  return [
    {
      name: 'Spaarrekening',
      asset_type: 'savings',
      current_value: 8500,
      purchase_value: 0,
      purchase_date: '2020-01-01',
      expected_return: 2.5,
      monthly_contribution: 100,
      institution: 'ABN AMRO',
      subtype: 'vrij_opneembaar',
      risk_profile: 'laag',
      is_liquid: true,
    },
    {
      name: 'DEGIRO Beleggingsrekening',
      asset_type: 'investment',
      current_value: 12400,
      purchase_value: 9600,
      purchase_date: '2022-03-01',
      expected_return: 7,
      monthly_contribution: 80,
      institution: 'DEGIRO',
      subtype: 'etf',
      risk_profile: 'middel',
      ticker_symbol: 'VWRL',
    },
    {
      name: 'Pensioenfonds',
      asset_type: 'retirement',
      current_value: 34000,
      purchase_value: 0,
      purchase_date: '2018-09-01',
      expected_return: 6,
      monthly_contribution: 0,
      institution: 'ABP',
      subtype: 'uitkeringsregeling',
      risk_profile: 'laag',
      tax_benefit: true,
      retirement_provider_type: 'bedrijfspensioenfonds',
    },
    {
      name: 'Eigen woning',
      asset_type: 'eigen_huis',
      current_value: 340000,
      purchase_value: 285000,
      purchase_date: '2020-06-01',
      expected_return: 3.5,
      monthly_contribution: 0,
      institution: '',
      woz_value: 340000,
      address_postcode: '3511 AB',
      address_house_number: '12',
    },
    {
      name: 'Auto',
      asset_type: 'vehicle',
      current_value: 8500,
      purchase_value: 18000,
      purchase_date: '2022-05-01',
      expected_return: -15,
      monthly_contribution: 0,
      institution: '',
      subtype: 'auto_eigendom',
      depreciation_rate: 15,
    },
  ]
}
