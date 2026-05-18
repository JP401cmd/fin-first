'use client'

// ── net-worth-projection-chart.tsx ──────────────────────────────────
//
// SVG chart: netto-vermogen-projectie met toggle korte/lange termijn.
// Korte termijn: 5 jaar met kwartaal-resolutie (gedetailleerd).
// Lange termijn: tot pensioenleeftijd (AOW) met jaar-resolutie.
//
// Beide views gebruiken dezelfde data maar met andere schaal.
// Toggle: segmented control "5 jaar" / "Tot pensioen".
//
// X-as: leeftijd (of jaren vanaf nu als leeftijd onbekend)
// Y-as: vermogen in EUR
// Rekent met real return (rendement − inflatie) zodat de projectie
// in koopkracht-termen is.

import { useMemo, useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Kicker } from '@/components/editorial'
import { NL_AOW_AGE } from '@/lib/constants'

// ── Types ──────────────────────────────────────────────────────────

type TimeRange = '5j' | 'pensioen'

interface ProjectionPoint {
  /** Leeftijd (fractional) of jaar-offset als leeftijd onbekend. */
  age: number
  /** Label op de X-as. */
  label: string
  /** Nominaal vermogen op dit punt. */
  nominal: number
  /** Reëel vermogen (gecorrigeerd voor inflatie). */
  real: number
}

interface NetWorthProjectionChartProps {
  /** Huidige leeftijd in hele jaren, of null als onbekend. */
  currentAge: number | null
  /** AOW-leeftijd (fractional, bijv. 67.25). Fallback = 67. */
  aowAge: number
  /** Huidig netto vermogen in EUR. */
  netWorth: number
  /** Maandelijkse besparingen (inkomen − uitgaven). */
  monthlySavings: number
  /** Bruto jaarlijks verwacht rendement (bijv. 0.07). */
  grossReturn: number
  /** Jaarlijkse inflatie (bijv. 0.02). */
  inflationRate: number
  /** FIRE-doelbedrag — optionele horizontale doellijn. */
  fireTarget?: number
  /**
   * When true, renders without the outer <section> wrapper — for embedding
   * inside another container (e.g. the CoreHero). Default: false.
   */
  inline?: boolean
}

// ── Constants ──────────────────────────────────────────────────────

const SVG_W = 560
const SVG_H = 260
const PAD = { top: 16, right: 16, bottom: 32, left: 64 } as const
const CHART_W = SVG_W - PAD.left - PAD.right
const CHART_H = SVG_H - PAD.top - PAD.bottom
const Y_GRID_LINES = 4

