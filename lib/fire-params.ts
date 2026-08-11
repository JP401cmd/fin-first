/**
 * SWR (Safe Withdrawal Rate) resolution — single source of truth.
 *
 * Drie SWR-varianten bestaan in de codebase:
 *
 * 1. CLASSIC_SWR (0.04 / 4%) — Traditionele Trinity Study regel.
 *    Alleen gebruiken voor vergelijking/referentie (bijv. "25× regel").
 *    Export: horizon-data.ts → CLASSIC_SWR
 *
 * 2. NL_SWR (jaargebonden, 2026 ≈ 0.0284 / 2.84%) — Nederlandse standaard na
 *    Box 3 + inflatie. Formule: DEFAULT_RETURN − BOX3_DRAG − NL_INFLATIE, waarbij
 *    BOX3_DRAG is afgeleid uit BOX3_PARAMS[CURRENT_TAX_YEAR] (2026: 6,00% × 36%).
 *    Beweegt dus automatisch mee met het belastingjaar. Gebruiken als fallback
 *    wanneer geen gebruikersprofiel beschikbaar is. Export: lib/constants.ts →
 *    NL_SWR (ook via horizon-data.ts).
 *
 * 3. effectiveSwr (dynamisch) — Gepersonaliseerd per gebruiker.
 *    Berekend door resolveFireParams() op basis van profiel-instellingen
 *    (expected_return, inflation_rate). Valt terug op NL_SWR bij lege input.
 *    Altijd gebruiken wanneer profiel beschikbaar is.
 */
import { DEFAULT_RETURN, INFLATION, BOX3_DRAG } from '@/lib/constants'
import { deriveMarginaalTarief, schijfGrensVoor } from './box1-tax'
import { resolveFireAssumptions, type FireAssumptionRow } from './fire-assumptions'
import type { Box3Method } from './bucket-projection'

/**
 * Grens Box 1 topschijf-tarief (bruto jaarinkomen) — afgeleid uit BOX1_PARAMS
 * voor het lopende belastingjaar. Vervangt de vroegere 2024-hardcode (€75.518);
 * beweegt nu automatisch mee met de jaarlijks vernieuwde beheer-parameters.
 */
export const IB_SCHIJFGRENS = schijfGrensVoor()

export interface FireParams {
  grossReturn: number    // bijv. 0.07
  inflationRate: number  // bijv. 0.02
  effectiveSwr: number   // grossReturn - BOX3_DRAG - inflationRate
  box3Method: Box3Method // 'forfaitair' | 'werkelijk'
  marginaalTarief: number // schijf-1- of topschijf-tarief (jaar-afgeleid via BOX1_PARAMS)
}

/**
 * Effectieve Nederlandse SWR uit bruto rendement en inflatie.
 *
 * Eén formule, één home: `grossReturn − BOX3_DRAG − inflationRate`, met een
 * vloer van 0.001 zodat een (zeldzaam) hoog-inflatie/laag-rendement-scenario
 * nooit een negatieve onttrekkingsvoet oplevert. Zowel `resolveFireParams` als
 * UI-oppervlakken (bv. de SWR-monitor-widget) MOETEN deze helper gebruiken i.p.v.
 * de formule te dupliceren.
 */
export function computeEffectiveSwr(grossReturn: number, inflationRate: number): number {
  return Math.max(0.001, grossReturn - BOX3_DRAG - inflationRate)
}

/**
 * Resolve FIRE parameters from user profile.
 * Returns effectiveSwr (NL Box 3-corrected) based on user settings,
 * falling back to defaults (≈NL_SWR) when no profile data is available.
 *
 * NB: leeftijd-getapered smart-default voor expected_return is OPZETTELIJK
 * NIET geïmplementeerd. TriFinity gebruikt werkelijke insluiting van FIRE-
 * projectie op de horizon-pagina; rendement is profiel-instelling, geen
 * leeftijd-formule.
 */
export function resolveFireParams(profile: FireProfileInput): FireParams {
  const grossReturn = profile.expected_return ?? DEFAULT_RETURN
  const inflationRate = profile.inflation_rate ?? INFLATION
  const effectiveSwr = computeEffectiveSwr(grossReturn, inflationRate)
  const box3Method: Box3Method = (profile.box3_method === 'werkelijk') ? 'werkelijk' : 'forfaitair'
  const marginaalTarief = profile.marginaal_tarief ?? deriveMarginaalTarief({ netMonthlyIncome: profile.net_monthly_income })
  return { grossReturn, inflationRate, effectiveSwr, box3Method, marginaalTarief }
}

/** De profielvelden die de FIRE-parameters bepalen. */
export interface FireProfileInput {
  expected_return?: number | null
  inflation_rate?: number | null
  box3_method?: string | null
  marginaal_tarief?: number | null
  net_monthly_income?: number | null
}

/**
 * Profielrij + jaargelaagde markt-aannames → FireParams, in één aanroep.
 *
 * Dit is de VOLLEDIGE grondslag-keten die elk FIRE-tonend oppervlak moet
 * gebruiken, in deze precedentievolgorde:
 *
 *   1. de expliciete gebruikerskeuze (`profiles.expected_return` /
 *      `profiles.inflation_rate`) — die wint altijd;
 *   2. de jaargelaagde markt-default uit `fire_assumptions` (beheer op
 *      /beheer/fiscale-kerngetallen) — alleen waar de gebruiker NIETS zette;
 *   3. de TS-constanten `DEFAULT_RETURN`/`INFLATION` (lib/constants.ts) —
 *      terugval van `resolveFireAssumptions` bij een ontbrekende jaarrij.
 *
 * De shadow gebeurt op een KOPIE: de profielrij zelf blijft ongemoeid, want
 * elders wordt `null` gelezen als "niet ingesteld" (coach-datagap).
 *
 * Waarom hier en niet per loader: laat een oppervlak stap 2 weg, dan rekent het
 * met een ándere onttrekkingsvoet dan de rest van de app zodra beheer een
 * jaarlaag zet — precies de grondslagdrift die dit veld moet uitsluiten. De
 * aanroeper queryt (`fire_assumptions`), deze resolver consumeert — hetzelfde
 * scheidingsprincipe als `lookupAowAge`/`resolveFireAssumptions`.
 */
export function resolveFireParamsWithAssumptions(
  profile: FireProfileInput | null | undefined,
  assumptionRows: readonly FireAssumptionRow[] | null | undefined,
  year?: number,
): FireParams {
  const assumptions = resolveFireAssumptions(assumptionRows, year)
  const shadowed: FireProfileInput = { ...(profile ?? {}) }
  if (shadowed.expected_return == null) shadowed.expected_return = assumptions.expectedReturn
  if (shadowed.inflation_rate == null) shadowed.inflation_rate = assumptions.inflation
  return resolveFireParams(shadowed)
}
