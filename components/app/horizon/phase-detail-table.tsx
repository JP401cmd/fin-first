'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { FinTable } from '@/components/app/fin-table'
import { formatCurrency } from '@/lib/format'
import type { UnifiedProjectionRow, AssetBucketDetail } from '@/lib/unified-projection'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'

// ── Types ───────────────────────────────────────────────────────────────────

export type PhaseType = 'accumulation' | 'transition' | 'withdrawal'

export interface PhaseDetailTableProps {
  /** Rijen voor deze fase (gefilterd op phase) */
  rows: UnifiedProjectionRow[]
  /** Welke fase wordt getoond */
  phase: PhaseType
  /** Inflatie-percentage (bijv. 0.02 voor 2%) */
  inflationRate: number
  /** Toon per-asset-type uitsplitsing kolommen */
  showAssetDetail?: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cx(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

/** Deflate a nominal value to real terms */
function deflate(value: number, factor: number, showReal: boolean): number {
  return showReal ? value / factor : value
}

/** Format currency with optional color class for positive/negative */
function colorClass(value: number): string | undefined {
  if (value < -0.5) return 'text-[var(--negative)]'
  if (value > 0.5) return 'text-[var(--positive)]'
  return undefined
}

/** Short asset type labels for table headers */
const SHORT_ASSET_LABELS: Partial<Record<AssetType, string>> = {
  cash: 'Cash',
  savings: 'Spaar',
  investment: 'Beleg.',
  retirement: 'Pens.',
  eigen_huis: 'Woning',
  real_estate: 'Vastgoed',
  crypto: 'Crypto',
  vehicle: 'Voertuig',
  physical: 'Fysiek',
  deelneming: 'Deeln.',
  levensverzekering: 'Levensverz.',
  vordering: 'Vordering',
  other: 'Overig',
}

// ── Component ───────────────────────────────────────────────────────────────

export function PhaseDetailTable({
  rows,
  phase,
  inflationRate,
  showAssetDetail = false,
}: PhaseDetailTableProps) {
  const [expanded, setExpanded] = useState(false)
  const [showReal, setShowReal] = useState(false)

  if (rows.length === 0) return null

  // Collect all asset types present across rows
  const assetTypes: AssetType[] = []
  if (showAssetDetail) {
    const typeSet = new Set<AssetType>()
    for (const row of rows) {
      for (const key of Object.keys(row.assetBuckets) as AssetType[]) {
        typeSet.add(key)
      }
    }
    // Stable sort order matching ASSET_TYPE_LABELS key order
    const allTypes: AssetType[] = [
      'cash', 'savings', 'investment', 'retirement', 'eigen_huis',
      'real_estate', 'crypto', 'vehicle', 'physical', 'deelneming',
      'levensverzekering', 'vordering', 'other',
    ]
    for (const t of allTypes) {
      if (typeSet.has(t)) assetTypes.push(t)
    }
  }

  const isAccumulation = phase === 'accumulation'

  // Phase label for the toggle button
  const phaseLabel =
    phase === 'accumulation' ? 'Opbouw' :
    phase === 'transition' ? 'Overgang' : 'Onttrekking'

  return (
    <div className="mt-4">
      {/* ── Collapse toggle + Nominaal/Reëel pill ──────────────── */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          aria-expanded={expanded}
          aria-controls={`phase-detail-${phase}`}
        >
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150" />
            : <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150" />
          }
          {expanded ? 'Verberg' : 'Toon'} {phaseLabel.toLowerCase()} per jaar
        </button>

        {expanded && (
          <button
            type="button"
            onClick={() => setShowReal(!showReal)}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
          >
            {showReal ? 'Reëel' : 'Nominaal'}
          </button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      {expanded && (
        <div id={`phase-detail-${phase}`} className="mt-2">
          <FinTable minWidth="520px">
            <FinTable.Header>
              <FinTable.Row dashed={false}>
                <FinTable.Th>Lft</FinTable.Th>
                <FinTable.Th align="right">Begin</FinTable.Th>

                {isAccumulation ? (
                  <>
                    {/* Opbouw columns: separate savings vs investment growth */}
                    {showAssetDetail ? (
                      assetTypes.map(t => (
                        <FinTable.Th key={t} align="right">
                          Rend. {SHORT_ASSET_LABELS[t] ?? ASSET_TYPE_LABELS[t]}
                        </FinTable.Th>
                      ))
                    ) : (
                      <>
                        <FinTable.Th align="right">Rend. spaar</FinTable.Th>
                        <FinTable.Th align="right">Rend. beleg.</FinTable.Th>
                      </>
                    )}
                    <FinTable.Th align="right">Inleg</FinTable.Th>
                  </>
                ) : (
                  <>
                    {/* Overgang/Onttrekking columns */}
                    <FinTable.Th align="right">Rendement</FinTable.Th>
                    <FinTable.Th align="right">Onttrekking</FinTable.Th>
                    <FinTable.Th align="right">AOW/Pensioen</FinTable.Th>
                  </>
                )}

                <FinTable.Th align="right">Events</FinTable.Th>
                <FinTable.Th align="right">Box 3</FinTable.Th>
                <FinTable.Th align="right">Eind</FinTable.Th>
              </FinTable.Row>
            </FinTable.Header>

            <FinTable.Body zebra>
              {rows.map((row) => {
                const f = row.inflationFactor
                const d = (v: number) => deflate(v, f, showReal)

                // Sum startValue from all buckets for "Begin" column
                let beginValue = 0
                let savingsGrowth = 0
                let investmentGrowth = 0
                for (const [type, bucket] of Object.entries(row.assetBuckets) as [AssetType, AssetBucketDetail][]) {
                  beginValue += bucket.startValue
                  if (type === 'savings' || type === 'cash') {
                    savingsGrowth += bucket.growth
                  } else {
                    investmentGrowth += bucket.growth
                  }
                }

                // AOW/Pensioen income: grossIncome in withdrawal/transition phase
                const aowPensioenIncome = row.phase !== 'accumulation' ? row.grossIncome : 0

                return (
                  <FinTable.Row key={row.year}>
                    <FinTable.Td>{row.age}</FinTable.Td>
                    <FinTable.Td numeric>{formatCurrency(d(beginValue))}</FinTable.Td>

                    {isAccumulation ? (
                      <>
                        {showAssetDetail ? (
                          assetTypes.map(t => {
                            const bucket = row.assetBuckets[t]
                            const growth = bucket?.growth ?? 0
                            return (
                              <FinTable.Td key={t} numeric color={colorClass(growth)}>
                                {formatCurrency(d(growth))}
                              </FinTable.Td>
                            )
                          })
                        ) : (
                          <>
                            <FinTable.Td numeric color={colorClass(savingsGrowth)}>
                              {formatCurrency(d(savingsGrowth))}
                            </FinTable.Td>
                            <FinTable.Td numeric color={colorClass(investmentGrowth)}>
                              {formatCurrency(d(investmentGrowth))}
                            </FinTable.Td>
                          </>
                        )}
                        <FinTable.Td numeric color={colorClass(row.savings)}>
                          {formatCurrency(d(row.savings))}
                        </FinTable.Td>
                      </>
                    ) : (
                      <>
                        <FinTable.Td numeric color={colorClass(row.totalGrowth)}>
                          {formatCurrency(d(row.totalGrowth))}
                        </FinTable.Td>
                        <FinTable.Td numeric color={row.withdrawal > 0.5 ? 'text-[var(--negative)]' : undefined}>
                          {row.withdrawal > 0 ? `−${formatCurrency(d(row.withdrawal)).replace('€', '€ ').trim()}` : formatCurrency(0)}
                        </FinTable.Td>
                        <FinTable.Td numeric color={aowPensioenIncome > 0.5 ? 'text-[var(--positive)]' : undefined}>
                          {formatCurrency(d(aowPensioenIncome))}
                        </FinTable.Td>
                      </>
                    )}

                    <FinTable.Td numeric color={colorClass(row.cashflowNet)}>
                      {formatCurrency(d(row.cashflowNet))}
                    </FinTable.Td>
                    <FinTable.Td numeric color={row.totalBox3 > 0.5 ? 'text-[var(--negative)]' : undefined}>
                      {row.totalBox3 > 0 ? `−${formatCurrency(d(row.totalBox3)).replace('€', '€ ').trim()}` : formatCurrency(0)}
                    </FinTable.Td>
                    <FinTable.Td numeric bold>
                      {formatCurrency(d(row.totalAssets))}
                    </FinTable.Td>
                  </FinTable.Row>
                )
              })}
            </FinTable.Body>

            {/* Footer: totals row */}
            {rows.length > 1 && (
              <FinTable.Footer>
                <FinTable.Row total>
                  <FinTable.Td bold>Σ</FinTable.Td>
                  <FinTable.Td numeric>{formatCurrency(deflate(
                    Object.values(rows[0].assetBuckets).reduce((sum, b) => sum + (b?.startValue ?? 0), 0),
                    rows[0].inflationFactor, showReal
                  ))}</FinTable.Td>

                  {isAccumulation ? (
                    <>
                      {showAssetDetail ? (
                        assetTypes.map(t => {
                          const total = rows.reduce((sum, r) => sum + (r.assetBuckets[t]?.growth ?? 0), 0)
                          const avgFactor = rows[rows.length - 1].inflationFactor
                          return (
                            <FinTable.Td key={t} numeric bold color={colorClass(total)}>
                              {formatCurrency(deflate(total, showReal ? avgFactor : 1, showReal))}
                            </FinTable.Td>
                          )
                        })
                      ) : (
                        <>
                          {(() => {
                            let totalSavingsGrowth = 0
                            let totalInvestmentGrowth = 0
                            for (const r of rows) {
                              for (const [type, bucket] of Object.entries(r.assetBuckets) as [AssetType, AssetBucketDetail][]) {
                                if (type === 'savings' || type === 'cash') {
                                  totalSavingsGrowth += bucket.growth
                                } else {
                                  totalInvestmentGrowth += bucket.growth
                                }
                              }
                            }
                            const avgFactor = rows[rows.length - 1].inflationFactor
                            return (
                              <>
                                <FinTable.Td numeric bold color={colorClass(totalSavingsGrowth)}>
                                  {formatCurrency(deflate(totalSavingsGrowth, showReal ? avgFactor : 1, showReal))}
                                </FinTable.Td>
                                <FinTable.Td numeric bold color={colorClass(totalInvestmentGrowth)}>
                                  {formatCurrency(deflate(totalInvestmentGrowth, showReal ? avgFactor : 1, showReal))}
                                </FinTable.Td>
                              </>
                            )
                          })()}
                        </>
                      )}
                      {(() => {
                        const totalSavings = rows.reduce((sum, r) => sum + r.savings, 0)
                        const avgFactor = rows[rows.length - 1].inflationFactor
                        return (
                          <FinTable.Td numeric bold color={colorClass(totalSavings)}>
                            {formatCurrency(deflate(totalSavings, showReal ? avgFactor : 1, showReal))}
                          </FinTable.Td>
                        )
                      })()}
                    </>
                  ) : (
                    <>
                      {(() => {
                        const totalGrowth = rows.reduce((sum, r) => sum + r.totalGrowth, 0)
                        const totalWithdrawal = rows.reduce((sum, r) => sum + r.withdrawal, 0)
                        const totalAow = rows.reduce((sum, r) => sum + (r.phase !== 'accumulation' ? r.grossIncome : 0), 0)
                        const avgFactor = rows[rows.length - 1].inflationFactor
                        return (
                          <>
                            <FinTable.Td numeric bold color={colorClass(totalGrowth)}>
                              {formatCurrency(deflate(totalGrowth, showReal ? avgFactor : 1, showReal))}
                            </FinTable.Td>
                            <FinTable.Td numeric bold color={totalWithdrawal > 0.5 ? 'text-[var(--negative)]' : undefined}>
                              {totalWithdrawal > 0 ? `−${formatCurrency(deflate(totalWithdrawal, showReal ? avgFactor : 1, showReal)).replace('€', '€ ').trim()}` : formatCurrency(0)}
                            </FinTable.Td>
                            <FinTable.Td numeric bold color={totalAow > 0.5 ? 'text-[var(--positive)]' : undefined}>
                              {formatCurrency(deflate(totalAow, showReal ? avgFactor : 1, showReal))}
                            </FinTable.Td>
                          </>
                        )
                      })()}
                    </>
                  )}

                  {(() => {
                    const totalEvents = rows.reduce((sum, r) => sum + r.cashflowNet, 0)
                    const totalBox3 = rows.reduce((sum, r) => sum + r.totalBox3, 0)
                    const avgFactor = rows[rows.length - 1].inflationFactor
                    const endAssets = rows[rows.length - 1].totalAssets
                    return (
                      <>
                        <FinTable.Td numeric bold color={colorClass(totalEvents)}>
                          {formatCurrency(deflate(totalEvents, showReal ? avgFactor : 1, showReal))}
                        </FinTable.Td>
                        <FinTable.Td numeric bold color={totalBox3 > 0.5 ? 'text-[var(--negative)]' : undefined}>
                          {totalBox3 > 0 ? `−${formatCurrency(deflate(totalBox3, showReal ? avgFactor : 1, showReal)).replace('€', '€ ').trim()}` : formatCurrency(0)}
                        </FinTable.Td>
                        <FinTable.Td numeric bold>
                          {formatCurrency(deflate(endAssets, rows[rows.length - 1].inflationFactor, showReal))}
                        </FinTable.Td>
                      </>
                    )
                  })()}
                </FinTable.Row>
              </FinTable.Footer>
            )}
          </FinTable>

          {showReal && (
            <p className="mt-1.5 text-[10px] text-[var(--ink-4)]">
              Bedragen gecorrigeerd voor inflatie ({(inflationRate * 100).toFixed(1)}% per jaar)
            </p>
          )}
        </div>
      )}
    </div>
  )
}
