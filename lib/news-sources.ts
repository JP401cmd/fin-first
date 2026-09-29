// ── News Sources — bronconfiguratie + ophalen van RSS-feeds en webpagina's ──
//
// Elke bron heeft een VASTE bronsoort (ADR 0176, B24):
//   - `rss`        een feed; elk <item> is een artikel, sleutel = de feed-link.
//   - `web_lijst`  een overzichtspagina met links naar artikelen; een artikel
//                  is een link die letterlijk als `href` op de pagina staat.
//   - `web_pagina` een thema-/regelpagina; een artikel is een server-bepaalde
//                  sectie, sleutel = pagina + hash van de sectietekst.
// Wat een artikel is, bepaalt de server — nooit modeltekst.
//
// Geen externe XML-parser: RSS is voorspelbaar genoeg voor regex-extractie.
// Dit bestand wordt óók door de (client-)beheerpagina geïmporteerd voor de
// standaardbronnen: geen node-imports hier.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  stripHtml,
  decodeEntities,
  isStoringspagina,
  artikelTekst,
  extractBronDatums,
  knipTekens,
  type BronDatums,
} from '@/lib/news-html'
import { isVeiligeBronUrl, zelfdeHost } from '@/lib/safe-url'

// ── Types ────────────────────────────────────────────────────────────

export const BRON_SOORTEN = ['rss', 'web_lijst', 'web_pagina'] as const
export type BronSoort = (typeof BRON_SOORTEN)[number]
export const WEB_BRON_SOORTEN = ['web_lijst', 'web_pagina'] as const
export type WebBronSoort = (typeof WEB_BRON_SOORTEN)[number]

export const BRON_SOORT_LABEL: Record<BronSoort, string> = {
  rss: 'RSS-feed',
  web_lijst: 'Web — lijstpagina',
  web_pagina: 'Web — themapagina',
}

/** Per soort: wat de keuze doet (effect) en wanneer je hem kiest (waarom) — de formulier-uitlegnorm. */
export const BRON_SOORT_UITLEG: Record<BronSoort, { effect: string; waarom: string }> = {
  rss: {
    effect: 'Elk item in de feed wordt een artikel, met de kop en de datum uit de feed.',
    waarom: 'Kies dit als de bron een echte feed heeft: dat is de betrouwbaarste bron van kop en datum.',
  },
  web_lijst: {
    effect: 'Een artikel is een link die op de pagina staat, met de linktekst als kop.',
    waarom: 'Kies dit voor een nieuwsoverzicht of publicatielijst zonder feed, waar elk item een eigen pagina heeft.',
  },
  web_pagina: {
    effect: 'Een artikel is een sectie van de pagina; het komt alleen terug als die sectie verandert.',
    waarom: 'Kies dit voor een thema- of regelpagina die af en toe wordt bijgewerkt. Het is de veilige keuze bij twijfel: hij kiest geen links.',
  },
}

export interface WebSource {
  url: string
  label: string // e.g. "Rijksoverheid", "NOS Economie"
  soort: WebBronSoort
}

export interface RssFeed {
  url: string
  label: string // e.g. "Belastingdienst Privé"
}

/** Eén <item> uit een feed, zoals de bron het levert. */
export interface RssItem {
  /** De kop van de bron. */
  title: string
  /** De beschrijving uit de feed (tags weg), of null als de feed er geen levert. */
  description: string | null
  /** De link uit de feed, letterlijk — ook een `//press` van de ECB blijft staan. */
  link: string
  /** `pubDate`/`dc:date`/`updated` MÉT tijd, als ISO; null als de feed geen geldige datum geeft. */
  publishedAt: string | null
  sourceName: string
}

/** Minimale artikelvorm voor de categorisatie (`categorizeArticles`). */
export interface SourceArticle {
  title: string
  summary: string
  sourceName: string
}

export interface NewsSources {
  webSources: WebSource[]
  rssFeeds: RssFeed[]
}

/**
 * Waarom een bron (niets) leverde — zichtbaar per bron op /beheer/nieuws.
 * Vóór ADR 0176 slikten de ophaalfuncties elke fout en bleef `error` leeg,
 * zodat 404, NXDOMAIN en "leeg" niet te onderscheiden waren.
 */
export const BRON_OORZAKEN = [
  'ok',
  'leeg',
  'geen_feed',
  'http_fout',
  'doorverwezen_naar_fout',
  'doorverwezen',
  'adres_geweigerd',
  'dns',
  'timeout',
  'netwerk',
  'geen_model',
  'model_fout',
  // De twee terugval-codes (25 sep 2026): de bron leverde WEL links, maar het
  // model kon ze niet beoordelen, dus nam de ingest de eerste paar in
  // paginavolgorde (`terugvalLinks`). Een eigen code en niet 'ok', want deze
  // items zijn niet op relevantie gekozen; en niet 'geen_model'/'model_fout',
  // want er kwam wél iets binnen. Zonder dit onderscheid leest /beheer/nieuws
  // een gedegradeerde run als een gewone.
  'terugval_geen_model',
  'terugval_model_fout',
  // De bron antwoordde wél (vaak met een 200), maar de pagina meldt een storing
  // of onderhoud in plaats van inhoud (`isStoringspagina`, 27 sep 2026). Een
  // eigen code en niet 'leeg': er stond wél tekst, alleen niet de bron. Die run
  // levert bewust niets, zodat een onderhoudsmelding nooit een artikel wordt.
  'storing',
  // Het antwoord was geen HTML (pdf, spreadsheet, afbeelding): de body is NIET
  // gelezen (Krant 1F fase 3). Voor een detailpagina is dat verwacht en geen
  // verlies; voor een geconfigureerde webbron betekent het dat de bron-URL naar
  // een document wijst in plaats van een pagina.
  'geen_html',
] as const
export type BronOorzaak = (typeof BRON_OORZAKEN)[number]

export const BRON_OORZAAK_LABEL: Record<BronOorzaak, string> = {
  ok: 'levert',
  leeg: 'opgehaald, niets gevonden',
  geen_feed: 'geen feed (HTML in plaats van RSS)',
  http_fout: 'HTTP-fout',
  doorverwezen_naar_fout: 'doorverwezen naar een foutpagina',
  doorverwezen: 'doorverwezen naar een andere site of te vaak — niet gevolgd',
  adres_geweigerd: 'adres niet toegestaan (alleen https, geen IP of lokale host)',
  dns: 'domein bestaat niet (DNS)',
  timeout: 'time-out',
  netwerk: 'netwerkfout',
  geen_model: 'geen AI-model — links niet gekozen',
  model_fout: 'AI-keuze mislukt',
  terugval_geen_model: 'geen AI-model — eerste links genomen',
  terugval_model_fout: 'AI-keuze mislukt — eerste links genomen',
  storing: 'bron meldt storing of onderhoud — niets overgenomen',
  geen_html: 'geen webpagina (pdf of ander document) — niet gelezen',
}

