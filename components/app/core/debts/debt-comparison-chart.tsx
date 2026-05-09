'use client'

import { memo } from 'react'
import { simulatePayoff, payoffSummary, type PayoffStrategy } from '@/lib/debt-data'

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

// Strategie-identiteit als kleur. Bewust géén module-tokens (`--module-active-*`)
// — dit is narratieve kleur per *strategie*, niet per module. Snowball blauw is
// "snelle wins", avalanche rood "bespaart meest", highest_balance amber
// "band-aid eraf", custom paars "jouw volgorde". Géén groen — dat is in de app
// gereserveerd voor `--positive` (winst-signalen).
const STRATEGY_COLORS: Record<PayoffStrategy, string> = {
  snowball: '#3b82f6',
  avalanche: '#ef4444',
  highest_balance: '#f59e0b',
  custom: '#8b5cf6',
  current: '#6b7280',
}

const STRATEGY_LABELS: Record<PayoffStrategy, string> = {
  snowball: 'Sneeuwbal',
  avalanche: 'Avalanche',
  highest_balance: 'Grootste eerst',
  custom: 'Eigen volgorde',
  current: 'Huidig schema',
}

export interface StrategyTrajectory {
  id: PayoffStrategy
  label?: string
  months: ReturnType<typeof simulatePayoff>
  summary: ReturnType<typeof payoffSummary>
}

interface ChartProps {
  strategies: StrategyTrajectory[]
  activeStrategyId: PayoffStrategy
  extraPayment: number
}

// Dynamische tick-stride zodat 30-jaars hypotheken niet 30 labels op rij krijgen.
// Drempels gekozen op visueel ritme: bij ≤5 jaar elke 12 mnd geeft genoeg detail,
// bij langere horizons schuift het naar 2/5/10 jaar zodat er altijd 4-6 labels op
// de as staan. Bij ≤30 jaar (360 mnd) blijft 5-jaar stride leesbaar; pas vanaf
// echt langlopende cases (40+) springt het naar 10-jaar.
function pickXTickStride(maxMonth: number): number {
  if (maxMonth <= 60) return 12
  if (maxMonth <= 120) return 24
  if (maxMonth <= 360) return 60
  return 120
}

