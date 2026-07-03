/**
 * Regressie-suites — kernel-vervanger van de verwijderde v2-grootboek-bridge.
 *
 * `lib/horizon-engine/*` (incl. `scalar-bridge.ts#runScalarProjectionV2`) is fysiek
 * verwijderd (FASE 6 stap 5A — de horizon-kernel is de enige rekenmotor). Deze module
 * is een DROP-IN vervanger met EXACT dezelfde positionele signatuur als de oude
 * `runScalarProjectionV2`, zodat de bestaande regressie-suites (die op een scalaire
 * portefeuille + los cashflow-/strategie-argumentenlijst leunen) alleen hun import
 * hoeven te wijzigen. Onder de motorkap: `buildScalarAdapterInput` (horizon-kernel/
 * scalar-router) → `runKernelUnified` (horizon-kernel/run-unified) → `toSimResult`
 * (lib/unified-projection) — dezelfde keten als elke andere kernel-consument.
 *
 * ## Bekende beperkingen t.o.v. de oude v2-bridge (documenteren, niet stil negeren)
 *
 * 1. **`cashflows` (SimCashflow[]) wordt GENEGEERD.** `buildScalarAdapterInput` bouwt
 *    een synthetische ÉÉN-pot-invoer met `lifeEvents: []`; er is geen vertaling van
 *    losse `SimCashflow`-objecten naar Geb-rijen beschikbaar buiten de volledige
 *    life-events-laag. Suites die concrete cashflow-effecten verwachten (bv. een
 *    market-shock-cashflow of een aangepaste AOW-cashflow) zijn aangepast of expliciet
 *    als bekende beperking gemarkeerd — GEEN stille assertie-verzwakking.
 * 2. **De horizon loopt altijd door tot leeftijd ~100 (MAX_AGE), NIET tot het oude
 *    `endAge`-argument.** `endAge` stuurt nu alleen nog de eindstrategie-eindleeftijd
 *    (P!B51/B52 bij deplete/legacy — via `ScalarStrategyOptions.endAge`); rijen bestaan
 *    dus t/m ~leeftijd 100, niet t/m `endAge - 1`. Assertie op "laatste rij = endAge-1"
 *    is hierdoor typisch onjuist en herijkt op "rij bij leeftijd X bestaat/klopt".
 * 3. **`withdrawalStrategy` ondersteunt alleen `'static'|'guardrails'`.** Dat was al zo
 *    in `WithdrawalStrategyConfig` (remote-migratie 20260703115225 voegde 'vpw'/'bucket'
 *    al samen tot 'static') — dit is GEEN nieuwe beperking van de shim.
 * 4. **`forcedFireAge` wordt GENEGEERD.** De kernel kent geen los "forceer FIRE op
 *    leeftijd X, onafhankelijk van de eindstrategie"-concept; de solver bepaalt de
 *    FIRE-maand zelf uit de eindstrategie (`strategyConfig`). Suites die hierop
 *    leunden zijn herijkt op structurele asserties (rij bij die leeftijd bestaat) i.p.v.
 *    een specifiek geforceerd omslagpunt.
 * 5. Retourneert een `SimResult` (legacy-vorm, `toSimResult`) — rows hebben dus de oude
 *    `SimRow`-vorm (`age`/`phase`/`startPortfolio`/`endPortfolio`/`flowIn`/`flowOut`/...);
 *    `phase` is `'accumulation'|'retirement'` (de kernel kent geen 'transition').
 *
 * Alleen-test-hulpmiddel — GEEN productiecode; leeft bewust onder
 * `lib/regression-tests/` en wordt door niets buiten de suites geïmporteerd.
 */

import { buildScalarAdapterInput } from '@/lib/horizon-kernel/scalar-router'
import { runKernelUnified } from '@/lib/horizon-kernel/run-unified'
import { toSimResult } from '@/lib/unified-projection'
import type { FinancialInput } from '@/lib/horizon-data'
import type { KernelAdapterProfile } from '@/lib/horizon-kernel/adapter'
import { type SimCashflow, type SimResult, type ReturnModel } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

/**
 * Synthetische geboortedatum: `currentAge` jaar terug, geboren 1 januari. Deterministisch
 * t.o.v. "vandaag" — `ageAtDate` op elk moment in het lopende kalenderjaar levert exact
 * `currentAge` op (de "verjaardag" op 1 jan ligt altijd al achter ons in het jaar).
 *
 * Geëxporteerd zodat andere gemigreerde suites (kostenanalyse-ter, kern-hypotheek-vs-
 * beleggen) dezelfde deterministische dob-conventie delen i.p.v. elk hun eigen variant.
 */
export function syntheticDateOfBirth(currentAge: number): string {
  const year = new Date().getFullYear() - Math.round(currentAge)
  return `${year}-01-01`
}

/**
 * Scalar-portefeuille FIRE-projectie op de horizon-kernel.
 *
 * Identieke signatuur als de oude `runScalarProjectionV2` (incl. de ongebruikte
 * `_returnModel`-positie en de genegeerde `cashflows`/`forcedFireAge` — zie de
 * module-doc). Levert een `SimResult` via `toSimResult` op de kernel-bridge-output.
 */
export function runScalarProjectionV2(
  currentAge: number,
  endAge: number,
  currentPortfolio: number,
  yearlyExpenses: number,
  annualSavings: number,
  grossReturn: number,
  _returnModel: ReturnModel,
  inflation: number,
  _cashflows: SimCashflow[],
  strategyConfig?: FireStrategyConfig,
  withdrawalStrategy?: WithdrawalStrategyConfig,
  _forcedFireAge?: number,
): SimResult {
  const input: FinancialInput = {
    totalAssets: Math.max(0, currentPortfolio),
    totalDebts: 0,
    monthlyIncome: (yearlyExpenses + annualSavings) / 12,
    monthlyExpenses: yearlyExpenses / 12,
    yearlyMustExpenses: 0, // computeEffectiveExpenses valt terug op monthlyExpenses×12 = yearlyExpenses
    monthlyContributions: 0, // inleg loopt via inkomen − uitgaven (CF-tabel), niet per pot
    dateOfBirth: syntheticDateOfBirth(currentAge),
    expectedReturn: grossReturn,
  }

  const strategy = strategyConfig ?? { strategy: 'deplete' as const, endAge, legacyAmount: 0 }
  const withdrawal = withdrawalStrategy ?? WITHDRAWAL_DEFAULTS

  const base = buildScalarAdapterInput({
    input,
    annualReturn: grossReturn,
    inflationOverride: inflation,
    strategyOptions: {
      strategy: strategy.strategy,
      endAge: strategy.endAge,
      legacyAmount: strategy.legacyAmount,
    },
  })

  // buildScalarAdapterInput zet geen onttrekkingsprofiel-velden (geen equivalent
  // parameter in ScalarFireParams) — hier alsnog injecteren zodat `withdrawalStrategy`
  // (static/guardrails + guardrail-parameters) meetelt in de kernel-run.
  const profile: KernelAdapterProfile = {
    ...base.profile,
    withdrawal_strategy: withdrawal.strategy,
    guardrail_floor: withdrawal.guardrailFloor,
    guardrail_ceiling: withdrawal.guardrailCeiling,
    guardrail_cut_step: withdrawal.guardrailCutStep,
    guardrail_raise_step: withdrawal.guardrailRaiseStep,
  }

  const { result } = runKernelUnified({
    adapterInput: { ...base, profile },
    yearlyExpenses,
  })

  return toSimResult(result)
}
