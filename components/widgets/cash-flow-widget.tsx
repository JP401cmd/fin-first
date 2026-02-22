import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function CashFlowWidget({ size, data, href }: Props) {
  const { monthlyIncome, monthlyExpenses } = data
  const cashFlow = monthlyIncome - monthlyExpenses
  const isPositive = cashFlow >= 0

  return (
    <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-red-600'}`}>
        {isPositive ? '+' : ''}{formatCurrency(cashFlow)}
      </p>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-xs text-[var(--ink-3)]">
          <span>Inkomsten</span>
          <span className="font-mono tabular-nums text-emerald-700">+{formatCurrency(monthlyIncome)}</span>
        </div>
        <div className="flex justify-between text-xs text-[var(--ink-3)]">
          <span>Uitgaven</span>
          <span className="font-mono tabular-nums text-red-600">-{formatCurrency(monthlyExpenses)}</span>
        </div>
      </div>
    </WidgetShell>
  )
}
