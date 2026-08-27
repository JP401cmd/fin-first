/**
 * Scenario-presets — de vijf mockup-kaarten van de /toekomst-ronde-3 als DATA + een pure
 * runner. Elke kaart is één kernel-run; de UI draait ze lazy/deferred. Deze laag is puur
 * en isomorf (geen `'use client'`, geen Supabase/Date.now).
 *
 * ## Twee run-vormen (CONSUME, geen nieuwe motor)
 *  - **stop-varianten** (`kind: 'stop'`) — een GEFORCEERD stopmoment: hergebruikt exact het
 *    geforceerde-run-recept (`runForcedStopPath`) dat ook de AOW-stop-sim en de hook-stopPad
 *    gebruiken: `evaluateFireAt(input, stopAge)` met de deplete-op-eindleeftijd-overrides.
 *  - **input-varianten** (`kind: 'input'`) — een gewijzigde INVOER (minder uitgeven / extra
 *    inleg / downsize): de gewone `computeConvergentieProjection` met een aangepaste
 *    `ConvergentieRawContext` (zelfde motorpad als de hoofdlijn — géén what-if-adapter).
 *
 * ## De vijf kaarten (vaste volgorde)
 *  1. `basis` — de basislijn (solve).
 *  2. `een-jaar-langer` — stop op verwacht-FIRE + 1 (stop).
 *  3. `minder-uitgeven` — structureel −€300/mnd (input; verlaagt uitgaven → lager doel én
 *     meer sparen).
 *  4. `downsize` — forceer een verkoop-woonstrategie (input) — ALLEEN wanneer de gebruiker
 *     een eigen huis heeft én er nog géén downsize/verkoop-strategie actief is; ANDERS
 *     vervangen door `extra-inleg` (+€250/mnd extra inleg). De wissel leeft in
 *     `resolveScenarioPresets`.
 *  5. `eerder-stoppen` — stop op verwacht-FIRE − 2 (stop; de "rood"-kaart).
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { SimResult } from '@/lib/fire-simulation'
import { toSimResult, type UnifiedProjectionRow } from '@/lib/unified-projection'
import {
  buildConvergentieAdapterProfile,
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp, deriveEigenHuisIds, type KernelAdapterInput } from '@/lib/horizon-kernel/adapter'
import { evaluateFireAt } from '@/lib/horizon-kernel/solver'
import { kernelToUnifiedResult, buildKernelSlotMeta, type KernelHousingSale } from '@/lib/horizon-kernel/bridge'
import { DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import { DEFAULT_DOWNSIZE_CONFIG } from '@/lib/housing-strategy'
import { computeLaagsteBuffer, type LaagsteBuffer } from '@/lib/horizon/laagste-buffer'

// ── Preset-definitie-bedragen (scenario-config, GEEN financiële aanname) ─────
// Dit zijn de "wat test deze mockup-kaart"-bedragen, geen SWR/rendement/inflatie.
const SCENARIO_EEN_JAAR_LANGER_OFFSET = 1
const SCENARIO_EERDER_STOPPEN_OFFSET = -2
const SCENARIO_MINDER_UITGEVEN_MAAND = -300
const SCENARIO_EXTRA_INLEG_MAAND = 250

// ── Status-drempels (presentatie, GEEN financiële aanname) ───────────────────
// "Duidelijk beter dan basis" = laagste buffer ligt minstens deze marge boven de basis.
const SCENARIO_BUFFER_BETER_MARGE_PCT = 0.05
const SCENARIO_BUFFER_BETER_MARGE_ABS = 5_000

export type ScenarioPresetId =
  | 'basis'
  | 'een-jaar-langer'
  | 'minder-uitgeven'
  | 'downsize'
  | 'extra-inleg'
  | 'eerder-stoppen'

/** Hoe een kaart wordt doorgerekend. */
export type ScenarioPresetKind = 'basis' | 'stop' | 'input'

/** UI-status van een kaart t.o.v. de basis. */
export type ScenarioPresetStatus = 'basis' | 'groen' | 'amber' | 'rood'

/** Statische definitie van één preset-kaart. */
export interface ScenarioPresetSpec {
  id: ScenarioPresetId
  label: string
  kind: ScenarioPresetKind
  /** stop-varianten: leeftijd-offset t.o.v. verwacht-FIRE (bv. +1, −2). */
  stopOffsetJaren?: number
  /** minder-uitgeven: structurele maand-uitgave-delta (negatief = minder uitgeven). */
  maandUitgaveDelta?: number
  /** extra-inleg: extra maandelijkse inleg (positief). */
  maandInlegDelta?: number
  /** downsize: forceer de verkoop-woonstrategie. */
  forceerDownsize?: boolean
}

