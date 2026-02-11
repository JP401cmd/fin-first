/**
 * Horizon calculation engine — FIRE projections, Monte Carlo, scenarios,
 * withdrawal strategies, life event impact, resilience scoring.
 *
 * Pure functions, no Supabase dependency.
 */

// ── Constants ────────────────────────────────────────────────

export const SWR = 0.04
export const DEFAULT_RETURN = 0.07
export const DEFAULT_VOLATILITY = 0.15
export const NL_AOW_AGE = 67
export const NL_AOW_MONTHLY = 1380 // alleenstaand, bruto 2025
export const INFLATION = 0.02

// ── Types ────────────────────────────────────────────────────

export interface HorizonInput {
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  monthlyContributions: number // sum of asset monthly_contributions
  yearlyMustExpenses: number
  dateOfBirth: string | null // ISO date
  expectedReturn?: number // annual decimal, default 0.07
}

export interface FireProjection {
  fireTarget: number
  netWorth: number
  freedomPercentage: number
  fireAge: number | null // null if no DOB
  currentAge: number | null
  fireDate: string // 'mrt 2038' or 'Bereikt!'
  countdownDays: number
  countdownYears: number
  countdownMonths: number
  freedomYears: number
  freedomMonths: number
  monthlyPassiveIncome: number
  monthlySavings: number
  savingsRate: number
}

export interface FireRange {
  optimistic: FireProjection
  expected: FireProjection
  pessimistic: FireProjection
}

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

export interface LifeEvent {
  id: string
  name: string
  event_type: string
  target_age: number | null
  target_date: string | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  icon: string
  is_active: boolean
  sort_order: number
}

export interface LifeEventImpact {
  event: LifeEvent
  fireDelayMonths: number
  totalCost: number
  freedomDaysLost: number
}

export interface ResilienceBreakdown {
  emergency: number // 0-25
  diversification: number // 0-25
  debtRatio: number // 0-25
  savingsRate: number // 0-25
}

export interface ResilienceScore {
  total: number // 0-100
  breakdown: ResilienceBreakdown
  label: string
}

// ── Life Event Catalog ───────────────────────────────────────

export const LIFE_EVENT_CATALOG: Record<string, {
  label: string
  icon: string
  defaultCost: number
  defaultMonthlyCost: number
  defaultDuration: number
  description: string
}> = {
  sabbatical: {
    label: 'Sabbatical',
    icon: 'Palmtree',
    defaultCost: 2000,
    defaultMonthlyCost: 0,
    defaultDuration: 6,
    description: 'Onbetaald verlof van het werk',
  },
  world_trip: {
    label: 'Wereldreis',
    icon: 'Globe',
    defaultCost: 15000,
    defaultMonthlyCost: 2000,
    defaultDuration: 12,
    description: 'Langdurige reis rond de wereld',
  },
  children: {
    label: 'Kinderen',
    icon: 'Baby',
    defaultCost: 5000,
    defaultMonthlyCost: 500,
    defaultDuration: 216, // 18 jaar
    description: 'Opvoedkosten per kind',
  },
  renovation: {
    label: 'Verbouwing',
    icon: 'Hammer',
    defaultCost: 30000,
    defaultMonthlyCost: 0,
    defaultDuration: 0,
    description: 'Grote verbouwing of renovatie',
  },
  study: {
    label: 'Studie',
    icon: 'GraduationCap',
    defaultCost: 8000,
    defaultMonthlyCost: 0,
    defaultDuration: 24,
    description: 'Opleiding of cursus',
  },
  career_change: {
    label: 'Carrière switch',
    icon: 'Briefcase',
    defaultCost: 3000,
    defaultMonthlyCost: 0,
    defaultDuration: 6,
    description: 'Overgang naar ander werk',
  },
  part_time: {
    label: 'Part-time werken',
    icon: 'Clock',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultDuration: 60,
    description: 'Minder uren werken',
  },
  early_retirement: {
    label: 'Vervroegd pensioen',
    icon: 'Sunset',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultDuration: 0,
    description: 'Eerder stoppen met werken',
  },
  move: {
    label: 'Verhuizing',
    icon: 'Home',
    defaultCost: 10000,
    defaultMonthlyCost: 0,
    defaultDuration: 0,
    description: 'Verhuizen naar ander huis of stad',
  },
  wedding: {
    label: 'Trouwerij',
    icon: 'Heart',
    defaultCost: 20000,
    defaultMonthlyCost: 0,
    defaultDuration: 0,
    description: 'Bruiloft en huwelijk',
  },
  custom: {
    label: 'Anders',
    icon: 'Calendar',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultDuration: 0,
    description: 'Eigen levensgebeurtenis',
  },
}

