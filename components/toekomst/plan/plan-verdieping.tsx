// Verplaatst uit components/app/horizon/horizon-client.tsx r7833–7989 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Zap } from 'lucide-react'
import { ActionCard } from '@/components/app/action-card'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { Dekkingsradar } from '@/components/app/horizon/dekkingsradar'
import type { SnapshotForTrend } from '@/components/app/horizon/horizon-helpers'
import { HorizonTrendGrid } from '@/components/app/horizon/horizon-trend-grid'
import { LevensinkomenStrook } from '@/components/app/horizon/levensinkomen-strook'
import { ScenarioChip } from '@/components/app/horizon/scenario-chip'
import { ScenarioKaarten } from '@/components/app/horizon/scenario-kaarten'
import { Kicker, SectionLabel } from '@/components/editorial'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { HealthScore } from '@/lib/financial-health'
import type { SimResult } from '@/lib/fire-simulation'
import { type AnkerStop, radarSubtitel } from '@/lib/horizon/anker-copy'
import type { CoverageNode } from '@/lib/horizon/coverage-strip'
import type { RadarAs } from '@/lib/horizon/dekkingsradar'
import { formatAge } from '@/lib/horizon/fire-format'
import type { ForcedStopPathResult, ScenarioPresetResult } from '@/lib/horizon/scenario-presets'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import { useInViewOnce } from './use-in-view-once'

// Kopie van horizon-client r297–304 + r309–312 — V3: de dynamic() verhuist mee met zijn
// enige consument; de integrator schrapt de declaratie in horizon-client bij het inpluggen.
// Zwaar-maar-conditionele sub-componenten uit de first-load JS van /toekomst
// gehaald (bundle ronde 2). Mount-condities blijven ONGEWIJZIGD zodat gedrag +
// animaties identiek blijven — dynamic({ssr:false}) haalt de code enkel uit de
// synchrone first-load-bundle en laadt de chunk na hydratatie. Bewust géén
// mount-gate: de year-details-sheet (BottomSheet) heeft een intern open→exit-
// animatie-statemachine die alleen speelt als het gemount blijft, en
// HouseholdFireSection rendert vaak null (solo-gebruiker) + beheert z'n eigen
// laadstaat, dus een skeleton-fallback zou flitsen. `loading` = null (default).
const HouseholdFireSection = dynamic(() =>
  import('@/components/app/household-fire-section').then(m => ({ default: m.HouseholdFireSection })),
  { ssr: false }
)

/**
 * Blok Q (katern III: levensinkomen, radar, scenario's), R (HouseholdFireSection — moet op
 * Plan gemount blijven, ADR 0168), S (HorizonTrendGrid) en T (geplande acties).
 *
 * Kaart V1: `useInViewOnce` draait híér, naast de sectie die hij observeert. Een hook in
 * een provider die eerder mount dan dit paneel haakt nooit aan (Doelen → Plan). De ouder
 * krijgt de uitkomst via `onDuidingInView` en latcht hem.
 */
export interface PlanVerdiepingProps {
  coverageNodes: CoverageNode[] // horizon-client r3014
  radarAssen: RadarAs[] | null // horizon-client r3079
  scenarioPresets: ScenarioPresetResult[] | null // horizon-client r790
  scenarioPresetsLoading: boolean // horizon-client r791
  hasScenario: boolean // horizon-client r1186
  hasStopKeuze: boolean // horizon-client r1210
  usePartnerMainLine: boolean // horizon-client r3318
  useHouseholdMainLine: boolean // horizon-client r3320
  doelActief: boolean // horizon-client r1212
  stopPad: ForcedStopPathResult | null | undefined // horizon-client r1253
  duidingStopAge: number | null // horizon-client r3031
  simResult: SimResult | null // horizon-client r1253
  userAowAge: AowAge // horizon-client r731
  lifelineAge: number | null // horizon-client r802
  isFixedAnchorMode: boolean // horizon-client r2144
  ankerStop: AnkerStop | null // horizon-client r2736
  scenarioVerwachtFireAge: number | null // horizon-client r2125
  viewScenarioPresets: ScenarioPresetResult[] | null // horizon-client r5561
  personalHeroProjection: { fireAge: number | null; fireAgeFractional: number | null; fireTarget: number; freedomPercentage: number; fireDate: string; freedomYears: number; freedomMonths: number; } | null // horizon-client r3508
  resilienceSnapshots: SnapshotForTrend[] // horizon-client r709
  healthScore: HealthScore // horizon-client r703
  healthChartOpen: boolean // horizon-client r710
  setHealthChartOpen: Dispatch<SetStateAction<boolean>> // horizon-client r710
  fireAgeChartOpen: boolean // horizon-client r711
  setFireAgeChartOpen: Dispatch<SetStateAction<boolean>> // horizon-client r711
  setShowResilienceReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r961
  actions: Action[] // horizon-client r714
  handleActionStatusChange: (id: string, status: ActionStatus, data?: Record<string, unknown> | undefined) => Promise<void> // horizon-client r4408
  /** V1 — wordt aangeroepen zodra de duiding-sectie (bijna) in beeld is; de ouder latcht `duidingInView = true` (nooit terugzetten). */
  onDuidingInView: () => void
}

