/**
 * Convergentie-router (FASE 5, stap 2b) — de dunne motorschakelaar voor de
 * **convergentie-set** (ADR 0032 §6): /toekomst (`use-horizon-fire-sim`), de
 * dashboard-loader (/overzicht, `dashboard-data-loader`), het canonieke FIRE-doel
 * (`fire-target-shared`) en — via dat doel — de AI-context. Kiest per run tussen de
 * nieuwe **horizon-kernel** (achter de per-gebruiker-vlag `horizon_kernel_convergentie`)
 * en de bestaande **v2-grootboek-engine**.
 *
 * ## Anti-drie-engines-invariant
 * Eén vlag stuurt ALLE vier de oppervlakken; deze router is de enige plek waar de
 * keuze wordt gemaakt. Server- én client-bruikbaar (isomorf: geen `'use client'`,
 * geen fs/Supabase/Date.now) zodat de hook (client) en de loaders (server) letterlijk
 * dezelfde beslislogica draaien — nooit gedeeltelijk om (geen pagina-drift).
 *
 * ## Byte-identiteit (harde eis)
 * Bij `kernelEnabled === false` (default) is de uitvoer LETTERLIJK
 * `runSelectedProjection(builtInput, v2FlagArg, strategyOptions)` — dezelfde v2-run
 * als vandaag. Geef `v2FlagArg` exact door wat het oppervlak vandaag doorgeeft.
 *
 * ## Geen stille engine-mix + defensieve terugval
 * Woning-strategieën (incl. downsize/opeethypotheek) zijn kernel-native (de adapter
 * mapt `housing_strategy_config` → kernel-woning-params) en vallen dus NIET terug.
 * Alleen generieke (niet-huis) liquidaties die de kernel-mapping niet aankan
 * (wanneer_nodig / datum-trigger / payoffDebtIds / prijs-fractie) → schone
 * v2-terugval met reden (`detectV2OnlyMachinery`, gedeeld met de what-if-router).
 * Ontbrekende rauwe context of een kernel-fout → idem; de vlag mag een oppervlak
 * nooit laten crashen.
 *
 * Deze module logt NOOIT (`console.*`).
 */

import { runSelectedProjection } from '@/lib/horizon-engine/select'
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
import { solveFire, type SolverStatus } from '@/lib/horizon-kernel/solver'
import {
  buildKernelInputFromApp,
  deriveEigenHuisIds,
  type KernelAdapterInput,
  type KernelAdapterProfile,
} from '@/lib/horizon-kernel/adapter'
import {
  kernelToUnifiedResult,
  buildKernelSlotMeta,
  type KernelHousingSale,
} from '@/lib/horizon-kernel/bridge'
import {
  detectV2OnlyMachinery,
  type WhatifRawProfileRow,
} from '@/lib/horizon-kernel/adapter/whatif-varianten'

/** Welke motor de run daadwerkelijk berekende. */
export type ConvergentieEngine = 'kernel' | 'v2'

/**
 * Rauwe profiel-rij voor de convergentie-set — superset van de what-if-rij: de
 * server-loaders (en de uitgebreide /toekomst-client-select) hebben óók de
 * kernel-instellingen-kolommen beschikbaar die op de what-if-client ontbraken
 * (`marginaal_tarief`, `deficit_loan_rate`, `withdrawal_profile_config`) plus de
 * berekende jaarlijkse essentiële uitgaven (geen DB-kolom — uit de budgetten).
 */
export interface ConvergentieRawProfileRow extends WhatifRawProfileRow {
  marginaal_tarief?: number | null
  /** V7 — tekort-lening-jaarrente (0..1); NULL → Excel-default 0,05. */
  deficit_loan_rate?: number | null
  /** V4 — onttrekkingsprofiel 3-fasen-curve (JSONB); NULL → Excel-defaults. */
  withdrawal_profile_config?: unknown
  /**
   * Jaarlijkse essentiële uitgaven (berekend uit de budgetten, `computeYearlyMustExpenses`)
   * — GEEN profiel-kolom; het aanroepende oppervlak injecteert de al-berekende waarde
   * zodat de `essential_budgets`-pensioenuitgave-methode in de kernel dezelfde
   * grondslag gebruikt als v2.
   */
  yearly_essential_expenses?: number | null
}

/**
 * Rauwe profiel-rij → `KernelAdapterProfile` (incl. de kolom-hernoeming
 * `retirement_expense_custom_amount` → `retirement_custom_amount`). Ontbrekende
 * velden blijven undefined → adapter-defaults (zelfde regel als de what-if-mapper).
 */
export function buildConvergentieAdapterProfile(
  p: ConvergentieRawProfileRow,
): KernelAdapterProfile {
  return {
    date_of_birth: p.date_of_birth ?? null,
    net_monthly_income: p.net_monthly_income ?? null,
    estimated_monthly_expenses: p.estimated_monthly_expenses ?? null,
    yearly_essential_expenses: p.yearly_essential_expenses ?? null,
    expected_return: p.expected_return ?? null,
    inflation_rate: p.inflation_rate ?? null,
    box3_method: p.box3_method ?? null,
    marginaal_tarief: p.marginaal_tarief ?? null,
    fire_end_strategy: p.fire_end_strategy ?? null,
    fire_end_age: p.fire_end_age ?? null,
    fire_legacy_amount: p.fire_legacy_amount ?? null,
    feature_preferences: p.feature_preferences ?? null,
    withdrawal_strategy: p.withdrawal_strategy ?? null,
    guardrail_floor: p.guardrail_floor ?? null,
    guardrail_ceiling: p.guardrail_ceiling ?? null,
    guardrail_cut_step: p.guardrail_cut_step ?? null,
    guardrail_raise_step: p.guardrail_raise_step ?? null,
    withdrawal_profile_config: p.withdrawal_profile_config,
    deficit_loan_rate: p.deficit_loan_rate ?? null,
    housing_strategy_config: p.housing_strategy_config,
    pot_rules: p.pot_rules,
    retirement_expense_method: p.retirement_expense_method ?? null,
    // Kolom-hernoeming: DB `retirement_expense_custom_amount` → kern `retirement_custom_amount`.
    retirement_custom_amount: p.retirement_expense_custom_amount ?? null,
  }
}