/**
 * Oorzaken waarbij de bron WEL leverde, maar zonder AI-oordeel. Bewust een
 * eigen verzameling en geen `startsWith('terugval_')`: een nieuwe terugval-code
 * moet hier bewust bij, anders telt hij stil niet mee in `bepaalIngestUitkomst`.
 * Dat is precies hoe de eerste versie vals-groen werd — de codes bestonden al,
 * maar niemand las ze.
 */
export const TERUGVAL_OORZAKEN = ['terugval_geen_model', 'terugval_model_fout'] as const

export function isTerugvalOorzaak(oorzaak: BronOorzaak): boolean {
  return (TERUGVAL_OORZAKEN as readonly BronOorzaak[]).includes(oorzaak)
}

// ── Default sources ──────────────────────────────────────────────────
//
// De curated standaardlijst, gebruikt zolang er in /beheer/nieuws niets is
// opgeslagen (dan wint de DB-lijst). Eén keer grondig bijgewerkt op
// 22-09-2026 (B28): 25 stille feeds weg (17× feeds.rijksoverheid.nl = DNS
// NXDOMAIN; Belastingdienst "Actueel" was nooit een feed; CPB/Toeslagen 404;
// CBS 500; AFM doorverwezen naar /404; DSTA gaf HTML), vijf Rijksoverheid-
// pagina's die 404 gaven weg (AOW kwam terug onder /themas/…, de andere vier
// niet), en de redirects vervangen door hun eindadres. Na de release-review
// ook DNB Algemeen nieuws en DNB Publicaties weg: hun lijst komt uit
// JavaScript, de server-HTML bevat 0 artikel-links, dus als web_lijst leveren
// ze nooit iets en als web_pagina alleen de vaste paginaomlijsting.
//
// Herijkt op 27-09-2026 (ADR 0176, aanvulling 19–21); elke bron is LIVE door
// de echte extractor gehaald. Weg of vervangen, met de oorzaak:
//   - Rijksoverheid Inkomstenbelasting / Pensioen / Koopkracht: themahubs met
//     alleen kaarten en teasers, dus 0 secties. Inkomstenbelasting → "Soorten
//     inkomstenbelasting" (box 1-schijven en box 3-grens letterlijk), Pensioen
//     → "Overgang naar nieuwe pensioenstelsel"; Koopkracht vervalt (de CBS-feed
//     Inkomen en bestedingen draagt de koopkrachtcijfers).
//   - Rijksoverheid AOW: één evergreen-sectie van 185 tekens → de pagina
//     "AOW-leeftijd" met de tabel per jaar.
//   - CBS Prijzen / CBS Inkomen: de themapagina hangt (0 bytes in 40 s, ook met
//     een browser-UA) en `…/cijfers` is een lijst StatLine-tabellen zonder
//     tekst. CBS heeft echte feeds per thema; de nieuwslinks daarin zijn
//     letterlijk dezelfde URL's als de oude lijstlinks, dus bestaande rijen
//     houden hun sleutel.
//   - ECB Monetairbeleidsbeslissingen: de lijst komt uit JavaScript (3
//     navigatielinks, Engels) → DNB "ECB-rentetarieven" (Nederlands, tarieven
//     in procenten). ECB Persberichten (rss): Engelse koppen zonder
//     beschrijving, 0 van 20 met een mechanisme → vervalt; DNB "Rente" draagt
//     het Nederlandse renteverhaal.
//   - AFM Waarschuwingen: een lijst namen van malafide partijen (fragment ~13
//     tekens); het model kiest er terecht niets uit → vervalt.
// Nieuw, omdat hun fragment de parameter letterlijk bevat: DUO (studieschuld-
// rente), eigen risico, Belastingdienst box 1-tarieven en box 3-percentages,
// Belastingplannen voor inkomen, DNB (spaar-/hypotheekrente-markt).

/**
 * Prinsjesdag van een jaar: de derde dinsdag van september (Grondwet art.
 * 65), als UTC-middernacht. Puur, voor `lopendBelastingplanJaar`.
 */
export function prinsjesdag(jaar: number): Date {
  const eersteSep = new Date(Date.UTC(jaar, 8, 1)).getUTCDay() // 0 = zondag, 2 = dinsdag
  const eersteDinsdag = 1 + ((2 - eersteSep + 7) % 7)
  return new Date(Date.UTC(jaar, 8, eersteDinsdag + 14))
}

/**
 * Het jaar van het Belastingplan dat nu in behandeling is. Op Prinsjesdag
 * verschijnt het Belastingplan voor het VOLGENDE jaar; vanaf de dag erna is
 * dat het lopende plan. Op Prinsjesdag zelf nog niet: de stukken komen pas in
 * de middag online, en de ochtendrun zou anders een 404 halen.
 */
export function lopendBelastingplanJaar(nu: Date): number {
  const jaar = nu.getUTCFullYear()
  const vandaag = Date.UTC(jaar, nu.getUTCMonth(), nu.getUTCDate())
  return vandaag > prinsjesdag(jaar).getTime() ? jaar + 1 : jaar
}

/** De wetteksten van het lopende Belastingplan op Rijksfinanciën — veroudert niet meer elk jaar. */
export function belastingplanWettekstenUrl(nu: Date): string {
  return `https://www.rijksfinancien.nl/belastingplan-${lopendBelastingplanJaar(nu)}`
}

/**
 * De standaard-webbronnen op moment `nu`. Een functie en geen constante,
 * omdat de Belastingplan-bron met Prinsjesdag meeschuift. Let op: slaat de
 * beheerder de lijst op in /beheer/nieuws, dan staat het jaartal daar vast
 * (een opgeslagen lijst wordt letterlijk gevolgd).
 */
