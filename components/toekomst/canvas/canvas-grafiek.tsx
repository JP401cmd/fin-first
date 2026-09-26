// Verplaatst uit components/app/horizon/horizon-client.tsx r7239–7560 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * De grafiek zelf (blok L): ZoomableChartContainer met in de render-prop
 * ProjectieLaadlaag, ToekomstOverlay, SimChart, WealthCompositionChart, de
 * Inkomen & Uitgaven-uitklap, EventsTimeline en PhaseBar. PhaseBar blijft in
 * fase 1 hier: hij leest de zoom-render-prop (besluit Q4, kaart V4).
 *
 * Alle bedragfeeds zijn `view*` van de render-grens in de host; de enige
 * nominale feed is `simCashflows` (exempt, zie de callsite). Het dagtarief is
 * een grootheid van vandaag en gaat ongedeflateerd door (D15).
 */
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

import type { Dispatch, SetStateAction } from 'react'
import type { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
import { ChartTips } from '@/components/editorial/chart-tips'
import { getIncomeExpenseTips } from '@/lib/chart-tips'
import {
  ToekomstOverlay,
  type OverlayBalloonDef,
  type ToekomstOverlayGeometry,
} from '@/components/app/horizon/toekomst-overlay'
import { COLOR_PARTNER_EVENT } from './marker-kleuren'
import type {
  ActiveFaseModal,
  ChartMode,
  ClusterSheet,
  EventPaneMode,
  HouseholdHeroData,
  HouseholdMainLine,
  IeViewMode,
  OverlayEmphasis,
  PartnerLine,
} from '@/components/toekomst/state/types'

// Verplaatst uit horizon-client r313–316: de énige consument is dit blok (kaart V3).
const IncomeExpenseChart = dynamic(() =>
  import('@/components/app/horizon/income-expense-chart').then(m => ({ default: m.IncomeExpenseChart })),
  { ssr: false }
)

export interface CanvasGrafiekProps {
  currentAge: number | null
  chartEndAge: number | null
  projectiePending: boolean
  overlayVisible: boolean
  chartMode: ChartMode
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
  incomeExpenseExpanded: boolean
  setIncomeExpenseExpanded: Dispatch<SetStateAction<boolean>>
  ieViewMode: IeViewMode
  setIeViewMode: Dispatch<SetStateAction<IeViewMode>>
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
}

export function CanvasGrafiek({
  currentAge,
  chartEndAge,
  projectiePending,
  overlayVisible,
  chartMode,
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
  incomeExpenseExpanded,
  setIncomeExpenseExpanded,
  ieViewMode,
  setIeViewMode,
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
}: CanvasGrafiekProps) {
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
                        visible={overlayVisible && chartMode === 'vermogenspad'}
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
                      <div className="relative">
                        {/* Vermogenspad (SimChart) */}
                        <div
                          className="transition-opacity duration-300 ease-in-out"
                          style={{
                            opacity: chartMode === 'vermogenspad' ? 1 : 0,
                            pointerEvents: chartMode === 'vermogenspad' ? 'auto' : 'none',
                            position: chartMode === 'vermogenspad' ? 'relative' : 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                          }}
                          aria-hidden={chartMode !== 'vermogenspad'}
                        >
                          <SimChart
                            emphasis={overlayEmphasis}
                            disableCrosshair={overlayVisible && chartMode === 'vermogenspad'}
                            hoverAge={lifelineAge}
                            onHoverAge={setLifelineAge}
                            hideValueTooltip={displayMode === 'full'}
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
                          className="transition-opacity duration-300 ease-in-out"
                          style={{
                            opacity: chartMode === 'vermogensopbouw' ? 1 : 0,
                            pointerEvents: chartMode === 'vermogensopbouw' ? 'auto' : 'none',
                            position: chartMode === 'vermogensopbouw' ? 'relative' : 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                          }}
                          aria-hidden={chartMode !== 'vermogensopbouw'}
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
                      </div>
                      </ToekomstOverlay>
                      {/* ── Inkomen & Uitgaven toggle + collapsible chart ── */}
                      <div className="flex w-full items-center border-t border-[var(--border-ed)]">
                        <button
                          type="button"
                          onClick={() => setIncomeExpenseExpanded(prev => !prev)}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors cursor-pointer select-none"
                          style={{ minHeight: 44 }}
                          aria-expanded={incomeExpenseExpanded}
                          aria-controls="income-expense-panel"
                          aria-label={incomeExpenseExpanded ? 'Inkomen & Uitgaven grafiek verbergen' : 'Inkomen & Uitgaven grafiek tonen'}
                        >
                          <span>Inkomen &amp; Uitgaven</span>
                          {incomeExpenseExpanded
                            ? <ChevronUp size={14} />
                            : <ChevronDown size={14} />
                          }
                        </button>
                        {incomeExpenseExpanded && (
                          <div className="flex items-center gap-2 pr-3" onPointerDown={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {(['lines', 'breakdown'] as const).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setIeViewMode(mode)}
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none cursor-pointer ${
                                    ieViewMode === mode
                                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                                  }`}
                                  aria-pressed={ieViewMode === mode}
                                >
                                  {mode === 'lines' ? 'Lijnen' : 'Bronnen'}
                                </button>
                              ))}
                            </div>
                            <ChartTips
                              storageKey="income_expense_chart"
                              tips={getIncomeExpenseTips({
                                fireAge: simResult.fireAge,
                                aowAge: userAowAge.fractional,
                                viewMode: ieViewMode,
                              })}
                              align="right"
                            />
                          </div>
                        )}
                      </div>
                      <div
                        id="income-expense-panel"
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{
                          maxHeight: incomeExpenseExpanded ? (ieViewMode === 'breakdown' ? 420 : 280) : 0,
                          opacity: incomeExpenseExpanded ? 1 : 0,
                        }}
                      >
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
                      </div>

                      {/* Events timeline aligned to same age axis.
                          Alleen op line-chart (vermogenspad): de bar-chart
                          (vermogensopbouw) toont events al inline boven/onder
                          de bars via ChartEventMarkers — een aparte timeline
                          eronder zou dubbele informatie zijn. */}
                      {chartMode === 'vermogenspad' && eventsForTimeline.length > 0 && (
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
                          Secundaire diepte → verborgen in Eenvoudig-modus. */}
                      {simResult && currentAge != null && (
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
