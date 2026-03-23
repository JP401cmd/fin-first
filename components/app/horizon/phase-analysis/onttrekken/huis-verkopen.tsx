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

/** Format a monthly cost value as a readable string. */
function formatMonthly(yearly: number): string {
  return formatCurrency(Math.round(yearly / 12)) + '/mnd'
}

// -- Component ----------------------------------------------------------------

/**
 * House selling analysis for the withdrawal phase.
 *
 * Compares keeping the house vs. selling and renting over a 20-year horizon.
 * Renders a side-by-side comparison table with a color-coded winner badge
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
  const result = useMemo<HuisVerkopenResult | null>(() => {
    // Find the eigen_huis asset
    const house = assets.find((a) => a.asset_type === 'eigen_huis')
    if (!house) return null

    // Find linked mortgage: match by linked_asset_id, or fall back to first active mortgage
    const mortgage = debts.find(
      (d) =>
        d.debt_type === 'mortgage' &&
        d.is_active &&
        d.linked_asset_id === house.id,
    ) ?? debts.find(
      (d) => d.debt_type === 'mortgage' && d.is_active && d.current_balance > 0,
    )

    const input: HuisVerkopenInput = {
      woningWaarde: house.woz_value ?? house.current_value,
      hypotheekResterend: mortgage?.current_balance ?? 0,
      maandlastHypotheek: mortgage?.monthly_payment ?? 0,
      woningWaardeGroei: 0.03,
      maandlastOverig: 200, // OZB + VvE + onderhoud estimate
      verwachteHuur: 1200,
      verkoopkostenPct: 0.04,
      horizonJaren: 20,
    }

    return analyzeHuisVerkopen(input, expectedReturn, inflationRate)
  }, [assets, debts, expectedReturn, inflationRate])

  // No eigen_huis in portfolio -- render nothing
  if (!result) return null

  const winner = aanbevelingLabel(result.aanbeveling)

  // Derive monthly housing costs for display
  const maandlastenBehouden =
    result.behouden.totaleCumulatieveKosten / (20 * 12)
  const maandlastenVerkopen = result.verkopen.totaleCumulatieveHuur / (20 * 12)

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