export function PlanVerdieping({
  coverageNodes,
  radarAssen,
  scenarioPresets,
  scenarioPresetsLoading,
  hasScenario,
  hasStopKeuze,
  usePartnerMainLine,
  useHouseholdMainLine,
  doelActief,
  stopPad,
  duidingStopAge,
  simResult,
  userAowAge,
  lifelineAge,
  isFixedAnchorMode,
  ankerStop,
  scenarioVerwachtFireAge,
  viewScenarioPresets,
  personalHeroProjection,
  resilienceSnapshots,
  healthScore,
  healthChartOpen,
  setHealthChartOpen,
  fireAgeChartOpen,
  setFireAgeChartOpen,
  setShowResilienceReceipt,
  actions,
  handleActionStatusChange,
  onDuidingInView,
}: PlanVerdiepingProps) {
  // Kopie van horizon-client r1022–1028 (V1): ref en zichtbaarheidshook bij de sectie zelf.
  const duidingSectionRef = useRef<HTMLElement | null>(null)
  const duidingInView = useInViewOnce(duidingSectionRef)
  useEffect(() => {
    if (duidingInView) onDuidingInView()
  }, [duidingInView, onDuidingInView])

  return (
    <>
      {/* === KATERN III — Wat het betekent ===
          Eén katern-kaart: SectionLabel + één card-editorial met de drie delen
          (Levensinkomenstrook / Dekkingsradar / Scenario's) als interne segmenten,
          gescheiden door hairlines. Label én kaart renderen zodra ten minste één
          segment rendert (per-segment-condities blijven ongewijzigd). */}
      {(() => {
        const heeftKaternIII =
          coverageNodes.length > 0 ||
          radarAssen !== null ||
          scenarioPresets !== null ||
          scenarioPresetsLoading
        if (!heeftKaternIII) return null
        // Tot ADR 0170 klapte deze duiding mee met KATERN II ("doel dicht = alles
        // dicht"). Dat inklappen bestaat niet meer — het doelscenario staat altijd
        // open in de grafiekkaart — dus is die koppeling vervallen; ze hield de
        // duiding anders permanent verborgen.
        return (
          <>
            <HideInSimple>
              <SectionLabel className="mt-8 sm:mt-10" num="III">Wat het betekent</SectionLabel>
            </HideInSimple>
            <HideInSimple>
              <section ref={duidingSectionRef} className="mt-6 sm:mt-8">
                <div className="card-editorial no-hover-lift divide-y divide-[var(--border-ed)]">
                  {/* === 4b. Levensinkomenstrook (dekkingsgraad per leeftijd) === */}
                  {coverageNodes.length > 0 && (
                    <div className="p-4 sm:p-5">
                      <div className="mb-1">
                        <Kicker className="mb-1">Levensinkomenstrook</Kicker>
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">Dekt je inkomen straks je uitgaven?</h2>
                          {(hasScenario || hasStopKeuze) && !(usePartnerMainLine || useHouseholdMainLine) && <ScenarioChip doelActief={doelActief} hasScenario={hasScenario} />}
                        </div>
                      </div>
                      <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                        Dekkingsgraad per leeftijd — rekent met je gekozen stopleeftijd zodra je die zet.
                      </p>
                      {(() => {
                        const first = coverageNodes[0].age
                        const last = coverageNodes[coverageNodes.length - 1].age
                        const span = Math.max(1, last - first)
                        // Fasegrens = het gekozen stopmoment zodra een expliciete stop gezet is —
                        // de GELANDE stop-run-leeftijd (duidingStopAge), zodat de opbouw/brug-grens
                        // én de dekkingsdip in de strook bij dezelfde rijen horen; anders het
                        // verwacht-FIRE-moment.
                        const fire = Math.round(
                          stopPad != null && duidingStopAge != null
                            ? duidingStopAge
                            : (simResult?.fireAgeFractional ?? simResult?.fireAge ?? first),
                        )
                        const aow = Math.round(userAowAge?.fractional ?? fire)
                        const pct = (a: number) => Math.max(0, Math.min(100, ((a - first) / span) * 100))
                        // Onttrekking begint pas op max(stop, AOW): wie vóórbij de AOW
                        // doorwerkt heeft geen brug én nog geen onttrekking — anders
                        // tellen de segmentbreedtes op tot >100% en spreekt de balk de
                        // (nog groene) opbouw-stippen 67–74 tegen.
                        const segments = [
                          { label: 'Opbouw', color: 'var(--hor-t, #8a6e42)', widthPct: pct(fire) },
                          { label: 'Brug FIRE → AOW', color: 'var(--color-horizon-500)', widthPct: Math.max(0, pct(aow) - pct(fire)) },
                          { label: 'Onttrekking', color: 'var(--kern-t, #58362d)', widthPct: Math.max(0, 100 - pct(Math.max(fire, aow))) },
                        ]
                        // 0%-brede fasen niet meegeven: anders toont de legenda een
                        // "Brug FIRE → AOW"-swatch bij een band die niet bestaat (stop ≥ AOW).
                        return <LevensinkomenStrook nodes={coverageNodes} activeAge={lifelineAge} segments={segments.filter((s) => s.widthPct > 0)} />
                      })()}
                    </div>
                  )}

                  {/* === 4c. Dekkingsradar (vier dekkingsratio's) === */}
                  {radarAssen !== null && (
                    <div className="p-4 sm:p-5">
                      <div className="mb-1">
                        <Kicker className="mb-1">Dekkingsradar</Kicker>
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">Hoe stevig staat je plan?</h2>
                          {(hasScenario || hasStopKeuze) && !(usePartnerMainLine || useHouseholdMainLine) && <ScenarioChip doelActief={doelActief} hasScenario={hasScenario} />}
                        </div>
                      </div>
                      {/* De grondslag hoort in beeld: op wélk scenario (en welke stopleeftijd) rekenen
                          deze assen? Zelfde gelande bron als de assen zelf (duidingStopAge). */}
                      <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                        {/* ADR 0145 — onder een vast stopmoment rekent de radar op het plan
                            (of op een verkend stopmoment); onder `solved` blijft de tekst van vandaag. */}
                        {(isFixedAnchorMode
                          ? radarSubtitel({ stop: ankerStop, verkendStopAge: stopPad != null ? duidingStopAge : null })
                          : null) ??
                          (stopPad != null && duidingStopAge != null
                          ? `Vier dekkingsratio’s — gerekend op je doelscenario: stoppen op ${formatAge(duidingStopAge)} jr.`
                          : scenarioVerwachtFireAge != null
                            ? `Vier dekkingsratio’s — gerekend op je verwachte pad (vrij rond ${formatAge(scenarioVerwachtFireAge)} jr).`
                            : 'Vier dekkingsratio’s — op elk front.')}
                      </p>
                      <Dekkingsradar assen={radarAssen} />
                    </div>
                  )}

                  {/* === 4d. Scenario's naast elkaar (5 preset-kaarten, tegen je basispad) === */}
                  {(scenarioPresets !== null || scenarioPresetsLoading) && (
                    <div className="p-4 sm:p-5">
                      <div className="mb-1">
                        <Kicker className="mb-1">Scenario&apos;s naast elkaar</Kicker>
                        <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">Wat als het anders loopt?</h2>
                      </div>
                      <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                        Vijf paden — één basispad, verbeteringen en één waarschuwing; elk pad wordt afgezet tegen je basispad.
                      </p>
                      <ScenarioKaarten kaarten={viewScenarioPresets ?? []} isLoading={scenarioPresetsLoading} />
                    </div>
                  )}
                </div>
              </section>
            </HideInSimple>
          </>
        )
      })()}

      {/* === 5. Household FIRE Projections === */}
      <HideInSimple>
        <HouseholdFireSection personalProjection={personalHeroProjection} />
      </HideInSimple>



      {/* === 5b. Verloop-grid: Gezondheid + FIRE-leeftijd (Deep Dive) === */}
      <HideInSimple>
        <HorizonTrendGrid
          resilienceSnapshots={resilienceSnapshots}
          healthScoreTotal={healthScore.total}
          healthChartOpen={healthChartOpen}
          onToggleHealth={() => setHealthChartOpen(v => !v)}
          fireAgeChartOpen={fireAgeChartOpen}
          onToggleFireAge={() => setFireAgeChartOpen(v => !v)}
          onOpenResilienceReceipt={() => setShowResilienceReceipt(true)}
        />
      </HideInSimple>


      {/* === 9. Acties (Primary Content) === */}
      {actions.length > 0 && (
        <HideInSimple>
          <section className="mt-4 sm:mt-8">
            <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
              <Zap className="mr-1.5 inline h-3.5 w-3.5 text-horizon-600" />
              Geplande acties (komend jaar)
            </h2>
            <div className="space-y-2">
              {actions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onStatusChange={handleActionStatusChange}
                />
              ))}
            </div>
          </section>
        </HideInSimple>
      )}
    </>
  )
}
