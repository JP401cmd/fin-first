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
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import {
  runMarktcheckOnKernelInput,
  type MarktcheckOutcome,
} from '@/lib/horizon-kernel/marktcheck'

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
  /**
   * ADR 0117 — jaargelaagde markt-volatiliteit (`fire_assumptions.volatility`,
   * decimaal) voor MC!B3. Weglaten → de kernel-default (`DEFAULT_VOLATILITY`).
   * Draagt de MARKTCHECK-breedte; raakt de hoofdprojectie niet.
   */
  readonly marktVolatiliteit?: number
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
      marktVolatiliteit: rawContext.marktVolatiliteit,
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

/**
 * De **marktcheck** voor /toekomst/whatif: dezelfde Monte-Carlo-band als op
 * /toekomst, maar op de WHAT-IF-context — dus mét de rendement-slider en de
 * scenario-events erin verwerkt, exact zoals `computeWhatifProjection` de
 * hoofdlijn van die pagina rekent. Zo blijven band en lijn ook daar van hetzelfde
 * plan; een band op de baseline zou onder een verschoven scenariolijn liggen.
 */
export function computeWhatifMarktcheck(params: {
  readonly rawContext: WhatifRawContext
  /** Optionele extra begrenzing; effectief is altijd ≤ `MARKTCHECK_MAX_RUNS`. */
  readonly maxRuns?: number
  /**
   * De gekozen stopleeftijd — het anker van de rendement-marge. /toekomst/whatif
   * kent geen stop-slider en geeft 'm niet mee; de marge valt daar dus terug op
   * de AOW-leeftijd (dit oppervlak toont alleen de band, niet de marge).
   */
  readonly stopAge?: number | null
}): MarktcheckOutcome {
  const { rawContext } = params
  try {
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
      marktVolatiliteit: rawContext.marktVolatiliteit,
    })
    const { input } = buildKernelInputFromAppWithNotices(adapterInput)
    return runMarktcheckOnKernelInput(input, {
      maxRuns: params.maxRuns,
      stopAge: params.stopAge,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return { ok: false, reason: message }
  }
}
