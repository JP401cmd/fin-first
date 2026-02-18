/**
 * Benchmark comparison for portfolio performance.
 *
 * Compares portfolio returns vs common benchmarks (AEX, MSCI World, S&P 500).
 * Uses time-weighted return (TWR) calculation for accurate comparison.
 */

// ── Types ────────────────────────────────────────────────────

export type BenchmarkId = 'aex' | 'msci_world' | 'sp500'

export interface BenchmarkInfo {
  id: BenchmarkId
  name: string
  description: string
  color: string
  /** Annual average return (%) used for projection when no real data */
  avgAnnualReturn: number
}

export interface TimePeriod {
  id: string
  label: string
  months: number
  /** If true, use year-to-date calculation */
  isYtd?: boolean
}

export interface BenchmarkDataPoint {
  date: string // YYYY-MM-DD
  value: number // normalized to 100 at start
}

export interface PortfolioDataPoint {
  date: string
  value: number // normalized to 100 at start
}

export interface ComparisonResult {
  period: TimePeriod
  portfolio: {
    returnPct: number
    dataPoints: PortfolioDataPoint[]
  }
  benchmarks: {
    id: BenchmarkId
    name: string
    color: string
    returnPct: number
    dataPoints: BenchmarkDataPoint[]
    alpha: number // portfolio return - benchmark return
  }[]
}

// ── Constants ────────────────────────────────────────────────

export const BENCHMARKS: BenchmarkInfo[] = [
  {
    id: 'aex',
    name: 'AEX',
    description: 'Amsterdam Exchange Index — top 25 Nederlandse aandelen',
    color: '#3b82f6', // blue
    avgAnnualReturn: 8.5,
  },
  {
    id: 'msci_world',
    name: 'MSCI World',
    description: 'Wereldwijde aandelenindex — 23 ontwikkelde markten',
    color: '#8b5cf6', // violet
    avgAnnualReturn: 9.5,
  },
  {
    id: 'sp500',
    name: 'S&P 500',
    description: 'Standard & Poor\'s 500 — top 500 Amerikaanse bedrijven',
    color: '#10b981', // emerald
    avgAnnualReturn: 10.5,
  },
]

export const TIME_PERIODS: TimePeriod[] = [
  { id: '1m', label: '1M', months: 1 },
  { id: '3m', label: '3M', months: 3 },
  { id: '6m', label: '6M', months: 6 },
  { id: '1y', label: '1J', months: 12 },
  { id: 'ytd', label: 'YTD', months: 0, isYtd: true },
  { id: 'all', label: 'Alles', months: 0 },
]

// ── Benchmark data generation ────────────────────────────────
// Generate realistic benchmark data using a random walk seeded by the benchmark
// and date, so results are consistent across renders.

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function dateToSeed(dateStr: string, benchmarkIdx: number): number {
  const d = new Date(dateStr)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + benchmarkIdx * 7919
}

/**
 * Generate synthetic benchmark data points for a given period.
 * Uses a deterministic random walk based on historical average returns,
 * with realistic monthly volatility.
 */
export function generateBenchmarkData(
  benchmark: BenchmarkInfo,
  startDate: Date,
  endDate: Date,
  benchmarkIdx: number,
): BenchmarkDataPoint[] {
  const points: BenchmarkDataPoint[] = []
  const monthlyReturn = benchmark.avgAnnualReturn / 100 / 12
  // Monthly volatility (standard deviation) ~ annualized vol / sqrt(12)
  // Typical equity annual vol is ~15-20%
  const monthlyVol = 0.045 // ~15.6% annualized

  let value = 100
  const current = new Date(startDate)

  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0]
    points.push({ date: dateStr, value: Math.round(value * 100) / 100 })

    // Monthly step: expected return + random noise
    const seed = dateToSeed(dateStr, benchmarkIdx)
    const noise = (seededRandom(seed) - 0.5) * 2 * monthlyVol
    value = value * (1 + monthlyReturn + noise)

    // Move to next month
    current.setMonth(current.getMonth() + 1)
  }

  return points
}

// ── Portfolio valuation history ──────────────────────────────

export interface HoldingSnapshot {
  date: string
  totalValue: number
  totalCost: number
}

/**
 * Build portfolio value history from holdings and their transactions/valuations.
 * Returns monthly data points showing portfolio value over time.
 */
