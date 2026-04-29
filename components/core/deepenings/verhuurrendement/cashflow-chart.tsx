'use client'

/**
 * `CashflowChart` — 12-maands lijngrafiek met inkomsten en kosten naast
 * elkaar. SVG-rendering zonder externe library, krant-stijl.
 *
 * Twee paden:
 *  - Inkomsten (kern-700): bruto huur per maand, kan dalen door leegstand.
 *    Bij `vacancyLog` wordt huur naar 0 gezet voor maanden waarin
 *    `occupied: false` staat. Zonder vacancy-data tonen we een vlakke lijn
 *    op `monthlyRent` (het bekende cijfer).
 *  - Kosten (kern-300): som van rente + onderhoud + VVE per maand. Vlak;
 *    we modelleren geen seizoens-fluctuatie (verdient een eigen data-input
 *    en valt buiten dit MVP).
 *
 * Animatie:
 *  - `useInViewAnimation` zorgt dat lijnen pas tekenen wanneer in beeld.
 *  - SVG-paths gebruiken `pathLength={1}` + `strokeDashoffset` om in te
 *    tekenen, conform de UX-skill grafiek-animatie regels.
 *  - 80ms stagger tussen inkomsten- en kosten-lijn.
 */

import { useMemo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'
import type { RentalCalculation } from './calc'

// ── Types ────────────────────────────────────────────────────

interface VacancyEntry {
  month: string // YYYY-MM
  occupied: boolean
}

interface CashflowChartProps {
  /** Berekende cashflow-cijfers (monthlyRent, monthlyInterest, etc.). */
  calc: RentalCalculation
  /**
   * Optioneel vacancy-log voor het pand. Wanneer geleverd, wordt de huur
   * voor leegstand-maanden op 0 gezet. Dit toont eerlijk dat een lege maand
   * geen inkomsten oplevert — terwijl de kosten doorlopen.
   */
  vacancyLog?: VacancyEntry[]
}

// ── Component ────────────────────────────────────────────────

export function CashflowChart({ calc, vacancyLog }: CashflowChartProps) {
  // Bouw 12 maanden op vanaf 11 maanden geleden tot deze maand.
  const series = useMemo(() => buildSeries(calc, vacancyLog), [calc, vacancyLog])

  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })

  // SVG-layout
  const VIEWBOX_WIDTH = 600
  const VIEWBOX_HEIGHT = 200
  const PADDING_LEFT = 50
  const PADDING_RIGHT = 12
  const PADDING_TOP = 12
  const PADDING_BOTTOM = 28
  const chartWidth = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT
  const chartHeight = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM

  const incomes = series.map((s) => s.income)
  const costs = series.map((s) => s.cost)
  const maxValue = Math.max(...incomes, ...costs, 1)

  // Helper om een datapoint naar SVG-coordinaten te mappen.
  function pointFor(idx: number, value: number): [number, number] {
    const xStep = series.length > 1 ? chartWidth / (series.length - 1) : 0
    const x = PADDING_LEFT + idx * xStep
    const y = PADDING_TOP + chartHeight - (value / maxValue) * chartHeight
    return [x, y]
  }

  // Bouw SVG-pad als sequentie van M/L commando's.
  function buildPath(values: number[]): string {
    return values
      .map((v, i) => {
        const [x, y] = pointFor(i, v)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }

  const incomePath = buildPath(incomes)
  const costPath = buildPath(costs)

  // X-as-labels: alleen elke 2e maand om overcrowding te vermijden.
  const labelEvery = 2

  // Y-as ticks
  const yTicks = [0, maxValue / 2, maxValue]

  return (
    <section ref={ref} className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Cashflow afgelopen 12 maanden
          </p>
          <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
            Inkomsten tegen kosten — leegstand-maanden tonen 0 inkomsten.
          </p>
        </div>
        <Legend />
      </header>

      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-3">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="img"
          aria-label="Cashflow afgelopen 12 maanden — inkomsten en kosten"
          className="h-auto w-full"
        >
          {/* Y-as labels */}
          {yTicks.map((tick, i) => {
            const y = PADDING_TOP + chartHeight - (tick / maxValue) * chartHeight
            return (
              <g key={`y-${i}`}>
                <text
                  x={PADDING_LEFT - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-[var(--ink-4)]"
                  style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}
                >
                  {tick === 0 ? '0' : formatCurrency(tick).replace(/\s/g, '')}
                </text>
                {/* Subtiele baseline op y=0 */}
                {tick === 0 && (
                  <line
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={PADDING_LEFT + chartWidth}
                    y2={y}
                    stroke="var(--border-ed)"
                    strokeWidth={0.5}
                  />
                )}
              </g>
            )
          })}

          {/* Inkomsten-lijn — kern-700, dik */}
          <path
            d={incomePath}
            fill="none"
            stroke="oklch(0.345 0.0571 34.7)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{
              transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)',
            }}
          />

          {/* Kosten-lijn — kern-300, dunner, 80ms stagger */}
          <path
            d={costPath}
            fill="none"
            stroke="oklch(0.666 0.0311 34.7)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{
              transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1) 80ms',
            }}
          />

          {/* Datapunten op inkomsten-lijn — kleine cirkels voor leesbaarheid */}
          {series.map((s, idx) => {
            const [x, y] = pointFor(idx, s.income)
            return (
              <circle
                key={`income-${idx}`}
                cx={x}
                cy={y}
                r={2}
                fill="oklch(0.345 0.0571 34.7)"
                opacity={hasEntered ? 1 : 0}
                style={{
                  transition: `opacity 240ms cubic-bezier(.22,1,.36,1) ${900 + idx * 30}ms`,
                }}
              >
                <title>
                  {s.label} — inkomsten {formatCurrency(s.income)}
                </title>
              </circle>
            )
          })}

          {/* X-as labels */}
          {series.map((s, idx) => {
            if (idx % labelEvery !== 0 && idx !== series.length - 1) return null
            const [x] = pointFor(idx, 0)
            return (
              <text
                key={`x-${idx}`}
                x={x}
                y={VIEWBOX_HEIGHT - 8}
                textAnchor="middle"
                className="fill-[var(--ink-4)]"
                style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}
              >
                {s.label}
              </text>
            )
          })}
        </svg>
      </div>
    </section>
  )
}

