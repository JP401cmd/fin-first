/**
 * Tijdzone-veilige maandgrenzen voor transactie-queries.
 *
 * Een `Date` die lokale middernacht op de 1e van de maand voorstelt
 * (`new Date(jaar, maand, 1)`) mag NIET via `toISOString()` naar een
 * YYYY-MM-DD-grens worden omgezet: in UTC+ tijdzones (NL = CET/CEST) rekent
 * `toISOString()` terug naar de vorige dag, waardoor het venster een dag
 * terugschuift. De laatste dag van de vórige maand telt dan mee (bv. een
 * 31-juli-salaris dat in het augustus-overzicht opduikt) en de laatste dag
 * van de huidige maand valt weg. Bouw de grenzen daarom uit lokale
 * datum-componenten — dat is per definitie tijdzone-onafhankelijk.
 */

/** Formatteer de jaar/maand van een lokale Date als `YYYY-MM-01`. */
export function localMonthStart(monthDate: Date): string {
  return `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Lokale maandgrenzen als YYYY-MM-DD strings, te gebruiken als
 * `.gte('date', start).lt('date', end)`. `end` is exclusief = de 1e van de
 * volgende maand.
 */
export function localMonthBounds(monthDate: Date): { start: string; end: string } {
  const start = localMonthStart(monthDate)
  const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
  return { start, end: localMonthStart(next) }
}
