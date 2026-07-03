/**
 * What-if-projectie (FASE 6 stap 5A — kernel-only) — de ingang voor `/horizon/whatif`.
 * Sinds de v2-verwijdering is er nog maar één motor: de **horizon-kernel**.
 *
 * (Verving `lib/whatif-engine-router.ts`, die als enige BEIDE motoren aanriep. Nu de
 * grootboek-engine weg is, leeft de router bij de kernel — geen dubbele engine-koppeling
 * meer, dus geen lib-root-plaatsing nodig.)
 *
 * ## Geen tweede motor / geen diff meer
 * De vroegere `builtInput`/`v2FlagArg`/`kernelEnabled`-schakelaar, de
 * `detectV2OnlyMachinery`-terugval en de `withDiff`/`WhatifEngineDiff`-kern↔v2-
 * vergelijking zijn vervallen. `rawContext` is verplicht; de kernel is de enige uitkomst.
 *
 * ## Woning + rendement-slider
 * Woning-strategieën zijn kernel-native (de adapter mapt `housing_strategy_config`). De
 * rendement-slider/uniforme shift wordt vóór de adapter op `expected_return` van de
 * bezittingen toegepast (`applyReturnDeltasToAssets`).
 *
 * ## Expliciete fout i.p.v. stille terugval
 * Een kern-fout (bv. ontbrekende geboortedatum) → `{ ok: false, reason }`; de pagina
 * toont zijn bestaande lege/fout-staat. Bij succes: `{ ok: true, result }`.
 *
 * Deze module logt NOOIT (`console.*`).
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { TaxYear } from '@/lib/box3-data'
import { runKernelUnified } from '@/lib/horizon-kernel/run-unified'
import type { KernelUnifiedResult } from '@/lib/horizon-kernel/bridge'
import {
  applyReturnDeltasToAssets,
  buildWhatifKernelAdapterInput,
  type WhatifRawProfileRow,
} from '@/lib/horizon-kernel/adapter/whatif-varianten'

/**
 * Uitkomst van één what-if-run: het kernel-resultaat óf een expliciete fout.
 */
export type WhatifProjectionOutcome =
  | { readonly ok: true; readonly result: KernelUnifiedResult }
  | { readonly ok: false; readonly reason: string }

/**
 * De rauwe context waaruit de kernel-invoer wordt samengesteld. `assets`/`debts` zijn de
 * ONgemuteerde bezittingen/schulden; de router past de rendement-delta's zelf toe.
 */
export interface WhatifRawContext {
  readonly profile: WhatifRawProfileRow
  readonly assets: Asset[]
  readonly debts: Debt[]
  readonly lifeEvents: LifeEvent[]
  readonly aowRows?: AowLeeftijdRow[]
  readonly taxYear?: TaxYear
  /** Per-asset-type rendement-delta (decimaal) — de rendement-slider. */
  readonly returnDeltaByAssetType?: Record<string, number>
  /** Uniforme rendement-delta (decimaal) — pinned scenario's; per-type wint. */
  readonly uniformReturnDelta?: number
  /** Jaaruitgaven (reëel/koopkracht-nu) voor de bridge-`implicitWithdrawalRate`. */
  readonly yearlyExpenses: number
}

/** Parameters voor `computeWhatifProjection`. */
export interface ComputeWhatifProjectionParams {
  /** Rauwe context waaruit de kernel-invoer wordt samengesteld (verplicht). */
  readonly rawContext: WhatifRawContext
}

/**
 * Bereken één what-if-projectie via de horizon-kernel. Zie de module-doc voor het
 * fout-contract (kern-fout → `{ ok: false, reason }`).
 */
export function computeWhatifProjection(
  params: ComputeWhatifProjectionParams,
): WhatifProjectionOutcome {
  const { rawContext } = params
  try {
    // Rendement-slider/uniforme shift → pre-muteer `expected_return` vóór de adapter.
    const mutatedAssets = applyReturnDeltasToAssets(
      rawContext.assets,
      rawContext.returnDeltaByAssetType,
      rawContext.uniformReturnDelta,
    )
    const adapterInput = buildWhatifKernelAdapterInput({
      profile: rawContext.profile,
      assets: mutatedAssets,
      debts: rawContext.debts,
      lifeEvents: rawContext.lifeEvents,
      aowRows: rawContext.aowRows,
      taxYear: rawContext.taxYear,
    })
    const { result } = runKernelUnified({
      adapterInput,
      yearlyExpenses: rawContext.yearlyExpenses,
    })
    return { ok: true, result }
  } catch (err) {
    // Een kern-fout (bv. ontbrekende geboortedatum) mag de pagina nooit laten crashen
    // → expliciete fout met reden; de pagina toont zijn lege/fout-staat.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return { ok: false, reason: message }
  }
}
