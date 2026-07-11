'use client'

/**
 * useHorizonFireSim — koppelt app-data aan de horizon-kernel.
 *
 * (FASE 6 stap 5A — kernel-only.) Ontvangt al-geladen data (FinancialInput + lifeEvents +
 * assets + debts + de rauwe kernel-profiel-rij) van horizon/page.tsx en berekent het
 * FIRE-resultaat via `computeConvergentieProjection` (de horizon-kernel is de enige motor).
 * Schrijft de FIRE-velden weg naar net_worth_snapshots.
 */

import { useMemo, useEffect, useRef, useDeferredValue } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type FinancialInput, type LifeEvent } from '@/lib/horizon-data'
import { type SimResult, type SimCashflow } from '@/lib/fire-simulation'
import { DEFAULT_FIRE_STRATEGY, type FireStrategyConfig } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { toSimResult, type UnifiedProjectionRow } from '@/lib/unified-projection'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { dedupeById } from '@/lib/horizon-kernel/adapter'
import { applyReturnDeltasToAssets } from '@/lib/horizon-kernel/adapter/whatif-varianten'
import { expandCategorieReturnDeltas } from '@/lib/horizon/toekomst-scenario'
import { runForcedStopPath, type ForcedStopPathResult } from '@/lib/horizon/scenario-presets'
import { applyKernelHousingSaleToEvents } from '@/lib/horizon/kernel-display-events'
import type { SolverStatus } from '@/lib/horizon-kernel/solver'
import type { KernelHousingSale, KernelPensionPotView } from '@/lib/horizon-kernel/bridge'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import { type HousingStrategyConfig } from '@/lib/housing-strategy'

/**
 * Wat-als-scenario-overrides (2e projectielijn op /toekomst, plan §A/§B). Additief en
 * volledig optioneel: afwezig/null ⇒ geen scenario-run. De scenario-run draait via exact
 * dezelfde `computeConvergentieProjection`-context als de hoofdlijn — alléén (a) de assets
 * gaan vooraf door `applyReturnDeltasToAssets(expandCategorieReturnDeltas(...))` en (b) de
 * scenario-events komen bovenop de hoofd-`lifeEvents`. Nul overrides ⇒ identieke context ⇒
 * identieke uitkomst (golden: `lib/horizon/scenario-baseline-parity.test.ts`).
 */
export interface HorizonScenarioOverrides {
  /** Slider-/preset-events (scenario-only) die BOVENOP de hoofd-events komen. */
  extraLifeEvents: WhatIfEvent[]
  /** Per-kern-categorie rendement-delta (decimaal, ±0,05); leeg/afwezig ⇒ geen verschuiving. */
  returnDeltaByCategorie?: Partial<Record<AssetCategorie, number>>
}

/** Resultaat van de gescheiden scenario-run — spiegelt het hoofd-pad minimaal. */
export interface HorizonScenarioResult {
  result: SimResult
  unifiedRows: UnifiedProjectionRow[]
}

/**
 * Resultaat van het gekozen-stop-pad (ronde 3) — de geforceerde "wat als je op deze
 * leeftijd stopt en je vermogen opeet"-run. Structureel identiek aan het scenario-/hoofd-
 * pad; alias van `ForcedStopPathResult` (lib/horizon/scenario-presets.ts — één home voor
 * het geforceerde-run-recept).
 */
export type HorizonStopPadResult = ForcedStopPathResult

/**
 * Context-assemblage voor de scenario-/stop-pad-runs (één home). Past — ALLEEN wanneer
 * er actieve overrides zijn — (a) de per-categorie rendement-delta's op de assets toe en
 * (b) de scenario-events bovenop de hoofd-`lifeEvents`. Nul overrides ⇒ ongewijzigde
 * referenties (identiek aan de basislijn — golden: scenario-baseline-parity.test.ts).
 */
