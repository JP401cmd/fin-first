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
 * Is dit artikel de stand van zaken in plaats van nieuws? Een sectie van een
 * `web_pagina` is alleen nieuws als ze een WIJZIGING is op een pagina die we al
 * kenden (`gewijzigd`). Ontbreekt de status (een rij die de oude ingest na de
 * migratie nog schreef), dan geldt de voorzichtige lezing: basis — liever een
 * wijziging een dag laag in Achtergrond dan een uitlegpagina als "Nieuw".
 * `rss` en `web_lijst` zijn nieuwsberichten en nooit basis.
 */
export function isBasisSectie(a: { bron_soort?: string | null; bron_wijziging?: string | null }): boolean {
  return a.bron_soort === 'web_pagina' && a.bron_wijziging !== 'gewijzigd'
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
  /\bBES\b/gu,
  /\baruba\b/giu,
  /\bcura[cç]ao\b/giu,
  /\bsint[\s-]maarten\b/giu,
]

/** Het deel van het fragment dat als "aanhef" telt: kop, datum en eerste alinea. */
export const AANHEF_TEKENS = 600
/** Zoveel treffers in de aanhef maken een bericht Caribisch, ook zonder treffer in de kop. */
export const CARIBISCH_MIN_TREFFERS_AANHEF = 2

function telTreffers(tekst: string): number {
  let n = 0
  for (const re of CARIBISCH_TERMEN) n += tekst.match(re)?.length ?? 0
  return n
}

/**
 * Gaat dit bericht over Caribisch Nederland (of Aruba, Curaçao, Sint Maarten)?
 *
 * DE DREMPEL: een treffer in de KOP, óf minstens
 * `CARIBISCH_MIN_TREFFERS_AANHEF` treffers in de eerste `AANHEF_TEKENS` tekens
 * van het fragment. Waarom zo: een bericht dát over Caribisch Nederland gaat,
 * zegt dat in de kop ("Inflatie Caribisch Nederland", "Caribisch Nederland:
 * leidraad…") of noemt het in de aanhef meer dan eens ("in Bonaire, Sint
 * Eustatius en Saba"). Een Nederlands bericht dat Bonaire terloops noemt ("ook
 * op Bonaire geldt…", onderaan een lang artikel) haalt geen van beide — één
 * vermelding, of een vermelding diep in de tekst, sluit niets uit.
 */
export function isCaribischBericht(kop: string, fragment: string | null | undefined): boolean {
  if (telTreffers(kop) > 0) return true
  if (!fragment) return false
  return telTreffers(fragment.slice(0, AANHEF_TEKENS)) >= CARIBISCH_MIN_TREFFERS_AANHEF
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

/**
 * De datum die de lezer ziet: een publicatiedatum als die echt is, anders het
 * moment waarop wij het bericht zagen ("gezien op …"). Nooit beide; nooit het
 * ophaalmoment als publicatiedatum.
 */
export function lezersDatum(a: {
  published_at: string | null
  published_bron?: string | null
  fetched_at: string
}): { gepubliceerd: string | null; gezienOp: string | null } {
  if (heeftEchteDatum(a.published_bron) && a.published_at) return { gepubliceerd: a.published_at, gezienOp: null }
  return { gepubliceerd: null, gezienOp: a.fetched_at }
}
