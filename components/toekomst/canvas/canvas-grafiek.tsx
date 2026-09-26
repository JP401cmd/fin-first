// Verplaatst uit components/app/horizon/horizon-client.tsx r7239–7560 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * De grafiek zelf (blok L): ZoomableChartContainer met in de render-prop
 * ProjectieLaadlaag, ToekomstOverlay, de drie modi van het canvas (ADR 0179 D3:
 * Vermogen = SimChart, Samenstelling = WealthCompositionChart, Geldstroom =
 * IncomeExpenseChart — tot fase 2 een uitklap onder de grafiek), EventsTimeline en
 * PhaseBar. PhaseBar leest de zoom-render-prop (besluit Q4, kaart V4) en staat
 * alleen in katern Plan (`toonFasebalk`, spec §4.5).
 *
 * Alle bedragfeeds zijn `view*` van de render-grens in de host; de enige
 * nominale feed is `simCashflows` (exempt, zie de callsite). Het dagtarief is
 * een grootheid van vandaag en gaat ongedeflateerd door (D15).
 */
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { SimRow, SimResult, SimCashflow } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import type { InEuroView } from '@/lib/euro-display'
import type { StopAnchor } from '@/lib/fire-strategy'
import type { AnkerReach, AnkerStop } from '@/lib/horizon/anker-copy'
import type { HeroFireAge } from '@/lib/horizon/hero-fire-age'
import type { DisplayMode } from '@/lib/hooks/use-display-mode'
import type { LabZone } from '@/lib/horizon/lab-grenzen-types'
import type { KernelHousingSale } from '@/lib/horizon-kernel/bridge'
import type { BreakdownResult } from '@/lib/income-expense-breakdown'
import type { StackedRow } from '@/lib/wealth-composition'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { ChartEventKind, ChartEventOverlay } from '@/lib/chart-event-overlay'
import type { NaturalMilestone } from '@/lib/natural-milestones'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import {
  SimChart,
  type ScenarioOverlay,
  type MonteCarloOverlay,
  type HouseholdPartnerOverlay,
} from '@/components/app/horizon/sim-chart'
import { ZoomableChartContainer } from '@/components/app/horizon/zoomable-chart-container'
import { ProjectieLaadlaag } from '@/components/app/horizon/projectie-laadlaag'
import { EventsTimeline } from '@/components/app/horizon/events-timeline'
import { PhaseBar } from '@/components/app/horizon/phase-bar'
import { CHART_PAD } from '@/lib/chart-constants'
import { WealthCompositionChart } from '@/components/app/horizon/wealth-composition-chart'
import {
  ToekomstOverlay,
  type OverlayBalloonDef,
  type ToekomstOverlayGeometry,
} from '@/components/app/horizon/toekomst-overlay'
import { COLOR_PARTNER_EVENT } from './marker-kleuren'
import type { CanvasModus } from '@/lib/horizon/katern-copy'
import type {
  ActiveFaseModal,
  ClusterSheet,
  EventPaneMode,
  HouseholdHeroData,
  HouseholdMainLine,
  IeViewMode,
  OverlayEmphasis,
  PartnerLine,
} from '@/components/toekomst/state/types'

/**
 * Laadstand van Geldstroom zolang de grafiek-chunk laadt: Fins wachtstand in de volle
 * hoogte van het canvas (de laag beslaat dezelfde gridcel als Vermogen), in plaats van
 * een lege vlek die daarna verspringt.
 */
export function GeldstroomLaden() {
  return (
    <div className="relative min-h-[120px] flex-1" data-testid="geldstroom-laden">
      <ProjectieLaadlaag pending />
    </div>
  )
}

// Verplaatst uit horizon-client r313–316: de énige consument is dit blok (kaart V3).
const IncomeExpenseChart = dynamic(() =>
  import('@/components/app/horizon/income-expense-chart').then(m => ({ default: m.IncomeExpenseChart })),
  { ssr: false, loading: () => <GeldstroomLaden /> }
)

/**
 * De drie modi liggen in één gridcel op elkaar (ADR 0179 D3). De cel is zo hoog als de
 * hoogste laag, en Vermogen blijft altijd gemonteerd: een modus-wissel verandert de
 * hoogte van het canvas dus niet, ook niet naar de lagere Geldstroom-grafiek.
 */
