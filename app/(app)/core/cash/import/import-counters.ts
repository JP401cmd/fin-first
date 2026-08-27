/**
 * Pure helpers voor de tellers in de duplicaten-stap van de import-wizard
 * (stap 2). Losgetrokken van het grote client-component `page.tsx` zodat de
 * telling én de bijbehorende kopij zonder DOM te unit-testen zijn — zelfde
 * patroon als `select-all.ts`.
 *
 * **Waarom een aparte teller-module (M33).** De rij tellers meet twee
 * verschillende grootheden naast elkaar:
 *
 * - `newCount` / `dupCount` / `crossSourceCount` zijn een **classificatie** per
 *   rij, vastgesteld bij de dedup-check. Ze zijn wederzijds exclusief en tellen
 *   samen op tot het totaal aantal rijen.
 * - `toImportCount` is de **actuele selectie** (`!skipImport`), die de gebruiker
 *   met elke checkbox verandert.
 *
 * Vinkt de gebruiker een herkend duplicaat alsnog aan, dan blijft die rij bij
 * "duplicaten" meetellen én verschijnt hij bij "te importeren" — rekenkundig
 * klopt dat, maar zonder label leest het als een tegenspraak ("0 nieuw · 7
 * duplicaten · 1 importeren"). Daarom draagt de selectie-teller een label dat
 * zégt dat het een selectie is, en benoemt hij expliciet de rijen die *ondanks*
 * hun duplicaat-classificatie zijn aangevinkt.
 */

/** Minimale rijvorm waaruit de tellers zijn af te leiden. */
export type CountableRow = {
  /** Exacte hash-treffer: stond al in de database of eerder in ditzelfde bestand. */
  isDuplicate: boolean
  /** Dedup-laag 2: kwam vermoedelijk al via de bankkoppeling binnen. */
  crossSourceDuplicate?: unknown | null
  /** `false` = wordt geïmporteerd (checkbox aangevinkt). */
  skipImport: boolean
}

export type ImportCounters = {
  /** Classificatie: niet herkend als duplicaat, in welke laag dan ook. */
  newCount: number
  /** Classificatie: exacte hash-treffer. */
  dupCount: number
  /** Classificatie: vermoedelijk al via de bankkoppeling binnengekomen. */
  crossSourceCount: number
  /** Selectie: hoeveel rijen daadwerkelijk geïmporteerd worden. */
  toImportCount: number
  /**
   * Selectie ∩ classificatie: aangevinkte rijen die als duplicaat herkend zijn.
   * Precies deze rijen maken dat `toImportCount` van `newCount` afwijkt.
   */
  overriddenCount: number
}

/** Telt één keer over de rijen in plaats van vier losse `filter`-passes. */
export function countImportRows(rows: readonly CountableRow[]): ImportCounters {
  const counters: ImportCounters = {
    newCount: 0,
    dupCount: 0,
    crossSourceCount: 0,
    toImportCount: 0,
    overriddenCount: 0,
  }
  for (const row of rows) {
    const isCrossSource = !!row.crossSourceDuplicate
    if (row.isDuplicate) counters.dupCount++
    if (isCrossSource) counters.crossSourceCount++
    if (!row.isDuplicate && !isCrossSource) counters.newCount++
    if (!row.skipImport) {
      counters.toImportCount++
      if (row.isDuplicate || isCrossSource) counters.overriddenCount++
    }
  }
  return counters
}

/**
 * Kopij voor de selectie-teller (M33, optie A van de eigenaar): noem de derde
 * teller wat hij ís, zodat hij niet als classificatie gelezen wordt.
 *
 * Drie vormen, oplopend in nuance:
 * - niets overruled → "N transacties geselecteerd om te importeren"
 * - álles overruled → "N transacties geselecteerd om alsnog te importeren"
 * - deels overruled → "… , waarvan M herkend als duplicaat"
 *
 * "alsnog" verschijnt bewust alleen wanneer de selectie daadwerkelijk over een
 * duplicaat-oordeel heen gaat; bij een schone eerste import zou dat woord de
 * gebruiker juist op het verkeerde been zetten.
 */
export function selectionCounterLabel(counters: ImportCounters): string {
  const { toImportCount, overriddenCount } = counters
  const noun = toImportCount === 1 ? 'transactie' : 'transacties'
  if (toImportCount > 0 && overriddenCount === toImportCount) {
    return `${toImportCount} ${noun} geselecteerd om alsnog te importeren`
  }
  const base = `${toImportCount} ${noun} geselecteerd om te importeren`
  if (overriddenCount === 0) return base
  return `${base}, waarvan ${overriddenCount} herkend als duplicaat`
}
