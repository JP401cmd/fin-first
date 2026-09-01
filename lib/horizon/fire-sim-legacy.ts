/**
 * Horizon — losse simulatie-motoren (forward-projectie, scenario's, Monte Carlo,
 * withdrawal-strategieën, backtesting). Los van de horizon-kernel; deze draaien
 * ad-hoc simulaties. Afgesplitst van lib/horizon-data.ts (pure move, geen
 * gedragswijziging). NB: computeScenarios/computeResilienceScore hebben 0 importers —
 * opruimen gebeurt via een apart kaartje (slice 3). De dode, stochastische
 * `normalRandom` (Box-Muller met `Math.random`-tak) is verwijderd (Arch F6): Monte
 * Carlo draait deterministisch op de `SeededRandom`-klasse.
 */
import type { FinancialInput } from '../core-metrics'
import { computePassiveIncomeMonthly } from '../core-metrics'
import { DEFAULT_RETURN, DEFAULT_VOLATILITY, NL_SWR, NL_AOW_AGE, NL_AOW_MONTHLY, INFLATION } from '../constants'
import { MSCI_REAL_RETURNS, NAMED_PERIODS } from '../msci-data'
import { ageAtDate } from './fire-format'
import { MARKET_WEATHER } from './life-events-catalog'
import type { FutureCashflow, MarketWeather, ResilienceScore } from './life-events-catalog'

export interface ProjectionMonth {
  month: number
  date: string
  netWorth: number
  passiveIncome: number
  age: number | null
  contributions: number
  growth: number
}

export interface ScenarioPath {
  name: string
  label: string
  color: string
  months: ProjectionMonth[]
  fireAge: number | null
  fireMonth: number | null
}

export interface MonteCarloResult {
  simulations: number
  years: number
  percentiles: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] }
  fireAges: number[]
  fireProb: number // 0-1
  p10FireAge: number | null
  p50FireAge: number | null
  p90FireAge: number | null
}

export type WithdrawalStrategy = 'classic' | 'variable' | 'guardrails' | 'bucket'

export interface GuardrailsConfig {
  floor: number       // 0-1, default 0.80
  ceiling: number     // 1+, default 1.20
  raiseStep: number   // 0-1, default 0.10
  cutStep: number     // 0-1, default 0.10
}

export interface BucketConfig {
  cashPct: number      // 0-1, default 0.15
  bondPct: number      // 0-1, default 0.30
  bondReturn: number   // annual decimal, default 0.03
  cashBufferYears: number // default 3
}

export const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  floor: 0.80,
  ceiling: 1.20,
  raiseStep: 0.10,
  cutStep: 0.10,
}

export const DEFAULT_BUCKET: BucketConfig = {
  cashPct: 0.15,
  bondPct: 0.30,
  bondReturn: 0.03,
  cashBufferYears: 3,
}

export interface WithdrawalYear {
  age: number
  year: number
  startBalance: number
  withdrawal: number
  aowIncome: number
  growth: number
  endBalance: number
}

export interface WithdrawalResult {
  strategy: WithdrawalStrategy
  monthlyWithdrawal: number
  yearlySustainable: number
  successYears: number
  totalYears: number
  schedule: WithdrawalYear[]
  depleted: boolean
}

// Seeded PRNG class for Monte Carlo
export class SeededRandom {
  private state: number
  constructor(seed: number) {
    this.state = seed | 0 || 1
  }
  next(): number {
    this.state ^= this.state << 13
    this.state ^= this.state >> 17
    this.state ^= this.state << 5
    return Math.abs(this.state) / 2147483647
  }
  normal(mean: number, stddev: number): number {
    const u1 = Math.max(this.next(), 0.0001)
    const u2 = this.next()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + stddev * z
  }
}

/**
 * Month-by-month forward projection.
 * Optionally accepts future cashflows (AOW, pension, part-time) to include age-based income adjustments.
 */
