'use client'

import { memo, useMemo } from 'react'
import { ArrowDownRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'

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

  const willContext = `Koopkrachterosie: ${inflationRate * 100}% inflatie over ${jaren} jaar. Nominaal ${formatCurrency(Math.round(nominaalEind))}, reëel ${formatCurrency(Math.round(reeelEind))}. Erosie: ${formatCurrency(Math.round(erosie))} (${erosiePercentage.toFixed(1)}% van vermogensgroei).`

  return (
    <AnalysisSection
      title="Koopkrachterosie"
      icon={ArrowDownRight}
      willContext={willContext}
    >
      <div className="space-y-4">
        {/* ── Headline insight ──────────────────────────────── */}
        <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
          Over {jaren} jaar vreet inflatie ({(inflationRate * 100).toFixed(1)}%)
          stilletjes aan je koopkracht.
          Wat {formatCurrency(Math.round(nominaalEind))} lijkt, is in werkelijkheid
          {' '}{formatCurrency(Math.round(reeelEind))} waard in euro&apos;s van vandaag.
        </p>

        {/* ── Two columns: Nominaal vs Reëel ─────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Nominaal
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
              {formatCurrency(Math.round(nominaalEind))}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
              groei: {formatCurrency(Math.round(nominaleGroei))}
            </p>
          </div>
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Reëel (koopkracht)
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
              {formatCurrency(Math.round(reeelEind))}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
              groei: {formatCurrency(Math.round(reeleGroei))}
            </p>
          </div>
        </div>

        {/* ── Verschil summary ──────────────────────────────── */}
        <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Erosie door inflatie
            </p>
            <p className="font-mono text-sm tabular-nums text-[var(--negative)]">
              −{formatCurrency(Math.round(erosie))}
            </p>
          </div>

          {/* ── Progress bar for erosion share ────────────── */}
          <div className="mt-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-[var(--negative)]/60 transition-all duration-500"
                style={{ width: `${Math.min(erosiePercentage, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-4)]">
              {erosiePercentage.toFixed(1)}% van je vermogensgroei gaat verloren aan inflatie
            </p>
          </div>
        </div>

        {/* ── Editorial insight ─────────────────────────────── */}
        <p className="text-[11px] italic leading-relaxed text-[var(--ink-4)]">
          Inflatie vreet {erosiePercentage.toFixed(0)}% van je vermogensgroei —
          {' '}
          {erosiePercentage > 30
            ? 'overweeg assets die boven inflatie groeien'
            : 'je rendement compenseert dit grotendeels'}
          .
        </p>
      </div>
    </AnalysisSection>
  )
})