export const DebtPayoffTrajectoryChart = memo(function DebtPayoffTrajectoryChart({
  strategies,
  activeStrategyId,
  extraPayment,
}: ChartProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  const renderable = strategies.filter((s) => s.months.length > 0)
  if (renderable.length === 0) return null

  const w = 800
  const h = 240
  const pad = { top: 16, right: 24, bottom: 44, left: 60 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const maxBalance = Math.max(
    ...renderable.map((s) => s.months[0]?.totalBalance ?? 0),
  )
  const maxMonth = Math.max(...renderable.map((s) => s.months.length))

  if (maxBalance <= 0 || maxMonth <= 0) return null

  function x(month: number) {
    return pad.left + (month / maxMonth) * chartW
  }
  function y(val: number) {
    return pad.top + chartH - (val / maxBalance) * chartH
  }

  // Sample step is gedeeld over alle strategieën zodat hun lijnen op dezelfde
  // x-grid liggen — anders kan een korter pad subtiel uit de pas gaan ten
  // opzichte van een langer pad bij dezelfde maand.
  const sampleStep = Math.max(1, Math.floor(maxMonth / 80))

  function buildPath(months: ReturnType<typeof simulatePayoff>) {
    const sampled = months.filter((_, i) => i % sampleStep === 0 || i === months.length - 1)
    return sampled
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(m.totalBalance).toFixed(1)}`)
      .join(' ')
  }

  function buildFillPath(months: ReturnType<typeof simulatePayoff>) {
    const sampled = months.filter((_, i) => i % sampleStep === 0 || i === months.length - 1)
    if (sampled.length === 0) return ''
    const linePath = sampled
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(m.totalBalance).toFixed(1)}`)
      .join(' ')
    const last = sampled[sampled.length - 1]
    const first = sampled[0]
    return linePath
      + ` L ${x(last.month).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
      + ` L ${x(first.month).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`
  }

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxBalance * t))

  const xStride = pickXTickStride(maxMonth)
  const xTicks: number[] = []
  for (let m = xStride; m < maxMonth; m += xStride) xTicks.push(m)
  if (maxMonth > 6) xTicks.push(maxMonth)

  // Active eerst sorteren zodat de niet-actieve lijnen achter de dikke actieve
  // lijn renderen — voorkomt dat een dunne lijn over de dikke heen ligt.
  const ordered = [...renderable].sort((a, b) => {
    if (a.id === activeStrategyId) return 1
    if (b.id === activeStrategyId) return -1
    return 0
  })

  const active = renderable.find((s) => s.id === activeStrategyId) ?? renderable[0]
  const activePayoffMonth = active.months.length
  const activeColor = STRATEGY_COLORS[active.id]

  const subtitleParts: string[] = []
  if (extraPayment > 0) {
    subtitleParts.push(`+€${extraPayment.toLocaleString('nl-NL')}/m extra`)
  }
  const subtitle = subtitleParts.join(' · ')

  return (
    <div ref={ref} data-testid="debt-payoff-trajectory-chart">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Schuld-trajectvergelijking
        </p>
        {subtitle && (
          <p className="font-mono tabular-nums text-[10px] text-[var(--ink-3)]">{subtitle}</p>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`payoff-fill-${active.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={activeColor} stopOpacity="0.10" />
            <stop offset="100%" stopColor={activeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((val) => (
          <g key={val}>
            <line
              x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)}
              stroke="#e4e4e7" strokeWidth="0.5"
            />
            <text x={pad.left - 8} y={y(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
              {val >= 1000 ? `€${Math.round(val / 1000)}k` : `€${val}`}
            </text>
          </g>
        ))}

        {/* Fill-area alleen voor actieve strategie — vier overlappende areas
            zou de chart in een wolk veranderen. */}
        <path
          d={buildFillPath(active.months)}
          fill={`url(#payoff-fill-${active.id})`}
          style={{
            animation: hasEntered ? 'fadeInFill 250ms ease-out 455ms both' : 'none',
            opacity: hasEntered ? undefined : 0,
          }}
        />

        {/* Niet-actieve strategieën als dunne contextlijnen. fadeIn (geen
            drawPath) — context, niet hoofdverhaal. */}
        {ordered
          .filter((s) => s.id !== activeStrategyId)
          .map((s) => (
            <path
              key={s.id}
              d={buildPath(s.months)}
              fill="none"
              stroke={STRATEGY_COLORS[s.id]}
              strokeWidth="1.25"
              strokeOpacity="0.45"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: hasEntered ? 'fadeInFill 350ms ease-out 200ms both' : 'none',
                opacity: hasEntered ? undefined : 0,
              }}
              data-testid={`${s.id}-trajectory-line`}
            />
          ))}

        {/* Actieve strategie — dik, draw-in animatie, eigen kleur. */}
        <path
          d={buildPath(active.months)}
          fill="none"
          stroke={activeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{
            strokeDashoffset: hasEntered ? undefined : 1,
            animation: hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none',
          }}
          data-testid={`${active.id}-trajectory-line`}
        />

        {/* Payoff-marker alleen op de actieve strategie. */}
        {activePayoffMonth < maxMonth && (
          <>
            <line
              x1={x(activePayoffMonth)} y1={pad.top}
              x2={x(activePayoffMonth)} y2={pad.top + chartH}
              stroke={activeColor} strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.5"
            />
            <circle
              cx={x(activePayoffMonth)} cy={y(0)}
              r="4" fill={activeColor} stroke="white" strokeWidth="1.5"
            />
          </>
        )}

        {xTicks.map((m) => (
          <text key={m} x={x(m)} y={h - 22} textAnchor="middle" fontSize="8" fill="#a1a1aa">
            {m >= 12 ? `${Math.floor(m / 12)}j` : `${m}m`}
          </text>
        ))}

        {/* Legenda — alle vier labels, gekleurd streepje + label, actieve in
            font-semibold. Krant-mono UPPERCASE. */}
        <g transform={`translate(${pad.left}, ${h - 6})`}>
          {ordered
            .slice()
            .sort((a, b) => {
              const order: PayoffStrategy[] = ['snowball', 'avalanche', 'highest_balance', 'custom', 'current']
              return order.indexOf(a.id) - order.indexOf(b.id)
            })
            .map((s, i) => {
              const isActive = s.id === activeStrategyId
              const xOffset = i * 150
              return (
                <g key={s.id} transform={`translate(${xOffset}, 0)`}>
                  <line
                    x1="0" y1="0" x2="14" y2="0"
                    stroke={STRATEGY_COLORS[s.id]}
                    strokeWidth={isActive ? '2.5' : '1.25'}
                    strokeOpacity={isActive ? 1 : 0.6}
                  />
                  <text
                    x="20" y="3"
                    fontSize="9"
                    fontFamily="var(--font-dm-mono), monospace"
                    fill={isActive ? '#3f3f46' : '#a1a1aa'}
                    fontWeight={isActive ? 600 : 400}
                    letterSpacing="0.5"
                  >
                    {(s.label ?? STRATEGY_LABELS[s.id]).toUpperCase()}
                  </text>
                </g>
              )
            })}
        </g>
      </svg>
    </div>
  )
})

interface ComparisonProps {
  baselineSummaries: Partial<Record<PayoffStrategy, ReturnType<typeof payoffSummary>>>
  activeStrategyId: PayoffStrategy
  activeWithExtraSummary: ReturnType<typeof payoffSummary>
  extraPayment: number
  dailyExpenses: number
}

