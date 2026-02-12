/**
 * Core dashboard data calculation.
 * Computes freedom metrics from real financial data.
 *
 * SWR (Safe Withdrawal Rate): 4%
 * FIRE target = yearly expenses / 0.04
 * Freedom % = net worth / FIRE target
 * Freedom time = net worth / yearly expenses
 */

export type CoreData = {
  // Freedom timeline
  freedomPercentage: number
  freedomYears: number
  freedomMonths: number
  netWorth: number
  fireTarget: number
  expectedFireDate: string
  yearsToFire: number
  monthsToFire: number

  // KPI's
  daysWonPerMonth: number
  savingsRate: number
  freeDaysPerYear: number
  autonomyScore: string

  // Kerngetallen
  estimatedYearlyIncome: number
  yearlyMustExpenses: number
  yearlyExpenses: number
  monthlyIncome: number
  monthlyExpenses: number
  totalAssets: number
  totalDebts: number
}

const SWR = 0.04

export function computeCoreData(
  monthlyIncome: number,
  monthlyExpenses: number,
  totalAssets: number,
  totalDebts: number,
  last12MonthsIncome?: number,
  yearlyMustExpenses?: number,
): CoreData {
  const yearlyIncome = monthlyIncome * 12
  const yearlyExpenses = monthlyExpenses * 12
  const monthlySavings = monthlyIncome - monthlyExpenses
  const netWorth = totalAssets - totalDebts

  // FIRE calculations
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / SWR : 0
  const freedomPercentage = fireTarget > 0 ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0) : 0

  // Freedom time: how long could you live off net worth
  const freedomMonthsTotal = yearlyExpenses > 0 ? (netWorth / yearlyExpenses) * 12 : 0
  const freedomYears = Math.floor(freedomMonthsTotal / 12)
  const freedomMonths = Math.floor(freedomMonthsTotal % 12)

  // Savings rate
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0

  // Days won per month (how many days of expenses covered by monthly savings)
  const dailyExpense = monthlyExpenses > 0 ? yearlyExpenses / 365 : 0
  const daysWonPerMonth = dailyExpense > 0 ? Math.round(monthlySavings / dailyExpense) : 0

  // Free days per year (passive income from net worth at SWR / daily expenses)
  const passiveIncome = netWorth * SWR
  const freeDaysPerYear = dailyExpense > 0 ? Math.round(passiveIncome / dailyExpense) : 0

  // Expected FIRE date
  let yearsToFire = 0
  let monthsToFire = 0
  let expectedFireDate = ''
  if (monthlySavings > 0 && fireTarget > netWorth) {
    // Simple compound growth: assume 7% annual return on investments
    const annualReturn = 0.07
    const monthlyReturn = annualReturn / 12
    let projected = netWorth
    let months = 0
    while (projected < fireTarget && months < 600) {
      projected = projected * (1 + monthlyReturn) + monthlySavings
      months++
    }
    yearsToFire = Math.floor(months / 12)
    monthsToFire = months % 12

    const fireDate = new Date()
    fireDate.setMonth(fireDate.getMonth() + months)
    expectedFireDate = fireDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  } else if (netWorth >= fireTarget && fireTarget > 0) {
    expectedFireDate = 'Bereikt!'
  }

  // Autonomy score (A-F based on freedom %)
  let autonomyScore: string
  if (freedomPercentage >= 100) autonomyScore = 'A+'
  else if (freedomPercentage >= 75) autonomyScore = 'A'
  else if (freedomPercentage >= 50) autonomyScore = 'B'
  else if (freedomPercentage >= 25) autonomyScore = 'C'
  else if (freedomPercentage >= 10) autonomyScore = 'D'
  else autonomyScore = 'E'

  return {
    freedomPercentage,
    freedomYears,
    freedomMonths,
    netWorth,
    fireTarget,
    expectedFireDate,
    yearsToFire,
    monthsToFire,
    daysWonPerMonth,
    savingsRate,
    freeDaysPerYear,
    autonomyScore,
    estimatedYearlyIncome: last12MonthsIncome ?? yearlyIncome,
    yearlyMustExpenses: yearlyMustExpenses ?? 0,
    yearlyExpenses,
    monthlyIncome,
    monthlyExpenses,
    totalAssets,
    totalDebts,
  }
}