const MODUS_CEL = 'col-start-1 row-start-1 min-w-0 transition-opacity duration-300 ease-in-out'

function modusLaag(actief: boolean): CSSProperties {
  return { opacity: actief ? 1 : 0, pointerEvents: actief ? 'auto' : 'none' }
}

export interface CanvasGrafiekProps {
  currentAge: number | null
  chartEndAge: number | null
  projectiePending: boolean
  overlayVisible: boolean
  /** De modus die het canvas tekent (de katern-stand, niet per se de keuze). */
  modus: CanvasModus
  overlayPrefRestored: boolean
  setOverlayEmphasis: Dispatch<SetStateAction<OverlayEmphasis>>
  toekomstOverlayBalloons: OverlayBalloonDef[]
  useHouseholdMainLine: boolean
  householdMainLine: HouseholdMainLine | null
  usePartnerMainLine: boolean
  partnerLine: PartnerLine | null
  simResult: SimResult
  effectiveNetWorth: number
  hasPerspectiveHero: boolean
  perspectiveHero: HouseholdHeroData | null
  heroFireAge: HeroFireAge
  masked: boolean
  planAnchor: StopAnchor
  ankerReach: AnkerReach | null
  ankerStop: AnkerStop | null
  handleOverlayExit: () => void
  overlayEmphasis: OverlayEmphasis
  lifelineAge: number | null
  setLifelineAge: Dispatch<SetStateAction<number | null>>
  displayMode: DisplayMode
  viewHouseholdMainLineRows: InEuroView<SimRow>[] | null
  viewPartnerLineRows: InEuroView<SimRow>[] | null
  viewDisplaySimRows: InEuroView<SimRow>[]
  simCashflows: SimCashflow[]
  viewFireTarget: number | undefined
  showDualFireTarget: boolean
  viewFireTargetInclHome: number | null
  viewTargetEndPortfolio: number | undefined
  viewTargetInflationFactors: { age: number; factor: number }[]
  dualBasisAvailable: boolean
  viewLiquidWealthPoints: InEuroView<[number, number]>[] | undefined
  effectiveChartPrimaryBasis: 'total' | 'liquid'
  secondaryLineVisible: boolean
  partnerName: string | null
  viewCombinedScenarioOverlays: ScenarioOverlay[]
  labZone: LabZone | null
  nalatenschapMarker: { zone: LabZone | null } | undefined
  scenarioPending: boolean | undefined
  stopPadPending: boolean | undefined
  viewMonteCarloOverlay: MonteCarloOverlay | undefined
  canonicalDailyRate: number
  viewHouseholdOverlays: HouseholdPartnerOverlay[] | null
  userAowAge: AowAge
  planningMode: 'fire' | 'pensioen'
  isFixedAnchorMode: boolean
  chartEventOverlay: ChartEventOverlay[]
  handleChartEventClick: (id: string, kind: ChartEventKind) => void
  handleChartEventDragEnd: (id: string, sourceId: string | undefined, newAge: number, kind: ChartEventKind) => Promise<void>
  handleChartEventDragMove: (id: string, sourceId: string | undefined, newAge: number, kind: ChartEventKind) => void
  handleChartClusterOpen: (clusterEvents: ChartEventOverlay[], centerAge: number) => void
  viewWealthCompositionRows: InEuroView<StackedRow>[]
  kernelHousingSale: KernelHousingSale | null
  homeExcludedFromProgress: boolean
  setSelectedYearAge: Dispatch<SetStateAction<number | null>>
  /** Sub-weergave van Geldstroom; in Eenvoudig altijd `lines` (host bewaakt dat). */
  ieViewMode: IeViewMode
  viewIeBreakdownResult: BreakdownResult | null
  eventsForTimeline: LifeEvent[]
  setClusterSheet: Dispatch<SetStateAction<ClusterSheet>>
  naturalMilestones: NaturalMilestone[]
  router: Pick<ReturnType<typeof useRouter>, 'push'>
  setEventPaneEditingId: Dispatch<SetStateAction<string | null>>
  setEventPaneMode: Dispatch<SetStateAction<EventPaneMode>>
  setEventPaneOpen: Dispatch<SetStateAction<boolean>>
  handleEventDragEnd: (eventId: string, newAge: number) => Promise<void>
  eventStopAge: number | null
  isPensioenMode: boolean
  setActiveFaseModal: Dispatch<SetStateAction<ActiveFaseModal>>
  /** De fasebalk staat alleen in katern Plan (spec §4.5). */
  toonFasebalk: boolean
  /** Het katern draagt de cijferbalk (`LifelineReadout`, desktop, Volledig). */
  toonReadout: boolean
}