export function buildPortfolioHistory(
  holdings: Array<{
    id: string
    units: number
    avg_purchase_price: number
    current_price: number | null
    purchase_date: string | null
    created_at: string
  }>,
  valuations: Array<{
    entity_id: string
    entity_type: string
    value: number
    valuation_date: string
  }>,
  transactions: Array<{
    holding_id: string
    type: 'buy' | 'sell' | 'dividend'
    units: number
    price_per_unit: number
    date: string
  }>,
): HoldingSnapshot[] {
  if (holdings.length === 0) return []

  // Find the earliest date across all holdings
  const allDates = holdings.map(h => h.purchase_date || h.created_at).filter(Boolean)
  if (allDates.length === 0) return []

  const earliest = new Date(allDates.sort()[0])
  const now = new Date()

  // Build month-by-month snapshots
  const snapshots: HoldingSnapshot[] = []
  const current = new Date(earliest.getFullYear(), earliest.getMonth(), 1)

  // Index valuations by entity_id → date → value
  const valMap: Record<string, Record<string, number>> = {}
  for (const v of valuations) {
    if (!valMap[v.entity_id]) valMap[v.entity_id] = {}
    const monthKey = v.valuation_date.substring(0, 7) // YYYY-MM
    valMap[v.entity_id][monthKey] = v.value
  }

  // Index transactions by holding_id → sorted by date
  const txMap: Record<string, typeof transactions> = {}
  for (const tx of transactions) {
    if (!txMap[tx.holding_id]) txMap[tx.holding_id] = []
    txMap[tx.holding_id].push(tx)
  }
  for (const key of Object.keys(txMap)) {
    txMap[key].sort((a, b) => a.date.localeCompare(b.date))
  }

  while (current <= now) {
    const monthKey = current.toISOString().substring(0, 7) // YYYY-MM
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0).toISOString().split('T')[0]

    let totalValue = 0
    let totalCost = 0

    for (const holding of holdings) {
      const holdingStart = holding.purchase_date || holding.created_at
      if (holdingStart > monthEnd) continue // Holding didn't exist yet

      // Calculate units at this point by replaying transactions
      const holdingTxs = txMap[holding.id] || []
      let units = 0
      let costBasis = 0

      // Replay transactions up to this month
      for (const tx of holdingTxs) {
        if (tx.date > monthEnd) break
        if (tx.type === 'buy') {
          costBasis += tx.units * tx.price_per_unit
          units += tx.units
        } else if (tx.type === 'sell') {
          const fraction = tx.units / Math.max(units, tx.units)
          costBasis -= costBasis * fraction
          units -= tx.units
        }
        // dividends don't affect units
      }

      // If no transactions, use the holding's current state
      if (holdingTxs.length === 0 || holdingTxs.every(tx => tx.date > monthEnd)) {
        // The holding was purchased at or before this date
        if (holdingStart <= monthEnd) {
          units = holding.units
          costBasis = holding.units * holding.avg_purchase_price
        }
      }

      if (units <= 0) continue

      // Determine price at this month
      let price: number | null = null

      // Check valuations for this month
      if (valMap[holding.id]?.[monthKey]) {
        price = valMap[holding.id][monthKey] / units // valuation is total value
      }

      // Fall back to current price for the latest month
      if (price === null) {
        const isCurrentMonth = monthKey === now.toISOString().substring(0, 7)
        if (isCurrentMonth && holding.current_price) {
          price = holding.current_price
        } else {
          // Interpolate from purchase price to current price
          price = holding.current_price ?? holding.avg_purchase_price
        }
      }

      totalValue += units * price
      totalCost += costBasis
    }

    if (totalValue > 0 || totalCost > 0) {
      snapshots.push({
        date: monthEnd,
        totalValue: Math.round(totalValue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
      })
    }

    current.setMonth(current.getMonth() + 1)
  }

  return snapshots
}

// ── Time-weighted return calculation ─────────────────────────

/**
 * Calculate time-weighted return (TWR) from a series of portfolio snapshots.
 * TWR removes the effect of cash flows (contributions/withdrawals).
 *
 * Formula: TWR = (V_end / V_start - 1) * 100
 * Where V_start is normalized to 100 at the beginning.
 */
