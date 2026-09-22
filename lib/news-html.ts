// ── News HTML — pure, server-bepaalde lezing van een bronpagina (ADR 0176) ──
//
// Alles hier is deterministisch en zonder model: wat een artikel is, welke
// kop het draagt en welke tekst de grondslag is, leest de SERVER uit de HTML.
// Het model mag hooguit kiezen uit wat deze functies aanbieden (een index in
// een lijst links), nooit iets toevoegen — geen URL, geen kop, geen datum.
//
// LINEAIR BY DESIGN: een bronpagina is onvertrouwde invoer (tot ~2 MB). Er
// staat hier geen luie `[\s\S]*?…<\/tag>`-regex over het hele document —
// die wordt kwadratisch op een pagina vol ongesloten `<script`/`<a`-tags en
// kan de ingest laten vastlopen. Elementen worden gevonden met `indexOf` en
// een vooruitlopende wijzer; tag-regexen gebruiken `[^<>]*`, zodat elke
// poging bij de volgende `<` stopt.
//
// Bewust zonder node-imports: `lib/news-sources.ts` importeert dit en wordt
// zelf door de (client-)beheerpagina geïmporteerd voor de standaardbronnen.

// ── Tekst ────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©',
  euro: '€', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', eacute: 'é', euml: 'ë',
  iuml: 'ï', ouml: 'ö', uuml: 'ü', auml: 'ä', egrave: 'è', agrave: 'à',
}

/** Decodeer HTML-entiteiten: benoemd (beperkte set) en numeriek (&#039; &#x27;). */
export function decodeEntities(tekst: string): string {
  return tekst.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (heel, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : heel
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? heel
  })
}

// ── Lineaire element-scanner ─────────────────────────────────────────

interface Element {
  tag: string
  /** Positie van de `<` van de openingstag. */
  start: number
  /** Positie direct na de `>` van de openingstag. */
  binnen: number
  /** Positie van de `<` van de sluittag; `-1` als die ontbreekt. */
  sluit: number
  /** Positie direct na de sluittag; bij een ontbrekende sluittag het einde van de tekst. */
  eind: number
}

/**
 * Alle elementen met een van deze tags, in documentvolgorde, in één lineaire
 * doorloop. De sluittag is de eerstvolgende `</tag` (geen nesting van dezelfde
 * tag — voor script/style/a/nav/li is dat de gangbare en veilige lezing). De
 * zoektocht naar elke sluittag gebruikt een wijzer per tag die alleen
 * vooruitloopt, dus ook duizenden ongesloten tags blijven O(n).
 */