export function projectForward(
  input: FinancialInput,
  months: number,
  annualReturn: number = DEFAULT_RETURN,
  swrOverride?: number,
  cashflows?: FutureCashflow[],
): ProjectionMonth[] {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const monthlyReturn = annualReturn / 12
  const baseMonthlySavings = monthlyIncome - monthlyExpenses
  let netWorth = totalAssets - totalDebts
  const now = new Date()
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const result: ProjectionMonth[] = []

  for (let m = 0; m <= months; m++) {
    const date = new Date(now)
    date.setMonth(date.getMonth() + m)
    const age = currentAge !== null ? currentAge + m / 12 : null
    const passiveIncome = computePassiveIncomeMonthly(netWorth, swr)

    // Cashflow adjustments based on age
    let cashflowIncome = 0
    if (age !== null && cashflows && cashflows.length > 0) {
      for (const cf of cashflows) {
        const toAgeBound = cf.toAge ?? 90
        if (age >= cf.fromAge && age <= toAgeBound) {
          cashflowIncome += cf.monthlyAmount
        }
        // One-time amount: add when crossing fromAge threshold
        if (cf.oneTimeAmount && m > 0) {
          const prevAge = currentAge !== null ? currentAge + (m - 1) / 12 : null
          if (prevAge !== null && prevAge < cf.fromAge && age >= cf.fromAge) {
            netWorth += cf.oneTimeAmount
          }
        }
      }
    }

    const effectiveMonthlySavings = baseMonthlySavings + cashflowIncome

    result.push({
      month: m,
      date: date.toISOString().split('T')[0],
      netWorth: Math.round(netWorth),
      passiveIncome: Math.round(passiveIncome),
      age,
      contributions: m === 0 ? 0 : effectiveMonthlySavings,
      growth: m === 0 ? 0 : Math.round(netWorth * monthlyReturn),
    })

    if (m < months) {
      const growth = netWorth * monthlyReturn
      netWorth = netWorth + growth + effectiveMonthlySavings
    }
  }

  return result
}

/**
 * Three diverging scenario paths: Drifter, Current, Optimizer.
 * Optionally accepts a market weather key to adjust return rates.
 */
export function computeScenarios(
  input: FinancialInput,
  maxYears: number = 40,
  weather: MarketWeather = 'normal',
): ScenarioPath[] {
  const months = maxYears * 12
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const netWorth = totalAssets - totalDebts
  const now = new Date()
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
  const weatherReturn = MARKET_WEATHER[weather].return

  function simulate(
    name: string,
    label: string,
    color: string,
    expenseGrowth: number, // annual % change in expenses
    savingsGrowthRate: number, // annual % change in savings rate
    expenseMultiplier: number, // initial expense change
    contributionMultiplier: number, // initial contribution change
  ): ScenarioPath {
    let nw = netWorth
    let mExpenses = monthlyExpenses * expenseMultiplier
    let mSavings = (monthlyIncome - mExpenses) * contributionMultiplier
    const monthlyReturn = weatherReturn / 12
    const pts: ProjectionMonth[] = []
    let fireMonth: number | null = null
    let fireAge: number | null = null

    for (let m = 0; m <= months; m++) {
      const date = new Date(now)
      date.setMonth(date.getMonth() + m)
      const age = currentAge !== null ? currentAge + m / 12 : null

      pts.push({
        month: m,
        date: date.toISOString().split('T')[0],
        netWorth: Math.round(nw),
        passiveIncome: Math.round(computePassiveIncomeMonthly(nw, NL_SWR)),
        age,
        contributions: m === 0 ? 0 : Math.round(mSavings),
        growth: 0,
      })

      // Check FIRE
      const currentFireTarget = (mExpenses * 12) / NL_SWR
      if (fireMonth === null && nw >= currentFireTarget && currentFireTarget > 0) {
        fireMonth = m
        fireAge = age
      }

      if (m < months) {
        nw = nw * (1 + monthlyReturn) + mSavings
        // Annual adjustments
        if (m > 0 && m % 12 === 0) {
          mExpenses *= (1 + expenseGrowth)
          const newSavings = monthlyIncome - mExpenses
          mSavings = Math.max(0, newSavings) * (1 + savingsGrowthRate)
        }
      }
    }

    return { name, label, color, months: pts, fireAge, fireMonth }
  }

  return [
    simulate('drifter', 'Drifter', '#ef4444', 0.03, -0.02, 1.05, 0.8),
    simulate('current', 'Huidige Koers', '#8B5CB8', 0, 0, 1, 1),
    simulate('optimizer', 'Optimizer', '#10b981', -0.01, 0.02, 0.9, 1.2),
  ]
}

