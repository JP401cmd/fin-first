/**
 * SWR (Safe Withdrawal Rate) resolution — single source of truth.
 *
 * Drie SWR-varianten bestaan in de codebase:
 *
 * 1. CLASSIC_SWR (0.04 / 4%) — Traditionele Trinity Study regel.
 *    Alleen gebruiken voor vergelijking/referentie (bijv. "25× regel").
 *    Export: horizon-data.ts → CLASSIC_SWR
 *
 * 2. NL_SWR (≈0.02883 / 2.88%) — Nederlandse standaard na Box 3 + inflatie.
 *    Formule: DEFAULT_RETURN − BOX3_DRAG − INFLATION = 0.07 − 0.02117 − 0.02.
 *    Gebruiken als fallback wanneer geen gebruikersprofiel beschikbaar is.
 *    Export: horizon-data.ts → NL_SWR
 *
 * 3. effectiveSwr (dynamisch) — Gepersonaliseerd per gebruiker.
 *    Berekend door resolveFireParams() op basis van profiel-instellingen
 *    (expected_return, inflation_rate). Valt terug op NL_SWR bij lege input.
 *    Altijd gebruiken wanneer profiel beschikbaar is.
 */
import { DEFAULT_RETURN, INFLATION, BOX3_DRAG } from '@/lib/horizon-data'

export interface FireParams {
  grossReturn: number    // bijv. 0.07
  inflationRate: number  // bijv. 0.02
  effectiveSwr: number   // grossReturn - BOX3_DRAG - inflationRate
}

/**
 * Resolve FIRE parameters from user profile.
 * Returns effectiveSwr (NL Box 3-corrected) based on user settings,
 * falling back to defaults (≈NL_SWR) when no profile data is available.
 */
export function resolveFireParams(profile: {
  expected_return?: number | null
  inflation_rate?: number | null
}): FireParams {
  const grossReturn = profile.expected_return ?? DEFAULT_RETURN
  const inflationRate = profile.inflation_rate ?? INFLATION
  const effectiveSwr = Math.max(0.001, grossReturn - BOX3_DRAG - inflationRate)
  return { grossReturn, inflationRate, effectiveSwr }
}