function resolveScenarioAssetsAndEvents(
  assets: Asset[] | undefined,
  lifeEvents: LifeEvent[] | undefined,
  ov: HorizonScenarioOverrides | null,
): { assets: Asset[]; lifeEvents: LifeEvent[] } {
  const extraEvents = ov?.extraLifeEvents ?? []
  const returnDeltas = ov?.returnDeltaByCategorie
  const hasReturnDeltas = returnDeltas != null && Object.keys(returnDeltas).length > 0
  const baseAssets = assets ?? []
  const scenarioAssets = hasReturnDeltas
    ? applyReturnDeltasToAssets(baseAssets, expandCategorieReturnDeltas(returnDeltas, baseAssets))
    : baseAssets
  const baseLifeEvents = lifeEvents ?? []
  const scenarioLifeEvents = extraEvents.length > 0 ? [...baseLifeEvents, ...extraEvents] : baseLifeEvents
  return { assets: scenarioAssets, lifeEvents: scenarioLifeEvents }
}

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
  /**
   * Tweede, GESCHEIDEN wat-als-scenario-projectie (2e lijn op /toekomst, plan §A/§B).
   * `null` = geen actieve override (of loading/null-pad). Berekend in een eigen useMemo
   * die op de hoofd-inputs ÉN de overrides keyt; de hoofdrun herrekent hierdoor NOOIT,
   * en deze run schrijft NOOIT naar `net_worth_snapshots` (dat effect keyt op de hoofdrun).
   *
   * Optioneel in het TYPE (additief, non-breaking): de hook zet het veld altijd op een
   * concrete waarde (`null` of het scenario-resultaat), dus consumenten lezen `null`/waarde
   * — het `?` houdt bestaande volledige `HorizonFireSimResult`-literals (mocks) compileerbaar.
   */
  scenario?: HorizonScenarioResult | null
  /**
   * Gekozen-stop-pad (ronde 3) — de geforceerde "wat als je op `stopPadAge` echt stopt en
   * je vermogen opeet"-projectie. `null` = geen `stopPadAge` gezet, of loading/null-pad, of
   * een kern-fout (zichtbare degradatie, geen tweede motor). Berekend in een EIGEN useMemo
   * die op de hoofd-input + de scenario-overrides + `stopPadAge` keyt; de hoofd- en scenario-
   * memo herrekenen hierdoor NOOIT, en dit pad schrijft NOOIT naar `net_worth_snapshots`.
   *
   * Draait op de ACTIEVE context: mét scenario-overrides indien aanwezig (hergebruikt exact
   * dezelfde context-assemblage als de scenario-memo). Optioneel/additief in het TYPE.
   */
  stopPad?: HorizonStopPadResult | null
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
  /**
   * Wat-als-scenario-overrides (2e projectielijn, plan §A/§B). Additief/optioneel: afwezig
   * of null ⇒ geen scenario-run (`scenario === null`). Verandert NIETS aan de hoofdrun.
   */
  scenarioOverrides?: HorizonScenarioOverrides | null
  /**
   * Gekozen-stopleeftijd (ronde 3, fractioneel). Additief/optioneel: afwezig of null ⇒ geen
   * stop-pad (`stopPad === null`). Verandert NIETS aan de hoofd- of scenario-run — draait in
   * een eigen useMemo. Wanneer gezet forceert de hook een deplete-stop op deze leeftijd.
   */
  stopPadAge?: number | null
}

