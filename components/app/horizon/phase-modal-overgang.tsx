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
import { MonteCarloOvergang } from '@/components/app/horizon/phase-analysis/overgang/monte-carlo-overgang'
import { GapAnalyse } from '@/components/app/horizon/phase-analysis/overgang/gap-analyse'
import { EerderStoppen } from '@/components/app/horizon/phase-analysis/overgang/eerder-stoppen'
import { DeeltijdwerkImpact } from '@/components/app/horizon/phase-analysis/overgang/deeltijdwerk-impact'
import { PhaseIntro } from '@/components/app/horizon/phase-analysis/phase-intro'
import { PhaseDiscussButton } from '@/components/app/horizon/phase-analysis/phase-discuss-button'
import { RegimeKaart, sumIncomeBySource } from '@/components/app/horizon/phase-analysis/regime-kaart'
import { InfoTooltip } from '@/components/overview/belasting/info-tooltip'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { BOX3_DRAG } from '@/lib/constants'
import { formatCurrency } from '@/lib/format'
import { ReceiptRow } from '@/components/app/horizon/phase-analysis/receipt-row'
import { MaskedAmount } from '@/components/app/masked-amount'

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

  // ── Exacte dekkingsbronnen (regime-kaart ⑧) ──────────────────────────────
  // AOW/pensioen uit de EXACTE grossIncomeBySource-pool (niet grossIncome), zodat
  // salaris niet in de vaste-inkomsten lekt. In de brug (gap) horen beide ~€0 te
  // zijn — alles komt dan uit de vermogens-onttrekking.
  const bridgeIncome = sumIncomeBySource(transitionRows, yearlyAowIncome)
  const bridgeVasteInkomsten = bridgeIncome.aow + bridgeIncome.pensioen

  // ── Canonieke FIRE-maatstaf (uitgelijnd met resolveFireParams) ───────────
  // horizon-client geeft geen fireTarget aan deze modal door; we leiden hem af
  // uit dezelfde formule als resolveFireParams zodat "eerder stoppen" en de
  // strategie-vergelijking dezelfde vrijheidsmaatstaf gebruiken als de rest van
  // de app: effectiveSwr = grossReturn − Box 3-drag − inflatie.
  const effectiveSwr = expectedReturn != null
    ? Math.max(0.001, expectedReturn - BOX3_DRAG - inflationRate)
    : null
  const fireTarget = effectiveSwr != null && yearlyExpenses > 0
    ? yearlyExpenses / effectiveSwr
    : undefined

  // ── Projectie-gebaseerd dekkingssignaal (B3) ─────────────────────────────
  // Vervangt de nominale `portfolio ≥ uitgaven×jaren`-check door de echte
  // projectie-uitkomst: het portfolio dekt de overgang als er bij het einde
  // van de fase nog een veiligheidsbuffer over is (eindVermogen ≥ buffer),
  // consistent met Gap-analyse's inflatie-gecorrigeerde dekkingspercentage.
  const COVERAGE_BUFFER = 25_000
  const dekkingVoldoende = eindVermogen >= COVERAGE_BUFFER

  // ── Hele-fase-samenvatting voor de top-level "Bespreek met Will" ─────────
  const shortfallPerYear = Math.max(yearlyExpenses - yearlyAowIncome, 0)
  const portfolioNeedPerYear = transitionScenario === 'shortfall' ? shortfallPerYear : yearlyExpenses
  const faseSummary =
    `Mijn overgangsfase (${transitionScenario === 'gap' ? 'gap: FIRE → AOW, volledig uit portfolio' : 'tekort: AOW → FIRE, AOW vult aan'}). ` +
    `Van ${formatCurrency(Math.round(startVermogen))} naar ${formatCurrency(Math.round(eindVermogen))} over ${durationYears} jaar ` +
    `(${Math.round(startAge)} → ${Math.round(endAge)} jaar). ` +
    `Portfolio overbrugt ${formatCurrency(Math.round(portfolioNeedPerYear))}/jaar` +
    `${transitionScenario === 'shortfall' && yearlyAowIncome > 0 ? `, AOW dekt ${formatCurrency(Math.round(yearlyAowIncome))}/jaar` : ''}. ` +
    `${dekkingVoldoende ? 'Mijn vermogen overbrugt deze periode met buffer.' : 'Er dreigt een tekort tijdens de overgang.'}`

  return (
    <ShellOverlay open={open} onClose={onClose} kind="pane" title={title}>
      {/* Accent line */}
      <div className="h-[2px] bg-[var(--color-horizon-200)]" />

      <div className="space-y-4 p-5">
        {/* 0. Uitleg-intro — wát de overgangsfase is en wáárom je dit ziet */}
        <PhaseIntro
          kicker="OVERGANGSFASE"
          title="De brug naar je AOW"
          body={
            transitionScenario === 'gap'
              ? 'Tussen het moment dat je stopt met werken en je AOW ingaat, leef je volledig van je opgebouwde vermogen — elke euro die je eerder opzij zette koop je hier vrijheid mee. Deze analyses laten zien of je vermogen die jaren overbrugt.'
              : 'Je AOW is al ingegaan, maar je volledige vrijheid (FIRE) komt nog. In deze brugperiode vult je vermogen aan wat je AOW niet dekt. Deze analyses laten zien of je vermogen dat tekort overbrugt.'
          }
          infoDescription="De overgangsfase is de periode tussen stoppen met werken en het bereiken van je AOW én volledige vrijheid. Omdat AOW en FIRE niet altijd op hetzelfde moment vallen, ontstaat er een brug die je vermogen moet financieren. Hier zie je de kassabon van die jaren, een Monte Carlo simulatie van het risico, strategie-opties, de impact van deeltijdwerk, en wat er nodig is om eerder te stoppen."
        />

        {/* 1. PhaseChartZoom — full trajectory with transition phase highlighted */}
        {allRows && allRows.length > 2 && (
          <>
            <div className="flex justify-end">
              <ChartTips
                storageKey="phase_chart_zoom_overgang"
                tips={getPhaseChartZoomTips({
                  phase: 'transition',
                  hasAnnotations: true,
                })}
                align="right"
              />
            </div>
            <PhaseChartZoom
              allRows={allRows}
              phaseFilter="transition"
              accentColor="var(--color-horizon-400)"
              annotations={[
                { age: fireAge, label: 'FIRE' },
                { age: aowAge, label: 'AOW' },
              ]}
            />
          </>
        )}

        {/* 2. Fase-header — compact summary line + top-level discuss button */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-center font-sans text-sm font-bold text-[var(--ink)] sm:text-base">
            Overgang &middot; {<MaskedAmount value={Math.round(startVermogen)} tone="horizon" />} &rarr; {<MaskedAmount value={Math.round(eindVermogen)} tone="horizon" />} &middot; {durationYears} jaar
          </p>
          <PhaseDiscussButton onderwerp="Mijn overgangsfase" summary={faseSummary} />
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
            dekkingVoldoende={dekkingVoldoende}
            coverageBuffer={COVERAGE_BUFFER}
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

        {/* 3b. Regime-kaart — waar de dekking van de brug vandaan komt (€) */}
        <RegimeKaart
          kicker="OVERGANG · DEKKING"
          title="Waar de dekking vandaan komt"
          rows={[
            {
              label: 'Vermogen',
              hint: 'geoormerkt bruggeld',
              weight: Math.max(totalOnttrekking, 0),
              value: <MaskedAmount value={Math.round(totalOnttrekking)} tone="horizon" />,
              tone: 'wealth',
            },
            {
              label: 'AOW',
              weight: Math.max(bridgeIncome.aow, 0),
              value: <MaskedAmount value={Math.round(bridgeIncome.aow)} tone="horizon" />,
              tone: bridgeIncome.aow > 0.5 ? 'income' : 'zero',
            },
            {
              label: 'Pensioen',
              weight: Math.max(bridgeIncome.pensioen, 0),
              value: <MaskedAmount value={Math.round(bridgeIncome.pensioen)} tone="horizon" />,
              tone: bridgeIncome.pensioen > 0.5 ? 'income' : 'zero',
            },
          ]}
          footnote={
            bridgeVasteInkomsten < 1
              ? 'Dit is de smalste brug: AOW en pensioen dragen nog niets bij — alles moet uit je vermogen komen.'
              : 'AOW en pensioen vullen al aan; het restant van de brug financier je uit je vermogen.'
          }
          infoDescription="In de overgangsfase zie je waar de dekking van je uitgaven vandaan komt. De balk toont het relatieve gewicht van elke bron t.o.v. de zwaarste. Vermogen is het geoormerkte bruggeld dat je onttrekt; AOW en pensioen zijn je vaste inkomsten. AOW en pensioen komen exact uit de projectie (grossIncomeBySource) — in de brug tussen stoppen en je AOW dragen ze vaak nog €0 bij, waardoor het gewicht volledig op je vermogen rust."
        />

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
            transitionScenario={transitionScenario}
            yearlyAowIncome={yearlyAowIncome}
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
            transitionScenario={transitionScenario}
            yearlyAowIncome={yearlyAowIncome}
            cashflows={cashflows}
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
            yearlyAowIncome={yearlyAowIncome}
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
            fireTarget={fireTarget}
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
                  value={<MaskedAmount value={Math.round(yearlyWithdrawal > 0 ? yearlyWithdrawal : yearlyExpenses)} tone="horizon" />}
                />
                <AssumptionRow
                  label="Jaarlijkse uitgaven"
                  value={<MaskedAmount value={Math.round(yearlyExpenses)} tone="horizon" />}
                />
                {transitionScenario === 'shortfall' && yearlyAowIncome > 0 && (
                  <>
                    <AssumptionRow
                      label="AOW-inkomen/jaar"
                      value={<MaskedAmount value={Math.round(yearlyAowIncome)} tone="horizon" />}
                    />
                    {yearlyExpenses > yearlyAowIncome && (
                      <AssumptionRow
                        label="Netto tekort/jaar"
                        value={<MaskedAmount value={Math.round(yearlyExpenses - yearlyAowIncome)} tone="horizon" />}
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
    </ShellOverlay>
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
  dekkingVoldoende,
  coverageBuffer,
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
  /** Projectie-gebaseerd dekkingssignaal: eindVermogen ≥ buffer (B3) */
  dekkingVoldoende: boolean
  coverageBuffer: number
}) {
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
        <ReceiptRow label="Startvermogen (bij FIRE)" value={<MaskedAmount value={Math.round(startVermogen)} tone="horizon" />} />
        <ReceiptRow
          label="Rendement"
          value={<MaskedAmount value={Math.round(totalRendement)} tone="horizon" />}
          positive={totalRendement > 0}
        />
        <ReceiptRow
          label="Onttrekking"
          value={totalOnttrekking > 0 ? <MaskedAmount value={Math.round(totalOnttrekking)} signPrefix="-" tone="horizon" /> : <MaskedAmount value={0} tone="horizon" />}
          negative={totalOnttrekking > 0}
        />
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
      </div>

      {/* Total */}
      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="font-sans text-sm text-[var(--ink)]">Vermogen bij AOW</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {<MaskedAmount value={Math.round(eindVermogen)} tone="horizon" />}
        </span>
      </div>

      {/* Coverage indicator — projectie-gebaseerd (eindVermogen ≥ buffer) */}
      <div className="mt-2 flex items-center gap-1">
        {dekkingVoldoende ? (
          <p className="text-[11px] text-[var(--positive)]">
            &#10003; Je vermogen overbrugt de hele overgangsperiode — bij AOW houd je {<MaskedAmount value={Math.round(eindVermogen)} tone="horizon" />} over
          </p>
        ) : (
          <p className="text-[11px] text-[var(--negative)]">
            &#9888; Je vermogen raakt tegen je AOW vrijwel uitgeput (onder {<MaskedAmount value={Math.round(coverageBuffer)} tone="horizon" />} buffer)
          </p>
        )}
        <InfoTooltip text="Dit signaal volgt de werkelijke projectie: na rendement, onttrekking, Box 3 en life events houd je aan het einde van de overgang vermogen over (boven een veiligheidsbuffer) of niet. Dat sluit aan op het dekkingspercentage in de Gap-analyse hieronder." />
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
        <ReceiptRow label="Startvermogen" value={<MaskedAmount value={Math.round(startVermogen)} tone="horizon" />} />
        <ReceiptRow
          label="Rendement"
          value={<MaskedAmount value={Math.round(totalRendement)} tone="horizon" />}
          positive={totalRendement > 0}
        />
        {totalIncome > 0 && (
          <ReceiptRow
            label="AOW/Pensioen inkomen"
            value={<MaskedAmount value={Math.round(totalIncome)} tone="horizon" />}
            positive
          />
        )}
        <ReceiptRow
          label="Onttrekking"
          value={totalOnttrekking > 0 ? <MaskedAmount value={Math.round(totalOnttrekking)} signPrefix="-" tone="horizon" /> : <MaskedAmount value={0} tone="horizon" />}
          negative={totalOnttrekking > 0}
        />
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
      </div>

      {/* Total */}
      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="font-sans text-sm text-[var(--ink)]">Vermogen na overgang</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {<MaskedAmount value={Math.round(eindVermogen)} tone="horizon" />}
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

function AssumptionRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-xs text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">{value}</span>
    </div>
  )
}
