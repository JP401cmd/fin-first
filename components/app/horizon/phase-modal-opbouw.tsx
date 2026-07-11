'use client'

/**
 * Fase 2.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane)
 * DreamTransitionContext (plan §8.1) blijft als per-module override actief.
 */

import { memo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { PhaseDetailTable } from '@/components/app/horizon/phase-detail-table'
import { PhaseChartZoom } from '@/components/app/horizon/phase-analysis/phase-chart-zoom'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getPhaseChartZoomTips } from '@/lib/chart-tips'
import { LifeEventsInPhase } from '@/components/app/horizon/phase-analysis/life-events-in-phase'
import { StressTestSection } from '@/components/app/horizon/phase-analysis/stress-test-section'
import { MonteCarloOpbouw } from '@/components/app/horizon/phase-analysis/opbouw/monte-carlo-opbouw'
import { SchuldenSamenvatting } from '@/components/app/horizon/phase-analysis/opbouw/schulden-samenvatting'
import { SpaarquoteGevoeligheid } from '@/components/app/horizon/phase-analysis/opbouw/spaarquote-gevoeligheid'
import { KoopkrachtErosie } from '@/components/app/horizon/phase-analysis/opbouw/koopkracht-erosie'
import { HypotheekVsBeleggenOpbouw } from '@/components/app/horizon/phase-analysis/opbouw/hypotheek-vs-beleggen-opbouw'
import { PhaseIntro } from '@/components/app/horizon/phase-analysis/phase-intro'
import { PhaseDiscussButton } from '@/components/app/horizon/phase-analysis/phase-discuss-button'
import { RegimeKaart } from '@/components/app/horizon/phase-analysis/regime-kaart'
import { ReceiptRow } from '@/components/app/horizon/phase-analysis/receipt-row'
import { formatCurrency } from '@/lib/format'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import type { UnifiedProjectionRow, AssetBucketDetail } from '@/lib/unified-projection'
import { ASSET_TYPE_LABELS, type AssetType, type Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

interface PhaseModalOpbouwProps {
  open: boolean
  onClose: () => void
  currentAge: number
  fireAge: number
  currentNetWorth: number
  expectedPortfolioAtFire: number
  yearlySavings: number
  yearlyExpenses: number  // for freedom-day calculation
  expectedReturn: number  // e.g. 0.07 for 7%
  inflationRate: number   // e.g. 0.02 for 2%
  /** Unified projection rows (with per-asset-type detail) */
  rows: UnifiedProjectionRow[]
  /** Assets for type labels in breakdown */
  assets?: Asset[]
  /** Debts metadata for human-readable labels in detail table */
  debts?: Debt[]
  /** Life events for phase display */
  events?: LifeEvent[]
  /** Cashflows for Monte Carlo and hypotheek analysis */
  cashflows?: SimCashflow[]
  /** All rows (all phases) for the zoomed chart overlay */
  allRows?: UnifiedProjectionRow[]
  /** Monthly income for hypotheek analysis */
  monthlyIncome?: number
  /** Monthly expenses for hypotheek analysis */
  monthlyExpenses?: number
  /** Portfolio volatility for Monte Carlo (default DEFAULT_VOLATILITY) */
  volatility?: number
  /** FIRE target portfolio amount for Monte Carlo success probability */
  fireTarget?: number
  /** Has partner — affects Box 3 heffingsvrij and marginaalTarief */
  hasPartner?: boolean
  /** Marginaal IB-tarief (e.g. 0.3697 or 0.4950) */
  marginaalTarief?: number
  /** FASE 6, stap 2 — convergentie-vlag (`horizon_kernel_convergentie`) + geboortedatum
   *  voor de HvB-FIRE-impact-routing. Vlag uit / geen dob → v2 (byte-identiek). */
  kernelEnabled?: boolean
  dateOfBirth?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Short label for asset types in the kassabon breakdown */
const WEALTHGROUP_LABELS: Partial<Record<AssetType, string>> = {
  cash: 'Cash',
  savings: 'Spaargeld',
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  eigen_huis: 'Vastgoed (woning)',
  real_estate: 'Vastgoed',
  crypto: 'Crypto',
  other: 'Overig',
}

function wealthGroupLabel(type: AssetType): string {
  return WEALTHGROUP_LABELS[type] ?? ASSET_TYPE_LABELS[type] ?? type
}

// ── Modal Component ──────────────────────────────────────────────────────────

export const PhaseModalOpbouw = memo(function PhaseModalOpbouw({
  open,
  onClose,
  currentAge,
  fireAge,
  currentNetWorth,
  expectedPortfolioAtFire,
  yearlySavings,
  yearlyExpenses,
  expectedReturn,
  inflationRate,
  rows,
  assets,
  debts,
  events,
  cashflows,
  allRows,
  monthlyIncome,
  monthlyExpenses,
  volatility,
  fireTarget,
  hasPartner,
  marginaalTarief,
  kernelEnabled,
  dateOfBirth,
}: PhaseModalOpbouwProps) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)

  // Filter to accumulation phase rows
  const accumulationRows = rows.filter(r => r.phase === 'accumulation')

  // ── Waterval-kassabon aggregaten ────────────────────────────────────────
  const totalInleg = accumulationRows.reduce((sum, r) => sum + r.savings, 0)
  const totalRendement = accumulationRows.reduce((sum, r) => sum + r.totalGrowth, 0)
  const totalBox3 = accumulationRows.reduce((sum, r) => sum + r.totalBox3, 0)
  const totalEvents = accumulationRows.reduce((sum, r) => sum + r.cashflowNet + r.oneTimeNet, 0)

  // Start value: net worth at beginning of first accumulation year (assets - debts)
  const startVermogen = accumulationRows.length > 0
    ? accumulationRows[0].startNetWorth
    : currentNetWorth
  // End value: net worth at end of last accumulation year (assets - debts)
  const eindVermogen = accumulationRows.length > 0
    ? accumulationRows[accumulationRows.length - 1].netWorth
    : expectedPortfolioAtFire

  // Waterfall identity: start + inleg + rendement − box3 + events ≈ eind.
  // Debt repayment is NOT a separate wealth flow — paying down a debt moves cash
  // (an asset) into reduced liabilities, leaving net worth unchanged in the moment;
  // the build-up is already captured inside savings/netWorth. So we do NOT add a
  // synthetic "Schuldaflossing" row to the total (that double-counts AND silently
  // absorbs any real discrepancy). Instead we surface the REAL principal repaid as
  // an informational, non-summed context line, and show an explicit rounding row
  // only when the identity drifts materially.
  const waterfallSum = startVermogen + totalInleg + totalRendement - totalBox3 + totalEvents
  const totalAfgelost = accumulationRows.reduce(
    (sum, r) => sum + Object.values(r.debtBalances).reduce((s, d) => s + (d?.principalPaid ?? 0), 0),
    0,
  )
  // Rounding/reconciliation residual — only material when |drift| > €1.000.
  const afronding = eindVermogen - waterfallSum
  const showAfronding = Math.abs(afronding) > 1000

  // ── Rendement per wealthgroup ──────────────────────────────────────────
  const growthByType: Partial<Record<AssetType, number>> = {}
  const box3ByType: Partial<Record<AssetType, number>> = {}
  const returnByType: Partial<Record<AssetType, { totalGrowth: number; avgValue: number; years: number }>> = {}

  for (const row of accumulationRows) {
    for (const [type, bucket] of Object.entries(row.assetBuckets) as [AssetType, AssetBucketDetail][]) {
      if (!bucket) continue
      growthByType[type] = (growthByType[type] ?? 0) + bucket.growth
      box3ByType[type] = (box3ByType[type] ?? 0) + bucket.box3Drag

      if (!returnByType[type]) {
        returnByType[type] = { totalGrowth: 0, avgValue: 0, years: 0 }
      }
      returnByType[type]!.totalGrowth += bucket.growth
      returnByType[type]!.avgValue += bucket.startValue
      returnByType[type]!.years += 1
    }
  }

  // Filter to wealthgroups with actual growth
  const activeTypes = (Object.keys(growthByType) as AssetType[]).filter(
    t => Math.abs(growthByType[t] ?? 0) > 0.5
  )

  // ── Redactionele noot: vrijheidsdagen per maand ────────────────────────
  const yearsAccumulation = Math.max(fireAge - currentAge, 1)
  // Freedom days built per month = monthly savings / daily expenses
  // Derive monthly savings from total inleg if yearlySavings prop is 0
  const effectiveMonthlySavings = yearlySavings > 0
    ? yearlySavings / 12
    : (totalInleg / yearsAccumulation / 12)
  const dailyExpenseRate = yearlyExpenses > 0 ? yearlyExpenses / 365 : 0
  const freedomDaysBuiltPerMonth = dailyExpenseRate > 0 && effectiveMonthlySavings > 0
    ? Math.round(effectiveMonthlySavings / dailyExpenseRate)
    : null

  // ── Hele-fase-samenvatting voor "Bespreek met Will" (raw formatCurrency) ──
  // Chat-context, géén gemaskeerde bedragen — Will moet de echte cijfers zien.
  const phaseSummary = [
    `Opbouwfase van ${Math.round(currentAge)} tot ${Math.round(fireAge)} jaar (${yearsAccumulation} jaar).`,
    `Vermogen groeit van ${formatCurrency(Math.round(startVermogen))} naar ${formatCurrency(Math.round(eindVermogen))}.`,
    `Opgebouwd door inleg ${formatCurrency(Math.round(totalInleg))} en rendement ${formatCurrency(Math.round(totalRendement))}` +
      (totalBox3 > 0 ? `, na ${formatCurrency(Math.round(totalBox3))} Box 3-belasting.` : '.'),
    totalAfgelost > 0.5 ? `Waarvan ${formatCurrency(Math.round(totalAfgelost))} schuldaflossing.` : '',
    `Verwachte FIRE-leeftijd: ${Math.round(fireAge)} jaar.`,
  ].filter(Boolean).join(' ')

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="pane"
      title={`Opbouwfase \u00b7 ${Math.round(currentAge)} \u2192 ${Math.round(fireAge)} jaar`}
    >
      {/* Accent line */}
      <div className="h-[2px] bg-[var(--color-horizon-600)]" />

      <div className="p-5 space-y-4">
        {/* 0. Phase intro — "wat zie ik hier" + filosofie "Geld is opgeslagen tijd" */}
        <PhaseIntro
          kicker="OPBOUWFASE"
          title="Geld is opgeslagen tijd"
          body="In deze fase groeit je vermogen door wat je inlegt én door het rendement daarop — elke euro die je nu opzij zet, koop je later vrijheid mee. Hieronder zie je hoe inleg en rendement samen je vermogen richting volledige vrijheid stuwen."
          infoDescription="De opbouwfase loopt van nu tot je FIRE-leeftijd: de jaren waarin je actief vermogen opbouwt. De analyses hieronder laten zien hoe inleg, rendement en Box 3-belasting je vermogen vormen, en welke keuzes (extra sparen, schulden aflossen, hypotheek vs. beleggen) je vrijheid versnellen."
        />

        {/* 0b. Regime-kaart — de hefbomen van deze fase (kwalitatief) */}
        <RegimeKaart
          kicker="OPBOUW · REGIME"
          title="De hefbomen van deze fase"
          rows={[
            { label: 'Werk / inkomen', weight: 1, value: 'Hoog', tone: 'income' },
            { label: 'Sparen', weight: 0.8, value: 'Sterk', tone: 'income' },
            {
              label: 'Rendement',
              weight: 0.65,
              value: `Belangrijk · ~${(expectedReturn * 100).toFixed(0)}%/jr`,
              tone: 'wealth',
            },
            { label: 'Kosten', weight: 0.3, value: 'Laag', tone: 'neutral' },
          ]}
          footnote="Vrijheid wordt hier bepaald door je spaarquote, het rendement en hoeveel je liquide beschikbaar houdt."
          infoDescription="Per fase zie je de belangrijkste hefbomen en hun relatieve gewicht. In de opbouwfase wordt je vrijheid vooral bepaald door je spaarquote, het rendement op je vermogen en hoe laag je kosten zijn. De balklengte toont het relatieve gewicht van elke hefboom — géén euro's, maar hoe zwaar elke knop meeweegt in dit regime. Alleen de rendement-aanname is een concreet getal (jouw verwachte rendement); de rest is kwalitatief."
        />

        {/* 1. Phase Chart Zoom — full trajectory with accumulation phase highlighted */}
        {allRows && allRows.length > 2 && (
          <>
            <div className="flex justify-end">
              <ChartTips
                storageKey="phase_chart_zoom_opbouw"
                tips={getPhaseChartZoomTips({
                  phase: 'accumulation',
                  hasAnnotations: true,
                })}
                align="right"
              />
            </div>
            <PhaseChartZoom
              allRows={allRows}
              phaseFilter="accumulation"
              accentColor="var(--color-horizon-600)"
              annotations={[
                { age: fireAge, label: 'FIRE' },
              ]}
            />
          </>
        )}

        {/* 2. Fase-header — compact summary line + top-level "Bespreek met Will" */}
        <div className="text-center">
          <p className="font-sans text-sm font-bold text-[var(--ink)] sm:text-base">
            Opbouw &middot; {<MaskedAmount value={Math.round(startVermogen)} tone="horizon" />} &rarr; {<MaskedAmount value={Math.round(eindVermogen)} tone="horizon" />} &middot; {yearsAccumulation} jaar
          </p>
          <div className="mt-2 flex justify-center">
            <PhaseDiscussButton onderwerp="Mijn opbouwfase" summary={phaseSummary} />
          </div>
        </div>

        {/* 3. Waterval Kassabon — existing receipt waterfall */}
        <KassabonShell>
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              VERMOGENSPROGNOSE
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              Opbouwfase &middot; {Math.round(yearsAccumulation)} jaar
            </p>
          </div>

          {/* Waterval receipt rows */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <ReceiptRow label="Startvermogen" value={<MaskedAmount value={Math.round(startVermogen)} tone="horizon" />} />
            <ReceiptRow label="Totale inleg" value={<MaskedAmount value={Math.round(totalInleg)} tone="horizon" />} positive />
            <ReceiptRow label="Totaal rendement" value={<MaskedAmount value={Math.round(totalRendement)} tone="horizon" />} positive />

            {/* Rendement sub-breakdown per wealthgroup */}
            {activeTypes.length > 1 && (
              <div className="ml-4 border-l border-dotted border-[var(--border-ed)] pl-3">
                {activeTypes.map(type => (
                  <ReceiptRow
                    key={type}
                    label={wealthGroupLabel(type)}
                    value={<MaskedAmount value={Math.round(growthByType[type] ?? 0)} tone="horizon" />}
                    subtle
                  />
                ))}
              </div>
            )}

            <ReceiptRow
              label="Box 3 belasting"
              value={totalBox3 > 0 ? <MaskedAmount value={Math.round(totalBox3)} signPrefix="-" tone="horizon" /> : <MaskedAmount value={0} tone="horizon" />}
              negative={totalBox3 > 0}
            />
            {Math.abs(totalEvents) > 0.5 && (
              <ReceiptRow
                label="Life events"
                value={totalEvents >= 0
                  ? <MaskedAmount value={Math.round(totalEvents)} tone="horizon" />
                  : <MaskedAmount value={Math.round(Math.abs(totalEvents))} signPrefix="-" tone="horizon" />}
                positive={totalEvents > 0}
                negative={totalEvents < 0}
              />
            )}
            {showAfronding && (
              <ReceiptRow
                label="Afronding"
                value={afronding >= 0
                  ? <MaskedAmount value={Math.round(afronding)} tone="horizon" />
                  : <MaskedAmount value={Math.round(Math.abs(afronding))} signPrefix="-" tone="horizon" />}
                positive={afronding > 0}
                negative={afronding < 0}
                subtle
              />
            )}
          </div>

          {/* Total */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="font-sans text-sm text-[var(--ink)]">Vermogen bij FIRE</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {<MaskedAmount value={Math.round(eindVermogen)} tone="horizon" />}
            </span>
          </div>

          {/* Non-summed context: real debt principal repaid during the phase.
              This is shown for insight, NOT added to the waterfall (it's already
              reflected in the net-worth build-up via savings). */}
          {totalAfgelost > 0.5 && (
            <p className="mt-2 text-center font-sans text-[10px] text-[var(--ink-3)]">
              waarvan schuldaflossing:{' '}
              <span className="font-mono tabular-nums">
                <MaskedAmount value={Math.round(totalAfgelost)} tone="horizon" />
              </span>
            </p>
          )}
        </KassabonShell>

        {/* 4. Life Events — events that fall within the accumulation phase */}
        {events && events.length > 0 && (
          <LifeEventsInPhase
            events={events}
            phaseStartAge={currentAge}
            phaseEndAge={fireAge}
          />
        )}

        {/* 5. Monte Carlo — probabilistic analysis of accumulation outcomes */}
        <MonteCarloOpbouw
          currentAge={currentAge}
          fireAge={fireAge}
          startPortfolio={currentNetWorth}
          annualSavings={yearlySavings}
          expectedReturn={expectedReturn}
          volatility={volatility ?? DEFAULT_VOLATILITY}
          inflationRate={inflationRate}
          cashflows={cashflows}
          fireTarget={fireTarget}
        />

        {/* 6. Schulden — debt summary (shows "no debts" message when empty) */}
        <SchuldenSamenvatting
          debts={debts ?? []}
          annualSavings={yearlySavings}
          annualReturn={expectedReturn}
          yearlyExpenses={yearlyExpenses}
          fireTarget={fireTarget}
          currentAge={currentAge}
          fireAge={fireAge}
        />

        {/* 7. Spaarquote Gevoeligheid — savings rate sensitivity analysis */}
        <SpaarquoteGevoeligheid
          annualSavings={yearlySavings}
          currentAge={currentAge}
          fireAge={fireAge}
          currentPortfolio={currentNetWorth}
          expectedReturn={expectedReturn}
          inflationRate={inflationRate}
          yearlyExpenses={yearlyExpenses}
          fireTarget={fireTarget}
          cashflows={cashflows}
          savingsRate={monthlyIncome && monthlyIncome > 0 ? ((monthlyIncome - (monthlyExpenses ?? 0)) / monthlyIncome) * 100 : null}
          monthlyIncome={monthlyIncome}
        />

        {/* 8. Hypotheek vs Beleggen — mortgage vs investing trade-off */}
        <HypotheekVsBeleggenOpbouw
          debts={debts ?? []}
          monthlyIncome={monthlyIncome ?? 0}
          expectedReturn={expectedReturn}
          inflationRate={inflationRate}
          currentAge={currentAge}
          currentPortfolio={currentNetWorth}
          yearlyExpenses={yearlyExpenses}
          annualSavings={yearlySavings}
          cashflows={cashflows}
          hasPartner={hasPartner}
          marginaalTarief={marginaalTarief}
          kernelEnabled={kernelEnabled}
          dateOfBirth={dateOfBirth}
        />

        {/* 10. Koopkrachterosie — inflation erosion analysis */}
        <KoopkrachtErosie
          rows={accumulationRows}
          inflationRate={inflationRate}
          startVermogen={startVermogen}
          eindVermogen={eindVermogen}
        />

        {/* 11. Stress Test — extreme scenario analysis */}
        <StressTestSection
          rows={accumulationRows}
          expectedReturn={expectedReturn}
          inflationRate={inflationRate}
          yearlyExpenses={yearlyExpenses}
          willContextPrefix="Opbouwfase stresstest"
        />

        {/* 10. PhaseDetailTable — yearly detail rows (collapsed by default) */}
        {accumulationRows.length > 0 && (
          <PhaseDetailTable
            rows={accumulationRows}
            phase="accumulation"
            inflationRate={inflationRate}
            showAssetDetail={activeTypes.length > 1}
            debts={debts}
          />
        )}

        {/* 11. Aannames sectie (collapsed) */}
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
                <AssumptionRow label="Verwacht rendement (bruto)" value={`${(expectedReturn * 100).toFixed(1)}%`} />
                {activeTypes.map(type => {
                  const info = returnByType[type]
                  if (!info || info.years === 0) return null
                  const avgReturn = info.avgValue > 0 ? info.totalGrowth / info.avgValue : 0
                  const box3Drag = box3ByType[type] ?? 0
                  const avgBox3Rate = info.avgValue > 0 ? box3Drag / info.avgValue : 0
                  return (
                    <div key={type} className="ml-2 border-l border-dotted border-[var(--border-ed)] pl-2">
                      <AssumptionRow
                        label={`${wealthGroupLabel(type)} rendement`}
                        value={`~${(avgReturn * 100).toFixed(1)}%/jr`}
                      />
                      {avgBox3Rate > 0 && (
                        <AssumptionRow
                          label={`${wealthGroupLabel(type)} Box 3 drag`}
                          value={`~${(avgBox3Rate * 100).toFixed(2)}%/jr`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 12. Redactionele noot — freedom days editorial */}
        {freedomDaysBuiltPerMonth != null && freedomDaysBuiltPerMonth > 0 && (
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-3">
            <p className="font-serif text-xs italic leading-relaxed text-[var(--ink-3)] sm:text-sm">
              Elke maand bouw je {freedomDaysBuiltPerMonth} vrijheidsdagen op
            </p>
          </div>
        )}
      </div>
    </ShellOverlay>
  )
})

// ── Assumption row helper ────────────────────────────────────────────────────

function AssumptionRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-xs text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">{value}</span>
    </div>
  )
}
