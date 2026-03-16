// ── Data Condensation for AI ────────────────────────────────
// Converts DashboardData into a compact text summary for the AI prompt.
// Goal: minimal tokens, maximal signal.

import type { DashboardData } from '@/components/widgets/widget-renderer'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { levelToPhaseId } from '@/lib/feature-phases'
import type { TemporalContext } from './types'
import type { ProgressionEvent } from './progression'
import { computePersonalTrends } from './trends'
import { detectPatterns } from './pattern-detection'
import { getSeasonalContext } from './seasonal'
import { computeAllKernSteps, computeAllWilSteps, computeAllHorizonSteps } from '@/components/app/next-step-card'
import { DISCOVER_ITEMS } from '@/components/app/discover-carousel'

function pct(value: number, total: number): string {
  if (total === 0) return '0'
  return Math.round((value / total) * 100).toString()
}

function freedomStr(amount: number, dailyExp: number): string {
  if (dailyExp <= 0) return '∞'
  const ft = calculateFreedomTime(amount, dailyExp)
  return formatFreedomTimeString(ft, 'short')
}

export function condenseDashboardData(data: DashboardData, temporal: TemporalContext, progressionEvents?: ProgressionEvent[], visitedFeatureIds?: Set<string>): string {
  const dailyExp = (data.monthlyExpenses ?? 0) > 0 ? (data.monthlyExpenses ?? 0) / 30 : 0
  const monthlyIncome = data.monthlyIncome ?? 0
  const monthlyExpenses = data.monthlyExpenses ?? 0
  const savingsRate = monthlyIncome > 0
    ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
    : 0
  const phase = levelToPhaseId(data.sovereigntyLevel ?? 0)

  const fireAge = data.fireProjResult?.fireAge ?? 'onbekend'

  const lines: string[] = [
    `FINANCIEEL OVERZICHT (${temporal.date})`,
    `Netto vermogen: ${formatCurrency(data.netWorth ?? 0)} (${freedomStr(data.netWorth ?? 0, dailyExp)})`,
    `Totale assets: ${formatCurrency(data.totalAssets ?? 0)}`,
    `Totale schulden: ${formatCurrency(data.totalDebts ?? 0)}`,
    `Maandinkomen: ${formatCurrency(monthlyIncome)}`,
    `Maanduitgaven: ${formatCurrency(monthlyExpenses)}`,
    `Spaarquote: ${savingsRate}%`,
    `Vrijheidspercentage: ${Math.round(data.freedomPct ?? 0)}%`,
    `FIRE doel: ${formatCurrency(data.fireTarget ?? 0)}`,
    `FIRE leeftijd: ${fireAge}`,
    `Sovereignty level: ${data.sovereigntyLevel ?? 0} (${phase})`,
    `Maanden buffer: ${Math.round((data.monthsCovered ?? 0) * 10) / 10}`,
    `Consumentenschuld: ${data.hasConsumerDebt ? 'ja' : 'nee'}`,
    '',
  ]

  // Emergency fund
  if (data.emergencyFund) {
    const ef = data.emergencyFund
    const status = ef.isComplete ? 'voldoende' : 'onvoldoende'
    lines.push('NOODFONDS:')
    lines.push(`- Huidig: ${formatCurrency(ef.currentAmount)} (${freedomStr(ef.currentAmount, dailyExp)})`)
    lines.push(`- Doel: ${formatCurrency(ef.targetAmount)}`)
    lines.push(`- Buffer: ${Math.round(ef.monthsCovered * 10) / 10} van ${ef.targetMonths} maanden`)
    lines.push(`- Status: ${status}`)
    lines.push('')
  }

  // Net worth delta (month-over-month)
  if (data.netWorthDelta != null) {
    const sign = data.netWorthDelta >= 0 ? '+' : ''
    lines.push(`Vermogensdelta (MoM): ${sign}${formatCurrency(data.netWorthDelta)}`)
  }

  // Consecutive positive growth months
  const netWorthHistory = data.netWorthHistory ?? []
  if (netWorthHistory.length >= 2) {
    let streak = 0
    for (let i = netWorthHistory.length - 1; i > 0; i--) {
      if (netWorthHistory[i].value > netWorthHistory[i - 1].value) streak++
      else break
    }
    if (streak > 0) lines.push(`Opeenvolgende maanden groei: ${streak}`)
  }

  // Previous month expenses comparison
  if ((data.prevMonthExpenses ?? 0) > 0) {
    const delta = monthlyExpenses - data.prevMonthExpenses
    const sign = delta >= 0 ? '+' : ''
    lines.push(`Vorige maand uitgaven: ${formatCurrency(data.prevMonthExpenses)} (verschil: ${sign}${formatCurrency(delta)})`)
  }

  // Savings rate trend (current vs 3-month avg from sovereignty data)
  lines.push(`Huidige spaarquote: ${savingsRate}%`)
  lines.push('')

  // Budget totals
  const defaultBucket = { limit: 0, spent: 0 }
  const bt = data.budgetTotals ?? { income: defaultBucket, expense: defaultBucket, savings: defaultBucket, debt: defaultBucket }
  const btIncome = bt.income ?? defaultBucket
  const btExpense = bt.expense ?? defaultBucket
  const btSavings = bt.savings ?? defaultBucket
  const btDebt = bt.debt ?? defaultBucket
  lines.push('BUDGETTEN DEZE MAAND:')
  lines.push(`- Inkomen: ${formatCurrency(btIncome.spent)} van ${formatCurrency(btIncome.limit)} (${pct(btIncome.spent, btIncome.limit)}%)`)
  lines.push(`- Uitgaven: ${formatCurrency(btExpense.spent)} van ${formatCurrency(btExpense.limit)} (${pct(btExpense.spent, btExpense.limit)}%)`)
  lines.push(`- Sparen: ${formatCurrency(btSavings.spent)} van ${formatCurrency(btSavings.limit)} (${pct(btSavings.spent, btSavings.limit)}%)`)
  lines.push(`- Schuld: ${formatCurrency(btDebt.spent)} van ${formatCurrency(btDebt.limit)} (${pct(btDebt.spent, btDebt.limit)}%)`)

  // Budget pressure indicator
  const expensePct = btExpense.limit > 0 ? (btExpense.spent / btExpense.limit) * 100 : 0
  if (expensePct > 90) lines.push(`⚠ Budget bijna op: ${Math.round(expensePct)}% besteed`)
  else if (expensePct > 75) lines.push(`Budget druk: ${Math.round(expensePct)}% besteed`)

  // Favorite budget breakdowns
  if (data.favoriteBudgets && data.favoriteBudgets.length > 0) {
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


  // Actions
  lines.push(`OPENSTAANDE ACTIES: ${data.openActions ?? 0}`)
  lines.push(`Vrijheidsdagen te winnen: ${Math.round(data.totalFreedomDaysOpen ?? 0)}`)
  lines.push(`Acties afgerond deze maand: ${data.completedActionsThisMonth ?? 0}`)
  if (data.topOpenActions && data.topOpenActions.length > 0) {
    for (const a of data.topOpenActions.slice(0, 3)) {
      const impact = a.freedom_days_impact != null ? ` (${a.freedom_days_impact}d)` : ''
      lines.push(`- ${a.title}${impact}`)
    }
  }
  lines.push('')

  // Recently completed actions (last 60 days)
  if (data.recentCompletedActions && data.recentCompletedActions.length > 0) {
    lines.push('AFGERONDE ACTIES (laatste 60 dagen):')
    for (const a of data.recentCompletedActions) {
      const impact = a.freedomDaysImpact != null ? ` — ${a.freedomDaysImpact} vrijheidsdagen gewonnen` : ''
      const date = a.completedAt ? ` (${a.completedAt.slice(0, 10)})` : ''
      lines.push(`- ${a.title}${impact}${date}`)
    }
    lines.push('')
  }

  // Effectmeting: impact of completed actions with measurable freedom_days_impact
  const impactActions = (data.recentCompletedActions ?? []).filter(a => a.freedomDaysImpact != null && a.freedomDaysImpact > 0)
  if (impactActions.length > 0) {
    const totalFreedomDays = impactActions.reduce((sum, a) => sum + (a.freedomDaysImpact ?? 0), 0)
    const estimatedMonthlySavings = dailyExp > 0 ? Math.round(totalFreedomDays * dailyExp) : 0

    lines.push('EFFECTMETING (impact van uitgevoerde acties):')
    for (const a of impactActions) {
      const monthlySaving = dailyExp > 0 ? Math.round((a.freedomDaysImpact ?? 0) * dailyExp) : 0
      const savingStr = monthlySaving > 0 ? `, ~${formatCurrency(monthlySaving)}/mnd besparing` : ''
      lines.push(`- ${a.title}: ${a.freedomDaysImpact} vrijheidsdagen/jaar${savingStr} (afgerond ${a.completedAt ? a.completedAt.slice(0, 10) : 'onbekend'})`)
    }
    lines.push(`Totaal: ${totalFreedomDays} vrijheidsdagen/jaar gewonnen`)
    if (estimatedMonthlySavings > 0) {
      lines.push(`Geschatte maandelijkse besparing: ${formatCurrency(estimatedMonthlySavings)}`)
    }

    // Budget context: if expenses decreased, note the trend
    if ((data.prevMonthExpenses ?? 0) > 0 && monthlyExpenses < data.prevMonthExpenses) {
      const saving = data.prevMonthExpenses - monthlyExpenses
      lines.push(`Context: uitgaven daalden ${formatCurrency(saving)}/mnd t.o.v. vorige maand — mogelijk effect van deze acties`)
    }
    lines.push('')
  }

  // Recently rejected actions (last 90 days) — do NOT re-suggest these
  if (data.recentRejectedActions && data.recentRejectedActions.length > 0) {
    lines.push('AFGEWEZEN ACTIES (niet opnieuw voorstellen):')
    for (const a of data.recentRejectedActions) {
      lines.push(`- ${a.title}`)
    }
    lines.push('')
  }

  // Goals with deadlines + coaching context
  lines.push(`DOELEN: ${data.goals ?? 0}`)
  if (data.topGoals && data.topGoals.length > 0) {
    const now = new Date()
    for (const g of data.topGoals) {
      const goalPct = g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0
      const remaining = g.target_value - g.current_value
      const deadline = g.target_date ? ` deadline ${g.target_date}` : ''
      lines.push(`- ${g.name}: ${goalPct}% (${formatCurrency(g.current_value)} / ${formatCurrency(g.target_value)}, rest ${formatCurrency(remaining)}${deadline})`)

      // Coaching: on-track analysis when there's a target date
      if (g.target_date && g.target_value > 0) {
        const targetDate = new Date(g.target_date)
        const totalDays = Math.max(1, (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        const daysLeft = Math.max(0, Math.ceil(totalDays))
        const monthsLeft = Math.max(0.1, daysLeft / 30)

        // Expected progress: linear interpolation based on time elapsed
        // If we don't know start date, use simple remaining/time approach
        const expectedPct = daysLeft <= 0 ? 100 : Math.min(100, 100 - (daysLeft / Math.max(1, totalDays)) * 100)
        const onTrack = goalPct >= expectedPct || daysLeft <= 0

        if (daysLeft <= 0) {
          // Past deadline
          if (goalPct >= 100) {
            lines.push(`  [BEREIKT] Doel behaald!`)
          } else {
            const extra = remaining
            lines.push(`  [ACHTERLOOPT] Deadline verstreken, nog ${formatCurrency(extra)} nodig`)
          }
        } else if (goalPct >= 100) {
          lines.push(`  [BEREIKT] Doel behaald, ${daysLeft} dagen voor deadline`)
        } else if (onTrack) {
          const monthlyNeeded = remaining / monthsLeft
          lines.push(`  [OP SCHEMA] Nog ${formatCurrency(Math.ceil(monthlyNeeded))}/mnd nodig, ${daysLeft}d tot deadline`)
        } else {
          const monthlyNeeded = remaining / monthsLeft
          lines.push(`  [ACHTERLOOPT] Niet op schema, ${formatCurrency(Math.ceil(monthlyNeeded))}/mnd nodig om op tijd te zijn`)
        }
      } else if (goalPct >= 100) {
        lines.push(`  [BEREIKT] Doel behaald!`)
      }
    }
  }
  lines.push('')

  // Net worth history (compact sparkline data)
  if (netWorthHistory.length > 0) {
    const histStr = netWorthHistory
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

  // Personal seasonal context (year-over-year comparison from localStorage)
  if (typeof window !== 'undefined') {
    const seasonalCtx = getSeasonalContext(
      temporal.month,
      temporal.year,
      monthlyExpenses,
      monthlyIncome,
    )
    if (seasonalCtx) {
      lines.push(`SEIZOENSCONTEXT: ${seasonalCtx}`)
      lines.push('')
    }
  }

  // Progression events
  if (progressionEvents && progressionEvents.length > 0) {
    lines.push('PROGRESSIE:')
    for (const event of progressionEvents) {
      lines.push(`- [${event.type}] ${event.label} (was: ${event.previousValue}, nu: ${event.currentValue})`)
    }
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
    lines.push(`Terugkerende transacties: ${data.recurringTransactions ?? 0}`)
  }

  // Recommendations (detailed)
  lines.push(`AANBEVELINGEN: ${data.recommendations ?? 0} totaal`)
  if (data.topRecommendations && data.topRecommendations.length > 0) {
    for (const rec of data.topRecommendations.slice(0, 3)) {
      const impact = rec.freedomDaysImpact > 0 ? ` — ${rec.freedomDaysImpact} vrijheidsdagen/jaar` : ''
      lines.push(`- ${rec.title} (${rec.category})${impact}`)
    }
  }
  lines.push('')

  // Next steps (volgende stappen) per module
  const alertBudgetCount = (data.favoriteBudgets ?? []).filter(fb => fb.spent > fb.limit).length
  const kernSteps = computeAllKernSteps({
    totalAssets: data.totalAssets ?? 0,
    totalDebts: data.totalDebts ?? 0,
    monthlyIncome: data.monthlyIncome ?? 0,
    monthlyExpenses: data.monthlyExpenses ?? 0,
    budgetCount: (data.budgetTotals?.expense?.limit ?? 0) > 0 ? 1 : 0,
    snapshotCount: (data.netWorthHistory ?? []).length,
    hasTransactions: (data.monthlyExpenses ?? 0) > 0 || (data.monthlyIncome ?? 0) > 0,
    alertBudgetCount,
    hasGoals: (data.goals ?? 0) > 0,
    fireUnreachable: data.fireProjResult?.fireAge == null,
  })
  const wilSteps = computeAllWilSteps({
    pendingRecommendations: data.recommendations ?? 0,
    openActions: data.openActions ?? 0,
    goalCount: data.goals ?? 0,
    hasCompletedActions: (data.completedActionsThisMonth ?? 0) > 0,
  })
  const horizonSteps = computeAllHorizonSteps({
    hasFireProjection: data.fireProjResult?.fireAge != null,
    eventCount: data.lifeEvents ?? 0,
    freedomPct: data.freedomPct ?? 0,
  })

  lines.push(`VOLGENDE STAPPEN: ${kernSteps.length} kern, ${wilSteps.length} wil, ${horizonSteps.length} horizon`)
  for (const step of kernSteps) {
    lines.push(`- [kern] ${step.title}: ${step.description} (${step.href})`)
  }
  for (const step of wilSteps) {
    lines.push(`- [wil] ${step.title}: ${step.description} (${step.href})`)
  }
  for (const step of horizonSteps) {
    lines.push(`- [horizon] ${step.title}: ${step.description} (${step.href})`)
  }
  lines.push('')

  // Discoverable features (ontdekbare features)
  const visited = visitedFeatureIds ?? new Set<string>()
  const unvisited = DISCOVER_ITEMS.filter(item => !visited.has(item.id))
  lines.push(`ONTDEKBARE FEATURES: ${unvisited.length} van ${DISCOVER_ITEMS.length} onontdekt`)
  for (const item of unvisited) {
    lines.push(`- [${item.module}] ${item.label}: ${item.description} — "${item.teaser}" (${item.href})`)
  }
  lines.push('')

  // Life events (detailed)
  if (data.topLifeEvents && data.topLifeEvents.length > 0) {
    lines.push('LEVENSGEBEURTENISSEN:')
    for (const le of data.topLifeEvents) {
      const year = le.year ? ` (${le.year})` : ''
      const type = le.impactType === 'positive' ? 'positief' : 'negatief'
      const amt = le.estimatedImpact != null
        ? `, ${formatCurrency(Math.abs(le.estimatedImpact))} ${le.impactType === 'positive' ? 'opbrengst' : 'kosten'}`
        : ''
      const freedom = le.estimatedImpact != null && dailyExp > 0
        ? ` (${freedomStr(Math.abs(le.estimatedImpact), dailyExp)})`
        : ''
      lines.push(`- ${le.name}${year}: ${type}${amt}${freedom}`)
    }
    lines.push('')
  } else {
    lines.push(`Levensgebeurtenissen: ${data.lifeEvents ?? 0}`)
  }

  // Personal trends
  const trends = computePersonalTrends(data)
  lines.push('PERSOONLIJKE TRENDS:')
  lines.push(`- Spaarquote trend: ${trends.savingsRateTrend}`)
  lines.push(`- Uitgaven trend: ${trends.expenseTrend.direction} (ratio: ${trends.expenseTrend.ratio})`)
  if (trends.wealthGrowthRate != null) {
    lines.push(`- Vermogensgroei: ${trends.wealthGrowthRate}% per maand`)
  }
  lines.push(`- Opeenvolgende groeimaanden: ${trends.consecutiveGrowthMonths}`)
  lines.push(`- Budget discipline: ${trends.budgetDisciplineScore}%`)
  lines.push('')

  // Pattern alerts
  const patterns = detectPatterns(data)
  if (patterns.length > 0) {
    lines.push('GEDETECTEERDE PATRONEN:')
    for (const p of patterns) {
      const severityIcon = p.severity === 'warning' ? '⚠' : 'ℹ'
      lines.push(`- ${severityIcon} [${p.type}] ${p.message} (module: ${p.relatedModule})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
