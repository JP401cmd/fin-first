// Verplaatst uit components/app/horizon/horizon-client.tsx r7655–7744 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Onder de grafiek (blok N): de legenda-regels van de extra reeksen die het canvas
 * zelf aanzet — Rendement hoger en lager, en de Marktcheck. De hoofdlijn, de
 * doelscenario-lijn en de lijn met je huis legendeert `SimChart` zelf.
 *
 * Fase 2 (ADR 0179, spec §4.9):
 * - Een legenda staat er alleen bij twee of meer reeksen (`toonLegendaBij`); markers
 *   zijn geen reeks en krijgen geen legenda-item (ze hebben labels en tooltips).
 * - Het jargon "p25–p75" verhuisde naar de uitleg in het Lagen-menu; de band heet hier
 *   gewoon Marktcheck.
 * - De voetnoot (strategie · eindleeftijd · knop naar de jaartabel) en de
 *   stopmoment-hint eronder vervallen: de aannamesregel onder het canvas en de
 *   jaar-op-jaar-link in Plan nemen ze over (spec §7.3).
 *
 * Toont percentages en aantallen, geen bedragen; rekent niets.
 */

import type { Dispatch, SetStateAction } from 'react'
import { margeAnkerKort, margeLegenda, margeZin } from '@/lib/horizon/marktcheck-copy'
import type { MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import type { RendementMarge } from '@/lib/horizon-kernel/rendement-marge'
import type { FireParams } from '@/lib/fire-params'
import { LAAG_LABEL } from '@/lib/horizon/katern-copy'
import { SCENARIO_VARIANTS, type ScenarioOverlay } from '@/components/app/horizon/sim-chart'
import type { ActiveModal } from '@/components/toekomst/state/types'
import { toonLegendaBij } from './canvas-stand'
import { MARKTCHECK_MISLUKT_REGEL } from './canvas-kopij-voorlopig'

export interface CanvasLegendaProps {
  /** Aantal reeksen op de grafiek (`aantalReeksen`); onder de twee geen legenda. */
  aantalReeksen: number
  /** Laag "Rendement hoger en lager" staat effectief aan. */
  rendementScenarios: boolean
  scenarioData: ScenarioOverlay[] | null
  fireParams: FireParams
  setActiveModal: Dispatch<SetStateAction<ActiveModal>>
  /** Laag Marktcheck staat effectief aan. */
  marktcheck: boolean
  mcData: Extract<MarktcheckOutcome, { ok: true }> | null
  mcMarge: RendementMarge | null
  mcPending: boolean
  mcFailed: boolean
  liquidWealthPoints: [number, number][] | undefined
}

export function CanvasLegenda({
  aantalReeksen,
  rendementScenarios,
  scenarioData,
  fireParams,
  setActiveModal,
  marktcheck,
  mcData,
  mcMarge,
  mcPending,
  mcFailed,
  liquidWealthPoints,
}: CanvasLegendaProps) {
  if (!toonLegendaBij(aantalReeksen)) return null
  const toonRendement = rendementScenarios && scenarioData != null
  const toonMarktcheck = marktcheck && (mcData != null || mcPending || mcFailed)
  if (!toonRendement && !toonMarktcheck) return null

  return (
    <div className="mt-2 space-y-2" data-testid="canvas-legenda">
      {toonRendement && (
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
            className="inline-flex min-h-[44px] items-center font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700 lg:min-h-0"
          >
            Verdiepen &rarr;
          </button>
        </div>
      )}

      {toonMarktcheck && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-live="polite" aria-busy={mcPending}>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
            <span className="inline-block h-2.5 w-3.5 bg-[var(--hor-t,#8a6e42)] opacity-[0.18]" aria-hidden="true" />
            {LAAG_LABEL.marktcheck}
            {mcPending && <span className="font-mono text-[10px] text-[var(--ink-4)]">…</span>}
          </span>
          {!mcPending && mcFailed && (
            <span className="font-serif text-[11px] text-[var(--ink-3)]">{MARKTCHECK_MISLUKT_REGEL}</span>
          )}
          {!mcPending && mcData && mcMarge && (
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
          {!mcPending && mcData && (
            <>
              <span className="text-[11px] text-[var(--ink-2)]">
                <span className="font-mono tabular-nums text-[var(--ink-3)]">{mcData.runs}</span> marktverlopen
              </span>
              <button
                type="button"
                onClick={() => setActiveModal('simulations')}
                className="inline-flex min-h-[44px] items-center font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700 lg:min-h-0"
              >
                Verdiepen &rarr;
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
