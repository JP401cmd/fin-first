'use client'

/**
 * De overlay-host van /toekomst (ADR 0179 fase 1 stap 15, besluit Q5): rendert
 * `ToekomstOverlays` met de state uit de provider. Staat in de `(katern)`-layout, dus
 * een overlay die vanuit het canvas opent (fase-pane, jaar-details, gebeurtenis)
 * blijft staan bij een katernwissel (kaart V5).
 *
 * Verplaatst uit de compositie van `components/app/horizon/horizon-client.tsx`
 * (@ ec883d283, `HorizonCompositie`): alleen de aanroep met zijn props; de overlays
 * zelf staan in `toekomst-overlays.tsx`. Leest de route niet (D8).
 */

import { useRouter } from 'next/navigation'
import { ToekomstOverlays } from '@/components/toekomst/overlays/toekomst-overlays'
import {
  useToekomstBron,
  useToekomstPerspectiefContext,
  useToekomstOverlayContext,
  useToekomstSimContext,
  useToekomstLagenContext,
} from '@/components/toekomst/state/toekomst-state-provider'

export function ToekomstOverlayHost() {
  const { initialData } = useToekomstBron()
  const { refreshData, isHouseholdView, householdInput, householdRetireInfo } = useToekomstPerspectiefContext()
  const {
    activeModal,
    setActiveModal,
    simModalOpen,
    setSimModalOpen,
    activeFaseModal,
    setActiveFaseModal,
    householdRetireOpen,
    setHouseholdRetireOpen,
    eventPaneOpen,
    setEventPaneOpen,
    eventPaneEditingId,
    setEventPaneEditingId,
    eventPaneMode,
    setEventPaneMode,
    clusterSheet,
    setClusterSheet,
    selectedNaturalMilestone,
    setSelectedNaturalMilestone,
    selectedYearAge,
    setSelectedYearAge,
  } = useToekomstOverlayContext()
  const {
    input,
    fireParams,
    withdrawalStrategyConfig,
    fireStrategy,
    kernelRawProfile,
    userAowAge,
    debts,
    events,
    fireSwr,
    canonicalDailyRate,
    fire,
    healthScoreInput,
    simResult,
    simCashflows,
    unifiedRows,
    displayEvents,
    eventPanePreviewBaseline,
    loadData,
    effectiveInput,
    currentAge,
    eventStopAge,
    effectiveFireTarget,
    overgangData,
    onttrekkingData,
    displayUnifiedRows,
    displaySimRows,
    erfgenamen,
    partnerAowBedrag,
    eigenHuisMortgageIds,
  } = useToekomstSimContext()
  const { naturalMilestones, effectiveChartPrimaryBasis } = useToekomstLagenContext()
  const router = useRouter()

  // Type-vernauwing ná alle hooks (V2); de foutstaat zelf toont `ToekomstRekenGrens`.
  if (!fire) return null

  return (
    <ToekomstOverlays
      simResult={simResult}
      simModalOpen={simModalOpen}
      setSimModalOpen={setSimModalOpen}
      simCashflows={simCashflows}
      currentAge={currentAge}
      effectiveInput={effectiveInput}
      fireParams={fireParams}
      canonicalDailyRate={canonicalDailyRate}
      unifiedRows={unifiedRows}
      activeFaseModal={activeFaseModal}
      setActiveFaseModal={setActiveFaseModal}
      fire={fire}
      initialData={initialData}
      debts={debts}
      displayEvents={displayEvents}
      healthScoreInput={healthScoreInput}
      kernelRawProfile={kernelRawProfile}
      overgangData={overgangData}
      fireStrategy={fireStrategy}
      onttrekkingData={onttrekkingData}
      erfgenamen={erfgenamen}
      partnerAowBedrag={partnerAowBedrag}
      activeModal={activeModal}
      setActiveModal={setActiveModal}
      effectiveFireTarget={effectiveFireTarget}
      isHouseholdView={isHouseholdView}
      householdInput={householdInput}
      fireSwr={fireSwr}
      loadData={loadData}
      router={router}
      householdRetireInfo={householdRetireInfo}
      householdRetireOpen={householdRetireOpen}
      setHouseholdRetireOpen={setHouseholdRetireOpen}
      refreshData={refreshData}
      input={input}
      withdrawalStrategyConfig={withdrawalStrategyConfig}
      eventPaneOpen={eventPaneOpen}
      setEventPaneOpen={setEventPaneOpen}
      eventPaneEditingId={eventPaneEditingId}
      eventPaneMode={eventPaneMode}
      eventPanePreviewBaseline={eventPanePreviewBaseline}
      selectedNaturalMilestone={selectedNaturalMilestone}
      setSelectedNaturalMilestone={setSelectedNaturalMilestone}
      clusterSheet={clusterSheet}
      setClusterSheet={setClusterSheet}
      eventStopAge={eventStopAge}
      naturalMilestones={naturalMilestones}
      setEventPaneEditingId={setEventPaneEditingId}
      setEventPaneMode={setEventPaneMode}
      selectedYearAge={selectedYearAge}
      setSelectedYearAge={setSelectedYearAge}
      displayUnifiedRows={displayUnifiedRows}
      displaySimRows={displaySimRows}
      events={events}
      userAowAge={userAowAge}
      effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
      eigenHuisMortgageIds={eigenHuisMortgageIds}
    />
  )
}
