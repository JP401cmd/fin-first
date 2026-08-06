'use client'

import { useState, useMemo, Fragment } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { FinTable } from '@/components/app/fin-table'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { UnifiedProjectionRow, AssetBucketDetail } from '@/lib/unified-projection'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS } from '@/lib/debt-data'
import type { Debt } from '@/lib/debt-data'
import { resolveDebtLabel } from '@/lib/horizon/synthetic-debts'
import { MaskedAmount } from '@/components/app/masked-amount'

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
  /** Schulden metadata voor leesbare labels in expandable rows */
  debts?: Debt[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cx(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

// GRONDSLAG-NOTE — de rendement-kolom staat BEWUST op `row.totalGrowth` (TOTAAL),
// niet op het besteedbare `row.totalGrowthLiquide`. Deze tabel is een
// VERMOGENSbalans per jaar: de kolommen ernaast (bezittingen, schulden, netto
// vermogen) staan allemaal op de netWorth-grondslag (Prognose!I, incl. een
// niet-liquide eigen woning), en de kolomtotaal-rij sommeert in diezelfde
// grondslag. Het liquide rendement hoort in de vermogensSTROMEN-weergaven
// (IE-strip, Sankey, jaar-detailkassabon); hier zou het de rij niet meer laten
// sluiten. Zie `UnifiedProjectionRow.totalGrowthLiquide` in lib/unified-projection.ts.

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

// ── Debt label helpers ──────────────────────────────────────────────────────

/** Build a lookup map from debt.id → human-readable label */
function buildDebtLabelMap(debts?: Debt[]): Record<string, string> {
  if (!debts || debts.length === 0) return {}
  const map: Record<string, string> = {}
  for (const debt of debts) {
    if (debt.name) {
      map[debt.id] = debt.name
    } else if (debt.debt_type && DEBT_TYPE_LABELS[debt.debt_type]) {
      map[debt.id] = DEBT_TYPE_LABELS[debt.debt_type]
    } else {
      // Fallback to first 8 chars of UUID
      map[debt.id] = debt.id.slice(0, 8)
    }
  }
  return map
}

// ── Expandable Detail Panel ─────────────────────────────────────────────────

interface DetailPanelProps {
  row: UnifiedProjectionRow
  d: (v: number) => number
  debtLabelMap: Record<string, string>
  colSpan: number
}

function DetailPanel({ row, d, debtLabelMap, colSpan }: DetailPanelProps) {
  const { masked } = useMaskedAmounts()
  // Collect asset buckets with value > 0
  const activeBuckets = Object.entries(row.assetBuckets)
    .filter(([, b]) => b && (Math.abs(b.startValue) > 0.5 || Math.abs(b.endValue) > 0.5))
    .sort(([a], [b]) => {
      const order: AssetType[] = ['cash', 'savings', 'investment', 'retirement', 'eigen_huis', 'real_estate', 'crypto', 'vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'other']
      return order.indexOf(a as AssetType) - order.indexOf(b as AssetType)
    }) as [AssetType, AssetBucketDetail][]

  // Withdrawal by type (only during decumulation)
  const activeWithdrawals = Object.entries(row.withdrawalByType || {})
    .filter(([, v]) => v && v > 0.5) as [AssetType, number][]

  // Active debts
  const activeDebts = Object.entries(row.debtBalances || {})
    .filter(([, db]) => db && (Math.abs(db.startBalance) > 0.5 || Math.abs(db.endBalance) > 0.5))

  // Box 3 per asset type
  const activeBox3 = Object.entries(row.assetBuckets)
    .filter(([, b]) => b && b.box3Drag > 0.5) as [AssetType, AssetBucketDetail][]

  // Net worth summary
  const netWorth = row.netWorth

  const hasContent = activeBuckets.length > 0 || activeWithdrawals.length > 0 || activeDebts.length > 0 || activeBox3.length > 0

  if (!hasContent) return null

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div
          className="overflow-hidden transition-all duration-200 ease-out"
          style={{ maxHeight: '2000px' }}
        >
          <div className="mx-2 mb-3 mt-1 space-y-3 rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
            {/* ── Vermogensopbouw per assetgroep ──────────────────── */}
            {activeBuckets.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Vermogensopbouw
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-ed)]">
                        <th className="pb-1 text-left text-[10px] font-medium text-[var(--ink-4)]">Type</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Start</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Rendement</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Inleg</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Eind</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBuckets.map(([type, bucket]) => (
                        <tr key={type} className="border-b border-dashed border-[var(--border-ed)] last:border-0">
                          <td className="py-1 text-[var(--ink-2)]">
                            {SHORT_ASSET_LABELS[type] ?? ASSET_TYPE_LABELS[type]}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {<MaskedAmount value={d(bucket.startValue)} tone="horizon" />}
                          </td>
                          <td className={cx('py-1 text-right font-mono tabular-nums', colorClass(bucket.growth))}>
                            {<MaskedAmount value={d(bucket.growth)} tone="horizon" />}
                          </td>
                          <td className={cx('py-1 text-right font-mono tabular-nums', colorClass(bucket.contributions))}>
                            {<MaskedAmount value={d(bucket.contributions)} tone="horizon" />}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums font-medium text-[var(--ink)]">
                            {<MaskedAmount value={d(bucket.endValue)} tone="horizon" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Onttrekking per assetgroep ──────────────────────── */}
            {activeWithdrawals.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Onttrekking (waterfall)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-ed)]">
                        <th className="pb-1 text-left text-[10px] font-medium text-[var(--ink-4)]">Type</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Bedrag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeWithdrawals.map(([type, amount]) => (
                        <tr key={type} className="border-b border-dashed border-[var(--border-ed)] last:border-0">
                          <td className="py-1 text-[var(--ink-2)]">
                            {SHORT_ASSET_LABELS[type as AssetType] ?? ASSET_TYPE_LABELS[type as AssetType]}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-[var(--negative)]">
                            −{formatMaskedCurrency(d(amount), masked).replace('€', '€ ').trim()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Schulden per lening ─────────────────────────────── */}
            {activeDebts.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Schulden
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-ed)]">
                        <th className="pb-1 text-left text-[10px] font-medium text-[var(--ink-4)]">Lening</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Start</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Rente</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Aflossing</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Eind</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDebts.map(([debtId, db]) => (
                        <tr key={debtId} className="border-b border-dashed border-[var(--border-ed)] last:border-0">
                          <td className="py-1 text-[var(--ink-2)]">
                            {/* Gedeelde resolver: echte schuld → synthetische modelpot
                                (tekort-lening/opeethypotheek) → pas dán de UUID-afkapping.
                                Zonder die middelste stap las de gebruiker hier "opeethyp". */}
                            {resolveDebtLabel(debtId, debtLabelMap)}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {<MaskedAmount value={d(db.startBalance)} tone="horizon" />}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-[var(--negative)]">
                            −{formatMaskedCurrency(d(db.interestPaid), masked).replace('€', '€ ').trim()}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {<MaskedAmount value={d(db.principalPaid)} tone="horizon" />}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums font-medium text-[var(--ink)]">
                            {<MaskedAmount value={d(db.endBalance)} tone="horizon" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Box 3 per assetgroep ────────────────────────────── */}
            {activeBox3.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Box 3
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-ed)]">
                        <th className="pb-1 text-left text-[10px] font-medium text-[var(--ink-4)]">Type</th>
                        <th className="pb-1 text-right text-[10px] font-medium text-[var(--ink-4)]">Belasting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBox3.map(([type, bucket]) => (
                        <tr key={type} className="border-b border-dashed border-[var(--border-ed)] last:border-0">
                          <td className="py-1 text-[var(--ink-2)]">
                            {SHORT_ASSET_LABELS[type] ?? ASSET_TYPE_LABELS[type]}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-[var(--negative)]">
                            −{formatMaskedCurrency(d(bucket.box3Drag), masked).replace('€', '€ ').trim()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Netto vermogen samenvatting ─────────────────────── */}
            <div className="flex items-center justify-between border-t border-[var(--border-md)] pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Netto vermogen (assets − schulden)
              </span>
              <span className={cx('text-xs font-semibold font-mono tabular-nums', colorClass(netWorth))}>
                {<MaskedAmount value={d(netWorth)} tone="horizon" />}
              </span>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export function PhaseDetailTable({
  rows,
  phase,
  inflationRate,
  showAssetDetail = false,
  debts,
}: PhaseDetailTableProps) {
  const { masked } = useMaskedAmounts()
  const [expanded, setExpanded] = useState(false)
  const [showReal, setShowReal] = useState(false)
  const [expandedAge, setExpandedAge] = useState<number | null>(null)

  // Build debt label lookup map (memoized)
  const debtLabelMap = useMemo(() => buildDebtLabelMap(debts), [debts])

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

  // Count total columns for colSpan on detail row
  // Base: Lft + Begin + Events + Box3 + Eind = 5
  // + expand chevron column = 1
  let colCount = 6
  if (isAccumulation) {
    // + rendement columns + inleg
    colCount += showAssetDetail ? assetTypes.length + 1 : 3 // spaar + beleg + inleg
  } else {
    // + rendement + onttrekking + AOW/Pensioen
    colCount += 3
  }

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
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-0.5 sm:text-[10px]"
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
                {/* Expand chevron column */}
                <FinTable.Th style={{ width: '24px' }}>&nbsp;</FinTable.Th>
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
                const isRowExpanded = expandedAge === row.age

                // Aggregate growth by savings vs investment for rendement columns
                let savingsGrowth = 0
                let investmentGrowth = 0
                for (const [type, bucket] of Object.entries(row.assetBuckets) as [AssetType, AssetBucketDetail][]) {
                  if (type === 'savings' || type === 'cash') {
                    savingsGrowth += bucket.growth
                  } else {
                    investmentGrowth += bucket.growth
                  }
                }

                // AOW/Pensioen income: grossIncome in withdrawal/transition phase
                const aowPensioenIncome = row.phase !== 'accumulation' ? row.grossIncome : 0

                return (
                  <Fragment key={row.year}>
                    <FinTable.Row
                      className={cx(
                        'cursor-pointer select-none',
                        isRowExpanded ? 'bg-[var(--subtle)]/50' : undefined,
                      )}
                      onClick={() => setExpandedAge(isRowExpanded ? null : row.age)}
                    >
                      {/* Expand chevron */}
                      <FinTable.Td className="!px-0 !py-2" style={{ width: '24px' }}>
                        {isRowExpanded
                          ? <ChevronDown className="h-3 w-3 text-[var(--ink-3)] transition-transform duration-150" />
                          : <ChevronRight className="h-3 w-3 text-[var(--ink-4)] transition-transform duration-150" />
                        }
                      </FinTable.Td>
                      <FinTable.Td>{row.age}</FinTable.Td>
                      <FinTable.Td numeric>{<MaskedAmount value={d(row.startNetWorth)} tone="horizon" />}</FinTable.Td>

                      {isAccumulation ? (
                        <>
                          {showAssetDetail ? (
                            assetTypes.map(t => {
                              const bucket = row.assetBuckets[t]
                              const growth = bucket?.growth ?? 0
                              return (
                                <FinTable.Td key={t} numeric color={colorClass(growth)}>
                                  {<MaskedAmount value={d(growth)} tone="horizon" />}
                                </FinTable.Td>
                              )
                            })
                          ) : (
                            <>
                              <FinTable.Td numeric color={colorClass(savingsGrowth)}>
                                {<MaskedAmount value={d(savingsGrowth)} tone="horizon" />}
                              </FinTable.Td>
                              <FinTable.Td numeric color={colorClass(investmentGrowth)}>
                                {<MaskedAmount value={d(investmentGrowth)} tone="horizon" />}
                              </FinTable.Td>
                            </>
                          )}
                          <FinTable.Td numeric color={colorClass(row.savings)}>
                            {<MaskedAmount value={d(row.savings)} tone="horizon" />}
                          </FinTable.Td>
                        </>
                      ) : (
                        <>
                          {/* TOTAAL rendement (incl. niet-liquide woning) — bewust, zie
                              de GRONDSLAG-note bovenaan deze module. */}
                          <FinTable.Td numeric color={colorClass(row.totalGrowth)}>
                            {<MaskedAmount value={d(row.totalGrowth)} tone="horizon" />}
                          </FinTable.Td>
                          <FinTable.Td numeric color={row.withdrawal > 0.5 ? 'text-[var(--negative)]' : undefined}>
                            {row.withdrawal > 0 ? `−${formatMaskedCurrency(d(row.withdrawal), masked).replace('€', '€ ').trim()}` : formatMaskedCurrency(0, masked)}
                          </FinTable.Td>
                          <FinTable.Td numeric color={aowPensioenIncome > 0.5 ? 'text-[var(--positive)]' : undefined}>
                            {<MaskedAmount value={d(aowPensioenIncome)} tone="horizon" />}
                          </FinTable.Td>
                        </>
                      )}

                      <FinTable.Td numeric color={colorClass(row.cashflowNet + row.oneTimeNet)}>
                        {<MaskedAmount value={d(row.cashflowNet + row.oneTimeNet)} tone="horizon" />}
                      </FinTable.Td>
                      <FinTable.Td numeric color={row.totalBox3 > 0.5 ? 'text-[var(--negative)]' : undefined}>
                        {row.totalBox3 > 0 ? `−${formatMaskedCurrency(d(row.totalBox3), masked).replace('€', '€ ').trim()}` : formatMaskedCurrency(0, masked)}
                      </FinTable.Td>
                      <FinTable.Td numeric bold color={colorClass(row.netWorth)}>
                        {<MaskedAmount value={d(row.netWorth)} tone="horizon" />}
                      </FinTable.Td>
                    </FinTable.Row>

                    {/* Expandable detail panel */}
                    {isRowExpanded && (
                      <DetailPanel
                        row={row}
                        d={d}
                        debtLabelMap={debtLabelMap}
                        colSpan={colCount}
                      />
                    )}
                  </Fragment>
                )
              })}
            </FinTable.Body>

            {/* Footer: totals row */}
            {rows.length > 1 && (
              <FinTable.Footer>
                <FinTable.Row total>
                  {/* Empty cell for chevron column */}
                  <FinTable.Td>&nbsp;</FinTable.Td>
                  <FinTable.Td bold>Σ</FinTable.Td>
                  <FinTable.Td numeric>{<MaskedAmount value={deflate(
                    rows[0].startNetWorth,
                    rows[0].inflationFactor, showReal
                  )} tone="horizon" />}</FinTable.Td>

                  {isAccumulation ? (
                    <>
                      {showAssetDetail ? (
                        assetTypes.map(t => {
                          const total = rows.reduce((sum, r) => sum + (r.assetBuckets[t]?.growth ?? 0), 0)
                          const avgFactor = rows[rows.length - 1].inflationFactor
                          return (
                            <FinTable.Td key={t} numeric bold color={colorClass(total)}>
                              {<MaskedAmount value={deflate(total, showReal ? avgFactor : 1, showReal)} tone="horizon" />}
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
                                  {<MaskedAmount value={deflate(totalSavingsGrowth, showReal ? avgFactor : 1, showReal)} tone="horizon" />}
                                </FinTable.Td>
                                <FinTable.Td numeric bold color={colorClass(totalInvestmentGrowth)}>
                                  {<MaskedAmount value={deflate(totalInvestmentGrowth, showReal ? avgFactor : 1, showReal)} tone="horizon" />}
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
                            {<MaskedAmount value={deflate(totalSavings, showReal ? avgFactor : 1, showReal)} tone="horizon" />}
                          </FinTable.Td>
                        )
                      })()}
                    </>
                  ) : (
                    <>
                      {(() => {
                        // Kolomtotaal op dezelfde TOTAAL-grondslag als de rijen erboven
                        // (incl. niet-liquide woning) — zie de GRONDSLAG-note bovenaan.
                        const totalGrowth = rows.reduce((sum, r) => sum + r.totalGrowth, 0)
                        const totalWithdrawal = rows.reduce((sum, r) => sum + r.withdrawal, 0)
                        const totalAow = rows.reduce((sum, r) => sum + (r.phase !== 'accumulation' ? r.grossIncome : 0), 0)
                        const avgFactor = rows[rows.length - 1].inflationFactor
                        return (
                          <>
                            <FinTable.Td numeric bold color={colorClass(totalGrowth)}>
                              {<MaskedAmount value={deflate(totalGrowth, showReal ? avgFactor : 1, showReal)} tone="horizon" />}
                            </FinTable.Td>
                            <FinTable.Td numeric bold color={totalWithdrawal > 0.5 ? 'text-[var(--negative)]' : undefined}>
                              {totalWithdrawal > 0 ? `−${formatMaskedCurrency(deflate(totalWithdrawal, showReal ? avgFactor : 1, showReal), masked).replace('€', '€ ').trim()}` : formatMaskedCurrency(0, masked)}
                            </FinTable.Td>
                            <FinTable.Td numeric bold color={totalAow > 0.5 ? 'text-[var(--positive)]' : undefined}>
                              {<MaskedAmount value={deflate(totalAow, showReal ? avgFactor : 1, showReal)} tone="horizon" />}
                            </FinTable.Td>
                          </>
                        )
                      })()}
                    </>
                  )}

                  {(() => {
                    const totalEvents = rows.reduce((sum, r) => sum + r.cashflowNet + r.oneTimeNet, 0)
                    const totalBox3 = rows.reduce((sum, r) => sum + r.totalBox3, 0)
                    const avgFactor = rows[rows.length - 1].inflationFactor
                    const endNetWorth = rows[rows.length - 1].netWorth
                    return (
                      <>
                        <FinTable.Td numeric bold color={colorClass(totalEvents)}>
                          {<MaskedAmount value={deflate(totalEvents, showReal ? avgFactor : 1, showReal)} tone="horizon" />}
                        </FinTable.Td>
                        <FinTable.Td numeric bold color={totalBox3 > 0.5 ? 'text-[var(--negative)]' : undefined}>
                          {totalBox3 > 0 ? `−${formatMaskedCurrency(deflate(totalBox3, showReal ? avgFactor : 1, showReal), masked).replace('€', '€ ').trim()}` : formatMaskedCurrency(0, masked)}
                        </FinTable.Td>
                        <FinTable.Td numeric bold color={colorClass(endNetWorth)}>
                          {<MaskedAmount value={deflate(endNetWorth, rows[rows.length - 1].inflationFactor, showReal)} tone="horizon" />}
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
