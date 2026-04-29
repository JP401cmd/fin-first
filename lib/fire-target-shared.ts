/**
 * Shared FIRE-target compute helper.
 *
 * Dezelfde inputs als `useHorizonFireSim` (zie `lib/hooks/use-horizon-fire-sim.ts`)
 * en daardoor identieke output. Eén bron van waarheid voor het FIRE-doelbedrag —
 * gebruikt door de Kern (`core-data-loader.ts`) zodat het bedrag op `/core`
 * exact overeenkomt met wat Horizon toont, zonder afhankelijkheid van een DB-snapshot.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ageAtDate } from '@/lib/horizon-data'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import {
  runUnifiedProjection,
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { NL_AOW_AGE } from '@/lib/constants'
import { loadHorizonData } from '@/lib/horizon-data-loader'

/**
 * Compute het FIRE-doelbedrag identiek aan Horizon's `useHorizonFireSim`-hook.
 *
 * Retourneert `null` wanneer essentiële inputs ontbreken (geen geboortedatum,
 * geen yearly expenses) — de aanroeper toont dan een eigen fallback.
 *
 * Wrapped in React `cache()` zodat meerdere aanroepen binnen één request
 * (bv. Kern + dashboard widgets) dezelfde Promise hergebruiken.
 */
export const computeHorizonFireTarget = cache(async function computeHorizonFireTarget(
  supabase: SupabaseClient,
): Promise<number | null> {
  // ── Volledige Horizon-data via bestaande loader ──────────────
  // Hergebruikt assets, debts, life events, fire-strategy, withdrawal-strategy,
  // box3Method, hasPartner, unlinkedCash — alle inputs die de hook ook krijgt.
  let data
  try {
    data = await loadHorizonData(supabase)
  } catch {
    return null
  }

  // ── AOW-leeftijd: aparte query (zit niet in horizon-data-loader) ──
  let aowAgeFractional = NL_AOW_AGE
  try {
    const { data: aowRows } = await supabase
      .from('aow_leeftijd')
      .select('birth_date_from, birth_date_through, aow_years, aow_months, is_definitive')
    aowAgeFractional = lookupAowAge(
      (aowRows as AowLeeftijdRow[] | null) ?? [],
      data.effectiveInput.dateOfBirth,
    ).fractional
  } catch {
    // Fallback naar default — niet kritiek voor non-pensioen strategieën
  }

  // ── Inputs guard-clauses ────────────────────────────────────
  const dob = data.effectiveInput.dateOfBirth
  const currentAge = dob ? ageAtDate(dob) : null
  if (currentAge === null) return null

  const yearlyExpenses =
    data.effectiveInput.yearlyMustExpenses > 0
      ? data.effectiveInput.yearlyMustExpenses
      : 0
  if (yearlyExpenses <= 0) return null

  // ── Strategie-aware setup (zelfde logica als de hook) ──
  const isPensioen = data.fireStrategy.strategy === 'pensioen'
  const aowAgeInt = Math.ceil(aowAgeFractional)
  const effectiveStrategy = isPensioen
    ? {
        ...data.fireStrategy,
        endAge: Math.max(data.fireStrategy.endAge, aowAgeInt + 1),
      }
    : data.fireStrategy
  const forcedFireAge = isPensioen ? aowAgeInt : undefined

  const annualSavings = (data.effectiveInput.monthlyContributions ?? 0) * 12
  const cashflows = lifeEventsToCashflows(data.events ?? [])

  const unifiedInput: UnifiedProjectionInput = {
    assets: data.assets,
    debts: data.debts,
    currentAge,
    endAge: effectiveStrategy.endAge,
    yearlyExpenses,
    annualSavings,
    monthlySurplus: data.effectiveInput.monthlyContributions ?? 0,
    monthlyIncome: data.effectiveInput.monthlyIncome ?? 0,
    incomeGrowthRate: 0,
    grossReturn: data.fireParams.grossReturn,
    inflationRate: data.fireParams.inflationRate,
    box3Method: data.box3Method,
    cashflows,
    strategyConfig: effectiveStrategy,
    withdrawalStrategy: data.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
    forcedFireAge,
    hasPartner: data.hasPartner,
    bankAccountCash: data.unlinkedCash,
  }

  const unified = runUnifiedProjection(unifiedInput)
  const sim = toSimResult(unified)

  // Pensioen post-processing: gebruik het werkelijk geprojecteerde portfolio
  // op AOW-leeftijd i.p.v. het binary-search-minimum (zie hook regel 155-164).
  if (isPensioen) {
    const value = sim.firePortfolioAtFire ?? sim.requiredFirePortfolio
    return value > 0 ? value : null
  }

  return sim.requiredFirePortfolio > 0 ? sim.requiredFirePortfolio : null
})
