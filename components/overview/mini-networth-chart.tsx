'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/format'

/**
 * MiniNetWorthChart — compacte netto-vermogen-grafiek voor /overzicht hero.
 *
 * Toont historische punten + eenvoudige projectie tot pensioenleeftijd.
 * In tegenstelling tot de volle horizon-grafiek heeft deze geen scenario-
 * overlays, life-events, of strategie-knoppen. Wel: vandaag-marker +
 * vrijheid-marker (fireAge) + pensioen-marker (endAge).
 *
 * Bij user-tap: navigeert naar /toekomst voor de volledige grafiek met
 * alle interactie.
 *
 * Data: netWorthHistory (van DashboardData) + currentAge + fireAge + endAge.
 * Projectie: lineair extrapoleren uit gemiddelde groei van afgelopen 6
 * datapunten naar endAge. Dit is BENADERING — de echte horizon-grafiek
 * gebruikt full simulation. Voor MVP-overzicht is benadering genoeg.
 */
export function MiniNetWorthChart({
  netWorthHistory,
  currentNetWorth,
  currentAge,
  fireAge,
  endAge,
  isPensioenMode,
}: {
  netWorthHistory: { month: string; value: number }[]
  currentNetWorth: number
  currentAge: number | null
  fireAge: number | null
  endAge: number | null
  isPensioenMode?: boolean
}) {
  // SVG-dimensies
  const W = 420
  const H = 140
  const PAD_LEFT = 8
  const PAD_RIGHT = 8
  const PAD_TOP = 16
  const PAD_BOTTOM = 18
  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  // Geen data → render placeholder met CTA. Na deze guard kunnen
  // currentAge / endAge gedwongen als number worden gezien.
  if (currentAge == null || endAge == null || endAge <= currentAge) {
    return (
      <Link
        href="/toekomst"
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-4 sm:p-6 text-center hover:border-violet-300 transition-colors min-h-[140px]"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Vermogen door de tijd
        </div>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Vul je profiel aan om je vermogensgroei tot{' '}
          {isPensioenMode ? 'pensioen' : 'vrijheid'} te zien.
        </p>
        <span className="mt-3 text-xs font-semibold text-violet-700">
          Bekijk projectie →
        </span>
      </Link>
    )
  }

  // Narrowed copies — guard hierboven sluit null uit, maar TS draagt
  // dat niet altijd over naar nested function-closures hieronder.
  const startAge: number = currentAge
  const finalAge: number = endAge
  const years = finalAge - startAge
  const projectionPoints = years + 1

  // Bouw history-punten — laatste 12 maanden (of minder) als realized-lijn.
  const recentHistory = netWorthHistory.slice(-12)

  // Bereken groeisnelheid uit recent history (gemiddelde YoY-groei).
  let yearlyGrowthRate = 0.05 // default 5% groei per jaar
  if (recentHistory.length >= 2) {
    const first = recentHistory[0]
    const last = recentHistory[recentHistory.length - 1]
    if (first && last && first.value > 0) {
      const months = recentHistory.length - 1
      const totalGrowth = last.value / first.value
      const monthlyGrowth = Math.pow(totalGrowth, 1 / Math.max(1, months))
      yearlyGrowthRate = Math.pow(monthlyGrowth, 12) - 1
    }
  }
  // Clamp groei zodat onrealistische krachten (bv. 50%/jaar) de chart niet breken.
  yearlyGrowthRate = Math.max(-0.05, Math.min(0.12, yearlyGrowthRate))

  // Bouw projectie-punten (jaarlijks van currentAge → endAge)
  const projection: { age: number; value: number }[] = []
  let current = currentNetWorth
  for (let i = 0; i < projectionPoints; i++) {
    projection.push({ age: startAge + i, value: current })
    current = current * (1 + yearlyGrowthRate)
  }

  // X-as: age range (currentAge → endAge)
  // Y-as: 0 → max-waarde uit projectie + history
  const allValues = [
    ...recentHistory.map((h) => h.value),
    ...projection.map((p) => p.value),
  ]
  const maxValue = Math.max(...allValues, 1)
  const yScale = chartH / maxValue
  const xRange = projection.length - 1 || 1

  function ageToX(age: number) {
    const idx = age - startAge
    return PAD_LEFT + (idx / xRange) * chartW
  }
  function valueToY(v: number) {
    return PAD_TOP + chartH - v * yScale
  }

  // Historische lijn-punten (we mappen 12-maand history op de leeftijd-as
  // van vandaag terug, oftewel currentAge-1 → currentAge).
  const histPoints = recentHistory.map((h, i) => {
    const x = PAD_LEFT + (i / Math.max(1, recentHistory.length - 1)) * (chartW * 0.15)
    const y = valueToY(h.value)
    return { x, y }
  })
  const histPath =
    histPoints.length >= 2
      ? histPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      : ''

  // Projectie-pad (vanaf currentAge)
  const projPath = projection
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${ageToX(p.age).toFixed(1)},${valueToY(p.value).toFixed(1)}`,
    )
    .join(' ')

  const fireInRange = fireAge != null && fireAge >= startAge && fireAge <= finalAge
  const fireY = fireInRange
    ? valueToY(projection[fireAge - startAge]?.value ?? currentNetWorth)
    : null
  const fireX = fireInRange ? ageToX(fireAge) : null

  const endAgeValue = projection[projection.length - 1]?.value ?? currentNetWorth

  return (
    <Link
      href="/toekomst"
      className="block rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
    >
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Netto vermogen door de tijd
        </span>
        <span className="text-xs font-mono tabular-nums text-[var(--ink-3)]">
          → {formatCurrency(endAgeValue)}
        </span>
      </header>
      <div className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
        {formatCurrency(currentNetWorth)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" aria-label="Vermogensprojectie">
        {/* Historische lijn (full opacity) */}
        {histPath && (
          <path d={histPath} fill="none" stroke="var(--module-active-700, #047857)" strokeWidth="2" strokeLinecap="round" />
        )}
        {/* Projectie-lijn (dashed) */}
        <path
          d={projPath}
          fill="none"
          stroke="var(--module-active-500, #10b981)"
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
        {/* Vandaag-marker */}
        <circle
          cx={ageToX(currentAge)}
          cy={valueToY(currentNetWorth)}
          r="4"
          fill="var(--module-active-700, #047857)"
        />
        {/* Vrijheid-marker (fireAge) */}
        {fireX != null && fireY != null && (
          <>
            <line
              x1={fireX}
              y1={PAD_TOP}
              x2={fireX}
              y2={fireY}
              stroke="var(--horizon-500, #8b5cf6)"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.6"
            />
            <circle cx={fireX} cy={fireY} r="4" fill="var(--horizon-500, #8b5cf6)" />
            <text
              x={fireX}
              y={PAD_TOP - 4}
              textAnchor="middle"
              className="fill-[var(--horizon-700,#6d28d9)] font-mono"
              fontSize="9"
            >
              {isPensioenMode ? 'Pensioen' : 'Vrijheid'} {fireAge}
            </text>
          </>
        )}
        {/* Vandaag-label */}
        <text
          x={ageToX(currentAge)}
          y={H - 4}
          textAnchor="start"
          className="fill-[var(--ink-3)] font-mono"
          fontSize="9"
        >
          Vandaag ({currentAge})
        </text>
        {/* EindAge-label rechts */}
        <text
          x={W - PAD_RIGHT}
          y={H - 4}
          textAnchor="end"
          className="fill-[var(--ink-3)] font-mono"
          fontSize="9"
        >
          {endAge}
        </text>
      </svg>
      <p className="mt-1 text-[10px] text-[var(--ink-3)] italic">
        Benadering met {(yearlyGrowthRate * 100).toFixed(1)}%/jaar groei. Voor
        scenario&apos;s zie /toekomst.
      </p>
    </Link>
  )
}
