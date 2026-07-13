import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { RefreshCw } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const AbonnementenWidget = memo(function AbonnementenWidget({ size, data, href }: Props) {
  const { recurringTransactions, totalRecurringAmount, topRecurringTransactions, monthlyExpenses, monthlyIncome } = data

  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20); fallback voor mocks.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
  const freedomTime = dailyExp > 0 && totalRecurringAmount > 0
    ? calculateFreedomTime(totalRecurringAmount, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Abonnementen" href={href}>
        <p className="text-[var(--ink)] leading-none truncate">
          <MaskedAmount value={totalRecurringAmount} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: compact count + icon + label ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Abonnementen" href={href}>
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 text-kern-500 shrink-0" />
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {recurringTransactions}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          abonnementen
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size: compact for 1-row height — total + top-3 + freedom time ────
  if (size === 'half') {
    const top3 = topRecurringTransactions.slice(0, 3)
    return (
      <WidgetShell module="kern" size={size} kicker="Abonnementen" href={href}>
        <p className="text-[var(--ink)]">
          <MaskedAmount value={totalRecurringAmount} tone="kern" className="text-xl font-semibold" /> <span className="text-sm font-normal text-[var(--ink-3)]">per maand</span>
        </p>
        {top3.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {top3.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-xs text-[var(--ink-2)]">
                <span className="truncate mr-2">{t.name}</span>
                <span className="shrink-0">
                  <MaskedAmount value={t.amount} tone="kern" />
                </span>
              </li>
            ))}
          </ul>
        )}
        {freedomStr && (
          <p className="mt-1.5 font-serif italic text-[11px] text-[var(--ink-3)]">
            = {freedomStr} vrijheid per maand
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full-size: complete list + year total + income % + freedom time ────
  const allItems = topRecurringTransactions.slice(0, 8)
  const yearlyTotal = totalRecurringAmount * 12
  const incomePercent = monthlyIncome > 0
    ? Math.round((totalRecurringAmount / monthlyIncome) * 100)
    : null

  return (
    <WidgetShell module="kern" size={size} kicker="Abonnementen" href={href}>
      <div className="flex items-baseline gap-2">
        <p className="text-[var(--ink)]">
          <MaskedAmount value={totalRecurringAmount} tone="kern" className="text-xl font-semibold" />
        </p>
        <span className="text-sm text-[var(--ink-3)]">per maand</span>
      </div>
      <p className="mt-0.5 text-xs text-[var(--ink-3)]">
        <MaskedAmount value={yearlyTotal} tone="kern" /> per jaar
        {incomePercent !== null && (
          <span> &middot; {incomePercent}% van inkomen</span>
        )}
      </p>

      {allItems.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-[var(--border-ed)] pt-3">
          {allItems.map((t) => (
            <li key={t.id} className="flex items-center justify-between text-sm text-[var(--ink-2)]">
              <span className="truncate mr-2">{t.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <MaskedAmount value={t.amount} tone="kern" className="text-xs" />
                {t.frequency && (
                  <span className="text-[10px] text-[var(--ink-4)]">/{t.frequency}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {freedomStr && (
        <p className="mt-3 font-serif italic text-[12px] text-[var(--ink-3)]">
          {freedomStr} per maand aan vaste lasten
        </p>
      )}
      <p className="mt-1 text-[11px] text-[var(--ink-4)]">
        {recurringTransactions} {recurringTransactions === 1 ? 'abonnement' : 'abonnementen'} totaal
      </p>
    </WidgetShell>
  )
})
