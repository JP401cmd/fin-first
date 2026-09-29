// ── Redactieregels van de Krant (ADR 0191, steekproef eigenaar 29 sep 2026) ──
//
// Van 17 beoordeelde berichten hadden er maar 6 zonder voorbehoud impact. De
// rest faalde op vier punten die NIETS met de duiding te maken hebben — ze
// zijn deterministisch te beslissen op wat de server al weet (bronsoort,
// bronkop, bronfragment, herkomst van de datum). Daarom staan ze hier, ná de
// duiding en buiten de duidingsprompt: een promptwijziging vraagt een nieuwe
// duiding van alle artikelen, deze regels niet.
//
//   1  Verandering is nieuws, de standaard niet — een sectie van een vaste
//      uitlegpagina die we zien omdat we de PAGINA voor het eerst zien
//      (`bron_wijziging = 'basis'`) is de stand van zaken.
//   2a Het bericht past bij de lezer — nieuws over Caribisch Nederland (of de
//      landen Aruba, Curaçao, Sint Maarten) raakt geen lezer: het nieuwsprofiel
//      kent geen woonplaats en alle lezers wonen in Europees Nederland.
//   2b Een bericht over een kleine of ontbrekende spaarbuffer raakt lezers met
//      WEINIG spaargeld, niet lezers met veel (het thema `sparen-rente` raakt
//      standaard spaarders vanaf € 5.000).
//   3  De echte datum — alleen een datum uit de feed, de metadata of de
//      zichtbare paginatekst is een publicatiedatum; het ophaalmoment niet.
//
// PUUR en client-veilig: geen IO, geen node-imports. De matcher (en daarmee de
// goldens) is de enige consument van de beslisregels; de ingest zet alleen
// `bron_wijziging` en `published_bron`.

import type { DoelgroepRegel } from './duiding-schema'

// ── Regel 1 — basis of gewijzigd ─────────────────────────────────────────────

/** `news_articles.bron_wijziging` (migratie 20261009120000). Alleen voor `web_pagina`. */
export const BRON_WIJZIGINGEN = ['basis', 'gewijzigd'] as const
export type BronWijziging = (typeof BRON_WIJZIGINGEN)[number]

/**
 * Lijstbronnen die NASLAG verzamelen in plaats van nieuws: de links op zo'n
 * pagina zijn zelf uitlegpagina's ("Kijk hoe wij uw box 3-inkomen in 2021
 * berekend hebben"). Gemeten op 30-09-2026, na de eerste versie van regel 1:
 * de tijdlijn van een spaarder bestond uit 8 van deze pagina's, alle 8 als
 * "Nieuw". Een nieuwslijst (AFM, CPB, de ministeries, de Kamerbrieven) staat
 * hier niet.
 *
 * Bewust in code, op het adres van de lijstpagina (`bron_pagina_url`), zoals
 * `LIJST_PAD_FILTER` en `DETAIL_HOSTS`: het geldt ook als de beheerder de
 * bronnenlijst opslaat in /beheer/nieuws. `news-sources.test.ts` bewaakt dat
 * elk adres hier een lijstbron uit de standaardlijst is.
 */
export const NASLAG_LIJSTEN: readonly string[] = ['https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/box-3']

export function isNaslagLijst(bronPaginaUrl: string | null | undefined): boolean {
  return bronPaginaUrl != null && NASLAG_LIJSTEN.includes(bronPaginaUrl)
}

/**
 * Is dit artikel de stand van zaken in plaats van nieuws?
 *
 *  - Een sectie van een `web_pagina` is alleen nieuws als ze een WIJZIGING is
 *    op een pagina die we al kenden (`gewijzigd`). Ontbreekt de status (een rij
 *    die de oude ingest na de migratie nog schreef), dan geldt de voorzichtige
 *    lezing: basis — liever een wijziging een dag laag in Achtergrond dan een
 *    uitlegpagina als "Nieuw".
 *  - Een link van een NASLAGLIJST is de stand van zaken, tenzij de pagina zelf
 *    een echte publicatiedatum draagt: dan is het een bericht met een datum, en
 *    beslissen het venster en de regel "ouder dan 45 dagen".
 *  - `rss` en elke andere `web_lijst` zijn nieuwsberichten en nooit basis.
 */
