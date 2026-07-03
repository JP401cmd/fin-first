/**
 * runRegelProjection — gedeelde engine-aanroep voor de live-sim-bewerkschermen
 * (Eindstrategie & Onttrekkingsstrategie) op /toekomst → Voorkeuren.
 *
 * (FASE 6 stap 5A — kernel-only.) De baseline-curve in de editor moet IDENTIEK zijn aan de
 * Tijdas-grafiek. Beide draaien via `computeConvergentieProjection` (de horizon-kernel). De
 * server bouwt de `RegelSimSnapshot` (rauwe kernel-context + de huidige strategie-configs) en
 * geeft die als prop door; deze functie draait client-side (de router is puur). De
 * draft-strategie wordt op de profiel-velden van de rauwe context geplakt
 * (`applyDraftToRawContext`) — de kernel resolvet pensioen/AOW ZÉLF.
 */

import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import type { SimRow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

/**
 * Serialiseerbare momentopname van alle simulatie-inputs voor de Voorkeuren-editors.
 * Wordt server-side gebouwd in dashboard-data-loader en als prop doorgegeven.
 */
export interface RegelSimSnapshot {
  /**
   * Rauwe kernel-context (profiel-rij + bezittingen/schulden/gebeurtenissen), gebouwd
   * server-side in `dashboard-data-loader` — DEZELFDE die de Tijdas-grafiek voedt. De
   * draft-strategie wordt hier bovenop de profiel-velden geplakt (zie `runRegelProjection`),
   * zodat de kernel de kandidaat-config leest zoals de gebruiker 'm zou opslaan.
   */
  rawContext: ConvergentieRawContext
  /** Rauwe eindstrategie (huidige config — voor de editor-weergave). */
  fireStrategy: FireStrategyConfig
  /** Huidige onttrekkingsstrategie (voor de editor-weergave). */
  withdrawalStrategy: WithdrawalStrategyConfig
  /** AOW-leeftijd afgerond omhoog (weergave). */
  aowAgeInt: number
  /** Fractionele AOW-leeftijd (weergave). */
  aowFractional: number
}

export interface RegelProjection {
  rows: SimRow[]
  fireAgeFractional: number | null
}

/**
 * Draai de projectie voor een gegeven (eventueel overschreven) strategie-config via de
 * horizon-kernel. Bij een kern-fout: lege rijen.
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
  const outcome = computeConvergentieProjection({
    rawContext: applyDraftToRawContext(snapshot.rawContext, override),
  })
  if (!outcome.ok) return { rows: [], fireAgeFractional: null }
  const res = toSimResult(outcome.result)
  return { rows: res.rows, fireAgeFractional: res.fireAgeFractional }
}

/**
 * Plak de draft-strategie op de profiel-velden van de rauwe kernel-context zodat de kernel
 * de kandidaat-config leest zoals de gebruiker 'm zou opslaan. ZONDER override (baseline)
 * blijft de context ONgewijzigd — dan is de kernel-run identiek aan de Tijdas-grafiek (die
 * dezelfde rauwe context gebruikt), geen default-drift. De withdrawal-guardrails en de
 * eindstrategie-velden spiegelen exact de kolommen die `buildConvergentieAdapterProfile` leest.
 */
function applyDraftToRawContext(
  base: ConvergentieRawContext,
  override?: {
    fireStrategy?: FireStrategyConfig
    withdrawalStrategy?: WithdrawalStrategyConfig
  },
): ConvergentieRawContext {
  if (!override?.fireStrategy && !override?.withdrawalStrategy) return base
  const profile = { ...base.profile }
  if (override.fireStrategy) {
    profile.fire_end_strategy = override.fireStrategy.strategy
    profile.fire_end_age = override.fireStrategy.endAge
    profile.fire_legacy_amount = override.fireStrategy.legacyAmount
  }
  if (override.withdrawalStrategy) {
    profile.withdrawal_strategy = override.withdrawalStrategy.strategy
    profile.guardrail_floor = override.withdrawalStrategy.guardrailFloor
    profile.guardrail_ceiling = override.withdrawalStrategy.guardrailCeiling
    profile.guardrail_cut_step = override.withdrawalStrategy.guardrailCutStep
    profile.guardrail_raise_step = override.withdrawalStrategy.guardrailRaiseStep
  }
  return { ...base, profile }
}
