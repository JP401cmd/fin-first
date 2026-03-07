import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { ArrowUpDown } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function CashFlowWidget({ size, data, href }: Props) {
  const { monthlyIncome, monthlyExpenses, prevMonthExpenses } = data
  const cashFlow = monthlyIncome - monthlyExpenses
  const isPositive = cashFlow >= 0

  if (monthlyIncome === 0 && monthlyExpenses === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
        <WidgetEmpty icon={ArrowUpDown} message="Importeer transacties om je maandelijkse cashflow te zien." />
      </WidgetShell>
    )
  }

  const dailyExp = monthlyExpenses / 30
  const freedomDays = dailyExp > 0 && Math.abs(cashFlow) > 0
    ? Math.round(Math.abs(cashFlow) / dailyExp)
    : null
  const freedomTime = dailyExp > 0 && Math.abs(cashFlow) > 0
    ? calculateFreedomTime(Math.abs(cashFlow), dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // Quarter-size: compact cashflow amount + freedom days label
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}{formatCurrency(cashFlow)}
        </p>
        {freedomDays !== null && (
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
            {isPositive
              ? `+${freedomDays}d vrijheid opgebouwd`
              : `${freedomDays}d vrijheid ingeleverd`}
          </p>
        )}
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-red-600'}`}>
        {isPositive ? '+' : ''}{formatCurrency(cashFlow)}
      </p>
      {freedomStr && (
        <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          {isPositive ? `+${freedomStr} vrijheid opgebouwd` : `${freedomStr} vrijheid ingeleverd`}
        </p>
      )}
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-xs text-[var(--ink-3)]">
          <span>Inkomsten</span>
          <span className="font-mono tabular-nums text-emerald-700">+{formatCurrency(monthlyIncome)}</span>
        </div>
        <div className="flex justify-between text-xs text-[var(--ink-3)]">
          <span>Uitgaven</span>
          <span className="font-mono tabular-nums text-red-600">-{formatCurrency(monthlyExpenses)}</span>
        </div>
        {/* Previous month comparison */}
        {prevMonthExpenses > 0 && (
          <div className="flex justify-between text-xs text-[var(--ink-3)] pt-1 border-t border-[var(--border-ed)]">
            <span>Vorige maand: {formatCurrency(prevMonthExpenses)} uitgaven</span>
            {(() => {
              const delta = monthlyExpenses - prevMonthExpenses
              const isLess = delta < 0
              return delta !== 0 ? (
                <span className={`font-mono tabular-nums font-medium ${isLess ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isLess ? '↓' : '↑'} {formatCurrency(Math.abs(delta))} {isLess ? 'minder' : 'meer'}
                </span>
              ) : null
            })()}
          </div>
        )}
      </div>
    </WidgetShell>
  )
}
