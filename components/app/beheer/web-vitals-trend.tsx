'use client'

import { TrendChart } from '@/components/app/trend-chart'
import { formatVitalValue, type WebVitalMetric } from '@/lib/web-vitals/config'

// Client-wrapper rond TrendChart voor de RUM-inzichtpagina. De pagina zelf is
// een server-component en kan geen functie-prop (formatValue) over de grens
// doorgeven; dit onderdeeltje krijgt alleen serialiseerbare data en bouwt de
// metric-bewuste formattering client-side. Bewust géén module-accent: dit is
// een neutraal observability-scherm — vaste neutrale inkt-tint als lijnkleur.

const NEUTRAL_INK = 'var(--ink-3)' // app-brede neutrale inkt — geen module-accent

export function WebVitalsTrend({
  metric,
  points,
}: {
  metric: WebVitalMetric
  points: { label: string; value: number }[]
}) {
  return (
    <TrendChart
      series={[{ id: metric, name: metric, data: points, color: NEUTRAL_INK }]}
      mode="area"
      showLegend={false}
      showProjected={false}
      formatValue={(v) => formatVitalValue(metric, v)}
      formatTooltip={(v) => formatVitalValue(metric, v)}
      yAxisLabel={metric === 'CLS' ? 'score' : 'ms'}
      height={220}
      testId="web-vitals-trend"
    />
  )
}
