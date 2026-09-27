'use client'
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

/**
 * Het canvas van /toekomst (ADR 0179 D1/D3/D5): de grafiekkaart die de
 * `(katern)`-layout rendert — op desktop onder de katern-tabbladen, mobiel boven de
 * koppen — en die bij een katernwissel gemonteerd blijft (GW1).
 *
 * Fase 2 (stroom W1):
 * - Boven de grafiek alleen (wireframe §4.3 regel 7): de modus-switch Vermogen ·
 *   Samenstelling · Geldstroom, Lagen, de canvas-i ("Zo werkt je grafiek", met de
 *   tips-schakelaar erin) en de zoom op de grafiek. De jaar-op-jaar-tabel opent vanuit
 *   de link in Plan (spec §4.2 regel 10: één ingang). De tien pills en de
 *   `ChartOverlayExplainer`-blokken zijn vervallen.
 * - Per katern (spec §4.5) via `useActiefKatern()` + `canvasStand`: de keuze van de
 *   gebruiker (modus, lagen) blijft staan; een katern voegt alleen vaste lagen toe of
 *   beperkt wat er kan. Alle filtering gebeurt op feeds die al over de euro-grens zijn.
 * - Onder het canvas: de Marktcheck-getallen (uit dezelfde marktcheck-run), de
 *   legenda (alleen bij twee of meer reeksen), en in Plan de aannamesregel met de link
 *   naar Instellingen (D5); in Doelen buiten Vermogen de regel dat Samenstelling en
 *   Geldstroom het plan volgen.
 *
 * Katern-componenten lezen de route niet (D8); het canvas krijgt het katern uit de
 * layout-laag (`components/toekomst/layout/actief-katern.tsx`).
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import { useViewportHoogte } from '@/lib/hooks/use-viewport-hoogte'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import type { OverlayBalloonDef } from '@/components/app/horizon/toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from '@/components/app/horizon/toekomst-overlay-balloons'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getFireProjectionTips, getIncomeExpenseTips, getWealthCompositionTips } from '@/lib/chart-tips'
import {
  CANVAS_UITLEG_TITEL,
  DOELEN_TOONT_DOELSCENARIO_LABEL,
  DOELEN_VOLGT_PLAN_REGEL,
  type GeldstroomSub,
} from '@/lib/horizon/katern-copy'
import type { IeViewMode, OverlayEmphasis } from '@/components/toekomst/state/types'
import { useActiefKatern } from '@/components/toekomst/layout/actief-katern'
import { KATERN_HREF } from '@/components/toekomst/layout/katern-routes'
import { CanvasKop } from '@/components/toekomst/canvas/canvas-kop'
import { CanvasTipsToggle } from '@/components/toekomst/canvas/canvas-tips-toggle'
import { ModusSwitch } from '@/components/toekomst/canvas/modus-switch'
import { LagenMenu } from '@/components/toekomst/canvas/lagen-menu'
import { CanvasUitleg } from '@/components/toekomst/canvas/canvas-uitleg'
import { CanvasGrafiek, type CanvasDoelscenarioFeed } from '@/components/toekomst/canvas/canvas-grafiek'
import { CanvasLegenda } from '@/components/toekomst/canvas/canvas-legenda'
import { MarktcheckGetallen } from '@/components/toekomst/canvas/marktcheck-getallen'
import { Aannamesregel } from '@/components/toekomst/canvas/aannamesregel'
import { aantalReeksen, canvasStand } from '@/components/toekomst/canvas/canvas-stand'
import { useKolomPlotHoogte } from '@/components/toekomst/canvas/use-kolom-plot-hoogte'
import {
  useToekomstBron,
  useToekomstPerspectiefContext,
  useToekomstOverlayContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
  useToekomstLagenContext,
  useToekomstEuroContext,
} from '@/components/toekomst/state/toekomst-state-provider'

/** Naam van de doelscenario-lijn in de scenario-overlays (`use-toekomst-scenario.ts`). */
const DOELSCENARIO_OVERLAY = 'wat-als'
/** Geen meegroeiende doellijn (Instellingen); stabiel, zodat de grafiek niet hertekent. */
const GEEN_FACTOREN: { age: number; factor: number }[] = []

