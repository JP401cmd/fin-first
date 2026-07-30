/**
 * Pure helpers voor de "alles selecteren"-checkbox in de duplicaten-stap van de
 * import-wizard (stap 2). Losgetrokken van het grote client-component `page.tsx`
 * zodat de selectielogica (all/some/indeterminate + bulk-toggle) zonder DOM te
 * unit-testen is.
 *
 * Semantiek: een rij met `skipImport === false` wordt geïmporteerd (checkbox
 * aangevinkt). "Alles selecteren" zet dus `skipImport` op `false` voor elke rij,
 * "alles deselecteren" op `true`.
 *
 * **Uitzondering sinds dedup-laag 2 (fase 3/B7):** een rij die als cross-bron-
 * duplicaat is herkend (dezelfde boeking, eerder al via de bank binnengekomen)
 * staat standaard UIT en blijft dat óók bij "alles selecteren". Reden: dat is
 * precies de rij die een dubbele reeks zou opleveren, en een bulk-klik is geen
 * bewuste beslissing daarover. Individueel aanvinken blijft wél mogelijk — het
 * oordeel is overrulebaar, alleen niet per ongeluk.
 */

/** Reden waarom een rij als cross-bron-duplicaat geldt (spiegel van
 *  `CrossSourceMatchReason` in `lib/parsers/cross-source-dedup.ts`). */
export type CrossSourceFlag = { reason: 'iban' | 'name' }

/** Minimale rijvorm die de selectiestatus bepaalt. */
export type SkippableRow = {
  skipImport: boolean
  /** `null`/afwezig = gewone rij; gezet = herkend als cross-bron-duplicaat. */
  crossSourceDuplicate?: CrossSourceFlag | null
}

/**
 * Staat een rij standaard uit bij een bulk-selectie? Eén predicaat, gebruikt
 * door zowel de kop-checkbox-staat als de bulk-toggle, zodat die twee nooit uit
 * de pas kunnen lopen.
 */
export function isDefaultExcluded(row: SkippableRow): boolean {
  return !!row.crossSourceDuplicate
}

export type SelectAllState = {
  /** Alles wat bulk-selecteerbaar is (>=1 rij) wordt geïmporteerd. */
  allSelected: boolean
  /** Ten minste één rij wordt geïmporteerd. */
  someSelected: boolean
  /** Deels geselecteerd — de kop-checkbox toont de indeterminate-staat. */
  indeterminate: boolean
}

/**
 * Leidt de kop-checkbox-staat af uit de rijen. Een lege lijst is noch
 * "allSelected" noch "indeterminate" (de checkbox staat dan simpelweg uit).
 *
 * `allSelected` kijkt naar wat bulk-selecteerbaar is: een uitgevinkte
 * cross-bron-duplicaat houdt de kop-checkbox niet eeuwig op "indeterminate"
 * staan — anders zou "alles selecteren" er permanent onaf uitzien terwijl er
 * niets meer te selecteren valt.
 */
export function selectAllState(rows: readonly SkippableRow[]): SelectAllState {
  const total = rows.length
  const selected = rows.reduce((n, r) => (r.skipImport ? n : n + 1), 0)
  const allSelected = total > 0 && rows.every((r) => !r.skipImport || isDefaultExcluded(r))
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
 * selecteert alles behalve de standaard-uitgesloten rijen. Muteert de input niet.
 */
export function withAllSkip<T extends SkippableRow>(rows: readonly T[], skip: boolean): T[] {
  return rows.map((r) => ({ ...r, skipImport: skip || isDefaultExcluded(r) }))
}