/**
 * De rauwe context waaruit de kernel-invoer wordt samengesteld. `assets`/`debts`/
 * `lifeEvents` zijn de ONgemuteerde app-rijen; de adapter-guard partitioneert de
 * events zelf (beheerd → param-blokken, vrij → Geb-rijen).
 */
export interface ConvergentieRawContext {
  readonly profile: ConvergentieRawProfileRow
  readonly assets: readonly Asset[]
  readonly debts: readonly Debt[]
  readonly lifeEvents: readonly LifeEvent[]
  readonly aowRows?: readonly AowLeeftijdRow[]
  readonly taxYear?: TaxYear
  /** Jaaruitgaven (reëel/koopkracht-nu) voor de bridge-`implicitWithdrawalRate`. */
  readonly yearlyExpenses: number
}

/** Uitkomst van één convergentie-run: resultaat + motor + solver-doorvoer (V12). */
export interface ConvergentieProjectionOutcome {
  readonly result: UnifiedProjectionResult
  readonly engine: ConvergentieEngine
  /** Alleen gezet bij een terugval op v2 terwijl de vlag aan stond. */
  readonly fallbackReason?: string
  /** P!B93/B100 — solver-status; alleen aanwezig op de kernel-tak (V12). */
  readonly kernelStatus?: SolverStatus
  /** P!B96 — €/mnd-extra-sparen-hint; alleen aanwezig op de kernel-tak (V12). */
  readonly kernelMaandHint?: number
  /** Verkoopmoment eigen woning (marker-contract); alleen op de kernel-tak, `null` = geen verkoop. */
  readonly kernelHousingSale?: KernelHousingSale | null
}

/** Parameters voor `computeConvergentieProjection`. */
export interface ComputeConvergentieProjectionParams {
  /** De gebouwde v2-input (`buildHorizonInput`) — de v2-tak draait hier byte-identiek op. */
  readonly builtInput: UnifiedProjectionInput
  readonly strategyOptions?: Partial<HorizonStrategyOptions>
  /** Exact wat het oppervlak vandaag doorgeeft (`horizonEngineV2`) — houdt de v2-tak byte-identiek. */
  readonly v2FlagArg: boolean
  /** Is de kernel-vlag (`horizon_kernel_convergentie`) aan voor deze gebruiker? */
  readonly kernelEnabled: boolean
  /** Rauwe context voor de kernel-tak; afwezig → v2-terugval met reden. */
  readonly rawContext?: ConvergentieRawContext
}

/**
 * Bereken één convergentie-projectie via de kernel (vlag aan) of via v2 (vlag uit /
 * terugval). Zie de module-doc voor de byte-identiteit- en terugval-garanties.
 */
export function computeConvergentieProjection(
  params: ComputeConvergentieProjectionParams,
): ConvergentieProjectionOutcome {
  const { builtInput, strategyOptions, v2FlagArg, kernelEnabled, rawContext } = params
  const runV2 = (): UnifiedProjectionResult =>
    runSelectedProjection(builtInput, v2FlagArg, strategyOptions)

  // Vlag uit → byte-identiek aan vandaag.
  if (!kernelEnabled) {
    return { result: runV2(), engine: 'v2' }
  }

  // Kernel-onondersteunde generieke liquidatie → schone v2-terugval (geen stille
  // engine-mix); woning-strategieën zijn kernel-native en passeren deze check.
  const machineryReason = detectV2OnlyMachinery(builtInput)
  if (machineryReason) {
    return { result: runV2(), engine: 'v2', fallbackReason: machineryReason }
  }

  // Zonder rauwe context kan de kernel-invoer niet worden samengesteld → v2.
  if (!rawContext) {
    return { result: runV2(), engine: 'v2', fallbackReason: 'geen rauwe kernel-context beschikbaar' }
  }

  try {
    const adapterInput: KernelAdapterInput = {
      profile: buildConvergentieAdapterProfile(rawContext.profile),
      assets: rawContext.assets,
      debts: rawContext.debts,
      lifeEvents: rawContext.lifeEvents,
      aowRows: rawContext.aowRows,
      taxYear: rawContext.taxYear,
    }
    const kernelInput = buildKernelInputFromApp(adapterInput)
    const solve = solveFire(kernelInput)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
      rawContext.assets,
      rawContext.debts,
      deriveEigenHuisIds(rawContext.assets),
    )
    const kernelResult = kernelToUnifiedResult(solve, {
      input: kernelInput,
      yearlyExpenses: rawContext.yearlyExpenses,
      assetSlotMeta,
      debtSlotMeta,
    })
    return {
      result: kernelResult,
      engine: 'kernel',
      kernelStatus: kernelResult.kernelStatus,
      kernelMaandHint: kernelResult.kernelMaandHint,
      kernelHousingSale: kernelResult.kernelHousingSale,
    }
  } catch (err) {
    // Defensief: een kernel-fout (bv. ontbrekende geboortedatum) mag het oppervlak
    // nooit laten crashen achter de vlag → schone v2-terugval met reden.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return {
      result: runV2(),
      engine: 'v2',
      fallbackReason: `kernel-fout, teruggevallen op v2: ${message}`,
    }
  }
}