export const MARKET_WEATHER = {
  normal: { label: 'Normaal', return: 0.07, volatility: 0.15, description: 'Gemiddeld marktrendement' },
  bull: { label: 'Bull markt', return: 0.12, volatility: 0.12, description: 'Sterke markt, hoog rendement' },
  bear: { label: 'Bear markt', return: -0.20, volatility: 0.25, description: 'Crash in jaar 1, daarna herstel' },
  stagflation: { label: 'Stagflatie', return: 0.02, volatility: 0.18, description: 'Laag rendement, hoge inflatie' },
  historical: { label: 'Historisch', return: 0.08, volatility: 0.17, description: 'AEX-achtige patronen' },
} as const

export type MarketWeather = keyof typeof MARKET_WEATHER

// ── Helpers ──────────────────────────────────────────────────

export function ageAtDate(dob: string, date: Date = new Date()): number {
  const birth = new Date(dob)
  let age = date.getFullYear() - birth.getFullYear()
  const m = date.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && date.getDate() < birth.getDate())) age--
  return age
}

export function formatFireAge(age: number | null): string {
  if (age === null) return '-'
  const years = Math.floor(age)
  const months = Math.round((age - years) * 12)
  return months > 0 ? `${years} jaar en ${months} mnd` : `${years} jaar`
}

export function formatCountdown(days: number): string {
  if (days <= 0) return 'Bereikt!'
  const years = Math.floor(days / 365)
  const remaining = days % 365
  const months = Math.floor(remaining / 30)
  if (years > 0 && months > 0) return `${years}j ${months}mnd`
  if (years > 0) return `${years}j`
  return `${months}mnd`
}

/** Box-Muller transform for normal distribution */
export function normalRandom(mean: number, stddev: number, seed?: number): number {
  // Simple seeded PRNG (xorshift32) when seed provided
  let u1: number, u2: number
  if (seed !== undefined) {
    let s = seed
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    u1 = Math.abs(s) / 2147483647
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    u2 = Math.abs(s) / 2147483647
    u1 = Math.max(u1, 0.0001)
    u2 = Math.max(u2, 0.0001)
  } else {
    u1 = Math.random()
    u2 = Math.random()
    u1 = Math.max(u1, 0.0001)
  }
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + stddev * z
}

// Seeded PRNG class for Monte Carlo
class SeededRandom {
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

// ── Core Computations ────────────────────────────────────────

/**
 * Compute FIRE projection from financial inputs.
 */
export function computeFireProjection(
  input: HorizonInput,
  annualReturn: number = DEFAULT_RETURN,
): FireProjection {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, monthlyContributions, yearlyMustExpenses, dateOfBirth } = input
  const netWorth = totalAssets - totalDebts
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / SWR : 0
  const freedomPercentage = fireTarget > 0 ? Math.min((netWorth / fireTarget) * 100, 100) : 0
  const monthlySavings = monthlyIncome - monthlyExpenses
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0
  const monthlyPassiveIncome = (netWorth * SWR) / 12

  // Freedom time
  const freedomMonthsTotal = yearlyExpenses > 0 ? (netWorth / yearlyExpenses) * 12 : 0
  const freedomYears = Math.floor(Math.max(0, freedomMonthsTotal) / 12)
  const freedomMonths = Math.floor(Math.max(0, freedomMonthsTotal) % 12)

  // FIRE date calculation
  const monthlyReturn = annualReturn / 12
  let projected = netWorth
  let months = 0
  let fireDate = ''
  let countdownDays = 0
  let countdownYears = 0
  let countdownMonths = 0
  let fireAge: number | null = null
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null