const COMPACT_EUR = new Intl.NumberFormat('nl-NL', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

// ── Projection computation ─────────────────────────────────────────

function computeProjection(
  currentAge: number | null,
  aowAge: number,
  netWorth: number,
  monthlySavings: number,
  grossReturn: number,
  inflationRate: number,
): ProjectionPoint[] {
  const effectiveAowAge = aowAge > 0 ? aowAge : NL_AOW_AGE
  const startAge = currentAge ?? 30
  const yearsToProject = Math.max(1, Math.ceil(effectiveAowAge - startAge))

  // Cap at 60 years to prevent excessive computation
  const maxYears = Math.min(yearsToProject, 60)

  const monthlyGross = grossReturn / 12
  const monthlyInflation = inflationRate / 12

  const points: ProjectionPoint[] = []

  // Start point
  points.push({
    age: startAge,
    label: currentAge != null ? `${startAge}` : 'Nu',
    nominal: netWorth,
    real: netWorth,
  })

  let nominalValue = netWorth
  let realValue = netWorth

  for (let year = 1; year <= maxYears; year++) {
    // Compute year-end values month by month for accuracy
    for (let month = 0; month < 12; month++) {
      nominalValue = nominalValue * (1 + monthlyGross) + monthlySavings
      realValue = realValue * (1 + (monthlyGross - monthlyInflation)) + monthlySavings
    }

    const age = startAge + year
    const label = currentAge != null ? `${age}` : `+${year}j`

    points.push({
      age,
      label,
      nominal: Math.max(0, nominalValue),
      real: Math.max(0, realValue),
    })
  }

  return points
}

// ── Short-term projection (5 jaar, kwartaal-resolutie) ─────────────

const SHORT_TERM_YEARS = 5
const MONTHS_PER_QUARTER = 3

function computeShortTermProjection(
  currentAge: number | null,
  netWorth: number,
  monthlySavings: number,
  grossReturn: number,
  inflationRate: number,
): ProjectionPoint[] {
  const startAge = currentAge ?? 30
  const monthlyGross = grossReturn / 12
  const monthlyInflation = inflationRate / 12

  const totalQuarters = SHORT_TERM_YEARS * 4
  const points: ProjectionPoint[] = []

  // Start point
  points.push({
    age: startAge,
    label: currentAge != null ? `${startAge}` : 'Nu',
    nominal: netWorth,
    real: netWorth,
  })

  let nominalValue = netWorth
  let realValue = netWorth

  for (let q = 1; q <= totalQuarters; q++) {
    // Compute quarter-end values month by month for accuracy
    for (let m = 0; m < MONTHS_PER_QUARTER; m++) {
      nominalValue = nominalValue * (1 + monthlyGross) + monthlySavings
      realValue = realValue * (1 + (monthlyGross - monthlyInflation)) + monthlySavings
    }

    const ageOffset = q * 0.25
    const age = startAge + ageOffset
    const yearNum = Math.floor(q / 4)
    const quarterInYear = q % 4

    let label: string
    if (quarterInYear === 0) {
      // Full year mark
      label = currentAge != null ? `${startAge + yearNum}` : `+${yearNum}j`
    } else {
      // Quarter mark — only show for year boundaries + halfway
      label = quarterInYear === 2
        ? (currentAge != null ? `${startAge + yearNum}½` : `+${yearNum}½j`)
        : ''
    }

    points.push({
      age,
      label,
      nominal: Math.max(0, nominalValue),
      real: Math.max(0, realValue),
    })
  }

  return points
}

// ── Range toggle ───────────────────────────────────────────────────
//
// Visueel identiek aan PeriodToggle/ViewToggle elders in de app:
// h-7, font 11px UPPERCASE tracking-[0.06em], active state
// `bg-kern-100 text-kern-800`. Compact genoeg voor inline embedding.

const RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '5j', label: '5 jaar' },
  { key: 'pensioen', label: 'Tot pensioen' },
]

