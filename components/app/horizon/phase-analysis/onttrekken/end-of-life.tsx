'use client'

import { memo, useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { AnalysisSection } from '../analysis-section'
import { analyzeEndOfLife, type EndOfLifeAnalysis } from '@/lib/phase-analysis'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { MaskedAmount } from '@/components/app/masked-amount'

// -- Types --------------------------------------------------------------------

interface EndOfLifeProps {
  rows: UnifiedProjectionRow[]
  strategy: FireEndStrategy
  endAge: number
  inflationRate: number
  yearlyAowIncome: number
  hasPartner?: boolean
  /** Erfgenamen (heirs) with relation and fraction of inheritance */
  erfgenamen?: { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[]
  /** Partner AOW monthly benefit */
  partnerAowBedrag?: number
  /** Nabestaandenpensioen monthly amount */
  nabestaandenPensioen?: number
  /** Current age for inflation sensitivity calculation */
  currentAge?: number
}

// -- Component ----------------------------------------------------------------

/**
 * End-of-life analysis for the withdrawal phase.
 *
 * Displays:
 *  1. Base scenario: end portfolio and strategy label
 *  2. Sensitivity table: what happens at endAge-5, endAge, endAge+5
 *  3. Inheritance indication with per-heir breakdown and tax
 *  4. Partner continuation (if hasPartner): available monthly income
 *  5. Disclaimer about informal nature of the calculation
 *
 * The analysis engine runs lazily after mount so the modal open animation
 * is never blocked by heavy computation.
 */
export const EndOfLife = memo(function EndOfLife({
  rows,
  strategy,
  endAge,
  inflationRate,
  hasPartner = false,
  erfgenamen,
  partnerAowBedrag,
  nabestaandenPensioen,
  currentAge,
}: EndOfLifeProps) {
  const { masked } = useMaskedAmounts()
  const [analysis, setAnalysis] = useState<EndOfLifeAnalysis | null>(null)

  // Whether real heir/partner data was provided (vs. engine defaults)
  const hasRealErfgenamen = erfgenamen != null && erfgenamen.length > 0
  const hasRealPartnerData = partnerAowBedrag != null || (nabestaandenPensioen != null && nabestaandenPensioen > 0)

  // Lazy compute: defer past first paint
  useEffect(() => {
    if (rows.length === 0) return

    const timer = setTimeout(() => {
      const result = analyzeEndOfLife({
        rows,
        strategy,
        endAge,
        hasPartner,
        inflationRate,
        currentAge,
        ...(erfgenamen && erfgenamen.length > 0 ? { erfgenamen } : {}),
        ...(partnerAowBedrag != null ? { partnerAowBedrag } : {}),
        ...(nabestaandenPensioen != null ? { nabestaandenPensioen } : {}),
      })
      setAnalysis(result)
    }, 30)

    return () => clearTimeout(timer)
  }, [rows, strategy, endAge, hasPartner, erfgenamen, partnerAowBedrag, nabestaandenPensioen, inflationRate, currentAge])

  const strategyLabel = STRATEGY_LABELS[strategy]?.name ?? strategy
  const loading = analysis === null

  return (
    <AnalysisSection
      title="Einde levensfase"
      icon={Heart}
      loading={loading}
      willContext={
        analysis
          ? `Einde levensfase: eindvermogen ${formatMaskedCurrency(analysis.eindVermogen, masked)} bij ${endAge} jaar. ` +
            `Strategie: ${strategyLabel}. Netto nalatenschap: ${formatMaskedCurrency(analysis.erfenisIndicatie.nettoBedrag, masked)}.`
          : 'Einde levensfase (laden...)'
      }
    >
      {analysis && (
        <div className="space-y-4">
          {/* -- 1. Base scenario ------------------------------------------- */}
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[var(--ink-3)]">
                Eindvermogen bij {Math.round(endAge)} jaar
              </span>
              <span className="font-mono text-sm tabular-nums font-semibold text-[var(--ink)]">
                {<MaskedAmount value={analysis.eindVermogen} tone="horizon" />}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-[var(--ink-3)]">Strategie</span>
              <span className="text-xs font-medium text-[var(--ink-2)]">
                {strategyLabel}
              </span>
            </div>
          </div>

          {/* -- 2. Sensitivity table -------------------------------------- */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Gevoeligheidstabel
            </p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                    <th className="px-1 pb-2">Scenario</th>
                    <th className="px-1 pb-2 text-right">Leeftijd</th>
                    <th className="px-1 pb-2 text-right">Eindvermogen</th>
                    <th className="hidden px-1 pb-2 text-right sm:table-cell">Erfbelasting</th>
                    <th className="px-1 pb-2 text-right">Netto nalatenschap</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.gevoeligheid.map((g) => (
                    <tr
                      key={g.leeftijd}
                      className="border-b border-dashed border-[var(--border-ed)] last:border-b-0"
                    >
                      <td className="px-1 py-1.5 text-[var(--ink-2)]">{g.label}</td>
                      <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                        {g.leeftijd}
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink)]">
                        {<MaskedAmount value={g.eindVermogen} tone="horizon" />}
                      </td>
                      <td className="hidden px-1 py-1.5 text-right font-mono tabular-nums text-[var(--negative)] sm:table-cell">
                        {g.erfbelastingTotaal > 0 ? `\u2212 ${formatMaskedCurrency(g.erfbelastingTotaal, masked)}` : '\u2013'}
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink)]">
                        {<MaskedAmount value={g.nettoNalatenschap} tone="horizon" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* -- 2b. Inflation sensitivity table ----------------------------- */}
          {analysis.inflatieGevoeligheid && analysis.inflatieGevoeligheid.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Inflatie-gevoeligheid
              </p>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                      <th className="px-1 pb-2">Scenario</th>
                      <th className="px-1 pb-2 text-right">Re&euml;el eindvermogen</th>
                      <th className="px-1 pb-2 text-right">Verschil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.inflatieGevoeligheid.map((ig) => {
                      const isBasis = ig.verschil === 0
                      const colorClass = ig.verschil > 0
                        ? 'text-[var(--positive)]'
                        : ig.verschil < 0
                          ? 'text-[var(--negative)]'
                          : 'text-[var(--ink-2)]'
                      return (
                        <tr
                          key={ig.inflatie}
                          className={`border-b border-dashed border-[var(--border-ed)] last:border-b-0 ${isBasis ? 'bg-[var(--subtle)]/30' : ''}`}
                        >
                          <td className={`px-1 py-1.5 ${isBasis ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                            {ig.label}
                          </td>
                          <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink)]">
                            {<MaskedAmount value={ig.reëelEindVermogen} tone="horizon" />}
                          </td>
                          <td className={`px-1 py-1.5 text-right font-mono tabular-nums ${colorClass}`}>
                            {ig.verschil === 0
                              ? '\u2013'
                              : `${ig.verschil > 0 ? '+' : '\u2212'} ${formatMaskedCurrency(Math.abs(ig.verschil), masked)}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[10px] italic text-[var(--ink-4)]">
                Re&euml;le bedragen in koopkracht van vandaag
              </p>
            </div>
          )}

          {/* -- 3. Inheritance indication ---------------------------------- */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Erfenis-indicatie
            </p>
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-[var(--ink-3)]">Bruto nalatenschap</span>
                <span className="font-mono text-xs tabular-nums text-[var(--ink)]">
                  {<MaskedAmount value={analysis.erfenisIndicatie.brutoBedrag} tone="horizon" />}
                </span>
              </div>
              {analysis.erfenisIndicatie.totaalBelasting > 0 && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[var(--ink-3)]">Erfbelasting</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--negative)]">
                    &minus; {<MaskedAmount value={analysis.erfenisIndicatie.totaalBelasting} tone="horizon" />}
                  </span>
                </div>
              )}
              <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-[var(--border-ed)] pt-1">
                <span className="text-xs font-semibold text-[var(--ink)]">
                  Netto nalatenschap
                </span>
                <span className="font-mono text-xs tabular-nums font-semibold text-[var(--ink)]">
                  {<MaskedAmount value={analysis.erfenisIndicatie.nettoBedrag} tone="horizon" />}
                </span>
              </div>

              {/* Per-heir breakdown */}
              {analysis.erfenisIndicatie.perErfgenaam.length > 0 && (
                <div className="mt-2 space-y-1">
                  {analysis.erfenisIndicatie.perErfgenaam.map((erf, i) => (
                    <div key={i} className="flex items-baseline justify-between text-[11px]">
                      <span className="text-[var(--ink-3)]">
                        {erf.relatie === 'kind' && 'Kind'}
                        {erf.relatie === 'partner' && 'Partner'}
                        {erf.relatie === 'overig' && 'Overig'}
                        {' '}({Math.round(erf.fractie * 100)}%)
                      </span>
                      <span className="font-mono tabular-nums text-[var(--ink-2)]">
                        {<MaskedAmount value={erf.netto} tone="horizon" />}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 text-[10px] italic text-[var(--ink-4)]">
                Boven de vrijstellingsgrens geldt erfbelasting
              </p>
            </div>
          </div>

          {/* -- 4. Partner continuation ----------------------------------- */}
          {analysis.partnerVoortzetting && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Partner voortzetting
              </p>
              <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[var(--ink-3)]">
                    Maandelijks beschikbaar
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[var(--ink)]">
                    {<MaskedAmount value={analysis.partnerVoortzetting.maandelijksBeschikbaar} tone="horizon" />}/mnd
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xs text-[var(--ink-3)]">Toereikend?</span>
                  {analysis.partnerVoortzetting.toereikend ? (
                    <span className="text-xs font-semibold text-[var(--positive)]">Ja</span>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--negative)]">
                      Nee &mdash; tekort {<MaskedAmount value={Math.round(analysis.partnerVoortzetting.tekort / 12)} tone="horizon" />}/mnd
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* -- 5. No heirs / no partner message ----------------------------- */}
          {!hasRealErfgenamen && !hasPartner && (
            <div className="rounded-[var(--r)] border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-700">
                Geen erfgenamen of partner opgegeven
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                De erfenis-indicatie hierboven is gebaseerd op een standaardverdeling.
                Vul je huishoudprofiel aan in{' '}
                <span className="font-semibold">Identiteit → Profiel</span>{' '}
                voor een nauwkeurigere berekening van erfbelasting en nalatenschap.
              </p>
            </div>
          )}

          {/* -- 5b. Partial data hints -------------------------------------- */}
          {!hasRealErfgenamen && hasPartner && (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-medium text-[var(--ink-3)]">
                Erfgenamen zijn geschat op basis van standaardverdeling. Vul het
                aantal kinderen aan in{' '}
                <span className="font-semibold">Identiteit → Profiel</span>{' '}
                voor een nauwkeurigere berekening.
              </p>
            </div>
          )}
          {hasRealErfgenamen && hasPartner && !hasRealPartnerData && (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-medium text-[var(--ink-3)]">
                Partner-inkomen na overlijden is geschat. Upload je
                pensioenoverzicht (UPO) voor nabestaandenpensioen-gegevens.
              </p>
            </div>
          )}

          {/* -- 6. Disclaimer --------------------------------------------- */}
          <p className="text-[10px] italic leading-relaxed text-[var(--ink-4)]">
            Informatief, geen fiscaal advies
          </p>
        </div>
      )}
    </AnalysisSection>
  )
})
