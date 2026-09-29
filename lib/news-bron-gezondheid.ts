import type { BronOorzaak } from '@/lib/news-sources'

/**
 * Oordeel over één nieuwsbron uit de laatste ingest-run.
 *
 * Eén home voor deze indeling, gedeeld door `/beheer/nieuws` (de stip per bron)
 * en het beheerdashboard (de telling "bronnen die niet leveren"). Stond tot het
 * dashboard alleen lokaal in de nieuwspagina.
 *
 * Puur, en met alleen een type-import: de client-pagina kan dit importeren
 * zonder de ingest-code mee te bundelen.
 */

export type BronKlasse = 'goed' | 'let-op' | 'fout' | 'onbekend'

/** Wat de indeling van een gezondheidsregel nodig heeft; `oorzaak` ontbreekt op regels van vóór ADR 0176. */
export interface BronGezondheidsRegel {
  oorzaak?: BronOorzaak | null
  items: number
}

/** De oorzaak van een gezondheidsregel, ook voor regels van vóór ADR 0176. */
export function oorzaakVan(s: BronGezondheidsRegel): BronOorzaak | null {
  if (s.oorzaak) return s.oorzaak
  return s.items > 0 ? 'ok' : null
}

/**
 * - `goed`: de bron leverde.
 * - `let-op`: niets gevonden, geen model, of de bron meldt zelf een storing —
 *   aandacht, maar niets voor ons om te repareren.
 * - `fout`: de bron is niet te bereiken of gaf iets onbruikbaars terug.
 * - `onbekend`: een run van vóór ADR 0176 zonder oorzaak.
 */
export function bronKlasse(s: BronGezondheidsRegel): BronKlasse {
  const o = oorzaakVan(s)
  if (o === 'ok') return 'goed'
  if (o === 'leeg' || o === 'geen_model' || o === 'storing') return 'let-op'
  if (o === null) return 'onbekend'
  return 'fout'
}