export function CanvasGrafiek({
  currentAge,
  chartEndAge,
  projectiePending,
  overlayVisible,
  modus,
  overlayPrefRestored,
  setOverlayEmphasis,
  toekomstOverlayBalloons,
  useHouseholdMainLine,
  householdMainLine,
  usePartnerMainLine,
  partnerLine,
  simResult,
  effectiveNetWorth,
  hasPerspectiveHero,
  perspectiveHero,
  heroFireAge,
  masked,
  planAnchor,
  ankerReach,
  ankerStop,
  handleOverlayExit,
  overlayEmphasis,
  lifelineAge,
  setLifelineAge,
  displayMode,
  viewHouseholdMainLineRows,
  viewPartnerLineRows,
  viewDisplaySimRows,
  simCashflows,
  viewFireTarget,
  showDualFireTarget,
  viewFireTargetInclHome,
  viewTargetEndPortfolio,
  viewTargetInflationFactors,
  dualBasisAvailable,
  viewLiquidWealthPoints,
  effectiveChartPrimaryBasis,
  secondaryLineVisible,
  partnerName,
  viewCombinedScenarioOverlays,
  labZone,
  nalatenschapMarker,
  scenarioPending,
  stopPadPending,
  viewMonteCarloOverlay,
  canonicalDailyRate,
  viewHouseholdOverlays,
  userAowAge,
  planningMode,
  isFixedAnchorMode,
  chartEventOverlay,
  handleChartEventClick,
  handleChartEventDragEnd,
  handleChartEventDragMove,
  handleChartClusterOpen,
  viewWealthCompositionRows,
  kernelHousingSale,
  homeExcludedFromProgress,
  setSelectedYearAge,
  ieViewMode,
  viewIeBreakdownResult,
  eventsForTimeline,
  setClusterSheet,
  naturalMilestones,
  router,
  setEventPaneEditingId,
  setEventPaneMode,
  setEventPaneOpen,
  handleEventDragEnd,
  eventStopAge,
  isPensioenMode,
  setActiveFaseModal,
  toonFasebalk,
  toonReadout,
}: CanvasGrafiekProps) {
  const isLg = useIsLgUp()
  return (
              <div className="-mx-4 sm:-mx-6 md:-mx-8 overflow-hidden">
                <ZoomableChartContainer currentAge={currentAge ?? 30} endAge={chartEndAge!}>
                  {(visibleMin, visibleMax, controls) => (
                    <>
                      {/* B-057 — Fin's wachtstand op de grafiek zolang de projectie
                          verouderd is (herlaad / refresh / hersolve). Eerst in de
                          fragment zodat de zoom-knoppen (zelfde z-10) erboven blijven. */}
                      <ProjectieLaadlaag pending={projectiePending} />
                      {/* STEP 3b/4: tips-laag wikkelt de grafiek — markers in een rij
                          boven + onder; de grafiek vervaagt zolang de tips aan staan. */}
                      <ToekomstOverlay
                        visible={overlayVisible && modus === 'vermogen'}
                        autoScrollIntoView={overlayPrefRestored}
                        onEmphasisChange={setOverlayEmphasis}
                        balloons={toekomstOverlayBalloons}
                        geometry={((): ToekomstOverlayGeometry => {
                          // FIRE-fractie binnen het zichtbare leeftijdsbereik —
                          // dezelfde bron + precedentie als de SimChart hieronder
                          // (single-source, niet herberekend). De plot-insets
                          // matchen CHART_PAD zodat de leader-lines/kaders precies
                          // over het tekengebied vallen.
                          const fireFrac = useHouseholdMainLine
                            ? householdMainLine!.fireAgeFractional
                            : usePartnerMainLine
                              ? partnerLine!.fireAgeFractional
                              : simResult.fireAgeFractional
                          const lo = visibleMin
                          const span = visibleMax - lo
                          const fraction =
                            fireFrac != null && span > 0
                              ? Math.min(Math.max((fireFrac - lo) / span, 0), 1)
                              : null
                          return {
                            padLeft: CHART_PAD.left,
                            padRight: CHART_PAD.right,
                            padTop: CHART_PAD.top,
                            padBottom: CHART_PAD.bottom,
                            fireFraction: fraction,
                          }
                        })()}
                        summary={{
                          // Netto vermogen: canonieke afleiding uit de effectieve input
                          // (totalAssets − totalDebts), niet lokaal herberekend.
                          netWorth: effectiveNetWorth,
                          // Vrijheidsleeftijd: EXACT dezelfde bron + precedentie als de
                          // hero-KPI "vrijheidsleeftijd" (single-source, niet herberekend).
                          freedomAge: hasPerspectiveHero ? perspectiveHero!.fireAge : heroFireAge.age,
                          masked,
                          anchor: planAnchor,
                          ankerReach: hasPerspectiveHero ? null : ankerReach,
                          ankerStop: hasPerspectiveHero ? null : ankerStop,
                        }}
                        onClose={handleOverlayExit}
                      >
                      <div className="relative grid" data-testid="canvas-modi">
                        {/* Vermogenspad (SimChart) */}
                        <div
                          className={MODUS_CEL}
                          style={modusLaag(modus === 'vermogen')}
                          aria-hidden={modus !== 'vermogen'}
                          data-testid="canvas-vermogen"
                        >
                          <SimChart
                            emphasis={overlayEmphasis}
                            disableCrosshair={overlayVisible && modus === 'vermogen'}
                            hoverAge={lifelineAge}
                            onHoverAge={setLifelineAge}
                            // De cijferbalk toont de waarden al, maar alleen in Volledig, op
                            // desktop en waar het katern hem draagt; overal anders toont de
                            // grafiek ze zelf.
                            hideValueTooltip={displayMode === 'full' && isLg && toonReadout}
                            rows={useHouseholdMainLine ? viewHouseholdMainLineRows! : usePartnerMainLine ? viewPartnerLineRows! : (viewDisplaySimRows)}
                            fireAge={useHouseholdMainLine ? householdMainLine!.fireAge : usePartnerMainLine ? partnerLine!.fireAge : (simResult.fireAge)}
                            fireAgeFractional={useHouseholdMainLine ? householdMainLine!.fireAgeFractional : usePartnerMainLine ? partnerLine!.fireAgeFractional : (simResult.fireAgeFractional)}
                            currentAge={useHouseholdMainLine ? (householdMainLine!.currentAge ?? currentAge ?? 30) : usePartnerMainLine ? (partnerLine!.currentAge ?? currentAge ?? 30) : (currentAge ?? 30)}
                            endAge={chartEndAge!}
                            // euro-view: exempt — `cashflows` levert géén zichtbaar bedrag in
                            // SimChart (de prop wordt daar gedestructureerd maar nergens in de
                            // teken-body gebruikt; de tooltip-bedragen komen alle uit `rows`).
                            // Nominaal doorgeven is dus het juiste én het gedrag-neutrale pad.
                            cashflows={simCashflows}
                            fireTarget={viewFireTarget}
                            // Tweede doellijn (incl. woning) alleen op de basis-projectie,
                            // net als targetInflationFactors — niet op partner-/huishoud-/
                            // AOW-stop-lijnen. Bij de dubbele-woning-grondslag (downsize/
                            // opeethypotheek/uitsluiten); anders undefined → één doellijn.
                            fireTargetInclHome={(usePartnerMainLine || useHouseholdMainLine) ? undefined : (showDualFireTarget ? viewFireTargetInclHome! : undefined)}
                            strategy={simResult.strategy}
                            targetEndPortfolio={viewTargetEndPortfolio}
                            // Meegroeiende doellijn alleen op de basis-projectie (niet op
                            // partner-/huishoud-/AOW-stop-lijnen — die hebben eigen rijen).
                            targetInflationFactors={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewTargetInflationFactors}
                            // Besteedbaar-reeks alleen op de basis-projectie: partner-/
                            // huishoud-/AOW-stop-lijnen tekenen andere rijen, waar deze
                            // punten niet bij horen (`dualBasisAvailable`).
                            //
                            // Deze reeks is de PRIMAIRE lijn zodra `primaryBasis`
                            // 'liquid' is — dan moet 'ie er altijd zijn en schakelt de
                            // pill de tweede (totaal)lijn. Staat de primaire lijn op
                            // 'total', dan is dít de tweede lijn en schakelt dezelfde
                            // pill hem uit. Eén schakelaar, twee richtingen:
                            // `secondaryLineVisible`. Valt de tweede lijn weg, dan valt
                            // ook de bijbehorende drempel mee weg (`showExclTargetLine`
                            // resp. `showInclTargetLine` in chart-static-layers.tsx).
                            liquidPoints={dualBasisAvailable ? viewLiquidWealthPoints : undefined}
                            primaryBasis={effectiveChartPrimaryBasis}
                            secondaryLineVisible={secondaryLineVisible}
                            mainLineLabel={useHouseholdMainLine ? 'Gezamenlijk' : usePartnerMainLine ? (partnerName ?? 'Partner') : undefined}
                            // Partner- én huishoud-projectie krijgen dezelfde teal als de
                            // partner-event-markers, zodat de lijn + de partner-gebeurtenissen
                            // visueel bij elkaar horen. FIRE-annotaties blijven goud (COLOR_OPBOUW).
                            mainLineColor={(usePartnerMainLine || useHouseholdMainLine) ? COLOR_PARTNER_EVENT : undefined}
                            scenarioOverlays={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewCombinedScenarioOverlays}
                            // Het verschilvlak onder de basislijn kleurt neutraal zolang het
                            // plan gedekt is, en alleen rood als het plan niet reikt.
                            planZone={labZone}
                            // Bol op het eind van de wat-als-lijn in de stoplichtkleur van de
                            // nalatenschap-knop. Op een partner-/huishoudlijn rekent het lab
                            // niet, dus daar staat ook geen wat-als-lijn om 'm op te zetten.
                            nalatenschapMarker={(usePartnerMainLine || useHouseholdMainLine) ? undefined : nalatenschapMarker}
                            scenarioPending={scenarioPending || stopPadPending}
                            mainPending={projectiePending}
                            monteCarloOverlay={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewMonteCarloOverlay}
                            // euro-view: exempt — het dagtarief (€→vrijheidstijd) is per
                            // definitie een grootheid van VANDAAG en deflateert nooit (D15).
                            // Deflateert het bedrag wél, dan volgt de vrijheidstijd
                            // automatisch mee; ook de noemer aanpakken zou de deflatie
                            // twee keer toepassen.
                            //
                            // Consume, don't recompute: hier stond
                            // `(effectiveInput?.yearlyMustExpenses ?? 0) / 365` — de
                            // PROJECTIE-uitgave als weergave-koers. De grafiek-tooltip gaf
                            // daardoor een andere vrijheidstijd dan élk ander tijdgetal op
                            // deze pagina, die al op `canonicalDailyRate` staan
                            // (eigenaarsbesluit C bij UR3-08, vervolg KRUIS-20).
                            dailyExpenseRate={canonicalDailyRate}
                            householdOverlays={viewHouseholdOverlays ?? undefined}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                            aowAgeFractional={userAowAge.fractional}
                            planningMode={planningMode}
                            stopAnchorFixed={isFixedAnchorMode}
                            showDepletionWarning={false}
                            eventOverlay={chartEventOverlay}
                            onEventClick={handleChartEventClick}
                            onEventDragEnd={handleChartEventDragEnd}
                            onEventDragMove={handleChartEventDragMove}
                            onClusterOpen={handleChartClusterOpen}
                          />
                        </div>

                        {/* Vermogensopbouw (WealthCompositionChart) */}
                        <div
                          className={MODUS_CEL}
                          style={modusLaag(modus === 'samenstelling')}
                          aria-hidden={modus !== 'samenstelling'}
                        >
                          <WealthCompositionChart
                            stackedRows={viewWealthCompositionRows}
                            currentAge={currentAge ?? 30}
                            endAge={chartEndAge!}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                            fireAge={simResult.fireAge}
                            fireAgeFractional={simResult.fireAgeFractional}
                            planningMode={planningMode}
                            aowAgeFractional={userAowAge.fractional}
                            housingSaleAge={kernelHousingSale?.age ?? null}
                            // Het huis blijft in de staaf staan (het is echt bezit), maar
                            // gedempt zodra het buiten het doel valt — dezelfde
                            // strategie-beslissing als de doelbedrag-grondslag hierboven.
                            homeExcludedFromFire={homeExcludedFromProgress}
                            eventOverlay={chartEventOverlay}
                            onEventClick={handleChartEventClick}
                            onClusterOpen={handleChartClusterOpen}
                            onYearClick={(age) => setSelectedYearAge(age)}
                          />
                        </div>

                        {/* Geldstroom (IncomeExpenseChart) — sinds fase 2 een volwaardige
                            modus i.p.v. een uitklap onder de grafiek (spec §7.2). De
                            sub-weergave Lijnen/Bronnen staat in de canvaskop. De grafiek is
                            lager dan Vermogen en staat verticaal in het midden van de cel. */}
                        <div
                          className={`${MODUS_CEL} flex flex-col justify-center`}
                          style={modusLaag(modus === 'geldstroom')}
                          aria-hidden={modus !== 'geldstroom'}
                          data-testid="canvas-geldstroom"
                        >
                          {modus === 'geldstroom' && (
                            <IncomeExpenseChart
                              rows={viewDisplaySimRows}
                              currentAge={currentAge ?? 30}
                              endAge={chartEndAge!}
                              visibleMinAge={visibleMin}
                              visibleMaxAge={visibleMax}
                              fireAge={simResult.fireAge}
                              planningMode={planningMode}
                              aowAgeFractional={userAowAge.fractional}
                              viewMode={ieViewMode}
                              breakdownResult={viewIeBreakdownResult}
                            />
                          )}
                        </div>
                      </div>
                      </ToekomstOverlay>

                      {/* Events timeline aligned to same age axis.
                          Alleen in Vermogen: Samenstelling toont events al inline
                          boven/onder de staven via ChartEventMarkers — een aparte
                          timeline eronder zou dubbele informatie zijn. */}
                      {modus === 'vermogen' && eventsForTimeline.length > 0 && (
                        <EventsTimeline
                          events={eventsForTimeline}
                          currentAge={currentAge ?? 30}
                          endAge={chartEndAge!}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          onClusterOpen={(clusterEvents, centerAge) => setClusterSheet({ events: clusterEvents, centerAge })}
                          onViewEvent={id => {
                            // Natuurlijke mijlpalen hebben geen edit-pane; deeplink
                            // naar bron-asset/debt indien beschikbaar.
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
                          onEditEvent={id => {
                            if (id.startsWith('nat-')) return // natuurlijke mijlpalen niet bewerkbaar
                            setEventPaneEditingId(id)
                            setEventPaneMode('edit')
                            setEventPaneOpen(true)
                          }}
                          onEventDragEnd={handleEventDragEnd}
                          stopAge={eventStopAge}
                        />
                      )}

                      {/* ── Fase-balk (Opbouw / Overgang / Onttrekking) ──
                          Secundaire diepte → verborgen in Eenvoudig-modus; alleen in
                          katern Plan (spec §4.5). */}
                      {toonFasebalk && simResult && currentAge != null && (
                        <HideInSimple>
                        <div className="mt-2" style={{ marginLeft: CHART_PAD.left, marginRight: CHART_PAD.right }}>
                          <PhaseBar
                            currentAge={currentAge}
                            fireAge={simResult.fireAge}
                            fireAgeFractional={simResult.fireAgeFractional}
                            aowAge={userAowAge.fractional}
                            endAge={chartEndAge!}
                            fireReachable={simResult.fireReachable}
                            isPensioenMode={isPensioenMode}
                            onSegmentClick={(fase) => setActiveFaseModal(fase)}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                          />
                        </div>
                        </HideInSimple>
                      )}
                    </>
                  )}
                </ZoomableChartContainer>
              </div>
  )
}
