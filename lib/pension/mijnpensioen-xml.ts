/**
 * mijnpensioen-xml — SERIALISATIE-ADAPTER voor de XML-export van
 * mijnpensioenoverzicht.nl (`pensioenaanspraken.xml`).
 *
 * Dit is GEEN tweede import. Stichting Pensioenregister publiceert één
 * gecombineerde datamodel-specificatie (`Specificatie-xml-json-download-v1.2`):
 * XML en JSON zijn twee serialisaties van hetzelfde objectmodel. Deze module
 * zet de XML om naar exact dezelfde objectboom die `JSON.parse()` van de
 * JSON-export oplevert, waarna de bestaande, ongewijzigde keten het werk doet:
 *
 *   parseMijnpensioenXml()  →  mijnpensioenJsonToParseResult()   (mapper)
 *                           →  reconcilePensionPots()            (dedup)
 *                           →  applyPensionPots()                (write)
 *
 * De pariteitstest in mijnpensioen-xml.test.ts vergrendelt dat uitgangspunt:
 * dezelfde logische inhoud als XML en als JSON moet een identiek
 * `PensionParseResult` opleveren. Dat is óók de idempotentiegarantie voor de
 * import: de dedup-sleutel van reconcile.ts is de genormaliseerde fondsnaam,
 * dus wie eerst de JSON en later de XML aanbiedt (of tweemaal dezelfde XML)
 * krijgt `update`, niet een tweede pot.
 *
 * WAAROM CLIENT-SIDE (bewuste afwijking van ADR 0058): het pensioenoverzicht
 * verlaat het toestel niet. Zie docs/adr/0115-pensioen-import-blijft-op-het-toestel.md.
 *
 * ── De twee stille valkuilen die deze adapter oplost ────────────────────────
 *
 * 1. SINGLE-ELEMENT-ARRAY. In XML is één `<Pensioen>` geen array. Een naïeve
 *    conversie levert dan een object waar de mapper een array verwacht;
 *    `asArray()` geeft `[]` en een gebruiker met ÉÉN pensioenpot krijgt
 *    stilzwijgend NUL potten — zonder foutmelding. Daarom worden alle bekende
 *    herhaalbare knopen (`REPEATABLE_NODES`) hard geforceerd tot een array,
 *    ongeacht hoe vaak ze voorkomen.
 *
 * 2. GETALLEN ALS STRING. XML kent geen getaltype: `<TeBereiken>14400</TeBereiken>`
 *    komt binnen als de string `"14400"`. De mapper's `asNumber()` accepteert
 *    alléén `typeof x === 'number'`, dus zonder coërcie wordt élk bedrag `null`
 *    → alle potten 0 → allemaal overgeslagen. Ook stil. Daarom coërceren we
 *    canonieke getalteksten naar `number`.
 *
 *    De coërcie heeft twee vangrails, want `StatusCode` is "000" en MOET een
 *    string blijven (`asString(root.StatusCode) !== '000'` → anders wordt élke
 *    geldige export afgekeurd):
 *      a. `TEXT_ONLY_FIELDS` — de velden die de mapper via `asString()` leest,
 *         worden nooit gecoërceerd.
 *      b. Alleen CANONIEKE getalnotatie coërceert; "000" heeft voorloopnullen
 *         en blijft dus sowieso een string.
 */

import {
  validateMijnpensioenRoot,
  type ParseOk,
  type ParseErr,
} from '@/lib/pension/mijnpensioen-json'

// ── Contract-constanten ─────────────────────────────────────────────────────

/**
 * Knopen die in het datamodel een LIJST zijn en in XML als herhaalde elementen
 * verschijnen. Deze worden altijd tot een array geforceerd — ook bij precies
 * één (of nul) voorkomen. Spiegelt elke `asArray()`-aanroep in
 * mijnpensioen-json.ts; groeit die lijst, dan groeit deze mee.
 */
const REPEATABLE_NODES: ReadonlySet<string> = new Set([
  'OuderdomsPensioen', // Details.OuderdomsPensioenDetails.OuderdomsPensioen[]
  'Pensioen', // gegarandeerde regelingen binnen een blok
  'IndicatiefPensioen', // indicatieve regelingen binnen een blok
  'PartnerPensioen', // Details.PartnerPensioenDetails.PartnerPensioen[]
  'OntbrekendePuvsError', // top-level foutlijst
  'Bijzonderheden', // top-level meldingenlijst
])

/**
 * Velden die de mapper via `asString()` leest en die dus NOOIT naar een getal
 * mogen worden gecoërceerd. `StatusCode` is de kritieke: "000" moet "000"
 * blijven. De overige zijn namen/codes waar een numerieke waarde weliswaar
 * onwaarschijnlijk is, maar coërcie puur schade zou doen.
 */