export function standaardWebBronnen(nu: Date = new Date()): WebSource[] {
  return [
    // Rijksoverheid — thema- en regelpagina's (JSON-LD dateModified aanwezig)
    { url: 'https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/belastingplan', label: 'Rijksoverheid — Belastingplan', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/belastingplan/plannen-kabinet-belastingen-voor-inkomen', label: 'Rijksoverheid — Belastingplannen voor inkomen', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting/soorten-inkomstenbelasting', label: 'Rijksoverheid — Inkomstenbelasting', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting/plannen-werkelijk-rendement-box-3', label: 'Rijksoverheid — Box 3 werkelijk rendement', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/kinderopvangtoeslag', label: 'Rijksoverheid — Kinderopvangtoeslag', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/themas/werk/minimumloon', label: 'Rijksoverheid — Minimumloon', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/themas/werk/pensioen/overgang-naar-nieuwe-pensioenstelsel', label: 'Rijksoverheid — Overgang nieuw pensioenstelsel', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/algemene-ouderdomswet-aow/aow-leeftijd', label: 'Rijksoverheid — AOW-leeftijd', soort: 'web_pagina' },
    { url: 'https://www.rijksoverheid.nl/vraag-en-antwoord/zorgverzekering/eigen-risico-zorgverzekering', label: 'Rijksoverheid — Eigen risico zorgverzekering', soort: 'web_pagina' },
    // Rijksfinanciën, Belastingdienst & DUO — regel-/documentpagina's
    // Wetteksten en Box 3 zijn LIJSTEN (documenten, tegels): als themapagina
    // bleef er na het kaderfilter van Krant 1F fase 3 niets van over (6→1 en
    // 5→0 secties). Als lijstbron komt een nieuw wetsvoorstel of een nieuwe
    // tegel als link binnen, met de linktekst als kop (besluit eigenaar 28 sep).
    // De wetteksten zijn pdf's: buiten DETAIL_HOSTS, dus alleen de kop.
    { url: belastingplanWettekstenUrl(nu), label: 'Rijksfinanciën — Belastingplan wetteksten', soort: 'web_lijst' },
    { url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/boxen_en_tarieven/box_1/box_1', label: 'Belastingdienst — Box 1 tarieven', soort: 'web_pagina' },
    { url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/box-3', label: 'Belastingdienst — Box 3', soort: 'web_lijst' },
    { url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/met-welke-percentages-is-het-fictief-rendement-berekend', label: 'Belastingdienst — Box 3 rendementspercentages', soort: 'web_pagina' },
    // Belastingdienst — Toeslagen verwijderd (28 sep): een hub met tegels naar
    // aanvragen en inloggen, geen regelnieuws; als themapagina 8→0 secties.
    { url: 'https://www.duo.nl/particulier/rente/rente-als-uw-studiefinanciering-stopt.jsp', label: 'DUO — Rente studieschuld', soort: 'web_pagina' },
    // Toezichthouders & instituten
    { url: 'https://www.dnb.nl/voor-de-sector/wet-toekomst-pensioenen/', label: 'DNB — Wet toekomst pensioenen', soort: 'web_pagina' },
    { url: 'https://www.dnb.nl/de-euro-en-europa/monetair-beleid-ecb/ecb-rentetarieven/', label: 'DNB — ECB-rentetarieven', soort: 'web_pagina' },
    { url: 'https://www.dnb.nl/actuele-economische-vraagstukken/rente/', label: 'DNB — Rente', soort: 'web_pagina' },
    { url: 'https://www.afm.nl/nl-nl/sector/actueel', label: 'AFM — Sector actueel', soort: 'web_lijst' },
    { url: 'https://www.afm.nl/nl-nl/sector/themas/duurzaamheid/sfdr', label: 'AFM — SFDR duurzaam beleggen', soort: 'web_pagina' },
    { url: 'https://www.cpb.nl/publicaties', label: 'CPB — Publicaties', soort: 'web_lijst' },
    { url: 'https://www.cpb.nl/ramingen', label: 'CPB — Ramingen', soort: 'web_lijst' },
    // Nieuws van de Rijksoverheid (ADR 0191, regel 4; gemeten 29-09-2026). De
    // oude feed (feeds.rijksoverheid.nl) bestaat niet meer (DNS) en
    // /actueel/nieuws bouwt zijn lijst in de browser (0 links in de HTML). De
    // ministeriepagina's zetten hun laatste nieuws WÉL in de HTML: Financiën 4,
    // SZW 3, AZ 4 artikel-links (na `LIJST_PAD_FILTER`). De artikelpagina's staan
    // in `DETAIL_HOSTS` en dragen JSON-LD-datums.
    { url: 'https://www.rijksoverheid.nl/ministeries/ministerie-van-financien', label: 'Rijksoverheid — Ministerie van Financiën', soort: 'web_lijst' },
    { url: 'https://www.rijksoverheid.nl/ministeries/ministerie-van-sociale-zaken-en-werkgelegenheid', label: 'Rijksoverheid — Ministerie van SZW', soort: 'web_lijst' },
    { url: 'https://www.rijksoverheid.nl/ministeries/ministerie-van-algemene-zaken', label: 'Rijksoverheid — Ministerie van Algemene Zaken', soort: 'web_lijst' },
    // Kamerbrieven van de regering, per voortouwcommissie (Tweede Kamer). De
    // lijst staat in de HTML (15 brieven per pagina, nieuwste eerst); de kop is
    // de titel van de brief. Hier stond op 29-09 "Voorstellen op box 3,
    // koopkracht werkenden en sociale zekerheid" — het bericht dat de eigenaar
    // miste. De briefpagina's staan NIET in DETAIL_HOSTS: alleen de kop.
    { url: 'https://www.tweedekamer.nl/kamerstukken/brieven_regering?qry=%2A&fld_tk_categorie=Kamerstukken&fld_prl_kamerstuk=Brieven%20regering&srt=date%3Adesc%3Adate&fld_prl_voortouwcommissie=Vaste%20commissie%20voor%20Financi%C3%ABn', label: 'Tweede Kamer — Kamerbrieven Financiën', soort: 'web_lijst' },
    { url: 'https://www.tweedekamer.nl/kamerstukken/brieven_regering?qry=%2A&fld_tk_categorie=Kamerstukken&fld_prl_kamerstuk=Brieven%20regering&srt=date%3Adesc%3Adate&fld_prl_voortouwcommissie=Vaste%20commissie%20voor%20Sociale%20Zaken%20en%20Werkgelegenheid', label: 'Tweede Kamer — Kamerbrieven SZW', soort: 'web_lijst' },
  ]
}

export const DEFAULT_RSS_FEEDS: RssFeed[] = [
  // CBS — thema-feeds. Het label blijft dat van de oude lijstbron, zodat de
  // bronnaam op bestaande en nieuwe rijen gelijk is.
  { url: 'https://www.cbs.nl/nl-nl/rss-feeds/prijzen', label: 'CBS — Prijzen (CPI / inflatie)' },
  { url: 'https://www.cbs.nl/nl-nl/rss-feeds/inkomen-en-bestedingen', label: 'CBS — Inkomen en bestedingen' },
]

// ── Configuratie normaliseren ────────────────────────────────────────

function isSoort(v: unknown): v is WebBronSoort {
  return typeof v === 'string' && (WEB_BRON_SOORTEN as readonly string[]).includes(v)
}

/**
 * Een opgeslagen webbron zonder (geldige) `soort` — opgeslagen vóór ADR 0176 —
 * wordt `web_pagina`: de veiligste lezing, want die maakt alleen een artikel
 * bij een server-bepaalde wijziging en kiest geen links.
 */
export function normaliseerWebBronnen(ruw: unknown): WebSource[] {
  if (!Array.isArray(ruw)) return []
  return ruw
    .filter((b): b is Record<string, unknown> => b !== null && typeof b === 'object')
    .filter((b) => typeof b.url === 'string' && typeof b.label === 'string')
    .map((b) => ({ url: b.url as string, label: b.label as string, soort: isSoort(b.soort) ? b.soort : 'web_pagina' }))
}

export function normaliseerRssFeeds(ruw: unknown): RssFeed[] {
  if (!Array.isArray(ruw)) return []
  return ruw
    .filter((b): b is Record<string, unknown> => b !== null && typeof b === 'object')
    .filter((b) => typeof b.url === 'string' && typeof b.label === 'string')
    .map((b) => ({ url: b.url as string, label: b.label as string }))
}

// ── RSS parsing helpers ──────────────────────────────────────────────

function cleanCdata(text: string): string {
  return text.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
}

/** Tekstinhoud van een XML-element; CDATA en HTML in de inhoud worden tekst. */
function extractTag(xml: string, tagName: string): string {
  // Lineair: openingstag met `[^<>]*`, sluittag met indexOf (geen luie regex over de body).
  const open = new RegExp(`<${tagName}(?=[\\s>/])[^<>]*>`, 'i').exec(xml)
  if (!open) return ''
  const van = open.index + open[0].length
  const tot = xml.toLowerCase().indexOf(`</${tagName.toLowerCase()}`, van)
  if (tot < 0) return ''
  return stripHtml(decodeEntities(cleanCdata(xml.slice(van, tot))))
}

/**
 * De link van een item: `<link>url</link>`, de kale `<link/>url`-vorm, of
 * Atom `<link href="…"/>`. LETTERLIJK teruggegeven — geen normalisatie, want
 * een feed-link is de sleutel (de ECB-links bevatten bewust `//press`).
 */
function extractLink(itemXml: string): string {
  const standard = extractTag(itemXml, 'link')
  if (isHttpLink(standard)) return standard

  const bareMatch = itemXml.match(/<link\s*\/?>([^<]+)/i)
  if (bareMatch) {
    const url = bareMatch[1].trim()
    if (isHttpLink(url)) return url
  }

  const atom = itemXml.match(/<link\b[^<>]*\bhref\s*=\s*["']([^"']+)["']/i)
  const atomUrl = atom ? decodeEntities(atom[1].trim()) : ''
  if (isHttpLink(atomUrl)) return atomUrl
  return ''
}

/** Een absolute http(s)-URL met een host — strenger dan `startsWith('http')` (dat liet `httpx:` en `http:/x` door). */
function isHttpLink(url: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.length > 0
  } catch {
    return false
  }
}

/** Een feeddatum als volledig ISO-tijdstip (mét tijd), of null. Vóór ADR 0176 werd de tijd weggeknipt. */
export function feedDatumNaarIso(dateStr: string): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr.trim())
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Ophalen ──────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000
/** Items per feed per run. Een EXPLICIETE cap: wat erboven valt, staat als `afgekapt` in de brongezondheid. */
export const MAX_RSS_ITEMS = 25
/**
 * Grens op een opgehaalde body, in BYTES en al tijdens het lezen: de stream
 * stopt zodra hij bereikt is (een nieuws- of themapagina is ~0,1–0,4 MB).
 */
export const MAX_BODY_BYTES = 2_000_000
/** Hoogstens zoveel redirects; elke hop wordt opnieuw getoetst. */
export const MAX_REDIRECTS = 3
/** Met contactadres, zodat een bronbeheerder weet wie er komt en ons kan bereiken (Krant 1F fase 3). */
const USER_AGENT = 'TriFinity/1.0 NewsAggregator (+https://fin-first.vercel.app)'

interface HaalOpOpties {
  /** De geconfigureerde bron-URL: elke hop moet op dezelfde site blijven. Standaard de URL zelf. */
  anker?: string
  /**
   * Content-type-toets vóór de body wordt gelezen. `streng`: alleen een
   * expliciete HTML-header (detailpagina's). `los`: weiger een expliciet
   * niet-HTML-type, maar laat een ontbrekende header door (geconfigureerde
   * webbronnen, zoals vóór fase 3).
   */
  html?: 'streng' | 'los'
}

/** Is dit antwoord HTML? Zie `HaalOpOpties.html`. */
export function isHtmlAntwoord(contentType: string | null, modus: 'streng' | 'los'): boolean {
  if (!contentType || !contentType.trim()) return modus === 'los'
  const type = contentType.split(';')[0].trim().toLowerCase()
  return type === 'text/html' || type === 'application/xhtml+xml'
}

type Ophaal =
  | { ok: true; body: string; finalUrl: string }
  | { ok: false; oorzaak: BronOorzaak; httpStatus?: number }

/** Herken de foutklasse zonder de melding door te geven (geen URL of body in logs/gezondheid). */
function classificeerFout(err: unknown): BronOorzaak {
  if (err instanceof Error && err.name === 'AbortError') return 'timeout'
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause
  const code = typeof cause?.code === 'string' ? cause.code : ''
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns'
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return 'timeout'
  return 'netwerk'
}

/**
 * Een redirect die eindigt op een foutpagina (AFM: 200 op `/404?item=…`; DUO:
 * 200 op `/particulier/system/error/404.jsp?originalurl=…` — vandaar de
 * optionele extensie).
 */
export function isFoutpagina(url: string): boolean {
  try {
    return /(^|\/)(404|not-?found|pagina-niet-gevonden)(\.[a-z0-9]{1,5})?(\/|$|\?)/i.test(new URL(url).pathname + '/')
  } catch {
    return false
  }
}

/** Lees een body tot `MAX_BODY_BYTES` en breek de stream daarna af — nooit eerst alles in het geheugen. */
async function leesBegrensd(res: Response): Promise<string> {
  const reader = res.body?.getReader?.()
  if (!reader) return (await res.text()).slice(0, MAX_BODY_BYTES)
  const decoder = new TextDecoder('utf-8')
  const delen: string[] = []
  let gelezen = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    const ruimte = MAX_BODY_BYTES - gelezen
    const stuk = value.byteLength > ruimte ? value.subarray(0, ruimte) : value
    delen.push(decoder.decode(stuk, { stream: true }))
    gelezen += stuk.byteLength
    if (gelezen >= MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      break
    }
  }
  delen.push(decoder.decode())
  return delen.join('')
}

/**
 * Haal een bron-URL op met een SSRF-veilige redirectketen (ADR 0176,
 * security-review 1F S1): redirects worden NIET automatisch gevolgd. Elke hop
 * — ook de eerste — moet `isVeiligeBronUrl` halen (https, DNS-naam, geen
 * eigen poort, geen lokale host) en op dezelfde site blijven als de
 * geconfigureerde URL; hoogstens `MAX_REDIRECTS` hops. Zo niet, dan is de
 * uitkomst `doorverwezen`/`adres_geweigerd` en wordt er niets gelezen of
 * opgeslagen. Sinds Krant 1F fase 2 is de ingest de ENIGE aanroeper: de
 * duidingsstap doet zelf geen HTTP meer.
 */
async function haalOp(url: string, accept: string, opties: HaalOpOpties = {}): Promise<Ophaal> {
  if (!isVeiligeBronUrl(url)) return { ok: false, oorzaak: 'adres_geweigerd' }
  // De site-grens is het ANKER (de geconfigureerde bron), niet de opgehaalde
  // URL zelf — anders schuift de grens mee met een link (Krant 1F fase 3).
  const anker = opties.anker ?? url
  if (!zelfdeHost(url, anker)) return { ok: false, oorzaak: 'adres_geweigerd' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    let huidig = url
    for (let hop = 0; ; hop++) {
      const res = await fetch(huidig, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
      })
      if (res.status >= 300 && res.status < 400) {
        // De body van een redirect lezen we nooit: direct afbreken, zodat de socket vrijkomt.
        await res.body?.cancel?.().catch(() => undefined)
        const location = res.headers?.get?.('location')
        if (!location || hop >= MAX_REDIRECTS) return { ok: false, oorzaak: 'doorverwezen', httpStatus: res.status }
        let volgende: string
        try {
          volgende = new URL(location, huidig).toString()
        } catch {
          return { ok: false, oorzaak: 'doorverwezen', httpStatus: res.status }
        }
        if (!isVeiligeBronUrl(volgende) || !zelfdeHost(volgende, anker)) {
          return { ok: false, oorzaak: 'doorverwezen', httpStatus: res.status }
        }
        if (isFoutpagina(volgende)) return { ok: false, oorzaak: 'doorverwezen_naar_fout', httpStatus: res.status }
        huidig = volgende
        continue
      }
      if (!res.ok) return { ok: false, oorzaak: 'http_fout', httpStatus: res.status }
      // Vóór de body: is dit wel HTML? Een pdf van 850 kB werd anders als
      // "tekst" ingelezen (28 sep 2026). Niet lezen, socket vrijgeven.
      if (opties.html && !isHtmlAntwoord(res.headers?.get?.('content-type') ?? null, opties.html)) {
        await res.body?.cancel?.().catch(() => undefined)
        return { ok: false, oorzaak: 'geen_html', httpStatus: res.status }
      }
      const body = await leesBegrensd(res)
      return { ok: true, body, finalUrl: huidig }
    }
  } catch (err) {
    return { ok: false, oorzaak: classificeerFout(err) }
  } finally {
    clearTimeout(timeout)
  }
}

