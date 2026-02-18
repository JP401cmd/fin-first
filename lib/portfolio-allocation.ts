/**
 * Portfolio allocation computation utilities.
 *
 * Pure functions for computing allocation slices and rebalancing suggestions.
 * Can be imported from both client components and server-side routes.
 */

// ── Types ────────────────────────────────────────────────────

export type AllocationViewMode = 'asset_class' | 'sector' | 'geography'

export type HoldingForAllocation = {
  id: string
  name: string
  ticker: string | null
  value: number
  // Classification fields
  asset_class?: string | null
  sector?: string | null
  geography?: string | null
}

export type TargetAllocation = {
  category: string
  target_pct: number
}

export type AllocationSlice = {
  key: string
  label: string
  value: number
  pct: number
  color: string
  holdingCount: number
}

export type RebalancingSuggestion = {
  category: string
  current_pct: number
  target_pct: number
  drift: number
  action: 'buy' | 'sell' | 'hold'
  amount: number
  label: string
}

// ── Constants ────────────────────────────────────────────────

export const ASSET_CLASS_LABELS: Record<string, string> = {
  aandelen: 'Aandelen',
  obligaties: 'Obligaties',
  vastgoed: 'Vastgoed',
  grondstoffen: 'Grondstoffen',
  crypto: 'Crypto',
  cash: 'Cash/Spaargeld',
  anders: 'Overig',
}

export const SECTOR_LABELS: Record<string, string> = {
  technologie: 'Technologie',
  financials: 'Financiële sector',
  gezondheidszorg: 'Gezondheidszorg',
  consument: 'Consumentengoederen',
  industrie: 'Industrie',
  energie: 'Energie',
  vastgoed: 'Vastgoed',
  telecom: 'Telecom',
  materialen: 'Materialen',
  nutsbedrijven: 'Nutsbedrijven',
  breed: 'Breed gespreid',
  anders: 'Overig',
}

export const GEOGRAPHY_LABELS: Record<string, string> = {
  wereld: 'Wereld (breed)',
  europa: 'Europa',
  noord_amerika: 'Noord-Amerika',
  azie: 'Azië-Pacific',
  opkomend: 'Opkomende markten',
  nederland: 'Nederland',
  anders: 'Overig',
}

export const VIEW_MODE_LABELS: Record<AllocationViewMode, string> = {
  asset_class: 'Assetklasse',
  sector: 'Sector',
  geography: 'Geografie',
}

export const CATEGORY_LABELS: Record<AllocationViewMode, Record<string, string>> = {
  asset_class: ASSET_CLASS_LABELS,
  sector: SECTOR_LABELS,
  geography: GEOGRAPHY_LABELS,
}

export const ALLOCATION_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#f97316', // orange
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#84cc16', // lime
  '#d946ef', // fuchsia
  '#14b8a6', // teal
  '#e11d48', // rose
]

export const DEFAULT_TARGETS: Record<AllocationViewMode, TargetAllocation[]> = {
  asset_class: [
    { category: 'aandelen', target_pct: 60 },
    { category: 'obligaties', target_pct: 20 },
    { category: 'vastgoed', target_pct: 10 },
    { category: 'cash', target_pct: 5 },
    { category: 'crypto', target_pct: 5 },
  ],
  sector: [],
  geography: [
    { category: 'wereld', target_pct: 50 },
    { category: 'europa', target_pct: 20 },
    { category: 'noord_amerika', target_pct: 15 },
    { category: 'opkomend', target_pct: 10 },
    { category: 'azie', target_pct: 5 },
  ],
}

// ── Utility: classify a holding based on its metadata ────────

function classifyHolding(
  holding: HoldingForAllocation,
  mode: AllocationViewMode,
): string {
  const field = holding[mode]
  if (field && field !== '') return field
  return 'anders'
}

// ── Utility: compute allocation slices ──────────────────────

export function computeAllocationSlices(
  holdings: HoldingForAllocation[],
  mode: AllocationViewMode,
): AllocationSlice[] {
  const groups: Record<string, { value: number; count: number }> = {}
  const total = holdings.reduce((s, h) => s + h.value, 0)

  for (const h of holdings) {
    if (h.value <= 0) continue
    const key = classifyHolding(h, mode)
    if (!groups[key]) groups[key] = { value: 0, count: 0 }
    groups[key].value += h.value
    groups[key].count += 1
  }

  const labels = CATEGORY_LABELS[mode]
  return Object.entries(groups)
    .map(([key, data], i) => ({
      key,
      label: labels[key] || key,
      value: data.value,
      pct: total > 0 ? (data.value / total) * 100 : 0,
      color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
      holdingCount: data.count,
    }))
    .sort((a, b) => b.value - a.value)
}

// ── Utility: compute rebalancing suggestions ────────────────

export function computeRebalancingSuggestions(
  slices: AllocationSlice[],
  targets: TargetAllocation[],
  totalValue: number,
): RebalancingSuggestion[] {
  if (targets.length === 0 || totalValue <= 0) return []

  const DRIFT_THRESHOLD = 2 // Only suggest if drift > 2%

  return targets
    .map((t) => {
      const slice = slices.find((s) => s.key === t.category)
      const currentPct = slice?.pct ?? 0
      const drift = currentPct - t.target_pct
      const absDrift = Math.abs(drift)
      const amount = (absDrift / 100) * totalValue
      const labels = { ...ASSET_CLASS_LABELS, ...SECTOR_LABELS, ...GEOGRAPHY_LABELS }
      const label = labels[t.category] || t.category

      let action: 'buy' | 'sell' | 'hold' = 'hold'
      if (drift < -DRIFT_THRESHOLD) action = 'buy'
      if (drift > DRIFT_THRESHOLD) action = 'sell'

      return {
        category: t.category,
        current_pct: Math.round(currentPct * 10) / 10,
        target_pct: t.target_pct,
        drift: Math.round(drift * 10) / 10,
        action,
        amount: Math.round(amount),
        label,
      }
    })
    .filter((s) => s.action !== 'hold')
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
}