/**
 * Monte Carlo simulation: 1000 paths over N years.
 * Optionally accepts future cashflows (AOW, pension, part-time) to adjust yearly savings.
 */
export function runMonteCarlo(
  input: FinancialInput,
  sims: number = 1000,
  years: number = 40,
  swrOverride?: number,
  volatilityOverride?: number,
  cashflows?: FutureCashflow[],
): MonteCarloResult {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const volatility = volatilityOverride ?? DEFAULT_VOLATILITY
  const netWorth = totalAssets - totalDebts
  const baseMonthlySavings = monthlyIncome - monthlyExpenses
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / swr : 0
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null

  // Each simulation: year-by-year net worth
  const allPaths: number[][] = []
  const fireAges: number[] = []
  let fireCount = 0

  for (let s = 0; s < sims; s++) {
    const rng = new SeededRandom(s * 7919 + 42)
    let nw = netWorth
    const path: number[] = [nw]
    let fired = false

    for (let y = 1; y <= years; y++) {
      const annualReturn = rng.normal(DEFAULT_RETURN, volatility)

      // Cashflow adjustments for this year
      let cashflowYearly = 0
      if (cashflows && cashflows.length > 0 && currentAge !== null) {
        const age = currentAge + y
        for (const cf of cashflows) {
          const toAgeBound = cf.toAge ?? 90
          if (age >= cf.fromAge && age <= toAgeBound) {
            cashflowYearly += cf.monthlyAmount * 12
          }
        }
      }

      nw = nw * (1 + annualReturn) + baseMonthlySavings * 12 + cashflowYearly
      nw = Math.max(0, nw)
      path.push(Math.round(nw))

      if (!fired && nw >= fireTarget && fireTarget > 0) {
        fired = true
        const age = currentAge !== null ? currentAge + y : y
        fireAges.push(age)
        fireCount++
      }
    }

    allPaths.push(path)
  }

  // Compute percentiles per year
  const percentiles = {
    p10: [] as number[],
    p25: [] as number[],
    p50: [] as number[],
    p75: [] as number[],
    p90: [] as number[],
  }

  for (let y = 0; y <= years; y++) {
    const values = allPaths.map(p => p[y]).sort((a, b) => a - b)
    percentiles.p10.push(values[Math.floor(sims * 0.10)])
    percentiles.p25.push(values[Math.floor(sims * 0.25)])
    percentiles.p50.push(values[Math.floor(sims * 0.50)])
    percentiles.p75.push(values[Math.floor(sims * 0.75)])
    percentiles.p90.push(values[Math.floor(sims * 0.90)])
  }

  // FIRE age percentiles
  const sortedFireAges = [...fireAges].sort((a, b) => a - b)
  const p10FireAge = sortedFireAges.length > 0 ? sortedFireAges[Math.floor(sortedFireAges.length * 0.10)] : null
  const p50FireAge = sortedFireAges.length > 0 ? sortedFireAges[Math.floor(sortedFireAges.length * 0.50)] : null
  const p90FireAge = sortedFireAges.length > 0 ? sortedFireAges[Math.floor(sortedFireAges.length * 0.90)] : null

  return {
    simulations: sims,
    years,
    percentiles,
    fireAges: sortedFireAges,
    fireProb: fireCount / sims,
    p10FireAge,
    p50FireAge,
    p90FireAge,
  }
}