export const SCENARIO_PRESET_SPECS: Record<ScenarioPresetId, ScenarioPresetSpec> = {
  basis: { id: 'basis', label: 'Basisplan', kind: 'basis' },
  'een-jaar-langer': {
    id: 'een-jaar-langer',
    label: 'Een jaar langer',
    kind: 'stop',
    stopOffsetJaren: SCENARIO_EEN_JAAR_LANGER_OFFSET,
  },
  'minder-uitgeven': {
    id: 'minder-uitgeven',
    label: 'Minder uitgeven',
    kind: 'input',
    maandUitgaveDelta: SCENARIO_MINDER_UITGEVEN_MAAND,
  },
  downsize: { id: 'downsize', label: 'Kleiner wonen', kind: 'input', forceerDownsize: true },
  'extra-inleg': {
    id: 'extra-inleg',
    label: 'Extra inleg',
    kind: 'input',
    maandInlegDelta: SCENARIO_EXTRA_INLEG_MAAND,
  },
  'eerder-stoppen': {
    id: 'eerder-stoppen',
    label: 'Eerder stoppen',
    kind: 'stop',
    stopOffsetJaren: SCENARIO_EERDER_STOPPEN_OFFSET,
  },
}

/** Context voor de scenario-runner — alle bouwstenen voor beide run-vormen. */
export interface ScenarioPresetContext {
  profile: ConvergentieRawProfileRow
  assets: readonly Asset[]
  debts: readonly Debt[]
  lifeEvents: readonly LifeEvent[]
  aowRows?: readonly AowLeeftijdRow[]
  /** Jaaruitgaven (reëel/koopkracht-nu) voor de bridge-implicitWithdrawalRate. */
  yearlyExpenses: number
  /** Huidige leeftijd (voor het target_age van een extra-inleg-event). */
  currentAge: number
  /** Basis/verwachte FIRE-leeftijd (fractioneel) — anker voor de stop±N-varianten; null = onbereikbaar. */
  verwachtFireAge: number | null
  /** Weergave-horizon voor de deplete-eindstrategie van de stop-varianten (runForcedStopPath clampt op ≥90). */
  fireEndAge: number
  /** Heeft de gebruiker een eigen woning? (bepaalt of de downsize-kaart mag verschijnen). */
  hasEigenHuis: boolean
  /** Is er al een downsize/verkoop-woonstrategie actief? (dan valt de downsize-kaart weg → extra-inleg). */
  downsizeStrategyActief: boolean
}

// ── Geforceerde-stop-run (gedeeld recept — één home) ─────────────────────────

/** Invoer voor `runForcedStopPath`. */
export interface ForcedStopPathInput {
  profile: ConvergentieRawProfileRow
  assets: readonly Asset[]
  debts: readonly Debt[]
  lifeEvents: readonly LifeEvent[]
  aowRows?: readonly AowLeeftijdRow[]
  yearlyExpenses: number
  /** Geforceerde stopleeftijd (fractioneel). */
  stopAge: number
  /** Eindleeftijd-horizon voor de deplete-eindstrategie; geclampt op ≥ 90. Genegeerd bij `endStrategy: 'inherit'`. */
  fireEndAge?: number
  /**
   * Welke EINDSTRATEGIE de geforceerde run draagt. Additief/optioneel — afwezig ⇒
   * `'deplete'` = het bestaande gedrag (alle bestaande callers blijven byte-identiek).
   *  - `'deplete'` — forceer `fire_end_strategy:'deplete'` + `fire_end_age:max(fireEndAge,90)`:
   *    de eerlijke "wat als je dan echt stopt en je vermogen opeet"-vorm (preset-stopkaarten).
   *  - `'inherit'` — laat de twee geforceerde profielvelden WEG, zodat het profiel z'n eigen
   *    eindstrategie (perpetual/legacy/pensioen/deplete + eigen `fire_end_age`) draagt. Nodig
   *    zodra de run als DOEL-LIJN naast de hoofdlijn wordt getekend: met een geforceerde
   *    deplete zou de stippellijn bij een perpetual-/legacy-gebruiker naar 0 duiken naast een
   *    stijgende hoofdlijn én eerder eindigen. Voor de default-gebruiker (deplete met
   *    `fire_end_age ≥ 90`) is `'inherit'` gedrags-identiek aan `'deplete'`.
   */
  endStrategy?: 'deplete' | 'inherit'
}

