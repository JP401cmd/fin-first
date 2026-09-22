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
import { stripHtml, decodeEntities, knipTekens } from '@/lib/news-html'
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

export const DEFAULT_WEB_SOURCES: WebSource[] = [
  // Rijksoverheid — themapagina's (JSON-LD dateModified aanwezig)
  { url: 'https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/belastingplan', label: 'Rijksoverheid — Belastingplan', soort: 'web_pagina' },
  { url: 'https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting', label: 'Rijksoverheid — Inkomstenbelasting', soort: 'web_pagina' },
  { url: 'https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting/plannen-werkelijk-rendement-box-3', label: 'Rijksoverheid — Box 3 werkelijk rendement', soort: 'web_pagina' },
  { url: 'https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/kinderopvangtoeslag', label: 'Rijksoverheid — Kinderopvangtoeslag', soort: 'web_pagina' },
  { url: 'https://www.rijksoverheid.nl/themas/economie/koopkracht', label: 'Rijksoverheid — Koopkracht', soort: 'web_pagina' },
  { url: 'https://www.rijksoverheid.nl/themas/werk/minimumloon', label: 'Rijksoverheid — Minimumloon', soort: 'web_pagina' },
  { url: 'https://www.rijksoverheid.nl/themas/werk/pensioen', label: 'Rijksoverheid — Pensioen', soort: 'web_pagina' },
  { url: 'https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/algemene-ouderdomswet-aow', label: 'Rijksoverheid — AOW', soort: 'web_pagina' },
  // Rijksfinanciën & Belastingdienst — regel-/documentpagina's
  { url: 'https://www.rijksfinancien.nl/belastingplan-2026', label: 'Rijksfinanciën — Belastingplan wetteksten', soort: 'web_pagina' },
  { url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/box-3', label: 'Belastingdienst — Box 3', soort: 'web_pagina' },
  { url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/toeslagen/toeslagen', label: 'Belastingdienst — Toeslagen', soort: 'web_pagina' },
  // Toezichthouders & instituten
  { url: 'https://www.dnb.nl/voor-de-sector/wet-toekomst-pensioenen/', label: 'DNB — Wet toekomst pensioenen', soort: 'web_pagina' },
  { url: 'https://www.afm.nl/nl-nl/sector/actueel', label: 'AFM — Sector actueel', soort: 'web_lijst' },
  { url: 'https://www.afm.nl/nl-nl/sector/themas/duurzaamheid/sfdr', label: 'AFM — SFDR duurzaam beleggen', soort: 'web_pagina' },
  { url: 'https://www.afm.nl/nl-nl/consumenten/waarschuwingen', label: 'AFM — Waarschuwingen', soort: 'web_lijst' },
  { url: 'https://www.cpb.nl/publicaties', label: 'CPB — Publicaties', soort: 'web_lijst' },
  { url: 'https://www.cpb.nl/ramingen', label: 'CPB — Ramingen', soort: 'web_lijst' },
  // CBS — Statistieken
  { url: 'https://www.cbs.nl/nl-nl/arbeid-en-inkomen/inkomen-en-bestedingen/cijfers', label: 'CBS — Inkomen en bestedingen', soort: 'web_lijst' },
  { url: 'https://www.cbs.nl/nl-nl/economie/prijzen', label: 'CBS — Prijzen (CPI / inflatie)', soort: 'web_lijst' },
  // ECB
  { url: 'https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/html/index.nl.html', label: 'ECB — Monetairbeleidsbeslissingen', soort: 'web_lijst' },
]

export const DEFAULT_RSS_FEEDS: RssFeed[] = [
  { url: 'https://www.ecb.europa.eu/rss/press.html', label: 'ECB — Persberichten' },
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
const USER_AGENT = 'TriFinity/1.0 NewsAggregator'

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

/** Een redirect die eindigt op een foutpagina (AFM: 200 op `/404?item=…`). */
function isFoutpagina(url: string): boolean {
  try {
    return /(^|\/)(404|not-?found|pagina-niet-gevonden)(\/|$|\?)/i.test(new URL(url).pathname + '/')
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
async function haalOp(url: string, accept: string): Promise<Ophaal> {
  if (!isVeiligeBronUrl(url)) return { ok: false, oorzaak: 'adres_geweigerd' }
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
        if (!isVeiligeBronUrl(volgende) || !zelfdeHost(volgende, url)) {
          return { ok: false, oorzaak: 'doorverwezen', httpStatus: res.status }
        }
        if (isFoutpagina(volgende)) return { ok: false, oorzaak: 'doorverwezen_naar_fout', httpStatus: res.status }
        huidig = volgende
        continue
      }
      if (!res.ok) return { ok: false, oorzaak: 'http_fout', httpStatus: res.status }
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

/** Parse een feed-body (RSS <item> of Atom <entry>). Puur, voor tests. */
export function parseFeed(xml: string, sourceName: string): { items: RssItem[]; isFeed: boolean; afgekapt: number } {
  const isFeed = /<(rss|feed|rdf:RDF)\b/i.test(xml)
  if (!isFeed) return { items: [], isFeed: false, afgekapt: 0 }
  const alle: RssItem[] = []
  for (const itemXml of feedItems(xml)) {
    const title = extractTag(itemXml, 'title')
    const link = extractLink(itemXml)
    if (!title || !link) continue
    const description =
      extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'summary') || ''
    const publishedAt = feedDatumNaarIso(
      extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date') || extractTag(itemXml, 'published') || extractTag(itemXml, 'updated'),
    )
    alle.push({ title, description: description || null, link, publishedAt, sourceName })
  }
  return { items: alle.slice(0, MAX_RSS_ITEMS), isFeed: true, afgekapt: Math.max(0, alle.length - MAX_RSS_ITEMS) }
}

/** Haal een feed op en parse hem. Werpt nooit; de uitkomst draagt de oorzaak. */
export async function fetchRssFeed(feed: RssFeed): Promise<RssUitkomst> {
  const r = await haalOp(feed.url, 'application/rss+xml, application/atom+xml, application/xml, text/xml')
  if (!r.ok) return { items: [], oorzaak: r.oorzaak, httpStatus: r.httpStatus, afgekapt: 0 }
  const { items, isFeed, afgekapt } = parseFeed(r.body, feed.label)
  if (!isFeed) return { items: [], oorzaak: 'geen_feed', afgekapt: 0 }
  return { items, oorzaak: items.length > 0 ? 'ok' : 'leeg', afgekapt }
}

export type WebPaginaUitkomst =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; oorzaak: BronOorzaak; httpStatus?: number }

/** Haal een webpagina op als HTML (voor links, secties en metadata). Werpt nooit. */
export async function fetchWebPage(source: { url: string }): Promise<WebPaginaUitkomst> {
  const r = await haalOp(source.url, 'text/html')
  if (!r.ok) return r
  return { ok: true, html: r.body, finalUrl: r.finalUrl }
}

// `WEB_TEKST_MAX_TEKENS` / `webTekstVoorDuiding` / `fetchWebContent` stonden
// hier tot Krant 1F fase 2. Ze leverden de volledige paginatekst aan de
// duidingsstap (met een "[label]: "-prefix die die stap er weer afhaalde);
// sinds fase 2 is de grondslag uitsluitend het eigen `bron_fragment` van een
// rij, dus ze hadden geen aanroeper meer. Een geëxporteerde fetch-helper met
// "gebruikt door de duidingsstap" in zijn commentaar is de kortste weg terug
// naar precies het pad dat deze fase sloot (security-review 1F fase 2,
// bevinding 4). Fase 3 haalt een DETAILPAGINA per item op — dat is een andere
// aanroepvorm, die zijn eigen helper en security-run krijgt en `fetchWebPage`
// hieronder als basis heeft.

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
export async function loadNewsSources(supabase: SupabaseClient): Promise<NewsSources> {
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
    return { webSources: DEFAULT_WEB_SOURCES, rssFeeds: DEFAULT_RSS_FEEDS }
  }

  return { webSources, rssFeeds }
}