  if (netWorth >= fireTarget && fireTarget > 0) {
    fireDate = 'Bereikt!'
    fireAge = currentAge
  } else if (monthlySavings > 0 && fireTarget > netWorth) {
    while (projected < fireTarget && months < 600) {
      projected = projected * (1 + monthlyReturn) + monthlySavings
      months++
    }
    if (months < 600) {
      const fd = new Date()
      fd.setMonth(fd.getMonth() + months)
      fireDate = fd.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
      countdownDays = Math.round(months * 30.44)
      countdownYears = Math.floor(months / 12)
      countdownMonths = months % 12

      if (currentAge !== null) {
        fireAge = currentAge + months / 12
      }
    } else {
      fireDate = 'Niet haalbaar'
    }
  } else if (fireTarget > 0) {
    fireDate = 'Niet haalbaar'
  }

  return {
    fireTarget,
    netWorth,
    freedomPercentage,
    fireAge,
    currentAge,
    fireDate,
    countdownDays,
    countdownYears,
    countdownMonths,
    freedomYears,
    freedomMonths,
    monthlyPassiveIncome,
    monthlySavings,
    savingsRate,
  }
}

/**
 * Compute optimistic / expected / pessimistic FIRE projections.
 */
export function computeFireRange(input: HorizonInput): FireRange {
  return {
    optimistic: computeFireProjection(input, 0.09),
    expected: computeFireProjection(input, 0.07),
    pessimistic: computeFireProjection(input, 0.04),
  }
}

/**
 * Month-by-month forward projection.
 */
export function projectForward(
  input: HorizonInput,
  months: number,
  annualReturn: number = DEFAULT_RETURN,
): ProjectionMonth[] {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const monthlyReturn = annualReturn / 12
  const monthlySavings = monthlyIncome - monthlyExpenses
  let netWorth = totalAssets - totalDebts
  const now = new Date()
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const result: ProjectionMonth[] = []

  for (let m = 0; m <= months; m++) {
    const date = new Date(now)
    date.setMonth(date.getMonth() + m)
    const age = currentAge !== null ? currentAge + m / 12 : null
    const passiveIncome = (netWorth * SWR) / 12

    result.push({
      month: m,
      date: date.toISOString().split('T')[0],
      netWorth: Math.round(netWorth),
      passiveIncome: Math.round(passiveIncome),
      age,
      contributions: m === 0 ? 0 : monthlySavings,
      growth: m === 0 ? 0 : Math.round(netWorth * monthlyReturn),
    })

    if (m < months) {
      const growth = netWorth * monthlyReturn
      netWorth = netWorth + growth + monthlySavings
    }
  }

  return result
}

/**
 * Three diverging scenario paths: Drifter, Current, Optimizer.
 */
export function computeScenarios(
  input: HorizonInput,
  maxYears: number = 40,
): ScenarioPath[] {
  const months = maxYears * 12
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const netWorth = totalAssets - totalDebts
  const now = new Date()
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / SWR : 0

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
    const monthlyReturn = DEFAULT_RETURN / 12
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
        passiveIncome: Math.round((nw * SWR) / 12),
        age,
        contributions: m === 0 ? 0 : Math.round(mSavings),
        growth: 0,
      })

      // Check FIRE
      const currentFireTarget = (mExpenses * 12) / SWR
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
 */
