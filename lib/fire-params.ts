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
import { DEFAULT_RETURN, INFLATION, BOX3_DRAG, ageAtDate } from '@/lib/horizon-data'
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
 * Smart default voor verwacht rendement op basis van leeftijd. Tier-1 #2:
 * users hoeven dit niet in te vullen — we tape-en gemiddeld rendement
 * geleidelijk naar beneden naarmate de horizon korter wordt:
 *  - <30j  → 7,0% (lange horizon, kan volatiliteit absorberen)
 *  - 30-50 → 6,5% (mid-horizon)
 *  - 50-60 → 5,5% (defensiever, minder herstel-tijd)
 *  - 60+   → 5,0% (kapitaal-behoud belangrijker dan groei)
 * Zonder DOB valt het terug op DEFAULT_RETURN (0,07).
 */
function smartDefaultReturn(dob?: string | null): number {
  if (!dob) return DEFAULT_RETURN
  const age = ageAtDate(dob)
  if (age < 30) return 0.07
  if (age < 50) return 0.065
  if (age < 60) return 0.055
  return 0.05
}

/**
 * Leid marginaal IB-tarief af uit netto maandinkomen als er geen
 * expliciete keuze is opgeslagen. Vuistregel: netto > €4 200/mnd ≈
 * bruto > €75 518 → hoogste schijf.
 */
function deriveMarginaalTarief(netMonthlyIncome?: number | null): number {
  if (netMonthlyIncome != null && netMonthlyIncome > 4200) return 0.4950
  return 0.3697
}

/**
 * Resolve FIRE parameters from user profile.
 * Returns effectiveSwr (NL Box 3-corrected) based on user settings,
 * falling back to smart defaults (age-tapered) when no profile data
 * is available. Tier-1 #2: smart-defaults beschermen bestaande hand-
 * ingevulde waarden door alleen actief te zijn bij `null`-velden.
 */
export function resolveFireParams(profile: {
  expected_return?: number | null
  inflation_rate?: number | null
  box3_method?: string | null
  marginaal_tarief?: number | null
  net_monthly_income?: number | null
  date_of_birth?: string | null
}): FireParams {
  // Smart default voor return: leeftijd-getapered ipv vaste 7%. Alleen
  // wanneer profile.expected_return null is (hand-ingevulde waardes
  // blijven onaangetast).
  const grossReturn = profile.expected_return ?? smartDefaultReturn(profile.date_of_birth)
  const inflationRate = profile.inflation_rate ?? INFLATION
  const effectiveSwr = Math.max(0.001, grossReturn - BOX3_DRAG - inflationRate)
  const box3Method: Box3Method = (profile.box3_method === 'werkelijk') ? 'werkelijk' : 'forfaitair'
  const marginaalTarief = profile.marginaal_tarief ?? deriveMarginaalTarief(profile.net_monthly_income)
  return { grossReturn, inflationRate, effectiveSwr, box3Method, marginaalTarief }
}
