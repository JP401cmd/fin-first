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
import { NL_AOW_AGE } from '@/lib/constants'
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
}

export function useHorizonFireSim(params: HorizonFireSimInput | null): HorizonFireSimResult {
  const { horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturn: grossReturnParam, inflation: inflationParam, profileError, aowAgeFractional: aowAgeFractionalParam } = params ?? {}

  // Synchrone berekening via useMemo — geen async nodig want data is al geladen
  const simResult = useMemo<{ result: SimResult; cashflows: SimCashflow[]; originalFireAge: number | null; originalFireAgeFractional: number | null } | null>(() => {
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

    // ── Pensioen strategy: force FIRE at AOW age, simulate full horizon ──
    // Instead of ending at AOW, keep endAge at 90 (or configured) and force the
    // accumulation→retirement transition at AOW age via forcedFireAge.
    // After AOW: savings = 0, portfolio growth continues, withdrawals start.
    const isPensioen = strategyForSim.strategy === 'pensioen'
    const aowAge = aowAgeFractionalParam ?? NL_AOW_AGE
    const aowAgeInt = Math.ceil(aowAge)

    // For pensioen: use 'deplete' internally so the engine runs decumulation
    // from AOW→endAge (portfolio depletes by endAge). Ensure endAge is at
    // least 90 so the chart extends well past AOW (previous broken impl may
    // have stored endAge=67 in the DB).
    const pensioenEndAge = Math.max(strategyForSim.endAge, 90)
    const effectiveStrategy = isPensioen
      ? { ...strategyForSim, strategy: 'deplete' as const, endAge: pensioenEndAge }
      : strategyForSim
    const simEndAge = effectiveStrategy.endAge

    // forcedFireAge: skip binary-search, force accumulation→retirement at AOW
    const forcedFireAge = isPensioen ? aowAgeInt : undefined

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
      effectiveStrategy,
      withdrawalStrategy,
      forcedFireAge,
    )

    // ── Pensioen post-processing ─────────────────────────────────────
    // The engine ran as 'deplete' with forcedFireAge at AOW, producing rows
    // from currentAge → endAge with accumulation (→AOW) + retirement (AOW→90).
    // For pensioen: trim rows to AOW age so the chart ends at AOW (no withdrawal
    // phase displayed — the user transitions to state pension at AOW).
    if (isPensioen) {
      const originalFireAge = result.fireAge
      const originalFireAgeFractional = result.fireAgeFractional

      // Trim rows: only show accumulation up to (but not including) AOW age
      const trimmedRows = result.rows.filter(r => r.age < aowAgeInt)
      const portfolioAtAow = trimmedRows.length > 0
        ? trimmedRows[trimmedRows.length - 1].endPortfolio
        : result.requiredFirePortfolio

      const pensioenResult: SimResult = {
        ...result,
        rows: trimmedRows,
        strategy: 'pensioen',
        displayEndAge: aowAgeInt,
        fireAgeFractional: aowAge,
        fireAge: aowAgeInt,
        requiredFirePortfolio: portfolioAtAow,
        fireReachable: true, // AOW is altijd bereikbaar qua leeftijd
      }

      return { result: pensioenResult, cashflows, originalFireAge, originalFireAgeFractional }
    }

    return { result, cashflows, originalFireAge: null, originalFireAgeFractional: null }
  }, [horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturnParam, inflationParam, aowAgeFractionalParam])

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
