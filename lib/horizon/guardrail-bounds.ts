/**
 * Guardrail-kompas — vier maandelijkse bestedingsniveaus rond het geplande
 * uitgavendoel, afgeleid uit de BESTAANDE Guyton-Klinger guardrail-config
 * (lib/withdrawal-strategy.ts). PURE afleiding — geen eigen ratio's, geen
 * herberekening van de onttrekking zelf (die blijft bij applyWithdrawalStrategy).
 */

import {
  resolveWithdrawalStrategy,
  type WithdrawalStrategyConfig,
} from '@/lib/withdrawal-strategy'

/** De vier kompas-niveaus + de huidige ("jij"-)positie, in hele euro's per maand. */
export interface GuardrailBounds {
  /** Onder de veilige ondergrens — de harde guardrail-floor-clamp. */
  teWeinig: number
  /** Houdbaar niveau ná één kapitaalbehoud-verlaging (capital preservation cut). */
  veilig: number
  /** Het geplande bestedingsdoel zelf (= plannedMonthlySpend, ongewijzigd). */
  gepland: number
  /** Niveau ná één prosperity-verhoging (portfolio doet het goed). */
  meevaller: number
  /** De "jij"-positie — huidige besteding, gelijk aan plannedMonthlySpend (geen afronding). */
  you: number
}

/**
 * Vertaalt `plannedMonthlySpend` naar de vier guardrail-kompasniveaus, met de
 * mapping 1:1 gespiegeld aan `applyGuardrails` (lib/withdrawal-strategy.ts):
 *
 * - `gepland`   = plannedMonthlySpend zelf (geen herberekening — de aanroeper
 *   levert het basis-bestedingsdoel al aan).
 * - `meevaller` = plannedMonthlySpend × (1 + guardrailRaiseStep). Spiegelt de
 *   prosperity-regel in applyGuardrails: `withdrawal *= (1 + config.guardrailRaiseStep)`
 *   zodra de portfolio boven `guardrailCeiling × startPortfolio` uitkomt — dit
 *   is het niveau ná precies zo'n verhoging.
 * - `veilig`    = plannedMonthlySpend × (1 − guardrailCutStep). Spiegelt de
 *   kapitaalbehoud-regel: `withdrawal *= (1 − config.guardrailCutStep)` zodra de
 *   portfolio onder `guardrailFloor × startPortfolio` zakt — het niveau ná één
 *   zo'n verlaging, dus nog altijd houdbaar (niet de bodem).
 * - `teWeinig`  = plannedMonthlySpend × guardrailFloor. Spiegelt de HARDE
 *   eind-clamp in applyGuardrails (`minWithdrawal = config.guardrailFloor ×
 *   effectiveBase`) — de onttrekking komt per constructie nooit onder dit niveau.
 *
 * Bij een typische guardrail-configuratie (zoals WITHDRAWAL_DEFAULTS: floor
 * 0.80 ≤ 1−cutStep 0.90 ≤ 1 ≤ 1+raiseStep 1.10 ≤ ceiling 1.20) geldt
 * `teWeinig < veilig < gepland < meevaller`. Bij een ongebruikelijke eigen
 * config (bv. cutStep > 1−floor) kan die volgorde omslaan — dat is dan een
 * bewuste keuze van de gebruiker in de eigen guardrail-instellingen, geen bug
 * in deze mapping.
 *
 * Alle vier niveaus worden op hele euro's afgerond; `you` blijft ongeacht
 * afronding exact gelijk aan `plannedMonthlySpend` (de "jij"-positie hoort
 * 1:1 het ingevoerde bedrag te tonen, niet een afgeronde afgeleide).
 */
export function computeGuardrailBounds(params: {
  plannedMonthlySpend: number
  config?: WithdrawalStrategyConfig
}): GuardrailBounds {
  const config = params.config ?? resolveWithdrawalStrategy({})
  const gepland = params.plannedMonthlySpend

  return {
    teWeinig: Math.round(gepland * config.guardrailFloor),
    veilig: Math.round(gepland * (1 - config.guardrailCutStep)),
    gepland: Math.round(gepland),
    meevaller: Math.round(gepland * (1 + config.guardrailRaiseStep)),
    you: gepland,
  }
}
