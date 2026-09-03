/**
 * Horizon-kernel worker — GEDEELD protocol (Task 4.2, ADR 0054).
 *
 * Eén bestand dat zowel de client-side abstractie (`run-in-worker.ts`) als de
 * worker-entry (`kernel.worker.ts`) importeren, zodat het bericht-contract
 * (`KernelWorkerRequest` ⇄ `KernelWorkerResponse`) en de daadwerkelijke reken-
 * dispatch (`executeKernelRequest`) op één plek leven. Zo kan de SYNCHRONE
 * FALLBACK (jsdom/SSR — geen `Worker`) exact dezelfde dispatch aanroepen als de
 * echte worker → byte-identieke uitkomst (parity heilig).
 *
 * ## Puur & isomorf
 * Importeert alléén de pure reken-modules (`convergentie-router`,
 * `scenario-presets`, `horizon-data`) — GEEN react/window/document/Supabase.
 * Daardoor is deze module veilig in een `type:'module'`-Worker én tijdens SSR.
 * De rekenkern zelf verandert NIET van gedrag; dit is enkel een aanroep-/
 * scheduling-laag (waar de kernel draait, niet hoe hij rekent).
 *
 * ## Serialisatie
 * Alle request-payloads (`rawContext`, `ForcedStopPathInput`, `ScenarioPresetContext`,
 * `FinancialInput` + MC-parameters) en alle responses (`ConvergentieProjectionOutcome`,
 * `ForcedStopPathResult`, `ScenarioPresetResult[]`, `MonteCarloResult`) zijn plain-
 * serializable (getallen/strings/plain objects/arrays/null) → structured-clone-veilig
 * over de `postMessage`-grens. De worker-parity-test bewijst dit met een
 * `structuredClone`-round-trip.
 */

import {
  computeConvergentieProjection,
  computeMarktcheck,
  type ConvergentieRawContext,
  type ConvergentieProjectionOutcome,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  computeWhatifMarktcheck,
  type WhatifRawContext,
} from '@/lib/horizon-kernel/whatif-router'
import type { MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import {
  runForcedStopPath,
  runScenarioPresetBatch,
  type ForcedStopPathInput,
  type ForcedStopPathResult,
  type ScenarioPresetBatch,
  type ScenarioPresetContext,
} from '@/lib/horizon/scenario-presets'
import {
  runMonteCarlo,
  type FinancialInput,
  type FutureCashflow,
  type MonteCarloResult,
} from '@/lib/horizon-data'
import {
  runVariantenSweep,
  type VariantenSweepResultaat,
  type VariantenSweepSnapshot,
} from '@/lib/tax-lifetime/varianten-sweep'

/**
 * Eén reken-verzoek aan de kernel-worker. `id` multiplext parallelle runs
 * (hoofd/scenario/stop/MC/presets) over één worker-instance. `kind` dispatcht
 * naar de bijbehorende pure runner. `main` en `scenario` delen bewust dezelfde
 * `projection`-operatie (`computeConvergentieProjection`) — het verschil zit in
 * de aangeleverde `rawContext` (scenario-assets/-events), niet in de bewerking.
 */
export type KernelWorkerRequest =
  | { readonly id: number; readonly kind: 'projection'; readonly rawContext: ConvergentieRawContext }
  | { readonly id: number; readonly kind: 'stoppad'; readonly input: ForcedStopPathInput }
  | { readonly id: number; readonly kind: 'presets'; readonly ctx: ScenarioPresetContext }
  /**
   * Fiscale variantensweep (Fase 3): DRIE kernel-solves + de levenslange
   * belastingreeks erbovenop. Bewust één request i.p.v. drie `projection`-requests:
   * zo blijft de ranking-logica bij de solves én kruist alleen de compacte uitkomst
   * de `postMessage`-grens — niet 3 × ~50 vette `UnifiedProjectionRow`s.
   */
  | { readonly id: number; readonly kind: 'taxvarianten'; readonly snapshot: VariantenSweepSnapshot }
  | {
      readonly id: number
      readonly kind: 'mc'
      readonly input: FinancialInput
      readonly sims: number
      readonly years: number
      readonly swrOverride?: number
      readonly volatilityOverride?: number
      readonly cashflows?: FutureCashflow[]
    }
  /**
   * Marktcheck (Monte Carlo op de horizon-kernel): n VOLLEDIGE projecties op
   * dezelfde `rawContext` als de hoofdprojectie. Bewust een eigen `kind` naast
   * `'mc'` — die laatste is de losstaande legacy-motor die de fase-modals nog
   * gebruiken; deze levert de percentielband die de Toekomst-grafiek tekent.
   */
  | {
      readonly id: number
      readonly kind: 'marktcheck'
      readonly rawContext: ConvergentieRawContext
      readonly maxRuns?: number
      /** Anker van de rendement-marge (de stop-slider); zie `marktcheck.ts`. */
      readonly stopAge?: number | null
    }
  /** Dezelfde marktcheck op de what-if-context (mét rendement-slider). */
  | {
      readonly id: number
      readonly kind: 'whatif-marktcheck'
      readonly rawContext: WhatifRawContext
      readonly maxRuns?: number
      readonly stopAge?: number | null
    }

/** Antwoord van de kernel-worker; `kind` spiegelt de request zodat de client typed uitpakt. */
export type KernelWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly kind: 'projection'; readonly result: ConvergentieProjectionOutcome }
  | { readonly id: number; readonly ok: true; readonly kind: 'stoppad'; readonly result: ForcedStopPathResult | null }
  | { readonly id: number; readonly ok: true; readonly kind: 'presets'; readonly result: ScenarioPresetBatch }
  | { readonly id: number; readonly ok: true; readonly kind: 'taxvarianten'; readonly result: VariantenSweepResultaat }
  | { readonly id: number; readonly ok: true; readonly kind: 'mc'; readonly result: MonteCarloResult }
  | { readonly id: number; readonly ok: true; readonly kind: 'marktcheck'; readonly result: MarktcheckOutcome }
  | { readonly id: number; readonly ok: true; readonly kind: 'whatif-marktcheck'; readonly result: MarktcheckOutcome }
  | { readonly id: number; readonly ok: false; readonly error: string }

