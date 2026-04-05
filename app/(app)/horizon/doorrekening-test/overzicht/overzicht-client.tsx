'use client'

import { useMemo, useState, useRef, useCallback } from 'react'
import { Settings, TrendingUp, Minus, ArrowDownRight, ArrowUpRight, ListOrdered, Shuffle, Target } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { FireParams } from '@/lib/fire-params'
import type { LifeEvent } from '@/lib/horizon-data'
import { NL_SWR, BOX3_TARIEF, NL_FICTIEF_BELEGGINGEN } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { type FireEndStrategy, STRATEGY_LABELS, parseFireStrategy } from '@/lib/fire-strategy'

// ── Withdrawal Strategy Types ─────────────────────────────────

type WithdrawalStrategy = 'swr' | 'guardrails' | 'vpw' | 'bucket'

const WITHDRAWAL_STRATEGIES: { key: WithdrawalStrategy; name: string; desc: string; detail: string }[] = [
  {
    key: 'swr',
    name: 'Vast (SWR)',
    desc: 'Vaste jaarlijkse onttrekking',
    detail: `${(NL_SWR * 100).toFixed(2)}% van je portfolio per jaar — stabiel en voorspelbaar`,
  },
  {
    key: 'guardrails',
    name: 'Guardrails',
    desc: 'Variabel met grenzen',
    detail: 'Flexibele onttrekking met vloer- en plafondgrenzen (±20%)',
  },
  {
    key: 'vpw',
    name: 'VPW',
    desc: 'Variabel per leeftijd',
    detail: 'Onttrekking op basis van resterende levensverwachting — hoger naarmate je ouder wordt',
  },
  {
    key: 'bucket',
    name: 'Bucket',
    desc: '3-emmers strategie',
    detail: 'Cash (2j), obligaties (5j), aandelen — vermindert volgorderisico',
  },
]

// ── End Strategy Descriptions (for overzicht UI) ─────────────

const END_STRATEGY_OPTIONS: { key: FireEndStrategy; icon: string; color: string }[] = [
  { key: 'perpetual', icon: '∞', color: 'horizon' },
  { key: 'legacy', icon: '🏛', color: 'horizon' },
  { key: 'deplete', icon: '📉', color: 'horizon' },
  { key: 'pensioen', icon: '🧓', color: 'horizon' },
]

// ── Distribution Strategy Types ───────────────────────────────

type DistributionStrategy = 'proportional' | 'cash_first' | 'lowest_return'

const DISTRIBUTION_STRATEGIES: { key: DistributionStrategy; name: string; desc: string; when: string }[] = [
  {
    key: 'proportional',
    name: 'Spreiden',
    desc: 'Proportioneel uit alle bezittingen naar waarde-aandeel',
    when: 'Goed als je je portefeuille in balans wilt houden',
  },
  {
    key: 'cash_first',
    name: 'Cash first',
    desc: 'Eerst uit bezitting met laagste verwacht rendement',
    when: 'Slim als je renderende bezittingen wilt laten groeien',
  },
  {
    key: 'lowest_return',
    name: 'Laagste rendement first',
    desc: 'Uit laagste rendement bezitting, doorschuiven als leeg',
    when: 'Maximaal rendement behouden op de langere termijn',
  },
]

// ── Outflow Distribution Types (accumulation phase — life event costs) ──

type OutflowDistribution = 'proportional' | 'cash_first' | 'lowest_return_first'

const OUTFLOW_DISTRIBUTIONS: { key: OutflowDistribution; name: string; desc: string; when: string }[] = [
  {
    key: 'proportional',
    name: 'Spreiden',
    desc: 'Proportioneel uit alle bezittingen naar waarde-aandeel',
    when: 'Goed als je je portefeuille in balans wilt houden',
  },
  {
    key: 'cash_first',
    name: 'Cash first',
    desc: 'Eerst uit bezitting met laagste verwacht rendement',
    when: 'Slim als je renderende bezittingen wilt laten groeien',
  },
  {
    key: 'lowest_return_first',
    name: 'Laagste rendement first',
    desc: 'Uit laagste rendement bezitting, doorschuiven als leeg',
    when: 'Maximaal rendement behouden op de langere termijn',
  },
]

// ── Withdrawal Order Types (decumulation phase) ──────────────

type WithdrawalOrder = 'cash_first' | 'low_return_first' | 'own_home_last' | 'pro_rata' | 'highest_value_first'

const WITHDRAWAL_ORDERS: { key: WithdrawalOrder; name: string; desc: string; when: string }[] = [
  {
    key: 'cash_first',
    name: 'Cash first',
    desc: 'Eerst spaar-/cashrekeningen, dan laag rendement, dan hoog rendement',
    when: 'Beschermt groei-bezittingen zo lang mogelijk',
  },
  {
    key: 'low_return_first',
    name: 'Laag rendement first',
    desc: 'Eerst bezitting met laagste verwacht rendement, oplopend',
    when: 'Maximaal rendement op resterende portefeuille',
  },
  {
    key: 'own_home_last',
    name: 'Eigen huis laatst',
    desc: 'Alle liquide bezittingen eerst, vastgoed/huis als allerlaatste',
    when: 'Woonzekerheid behouden tot het uiterste',
  },
  {
    key: 'pro_rata',
    name: 'Pro rata (spreiden)',
    desc: 'Proportioneel uit alle bezittingen',
    when: 'Portefeuille-balans behouden tijdens afbouw',
  },
  {
    key: 'highest_value_first',
    name: 'Hoogste waarde first',
    desc: 'Eerst uit grootste positie, dan aflopend',
    when: 'Sneller naar een meer gebalanceerde portefeuille',
  },
]

// ── Types ──────────────────────────────────────────────────────

interface Asset {
  id: string
  name: string
  current_value: number
  expected_return: number
  monthly_contribution: number
  asset_type: string
  [key: string]: unknown
}

interface Debt {
  id: string
  name: string
  current_balance: number
  interest_rate: number
  monthly_payment: number
  [key: string]: unknown
}

// ── Projection Logic ───────────────────────────────────────────