export interface RssUitkomst {
  items: RssItem[]
  oorzaak: BronOorzaak
  httpStatus?: number
  /** Items die de feed wél had, maar boven `MAX_RSS_ITEMS` vielen. */
  afgekapt: number
  /** Items waarvan de link naar een andere site wees dan de feed — niet overgenomen. */
  geweigerd: number
}

/**
 * De inhoud van elk `<item>` (RSS) of `<entry>` (Atom), lineair: de eerste
 * sluittag na elke opening, met een vooruitlopende wijzer.
 */
function feedItems(xml: string): string[] {
  const lower = xml.toLowerCase()
  const uit: string[] = []
  for (const tag of ['item', 'entry']) {
    const openRe = new RegExp(`<${tag}(?=[\\s>])[^<>]*>`, 'gi')
    let m: RegExpExecArray | null
    let sluit = -2
    while ((m = openRe.exec(xml)) !== null) {
      const van = m.index + m[0].length
      if (sluit !== -1 && sluit < van) sluit = lower.indexOf(`</${tag}>`, van)
      if (sluit < 0) break
      uit.push(xml.slice(van, sluit))
    }
    if (uit.length > 0) break
  }
  return uit
}

/**
 * Per host: alleen feed-items onder dit pad worden een artikel. RSS kent geen
 * AI-keuzestap zoals `web_lijst`; zonder dit filter wordt elke item een
 * artikel dat categorisatie en duiding kost.
 *
 * CBS (27 sep 2026): de thema-feeds mengen nieuwsberichten
 * (`/nl-nl/nieuws/…`, met cijfers in de kop) met maatwerktabellen
 * (`/nl-nl/maatwerk/…`, bv. "Sociaal-economische status per viercijferige
 * postcode") — 12 van 50 bij Prijzen, 26 van 50 bij Inkomen en bestedingen.
 * Een tabel draagt geen parameter in zijn fragment (ADR 0176, besluit 19).
 *
 * Bewust in code, per host, en niet als veld op de opgeslagen feed: zo geldt
 * het filter ook als de beheerder de bronnenlijst opslaat, en voor elke
 * CBS-feed die later wordt toegevoegd.
 */
