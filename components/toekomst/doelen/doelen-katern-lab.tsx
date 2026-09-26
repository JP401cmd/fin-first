'use client'
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

/**
 * Het doelscenario-lab in katern Doelen (ADR 0179 D4/D7; fase 1 stap 16, fase 4).
 *
 * Drie hosts, allemaal op dezelfde provider (de knopstanden blijven staan bij een
 * katernwissel; niets leest de route, D8):
 * - `DoelenKaternLab plek="kolom"` — rechts naast de grafiek in de canvas-rij, desktop
 *   (de layout rendert hem via `CanvasZijkolom`), knopvorm `knopWeergave.desktop`;
 * - `DoelenKaternLab plek="onder-koppen"` — direct onder de katern-koppen, mobiel
 *   (`lg:hidden`), knopvorm `knopWeergave.mobiel`, opslaan-actie in de shell-action-bar;
 * - `DoelenKaternLabSheets` — de drie sheets, precies één keer gemount (op de page).
 *
 * Beide plekken staan in de DOM; CSS verbergt de plek die niet bij het breekpunt hoort
 * (geen hydratiesprong). Het anker `#verken-je-aannames` en de scroll-ref gaan alleen naar
 * de zichtbare plek (`useIsLgUp`), zodat deeplinks en "Bijwerken →" daar landen.
 */

import { useIsLgUp } from '@/lib/hooks/use-media-query'
import { DoelenLab, type DoelenLabPlek } from '@/components/toekomst/doelen/doelen-lab'
import { DoelenLabSheets } from '@/components/toekomst/doelen/doelen-lab-sheets'
import type { KnopBreekpunt } from '@/lib/horizon/toekomst-scenario'
import {
  useToekomstBron,
  useToekomstPerspectiefContext,
  useToekomstOverlayContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
  useToekomstEuroContext,
} from '@/components/toekomst/state/toekomst-state-provider'

/** Welk breekpunt bij welke plek hoort: de kolom is desktop, onder de koppen is mobiel. */
export const BREEKPUNT_VAN_PLEK: Record<DoelenLabPlek, KnopBreekpunt> = {
  kolom: 'desktop',
  'onder-koppen': 'mobiel',
}

/** Zichtbaarheid per plek: de CSS-kant van de keuze (Tailwind `lg` = 1024px). */
export const PLEK_ZICHTBAARHEID: Record<DoelenLabPlek, string> = {
  kolom: '',
  'onder-koppen': 'lg:hidden',
}

export function DoelenKaternLab({ plek }: { plek: DoelenLabPlek }) {
  const breekpunt = BREEKPUNT_VAN_PLEK[plek]
  // Het anker hoort bij de plek die op dit breekpunt zichtbaar is. Raakt alleen id en ref,
  // niet de layout; de server rendert hem (mobile-first) onder de koppen.
  const isLg = useIsLgUp()
  const anker = plek === 'kolom' ? isLg : !isLg
  const { verkenSectieZichtbaar } = useToekomstPerspectiefContext()
  const { verkenSectionRef } = useToekomstOverlayContext()
  const {
    knopWeergave,
    setKnopWeergave,
    doelBlok,
    setDoelSheetOpen,
    doelSaving,
    setDoelLoslatenOpen,
    setStopPlanConfirmOpen,
    stopPlanSaving,
    setStopPlanError,
    firstDragHintVisible,
    dismissFirstDragHint,
    doelVastleggenMogelijk,
    doelBijwerkenMogelijk,
    effectiveStopAge,
    planEindVorm,
    labGrenzenPending,
    labZone,
    planIsDezeStop,
    handleScenarioReset,
    labOpslaanToestand,
    handleDoelHerstellen,
    labKnoppen,
    labFormatters,
  } = useToekomstScenarioContext()
  const { simResult, heroVraag } = useToekomstSimContext()
  const { labUitkomstRegel } = useToekomstEuroContext()

  // Zonder simResult geen lab — zoals vroeger in de grafiekkaart.
  if (!simResult) return null
  return (
    <div className={PLEK_ZICHTBAARHEID[plek]} data-lab-plek={plek}>
      <DoelenLab
        plek={plek}
        anker={anker}
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
        knopWeergave={knopWeergave[breekpunt]}
        setKnopWeergave={(vorm) => setKnopWeergave(breekpunt, vorm)}
        labFormatters={labFormatters}
        planIsDezeStop={planIsDezeStop}
        setStopPlanError={setStopPlanError}
        setStopPlanConfirmOpen={setStopPlanConfirmOpen}
        stopPlanSaving={stopPlanSaving}
        effectiveStopAge={effectiveStopAge}
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
    </div>
  )
}

/** De drie sheets van het lab (vastleggen, loslaten, stopmoment) — één keer gemount. */
export function DoelenKaternLabSheets() {
  const { initialData } = useToekomstBron()
  const {
    doelSheetOpen,
    setDoelSheetOpen,
    doelSaving,
    doelLoslatenOpen,
    setDoelLoslatenOpen,
    stopPlanConfirmOpen,
    setStopPlanConfirmOpen,
    stopPlanSaving,
    stopPlanError,
    doelActief,
    labPromotie,
    effectiveStopAge,
    handleDoelVastleggen,
    handleDoelLoslaten,
    handleStopPlanBevestigen,
  } = useToekomstScenarioContext()
  const { userAowAge, simResult, planAnchor, isFixedAnchorMode, ankerStop } = useToekomstSimContext()
  const { viewDoelPreviews } = useToekomstEuroContext()
  return (
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
  )
}