/** Uitkomst van een geforceerde stop-run (spiegelt het scenario-/hoofd-pad minimaal). */
export interface ForcedStopPathResult {
  result: SimResult
  unifiedRows: UnifiedProjectionRow[]
  /**
   * Verkoopmoment eigen woning ín dit stop-pad (of `null`). Meegegeven zodat consumers
   * (o.a. de Dekkingsradar-wonen-as) het verkoop-verdict uit hetzelfde scenario lezen
   * als de rijen — de hoofd-run kan een noodverkoop tonen die het stop-pad niet kent.
   */
  kernelHousingSale: KernelHousingSale | null
  /**
   * P!B96 — de €/mnd-extra-sparen-hint van DEZE stop-run (`solve.maandHint`, byte-identiek
   * aan wat `evaluateFireAt` op dezelfde invoer teruggeeft; de bridge levert hetzelfde veld
   * voor de hoofdrun als `kernelMaandHint`).
   *
   * Waarom het veld hier hoort: de solver rekent de hint al uit voor élke doorgerekende
   * stand — óók voor een geforceerde stop — maar het stop-pad gooide 'm weg. Daardoor kon
   * het scherm bij een zelfgekozen stopleeftijd wél tonen dát het niet gedekt is (radar,
   * strook) maar nooit wat daar dan bij hoort. Doorgeven i.p.v. herberekenen: geen tweede
   * bron, geen eigen som (bevinding M2).
   *
   * Teken: `−gap ÷ maanden tot de eindleeftijd`, dus **> 0 ⟺ gap < 0 ⟺ dekking onder 100%**
   * op deze stopleeftijd. `≤ 0` = gedekt (of geen maand-noemer). Nominaal — dezelfde
   * grondslag als de bestaande hoofdrun-hint, geen weergave-deflatie.
   */
  maandHint: number
}

/**
 * Het GEFORCEERDE-run-recept: forceert een FIRE-moment op `stopAge` — `evaluateFireAt`,
 * één kernel-run, geen bisectie. Dit is exact het recept van de AOW-stop-sim
 * (`horizon-client.tsx`), hier single-sourced zodat de hook-stopPad én de scenario-stop-
 * kaarten dezelfde ene motor-orkestratie delen. Een kern-fout → `null` (zichtbare
 * degradatie, geen tweede motor).
 *
 * De EINDSTRATEGIE volgt `input.endStrategy` (default `'deplete'` = ongewijzigd gedrag):
 *  - `'deplete'` — forceert `fire_end_strategy:'deplete'` + `fire_end_age:max(fireEndAge,90)`:
 *    de eerlijke "wat als je dan echt stopt en je vermogen opeet tot je eindleeftijd"-vorm
 *    (preset-stopkaarten, AOW-stop-sim).
 *  - `'inherit'` — laat beide geforceerde velden WEG; het profiel draagt z'n eigen
 *    eindstrategie én eigen `fire_end_age` (zie `ForcedStopPathInput.endStrategy`).
 */
export function runForcedStopPath(input: ForcedStopPathInput): ForcedStopPathResult | null {
  const endStrategy = input.endStrategy ?? 'deplete'
  const endAge = Math.max(input.fireEndAge ?? DEFAULT_FIRE_STRATEGY.endAge, 90)
  try {
    const basisProfiel = buildConvergentieAdapterProfile(input.profile)
    const adapterInput: KernelAdapterInput = {
      profile:
        endStrategy === 'inherit'
          ? basisProfiel
          : { ...basisProfiel, fire_end_strategy: 'deplete', fire_end_age: endAge },
      assets: input.assets,
      debts: input.debts,
      lifeEvents: input.lifeEvents,
      aowRows: input.aowRows,
    }
    const kernelInput = buildKernelInputFromApp(adapterInput)
    const solve = evaluateFireAt(kernelInput, input.stopAge)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
      input.assets,
      input.debts,
      deriveEigenHuisIds(input.assets),
    )
    const kernelUnified = kernelToUnifiedResult(solve, {
      input: kernelInput,
      yearlyExpenses: input.yearlyExpenses,
      assetSlotMeta,
      debtSlotMeta,
    })
    return {
      result: toSimResult(kernelUnified),
      unifiedRows: kernelUnified.rows,
      kernelHousingSale: kernelUnified.kernelHousingSale ?? null,
      // Doorgeven, niet herberekenen — `solve` IS de stand die de rijen hierboven voedt.
      maandHint: solve.maandHint,
    }
  } catch {
    return null
  }
}

// ── Preset-run ───────────────────────────────────────────────────────────────

