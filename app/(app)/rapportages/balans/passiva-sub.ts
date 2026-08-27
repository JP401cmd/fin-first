/**
 * Bijschrift onder de Passiva-tegel van de vermogensbalans.
 *
 * De passivazijde is per boekhoudkundige identiteit gelijk aan de activazijde
 * (`totalPassiva = eigenVermogen + totalSchulden`, zie app/api/report/balans/route.ts).
 * Een bijschrift dat alleen het aantal schuldposten noemt, laat de lezer denken dat
 * het volledige bedrag schuld is — op een document dat bedoeld is om af te drukken
 * en te delen is dat een misleiding van formaat (bevinding M30).
 *
 * Daarom noemt het bijschrift beide componenten. Zonder schuldposten vormt eigen
 * vermogen de hele passivazijde; het schuldendeel van de tekst vervalt dan.
 */
export function passivaSubLabel(totalDebtItems: number): string {
  if (totalDebtItems <= 0) return 'eigen vermogen'
  const noun = totalDebtItems === 1 ? 'schuld' : 'schulden'
  return `${totalDebtItems} ${noun} + eigen vermogen`
}
