import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import { Receipt } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function BelastingBox3Widget({ size, data, href }: Props) {
  const { totalAssets } = data
  // Simple Box 3 estimate: 4% fictitious return * 36% tax on assets above €57,000
  const threshold = 57000
  const taxableAssets = Math.max(totalAssets - threshold, 0)
  const fictitiousReturn = taxableAssets * 0.06 // 6% fictional yield 2024
  const estimatedTax = fictitiousReturn * 0.36

  return (
    <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-kern-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(estimatedTax)}
        </p>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Schatting vermogensbelasting
      </p>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk Box 3 berekening →
      </p>
    </WidgetShell>
  )
}