export function isBasisSectie(a: {
  bron_soort?: string | null
  bron_wijziging?: string | null
  bron_pagina_url?: string | null
  published_bron?: string | null
}): boolean {
  if (a.bron_soort === 'web_pagina') return a.bron_wijziging !== 'gewijzigd'
  if (a.bron_soort === 'web_lijst' && isNaslagLijst(a.bron_pagina_url)) return !heeftEchteDatum(a.published_bron)
  return false
}

// ── Regel 2a — Caribisch Nederland ───────────────────────────────────────────

/**
 * Namen die een bericht over Caribisch Nederland of de Caribische landen van
 * het Koninkrijk aanwijzen. Woordgrenzen: "Sint Maartensdijk" of "WolBES" zijn
 * geen treffer; "BES" alleen als hoofdletterwoord (anders is elk "bes" raak).
 */
const CARIBISCH_TERMEN: readonly RegExp[] = [
  /caribisch\s+(nederland|deel van het koninkrijk)/giu,
  /\bbonaire\b/giu,
  /\bsint[\s-]eustatius\b/giu,
  /\bstatia\b/giu,
  /\bsaba\b/giu,
  /\bbes[\s-]eilanden\b/giu,
  // Niet "BES-eilanden": dat telt de regel hierboven al.
  /\bBES\b(?![\s-]eilanden)/gu,
  /\baruba\b/giu,
  /\bcura[cç]ao\b/giu,
  /\bsint[\s-]maarten\b/giu,
]

/** Het deel van het fragment dat als "aanhef" telt: kop, datum en eerste alinea. */
export const AANHEF_TEKENS = 600
/** Zoveel VERMELDINGEN in de aanhef maken een bericht Caribisch, ook zonder treffer in de kop. */
export const CARIBISCH_MIN_TREFFERS_AANHEF = 2
/**
 * Treffers die zo dicht op elkaar staan, zijn één vermelding: "Caribisch
 * Nederland (BES)", "de BES-eilanden Bonaire, Sint Eustatius en Saba" en de
 * vaste voorbehoudzin "Woont u in Caribisch Nederland (Bonaire, Sint Eustatius
 * of Saba)?" noemen het gebied één keer, in één adem.
 */
export const CARIBISCH_VERMELDING_AFSTAND = 80

/** Beginposities van alle treffers in de tekst, oplopend. */
function trefferPosities(tekst: string): number[] {
  const posities: number[] = []
  for (const re of CARIBISCH_TERMEN) for (const m of tekst.matchAll(re)) posities.push(m.index ?? 0)
  return posities.sort((a, b) => a - b)
}

/**
 * Het aantal vermeldingen: treffers binnen `CARIBISCH_VERMELDING_AFSTAND`
 * tekens van de vorige tellen als dezelfde vermelding (eindreview Y1,
 * 30-09-2026 — "BES-eilanden" telde dubbel, en één opsomming telde als vier).
 */
export function telCaribischeVermeldingen(tekst: string): number {
  let n = 0
  let vorige = Number.NEGATIVE_INFINITY
  for (const p of trefferPosities(tekst)) {
    if (p - vorige > CARIBISCH_VERMELDING_AFSTAND) n++
    vorige = p
  }
  return n
}

/**
 * Gaat dit bericht over Caribisch Nederland (of Aruba, Curaçao, Sint Maarten)?
 *
 * DE DREMPEL: een treffer in de KOP, óf minstens
 * `CARIBISCH_MIN_TREFFERS_AANHEF` vermeldingen in de eerste `AANHEF_TEKENS`
 * tekens van het fragment. Waarom zo: een bericht dát over Caribisch Nederland
 * gaat, zegt dat in de kop ("Inflatie Caribisch Nederland", "Caribisch
 * Nederland: leidraad…") of komt er in de aanhef op terug. Een Nederlands
 * bericht dat het gebied één keer noemt — ook als opsomming van de drie
 * eilanden, of in de vaste voorbehoudzin van een overheidspagina — blijft staan.
 * Gemeten op productie (30-09-2026, 243 artikelen): de kopregel vangt alle vier
 * de Caribische berichten; de aanhefregel alleen zou er geen extra vangen.
 */
export function isCaribischBericht(kop: string, fragment: string | null | undefined): boolean {
  if (trefferPosities(kop).length > 0) return true
  if (!fragment) return false
  return telCaribischeVermeldingen(fragment.slice(0, AANHEF_TEKENS)) >= CARIBISCH_MIN_TREFFERS_AANHEF
}

// ── Regel 2b — spaarbuffer ───────────────────────────────────────────────────