/**
 * Withdrawal strategy simulation.
 */
export function computeWithdrawal(
  startPortfolio: number,
  retirementAge: number,
  targetAge: number,
  strategy: WithdrawalStrategy,
  yearlyExpenses: number,
  annualReturn: number = DEFAULT_RETURN,
  guardrailsConfig?: Partial<GuardrailsConfig>,
  bucketConfig?: Partial<BucketConfig>,
): WithdrawalResult {
  const totalYears = targetAge - retirementAge
  if (totalYears <= 0) {
    return { strategy, monthlyWithdrawal: 0, yearlySustainable: 0, successYears: 0, totalYears: 0, schedule: [], depleted: false }
  }

  const gr = { ...DEFAULT_GUARDRAILS, ...guardrailsConfig }
  const bk = { ...DEFAULT_BUCKET, ...bucketConfig }
  const stockPct = 1 - bk.cashPct - bk.bondPct

  const schedule: WithdrawalYear[] = []
  let balance = startPortfolio
  let depleted = false
  let successYears = 0

  // Initial withdrawal rate
  const baseWithdrawal = startPortfolio * NL_SWR
  let currentWithdrawal = baseWithdrawal

  // Bucket strategy pools
  let cashBucket = strategy === 'bucket' ? startPortfolio * bk.cashPct : 0
  let bondBucket = strategy === 'bucket' ? startPortfolio * bk.bondPct : 0
  let stockBucket = strategy === 'bucket' ? startPortfolio * stockPct : 0

  // Guardrails
  const guardrailFloor = baseWithdrawal * gr.floor
  const guardrailCeiling = baseWithdrawal * gr.ceiling

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const year = new Date().getFullYear() + y
    const aowIncome = age >= NL_AOW_AGE ? NL_AOW_MONTHLY * 12 : 0
    const neededFromPortfolio = Math.max(0, yearlyExpenses - aowIncome)

    let withdrawal = 0
    let growth = 0

    if (strategy === 'classic') {
      withdrawal = Math.min(neededFromPortfolio, balance)
      growth = (balance - withdrawal) * annualReturn
    } else if (strategy === 'variable') {
      const variableWithdrawal = balance * NL_SWR
      withdrawal = Math.min(Math.max(variableWithdrawal, neededFromPortfolio * 0.5), balance)
      growth = (balance - withdrawal) * annualReturn
    } else if (strategy === 'guardrails') {
      // Guyton-Klinger
      if (y === 0) {
        currentWithdrawal = neededFromPortfolio
      } else {
        const prevBalance = schedule[y - 1]?.startBalance || startPortfolio
        const returnPct = prevBalance > 0 ? (balance - prevBalance + schedule[y-1]?.withdrawal - schedule[y-1]?.aowIncome) / prevBalance : 0
        if (returnPct > 0.20) {
          currentWithdrawal = Math.min(currentWithdrawal * (1 + gr.raiseStep), guardrailCeiling)
        } else if (returnPct < -0.20) {
          currentWithdrawal = Math.max(currentWithdrawal * (1 - gr.cutStep), guardrailFloor)
        }
        currentWithdrawal = currentWithdrawal * (1 + INFLATION)
      }
      withdrawal = Math.min(currentWithdrawal, balance)
      growth = (balance - withdrawal) * annualReturn
    } else if (strategy === 'bucket') {
      // Cash bucket: 0%, Bonds: 3%, Stocks: 7%
      withdrawal = Math.min(neededFromPortfolio, cashBucket + bondBucket + stockBucket)

      // Withdraw from cash first
      const fromCash = Math.min(withdrawal, cashBucket)
      cashBucket -= fromCash
      const remaining = withdrawal - fromCash
      const fromBonds = Math.min(remaining, bondBucket)
      bondBucket -= fromBonds
      const fromStocks = remaining - fromBonds
      stockBucket -= fromStocks

      // Grow buckets
      bondBucket *= (1 + bk.bondReturn)
      stockBucket *= (1 + annualReturn)

      // Rebalance: refill cash from stocks
      const targetCash = yearlyExpenses * bk.cashBufferYears
      if (cashBucket < targetCash && stockBucket > targetCash) {
        const refill = Math.min(targetCash - cashBucket, stockBucket * 0.1)
        cashBucket += refill
        stockBucket -= refill
      }

      balance = cashBucket + bondBucket + stockBucket
      growth = 0 // already applied
    }

    if (strategy !== 'bucket') {
      const startBalance = balance
      balance = balance - withdrawal + growth
      schedule.push({
        age,
        year,
        startBalance: Math.round(startBalance),
        withdrawal: Math.round(withdrawal),
        aowIncome: Math.round(aowIncome),
        growth: Math.round(growth),
        endBalance: Math.round(Math.max(0, balance)),
      })
    } else {
      schedule.push({
        age,
        year,
        startBalance: Math.round(cashBucket + bondBucket + stockBucket + withdrawal),
        withdrawal: Math.round(withdrawal),
        aowIncome: Math.round(aowIncome),
        growth: Math.round(bondBucket * bk.bondReturn + stockBucket * annualReturn),
        endBalance: Math.round(Math.max(0, cashBucket + bondBucket + stockBucket)),
      })
    }

    if (balance <= 0 && !depleted) {
      depleted = true
      successYears = y + 1
    }

    balance = Math.max(0, balance)
  }

  if (!depleted) successYears = totalYears

  const firstYearWithdrawal = schedule[0]?.withdrawal || 0

  return {
    strategy,
    monthlyWithdrawal: Math.round(firstYearWithdrawal / 12),
    yearlySustainable: firstYearWithdrawal,
    successYears,
    totalYears,
    schedule,
    depleted,
  }
}

