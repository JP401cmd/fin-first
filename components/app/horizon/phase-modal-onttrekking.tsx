'use client'

/**
 * Fase 2.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane)
 * DreamTransitionContext (plan §8.1) blijft als per-module override actief.
 */

import { memo, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import { PhaseIntro } from '@/components/app/horizon/phase-analysis/phase-intro'
import { PhaseDiscussButton } from '@/components/app/horizon/phase-analysis/phase-discuss-button'
import { RegimeKaart, sumIncomeBySource } from '@/components/app/horizon/phase-analysis/regime-kaart'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import { PhaseDetailTable } from '@/components/app/horizon/phase-detail-table'
import { PhaseChartZoom } from '@/components/app/horizon/phase-analysis/phase-chart-zoom'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getPhaseChartZoomTips } from '@/lib/chart-tips'
import { LifeEventsInPhase } from '@/components/app/horizon/phase-analysis/life-events-in-phase'
import { StressTestSection } from '@/components/app/horizon/phase-analysis/stress-test-section'
import { MonteCarloOnttrekken } from '@/components/app/horizon/phase-analysis/onttrekken/monte-carlo-onttrekken'
import { HuisVerkopen } from '@/components/app/horizon/phase-analysis/onttrekken/huis-verkopen'
import { SORRAnalyse } from '@/components/app/horizon/phase-analysis/onttrekken/sorr-analyse'
import { EndOfLife } from '@/components/app/horizon/phase-analysis/onttrekken/end-of-life'
import { KoopkrachtErosieOnttrekken } from '@/components/app/horizon/phase-analysis/onttrekken/koopkracht-erosie-onttrekken'
import { ReceiptRow } from '@/components/app/horizon/phase-analysis/receipt-row'
import type { Debt } from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { MaskedAmount } from '@/components/app/masked-amount'

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
  /** Erfgenamen (heirs) with relation type and inheritance fraction */
  erfgenamen?: { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[]
  /** Partner AOW monthly benefit for partner continuation analysis */
  partnerAowBedrag?: number
  /** Nabestaandenpensioen monthly amount for partner continuation analysis */
  nabestaandenPensioen?: number
  /** Whether user has a partner (for partner continuation section) */
  hasPartner?: boolean
  /** User's current age for inflation sensitivity analysis */
  currentAge?: number
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
  erfgenamen,
  partnerAowBedrag,
  nabestaandenPensioen,
  hasPartner,
  currentAge,
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
  // The receipt follows the TRUE wealth identity (verified against the unified
  // projection rows): eindvermogen = startvermogen + rendement
  //   − portfolio-onttrekking − Box 3 ± eenmalige kasstromen.
  //
  // AOW + pensioen are NOT wealth flows into the portfolio — they fund living
  // expenses OUTSIDE it (recurring cashflows reduce the needed withdrawal and
  // are never injected into the portfolio). `row.withdrawal` is therefore the
  // net portfolio outflow with AOW already netted out exactly once. Showing AOW
  // as a positive "vermogensaanwas" row while also folding it into a gross
  // "Levensonderhoud" cancels arithmetically but reads as if AOW grows your
  // wealth — so we keep income sources in the jaarinkomen-regime-kaart
  // (coverage) and out of the receipt (C2).
  const aggregates = useMemo(() => {
    let totalGrowth = 0
    let totalWithdrawal = 0
    let totalBox3 = 0
    let totalOneTimeCashflows = 0

    for (const row of withdrawalRows) {
      totalGrowth += row.totalGrowth
      totalBox3 += row.totalBox3
      totalWithdrawal += row.withdrawal
      totalOneTimeCashflows += (row.oneTimeNet || 0)
    }

    // Exacte inkomstensplitsing via `grossIncomeBySource` (kwaliteits-fix): de
    // oude heuristiek `min(row.grossIncome, aow)` telde óók een eventueel
    // salaris-/partnerdeel (CF!D) mee in AOW/pensioen. Nu splitsen we de EXACTE
    // gebeurtenisBaten-pool (CF!H = AOW + pensioen) en houden salaris apart, met
    // een veilige fallback op de oude heuristiek als het exacte veld ontbreekt.
    const income = sumIncomeBySource(withdrawalRows, yearlyAowIncome)

    // Portfolio withdrawal = the net amount drawn from the portfolio (AOW/pensioen
    // already netted out). This IS the "Levensonderhoud (uit portfolio)" line.
    const portfolioWithdrawal = totalWithdrawal

    return {
      totalGrowth,
      totalAow: income.aow,
      totalPensioen: income.pensioen,
      totalSalaris: income.salaris,
      totalWithdrawal,
      totalBox3,
      portfolioWithdrawal,
      totalOneTimeCashflows,
    }
  }, [withdrawalRows, yearlyAowIncome])

  // ── Jaarinkomen-opbouw voor de regime-kaart (per-jaar-gemiddelden) ────────
  const perYear = durationYears > 0 ? durationYears : 1
  const aowPerYear = aggregates.totalAow / perYear
  const pensioenPerYear = aggregates.totalPensioen / perYear
  const salarisPerYear = aggregates.totalSalaris / perYear
  const withdrawalPerYear = aggregates.portfolioWithdrawal / perYear
  const jaarInkomenTotaal = aowPerYear + pensioenPerYear + salarisPerYear + withdrawalPerYear
  const vasteShare = jaarInkomenTotaal > 0
    ? (aowPerYear + pensioenPerYear + salarisPerYear) / jaarInkomenTotaal
    : 0
  const incomeStatusPill: { label: string; tone: 'good' | 'warn' | 'bad' } | undefined =
    vasteShare >= 0.4
      ? { label: 'Vaste basis', tone: 'good' }
      : vasteShare > 0
        ? { label: 'Deels vast', tone: 'warn' }
        : undefined

  // Reconcile the receipt against the actual eindvermogen. Any residual (e.g.
  // from debt-principal effects on net worth) surfaces as an explicit
  // "Afronding" row instead of silently hiding in a mislabeled line.
  const reconstructedEnd =
    startPortfolio +
    aggregates.totalGrowth -
    aggregates.totalWithdrawal -
    aggregates.totalBox3 +
    aggregates.totalOneTimeCashflows
  const afronding = Math.round(endPortfolio - reconstructedEnd)
  const showAfronding = Math.abs(afronding) > 1000

  // Whole-phase summary for the top-level "Bespreek met Fin" button. Uses
  // plain formatCurrency (chat strings are never masked). Slagingskans/kritische
  // SWR live in the Monte Carlo section's local state, so they are intentionally
  // omitted here — the MC section carries those into its own discuss context.
  const avgAowPerYear = durationYears > 0 ? Math.round(aggregates.totalAow / durationYears) : 0
  const phaseSummary =
    `Strategie: ${strategyLabel}. ` +
    `Vermogen loopt van ${formatCurrency(Math.round(startPortfolio))} naar ${formatCurrency(Math.round(endPortfolio))} over ${durationYears} jaar. ` +
    `Netto portfolio-onttrekking ${formatCurrency(Math.round(yearlyWithdrawal))}/jaar` +
    `${avgAowPerYear > 0 ? `, bovenop ${formatCurrency(avgAowPerYear)}/jaar AOW` : ''}. ` +
    `Cumulatief rendement ${formatCurrency(Math.round(aggregates.totalGrowth))}, Box 3 ${formatCurrency(Math.round(aggregates.totalBox3))}. ` +
    `${targetEndPortfolio > 0 ? `${strategy === 'pensioen' ? 'Geschatte nalatenschap' : 'Doelvermogen'}: ${formatCurrency(Math.round(targetEndPortfolio))}.` : ''}`

  return (
    <ShellOverlay open={open} onClose={onClose} kind="pane" title={title}>
      {/* Accent line at top — kern-500 */}
      <div className="h-[2px] w-full bg-[var(--color-kern-500,#8b6914)]" />

      <div className="space-y-4 p-5">
        {/* 0. Uitleg-intro — wat is deze fase & waarom zie je dit */}
        <PhaseIntro
          kicker="AFBOUWFASE"
          title="Nu leef je van opgeslagen tijd"
          body="Je hebt jarenlang vrijheid opgebouwd; nu leef je ervan. Elke euro die je onttrekt is een stukje teruggekochte levenstijd. De eerste jaren wegen het zwaarst: een tegenvaller vlak na je stop raakt je vermogen blijvend, want je verkoopt op een laag punt zonder herstelkans (volgorde-risico)."
          infoDescription="Deze analyses laten zien hoelang je vermogen meegaat en welke risico's de afbouwfase bepalen: een Monte Carlo-slagingskans, het volgorde-risico (SORR) van de eerste jaren, koopkrachterosie door inflatie, de keuze huis behouden of verkopen, en je nalatenschap aan het einde."
        />

        {/* 0b. Regime-kaart — waar je jaarinkomen vandaan komt (exact, per jaar) */}
        <RegimeKaart
          kicker="AFBOUW · JAARINKOMEN"
          title="Waar je jaarinkomen vandaan komt"
          statusPill={incomeStatusPill}
          rows={[
            {
              label: 'AOW',
              weight: Math.max(aowPerYear, 0),
              value: <MaskedAmount value={Math.round(aowPerYear)} tone="horizon" />,
              tone: aowPerYear > 0.5 ? 'income' : 'zero',
            },
            {
              label: 'Pensioen',
              weight: Math.max(pensioenPerYear, 0),
              value: <MaskedAmount value={Math.round(pensioenPerYear)} tone="horizon" />,
              tone: pensioenPerYear > 0.5 ? 'income' : 'zero',
            },
            ...(salarisPerYear > 100
              ? [{
                  label: 'Werk / overig',
                  weight: Math.max(salarisPerYear, 0),
                  value: <MaskedAmount value={Math.round(salarisPerYear)} tone="horizon" />,
                  tone: 'income' as const,
                }]
              : []),
            {
              label: 'Vermogen',
              hint: 'onttrekking',
              weight: Math.max(withdrawalPerYear, 0),
              value: <MaskedAmount value={Math.round(withdrawalPerYear)} tone="horizon" />,
              tone: 'wealth',
            },
          ]}
          footnote="Vaste inkomsten nemen de druk weg bij je vermogen: hoe groter hun aandeel, hoe minder je hoeft te onttrekken."
          infoDescription="Hier zie je hoe je jaarinkomen in de afbouwfase is opgebouwd (gemiddeld per jaar). AOW en pensioen zijn vaste inkomsten; het restant haal je uit je vermogen (onttrekking). De balk toont het relatieve gewicht van elke bron. Deze cijfers komen exact uit de projectie (grossIncomeBySource) in plaats van een schatting — hoe meer vaste inkomsten, hoe minder druk op je vermogen."
        />

        {/* 1. PhaseChartZoom — full trajectory with withdrawal phase highlighted */}
        {allRows && allRows.length > 2 && (
          <>
            <div className="flex justify-end">
              <ChartTips
                storageKey="phase_chart_zoom_onttrekking"
                tips={getPhaseChartZoomTips({
                  phase: 'withdrawal',
                  hasAnnotations: true,
                })}
                align="right"
              />
            </div>
            <PhaseChartZoom
              allRows={allRows}
              phaseFilter="withdrawal"
              accentColor="var(--color-kern-500)"
              annotations={[
                { age: startAge, label: 'Start onttrekking' },
              ]}
            />
          </>
        )}

        {/* 2. Fase-header */}
        <div className="text-center">
          <p className="font-sans text-sm font-bold text-[var(--ink)] sm:text-base">
            Onttrekken &middot; {<MaskedAmount value={Math.round(startPortfolio)} tone="horizon" />} &rarr; {<MaskedAmount value={Math.round(endPortfolio)} tone="horizon" />} &middot; {durationYears} jaar
          </p>
          <div className="mt-2 flex justify-center">
            <PhaseDiscussButton onderwerp="Mijn afbouwfase" summary={phaseSummary} />
          </div>
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

          {/* Extended receipt rows — vermogensidentiteit (geen AOW/pensioen als
              aanwas; die dekken uitgaven en staan in de inkomstenbalk). */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <ReceiptRow label="Startvermogen" value={<MaskedAmount value={Math.round(startPortfolio)} tone="horizon" />} />
            <ReceiptRow
              label="Rendement (cumulatief)"
              value={<MaskedAmount value={Math.round(aggregates.totalGrowth)} tone="horizon" />}
              positive={aggregates.totalGrowth > 0}
            />
            <ReceiptRow
              label="Onttrokken uit portfolio"
              value={<MaskedAmount value={Math.round(aggregates.totalWithdrawal)} signPrefix="-" tone="horizon" />}
              negative
            />
            {aggregates.totalBox3 > 0 && (
              <ReceiptRow
                label="Box 3 (cumulatief)"
                value={<MaskedAmount value={Math.round(aggregates.totalBox3)} signPrefix="-" tone="horizon" />}
                negative
              />
            )}
            {aggregates.totalOneTimeCashflows !== 0 && (
              <ReceiptRow
                label="Eenmalige gebeurtenissen"
                value={aggregates.totalOneTimeCashflows < 0
                  ? <MaskedAmount value={Math.round(Math.abs(aggregates.totalOneTimeCashflows))} signPrefix="-" tone="horizon" />
                  : <MaskedAmount value={Math.round(aggregates.totalOneTimeCashflows)} tone="horizon" />
                }
                positive={aggregates.totalOneTimeCashflows > 0}
                negative={aggregates.totalOneTimeCashflows < 0}
              />
            )}
            {showAfronding && (
              <ReceiptRow
                label="Afronding"
                value={afronding < 0
                  ? <MaskedAmount value={Math.abs(afronding)} signPrefix="-" tone="horizon" />
                  : <MaskedAmount value={afronding} tone="horizon" />
                }
                positive={afronding > 0}
                negative={afronding < 0}
              />
            )}
          </div>

          {/* Total: Eindvermogen */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="font-sans text-sm text-[var(--ink)]">Eindvermogen</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {<MaskedAmount value={Math.round(endPortfolio)} tone="horizon" />}
            </span>
          </div>

          {/* Strategy + target */}
          <div className="mt-1.5 flex justify-between text-[11px]">
            <span className="text-[var(--ink-3)]">Strategie</span>
            <span className="font-medium text-[var(--ink-2)]">{strategyLabel}</span>
          </div>
          {targetEndPortfolio > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">
                {strategy === 'pensioen' ? 'Geschatte nalatenschap' : 'Doelvermogen'}
              </span>
              <span className="font-mono tabular-nums text-[var(--ink-2)]">
                {<MaskedAmount value={Math.round(targetEndPortfolio)} tone="horizon" />}
              </span>
            </div>
          )}
        </KassabonShell>

        {/* 4. Life Events in this phase */}
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

        {/* 7. Huis Verkopen — always rendered, shows relevance message if no house */}
        {expectedReturn != null && (
          <HuisVerkopen
            assets={assets ?? []}
            debts={debts ?? []}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            startAge={startAge}
            endAge={endAge}
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
          hasPartner={hasPartner}
          erfgenamen={erfgenamen}
          partnerAowBedrag={partnerAowBedrag}
          nabestaandenPensioen={nabestaandenPensioen}
          currentAge={currentAge}
        />

        {/* 10. Koopkrachterosie — purchasing power erosion over time */}
        <KoopkrachtErosieOnttrekken
          yearlyWithdrawal={yearlyWithdrawal}
          inflationRate={inflationRate}
          startAge={startAge}
          endAge={endAge}
          yearlyAowIncome={yearlyAowIncome}
        />

        {/* 11. Stress Test */}
        {expectedReturn != null && (
          <StressTestSection
            rows={withdrawalRows}
            expectedReturn={expectedReturn}
            inflationRate={inflationRate}
            yearlyExpenses={yearlyExpenses ?? yearlyWithdrawal}
            finContextPrefix="Onttrekkingsfase stresstest"
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
                  value={<MaskedAmount value={Math.round(yearlyWithdrawal)} tone="horizon" />}
                />
                {yearlyAowIncome > 0 && (
                  <AssumptionRow
                    label="AOW-inkomen/jaar"
                    value={<MaskedAmount value={Math.round(yearlyAowIncome)} tone="horizon" />}
                  />
                )}
                {aggregates.totalPensioen > 0 && durationYears > 0 && (
                  <AssumptionRow
                    label="Pensioen-inkomen/jaar"
                    value={<MaskedAmount value={Math.round(aggregates.totalPensioen / durationYears)} tone="horizon" />}
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
              <p className="font-serif text-xs italic leading-relaxed text-[var(--ink-3)] sm:text-sm">
                {avgFreedomDaysPerYear != null
                  ? `${durationYears} jaar vrijheid geleefd \u2014 gemiddeld ${avgFreedomDaysPerYear.toLocaleString('nl-NL')} vrijheidsdagen per jaar`
                  : `${durationYears} jaar opgebouwde vrijheid, nu geleefd`}
              </p>
            </div>
          )
        })()}
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

// ── Receipt row helper removed — using shared ReceiptRow from phase-analysis/receipt-row.tsx