interface ProjectionYear {
  year: number
  age: number | null
  totalAssets: number
  totalDebts: number
  netWorth: number
  annualSavings: number
  annualReturn: number
  box3Tax: number
  cumulativeTax: number
  cumulativeSavings: number
  lifeEventInflow: number
  cumulativeLifeEventInflow: number
  /** Withdrawal amount in post-crossover (decumulation) phase */
  withdrawal: number
  /** Negative life event outflow (absolute value, always >= 0) */
  negativeLifeEvent: number
  /** Total loss: box3Tax + withdrawal + negativeLifeEvent */
  totalLoss: number
  /** Cumulative return on assets since year 0 */
  cumulativeReturn: number
}

/**
 * Compute how life event inflows are distributed across assets.
 * Returns the total annual inflow to add to asset contributions.
 */
function computeLifeEventInflow(
  lifeEvents: LifeEvent[],
  year: number,
  currentAge: number | null,
  distributionStrategy: DistributionStrategy,
  assets: Asset[],
): number {
  let totalInflow = 0
  for (const evt of lifeEvents) {
    const evtAge = Number(evt.age ?? 0)
    const age = currentAge != null ? currentAge + year : year
    // One-time events
    if (evt.type === 'eenmalig' || evt.type === 'one_time') {
      if (Math.floor(evtAge) === Math.floor(age)) {
        const income = Number(evt.monthly_income ?? evt.income ?? 0)
        const cost = Number(evt.monthly_cost ?? evt.cost ?? 0)
        totalInflow += income - cost
      }
    }
    // Recurring events
    if (evt.type === 'doorlopend' || evt.type === 'recurring') {
      const startAge = evtAge
      const duration = Number(evt.duration_years ?? evt.duration ?? 0)
      const endAge = startAge + duration
      if (age >= startAge && age < endAge) {
        const income = Number(evt.monthly_income ?? evt.income ?? 0) * 12
        const cost = Number(evt.monthly_cost ?? evt.cost ?? 0) * 12
        totalInflow += income - cost
      }
    }
  }
  // Distribution strategy only matters for WHERE the inflow goes (per-asset level)
  // but for total projection it's the same total amount regardless
  // The strategy affects asset-level allocation which we model as weighted growth
  return totalInflow
}

/**
 * Compute the annual withdrawal based on the chosen strategy.
 * Returns the withdrawal amount for a given year in the decumulation phase.
 */
function computeWithdrawal(
  strategy: WithdrawalStrategy,
  portfolioValue: number,
  yearlyExpenses: number,
  yearInRetirement: number,
  remainingYears: number,
): number {
  switch (strategy) {
    case 'swr':
      // Fixed SWR-based withdrawal
      return portfolioValue * NL_SWR

    case 'guardrails': {
      // Base withdrawal = SWR, with ±20% guardrails
      const base = portfolioValue * NL_SWR
      const floor = yearlyExpenses * 0.8
      const ceiling = yearlyExpenses * 1.2
      return Math.max(floor, Math.min(ceiling, base))
    }

    case 'vpw': {
      // Variable Percentage Withdrawal: portfolio / remaining years (simplified)
      if (remainingYears <= 0) return portfolioValue
      return portfolioValue / remainingYears
    }

    case 'bucket': {
      // Bucket strategy: withdraw expenses from cash bucket, rest grows
      // Simplified: withdraw needed expenses, capped at portfolio
      return Math.min(yearlyExpenses, portfolioValue)
    }

    default:
      return portfolioValue * NL_SWR
  }
}

/**
 * Sort assets by withdrawal order and draw down in sequence.
 * Mutates assetBalances in place.
 */
function applyWithdrawalOrder(
  assetBalances: { balance: number; expected_return: number; current_value: number; asset_type: string; name: string }[],
  amount: number,
  order: WithdrawalOrder,
) {
  if (order === 'pro_rata') {
    const total = assetBalances.reduce((s, a) => s + Math.max(0, a.balance), 0)
    if (total <= 0) return
    for (const ab of assetBalances) {
      const share = Math.max(0, ab.balance) / total
      ab.balance -= amount * share
    }
    return
  }

  const sorted = [...assetBalances].sort((a, b) => {
    switch (order) {
      case 'cash_first': {
        const aIsCash = a.asset_type === 'savings' || a.asset_type === 'cash' || a.expected_return === 0 ? 0 : 1
        const bIsCash = b.asset_type === 'savings' || b.asset_type === 'cash' || b.expected_return === 0 ? 0 : 1
        if (aIsCash !== bIsCash) return aIsCash - bIsCash
        return a.expected_return - b.expected_return
      }
      case 'low_return_first':
        return a.expected_return - b.expected_return
      case 'own_home_last': {
        const aIsHome = a.asset_type === 'real_estate' || a.asset_type === 'eigen_woning' ? 1 : 0
        const bIsHome = b.asset_type === 'real_estate' || b.asset_type === 'eigen_woning' ? 1 : 0
        if (aIsHome !== bIsHome) return aIsHome - bIsHome
        return a.expected_return - b.expected_return
      }
      case 'highest_value_first':
        return b.balance - a.balance
      default:
        return 0
    }
  })

  let remaining = amount
  for (const sortedAsset of sorted) {
    if (remaining <= 0) break
    const ab = assetBalances.find((a) => a === sortedAsset)
    if (!ab || ab.balance <= 0) continue
    const draw = Math.min(remaining, ab.balance)
    ab.balance -= draw
    remaining -= draw
  }
}

/**
 * Apply outflow distribution during accumulation phase (life event costs).
 * Determines which assets get reduced when costs occur.
 */
function applyOutflowDistribution(
  assetBalances: { balance: number; expected_return: number; current_value: number; asset_type: string; name: string }[],
  amount: number,
  strategy: OutflowDistribution,
) {
  if (strategy === 'proportional') {
    const total = assetBalances.reduce((s, a) => s + Math.max(0, a.balance), 0)
    if (total <= 0) return
    for (const ab of assetBalances) {
      const share = Math.max(0, ab.balance) / total
      ab.balance -= amount * share
    }
    return
  }

  const sorted = [...assetBalances].sort((a, b) => {
    if (strategy === 'cash_first') {
      const aIsCash = a.asset_type === 'savings' || a.asset_type === 'cash' || a.expected_return === 0 ? 0 : 1
      const bIsCash = b.asset_type === 'savings' || b.asset_type === 'cash' || b.expected_return === 0 ? 0 : 1
      if (aIsCash !== bIsCash) return aIsCash - bIsCash
      return a.expected_return - b.expected_return
    }
    if (strategy === 'lowest_return_first') return a.expected_return - b.expected_return
    return 0
  })

  let remaining = amount
  for (const sortedAsset of sorted) {
    if (remaining <= 0) break
    const ab = assetBalances.find((a) => a === sortedAsset)
    if (!ab || ab.balance <= 0) continue
    const draw = Math.min(remaining, ab.balance)
    ab.balance -= draw
    remaining -= draw
  }
}

