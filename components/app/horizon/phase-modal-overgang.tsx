'use client'

import { memo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import { PhaseDetailTable } from '@/components/app/horizon/phase-detail-table'
import { PhaseChartZoom } from '@/components/app/horizon/phase-analysis/phase-chart-zoom'
import { LifeEventsInPhase } from '@/components/app/horizon/phase-analysis/life-events-in-phase'
import { StressTestSection } from '@/components/app/horizon/phase-analysis/stress-test-section'
import { MonteCarloOvergang } from '@/components/app/horizon/phase-analysis/overgang/monte-carlo-overgang'
import { GapAnalyse } from '@/components/app/horizon/phase-analysis/overgang/gap-analyse'
import { EerderStoppen } from '@/components/app/horizon/phase-analysis/overgang/eerder-stoppen'
import { DeeltijdwerkImpact } from '@/components/app/horizon/phase-analysis/overgang/deeltijdwerk-impact'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { ReceiptRow } from '@/components/app/horizon/phase-analysis/receipt-row'

// ── Types ────────────────────────────────────────────────────────────────────

export type TransitionScenario = 'gap' | 'shortfall' | 'none'

interface PhaseModalOvergangProps {
  open: boolean
  onClose: () => void
  transitionScenario: TransitionScenario
  startAge: number          // FIRE age (gap) or AOW age (shortfall)
  endAge: number            // AOW age (gap) or FIRE age (shortfall)
  fireAge: number
  aowAge: number
  /** Annual portfolio withdrawal during transition */
  yearlyWithdrawal: number
  /** Annual AOW income (only relevant for shortfall scenario) */
  yearlyAowIncome: number
  /** Annual expenses */
  yearlyExpenses: number
  /** Portfolio value at start of transition */
  portfolioAtTransitionStart: number
  /** Unified projection rows for transition phase detail */
  rows: UnifiedProjectionRow[]
  /** Inflation rate for PhaseDetailTable */
  inflationRate: number
  /** Debts metadata for human-readable labels in detail table */
  debts?: Debt[]
  /** Life events for displaying in-phase events */
  events?: LifeEvent[]
  /** Life event cashflows for MC and eerder-stoppen calculations */
  cashflows?: SimCashflow[]
  /** Full projection rows for PhaseChartZoom (all phases, not just transition) */
  allRows?: UnifiedProjectionRow[]
  /** Expected return for analysis components */
  expectedReturn?: number
  /** User's current age for eerder-stoppen calculation */
  currentAge?: number
  /** Annual savings for eerder-stoppen calculation */
  annualSavings?: number
  /** FIRE end strategy configuration */
  fireStrategy?: FireStrategyConfig
  /** Current portfolio value (may differ from portfolioAtTransitionStart) */
  currentPortfolio?: number
  /** Monthly income (full-time equivalent) for part-time work scenarios */
  monthlyIncome?: number
}

// ── Modal Component ──────────────────────────────────────────────────────────

export const PhaseModalOvergang = memo(function PhaseModalOvergang({
  open,
  onClose,
  transitionScenario,
  startAge,
  endAge,
  fireAge,
  aowAge,
  yearlyWithdrawal,
  yearlyAowIncome,
  yearlyExpenses,
  portfolioAtTransitionStart,
  rows,
  inflationRate,
  debts,
  events,
  cashflows,
  allRows,
  expectedReturn,
  currentAge,
  annualSavings,
  fireStrategy,
  currentPortfolio,
  monthlyIncome,
}: PhaseModalOvergangProps) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)

  if (transitionScenario === 'none') return null

  const durationYears = Math.max(Math.round(endAge - startAge), 1)
  const title = `Overgangsfase \u00b7 ${Math.round(startAge)} \u2192 ${Math.round(endAge)} jaar`

  // Filter to transition phase rows
  const transitionRows = rows.filter(r => r.phase === 'transition')

  // ── Waterval-kassabon aggregaten van unified rows ──────────────────────
  const hasTransitionRows = transitionRows.length > 0

  // Use startNetWorth (net worth = assets - debts) instead of totalAssets from bucket values
  const startVermogen = hasTransitionRows
    ? transitionRows[0].startNetWorth
    : portfolioAtTransitionStart

  const totalRendement = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.totalGrowth, 0)
    : 0

  const totalOnttrekking = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.withdrawal, 0)
    : yearlyWithdrawal * durationYears

  const totalBox3 = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.totalBox3, 0)
    : 0

  const totalEvents = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.cashflowNet + r.oneTimeNet, 0)
    : 0

  const totalIncome = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.grossIncome, 0)
    : yearlyAowIncome * durationYears

  const eindVermogen = hasTransitionRows
    ? transitionRows[transitionRows.length - 1].netWorth
    : Math.max(portfolioAtTransitionStart - totalOnttrekking + totalRendement, 0)

  return (
    <BottomSheet open={open} onClose={onClose} title={title} size="xl" initialMobileHeight="60vh">
      {/* Accent line */}
      <div className="h-[2px] bg-[var(--color-horizon-200)]" />

      <div className="space-y-4 p-5">
        {/* 1. PhaseChartZoom — full trajectory with transition phase highlighted */}
        {allRows && allRows.length > 2 && (
          <PhaseChartZoom
            allRows={allRows}
            phaseFilter="transition"
            accentColor="var(--color-horizon-400)"
            annotations={[
              { age: fireAge, label: 'FIRE' },
              { age: aowAge, label: 'AOW' },
            ]}
          />
        )}

        {/* 2. Fase-header — compact summary line */}
        <div className="text-center">
          <p className="font-sans text-sm font-bold text-[var(--ink)] sm:text-base">
            Overgang &middot; {formatCurrency(Math.round(startVermogen))} &rarr; {formatCurrency(Math.round(eindVermogen))} &middot; {durationYears} jaar
          </p>
        </div>

        {/* 3. Kassabon — existing GapAnalysis / ShortfallAnalysis */}
        {transitionScenario === 'gap' ? (
          <GapAnalysisKassabon
            durationYears={durationYears}
            fireAge={fireAge}
            aowAge={aowAge}
            startVermogen={startVermogen}
            totalRendement={totalRendement}
            totalOnttrekking={totalOnttrekking}
            totalBox3={totalBox3}
            totalEvents={totalEvents}
            eindVermogen={eindVermogen}
            yearlyExpenses={yearlyExpenses}
            portfolioAtTransitionStart={portfolioAtTransitionStart}
          />
        ) : (
          <ShortfallAnalysis
            durationYears={durationYears}
            fireAge={fireAge}
            aowAge={aowAge}
            startVermogen={startVermogen}
            totalRendement={totalRendement}
            totalOnttrekking={totalOnttrekking}
            totalBox3={totalBox3}
            totalEvents={totalEvents}
            totalIncome={totalIncome}
            eindVermogen={eindVermogen}
            yearlyAowIncome={yearlyAowIncome}
            yearlyExpenses={yearlyExpenses}
          />
        )}

        {/* 4. Life Events in this phase */}
        {events && events.length > 0 && (
          <LifeEventsInPhase
            events={events}
            phaseStartAge={startAge}
            phaseEndAge={endAge}
          />
        )}

        {/* 5. Monte Carlo simulation */}
        {expectedReturn != null && (
          <MonteCarloOvergang
            startPortfolio={portfolioAtTransitionStart}
            startAge={startAge}
            endAge={endAge}
            yearlyWithdrawal={yearlyWithdrawal > 0 ? yearlyWithdrawal : yearlyExpenses}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            cashflows={cashflows}
            fireAge={fireAge}
            aowAge={aowAge}
          />
        )}

        {/* 6. Gap Analyse with strategy comparison */}
        {expectedReturn != null && (
          <GapAnalyse
            startPortfolio={portfolioAtTransitionStart}
            startAge={startAge}
            endAge={endAge}
            yearlyExpenses={yearlyExpenses}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            debts={debts}
            currentAge={currentAge}
            fireAge={fireAge}
            aowAge={aowAge}
          />
        )}

        {/* 7. Deeltijdwerk Flex Impact — part-time work scenarios */}
        {expectedReturn != null && (
          <DeeltijdwerkImpact
            startPortfolio={portfolioAtTransitionStart}
            startAge={startAge}
            endAge={endAge}
            yearlyExpenses={yearlyExpenses}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            transitionScenario={transitionScenario}
            monthlyIncome={monthlyIncome}
            cashflows={cashflows}
          />
        )}

        {/* 8. Eerder Stoppen — for both gap and shortfall scenarios */}
        {currentAge != null && expectedReturn != null && (
          <EerderStoppen
            currentAge={currentAge}
            currentFireAge={fireAge}
            currentPortfolio={currentPortfolio ?? portfolioAtTransitionStart}
            yearlyExpenses={yearlyExpenses}
            annualSavings={annualSavings ?? 0}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            cashflows={cashflows}
            fireStrategy={fireStrategy}
            scenario={transitionScenario}
          />
        )}

        {/* 8. Stress Test */}
        {expectedReturn != null && transitionRows.length > 0 && (
          <StressTestSection
            rows={transitionRows}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            yearlyExpenses={yearlyExpenses}
            willContextPrefix="Overgangsfase stresstest"
          />
        )}

        {/* 9. PhaseDetailTable (collapsed by default) */}
        {transitionRows.length > 0 && (
          <PhaseDetailTable
            rows={transitionRows}
            phase="transition"
            inflationRate={inflationRate}
            debts={debts}
          />
        )}

        {/* 10. Aannames sectie (collapsed) */}
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
                <AssumptionRow
                  label="Jaarlijkse onttrekking"
                  value={formatCurrency(Math.round(yearlyWithdrawal > 0 ? yearlyWithdrawal : yearlyExpenses))}
                />
                <AssumptionRow
                  label="Jaarlijkse uitgaven"
                  value={formatCurrency(Math.round(yearlyExpenses))}
                />
                {transitionScenario === 'shortfall' && yearlyAowIncome > 0 && (
                  <>
                    <AssumptionRow
                      label="AOW-inkomen/jaar"
                      value={formatCurrency(Math.round(yearlyAowIncome))}
                    />
                    {yearlyExpenses > yearlyAowIncome && (
                      <AssumptionRow
                        label="Netto tekort/jaar"
                        value={formatCurrency(Math.round(yearlyExpenses - yearlyAowIncome))}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 11. Redactionele noot — data-driven freedom days */}
        {(() => {
          const dailyExpenseRate = yearlyExpenses > 0 ? yearlyExpenses / 365 : 0
          const freedomDays = dailyExpenseRate > 0
            ? Math.round(portfolioAtTransitionStart / dailyExpenseRate)
            : null
          return (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-3">
              <p className="font-serif text-xs italic leading-relaxed text-[var(--ink-3)] sm:text-sm">
                {freedomDays != null
                  ? `${durationYears} jaar overgang \u2014 je leeft van ${freedomDays.toLocaleString('nl-NL')} eerder opgebouwde vrijheidsdagen`
                  : `${durationYears} jaar overgang = ${durationYears} jaar eerder verdiende vrijheid die je nu overbrugt`}
              </p>
            </div>
          )
        })()}
      </div>
    </BottomSheet>
  )
})

// ── Scenario A: Gap (FIRE < AOW) ────────────────────────────────────────────

function GapAnalysisKassabon({
  durationYears,
  fireAge,
  aowAge,
  startVermogen,
  totalRendement,
  totalOnttrekking,
  totalBox3,
  totalEvents,
  eindVermogen,
  yearlyExpenses,
  portfolioAtTransitionStart,
}: {
  durationYears: number
  fireAge: number
  aowAge: number
  startVermogen: number
  totalRendement: number
  totalOnttrekking: number
  totalBox3: number
  totalEvents: number
  eindVermogen: number
  yearlyExpenses: number
  portfolioAtTransitionStart: number
}) {
  const totalExpenses = yearlyExpenses * durationYears

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          GAP-ANALYSE
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          FIRE ({Math.round(fireAge)}) tot AOW ({Math.round(aowAge)}) &middot; {durationYears} jaar zonder AOW
        </p>
      </div>

      {/* Waterfall receipt rows */}
      <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <ReceiptRow label="Startvermogen (bij FIRE)" value={formatCurrency(Math.round(startVermogen))} />
        <ReceiptRow
          label="Rendement"
          value={formatCurrency(Math.round(totalRendement))}
          positive={totalRendement > 0}
        />
        <ReceiptRow
          label="Onttrekking"
          value={totalOnttrekking > 0 ? `\u2212${formatCurrency(Math.round(totalOnttrekking)).replace('\u20AC', '\u20AC ')}` : formatCurrency(0)}
          negative={totalOnttrekking > 0}
        />
        <ReceiptRow
          label="Box 3 belasting"
          value={totalBox3 > 0 ? `\u2212${formatCurrency(Math.round(totalBox3)).replace('\u20AC', '\u20AC ')}` : formatCurrency(0)}
          negative={totalBox3 > 0}
        />
        {Math.abs(totalEvents) > 0.5 && (
          <ReceiptRow
            label="Life events"
            value={totalEvents >= 0
              ? formatCurrency(Math.round(totalEvents))
              : `\u2212${formatCurrency(Math.round(Math.abs(totalEvents))).replace('\u20AC', '\u20AC ')}`}
            positive={totalEvents > 0}
            negative={totalEvents < 0}
          />
        )}
      </div>

      {/* Total */}
      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="font-sans text-sm text-[var(--ink)]">Vermogen bij AOW</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(Math.round(eindVermogen))}
        </span>
      </div>

      {/* Coverage indicator */}
      <div className="mt-2">
        {portfolioAtTransitionStart >= totalExpenses ? (
          <p className="text-[11px] text-[var(--positive)]">
            &#10003; Vermogen dekt de overgangsperiode volledig
          </p>
        ) : (
          <p className="text-[11px] text-[var(--negative)]">
            &#9888; Tekort van {formatCurrency(Math.round(totalExpenses - portfolioAtTransitionStart))} tijdens overgang
          </p>
        )}
      </div>
    </KassabonShell>
  )
}

