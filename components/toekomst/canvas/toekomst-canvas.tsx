'use client'
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

/**
 * Het canvas van /toekomst (ADR 0179 D1/D3, fase 1 stap 15): de grafiekkaart die de
 * `(katern)`-layout boven de katern-koppen rendert en die bij een katernwissel
 * gemonteerd blijft (GW1).
 *
 * Verplaatst uit de compositie van `components/app/horizon/horizon-client.tsx`
 * (@ ec883d283, `HorizonCompositie`): de kaart `horizon-hero` met de canvas-bladeren
 * (pills, uitleg, grafiek, legenda). Nieuw is alleen de kopregel: de vervallen
 * kicker-kop gaf het perspectief-label en de Tips-toggle af aan de Details-rij
 * (kaart V11, GW6).
 *
 * Fase 1 = hetzelfde canvas op elk katern (besluit Q4); de katern-afhankelijke stand
 * (vaste lagen, compact) volgt in fase 2 via een katern-context uit de layout. Dit
 * component leest de route dus niet (D8).
 *
 * Lokale UI-state die alleen het canvas leest: de uitklap van Inkomen & Uitgaven en de
 * nadruk van een gehoverde tips-ballon.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import type { OverlayBalloonDef } from '@/components/app/horizon/toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from '@/components/app/horizon/toekomst-overlay-balloons'
import type { OverlayEmphasis } from '@/components/toekomst/state/types'
import { PlanHeroKop } from '@/components/toekomst/plan/plan-hero-kop'
import { CanvasTipsToggle } from '@/components/toekomst/canvas/canvas-tips-toggle'
import { CanvasPills } from '@/components/toekomst/canvas/canvas-pills'
import { CanvasUitleg } from '@/components/toekomst/canvas/canvas-uitleg'
import { CanvasGrafiek } from '@/components/toekomst/canvas/canvas-grafiek'
import { CanvasLegenda } from '@/components/toekomst/canvas/canvas-legenda'
import {
  useToekomstPerspectiefContext,
  useToekomstOverlayContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
  useToekomstLagenContext,
  useToekomstEuroContext,
} from '@/components/toekomst/state/toekomst-state-provider'

export function ToekomstCanvas() {
  const {
    partnerName,
    isPartnerView,
    householdMainLine,
    partnerLine,
    usePartnerMainLine,
    useHouseholdMainLine,
    perspectiveHero,
    hasPerspectiveHero,
  } = useToekomstPerspectiefContext()
  const {
    setActiveModal,
    setSimModalOpen,
    setActiveFaseModal,
    setEventPaneOpen,
    setEventPaneEditingId,
    setEventPaneMode,
    setClusterSheet,
    setSelectedYearAge,
  } = useToekomstOverlayContext()
  const {
    showScenarioLine,
    setShowScenarioLine,
    hasScenario,
    doelLijnLabel,
    hasDoelLijn,
    labZone,
    scenarioFireDeltaLabel,
    nalatenschapMarker,
  } = useToekomstScenarioContext()
  const {
    fireParams,
    userAowAge,
    events,
    canonicalDailyRate,
    heroFireAge,
    displayMode,
    simResult,
    simCashflows,
    kernelHousingSale,
    scenarioPending,
    stopPadPending,
    projectiePending,
    currentAge,
    planAnchor,
    isFixedAnchorMode,
    eventStopAge,
    effectiveNetWorth,
    homeExcludedFromProgress,
    isPensioenMode,
    ankerReach,
    ankerStop,
    showDualFireTarget,
    planningMode,
    chartEndAge,
    liquidWealthPoints,
  } = useToekomstSimContext()
  const {
    scenariosExpanded,
    setScenariosExpanded,
    scenarioData,
    mcExpanded,
    setMcExpanded,
    mcData,
    mcPending,
    mcFailed,
    ieViewMode,
    setIeViewMode,
    chartMode,
    setChartMode,
    lifelineAge,
    setLifelineAge,
    isPlaying,
    setIsPlaying,
    showNaturalMilestones,
    showLifeEvents,
    showGoals,
    showLiquidLine,
    overlayPrefRestored,
    persistOverlayVisible,
    handleOverlayExit,
    persistNaturalMilestones,
    persistLifeEvents,
    persistGoals,
    persistLiquidLine,
    overlayVisible,
    naturalMilestones,
    eventsForTimeline,
    goalChartMarkers,
    chartEventOverlay,
    handleChartEventClick,
    handleChartClusterOpen,
    handleChartEventDragMove,
    handleChartEventDragEnd,
    dualBasisAvailable,
    effectiveChartPrimaryBasis,
    secondaryLineVisible,
    mcMarge,
    monteCarloOverlay,
    handleEventDragEnd,
  } = useToekomstLagenContext()
  const {
    viewDisplaySimRows,
    viewWealthCompositionRows,
    viewPartnerLineRows,
    viewHouseholdMainLineRows,
    viewLiquidWealthPoints,
    viewCombinedScenarioOverlays,
    viewHouseholdOverlays,
    viewMonteCarloOverlay,
    viewFireTarget,
    viewFireTargetInclHome,
    viewTargetEndPortfolio,
    viewTargetInflationFactors,
    viewReadoutData,
    viewIeBreakdownResult,
  } = useToekomstEuroContext()
  const { masked } = useMaskedAmounts()
  const router = useRouter()

  const [incomeExpenseExpanded, setIncomeExpenseExpanded] = useState(false)
  // overlayEmphasis: welke grafiekfase een gehoverde/gefocuste ballon accentueert.
  const [overlayEmphasis, setOverlayEmphasis] = useState<OverlayEmphasis>(null)

  // ── Ballon-definities — puur informatieve uitleg bij de grafiek ──
  // De drie fase-bubbels (Opbouw / Financiële vrijheid / Afbouw) komen uit de
  // module-level constante TOEKOMST_OVERLAY_BALLOONS, zodat de regressietest ze kan
  // vastpinnen. Geen eigen rekenlogica/bedragen; de gewogen layout +
  // emphasis-koppeling zit in ToekomstOverlay.
  const toekomstOverlayBalloons: OverlayBalloonDef[] = TOEKOMST_OVERLAY_BALLOONS

  return (
    <section data-testid="horizon-hero" className={`card-editorial overflow-hidden ${overlayVisible && chartMode === 'vermogenspad' ? 'no-hover-lift' : ''}`}>
      {/* Module-active accent (Horizon-500 op /toekomst/**) */}
      <div className="h-1.5" style={{ background: 'var(--module-active-500)' }} />

      <div className="p-4 sm:p-6 md:p-8">
        <PlanHeroKop
          hasPerspectiveHero={hasPerspectiveHero}
          isPartnerView={isPartnerView}
          perspectiveHero={perspectiveHero}
          simResult={simResult}
          setSimModalOpen={setSimModalOpen}
          kicker={<PerspectiveContextLabel />}
          acties={
            <CanvasTipsToggle
              overlayVisible={overlayVisible}
              handleOverlayExit={handleOverlayExit}
              persistOverlayVisible={persistOverlayVisible}
            />
          }
        />

        {/* Zonder simResult rendert het canvas alleen zijn kopregel (de vroegere
            WidgetEmpty-lege-staat was onbereikbaar — fase 1 stap 1). */}
        {simResult ? (
          <>
            <CanvasPills
              chartMode={chartMode}
              scenariosExpanded={scenariosExpanded}
              setScenariosExpanded={setScenariosExpanded}
              scenarioData={scenarioData}
              mcExpanded={mcExpanded}
              setMcExpanded={setMcExpanded}
              mcMarge={mcMarge}
              mcFailed={mcFailed}
              mcPending={mcPending}
              hasDoelLijn={hasDoelLijn}
              showScenarioLine={showScenarioLine}
              setShowScenarioLine={setShowScenarioLine}
              doelLijnLabel={doelLijnLabel}
              hasScenario={hasScenario}
              scenarioFireDeltaLabel={scenarioFireDeltaLabel}
              scenarioPending={scenarioPending}
              stopPadPending={stopPadPending}
              dualBasisAvailable={dualBasisAvailable}
              effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
              showLiquidLine={showLiquidLine}
              persistLiquidLine={persistLiquidLine}
              showLifeEvents={showLifeEvents}
              persistLifeEvents={persistLifeEvents}
              events={events}
              goalChartMarkers={goalChartMarkers}
              showGoals={showGoals}
              persistGoals={persistGoals}
              showNaturalMilestones={showNaturalMilestones}
              persistNaturalMilestones={persistNaturalMilestones}
              naturalMilestones={naturalMilestones}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              setChartMode={setChartMode}
              simResult={simResult}
              userAowAge={userAowAge}
              currentAge={currentAge}
              monteCarloOverlay={monteCarloOverlay}
              planningMode={planningMode}
              isFixedAnchorMode={isFixedAnchorMode}
            />

            <CanvasUitleg
              scenariosExpanded={scenariosExpanded}
              scenarioData={scenarioData}
              mcExpanded={mcExpanded}
              mcData={mcData}
              mcMarge={mcMarge}
              mcFailed={mcFailed}
              liquidWealthPoints={liquidWealthPoints}
              chartMode={chartMode}
              secondaryLineVisible={secondaryLineVisible}
              effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
              viewReadoutData={viewReadoutData}
              lifelineAge={lifelineAge}
            />

            <CanvasGrafiek
              currentAge={currentAge}
              chartEndAge={chartEndAge}
              projectiePending={projectiePending}
              overlayVisible={overlayVisible}
              chartMode={chartMode}
              overlayPrefRestored={overlayPrefRestored}
              setOverlayEmphasis={setOverlayEmphasis}
              toekomstOverlayBalloons={toekomstOverlayBalloons}
              useHouseholdMainLine={useHouseholdMainLine}
              householdMainLine={householdMainLine}
              usePartnerMainLine={usePartnerMainLine}
              partnerLine={partnerLine}
              simResult={simResult}
              effectiveNetWorth={effectiveNetWorth}
              hasPerspectiveHero={hasPerspectiveHero}
              perspectiveHero={perspectiveHero}
              heroFireAge={heroFireAge}
              masked={masked}
              planAnchor={planAnchor}
              ankerReach={ankerReach}
              ankerStop={ankerStop}
              handleOverlayExit={handleOverlayExit}
              overlayEmphasis={overlayEmphasis}
              lifelineAge={lifelineAge}
              setLifelineAge={setLifelineAge}
              displayMode={displayMode}
              viewHouseholdMainLineRows={viewHouseholdMainLineRows}
              viewPartnerLineRows={viewPartnerLineRows}
              viewDisplaySimRows={viewDisplaySimRows}
              simCashflows={simCashflows}
              viewFireTarget={viewFireTarget}
              showDualFireTarget={showDualFireTarget}
              viewFireTargetInclHome={viewFireTargetInclHome}
              viewTargetEndPortfolio={viewTargetEndPortfolio}
              viewTargetInflationFactors={viewTargetInflationFactors}
              dualBasisAvailable={dualBasisAvailable}
              viewLiquidWealthPoints={viewLiquidWealthPoints}
              effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
              secondaryLineVisible={secondaryLineVisible}
              partnerName={partnerName}
              viewCombinedScenarioOverlays={viewCombinedScenarioOverlays}
              labZone={labZone}
              nalatenschapMarker={nalatenschapMarker}
              scenarioPending={scenarioPending}
              stopPadPending={stopPadPending}
              viewMonteCarloOverlay={viewMonteCarloOverlay}
              canonicalDailyRate={canonicalDailyRate}
              viewHouseholdOverlays={viewHouseholdOverlays}
              userAowAge={userAowAge}
              planningMode={planningMode}
              isFixedAnchorMode={isFixedAnchorMode}
              chartEventOverlay={chartEventOverlay}
              handleChartEventClick={handleChartEventClick}
              handleChartEventDragEnd={handleChartEventDragEnd}
              handleChartEventDragMove={handleChartEventDragMove}
              handleChartClusterOpen={handleChartClusterOpen}
              viewWealthCompositionRows={viewWealthCompositionRows}
              kernelHousingSale={kernelHousingSale}
              homeExcludedFromProgress={homeExcludedFromProgress}
              setSelectedYearAge={setSelectedYearAge}
              incomeExpenseExpanded={incomeExpenseExpanded}
              setIncomeExpenseExpanded={setIncomeExpenseExpanded}
              ieViewMode={ieViewMode}
              setIeViewMode={setIeViewMode}
              viewIeBreakdownResult={viewIeBreakdownResult}
              eventsForTimeline={eventsForTimeline}
              setClusterSheet={setClusterSheet}
              naturalMilestones={naturalMilestones}
              router={router}
              setEventPaneEditingId={setEventPaneEditingId}
              setEventPaneMode={setEventPaneMode}
              setEventPaneOpen={setEventPaneOpen}
              handleEventDragEnd={handleEventDragEnd}
              eventStopAge={eventStopAge}
              isPensioenMode={isPensioenMode}
              setActiveFaseModal={setActiveFaseModal}
            />

            <CanvasLegenda
              scenariosExpanded={scenariosExpanded}
              scenarioData={scenarioData}
              fireParams={fireParams}
              setActiveModal={setActiveModal}
              mcExpanded={mcExpanded}
              mcData={mcData}
              mcMarge={mcMarge}
              liquidWealthPoints={liquidWealthPoints}
              simResult={simResult}
              setSimModalOpen={setSimModalOpen}
              isFixedAnchorMode={isFixedAnchorMode}
              ankerStop={ankerStop}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
