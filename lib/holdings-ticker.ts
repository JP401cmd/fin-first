/**
 * Afleiding van de verplichte `ticker`-waarde op `investment_holdings`.
 *
 * De kolom is NOT NULL (migratie `20260502000003_split_holdings_tables.sql`),
 * terwijl elk handmatig invoerformulier het veld leeg mag laten. Zonder
 * afleiding belandt er `null` in de insert, schendt de rij de constraint en
 * krijgt de gebruiker een generieke 500 in plaats van een aangemaakte holding
 * (WF-BEZIT-14-bug4).
 *
 * De afleiding spiegelt bewust twee bestaande bronnen zodat handmatige invoer
 * en import dezelfde waarde opleveren:
 *  - de backfill in diezelfde migratie: `COALESCE(h.ticker, h.name)`
 *  - de CSV-import (`app/api/holdings/import/route.ts`):
 *    `h.ticker?.trim() || h.name.trim()`
 *
 * Bewust GÉÉN uppercase of afkapping op N tekens: de duplicaat-check in
 * `POST /api/holdings` vergelijkt al hoofdletter-ongevoelig (`ilike`), en
 * afkappen zou twee verschillende namen op één afgeleide ticker laten vallen —
 * dat maakt van een cosmetische normalisatie een onterechte 409.
 */
export function deriveHoldingTicker(ticker: unknown, name: unknown): string | null {
  const explicit = typeof ticker === 'string' ? ticker.trim() : ''
  if (explicit.length > 0) return explicit

  const derived = typeof name === 'string' ? name.trim() : ''
  return derived.length > 0 ? derived : null
}