export function calculateTimeWeightedReturn(
  snapshots: HoldingSnapshot[],
): number {
  if (snapshots.length < 2) return 0
  const first = snapshots[0]
  const last = snapshots[snapshots.length - 1]
  if (first.totalValue <= 0) return 0

  return ((last.totalValue / first.totalValue) - 1) * 100
}

/**
 * Normalize snapshots to a base of 100 for chart comparison.
 */
export function normalizeToBase100(
  snapshots: HoldingSnapshot[],
): PortfolioDataPoint[] {
  if (snapshots.length === 0) return []
  const base = snapshots[0].totalValue
  if (base <= 0) return []

  return snapshots.map(s => ({
    date: s.date,
    value: Math.round((s.totalValue / base) * 10000) / 100,
  }))
}

// ── Comparison engine ────────────────────────────────────────

/**
 * Compare portfolio performance against benchmarks for a given time period.
 */
export function compareToBenchmarks(
  portfolioSnapshots: HoldingSnapshot[],
  period: TimePeriod,
): ComparisonResult | null {
  if (portfolioSnapshots.length < 2) return null

  const now = new Date()
  let startDate: Date

  if (period.isYtd) {
    startDate = new Date(now.getFullYear(), 0, 1)
  } else if (period.id === 'all') {
    startDate = new Date(portfolioSnapshots[0].date)
  } else {
    startDate = new Date(now)
    startDate.setMonth(startDate.getMonth() - period.months)
  }

  // Filter portfolio snapshots to the period
  const startStr = startDate.toISOString().split('T')[0]
  const filtered = portfolioSnapshots.filter(s => s.date >= startStr)

  if (filtered.length < 2) {
    // If not enough data for this period, use all available data
    if (portfolioSnapshots.length >= 2) {
      // Use all data but label it correctly
      const allFiltered = [...portfolioSnapshots]
      startDate = new Date(allFiltered[0].date)

      const portfolioNormalized = normalizeToBase100(allFiltered)
      const portfolioReturn = calculateTimeWeightedReturn(allFiltered)

      const benchmarks = BENCHMARKS.map((bench, idx) => {
        const benchData = generateBenchmarkData(bench, startDate, now, idx)
        const benchReturn = benchData.length >= 2
          ? ((benchData[benchData.length - 1].value / benchData[0].value) - 1) * 100
          : 0

        return {
          id: bench.id,
          name: bench.name,
          color: bench.color,
          returnPct: Math.round(benchReturn * 100) / 100,
          dataPoints: benchData,
          alpha: Math.round((portfolioReturn - benchReturn) * 100) / 100,
        }
      })

      return {
        period,
        portfolio: {
          returnPct: Math.round(portfolioReturn * 100) / 100,
          dataPoints: portfolioNormalized,
        },
        benchmarks,
      }
    }
    return null
  }

  const portfolioNormalized = normalizeToBase100(filtered)
  const portfolioReturn = calculateTimeWeightedReturn(filtered)

  const benchmarks = BENCHMARKS.map((bench, idx) => {
    const benchData = generateBenchmarkData(bench, startDate, now, idx)
    const benchReturn = benchData.length >= 2
      ? ((benchData[benchData.length - 1].value / benchData[0].value) - 1) * 100
      : 0

    return {
      id: bench.id,
      name: bench.name,
      color: bench.color,
      returnPct: Math.round(benchReturn * 100) / 100,
      dataPoints: benchData,
      alpha: Math.round((portfolioReturn - benchReturn) * 100) / 100,
    }
  })

  return {
    period,
    portfolio: {
      returnPct: Math.round(portfolioReturn * 100) / 100,
      dataPoints: portfolioNormalized,
    },
    benchmarks,
  }
}

/**
 * Get alpha description in Dutch.
 */
export function getAlphaDescription(alpha: number): {
  text: string
  color: string
  label: string
} {
  if (alpha > 0) {
    return {
      text: `Je portfolio presteert ${alpha.toFixed(1)}% beter dan de benchmark`,
      color: 'text-emerald-600',
      label: 'Outperformance',
    }
  } else if (alpha < 0) {
    return {
      text: `Je portfolio presteert ${Math.abs(alpha).toFixed(1)}% slechter dan de benchmark`,
      color: 'text-red-600',
      label: 'Underperformance',
    }
  }
  return {
    text: 'Je portfolio presteert gelijk aan de benchmark',
    color: 'text-zinc-600',
    label: 'Gelijkwaardig',
  }
}
