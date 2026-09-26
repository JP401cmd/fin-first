// Verplaatst uit components/app/horizon/horizon-client.tsx r6834–7155 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Pillenrij boven de toekomstgrafiek + ChartTips (blok J). Alle toggles zijn
 * host-state; dit bestand rekent niets en toont geen bedragen.
 */

import type { Dispatch, SetStateAction } from 'react'
import {
  Calendar, BarChart3, FlaskConical, Target, Sparkles, GitBranch, TrendingUp, Play, Pause,
} from 'lucide-react'
import { margeKort, margeZin } from '@/lib/horizon/marktcheck-copy'
import type { RendementMarge } from '@/lib/horizon-kernel/rendement-marge'
import type { SimResult } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import type { ChartEventOverlay } from '@/lib/chart-event-overlay'
import type { NaturalMilestone } from '@/lib/natural-milestones'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { ScenarioOverlay, MonteCarloOverlay } from '@/components/app/horizon/sim-chart'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { PillRow } from '@/components/app/pill-row'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getFireProjectionTips, getWealthCompositionTips } from '@/lib/chart-tips'
import type { ChartMode } from './types'

export interface CanvasPillsProps {
  chartMode: ChartMode
  scenariosExpanded: boolean
  setScenariosExpanded: Dispatch<SetStateAction<boolean>>
  scenarioData: ScenarioOverlay[] | null
  mcExpanded: boolean
  setMcExpanded: Dispatch<SetStateAction<boolean>>
  mcMarge: RendementMarge | null
  mcFailed: boolean
  mcPending: boolean
  hasDoelLijn: boolean
  showScenarioLine: boolean
  setShowScenarioLine: Dispatch<SetStateAction<boolean>>
  doelLijnLabel: 'Doel' | 'Wat-als' | 'Stopkeuze'
  hasScenario: boolean
  scenarioFireDeltaLabel: string | null
  scenarioPending: boolean | undefined
  stopPadPending: boolean | undefined
  dualBasisAvailable: boolean
  effectiveChartPrimaryBasis: 'total' | 'liquid'
  showLiquidLine: boolean
  persistLiquidLine: (val: boolean) => void
  showLifeEvents: boolean
  persistLifeEvents: (val: boolean) => void
  events: LifeEvent[]
  goalChartMarkers: ChartEventOverlay[]
  showGoals: boolean
  persistGoals: (val: boolean) => void
  showNaturalMilestones: boolean
  persistNaturalMilestones: (val: boolean) => void
  naturalMilestones: NaturalMilestone[]
  isPlaying: boolean
  setIsPlaying: Dispatch<SetStateAction<boolean>>
  setChartMode: Dispatch<SetStateAction<ChartMode>>
  simResult: SimResult
  userAowAge: AowAge
  currentAge: number | null
  monteCarloOverlay: MonteCarloOverlay | undefined
  planningMode: 'fire' | 'pensioen'
  isFixedAnchorMode: boolean
}