/**
 * Compute resilience score (0-100).
 *
 * @deprecated This function uses the old 4-pillar resilience model.
 * Use `computeHealthScore()` from `lib/financial-health.ts` instead, which provides
 * a broader 6-pillar financial health assessment. This function is retained only for
 * backward compatibility with historical snapshots that store `resilience_score` values.
 *
 * @see computeHealthScore — the replacement function in lib/financial-health.ts
 */
export function computeResilienceScore(input: FinancialInput): ResilienceScore {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses } = input
  const netWorth = totalAssets - totalDebts
  const monthlySavings = monthlyIncome - monthlyExpenses

  // Emergency fund: months of expenses covered by liquid assets (assume 30% is liquid)
  const liquidAssets = totalAssets * 0.3
  const emergencyMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0
  const emergency = Math.max(0, Math.min(25, Math.round((emergencyMonths / 6) * 25)))

  // Diversification: simple heuristic (better with actual asset types, but works from totals)
  const assetToDebtRatio = totalDebts > 0 ? totalAssets / totalDebts : totalAssets > 0 ? 10 : 0
  const diversification = Math.max(0, Math.min(25, Math.round(Math.min(assetToDebtRatio / 3, 1) * 25)))

  // Debt ratio: debt as % of assets
  const debtPct = totalAssets > 0 ? totalDebts / totalAssets : 1
  const debtScore = Math.max(0, Math.min(25, Math.round((1 - Math.min(debtPct, 1)) * 25)))

  // Savings rate
  const sr = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0
  const savingsScore = Math.max(0, Math.min(25, Math.round(Math.min(sr / 0.30, 1) * 25)))

  const total = Math.max(0, emergency + diversification + debtScore + savingsScore)

  let label: string
  if (total >= 80) label = 'Uitstekend'
  else if (total >= 60) label = 'Sterk'
  else if (total >= 40) label = 'Redelijk'
  else if (total >= 20) label = 'Kwetsbaar'
  else label = 'Kritiek'

  return {
    total,
    breakdown: { emergency, diversification, debtRatio: debtScore, savingsRate: savingsScore },
    label,
  }
}

// ── Backtesting ───────────────────────────────────────────────

