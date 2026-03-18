'use client'

/**
 * useHorizonFireSim — koppelt app-data aan de runSimulation engine.
 *
 * Ontvangt al-geladen data (FinancialInput + lifeEvents) van horizon/page.tsx
 * zodat er geen dubbele fetches zijn. Berekent SimResult en schrijft het resultaat weg
 * naar net_worth_snapshots.
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
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimResult,
  type SimCashflow,
  type ReturnModel,
} from '@/lib/fire-simulation'
import { type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

export interface HorizonFireSimResult {
  result: SimResult | null
  cashflows: SimCashflow[]
  isLoading: boolean
  error: string | null
}

interface HorizonFireSimInput {
  horizonInput: FinancialInput | null
  lifeEvents: LifeEvent[]
  fireStrategy?: FireStrategyConfig
  withdrawalStrategy?: WithdrawalStrategyConfig  // default: static (identical to old logic)
  grossReturn?: number   // default: DEFAULT_RETURN
  inflation?: number     // default: INFLATION
}

export function useHorizonFireSim(params: HorizonFireSimInput | null): HorizonFireSimResult {
  const { horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturn: grossReturnParam, inflation: inflationParam } = params ?? {}

  // Synchrone berekening via useMemo — geen async nodig want data is al geladen
  const simResult = useMemo<{ result: SimResult; cashflows: SimCashflow[] } | null>(() => {
    if (!horizonInput) return null

    const { totalAssets, totalDebts, monthlyContributions, yearlyMustExpenses, dateOfBirth } = horizonInput

    // currentAge
    const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
    if (currentAge === null) return null

    // currentPortfolio = assets − debts (al gewogen met inclusion pct in FinancialInput)
    const currentPortfolio = Math.max(0, totalAssets - totalDebts)

    // yearlyExpenses = al berekend via computeRetirementExpenses in de pagina
    const yearlyExpenses = yearlyMustExpenses > 0 ? yearlyMustExpenses : 0
    if (yearlyExpenses <= 0) return null

    // annualSavings
    const annualSavings = (monthlyContributions ?? 0) * 12

    // returnModel: altijd nl_box3 (Box 3-logica via fire-simulation engine)
    const returnModel: ReturnModel = 'nl_box3'
    const grossReturn = grossReturnParam ?? DEFAULT_RETURN

    // Strategy config — determines endAge and convergence target
    const strategyForSim = fireStrategy ?? DEFAULT_FIRE_STRATEGY
    const simEndAge = strategyForSim.endAge

    // Kasstromen
    const cashflows = lifeEventsToCashflows(lifeEvents ?? [])

    const result = runSimulation(
      currentAge,
      simEndAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      grossReturn,
      returnModel,
      inflationParam ?? INFLATION,
      cashflows,
      strategyForSim,
      withdrawalStrategy,
    )

    return { result, cashflows }
  }, [horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturnParam, inflationParam])

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
    return { result: null, cashflows: [], isLoading: true, error: null }
  }

  return {
    result: simResult?.result ?? null,
    cashflows: simResult?.cashflows ?? [],
    isLoading: false,
    error: null,
  }
}