export function useHorizonFireSim(params: HorizonFireSimInput | null): HorizonFireSimResult {
  const { horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturn: grossReturnParam, inflation: inflationParam, profileError, aowAgeFractional: aowAgeFractionalParam, assets, debts, box3Method, hasPartner, bankAccountCash, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, kernelRawProfile, aowRows } = params ?? {}
  // Scenario-overrides apart gedestructureerd — mag GEEN dep van de hoofd-memo worden
  // (de hoofdlijn herrekent nooit op een scenario-wijziging).
  const scenarioOverrides = params?.scenarioOverrides ?? null
  // Gekozen-stopleeftijd apart gedestructureerd — mag GEEN dep van de hoofd- of scenario-memo
  // worden (die herrekenen nooit op een stop-pad-wijziging).
  const stopPadAge = params?.stopPadAge ?? null

  // ── Slider-defer (alléén scheduling; geen formule/parameter-wijziging) ─────
  // Bundel de kernel-inputs in één object dat exact op dezelfde 16 waarden keyt als de
  // kernel-useMemo hiervóór (bankAccountCash bleef — net als voorheen — bewust géén key:
  // enkel bankAccountCash wijzigen triggerde geen recompute en mag dat nog steeds niet).
  // useDeferredValue laat een urgente render (slider-tick) het vórige input-object
  // hergebruiken, terwijl de kernel (fase 1-meting: 173–419ms main-thread) in een
  // onderbreekbare achtergrond-render draait die bij continu schuiven coalesced. Op de
  // initiële render is de deferred waarde gelijk aan de huidige → de eerste kernel-run
  // blijft synchroon (contract-tests van deze hook ongewijzigd).
  const kernelInput = useMemo(() => ({
    horizonInput,
    lifeEvents,
    fireStrategy,
    withdrawalStrategy,
    grossReturnParam,
    inflationParam,
    aowAgeFractionalParam,
    assets,
    debts,
    box3Method,
    hasPartner,
    bankAccountCash,
    monthlySavingsOverride,
    baseAnnualSavingsFromCashflow,
    housingStrategy,
    kernelRawProfile,
    aowRows,
  }), [horizonInput, lifeEvents, fireStrategy, withdrawalStrategy, grossReturnParam, inflationParam, aowAgeFractionalParam, assets, debts, box3Method, hasPartner, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy, kernelRawProfile, aowRows])

  const deferredKernelInput = useDeferredValue(kernelInput)

  // Zelfde defer-patroon als de hoofd-input (:hierboven), nu op de scenario-overrides:
  // tijdens slider-drag coalesced de (2e) scenario-run in een onderbreekbare
  // achtergrond-render. Op de initiële render is de deferred waarde gelijk aan de huidige
  // → de eerste scenario-run blijft synchroon (contract-tests stabiel).
  const deferredScenarioOverrides = useDeferredValue(scenarioOverrides)

  // Zelfde defer-patroon op de gekozen-stopleeftijd: tijdens slepen coalesced de (3e)
  // stop-pad-run in een onderbreekbare achtergrond-render. Initieel gelijk aan de huidige
  // waarde → eerste run synchroon (contract-tests stabiel).
  const deferredStopPadAge = useDeferredValue(stopPadAge)

  // Synchrone berekening via useMemo — geen async nodig want data is al geladen. Keyt op
  // het deferred input-object (referentie-stabiel zolang de 16 deps ongewijzigd blijven).
  const simResult = useMemo<{ result: SimResult; cashflows: SimCashflow[]; unifiedRows: UnifiedProjectionRow[]; effectiveLifeEvents: LifeEvent[]; kernelStatus: SolverStatus | null; kernelMaandHint: number | null; kernelHousingSale: KernelHousingSale | null; kernelPensionPots: readonly KernelPensionPotView[] } | null>(() => {
    const p = deferredKernelInput
    // Metadata-assemblage via de gedeelde builder (yearlyExpenses + guards). Zie
    // lib/horizon/build-input.ts.
    const built = buildHorizonInput({
      horizonInput: p.horizonInput ?? null,
      lifeEvents: p.lifeEvents ?? [],
      fireStrategy: p.fireStrategy,
      withdrawalStrategy: p.withdrawalStrategy,
      grossReturn: p.grossReturnParam,
      inflation: p.inflationParam,
      aowAgeFractional: p.aowAgeFractionalParam,
      assets: p.assets,
      debts: p.debts,
      box3Method: p.box3Method,
      hasPartner: p.hasPartner,
      bankAccountCash: p.bankAccountCash,
      monthlySavingsOverride: p.monthlySavingsOverride,
      baseAnnualSavingsFromCashflow: p.baseAnnualSavingsFromCashflow,
      housingStrategy: p.housingStrategy,
    })
    if (!built) return null
    // Zonder rauwe profiel-rij kan de kernel-invoer niet worden samengesteld.
    if (!p.kernelRawProfile) return null
    const { input: unifiedInput, cashflows } = built

    // ── Kernel-only: route via de convergentie-router ─────────────────
    const outcome = computeConvergentieProjection({
      rawContext: {
        profile: p.kernelRawProfile,
        assets: p.assets ?? [],
        debts: p.debts ?? [],
        lifeEvents: p.lifeEvents ?? [],
        aowRows: p.aowRows,
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
        dedupeById(p.lifeEvents ?? []),
        outcome.kernelHousingSale ?? null,
      ),
      kernelStatus: outcome.kernelStatus ?? null,
      kernelMaandHint: outcome.kernelMaandHint ?? null,
      kernelHousingSale: outcome.kernelHousingSale ?? null,
      kernelPensionPots: outcome.result.kernelPensionPots,
    }
  }, [deferredKernelInput])

  // ── Wat-als-scenario-run — TWEEDE, GESCHEIDEN useMemo (plan §A/§B) ──────────
  // Keyt op het deferred hoofd-input-object ÉN de deferred overrides. De hoofd-memo
  // (:hierboven) blijft uitsluitend op `deferredKernelInput` gekeyed → een override-
  // wijziging laat de hoofdlijn NOOIT herrekenen. Zonder actieve override (geen extra
  // events én geen rendement-delta) ⇒ null (geen 2e kernel-run). Bij een actieve
  // override: exact dezelfde `ConvergentieRawContext` als de hoofdrun, met alléén
  // (a) assets vooraf door `applyReturnDeltasToAssets(expandCategorieReturnDeltas(...))` en
  // (b) de scenario-events bovenop de hoofd-`lifeEvents`. `yearlyExpenses` is puur afgeleid
  // van `horizonInput` (niet van assets/events) → identiek aan de basislijn; nul overrides
  // ⇒ identieke context ⇒ identieke uitkomst (golden: scenario-baseline-parity.test.ts).
  const scenario = useMemo<HorizonScenarioResult | null>(() => {
    const ov = deferredScenarioOverrides
    const extraEvents = ov?.extraLifeEvents ?? []
    const returnDeltas = ov?.returnDeltaByCategorie
    const hasReturnDeltas = returnDeltas != null && Object.keys(returnDeltas).length > 0
    // hasScenario: alleen rekenen bij ≥1 afwijkende slider/preset of rendement-delta.
    if (extraEvents.length === 0 && !hasReturnDeltas) return null

    const p = deferredKernelInput
    // Zelfde metadata-assemblage als de hoofdrun (yearlyExpenses + guards) — met de
    // BASELINE-inputs, want yearlyExpenses hangt niet van assets/events af.
    const built = buildHorizonInput({
      horizonInput: p.horizonInput ?? null,
      lifeEvents: p.lifeEvents ?? [],
      fireStrategy: p.fireStrategy,
      withdrawalStrategy: p.withdrawalStrategy,
      grossReturn: p.grossReturnParam,
      inflation: p.inflationParam,
      aowAgeFractional: p.aowAgeFractionalParam,
      assets: p.assets,
      debts: p.debts,
      box3Method: p.box3Method,
      hasPartner: p.hasPartner,
      bankAccountCash: p.bankAccountCash,
      monthlySavingsOverride: p.monthlySavingsOverride,
      baseAnnualSavingsFromCashflow: p.baseAnnualSavingsFromCashflow,
      housingStrategy: p.housingStrategy,
    })
    if (!built) return null
    if (!p.kernelRawProfile) return null
    const { input: unifiedInput } = built

    // (a) assets pre-muteren met de categorie-rendement-delta's + (b) scenario-events
    //     bovenop de hoofd-events — via de gedeelde assemblage (één home; identiek gedrag).
    const { assets: scenarioAssets, lifeEvents: scenarioLifeEvents } =
      resolveScenarioAssetsAndEvents(p.assets, p.lifeEvents, ov)

    const outcome = computeConvergentieProjection({
      rawContext: {
        profile: p.kernelRawProfile,
        assets: scenarioAssets,
        debts: p.debts ?? [],
        lifeEvents: scenarioLifeEvents,
        aowRows: p.aowRows,
        yearlyExpenses: unifiedInput.yearlyExpenses,
      },
    })
    if (!outcome.ok) return null
    return {
      result: toSimResult(outcome.result),
      unifiedRows: outcome.result.rows,
    }
  }, [deferredKernelInput, deferredScenarioOverrides])

  // ── Gekozen-stop-pad — DERDE, GESCHEIDEN useMemo (ronde 3) ──────────────────
  // Keyt op het deferred hoofd-input-object, de deferred overrides ÉN de deferred
  // stopleeftijd. De hoofd- (:hierboven) en scenario-memo blijven op hun eigen deps gekeyed
  // → een stopPadAge-wijziging laat die NOOIT herrekenen. Zonder stopPadAge ⇒ null (geen 3e
  // kernel-run). Anders: het geforceerde-run-recept (runForcedStopPath, één home) op de
  // ACTIEVE context — mét scenario-overrides indien aanwezig (exact dezelfde context-
  // assemblage als de scenario-memo) — met een deplete-op-eindleeftijd-eindstrategie. Dit is
  // de eerlijke "wat als je dan echt stopt en je vermogen opeet"-vorm. `yearlyExpenses` komt
  // — net als de hoofd-/scenario-run — uit buildHorizonInput (baseline; hangt niet van
  // assets/events af). Kern-context ontbreekt of kern-fout ⇒ null (zichtbare degradatie).
  const stopPad = useMemo<HorizonStopPadResult | null>(() => {
    const stopAge = deferredStopPadAge
    if (stopAge == null || !Number.isFinite(stopAge)) return null

    const p = deferredKernelInput
    if (!p.horizonInput || !p.kernelRawProfile) return null

    const built = buildHorizonInput({
      horizonInput: p.horizonInput ?? null,
      lifeEvents: p.lifeEvents ?? [],
      fireStrategy: p.fireStrategy,
      withdrawalStrategy: p.withdrawalStrategy,
      grossReturn: p.grossReturnParam,
      inflation: p.inflationParam,
      aowAgeFractional: p.aowAgeFractionalParam,
      assets: p.assets,
      debts: p.debts,
      box3Method: p.box3Method,
      hasPartner: p.hasPartner,
      bankAccountCash: p.bankAccountCash,
      monthlySavingsOverride: p.monthlySavingsOverride,
      baseAnnualSavingsFromCashflow: p.baseAnnualSavingsFromCashflow,
      housingStrategy: p.housingStrategy,
    })
    if (!built) return null

    // Actieve context: scenario-overrides indien aanwezig (gedeelde assemblage).
    const { assets: ctxAssets, lifeEvents: ctxLifeEvents } = resolveScenarioAssetsAndEvents(
      p.assets,
      p.lifeEvents,
      deferredScenarioOverrides,
    )

    return runForcedStopPath({
      profile: p.kernelRawProfile,
      assets: ctxAssets,
      debts: p.debts ?? [],
      lifeEvents: ctxLifeEvents,
      aowRows: p.aowRows,
      yearlyExpenses: built.input.yearlyExpenses,
      stopAge,
      fireEndAge: p.fireStrategy?.endAge ?? DEFAULT_FIRE_STRATEGY.endAge,
    })
  }, [deferredKernelInput, deferredScenarioOverrides, deferredStopPadAge])

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
    return { result: null, cashflows: [], isLoading: true, error: profileError ?? null, unifiedRows: null, effectiveLifeEvents: [], kernelStatus: null, kernelMaandHint: null, kernelHousingSale: null, kernelPensionPots: null, scenario: null, stopPad: null }
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
    scenario: scenario ?? null,
    stopPad: stopPad ?? null,
  }
}