function vindElementen(html: string, tags: readonly string[]): Element[] {
  const lower = html.toLowerCase()
  const openRe = new RegExp(`<(${tags.join('|')})(?=[\\s>/])[^<>]*>`, 'gi')
  const wijzer = new Map<string, number>()
  const uit: Element[] = []
  let m: RegExpExecArray | null
  while ((m = openRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase()
    const binnen = m.index + m[0].length
    let sluit = wijzer.get(tag) ?? -2
    if (sluit !== -1 && sluit < binnen) {
      sluit = lower.indexOf(`</${tag}`, binnen)
      wijzer.set(tag, sluit)
    }
    const eindTag = sluit >= 0 ? lower.indexOf('>', sluit) : -1
    uit.push({ tag, start: m.index, binnen, sluit, eind: sluit >= 0 ? (eindTag >= 0 ? eindTag + 1 : html.length) : html.length })
  }
  return uit
}

/**
 * Knip elementen (inclusief inhoud) uit de tekst. Overlappende of geneste
 * treffers worden samengevoegd; een element zonder sluittag loopt tot het
 * einde (veilig: liever te weinig tekst dan script-inhoud als lezerstekst).
 */
function knipElementen(html: string, tags: readonly string[], ook: (e: Element) => boolean = () => true): string {
  const delen: string[] = []
  let cursor = 0
  for (const e of vindElementen(html, tags)) {
    if (e.start < cursor || !ook(e)) continue
    delen.push(html.slice(cursor, e.start), ' ')
    cursor = e.eind
  }
  delen.push(html.slice(cursor))
  return delen.join('')
}

/** HTML-commentaar weg, lineair: `indexOf('-->')` vanaf elke `<!--`. */
function zonderCommentaar(html: string): string {
  const delen: string[] = []
  let cursor = 0
  for (;;) {
    const open = html.indexOf('<!--', cursor)
    if (open < 0) break
    const dicht = html.indexOf('-->', open + 4)
    delen.push(html.slice(cursor, open), ' ')
    cursor = dicht < 0 ? html.length : dicht + 3
  }
  delen.push(html.slice(cursor))
  return delen.join('')
}

const NIET_TEKST = ['script', 'style', 'noscript', 'template', 'svg'] as const

/** Blokken waarvan de INHOUD geen lezerstekst is: script, style, JSON-LD, templates, svg, commentaar. */
function zonderNietTekst(html: string): string {
  return knipElementen(zonderCommentaar(html), NIET_TEKST)
}

/**
 * Zet HTML om naar lezerstekst: script, style, JSON(-LD), noscript, templates,
 * svg en commentaar gaan er MET inhoud uit; daarna tags weg, entiteiten
 * gedecodeerd en witruimte samengevoegd. Vóór ADR 0176 bleef de inhoud van
 * script/JSON-LD staan en vulde die tot 100 % van het modelvenster.
 */
export function stripHtml(html: string): string {
  return decodeEntities(zonderNietTekst(html).replace(/<[^<>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Knip op hoogstens `max` CODEPOINTS, nooit midden in een surrogaatpaar.
 * `String.slice` telt UTF-16-eenheden en kan een emoji halveren; Postgres
 * weigert zo'n losse surrogaat (22P02) en de rij valt dan elke run weg. De
 * CHECK's op news_articles tellen met `char_length` — ook codepoints.
 */
export function knipTekens(tekst: string, max: number): string {
  if (tekst.length <= max) return tekst
  let eenheden = 0
  let tel = 0
  for (const cp of tekst) {
    if (tel >= max) break
    eenheden += cp.length
    tel++
  }
  return tekst.slice(0, eenheden)
}

/** Normaliseer tekst voor een inhoud-hash: NFC, witruimte samengevoegd. Cijfers en hoofdletters blijven — die zíjn inhoud. */
export function normaliseerInhoud(tekst: string): string {
  return tekst.normalize('NFC').replace(/\s+/g, ' ').trim()
}

// ── Hoofdinhoud ──────────────────────────────────────────────────────

const KADERS = ['nav', 'header', 'footer', 'aside', 'form'] as const

/** Navigatie en kaders die op elke pagina gelijk zijn: geen artikel, geen grondslag. */
function zonderKaders(html: string): string {
  return knipElementen(zonderNietTekst(html), KADERS)
}

/**
 * Het deel van de pagina dat de inhoud draagt: `<main>`, anders `<article>`,
 * anders `<body>`, anders alles — zonder nav/header/footer/aside/form.
 */
export function hoofdInhoud(html: string): string {
  const lower = html.toLowerCase()
  for (const tag of ['main', 'article', 'body']) {
    const openRe = new RegExp(`<${tag}(?=[\\s>/])[^<>]*>`, 'i')
    const open = openRe.exec(html)
    if (!open) continue
    const van = open.index + open[0].length
    const tot = lower.lastIndexOf(`</${tag}`)
    if (tot >= van) return zonderKaders(html.slice(van, tot))
  }
  return zonderKaders(html)
}

/** De paginatitel: de eerste `<h1>`, anders `<title>` (zonder " | Site"-staart). */
export function paginaTitel(html: string): string {
  const inhoud = hoofdInhoud(html)
  const h1 = vindElementen(inhoud, ['h1']).find((e) => e.sluit >= 0)
  if (h1) {
    const uitH1 = stripHtml(inhoud.slice(h1.binnen, h1.sluit))
    if (uitH1) return uitH1
  }
  const title = vindElementen(html, ['title']).find((e) => e.sluit >= 0)
  return title ? stripHtml(html.slice(title.binnen, title.sluit)).split(/\s+[|–—-]\s+/)[0].trim() : ''
}

// ── web_pagina: secties ──────────────────────────────────────────────

export interface PaginaSectie {
  /** De eigen kop van de sectie (h1–h3); voor de aanhef vóór de eerste kop: de paginatitel. */
  kop: string
  /** De lezerstekst van de sectie, zonder de kop. */
  tekst: string
}

/** Secties korter dan dit zijn menu-resten of lege koppen, geen inhoud. */
export const MIN_SECTIE_TEKENS = 80

/** Blokelementen binnen een link: dan is de link een kaart of teaser, geen inline verwijzing. */
const KAART_BINNENWERK = /<(div|figure|img|picture|h[1-6]|p|ul|ol|li|time|article|section)(?=[\s>/])/i
const TEASER_TEKST = /\b(lees verder|lees meer|meer nieuws|bekijk alle|alle berichten)\b/i
const DATUM_TIJD = /\b\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}\b/

/**
 * Weer uit een sectie wat per ophaalmoment wisselt en geen inhoud van DEZE
 * pagina is: kaarten en teasers (een link met blokken erin, of met "Lees
 * verder"/een datum-tijd), en lijstregels die zo'n teaser zijn. Inline links
 * in lopende tekst blijven staan. Zonder dit gaf de Rijksoverheid-pagina bij
 * twee fetches op 20 s afstand een andere sleutel (release-review 1F, M3).
 */
function zonderTeasers(html: string): string {
  const zonderKaarten = knipElementen(html, ['a'], (e) => {
    if (e.sluit < 0) return false
    const binnen = html.slice(e.binnen, e.sluit)
    return KAART_BINNENWERK.test(binnen) || TEASER_TEKST.test(binnen) || DATUM_TIJD.test(binnen)
  })
  return knipElementen(zonderKaarten, ['li'], (e) => {
    if (e.sluit < 0) return false
    const tekst = stripHtml(zonderKaarten.slice(e.binnen, e.sluit))
    return tekst.length === 0 || TEASER_TEKST.test(tekst) || DATUM_TIJD.test(tekst)
  })
}

/**
 * Knip de hoofdinhoud op kopniveau h1–h3 in secties. Deterministisch: dezelfde
 * HTML geeft dezelfde secties in dezelfde volgorde. Teasers en kaarten gaan er
 * vóór het knippen uit (die wisselen per fetch). Identieke secties komen één
 * keer terug. `max` is een EXPLICIETE cap: wat erbuiten valt, telt de
 * aanroeper als `afgekapt` in de brongezondheid.
 */
export function extractSecties(html: string, max: number): { secties: PaginaSectie[]; afgekapt: number } {
  const inhoud = zonderTeasers(hoofdInhoud(html))
  const titel = paginaTitel(html)
  const stukken: { kop: string; van: number; tot: number }[] = []
  let vorige = { kop: titel, van: 0 }
  for (const k of vindElementen(inhoud, ['h1', 'h2', 'h3'])) {
    if (k.sluit < 0 || k.start < vorige.van) continue
    stukken.push({ kop: vorige.kop, van: vorige.van, tot: k.start })
    vorige = { kop: stripHtml(inhoud.slice(k.binnen, k.sluit)) || titel, van: k.eind }
  }
  stukken.push({ kop: vorige.kop, van: vorige.van, tot: inhoud.length })

  const gezien = new Set<string>()
  const alle: PaginaSectie[] = []
  for (const s of stukken) {
    const tekst = stripHtml(inhoud.slice(s.van, s.tot))
    if (tekst.length < MIN_SECTIE_TEKENS) continue
    const kop = s.kop || titel
    const sleutel = normaliseerInhoud(`${kop}\n${tekst}`)
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)
    alle.push({ kop, tekst })
  }
  return { secties: alle.slice(0, Math.max(0, max)), afgekapt: Math.max(0, alle.length - Math.max(0, max)) }
}

// ── web_lijst: links ─────────────────────────────────────────────────

export interface PaginaLink {
  /** Absolute URL zonder #-anker, zoals hij als `href` op de pagina staat (opgelost tegen de pagina-URL). */
  url: string
  /** De linktekst: de eigen kop van het item in de lijst. */
  tekst: string
  /** De lijstregel rond de link (datum, teaser) — de bewaarde grondslag. */
  fragment: string
}

/** Kortere linkteksten zijn menu-items ("Home", "Meer") en geen artikelkop. */
export const MIN_LINKTEKST_TEKENS = 12
const FRAGMENT_MAX_TEKENS = 400

const BLOK_OPEN = /<(li|article|tr|p|div|dd|dt|section|h[1-6])(?=[\s>/])[^<>]*>/gi
const BLOK_DICHT = /<\/(li|article|tr|p|div|dd|dt|section|h[1-6])\s*>|<a(?=[\s>])/gi

/** Alle eindposities (open) of beginposities (dicht) van een patroon, oplopend — één doorloop. */
function posities(re: RegExp, tekst: string, eind: boolean): number[] {
  re.lastIndex = 0
  const uit: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(tekst)) !== null) uit.push(eind ? m.index + m[0].length : m.index)
  return uit
}

/** Grootste waarde ≤ pos (of -1). Binair zoeken op een oplopende lijst. */
function laatsteTot(lijst: number[], pos: number): number {
  let lo = 0, hi = lijst.length - 1, best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lijst[mid] <= pos) { best = lijst[mid]; lo = mid + 1 } else hi = mid - 1
  }
  return best
}