export function CanvasPills({
  chartMode,
  scenariosExpanded,
  setScenariosExpanded,
  scenarioData,
  mcExpanded,
  setMcExpanded,
  mcMarge,
  mcFailed,
  mcPending,
  hasDoelLijn,
  showScenarioLine,
  setShowScenarioLine,
  doelLijnLabel,
  hasScenario,
  scenarioFireDeltaLabel,
  scenarioPending,
  stopPadPending,
  dualBasisAvailable,
  effectiveChartPrimaryBasis,
  showLiquidLine,
  persistLiquidLine,
  showLifeEvents,
  persistLifeEvents,
  events,
  goalChartMarkers,
  showGoals,
  persistGoals,
  showNaturalMilestones,
  persistNaturalMilestones,
  naturalMilestones,
  isPlaying,
  setIsPlaying,
  setChartMode,
  simResult,
  userAowAge,
  currentAge,
  monteCarloOverlay,
  planningMode,
  isFixedAnchorMode,
}: CanvasPillsProps) {
  return (
    <>
              {/* ── Overlay toggles boven de grafiek ──
                  `PillRow` houdt deze rij op ÉÉN regel: passen de labels niet,
                  dan vallen ze allemaal weg en blijven de iconen over. Twee rijen
                  pillen aten verticale ruimte die de grafiek zelf nodig heeft.
                  Labels dragen daarom `data-pill-label`.

                  De euro-weergave-badge stond hier; die is verhuisd naar de
                  weergave-sectie bovenaan de sidebar (`EuroViewBadge`).
                  De schakelaar zelf woont in het zoekscherm (⌘K) — één plek voor
                  de status, één voor de knop, in plaats van een badge per
                  grafiek. */}
              <PillRow className="mb-2" ariaLabel="Grafiek-opties">
                {/* De AOW-stop-toggle stond hier (ADR 0129 B11): die is een
                    snelkoppeling op de stop-slider van de vrijheidsas geworden. */}
                {/* Scenario- en Monte-Carlo-toggles zijn line-chart-overlays —
                    niet zinvol op de vermogensopbouw-stack. Verbergen in
                    barchart-mode i.p.v. uitgrijzen: minder visuele ruis,
                    en de gebruiker kan altijd terug-toggelen naar 'Pad'. */}
                {chartMode === 'vermogenspad' && (
                  <>
                  <HideInSimple>
                    <button
                      type="button"
                      onClick={() => setScenariosExpanded(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        scenariosExpanded
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-label="Scenario-lijnen tonen"
                      title="Scenario's"
                    >
                      <GitBranch className="h-3 w-3" />
                      <span data-pill-label className="hidden sm:inline">Scenario&apos;s</span>
                      {scenarioData && scenariosExpanded && (
                        <span data-pill-badge className="flex items-center gap-0.5">
                          {scenarioData.map(s => (
                            <span key={s.name} className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                          ))}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMcExpanded(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        mcExpanded
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-label={mcMarge
                        ? `Marktcheck — ${margeZin(mcMarge)}`
                        : 'Marktcheck tonen — hoeveel je rendement mag tegenvallen'}
                      title={mcFailed
                        ? 'Marktcheck kon niet worden doorgerekend'
                        : mcMarge
                          ? margeZin(mcMarge)
                          : 'Marktcheck: je plan doorgerekend onder wisselende markten'}
                      aria-busy={mcExpanded && mcPending}
                      /* Het label mag NIET wegvallen zolang de datawaarde staat
                         (H21/F2): op smal scherm bleef anders een kaal getal over,
                         dat naast een "succeskans" als kans gelezen werd. Dat liep
                         via `className="inline"` op het label (0,1,0) en verloor
                         altijd van de compact-regel (0,3,0) — B-025. Nu draagt de
                         PIL het keep-signaal, en garandeert de CSS dat label en
                         badge samen reizen. Zonder badge geen keep: dan doet de pil
                         gewoon mee met de compacte stand. */
                      data-pill-keep={mcExpanded && (mcPending || mcFailed || Boolean(mcMarge)) ? '' : undefined}
                    >
                      <FlaskConical className="h-3 w-3" />
                      <span data-pill-label className="hidden sm:inline">
                        Marktcheck
                      </span>
                      {mcExpanded && mcPending && (
                        <span data-pill-badge className="font-mono text-[10px] tabular-nums opacity-60">…</span>
                      )}
                      {mcExpanded && !mcPending && mcFailed && (
                        <span data-pill-badge className="font-mono text-[10px] tabular-nums opacity-60">—</span>
                      )}
                      {/* De datawaarde blijft ook in de compacte pillenbalk staan (daar
                          valt alleen het label weg) — vandaar de korte vorm. */}
                      {mcExpanded && !mcPending && mcMarge && (
                        <span data-pill-badge className="font-mono text-[10px] tabular-nums opacity-75">
                          {margeKort(mcMarge)}
                        </span>
                      )}
                    </button>
                  </HideInSimple>
                  {/* ── Doel-/wat-als-lijn toggle (alleen wanneer er écht een
                      gestippelde lijn te tonen is — zelfde bron-waarheid als de
                      overlay, ADR 0085). Bewust BUITEN HideInSimple: de doellijn
                      zelf rendert in béíde weergavemodi, dus ook in Eenvoudig
                      hoort de gebruiker 'm aan/uit te kunnen zetten. */}
                  {hasDoelLijn && (
                    <>
                    <button
                      type="button"
                      onClick={() => setShowScenarioLine(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        showScenarioLine
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={showScenarioLine}
                      aria-label={`${doelLijnLabel}-lijn tonen`}
                      title={`${doelLijnLabel}-lijn`}
                      /* De delta is hier het punt van de pil → label en badge
                         blijven samen staan zolang die delta er is (B-025). */
                      data-pill-keep={hasScenario && scenarioFireDeltaLabel ? '' : undefined}
                    >
                      {/* Ink-dash-swatch (zelfde SVG als legenda/ScenarioChip) draagt de
                          wat-als-identiteit; de pill volgt verder de horizon-chroom van de rij. */}
                      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="var(--ink-2)" strokeWidth="2" strokeDasharray="6 4" />
                      </svg>
                      <span data-pill-label className="hidden sm:inline">{doelLijnLabel}</span>
                      {/* Delta t.o.v. de basislijn is alleen betekenisvol bij een echt
                          wat-als; een stop-only-lijn zou hier "gelijk" tonen. */}
                      {hasScenario && scenarioFireDeltaLabel && (
                        <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                          {scenarioFireDeltaLabel}
                        </span>
                      )}
                    </button>
                    <span aria-live="polite" className="font-mono text-[10px] text-[var(--ink-3)]">
                      {showScenarioLine && (scenarioPending || stopPadPending) ? 'bijwerken…' : ''}
                    </span>
                    </>
                  )}
                  {/* ── Tweede-grondslag-toggle ──
                      Alleen zichtbaar zodra er écht een tweede lijn te tonen is
                      (`dualBasisAvailable`) — bij "Meerekenen" valt J exact samen
                      met I, dus daar verdwijnt de pill in plaats van een lijn aan te
                      bieden die al zichtbaar is. In Eenvoudig verdwijnt de pill
                      helemaal: het onderscheid mét/zonder huis is secundaire
                      diepte. De lijn zelf blijft door de opgeslagen voorkeur
                      gestuurd en rendert in béíde weergavemodi.

                      LABEL VOLGT DE ROL (ADR 0114): de pill benoemt de lijn die
                      hij schakelt, niet een vaste grondslag. Bij "Uitsluiten" is
                      de J-lijn de hóófdlijn en schakelt deze pill dus de
                      totaallijn ("Met je huis"); in de andere modi andersom.
                      Een pill die "Zonder je huis" heet terwijl die lijn er
                      altijd staat, zou een aan/uit-knop voor niets zijn. */}
                  {dualBasisAvailable && (() => {
                    const secondaryLabel =
                      effectiveChartPrimaryBasis === 'liquid' ? 'Met je huis' : 'Zonder je huis'
                    return (
                    <HideInSimple>
                    <button
                      type="button"
                      onClick={() => persistLiquidLine(!showLiquidLine)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        showLiquidLine
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={showLiquidLine}
                      aria-label={`Lijn ${secondaryLabel.toLowerCase()} tonen`}
                      title={secondaryLabel}
                    >
                      {/* Zelfde swatch als de legenda en de tooltip-regel: fijne
                          horizon-streep. Kleur uit de module-token, niet uit een
                          losse hex (`secondaryStroke` in lib/horizon/sim-chart-geometry.ts). */}
                      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="var(--color-horizon-600)" strokeWidth="1.8" strokeDasharray="2 3" strokeLinecap="round" />
                      </svg>
                      <span data-pill-label className="hidden sm:inline">{secondaryLabel}</span>
                    </button>
                    </HideInSimple>
                    )
                  })()}
                  </>
                )}

                {/* ── Levensgebeurtenissen toggle ── */}
                <button
                  type="button"
                  onClick={() => persistLifeEvents(!showLifeEvents)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    showLifeEvents
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                  aria-pressed={showLifeEvents}
                  aria-label="Levensgebeurtenissen op de tijdlijn tonen"
                  title="Toon je eigen levensgebeurtenissen op de tijdlijn"
                >
                  <Calendar className="h-3 w-3" />
                  <span data-pill-label className="hidden sm:inline">Levensgebeurtenissen</span>
                  {showLifeEvents && events.length > 0 && (
                    <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                      {events.length}
                    </span>
                  )}
                </button>

                {/* ── Doelen toggle (M36) ──
                    Alleen zichtbaar zodra er écht doel-markers te tonen zijn:
                    zonder doelen met streefdatum voegt een lege pill niets toe. */}
                {goalChartMarkers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => persistGoals(!showGoals)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      showGoals
                        ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                        : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                    }`}
                    aria-pressed={showGoals}
                    aria-label="Doelen met een streefdatum op de tijdlijn tonen"
                    title="Toon je doelen op de tijdlijn, op hun streefdatum"
                  >
                    <Target className="h-3 w-3" />
                    <span data-pill-label className="hidden sm:inline">Doelen</span>
                    {showGoals && (
                      <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                        {goalChartMarkers.length}
                      </span>
                    )}
                  </button>
                )}

                {/* ── Natuurlijke mijlpalen toggle ── */}
                <button
                  type="button"
                  onClick={() => persistNaturalMilestones(!showNaturalMilestones)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    showNaturalMilestones
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                  aria-pressed={showNaturalMilestones}
                  aria-label="Natuurlijke mijlpalen tonen"
                  title="Toon automatisch afgeleide mijlpalen (hypotheek afgelost, eerste miljoen, vermogen op, …)"
                >
                  <Sparkles className="h-3 w-3" />
                  <span data-pill-label className="hidden sm:inline">Natuurlijke mijlpalen</span>
                  {showNaturalMilestones && naturalMilestones.length > 0 && (
                    <span data-pill-badge className="ml-0.5 font-mono text-[10px] tabular-nums opacity-75">
                      {naturalMilestones.length}
                    </span>
                  )}
                </button>

                {/* ── Chart mode toggle (compact pill, right-aligned) ──
                    Op mobiel: alleen icon. Op desktop: icon + label.
                    TrendingUp = pad/line; BarChart3 = opbouw/stack. */}
                <div className="ml-auto flex items-center gap-1">
                  {/* "Speel af" — animeert de levenslijn 40→einde; alleen in de
                      volledige weergave en op de pad-grafiek (uitgebreide diepte). */}
                  {chartMode === 'vermogenspad' && (
                    <HideInSimple>
                      <button
                        type="button"
                        onClick={() => setIsPlaying(p => !p)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-horizon-300 bg-horizon-50 px-2.5 py-1 text-[11px] font-medium text-horizon-700 transition-colors hover:bg-horizon-100"
                        aria-pressed={isPlaying}
                        aria-label={isPlaying ? 'Pauzeer afspelen' : 'Speel de levenslijn af'}
                        title={isPlaying ? 'Pauze' : 'Speel af'}
                      >
                        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        <span data-pill-label className="hidden sm:inline">{isPlaying ? 'Pauze' : 'Speel af'}</span>
                      </button>
                    </HideInSimple>
                  )}
                  {(['vermogenspad', 'vermogensopbouw'] as const).map((mode) => {
                    const btn = (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setChartMode(mode)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none ${
                          chartMode === mode
                            ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                        }`}
                        aria-pressed={chartMode === mode}
                        aria-label={mode === 'vermogenspad' ? 'Pad-modus' : 'Opbouw-modus'}
                        title={mode === 'vermogenspad' ? 'Pad' : 'Opbouw'}
                      >
                        {mode === 'vermogenspad'
                          ? <TrendingUp className="h-3.5 w-3.5" />
                          : <BarChart3 className="h-3.5 w-3.5" />}
                        <span data-pill-label className="hidden sm:inline">
                          {mode === 'vermogenspad' ? 'Pad' : 'Opbouw'}
                        </span>
                      </button>
                    )
                    // Beide varianten blijven in béíde weergavemodi staan: de
                    // opbouw-staafgrafiek is een andere blik op dezelfde cijfers,
                    // geen extra diepte — en juist in Eenvoudig de begrijpelijkste.
                    return btn
                  })}
                </div>

                {/* ── Inline ChartTips: kleine "i" met editorial popover ── */}
                <ChartTips
                  storageKey="horizon_main_chart"
                  tips={
                    chartMode === 'vermogenspad'
                      ? getFireProjectionTips({
                          fireAge: simResult.fireAge,
                          aowAge: userAowAge.fractional,
                          currentAge: currentAge ?? 30,
                          hasMonteCarlo: !!monteCarloOverlay,
                          hasBaseline: false,
                          planningMode,
                          // ADR 0129 — onder een vast anker noemt de spotlight het
                          // stopmoment, niet "op 47 bereik je vrijheid" (bevinding 6).
                          stopAnchorFixed: isFixedAnchorMode,
                          stopAge: simResult.vastStopLeeftijd ?? null,
                        })
                      : getWealthCompositionTips({
                          fireAge: simResult.fireAge,
                          aowAge: userAowAge.fractional,
                          currentAge: currentAge ?? 30,
                        })
                  }
                  align="right"
                />
              </PillRow>
    </>
  )
}
