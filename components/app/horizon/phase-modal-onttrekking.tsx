'use client'

import { memo, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import { PhaseDetailTable } from '@/components/app/horizon/phase-detail-table'
import { PhaseChartZoom } from '@/components/app/horizon/phase-analysis/phase-chart-zoom'
import { LifeEventsInPhase } from '@/components/app/horizon/phase-analysis/life-events-in-phase'
import { StressTestSection } from '@/components/app/horizon/phase-analysis/stress-test-section'
import { MonteCarloOnttrekken } from '@/components/app/horizon/phase-analysis/onttrekken/monte-carlo-onttrekken'
import { HuisVerkopen } from '@/components/app/horizon/phase-analysis/onttrekken/huis-verkopen'
import { SORRAnalyse } from '@/components/app/horizon/phase-analysis/onttrekken/sorr-analyse'
import { EndOfLife } from '@/components/app/horizon/phase-analysis/onttrekken/end-of-life'
import { ReceiptRow } from '@/components/app/horizon/phase-analysis/receipt-row'
import type { Debt } from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Types ────────────────────────────────────────────────────────────────────

interface PhaseModalOnttrekkingProps {
  open: boolean
  onClose: () => void
  startAge: number
  endAge: number
  startPortfolio: number
  strategy: FireEndStrategy
  targetEndPortfolio: number
  yearlyWithdrawal: number
  yearlyAowIncome: number
  rows: UnifiedProjectionRow[]   // unified projection rows — we filter to withdrawal
  inflationRate: number          // e.g. 0.02 for 2%
  /** Debts metadata for human-readable labels in detail table */
  debts?: Debt[]
  /** Life events for the in-phase display */
  events?: LifeEvent[]
  /** Simulation cashflows for MC / SORR engines */
  cashflows?: SimCashflow[]
  /** Full unified projection rows (all phases) for PhaseChartZoom */
  allRows?: UnifiedProjectionRow[]
  /** User's expected return for MC simulations */
  expectedReturn?: number
  /** User's asset list for house-selling analysis */
  assets?: Asset[]
  /** User's annual expenses for stress test */
  yearlyExpenses?: number
}

// ── Income Source Bar ────────────────────────────────────────────────────────

function IncomeSourceBar({
  aowTotal,
  pensioenTotal,
  portfolioTotal,
}: {
  aowTotal: number
  pensioenTotal: number
  portfolioTotal: number
}) {
  const total = aowTotal + pensioenTotal + portfolioTotal
  if (total <= 0) return null

  const aowPct = (aowTotal / total) * 100
  const pensioenPct = (pensioenTotal / total) * 100
  const portfolioPct = (portfolioTotal / total) * 100

  const segments = [
    { label: 'AOW', pct: aowPct, value: aowTotal, color: 'var(--color-horizon-400, #a07840)' },
    { label: 'Pensioen', pct: pensioenPct, value: pensioenTotal, color: 'var(--color-horizon-600, #6b5030)' },
    { label: 'Portfolio', pct: portfolioPct, value: portfolioTotal, color: 'var(--color-kern-500, #8b6914)' },
  ].filter(s => s.pct > 0.5)

  return (
    <div className="mt-4">
      <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Inkomstenbronnen
      </p>
      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map(s => (
          <div
            key={s.label}
            className="h-full transition-all duration-300"
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
            title={`${s.label}: ${formatCurrency(Math.round(s.value))}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-sans text-[10px] text-[var(--ink-3)]">
              {s.label}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
              {s.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal Component ──────────────────────────────────────────────────────────

export const PhaseModalOnttrekking = memo(function PhaseModalOnttrekking({
  open,
  onClose,
  startAge,
  endAge,
  startPortfolio,
  strategy,
  targetEndPortfolio,
  yearlyWithdrawal,
  yearlyAowIncome,
  rows,
  inflationRate,
  debts,
  events,
  cashflows,
  allRows,
  expectedReturn,
  assets,
  yearlyExpenses,
}: PhaseModalOnttrekkingProps) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)

  // Filter to withdrawal phase rows
  const withdrawalRows = useMemo(
    () => rows.filter(r => r.phase === 'withdrawal'),
    [rows]
  )

  const endPortfolio = withdrawalRows.length > 0
    ? withdrawalRows[withdrawalRows.length - 1].netWorth
    : targetEndPortfolio

  const strategyLabel = STRATEGY_LABELS[strategy]?.name ?? strategy
  const durationYears = Math.round(endAge - startAge)
  const title = `Onttrekkingsfase \u00b7 ${Math.round(startAge)} \u2192 ${Math.round(endAge)} jaar`

  // ── Cumulative aggregates from unified rows ──────────────────────────────
  const aggregates = useMemo(() => {
    let totalGrowth = 0
    let totalAow = 0
    let totalPensioen = 0
    let totalWithdrawal = 0
    let totalBox3 = 0

    for (const row of withdrawalRows) {
      totalGrowth += row.totalGrowth
      totalBox3 += row.totalBox3
      totalWithdrawal += row.withdrawal

      // grossIncome includes AOW + pensioen in withdrawal phase
      // We split: AOW is a known fixed amount; remainder is pensioen
      const rowAow = Math.min(row.grossIncome, yearlyAowIncome)
      const rowPensioen = Math.max(row.grossIncome - yearlyAowIncome, 0)
      totalAow += rowAow
      totalPensioen += rowPensioen
    }

    // Portfolio withdrawal = total withdrawal minus what AOW/pensioen covered
    const portfolioWithdrawal = totalWithdrawal

    return { totalGrowth, totalAow, totalPensioen, totalWithdrawal, totalBox3, portfolioWithdrawal }
  }, [withdrawalRows, yearlyAowIncome])

  // Levensonderhoud = withdrawal (what you spend from portfolio) + AOW + pensioen
  const totalLevensonderhoud = aggregates.totalWithdrawal + aggregates.totalAow + aggregates.totalPensioen

  return (
    <BottomSheet open={open} onClose={onClose} title={title} size="xl" initialMobileHeight="60vh">
      {/* Accent line at top — kern-500 */}
      <div className="h-[2px] w-full bg-[var(--color-kern-500,#8b6914)]" />

      <div className="space-y-4 p-5">
        {/* 1. PhaseChartZoom — full trajectory with withdrawal phase highlighted */}
        {allRows && allRows.length > 2 && (
          <PhaseChartZoom
            allRows={allRows}
            phaseFilter="withdrawal"
            accentColor="var(--color-kern-500)"
            annotations={[
              { age: startAge, label: 'Start onttrekking' },
            ]}
          />
        )}

        {/* 2. Fase-header */}
        <div className="text-center">
          <p className="font-sans text-base font-bold text-[var(--ink)]">
            Onttrekken &middot; {formatCurrency(Math.round(startPortfolio))} &rarr; {formatCurrency(Math.round(endPortfolio))} &middot; {durationYears} jaar
          </p>
        </div>

        {/* 3. Kassabon — cashflow receipt */}
        <KassabonShell>
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              AFBOUWANALYSE
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              {strategyLabel} &middot; {durationYears} jaar
            </p>
          </div>

          {/* Extended receipt rows — kasstroomanalyse */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <ReceiptRow label="Startvermogen" value={formatCurrency(Math.round(startPortfolio))} />
            <ReceiptRow
              label="Rendement (cumulatief)"
              value={formatCurrency(Math.round(aggregates.totalGrowth))}
              positive={aggregates.totalGrowth > 0}
            />
            {aggregates.totalAow > 0 && (
              <ReceiptRow
                label="AOW (cumulatief)"
                value={formatCurrency(Math.round(aggregates.totalAow))}
                positive
              />
            )}
            {aggregates.totalPensioen > 0 && (
              <ReceiptRow
                label="Pensioen (cumulatief)"
                value={formatCurrency(Math.round(aggregates.totalPensioen))}
                positive
              />
            )}
            <ReceiptRow
              label="Levensonderhoud"
              value={`\u2212 ${formatCurrency(Math.round(totalLevensonderhoud))}`}
              negative
            />
            {aggregates.totalBox3 > 0 && (
              <ReceiptRow
                label="Box 3 (cumulatief)"
                value={`\u2212 ${formatCurrency(Math.round(aggregates.totalBox3))}`}
                negative
              />
            )}
          </div>

          {/* Total: Eindvermogen */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="font-sans text-sm text-[var(--ink)]">Eindvermogen</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {formatCurrency(Math.round(endPortfolio))}
            </span>
          </div>

          {/* Strategy + target */}
          <div className="mt-1.5 flex justify-between text-[11px]">
            <span className="text-[var(--ink-3)]">Strategie</span>
            <span className="font-medium text-[var(--ink-2)]">{strategyLabel}</span>
          </div>
          {targetEndPortfolio > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Doelvermogen</span>
              <span className="font-mono tabular-nums text-[var(--ink-2)]">
                {formatCurrency(Math.round(targetEndPortfolio))}
              </span>
            </div>
          )}
        </KassabonShell>

        {/* 4. Income source breakdown — stacked bar */}
        <IncomeSourceBar
          aowTotal={aggregates.totalAow}
          pensioenTotal={aggregates.totalPensioen}
          portfolioTotal={aggregates.portfolioWithdrawal}
        />

        {/* 5. Life Events in this phase */}
        {events && (
          <LifeEventsInPhase
            events={events}
            phaseStartAge={startAge}
            phaseEndAge={endAge}
          />
        )}

        {/* 6. Monte Carlo withdrawal simulation */}
        {expectedReturn != null && (
          <MonteCarloOnttrekken
            startPortfolio={startPortfolio}
            startAge={startAge}
            endAge={endAge}
            yearlyWithdrawal={yearlyWithdrawal}
            yearlyAowIncome={yearlyAowIncome}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            cashflows={cashflows}
          />
        )}

        {/* 7. Huis Verkopen — conditional on eigen_huis in assets */}
        {assets && expectedReturn != null && (
          <HuisVerkopen
            assets={assets}
            debts={debts ?? []}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
          />
        )}

        {/* 8. SORR analysis */}
        {expectedReturn != null && (
          <SORRAnalyse
            startPortfolio={startPortfolio}
            startAge={startAge}
            endAge={endAge}
            yearlyWithdrawal={yearlyWithdrawal}
            yearlyAowIncome={yearlyAowIncome}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            cashflows={cashflows}
          />
        )}

        {/* 9. End of Life analysis */}
        <EndOfLife
          rows={withdrawalRows}
          strategy={strategy}
          endAge={endAge}
          inflationRate={inflationRate}
          yearlyAowIncome={yearlyAowIncome}
        />

        {/* 10. Stress Test */}
        {expectedReturn != null && (
          <StressTestSection
            rows={withdrawalRows}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            yearlyExpenses={yearlyExpenses ?? yearlyWithdrawal}
            willContextPrefix="Onttrekkingsfase stresstest"
          />
        )}

        {/* 11. PhaseDetailTable — jaar-op-jaar tabel, standaard collapsed */}
        {withdrawalRows.length > 0 && (
          <PhaseDetailTable
            rows={withdrawalRows}
            phase="withdrawal"
            inflationRate={inflationRate}
            debts={debts}
          />
        )}

        {/* 12. Aannames sectie (collapsed) */}
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)]">
          <button
            type="button"
            onClick={() => setAssumptionsOpen(!assumptionsOpen)}
            className="inline-flex min-h-[44px] w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
            aria-expanded={assumptionsOpen}
          >
            {assumptionsOpen
              ? <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150" />
              : <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150" />
            }
            Aannames
          </button>

          {assumptionsOpen && (
            <div className="border-t border-dashed border-[var(--border-ed)] px-3 pb-3 pt-2">
              <div className="space-y-1">
                <AssumptionRow label="Inflatie" value={`${(inflationRate * 100).toFixed(1)}%`} />
                {expectedReturn != null && (
                  <AssumptionRow label="Verwacht rendement" value={`${(expectedReturn * 100).toFixed(1)}%`} />
                )}
                {yearlyWithdrawal > 0 && durationYears > 0 && (
                  <AssumptionRow
                    label="SWR (impliciet)"
                    value={`${((yearlyWithdrawal / startPortfolio) * 100).toFixed(2)}%`}
                  />
                )}
                <AssumptionRow
                  label="Jaarlijkse onttrekking"
                  value={formatCurrency(Math.round(yearlyWithdrawal))}
                />
                {yearlyAowIncome > 0 && (
                  <AssumptionRow
                    label="AOW-inkomen/jaar"
                    value={formatCurrency(Math.round(yearlyAowIncome))}
                  />
                )}
                {aggregates.totalPensioen > 0 && durationYears > 0 && (
                  <AssumptionRow
                    label="Pensioen-inkomen/jaar"
                    value={formatCurrency(Math.round(aggregates.totalPensioen / durationYears))}
                  />
                )}
                <AssumptionRow label="Strategie" value={strategyLabel} />
              </div>
            </div>
          )}
        </div>

        {/* 13. Redactionele noot — data-driven freedom days */}
        {(() => {
          const dailyExpenseRate = (yearlyExpenses ?? yearlyWithdrawal) > 0 ? (yearlyExpenses ?? yearlyWithdrawal) / 365 : 0
          // Average freedom days per year = (yearly withdrawal + yearly AOW income) / daily expense rate
          const avgFreedomDaysPerYear = dailyExpenseRate > 0
            ? Math.round((yearlyWithdrawal + yearlyAowIncome) / dailyExpenseRate)
            : null
          return (
            <div className="mt-5 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-3">
              <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
                {avgFreedomDaysPerYear != null
                  ? `${durationYears} jaar vrijheid geleefd \u2014 gemiddeld ${avgFreedomDaysPerYear.toLocaleString('nl-NL')} vrijheidsdagen per jaar`
                  : `${durationYears} jaar opgebouwde vrijheid, nu geleefd`}
              </p>
            </div>
          )
        })()}
      </div>
    </BottomSheet>
  )
})

// ── Assumption row helper ────────────────────────────────────────────────────

function AssumptionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-xs text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">{value}</span>
    </div>
  )
}

// ── Receipt row helper removed — using shared ReceiptRow from phase-analysis/receipt-row.tsx