/** Kleinste waarde ≥ pos (of `fallback`). */
function eersteVanaf(lijst: number[], pos: number, fallback: number): number {
  let lo = 0, hi = lijst.length - 1, best = fallback
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lijst[mid] >= pos) { best = lijst[mid]; hi = mid - 1 } else lo = mid + 1
  }
  return best
}

function zelfdeSite(a: URL, b: URL): boolean {
  const kaal = (h: string) => h.toLowerCase().replace(/^www\./, '')
  return kaal(a.hostname) === kaal(b.hostname)
}

/**
 * Alle links in de hoofdinhoud die een artikel kúnnen zijn: http(s), dezelfde
 * site als de GECONFIGUREERDE bron-URL, niet de pagina zelf en geen variant
 * van de pagina met alleen een andere query (filters als `?facet_author=`),
 * met een linktekst van betekenis. Ontdubbeld op URL (de eerste wint), in
 * paginavolgorde. `max` is een EXPLICIETE cap. Lineair: blokgrenzen worden één
 * keer verzameld en per link binair gezocht.
 *
 * De URL komt letterlijk uit een `href` op de pagina: dit is de enige plek
 * waar een artikel-URL voor een `web_lijst` vandaan mag komen (ADR 0176). De
 * ingest laat het model alleen een INDEX in deze lijst kiezen; die constructie
 * — niet een latere vergelijking — is de garantie dat er geen verzonnen URL
 * binnenkomt.
 */
