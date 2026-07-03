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
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { dedupeById } from '@/lib/horizon-kernel/adapter'
import { applyKernelHousingSaleToEvents } from '@/lib/horizon/kernel-display-events'
import type { SolverStatus } from '@/lib/horizon-kernel/solver'
import type { KernelHousingSale } from '@/lib/horizon-kernel/bridge'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
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
  /**
   * FASE 5, stap 2b — welke motor deze projectie berekende. 'kernel' alleen
   * wanneer de convergentie-vlag aan staat én er geen terugval was; anders 'v2'
   * (vlag uit, terugval, of loading/null-pad).
   */
  engine: 'kernel' | 'v2'
  /** P!B93 — solver-status (V12); alleen gezet op de kernel-tak, anders null. */
  kernelStatus: SolverStatus | null
  /** P!B96 — €/mnd-extra-sparen-hint (V12); alleen op de kernel-tak, anders null. */
  kernelMaandHint: number | null
  /** Reden van de v2-terugval terwijl de vlag aan stond; anders null. */
  kernelFallbackReason: string | null
  /** Verkoopmoment eigen woning volgens de kernel (marker-contract); alleen op de kernel-tak, anders null. */
  kernelHousingSale: KernelHousingSale | null
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
  /** FASE 5, stap 2b — vlag `horizon_kernel_convergentie`. Alleen een letterlijke
   *  true (én een aanwezige `kernelRawProfile`) laat de projectie via de kernel lopen;
   *  anders byte-identiek aan v2. */
  kernelConvergentieEnabled?: boolean
  /** Rauwe profiel-rij voor de kernel-adapter (incl. kernel-instellingen-kolommen +
   *  geïnjecteerde `yearly_essential_expenses`). Afwezig/null → v2-terugval. */
  kernelRawProfile?: ConvergentieRawProfileRow | null
  /** Rauwe AOW-tabel — voor de kern-tijdas (lookupAowAge) in de adapter. */
  aowRows?: AowLeeftijdRow[]
}

