import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function Box3DragWidget({ size, data, href }: Props) {
  const { totalAssets, yearlyMustExpenses, box3Belasting } = data

  // Use pre-computed Box 3 belasting (full calculateBox3 calculation)
  const annualDrag = box3Belasting ?? 0
  const dailyMustExpense = yearlyMustExpenses > 0 ? yearlyMustExpenses / 365 : 0
  const freedomDaysLost = dailyMustExpense > 0 && annualDrag > 0 ? Math.round(annualDrag / dailyMustExpense) : null

  const pctOfAssets = totalAssets > 0 ? (annualDrag / totalAssets) * 100 : 0

  return (
    <WidgetShell module="horizon" size={size} kicker="Box 3 Belastingdrag" href={href}>
      <div className="mt-0.5">
        <div className="flex items-baseline gap-1.5">
          <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(annualDrag)}
          </p>
          <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
        </div>

        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          {pctOfAssets.toFixed(2)}% effectief tarief
        </p>

        {freedomDaysLost != null && (
          <p className="mt-2 text-xs font-medium text-horizon-700">
            = <span className="font-mono font-semibold">{freedomDaysLost}</span> vrijheidsdagen per jaar
          </p>
        )}
      </div>
    </WidgetShell>
  )
}
