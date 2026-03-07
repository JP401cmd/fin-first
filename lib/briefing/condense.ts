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

  // Net worth delta (month-over-month)
  if (data.netWorthDelta != null) {
    const sign = data.netWorthDelta >= 0 ? '+' : ''
    lines.push(`Vermogensdelta (MoM): ${sign}${formatCurrency(data.netWorthDelta)}`)
  }

  // Consecutive positive growth months
  if (data.netWorthHistory.length >= 2) {
    let streak = 0
    for (let i = data.netWorthHistory.length - 1; i > 0; i--) {
      if (data.netWorthHistory[i].value > data.netWorthHistory[i - 1].value) streak++
      else break
    }
    if (streak > 0) lines.push(`Opeenvolgende maanden groei: ${streak}`)
  }

  // Previous month expenses comparison
  if (data.prevMonthExpenses > 0) {
    const delta = data.monthlyExpenses - data.prevMonthExpenses
    const sign = delta >= 0 ? '+' : ''
    lines.push(`Vorige maand uitgaven: ${formatCurrency(data.prevMonthExpenses)} (verschil: ${sign}${formatCurrency(delta)})`)
  }

  // Savings rate trend (current vs 3-month avg from sovereignty data)
  lines.push(`Huidige spaarquote: ${savingsRate}%`)
  lines.push('')

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

  // Favorite budget breakdowns
  if (data.favoriteBudgets.length > 0) {
    lines.push('')
    lines.push('FAVORIETE BUDGETTEN:')
    for (const fb of data.favoriteBudgets) {
      const fbPct = fb.limit > 0 ? Math.round((fb.spent / fb.limit) * 100) : 0
      const remaining = Math.max(0, fb.limit - fb.spent)
      lines.push(`- ${fb.name}: ${formatCurrency(fb.spent)} van ${formatCurrency(fb.limit)} (${fbPct}%, rest ${formatCurrency(remaining)})`)
    }
  }
  lines.push('')

  // Month summary
  if (data.monthSummary) {
    const ms = data.monthSummary
    lines.push('MAANDOVERZICHT:')
    lines.push(`- Vermogensdelta: ${ms.netWorthDelta >= 0 ? '+' : ''}${formatCurrency(ms.netWorthDelta)}`)
    lines.push(`- Vrijheidsdagen gewonnen: ${Math.round(ms.freedomDaysWon)}`)
    lines.push(`- Spaarquote: ${Math.round(ms.savingsRate)}%`)
    lines.push(`- Budgetscore: ${Math.round(ms.budgetScore)}%`)
    if (ms.prevMonthComparison !== 0) {
      lines.push(`- Vergelijking vorige maand: ${ms.prevMonthComparison >= 0 ? '+' : ''}${Math.round(ms.prevMonthComparison)}%`)
    }
    lines.push('')
  }

  // Streaks
  if (data.streaks && data.streaks.length > 0) {
    lines.push('STREAKS:')
    for (const s of data.streaks) {
      if (s.currentCount > 0) {
        const typeLabel = s.type === 'login' ? 'Inlog' : s.type === 'budget' ? 'Budget' : 'Actie'
        lines.push(`- ${typeLabel}: ${s.currentCount} dagen (record: ${s.longestCount})`)
      }
    }
    lines.push('')
  }

  // Notifications (urgent, max 3)
  if (data.notifications && data.notifications.length > 0) {
    const urgent = data.notifications
      .filter(n => n.severity === 'critical' || n.severity === 'warning')
      .slice(0, 3)
    if (urgent.length > 0) {
      lines.push('MELDINGEN:')
      for (const n of urgent) {
        const prefix = n.severity === 'critical' ? '⚠' : '⚡'
        lines.push(`- ${prefix} [${n.type}] ${n.message}`)
      }
      lines.push('')
    }
  }

  // Badges
  if (data.badgeSummary) {
    const bs = data.badgeSummary
    lines.push(`BADGES: ${bs.earned}/${bs.total} behaald`)
    if (bs.latestBadge) {
      lines.push(`- Laatste: ${bs.latestBadge.name} (${bs.latestBadge.earnedAt})`)
    }
    if (bs.nearestBadge) {
      lines.push(`- Bijna: ${bs.nearestBadge.name} (${bs.nearestBadge.progress}%)`)
    }
    lines.push('')
  }

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

  // Goals with deadlines
  lines.push(`DOELEN: ${data.goals}`)
  if (data.topGoals.length > 0) {
    for (const g of data.topGoals) {
      const goalPct = g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0
      const deadline = g.target_date ? ` deadline ${g.target_date}` : ''
      const remaining = g.target_value - g.current_value
      lines.push(`- ${g.name}: ${goalPct}% (${formatCurrency(g.current_value)} / ${formatCurrency(g.target_value)}, rest ${formatCurrency(remaining)}${deadline})`)
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

  // Recurring transactions (vaste lasten)
  if (data.topRecurringTransactions && data.topRecurringTransactions.length > 0) {
    lines.push('TERUGKERENDE KOSTEN:')
    const top5 = data.topRecurringTransactions.slice(0, 5)
    for (const rt of top5) {
      const amt = Math.abs(rt.amount)
      const cat = rt.category ? ` [${rt.category}]` : ''
      const freedom = dailyExp > 0 ? ` (${freedomStr(amt, dailyExp)})` : ''
      lines.push(`- ${rt.name}: ${formatCurrency(amt)}/mnd${cat}${freedom}`)
    }
    const totalRecurring = data.totalRecurringAmount ?? 0
    if (totalRecurring > 0) {
      const totalFreedom = dailyExp > 0 ? ` (${freedomStr(totalRecurring, dailyExp)})` : ''
      lines.push(`Totaal terugkerend: ${formatCurrency(totalRecurring)}/mnd${totalFreedom}`)
    }
    lines.push('')
  } else {
    lines.push(`Terugkerende transacties: ${data.recurringTransactions}`)
  }

  // Recommendations (detailed)
  lines.push(`AANBEVELINGEN: ${data.recommendations} totaal`)
  if (data.topRecommendations && data.topRecommendations.length > 0) {
    for (const rec of data.topRecommendations.slice(0, 3)) {
      const impact = rec.freedomDaysImpact > 0 ? ` — ${rec.freedomDaysImpact} vrijheidsdagen/jaar` : ''
      lines.push(`- ${rec.title} (${rec.category})${impact}`)
    }
  }
  lines.push('')

  // Life events
  lines.push(`Levensgebeurtenissen: ${data.lifeEvents}`)

  return lines.join('\n')
}
