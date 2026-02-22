import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import { RefreshCw } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function AbonnementenWidget({ size, data, href }: Props) {
  const { recurringTransactions } = data

  return (
    <WidgetShell module="kern" size={size} kicker="Abonnementen" href={href}>
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-kern-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {recurringTransactions}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-[var(--ink-3)]">
        {recurringTransactions === 1 ? 'terugkerende last' : 'terugkerende lasten'}
      </p>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk vaste lasten →
      </p>
    </WidgetShell>
  )
}