export const RSS_PAD_FILTER: Readonly<Record<string, string>> = {
  'www.cbs.nl': '/nl-nl/nieuws/',
}

/** Het pad-filter voor een feed-URL, of null als de host er geen heeft. */
export function rssPadFilter(feedUrl: string): string | null {
  try {
    return RSS_PAD_FILTER[new URL(feedUrl).hostname.toLowerCase()] ?? null
  } catch {
    return null
  }
}

function linkOnderPad(link: string, pad: string): boolean {
  try {
    return new URL(link).pathname.startsWith(pad)
  } catch {
    return false
  }
}

/**
 * Parse een feed-body (RSS <item> of Atom <entry>). Puur, voor tests.
 * `alleenPad` filtert vóór de cap van `MAX_RSS_ITEMS`, zodat de cap naar
 * bruikbare items gaat; wat het filter weert telt niet als `afgekapt`.
 *
 * `zelfdeSiteAls` (de feed-URL) houdt alleen items over waarvan de link op
 * dezelfde site staat als de feed (Krant 1F fase 3). Sinds de ingest de
 * artikelpagina van een feed-item zelf ophaalt, is een feed-link een adres dat
 * de SERVER bezoekt; zonder deze grens kan een feed de server naar elke host
 * sturen. Wat de grens weert, telt als `geweigerd` (zichtbaar in de
 * brongezondheid).
 */
