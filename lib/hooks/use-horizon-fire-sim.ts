'use client'

/**
 * useHorizonFireSim — koppelt app-data aan de horizon-kernel.
 *
 * (FASE 6 stap 5A — kernel-only.) Ontvangt al-geladen data (FinancialInput + lifeEvents +
 * assets + debts + de rauwe kernel-profiel-rij) van horizon/page.tsx en berekent het
 * FIRE-resultaat via `computeConvergentieProjection` (de horizon-kernel is de enige motor).
 * Schrijft de FIRE-velden weg naar net_worth_snapshots.
 */

import { useMemo, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type FinancialInput, type LifeEvent } from '@/lib/horizon-data'
import { type SimResult, type SimCashflow } from '@/lib/fire-simulation'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { toSimResult, type UnifiedProjectionRow } from '@/lib/unified-projection'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { dedupeById } from '@/lib/horizon-kernel/adapter'
import { applyKernelHousingSaleToEvents } from '@/lib/horizon/kernel-display-events'
import type { SolverStatus } from '@/lib/horizon-kernel/solver'
import type { KernelHousingSale, KernelPensionPotView } from '@/lib/horizon-kernel/bridge'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import { type HousingStrategyConfig } from '@/lib/housing-strategy'

export interface HorizonFireSimResult {
  result: SimResult | null
  cashflows: SimCashflow[]
  isLoading: boolean
  error: string | null
  /** Unified projection rows with per-asset-type detail (for vermogensopbouw chart) */
  unifiedRows: UnifiedProjectionRow[] | null
  /**
   * Echte life events + één kernel-afgeleid housing-verkoop-event. De kernel resolvet de
   * woning-verkoop zelf (`kernelHousingSale`); markers en tijdlijn horen deze array te
   * consumeren.
   */
  effectiveLifeEvents: LifeEvent[]
  /** P!B93 — solver-status; null in loading/null-paden. */
  kernelStatus: SolverStatus | null
  /** P!B96 — €/mnd-extra-sparen-hint; null in loading/null-paden. */
  kernelMaandHint: number | null
  /** Verkoopmoment eigen woning volgens de kernel (marker-contract); null = geen verkoop. */
  kernelHousingSale: KernelHousingSale | null
  /** Pensioenpot-weergave (feature #876; bridge-weergaveveld); null in loading/null-paden. */
  kernelPensionPots: readonly KernelPensionPotView[] | null
}

interface HorizonFireSimInput {
  horizonInput: FinancialInput | null
  lifeEvents: LifeEvent[]
  fireStrategy?: FireStrategyConfig
  withdrawalStrategy?: WithdrawalStrategyConfig  // default: static
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
  /** Handmatige spaargeld-override uit profiles.monthly_savings_override. */
  monthlySavingsOverride?: number | null
  /** Jaarlijks spaarbedrag afgeleid van de cashflow-pagina (inkomen × spaarquote). */
  baseAnnualSavingsFromCashflow?: number | null
  /** Eigen-woning-strategie uit profiles.housing_strategy_config. */
  housingStrategy?: HousingStrategyConfig
  /**
   * Rauwe profiel-rij voor de kernel-adapter (incl. kernel-instellingen-kolommen +
   * geïnjecteerde `yearly_essential_expenses`). Afwezig/null → geen kernel-run → null-resultaat.
   */
  kernelRawProfile?: ConvergentieRawProfileRow | null
  /** Rauwe AOW-tabel — voor de kern-tijdas (lookupAowAge) in de adapter. */
  aowRows?: AowLeeftijdRow[]
}

