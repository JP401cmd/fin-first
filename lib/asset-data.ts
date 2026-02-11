/**
 * Asset types, default seed data, and projection calculations.
 */

// ── Types ────────────────────────────────────────────────────

export type AssetType =
  | 'savings'
  | 'investment'
  | 'retirement'
  | 'real_estate'
  | 'crypto'
  | 'vehicle'
  | 'physical'
  | 'other'

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
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  savings: 'Spaargeld',
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  real_estate: 'Vastgoed',
  crypto: 'Crypto',
  vehicle: 'Voertuig',
  physical: 'Fysieke bezittingen',
  other: 'Overig',
}

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  savings: 'PiggyBank',
  investment: 'TrendingUp',
  retirement: 'Vault',
  real_estate: 'Building',
  crypto: 'Bitcoin',
  vehicle: 'Car',
  physical: 'Gem',
  other: 'Briefcase',
}

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  savings: '#3b82f6',
  investment: '#10b981',
  retirement: '#8b5cf6',
  real_estate: '#f59e0b',
  crypto: '#f97316',
  vehicle: '#6366f1',
  physical: '#ec4899',
  other: '#71717a',
}

/** Typical annual return expectations per asset type (for default suggestions) */
export const TYPICAL_RETURNS: Record<AssetType, number> = {
  savings: 2.5,
  investment: 7,
  retirement: 6,
  real_estate: 3.5,
  crypto: 0, // too volatile to estimate
  vehicle: -15, // depreciates
  physical: 0,
  other: 0,
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
      savings: 0, investment: 0, retirement: 0, real_estate: 0,
      crypto: 0, vehicle: 0, physical: 0, other: 0,
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
    },
    {
      name: 'Woning (overwaarde)',
      asset_type: 'real_estate',
      current_value: 45000,
      purchase_value: 285000,
      purchase_date: '2020-06-01',
      expected_return: 3.5,
      monthly_contribution: 0,
      institution: '',
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
    },
  ]
}
