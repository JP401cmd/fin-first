// ── Data Condensation for AI ────────────────────────────────
// Converts DashboardData into a compact text summary for the AI prompt.
// Goal: minimal tokens, maximal signal.

import type { DashboardData } from '@/components/widgets/widget-renderer'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { levelToPhaseId } from '@/lib/feature-phases'
import type { TemporalContext } from './types'

function pct(value: number, total: number): string {
  if (total === 0) return '0'
  return Math.round((value / total) * 100).toString()
}

function freedomStr(amount: number, dailyExp: number): string {
  if (dailyExp <= 0) return '∞'
  const ft = calculateFreedomTime(amount, dailyExp)
  return formatFreedomTimeString(ft, 'short')
}

export function condenseDashboardData(data: DashboardData, temporal: TemporalContext): string {
  const dailyExp = data.monthlyExpenses > 0 ? data.monthlyExpenses / 30 : 0
  const savingsRate = data.monthlyIncome > 0
    ? Math.round(((data.monthlyIncome - data.monthlyExpenses) / data.monthlyIncome) * 100)
    : 0
  const phase = levelToPhaseId(data.sovereigntyLevel)

  const lines: string[] = [
    `FINANCIEEL OVERZICHT (${temporal.date})`,
    `Netto vermogen: ${formatCurrency(data.netWorth)} (${freedomStr(data.netWorth, dailyExp)})`,
    `Totale assets: ${formatCurrency(data.totalAssets)}`,
    `Totale schulden: ${formatCurrency(data.totalDebts)}`,
    `Maandinkomen: ${formatCurrency(data.monthlyIncome)}`,
    `Maanduitgaven: ${formatCurrency(data.monthlyExpenses)}`,
    `Spaarquote: ${savingsRate}%`,
    `Vrijheidspercentage: ${Math.round(data.freedomPct)}%`,
    `FIRE doel: ${formatCurrency(data.fireTarget)}`,
    `FIRE leeftijd: ${data.fireProjResult.fireAge ?? 'onbekend'}`,
    `Sovereignty level: ${data.sovereigntyLevel} (${phase})`,
    `Maanden buffer: ${Math.round(data.monthsCovered * 10) / 10}`,
    `Consumentenschuld: ${data.hasConsumerDebt ? 'ja' : 'nee'}`,
    '',
  ]

  // Budget totals
  const bt = data.budgetTotals
  lines.push('BUDGETTEN DEZE MAAND:')
  lines.push(`- Inkomen: ${formatCurrency(bt.income.spent)} van ${formatCurrency(bt.income.limit)} (${pct(bt.income.spent, bt.income.limit)}%)`)
  lines.push(`- Uitgaven: ${formatCurrency(bt.expense.spent)} van ${formatCurrency(bt.expense.limit)} (${pct(bt.expense.spent, bt.expense.limit)}%)`)
  lines.push(`- Sparen: ${formatCurrency(bt.savings.spent)} van ${formatCurrency(bt.savings.limit)} (${pct(bt.savings.spent, bt.savings.limit)}%)`)
  lines.push(`- Schuld: ${formatCurrency(bt.debt.spent)} van ${formatCurrency(bt.debt.limit)} (${pct(bt.debt.spent, bt.debt.limit)}%)`)

  // Budget pressure indicator
  const expensePct = bt.expense.limit > 0 ? (bt.expense.spent / bt.expense.limit) * 100 : 0
  if (expensePct > 90) lines.push(`⚠ Budget bijna op: ${Math.round(expensePct)}% besteed`)
  else if (expensePct > 75) lines.push(`Budget druk: ${Math.round(expensePct)}% besteed`)
  lines.push('')

  // Actions
  lines.push(`OPENSTAANDE ACTIES: ${data.openActions}`)
  lines.push(`Vrijheidsdagen te winnen: ${Math.round(data.totalFreedomDaysOpen)}`)
  lines.push(`Acties afgerond deze maand: ${data.completedActionsThisMonth}`)
  if (data.topOpenActions.length > 0) {
    for (const a of data.topOpenActions.slice(0, 3)) {
      const impact = a.freedom_days_impact != null ? ` (${a.freedom_days_impact}d)` : ''
      lines.push(`- ${a.title}${impact}`)
    }
  }
  lines.push('')

  // Goals
  lines.push(`DOELEN: ${data.goals}`)
  if (data.topGoals.length > 0) {
    for (const g of data.topGoals) {
      const goalPct = g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0
      lines.push(`- ${g.name}: ${goalPct}% (${formatCurrency(g.current_value)} / ${formatCurrency(g.target_value)})`)
    }
  }
  lines.push('')

  // Net worth history (compact sparkline data)
  if (data.netWorthHistory.length > 0) {
    const histStr = data.netWorthHistory
      .map(h => `${h.month.slice(5, 7)}:${Math.round(h.value / 1000)}k`)
      .join(' ')
    lines.push(`VERMOGEN 12M: ${histStr}`)
    lines.push('')
  }

  // FIRE range
  if (data.fireRange) {
    const fr = data.fireRange
    lines.push('FIRE SCENARIO\'S:')
    lines.push(`- Optimistisch: leeftijd ${fr.optimistic.fireAge ?? '?'}`)
    lines.push(`- Verwacht: leeftijd ${fr.expected.fireAge ?? '?'}`)
    lines.push(`- Pessimistisch: leeftijd ${fr.pessimistic.fireAge ?? '?'}`)
    lines.push('')
  }

  // Countdown
  if (data.simFireCountdown) {
    const cd = data.simFireCountdown
    lines.push(`FIRE COUNTDOWN: ${cd.countdownYears}j ${cd.countdownMonths}m (${cd.countdownDays} dagen)`)
    lines.push('')
  }

  // Backtest
  if (data.backtestSuccessRate != null) {
    lines.push(`BACKTEST SUCCES: ${data.backtestSuccessRate}%`)
    lines.push('')
  }

  // Box 3
  if (data.box3Tax != null) {
    lines.push(`BOX 3 BELASTING: ${formatCurrency(data.box3Tax)}`)
    lines.push('')
  }

  // Seasonal
  if (temporal.seasonalNotes.length > 0) {
    lines.push(`SEIZOEN: ${temporal.seasonalNotes.join('; ')}`)
    lines.push('')
  }

  // Recommendations & misc
  lines.push(`Voorstellen: ${data.recommendations}`)
  lines.push(`Terugkerende transacties: ${data.recurringTransactions}`)
  lines.push(`Levensgebeurtenissen: ${data.lifeEvents}`)

  return lines.join('\n')
}
