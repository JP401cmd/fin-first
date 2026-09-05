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
import type { PlanDraft } from '@/lib/horizon/plan-draft'
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
 * Draft-override voor `runRegelProjection`. Naast de eind-/onttrekkingsstrategie kan een
 * volledige `withdrawal_profile_config`-draft (JSONB) meegegeven worden — zo reflecteert
 * de live-sim óók het onttrekkingsprofiel (V4) én de roadmap-M flex-spending-config
 * (`flex_nice_only`/`flex_nice_fractie`/`flex_cut_step`), die de kernel-adapter uit die
 * kolom leest. `null` wist de kolom (→ adapter-defaults).
 */
export interface RegelSimOverride {
  fireStrategy?: FireStrategyConfig
  /**
   * ADR 0129 F3b — het volledige plan-concept (anker + eind-vorm) uit de twee vragen.
   * Wint van `fireStrategy` wanneer beide meegegeven zijn: de eind-vorm gaat in
   * `fire_end_strategy`, het anker in `fire_stop_anchor`/`fire_stop_age` — exact de
   * kolommen die `buildConvergentieAdapterProfile` leest, zodat de live-sim onder een
   * gekozen stopleeftijd hetzelfde rekent als de kernel na de save.
   */
  firePlan?: PlanDraft
  withdrawalStrategy?: WithdrawalStrategyConfig
  withdrawalProfileConfig?: Record<string, unknown> | null
}

/**
 * Draai de projectie voor een gegeven (eventueel overschreven) strategie-config via de
 * horizon-kernel. Bij een kern-fout: lege rijen.
 *
 * @param override - kandidaat-config (NIET de props muteren — altijd een kopie meegeven).
 */
export function runRegelProjection(
  snapshot: RegelSimSnapshot,
  override?: RegelSimOverride,
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
  override?: RegelSimOverride,
): ConvergentieRawContext {
  if (
    !override?.fireStrategy &&
    !override?.firePlan &&
    !override?.withdrawalStrategy &&
    override?.withdrawalProfileConfig === undefined
  ) {
    return base
  }
  const profile = { ...base.profile }
  if (override.firePlan) {
    const p = override.firePlan
    profile.fire_end_strategy = p.endForm
    profile.fire_end_age = p.endAge
    profile.fire_legacy_amount = p.endForm === 'legacy' ? p.legacyAmount : 0
    profile.fire_stop_anchor = p.anchor
    profile.fire_stop_age = p.anchor === 'age' ? p.stopAge : null
  } else if (override.fireStrategy) {
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
  // Roadmap M / V4 — volledige withdrawal_profile_config-draft (profiel + curve + flex).
  // `undefined` = niet meegegeven (kolom ongewijzigd); `null` = expliciet wissen.
  if (override.withdrawalProfileConfig !== undefined) {
    profile.withdrawal_profile_config = override.withdrawalProfileConfig
  }
  return { ...base, profile }
}
