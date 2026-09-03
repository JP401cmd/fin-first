/**
 * Convergentie-projectie (FASE 6 stap 5A — kernel-only) — de gedeelde ingang voor de
 * **convergentie-set** (ADR 0032 §6): /toekomst (`use-horizon-fire-sim`), de
 * dashboard-loader (/overzicht, `dashboard-data-loader`), het canonieke FIRE-doel
 * (`fire-target-shared`) en — via dat doel — de AI-context. Sinds de v2-verwijdering
 * is er nog maar één motor: de **horizon-kernel**.
 *
 * ## Geen tweede motor meer
 * De vroegere `builtInput`/`v2FlagArg`/`kernelEnabled`-schakelaar en de
 * `detectV2OnlyMachinery`-terugval zijn vervallen — de grootboek-engine (v2) bestaat
 * niet meer. `rawContext` is nu verplicht; de kernel is de enige uitkomst.
 *
 * ## Expliciete fout i.p.v. stille terugval
 * De kern kan om legitieme redenen niet rekenen (bv. ontbrekende geboortedatum). In
 * plaats van stil op een andere motor terug te vallen (die er niet meer is) levert de
 * router dan een expliciet `{ ok: false, reason }`; de aanroepende surface toont zijn
 * bestaande lege/fout-staat. Bij succes: `{ ok: true, result, ... }`.
 *
 * Server- én client-bruikbaar (isomorf): geen `'use client'`, geen fs/Supabase/Date.now.
 * Deze module logt NOOIT (`console.*`).
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { TaxYear } from '@/lib/box3-data'
import { runKernelUnified } from '@/lib/horizon-kernel/run-unified'
import {
  buildKernelInputFromAppWithNotices,
  type KernelAdapterInput,
  type KernelAdapterProfile,
} from '@/lib/horizon-kernel/adapter'
import {
  runMarktcheckOnKernelInput,
  type MarktcheckOutcome,
} from '@/lib/horizon-kernel/marktcheck'
import type {
  KernelHousingSale,
  KernelUnifiedResult,
} from '@/lib/horizon-kernel/bridge'
import type { SolverStatus } from '@/lib/horizon-kernel/solver'
import type { WhatifRawProfileRow } from '@/lib/horizon-kernel/adapter/whatif-varianten'

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
   * grondslag gebruikt.
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
    // ADR 0129 D1/D3 — het stop-anker reist mee naar de adapter, die het naar
    // `KernelInput.stopAnker` vertaalt. Ontbreekt de kolom (oude rij), dan leest
    // `parseFirePlan` het anker nog uit `fire_end_strategy` (de tegenspraak-regel D2).
    fire_stop_anchor: p.fire_stop_anchor ?? null,
    fire_stop_age: p.fire_stop_age ?? null,
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
  /**
   * ADR 0117 — jaargelaagde markt-volatiliteit (`fire_assumptions.volatility`,
   * decimaal) voor MC!B3. Weglaten → de kernel-default (`DEFAULT_VOLATILITY`).
   * Draagt de MARKTCHECK-breedte; raakt de hoofdprojectie niet.
   */
  readonly marktVolatiliteit?: number
}

/**
 * Rauwe context → `KernelAdapterInput` — de ENIGE plek waar die mapping leeft.
 *
 * De hoofdprojectie (`computeConvergentieProjection`), de marktcheck
 * (`computeMarktcheck`) én het totaalplan-rapport (`lib/totaalplan-data.ts#
 * buildTotaalplanKernelInput`) bouwen hun kernel-invoer hiermee. Tot 3 sep 2026
 * stond deze mapping drie keer uitgeschreven; het totaalplan-exemplaar miste
 * `marktVolatiliteit`, waardoor de jaarlaag `fire_assumptions.volatility` de
 * slagingskans van het rapport nooit bereikte terwijl /toekomst er wél mee
 * rekende. Eén home sluit die klasse uit: een veld dat hier bijkomt, komt overal bij.
 */