export function parseFeed(
  xml: string,
  sourceName: string,
  alleenPad: string | null = null,
  zelfdeSiteAls: string | null = null,
): { items: RssItem[]; isFeed: boolean; afgekapt: number; geweigerd: number } {
  const isFeed = /<(rss|feed|rdf:RDF)\b/i.test(xml)
  if (!isFeed) return { items: [], isFeed: false, afgekapt: 0, geweigerd: 0 }
  const alle: RssItem[] = []
  let geweigerd = 0
  for (const itemXml of feedItems(xml)) {
    const title = extractTag(itemXml, 'title')
    const link = extractLink(itemXml)
    if (!title || !link) continue
    if (zelfdeSiteAls && !zelfdeHost(link, zelfdeSiteAls)) {
      geweigerd++
      continue
    }
    if (alleenPad && !linkOnderPad(link, alleenPad)) continue
    const description =
      extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'summary') || ''
    const publishedAt = feedDatumNaarIso(
      extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date') || extractTag(itemXml, 'published') || extractTag(itemXml, 'updated'),
    )
    alle.push({ title, description: description || null, link, publishedAt, sourceName })
  }
  return { items: alle.slice(0, MAX_RSS_ITEMS), isFeed: true, afgekapt: Math.max(0, alle.length - MAX_RSS_ITEMS), geweigerd }
}

/** Haal een feed op en parse hem. Werpt nooit; de uitkomst draagt de oorzaak. */
export async function fetchRssFeed(feed: RssFeed): Promise<RssUitkomst> {
  const r = await haalOp(feed.url, 'application/rss+xml, application/atom+xml, application/xml, text/xml')
  if (!r.ok) return { items: [], oorzaak: r.oorzaak, httpStatus: r.httpStatus, afgekapt: 0, geweigerd: 0 }
  const { items, isFeed, afgekapt, geweigerd } = parseFeed(r.body, feed.label, rssPadFilter(feed.url), feed.url)
  if (!isFeed) return { items: [], oorzaak: 'geen_feed', afgekapt: 0, geweigerd: 0 }
  return { items, oorzaak: items.length > 0 ? 'ok' : 'leeg', afgekapt, geweigerd }
}

export type WebPaginaUitkomst =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; oorzaak: BronOorzaak; httpStatus?: number }

/**
 * Haal een webpagina op als HTML (voor links, secties en metadata). Werpt nooit.
 * Een pagina die een storing of onderhoud meldt (`isStoringspagina`) is géén
 * inhoud: dan `oorzaak: 'storing'` en geen HTML, zodat geen enkele bronsoort er
 * een artikel van kan maken.
 */
export async function fetchWebPage(source: { url: string }): Promise<WebPaginaUitkomst> {
  const r = await haalOp(source.url, 'text/html', { html: 'los' })
  if (!r.ok) return r
  if (isStoringspagina(r.body)) return { ok: false, oorzaak: 'storing' }
  return { ok: true, html: r.body, finalUrl: r.finalUrl }
}

// `WEB_TEKST_MAX_TEKENS` / `webTekstVoorDuiding` / `fetchWebContent` stonden
// hier tot Krant 1F fase 2 en leverden de volledige paginatekst aan de
// duidingsstap. Die stap leest sinds fase 2 uitsluitend het eigen
// `bron_fragment` van een rij en doet zelf geen HTTP. De artikelpagina van
// fase 3 hieronder wordt door de INGEST opgehaald en in `bron_fragment`
// bewaard — de duiding blijft zonder netwerk.

// ── Detailpagina's (Krant 1F fase 3) ─────────────────────────────────

/**
 * Hosts en paden waarvan de ingest de artikelpagina van een item zelf ophaalt.
 * Bewust in code (naar het voorbeeld van `RSS_PAD_FILTER`) en niet als veld op
 * de opgeslagen bron: het is tegelijk een BEVEILIGINGSGRENS — de server
 * bezoekt alleen deze adressen — en die blijft gelden als de beheerder de
 * bronnenlijst opslaat. Een nieuwe host erbij is een codewijziging met review.
 *
 *   www.cbs.nl  /nl-nl/nieuws/          de RSS-nieuwsitems: de feed geeft bij
 *               nieuws géén description (35 van 36 fragmenten leeg, 28 sep)
 *   www.cpb.nl  /                       publicaties en ramingen (lijstbron)
 *   www.afm.nl  /nl-nl/sector/actueel/  sectornieuws (lijstbron)
 *   www.rijksoverheid.nl  /actueel/nieuws/ en /documenten/  het nieuws en de
 *               documenten (persconferentie, Kamerbrief) van de ministerie-
 *               pagina's (lijstbronnen, ADR 0191)
 *
 * Meerdere paden per host (ADR 0191): elk pad is een PREFIX op het pad van de
 * URL; de host moet exact gelijk zijn. Een ander pad op dezelfde host (bv.
 * `/themas/…`) wordt niet opgehaald.
 */
export const DETAIL_HOSTS: Readonly<Record<string, readonly string[]>> = {
  'www.cbs.nl': ['/nl-nl/nieuws/'],
  'www.cpb.nl': ['/'],
  'www.afm.nl': ['/nl-nl/sector/actueel/'],
  // ADR 0191, regel 4 (29 sep 2026): het nieuws en de documenten van de
  // ministeriepagina's (Financiën, SZW, AZ). Twee paden, meer niet: de rest van
  // rijksoverheid.nl (thema's, bewindspersonen, organogram) staat op dezelfde
  // host maar is geen artikel, en de server bezoekt het dus niet.
  'www.rijksoverheid.nl': ['/actueel/nieuws/', '/documenten/'],
}

/** De toegestane padprefixen voor deze host (exacte hostnaam, kleine letters), of een lege lijst. */
function detailPaden(hostname: string): readonly string[] {
  return DETAIL_HOSTS[hostname.toLowerCase()] ?? []
}

/** Bovengrens van de bewaarde artikeltekst (besluit eigenaar 28 sep: 4.000 tekens). */
export const DETAIL_FRAGMENT_MAX_TEKENS = 4_000
/** Minder lezerstekst dan dit is geen artikel (een JS-app, een lege sjabloonpagina): terugval. */
export const DETAIL_MIN_TEKENS = 200
/** Documenten die we nooit ophalen: pdf's en kantoorbestanden (buiten scope, zie de kaart). */
const DOCUMENT_PAD = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|csv|zip)$/i

