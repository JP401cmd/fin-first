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
// EENHEID per kolom (`unit`): de markt-aannames dragen FRACTIES (0.15 = 15%); de UI
// werkt in procenten en rekent om via `bandPct` — zet daar nooit een percentage
// neer, want de kolommen zelf dragen fracties. Het heffingvrije inkomen (TPR-12)
// draagt EURO'S per persoon per jaar; `bandPct` is daar per type niet toegestaan.
//
// Deze band is óók een DATABASEGRENS. Op `profiles` staan de constraints
// `profiles_expected_return_check` en `profiles_inflation_rate_check` met exact
// deze waarden (geverifieerd tegen pg_constraint op 05-08-2026; gecodificeerd in
// supabase/migrations/20260805120000_profiles_markt_aannames_band.sql, die ze
// idempotent aanmaakt voor een verse database), en sinds TPR-12
// `profiles_box3_heffingvrij_inkomen_range` (migratie 20260913150000).
//
// Dat is hier geen luxe maar noodzaak: de RLS-policy op `profiles` is
// `FOR ALL USING (auth.uid() = id)` — kolom-onafhankelijk — dus een gebruiker
// met de anon-key en zijn eigen token kan élke route omzeilen met een directe
// PostgREST-call. Zonder constraint zou deze band alleen een norm voor onze
// eigen code zijn. Via de huishoudprojectie reikt `expected_return` bovendien
// tot de projectie die de PARTNER ziet.
//
// Wijzig je de band hier, wijzig dan óók de constraint (nieuwe migratie).

/** De profielkolommen met een bewerkbare markt-aanname (fracties). */
export type FractieBandColumn = 'expected_return' | 'inflation_rate'
/** Alle profielkolommen met een server-band op `PUT /api/parameters`. */
export type ParameterBandColumn = FractieBandColumn | 'box3_heffingvrij_inkomen'

export interface ParameterBand {
  /** Ondergrens (inclusief), in de eenheid van `unit`. */
  min: number
  /** Bovengrens (inclusief), in de eenheid van `unit`. */
  max: number
  /** Label voor de foutmelding, bv. "Verwacht rendement". */
  label: string
  /** Eenheid van de kolom: fractie (0.15 = 15%) of euro. */
  unit: 'fractie' | 'euro'
}

export const PARAMETER_BANDS: Record<ParameterBandColumn, ParameterBand> = {
  expected_return: { min: 0.01, max: 0.15, label: 'Verwacht rendement', unit: 'fractie' },
  inflation_rate: { min: 0, max: 0.08, label: 'Inflatie', unit: 'fractie' },
  // TPR-12 — heffingvrij inkomen (Box 3, werkelijk-tak), euro per persoon per jaar.
  // Kernel-default 1800 (EXCEL_HEFFINGVRIJ_INKOMEN_PP); de bovengrens is ruim genoeg
  // voor elk scenario en klein genoeg om een bedrag-in-centen of een jaarinkomen als
  // tikfout te weigeren. Spiegelt de DB-CHECK profiles_box3_heffingvrij_inkomen_range.
  box3_heffingvrij_inkomen: { min: 0, max: 100_000, label: 'Heffingvrij inkomen', unit: 'euro' },
}

/** Bandgrens als percentage — de vorm die formulier-inputs verwachten (alleen fractie-kolommen). */
export function bandPct(column: FractieBandColumn): { min: number; max: number } {
  const band = PARAMETER_BANDS[column]
  return { min: band.min * 100, max: band.max * 100 }
}

/**
 * Foutmelding in de vorm "wat ging mis + hoe fix je het" (UX-copy-regel).
 * Gedeeld zodat server en client letterlijk dezelfde tekst gebruiken.
 */
export function bandError(column: ParameterBandColumn): string {
  const band = PARAMETER_BANDS[column]
  if (band.unit === 'euro') {
    const fmt = (n: number) => `€ ${n.toLocaleString('nl-NL')}`
    return `${band.label} moet tussen ${fmt(band.min)} en ${fmt(band.max)} liggen`
  }
  const { min, max } = bandPct(column as FractieBandColumn)
  return `${band.label} moet tussen ${min}% en ${max}% liggen`
}

/** true wanneer `value` (FRACTIE) binnen de band valt. NaN → false. */
export function isWithinBand(column: ParameterBandColumn, value: number): boolean {
  const band = PARAMETER_BANDS[column]
  return Number.isFinite(value) && value >= band.min && value <= band.max
}
