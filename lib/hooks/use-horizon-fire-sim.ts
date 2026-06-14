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
import { type FinancialInput, type LifeEvent } from '@/lib/horizon-data'
import { type SimResult, type SimCashflow } from '@/lib/fire-simulation'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { toSimResult, type UnifiedProjectionRow } from '@/lib/unified-projection'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import type { PotRulesConfig } from '@/lib/pot-rules'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import { type HousingStrategyConfig } from '@/lib/housing-strategy'

export interface HorizonFireSimResult {
  result: SimResult | null
  cashflows: SimCashflow[]
  isLoading: boolean
  error: string | null
  /** Original FIRE age before pensioen override (null when not in pensioen mode) */
  originalFireAge: number | null
  /** Original fractional FIRE age before pensioen override */
  originalFireAgeFractional: number | null
  /** Unified projection rows with per-asset-type detail (for vermogensopbouw chart) */
  unifiedRows: UnifiedProjectionRow[] | null
  /**
   * Echte life events + client-side geregenereerde housing-strategy-events.
   * De virtuele events van de server worden gestript en hier opnieuw
   * geresolved met de ACTUELE client-parameters (rendement, inflatie,
   * strategie) zodat het on_depletion-trigger-moment meebeweegt — markers en
   * tijdlijn horen deze array te consumeren, niet de server-events.
   */
  effectiveLifeEvents: LifeEvent[]
  /**
   * True wanneer de woning in deze projectie nooit verkocht wordt (downsize +
   * on_depletion, maar de trigger vuurt niet — het huis blijft staan en groeit
   * door tot eindleeftijd). Voedt de "huis wordt nooit verkocht"-melding op
   * /toekomst. Default false in loading/null-paden.
   */
  housingHeldToEnd: boolean
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
  /** Totaal saldo van ontkoppelde bankrekeningen (niet gekoppeld aan assets) */
  bankAccountCash?: number
  /** Handmatige spaargeld-override uit profiles.monthly_savings_override.
   *  Indien gezet (non-null), wint deze waarde × 12 als annualSavings boven
   *  de cashflow-spaarquote en het asset-contributie-aggregaat. */
  monthlySavingsOverride?: number | null
  /** Jaarlijks spaarbedrag afgeleid van de cashflow-pagina (inkomen × spaarquote,
   *  incl. spaarbudgetten + schuldaflossing). Primaire spaarbron wanneer er geen
   *  handmatige monthlySavingsOverride is. Zie lib/savings-source.ts. */
  baseAnnualSavingsFromCashflow?: number | null
  /** Eigen-woning-strategie uit profiles.housing_strategy_config. Default include_full. */
  housingStrategy?: HousingStrategyConfig
  /** Feature-flag: gebruik de grootboek-engine v2 i.p.v. runUnifiedProjection.
   *  Default false = byte-identiek aan de huidige productie-engine. Omkeerbaar (Fase 4). */
  horizonEngineV2?: boolean
  /** Pot-regels (profiles.pot_rules) — verdeling/onttrekkingsvolgorde voor v2. */
  potRules?: PotRulesConfig
}

export function useHorizonFireSim(params: HorizonFireSimInput | null): HorizonFireSimResult {
  const { horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturn: grossReturnParam, inflation: inflationParam, profileError, aowAgeFractional: aowAgeFractionalParam, assets, debts, box3Method, hasPartner, bankAccountCash, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, horizonEngineV2, potRules } = params ?? {}

  // Synchrone berekening via useMemo — geen async nodig want data is al geladen
  const simResult = useMemo<{ result: SimResult; cashflows: SimCashflow[]; originalFireAge: number | null; originalFireAgeFractional: number | null; unifiedRows: UnifiedProjectionRow[]; effectiveLifeEvents: LifeEvent[]; housingHeldToEnd: boolean } | null>(() => {
    // Input-assemblage via de gedeelde builder (single source — ook gebruikt door
    // de beheer-tabel-API). Zie lib/horizon-engine/build-input.ts.
    const built = buildHorizonInput({
      horizonInput: horizonInput ?? null,
      lifeEvents: lifeEvents ?? [],
      fireStrategy,
      withdrawalStrategy,
      grossReturn: grossReturnParam,
      inflation: inflationParam,
      aowAgeFractional: aowAgeFractionalParam,
      assets,
      debts,
      box3Method,
      hasPartner,
      bankAccountCash,
      monthlySavingsOverride,
      baseAnnualSavingsFromCashflow,
      housingStrategy,
      potRules,
      horizonEngineV2: horizonEngineV2 ?? false,
    })
    if (!built) return null
    const { input: unifiedInput, cashflows, effectiveLifeEvents, isPensioen, aowAge, aowAgeInt, strategyOptions, housingHeldToEnd } = built

    // ── Run projection engine (flag-selectie v1/v2, default v1) ────────
    const unifiedResult = runSelectedProjection(unifiedInput, horizonEngineV2 ?? false, strategyOptions)

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

      return { result: pensioenResult, cashflows, originalFireAge, originalFireAgeFractional, unifiedRows: unifiedResult.rows, effectiveLifeEvents, housingHeldToEnd }
    }

    return { result, cashflows, originalFireAge: null, originalFireAgeFractional: null, unifiedRows: unifiedResult.rows, effectiveLifeEvents, housingHeldToEnd }
  }, [horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturnParam, inflationParam, aowAgeFractionalParam, assets, debts, box3Method, hasPartner, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, horizonEngineV2, potRules])

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
    return { result: null, cashflows: [], isLoading: true, error: profileError ?? null, originalFireAge: null, originalFireAgeFractional: null, unifiedRows: null, effectiveLifeEvents: [], housingHeldToEnd: false }
  }

  return {
    result: simResult?.result ?? null,
    cashflows: simResult?.cashflows ?? [],
    isLoading: false,
    error: profileError ?? null,
    originalFireAge: simResult?.originalFireAge ?? null,
    originalFireAgeFractional: simResult?.originalFireAgeFractional ?? null,
    unifiedRows: simResult?.unifiedRows ?? null,
    effectiveLifeEvents: simResult?.effectiveLifeEvents ?? lifeEvents ?? [],
    housingHeldToEnd: simResult?.housingHeldToEnd ?? false,
  }
}
