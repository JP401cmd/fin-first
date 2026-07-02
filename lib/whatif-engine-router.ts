/**
 * What-if-engine-router (FASE 5, stap 2a) — de dunne motorschakelaar voor
 * `/horizon/whatif`. Kiest per what-if-run tussen de nieuwe **horizon-kernel** (achter
 * de per-gebruiker-vlag `horizon_kernel_whatif`) en de bestaande **v2-grootboek-engine**.
 *
 * ## Waarom lib-root (naast `whatif-overrides.ts`)
 * Deze router mag als enige BEIDE motoren aanroepen — `lib/horizon-engine/select` (v2)
 * én `lib/horizon-kernel/*` (kernel via adapter→solveFire→bridge) — zonder de twee
 * engine-libs aan elkaar te koppelen. Daarom leeft hij op lib-root i.p.v. in een van
 * beide engine-mappen.
 *
 * ## Byte-identiteit (harde eis)
 * Bij `kernelEnabled === false` (default) is de uitvoer LETTERLIJK
 * `runSelectedProjection(builtInput, v2FlagArg, strategyOptions)` — dezelfde v2-run als
 * vandaag. Geef `v2FlagArg` exact door wat de pagina doorgeeft (`horizonEngineV2`).
 *
 * ## Geen stille engine-mix
 * Draagt de gebouwde input v2-only woningmachinerie (`assetLiquidations`/`reverseMortgage`/
 * `collateralBorrowableById`), dan valt de HELE vergelijking met een schone reden terug op
 * v2 (`detectV2OnlyMachinery`). Ook bij ontbrekende ruwe context of een kernel-fout valt de
 * router terug op v2 (defensief; de vlag mag de pagina nooit laten crashen).
 *
 * Deze module logt NOOIT (`console.*`).
 */

import {
  runSelectedProjection,
} from '@/lib/horizon-engine/select'
import type { HorizonStrategyOptions } from '@/lib/horizon-engine/strategies'
import type {
  UnifiedProjectionInput,
  UnifiedProjectionResult,
} from '@/lib/unified-projection'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { TaxYear } from '@/lib/box3-data'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import {
  applyReturnDeltasToAssets,
  buildWhatifKernelAdapterInput,
  detectV2OnlyMachinery,
  deriveEigenHuisIds,
  type WhatifRawProfileRow,
} from '@/lib/horizon-kernel/adapter/whatif-varianten'

/** Welke motor de run daadwerkelijk berekende. */
export type WhatifEngine = 'kernel' | 'v2'

/** Compacte kern↔v2-vergelijking (alleen getallen; NIET loggen). */
export interface WhatifEngineDiff {
  readonly v2FireAge: number | null
  readonly kernelFireAge: number | null
  readonly deltaFireAge: number | null
  readonly v2EndPortfolio: number
  readonly kernelEndPortfolio: number
  readonly deltaEndPortfolio: number
}

/** Uitkomst van één what-if-run: het resultaat + welke motor + eventuele fallback-reden. */
export interface WhatifProjectionOutcome {
  readonly result: UnifiedProjectionResult
  readonly engine: WhatifEngine
  readonly fallbackReason?: string
  readonly diff?: WhatifEngineDiff
}

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
  /** De gebouwde v2-input (`buildHorizonInput`) — de v2-tak draait hier byte-identiek op. */
  readonly builtInput: UnifiedProjectionInput
  readonly strategyOptions?: Partial<HorizonStrategyOptions>
  /** Exact wat de pagina doorgeeft (`horizonEngineV2`) — houdt de v2-tak byte-identiek. */
  readonly v2FlagArg: boolean
  /** Is de kernel-vlag (`horizon_kernel_whatif`) aan voor deze gebruiker? */
  readonly kernelEnabled: boolean
  /** Rauwe context voor de kernel-tak; afwezig → v2-fallback. */
  readonly rawContext?: WhatifRawContext
  /** Wanneer de kernel-tak draait: draai óók v2 en vul `diff` (kleine vergelijking). */
  readonly withDiff?: boolean
}

