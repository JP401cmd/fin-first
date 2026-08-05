// lib/parameters-band.ts
//
// DE geldige bandbreedtes voor de markt-aannames op `profiles` — één bron voor
// server én client.
//
// Waarom een eigen module: dezelfde band stond op drie plekken (de route, de
// bewerk-sheet en de aanroeper van die sheet). Dat is dezelfde bugklasse die de
// optimizer-herziening elders opruimde: één grootheid, meerdere bronnen. Een
// test die twee kopieën vergelijkt méldt drift; één gedeelde constante máákt
// hem onmogelijk.
//
// EENHEID: fracties (0.15 = 15%). De UI werkt in procenten en rekent om via de
// `*_PCT`-helpers hieronder — zet hier nooit een percentage neer, want de
// kolommen zelf dragen fracties.
//
// Deze band is de applicatie-norm. Hij is (nog) GEEN databasegrens: op
// `profiles` staat geen CHECK-constraint, en de RLS-policy is
// kolom-onafhankelijk own-row schrijfbaar. Een gebruiker met zijn eigen token
// kan de route dus omzeilen. Zolang die constraint ontbreekt, is dit een norm
// voor onze eigen code — niet een grens tegen de gebruiker.

/** De profielkolommen met een bewerkbare markt-aanname. */
export type ParameterBandColumn = 'expected_return' | 'inflation_rate'

export interface ParameterBand {
  /** Ondergrens als FRACTIE (inclusief). */
  min: number
  /** Bovengrens als FRACTIE (inclusief). */
  max: number
  /** Label voor de foutmelding, bv. "Verwacht rendement". */
  label: string
}

export const PARAMETER_BANDS: Record<ParameterBandColumn, ParameterBand> = {
  expected_return: { min: 0.01, max: 0.15, label: 'Verwacht rendement' },
  inflation_rate: { min: 0, max: 0.08, label: 'Inflatie' },
}

/** Bandgrens als percentage — de vorm die formulier-inputs verwachten. */
export function bandPct(column: ParameterBandColumn): { min: number; max: number } {
  const band = PARAMETER_BANDS[column]
  return { min: band.min * 100, max: band.max * 100 }
}

/**
 * Foutmelding in de vorm "wat ging mis + hoe fix je het" (UX-copy-regel).
 * Gedeeld zodat server en client letterlijk dezelfde tekst gebruiken.
 */
export function bandError(column: ParameterBandColumn): string {
  const band = PARAMETER_BANDS[column]
  const { min, max } = bandPct(column)
  return `${band.label} moet tussen ${min}% en ${max}% liggen`
}

/** true wanneer `value` (FRACTIE) binnen de band valt. NaN → false. */
export function isWithinBand(column: ParameterBandColumn, value: number): boolean {
  const band = PARAMETER_BANDS[column]
  return Number.isFinite(value) && value >= band.min && value <= band.max
}
