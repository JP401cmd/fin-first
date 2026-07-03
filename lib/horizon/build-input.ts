/**
 * Gedeelde assemblage van de kernel-oppervlak-metadata uit geladen app-data.
 *
 * (Verhuisd + GESTRIPT uit `lib/horizon-engine/build-input.ts` bij de v2-verwijdering,
 * FASE 6 stap 5A — de horizon-kernel is de enige motor.)
 *
 * Sinds de v2-verwijdering is de woning-strategie **kernel-native**: de adapter mapt
 * `housing_strategy_config` → kernel-woning-params, dus deze assemblage hoeft geen
 * huis-filtering, `assetLiquidations`, `spendableAssetIds`, `reverseMortgage` of
 * engine-meetruns meer af te leiden (dat deed de v2-tak). Wat blijft is de lichte
 * metadata die de kernel-oppervlakken uit `BuiltHorizonInput` consumeren:
 *   • `input.yearlyExpenses` — de reële jaaruitgave (grondslag voor de
 *     bridge-`implicitWithdrawalRate`), plus de overige basis-financials;
 *   • `cashflows` — de rauwe life-event-cashflows (weergave/afgeleide impact);
 *   • `effectiveLifeEvents` — de RAUWE app-events (de kernel resolvet housing zelf;
 *     het verkoopmoment komt uit `kernelHousingSale`, niet uit virtuele events);
 *   • `isPensioen` / `aowAge` / `aowAgeInt` — de pensioen-/AOW-afleidingen.
 *
 * Pure functie, geen Supabase. Retourneert null bij onvoldoende data (geen
 * geboortedatum of geen retirement-uitgaven).
 */

import { ageAtDate, DEFAULT_RETURN, INFLATION, type FinancialInput, type LifeEvent } from '@/lib/horizon-data'
import { NL_AOW_AGE } from '@/lib/constants'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import { type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import { DEFAULT_HOUSING_STRATEGY, type HousingStrategyConfig } from '@/lib/housing-strategy'

export interface BuildHorizonInputParams {
  horizonInput: FinancialInput | null
  lifeEvents: LifeEvent[]
  fireStrategy?: FireStrategyConfig
  withdrawalStrategy?: WithdrawalStrategyConfig
  grossReturn?: number
  inflation?: number
  aowAgeFractional?: number
  assets?: Asset[]
  debts?: Debt[]
  box3Method?: Box3Method
  hasPartner?: boolean
  bankAccountCash?: number
  monthlySavingsOverride?: number | null
  baseAnnualSavingsFromCashflow?: number | null
  housingStrategy?: HousingStrategyConfig
}

export interface BuiltHorizonInput {
  input: UnifiedProjectionInput
  cashflows: SimCashflow[]
  effectiveLifeEvents: LifeEvent[]
  isPensioen: boolean
  aowAge: number
  aowAgeInt: number
}

export function buildHorizonInput(p: BuildHorizonInputParams): BuiltHorizonInput | null {
  if (!p.horizonInput) return null
  const { monthlyContributions, yearlyMustExpenses, dateOfBirth, monthlyIncome } = p.horizonInput

  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  if (currentAge === null) return null
  const yearlyExpenses = yearlyMustExpenses > 0 ? yearlyMustExpenses : 0
  if (yearlyExpenses <= 0) return null

  // annualSavings — prioriteit: override → cashflow-spaarquote → asset-aggregaat.
  const annualSavings =
    p.monthlySavingsOverride != null && p.monthlySavingsOverride >= 0
      ? p.monthlySavingsOverride * 12
      : p.baseAnnualSavingsFromCashflow != null && p.baseAnnualSavingsFromCashflow > 0
        ? p.baseAnnualSavingsFromCashflow
        : (monthlyContributions ?? 0) * 12
  const monthlySurplus = annualSavings / 12

  const grossReturn = p.grossReturn ?? DEFAULT_RETURN
  const inflationRate = p.inflation ?? INFLATION

  const strategyForSim = p.fireStrategy ?? DEFAULT_FIRE_STRATEGY
  const isPensioen = strategyForSim.strategy === 'pensioen'
  const aowAge = p.aowAgeFractional ?? NL_AOW_AGE
  const aowAgeInt = Math.ceil(aowAge)
  const effectiveStrategy = isPensioen
    ? { ...strategyForSim, endAge: Math.max(strategyForSim.endAge, aowAgeInt + 1) }
    : strategyForSim
  const simEndAge = effectiveStrategy.endAge
  const forcedFireAge = isPensioen ? aowAgeInt : undefined

  // Housing loopt kernel-native via `housing_strategy_config` (de adapter mapt het);
  // deze assemblage doet géén filtering/liquidatie/reverse-mortgage-afleiding meer.
  // `housingStrategy` blijft geaccepteerd voor achterwaartse compatibiliteit van de
  // aanroepers, maar raakt de basis-`input` niet (de kernel leest de config zelf).
  void (p.housingStrategy ?? DEFAULT_HOUSING_STRATEGY)

  // De rauwe app-events blijven ongewijzigd — de kernel resolvet housing zelf.
  const effectiveLifeEvents: LifeEvent[] = p.lifeEvents ?? []
  const cashflows = lifeEventsToCashflows(effectiveLifeEvents)

  const input: UnifiedProjectionInput = {
    assets: p.assets ?? [],
    debts: p.debts ?? [],
    currentAge,
    endAge: simEndAge,
    yearlyExpenses,
    annualSavings,
    monthlySurplus,
    monthlyIncome: monthlyIncome ?? 0,
    incomeGrowthRate: 0,
    grossReturn,
    inflationRate,
    box3Method: p.box3Method ?? 'forfaitair',
    cashflows,
    strategyConfig: effectiveStrategy,
    withdrawalStrategy: p.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
    forcedFireAge,
    hasPartner: p.hasPartner ?? false,
    bankAccountCash: p.bankAccountCash ?? 0,
  }

  return {
    input,
    cashflows,
    effectiveLifeEvents,
    isPensioen,
    aowAge,
    aowAgeInt,
  }
}
