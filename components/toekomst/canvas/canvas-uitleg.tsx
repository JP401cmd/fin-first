// Verplaatst uit components/app/horizon/horizon-client.tsx r7157–7237 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Uitleg onder de pillen: vijf ChartOverlayExplainers + de LifelineReadout
 * (blok K). De readout krijgt `viewReadoutData` (al in de actieve
 * euro-weergave); `liquidWealthPoints` is nominaal en wordt hier alleen op
 * aanwezigheid getoetst.
 */
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

import { margeZin } from '@/lib/horizon/marktcheck-copy'
import type { MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import type { RendementMarge } from '@/lib/horizon-kernel/rendement-marge'
import type { ScenarioOverlay } from '@/components/app/horizon/sim-chart'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { LifelineReadout } from '@/components/app/horizon/lifeline-readout'
import { GlossaryTerm } from '@/components/editorial'
import { ChartOverlayExplainer } from '@/components/app/horizon/chart-overlay-explainer'
import type { ChartMode, ReadoutData } from './types'

export interface CanvasUitlegProps {
  scenariosExpanded: boolean
  scenarioData: ScenarioOverlay[] | null
  mcExpanded: boolean
  mcData: Extract<MarktcheckOutcome, { ok: true }> | null
  mcMarge: RendementMarge | null
  mcFailed: boolean
  liquidWealthPoints: [number, number][] | undefined
  chartMode: ChartMode
  secondaryLineVisible: boolean
  effectiveChartPrimaryBasis: 'total' | 'liquid'
  viewReadoutData: ReadoutData | null
  lifelineAge: number | null
}

export function CanvasUitleg({
  scenariosExpanded,
  scenarioData,
  mcExpanded,
  mcData,
  mcMarge,
  mcFailed,
  liquidWealthPoints,
  chartMode,
  secondaryLineVisible,
  effectiveChartPrimaryBasis,
  viewReadoutData,
  lifelineAge,
}: CanvasUitlegProps) {
  return (
    <>
              {/* ── Editorial quote-explainers per actieve overlay/optie ── */}
              <ChartOverlayExplainer active={scenariosExpanded && !!scenarioData}>
                De <em>scenario-lijnen</em> tonen je vermogenspad onder een
                voorzichtiger en optimistischer <GlossaryTerm term="rendement">rendement</GlossaryTerm> (±2 procentpunt).
                Zo zie je hoe gevoelig je pad is voor onzekere markten.
              </ChartOverlayExplainer>

              <ChartOverlayExplainer active={mcExpanded && !!mcData}>
                De <GlossaryTerm term="Monte_Carlo"><em>marktcheck</em></GlossaryTerm> rekent je hele plan
                {mcData ? ` ${mcData.runs} ` : ' '}keer opnieuw door met een ander marktverloop —
                opbouw, stoppen én onttrekking. De band toont waar je <GlossaryTerm term="netto_vermogen">netto vermogen</GlossaryTerm> dan
                uitkomt: de middelste helft van de marktverlopen (p25–p75), met de mediaan
                als lijn.
                {mcMarge && (
                  <> Het getal ernaast is je <em>speling</em>: {margeZin(mcMarge)}{' '}
                  {mcMarge.anker === 'aow'
                    ? 'Je hebt nog geen eigen stopleeftijd gekozen, dus rekenen we met je AOW-leeftijd — schuif de stopleeftijd en het getal beweegt mee.'
                    : 'Schuif je stopleeftijd en je ziet direct wat een jaar langer of korter doorwerken aan speling oplevert.'}</>
                )}
                {!mcMarge && (
                  <> Een speling-getal tonen we hier niet: op de gekozen stopleeftijd is er
                  binnen dit plan geen onttrekkingsfase om te toetsen.</>
                )}
                {liquidWealthPoints != null && (
                  <> Let op de <em>grondslag</em>: de band telt je huis mee, de speling kijkt
                  alleen naar het geld waar je bij kunt — dezelfde grondslag als de lijn
                  &ldquo;zonder je huis&rdquo;. Daardoor kan de band ruim boven nul eindigen
                  terwijl de speling krap is: die overwaarde zit in je huis, niet in je
                  portefeuille.</>
                )}
              </ChartOverlayExplainer>

              <ChartOverlayExplainer active={mcExpanded && mcFailed}>
                De <em>marktcheck</em> kon niet worden doorgerekend — er is nu geen band en geen
                percentage. Je plan-lijn zelf klopt gewoon; alleen de doorrekening met wisselende
                markten ontbreekt. Zet de pil uit en weer aan om het opnieuw te proberen.
              </ChartOverlayExplainer>

              {/* Waarom de twee lijnen uit elkaar lopen — feitelijk, geen advies.
                  Het verhaal is hetzelfde, ongeacht welke van de twee de dikke
                  lijn is; alleen de aanwijzing verschilt. */}
              <ChartOverlayExplainer
                active={chartMode === 'vermogenspad' && secondaryLineVisible}
              >
                De lijn <em>zonder je huis</em> toont het deel van je vermogen waar
                je direct bij kunt. Je huis zit daar niet in — daardoor kan de lijn
                met je huis doorgroeien terwijl die andere lijn daalt.
                {effectiveChartPrimaryBasis === 'liquid' && (
                  <> Omdat je je huis buiten je vrijheidsdoel houdt, is de lijn
                  <em> zonder je huis</em> hier de dikke lijn — dezelfde grondslag
                  als de balk eronder.</>
                )}
              </ChartOverlayExplainer>

              <ChartOverlayExplainer active={chartMode === 'vermogensopbouw'}>
                In <em>opbouw</em>-modus zie je de samenstelling van je vermogen —
                hoeveel komt uit eigen bijdragen, hoeveel uit <GlossaryTerm term="rendement">rendement</GlossaryTerm>, en hoe
                schulden je <GlossaryTerm term="netto_vermogen">netto vermogen</GlossaryTerm> drukken. Geeft inzicht in waar je
                groei vandaan komt.
              </ChartOverlayExplainer>

              {/* Cijferbar boven de grafiek — beweegt mee met hover/playback en
                  vervangt de zwevende tooltip. Alleen volledige weergave + pad-modus. */}
              <HideInSimple>
                {chartMode === 'vermogenspad' && viewReadoutData && (
                  <div className="mb-2">
                    <LifelineReadout
                      age={viewReadoutData.age}
                      year={viewReadoutData.year}
                      phaseLabel={viewReadoutData.phaseLabel}
                      phaseColor={viewReadoutData.phaseColor}
                      netWorth={viewReadoutData.netWorth}
                      freedomTime={viewReadoutData.freedomTime}
                      monthlyLabel={viewReadoutData.monthlyLabel}
                      monthlyAmount={viewReadoutData.monthlyAmount}
                      netWorthMoment={viewReadoutData.netWorthMoment}
                      isResting={lifelineAge === null}
                    />
                  </div>
                )}
              </HideInSimple>
    </>
  )
}