function RangeToggle({
  value,
  onChange,
}: {
  value: TimeRange
  onChange: (next: TimeRange) => void
}) {
  return (
    <div
      className="flex items-center border border-[var(--border-ed)] bg-[var(--paper)]"
      role="group"
      aria-label="Tijdshorizon selecteren"
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className={`inline-flex h-7 shrink-0 items-center justify-center px-3 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${
              active
                ? 'bg-kern-100 text-kern-800'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Chart component ────────────────────────────────────────────────

export function NetWorthProjectionChart({
  currentAge,
  aowAge,
  netWorth,
  monthlySavings,
  grossReturn,
  inflationRate,
  fireTarget,
  inline = false,
}: NetWorthProjectionChartProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 800 })
  const { masked } = useMaskedAmounts()
  const [range, setRange] = useState<TimeRange>('pensioen')

  const longTermPoints = useMemo(
    () =>
      computeProjection(
        currentAge,
        aowAge,
        netWorth,
        monthlySavings,
        grossReturn,
        inflationRate,
      ),
    [currentAge, aowAge, netWorth, monthlySavings, grossReturn, inflationRate],
  )

  const shortTermPoints = useMemo(
    () =>
      computeShortTermProjection(
        currentAge,
        netWorth,
        monthlySavings,
        grossReturn,
        inflationRate,
      ),
    [currentAge, netWorth, monthlySavings, grossReturn, inflationRate],
  )

  const points = range === '5j' ? shortTermPoints : longTermPoints
  const isShortTerm = range === '5j'

  // Don't render if we have no meaningful data
  if (points.length < 2 || (netWorth === 0 && monthlySavings <= 0)) {
    return null
  }

  const lastPoint = points[points.length - 1]
  const allValues = points.flatMap((p) => [p.nominal, p.real])
  if (fireTarget && fireTarget > 0) allValues.push(fireTarget)
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(0, ...allValues)
  const valRange = maxVal - minVal || 1

  // Scale helpers
  const toX = (idx: number) =>
    PAD.left + (idx / (points.length - 1)) * CHART_W
  const toY = (val: number) =>
    PAD.top + (1 - (val - minVal) / valRange) * CHART_H

  // Build SVG paths
  const nominalPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.nominal).toFixed(1)}`)
    .join(' ')
  const realPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.real).toFixed(1)}`)
    .join(' ')

  // Area fill under nominal line
  const nominalArea = `${nominalPath} L${toX(points.length - 1).toFixed(1)},${toY(minVal).toFixed(1)} L${toX(0).toFixed(1)},${toY(minVal).toFixed(1)} Z`

  // Y-axis grid lines
  const yGridValues = Array.from({ length: Y_GRID_LINES + 1 }, (_, i) =>
    minVal + (valRange / Y_GRID_LINES) * i,
  )

  // X-axis labels — short-term uses only labelled points, long-term picks ~6 evenly spaced
  const labelIndices = isShortTerm
    ? points.reduce<number[]>((acc, p, i) => {
        if (p.label !== '') acc.push(i)
        return acc
      }, [])
    : Array.from(
        { length: Math.min(6, points.length) },
        (_, i) => Math.round((i / (Math.min(6, points.length) - 1)) * (points.length - 1)),
      )

  // AOW marker position — only in long-term view, always the last point
  const aowX = toX(points.length - 1)

  // Fire target line
  const fireTargetY =
    fireTarget && fireTarget > 0 && fireTarget <= maxVal
      ? toY(fireTarget)
      : null

  // FIRE intersection: find the point where the nominal line crosses the fire target
  const fireIntersection = (() => {
    if (!fireTarget || fireTarget <= 0) return null
    // Find first point where nominal >= fireTarget
    for (let i = 1; i < points.length; i++) {
      if (points[i].nominal >= fireTarget && points[i - 1].nominal < fireTarget) {
        // Linear interpolation between points i-1 and i
        const ratio =
          (fireTarget - points[i - 1].nominal) /
          (points[i].nominal - points[i - 1].nominal)
        const fractionalIdx = i - 1 + ratio
        const intersectAge = points[i - 1].age + ratio * (points[i].age - points[i - 1].age)
        return {
          x: PAD.left + (fractionalIdx / (points.length - 1)) * CHART_W,
          y: toY(fireTarget),
          age: Math.round(intersectAge),
          yearsFromNow: Math.round(intersectAge - points[0].age),
        }
      }
    }
    // If already above fire target at start
    if (points[0].nominal >= fireTarget) {
      return {
        x: toX(0),
        y: toY(fireTarget),
        age: points[0].age,
        yearsFromNow: 0,
      }
    }
    return null // Never reaches fire target within projection
  })()

  // Summary values
  const pensionAge = currentAge != null
    ? Math.round(aowAge > 0 ? aowAge : NL_AOW_AGE)
    : null

  const endLabel = isShortTerm
    ? 'Over 5 jaar'
    : pensionAge != null
      ? `Bij pensioen (${pensionAge})`
      : 'Bij pensioen'

  const chartContent = (
    <>
        <div className="mb-1 flex items-center justify-between gap-3">
          <Kicker>Vermogensprognose</Kicker>
          <RangeToggle value={range} onChange={setRange} />
        </div>
        <p className="text-sm text-[var(--ink-2)] font-serif italic">
          {isShortTerm ? (
            <>Gedetailleerd vermogensverloop komende 5 jaar</>
          ) : (
            <>
              Geschat vermogensverloop tot{' '}
              {pensionAge != null ? (
                <>pensioenleeftijd ({pensionAge})</>
              ) : (
                <>pensioen (AOW)</>
              )}
            </>
          )}
        </p>

        {/* Summary strip */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Vandaag
            </p>
            <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              <MaskedAmount value={netWorth} tone="kern" className="text-base font-semibold" />
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {endLabel} (nominaal)
            </p>
            <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              <MaskedAmount value={lastPoint.nominal} tone="kern" className="text-base font-semibold" />
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Koopkracht (reëel)
            </p>
            <p className="font-mono text-base font-semibold tabular-nums text-horizon-700">
              <MaskedAmount value={lastPoint.real} tone="horizon" className="text-base font-semibold" />
            </p>
          </div>
        </div>

        {/* SVG Chart */}
        <div ref={ref} className="mt-5 -mx-1 overflow-x-auto">
          <svg
            width="100%"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="overflow-visible"
            role="img"
            aria-label={isShortTerm
            ? 'Netto vermogen projectie komende 5 jaar'
            : `Netto vermogen projectie tot ${pensionAge ?? 'pensioen'}${pensionAge ? ' jaar' : ''}`
          }
          >
            {/* Y-axis grid lines + labels */}
            {yGridValues.map((val, i) => (
              <g key={i}>
                <line
                  x1={PAD.left}
                  x2={SVG_W - PAD.right}
                  y1={toY(val)}
                  y2={toY(val)}
                  stroke="var(--border-ed)"
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? 'none' : '4 3'}
                />
                <text
                  x={PAD.left - 6}
                  y={toY(val) + 4}
                  textAnchor="end"
                  fill="var(--ink-4)"
                  fontSize="10"
                  fontFamily="var(--font-mono, monospace)"
                >
                  {masked ? '***' : COMPACT_EUR.format(val)}
                </text>
              </g>
            ))}

            {/* Fire target line — "Volledige vrijheid" */}
            {fireTargetY != null && (
              <g>
                <line
                  x1={PAD.left}
                  x2={SVG_W - PAD.right}
                  y1={fireTargetY}
                  y2={fireTargetY}
                  stroke="var(--color-horizon-400)"
                  strokeWidth="1"
                  strokeDasharray="6 4"
                  opacity={hasEntered ? 0.7 : 0}
                  style={{ transition: 'opacity 400ms ease-out 300ms' }}
                />
                <text
                  x={SVG_W - PAD.right}
                  y={fireTargetY - 6}
                  textAnchor="end"
                  fill="var(--color-horizon-600)"
                  fontSize="9"
                  fontFamily="var(--font-mono, monospace)"
                  opacity={hasEntered ? 0.8 : 0}
                  style={{ transition: 'opacity 400ms ease-out 400ms' }}
                >
                  Volledige vrijheid
                </text>
              </g>
            )}

            {/* Fire intersection marker — dot + age label */}
            {fireIntersection != null && fireTargetY != null && (
              <g
                opacity={hasEntered ? 1 : 0}
                style={{ transition: 'opacity 400ms ease-out 600ms' }}
              >
                {/* Vertical dashed line at intersection */}
                <line
                  x1={fireIntersection.x}
                  x2={fireIntersection.x}
                  y1={fireIntersection.y}
                  y2={PAD.top + CHART_H}
                  stroke="var(--color-horizon-400)"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                  opacity={0.5}
                />
                {/* Intersection dot */}
                <circle
                  cx={fireIntersection.x}
                  cy={fireIntersection.y}
                  r="5"
                  fill="var(--color-horizon-500)"
                  stroke="var(--paper)"
                  strokeWidth="2"
                />
                {/* Age label below the dot */}
                <text
                  x={fireIntersection.x}
                  y={fireIntersection.y + 16}
                  textAnchor="middle"
                  fill="var(--color-horizon-700)"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="var(--font-mono, monospace)"
                >
                  {currentAge != null
                    ? `${fireIntersection.age} jaar`
                    : `+${fireIntersection.yearsFromNow}j`}
                </text>
              </g>
            )}

            {/* Nominal area fill */}
            <path
              d={nominalArea}
              fill="var(--color-kern-100)"
              opacity={hasEntered ? 0.5 : 0}
              style={{ transition: 'opacity 600ms ease-out 200ms' }}
            />

            {/* Nominal line */}
            <path
              d={nominalPath}
              fill="none"
              stroke="var(--color-kern-500)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDasharray: '1',
                strokeDashoffset: hasEntered ? '0' : '1',
                transition: 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)',
              }}
            />

            {/* Real (inflation-adjusted) line */}
            <path
              d={realPath}
              fill="none"
              stroke="var(--color-horizon-500)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 3"
              pathLength={1}
              style={{
                strokeDasharray: hasEntered ? '4 3' : '0 1000',
                transition: 'stroke-dasharray 800ms cubic-bezier(.22,1,.36,1) 100ms',
              }}
            />

            {/* AOW marker — vertical line at pension age (long-term only) */}
            {!isShortTerm && (
              <>
                <line
                  x1={aowX}
                  x2={aowX}
                  y1={PAD.top}
                  y2={PAD.top + CHART_H}
                  stroke="var(--ink-4)"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                  opacity={hasEntered ? 0.5 : 0}
                  style={{ transition: 'opacity 400ms ease-out 500ms' }}
                />
                <text
                  x={aowX}
                  y={PAD.top - 4}
                  textAnchor="middle"
                  fill="var(--ink-3)"
                  fontSize="9"
                  fontFamily="var(--font-mono, monospace)"
                  opacity={hasEntered ? 1 : 0}
                  style={{ transition: 'opacity 400ms ease-out 500ms' }}
                >
                  {pensionAge != null ? `AOW ${pensionAge}` : 'AOW'}
                </text>
              </>
            )}

            {/* 5-year end marker — short-term only */}
            {isShortTerm && (
              <>
                <line
                  x1={toX(points.length - 1)}
                  x2={toX(points.length - 1)}
                  y1={PAD.top}
                  y2={PAD.top + CHART_H}
                  stroke="var(--ink-4)"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                  opacity={hasEntered ? 0.4 : 0}
                  style={{ transition: 'opacity 400ms ease-out 500ms' }}
                />
                <text
                  x={toX(points.length - 1)}
                  y={PAD.top - 4}
                  textAnchor="middle"
                  fill="var(--ink-3)"
                  fontSize="9"
                  fontFamily="var(--font-mono, monospace)"
                  opacity={hasEntered ? 1 : 0}
                  style={{ transition: 'opacity 400ms ease-out 500ms' }}
                >
                  +5 jaar
                </text>
              </>
            )}

            {/* End point dots */}
            <circle
              cx={toX(points.length - 1)}
              cy={toY(lastPoint.nominal)}
              r="4"
              fill="var(--color-kern-500)"
              opacity={hasEntered ? 1 : 0}
              style={{ transition: 'opacity 300ms ease-out 700ms' }}
            />
            <circle
              cx={toX(points.length - 1)}
              cy={toY(lastPoint.real)}
              r="3"
              fill="var(--color-horizon-500)"
              opacity={hasEntered ? 1 : 0}
              style={{ transition: 'opacity 300ms ease-out 750ms' }}
            />

            {/* Start point dot */}
            <circle
              cx={toX(0)}
              cy={toY(netWorth)}
              r="3"
              fill="var(--color-kern-700)"
              opacity={hasEntered ? 1 : 0}
              style={{ transition: 'opacity 300ms ease-out 200ms' }}
            />

            {/* X-axis labels */}
            {labelIndices.map((idx) => (
              <text
                key={idx}
                x={toX(idx)}
                y={SVG_H - 4}
                textAnchor="middle"
                fill="var(--ink-4)"
                fontSize="10"
                fontFamily="var(--font-mono, monospace)"
              >
                {points[idx].label}
              </text>
            ))}
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-[var(--ink-3)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 bg-kern-500" />
            Nominaal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 bg-horizon-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--color-horizon-500) 0 4px, transparent 4px 7px)' }} />
            Reëel (koopkracht)
          </span>
          {fireTarget != null && fireTarget > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4" style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--color-horizon-400) 0 6px, transparent 6px 10px)' }} />
              Volledige vrijheid
            </span>
          )}
        </div>

        {/* Method footnote */}
        <p className="mt-3 text-[10px] text-[var(--ink-4)]">
          Berekend met {(grossReturn * 100).toFixed(1).replace('.', ',')}% rendement
          en {(inflationRate * 100).toFixed(1).replace('.', ',')}% inflatie per jaar.
          Maandelijkse inleg: {formatMaskedCurrency(monthlySavings, masked)}.
        </p>
    </>
  )

  if (inline) {
    return (
      <div data-testid="net-worth-projection">
        {chartContent}
      </div>
    )
  }

  return (
    <section
      data-testid="net-worth-projection"
      className="border-b border-[var(--border-ed)] bg-[var(--paper)]"
    >
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        {chartContent}
      </div>
    </section>
  )
}
