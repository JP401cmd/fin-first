/**
 * runRegelProjection — gedeelde, correcte engine-aanroep voor de live-sim-
 * bewerkschermen (Eindstrategie & Onttrekkingsstrategie) op /toekomst → Voorkeuren.
 *
 * Cruciaal: de baseline-curve in de editor moet IDENTIEK zijn aan de Tijdas-grafiek.
 * De pagina rekent met `runUnifiedProjection` (zie dashboard-data-loader.ts:586-663),
 * inclusief pensioen-`forcedFireAge` (AOW-leeftijd) en endAge-bump. Deze helper
 * repliceert die logica één-op-één, zodat baseline (huidige config) én draft
 * (kandidaat-config) consistent rekenen.
 *
 * De server bouwt de `RegelSimSnapshot` (de al-samengestelde UnifiedProjectionInput
 * + AOW-data) en geeft die als prop door; deze functie draait client-side
 * (`runUnifiedProjection` is puur).
 */

import {
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import type { HorizonStrategyOptions } from '@/lib/horizon-engine/strategies'
import type { SimRow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

/**
 * Serialiseerbare momentopname van alle simulatie-inputs voor de Voorkeuren-editors.
 * Wordt server-side gebouwd in dashboard-data-loader en als prop doorgegeven.
 */
export interface RegelSimSnapshot {
  /** De volledig samengestelde unified-projection input (zoals de Tijdas-grafiek gebruikt). */
  unifiedInput: UnifiedProjectionInput
  /** Rauwe eindstrategie (vóór de pensioen-endAge-bump) — basis voor baseline + draft. */
  fireStrategy: FireStrategyConfig
  /** Huidige onttrekkingsstrategie. */
  withdrawalStrategy: WithdrawalStrategyConfig
  /** AOW-leeftijd afgerond omhoog (forcedFireAge in pensioen-modus). */
  aowAgeInt: number
  /** Fractionele AOW-leeftijd (FIRE-leeftijd in pensioen-modus). */
  aowFractional: number
  /**
   * Cutover (C4, ADR 0016): of de gebruiker de v2-grootboek-engine draait
   * (`isHorizonV2Enabled`). De editor-baseline MOET door dezelfde engine als de
   * Tijdas-grafiek lopen, anders wijkt de baseline-curve af voor v2-gebruikers.
   * Default false = byte-identiek aan v1 (oude gedrag).
   */
  useV2?: boolean
  /**
   * Uit de pot-regels afgeleide engine-opties (verdeling/onttrekkingsvolgorde).
   * Alleen relevant voor v2; undefined = engine-defaults. Wordt door
   * `buildHorizonInput` afgeleid — dezelfde set die de grafiek voedt.
   */
  strategyOptions?: Partial<HorizonStrategyOptions>
}

export interface RegelProjection {
  rows: SimRow[]
  fireAgeFractional: number | null
}

/**
 * Draai de projectie voor een gegeven (eventueel overschreven) strategie-config.
 *
 * Mirror van dashboard-data-loader.ts:586-663:
 *  - pensioen → forcedFireAge = aowAgeInt, endAge = max(endAge, aowAgeInt+1),
 *    FIRE-leeftijd = aowFractional (i.p.v. binary-search-resultaat).
 *  - anders → strategie/endAge ongewijzigd, FIRE-leeftijd uit de engine.
 *
 * @param override - kandidaat-config (NIET de props muteren — altijd een kopie meegeven).
 */
export function runRegelProjection(
  snapshot: RegelSimSnapshot,
  override?: {
    fireStrategy?: FireStrategyConfig
    withdrawalStrategy?: WithdrawalStrategyConfig
  },
): RegelProjection {
  const fs = override?.fireStrategy ?? snapshot.fireStrategy
  const ws = override?.withdrawalStrategy ?? snapshot.withdrawalStrategy

  const isPensioen = fs.strategy === 'pensioen'
  const forcedFireAge = isPensioen ? snapshot.aowAgeInt : undefined
  const effEndAge = isPensioen
    ? Math.max(fs.endAge, snapshot.aowAgeInt + 1)
    : fs.endAge

  const input: UnifiedProjectionInput = {
    ...snapshot.unifiedInput,
    strategyConfig: { ...fs, endAge: effEndAge },
    endAge: effEndAge,
    withdrawalStrategy: ws,
    forcedFireAge,
  }

  // Flag-bewuste engine-selectie (C4): v2-gebruikers krijgen de grootboek-engine
  // zodat de editor-baseline IDENTIEK is aan de Tijdas-grafiek. Flag uit = v1.
  const res = toSimResult(runSelectedProjection(input, snapshot.useV2 ?? false, snapshot.strategyOptions))
  const fireAgeFractional = isPensioen ? snapshot.aowFractional : res.fireAgeFractional

  return { rows: res.rows, fireAgeFractional }
}