function computeProjection({
  assets,
  debts,
  grossReturn,
  inflationRate,
  currentAge,
  projectionYears,
  monthlyIncome,
  savingsRate,
  yearlyExpenses,
  endStrategy,
  legacyAmount,
  withdrawalStrategy,
  distributionStrategy,
  outflowDistribution,
  withdrawalOrder,
  lifeEvents,
}: {
  assets: Asset[]
  debts: Debt[]
  grossReturn: number
  inflationRate: number
  currentAge: number | null
  projectionYears: number
  monthlyIncome: number
  savingsRate: number
  yearlyExpenses: number
  endStrategy: FireEndStrategy
  legacyAmount: number
  withdrawalStrategy: WithdrawalStrategy
  distributionStrategy: DistributionStrategy
  outflowDistribution: OutflowDistribution
  withdrawalOrder: WithdrawalOrder
  lifeEvents: LifeEvent[]
}): ProjectionYear[] {
  const rows: ProjectionYear[] = []

  // Initial values — per-asset tracking for withdrawal order
  const assetBalances = assets.map((a) => ({ ...a, balance: a.current_value }))
  let assetTotal = assets.reduce((s, a) => s + a.current_value, 0)
  let debtTotal = debts.reduce((s, d) => s + d.current_balance, 0)
  let cumulativeTax = 0
  const annualContributions = assets.reduce((s, a) => s + (a.monthly_contribution ?? 0) * 12, 0)
  const annualSavings = monthlyIncome * (savingsRate / 100) * 12
  let runningCumulativeSavings = 0
  let runningCumulativeReturn = 0
  let runningCumulativeLifeEventInflow = 0

  // Heffingsvrij vermogen
  const heffingsvrij = 59357

  // FIRE target depends on end strategy
  let fireTarget: number
  const NL_AOW_AGE = 67
  switch (endStrategy) {
    case 'perpetual':
      // Must sustain forever via SWR
      fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : Infinity
      break
    case 'legacy':
      // Must sustain withdrawals AND leave legacyAmount at endAge
      fireTarget = yearlyExpenses > 0 ? (yearlyExpenses / NL_SWR) + legacyAmount : Infinity
      break
    case 'deplete': {
      // Can deplete to €0 over remaining years — need less capital
      const yearsInRetirement = currentAge != null ? 100 - currentAge : projectionYears
      if (yearlyExpenses > 0 && grossReturn > 0) {
        // Annuity present value formula
        const r = grossReturn - inflationRate
        if (Math.abs(r) < 0.001) {
          fireTarget = yearlyExpenses * yearsInRetirement
        } else {
          fireTarget = yearlyExpenses * (1 - Math.pow(1 + r, -yearsInRetirement)) / r
        }
      } else {
        fireTarget = yearlyExpenses * yearsInRetirement
      }
      break
    }
    case 'pensioen': {
      // Target: cover expenses only until AOW age, then AOW supplements
      const yearsToAOW = currentAge != null ? Math.max(0, NL_AOW_AGE - currentAge) : 30
      fireTarget = yearlyExpenses > 0 ? yearlyExpenses * yearsToAOW * 0.7 : Infinity // 70% factor for partial coverage
      break
    }
    default:
      fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : Infinity
  }
  let crossoverYear: number | null = null

  for (let y = 0; y <= projectionYears; y++) {
    const netWorth = assetTotal - debtTotal

    // Detect crossover
    if (crossoverYear == null && netWorth >= fireTarget && fireTarget < Infinity) {
      crossoverYear = y
    }

    const isPostCrossover = crossoverYear != null && y > crossoverYear
    const remainingYears = projectionYears - y

    // Box 3 tax
    const taxableBase = Math.max(0, netWorth - heffingsvrij - cumulativeTax)
    const box3Tax = y === 0 ? 0 : taxableBase * NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF

    // Withdrawal in post-crossover phase
    let withdrawal = 0
    if (isPostCrossover && yearlyExpenses > 0) {
      const inflatedExpenses = yearlyExpenses * Math.pow(1 + inflationRate, y - (crossoverYear ?? 0))
      withdrawal = computeWithdrawal(withdrawalStrategy, assetTotal, inflatedExpenses, y - (crossoverYear ?? 0), remainingYears)
    }

    // Life event inflows (computed before push so chart can use it)
    const lifeEventInflow = computeLifeEventInflow(lifeEvents, y, currentAge, distributionStrategy, assets)
    const yearSavings = y === 0 ? 0 : isPostCrossover ? 0 : annualSavings
    runningCumulativeSavings += yearSavings
    const positiveLifeEventInflow = Math.max(0, lifeEventInflow)
    const negativeLifeEvent = Math.abs(Math.min(0, lifeEventInflow))
    runningCumulativeLifeEventInflow += positiveLifeEventInflow
    const totalLoss = box3Tax + withdrawal + negativeLifeEvent
    const yearReturn = y === 0 ? 0 : assetTotal * grossReturn
    runningCumulativeReturn += yearReturn

    rows.push({
      year: y,
      age: currentAge != null ? currentAge + y : null,
      totalAssets: assetTotal,
      totalDebts: debtTotal,
      netWorth: netWorth - cumulativeTax,
      annualSavings: yearSavings,
      annualReturn: yearReturn,
      box3Tax,
      cumulativeTax,
      cumulativeSavings: runningCumulativeSavings,
      lifeEventInflow: positiveLifeEventInflow,
      cumulativeLifeEventInflow: runningCumulativeLifeEventInflow,
      withdrawal,
      negativeLifeEvent,
      totalLoss,
      cumulativeReturn: runningCumulativeReturn,
    })

    cumulativeTax += box3Tax

    // Grow assets per-asset, apply withdrawal order during decumulation
    if (isPostCrossover) {
      for (const ab of assetBalances) {
        const assetReturn = Number(ab.expected_return ?? 0) / 100
        ab.balance = ab.balance * (1 + assetReturn)
      }
      if (withdrawal > 0) applyWithdrawalOrder(assetBalances, withdrawal, withdrawalOrder)
      if (lifeEventInflow > 0) {
        const totalBal = assetBalances.reduce((s, a) => s + a.balance, 0)
        for (const ab of assetBalances) {
          ab.balance += lifeEventInflow * (totalBal > 0 ? ab.balance / totalBal : 1 / assetBalances.length)
        }
      } else if (lifeEventInflow < 0) {
        applyWithdrawalOrder(assetBalances, Math.abs(lifeEventInflow), withdrawalOrder)
      }
      assetTotal = assetBalances.reduce((s, a) => s + Math.max(0, a.balance), 0)
    } else {
      for (const ab of assetBalances) {
        const assetReturn = Number(ab.expected_return ?? 0) / 100
        ab.balance = ab.balance * (1 + assetReturn) + (ab.monthly_contribution ?? 0) * 12
      }
      if (lifeEventInflow > 0) {
        // Positive inflows: use distribution strategy (toename)
        const totalBal = assetBalances.reduce((s, a) => s + a.balance, 0)
        for (const ab of assetBalances) {
          ab.balance += lifeEventInflow * (totalBal > 0 ? ab.balance / totalBal : 1 / assetBalances.length)
        }
      } else if (lifeEventInflow < 0) {
        // Negative outflows: use outflow distribution strategy (afname)
        applyOutflowDistribution(assetBalances, Math.abs(lifeEventInflow), outflowDistribution)
      }
      assetTotal = assetBalances.reduce((s, a) => s + a.balance, 0)
    }

    // Pay down debts: compute per-debt with individual interest rates
    if (debtTotal > 0) {
      let newDebtTotal = 0
      for (const debt of debts) {
        const annualRate = Number(debt.interest_rate ?? 0) / 100
        const annualPayment = Number(debt.monthly_payment ?? 0) * 12
        const yearsFromNow = y + 1
        const balance = debt.current_balance
        if (annualRate > 0) {
          const factor = Math.pow(1 + annualRate, yearsFromNow)
          const remaining = balance * factor - annualPayment * (factor - 1) / annualRate
          newDebtTotal += Math.max(0, remaining)
        } else {
          const remaining = balance - annualPayment * yearsFromNow
          newDebtTotal += Math.max(0, remaining)
        }
      }
      debtTotal = newDebtTotal
    }
  }

  return rows
}

