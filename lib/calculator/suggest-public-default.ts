/**
 * Rekenhulp — publiceer-curatie: ronde-heuristiek voor "nice numbers".
 *
 * Bij publish (private → public) tonen we de auteur een voorgestelde
 * publieke default voor elke input. Doel: voorkom dat persoonlijke
 * bedragen (€321.500 hypotheeksaldo) in een publieke template lekken.
 * We "ronden af op een psychologisch ronde waarde" per kind:
 *   - euro    → 1, 2 of 5 × macht van 10 (nice numbers)
 *   - percent → 1 decimaal (fractie 0-1, dus 0.0213 → 0.02)
 *   - years   → veelvoud van 5
 *   - number  → 1-2 significante cijfers
 *
 * Pure functies — geen DB, geen IO. De UI mag de suggestie overschrijven;
 * we leggen niets vast. Zie ook: app/api/calculators/publish/route.ts.
 */

import type { CalculatorDefinition, InputKind } from './types'

/**
 * Rond een EUR-bedrag af op het dichtstbijzijnde "nice number": een
 * gehele mantissa (1-10) maal een macht van 10. Voorbeelden:
 *   321500 → 300000   (3 × 10^5)
 *   1247   → 1000     (1 × 10^3)
 *   50892  → 50000    (5 × 10^4)
 *   85     → 90       (9 × 10^1)
 *
 * Het oorspronkelijke ontwerp gebruikte alleen {1, 2, 5} maar dat
 * onderbrak de spec-voorbeelden (321500 → 300000 vereist 3). Gehele
 * mantissa's leveren psychologisch ronde waarden zonder die uitsluiting.
 *
 * Negatieve waarden behouden het teken; nul blijft nul.
 *
 * NB: dit is een significante-cijfer-SNAPPER, GEEN euro-cent-afronder. Bewust
 * `snapToRoundNumber` genoemd (niet `roundEuro`) om verwarring/botsing met de
 * centrale `roundEuro` uit lib/format ([Arch F4]) te voorkomen — die rondt op
 * hele euro's; deze snapt een bedrag naar een psychologisch ronde waarde.
 */
function snapToRoundNumber(value: number): number {
  if (value === 0) return 0
  const sign = value < 0 ? -1 : 1
  const abs = Math.abs(value)

  // Bepaal de magnitude (10^n) en de mantissa (1.0 - 9.999...).
  const magnitude = Math.pow(10, Math.floor(Math.log10(abs)))
  const mantissa = abs / magnitude

  // Rond mantissa op de dichtstbijzijnde gehele (1..10). Bij 10 schuift
  // de magnitude één rang omhoog (8.5 → 9 blijft binnen; 9.5 → 10 wordt
  // 1 × 10^(n+1)).
  const roundedMantissa = Math.round(mantissa)
  if (roundedMantissa === 10) {
    return sign * magnitude * 10
  }
  return sign * roundedMantissa * magnitude
}

/**
 * Rond een fractie (0-1) af op 1 decimaal van procent. Dus 0.0213 → 0.02,
 * 0.0567 → 0.06, 0.234 → 0.23. De percent-representatie krijgt dus telkens
 * een ronde tiende-procent — net grof genoeg om persoonlijke koersen niet
 * één-op-één door te laten lekken.
 */
function roundPercent(value: number): number {
  // *100 → naar procent, round → 0 decimalen op procent-niveau (bv. 0.0213 →
  // 2.13 → 2 → 0.02). We expliciet vermijden de FP-error met toFixed.
  const asPercent = value * 100
  const rounded = Math.round(asPercent)
  return Number((rounded / 100).toFixed(2))
}

/**
 * Rond een aantal jaren af op het dichtstbijzijnde veelvoud van 5.
 * Voorbeelden: 22 → 20, 33 → 35, 47 → 45. Nul blijft nul; negatief
 * gedraagt symmetrisch.
 */
function roundYears(value: number): number {
  return Math.round(value / 5) * 5
}

/**
 * Algemene "round to 1-2 significant digits" voor het neutrale `number`
 * kind. Houdt het simpel: 1 significant cijfer als de waarde >= 10 is,
 * anders 2 (voor leesbaarheid bij kleine getallen).
 */
function roundGenericNumber(value: number): number {
  if (value === 0) return 0
  const abs = Math.abs(value)
  const sign = value < 0 ? -1 : 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(abs)))
  // 1 sig fig voor >= 10, 2 sig fig voor < 10.
  const sigFigs = abs >= 10 ? 1 : 2
  const factor = magnitude / Math.pow(10, sigFigs - 1)
  return sign * Math.round(abs / factor) * factor
}

/**
 * Publieke API: kies een afgeronde "nice number" gegeven het input-kind.
 */
export function suggestPublicDefault(value: number, kind: InputKind): number {
  if (!Number.isFinite(value)) return value
  switch (kind) {
    case 'euro':
      return snapToRoundNumber(value)
    case 'percent':
      return roundPercent(value)
    case 'years':
      return roundYears(value)
    case 'number':
      return roundGenericNumber(value)
    case 'boolean':
    case 'enum':
      // Categorische inputs zijn al "ronde" waarden — laat ongemoeid.
      return value
  }
}

/**
 * Convenience: pas de heuristiek toe op alle inputs van een definitie
 * en lever een `{ inputKey → suggestedDefault }`-map. Wordt door de
 * publish-flow gebruikt om in één call het hele formulier voor te vullen.
 */
export function suggestAllPublicDefaults(
  definition: Pick<CalculatorDefinition, 'inputs'>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const input of definition.inputs ?? []) {
    out[input.key] = suggestPublicDefault(input.default, input.kind)
  }
  return out
}