// ── Scenario B: Shortfall (FIRE > AOW) ──────────────────────────────────────

function ShortfallAnalysis({
  durationYears,
  fireAge,
  aowAge,
  startVermogen,
  totalRendement,
  totalOnttrekking,
  totalBox3,
  totalEvents,
  totalIncome,
  eindVermogen,
  yearlyAowIncome,
  yearlyExpenses,
}: {
  durationYears: number
  fireAge: number
  aowAge: number
  startVermogen: number
  totalRendement: number
  totalOnttrekking: number
  totalBox3: number
  totalEvents: number
  totalIncome: number
  eindVermogen: number
  yearlyAowIncome: number
  yearlyExpenses: number
}) {
  const shortfallPerYear = Math.max(yearlyExpenses - yearlyAowIncome, 0)

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          TEKORT-ANALYSE
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          AOW ({Math.round(aowAge)}) tot FIRE ({Math.round(fireAge)}) &middot; {durationYears} jaar met AOW
        </p>
      </div>

      {/* Waterfall receipt rows */}
      <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <ReceiptRow label="Startvermogen" value={formatCurrency(Math.round(startVermogen))} />
        <ReceiptRow
          label="Rendement"
          value={formatCurrency(Math.round(totalRendement))}
          positive={totalRendement > 0}
        />
        {totalIncome > 0 && (
          <ReceiptRow
            label="AOW/Pensioen inkomen"
            value={formatCurrency(Math.round(totalIncome))}
            positive
          />
        )}
        <ReceiptRow
          label="Onttrekking"
          value={totalOnttrekking > 0 ? `\u2212${formatCurrency(Math.round(totalOnttrekking)).replace('\u20AC', '\u20AC ')}` : formatCurrency(0)}
          negative={totalOnttrekking > 0}
        />
        <ReceiptRow
          label="Box 3 belasting"
          value={totalBox3 > 0 ? `\u2212${formatCurrency(Math.round(totalBox3)).replace('\u20AC', '\u20AC ')}` : formatCurrency(0)}
          negative={totalBox3 > 0}
        />
        {Math.abs(totalEvents) > 0.5 && (
          <ReceiptRow
            label="Life events"
            value={totalEvents >= 0
              ? formatCurrency(Math.round(totalEvents))
              : `\u2212${formatCurrency(Math.round(Math.abs(totalEvents))).replace('\u20AC', '\u20AC ')}`}
            positive={totalEvents > 0}
            negative={totalEvents < 0}
          />
        )}
      </div>

      {/* Total */}
      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="font-sans text-sm text-[var(--ink)]">Vermogen na overgang</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(Math.round(eindVermogen))}
        </span>
      </div>

      {/* Coverage note */}
      {shortfallPerYear === 0 && (
        <div className="mt-2">
          <p className="text-[11px] text-[var(--positive)]">
            &#10003; AOW dekt je uitgaven volledig in deze fase
          </p>
        </div>
      )}
    </KassabonShell>
  )
}

// ── Assumption row helper ────────────────────────────────────────────────────

function AssumptionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-xs text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">{value}</span>
    </div>
  )
}