// ── Chart Component (Interactive with Crosshair + Tooltip) ────

function ProjectionChart({
  data,
  width = 800,
  height = 320,
}: {
  data: ProjectionYear[]
  width?: number
  height?: number
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null

  const padL = 70
  const padR = 20
  const padT = 20
  const padB = 40
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  const values = data.map((d) => d.netWorth)
  const assetValues = data.map((d) => d.totalAssets)
  const debtValues = data.map((d) => d.totalDebts)

  const lossValues = data.map((d) => -d.totalLoss)
  const savingsValues = data.map((d) => d.cumulativeSavings)
  const lifeEventValues = data.map((d) => d.cumulativeLifeEventInflow)
  const returnValues = data.map((d) => d.cumulativeReturn)
  const allValues = [...values, ...assetValues, ...debtValues, ...savingsValues, ...lifeEventValues, ...lossValues, ...returnValues]
  const minV = Math.min(0, ...allValues)
  const maxV = Math.max(...allValues)
  const range = maxV - minV || 1

  function x(i: number): number {
    return padL + (i / (data.length - 1)) * chartW
  }
  function y(v: number): number {
    return padT + chartH - ((v - minV) / range) * chartH
  }

  // Detect crossover year: first year where annualSavings drops to 0 after being > 0
  let crossoverIndex: number | null = null
  for (let i = 1; i < data.length; i++) {
    if (data[i].annualSavings === 0 && data[i - 1].annualSavings > 0) {
      crossoverIndex = i
      break
    }
  }

  const netPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.netWorth).toFixed(1)}`).join(' ')
  const assetPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.totalAssets).toFixed(1)}`).join(' ')
  const debtPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.totalDebts).toFixed(1)}`).join(' ')

  // Area under net worth — split into opbouw (purple) and afbouw (teal) at crossover
  const areaPath = `${netPath} L${x(data.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`

  // Split area: opbouw phase (start to crossover)
  const opbouwEnd = crossoverIndex != null ? crossoverIndex : data.length - 1
  const opbouwAreaPath = data.slice(0, opbouwEnd + 1).map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.netWorth).toFixed(1)}`
  ).join(' ') + ` L${x(opbouwEnd).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`

  // Split area: afbouw phase (crossover to end)
  const afbouwAreaPath = crossoverIndex != null && crossoverIndex < data.length - 1
    ? data.slice(crossoverIndex).map((d, i) =>
        `${i === 0 ? 'M' : 'L'}${x(crossoverIndex + i).toFixed(1)},${y(d.netWorth).toFixed(1)}`
      ).join(' ') + ` L${x(data.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(crossoverIndex).toFixed(1)},${y(0).toFixed(1)} Z`
    : null

  // Groei (cumulative return) area — shows how much of portfolio comes from growth
  const groeiAreaPath = data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.cumulativeReturn).toFixed(1)}`
  ).join(' ') + ` L${x(data.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`

  // Loss area: stacked layers below zero line
  // Layer 1 (bottom): Box 3 belasting — from 0 to -box3Tax
  // Layer 2 (middle): Onttrekkingen — from -box3Tax to -(box3Tax + withdrawal)
  // Layer 3 (top): Neg. levensgebeurtenissen — from -(box3Tax + withdrawal) to -totalLoss
  const hasLoss = data.some((d) => d.totalLoss > 0)

  // Helper: build a filled area between two value-functions (top → bottom → back)
  function stackedArea(topFn: (d: ProjectionYear) => number, bottomFn: (d: ProjectionYear) => number): string {
    const forward = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(topFn(d)).toFixed(1)}`).join(' ')
    const backward = [...data].reverse().map((d, i) => `${i === 0 ? 'L' : 'L'}${x(data.length - 1 - i).toFixed(1)},${y(bottomFn(d)).toFixed(1)}`).join(' ')
    return `${forward} ${backward} Z`
  }

  const lossBox3Path = hasLoss ? stackedArea((d) => -d.box3Tax, () => 0) : ''
  const lossWithdrawalPath = hasLoss ? stackedArea((d) => -(d.box3Tax + d.withdrawal), (d) => -d.box3Tax) : ''
  const lossEventsPath = hasLoss ? stackedArea((d) => -d.totalLoss, (d) => -(d.box3Tax + d.withdrawal)) : ''

  // Cumulative savings area (stops at crossover)
  const savingsAreaPoints = data.filter((d, i) => {
    if (crossoverIndex != null && i > crossoverIndex) return false
    return true
  })
  const savingsAreaPath = savingsAreaPoints.length > 1
    ? savingsAreaPoints.map((d, i) => {
        const idx = data.indexOf(d)
        return `${i === 0 ? 'M' : 'L'}${x(idx).toFixed(1)},${y(d.cumulativeSavings).toFixed(1)}`
      }).join(' ') + ` L${x(data.indexOf(savingsAreaPoints[savingsAreaPoints.length - 1])).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
    : null

  // Positive life event inflow markers (individual year spikes)
  const lifeEventMarkers = data.filter((d) => d.lifeEventInflow > 0)

  // Grid lines (5 steps)
  const gridLines = Array.from({ length: 6 }, (_, i) => {
    const v = minV + (range / 5) * i
    return { v, yPos: y(v) }
  })

  // X-axis labels
  const step = data.length <= 15 ? 1 : data.length <= 35 ? 5 : 10
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  // Mouse move handler: map pixel position to nearest data index
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * width
    // Clamp to chart area
    if (svgX < padL || svgX > width - padR) {
      setHoverIndex(null)
      return
    }
    const ratio = (svgX - padL) / chartW
    const idx = Math.round(ratio * (data.length - 1))
    setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)))
  }, [data.length, width, chartW])

  const handleMouseLeave = useCallback(() => setHoverIndex(null), [])

  const hd = hoverIndex != null ? data[hoverIndex] : null
  const isCrossover = hoverIndex != null && crossoverIndex != null && hoverIndex === crossoverIndex

  // Tooltip position: flip to left side if past 60% of chart
  const tooltipFlip = hoverIndex != null && hoverIndex > data.length * 0.6

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: `${height}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--horizon-500, #8b5cf6)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--horizon-500, #8b5cf6)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="opbouwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--horizon-500, #8b5cf6)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--horizon-500, #8b5cf6)" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="afbouwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="groeiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="eventGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.08" />
          </linearGradient>
        </defs>

        {/* ── Loss areas (stacked below zero line) ── */}
        {hasLoss && lossBox3Path && (
          <path d={lossBox3Path} fill="#ef4444" opacity="0.25" />
        )}
        {hasLoss && lossWithdrawalPath && (
          <path d={lossWithdrawalPath} fill="#f97316" opacity="0.2" />
        )}
        {hasLoss && lossEventsPath && (
          <path d={lossEventsPath} fill="#f59e0b" opacity="0.18" />
        )}

        {/* Grid lines */}
        {gridLines.map(({ v, yPos }, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yPos} y2={yPos} stroke="var(--border-ed)" strokeWidth="0.5" strokeDasharray={v === 0 ? undefined : '4,4'} />
            <text x={padL - 8} y={yPos + 4} textAnchor="end" className="fill-[var(--ink-4)] text-[10px]">
              {v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        {minV < 0 && (
          <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="6,3" />
        )}

        {/* Crossover marker line with label */}
        {crossoverIndex != null && (
          <g>
            <line
              x1={x(crossoverIndex)} x2={x(crossoverIndex)}
              y1={padT} y2={padT + chartH}
              stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.7"
            />
            {/* Crossover dot on net worth line */}
            <circle
              cx={x(crossoverIndex)}
              cy={y(data[crossoverIndex].netWorth)}
              r="5" fill="#8b5cf6" stroke="white" strokeWidth="2"
            />
            {/* Crossover label */}
            <g transform={`translate(${x(crossoverIndex)}, ${padT + 4})`}>
              <rect
                x="-40" y="-2" width="80" height="26" rx="4"
                fill="var(--horizon-500, #8b5cf6)" opacity="0.9"
              />
              <text x="0" y="9" textAnchor="middle" className="fill-white text-[9px] font-bold">
                {data[crossoverIndex].age != null ? `${data[crossoverIndex].age}j` : `Jaar ${data[crossoverIndex].year}`}
              </text>
              <text x="0" y="19" textAnchor="middle" className="fill-white text-[8px]" opacity="0.85">
                {data[crossoverIndex].netWorth >= 1000000
                  ? `€${(data[crossoverIndex].netWorth / 1000000).toFixed(1)}M`
                  : `€${(data[crossoverIndex].netWorth / 1000).toFixed(0)}k`}
              </text>
            </g>
          </g>
        )}

        {/* Cumulative savings area (light green, stops at crossover) */}
        {savingsAreaPath && (
          <path d={savingsAreaPath} fill="url(#savingsGrad)" />
        )}

        {/* Positive life event inflow markers (purple spikes) */}
        {lifeEventMarkers.map((d) => {
          const idx = data.indexOf(d)
          const barWidth = Math.max(3, chartW / data.length * 0.6)
          return (
            <rect
              key={`evt-${d.year}`}
              x={x(idx) - barWidth / 2}
              y={y(d.lifeEventInflow)}
              width={barWidth}
              height={y(0) - y(d.lifeEventInflow)}
              fill="url(#eventGrad)"
              rx="1"
            />
          )
        })}

        {/* Opbouw phase area (horizon-purple) */}
        <path d={opbouwAreaPath} fill="url(#opbouwGrad)" />

        {/* Afbouw phase area (teal) */}
        {afbouwAreaPath && (
          <path d={afbouwAreaPath} fill="url(#afbouwGrad)" />
        )}

        {/* Groei (cumulative return) area */}
        <path d={groeiAreaPath} fill="url(#groeiGrad)" />

        {/* Cumulative savings line */}
        {savingsAreaPath && (
          <path
            d={savingsAreaPoints.map((d, i) => {
              const idx = data.indexOf(d)
              return `${i === 0 ? 'M' : 'L'}${x(idx).toFixed(1)},${y(d.cumulativeSavings).toFixed(1)}`
            }).join(' ')}
            fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.6"
          />
        )}

        {/* Cumulative return line (groei) */}
        <path
          d={data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.cumulativeReturn).toFixed(1)}`).join(' ')}
          fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.6"
        />

        {/* Lines */}
        <path d={assetPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
        <path d={debtPath} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
        <path d={netPath} fill="none" stroke="var(--horizon-500, #8b5cf6)" strokeWidth="2.5" />

        {/* End dots */}
        {data.length > 0 && (
          <>
            <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].netWorth)} r="4" fill="var(--horizon-500, #8b5cf6)" />
            <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].totalAssets)} r="3" fill="#10b981" />
            <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].totalDebts)} r="3" fill="#ef4444" />
          </>
        )}

        {/* Hover crosshair + dots */}
        {hoverIndex != null && hd != null && (
          <>
            {/* Vertical crosshair line */}
            <line
              x1={x(hoverIndex)} x2={x(hoverIndex)}
              y1={padT} y2={padT + chartH}
              stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3,3" opacity="0.7"
            />
            {/* Dots on each line at hover position */}
            <circle cx={x(hoverIndex)} cy={y(hd.netWorth)} r="5" fill="var(--horizon-500, #8b5cf6)" stroke="white" strokeWidth="2" />
            <circle cx={x(hoverIndex)} cy={y(hd.totalAssets)} r="4" fill="#10b981" stroke="white" strokeWidth="1.5" />
            {hd.totalDebts > 0 && (
              <circle cx={x(hoverIndex)} cy={y(hd.totalDebts)} r="4" fill="#ef4444" stroke="white" strokeWidth="1.5" />
            )}
          </>
        )}

        {/* X-axis labels */}
        {xLabels.map((d) => {
          const i = data.indexOf(d)
          const label = d.age != null ? `${d.age}j` : `${d.year}j`
          return (
            <text key={d.year} x={x(i)} y={height - 8} textAnchor="middle" className="fill-[var(--ink-4)] text-[10px]">
              {label}
            </text>
          )
        })}

        {/* Invisible hover rectangles for easier mouse tracking */}
        <rect
          x={padL} y={padT}
          width={chartW} height={chartH}
          fill="transparent"
          className="cursor-crosshair"
        />
      </svg>

      {/* Tooltip (HTML overlay for better styling) */}
      {hoverIndex != null && hd != null && svgRef.current && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            top: '12px',
            left: tooltipFlip ? undefined : `${(x(hoverIndex) / width) * 100}%`,
            right: tooltipFlip ? `${100 - (x(hoverIndex) / width) * 100}%` : undefined,
            transform: tooltipFlip ? 'translateX(8px)' : 'translateX(-50%)',
          }}
        >
          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 shadow-lg" style={{ minWidth: '200px' }}>
            {/* Header: age/year */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-ed)] pb-1.5 mb-1.5">
              <span className="font-mono text-xs font-bold tabular-nums text-[var(--ink)]">
                {hd.age != null ? `Leeftijd ${hd.age}j` : `Jaar ${hd.year}`}
              </span>
              {isCrossover && (
                <span className="rounded bg-horizon-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-horizon-700">
                  Kruispunt
                </span>
              )}
            </div>

            {/* Total net worth */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] text-[var(--ink-3)]">Totaal vermogen</span>
              <span className="font-mono text-xs font-bold tabular-nums text-horizon-600">
                {formatCurrency(hd.netWorth)}
              </span>
            </div>

            {/* Breakdown items */}
            <div className="mt-1 space-y-0.5">
              {hd.annualSavings > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-[var(--ink-3)]">Spaarinleg</span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-emerald-600">
                    +{formatCurrency(hd.annualSavings)}
                  </span>
                </div>
              )}
              {hd.cumulativeSavings > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-[var(--ink-3)]">Cum. spaarinleg</span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-emerald-600">
                    {formatCurrency(hd.cumulativeSavings)}
                  </span>
                </div>
              )}
              {hd.lifeEventInflow > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-[var(--ink-3)]">Inkomsten events</span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-purple-600">
                    +{formatCurrency(hd.lifeEventInflow)}
                  </span>
                </div>
              )}
              {hd.annualReturn !== 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-[var(--ink-3)]">Rendement</span>
                  <span className={`font-mono text-[10px] font-semibold tabular-nums ${hd.annualReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {hd.annualReturn >= 0 ? '+' : ''}{formatCurrency(hd.annualReturn)}
                  </span>
                </div>
              )}
              {hd.totalDebts > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-[var(--ink-3)]">Schulden</span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-red-600">
                    -{formatCurrency(hd.totalDebts)}
                  </span>
                </div>
              )}
            </div>

            {/* ── Verlies breakdown (color-coded matching area layers) ── */}
            {hd.totalLoss > 0 && (
              <div className="mt-1.5 border-t border-[var(--border-ed)] pt-1 space-y-0.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] font-semibold text-[var(--ink-2)]">Verlies dit jaar</span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-red-600">
                    -{formatCurrency(hd.totalLoss)}
                  </span>
                </div>
                {hd.box3Tax > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: '#ef4444', opacity: 0.7 }} />
                      Belasting
                    </span>
                    <span className="font-mono text-[10px] font-semibold tabular-nums text-red-600">
                      -{formatCurrency(hd.box3Tax)}
                    </span>
                  </div>
                )}
                {hd.withdrawal > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: '#f97316', opacity: 0.7 }} />
                      Onttrekking
                    </span>
                    <span className="font-mono text-[10px] font-semibold tabular-nums text-orange-600">
                      -{formatCurrency(hd.withdrawal)}
                    </span>
                  </div>
                )}
                {hd.negativeLifeEvent > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: '#f59e0b', opacity: 0.7 }} />
                      Events
                    </span>
                    <span className="font-mono text-[10px] font-semibold tabular-nums text-amber-600">
                      -{formatCurrency(hd.negativeLifeEvent)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Bezittingen / schulden totals */}
            <div className="mt-1.5 border-t border-[var(--border-ed)] pt-1 space-y-0.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-[var(--ink-3)]">Bezittingen</span>
                <span className="font-mono text-[10px] font-semibold tabular-nums text-emerald-600">
                  {formatCurrency(hd.totalAssets)}
                </span>
              </div>
              {hd.cumulativeTax > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-[var(--ink-3)]">Cum. Box 3</span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-red-600">
                    -{formatCurrency(hd.cumulativeTax)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function OverzichtClient({
  assets,
  debts,
  profile,
  fireParams,
  netWorth,
  totalAssets,
  totalDebts,
  yearlyMustExpenses,
  lifeEvents,
  cashflows,
}: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  netWorth: number
  totalAssets: number
  totalDebts: number
  yearlyMustExpenses: number
  lifeEvents: LifeEvent[]
  cashflows: SimCashflow[]
}) {
  // Editable settings (local overrides)
  const profileReturn = fireParams.grossReturn * 100
  const profileInflation = fireParams.inflationRate * 100
  const profileIncome = Number(profile?.net_monthly_income ?? 0)
  const profileSavingsRate = Number(profile?.savings_rate ?? 0)
  const profileExpenses = Number(profile?.monthly_expenses ?? 0) || yearlyMustExpenses / 12

  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth
    ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  const maxYears = currentAge != null ? 100 - currentAge : 60
  const defaultYears = currentAge != null ? maxYears : 30

  const [grossReturnPct, setGrossReturnPct] = useState(profileReturn)
  const [inflationPct, setInflationPct] = useState(profileInflation)
  const [projectionYears, setProjectionYears] = useState(defaultYears)
  const [monthlyIncome, setMonthlyIncome] = useState(profileIncome)
  const [savingsRate, setSavingsRate] = useState(profileSavingsRate)
  const [monthlyExpenses, setMonthlyExpenses] = useState(profileExpenses)

  // Parse profile's end strategy
  const profileStrategyConfig = parseFireStrategy(profile ?? {})
  const profileEndStrategy = profileStrategyConfig.strategy
  const profileLegacyAmount = profileStrategyConfig.legacyAmount

  // 5 strategy settings that drive all calculations
  const [endStrategy, setEndStrategy] = useState<FireEndStrategy>(profileEndStrategy)
  const [legacyAmount, setLegacyAmount] = useState(profileLegacyAmount)
  const [withdrawalStrategy, setWithdrawalStrategy] = useState<WithdrawalStrategy>('swr')
  const [distributionStrategy, setDistributionStrategy] = useState<DistributionStrategy>('proportional')
  const [outflowDistribution, setOutflowDistribution] = useState<OutflowDistribution>('proportional')
  const [withdrawalOrder, setWithdrawalOrder] = useState<WithdrawalOrder>('cash_first')

  // Computed projection — recalculates when ANY of the 5 strategy settings change
  const projection = useMemo(() => {
    return computeProjection({
      assets,
      debts,
      grossReturn: grossReturnPct / 100,
      inflationRate: inflationPct / 100,
      currentAge,
      projectionYears,
      monthlyIncome,
      savingsRate,
      yearlyExpenses: monthlyExpenses * 12,
      endStrategy,
      legacyAmount,
      withdrawalStrategy,
      distributionStrategy,
      outflowDistribution,
      withdrawalOrder,
      lifeEvents,
    })
  }, [assets, debts, grossReturnPct, inflationPct, currentAge, projectionYears, monthlyIncome, savingsRate, monthlyExpenses, endStrategy, legacyAmount, withdrawalStrategy, distributionStrategy, outflowDistribution, withdrawalOrder, lifeEvents])

  const finalRow = projection[projection.length - 1]

  // Detect crossover year for display
  const crossoverRow = projection.find((r, i) => {
    if (i === 0) return false
    const prev = projection[i - 1]
    return prev.annualSavings > 0 && r.annualSavings === 0
  })

  const hasChanges = grossReturnPct !== profileReturn || inflationPct !== profileInflation ||
    projectionYears !== defaultYears || monthlyIncome !== profileIncome ||
    savingsRate !== profileSavingsRate || monthlyExpenses !== profileExpenses ||
    endStrategy !== profileEndStrategy || withdrawalStrategy !== 'swr' ||
    distributionStrategy !== 'proportional' || outflowDistribution !== 'proportional' ||
    withdrawalOrder !== 'cash_first'

  function resetToDefaults() {
    setGrossReturnPct(profileReturn)
    setInflationPct(profileInflation)
    setProjectionYears(defaultYears)
    setMonthlyIncome(profileIncome)
    setSavingsRate(profileSavingsRate)
    setMonthlyExpenses(profileExpenses)
    setEndStrategy(profileEndStrategy)
    setLegacyAmount(profileLegacyAmount)
    setWithdrawalStrategy('swr')
    setDistributionStrategy('proportional')
    setOutflowDistribution('proportional')
    setWithdrawalOrder('cash_first')
  }

  return (
    <div className="space-y-6">
      {/* ── Settings Panel ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Instellingen</h3>
          {hasChanges && (
            <button
              onClick={resetToDefaults}
              className="ml-auto rounded-lg border border-[var(--border-ed)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
            >
              Reset naar profiel
            </button>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {/* Gross Return */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Bruto rendement
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={0.5}
                  value={grossReturnPct}
                  onChange={(e) => setGrossReturnPct(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {grossReturnPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Inflation */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Inflatie
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.25}
                  value={inflationPct}
                  onChange={(e) => setInflationPct(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {inflationPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Projection Years */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Projectiejaren
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={maxYears}
                  step={1}
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {projectionYears}j
                </span>
              </div>
            </div>

            {/* Monthly Income */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Netto inkomen (mnd)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Savings Rate */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Spaarquote
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={savingsRate}
                  onChange={(e) => setSavingsRate(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {savingsRate.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Monthly Expenses */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Maandelijkse uitgaven
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={monthlyExpenses}
                  onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* ── Strategy Selectors — compact 2-column card grid (#683) ── */}
          <div className="mt-5 border-t border-[var(--border-ed)] pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

              {/* Card 1: Eindstrategie */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-horizon-50 text-horizon-600">
                    <Target className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Eindstrategie</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Hoe ga je om met je vermogen?</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {END_STRATEGY_OPTIONS.map((opt) => {
                    const info = STRATEGY_LABELS[opt.key]
                    const isActive = endStrategy === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setEndStrategy(opt.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-horizon-400 bg-horizon-50/80 ring-1 ring-horizon-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-horizon-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-horizon-500" />}
                          {opt.icon} {info.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {endStrategy === 'legacy' && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[10px] font-semibold text-[var(--ink-3)]">Nalatenschap:</label>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={legacyAmount}
                      onChange={(e) => setLegacyAmount(Number(e.target.value))}
                      className="w-28 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none"
                    />
                    <span className="text-[10px] text-[var(--ink-4)]">€</span>
                  </div>
                )}
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {STRATEGY_LABELS[endStrategy].subtitle}
                </p>
              </div>

              {/* Card 2: Onttrekkingsstrategie */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-horizon-50 text-horizon-600">
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Onttrekkingsstrategie</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Hoeveel onttrek je per jaar?</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {WITHDRAWAL_STRATEGIES.map((s) => {
                    const isActive = withdrawalStrategy === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => setWithdrawalStrategy(s.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-horizon-400 bg-horizon-50/80 ring-1 ring-horizon-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-horizon-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-horizon-500" />}
                          {s.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {WITHDRAWAL_STRATEGIES.find((s) => s.key === withdrawalStrategy)?.detail}
                </p>
              </div>

              {/* Card 3: Verdeling toename (inflow) */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Verdeling toename</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Waar gaat binnenkomend geld naartoe?</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DISTRIBUTION_STRATEGIES.map((s) => {
                    const isActive = distributionStrategy === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => setDistributionStrategy(s.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-emerald-400 bg-emerald-50/80 ring-1 ring-emerald-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-emerald-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                          {s.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {DISTRIBUTION_STRATEGIES.find((s) => s.key === distributionStrategy)?.when}
                </p>
              </div>

              {/* Card 4: Verdeling afname (outflow) */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Shuffle className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Verdeling afname</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Waar komt uitgaand geld vandaan?</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {OUTFLOW_DISTRIBUTIONS.map((s) => {
                    const isActive = outflowDistribution === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => setOutflowDistribution(s.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-amber-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
                          {s.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {OUTFLOW_DISTRIBUTIONS.find((s) => s.key === outflowDistribution)?.when}
                </p>
              </div>

              {/* Card 5: Onttrekkingsvolgorde — full-width bottom row */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5 sm:col-span-2">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <ListOrdered className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Onttrekkingsvolgorde</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Welke bezittingen worden eerst aangesproken na stoppen met werken?</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WITHDRAWAL_ORDERS.map((o) => {
                    const isActive = withdrawalOrder === o.key
                    return (
                      <button
                        key={o.key}
                        onClick={() => setWithdrawalOrder(o.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-red-400 bg-red-50/80 ring-1 ring-red-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-red-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />}
                          {o.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {WITHDRAWAL_ORDERS.find((o) => o.key === withdrawalOrder)?.when}
                </p>
              </div>

            </div>
          </div>

          {/* Quick summary */}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-[var(--border-ed)] pt-3 text-xs text-[var(--ink-3)]">
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Reëel rendement:</span>{' '}
              <span className="font-mono tabular-nums">{(grossReturnPct - inflationPct).toFixed(1)}%</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">SWR:</span>{' '}
              <span className="font-mono tabular-nums">{(NL_SWR * 100).toFixed(3)}%</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Box 3 druk:</span>{' '}
              <span className="font-mono tabular-nums">{(NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF * 100).toFixed(2)}%</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Bezittingen:</span>{' '}
              <span className="font-mono tabular-nums">{assets.length}</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Schulden:</span>{' '}
              <span className="font-mono tabular-nums">{debts.length}</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Levensgebeurtenissen:</span>{' '}
              <span className="font-mono tabular-nums">{lifeEvents.length}</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Projection Chart ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Vermogensprojectie</h3>
        </div>

        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          {/* Active strategy summary badges */}
          <div className="mb-4 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full bg-horizon-50 px-2.5 py-0.5 font-medium text-horizon-700">
              {STRATEGY_LABELS[endStrategy].name}
            </span>
            <span className="rounded-full bg-horizon-50 px-2.5 py-0.5 font-medium text-horizon-700">
              {WITHDRAWAL_STRATEGIES.find((s) => s.key === withdrawalStrategy)?.name}
            </span>
            {crossoverRow && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                Kruispunt: {crossoverRow.age != null ? `${crossoverRow.age}j` : `jaar ${crossoverRow.year}`}
              </span>
            )}
          </div>

          {/* Key metrics */}
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Start netto vermogen</p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                {formatCurrency(netWorth)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Eind netto vermogen ({projectionYears}j)
              </p>
              <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                finalRow && finalRow.netWorth >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {finalRow ? formatCurrency(finalRow.netWorth) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Kruispunt</p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-horizon-600">
                {crossoverRow
                  ? crossoverRow.age != null ? `${crossoverRow.age} jaar` : `jaar ${crossoverRow.year}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Totaal bezittingen (eind)</p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-emerald-600">
                {finalRow ? formatCurrency(finalRow.totalAssets) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Cumulatief Box 3 belasting</p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-red-600">
                {finalRow ? formatCurrency(finalRow.cumulativeTax) : '—'}
              </p>
            </div>
          </div>

          {/* Chart */}
          <ProjectionChart data={projection} />

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border-ed)] pt-3 text-[11px] text-[var(--ink-3)]">
            <span className="flex items-center gap-1.5">
              <Minus className="h-3 w-5 text-[#8b5cf6]" strokeWidth={3} />
              Netto vermogen
            </span>
            <span className="flex items-center gap-1.5">
              <Minus className="h-3 w-5 text-emerald-500" strokeWidth={1.5} strokeDasharray="4,3" />
              Bezittingen
            </span>
            <span className="flex items-center gap-1.5">
              <Minus className="h-3 w-5 text-red-500" strokeWidth={1.5} strokeDasharray="4,3" />
              Schulden
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm bg-emerald-500/20 border border-emerald-500/40" />
              Spaarinleg
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm bg-purple-400/25 border border-purple-400/40" />
              Inkomsten events
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
