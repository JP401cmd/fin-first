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

/**
 * Eerste dag (`YYYY-MM-01`) van de maand die `monthsBack` maanden vóór
 * `refDate` ligt — tijdzone-veilig. Bedoeld als ondergrens voor rolling-window-
 * queries (bv. een 12-maands-venster = `localMonthStartMonthsAgo(now, 11)`).
 * Vervangt het onveilige `new Date(jaar, maand - n, 1).toISOString()`-patroon
 * dat de grens in NL een dag terugschuift (zie de module-toelichting).
 */
export function localMonthStartMonthsAgo(refDate: Date, monthsBack: number): string {
  return localMonthStart(new Date(refDate.getFullYear(), refDate.getMonth() - monthsBack, 1))
}

/**
 * Laatste kalenderdag van de maand van `monthDate` als `YYYY-MM-DD` —
 * tijdzone-veilig. Bedoeld als *inclusieve* bovengrens (bv. snapshot-datum of
 * `<= monthEnd`-vergelijking), in tegenstelling tot de exclusieve `end` van
 * `localMonthBounds` (de 1e van de volgende maand). Vervangt het onveilige
 * `new Date(jaar, maand + 1, 0).toISOString()`-patroon dat de dag in NL (UTC+)
 * een dag terugschuift (zie de module-toelichting).
 */
export function localMonthEnd(monthDate: Date): string {
  // Dag 0 van de volgende maand = de laatste dag van deze maand.
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}