export function useHorizonFireSim(params: HorizonFireSimInput | null): HorizonFireSimResult {
  const { horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturn: grossReturnParam, inflation: inflationParam, profileError, aowAgeFractional: aowAgeFractionalParam, assets, debts, box3Method, hasPartner, bankAccountCash, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, kernelRawProfile, aowRows } = params ?? {}

  // Synchrone berekening via useMemo — geen async nodig want data is al geladen
  const simResult = useMemo<{ result: SimResult; cashflows: SimCashflow[]; unifiedRows: UnifiedProjectionRow[]; effectiveLifeEvents: LifeEvent[]; kernelStatus: SolverStatus | null; kernelMaandHint: number | null; kernelHousingSale: KernelHousingSale | null; kernelPensionPots: readonly KernelPensionPotView[] } | null>(() => {
    // Metadata-assemblage via de gedeelde builder (yearlyExpenses + guards). Zie
    // lib/horizon/build-input.ts.
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
    })
    if (!built) return null
    // Zonder rauwe profiel-rij kan de kernel-invoer niet worden samengesteld.
    if (!kernelRawProfile) return null
    const { input: unifiedInput, cashflows } = built

    // ── Kernel-only: route via de convergentie-router ─────────────────
    const outcome = computeConvergentieProjection({
      rawContext: {
        profile: kernelRawProfile,
        assets: assets ?? [],
        debts: debts ?? [],
        lifeEvents: lifeEvents ?? [],
        aowRows,
        yearlyExpenses: unifiedInput.yearlyExpenses,
      },
    })
    if (!outcome.ok) return null
    const unifiedResult = outcome.result
    const result = toSimResult(unifiedResult)

    // De kernel doet de AOW-kortsluiting zélf via de pensioen-eindstrategie in de solver.
    // effectiveLifeEvents = de gededupliceerde rauwe app-events, met — als de kernel binnen
    // de horizon verkoopt — één kernel-afgeleid verkoop-event op `kernelHousingSale.age`
    // (`applyKernelHousingSaleToEvents`).
    return {
      result,
      cashflows,
      unifiedRows: unifiedResult.rows,
      effectiveLifeEvents: applyKernelHousingSaleToEvents(
        dedupeById(lifeEvents ?? []),
        outcome.kernelHousingSale ?? null,
      ),
      kernelStatus: outcome.kernelStatus ?? null,
      kernelMaandHint: outcome.kernelMaandHint ?? null,
      kernelHousingSale: outcome.kernelHousingSale ?? null,
      kernelPensionPots: outcome.result.kernelPensionPots,
    }
  }, [horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturnParam, inflationParam, aowAgeFractionalParam, assets, debts, box3Method, hasPartner, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, kernelRawProfile, aowRows])

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

        // Alleen BIJWERKEN, nooit inserten: deze hook stuurt enkel de FIRE-velden mee
        // (fire_age / fire_portfolio_required). Een upsert zou bij een ontbrekende dagrij een
        // INSERT triggeren zonder total_assets en de NOT NULL-constraint schenden. `engine_bron`
        // is sinds de kernel-only-cutover altijd 'kernel'.
        const payload = {
          fire_age: fireAgeFractional,
          fire_portfolio_required: requiredFirePortfolio,
          engine_bron: 'kernel',
        }
        await supabase
          .from('net_worth_snapshots')
          .update(payload)
          .eq('user_id', user.id)
          .eq('snapshot_date', today)
      } catch {
        // Non-critical — snapshot update mislukt laat de UI niet crashen
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [simResult])

  if (!params || !horizonInput) {
    return { result: null, cashflows: [], isLoading: true, error: profileError ?? null, unifiedRows: null, effectiveLifeEvents: [], kernelStatus: null, kernelMaandHint: null, kernelHousingSale: null, kernelPensionPots: null }
  }

  return {
    result: simResult?.result ?? null,
    cashflows: simResult?.cashflows ?? [],
    isLoading: false,
    error: profileError ?? null,
    unifiedRows: simResult?.unifiedRows ?? null,
    effectiveLifeEvents: simResult?.effectiveLifeEvents ?? lifeEvents ?? [],
    kernelStatus: simResult?.kernelStatus ?? null,
    kernelMaandHint: simResult?.kernelMaandHint ?? null,
    kernelHousingSale: simResult?.kernelHousingSale ?? null,
    kernelPensionPots: simResult?.kernelPensionPots ?? null,
  }
}