export function runMonteCarlo(
  input: HorizonInput,
  sims: number = 1000,
  years: number = 40,
): MonteCarloResult {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const netWorth = totalAssets - totalDebts
  const monthlySavings = monthlyIncome - monthlyExpenses
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / SWR : 0
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
      const annualReturn = rng.normal(DEFAULT_RETURN, DEFAULT_VOLATILITY)
      nw = nw * (1 + annualReturn) + monthlySavings * 12
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
): WithdrawalResult {
  const totalYears = targetAge - retirementAge
  if (totalYears <= 0) {
    return { strategy, monthlyWithdrawal: 0, yearlySustainable: 0, successYears: 0, totalYears: 0, schedule: [], depleted: false }
  }

  const schedule: WithdrawalYear[] = []
  let balance = startPortfolio
  let depleted = false
  let successYears = 0

  // Initial withdrawal rate
  const baseWithdrawal = startPortfolio * SWR
  let currentWithdrawal = baseWithdrawal

  // Bucket strategy pools
  let cashBucket = strategy === 'bucket' ? startPortfolio * 0.15 : 0
  let bondBucket = strategy === 'bucket' ? startPortfolio * 0.30 : 0
  let stockBucket = strategy === 'bucket' ? startPortfolio * 0.55 : 0

  // Guardrails
  const guardrailFloor = baseWithdrawal * 0.80
  const guardrailCeiling = baseWithdrawal * 1.20

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
      const variableWithdrawal = balance * SWR
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
          currentWithdrawal = Math.min(currentWithdrawal * 1.10, guardrailCeiling)
        } else if (returnPct < -0.20) {
          currentWithdrawal = Math.max(currentWithdrawal * 0.90, guardrailFloor)
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
      bondBucket *= (1 + 0.03)
      stockBucket *= (1 + annualReturn)

      // Rebalance: refill cash from stocks
      const targetCash = yearlyExpenses * 3
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
        growth: Math.round(bondBucket * 0.03 + stockBucket * annualReturn),
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
 * Compute the FIRE delay caused by a single life event.
 */
export function computeLifeEventImpact(
  input: HorizonInput,
  event: LifeEvent,
): LifeEventImpact {
  const baseProjection = computeFireProjection(input)
  const baseFire = baseProjection.countdownDays

  // Compute adjusted input
  const totalCost = Number(event.one_time_cost) +
    (Number(event.monthly_cost_change) * Number(event.duration_months))
  const totalIncomeChange = Number(event.monthly_income_change) * Number(event.duration_months)

  const adjustedInput: HorizonInput = {
    ...input,
    totalAssets: input.totalAssets - Number(event.one_time_cost),
    monthlyExpenses: input.monthlyExpenses + Number(event.monthly_cost_change),
    monthlyIncome: input.monthlyIncome + Number(event.monthly_income_change),
  }

  const adjustedProjection = computeFireProjection(adjustedInput)
  const adjustedFire = adjustedProjection.countdownDays

  const fireDelayMonths = Math.round((adjustedFire - baseFire) / 30.44)
  const dailyExpense = input.monthlyExpenses > 0 ? (input.monthlyExpenses * 12) / 365 : 0
  const freedomDaysLost = dailyExpense > 0 ? Math.round(totalCost / dailyExpense) : 0

  return {
    event,
    fireDelayMonths: Math.max(0, fireDelayMonths),
    totalCost: totalCost - totalIncomeChange,
    freedomDaysLost: Math.max(0, freedomDaysLost),
  }
}

/**
 * Compute resilience score (0-100).
 */
export function computeResilienceScore(input: HorizonInput): ResilienceScore {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses } = input
  const netWorth = totalAssets - totalDebts
  const monthlySavings = monthlyIncome - monthlyExpenses

  // Emergency fund: months of expenses covered by liquid assets (assume 30% is liquid)
  const liquidAssets = totalAssets * 0.3
  const emergencyMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0
  const emergency = Math.min(25, Math.round((emergencyMonths / 6) * 25))

  // Diversification: simple heuristic (better with actual asset types, but works from totals)
  const assetToDebtRatio = totalDebts > 0 ? totalAssets / totalDebts : totalAssets > 0 ? 10 : 0
  const diversification = Math.min(25, Math.round(Math.min(assetToDebtRatio / 3, 1) * 25))

  // Debt ratio: debt as % of assets
  const debtPct = totalAssets > 0 ? totalDebts / totalAssets : 1
  const debtScore = Math.min(25, Math.round((1 - Math.min(debtPct, 1)) * 25))

  // Savings rate
  const sr = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0
  const savingsScore = Math.min(25, Math.round(Math.min(sr / 0.30, 1) * 25))

  const total = emergency + diversification + debtScore + savingsScore

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