export function useHorizonFireSim(params: HorizonFireSimInput | null): HorizonFireSimResult {
  const { horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturn: grossReturnParam, inflation: inflationParam, profileError, aowAgeFractional: aowAgeFractionalParam, assets, debts, box3Method, hasPartner, bankAccountCash, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, horizonEngineV2, potRules, kernelConvergentieEnabled, kernelRawProfile, aowRows } = params ?? {}

  // Synchrone berekening via useMemo — geen async nodig want data is al geladen
  const simResult = useMemo<{ result: SimResult; cashflows: SimCashflow[]; originalFireAge: number | null; originalFireAgeFractional: number | null; unifiedRows: UnifiedProjectionRow[]; effectiveLifeEvents: LifeEvent[]; housingHeldToEnd: boolean; engine: 'kernel' | 'v2'; kernelStatus: SolverStatus | null; kernelMaandHint: number | null; kernelFallbackReason: string | null; kernelHousingSale: KernelHousingSale | null } | null>(() => {
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

    // ── FASE 5, stap 2b: route via de convergentie-motorschakelaar ─────
    // Vlag uit (of geen rauwe kernel-context) → byte-identiek aan v2:
    // computeConvergentieProjection roept intern `runSelectedProjection` aan met
    // dezelfde argumenten als voorheen. Vlag aan + schone input → de horizon-kernel.
    const kernelEnabled = kernelConvergentieEnabled === true && !!kernelRawProfile
    const outcome = computeConvergentieProjection({
      builtInput: unifiedInput,
      strategyOptions,
      v2FlagArg: horizonEngineV2 ?? false,
      kernelEnabled,
      rawContext: kernelRawProfile
        ? {
            profile: kernelRawProfile,
            assets: assets ?? [],
            debts: debts ?? [],
            lifeEvents: lifeEvents ?? [],
            aowRows,
            yearlyExpenses: unifiedInput.yearlyExpenses,
          }
        : undefined,
    })
    const unifiedResult = outcome.result

    // ── Convert to SimResult via toSimResult() for backwards compatibility ──
    const result = toSimResult(unifiedResult)

    // ── Kernel-tak: sla het v2-pensioen-post-processing-blok OVER — de kernel doet
    //    de AOW-kortsluiting zélf via de pensioen-eindstrategie in de solver, dus
    //    originalFireAge* = null. effectiveLifeEvents = NIET built.effectiveLifeEvents
    //    (dat zijn v2-geregenereerde virtuele huis-events uit een v2-meetrun, die op
    //    de kernel-tak zouden liegen); we dedupliceren de rauwe app-events. De
    //    guard-partitionering (partitionEvents, adapter/guard.ts) bepaalt de routering
    //    ín de adapter; het kernel-verkoopmoment is bewust (2b-beperking) nog niet als
    //    marker ontsloten. housingHeldToEnd = false: dat is een v2-meetrun-concept en
    //    op de kernel-tak niet van toepassing.
    //
    //    FIX 1 — verkoop-marker: de server-virtuele housing-verkoop-events zijn op
    //    v2-basis geresolved (on_depletion valt bv. op ~89j) en liegen op de kernel-
    //    tak. `applyKernelHousingSaleToEvents` stript die stale verkoop-events en zet
    //    — als de kernel binnen de horizon verkoopt — één kernel-afgeleid verkoop-
    //    event op `kernelHousingSale.age`. De opeethypotheek-virtuele en de echte
    //    gebruikers-events blijven ongemoeid.
    if (outcome.engine === 'kernel') {
      return {
        result,
        cashflows,
        originalFireAge: null,
        originalFireAgeFractional: null,
        unifiedRows: unifiedResult.rows,
        effectiveLifeEvents: applyKernelHousingSaleToEvents(
          dedupeById(lifeEvents ?? []),
          outcome.kernelHousingSale ?? null,
        ),
        housingHeldToEnd: false,
        engine: 'kernel' as const,
        kernelStatus: outcome.kernelStatus ?? null,
        kernelMaandHint: outcome.kernelMaandHint ?? null,
        kernelFallbackReason: null,
        kernelHousingSale: outcome.kernelHousingSale ?? null,
      }
    }

    // ── v2-tak (vlag uit óf terugval): EXACT het bestaande gedrag ──────
    // fallbackReason is alleen gezet bij een vlag-aan-terugval; vlag uit → null.
    const v2Base = {
      cashflows,
      unifiedRows: unifiedResult.rows,
      effectiveLifeEvents,
      housingHeldToEnd,
      engine: 'v2' as const,
      kernelStatus: null,
      kernelMaandHint: null,
      kernelFallbackReason: outcome.fallbackReason ?? null,
      kernelHousingSale: null,
    }

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

      return { result: pensioenResult, originalFireAge, originalFireAgeFractional, ...v2Base }
    }

    return { result, originalFireAge: null, originalFireAgeFractional: null, ...v2Base }
  }, [horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturnParam, inflationParam, aowAgeFractionalParam, assets, debts, box3Method, hasPartner, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, horizonEngineV2, potRules, kernelConvergentieEnabled, kernelRawProfile, aowRows])

  // Snapshot persistentie — debounced upsert naar net_worth_snapshots
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!simResult?.result) return

    const { fireAgeFractional, requiredFirePortfolio } = simResult.result
    const engineBron = simResult.engine

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const today = new Date().toISOString().split('T')[0]

        // Alleen BIJWERKEN, nooit inserten: deze hook stuurt enkel de FIRE-velden
        // mee (fire_age / fire_portfolio_required). Een upsert zou bij een
        // ontbrekende dagrij een INSERT triggeren zonder total_assets en de
        // NOT NULL-constraint op net_worth_snapshots.total_assets schenden.
        // Treft de update nul rijen (snapshot-cron heeft de dagrij nog niet
        // geschreven), dan wordt de FIRE-data simpelweg niet voor vandaag
        // opgeslagen — acceptabel; de cron schrijft later de volledige rij.
        //
        // V15 (FASE 5, stap 2b): schrijf de rekenwijze (`engine_bron`) ALLEEN mee
        // wanneer de convergentie-vlag aan staat — dit voedt de "rekenwijze
        // gewijzigd"-annotatie in de trend-weergave. Vlag uit → payload byte-
        // identiek aan vandaag (géén extra sleutel).
        const payload = {
          fire_age: fireAgeFractional,
          fire_portfolio_required: requiredFirePortfolio,
          ...(kernelConvergentieEnabled === true ? { engine_bron: engineBron } : {}),
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
  }, [simResult, kernelConvergentieEnabled])

  if (!params || !horizonInput) {
    return { result: null, cashflows: [], isLoading: true, error: profileError ?? null, originalFireAge: null, originalFireAgeFractional: null, unifiedRows: null, effectiveLifeEvents: [], housingHeldToEnd: false, engine: 'v2', kernelStatus: null, kernelMaandHint: null, kernelFallbackReason: null, kernelHousingSale: null }
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
    // FASE 5, stap 2b — additief; loading/null-pad valt terug op de v2-defaults.
    engine: simResult?.engine ?? 'v2',
    kernelStatus: simResult?.kernelStatus ?? null,
    kernelMaandHint: simResult?.kernelMaandHint ?? null,
    kernelFallbackReason: simResult?.kernelFallbackReason ?? null,
    kernelHousingSale: simResult?.kernelHousingSale ?? null,
  }
}