/** Vaste formuleringen voor een kleine of ontbrekende buffer (in de aanhef). */
const BUFFER_AANHEF =
  /\b(spaarbuffer|noodbuffer|financi[eë]le buffer|geen buffer|kleine buffer|geen spaargeld|weinig spaargeld|zonder spaargeld|minder dan (€\s?|euro\s)?1[.\s]?000( euro)? (aan )?spaargeld)\b/iu

/**
 * Gaat dit bericht over een kleine of ontbrekende buffer, en niet over de
 * spaarrente? Deterministisch op kop en aanhef:
 *   - noemt de kop RENTE, dan is het een rentebericht (nooit buffer);
 *   - noemt de kop een buffer ("Blog: betaal jezelf eerst: spaarbuffer"), dan wel;
 *   - anders beslist een vaste bufferformulering in de aanhef.
 * Er komt geen thema bij dat het model moet toekennen (de duidingsprompt blijft
 * ongewijzigd): dit verandert alleen WIE het bestaande thema `sparen-rente`
 * raakt, zie `raaktVoorThema`.
 */
export function isBufferBericht(kop: string, fragment: string | null | undefined): boolean {
  if (/rente/iu.test(kop)) return false
  if (/buffer/iu.test(kop)) return true
  return BUFFER_AANHEF.test((fragment ?? '').slice(0, AANHEF_TEKENS))
}

/**
 * Wie een bufferbericht raakt: de laagste spaarband (tot € 5.000). Bewust
 * zonder zichtbare reden-zin in "Over jouw situatie": "heb je weinig
 * spaargeld" is een gevoelige reden, net als inkomen en krediet (compliance-
 * keuze 4), en de sjablooncatalogus is geattesteerd — er komt geen tekst bij.
 */
export const SPAARBUFFER_RAAKT: readonly DoelgroepRegel[] = [{ veld: 'spaargeld', op: 'hoogstens', waarden: ['tot-5k'] }]

// ── Regel 3 — de echte datum ─────────────────────────────────────────────────

/**
 * Herkomsten van `published_at` die een echte publicatiedatum dragen: de feed,
 * de metadata van de pagina, of een zichtbare datum bij de kop (`pagina`,
 * ADR 0191). `eerste_gezien` is het ophaalmoment en is dat nooit.
 */
export const ECHTE_DATUM_BRONNEN = ['feed', 'meta', 'pagina'] as const

export function heeftEchteDatum(publishedBron: string | null | undefined): boolean {
  return publishedBron != null && (ECHTE_DATUM_BRONNEN as readonly string[]).includes(publishedBron)
}

/** Wat de datumregels van een artikel moeten weten. */
export interface DatumBron {
  published_at: string | null
  published_bron?: string | null
  fetched_at: string
  bron_soort?: string | null
  bron_wijziging?: string | null
}

/**
 * Draagt dit ARTIKEL een echte publicatiedatum? Eén uitzondering op
 * `heeftEchteDatum`: een GEWIJZIGDE sectie van een uitlegpagina (regel 1). Haar
 * datum is de wijzigingsdatum van de hele pagina uit de metadata, en die zegt
 * niets over déze sectie: gemeten op 30-09-2026 dragen de twee
 * Belastingdienst-pagina's 3 februari en 14 april. Wat we van zo'n sectie
 * weten, is wanneer wij de wijziging zagen. Zonder deze uitzondering viel een
 * echte wijziging weg als "ouder dan 45 dagen", of kreeg ze een datum van
 * maanden terug (eindreview Y3).
 */
export function heeftEchteArtikelDatum(a: Pick<DatumBron, 'published_bron' | 'bron_soort' | 'bron_wijziging'>): boolean {
  if (a.bron_soort === 'web_pagina' && a.bron_wijziging === 'gewijzigd') return false
  return heeftEchteDatum(a.published_bron)
}

/**
 * De datum die de lezer ziet: een publicatiedatum als die echt is, anders het
 * moment waarop wij het bericht zagen ("gezien op …"). Nooit beide; nooit het
 * ophaalmoment als publicatiedatum.
 */
export function lezersDatum(a: DatumBron): { gepubliceerd: string | null; gezienOp: string | null } {
  if (heeftEchteArtikelDatum(a) && a.published_at) return { gepubliceerd: a.published_at, gezienOp: null }
  return { gepubliceerd: null, gezienOp: a.fetched_at }
}
