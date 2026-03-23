'use client'

import { memo, useMemo } from 'react'
import { Home } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  analyzeHuisVerkopen,
  type HuisVerkopenInput,
  type HuisVerkopenResult,
} from '@/lib/phase-analysis'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// -- Types --------------------------------------------------------------------

interface HuisVerkopenProps {
  assets: Asset[]
  debts: Debt[]
  expectedReturn: number
  inflationRate: number
}

/** Sensitivity scenario: growth rate + analysis result. */
interface SensitivityRow {
  groeiPct: number
  result: HuisVerkopenResult
}

// -- Helpers ------------------------------------------------------------------

/** Map aanbeveling to a human-readable color-coded label. */
function aanbevelingLabel(a: HuisVerkopenResult['aanbeveling']): {
  text: string
  colorClass: string
} {
  switch (a) {
    case 'verkopen':
      return { text: 'Verkopen + huren', colorClass: 'text-[var(--positive)]' }
    case 'behouden':
      return { text: 'Huis behouden', colorClass: 'text-[var(--color-kern-500)]' }
    default:
      return { text: 'Praktisch gelijk', colorClass: 'text-[var(--ink-2)]' }
  }
}

/** Short aanbeveling label for sensitivity table. */
function aanbevelingKort(a: HuisVerkopenResult['aanbeveling']): {
  text: string
  colorClass: string
} {
  switch (a) {
    case 'verkopen':
      return { text: 'Verkopen', colorClass: 'text-[var(--positive)]' }
    case 'behouden':
      return { text: 'Behouden', colorClass: 'text-[var(--color-kern-500)]' }
    default:
      return { text: 'Gelijk', colorClass: 'text-[var(--ink-2)]' }
  }
}

/** Format a monthly cost value as a readable string. */
function formatMonthly(yearly: number): string {
  return formatCurrency(Math.round(yearly / 12)) + '/mnd'
}

/** Growth rate scenarios for sensitivity analysis. */
const SENSITIVITY_RATES = [0.02, 0.03, 0.04]

// -- Component ----------------------------------------------------------------

/**
 * House selling analysis for the withdrawal phase.
 *
 * Compares keeping the house vs. selling and renting over a 20-year horizon.
 * Renders a side-by-side comparison table with a color-coded winner badge,
 * sensitivity analysis across 3 growth scenarios, opportunity cost block,
 * and a short conclusion from the calculation engine.
 *
 * Returns null when no eigen_huis asset is found in the user's portfolio,
 * keeping the parent layout clean.
 */