/**
 * Draagt deze same-site URL een andere absolute URL in zijn pad of query? Dat
 * is de vorm van een open redirector (`https://bron.nl/uit?url=https://elders`).
 *
 * Eerst (25 sep 2026) alleen voor de terugval van een lijstbron: een
 * doorstuur-link zou zonder model bovenaan de paginavolgorde als klikbare bron
 * bij de lezer komen. Sinds Krant 1F fase 3 is het óók een grens vóór de
 * server een detailpagina ophaalt: `haalOp` volgt geen redirect naar een andere
 * site, maar de server hoort zo'n adres niet eens te proberen.
 *
 * Bewust een VORM-toets, geen lijst van parameternamen: `?url=`, `?redirect=`,
 * `?next=`, `/out/https://…` — de naam varieert, de vorm niet.
 */
export function isDoorstuurVorm(url: string): boolean {
  let doel: URL
  try {
    doel = new URL(url)
  } catch {
    return true
  }
  const verdacht = /https?:\/\//i
  // `decodeURIComponent` werpt op een misvormde escape (`%ZZ`). Dan toetsen we
  // de rauwe vorm: een URL die niet eens te decoderen is, verdient geen
  // voorkeursbehandeling.
  const ontcijfer = (t: string): string => {
    try {
      return decodeURIComponent(t)
    } catch {
      return t
    }
  }
  if (verdacht.test(ontcijfer(doel.pathname))) return true
  for (const [, waarde] of doel.searchParams) {
    const w = ontcijfer(waarde).trim()
    // Ook de protocol-relatieve vorm (`?url=//elders.nl`, `?next=\\elders.nl`).
    // Alleen in de query: een dubbele slash in het PAD is gewoon (de ECB-feeds
    // dragen letterlijk `//press`).
    if (verdacht.test(w) || /^[\\/]{2}/.test(w)) return true
  }
  return false
}

/**
 * Mag de server de artikelpagina op dit adres ophalen? Alleen https op een
 * host en pad uit `DETAIL_HOSTS` (exacte hostnaam), geen doorstuurvorm, en
 * de bestaande adrestoets (`isVeiligeBronUrl`: geen IP, poort of lokale host).
 */
export function detailToegestaan(url: string): boolean {
  if (!isVeiligeBronUrl(url) || isDoorstuurVorm(url)) return false
  try {
    const u = new URL(url)
    return detailPaden(u.hostname).some((pad) => u.pathname.startsWith(pad))
  } catch {
    return false
  }
}

// ── Lijstbronnen: alleen artikel-links (ADR 0191, regel 4) ───────────

/**
 * Per host: welke links van een LIJSTPAGINA een artikel kunnen zijn. Zoals
 * `RSS_PAD_FILTER`, maar voor `web_lijst`. Een ministeriepagina van
 * rijksoverheid.nl zet haar laatste nieuws tussen tegels naar thema's,
 * bewindspersonen en het organogram; de Tweede Kamer zet filterknoppen boven
 * de lijst. Zonder dit filter kiest de terugval (geen model) de eerste vier
 * links in paginavolgorde — dat zijn dan tegels, geen nieuws.
 *
 * Bewust in code, per host: het geldt ook als de beheerder de bronnenlijst
 * opslaat. Een host zonder regel houdt het gedrag van vóór ADR 0191.
 */
export const LIJST_PAD_FILTER: Readonly<Record<string, readonly string[]>> = {
  'www.rijksoverheid.nl': ['/actueel/nieuws/', '/documenten/'],
  'www.tweedekamer.nl': ['/kamerstukken/brieven_regering/detail'],
}

/** Het padfilter voor een lijstbron-URL, of null als de host er geen heeft. */
export function lijstPadFilter(bronUrl: string): readonly string[] | null {
  try {
    return LIJST_PAD_FILTER[new URL(bronUrl).hostname.toLowerCase()] ?? null
  } catch {
    return null
  }
}

// ── De datum bij de kop (ADR 0191, regel 3) ──────────────────────────

const MAANDNUMMER: Readonly<Record<string, number>> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
}

/** Alleen de aanhef van de artikeltekst: kop, soort en datum staan bovenaan. */
export const PAGINA_DATUM_AANHEF_TEKENS = 400
/** Een zichtbare datum die ouder is dan dit, is eerder een leesfout dan een publicatiedatum. */
export const PAGINA_DATUM_MAX_OUDERDOM_DAGEN = 730

/**
 * Per host één EXPLICIET patroon voor de publicatiedatum vlak bij de kop, in de
 * artikeltekst zoals `artikelTekst` hem levert (en zoals hij als
 * `bron_fragment` bewaard wordt — de backfill in migratie 20261009120000 leest
 * hetzelfde patroon uit dezelfde tekst). Groepen: dag, maand, jaar.
 *
 *   www.afm.nl           "Nieuws 24/08/26", "Persbericht 24/09/26", "Maatregel
 *                        20/08/26", "Artikel 03/09/26" — soortwoord + dd/mm/jj
 *                        op een eigen regel onder de kop (geen metadata)
 *   www.cpb.nl           "15 september 2026" op een eigen regel direct na de
 *                        titel (terugval; de pagina heeft ook metadata)
 *   www.rijksoverheid.nl "Nieuwsbericht 29-09-2026 | 14:15", "Mediatekst
 *                        25-09-2026" (terugval; JSON-LD is er ook)
 *
 * CBS staat hier niet: de artikeltekst draagt geen datum, de metadata wel
 * (`DCTERMS.modified`, zie `extractBronDatums`).
 */
export const PAGINA_DATUM_PATRONEN: Readonly<Record<string, { patroon: RegExp; maand: 'getal' | 'naam'; jaar: 'jj' | 'jjjj' }>> = {
  'www.afm.nl': { patroon: /(?:^|\n)[A-Z][A-Za-z]{2,24} (\d{2})\/(\d{2})\/(\d{2})(?=\s|$)/, maand: 'getal', jaar: 'jj' },
  'www.cpb.nl': {
    patroon: /(?:^|\n)(\d{1,2}) (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) (\d{4})[ \t]*(?=\n|$)/i,
    maand: 'naam',
    jaar: 'jjjj',
  },
  'www.rijksoverheid.nl': { patroon: /(?:^|\n)[A-Z][a-z]{2,24} (\d{1,2})-(\d{1,2})-(\d{4})(?=\s|$)/, maand: 'getal', jaar: 'jjjj' },
}