export function extractLinks(
  html: string,
  paginaUrl: string,
  max: number,
  /** De geconfigureerde bron-URL: de grens voor "dezelfde site". Standaard `paginaUrl`. */
  siteUrl: string = paginaUrl,
): { links: PaginaLink[]; afgekapt: number } {
  let basis: URL
  let site: URL
  try {
    basis = new URL(paginaUrl)
    site = new URL(siteUrl)
  } catch {
    return { links: [], afgekapt: 0 }
  }
  const padVan = (u: URL) => `${u.origin.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`
  const zelfPaden = new Set([padVan(basis), padVan(site)])
  const inhoud = hoofdInhoud(html)
  const opens = posities(BLOK_OPEN, inhoud, true)
  const dichten = posities(BLOK_DICHT, inhoud, false)
  const linkEindes = posities(/<\/a\s*>/gi, inhoud, true)
  const gezien = new Set<string>()
  const alle: PaginaLink[] = []
  for (const a of vindElementen(inhoud, ['a'])) {
    if (a.sluit < 0) continue
    const tag = inhoud.slice(a.start, a.binnen)
    const hrefM = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const href = decodeEntities((hrefM?.[1] ?? hrefM?.[2] ?? '').trim())
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href)) continue
    let doel: URL
    try {
      doel = new URL(href, basis)
    } catch {
      continue
    }
    if (doel.protocol !== 'https:' && doel.protocol !== 'http:') continue
    if (!zelfdeSite(doel, site)) continue
    doel.hash = ''
    // De pagina zelf, of dezelfde pagina met alleen een andere query (filter/sortering): geen artikel.
    if (zelfPaden.has(padVan(doel))) continue
    const url = doel.toString()
    const tekst = stripHtml(inhoud.slice(a.binnen, a.sluit))
    if (tekst.length < MIN_LINKTEKST_TEKENS) continue
    if (gezien.has(url)) continue
    gezien.add(url)
    const van = Math.max(laatsteTot(opens, a.start), laatsteTot(linkEindes, a.start - 1), 0)
    const tot = eersteVanaf(dichten, a.eind, inhoud.length)
    const fragment = knipTekens(stripHtml(inhoud.slice(van, tot)), FRAGMENT_MAX_TEKENS)
    alle.push({ url, tekst, fragment: fragment || tekst })
  }
  return { links: alle.slice(0, Math.max(0, max)), afgekapt: Math.max(0, alle.length - Math.max(0, max)) }
}