/** Uitkomst van één doorgerekende preset-kaart (UI-klaar). */
export interface ScenarioPresetResult {
  id: ScenarioPresetId
  label: string
  kind: ScenarioPresetKind
  /** De stopleeftijd van deze kaart (forced stopAge óf de solved FIRE-leeftijd); null = onbereikbaar. */
  stopLeeftijd: number | null
  /** FIRE-leeftijd van de doorgerekende run (fractioneel); null = onbereikbaar/kern-fout. */
  fireAgeFractional: number | null
  /** Laagste belegbare buffer over de run (computeLaagsteBuffer); null = geen rijen/kern-fout. */
  laagsteBuffer: LaagsteBuffer | null
  /** Toegepaste maand-delta in € (−300 minder uitgeven, +250 extra inleg); null waar n.v.t. */
  maandruimteOfDelta: number | null
  /** UI-status t.o.v. de basis. */
  status: ScenarioPresetStatus
}

/**
 * Selecteert de vijf van toepassing zijnde presets in kaart-volgorde. Slot 4 is de wissel:
 * `downsize` wanneer de gebruiker een eigen huis heeft én er nog géén verkoop-woonstrategie
 * actief is; anders `extra-inleg`.
 */
export function resolveScenarioPresets(ctx: ScenarioPresetContext): ScenarioPresetSpec[] {
  const slot4: ScenarioPresetSpec =
    ctx.hasEigenHuis && !ctx.downsizeStrategyActief
      ? SCENARIO_PRESET_SPECS.downsize
      : SCENARIO_PRESET_SPECS['extra-inleg']
  return [
    SCENARIO_PRESET_SPECS.basis,
    SCENARIO_PRESET_SPECS['een-jaar-langer'],
    SCENARIO_PRESET_SPECS['minder-uitgeven'],
    slot4,
    SCENARIO_PRESET_SPECS['eerder-stoppen'],
  ]
}

/** Verschuift de uitgave-velden van een profiel met een maand-delta (geclampt ≥ 0). */
function shiftProfileExpenses(
  profile: ConvergentieRawProfileRow,
  monthlyDelta: number,
): ConvergentieRawProfileRow {
  const yearlyDelta = monthlyDelta * 12
  return {
    ...profile,
    estimated_monthly_expenses:
      profile.estimated_monthly_expenses == null
        ? profile.estimated_monthly_expenses
        : Math.max(0, profile.estimated_monthly_expenses + monthlyDelta),
    yearly_essential_expenses:
      profile.yearly_essential_expenses == null
        ? profile.yearly_essential_expenses
        : Math.max(0, profile.yearly_essential_expenses + yearlyDelta),
  }
}

/** Bouwt een extra-inleg-LifeEvent (recurring +€/mnd inkomen vanaf de huidige leeftijd). */
function buildExtraInlegEvent(monthly: number, currentAge: number): LifeEvent {
  return {
    id: 'scenario-preset:extra-inleg',
    name: 'Extra inleg',
    event_type: 'extra_inleg',
    target_age: Math.round(currentAge),
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: Math.round(monthly),
    duration_months: 0,
    icon: 'Rocket',
    is_active: true,
    sort_order: 999,
    is_indexed: false,
    metadata: { source: 'scenario-preset' },
  }
}

/** Draait de convergentie-projectie voor een input-variant en mapt naar de compacte uitkomst. */
function runInputVariant(
  profile: ConvergentieRawProfileRow,
  lifeEvents: readonly LifeEvent[],
  yearlyExpenses: number,
  ctx: ScenarioPresetContext,
): { fireAgeFractional: number | null; unifiedRows: UnifiedProjectionRow[] } | null {
  const outcome = computeConvergentieProjection({
    rawContext: {
      profile,
      assets: ctx.assets,
      debts: ctx.debts,
      lifeEvents,
      aowRows: ctx.aowRows,
      yearlyExpenses,
    },
  })
  if (!outcome.ok) return null
  return { fireAgeFractional: outcome.result.fireAgeFractional, unifiedRows: outcome.result.rows }
}

/** Leidt de UI-status af t.o.v. de basisbuffer (of intrinsiek zonder basis). */
function deriveScenarioStatus(
  id: ScenarioPresetId,
  buffer: LaagsteBuffer | null,
  basisBuffer: LaagsteBuffer | null | undefined,
): ScenarioPresetStatus {
  if (id === 'basis') return 'basis'
  if (buffer === null || buffer.bedrag < 0) return 'rood'
  if (basisBuffer != null) {
    const beter = buffer.bedrag - basisBuffer.bedrag
    const drempel = Math.max(
      SCENARIO_BUFFER_BETER_MARGE_ABS,
      Math.abs(basisBuffer.bedrag) * SCENARIO_BUFFER_BETER_MARGE_PCT,
    )
    if (beter >= drempel) return 'groen'
  }
  return 'amber'
}