export const HuisVerkopen = memo(function HuisVerkopen({
  assets,
  debts,
  expectedReturn,
  inflationRate,
}: HuisVerkopenProps) {
  // Build base input from assets/debts (shared across all scenarios)
  const baseInput = useMemo<HuisVerkopenInput | null>(() => {
    const house = assets.find((a) => a.asset_type === 'eigen_huis')
    if (!house) return null

    const mortgage = debts.find(
      (d) =>
        d.debt_type === 'mortgage' &&
        d.is_active &&
        d.linked_asset_id === house.id,
    ) ?? debts.find(
      (d) => d.debt_type === 'mortgage' && d.is_active && d.current_balance > 0,
    )

    return {
      woningWaarde: house.woz_value ?? house.current_value,
      hypotheekResterend: mortgage?.current_balance ?? 0,
      maandlastHypotheek: mortgage?.monthly_payment ?? 0,
      woningWaardeGroei: 0.03,
      maandlastOverig: 200, // OZB + VvE + onderhoud estimate
      verwachteHuur: 1200,
      verkoopkostenPct: 0.04,
      horizonJaren: 20,
    }
  }, [assets, debts])

  // Default 3% result
  const result = useMemo<HuisVerkopenResult | null>(() => {
    if (!baseInput) return null
    return analyzeHuisVerkopen(baseInput, expectedReturn, inflationRate)
  }, [baseInput, expectedReturn, inflationRate])

  // Sensitivity analysis: run 3 scenarios with different growth rates
  const sensitivityRows = useMemo<SensitivityRow[]>(() => {
    if (!baseInput) return []
    return SENSITIVITY_RATES.map((groeiPct) => ({
      groeiPct,
      result: analyzeHuisVerkopen(
        { ...baseInput, woningWaardeGroei: groeiPct },
        expectedReturn,
        inflationRate,
      ),
    }))
  }, [baseInput, expectedReturn, inflationRate])

  // Opportunity cost: what does keeping equity locked in the house cost?
  // = FV of net equity invested at expectedReturn over horizon − actual house value growth
  const opportunityData = useMemo(() => {
    if (!baseInput || !result) return null

    const netEquity = baseInput.woningWaarde - baseInput.hypotheekResterend
    if (netEquity <= 0) return null

    const horizon = baseInput.horizonJaren
    // What the equity would be worth if invested in the market
    const fvInvested = netEquity * Math.pow(1 + expectedReturn, horizon)
    // What the house equity actually grew to (house value − remaining mortgage)
    const houseEquityAtEnd =
      result.behouden.woningWaardeNaHorizon - result.behouden.hypotheekResterendNaHorizon
    // Opportunity cost = difference (positive means keeping house costs you money)
    const opportuniteitskosten = Math.round(fvInvested - houseEquityAtEnd)

    return {
      netEquity: Math.round(netEquity),
      fvInvested: Math.round(fvInvested),
      houseEquityAtEnd: Math.round(houseEquityAtEnd),
      opportuniteitskosten,
    }
  }, [baseInput, result, expectedReturn])

  // No eigen_huis in portfolio -- render nothing
  if (!result || !baseInput) return null

  const winner = aanbevelingLabel(result.aanbeveling)

  return (
    <AnalysisSection
      title="Huis verkopen vs. behouden"
      icon={Home}
      willContext={`Huis verkopen analyse: aanbeveling ${result.aanbeveling}. Verschil: ${formatCurrency(result.verschil)} over 20 jaar. Breakeven huur: ${formatCurrency(result.breakevenHuur)}/mnd.`}
    >
      <div className="space-y-3">
        {/* -- Comparison table -------------------------------------------- */}
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                <th className="px-1 pb-2" />
                <th className="px-1 pb-2 text-right">Huis behouden</th>
                <th className="px-1 pb-2 text-right">Verkopen + huren</th>
              </tr>
            </thead>
            <tbody>
              {/* Maandelijkse woonlasten */}
              <tr className="border-b border-dashed border-[var(--border-ed)]">
                <td className="px-1 py-1.5 text-[var(--ink-3)]">
                  Maandelijkse woonlasten
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {formatMonthly(result.behouden.totaleCumulatieveKosten / 20)}
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {formatMonthly(result.verkopen.totaleCumulatieveHuur / 20)}
                </td>
              </tr>

              {/* Vrijgekomen vermogen */}
              <tr className="border-b border-dashed border-[var(--border-ed)]">
                <td className="px-1 py-1.5 text-[var(--ink-3)]">
                  Vrijgekomen vermogen
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-4)]">
                  &ndash;
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--positive)]">
                  {formatCurrency(result.verkopen.nettoVerkoopopbrengst)}
                </td>
              </tr>

              {/* Rendement op vermogen */}
              <tr className="border-b border-dashed border-[var(--border-ed)]">
                <td className="px-1 py-1.5 text-[var(--ink-3)]">
                  Rendement op vermogen
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(Math.round(result.behouden.woningWaardeNaHorizon - (assets.find(a => a.asset_type === 'eigen_huis')?.current_value ?? 0)))}
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(Math.round(result.verkopen.beleggingswaarde - result.verkopen.nettoVerkoopopbrengst + result.verkopen.totaleCumulatieveHuur))}
                </td>
              </tr>

              {/* Netto effect */}
              <tr className="border-t-2 border-[var(--ink)]">
                <td className="px-1 py-1.5 font-semibold text-[var(--ink)]">
                  Netto positie na 20 jaar
                </td>
                <td
                  className={`px-1 py-1.5 text-right font-mono tabular-nums font-semibold ${
                    result.aanbeveling === 'behouden'
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  {formatCurrency(result.behouden.nettoPositie)}
                </td>
                <td
                  className={`px-1 py-1.5 text-right font-mono tabular-nums font-semibold ${
                    result.aanbeveling === 'verkopen'
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  {formatCurrency(result.verkopen.nettoPositie)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* -- Winner badge ------------------------------------------------ */}
        <div className="flex items-center justify-center">
          <span className={`rounded-full bg-[var(--subtle)] px-3 py-1 text-xs font-semibold ${winner.colorClass}`}>
            {winner.text}
          </span>
        </div>

        {/* -- Sensitivity analysis ---------------------------------------- */}
        {sensitivityRows.length > 0 && (
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Gevoeligheidsanalyse — woningwaardegroei
            </p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                    <th className="px-1 pb-1.5">Groei</th>
                    <th className="px-1 pb-1.5 text-right">Behouden</th>
                    <th className="px-1 pb-1.5 text-right">Verkopen</th>
                    <th className="px-1 pb-1.5 text-right">Verschil</th>
                    <th className="px-1 pb-1.5 text-right">Advies</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityRows.map((row) => {
                    const label = aanbevelingKort(row.result.aanbeveling)
                    const isBase = row.groeiPct === 0.03
                    return (
                      <tr
                        key={row.groeiPct}
                        className={`border-b border-dashed border-[var(--border-ed)] ${
                          isBase ? 'bg-[var(--subtle)]/30' : ''
                        }`}
                      >
                        <td className="px-1 py-1.5 font-mono tabular-nums text-[var(--ink-2)]">
                          {(row.groeiPct * 100).toFixed(0)}%
                          {isBase && (
                            <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                              (basis)
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {formatCurrency(row.result.behouden.nettoPositie)}
                        </td>
                        <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {formatCurrency(row.result.verkopen.nettoPositie)}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right font-mono tabular-nums ${
                            row.result.verschil > 0
                              ? 'text-[var(--positive)]'
                              : row.result.verschil < 0
                                ? 'text-[var(--negative)]'
                                : 'text-[var(--ink-3)]'
                          }`}
                        >
                          {row.result.verschil > 0 ? '+' : ''}
                          {formatCurrency(row.result.verschil)}
                        </td>
                        <td className={`px-1 py-1.5 text-right text-[11px] font-semibold ${label.colorClass}`}>
                          {label.text}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--ink-4)]">
              Verschil = verkopen − behouden. Positief = verkopen is voordeliger.
            </p>
          </div>
        )}

        {/* -- Opportunity cost block -------------------------------------- */}
        {opportunityData && (
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Opportuniteitskosten vastgoed
            </p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--ink-3)]">Huidige overwaarde</span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(opportunityData.netEquity)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--ink-3)]">
                  Belegd rendement ({(expectedReturn * 100).toFixed(1)}%, {baseInput.horizonJaren} jr)
                </span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(opportunityData.fvInvested)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--ink-3)]">
                  Woningwaarde na {baseInput.horizonJaren} jr
                </span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(opportunityData.houseEquityAtEnd)}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-[var(--ink)] pt-1.5">
                <span className="font-semibold text-[var(--ink)]">
                  Opportuniteitskosten
                </span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    opportunityData.opportuniteitskosten > 0
                      ? 'text-[var(--negative)]'
                      : opportunityData.opportuniteitskosten < 0
                        ? 'text-[var(--positive)]'
                        : 'text-[var(--ink-2)]'
                  }`}
                >
                  {opportunityData.opportuniteitskosten > 0 ? '+' : ''}
                  {formatCurrency(opportunityData.opportuniteitskosten)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
              {opportunityData.opportuniteitskosten > 0 ? (
                <>
                  Door je overwaarde in het huis te laten zitten in plaats van te beleggen,
                  loop je over {baseInput.horizonJaren} jaar{' '}
                  <span className="font-mono tabular-nums text-[var(--negative)]">
                    {formatCurrency(opportunityData.opportuniteitskosten)}
                  </span>{' '}
                  aan potentieel rendement mis.
                </>
              ) : (
                <>
                  De woningwaardestijging overtreft het verwachte beleggingsrendement.
                  Je overwaarde levert in het huis{' '}
                  <span className="font-mono tabular-nums text-[var(--positive)]">
                    {formatCurrency(Math.abs(opportunityData.opportuniteitskosten))}
                  </span>{' '}
                  meer op dan belegd vermogen.
                </>
              )}
            </p>
          </div>
        )}

        {/* -- Breakeven + conclusion -------------------------------------- */}
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[var(--ink-3)]">Breakeven huur</span>
            <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">
              {formatCurrency(result.breakevenHuur)}/mnd
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
            {result.aanbeveling === 'verkopen' && (
              <>
                Bij de huidige uitgangspunten is verkopen en huren over 20 jaar{' '}
                <span className="font-mono tabular-nums text-[var(--positive)]">
                  {formatCurrency(Math.abs(result.verschil))}
                </span>{' '}
                voordeliger.
              </>
            )}
            {result.aanbeveling === 'behouden' && (
              <>
                Bij de huidige uitgangspunten is het huis behouden over 20 jaar{' '}
                <span className="font-mono tabular-nums text-[var(--color-kern-500)]">
                  {formatCurrency(Math.abs(result.verschil))}
                </span>{' '}
                voordeliger.
              </>
            )}
            {result.aanbeveling === 'gelijk' && (
              <>
                Beide scenario&apos;s leveren nagenoeg hetzelfde op over 20 jaar.
                Kies op basis van woonwensen en risicoprofiel.
              </>
            )}
          </p>
        </div>

        {/* -- Disclaimer -------------------------------------------------- */}
        <p className="text-[10px] italic leading-relaxed text-[var(--ink-4)]">
          Dit is een indicatieve berekening. Raadpleeg een financieel adviseur.
        </p>
      </div>
    </AnalysisSection>
  )
})
