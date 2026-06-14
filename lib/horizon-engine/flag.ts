/**
 * Horizon grootboek-engine — feature-flag.
 *
 * **Cutover C5-a (14 jun 2026, ADR 0013/0016): v2 is GEFORCEERD in productie.**
 * De per-gebruiker opt-out (`profiles.feature_preferences.horizon_engine_v2`) is
 * vervallen — `isHorizonV2Enabled` retourneert nu ALTIJD `true`. De toggle-UI en de
 * `GET/PUT /api/horizon-engine`-persistentie zijn verwijderd; het profielveld wordt
 * niet meer gelezen.
 *
 * De functie-signatuur en `HORIZON_V2_FLAG` blijven bewust bestaan: veel callers
 * roepen `isHorizonV2Enabled(profile)` nog aan (productie-FIRE-paden). Sinds de
 * volledige verwijdering (C5-c, Optie B) is er GEEN v1-engine meer:
 * `runUnifiedProjection`/`runSimulation` zijn fysiek verwijderd en de
 * parity/compare-tooling (`compareEngines`, de ledger-API) is mee weggehaald.
 * `runSelectedProjection` is v2-only en negeert zijn `useV2`-parameter; de flag
 * is daarmee functioneel een no-op die altijd `true` teruggeeft.
 */

export const HORIZON_V2_FLAG = 'horizon_engine_v2' as const

export function isHorizonV2Enabled(
  _profile: { feature_preferences?: Record<string, unknown> | null } | null | undefined,
): boolean {
  // v2 is geforceerd in productie (C5-a). De opt-out heeft geen effect meer.
  return true
}
