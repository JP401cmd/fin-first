'use client'

/**
 * useHorizonFireSim — koppelt app-data aan de unified projection engine.
 *
 * Ontvangt al-geladen data (FinancialInput + lifeEvents + assets + debts) van horizon/page.tsx
 * zodat er geen dubbele fetches zijn. Berekent UnifiedProjectionResult en schrijft het resultaat
 * weg naar net_worth_snapshots.
 *
 * Fase 2b (#495): gemigreerd van runSimulation() naar runUnifiedProjection().
 * Retourneert SimResult via toSimResult() wrapper voor backwards-compatibiliteit.
 */

import { useMemo, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ageAtDate,
  DEFAULT_RETURN,
  INFLATION,
  type FinancialInput,
  type LifeEvent,
} from '@/lib/horizon-data'
import { NL_AOW_AGE } from '@/lib/constants'
import {
  lifeEventsToCashflows,
  type SimResult,
  type SimCashflow,
} from '@/lib/fire-simulation'
import { type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import {
  runUnifiedProjection,
  toSimResult,
  type UnifiedProjectionInput,
  type UnifiedProjectionResult,
} from '@/lib/unified-projection'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'

export interface HorizonFireSimResult {
  result: SimResult | null
  cashflows: SimCashflow[]
  isLoading: boolean
  error: string | null
  /** Original FIRE age before pensioen override (null when not in pensioen mode) */
  originalFireAge: number | null
  /** Original fractional FIRE age before pensioen override */
  originalFireAgeFractional: number | null
}

interface HorizonFireSimInput {
  horizonInput: FinancialInput | null
  lifeEvents: LifeEvent[]
  fireStrategy?: FireStrategyConfig
  withdrawalStrategy?: WithdrawalStrategyConfig  // default: static (identical to old logic)
  grossReturn?: number   // default: DEFAULT_RETURN
  inflation?: number     // default: INFLATION
  /** Upstream error (e.g. from server data loader profile query failure) */
  profileError?: string | null
  /** AOW age as fractional value (e.g. 67.25). Falls back to NL_AOW_AGE (67) if not provided. */
  aowAgeFractional?: number
  /** Alle actieve assets van de gebruiker (voor per-asset-type rendement) */
  assets?: Asset[]
  /** Alle actieve schulden van de gebruiker (voor per-schuld aflossing) */
  debts?: Debt[]
  /** Box 3 berekeningsmethode */
  box3Method?: Box3Method
  /** Of de gebruiker een fiscaal partner heeft */
  hasPartner?: boolean
}

export function useHorizonFireSim(params: HorizonFireSimInput | null): HorizonFireSimResult {
  const { horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturn: grossReturnParam, inflation: inflationParam, profileError, aowAgeFractional: aowAgeFractionalParam, assets, debts, box3Method, hasPartner } = params ?? {}

  // Synchrone berekening via useMemo — geen async nodig want data is al geladen
  const simResult = useMemo<{ result: SimResult; cashflows: SimCashflow[]; originalFireAge: number | null; originalFireAgeFractional: number | null } | null>(() => {
    if (!horizonInput) return null

    const { totalAssets, totalDebts, monthlyContributions, yearlyMustExpenses, dateOfBirth, monthlyIncome } = horizonInput

    // currentAge
    const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
    if (currentAge === null) return null

    // yearlyExpenses = al berekend via computeRetirementExpenses in de pagina
    const yearlyExpenses = yearlyMustExpenses > 0 ? yearlyMustExpenses : 0
    if (yearlyExpenses <= 0) return null

    // annualSavings
    const annualSavings = (monthlyContributions ?? 0) * 12

    const grossReturn = grossReturnParam ?? DEFAULT_RETURN
    const inflationRate = inflationParam ?? INFLATION

    // Strategy config — determines endAge and convergence target
    const strategyForSim = fireStrategy ?? DEFAULT_FIRE_STRATEGY

    // ── Pensioen strategy: force FIRE at AOW age, simulate full horizon ──
    const isPensioen = strategyForSim.strategy === 'pensioen'
    const aowAge = aowAgeFractionalParam ?? NL_AOW_AGE
    const aowAgeInt = Math.ceil(aowAge)

    // For pensioen: use 'deplete' internally so the engine runs decumulation
    // from AOW→endAge. Ensure endAge is at least 90.
    const pensioenEndAge = Math.max(strategyForSim.endAge, 90)
    const effectiveStrategy = isPensioen
      ? { ...strategyForSim, strategy: 'deplete' as const, endAge: pensioenEndAge }
      : strategyForSim
    const simEndAge = effectiveStrategy.endAge

    // forcedFireAge: skip binary-search, force accumulation→retirement at AOW
    const forcedFireAge = isPensioen ? aowAgeInt : undefined

    // Kasstromen
    const cashflows = lifeEventsToCashflows(lifeEvents ?? [])

    // ── Build UnifiedProjectionInput ──────────────────────────────────
    const unifiedInput: UnifiedProjectionInput = {
      assets: assets ?? [],
      debts: debts ?? [],
      currentAge,
      endAge: simEndAge,
      yearlyExpenses,
      annualSavings,
      monthlySurplus: (monthlyContributions ?? 0),
      monthlyIncome: monthlyIncome ?? 0,
      incomeGrowthRate: 0,  // conservatief: geen inkomensgroei in FIRE simulatie
      grossReturn,
      inflationRate,
      box3Method: box3Method ?? 'forfaitair',
      cashflows,
      strategyConfig: effectiveStrategy,
      withdrawalStrategy: withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
      forcedFireAge,
      hasPartner: hasPartner ?? false,
    }

    // ── Run unified projection engine ─────────────────────────────────
    const unifiedResult = runUnifiedProjection(unifiedInput)

    // ── Convert to SimResult via toSimResult() for backwards compatibility ──
    const result = toSimResult(unifiedResult)

    // ── Pensioen post-processing (#471) ─────────────────────────────
    if (isPensioen) {
      const originalFireAge = result.fireAge
      const originalFireAgeFractional = result.fireAgeFractional

      // Override requiredFirePortfolio with the ACTUAL projected portfolio at AOW age
      // (firePortfolioAtFire), not the binary-search minimum. (#473)
      const pensioenResult: SimResult = {
        ...result,
        strategy: 'pensioen',
        fireAgeFractional: aowAge,
        fireAge: aowAgeInt,
        fireReachable: true, // AOW is altijd bereikbaar qua leeftijd
        requiredFirePortfolio: result.firePortfolioAtFire,
      }

      return { result: pensioenResult, cashflows, originalFireAge, originalFireAgeFractional }
    }

    return { result, cashflows, originalFireAge: null, originalFireAgeFractional: null }
  }, [horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturnParam, inflationParam, aowAgeFractionalParam, assets, debts, box3Method, hasPartner])

  // Snapshot persistentie — debounced upsert naar net_worth_snapshots
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!simResult?.result) return

    const { fireAgeFractional, requiredFirePortfolio } = simResult.result

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const today = new Date().toISOString().split('T')[0]

        await supabase
          .from('net_worth_snapshots')
          .upsert(
            {
              user_id: user.id,
              snapshot_date: today,
              fire_age: fireAgeFractional,
              fire_portfolio_required: requiredFirePortfolio,
            },
            { onConflict: 'user_id,snapshot_date' },
          )
      } catch {
        // Non-critical — snapshot update mislukt laat de UI niet crashen
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [simResult])

  if (!params || !horizonInput) {
    return { result: null, cashflows: [], isLoading: true, error: profileError ?? null, originalFireAge: null, originalFireAgeFractional: null }
  }

  return {
    result: simResult?.result ?? null,
    cashflows: simResult?.cashflows ?? [],
    isLoading: false,
    error: profileError ?? null,
    originalFireAge: simResult?.originalFireAge ?? null,
    originalFireAgeFractional: simResult?.originalFireAgeFractional ?? null,
  }
}
