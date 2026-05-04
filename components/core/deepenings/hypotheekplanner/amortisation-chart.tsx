'use client'

/**
 * `AmortisationChart` — jaarlijkse gestapelde bars die de rente/aflossing
 * uitsplitsing over de looptijd van de hypotheek tonen. SVG-rendering
 * (geen externe library) zodat we het volledig in lijn met krant-stijl
 * houden — scherpe hoeken, monochroom kern-bruin als tonale ladder.
 *
 * Twee tonen:
 *  - Rente: kern-300 (lichter, "kosten")
 *  - Aflossing: kern-700 (donkerder, "vermogensopbouw")
 *
 * Animatie:
 *  - Bars groeien `height: 0 → final` met 80ms stagger per jaar (volgens
 *    UX-skill grafiek-animatie regels).
 *  - `useInViewAnimation` zorgt dat de chart pas mountet als hij in beeld
 *    komt — voorkomt visuele "pop" tijdens scroll.
 *  - `prefers-reduced-motion` wordt door de hook intern afgehandeld.
 *
 * Layout:
 *  - X-as: jaren (1, 5, 10, …) met sparse labels zodat het niet
 *    overvol wordt.
 *  - Y-as: euro-bedrag (totaal jaarlijkse betaling) — labels in DM Mono.
 *  - Geen gridlines — de chart staat in een serie met andere visuals,
 *    extra lijnen zouden ruis toevoegen.
 *  - Hover: tooltip via `<title>` op elke bar (browser-native, no-deps).
 */

