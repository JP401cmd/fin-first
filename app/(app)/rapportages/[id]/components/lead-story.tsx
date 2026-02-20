import type { ReportKernSection } from '@/lib/report-data'
import { formatCurrency } from '@/lib/format'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

function MiniSparkline({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) return null

  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const w = 400
  const h = 60
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.value - min) / range) * (h - 8) - 4
    return `${x},${y}`
  })

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16 mt-4" preserveAspectRatio="none">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--color-kern-500)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={(data.length - 1) / (data.length - 1) * w}
          cy={h - ((values[values.length - 1] - min) / range) * (h - 8) - 4}
          r="4"
          fill="var(--color-kern-500)"
        />
      )}
    </svg>
  )
}

export function LeadStory({ kern }: { kern: ReportKernSection }) {
  const growth = kern.netWorthGrowth ?? 0
  const isPositive = growth > 0
  const isNegative = growth < 0

  const headlineText = isPositive
    ? `Vermogen groeit met ${formatCurrency(growth)}`
    : isNegative
      ? `Vermogen daalt met ${formatCurrency(Math.abs(growth))}`
      : 'Vermogen stabiel deze periode'

  return (
    <div className="report-section mb-10">
      <p className="report-kicker report-kern-accent font-inter text-[10px] font-semibold uppercase tracking-[0.08em] text-kern-600 mb-2">
        Vermogen
      </p>
      <h2 className="font-playfair text-3xl font-bold tracking-tight text-[var(--ink)] md:text-[42px] md:leading-[1.1]" style={{ letterSpacing: '-0.03em' }}>
        {headlineText}
      </h2>
      {kern.netWorthStart != null && kern.netWorthEnd != null && (
        <p className="mt-2 font-source-serif text-base text-[var(--ink-2)]">
          Van {formatCurrency(kern.netWorthStart)} naar {formatCurrency(kern.netWorthEnd)}
          {kern.netWorthGrowthPct != null && (
            <span className="ml-2 inline-flex items-center gap-1 font-dm-mono text-sm">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-kern-600" />
              ) : isNegative ? (
                <TrendingDown className="h-4 w-4 text-red-600" />
              ) : (
                <Minus className="h-4 w-4 text-[var(--ink-3)]" />
              )}
              <span className={isPositive ? 'text-kern-600' : isNegative ? 'text-red-600' : 'text-[var(--ink-3)]'}>
                {isPositive ? '+' : ''}{kern.netWorthGrowthPct}%
              </span>
            </span>
          )}
        </p>
      )}

      {kern.netWorthByPeriod.length >= 2 && (
        <MiniSparkline data={kern.netWorthByPeriod} />
      )}

      {kern.netWorthEnd != null && kern.netWorthEnd >= 100 && (
        <div className="mt-4 flex justify-center">
          <FreedomTimeBadge amount={kern.netWorthEnd} />
        </div>
      )}
    </div>
  )
}
