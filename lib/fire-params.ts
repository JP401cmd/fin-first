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
import type { Box3Method } from './bucket-projection'

/** Grens Box 1 IB-tarief 2025 (bruto jaarinkomen) */
export const IB_SCHIJFGRENS = 75_518

export interface FireParams {
  grossReturn: number    // bijv. 0.07
  inflationRate: number  // bijv. 0.02
  effectiveSwr: number   // grossReturn - BOX3_DRAG - inflationRate
  box3Method: Box3Method // 'forfaitair' | 'werkelijk'
  marginaalTarief: number // 0.3697 of 0.4950
}

/**
 * Resolve FIRE parameters from user profile.
 * Returns effectiveSwr (NL Box 3-corrected) based on user settings,
 * falling back to defaults (≈NL_SWR) when no profile data is available.
 */
/**
 * Leid marginaal IB-tarief af uit netto maandinkomen als er geen
 * expliciete keuze is opgeslagen. Vuistregel: netto > €4 200/mnd ≈
 * bruto > €75 518 → hoogste schijf.
 */
function deriveMarginaalTarief(netMonthlyIncome?: number | null): number {
  if (netMonthlyIncome != null && netMonthlyIncome > 4200) return 0.4950
  return 0.3697
}

export function resolveFireParams(profile: {
  expected_return?: number | null
  inflation_rate?: number | null
  box3_method?: string | null
  marginaal_tarief?: number | null
  net_monthly_income?: number | null
}): FireParams {
  const grossReturn = profile.expected_return ?? DEFAULT_RETURN
  const inflationRate = profile.inflation_rate ?? INFLATION
  const effectiveSwr = Math.max(0.001, grossReturn - BOX3_DRAG - inflationRate)
  const box3Method: Box3Method = (profile.box3_method === 'werkelijk') ? 'werkelijk' : 'forfaitair'
  const marginaalTarief = profile.marginaal_tarief ?? deriveMarginaalTarief(profile.net_monthly_income)
  return { grossReturn, inflationRate, effectiveSwr, box3Method, marginaalTarief }
}
