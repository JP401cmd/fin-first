'use client'

import { memo, useMemo } from 'react'
import { ArrowDownRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

interface KoopkrachtErosieProps {
  rows: UnifiedProjectionRow[]
  inflationRate: number   // e.g. 0.02 for 2%
  startVermogen: number
  eindVermogen: number
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Koopkrachterosie analyse: shows the difference between nominal and real
 * (inflation-adjusted) portfolio value over the accumulation phase.
 *
 * Key insight: even with positive returns, inflation silently erodes a
 * significant portion of apparent wealth growth.
 */
export const KoopkrachtErosie = memo(function KoopkrachtErosie({
  rows,
  inflationRate,
  startVermogen,
  eindVermogen,
}: KoopkrachtErosieProps) {
  const analysis = useMemo(() => {
    const accumulationRows = rows.filter(r => r.phase === 'accumulation')
    const jaren = accumulationRows.length

    if (jaren === 0) return null

    // Real (inflation-adjusted) end portfolio
    const deflator = Math.pow(1 + inflationRate, jaren)
    const reeelEindVermogen = eindVermogen / deflator
    const reeelStartVermogen = startVermogen // start is already in today's euros

    // Erosion metrics
    const nominaleGroei = eindVermogen - startVermogen
    const reeleGroei = reeelEindVermogen - reeelStartVermogen
    const erosie = nominaleGroei - reeleGroei  // amount eaten by inflation
    const erosiePercentage = nominaleGroei > 0 ? (erosie / nominaleGroei) * 100 : 0

    // Per-year breakdown (optional detail)
    const cumulatieveErosie = accumulationRows.map((row, idx) => {
      const year = idx + 1
      const nominalNW = row.netWorth
      const realNW = nominalNW / Math.pow(1 + inflationRate, year)
      return {
        age: row.age,
        nominaal: nominalNW,
        reeel: realNW,
        erosie: nominalNW - realNW,
      }
    })

    return {
      jaren,
      deflator,
      nominaalEind: eindVermogen,
      reeelEind: reeelEindVermogen,
      nominaleGroei,
      reeleGroei,
      erosie,
      erosiePercentage,
      cumulatieveErosie,
    }
  }, [rows, inflationRate, startVermogen, eindVermogen])

  // Don't render if no data or 0% inflation (step 10)
  if (!analysis || inflationRate === 0) return null

  const { jaren, nominaalEind, reeelEind, nominaleGroei, reeleGroei, erosie, erosiePercentage } = analysis

  // How many extra months of work does inflation cost?
  const maandelijkseInleg = startVermogen > 0 && jaren > 0
    ? (nominaleGroei / jaren) / 12
    : 0
  const extraMaanden = maandelijkseInleg > 0 ? Math.round(erosie / maandelijkseInleg) : 0

  const finContext = `Koopkrachterosie: ${inflationRate * 100}% inflatie over ${jaren} jaar. Nominaal ${formatCurrency(Math.round(nominaalEind))}, reëel ${formatCurrency(Math.round(reeelEind))}. Erosie: ${formatCurrency(Math.round(erosie))} (${erosiePercentage.toFixed(1)}% van vermogensgroei).`

  return (
    <AnalysisSection
      title="Koopkrachterosie"
      icon={ArrowDownRight}
      finContext={finContext}
    >
      <div className="space-y-4">
        {/* ── Hero: ONE clear number — purchasing power loss ── */}
        <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
            Koopkrachtverlies over {jaren} jaar
          </p>
          <p className="mt-1.5 font-mono text-xl tabular-nums text-[var(--negative)]">
            −{<MaskedAmount value={Math.round(erosie)} tone="horizon" />}
          </p>
          {/* ── Progress bar for erosion share ────────────── */}
          <div className="mx-auto mt-2.5 max-w-[200px]">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-[var(--negative)]/60 transition-all duration-500"
                style={{ width: `${Math.min(erosiePercentage, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-4)]">
              {erosiePercentage.toFixed(1)}% van je vermogensgroei
            </p>
          </div>
        </div>

        {/* ── Compact comparison: Nominaal → Reëel ────────── */}
        <div className="flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Nominaal</p>
            <p className="font-mono text-sm tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(nominaalEind)} tone="horizon" />}</p>
          </div>
          <ArrowDownRight className="h-4 w-4 text-[var(--ink-4)]" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Reëel</p>
            <p className="font-mono text-sm tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(reeelEind)} tone="horizon" />}</p>
          </div>
        </div>

        {/* ── Planning context ─────────────────────────────── */}
        <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
          Bij {(inflationRate * 100).toFixed(1)}% inflatie is je eindvermogen
          van {<MaskedAmount value={Math.round(nominaalEind)} tone="horizon" />} in werkelijkheid
          {' '}{<MaskedAmount value={Math.round(reeelEind)} tone="horizon" />} waard in euro&apos;s van vandaag.
          {extraMaanden > 0 && (
            <> Dat is ruwweg <strong className="text-[var(--ink-2)]">{extraMaanden} maanden</strong> extra sparen om te compenseren.</>
          )}
        </p>

        {/* ── Editorial insight ─────────────────────────────── */}
        <p className="text-[11px] italic leading-relaxed text-[var(--ink-4)]">
          {erosiePercentage > 30
            ? 'Inflatie is een stille vijand — overweeg beleggingen die structureel boven inflatie groeien.'
            : 'Je rendement compenseert de inflatie grotendeels — maar houd het in de gaten bij dalende markten.'}
        </p>
      </div>
    </AnalysisSection>
  )
})