export function buildConvergentieAdapterInput(
  rawContext: ConvergentieRawContext,
): KernelAdapterInput {
  return {
    profile: buildConvergentieAdapterProfile(rawContext.profile),
    assets: rawContext.assets,
    debts: rawContext.debts,
    lifeEvents: rawContext.lifeEvents,
    aowRows: rawContext.aowRows,
    taxYear: rawContext.taxYear,
    marktVolatiliteit: rawContext.marktVolatiliteit,
  }
}

/**
 * Uitkomst van één convergentie-run: het kernel-resultaat óf een expliciete fout.
 * Bij succes zijn de solver-doorvoer-velden (V12) + het verkoopmoment (marker-
 * contract) aanwezig; bij een kern-fout draagt `reason` de nette Nederlandse toelichting.
 */
export type ConvergentieProjectionOutcome =
  | {
      readonly ok: true
      readonly result: KernelUnifiedResult
      /** P!B93/B100 — solver-status (V12). */
      readonly kernelStatus: SolverStatus
      /** P!B96 — €/mnd-extra-sparen-hint (V12). */
      readonly kernelMaandHint: number
      /** Verkoopmoment eigen woning (marker-contract), `null` = geen verkoop. */
      readonly kernelHousingSale: KernelHousingSale | null
    }
  | {
      readonly ok: false
      readonly reason: string
    }

/** Parameters voor `computeConvergentieProjection`. */
export interface ComputeConvergentieProjectionParams {
  /** Rauwe context waaruit de kernel-invoer wordt samengesteld (verplicht). */
  readonly rawContext: ConvergentieRawContext
}

/**
 * Bereken één convergentie-projectie via de horizon-kernel. Zie de module-doc voor
 * het fout-contract (kern-fout → `{ ok: false, reason }`).
 */
export function computeConvergentieProjection(
  params: ComputeConvergentieProjectionParams,
): ConvergentieProjectionOutcome {
  const { rawContext } = params
  try {
    const adapterInput = buildConvergentieAdapterInput(rawContext)
    const { result } = runKernelUnified({
      adapterInput,
      yearlyExpenses: rawContext.yearlyExpenses,
    })
    return {
      ok: true,
      result,
      kernelStatus: result.kernelStatus,
      kernelMaandHint: result.kernelMaandHint,
      kernelHousingSale: result.kernelHousingSale,
    }
  } catch (err) {
    // Een kern-fout (bv. ontbrekende geboortedatum) mag het oppervlak nooit laten
    // crashen → expliciete fout met reden; de surface toont zijn lege/fout-staat.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return { ok: false, reason: message }
  }
}

// ── Marktcheck (Monte Carlo op dezelfde context als de hoofdprojectie) ────────

/**
 * De **marktcheck** voor /toekomst: draai het plan `n` keer opnieuw met verstoorde
 * rendementen en lever de percentielband per leeftijd, plus de rendement-marge
 * (hoeveel het rendement mag tegenvallen voordat het plan omvalt, getoetst op de
 * gekozen stopleeftijd — `rendement-marge.ts`).
 *
 * Consumeert EXACT dezelfde `ConvergentieRawContext` als `computeConvergentieProjection`
 * en bouwt de kernel-invoer via dezelfde adapter — band en hoofdlijn komen dus
 * gegarandeerd van hetzelfde plan, op dezelfde leeftijdsas en dezelfde grondslag
 * (netto vermogen, Prognose!I). De begrenzing en de uitkomstvorm leven in
 * `marktcheck.ts`, gedeeld met de what-if-router.
 */
export function computeMarktcheck(params: {
  readonly rawContext: ConvergentieRawContext
  /** Optionele extra begrenzing; effectief is altijd ≤ `MARKTCHECK_MAX_RUNS`. */
  readonly maxRuns?: number
  /**
   * De gekozen stopleeftijd van het oppervlak — het anker van de rendement-marge.
   * Ontbreekt hij, dan valt de marge terug op de AOW-leeftijd. Raakt de band niet.
   */
  readonly stopAge?: number | null
}): MarktcheckOutcome {
  const { rawContext } = params
  try {
    const adapterInput = buildConvergentieAdapterInput(rawContext)
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
