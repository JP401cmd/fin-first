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
// Deze band is óók een DATABASEGRENS. Op `profiles` staan de constraints
// `profiles_expected_return_check` en `profiles_inflation_rate_check` met exact
// deze waarden (geverifieerd tegen pg_constraint op 05-08-2026; gecodificeerd in
// supabase/migrations/20260805120000_profiles_markt_aannames_band.sql, die ze
// idempotent aanmaakt voor een verse database).
//
// Dat is hier geen luxe maar noodzaak: de RLS-policy op `profiles` is
// `FOR ALL USING (auth.uid() = id)` — kolom-onafhankelijk — dus een gebruiker
// met de anon-key en zijn eigen token kan élke route omzeilen met een directe
// PostgREST-call. Zonder constraint zou deze band alleen een norm voor onze
// eigen code zijn. Via de huishoudprojectie reikt `expected_return` bovendien
// tot de projectie die de PARTNER ziet.
//
// Wijzig je de band hier, wijzig dan óók de constraint (nieuwe migratie).

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