function formatMonthSpan(months: number): string {
  if (months <= 0) return '0m'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} ${m === 1 ? 'maand' : 'maanden'}`
  if (m === 0) return `${y} ${y === 1 ? 'jaar' : 'jaar'}`
  return `${y}j ${m}m`
}

export const StrategyComparisonMessage = memo(function StrategyComparisonMessage({
  baselineSummaries,
  activeStrategyId,
  activeWithExtraSummary,
  extraPayment,
  dailyExpenses,
}: ComparisonProps) {
  const { masked } = useMaskedAmounts()

  const activeBaseline = baselineSummaries[activeStrategyId]
  if (!activeBaseline || activeBaseline.totalMonths === 0) return null

  const accentColor = STRATEGY_COLORS[activeStrategyId]
  const activeLabel = STRATEGY_LABELS[activeStrategyId]

  let message = ''
  let interestDiff = 0
  let monthDiff = 0

  if (extraPayment > 0) {
    // Vergelijk active+extra vs active+€0 — toont de impact van de slider
    // binnen de gekozen strategie.
    monthDiff = Math.max(0, activeBaseline.totalMonths - activeWithExtraSummary.totalMonths)
    interestDiff = Math.max(0, activeBaseline.totalInterest - activeWithExtraSummary.totalInterest)

    if (monthDiff === 0 && interestDiff < 1) {
      message = `Met ${formatMaskedCurrency(extraPayment, masked)}/m extra geen merkbaar verschil bij ${activeLabel.toLowerCase()}.`
    } else {
      const parts: string[] = []
      parts.push(`Met ${formatMaskedCurrency(extraPayment, masked)}/m extra`)
      if (interestDiff >= 1) {
        parts.push(`bespaar je ${formatMaskedCurrency(interestDiff, masked)} aan rente`)
      }
      if (monthDiff > 0) {
        parts.push(
          interestDiff >= 1
            ? `en ben je ${formatMonthSpan(monthDiff)} eerder schuldenvrij`
            : `ben je ${formatMonthSpan(monthDiff)} eerder schuldenvrij`,
        )
      }
      message = `${parts.join(' ')}.`
    }
  } else {
    // Bij €0 extra: vergelijk de actieve strategie met de andere baselines en
    // pak de meest informatieve diff. Als de actieve "wint" op rente vs een
    // andere, toon dat. Anders toon je tegen welke alternatief het verlies
    // het kleinst is — eerlijk, geen valse winnaar.
    const others = (Object.keys(baselineSummaries) as PayoffStrategy[]).filter(
      (id) => id !== activeStrategyId && baselineSummaries[id]?.totalMonths,
    )
    if (others.length === 0) return null

    let bestComparison: { otherId: PayoffStrategy; iDiff: number; mDiff: number; activeWins: boolean } | null = null
    for (const otherId of others) {
      const other = baselineSummaries[otherId]
      if (!other) continue
      const iDiff = activeBaseline.totalInterest - other.totalInterest
      const mDiff = activeBaseline.totalMonths - other.totalMonths
      const score = Math.abs(iDiff) + Math.abs(mDiff) * 50
      if (!bestComparison || score > Math.abs(bestComparison.iDiff) + Math.abs(bestComparison.mDiff) * 50) {
        bestComparison = { otherId, iDiff, mDiff, activeWins: iDiff < 0 }
      }
    }

    if (!bestComparison) return null

    const otherLabel = STRATEGY_LABELS[bestComparison.otherId]
    interestDiff = Math.abs(bestComparison.iDiff)
    monthDiff = Math.abs(bestComparison.mDiff)

    if (interestDiff < 1 && monthDiff === 0) {
      message = `${activeLabel} en ${otherLabel.toLowerCase()} leiden tot hetzelfde resultaat voor jouw schulden.`
    } else if (bestComparison.activeWins) {
      const parts: string[] = [`${activeLabel} bespaart ${formatMaskedCurrency(interestDiff, masked)} aan rente t.o.v. ${otherLabel.toLowerCase()}`]
      if (monthDiff > 0) parts.push(`(${formatMonthSpan(monthDiff)} sneller)`)
      message = `${parts.join(' ')}.`
    } else {
      const parts: string[] = [`${otherLabel} bespaart ${formatMaskedCurrency(interestDiff, masked)} aan rente t.o.v. ${activeLabel.toLowerCase()}`]
      if (monthDiff > 0) parts.push(`(${formatMonthSpan(monthDiff)} sneller)`)
      message = `${parts.join(' ')}.`
    }
  }

  let freedomNote = ''
  if (dailyExpenses > 0 && interestDiff > 100) {
    const savedDays = Math.round(interestDiff / dailyExpenses)
    if (savedDays > 0) {
      freedomNote = ` Dat is ${savedDays} ${savedDays === 1 ? 'dag' : 'dagen'} aan extra vrijheid.`
    }
  }

  return (
    <div
      className="mt-3 border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-[var(--ink-2)]"
      style={{ borderLeft: `3px solid ${accentColor}` }}
      data-testid="strategy-comparison-message"
    >
      <p className="text-sm leading-relaxed" data-testid="strategy-comparison-text">
        {message}
        {freedomNote && <span className="font-serif italic text-[var(--ink-3)]">{freedomNote}</span>}
      </p>
    </div>
  )
})
