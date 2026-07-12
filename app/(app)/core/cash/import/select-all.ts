/**
 * Pure helpers voor de "alles selecteren"-checkbox in de duplicaten-stap van de
 * import-wizard (stap 2). Losgetrokken van het grote client-component `page.tsx`
 * zodat de selectielogica (all/some/indeterminate + bulk-toggle) zonder DOM te
 * unit-testen is.
 *
 * Semantiek: een rij met `skipImport === false` wordt geïmporteerd (checkbox
 * aangevinkt). "Alles selecteren" zet dus `skipImport` op `false` voor elke rij,
 * "alles deselecteren" op `true`.
 */

/** Minimale rijvorm die de selectiestatus bepaalt. */
export type SkippableRow = { skipImport: boolean }

export type SelectAllState = {
  /** Alle (>=1) rijen worden geïmporteerd. */
  allSelected: boolean
  /** Ten minste één rij wordt geïmporteerd. */
  someSelected: boolean
  /** Deels geselecteerd — de kop-checkbox toont de indeterminate-staat. */
  indeterminate: boolean
}

/**
 * Leidt de kop-checkbox-staat af uit de rijen. Een lege lijst is noch
 * "allSelected" noch "indeterminate" (de checkbox staat dan simpelweg uit).
 */
export function selectAllState(rows: readonly SkippableRow[]): SelectAllState {
  const total = rows.length
  const selected = rows.reduce((n, r) => (r.skipImport ? n : n + 1), 0)
  const allSelected = total > 0 && selected === total
  const someSelected = selected > 0
  return {
    allSelected,
    someSelected,
    indeterminate: someSelected && !allSelected,
  }
}

/**
 * Retourneert een nieuwe rijenlijst waarin elke rij als wel/niet-importeren is
 * gemarkeerd. `skip === true` deselecteert alles (skipImport=true), `false`
 * selecteert alles. Muteert de input niet.
 */
export function withAllSkip<T extends SkippableRow>(rows: readonly T[], skip: boolean): T[] {
  return rows.map((r) => ({ ...r, skipImport: skip }))
}