/**
 * De canvas-rij op desktop (ADR 0179 D7, spec §4.2 regel 9; eigenaarsbesluit 27 sep):
 * grafiek links, een kolom rechts — in Doelen het lab (standaard harp), zodat een knop en
 * zijn effect samen in beeld staan; in Plan de levensgebeurtenissen. Dezelfde kolommen in
 * beide katernen, zodat de grafiek bij een wissel op dezelfde plek blijft. Onder `lg` blijft
 * het één kolom en staan lab en gebeurtenissen onder de katern-koppen.
 */
export const DOELEN_CANVAS_RIJ = 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]'
/** De rechterkolom: alleen vanaf `lg`, met een haarlijn als scheiding. */
export const DOELEN_CANVAS_ZIJKOLOM = 'relative hidden min-w-0 border-l border-[var(--border-ed)] lg:block'
/**
 * De inhoud van de kolom:
 * - `maatgevend` (Doelen): in de gewone stroom; de natuurlijke hoogte is de maat van de rij;
 * - `volgend` (Plan): absoluut over de hele kolom, dus zonder eigen bijdrage aan de
 *   rijhoogte; een lange lijst scrolt in de kolom zelf (max-hoogte = de rijhoogte).
 */
export const CANVAS_KOLOM_INHOUD: Record<'maatgevend' | 'volgend', string> = {
  maatgevend: 'p-5',
  volgend: 'absolute inset-0 overflow-y-auto overscroll-contain p-5',
}
/** De actierij onder grafiek en kolom (Doelen, desktop): over de volle breedte. */
export const DOELEN_CANVAS_ACTIERIJ = 'hidden border-t border-[var(--border-ed)] px-5 py-3 md:px-8 lg:block lg:empty:hidden'