/**
 * Voer één reken-verzoek uit. Gedeeld door de worker-entry (`onmessage`) én de
 * synchrone fallback (`run-in-worker.ts`), zodat beide paden byte-identiek zijn.
 * De onderliggende runners vangen hun eigen kern-fouten al af
 * (`computeConvergentieProjection` → `{ ok:false }`, `runForcedStopPath` → `null`);
 * de try/catch hier is een extra vangnet dat een onverwachte throw als nette
 * `{ ok:false, error }` teruggeeft in plaats van de worker te laten crashen.
 */
export function executeKernelRequest(req: KernelWorkerRequest): KernelWorkerResponse {
  try {
    switch (req.kind) {
      case 'projection':
        return {
          id: req.id,
          ok: true,
          kind: 'projection',
          result: computeConvergentieProjection({ rawContext: req.rawContext }),
        }
      case 'stoppad':
        return { id: req.id, ok: true, kind: 'stoppad', result: runForcedStopPath(req.input) }
      case 'presets':
        // ADR 0129 D7 — de zes kaarten + de tweede run ("vrij mogelijk vanaf") in ÉÉN
        // oversteek; zie `runScenarioPresetBatch`.
        return { id: req.id, ok: true, kind: 'presets', result: runScenarioPresetBatch(req.ctx) }
      case 'taxvarianten':
        return {
          id: req.id,
          ok: true,
          kind: 'taxvarianten',
          result: runVariantenSweep(req.snapshot),
        }
      case 'mc':
        return {
          id: req.id,
          ok: true,
          kind: 'mc',
          result: runMonteCarlo(
            req.input,
            req.sims,
            req.years,
            req.swrOverride,
            req.volatilityOverride,
            req.cashflows,
          ),
        }
      case 'marktcheck':
        return {
          id: req.id,
          ok: true,
          kind: 'marktcheck',
          result: computeMarktcheck({
            rawContext: req.rawContext,
            maxRuns: req.maxRuns,
            stopAge: req.stopAge,
          }),
        }
      case 'whatif-marktcheck':
        return {
          id: req.id,
          ok: true,
          kind: 'whatif-marktcheck',
          result: computeWhatifMarktcheck({
            rawContext: req.rawContext,
            maxRuns: req.maxRuns,
            stopAge: req.stopAge,
          }),
        }
    }
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : 'onbekende worker-fout' }
  }
}