/**
 * De publicatiedatum uit de ZICHTBARE tekst bij de kop, als ISO (middernacht
 * UTC), of null. Alleen op een host met een patroon, alleen in de aanhef, alleen
 * een bestaande kalenderdag, nooit na de dag van `runMoment` en nooit meer dan
 * `PAGINA_DATUM_MAX_OUDERDOM_DAGEN` ervoor. Wat niet past is geen datum: dan
 * blijft het ophaalmoment staan (`eerste_gezien`) — liever geen datum dan een
 * verkeerde.
 */
export function paginaDatum(url: string, tekst: string, runMoment: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  const def = PAGINA_DATUM_PATRONEN[host]
  if (!def) return null
  const m = def.patroon.exec(tekst.slice(0, PAGINA_DATUM_AANHEF_TEKENS))
  if (!m) return null
  const dag = Number(m[1])
  const maand = def.maand === 'naam' ? MAANDNUMMER[m[2].toLowerCase()] : Number(m[2])
  const jaar = def.jaar === 'jj' ? 2000 + Number(m[3]) : Number(m[3])
  if (!Number.isInteger(dag) || !Number.isInteger(maand) || !Number.isInteger(jaar) || maand < 1 || maand > 12 || dag < 1) return null
  const t = Date.UTC(jaar, maand - 1, dag)
  const d = new Date(t)
  // 31/02 rolt in `Date.UTC` door naar maart: dan is het geen bestaande dag.
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() !== maand - 1 || d.getUTCDate() !== dag) return null
  const run = new Date(runMoment)
  if (Number.isNaN(run.getTime())) return null
  const runDag = Date.UTC(run.getUTCFullYear(), run.getUTCMonth(), run.getUTCDate())
  if (t > runDag) return null
  if (t < runDag - PAGINA_DATUM_MAX_OUDERDOM_DAGEN * 86_400_000) return null
  return d.toISOString()
}

export type DetailUitkomst =
  | { uitkomst: 'gelezen'; tekst: string; datums: BronDatums }
  | { uitkomst: 'terugval'; oorzaak: BronOorzaak; httpStatus?: number }
  | { uitkomst: 'geen_html' }

/**
 * Haal de artikelpagina van één item op en lees de artikeltekst. Werpt nooit.
 *
 * Grenzen, in deze volgorde:
 *  1. `detailToegestaan` — host en pad uit `DETAIL_HOSTS`, geen doorstuurvorm;
 *  2. een documentpad (.pdf, .xlsx, …) wordt niet opgehaald → `geen_html`;
 *  3. `haalOp` met ANKER = de geconfigureerde bron (feed of lijstpagina): de
 *     link en elke redirect-hop blijven op die site, niet op de site van de link;
 *  4. content-type `streng`: alleen een expliciete HTML-header; anders wordt
 *     de body niet gelezen → `geen_html`;
 *  5. een storingspagina of een pagina zonder artikeltekst → `terugval`.
 *
 * De tekst is `artikelTekst` (zonder kader), geknipt op
 * `DETAIL_FRAGMENT_MAX_TEKENS`. De datums komen uit de metadata van de pagina.
 */
export async function fetchDetailPagina(detailUrl: string, ankerUrl: string): Promise<DetailUitkomst> {
  if (!detailToegestaan(detailUrl)) return { uitkomst: 'terugval', oorzaak: 'adres_geweigerd' }
  if (DOCUMENT_PAD.test(new URL(detailUrl).pathname)) return { uitkomst: 'geen_html' }
  const r = await haalOp(detailUrl, 'text/html', { anker: ankerUrl, html: 'streng' })
  if (!r.ok) {
    if (r.oorzaak === 'geen_html') return { uitkomst: 'geen_html' }
    return { uitkomst: 'terugval', oorzaak: r.oorzaak, ...(r.httpStatus !== undefined ? { httpStatus: r.httpStatus } : {}) }
  }
  if (isStoringspagina(r.body)) return { uitkomst: 'terugval', oorzaak: 'storing' }
  const tekst = knipTekens(artikelTekst(r.body), DETAIL_FRAGMENT_MAX_TEKENS)
  if (tekst.length < DETAIL_MIN_TEKENS) return { uitkomst: 'terugval', oorzaak: 'leeg' }
  return { uitkomst: 'gelezen', tekst, datums: extractBronDatums(r.body) }
}

// ── Source configuration from Supabase ───────────────────────────────

/**
 * Load news sources from the `app_settings` table.
 * Keys: `news_web_sources` and `news_rss_feeds`.
 *
 * Vereist een superadmin-sessie (tak 4 van de SELECT-policy) of de
 * service-role: beide sleutels zijn beheer-content en staan bewust NIET op de
 * allowlist van ADR 0163. Aanroepers vandaag: `app/(app)/beheer/nieuws` en
 * `lib/news-ingest.ts` (cron). Met een gewone gebruikerssessie levert dit
 * stil lege arrays — `lib/app-settings/publieke-sleutels.test.ts` zondert dit
 * bestand om die reden expliciet uit.
 */
export async function loadNewsSources(
  supabase: SupabaseClient,
  /** Moment van de run: bepaalt het lopende Belastingplan-jaar in de standaardlijst. */
  nu: Date = new Date(),
): Promise<NewsSources> {
  const [webRes, rssRes] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'news_web_sources').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'news_rss_feeds').maybeSingle(),
  ])

  let webSources: WebSource[] = []
  let rssFeeds: RssFeed[] = []

  try {
    if (webRes.data?.value) {
      const parsed = typeof webRes.data.value === 'string' ? JSON.parse(webRes.data.value) : webRes.data.value
      webSources = normaliseerWebBronnen(parsed)
    }
  } catch {
    console.error('[news-sources] Failed to parse news_web_sources from app_settings')
  }

  try {
    if (rssRes.data?.value) {
      const parsed = typeof rssRes.data.value === 'string' ? JSON.parse(rssRes.data.value) : rssRes.data.value
      rssFeeds = normaliseerRssFeeds(parsed)
    }
  } catch {
    console.error('[news-sources] Failed to parse news_rss_feeds from app_settings')
  }

  // Nothing configured at all → fall back to the curated defaults so that
  // ingestion (manual button + cron) and news generation work out of the box.
  // This mirrors the beheerpagina, which shows these same defaults when no
  // sources are saved. Saving any source set (even just one type) opts out of
  // the fallback and is respected verbatim.
  if (webSources.length === 0 && rssFeeds.length === 0) {
    return { webSources: standaardWebBronnen(nu), rssFeeds: DEFAULT_RSS_FEEDS }
  }

  return { webSources, rssFeeds }
}
