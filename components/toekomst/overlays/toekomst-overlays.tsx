'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx r7753–7767, r10222–10314, r10866–11025 (+ dynamic-imports r253–308) @ c1b4849eb (fase 1, ADR 0179).
// euro-view: dit bestand deflateert niets en leest geen inflationFactor. NOMINAAL binnen
// (kruis-regime — de ontvangers lezen zelf `useEuroView()` en deflateren per klasse, N3):
// `unifiedRows` (SimChartModal + de drie fase-modals, `rows`/`allRows`), `displayUnifiedRows`
// en `displaySimRows` (HorizonYearDetailsSheet), `simResult`, `simCashflows`, `fire`,
// `overgangData`, `onttrekkingData`, `effectiveInput`. `effectiveFireTarget` gaat nominaal als
// INVOER naar SimulationsModal (exempt-markering hieronder, ongewijzigd uit de bron).
// GEDEFLATEERD binnen: geen enkele feed — er gaat bewust geen `view*`-prop naar een modal.
//
// Presentational overlay-host (blokken O, V, AA, AB, AC — kaart §1.5, besluit Q5): open-
// states, setters, callbacks en data komen als props binnen met exact de namen van de
// parent-variabelen; de JSX-body is byte-gelijk aan de bron. Het deeplink-effect E2
// (r1054–1114) blijft in de parent. Besluit Q9 (directe BottomSheet → ShellOverlay):
// geen van deze blokken gebruikt een directe BottomSheet — de sheets/modals/panes dragen
// hun eigen overlay-laag — dus hier is geen afwijking van de bron.
// De dode WithdrawalModal (`activeModal === 'withdrawal'`) staat er ongewijzigd in.
import dynamic from 'next/dynamic'
import type { Dispatch, SetStateAction } from 'react'
import type { useRouter } from 'next/navigation'
import { NaturalMilestoneSheet } from '@/components/app/horizon/natural-milestone-sheet'
import { EventClusterSheet } from '@/components/app/horizon/event-cluster-sheet'
import { HouseholdRetirementPane } from '@/components/app/horizon/household-retirement-pane'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { HorizonFireSimResult } from '@/lib/hooks/use-horizon-fire-sim'
import type { FinancialInput, FireProjection, LifeEvent } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { Debt } from '@/lib/debt-data'
import type { HealthScoreInput } from '@/lib/financial-health'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { AowAge, AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { NaturalMilestone } from '@/lib/natural-milestones'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { SimRow } from '@/lib/fire-simulation'
import type { eventStopAgeFromSim } from '@/lib/horizon/event-duration-copy'
import type {
  ActiveFaseModal,
  ActiveModal,
  ClusterSheet,
  Erfgenamen,
  EventPaneMode,
  HouseholdRetireInfo,
  OnttrekkingData,
  OvergangData,
  StrategieInitialTab,
} from '@/components/toekomst/state/types'

const ScenariosModal = dynamic(() =>
  import('@/components/app/horizon/scenarios-modal').then(m => ({ default: m.ScenariosModal })),
  { ssr: false }
)
const SimulationsModal = dynamic(() =>
  import('@/components/app/horizon/simulations-modal').then(m => ({ default: m.SimulationsModal })),
  { ssr: false }
)
const WithdrawalModal = dynamic(() =>
  import('@/components/app/horizon/withdrawal-modal').then(m => ({ default: m.WithdrawalModal })),
  { ssr: false }
)
const BacktestingModal = dynamic(() =>
  import('@/components/app/horizon/backtesting-modal').then(m => ({ default: m.BacktestingModal })),
  { ssr: false }
)
const StrategieModal = dynamic(() =>
  import('@/components/app/horizon/strategie-modal').then(m => ({ default: m.StrategieModal })),
  { ssr: false }
)
const UitgavenPane = dynamic(() =>
  import('@/components/app/horizon/uitgaven-pane').then(m => ({ default: m.UitgavenPane })),
  { ssr: false }
)
const EventPane = dynamic(() =>
  import('@/components/app/horizon/event-pane').then(m => ({ default: m.EventPane })),
  { ssr: false }
)
const PhaseModalOpbouw = dynamic(() =>
  import('@/components/app/horizon/phase-modal-opbouw').then(m => ({ default: m.PhaseModalOpbouw })),
  { ssr: false }
)
const PhaseModalOvergang = dynamic(() =>
  import('@/components/app/horizon/phase-modal-overgang').then(m => ({ default: m.PhaseModalOvergang })),
  { ssr: false }
)
const PhaseModalOnttrekking = dynamic(() =>
  import('@/components/app/horizon/phase-modal-onttrekking').then(m => ({ default: m.PhaseModalOnttrekking })),
  { ssr: false }
)
const SimChartModal = dynamic(() =>
  import('@/components/app/horizon/sim-chart-widget').then(m => ({ default: m.SimChartModal })),
  { ssr: false }
)
// Zwaar-maar-conditionele sub-componenten uit de first-load JS van /toekomst
// gehaald (bundle ronde 2). Mount-condities blijven ONGEWIJZIGD zodat gedrag +
// animaties identiek blijven — dynamic({ssr:false}) haalt de code enkel uit de
// synchrone first-load-bundle en laadt de chunk na hydratatie. Bewust géén
// mount-gate: de year-details-sheet (BottomSheet) heeft een intern open→exit-
// animatie-statemachine die alleen speelt als het gemount blijft, en
// HouseholdFireSection rendert vaak null (solo-gebruiker) + beheert z'n eigen
// laadstaat, dus een skeleton-fallback zou flitsen. `loading` = null (default).
const HorizonYearDetailsSheet = dynamic(() =>
  import('@/components/app/horizon/horizon-year-details-sheet').then(m => ({ default: m.HorizonYearDetailsSheet })),
  { ssr: false }
)

export interface ToekomstOverlaysProps {
  // O — SimChartModal
  simResult: HorizonFireSimResult['result']
  simModalOpen: boolean
  setSimModalOpen: Dispatch<SetStateAction<boolean>>
  simCashflows: HorizonFireSimResult['cashflows']
  currentAge: number | null
  effectiveInput: FinancialInput | null
  fireParams: FireParams
  canonicalDailyRate: HorizonPageData['dailyExpenseRate']
  unifiedRows: HorizonFireSimResult['unifiedRows']
  // V — fase-modals (nominaal)
  activeFaseModal: ActiveFaseModal
  setActiveFaseModal: Dispatch<SetStateAction<ActiveFaseModal>>
  fire: FireProjection | null
  initialData: HorizonPageData
  debts: Debt[]
  displayEvents: LifeEvent[]
  healthScoreInput: HealthScoreInput
  kernelRawProfile: ConvergentieRawProfileRow | null
  overgangData: OvergangData
  fireStrategy: FireStrategyConfig | undefined
  onttrekkingData: OnttrekkingData
  erfgenamen: Erfgenamen
  partnerAowBedrag: number | undefined
  // AA — deep-dive modals, StrategieModal, UitgavenPane
  activeModal: ActiveModal
  setActiveModal: Dispatch<SetStateAction<ActiveModal>>
  effectiveFireTarget: number
  isHouseholdView: boolean
  householdInput: FinancialInput | null
  fireSwr: number
  setStrategieInitialTab: Dispatch<SetStateAction<StrategieInitialTab>>
  loadData: () => void
  router: ReturnType<typeof useRouter>
  strategieInitialTab: StrategieInitialTab
  aowRows: AowLeeftijdRow[]
  uitgavenPaneOpen: boolean
  setUitgavenPaneOpen: Dispatch<SetStateAction<boolean>>
  // AB — HouseholdRetirementPane, EventPane
  householdRetireInfo: HouseholdRetireInfo
  householdRetireOpen: boolean
  setHouseholdRetireOpen: Dispatch<SetStateAction<boolean>>
  refreshData: () => void
  input: FinancialInput | null
  withdrawalStrategyConfig: WithdrawalStrategyConfig
  eventPaneOpen: boolean
  setEventPaneOpen: Dispatch<SetStateAction<boolean>>
  eventPaneEditingId: string | null
  eventPaneMode: EventPaneMode
  eventPanePreviewBaseline: PreviewBaseline | null
  // AC — NaturalMilestoneSheet, EventClusterSheet, HorizonYearDetailsSheet
  selectedNaturalMilestone: NaturalMilestone | null
  setSelectedNaturalMilestone: Dispatch<SetStateAction<NaturalMilestone | null>>
  clusterSheet: ClusterSheet
  setClusterSheet: Dispatch<SetStateAction<ClusterSheet>>
  eventStopAge: ReturnType<typeof eventStopAgeFromSim>
  naturalMilestones: NaturalMilestone[]
  setEventPaneEditingId: Dispatch<SetStateAction<string | null>>
  setEventPaneMode: Dispatch<SetStateAction<EventPaneMode>>
  selectedYearAge: number | null
  setSelectedYearAge: Dispatch<SetStateAction<number | null>>
  displayUnifiedRows: UnifiedProjectionRow[]
  displaySimRows: SimRow[]
  events: LifeEvent[]
  userAowAge: AowAge
  effectiveChartPrimaryBasis: 'total' | 'liquid'
  eigenHuisMortgageIds: Set<string>
}

export function ToekomstOverlays({
  simResult,
  simModalOpen,
  setSimModalOpen,
  simCashflows,
  currentAge,
  effectiveInput,
  fireParams,
  canonicalDailyRate,
  unifiedRows,
  activeFaseModal,
  setActiveFaseModal,
  fire,
  initialData,
  debts,
  displayEvents,
  healthScoreInput,
  kernelRawProfile,
  overgangData,
  fireStrategy,
  onttrekkingData,
  erfgenamen,
  partnerAowBedrag,
  activeModal,
  setActiveModal,
  effectiveFireTarget,
  isHouseholdView,
  householdInput,
  fireSwr,
  setStrategieInitialTab,
  loadData,
  router,
  strategieInitialTab,
  aowRows,
  uitgavenPaneOpen,
  setUitgavenPaneOpen,
  householdRetireInfo,
  householdRetireOpen,
  setHouseholdRetireOpen,
  refreshData,
  input,
  withdrawalStrategyConfig,
  eventPaneOpen,
  setEventPaneOpen,
  eventPaneEditingId,
  eventPaneMode,
  eventPanePreviewBaseline,
  selectedNaturalMilestone,
  setSelectedNaturalMilestone,
  clusterSheet,
  setClusterSheet,
  eventStopAge,
  naturalMilestones,
  setEventPaneEditingId,
  setEventPaneMode,
  selectedYearAge,
  setSelectedYearAge,
  displayUnifiedRows,
  displaySimRows,
  events,
  userAowAge,
  effectiveChartPrimaryBasis,
  eigenHuisMortgageIds,
}: ToekomstOverlaysProps) {
  return (
    <>
      {/* Detail modal (enige interactiepunt voor simulatie) */}
      {simResult && (
        <SimChartModal
          open={simModalOpen}
          onClose={() => setSimModalOpen(false)}
          simResult={simResult}
          cashflows={simCashflows}
          currentAge={currentAge}
          retirementExpenseMethod={null}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          grossReturn={fireParams.grossReturn}
          canonicalDailyRate={canonicalDailyRate}
          unifiedRows={unifiedRows ?? undefined}
        />
      )}

      {/* === Phase Modals === */}
      {simResult && currentAge != null && simResult.fireAge != null && (
        <PhaseModalOpbouw
          open={activeFaseModal === 'opbouw'}
          onClose={() => setActiveFaseModal(null)}
          currentAge={currentAge}
          fireAge={simResult.fireAge}
          currentNetWorth={unifiedRows?.[0]?.startNetWorth ?? ((effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0))}
          expectedPortfolioAtFire={simResult.firePortfolioAtFire}
          yearlySavings={(fire?.monthlySavings ?? 0) * 12}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          canonicalDailyRate={canonicalDailyRate}
          dailyRateSource={initialData.dailyExpenseRateDetail.source}
          expectedReturn={fireParams.grossReturn}
          inflationRate={fireParams.inflationRate}
          rows={unifiedRows ?? []}
          assets={initialData.assets}
          debts={debts}
          events={displayEvents}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          monthlyIncome={effectiveInput?.monthlyIncome}
          savingsRate6m={healthScoreInput.effectiveSavingsRatePct}
          // tweede-motor: exempt — fase-modal-invoer, geen hero-KPI; de modal
          // rekent zijn eigen strategie-bewuste doel door. Zie C1.
          fireTarget={fire?.fireTarget}
          hasPartner={initialData.hasPartner}
          marginaalTarief={fireParams.marginaalTarief}
          dateOfBirth={kernelRawProfile?.date_of_birth ?? null}
        />
      )}
      {/* Overgang phase modal */}
      {overgangData && (
        <PhaseModalOvergang
          open={activeFaseModal === 'overgang'}
          onClose={() => setActiveFaseModal(null)}
          transitionScenario={overgangData.scenario}
          startAge={overgangData.start}
          endAge={overgangData.end}
          fireAge={overgangData.fireAge}
          aowAge={overgangData.aowAge}
          yearlyWithdrawal={overgangData.withdrawal}
          yearlyAowIncome={overgangData.yearlyAow}
          yearlyExpenses={overgangData.yearlyExp}
          portfolioAtTransitionStart={overgangData.portfolioAtStart}
          nettoLiquideAtStart={overgangData.nettoLiquideAtStart}
          canonicalDailyRate={canonicalDailyRate}
          dailyRateSource={initialData.dailyExpenseRateDetail.source}
          rows={unifiedRows ?? []}
          inflationRate={fireParams.inflationRate}
          debts={debts}
          events={displayEvents}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          expectedReturn={fireParams.grossReturn}
          currentAge={currentAge ?? overgangData.fireAge}
          annualSavings={(fire?.monthlySavings ?? 0) * 12}
          fireStrategy={fireStrategy}
          currentPortfolio={(effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)}
          monthlyIncome={effectiveInput?.monthlyIncome}
        />
      )}
      {/* Onttrekking phase modal */}
      {onttrekkingData && (unifiedRows ?? simResult) && (
        <PhaseModalOnttrekking
          open={activeFaseModal === 'onttrekking'}
          onClose={() => setActiveFaseModal(null)}
          startAge={onttrekkingData.start}
          endAge={onttrekkingData.end}
          startPortfolio={onttrekkingData.startPortfolio}
          nettoLiquideAtStart={onttrekkingData.nettoLiquideAtStart}
          canonicalDailyRate={canonicalDailyRate}
          dailyRateSource={initialData.dailyExpenseRateDetail.source}
          strategy={onttrekkingData.strategy}
          targetEndPortfolio={onttrekkingData.targetEndPortfolio}
          yearlyWithdrawal={onttrekkingData.yearlyWithdrawal}
          yearlyAowIncome={onttrekkingData.yearlyAow}
          rows={unifiedRows ?? []}
          inflationRate={fireParams.inflationRate}
          debts={debts}
          events={displayEvents}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          expectedReturn={fireParams.grossReturn}
          assets={initialData.assets}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          hasPartner={initialData.hasPartner}
          erfgenamen={erfgenamen}
          partnerAowBedrag={partnerAowBedrag}
          currentAge={currentAge ?? undefined}
        />
      )}

      {/* === Deep-dive Modals === */}
      {effectiveInput && (
        <>
          <ScenariosModal input={effectiveInput} debts={debts} baseHealthInput={healthScoreInput} open={activeModal === 'scenarios'} onClose={() => setActiveModal(null)} />
          <SimulationsModal
            input={effectiveInput}
            open={activeModal === 'simulations'}
            onClose={() => setActiveModal(null)}
            // BEWUST GEEN `precomputedMc` meer: de grafiek-band draait sinds de
            // marktcheck-fix op de horizon-kernel (volledige plan-curve), deze
            // modal nog op de losstaande `runMonteCarlo`-motor uit horizon-data.
            // Data van de een in de ander tonen zou twee grondslagen mengen; de
            // modal rekent zijn eigen, expliciet gelabelde FIRE-kans.
            // euro-view: exempt — dit is INVOER voor een tweede simulatie, geen
            // weergavebedrag. Een gedeflateerd doel zou daar een andere som opleveren.
            authoritativeFireTarget={effectiveFireTarget}
            defaultProjYears={
              simResult && currentAge != null
                ? Math.max(simResult.displayEndAge - currentAge, 10)
                : undefined
            }
          />
          <WithdrawalModal input={effectiveInput} open={activeModal === 'withdrawal'} onClose={() => setActiveModal(null)} />
          <BacktestingModal
            input={isHouseholdView && householdInput ? householdInput : effectiveInput}
            swr={fireSwr}
            open={activeModal === 'backtesting'}
            onClose={() => setActiveModal(null)}
            perspectiveLabel={isHouseholdView && householdInput ? 'huishouden' : undefined}
          />
        </>
      )}
      <StrategieModal
        open={activeModal === 'strategie'}
        onClose={() => { setActiveModal(null); setStrategieInitialTab(null); loadData() }}
        // B-057/B1 — na een geslaagde autosave van het plan herlaadt de grafiek
        // meteen (pane blijft open). Sinds fase 1 stap 3 is `loadData` zelf de
        // `router.refresh()`; sluiten ververst nog één keer.
        onSaved={() => { void loadData() }}
        housingStrategy={initialData.housingStrategy}
        initialTab={strategieInitialTab}
        // Kernel-context: de onttrekking-tab vergelijkt de vier PROFIELEN via de kernel.
        kernelRawProfile={kernelRawProfile}
        kernelAssets={initialData.assets}
        kernelDebts={debts}
        kernelLifeEvents={displayEvents}
        kernelAowRows={aowRows}
      />
      <UitgavenPane open={uitgavenPaneOpen} onClose={() => { setUitgavenPaneOpen(false); loadData() }} />

      {/* Huishoud-aanpasflow — geopend vanaf de "Na pensioen"-KPI in huishoudweergave.
          onSaved bumpt de perspectief-versie zodat hero + grafiek + huishoud-FIRE-sectie
          meteen het nieuwe gezamenlijke bedrag tonen. */}
      {householdRetireInfo && (
        <HouseholdRetirementPane
          open={householdRetireOpen}
          onClose={() => setHouseholdRetireOpen(false)}
          candidates={householdRetireInfo.candidates}
          currentMethod={householdRetireInfo.method}
          onSaved={refreshData}
        />
      )}
      {input && fireParams && fireStrategy && withdrawalStrategyConfig && (
        <EventPane
          open={eventPaneOpen}
          onClose={() => setEventPaneOpen(false)}
          editingId={eventPaneEditingId}
          initialMode={eventPaneMode}
          events={displayEvents}
          baselineInput={input}
          baselineFire={fire}
          fireParams={fireParams}
          fireStrategy={fireStrategy}
          withdrawalStrategy={withdrawalStrategyConfig}
          endAge={fireStrategy.endAge ?? 90}
          householdMode={initialData.hasPartner ?? false}
          previewBaseline={eventPanePreviewBaseline}
          onChanged={() => loadData()}
        />
      )}

      {/*
        Natuurlijke-mijlpaal info-sheet — opent bij klik op een natural-marker
        in de chart. Geen edit-flow (afgeleide momenten zijn niet bewerkbaar);
        wel kind-specifieke uitleg + deeplink naar de bron-asset/debt.
      */}
      <NaturalMilestoneSheet
        open={selectedNaturalMilestone !== null}
        milestone={selectedNaturalMilestone}
        onClose={() => setSelectedNaturalMilestone(null)}
      />

      {/*
        Cluster-sheet — opent bij klik op een +N cluster-marker, zowel in de
        EventsTimeline onder de lijn-grafiek als (sinds M16) op de markers ÓP de
        grafiek in BEIDE chartmodi. Bewust buiten elke chartMode-conditie
        gemount: in `vermogensopbouw` staat er geen EventsTimeline onder de
        staven, dus daar is dit de enige uitgang naar een geclusterde
        gebeurtenis. Toont alle events in dat cluster gegroepeerd per type
        (levensgebeurtenissen + natuurlijke mijlpalen). Klik op een rij volgt
        dezelfde routing als de directe marker-klik: life-event opent EventPane,
        natural milestone deeplinkt naar bron-asset/debt.
      */}
      <EventClusterSheet
        open={clusterSheet !== null}
        events={clusterSheet?.events ?? []}
        centerAge={clusterSheet?.centerAge ?? 0}
        stopAge={eventStopAge}
        onClose={() => setClusterSheet(null)}
        onSelectEvent={(id) => {
          if (id.startsWith('nat-')) {
            const m = naturalMilestones.find(x => x.id === id)
            if (m?.category === 'debt') router.push('/core/debts')
            else if (m?.category === 'asset') router.push('/core/assets')
            return
          }
          setEventPaneEditingId(id)
          setEventPaneMode('view')
          setEventPaneOpen(true)
        }}
      />

      {/*
        Year-details kassabon — opent bij klik op een jaar-kolom in de
        WealthCompositionChart. Toont editorial breakdown van bezittingen,
        schulden, kosten/inkomsten en gebeurtenissen voor dat specifieke
        projectiejaar. Werkt direct op `unifiedRows` — geen aparte
        sim-pipeline of conversie nodig.
      */}
      <HorizonYearDetailsSheet
        open={selectedYearAge !== null}
        age={selectedYearAge}
        onClose={() => setSelectedYearAge(null)}
        unifiedRows={displayUnifiedRows}
        simRows={displaySimRows}
        currentAge={currentAge ?? 30}
        inflationRate={fireParams.inflationRate}
        debts={debts}
        lifeEvents={events}
        cashflows={simCashflows ?? []}
        aowAge={userAowAge.fractional}
        fireAge={simResult?.fireAge ?? null}
        // De bon blijft de volledige jaarbalans op de I-grondslag; deze prop
        // zorgt alleen dat het getal waarop de gebruiker klikte er als
        // "waarvan besteedbaar"-regel bij staat (ADR 0114 D3).
        primaryBasis={effectiveChartPrimaryBasis}
        // Zelfde Set als de Opbouw-grafiek: klikt de gebruiker op een gedempte
        // band, dan markeert de bon exact dezelfde regels als "telt niet mee
        // voor je doel". De optelling blijft ongemoeid — de bon sluit op I.
        eigenHuisMortgageIds={eigenHuisMortgageIds}
        onChangeAge={(newAge) => {
          // Clamp op de geclipte weergaverijen: de gebruiker mag niet naar het
          // (verborgen) laatste jaar bladeren.
          const rows = displaySimRows
          if (rows.length === 0) return
          const minA = rows[0].age
          const maxA = rows[rows.length - 1].age
          setSelectedYearAge(Math.max(minA, Math.min(newAge, maxA)))
        }}
      />
    </>
  )
}
