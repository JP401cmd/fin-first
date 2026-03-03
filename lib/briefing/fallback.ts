// ── Deterministic Fallback Composer ─────────────────────────
// Rule-engine fallback when AI is unavailable or times out.

import type { DashboardData } from '@/components/widgets/widget-renderer'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { levelToPhaseId } from '@/lib/feature-phases'
import type { BriefingCardSpec, TemporalContext } from './types'

export function composeBriefingFallback(
  data: DashboardData,
  temporal: TemporalContext,
): BriefingCardSpec[] {
  const cards: BriefingCardSpec[] = []
  const dailyExp = data.monthlyExpenses > 0 ? data.monthlyExpenses / 30 : 0
  const phase = levelToPhaseId(data.sovereigntyLevel)

  // 1. Greeting insight
  const netWorthFreedom = dailyExp > 0
    ? formatFreedomTimeString(calculateFreedomTime(data.netWorth, dailyExp), 'long')
    : null
  const greetingText = netWorthFreedom
    ? `${temporal.greeting}. Je vermogen vertegenwoordigt ${netWorthFreedom} aan vrijheid.`
    : `${temporal.greeting}. Welkom bij je financiele briefing.`
  cards.push({ type: 'insight', text: greetingText, emphasis: 'greeting' })

  // 2. Net worth metric
  cards.push({
    type: 'metric',
    label: 'Netto vermogen',
    value: formatCurrency(data.netWorth),
    freedomStr: netWorthFreedom ?? undefined,
    module: 'kern',
    href: '/core',
  })

  // 3. Budget progress ring
  const bt = data.budgetTotals.expense
  const budgetPct = bt.limit > 0 ? Math.round((bt.spent / bt.limit) * 100) : 0
  cards.push({
    type: 'progressRing',
    label: 'Budget uitgaven',
    value: formatCurrency(bt.spent),
    percentage: Math.min(budgetPct, 100),
    total: `van ${formatCurrency(bt.limit)}`,
    module: 'kern',
    href: '/core/budgets',
  })

  // 4. Budget alert if > 90%
  if (budgetPct > 90) {
    cards.push({
      type: 'alert',
      severity: budgetPct > 100 ? 'urgent' : 'warning',
      title: 'Budget druk',
      message: `Je hebt ${budgetPct}% van je maandbudget besteed. ${budgetPct > 100 ? 'Je zit over je limiet.' : 'Let op je uitgaven de komende dagen.'}`,
      href: '/core/budgets',
    })
  }

  // 5. Actions or savings rate based on phase
  if (data.openActions > 0) {
    cards.push({
      type: 'action',
      icon: 'zap',
      kicker: 'Acties',
      title: `${data.openActions} openstaande ${data.openActions === 1 ? 'actie' : 'acties'}`,
      description: `${Math.round(data.totalFreedomDaysOpen)} vrijheidsdagen te winnen door je acties af te ronden.`,
      href: '/will',
      module: 'wil',
    })
  }

  // 6. Sparkline if history available
  if (data.netWorthHistory.length >= 2) {
    cards.push({
      type: 'sparkline',
      label: 'Vermogensverloop',
      value: formatCurrency(data.netWorth),
      dataKey: 'netWorthHistory',
      module: 'kern',
    })
  }

  // 7. Savings rate metric
  const savingsRate = data.monthlyIncome > 0
    ? Math.round(((data.monthlyIncome - data.monthlyExpenses) / data.monthlyIncome) * 100)
    : 0
  cards.push({
    type: 'metric',
    label: 'Spaarquote',
    value: `${savingsRate}%`,
    module: 'kern',
    href: '/core',
  })

  // 8. Phase-specific cards
  if (phase === 'momentum' || phase === 'mastery') {
    // FIRE milestone
    if (data.freedomPct > 0) {
      cards.push({
        type: 'milestone',
        target: formatCurrency(data.fireTarget),
        current: formatCurrency(data.netWorth),
        percentage: Math.min(Math.round(data.freedomPct), 100),
        label: 'FIRE Doel',
        freedomStr: `${Math.round(data.freedomPct)}% vrijheid`,
      })
    }
  } else if (data.hasConsumerDebt) {
    // Debt insight for recovery
    cards.push({
      type: 'insight',
      text: `Je hebt nog consumentenschuld. Elke euro aflossing koopt vrijheid terug.`,
      emphasis: 'tip',
    })
  }

  // 9. Countdown — salary or tax deadline
  if (temporal.month === 3 || temporal.month === 4) {
    const taxDeadlineDay = temporal.month === 3 ? 31 + 30 : 30 // days until May 1
    const daysLeft = temporal.month === 3 ? (31 - temporal.dayOfMonth) + 30 : 30 - temporal.dayOfMonth
    cards.push({
      type: 'countdown',
      label: 'Belastingdeadline',
      days: Math.max(0, daysLeft),
      sublabel: '1 mei',
      module: 'kern',
      href: '/core/belasting',
    })
  } else if (temporal.daysUntilSalary > 0 && temporal.daysUntilSalary <= 10) {
    cards.push({
      type: 'countdown',
      label: 'Salaris',
      days: temporal.daysUntilSalary,
      sublabel: '25e van de maand',
      module: 'kern',
    })
  }

  // 10. Closing observation
  if (data.completedActionsThisMonth > 0) {
    cards.push({
      type: 'insight',
      text: `Je hebt deze maand ${data.completedActionsThisMonth} ${data.completedActionsThisMonth === 1 ? 'actie' : 'acties'} afgerond. Goed bezig.`,
      emphasis: 'celebration',
    })
  }

  return cards
}
