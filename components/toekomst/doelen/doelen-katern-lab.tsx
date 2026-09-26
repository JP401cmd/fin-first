'use client'
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

/**
 * Het doelscenario-lab in katern Doelen (ADR 0179 D4, fase 1 stap 16; kaart GW5).
 *
 * Verhuist het lab (`DoelenLab`, blok M) en zijn sheets (`DoelenLabSheets`, blok P)
 * van Plan naar `/toekomst/doelen`, bóven de doelenlijst. De state en de afleidingen
 * blijven in de provider (scenario-concern), dus de knopstanden blijven staan bij een
 * katernwissel. Leest de route niet (D8); de doelscenario-lijn tekent het canvas uit
 * dezelfde provider.
 */

import { DoelenLab } from '@/components/toekomst/doelen/doelen-lab'
import { DoelenLabSheets } from '@/components/toekomst/doelen/doelen-lab-sheets'
import {
  useToekomstBron,
  useToekomstPerspectiefContext,
  useToekomstOverlayContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
  useToekomstEuroContext,
} from '@/components/toekomst/state/toekomst-state-provider'

export function DoelenKaternLab() {
  const { initialData } = useToekomstBron()
  const { verkenSectieZichtbaar } = useToekomstPerspectiefContext()
  const { verkenSectionRef } = useToekomstOverlayContext()
  const {
    scenarioReturnDeltas,
    setScenarioReturnDeltas,
    knopWeergave,
    setKnopWeergave,
    doelBlok,
    doelSheetOpen,
    setDoelSheetOpen,
    doelSaving,
    doelLoslatenOpen,
    setDoelLoslatenOpen,
    stopPlanConfirmOpen,
    setStopPlanConfirmOpen,
    stopPlanSaving,
    stopPlanError,
    setStopPlanError,
    firstDragHintVisible,
    dismissFirstDragHint,
    doelActief,
    whatIfBaseline,
    labPromotie,
    doelVastleggenMogelijk,
    doelBijwerkenMogelijk,
    categorieReturnGroups,
    effectiveStopAge,
    planEindVorm,
    labGrenzenPending,
    labZone,
    planIsDezeStop,
    handleScenarioReset,
    labOpslaanToestand,
    handleDoelVastleggen,
    handleDoelLoslaten,
    handleStopPlanBevestigen,
    handleDoelHerstellen,
    labKnoppen,
    labFormatters,
  } = useToekomstScenarioContext()
  const { userAowAge, simResult, planAnchor, isFixedAnchorMode, ankerStop, heroVraag } = useToekomstSimContext()
  const { labUitkomstRegel, viewDoelPreviews } = useToekomstEuroContext()

  return (
    <>
      {/* Zonder simResult geen lab — zoals vroeger in de grafiekkaart. */}
      {simResult ? (
        <DoelenLab
          verkenSectieZichtbaar={verkenSectieZichtbaar}
          verkenSectionRef={verkenSectionRef}
          firstDragHintVisible={firstDragHintVisible}
          dismissFirstDragHint={dismissFirstDragHint}
          heroVraag={heroVraag}
          labKnoppen={labKnoppen}
          planEindVorm={planEindVorm}
          labUitkomstRegel={labUitkomstRegel}
          labZone={labZone}
          labGrenzenPending={labGrenzenPending}
          knopWeergave={knopWeergave}
          setKnopWeergave={setKnopWeergave}
          labFormatters={labFormatters}
          planIsDezeStop={planIsDezeStop}
          setStopPlanError={setStopPlanError}
          setStopPlanConfirmOpen={setStopPlanConfirmOpen}
          stopPlanSaving={stopPlanSaving}
          effectiveStopAge={effectiveStopAge}
          whatIfBaseline={whatIfBaseline}
          categorieReturnGroups={categorieReturnGroups}
          scenarioReturnDeltas={scenarioReturnDeltas}
          setScenarioReturnDeltas={setScenarioReturnDeltas}
          labOpslaanToestand={labOpslaanToestand}
          doelBlok={doelBlok}
          doelSaving={doelSaving}
          doelVastleggenMogelijk={doelVastleggenMogelijk}
          doelBijwerkenMogelijk={doelBijwerkenMogelijk}
          setDoelSheetOpen={setDoelSheetOpen}
          handleDoelHerstellen={handleDoelHerstellen}
          setDoelLoslatenOpen={setDoelLoslatenOpen}
          handleScenarioReset={handleScenarioReset}
        />
      ) : null}

      <DoelenLabSheets
        doelSheetOpen={doelSheetOpen}
        setDoelSheetOpen={setDoelSheetOpen}
        viewDoelPreviews={viewDoelPreviews}
        doelActief={doelActief}
        doelSaving={doelSaving}
        handleDoelVastleggen={handleDoelVastleggen}
        isFixedAnchorMode={isFixedAnchorMode}
        planAnchor={planAnchor}
        labPromotie={labPromotie}
        ankerStop={ankerStop}
        simResult={simResult}
        initialData={initialData}
        doelLoslatenOpen={doelLoslatenOpen}
        handleDoelLoslaten={handleDoelLoslaten}
        setDoelLoslatenOpen={setDoelLoslatenOpen}
        stopPlanConfirmOpen={stopPlanConfirmOpen}
        stopPlanSaving={stopPlanSaving}
        stopPlanError={stopPlanError}
        effectiveStopAge={effectiveStopAge}
        userAowAge={userAowAge}
        handleStopPlanBevestigen={handleStopPlanBevestigen}
        setStopPlanConfirmOpen={setStopPlanConfirmOpen}
      />
    </>
  )
}