// ── Legend ───────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-3"
          style={{ backgroundColor: 'oklch(0.345 0.0571 34.7)' }}
        />
        Inkomsten
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-3"
          style={{ backgroundColor: 'oklch(0.666 0.0311 34.7)' }}
        />
        Kosten
      </span>
    </div>
  )
}

// ── Series builder ───────────────────────────────────────────

interface SeriesPoint {
  /** Korte label voor de x-as: "jan", "feb", … (NL maandnamen). */
  label: string
  /** Inkomsten in deze maand (0 bij leegstand). */
  income: number
  /** Kosten in deze maand (vlak, gebaseerd op `calc`). */
  cost: number
}

const NL_MONTH_SHORT = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
] as const

/**
 * Bouw 12 datapoints op vanaf "11 maanden geleden" t/m "deze maand".
 * Voor elke maand zoeken we het vacancy-log (formaat: "YYYY-MM"); bij
 * `occupied: false` zetten we de huur op 0.
 */
function buildSeries(
  calc: RentalCalculation,
  vacancyLog: VacancyEntry[] | undefined,
): SeriesPoint[] {
  const totalCost = calc.monthlyInterest + calc.monthlyMaintenance + calc.monthlyVva
  const points: SeriesPoint[] = []
  const now = new Date()
  // Map vacancy-log naar lookup-table: "YYYY-MM" → occupied. We accepteren
  // ontbrekende maanden als "bezet" (onbekend = standaard occupancy).
  const lookup = new Map<string, boolean>()
  for (const entry of vacancyLog ?? []) {
    if (typeof entry.month === 'string' && typeof entry.occupied === 'boolean') {
      lookup.set(entry.month, entry.occupied)
    }
  }

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const yyyymm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const occupied = lookup.has(yyyymm) ? lookup.get(yyyymm)! : true
    points.push({
      label: NL_MONTH_SHORT[date.getMonth()],
      income: occupied ? calc.monthlyRent : 0,
      cost: totalCost,
    })
  }
  return points
}
