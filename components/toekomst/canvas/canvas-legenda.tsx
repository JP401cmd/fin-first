// Verplaatst uit components/app/horizon/horizon-client.tsx r7655–7744 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Onder de grafiek (blok N): legenda Scenario's/Marktcheck, de voetnoot met de
 * knop naar de jaar-op-jaar-tabel (M9) en de strategie-hint. Toont percentages
 * en aantallen, geen bedragen; rekent niets.
 */

import type { Dispatch, SetStateAction } from 'react'
import { margeAnkerKort, margeLegenda, margeZin } from '@/lib/horizon/marktcheck-copy'
import type { MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import type { RendementMarge } from '@/lib/horizon-kernel/rendement-marge'
import type { SimResult } from '@/lib/fire-simulation'
import type { FireParams } from '@/lib/fire-params'
import { SCENARIO_VARIANTS, type ScenarioOverlay } from '@/components/app/horizon/sim-chart'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import { ankerTitel, type AnkerStop } from '@/lib/horizon/anker-copy'
import type { ActiveModal } from './types'

export interface CanvasLegendaProps {
  scenariosExpanded: boolean
  scenarioData: ScenarioOverlay[] | null
  fireParams: FireParams
  setActiveModal: Dispatch<SetStateAction<ActiveModal>>
  mcExpanded: boolean
  mcData: Extract<MarktcheckOutcome, { ok: true }> | null
  mcMarge: RendementMarge | null
  liquidWealthPoints: [number, number][] | undefined
  simResult: SimResult
  setSimModalOpen: Dispatch<SetStateAction<boolean>>
  isFixedAnchorMode: boolean
  ankerStop: AnkerStop | null
}

export function CanvasLegenda({
  scenariosExpanded,
  scenarioData,
  fireParams,
  setActiveModal,
  mcExpanded,
  mcData,
  mcMarge,
  liquidWealthPoints,
  simResult,
  setSimModalOpen,
  isFixedAnchorMode,
  ankerStop,
}: CanvasLegendaProps) {
  return (
    <>
              {/* ── Legenda + detail-links onder de grafiek ── */}
              <div className="mt-2 space-y-2">
                {/* Scenario legenda */}
                {scenariosExpanded && scenarioData && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {scenarioData.map((s, i) => (
                      <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                        <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: s.color, opacity: 0.7 }} />
                        {s.label}
                        <span className="font-mono tabular-nums text-[var(--ink-4)]">
                          {((fireParams.grossReturn + SCENARIO_VARIANTS[i].delta) * 100).toFixed(1)}%
                        </span>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setActiveModal('scenarios')}
                      className="font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700"
                    >
                      Verdiepen &rarr;
                    </button>
                  </div>
                )}

                {/* Marktcheck-legenda */}
                {mcExpanded && mcData && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {/* Alleen p25–p75 staat in de legenda: dat is sinds 2026-08-09
                        ook exact wat er getekend wordt (en wat de Y-as bepaalt). */}
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                      <span className="inline-block h-2.5 w-3.5 bg-[var(--hor-t,#8a6e42)] opacity-[0.18]" />
                      p25–p75
                    </span>
                    {mcMarge && (
                      <span
                        className="text-[11px] text-[var(--ink-2)]"
                        title={liquidWealthPoints != null
                          ? `${margeZin(mcMarge)} Gemeten op je besteedbaar vermogen (zonder je huis) — de band toont je netto vermogen mét huis.`
                          : margeZin(mcMarge)}
                      >
                        {margeLegenda(mcMarge)}{' '}
                        <span className="text-[var(--ink-4)]">
                          {margeAnkerKort(mcMarge)}
                          {liquidWealthPoints != null && ', zonder huis'}
                        </span>
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--ink-2)]">
                      <span className="font-mono tabular-nums text-[var(--ink-3)]">{mcData.runs}</span> marktverlopen
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveModal('simulations')}
                      className="font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700"
                    >
                      Verdiepen &rarr;
                    </button>
                  </div>
                )}
              </div>

              {/* Voetnoot. "Details" is hier nu zélf de knop (M9): de echte
                  Details-pill staat helemaal bovenin dezelfde kaart, dus wie
                  naar deze regel gescrold heeft ziet 'm niet staan — dat is de
                  "de knop viel buiten het zichtbare deel"-waarneming uit de
                  bevinding. Zelfde handler, geen tweede pad. */}
              <p className="mt-3 font-sans text-[10px] text-[var(--ink-4)]">
                {STRATEGY_LABELS[simResult.strategy].name} &middot; Weergave t/m leeftijd {simResult.displayEndAge - 1} (eindleeftijd {simResult.displayEndAge}) &middot;{' '}
                <button
                  type="button"
                  onClick={() => setSimModalOpen(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="underline underline-offset-2 transition-colors hover:text-horizon-600"
                >
                  Open de jaar-op-jaar-tabel
                </button>
              </p>

              {/* Context-hint: modus indicator + link to StrategieModal */}
              <button
                type="button"
                onClick={() => setActiveModal('strategie')}
                className="mt-1 block font-sans text-[10px] text-[var(--ink-4)] transition-colors hover:text-horizon-600"
                style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}
              >
                {/* ADR 0129 B10 — geen modus-label maar het plan in gewone taal. */}
                {isFixedAnchorMode && ankerStop != null
                  ? <>{ankerTitel(ankerStop)} &middot; <span className="ml-0.5 underline underline-offset-2">Stopmoment wijzigen &rarr;</span></>
                  : <>De app rekent je stopmoment uit &middot; <span className="ml-0.5 underline underline-offset-2">Zelf een stopmoment kiezen &rarr;</span></>}
              </button>
    </>
  )
}
