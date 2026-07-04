/**
 * clipRowsToPlanEnd — pure weergave-clip voor de Toekomst-projectierijen.
 *
 * BESLUIT 4 juli 2026 (eigenaar): het láátste levensjaar van de projectie is
 * terminale modelmarge en verdwijnt uit BEELD. Weergavegrens = `endAge − 1`
 * (dezelfde grens als de tekort-lening-melding, zie `deficit-loan-display.ts`).
 * Bij eindleeftijd 93 toont /toekomst dus alles t/m leeftijd 92; bij een
 * doorlopende strategie (displayEndAge 100) t/m 99.
 *
 * CALLERS: lever de KÉRNEL-`displayEndAge` aan (`SimResult.displayEndAge` — bij
 * perpetual/pensioen de horizon-cap 100, bij deplete/legacy de plan-eindleeftijd
 * fire_end_age), NIET de rauwe `profiles.fire_end_age`. Zo clippen alle
 * weergave-oppervlakken op exact dezelfde grens die de run zelf hanteerde.
 *
 * Generiek over elke rij met een `age` op de jaar-as (zowel `UnifiedProjectionRow`
 * als `SimRow`). Idempotent: `clipRowsToPlanEnd(clipRowsToPlanEnd(rows, e), e)`
 * levert dezelfde rijen — veilig als een consument elders ook clipt.
 *
 * Pure functie — geen React/Supabase/Date.now.
 */

/** Elke projectierij met een leeftijd op de jaar-as. */
type AgedRow = { age: number }

/**
 * @param rows   Projectierijen (of null/undefined).
 * @param endAge Kernel-eindleeftijd. Niet-eindig (null/undefined/NaN) ⇒ geen
 *               clip: alle rijen blijven behouden.
 * @returns Nieuwe array met de rijen t/m `endAge − 1`. Null/undefined `rows` ⇒ `[]`.
 */
export function clipRowsToPlanEnd<T extends AgedRow>(
  rows: readonly T[] | null | undefined,
  endAge: number | null | undefined,
): T[] {
  if (!rows) return []
  if (!Number.isFinite(endAge)) return [...rows]
  const cutoff = (endAge as number) - 1
  return rows.filter((r) => r.age <= cutoff)
}