import { useMemo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import {
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
  type AmortizationRow,
  type RepaymentType,
} from '@/lib/debt-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

// ── Types ────────────────────────────────────────────────────

interface YearlyBreakdown {
  year: number
  interest: number
  principal: number
  total: number
}

interface AmortisationChartProps {
  /** Huidige hypotheekschuld (€). */
  balance: number
  /** Jaarlijkse rente (%). */
  interestRate: number
  /** Resterende looptijd in maanden. */
  remainingMonths: number
  /** Aflossingsvorm — bepaalt welke schedule-functie we gebruiken. */
  repaymentType: RepaymentType
  /** Optionele kicker (default "Rente vs aflossing per jaar"). */
  kicker?: string
}

// ── Component ────────────────────────────────────────────────

export function AmortisationChart({
  balance,
  interestRate,
  remainingMonths,
  repaymentType,
  kicker = 'Rente vs aflossing per jaar',
}: AmortisationChartProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Bouw schedule via de juiste engine — branche per repayment-type.
  // We hergebruiken de bestaande functies uit `lib/debt-data.ts` in plaats
  // van de math hier te dupliceren.
  const schedule = useMemo<AmortizationRow[]>(() => {
    if (balance <= 0 || remainingMonths <= 0) return []
    if (repaymentType === 'aflossingsvrij') {
      return interestOnlySchedule(balance, interestRate, remainingMonths)
    }
    if (repaymentType === 'lineair') {
      return linearAmortization(balance, interestRate, remainingMonths)
    }
    // Annuïteit — bereken PMT en gebruik amortizationSchedule.
    const monthlyRate = interestRate / 100 / 12
    let pmt: number
    if (interestRate === 0) {
      pmt = balance / remainingMonths
    } else {
      const factor = Math.pow(1 + monthlyRate, remainingMonths)
      pmt = (balance * (monthlyRate * factor)) / (factor - 1)
    }
    return amortizationSchedule(balance, interestRate, pmt)
  }, [balance, interestRate, remainingMonths, repaymentType])

  // Aggregeer per jaar — we ronden bewust naar hele jaren omdat per maand
  // 360 bars onleesbaar zou zijn. Eerste jaar telt slechts vanaf maand 1.
  const yearly = useMemo<YearlyBreakdown[]>(() => {
    if (schedule.length === 0) return []
    const out = new Map<number, YearlyBreakdown>()
    for (const row of schedule) {
      const year = Math.ceil(row.month / 12)
      const existing = out.get(year)
      if (existing) {
        existing.interest += row.interest
        existing.principal += row.principal
        existing.total += row.payment
      } else {
        out.set(year, {
          year,
          interest: row.interest,
          principal: row.principal,
          total: row.payment,
        })
      }
    }
    return Array.from(out.values())
  }, [schedule])

  // Animation-hook — duration matcht de stagger van de laatste bar
  // (yearly.length × 80ms) zodat `animationComplete` accurate is.
  const totalDuration = Math.max(700, yearly.length * 80 + 300)
  const { ref, hasEntered } = useInViewAnimation({ duration: totalDuration })

  if (yearly.length === 0) {
    return (
      <section ref={ref} className="space-y-3">
        <header>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {kicker}
          </p>
        </header>
        <p className="border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-6 text-center font-serif italic text-sm text-[var(--ink-3)]">
          Onvoldoende gegevens om het aflosschema te tekenen.
        </p>
      </section>
    )
  }

  // Bereken layout-constanten. We gebruiken viewBox-coordinaten zodat de
  // chart zich responsive aanpast aan elke breedte.
  const VIEWBOX_WIDTH = 600
  const VIEWBOX_HEIGHT = 220
  const PADDING_LEFT = 50
  const PADDING_RIGHT = 12
  const PADDING_TOP = 12
  const PADDING_BOTTOM = 30
  const chartWidth = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT
  const chartHeight = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM

  const maxTotal = Math.max(...yearly.map((y) => y.total))
  const barGap = 2
  const barWidth = Math.max(2, (chartWidth - barGap * (yearly.length - 1)) / yearly.length)

  // Sparse x-axis labels: elk jaar als looptijd ≤ 10, anders elk 5e jaar.
  const labelEvery = yearly.length <= 10 ? 1 : 5

  // Y-axis tick-labels: 0 / 50% / 100% van max
  const yTicks = [0, maxTotal / 2, maxTotal]

  return (
    <section ref={ref} className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {kicker}
        </p>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-3"
              style={{ backgroundColor: 'oklch(0.666 0.0311 34.7)' }}
            />
            Rente
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-3"
              style={{ backgroundColor: 'oklch(0.345 0.0571 34.7)' }}
            />
            Aflossing
          </span>
        </div>
      </header>

      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-3">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="img"
          aria-label={`Aflossingsschema over ${yearly.length} jaar`}
          className="h-auto w-full"
        >
          {/* Y-axis labels — links uitgelijnd, DM Mono via text-anchor:end. */}
          {yTicks.map((tick, i) => {
            const y = PADDING_TOP + chartHeight - (tick / maxTotal) * chartHeight
            return (
              <g key={`y-${i}`}>
                <text
                  x={PADDING_LEFT - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-[var(--ink-4)]"
                  style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}
                >
                  {tick === 0 ? '0' : fc(tick).replace(/\s/g, '')}
                </text>
              </g>
            )
          })}

          {/* Bars — voor elk jaar één gestapelde bar (rente onder, aflossing
              boven). Animatie via `transform: scaleY` zou de stack-volgorde
              kunnen verstoren; daarom animeren we de `height` direct met
              een transition. */}
          {yearly.map((y, idx) => {
            const x = PADDING_LEFT + idx * (barWidth + barGap)
            const totalH = (y.total / maxTotal) * chartHeight
            const interestH = (y.interest / maxTotal) * chartHeight
            const principalH = (y.principal / maxTotal) * chartHeight
            const baseY = PADDING_TOP + chartHeight - totalH
            const delay = idx * 80

            return (
              <g key={y.year}>
                {/* Rente-segment (onder) — kern-300 */}
                <rect
                  x={x}
                  y={hasEntered ? baseY : PADDING_TOP + chartHeight}
                  width={barWidth}
                  height={hasEntered ? interestH : 0}
                  fill="oklch(0.666 0.0311 34.7)"
                  style={{
                    transition: hasEntered
                      ? `y 600ms cubic-bezier(.22,1,.36,1) ${delay}ms, height 600ms cubic-bezier(.22,1,.36,1) ${delay}ms`
                      : 'none',
                  }}
                >
                  <title>
                    Jaar {y.year} — rente {fc(y.interest)}, aflossing{' '}
                    {fc(y.principal)}
                  </title>
                </rect>
                {/* Aflossing-segment (boven) — kern-700 */}
                <rect
                  x={x}
                  y={
                    hasEntered
                      ? baseY + interestH
                      : PADDING_TOP + chartHeight
                  }
                  width={barWidth}
                  height={hasEntered ? principalH : 0}
                  fill="oklch(0.345 0.0571 34.7)"
                  style={{
                    transition: hasEntered
                      ? `y 600ms cubic-bezier(.22,1,.36,1) ${delay}ms, height 600ms cubic-bezier(.22,1,.36,1) ${delay}ms`
                      : 'none',
                  }}
                >
                  <title>
                    Jaar {y.year} — aflossing {fc(y.principal)}
                  </title>
                </rect>
              </g>
            )
          })}

          {/* X-axis labels — sparse, gecentreerd onder de bar. */}
          {yearly.map((y, idx) => {
            if (idx % labelEvery !== 0 && idx !== yearly.length - 1) return null
            const x = PADDING_LEFT + idx * (barWidth + barGap) + barWidth / 2
            return (
              <text
                key={`x-${y.year}`}
                x={x}
                y={VIEWBOX_HEIGHT - 8}
                textAnchor="middle"
                className="fill-[var(--ink-4)]"
                style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}
              >
                {y.year}
              </text>
            )
          })}
        </svg>
      </div>
    </section>
  )
}