const TEXT_ONLY_FIELDS: ReadonlySet<string> = new Set([
  'StatusCode',
  'PensioenUitvoerder',
  'OuderdomsPensioenEvent',
  'PartnerEvent',
  'HerkenningsNummer',
])

/** XML Schema instance-namespace, voor `xsi:nil="true"`. */
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

/**
 * Canonieke decimale getalnotatie: optioneel minteken, geen voorloopnullen,
 * optioneel decimaaldeel. Bewust STRIKT — "000", "01", "1e3", "12,50" en
 * "ALF-001" vallen er allemaal buiten en blijven string.
 */
const CANONICAL_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

// ── DOM → objectboom ────────────────────────────────────────────────────────

/**
 * Zet de tekstinhoud van een blad-element om naar de waarde die de mapper
 * verwacht: `null` voor leeg, `number` voor canonieke getallen, anders string.
 */
function coerceLeaf(localName: string, raw: string): unknown {
  const text = raw.trim()
  if (text === '') return null
  if (TEXT_ONLY_FIELDS.has(localName)) return text
  if (CANONICAL_NUMBER.test(text)) {
    const n = Number(text)
    if (Number.isFinite(n)) return n
  }
  return text
}

/**
 * Recursieve conversie van één element naar een JSON-achtige waarde.
 *
 * - `xsi:nil="true"` (of een kaal `nil="true"`) → `null`.
 * - Geen kind-elementen → blad: `coerceLeaf()`.
 * - Wel kind-elementen → record. Per kindnaam: een array als de naam in
 *   `REPEATABLE_NODES` staat óf als de naam meer dan eens voorkomt; anders de
 *   enkele waarde. Lege elementen (`<Bijzonderheden/>`) vallen binnen een array
 *   weg, want dat is in XML de natuurlijke schrijfwijze voor "lege lijst".
 *
 * We gebruiken bewust `localName` en niet `tagName`: levert het register de
 * export ooit met een namespace-prefix (`<pr:Pensioen>`), dan blijven de
 * sleutels identiek aan de JSON-variant.
 */
function elementToValue(el: Element): unknown {
  if (el.getAttributeNS(XSI_NS, 'nil') === 'true' || el.getAttribute('nil') === 'true') {
    return null
  }

  const kinderen = Array.from(el.children)
  if (kinderen.length === 0) {
    return coerceLeaf(el.localName, el.textContent ?? '')
  }

  const perNaam = new Map<string, Element[]>()
  for (const kind of kinderen) {
    const bestaand = perNaam.get(kind.localName)
    if (bestaand) bestaand.push(kind)
    else perNaam.set(kind.localName, [kind])
  }

  const record: Record<string, unknown> = {}
  for (const [naam, elementen] of perNaam) {
    const waarden = elementen.map(elementToValue)
    if (REPEATABLE_NODES.has(naam) || waarden.length > 1) {
      record[naam] = waarden.filter((w) => w !== null)
    } else {
      record[naam] = waarden[0]
    }
  }
  return record
}

// ── Publieke API ────────────────────────────────────────────────────────────

/**
 * Parse + valideer een mijnpensioenoverzicht.nl XML-export
 * (`pensioenaanspraken.xml`).
 *
 * Levert bij succes exact dezelfde `data`-boom als `parseMijnpensioenJson()`
 * op de JSON-export, zodat `mijnpensioenJsonToParseResult()` er ongewijzigd
 * overheen kan.
 *
 * - Geen DOMParser beschikbaar (server-side) → `{ ok:false }`.
 * - Onleesbare XML → `{ ok:false }`.
 * - `StatusCode !== "000"` → `{ ok:false }` (gedeelde logica met JSON).
 * Throwt nooit.
 */
export function parseMijnpensioenXml(text: string): ParseOk | ParseErr {
  const ongeldig = 'Ongeldig XML-bestand.'

  // Deze module hoort op het toestel te draaien (zie ADR 0115). Wordt hij per
  // ongeluk server-side aangeroepen, dan is dat een nette fout, geen throw.
  if (typeof DOMParser === 'undefined') {
    return {
      ok: false,
      error: 'XML-bestanden kunnen alleen in je browser worden gelezen.',
    }
  }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml')
  } catch {
    return { ok: false, error: ongeldig }
  }

  const root = doc.documentElement
  // Browsers én jsdom melden een syntaxfout met een <parsererror>-document;
  // sommige plaatsen die als kind in plaats van als wortel.
  if (
    !root ||
    root.localName === 'parsererror' ||
    doc.getElementsByTagName('parsererror').length > 0
  ) {
    return { ok: false, error: ongeldig }
  }

  // De XML-wortel is de omhulling van wat in JSON het top-level object is;
  // de KINDEREN van de wortel zijn dus de top-level sleutels.
  const data = elementToValue(root)

  return validateMijnpensioenRoot(data, ongeldig)
}
