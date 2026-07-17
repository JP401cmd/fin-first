'use client'

import Link from 'next/link'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { MaskedAmount } from '@/components/app/masked-amount'
import { findAlternatives, FUND_ALTERNATIVES_DISCLAIMER, berekenJaarlijkseBesparing, type FindAlternativesResult } from '@/lib/fund-alternatives'
import { terSeverity, LOW_TER_BENCHMARK, type FeeAnalysis, type TerSeverity } from '@/lib/fee-analysis'
import { AlertTriangle, ArrowRight, Info, TrendingDown } from 'lucide-react'
import { FinTable } from '@/components/app/fin-table'
import { FeeErosionChart } from '@/components/app/core/fee-erosion-chart'

interface Props {
  open: boolean
  onClose: () => void
  feeAnalysis: FeeAnalysis
  feeImpactMonths: number
  /** Gross annual return for erosion chart (decimal, e.g. 0.07) */
  grossReturn?: number
  /** Daily expense rate for freedom-time display */
  dailyExpenses?: number
}

const SEVERITY_TEXT: Record<TerSeverity, string> = {
  green: 'text-positive',
  orange: 'text-[var(--ink-2)]',
  red: 'text-negative',
}

export function FeeDetailModal({ open, onClose, feeAnalysis, feeImpactMonths, grossReturn, dailyExpenses }: Props) {
  const { weightedTER, totalAnnualFee, perHoldingBreakdown, totalPortfolioValue, holdingsWithTER, holdingsWithoutTER } = feeAnalysis
  const terPctStr = (weightedTER * 100).toFixed(2).replace('.', ',')
  const severity = terSeverity(weightedTER)

  // Separate holdings with and without TER
  const holdingsWithFees = perHoldingBreakdown.filter(h => h.ter > 0)
  const holdingsNoTer = perHoldingBreakdown.filter(h => h.ter === 0)

  // Find alternatives for each holding
  const alternativesMap = new Map<string, FindAlternativesResult[]>()
  for (const h of holdingsWithFees) {
    const results = findAlternatives({
      ticker: h.ticker ?? undefined,
      name: h.name,
    })
    if (results.length > 0) {
      alternativesMap.set(h.name, results)
    }
  }

  // FIRE impact string
  const feeImpactYears = Math.floor(Math.abs(feeImpactMonths) / 12)
  const feeImpactRemainingMonths = Math.abs(feeImpactMonths) % 12
  const fireImpactParts: string[] = []
  if (feeImpactYears > 0) fireImpactParts.push(`${feeImpactYears} jaar`)
  if (feeImpactRemainingMonths > 0) fireImpactParts.push(`${feeImpactRemainingMonths} maand${feeImpactRemainingMonths > 1 ? 'en' : ''}`)
  const fireImpactStr = fireImpactParts.length > 0 ? fireImpactParts.join(' en ') : null

  return (
    <BottomSheet open={open} onClose={onClose} title="Kostenanalyse" size="lg">
      <div className="space-y-6 pb-8">
        {/* ── Summary header ── */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${severity === 'green' ? 'bg-positive' : severity === 'orange' ? 'bg-[var(--ink-3)]' : 'bg-negative'}`} />
            <span className={`text-lg font-semibold ${SEVERITY_TEXT[severity]}`}>
              {terPctStr}% gewogen TER
            </span>
          </div>
          <p className="text-sm text-[var(--ink-3)]">
            Totale jaarlijkse fondskosten: <span className="text-[var(--ink)]">
              <MaskedAmount value={totalAnnualFee} tone="kern" className="font-semibold" />
            </span>
          </p>
          <p className="text-sm text-[var(--ink-3)]">
            Portfoliowaarde: <span className="text-[var(--ink)]">
              <MaskedAmount value={totalPortfolioValue} tone="kern" />
            </span>
          </p>
          {fireImpactStr && feeImpactMonths > 0 && (
            <p className="text-sm text-[var(--ink-2)] italic mt-1">
              Je fondsbeheer kost je {fireImpactStr} vrijheid.
            </p>
          )}
        </div>

        {/* ── Fee Erosion Chart ── */}
        {weightedTER > 0 && totalPortfolioValue > 0 && grossReturn && grossReturn > 0 && (
          <FeeErosionChart
            portfolioValue={totalPortfolioValue}
            grossReturn={grossReturn}
            currentTER={weightedTER}
            lowTER={LOW_TER_BENCHMARK}
            years={30}
            dailyExpenses={dailyExpenses}
          />
        )}

        {/* ── Per-holding breakdown table ── */}
        <div>
          <h3 className="text-xs uppercase tracking-wider font-medium text-[var(--ink-3)] mb-2">
            Per-holding breakdown
          </h3>
          <div className="-mx-4 px-4">
            <FinTable minWidth="480px">
              <FinTable.Header>
                <FinTable.Row>
                  <FinTable.Th>Holding</FinTable.Th>
                  <FinTable.Th align="right">TER</FinTable.Th>
                  <FinTable.Th align="right">Waarde</FinTable.Th>
                  <FinTable.Th align="right">Kosten/jaar</FinTable.Th>
                  <FinTable.Th align="right">% totaal</FinTable.Th>
                </FinTable.Row>
              </FinTable.Header>
              <FinTable.Body>
                {holdingsWithFees.map((h, i) => {
                  const holdingSeverity = terSeverity(h.ter)
                  return (
                    <FinTable.Row key={h.name + i}>
                      <FinTable.Td>
                        <span className="font-medium">{h.name}</span>
                        {h.ticker && (
                          <span className="text-[var(--ink-4)] text-xs ml-1">({h.ticker})</span>
                        )}
                      </FinTable.Td>
                      <FinTable.Td numeric color={SEVERITY_TEXT[holdingSeverity]}>
                        {(h.ter * 100).toFixed(2).replace('.', ',')}%
                      </FinTable.Td>
                      <FinTable.Td numeric muted><MaskedAmount value={h.value} tone="kern" /></FinTable.Td>
                      <FinTable.Td numeric bold><MaskedAmount value={h.annualFee} tone="kern" /></FinTable.Td>
                      <FinTable.Td numeric muted>{(h.percentOfTotalFees * 100).toFixed(0)}%</FinTable.Td>
                    </FinTable.Row>
                  )
                })}
              </FinTable.Body>
              <FinTable.Footer>
                <FinTable.Row total>
                  <FinTable.Td bold>Totaal</FinTable.Td>
                  <FinTable.Td numeric bold color={SEVERITY_TEXT[severity]}>{terPctStr}%</FinTable.Td>
                  <FinTable.Td numeric muted><MaskedAmount value={totalPortfolioValue} tone="kern" /></FinTable.Td>
                  <FinTable.Td numeric bold><MaskedAmount value={totalAnnualFee} tone="kern" /></FinTable.Td>
                  <FinTable.Td numeric muted>100%</FinTable.Td>
                </FinTable.Row>
              </FinTable.Footer>
            </FinTable>
          </div>
        </div>

        {/* ── Holdings without TER ── */}
        {holdingsNoTer.length > 0 && (
          <div className="rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] p-4">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-[var(--ink-2)] mt-0.5 flex-shrink-0" />
              <h3 className="text-sm font-medium text-[var(--ink)]">
                {holdingsNoTer.length} holding{holdingsNoTer.length > 1 ? 's' : ''} zonder TER
              </h3>
            </div>
            <p className="text-xs text-[var(--ink-2)] mb-3">
              Vul de TER in voor een nauwkeuriger kostenbeeld. Individuele aandelen hebben geen TER.
            </p>
            <div className="space-y-1.5">
              {holdingsNoTer.map((h, i) => (
                <div key={h.name + i} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--ink-2)]">
                    {h.name}
                    {h.ticker && <span className="text-[var(--ink-4)] text-xs ml-1">({h.ticker})</span>}
                  </span>
                  <Link
                    href="/core/assets"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ink-2)] hover:underline"
                  >
                    Vul TER in <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Alternatives section ── */}
        {alternativesMap.size > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider font-medium text-[var(--ink-3)] mb-3">
              Vergelijkbare fondsen met lagere kosten
            </h3>
            <div className="space-y-4">
              {Array.from(alternativesMap.entries()).map(([holdingName, results]) => (
                <div key={holdingName} className="rounded-lg border border-[var(--border-ed)] p-3">
                  <p className="text-sm font-medium text-[var(--ink)] mb-2">
                    {holdingName}
                  </p>
                  {results.map((result) => (
                    <div key={result.fund.isin} className="space-y-2">
                      {result.alternatives.slice(0, 2).map((alt) => {
                        const holding = perHoldingBreakdown.find(h => h.name === holdingName)
                        const saving = holding
                          ? berekenJaarlijkseBesparing(result.fund.ter, alt.ter, holding.value)
                          : 0
                        return (
                          <div key={alt.isin} className="flex items-start justify-between gap-3 pl-3 border-l-2 border-positive">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--ink-2)] truncate">{alt.name}</p>
                              <p className="text-xs text-[var(--ink-4)]">
                                {alt.provider} · TER {alt.ter.toFixed(2).replace('.', ',')}%
                              </p>
                              {alt.note && (
                                <p className="text-[11px] text-[var(--ink-4)] italic mt-0.5">{alt.note}</p>
                              )}
                            </div>
                            {saving > 0 && (
                              <div className="text-right flex-shrink-0">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-positive">
                                  <TrendingDown className="h-3 w-3" />
                                  <MaskedAmount value={saving} tone="kern" className="text-xs" />/jaar
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FIRE impact summary ── */}
        {fireImpactStr && feeImpactMonths > 0 && (
          <div className="rounded-lg bg-[var(--subtle)] p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-[var(--ink-3)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-[var(--ink-2)]">
                  Je totale fondskosten van <MaskedAmount value={totalAnnualFee} tone="kern" className="font-semibold" /> per jaar
                  vertragen je financiële vrijheid met <span className="font-semibold">{fireImpactStr}</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Disclaimer ── */}
        <div className="border-t border-[var(--border-ed)] pt-4">
          <p className="text-[11px] text-[var(--ink-4)] leading-relaxed">
            {FUND_ALTERNATIVES_DISCLAIMER}
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}
