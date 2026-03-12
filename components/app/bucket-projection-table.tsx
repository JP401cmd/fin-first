'use client'

import { useState } from 'react'
import type { BucketProjectionResult, BucketSummary, DebtSummary, CostSummary } from '@/lib/bucket-projection'
import { ASSET_TYPE_COLORS } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS } from '@/lib/debt-data'
import { REPAYMENT_TYPE_LABELS } from '@/lib/debt-data'
import { formatCurrency, formatFreedomTimeString, calculateFreedomTime } from '@/lib/format'
import { ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react'

/**
 * Per-bucket projection table with expandable asset details, debt summaries,
 * assumptions panel, and optional yearly breakdown.
 */
export function BucketProjectionTable({
  projection,
  dailyExpenses,
  assumptions,
}: {
  projection: BucketProjectionResult
  dailyExpenses?: number
  assumptions?: {
    inflationRate: number
    box3Method: 'forfaitair' | 'werkelijk'
    incomeGrowthRate: number
    months: number
    hasPartner: boolean
    savingsRate6m?: number  // kern spaarquote (%)
    estimatedYearlyIncome?: number  // kern geschat jaarinkomen
  }
}) {
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set())
  const [showReal, setShowReal] = useState(false)
  const [showYearly, setShowYearly] = useState(false)

  const { bucketSummaries, debtSummaries, costSummaries, currentNetWorth, rows } = projection

  const totalMonths = rows[rows.length - 1]?.month ?? 60
  const isLongHorizon = totalMonths > 60
  const horizonYears = Math.round(totalMonths / 12)
  const endColLabel = isLongHorizon ? `${horizonYears} jaar` : '5 jaar'

  // Inflation factors for deflation
  const factor1y = rows.find(r => r.month === 12)?.inflationFactor ?? 1
  const factor5y = rows.find(r => r.month === 60)?.inflationFactor ?? 1
  const factorEnd = rows[rows.length - 1]?.inflationFactor ?? 1

  // Deflation helper
  const deflate = (v: number, factor: number) => showReal ? v / factor : v

  const toggleBucket = (type: string) => {
    setExpandedBuckets(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const totalAssets1y = bucketSummaries.reduce((s, b) => s + b.projected1y, 0)
  const totalAssetsEnd = bucketSummaries.reduce((s, b) => s + b.projectedEnd, 0)
  const totalCurrentAssets = bucketSummaries.reduce((s, b) => s + b.currentValue, 0)
  const totalCurrentDebts = debtSummaries.reduce((s, b) => s + b.currentBalance, 0)
  const totalDebts1y = debtSummaries.reduce((s, b) => s + b.projected1y, 0)
  const totalDebtsEnd = debtSummaries.reduce((s, b) => s + b.projectedEnd, 0)

  // End milestone for formula section
  const endSnapshot = isLongHorizon
    ? (projection.year20 ?? projection.year10 ?? projection.year5)
    : projection.year5

  // Yearly rows for breakdown
  const yearlyRows = rows.filter(r => r.month > 0 && r.month % 12 === 0)

  return (
    <div className="mt-6" data-testid="bucket-projection-table">
      {/* Assumptions panel */}
      {assumptions && (() => {
        const cf = projection.cashFlowSummary
        const kernSpaarquote = assumptions.savingsRate6m
        const heffingsvrij = assumptions.hasPartner ? 115_368 : 57_684

        return (
          <div className="mb-5 rounded-[var(--r-lg)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Aannames
            </h4>

            {/* Kasstroom */}
            {cf.monthlyIncome > 0 && (
              <div className="mb-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Kasstroom</span>
                <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
                  <AssumptionRow
                    label="Jaarinkomen"
                    value={formatCurrency(assumptions.estimatedYearlyIncome ?? cf.monthlyIncome * 12)}
                    source="Kern (geschat)"
                  />
                  <AssumptionRow label="Vaste lasten" value={`${formatCurrency(cf.impliedLivingExpenses)}/mo`} source="Transacties" />
                  {cf.totalAssetContributions > 0 && (
                    <AssumptionRow label="Inleg bezittingen" value={`${formatCurrency(cf.totalAssetContributions)}/mo`} source="Bezittingen" />
                  )}
                  {cf.totalDebtPayments > 0 && (
                    <AssumptionRow label="Aflossing" value={`${formatCurrency(cf.totalDebtPayments)}/mo`} source="Schulden" />
                  )}
                  <AssumptionRow
                    label="Surplus"
                    value={`${formatCurrency(cf.monthlySurplus)}/mo`}
                    source="Berekend"
                    highlight={cf.monthlySurplus < 0}
                  />
                  {kernSpaarquote != null && (
                    <AssumptionRow label="Spaarquote" value={`${kernSpaarquote.toFixed(1)}%`} source="Kern (6 mnd)" />
                  )}
                </div>
              </div>
            )}

            {/* Groeivoeten & fiscaal */}
            <div className={cf.monthlyIncome > 0 ? 'border-t border-dashed border-[var(--border-ed)] pt-2' : ''}>
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Groeivoeten &amp; fiscaal</span>
              <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
                <AssumptionRow label="Inflatie" value={`${(assumptions.inflationRate * 100).toFixed(1)}%/jr`} source="Instellingen" />
                <AssumptionRow
                  label="Inkomensgroei"
                  value={`${(assumptions.incomeGrowthRate * 100).toFixed(1)}%/jr`}
                  source={assumptions.incomeGrowthRate === assumptions.inflationRate ? 'Standaard (= inflatie)' : 'Instellingen'}
                />
                <AssumptionRow
                  label="Box 3 methode"
                  value={assumptions.box3Method === 'forfaitair' ? 'Forfaitair' : 'Werkelijk'}
                  source="Instellingen"
                />
                <AssumptionRow
                  label="Heffingsvrij"
                  value={formatCurrency(heffingsvrij)}
                  source={assumptions.hasPartner ? 'Profiel (fiscaal partner)' : 'Profiel (alleenstaand)'}
                />
                <AssumptionRow label="Horizon" value={`${horizonYears} jaar`} source="Vast" />
              </div>
            </div>

            {/* Per asset-type */}
            {bucketSummaries.length > 0 && (
              <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Per asset-type</span>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                  {bucketSummaries.map(b => (
                    <span key={b.assetType} className="text-[var(--ink-3)]">
                      <span className="inline-block h-1.5 w-1.5 rounded-full mr-1" style={{ backgroundColor: b.color }} />
                      {b.label}{' '}
                      <span className="font-mono tabular-nums">{(b.weightedReturn * 100).toFixed(1)}%</span>
                      {b.box3DragPct > 0 && (
                        <span className="text-[var(--ink-4)]"> · −{b.box3DragPct.toFixed(2)}% Box 3</span>
                      )}
                      <span className="text-[var(--ink-4)]"> · bron: Bezittingen</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Assets section */}
      {bucketSummaries.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Bezittingen
            </h4>
            <button
              type="button"
              onClick={() => setShowReal(!showReal)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
            >
              {showReal ? 'Reëel' : 'Nominaal'}
            </button>
          </div>
          {showReal && (
            <p className="mb-2 text-[10px] italic text-[var(--ink-4)]">Bedragen in euro&apos;s van vandaag</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dashed border-[var(--border-ed)]">
                  <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Type</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Huidig</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Rendement</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Box 3</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">1 jaar</th>
                  <th className="py-2 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{endColLabel}</th>
                </tr>
              </thead>
              <tbody>
                {bucketSummaries.map(bucket => (
                  <BucketRow
                    key={bucket.assetType}
                    bucket={bucket}
                    expanded={expandedBuckets.has(bucket.assetType)}
                    onToggle={() => toggleBucket(bucket.assetType)}
                    showReal={showReal}
                    factor1y={factor1y}
                    factorEnd={factorEnd}
                    isLongHorizon={isLongHorizon}
                  />
                ))}
                {/* Total assets row */}
                <tr className="border-t border-[var(--border-md)] font-semibold">
                  <td className="py-2 pr-3 text-[var(--ink)]">Totaal bezittingen</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink)]">{formatCurrency(totalCurrentAssets)}</td>
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink)]">{formatCurrency(deflate(totalAssets1y, factor1y))}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums text-[var(--ink)]">{formatCurrency(deflate(totalAssetsEnd, factorEnd))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Debts section */}
      {debtSummaries.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Schulden
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dashed border-[var(--border-ed)]">
                  <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Schuld</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Saldo</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Rente</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Maand</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">1 jaar</th>
                  <th className="py-2 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{endColLabel}</th>
                </tr>
              </thead>
              <tbody>
                {debtSummaries.map(debt => (
                  <DebtRow key={debt.id} debt={debt} showReal={showReal} factor1y={factor1y} factorEnd={factorEnd} isLongHorizon={isLongHorizon} />
                ))}
                {/* Total debts row */}
                <tr className="border-t border-[var(--border-md)] font-semibold">
                  <td className="py-2 pr-3 text-[var(--ink)]">Totaal schulden</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-red-600">{formatCurrency(totalCurrentDebts)}</td>
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-red-600">{formatCurrency(deflate(totalDebts1y, factor1y))}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums text-red-600">{formatCurrency(deflate(totalDebtsEnd, factorEnd))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Costs section */}
      {costSummaries.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Kosten
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dashed border-[var(--border-ed)]">
                  <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Kostenpost</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Per jaar</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" colSpan={2} />
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Cumulatief 1j</th>
                  <th className="py-2 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Cumulatief {endColLabel}</th>
                </tr>
              </thead>
              <tbody>
                {costSummaries.map(cost => {
                  const cumulEnd = isLongHorizon
                    ? (rows[rows.length - 1]?.cumulativeBox3Tax ?? cost.cumulative5y)
                    : cost.cumulative5y
                  return (
                    <tr key={cost.id} className="border-b border-dashed border-[var(--border-ed)]">
                      <td className="py-2 pr-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-[var(--ink)]">{cost.label}</span>
                          <span className="text-[10px] text-[var(--ink-4)]">{cost.description}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-orange-600">
                        {formatCurrency(cost.current)}/jr
                      </td>
                      <td className="py-2 px-3" colSpan={2} />
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-orange-600">
                        {formatCurrency(deflate(cost.cumulative1y, factor1y))}
                      </td>
                      <td className="py-2 pl-3 text-right font-mono tabular-nums text-orange-600">
                        {formatCurrency(deflate(cumulEnd, factorEnd))}
                      </td>
                    </tr>
                  )
                })}
                {/* Total costs row */}
                <tr className="border-t border-[var(--border-md)] font-semibold">
                  <td className="py-2 pr-3 text-[var(--ink)]">Totaal kosten ({endColLabel})</td>
                  <td className="py-2 px-3" />
                  <td className="py-2 px-3" colSpan={2} />
                  <td className="py-2 px-3" />
                  <td className="py-2 pl-3 text-right font-mono tabular-nums text-orange-600">
                    {formatCurrency(deflate(
                      isLongHorizon
                        ? (rows[rows.length - 1]?.cumulativeBox3Tax ?? costSummaries.reduce((s, c) => s + c.cumulative5y, 0))
                        : costSummaries.reduce((s, c) => s + c.cumulative5y, 0),
                      factorEnd
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cash flow summary */}
      {projection.cashFlowSummary.monthlyIncome > 0 && (
        <div className="mb-6">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Kasstroom
          </h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--ink-2)]">Inkomen</span>
              <span className="font-mono tabular-nums text-[var(--ink)]">
                {formatCurrency(projection.cashFlowSummary.monthlyIncome)}/mo
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ink-2)]">{'\u2212'} Vaste lasten</span>
              <span className="font-mono tabular-nums text-[var(--ink-2)]">
                {formatCurrency(projection.cashFlowSummary.impliedLivingExpenses)}/mo
              </span>
            </div>
            {projection.cashFlowSummary.totalDebtPayments > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-2)]">{'\u2212'} Aflossing schulden</span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(projection.cashFlowSummary.totalDebtPayments)}/mo
                </span>
              </div>
            )}
            {projection.cashFlowSummary.totalAssetContributions > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-2)]">{'\u2212'} Inleg bezittingen</span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(projection.cashFlowSummary.totalAssetContributions)}/mo
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-1.5 font-semibold">
              <span className="text-[var(--ink)]">= Resterend surplus</span>
              <span className={`font-mono tabular-nums ${projection.cashFlowSummary.monthlySurplus >= 0 ? 'text-[var(--ink)]' : 'text-red-500'}`}>
                {formatCurrency(projection.cashFlowSummary.monthlySurplus)}/mo
              </span>
            </div>
            {projection.cashFlowSummary.isOvercommitted && (
              <div className="mt-2 flex items-start gap-2 rounded-[var(--r-md)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Inleg + aflossing is {formatCurrency(projection.cashFlowSummary.overcommitAmount)}/mo meer dan je inkomen.
                  Controleer of je geplande bijdragen realistisch zijn.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Net worth total — formula */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
        {/* Formula breakdown */}
        <div className="mb-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-2)]">Bezittingen ({endColLabel})</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">{formatCurrency(deflate(endSnapshot.totalAssets, endSnapshot.inflationFactor))}</span>
          </div>
          {totalCurrentDebts > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--ink-2)]">− Schulden ({endColLabel})</span>
              <span className="font-mono tabular-nums text-red-600">− {formatCurrency(deflate(endSnapshot.totalDebts, endSnapshot.inflationFactor))}</span>
            </div>
          )}
          {endSnapshot.totalCosts > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--ink-2)]">− Kosten (cumulatief {endColLabel})</span>
              <span className="font-mono tabular-nums text-orange-600">− {formatCurrency(deflate(endSnapshot.totalCosts, endSnapshot.inflationFactor))}</span>
            </div>
          )}
          <div className="border-t border-[var(--border-md)] pt-1.5 flex items-center justify-between font-semibold">
            <span className="text-[var(--ink)]">= Netto vermogen</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">{formatCurrency(deflate(endSnapshot.netWorth, endSnapshot.inflationFactor))}</span>
          </div>
        </div>

        {/* Milestone columns */}
        <div className="flex flex-wrap items-center gap-4 text-sm border-t border-dashed border-[var(--border-ed)] pt-3">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Nu</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(currentNetWorth)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">1 jaar</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(deflate(projection.year1.netWorth, projection.year1.inflationFactor))}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">3 jaar</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(deflate(projection.year3.netWorth, projection.year3.inflationFactor))}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">5 jaar</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(deflate(projection.year5.netWorth, projection.year5.inflationFactor))}</div>
          </div>
          {projection.year10 && (
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">10 jaar</div>
              <div className="font-mono font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(deflate(projection.year10.netWorth, projection.year10.inflationFactor))}</div>
            </div>
          )}
          {projection.year20 && (
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">20 jaar</div>
              <div className="font-mono font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(deflate(projection.year20.netWorth, projection.year20.inflationFactor))}</div>
            </div>
          )}
          {dailyExpenses && dailyExpenses > 0 && (
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Vrijheid ({endColLabel})</div>
              <div className="font-semibold text-kern-600">{formatFreedomTimeString(calculateFreedomTime(deflate(endSnapshot.netWorth, endSnapshot.inflationFactor), dailyExpenses), 'short')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Yearly breakdown (collapsible) */}
      {yearlyRows.length > 1 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowYearly(!showYearly)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          >
            {showYearly ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showYearly ? 'Verberg' : 'Toon'} jaarlijkse uitsplitsing
          </button>

          {showYearly && (() => {
            const cf = projection.cashFlowSummary
            const baseSurplus = cf.monthlySurplus
            const growthRate = cf.incomeGrowthRate
            const baseContributions = cf.totalAssetContributions
            const baseDebtPayments = cf.totalDebtPayments
            const kernSpaarquote = assumptions?.savingsRate6m ?? null
            const baseYearlyIncome = assumptions?.estimatedYearlyIncome ?? cf.monthlyIncome * 12

            return (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-dashed border-[var(--border-ed)]">
                      <th className="py-1.5 pr-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Jaar</th>
                      <th className="py-1.5 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Inkomen</th>
                      <th className="py-1.5 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Inleg</th>
                      <th className="py-1.5 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Spaarquote</th>
                      <th className="py-1.5 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Netto verm.</th>
                      <th className="py-1.5 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Box 3</th>
                      <th className="py-1.5 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Groei NV</th>
                      <th className="py-1.5 pl-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Inflatie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyRows.map((row, idx) => {
                      const prevNw = idx > 0 ? yearlyRows[idx - 1].netWorth : currentNetWorth
                      const growth = row.netWorth - prevNw
                      const year = new Date().getFullYear() + row.month / 12
                      const f = showReal ? row.inflationFactor : 1
                      const yearIndex = row.month / 12 - 1
                      const gf = Math.pow(1 + growthRate, yearIndex)
                      // Yearly income from kern estimate, growing with incomeGrowthRate
                      const yearlyIncome = baseYearlyIncome * gf
                      // Yearly inleg: kern-derived (spaarquote × inkomen) with bottom-up fallback
                      const yearlyInleg = kernSpaarquote != null && baseYearlyIncome > 0
                        ? (kernSpaarquote / 100) * baseYearlyIncome * gf
                        : (baseSurplus * 12 * gf) + baseContributions * 12 + baseDebtPayments * 12
                      return (
                        <tr key={row.month} className="border-b border-dotted border-[var(--border-ed)]">
                          <td className="py-1.5 pr-2 font-mono tabular-nums text-[var(--ink-2)]">{year}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-[var(--ink)]">{formatCurrency(yearlyIncome / f)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-kern-600">{formatCurrency(yearlyInleg / f)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-kern-600">
                            {kernSpaarquote != null ? `${kernSpaarquote.toFixed(1)}%` : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-[var(--ink)]">{formatCurrency(row.netWorth / f)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-orange-600">{formatCurrency(row.cumulativeBox3Tax / f)}</td>
                          <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {idx === 0 ? '—' : `${growth >= 0 ? '+' : ''}${formatCurrency(growth / f)}`}
                          </td>
                          <td className="py-1.5 pl-2 text-right font-mono tabular-nums text-[var(--ink-3)]">{row.inflationFactor.toFixed(3)}×</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function BucketRow({
  bucket,
  expanded,
  onToggle,
  showReal,
  factor1y,
  factorEnd,
  isLongHorizon,
}: {
  bucket: BucketSummary
  expanded: boolean
  onToggle: () => void
  showReal: boolean
  factor1y: number
  factorEnd: number
  isLongHorizon: boolean
}) {
  const hasMultiple = bucket.assetCount > 1
  const deflate = (v: number, f: number) => showReal ? v / f : v
  const endValue = isLongHorizon ? bucket.projectedEnd : bucket.projected5y
  const endFactor = isLongHorizon ? factorEnd : factorEnd

  return (
    <>
      <tr
        className={`border-b border-dashed border-[var(--border-ed)] ${hasMultiple ? 'cursor-pointer hover:bg-[var(--subtle)]/50' : ''}`}
        onClick={hasMultiple ? onToggle : undefined}
      >
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2">
            {hasMultiple ? (
              expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)]" />
            ) : (
              <span className="inline-block h-3.5 w-3.5" />
            )}
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: bucket.color }}
            />
            <span className="font-medium text-[var(--ink)]">{bucket.label}</span>
            {bucket.assetCount > 1 && (
              <span className="text-[10px] text-[var(--ink-4)]">({bucket.assetCount})</span>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(bucket.currentValue)}
        </td>
        <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink-2)]">
          {(bucket.weightedReturn * 100).toFixed(1)}%
        </td>
        <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink-3)]">
          {bucket.box3DragPct > 0 ? `${bucket.box3DragPct.toFixed(2)}%` : '—'}
        </td>
        <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(deflate(bucket.projected1y, factor1y))}
        </td>
        <td className="py-2 pl-3 text-right font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(deflate(endValue, endFactor))}
        </td>
      </tr>

      {/* Expanded individual assets */}
      {expanded && bucket.assets.map(asset => (
        <tr key={asset.id} className="border-b border-dotted border-[var(--border-ed)] bg-[var(--subtle)]/30">
          <td className="py-1.5 pr-3 pl-10">
            <span className="text-xs text-[var(--ink-2)]">{asset.name}</span>
          </td>
          <td className="py-1.5 px-3 text-right font-mono text-xs tabular-nums text-[var(--ink-2)]">
            {formatCurrency(asset.currentValue)}
          </td>
          <td className="py-1.5 px-3 text-right font-mono text-xs tabular-nums text-[var(--ink-3)]">
            {asset.expectedReturn.toFixed(1)}%
          </td>
          <td className="py-1.5 px-3" />
          <td className="py-1.5 px-3 text-right font-mono text-xs tabular-nums text-[var(--ink-2)]">
            {formatCurrency(deflate(asset.projected1y, factor1y))}
          </td>
          <td className="py-1.5 pl-3 text-right font-mono text-xs tabular-nums text-[var(--ink-2)]">
            {formatCurrency(deflate(asset.projected5y, factorEnd))}
          </td>
        </tr>
      ))}
    </>
  )
}

function DebtRow({ debt, showReal, factor1y, factorEnd, isLongHorizon }: {
  debt: DebtSummary
  showReal: boolean
  factor1y: number
  factorEnd: number
  isLongHorizon: boolean
}) {
  const deflate = (v: number, f: number) => showReal ? v / f : v
  const endValue = isLongHorizon ? debt.projectedEnd : debt.projected5y

  return (
    <tr className="border-b border-dashed border-[var(--border-ed)]">
      <td className="py-2 pr-3">
        <div className="flex flex-col">
          <span className="font-medium text-[var(--ink)]">{debt.name}</span>
          <span className="text-[10px] text-[var(--ink-4)]">
            {DEBT_TYPE_LABELS[debt.debtType]}
            {debt.repaymentType && ` · ${REPAYMENT_TYPE_LABELS[debt.repaymentType]}`}
            {debt.payoffMonth && ` · afgelost in ${Math.ceil(debt.payoffMonth / 12)}j`}
          </span>
        </div>
      </td>
      <td className="py-2 px-3 text-right font-mono tabular-nums text-red-600">
        {formatCurrency(debt.currentBalance)}
      </td>
      <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink-2)]">
        {debt.interestRate.toFixed(1)}%
      </td>
      <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--ink-2)]">
        {formatCurrency(debt.monthlyPayment)}
      </td>
      <td className="py-2 px-3 text-right font-mono tabular-nums text-red-600">
        {formatCurrency(deflate(debt.projected1y, factor1y))}
      </td>
      <td className="py-2 pl-3 text-right font-mono tabular-nums text-red-600">
        {formatCurrency(deflate(endValue, factorEnd))}
      </td>
    </tr>
  )
}

function AssumptionRow({ label, value, source, highlight }: {
  label: string
  value: string
  source: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--ink-3)]">{label}</span>
      <span className="text-right">
        <span className={`font-mono tabular-nums ${highlight ? 'text-red-500' : 'text-[var(--ink-2)]'}`}>{value}</span>
        <span className="ml-1.5 text-[10px] text-[var(--ink-4)]">{source}</span>
      </span>
    </div>
  )
}
