'use client'

import { memo, useState, useEffect } from 'react'
import { ArrowDownRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'

// ── Types ────────────────────────────────────────────────────────────────────

export interface KoopkrachtErosieProps {
  yearlyWithdrawal: number
  inflationRate: number
  startAge: number
  endAge: number
  yearlyAowIncome?: number
}

interface ErosieRow {
  leeftijd: number
  jaar: number
  nominaal: number
  reeel: number
  erosiePct: number
}

interface ComputedState {
  rows: ErosieRow[]
  totalErosiePct: number
  reeelLaatsteJaar: number
  levensstijlKostTekst: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute purchasing power erosion rows at 5-year intervals.
 * Nominal withdrawal stays the same; real value decreases with inflation.
 */
function computeErosie(
  yearlyWithdrawal: number,
  inflationRate: number,
  startAge: number,
  endAge: number,
  yearlyAowIncome: number,
): ComputedState {
  const totalIncome = yearlyWithdrawal + yearlyAowIncome
  const durationYears = Math.max(Math.round(endAge - startAge), 1)
  const rows: ErosieRow[] = []

  // Start row
  rows.push({
    leeftijd: Math.round(startAge),
    jaar: 0,
    nominaal: totalIncome,
    reeel: totalIncome,
    erosiePct: 0,
  })

  // Every 5th year
  for (let y = 5; y < durationYears; y += 5) {
    const age = Math.round(startAge) + y
    const deflator = Math.pow(1 + inflationRate, y)
    const reeel = totalIncome / deflator

    rows.push({
      leeftijd: age,
      jaar: y,
      nominaal: totalIncome,
      reeel: Math.round(reeel),
      erosiePct: Math.round((1 - reeel / totalIncome) * 100),
    })
  }

  // Final year (if not already included as a 5-year interval)
  const lastYear = durationYears
  const lastAge = Math.round(startAge) + lastYear
  if (rows[rows.length - 1].jaar !== lastYear) {
    const deflator = Math.pow(1 + inflationRate, lastYear)
    const reeel = totalIncome / deflator
    rows.push({
      leeftijd: lastAge,
      jaar: lastYear,
      nominaal: totalIncome,
      reeel: Math.round(reeel),
      erosiePct: Math.round((1 - reeel / totalIncome) * 100),
    })
  }

  // Overall stats
  const finalDeflator = Math.pow(1 + inflationRate, durationYears)
  const reeelLaatsteJaar = Math.round(totalIncome / finalDeflator)
  const totalErosiePct = Math.round((1 - reeelLaatsteJaar / totalIncome) * 100)

  // Future cost of current lifestyle
  const levensstijlKostNominaal = Math.round(totalIncome * finalDeflator)
  const levensstijlKostTekst = `Je levensstijl kost over ${durationYears} jaar ${formatCurrency(levensstijlKostNominaal)}/jaar in toekomstige euro's`

  return { rows, totalErosiePct, reeelLaatsteJaar, levensstijlKostTekst }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Purchasing power erosion analysis for the withdrawal phase.
 *
 * Shows how inflation erodes the real value of a fixed nominal withdrawal
 * over 20-30+ years of retirement. Makes the abstract concept of inflation
 * tangible by showing the gap between nominal and real values at 5-year
 * intervals.
 *
 * When inflationRate is 0, shows a clean "no erosion" message.
 */
export const KoopkrachtErosieOnttrekken = memo(function KoopkrachtErosieOnttrekken({
  yearlyWithdrawal,
  inflationRate,
  startAge,
  endAge,
  yearlyAowIncome = 0,
}: KoopkrachtErosieProps) {
  const [state, setState] = useState<ComputedState | null>(null)

  // Lazy compute: defer past first paint
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = computeErosie(
        yearlyWithdrawal,
        inflationRate,
        startAge,
        endAge,
        yearlyAowIncome,
      )
      setState(result)
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearlyWithdrawal, inflationRate, startAge, endAge, yearlyAowIncome])

  const loading = state === null
  const durationYears = Math.max(Math.round(endAge - startAge), 1)

  // 0% inflation = no erosion
  if (inflationRate === 0) {
    return (
      <AnalysisSection
        title="Koopkrachterosie"
        icon={ArrowDownRight}
        willContext="Koopkrachterosie: 0% inflatie, geen erosie"
      >
        <p className="text-xs text-[var(--ink-3)]">
          Bij 0% inflatie blijft je koopkracht onveranderd gedurende de hele onttrekkingsperiode.
        </p>
      </AnalysisSection>
    )
  }

  return (
    <AnalysisSection
      title="Koopkrachterosie"
      icon={ArrowDownRight}
      loading={loading}
      willContext={
        state
          ? `Koopkrachterosie: ${durationYears} jaar, inflatie ${(inflationRate * 100).toFixed(1)}%, ` +
            `totaal erosie ${state.totalErosiePct}%, ` +
            `reeel ${formatCurrency(state.reeelLaatsteJaar)}/jaar aan het eind`
          : 'Koopkrachterosie (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Summary stat ──────────────────────────────────── */}
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[var(--ink-3)]">
                Koopkrachtverlies na {durationYears} jaar
              </span>
              <span className="font-mono text-lg tabular-nums font-bold text-[var(--negative)]">
                &minus;{state.totalErosiePct}%
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-4)]">
              {formatCurrency(yearlyWithdrawal + yearlyAowIncome)}/jaar is straks nog maar{' '}
              <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">
                {formatCurrency(state.reeelLaatsteJaar)}
              </span>{' '}
              waard in huidige euro&apos;s
            </p>
          </div>

          {/* ── Erosion table ──────────────────────────────────── */}
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                  <th className="px-1 pb-1.5">Leeftijd</th>
                  <th className="px-1 pb-1.5 text-right">Nominaal</th>
                  <th className="px-1 pb-1.5 text-right">Reeel</th>
                  <th className="px-1 pb-1.5 text-right">Erosie</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr
                    key={row.leeftijd}
                    className={`border-b border-dashed border-[var(--border-ed)] last:border-b-0 ${
                      row.jaar === 0 ? 'bg-[var(--subtle)]/30' : ''
                    }`}
                  >
                    <td className="px-1 py-2 text-[var(--ink-2)]">
                      {row.leeftijd} jaar
                      {row.jaar > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                          (+{row.jaar}j)
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-2 text-right font-mono tabular-nums text-[var(--ink-3)]">
                      {formatCurrency(Math.round(row.nominaal))}
                    </td>
                    <td
                      className={`px-1 py-2 text-right font-mono tabular-nums ${
                        row.erosiePct > 20
                          ? 'text-[var(--negative)]'
                          : row.erosiePct > 0
                            ? 'text-amber-600'
                            : 'text-[var(--ink)]'
                      }`}
                    >
                      {formatCurrency(row.reeel)}
                    </td>
                    <td
                      className={`px-1 py-2 text-right font-mono tabular-nums ${
                        row.erosiePct > 20
                          ? 'text-[var(--negative)]'
                          : row.erosiePct > 0
                            ? 'text-amber-600'
                            : 'text-[var(--ink-4)]'
                      }`}
                    >
                      {row.erosiePct > 0 ? `\u2212${row.erosiePct}%` : '\u2013'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Future cost of lifestyle ───────────────────────── */}
          <div className="rounded-[var(--r)] border border-dashed border-amber-400/30 bg-amber-50/50 p-3 dark:bg-amber-900/10">
            <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              {state.levensstijlKostTekst}
            </p>
            <p className="mt-1 text-[11px] italic leading-relaxed text-[var(--ink-4)]">
              Overweeg een inflatiecorrectie of stapsgewijze verlaging van je onttrekking om koopkracht te behouden.
            </p>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})
