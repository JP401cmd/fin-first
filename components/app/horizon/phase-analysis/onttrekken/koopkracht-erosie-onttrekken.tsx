'use client'

import { memo, useState, useEffect } from 'react'
import { ArrowDownRight, CheckCircle2, Shield, TrendingDown, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { AnalysisSection } from '../analysis-section'
import { MaskedAmount } from '@/components/app/masked-amount'
import { InfoTooltip } from '@/components/overview/belasting/info-tooltip'

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
  /** Of er een inflatiebestendig (AOW) deel is dat niet erodeert */
  hasInflationProofPart: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// euro-view: exempt — deze analyse deflateert bewust zélf, en bovendien SELECTIEF:
// alleen het niet-geïndexeerde onttrekkingsdeel erodeert, de AOW niet. Dat verschil
// is de boodschap; een globale euro-weergave zou beide kanten gelijk behandelen.

/**
 * Compute purchasing power erosion rows at 5-year intervals.
 *
 * IMPORTANT (C4): only the NON-indexed portfolio withdrawal erodes. AOW (and
 * indexed pension) is inflation-proof — by law the AOW is annually indexed, so
 * its real value is preserved. We therefore deflate ONLY `yearlyWithdrawal` and
 * keep `yearlyAowIncome` at constant real value. The reported real income is
 * `yearlyWithdrawal / deflator + yearlyAowIncome`, and the erosion percentage is
 * computed against the total income so the user sees the blended effect.
 */
function computeErosie(
  yearlyWithdrawal: number,
  inflationRate: number,
  startAge: number,
  endAge: number,
  yearlyAowIncome: number,
  masked: boolean,
): ComputedState {
  const totalIncome = yearlyWithdrawal + yearlyAowIncome
  const durationYears = Math.max(Math.round(endAge - startAge), 1)
  const rows: ErosieRow[] = []

  // Real income at year y: only the portfolio part erodes; AOW keeps its value.
  const reeelAtYear = (y: number): number => {
    const deflator = Math.pow(1 + inflationRate, y)
    return yearlyWithdrawal / deflator + yearlyAowIncome
  }

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
    const reeel = reeelAtYear(y)

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
    const reeel = reeelAtYear(lastYear)
    rows.push({
      leeftijd: lastAge,
      jaar: lastYear,
      nominaal: totalIncome,
      reeel: Math.round(reeel),
      erosiePct: Math.round((1 - reeel / totalIncome) * 100),
    })
  }

  // Overall stats
  const reeelLaatsteJaar = Math.round(reeelAtYear(durationYears))
  const totalErosiePct = Math.round((1 - reeelLaatsteJaar / totalIncome) * 100)

  // Future cost of current lifestyle (nominal cost to keep TODAY's purchasing
  // power): only the portfolio part needs to grow with inflation; AOW already
  // indexes itself, so it stays at its current level in this nominal view.
  const finalDeflator = Math.pow(1 + inflationRate, durationYears)
  const levensstijlKostNominaal = Math.round(yearlyWithdrawal * finalDeflator + yearlyAowIncome)
  const levensstijlKostTekst = `Om je huidige koopkracht vast te houden, moet je portfolio-deel over ${durationYears} jaar ${formatMaskedCurrency(levensstijlKostNominaal, masked)}/jaar opleveren in toekomstige euro's`

  return { rows, totalErosiePct, reeelLaatsteJaar, levensstijlKostTekst, hasInflationProofPart: yearlyAowIncome > 0 }
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
  const { masked } = useMaskedAmounts()
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
        masked,
      )
      setState(result)
    }, 50)

    return () => clearTimeout(timer)

  }, [yearlyWithdrawal, inflationRate, startAge, endAge, yearlyAowIncome, masked])

  const loading = state === null
  const durationYears = Math.max(Math.round(endAge - startAge), 1)

  const totalIncome = yearlyWithdrawal + yearlyAowIncome

  // No withdrawal = not relevant
  if (totalIncome <= 0) {
    return (
      <AnalysisSection
        title="Koopkrachterosie"
        icon={ArrowDownRight}
        finContext="Koopkrachterosie: geen onttrekking, niet relevant"
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
        finContext="Koopkrachterosie: 0% inflatie, geen erosie"
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
        finContext={`Koopkrachterosie: slechts ${durationYears} jaar, minimale impact`}
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
      finContext={
        state
          ? `Koopkrachterosie over ${durationYears} jaar bij ${(inflationRate * 100).toFixed(1)}% inflatie: ` +
            `alleen het portfolio-deel (${formatCurrency(yearlyWithdrawal)}/jaar) erodeert; ` +
            `${yearlyAowIncome > 0 ? `AOW (${formatCurrency(yearlyAowIncome)}/jaar) is geïndexeerd en blijft koopkrachtvast. ` : ''}` +
            `Blended koopkrachtverlies ${state.totalErosiePct}%: ${formatCurrency(totalIncome)}/jaar nu is straks nog ${formatCurrency(state.reeelLaatsteJaar)}/jaar waard in huidige euro's.`
          : 'Koopkrachterosie (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Summary stat ──────────────────────────────────── */}
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-3">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center text-xs text-[var(--ink-3)]">
                Koopkrachtverlies na {durationYears} jaar
                <InfoTooltip text="Alleen je portfolio-onttrekking erodeert door inflatie. AOW (en een geïndexeerd pensioen) is wettelijk jaarlijks geïndexeerd en houdt zijn koopkracht vast — dat deel erodeert niet. Het getoonde percentage is het gemengde (blended) effect over je hele inkomen." />
              </span>
              <span className="font-mono text-lg tabular-nums font-bold text-[var(--negative)]">
                &minus;{state.totalErosiePct}%
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-4)]">
              {<MaskedAmount value={totalIncome} tone="horizon" />}/jaar is straks nog maar{' '}
              <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">
                {<MaskedAmount value={state.reeelLaatsteJaar} tone="horizon" />}
              </span>{' '}
              waard in huidige euro&apos;s
              {state.hasInflationProofPart && (
                <>
                  {' '}&mdash; je AO-deel ({<MaskedAmount value={yearlyAowIncome} tone="horizon" />}/jaar) blijft koopkrachtvast
                </>
              )}
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
                  // eslint-disable-next-line no-restricted-syntax -- stoplicht-verloop (groen→amber/rood naar ernst), geen winst/verlies
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
                      {<MaskedAmount value={Math.round(row.nominaal)} tone="horizon" />}
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
                      {<MaskedAmount value={row.reeel} tone="horizon" />}
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
                  <MaskedAmount
                    value={100 / Math.pow(1 + inflationRate, durationYears)}
                    tone="horizon"
                    decimals
                    className="font-medium"
                  />{' '}
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
