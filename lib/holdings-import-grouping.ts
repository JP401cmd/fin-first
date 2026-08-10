// lib/holdings-import-grouping.ts
// ---------------------------------------------------------------------------
// Groepering van importregels naar instrumenten.
//
// Een broker-CSV levert regels, geen posities: 24 aankopen van Marvell zijn één
// instrument, niet 24 holdings. De import-wizard groepeert daarom op ISIN (met
// ticker en naam als terugval) — en die groepering is een contract: de server
// leest `holding_index` uit dezelfde volgorde. Deze module is de enige plek waar
// die sleutel wordt bepaald, zodat de telling in de samenvatting per definitie
// niet uit de pas kan lopen met de payload die verstuurd wordt.
//
// Waarom dat ertoe doet: de samenvatting telde eerder élke koop-regel als
// holding ("196 holdings" bij 5 instrumenten). Dat is geen cosmetisch verschil —
// het is het getal waarop de gebruiker beoordeelt of hij het juiste bestand
// heeft geselecteerd.
// ---------------------------------------------------------------------------

/** Minimale vorm die volstaat om een regel aan een instrument te knopen. */
export interface InstrumentIdentity {
  isin?: string | null
  ticker?: string | null
  name: string
}

/**
 * De groeperingssleutel van één importregel: ISIN eerst (uniek en
 * broker-onafhankelijk), dan ticker, dan naam.
 */
export function instrumentKey(row: InstrumentIdentity): string {
  return (row.isin ?? row.ticker ?? row.name).toUpperCase()
}

/** Het aantal ONDERSCHEIDEN instrumenten in een set importregels. */
export function countDistinctInstruments(rows: readonly InstrumentIdentity[]): number {
  const seen = new Set<string>()
  for (const row of rows) seen.add(instrumentKey(row))
  return seen.size
}