export function ToekomstCanvas({
  zijkolom = null,
  actierij = null,
}: { zijkolom?: ReactNode; actierij?: ReactNode } = {}) {
  const {
    partnerName,
    isPartnerView,
    householdMainLine,
    partnerLine,
    usePartnerMainLine,
    useHouseholdMainLine,
    perspectiveHero,
    hasPerspectiveHero,
    verkenSectieZichtbaar,
  } = useToekomstPerspectiefContext()
  const {
    setActiveModal,
    setActiveFaseModal,
    setEventPaneOpen,
    setEventPaneEditingId,
    setEventPaneMode,
    setClusterSheet,
    setSelectedYearAge,
  } = useToekomstOverlayContext()
  const {
    hasDoelLijn,
    labZone,
    nalatenschapMarker,
    doelGrootboek,
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
    planEindvorm,
    fireStrategy,
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
    scenarioData,
    mcData,
    mcPending,
    mcFailed,
    ieViewMode,
    setIeViewMode,
    canvasModus,
    setCanvasModus,
    canvasLagenKeuze,
    toggleLaag,
    bouwChartEventOverlay,
    bouwEventsForTimeline,
    lifelineAge,
    setLifelineAge,
    overlayPrefRestored,
    persistOverlayVisible,
    handleOverlayExit,
    overlayVisible,
    naturalMilestones,
    goalChartMarkers,
    handleChartEventClick,
    handleChartClusterOpen,
    handleChartEventDragMove,
    handleChartEventDragEnd,
    dualBasisAvailable,
    effectiveChartPrimaryBasis,
    secondaryLineVisible,
    mcMarge,
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
    viewDoelDisplaySimRows,
    viewDoelWealthCompositionRows,
    viewDoelIeBreakdownResult,
  } = useToekomstEuroContext()
  const { masked } = useMaskedAmounts()
  const router = useRouter()
  const katern = useActiefKatern()
  // De hoogte van de Doelen-grafiek hangt aan het breekpunt en (mobiel) aan de viewport.
  const breed = useIsLgUp()
  const viewportHoogte = useViewportHoogte()

  // overlayEmphasis: welke grafiekfase een gehoverde/gefocuste ballon accentueert.
  const [overlayEmphasis, setOverlayEmphasis] = useState<OverlayEmphasis>(null)

  // De kolom naast de grafiek: in Doelen het lab, in Plan de gebeurtenissen (27 sep).
  const { gebeurtenissen: gebeurtenissenBron } = useToekomstBron()

  // De harp is maatgevend: in Doelen meet de canvas de lab-kolom en onthoudt de plothoogte
  // die daarbij hoort; Plan gebruikt dezelfde (de canvas blijft gemonteerd bij de wissel).
  const [kolomPlotHoogte, setKolomPlotHoogte] = useState<number | null>(null)

  // ── De stand van het canvas in dit katern (spec §4.5) en deze weergave (§4.7) ──
  const eenvoudig = displayMode === 'simple'
  const heeftDoelen = goalChartMarkers.length > 0
  // Doelrijen voor Samenstelling en Geldstroom: alleen solo (het lab is solo, ADR 0170 B10).
  const doelscenarioRijen = doelGrootboek != null && verkenSectieZichtbaar
  const stand = useMemo(
    () =>
      canvasStand(
        katern,
        { modus: canvasModus, lagen: canvasLagenKeuze },
        { doelen: heeftDoelen, doelscenario: hasDoelLijn, metHuis: dualBasisAvailable, doelscenarioRijen },
        { eenvoudig, breed, viewportHoogte, kolomPlotHoogte },
      ),
    [katern, canvasModus, canvasLagenKeuze, heeftDoelen, hasDoelLijn, dualBasisAvailable, doelscenarioRijen, eenvoudig, breed, viewportHoogte, kolomPlotHoogte],
  )
  // De kolom (desktop): in Doelen bij een run (zonder run geen lab), in Plan zodra er
  // gebeurtenissen-data is — de pagina-plek is vanaf `lg` verborgen, dus de kolom moet er
  // dan altijd staan, ook zonder run.
  const kolomSoort = stand.kolom
  const metZijkolom =
    zijkolom != null &&
    ((kolomSoort === 'maatgevend' && simResult != null) || (kolomSoort === 'volgend' && gebeurtenissenBron != null))
  const { kolomRef: kolomMeetRef, grafiekRef: grafiekMeetRef } = useKolomPlotHoogte({
    meten: metZijkolom && kolomSoort === 'maatgevend' && breed,
    huidigePlot: stand.plotHoogte,
    setOnthouden: setKolomPlotHoogte,
  })
  // ADR 0179 fase 4: in Doelen tonen Samenstelling en Geldstroom het doelscenario, uit
  // feeds die al over de euro-grens zijn en uit dezelfde run als de stippellijn.
  const doelscenarioFeed = useMemo<CanvasDoelscenarioFeed | null>(
    () =>
      stand.grafiekBron === 'doelscenario' && doelGrootboek
        ? {
            viewWealthCompositionRows: viewDoelWealthCompositionRows ?? [],
            viewSimRows: viewDoelDisplaySimRows ?? [],
            viewIeBreakdownResult: viewDoelIeBreakdownResult,
            fireAge: doelGrootboek.fireAge,
            fireAgeFractional: doelGrootboek.fireAgeFractional,
            housingSaleAge: doelGrootboek.kernelHousingSale?.age ?? null,
          }
        : null,
    [stand.grafiekBron, doelGrootboek, viewDoelWealthCompositionRows, viewDoelDisplaySimRows, viewDoelIeBreakdownResult],
  )
  const { gebeurtenissen, mijlpalen, doelen, doelscenario, marktcheck, rendementScenarios, metHuis } = stand.lagen
  // De actierij onder de rij: alleen in Doelen, naast een kolom (desktop).
  const metActierij = metZijkolom && kolomSoort === 'maatgevend' && actierij != null

  // Markers en tijdlijn volgen de lagen van dít katern (vaste lagen erbij), zonder de
  // keuze van de gebruiker te overschrijven.
  const chartEventOverlay = useMemo(
    () => bouwChartEventOverlay({ gebeurtenissen, mijlpalen, doelen }),
    [bouwChartEventOverlay, gebeurtenissen, mijlpalen, doelen],
  )
  const eventsForTimeline = useMemo(
    () => bouwEventsForTimeline({ gebeurtenissen, mijlpalen }),
    [bouwEventsForTimeline, gebeurtenissen, mijlpalen],
  )
  // Lijnen: de doelscenario-lijn en de rendementsvarianten volgen hun laag. Filtert
  // een feed die al over de euro-grens is (`view*`); geen tweede omzetting.
  const zichtbareScenarioOverlays = useMemo(
    () =>
      viewCombinedScenarioOverlays.filter((o) =>
        o.name === DOELSCENARIO_OVERLAY ? doelscenario : rendementScenarios,
      ),
    [viewCombinedScenarioOverlays, doelscenario, rendementScenarios],
  )
  const zichtbareMonteCarlo = marktcheck ? viewMonteCarloOverlay : undefined
  const tweedeLijnZichtbaar = secondaryLineVisible && metHuis
  // Instellingen: alleen de hoofdlijn met de gebeurtenis-markers (spec §4.5). De
  // doellijnen en de doelscenario-attributen (verschilvlak, nalatenschap-bol) vallen weg.
  const { alleenHoofdlijn } = stand

  // Geldstroom in Eenvoudig: alleen Lijnen (spec §4.7). De modus-switch verbergt
  // Bronnen al via HideInSimple; hier bewaakt de host de waarde, zodat een keuze uit
  // Volledig niet als Bronnen doorwerkt. De keuze zelf blijft staan.
  const ieWeergave: IeViewMode = eenvoudig ? 'lines' : ieViewMode
  const geldstroomSub: GeldstroomSub = ieWeergave === 'breakdown' ? 'bronnen' : 'lijnen'

  const reeksen = aantalReeksen({
    doelscenario,
    marktcheck,
    rendementScenarios,
    metHuis: tweedeLijnZichtbaar,
  })

  // Waar de grafiek op rust (D5). De eindleeftijd is de ingestelde, zoals de
  // Instellingen-rij hem noemt ("Tot 90 jaar"), niet `displayEndAge`: dat is het
  // horizonplafond van de kernel (100 bij eeuwigdurend). `eindvorm` gaat al mee voor de
  // kopij van het eind-segment (katern-copy, C1); Aannamesregel leest hem nog niet.
  const aannames = simResult
    ? {
        stop: isFixedAnchorMode ? ankerStop : null,
        eindleeftijd: fireStrategy?.endAge ?? simResult.displayEndAge,
        eindvorm: planEindvorm,
        // Weergave in procenten; de fracties komen uit dezelfde fireParams waarop de
        // projectie rekent.
        inflatiePct: fireParams.inflationRate * 100,
        rendementPct: fireParams.grossReturn * 100,
        gebeurtenissen: events.length,
      }
    : null

  // ── Ballon-definities — puur informatieve uitleg bij de grafiek ──
  const toekomstOverlayBalloons: OverlayBalloonDef[] = TOEKOMST_OVERLAY_BALLOONS

  // "Zo werkt je grafiek" per modus; de tips-ballonnen bestaan alleen in Vermogen.
  const uitlegTips = simResult
    ? stand.modus === 'vermogen'
      ? getFireProjectionTips({
          fireAge: simResult.fireAge,
          aowAge: userAowAge.fractional,
          currentAge: currentAge ?? 30,
          hasMonteCarlo: !!zichtbareMonteCarlo,
          hasBaseline: false,
          planningMode,
          // ADR 0129 — onder een vast anker noemt de spotlight het stopmoment.
          stopAnchorFixed: isFixedAnchorMode,
          stopAge: simResult.vastStopLeeftijd ?? null,
        })
      : stand.modus === 'samenstelling'
        ? getWealthCompositionTips({
            fireAge: simResult.fireAge,
            aowAge: userAowAge.fractional,
            currentAge: currentAge ?? 30,
          })
        : getIncomeExpenseTips({
            fireAge: simResult.fireAge,
            aowAge: userAowAge.fractional,
            viewMode: ieWeergave,
          })
    : []

  // De kaart tilt niet op hover (`no-hover-lift`): ze is zelf niet klikbaar, en op desktop
  // liggen de katern-tabbladen erop en sluit het katern eronder aan (eigenaarswens 27 sep)
  // — een lift van 1px zou beide losscheuren. Dat dekt ook de tips-modus, waar een
  // transform de boven de scrim getilde grafiek zou vangen (globals.css). Op desktop is de
  // basislijn van de tabbladen de bovenrand van de kaart (`lg:-mt-px`: één lijn, geen twee).
  return (
    <section
      data-testid="horizon-hero"
      data-katern={katern}
      className={`card-editorial no-hover-lift overflow-hidden lg:-mt-px ${stand.alleenDesktop ? 'hidden lg:block' : ''}`}
    >
      {/* Module-active accent (Horizon-500 op /toekomst/**), alleen mobiel: op desktop
          draagt de actieve tab erboven het accent en loopt die naadloos over in de kaart. */}
      <div className="h-1.5 lg:hidden" style={{ background: 'var(--module-active-500)' }} />

      <div
        className={metZijkolom ? DOELEN_CANVAS_RIJ : undefined}
        data-testid={metZijkolom ? 'doelen-canvas-rij' : undefined}
        data-kolom={metZijkolom ? (kolomSoort ?? undefined) : undefined}
      >
      {/* `lg:self-start`: de grafiekkolom houdt zijn natuurlijke hoogte (de meting van de
          harp-maat leest die), de kolom ernaast rekt mee met de rij. */}
      <div
        ref={grafiekMeetRef}
        className={`min-w-0 p-4 sm:p-6 md:p-8 ${katern === 'doelen' ? 'max-lg:py-3' : ''} ${metZijkolom ? 'lg:self-start lg:py-5' : ''}`}
      >
        <CanvasKop
          hasPerspectiveHero={hasPerspectiveHero}
          isPartnerView={isPartnerView}
          perspectiveHero={perspectiveHero}
          kicker={<PerspectiveContextLabel />}
          modus={
            simResult && stand.toonModusSwitch ? (
              <ModusSwitch
                value={stand.modus}
                onChange={setCanvasModus}
                sub={geldstroomSub}
                onSubChange={(s) => setIeViewMode(s === 'bronnen' ? 'breakdown' : 'lines')}
                modi={stand.modi}
              />
            ) : null
          }
          acties={
            simResult ? (
              <>
                {stand.toonLagenKnop && (
                  <LagenMenu
                    lagen={stand.lagen}
                    vast={stand.vast}
                    beschikbaar={stand.beschikbaar}
                    onToggle={toggleLaag}
                    hoofdlijn={effectiveChartPrimaryBasis}
                  />
                )}
                <ChartTips
                  storageKey="horizon_main_chart"
                  title={CANVAS_UITLEG_TITEL}
                  tips={uitlegTips}
                  align="right"
                  footer={
                    stand.modus === 'vermogen' ? (
                      <CanvasTipsToggle
                        overlayVisible={overlayVisible}
                        handleOverlayExit={handleOverlayExit}
                        persistOverlayVisible={persistOverlayVisible}
                      />
                    ) : undefined
                  }
                />
              </>
            ) : null
          }
        />

        {/* Zonder simResult rendert het canvas alleen zijn kopregel (de vroegere
            WidgetEmpty-lege-staat was onbereikbaar — fase 1 stap 1). */}
        {simResult ? (
          <>
            {stand.toonReadout && (
              <CanvasUitleg modus={stand.modus} viewReadoutData={viewReadoutData} lifelineAge={lifelineAge} />
            )}

            <CanvasGrafiek
              currentAge={currentAge}
              chartEndAge={chartEndAge}
              projectiePending={projectiePending}
              overlayVisible={overlayVisible}
              modus={stand.modus}
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
              viewFireTarget={alleenHoofdlijn ? undefined : viewFireTarget}
              showDualFireTarget={alleenHoofdlijn ? false : showDualFireTarget}
              viewFireTargetInclHome={viewFireTargetInclHome}
              viewTargetEndPortfolio={alleenHoofdlijn ? undefined : viewTargetEndPortfolio}
              viewTargetInflationFactors={alleenHoofdlijn ? GEEN_FACTOREN : viewTargetInflationFactors}
              dualBasisAvailable={dualBasisAvailable}
              viewLiquidWealthPoints={viewLiquidWealthPoints}
              effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
              secondaryLineVisible={tweedeLijnZichtbaar}
              partnerName={partnerName}
              viewCombinedScenarioOverlays={zichtbareScenarioOverlays}
              labZone={alleenHoofdlijn ? null : labZone}
              nalatenschapMarker={alleenHoofdlijn ? undefined : nalatenschapMarker}
              scenarioPending={scenarioPending}
              stopPadPending={stopPadPending}
              viewMonteCarloOverlay={zichtbareMonteCarlo}
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
              ieViewMode={ieWeergave}
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
              toonFasebalk={stand.toonFasebalk}
              toonReadout={stand.toonReadout}
              toonTijdlijn={stand.toonTijdlijn}
              hoofdlijnGedempt={stand.hoofdlijnGedempt}
              plotHoogte={stand.plotHoogte}
              samenstellingHoogte={stand.samenstellingHoogte}
              samenstellingPastInVermogen={stand.samenstellingPastInVermogen}
              doelscenario={doelscenarioFeed}
            />

            {/* Drie vrijheidsleeftijden onder de Marktcheck-band (spec §7.6), uit
                dezelfde marktcheck-run; onder een vast anker levert de kern `null`. */}
            {stand.modus === 'vermogen' && marktcheck && mcData && (
              <MarktcheckGetallen leeftijden={mcData.vrijheidsleeftijden} className="mt-2" />
            )}

            {stand.toonLegenda && stand.modus === 'vermogen' && (
              <CanvasLegenda
                aantalReeksen={reeksen}
                rendementScenarios={rendementScenarios}
                scenarioData={scenarioData}
                fireParams={fireParams}
                setActiveModal={setActiveModal}
                marktcheck={marktcheck}
                mcData={mcData}
                mcMarge={mcMarge}
                mcPending={mcPending}
                mcFailed={mcFailed}
                liquidWealthPoints={liquidWealthPoints}
                eenRegel={stand.legendaEenRegel}
              />
            )}

            {stand.grafiekBron === 'doelscenario' && (
              <p
                className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]"
                data-testid="doelen-toont-doelscenario"
              >
                <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" className="shrink-0">
                  <line x1="0" y1="4" x2="20" y2="4" stroke="var(--ink-2)" strokeWidth="2" strokeDasharray="6 4" />
                </svg>
                {DOELEN_TOONT_DOELSCENARIO_LABEL}
              </p>
            )}

            {stand.toonPlanVolgtRegel && (
              <p className="mt-3 font-serif text-[12px] italic text-[var(--ink-3)]" data-testid="doelen-volgt-plan">
                {DOELEN_VOLGT_PLAN_REGEL}
              </p>
            )}

            {/* Waar de grafiek op rust, alleen in Plan (D5). Vervangt de voetnoot en
                de hint "Stopmoment wijzigen" (spec §7.3). */}
            {stand.toonAannamesregel && aannames && (
              <Aannamesregel className="mt-3" instellingenHref={KATERN_HREF.instellingen} aannames={aannames} />
            )}
          </>
        ) : null}
      </div>
      {metZijkolom && kolomSoort && (
        <aside
          className={`${DOELEN_CANVAS_ZIJKOLOM} ${kolomSoort === 'volgend' ? 'lg:min-h-[320px]' : ''}`}
          data-testid="doelen-canvas-zijkolom"
        >
          <div ref={kolomMeetRef} className={CANVAS_KOLOM_INHOUD[kolomSoort]} data-testid="canvas-kolom-inhoud">
            {zijkolom}
          </div>
        </aside>
      )}
      </div>
      {metActierij && (
        <div className={DOELEN_CANVAS_ACTIERIJ} data-testid="doelen-canvas-actierij">
          {actierij}
        </div>
      )}
    </section>
  )
}