/**
 * Draait één preset-kaart. `opts.basisBuffer` (van de basiskaart) laat de status-afleiding
 * "duidelijk beter dan basis → groen" toe; zonder basisBuffer is de status intrinsiek
 * (rood bij negatieve/ontbrekende buffer, anders amber; basiskaart altijd 'basis').
 */
export function runScenarioPreset(
  spec: ScenarioPresetSpec,
  ctx: ScenarioPresetContext,
  opts?: { basisBuffer?: LaagsteBuffer | null },
): ScenarioPresetResult {
  const base = (
    stopLeeftijd: number | null,
    fireAgeFractional: number | null,
    laagsteBuffer: LaagsteBuffer | null,
    maandruimteOfDelta: number | null,
  ): ScenarioPresetResult => ({
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    stopLeeftijd,
    fireAgeFractional,
    laagsteBuffer,
    maandruimteOfDelta,
    status: deriveScenarioStatus(spec.id, laagsteBuffer, opts?.basisBuffer),
  })

  if (spec.kind === 'stop') {
    if (ctx.verwachtFireAge === null) {
      // Geen anker → geen stop-run mogelijk (zichtbare degradatie).
      return base(null, null, null, null)
    }
    const stopAge = ctx.verwachtFireAge + (spec.stopOffsetJaren ?? 0)
    const run = runForcedStopPath({
      profile: ctx.profile,
      assets: ctx.assets,
      debts: ctx.debts,
      lifeEvents: ctx.lifeEvents,
      aowRows: ctx.aowRows,
      yearlyExpenses: ctx.yearlyExpenses,
      stopAge,
      fireEndAge: ctx.fireEndAge,
    })
    if (run === null) return base(stopAge, null, null, null)
    return base(stopAge, run.result.fireAgeFractional, computeLaagsteBuffer(run.unifiedRows), null)
  }

  if (spec.kind === 'input') {
    let profile = ctx.profile
    let lifeEvents = ctx.lifeEvents
    let yearlyExpenses = ctx.yearlyExpenses
    let maandDelta: number | null = null

    if (spec.forceerDownsize) {
      profile = { ...ctx.profile, housing_strategy_config: DEFAULT_DOWNSIZE_CONFIG }
    } else if (spec.maandUitgaveDelta != null) {
      profile = shiftProfileExpenses(ctx.profile, spec.maandUitgaveDelta)
      yearlyExpenses = Math.max(0, ctx.yearlyExpenses + spec.maandUitgaveDelta * 12)
      maandDelta = spec.maandUitgaveDelta
    } else if (spec.maandInlegDelta != null) {
      lifeEvents = [...ctx.lifeEvents, buildExtraInlegEvent(spec.maandInlegDelta, ctx.currentAge)]
      maandDelta = spec.maandInlegDelta
    }

    const run = runInputVariant(profile, lifeEvents, yearlyExpenses, ctx)
    if (run === null) return base(null, null, null, maandDelta)
    return base(run.fireAgeFractional, run.fireAgeFractional, computeLaagsteBuffer(run.unifiedRows), maandDelta)
  }

  // kind === 'basis' — de basislijn (solve).
  const run = runInputVariant(ctx.profile, ctx.lifeEvents, ctx.yearlyExpenses, ctx)
  if (run === null) return base(null, null, null, null)
  return base(run.fireAgeFractional, run.fireAgeFractional, computeLaagsteBuffer(run.unifiedRows), null)
}

/**
 * Draait alle vijf de van toepassing zijnde presets. De basiskaart wordt eerst gedraaid;
 * haar laagste buffer voedt de "duidelijk beter → groen"-status-afleiding van de overige
 * kaarten. Elke kaart is één kernel-run — de UI draait dit lazy/deferred.
 */
export function runScenarioPresets(ctx: ScenarioPresetContext): ScenarioPresetResult[] {
  const specs = resolveScenarioPresets(ctx)
  const basis = runScenarioPreset(SCENARIO_PRESET_SPECS.basis, ctx)
  const basisBuffer = basis.laagsteBuffer
  return specs.map((spec) =>
    spec.id === 'basis' ? basis : runScenarioPreset(spec, ctx, { basisBuffer }),
  )
}