const MAANDEN = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december'
const DATUM_VOORAAN = new RegExp(`^\\d{1,2}\\s+(${MAANDEN})\\s+\\d{4}\\s+`, 'i')
const DATUM_ACHTERAAN = /\s+\d{1,2}-\d{1,2}-\d{4}(\s+\d{1,2}:\d{2})?$/

/**
 * De kop van een lijstitem: de linktekst zonder de datum die sommige sites in
 * de link zetten (CBS "… 4-9-2026 06:30", CPB "14 augustus 2026 …"). De datum
 * blijft in het fragment staan; de kop wordt er alleen leesbaar van. Valt er
 * niets over, dan blijft de linktekst zoals hij was.
 */
export function kopUitLinktekst(tekst: string): string {
  const kaal = tekst.replace(DATUM_VOORAAN, '').replace(DATUM_ACHTERAAN, '').trim()
  return kaal.length >= MIN_LINKTEKST_TEKENS ? kaal : tekst
}

// ── Bronmetadata: datums ─────────────────────────────────────────────

export interface BronDatums {
  /** `dateModified` / `article:modified_time`, als ISO-tijdstip. */
  gewijzigd: string | null
  /** `datePublished` / `article:published_time`, als ISO-tijdstip. */
  gepubliceerd: string | null
}

function isoOfNull(waarde: unknown): string | null {
  if (typeof waarde !== 'string' || !waarde.trim()) return null
  const d = new Date(waarde.trim())
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function zoekSleutel(node: unknown, sleutel: string, diepte = 0): unknown {
  if (diepte > 6 || node === null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const kind of node) {
      const v = zoekSleutel(kind, sleutel, diepte + 1)
      if (v !== undefined) return v
    }
    return undefined
  }
  const obj = node as Record<string, unknown>
  if (sleutel in obj) return obj[sleutel]
  for (const kind of Object.values(obj)) {
    const v = zoekSleutel(kind, sleutel, diepte + 1)
    if (v !== undefined) return v
  }
  return undefined
}

function metaInhoud(html: string, eigenschap: string): string | null {
  const re = /<meta(?=[\s/])[^<>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const naam = /\b(?:property|name)\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]
    if (naam?.toLowerCase() === eigenschap) return /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null
  }
  return null
}

/** Hoogstens zoveel JSON-LD-blokken lezen: een vijandige pagina met duizenden blokken kost dan geen JSON.parse per blok. */
const MAX_JSON_LD_BLOKKEN = 10

/**
 * Lees de publicatie- en wijzigingsdatum uit de metadata van de bron (JSON-LD,
 * dan Open Graph-`article:*`). Nooit uit lopende tekst en nooit van het model.
 */
export function extractBronDatums(html: string): BronDatums {
  let gewijzigd: string | null = null
  let gepubliceerd: string | null = null
  let gelezen = 0
  for (const s of vindElementen(html, ['script'])) {
    if (gewijzigd && gepubliceerd) break
    if (s.sluit < 0 || gelezen >= MAX_JSON_LD_BLOKKEN) continue
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(html.slice(s.start, s.binnen))) continue
    gelezen++
    try {
      const json: unknown = JSON.parse(html.slice(s.binnen, s.sluit))
      gewijzigd ??= isoOfNull(zoekSleutel(json, 'dateModified'))
      gepubliceerd ??= isoOfNull(zoekSleutel(json, 'datePublished'))
    } catch {
      // Ongeldige JSON-LD: negeren, de andere bronnen kunnen nog.
    }
  }
  gewijzigd ??= isoOfNull(metaInhoud(html, 'article:modified_time'))
  gepubliceerd ??= isoOfNull(metaInhoud(html, 'article:published_time'))
  return { gewijzigd, gepubliceerd }
}
