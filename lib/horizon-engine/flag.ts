/**
 * Horizon grootboek-engine — feature-flag.
 *
 * **Cutover C3 (13 jun 2026, ADR 0013/0016): v2 is nu de productie-DEFAULT.**
 * `profiles.feature_preferences.horizon_engine_v2 === false` zet 'm expliciet UIT
 * (omkeerbaar opt-out); afwezig of `true` = v2. De flip is bewust één boolean — de
 * legacy-engine (`runUnifiedProjection`/`runSimulation`) blijft voorlopig bestaan
 * voor niet-FIRE-gebruik (fee-analyse, hypotheek-vs-beleggen, household, what-if);
 * verwijderen (C5) is een aparte migratie. Terugdraaien = deze default omzetten.
 */

export const HORIZON_V2_FLAG = 'horizon_engine_v2' as const

export function isHorizonV2Enabled(
  profile: { feature_preferences?: Record<string, unknown> | null } | null | undefined,
): boolean {
  const fp = profile?.feature_preferences
  // Default AAN; alleen een expliciete `false` schakelt v2 uit.
  return !fp || fp[HORIZON_V2_FLAG] !== false
}
