'use client'

import { useMemo, useState, memo } from 'react'
import {
  type ComparisonResult,
  type TimePeriod,
  type BenchmarkId,
  TIME_PERIODS,
  getAlphaDescription,
} from '@/lib/benchmark-comparison'
import { TrendingUp, TrendingDown, Minus, BarChart3, Info } from 'lucide-react'
import { useModuleHex } from '@/components/app/module-color-provider'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getBenchmarkComparisonTips } from '@/lib/chart-tips'

/** "2026-05-31" → "mei 2026". Voor het venster-label bij een ingekorte meting. */
function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  return `${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('nl-NL', { month: 'long' })} ${year}`
}

// ── Chart component ──────────────────────────────────────────

interface BenchmarkComparisonChartProps {
  comparison: ComparisonResult | null
  onPeriodChange: (period: TimePeriod) => void
  activePeriod: TimePeriod
  availablePeriods?: TimePeriod[]
  loading?: boolean
}

export const BenchmarkComparisonChart = memo(function BenchmarkComparisonChart({
  comparison,
  onPeriodChange,
  activePeriod,
  availablePeriods,
  loading,
}: BenchmarkComparisonChartProps) {
  const [hoveredBenchmark, setHoveredBenchmark] = useState<BenchmarkId | null>(null)
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 800 })
  const [tooltipData, setTooltipData] = useState<{
    x: number
    y: number
    date: string
    values: { name: string; value: number; color: string }[]
  } | null>(null)
  const periods = availablePeriods || TIME_PERIODS

  // Module-identiteit: de holdings-pagina hoort bij Overzicht/De Kern, dus de
  // portfoliolijn volgt het gekozen kern-accent (kleurconventie CLAUDE.md) —
  // geen hardcoded hex.
  const PORTFOLIO_COLOR = useModuleHex('kern', 500)

  // Rendement is `null` zodra de koershistorie ontbreekt: dan tonen we géén
  // portfoliolijn, géén percentage en géén alpha. Het alternatief — de
  // waardelijn tonen — zou stortingen als koerswinst plotten.
  const portfolioReturnPct = comparison?.portfolio.returnPct ?? null
  const hasPortfolioReturn = portfolioReturnPct !== null

  // Het venster dat daadwerkelijk gebruikt is; bij een terugval op de volledige
  // historie óf een inkorting tot waar de koershistorie begint is het
  // periodelabel niet waar.
  const windowLabel = comparison?.windowFallback
    ? 'over de beschikbare historie'
    : comparison?.windowClipped
      ? `sinds ${formatMonth(comparison.windowStart)}`
      : activePeriod.windowLabel

  // Hoe hard het getal is: het aandeel van de waarde dat op een échte koers
  // rust. Contract, geen sierletter (ADR 0098) — een turbo of een gedelistte
  // naam heeft geen marktkoers en hoort niet stilzwijgend mee te tellen.
  // Afgerond op hele procenten: pas als er écht iets van af gaat is de
  // mededeling zinvol — "99,8% van de waarde" leest als ruis.
  const observedShare = comparison?.portfolio.observedShare ?? null
  const observedPct = observedShare === null ? null : Math.round(observedShare * 100)
  const partiallyObserved = observedPct !== null && observedPct < 100

  // Build chart data from comparison result
  const chartData = useMemo(() => {
    if (!comparison) return null

    // Collect all dates from portfolio + benchmarks
    const allDates = new Set<string>()
    for (const p of comparison.portfolio.dataPoints) allDates.add(p.date)
    for (const b of comparison.benchmarks) {
      for (const p of b.dataPoints) allDates.add(p.date)
    }
    const sortedDates = [...allDates].sort()
    if (sortedDates.length === 0) return null

    // Determine Y range
    let minVal = Infinity
    let maxVal = -Infinity

    const portfolioByDate: Record<string, number> = {}
    for (const p of comparison.portfolio.dataPoints) {
      portfolioByDate[p.date] = p.value
      minVal = Math.min(minVal, p.value)
      maxVal = Math.max(maxVal, p.value)
    }

    const benchmarksByDate: Record<string, Record<string, number>> = {}
    for (const b of comparison.benchmarks) {
      for (const p of b.dataPoints) {
        if (!benchmarksByDate[p.date]) benchmarksByDate[p.date] = {}
        benchmarksByDate[p.date][b.id] = p.value
        minVal = Math.min(minVal, p.value)
        maxVal = Math.max(maxVal, p.value)
      }
    }

    // Add padding
    const range = maxVal - minVal
    minVal = Math.max(0, minVal - range * 0.1)
    maxVal = maxVal + range * 0.1

    return {
      dates: sortedDates,
      portfolioByDate,
      benchmarksByDate,
      minVal,
      maxVal,
    }
  }, [comparison])

  // Y-axis grid values
  const yTicks = useMemo(() => {
    if (!chartData) return []
    const range = chartData.maxVal - chartData.minVal
    const step = range / 4
    return Array.from({ length: 5 }, (_, i) => chartData.minVal + step * i)
  }, [chartData])

  // X-axis date labels (show ~5 labels)
  const xLabels = useMemo(() => {
    if (!chartData) return []
    const { dates } = chartData
    if (dates.length <= 5) return dates.map((d, i) => ({ date: d, index: i }))
    const step = Math.max(1, Math.floor(dates.length / 4))
    const labels: { date: string; index: number }[] = []
    for (let i = 0; i < dates.length; i += step) {
      labels.push({ date: dates[i], index: i })
    }
    // Always include last
    const lastIdx = dates.length - 1
    if (labels[labels.length - 1]?.index !== lastIdx) {
      labels.push({ date: dates[lastIdx], index: lastIdx })
    }
    return labels
  }, [chartData])

  const sortedByReturn = useMemo(
    () => comparison ? [...comparison.benchmarks].sort((a, b) => b.returnPct - a.returnPct) : [],
    [comparison],
  )

  // SVG dimensions
  const width = 600
  const height = 280
  const padding = { top: 20, right: 20, bottom: 30, left: 50 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  function getX(index: number, total: number): number {
    return padding.left + (index / Math.max(1, total - 1)) * chartW
  }

  function getY(value: number, minVal: number, maxVal: number): number {
    const range = maxVal - minVal
    if (range === 0) return padding.top + chartH / 2
    return padding.top + chartH - ((value - minVal) / range) * chartH
  }

  // Build SVG path from data points
  function buildPath(
    dates: string[],
    valueMap: Record<string, number>,
  ): string {
    const points: string[] = []
    let prevValue: number | null = null

    for (let i = 0; i < dates.length; i++) {
      const val = valueMap[dates[i]]
      if (val == null) {
        // Use previous value if missing
        if (prevValue != null) {
          const x = getX(i, dates.length)
          const y = getY(prevValue, chartData!.minVal, chartData!.maxVal)
          points.push(`${x},${y}`)
        }
        continue
      }
      prevValue = val
      const x = getX(i, dates.length)
      const y = getY(val, chartData!.minVal, chartData!.maxVal)
      points.push(`${x},${y}`)
    }

    if (points.length === 0) return ''
    return `M${points.join(' L')}`
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!chartData) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * width

    // Find closest date index
    const relX = mouseX - padding.left
    const idx = Math.round((relX / chartW) * (chartData.dates.length - 1))
    if (idx < 0 || idx >= chartData.dates.length) {
      setTooltipData(null)
      return
    }

    const date = chartData.dates[idx]
    const x = getX(idx, chartData.dates.length)

    const values: { name: string; value: number; color: string }[] = []
    if (chartData.portfolioByDate[date] != null) {
      values.push({
        name: 'Portfolio',
        value: chartData.portfolioByDate[date],
        color: PORTFOLIO_COLOR,
      })
    }
    for (const b of comparison!.benchmarks) {
      const bVal = chartData.benchmarksByDate[date]?.[b.id]
      if (bVal != null) {
        values.push({ name: b.name, value: bVal, color: b.color })
      }
    }

    setTooltipData({ x, y: padding.top, date, values })
  }

  // Memoize the SVG line paths on the data inputs. Without this, every
  // mouse-move (which calls setTooltipData → re-render) rebuilt each benchmark
  // path string + its benchmarkByDate record and the portfolio path. Placed
  // after the dimension consts + buildPath so getX/getY are initialized when
  // the factory runs; aligned by index with comparison.benchmarks so the render
  // map is a plain lookup. Called unconditionally before any early return.
  const linePaths = useMemo(() => {
    if (!chartData || !comparison) return null
    const benchmarkPaths = comparison.benchmarks.map((b) => {
      const benchmarkByDate: Record<string, number> = {}
      for (const p of b.dataPoints) benchmarkByDate[p.date] = p.value
      return { id: b.id, path: buildPath(chartData.dates, benchmarkByDate) }
    })
    const portfolioPath = buildPath(chartData.dates, chartData.portfolioByDate)
    return { benchmarkPaths, portfolioPath }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildPath/getX/getY are pure w.r.t. these inputs (mirrors yTicks/xLabels); keyed on the data
  }, [chartData, comparison?.benchmarks])

  if (loading) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6" data-testid="benchmark-comparison-section">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-kern-600" />
          <h2 className="text-sm font-semibold text-[var(--ink-2)]">Benchmark vergelijking</h2>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-zinc-100" />
          <div className="h-64 rounded-lg bg-zinc-100" />
          <div className="h-16 rounded bg-zinc-100" />
        </div>
      </div>
    )
  }

  if (!comparison || !chartData || !linePaths) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6" data-testid="benchmark-comparison-section">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-kern-600" />
          <h2 className="text-sm font-semibold text-[var(--ink-2)]">Benchmark vergelijking</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="h-10 w-10 text-[var(--ink-4)]" />
          <p className="mt-3 text-sm font-medium text-[var(--ink-2)]">
            Onvoldoende data voor vergelijking
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Voeg holdings toe en registreer transacties om je portfolio te vergelijken met benchmarks.
          </p>
        </div>
      </div>
    )
  }

  const bestBenchmark = sortedByReturn[0] ?? null
  const alphaVsBest =
    bestBenchmark && bestBenchmark.alpha !== null
      ? getAlphaDescription(bestBenchmark.alpha)
      : null

  // Animation timings (800ms for complex multi-line chart)
  const lineAnim = hasEntered ? 'drawPath 800ms cubic-bezier(.22,1,.36,1) both' : 'none'

  return (
    <div ref={ref} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6" data-testid="benchmark-comparison-section">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-kern-600" />
          <h2 className="text-sm font-semibold text-[var(--ink-2)]">Benchmark vergelijking</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Period buttons */}
          <div className="flex items-center gap-1" data-testid="benchmark-period-buttons">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => onPeriodChange(p)}
                data-testid={`benchmark-period-${p.id}`}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  activePeriod.id === p.id
                    ? 'bg-kern-100 text-kern-700'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* ChartTips */}
          <ChartTips
            storageKey="benchmark_comparison_chart"
            tips={getBenchmarkComparisonTips({
              activePeriod: activePeriod.label,
              benchmarkCount: comparison.benchmarks.length,
              hasOutperformance:
                hasPortfolioReturn && comparison.benchmarks.length > 0
                  ? portfolioReturnPct! >
                    Math.max(...comparison.benchmarks.map((b) => b.returnPct))
                  : null,
            })}
            align="right"
          />
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
          onMouseMove={animationComplete ? handleMouseMove : undefined}
          onMouseLeave={animationComplete ? () => setTooltipData(null) : undefined}
          data-testid="benchmark-chart"
        >
          {/* Grid lines */}
          {yTicks.map((tick, i) => {
            const y = getY(tick, chartData.minVal, chartData.maxVal)
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e4e4e7"
                  strokeDasharray="2 2"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#a1a1aa"
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            )
          })}

          {/* 100 baseline */}
          {chartData.minVal < 100 && chartData.maxVal > 100 && (
            <line
              x1={padding.left}
              y1={getY(100, chartData.minVal, chartData.maxVal)}
              x2={width - padding.right}
              y2={getY(100, chartData.minVal, chartData.maxVal)}
              stroke="#d4d4d8"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {/* X-axis labels */}
          {xLabels.map(({ date, index }) => {
            const x = getX(index, chartData.dates.length)
            const d = new Date(date)
            return (
              <text
                key={index}
                x={x}
                y={height - 5}
                textAnchor="middle"
                fontSize="9"
                fill="#a1a1aa"
                data-testid="benchmark-x-label"
              >
                {d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })}
              </text>
            )
          })}

          {/* Benchmark lines */}
          {comparison.benchmarks.map((b, bi) => {
            const path = linePaths.benchmarkPaths[bi].path
            if (!path) return null
            return (
              <path
                key={b.id}
                d={path}
                fill="none"
                stroke={b.color}
                strokeWidth={hoveredBenchmark === b.id ? 2.5 : 1.5}
                strokeDasharray="4 3"
                opacity={hoveredBenchmark && hoveredBenchmark !== b.id ? 0.3 : 0.7}
                onMouseEnter={animationComplete ? () => setHoveredBenchmark(b.id) : undefined}
                onMouseLeave={animationComplete ? () => setHoveredBenchmark(null) : undefined}
                className="transition-opacity"
                pathLength={1}
                style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: lineAnim }}
              />
            )
          })}

          {/* Portfolio line (solid, on top) */}
          {linePaths.portfolioPath && (
            <path
              d={linePaths.portfolioPath}
              fill="none"
              stroke={PORTFOLIO_COLOR}
              strokeWidth={2.5}
              opacity={hoveredBenchmark ? 0.5 : 1}
              className="transition-opacity"
              pathLength={1}
              style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: lineAnim }}
            />
          )}

          {/* Tooltip vertical line */}
          {tooltipData && (
            <line
              x1={tooltipData.x}
              y1={padding.top}
              x2={tooltipData.x}
              y2={height - padding.bottom}
              stroke="#a1a1aa"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
        </svg>

        {/* Tooltip */}
        {tooltipData && (
          <div
            className="absolute z-10 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2 shadow-[var(--s2)]"
            style={{
              left: `${(tooltipData.x / width) * 100}%`,
              top: '10px',
              transform: tooltipData.x > width * 0.7 ? 'translateX(-100%)' : 'translateX(0)',
            }}
          >
            <p className="text-[10px] font-medium text-[var(--ink-3)] mb-1">
              {new Date(tooltipData.date).toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
            {tooltipData.values.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: v.color }}
                />
                <span className="text-[var(--ink-2)]">{v.name}</span>
                <span className="font-medium text-[var(--ink)] ml-auto">
                  {v.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend — het venster staat erbij; een percentage zonder periode is
          niet te lezen (precies de verwarring uit de melding). */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span
          className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-4)]"
          data-testid="benchmark-window-label"
        >
          Rendement {windowLabel}
        </span>
        {hasPortfolioReturn && (
          <div className="flex items-center gap-1.5" data-testid="benchmark-portfolio-legend">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: PORTFOLIO_COLOR }} />
            <span className="text-[11px] font-medium text-[var(--ink-2)]">Jouw portfolio</span>
            <span className={`text-[11px] font-semibold ${portfolioReturnPct! >= 0 ? 'text-positive' : 'text-negative'}`}>
              {portfolioReturnPct! >= 0 ? '+' : ''}{portfolioReturnPct!.toFixed(1)}%
            </span>
          </div>
        )}
        {comparison.benchmarks.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-1.5 cursor-default"
            onMouseEnter={() => setHoveredBenchmark(b.id)}
            onMouseLeave={() => setHoveredBenchmark(null)}
          >
            <span
              className="inline-block h-0.5 w-4 rounded-full"
              style={{
                backgroundColor: b.color,
                opacity: hoveredBenchmark && hoveredBenchmark !== b.id ? 0.3 : 1,
              }}
            />
            <span className="text-[11px] text-[var(--ink-3)]">{b.name}{b.dataSource === 'synthetic' ? '*' : ''}</span>
            <span className={`text-[11px] font-medium ${b.returnPct >= 0 ? 'text-positive' : 'text-negative'}`}>
              {b.returnPct >= 0 ? '+' : ''}{b.returnPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Alpha summary — alleen zinvol met een meetbaar portfoliorendement.
          Alpha t.o.v. een getal dat er niet is, is geen getal. */}
      {hasPortfolioReturn && (
        <div className="mt-4 space-y-2" data-testid="alpha-summary">
          {comparison.benchmarks.map((b) => {
            if (b.alpha === null) return null
            const desc = getAlphaDescription(b.alpha)
            const AlphaIcon = b.alpha > 0 ? TrendingUp : b.alpha < 0 ? TrendingDown : Minus
            return (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2"
                data-testid={`alpha-${b.id}`}
              >
                <AlphaIcon className={`h-3.5 w-3.5 ${desc.color}`} />
                <span className="text-xs text-[var(--ink-2)] flex-1">
                  vs {b.name}
                </span>
                <span className={`text-xs font-semibold ${desc.color}`} data-testid={`alpha-value-${b.id}`}>
                  {b.alpha >= 0 ? '+' : ''}{b.alpha.toFixed(1)}% alpha
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Contextual message */}
      {hasPortfolioReturn && alphaVsBest && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-kern-100 bg-kern-50/50 p-3" data-testid="benchmark-context-message">
          <Info className="h-3.5 w-3.5 shrink-0 text-kern-500 mt-0.5" />
          <p className="text-xs text-[var(--ink-2)] leading-relaxed">
            <span className="font-medium">Benchmarkvergelijking:</span>{' '}
            Je portfolio deed{' '}
            <span className={`font-semibold ${portfolioReturnPct! >= 0 ? 'text-positive' : 'text-negative'}`}>
              {portfolioReturnPct! >= 0 ? '+' : ''}{portfolioReturnPct!.toFixed(1)}%
            </span>
            {' '}{windowLabel}.{' '}
            {bestBenchmark && (
              <span>
                De sterkste index in deze periode was {bestBenchmark.name} met{' '}
                <span className="font-medium">
                  {bestBenchmark.returnPct >= 0 ? '+' : ''}
                  {bestBenchmark.returnPct.toFixed(1)}%
                </span>.
              </span>
            )}
            {partiallyObserved && (
              <span data-testid="benchmark-coverage-note">
                {' '}Gemeten over het deel van je portefeuille met een marktkoers —{' '}
                <span className="font-medium">{observedPct}% van de waarde</span>.
                Turbo&apos;s, sprinters en gedelistte namen hebben er geen, en tellen
                dus niet mee in dit rendement.
              </span>
            )}
          </p>
        </div>
      )}

      {/* Geen meetbaar portfoliorendement — zeg wát er ontbreekt en waarom we
          liever niets tonen dan iets dat de inleg meet. */}
      {!hasPortfolioReturn && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-kern-100 bg-kern-50/50 p-3" data-testid="benchmark-portfolio-unavailable">
          <Info className="h-3.5 w-3.5 shrink-0 text-kern-500 mt-0.5" />
          <p className="text-xs text-[var(--ink-2)] leading-relaxed">
            {comparison.portfolio.gap === 'unmeasurable_window' ? (
              <>
                <span className="font-medium">Dit venster is niet te meten.</span>{' '}
                Er is een maand waarin je meer hebt opgenomen dan er aan het begin
                stond. Er is dan geen basis om het rendement tegen af te zetten;
                een getal zou hier meer verzinnen dan meten. Kies een ander
                venster.{' '}
              </>
            ) : (
              <>
                <span className="font-medium">Je eigen lijn ontbreekt nog.</span>{' '}
                Voor je rendement {windowLabel} is van minstens twee maanden een
                marktkoers van je posities nodig. Zonder die historie zouden we je
                inleg meten in plaats van je rendement — dat laten we liever weg.{' '}
              </>
            )}
            {bestBenchmark && (
              <span>
                De sterkste index in deze periode was {bestBenchmark.name} met{' '}
                <span className="font-medium">
                  {bestBenchmark.returnPct >= 0 ? '+' : ''}
                  {bestBenchmark.returnPct.toFixed(1)}%
                </span>.
              </span>
            )}
          </p>
        </div>
      )}
      {/* Data source disclaimer */}
      {comparison.benchmarks.some(b => b.dataSource === 'synthetic') && (
        <p className="mt-2 text-[10px] text-[var(--ink-4)] italic" data-testid="benchmark-disclaimer">
          * Sommige benchmarkdata is geschat op basis van historisch gemiddeld rendement.
          Echte marktdata was niet beschikbaar.
        </p>
      )}
    </div>
  )
})
