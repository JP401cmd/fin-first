'use client'

import { memo, useState, useEffect } from 'react'
import { ArrowDownRight, CheckCircle2, Shield, TrendingDown, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatCurrencyDecimals } from '@/lib/format'
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

  const totalIncome = yearlyWithdrawal + yearlyAowIncome

  // No withdrawal = not relevant
  if (totalIncome <= 0) {
    return (
      <AnalysisSection
        title="Koopkrachterosie"
        icon={ArrowDownRight}
        willContext="Koopkrachterosie: geen onttrekking, niet relevant"
      >
        <div className="flex items-start gap-2 rounded-[var(--r)] border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-900/10">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
            Geen onttrekking gepland — koopkrachterosie is op dit moment niet relevant voor je situatie.
          </p>
        </div>
      </AnalysisSection>
    )
  }

  // 0% inflation = no erosion
  if (inflationRate === 0) {
    return (
      <AnalysisSection
        title="Koopkrachterosie"
        icon={ArrowDownRight}
        willContext="Koopkrachterosie: 0% inflatie, geen erosie"
      >
        <div className="flex items-start gap-2 rounded-[var(--r)] border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-900/10">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
            Bij 0% inflatie blijft je koopkracht onveranderd gedurende de hele onttrekkingsperiode.
          </p>
        </div>
      </AnalysisSection>
    )
  }

  // Short duration = minimal erosion
  if (durationYears <= 2) {
    return (
      <AnalysisSection
        title="Koopkrachterosie"
        icon={ArrowDownRight}
        willContext={`Koopkrachterosie: slechts ${durationYears} jaar, minimale impact`}
      >
        <div className="flex items-start gap-2 rounded-[var(--r)] border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-900/10">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
            Je onttrekkingsperiode is slechts {durationYears} jaar — koopkrachterosie is verwaarloosbaar bij deze looptijd.
          </p>
        </div>
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
              {formatCurrency(totalIncome)}/jaar is straks nog maar{' '}
              <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">
                {formatCurrency(state.reeelLaatsteJaar)}
              </span>{' '}
              waard in huidige euro&apos;s
            </p>
          </div>

          {/* ── Visual erosion bar ────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--ink-4)]">
              <span>Koopkracht vandaag</span>
              <span>Na {durationYears} jaar</span>
            </div>
            <div className="relative h-5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max(100 - state.totalErosiePct, 0)}%`,
                  background: `linear-gradient(90deg, #10b981, ${state.totalErosiePct > 30 ? '#ef4444' : '#f59e0b'})`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white mix-blend-difference">
                {100 - state.totalErosiePct}% behouden
              </div>
            </div>
          </div>

          {/* ── Erosion table ──────────────────────────────────── */}
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                  <th className="px-1 pb-1.5">Leeftijd</th>
                  <th className="px-1 pb-1.5 text-right">Nominaal</th>
                  <th className="px-1 pb-1.5 text-right">Reëel</th>
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
            <div className="flex items-start gap-2">
              <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-xs font-medium leading-relaxed text-amber-700 dark:text-amber-400">
                  {state.levensstijlKostTekst}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-4)]">
                  Ofwel: elke euro die je nu onttrekt, is over {durationYears} jaar slechts{' '}
                  <span className="font-mono tabular-nums font-medium">
                    {formatCurrencyDecimals(100 / Math.pow(1 + inflationRate, durationYears))}
                  </span>{' '}
                  waard.
                </p>
              </div>
            </div>
          </div>

          {/* ── Protection strategies ──────────────────────────── */}
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Beschermingsstrategieën
              </span>
            </div>
            <ul className="space-y-2 text-xs leading-relaxed text-[var(--ink-2)]">
              <li className="flex gap-2">
                <span className="mt-0.5 text-emerald-500">●</span>
                <span>
                  <strong className="text-[var(--ink)]">Inflatiecorrectie</strong> — Verhoog je
                  onttrekking jaarlijks met inflatie ({(inflationRate * 100).toFixed(1)}%). Je koopkracht
                  blijft gelijk, maar je portefeuille wordt sneller aangesproken.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-blue-500">●</span>
                <span>
                  <strong className="text-[var(--ink)]">Guardrails-methode</strong> — Gebruik
                  dynamische onttrekkingsregels: verhoog bij goed rendement, verlaag bij slecht.
                  Beschermt tegen zowel inflatie als beursdaling.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-amber-500">●</span>
                <span>
                  <strong className="text-[var(--ink)]">Stapsgewijs afbouwen</strong> — Neem hogere
                  onttrekkingen in de eerste jaren (actieve fase) en bouw geleidelijk af.
                  Onderzoek toont dat uitgaven na 75 jaar vaak dalen.
                </span>
              </li>
              {state.totalErosiePct >= 30 && (
                <li className="flex gap-2">
                  <span className="mt-0.5 text-red-500">●</span>
                  <span>
                    <strong className="text-[var(--ink)]">Deeltijdwerk overwegen</strong> — Bij{' '}
                    {state.totalErosiePct}% erosie kan een klein bijinkomen in de eerste jaren
                    het verschil maken. Zelfs een paar uur per week vermindert de druk op je portefeuille.
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* ── Severity indicator ────────────────────────────── */}
          {state.totalErosiePct >= 40 && (
            <div className="flex items-start gap-2 rounded-[var(--r)] border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-900/10">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs leading-relaxed text-red-700 dark:text-red-400">
                <strong>Let op:</strong> Bij {state.totalErosiePct}% koopkrachtverlies moet je
                aan het eind van je onttrekkingsperiode rondkomen van minder dan de helft
                van je oorspronkelijke budget. Overweeg serieus een beschermingsstrategie.
              </p>
            </div>
          )}
        </div>
      )}
    </AnalysisSection>
  )
})
