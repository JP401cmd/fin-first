// Pure, side-effect-vrije route-normalisatie voor de web-vitals / RUM-collectie.
//
// AVG-GARANTIE: dit is de plek waar identificerende padsegmenten (record-id's,
// tokens, UUID's) worden weggeschraapt vóórdat een route in `web_vitals` belandt.
// De tabel mag NOOIT een id bevatten dat een individu of record herleidbaar
// maakt. Daarom scrubben we conservatief: bij twijfel wordt een segment `[id]`.
// Over-scrubben is privacy-veilig; onder-scrubben is een datalek. De API-route
// draait deze functie server-side op de client-waarde (client niet vertrouwen),
// en een corpus-unittest bewaakt het gedrag.

/** Maximaal aantal padsegmenten dat we bewaren (defensief tegen absurde diepte). */
const MAX_SEGMENTS = 12

/** Harde bovengrens op de lengte van de genormaliseerde route (defensief). */
const MAX_LENGTH = 512

/** Volledige v1–v5 UUID (hex + koppeltekens). Bevat níet altijd een cijfer. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Puur numeriek segment — bijna altijd een record-id (`/bezittingen/42`). */
const NUMERIC_RE = /^\d+$/

/**
 * Lang hex-/token-segment (≥16 hex-chars). Vangt hex-tokens die géén cijfer
 * bevatten (bv. `deadbeefdeadbeef`) en dus door de cijfer-heuristiek glippen.
 */
const HEX_TOKEN_RE = /^[0-9a-f]{16,}$/

/** Bevat het segment een cijfer? Conservatieve id-indicator (zie allowlist). */
const HAS_DIGIT_RE = /\d/

/**
 * Bekende route-segmenten die legitiem een cijfer bevatten en dus GEEN id zijn.
 * Zonder deze allowlist zou de cijfer-heuristiek betekenisvolle routes als
 * `/belasting/box3` verminken tot `[id]` en de analytics waardeloos maken.
 *
 * ONDERHOUD: voeg hier elk nieuw route-segment toe dat een cijfer bevat maar een
 * echt woord is (afgeleid uit de app-routes, niet gegokt). Huidige set gescand
 * uit `app/**`: de belasting-boxen, de box1-inkomenspagina en de broker-koppeling.
 */
const KNOWN_WORDS_WITH_DIGITS = new Set([
  'box1',
  'box1-income',
  'box2',
  'box3',
  'trading212',
])

/**
 * Beslist per segment: houden (echt woord) of vervangen door `[id]`.
 * Volgorde is bewust: de expliciete id-vormen (UUID, puur numeriek, hex-token)
 * eerst — die vangen ook id's zónder cijfer — daarna de conservatieve
 * cijfer-heuristiek met allowlist.
 *
 * RESTRISICO (onder-scrub): een opaak, laag-entropisch token ZONDER cijfer en
 * <16 non-hex tekens (bv. een base64url share-token) zou als "woord" blijven
 * staan. Vandaag bestaat zo'n page-route niet — alle dynamische segmenten in
 * `app/**` zijn uuid/getal of een woord-slug. Voeg je ooit een share/invite/
 * reset-route met een opaak token ÍN het pad toe, scrub dat segment dan
 * expliciet (of stuur voor feature 885 het Next-route-template i.p.v. de
 * concrete pathname).
 */
function scrubSegment(segment: string): string {
  const lower = segment.toLowerCase()

  if (UUID_RE.test(lower)) return '[id]'
  if (NUMERIC_RE.test(lower)) return '[id]'
  if (HEX_TOKEN_RE.test(lower)) return '[id]'

  // Conservatief: bevat het een cijfer en is het geen bekend woord → id.
  if (HAS_DIGIT_RE.test(lower) && !KNOWN_WORDS_WITH_DIGITS.has(lower)) {
    return '[id]'
  }

  return segment
}

/**
 * Normaliseert een pathname tot een id-vrije, geaggregeerde route.
 *
 * @param pathname bv. `window.location.pathname` (mag query/hash bevatten)
 * @returns bv. `/overzicht/bezittingen/[id]` — nooit een herleidbaar id, altijd
 *          beginnend met `/`; lege input of `/` levert `'/'`.
 */
export function scrubRoute(pathname: string): string {
  // Defensief tegen niet-string-input (de tabel mag nooit rommel krijgen).
  if (typeof pathname !== 'string' || pathname.length === 0) return '/'

  // 1) Knip query-string en hash af (alles vanaf `?` of `#`).
  const cut = pathname.search(/[?#]/)
  const path = (cut === -1 ? pathname : pathname.slice(0, cut)).trim()

  if (path === '' || path === '/') return '/'

  // 2) Split op `/` en gooi lege segmenten weg (leidende/dubbele/afsluitende `/`).
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return '/'

  // 3) Cap op diepte, scrub per segment.
  const scrubbed = segments.slice(0, MAX_SEGMENTS).map(scrubSegment)

  // 4) Herbouw + defensieve lengte-cap. De scrub is al gebeurd, dus een harde
  //    afkap kan nooit alsnog een id lekken.
  const result = '/' + scrubbed.join('/')
  return result.length > MAX_LENGTH ? result.slice(0, MAX_LENGTH) : result
}