/** Eindvermogen = netto vermogen van de laatste projectierij. */
function endPortfolioOf(result: UnifiedProjectionResult): number {
  const rows = result.rows
  return rows.length > 0 ? rows[rows.length - 1].netWorth : 0
}

/** Compacte kern↔v2-diff (fireAge + eindvermogen). */
function buildDiff(
  v2: UnifiedProjectionResult,
  kernel: UnifiedProjectionResult,
): WhatifEngineDiff {
  const v2FireAge = v2.fireAgeFractional
  const kernelFireAge = kernel.fireAgeFractional
  const deltaFireAge =
    v2FireAge !== null && kernelFireAge !== null ? kernelFireAge - v2FireAge : null
  const v2EndPortfolio = endPortfolioOf(v2)
  const kernelEndPortfolio = endPortfolioOf(kernel)
  return {
    v2FireAge,
    kernelFireAge,
    deltaFireAge,
    v2EndPortfolio,
    kernelEndPortfolio,
    deltaEndPortfolio: kernelEndPortfolio - v2EndPortfolio,
  }
}

/**
 * Bereken één what-if-projectie via de kernel (vlag aan) of via v2 (vlag uit /
 * fallback). Zie de module-doc voor de byte-identiteit- en fallback-garanties.
 */
export function computeWhatifProjection(
  params: ComputeWhatifProjectionParams,
): WhatifProjectionOutcome {
  const { builtInput, strategyOptions, v2FlagArg, kernelEnabled, rawContext, withDiff } = params
  const runV2 = (): UnifiedProjectionResult =>
    runSelectedProjection(builtInput, v2FlagArg, strategyOptions)

  // Vlag uit → byte-identiek aan vandaag.
  if (!kernelEnabled) {
    return { result: runV2(), engine: 'v2' }
  }

  // v2-only woningmachinerie → HELE vergelijking terug naar v2 (geen engine-mix).
  const machineryReason = detectV2OnlyMachinery(builtInput)
  if (machineryReason) {
    return { result: runV2(), engine: 'v2', fallbackReason: machineryReason }
  }

  // Zonder rauwe context kan de kernel niet worden samengesteld → v2.
  if (!rawContext) {
    return { result: runV2(), engine: 'v2', fallbackReason: 'geen ruwe kernel-context beschikbaar' }
  }

  try {
    // Rendement-slider/uniforme shift → pre-muteer `expected_return` vóór de adapter.
    const mutatedAssets = applyReturnDeltasToAssets(
      rawContext.assets,
      rawContext.returnDeltaByAssetType,
      rawContext.uniformReturnDelta,
    )
    const eigenHuisIds = deriveEigenHuisIds(mutatedAssets)
    const adapterInput = buildWhatifKernelAdapterInput({
      profile: rawContext.profile,
      assets: mutatedAssets,
      debts: rawContext.debts,
      lifeEvents: rawContext.lifeEvents,
      aowRows: rawContext.aowRows,
      taxYear: rawContext.taxYear,
    })
    const kernelInput = buildKernelInputFromApp(adapterInput)
    const solve = solveFire(kernelInput)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
      mutatedAssets,
      rawContext.debts,
      eigenHuisIds,
    )
    const kernelResult = kernelToUnifiedResult(solve, {
      input: kernelInput,
      yearlyExpenses: rawContext.yearlyExpenses,
      assetSlotMeta,
      debtSlotMeta,
    })
    const diff = withDiff ? buildDiff(runV2(), kernelResult) : undefined
    return { result: kernelResult, engine: 'kernel', diff }
  } catch (err) {
    // Defensief: een kernel-fout (bv. ontbrekende geboortedatum) mag de pagina nooit
    // laten crashen achter de vlag → schone v2-fallback met reden.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return {
      result: runV2(),
      engine: 'v2',
      fallbackReason: `kernel-fout, teruggevallen op v2: ${message}`,
    }
  }
}