export interface BacktestPath {
  startYear: number
  label?: string
  description?: string
  color?: string
  values: number[]        // portfolio value per year (year 0 = start)
  success: boolean        // portfolio intact at end of period
  depletionYear: number | null  // year portfolio ran out (null = never)
  fireAgeReached: number | null // age at which FIRE target was crossed
}

export interface BacktestResult {
  years: number
  allPaths: BacktestPath[]
  namedPaths: BacktestPath[]
  successRate: number
  worstCase: BacktestPath
  medianPath: BacktestPath
  bestCase: BacktestPath
  bandMin: number[]
  bandMax: number[]
  bandP25: number[]
  bandP75: number[]
}

/**
 * Backtest against historical MSCI World real returns (1970–2024).
 * Simulates all available start years and returns success rates and statistics.
 */
export function runBacktest(
  input: FinancialInput,
  years: number = 30,
  swrOverride?: number,
): BacktestResult {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const netWorth = totalAssets - totalDebts
  const monthlySavings = monthlyIncome - monthlyExpenses
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / swr : 0
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null

  // Available start years: 1970 to (2024 - years)
  const maxStartYear = 2024 - years
  const startYears: number[] = []
  for (let y = 1970; y <= maxStartYear; y++) {
    startYears.push(y)
  }

  const allPaths: BacktestPath[] = startYears.map(startYear => {
    let nw = netWorth
    const values: number[] = [Math.round(nw)]
    let depletionYear: number | null = null
    let fireAgeReached: number | null = null

    for (let y = 1; y <= years; y++) {
      const dataYear = startYear + y - 1
      const realReturn = MSCI_REAL_RETURNS[dataYear] ?? DEFAULT_RETURN
      nw = nw * (1 + realReturn) + monthlySavings * 12
      if (nw <= 0) {
        nw = 0
        if (depletionYear === null) depletionYear = y
      }
      values.push(Math.round(nw))

      if (fireAgeReached === null && fireTarget > 0 && nw >= fireTarget && currentAge !== null) {
        fireAgeReached = currentAge + y
      }
    }

    // Match named period
    const namedPeriod = NAMED_PERIODS.find(p => p.startYear === startYear)

    return {
      startYear,
      label: namedPeriod?.label,
      description: namedPeriod?.description,
      color: namedPeriod?.color,
      values,
      success: nw > 0,
      depletionYear,
      fireAgeReached,
    }
  })

  const successCount = allPaths.filter(p => p.success).length
  const successRate = allPaths.length > 0 ? successCount / allPaths.length : 0

  // Named paths
  const namedPaths = NAMED_PERIODS
    .map(period => allPaths.find(p => p.startYear === period.startYear))
    .filter((p): p is BacktestPath => p !== undefined)

  // Sort by final value for worst/median/best
  const sortedByFinal = [...allPaths].sort((a, b) => (a.values[years] ?? 0) - (b.values[years] ?? 0))
  const worstCase = sortedByFinal[0] ?? allPaths[0]
  const medianPath = sortedByFinal[Math.floor(sortedByFinal.length / 2)] ?? allPaths[0]
  const bestCase = sortedByFinal[sortedByFinal.length - 1] ?? allPaths[allPaths.length - 1]

  // Band calculations per year
  const bandMin: number[] = []
  const bandMax: number[] = []
  const bandP25: number[] = []
  const bandP75: number[] = []

  for (let y = 0; y <= years; y++) {
    const vals = allPaths.map(p => p.values[y] ?? 0).sort((a, b) => a - b)
    bandMin.push(vals[0] ?? 0)
    bandMax.push(vals[vals.length - 1] ?? 0)
    bandP25.push(vals[Math.floor(vals.length * 0.25)] ?? 0)
    bandP75.push(vals[Math.floor(vals.length * 0.75)] ?? 0)
  }

  return {
    years,
    allPaths,
    namedPaths,
    successRate,
    worstCase,
    medianPath,
    bestCase,
    bandMin,
    bandMax,
    bandP25,
    bandP75,
  }
}
