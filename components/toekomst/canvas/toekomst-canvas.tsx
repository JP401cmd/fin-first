'use client'
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

/**
 * Het canvas van /toekomst (ADR 0179 D1/D3/D5): de grafiekkaart die de
 * `(katern)`-layout boven de katern-koppen rendert en die bij een katernwissel
 * gemonteerd blijft (GW1).
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

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import type { OverlayBalloonDef } from '@/components/app/horizon/toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from '@/components/app/horizon/toekomst-overlay-balloons'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getFireProjectionTips, getIncomeExpenseTips, getWealthCompositionTips } from '@/lib/chart-tips'
import { CANVAS_UITLEG_TITEL, DOELEN_VOLGT_PLAN_REGEL, type GeldstroomSub } from '@/lib/horizon/katern-copy'
import type { IeViewMode, OverlayEmphasis } from '@/components/toekomst/state/types'
import { useActiefKatern } from '@/components/toekomst/layout/actief-katern'
import { KATERN_HREF } from '@/components/toekomst/layout/katern-routes'
import { CanvasKop } from '@/components/toekomst/canvas/canvas-kop'
import { CanvasTipsToggle } from '@/components/toekomst/canvas/canvas-tips-toggle'
import { ModusSwitch } from '@/components/toekomst/canvas/modus-switch'
import { LagenMenu } from '@/components/toekomst/canvas/lagen-menu'
import { CanvasUitleg } from '@/components/toekomst/canvas/canvas-uitleg'
import { CanvasGrafiek } from '@/components/toekomst/canvas/canvas-grafiek'
import { CanvasLegenda } from '@/components/toekomst/canvas/canvas-legenda'
import { MarktcheckGetallen } from '@/components/toekomst/canvas/marktcheck-getallen'
import { Aannamesregel } from '@/components/toekomst/canvas/aannamesregel'
import { aantalReeksen, canvasStand } from '@/components/toekomst/canvas/canvas-stand'
import {
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
  } = useToekomstEuroContext()
  const { masked } = useMaskedAmounts()
  const router = useRouter()
  const katern = useActiefKatern()

  // overlayEmphasis: welke grafiekfase een gehoverde/gefocuste ballon accentueert.
  const [overlayEmphasis, setOverlayEmphasis] = useState<OverlayEmphasis>(null)

  // ── De stand van het canvas in dit katern (spec §4.5) en deze weergave (§4.7) ──
  const eenvoudig = displayMode === 'simple'
  const heeftDoelen = goalChartMarkers.length > 0
  const stand = useMemo(
    () =>
      canvasStand(
        katern,
        { modus: canvasModus, lagen: canvasLagenKeuze },
        { doelen: heeftDoelen, doelscenario: hasDoelLijn, metHuis: dualBasisAvailable },
        { eenvoudig },
      ),
    [katern, canvasModus, canvasLagenKeuze, heeftDoelen, hasDoelLijn, dualBasisAvailable, eenvoudig],
  )
  const { gebeurtenissen, mijlpalen, doelen, doelscenario, marktcheck, rendementScenarios, metHuis } = stand.lagen

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

  return (
    <section
      data-testid="horizon-hero"
      data-katern={katern}
      className={`card-editorial overflow-hidden ${stand.alleenDesktop ? 'hidden lg:block' : ''} ${overlayVisible && stand.modus === 'vermogen' ? 'no-hover-lift' : ''}`}
    >
      {/* Module-active accent (Horizon-500 op /toekomst/**) */}
      <div className="h-1.5" style={{ background: 'var(--module-active-500)' }} />

      <div className="p-4 sm:p-6 md:p-8">
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
              plotHoogte={stand.plotHoogte}
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
              />
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
    </section>
  )
}
