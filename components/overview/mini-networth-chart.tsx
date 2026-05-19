'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/format'

/**
 * MiniNetWorthChart — compacte netto-vermogen-grafiek voor /overzicht hero.
 *
 * Toont historische punten + eenvoudige projectie tot het **vrijheidsmoment**
 * (fireAge). De afbouw-fase (na vrijheid, tot eindleeftijd) leeft op
 * /toekomst — dit overzicht is bewust optimistisch en compact.
 *
 * Bij user-tap op de tegel of op de "Bekijk afbouw →"-link: navigeert
 * naar /toekomst voor de volledige levenscyclus inclusief afbouw met alle
 * interactie (Risk Lab, events, strategieën).
 *
 * Data: netWorthHistory (van DashboardData) + currentAge + fireAge.
 * Projectie: lineair extrapoleren uit gemiddelde groei van afgelopen 12
 * datapunten naar fireAge. Dit is BENADERING — de echte horizon-grafiek
 * gebruikt full simulation. Voor MVP-overzicht is benadering genoeg.
 *
 * endAge en isPensioenMode worden meegegeven als fallback voor de label-
 * tekst en als reserve-eindpunt wanneer fireAge ontbreekt; primair domein
 * van de chart is vandaag → fireAge.
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

  // Bepaal eindpunt: primair fireAge (vrijheidsmoment). Bij ontbreken
  // valt het terug op endAge. Wanneer beide null/ongeldig zijn → render
  // de empty-state-CTA.
  const projectionEndAge =
    fireAge != null && currentAge != null && fireAge > currentAge
      ? fireAge
      : endAge != null && currentAge != null && endAge > currentAge
        ? endAge
        : null

  if (currentAge == null || projectionEndAge == null) {
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
  const finalAge: number = projectionEndAge
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

  // Eindpunt is altijd fireAge (vrijheid) of de fallback projectionEndAge.
  // Toon hem als grote marker rechts in plaats van als sub-jaar-marker.
  const endValue = projection[projection.length - 1]?.value ?? currentNetWorth
  const endLabel = isPensioenMode ? 'Pensioen' : 'Vrijheid'

  return (
    <div className="block rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 transition-all">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Netto vermogen door de tijd
        </span>
        <span className="text-xs font-mono tabular-nums text-[var(--ink-3)]">
          → {formatCurrency(endValue)} bij {endLabel.toLowerCase()}
        </span>
      </header>
      <div className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
        {formatCurrency(currentNetWorth)}
      </div>
      <Link
        href="/toekomst"
        className="block hover:opacity-90 transition-opacity"
        aria-label="Bekijk volledige projectie inclusief afbouw op /toekomst"
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" aria-label="Vermogensprojectie tot vrijheid">
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
            cx={ageToX(startAge)}
            cy={valueToY(currentNetWorth)}
            r="4"
            fill="var(--module-active-700, #047857)"
          />
          {/* Vrijheid-eindmarker — altijd rechts in beeld (fireAge of fallback) */}
          <line
            x1={ageToX(finalAge)}
            y1={PAD_TOP}
            x2={ageToX(finalAge)}
            y2={valueToY(endValue)}
            stroke="var(--horizon-500, #8b5cf6)"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.6"
          />
          <circle cx={ageToX(finalAge)} cy={valueToY(endValue)} r="4" fill="var(--horizon-500, #8b5cf6)" />
          <text
            x={ageToX(finalAge)}
            y={PAD_TOP - 4}
            textAnchor="end"
            className="fill-[var(--horizon-700,#6d28d9)] font-mono"
            fontSize="9"
          >
            {endLabel} {finalAge}
          </text>
          {/* Vandaag-label */}
          <text
            x={ageToX(startAge)}
            y={H - 4}
            textAnchor="start"
            className="fill-[var(--ink-3)] font-mono"
            fontSize="9"
          >
            Vandaag ({startAge})
          </text>
        </svg>
      </Link>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--ink-3)] italic">
          Benadering met {(yearlyGrowthRate * 100).toFixed(1)}%/jaar groei.
        </p>
        <Link
          href="/toekomst"
          className="text-[11px] font-semibold text-violet-700 hover:underline shrink-0"
        >
          Bekijk afbouw →
        </Link>
      </div>
    </div>
  )
}
