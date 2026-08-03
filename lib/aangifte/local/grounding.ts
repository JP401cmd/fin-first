// ── Aangifte on-device: bedrag-grounding en sanity-checks ────────────────────
//
// DE BELANGRIJKSTE GUARDRAIL VAN HET HELE LOKALE AANGIFTE-PAD.
//
// Deze bedragen zijn geen tekst. Ze landen via de import in `assets`/`debts` en
// daarmee in de rekenmotoren: netto vermogen, Box 3-forfait, vrijheidsdatum. Een
// 2B-model dat een cijfer verkeerd overtypt (€ 18.200 → € 1.820) levert geen
// "iets minder goed antwoord" maar een verkeerd vermogen dat er volstrekt
// geloofwaardig uitziet.
//
// Daarom draaien we de bewijslast om. Het model mag KIEZEN (welk label hoort bij
// welk type) maar niet REKENEN of OVERTYPEN met vertrouwen: elk geëxtraheerd
// bedrag moet LETTERLIJK in het bronvenster staan. Staat het er niet, dan wordt
// de rij VERWORPEN — niet gecorrigeerd, niet afgerond, niet "dichtstbijzijnde
// waarde gepakt". Corrigeren zou betekenen dat we raden welk bedrag het model
// bedoelde, en dat is precies de fout die we proberen te vermijden.
//
// De review-stap blijft daarnaast verplicht. Grounding zegt "dit getal stond
// écht in je aangifte", niet "dit getal hoort écht bij deze rij".

/**
 * Alle bedrag-achtige getallen die letterlijk in een tekstvenster staan.
 *
 * Herkent de vormen die de Belastingdienst afdrukt: "€ 12.345,67", "€ 3.450",
 * "18.200", "65000". De euro-tekens en de duizendtal-punten worden weggehaald,
 * de decimaalkomma wordt een punt.
 *
 * BEWUST RUIM. Liever een paar getallen te veel in de set (een WOZ-jaartal, een
 * paginanummer) dan één te weinig: een te krappe set zou legitieme rijen laten
 * vervallen, en de review-stap vangt een fout type alsnog af. De set is een
 * bewijsmiddel tégen verzinsels, geen typering.
 */
export function collectVerbatimAmounts(window: string): Set<number> {
  const out = new Set<number>()
  // Getallen met NL-duizendtalpunten en/of decimaalkomma, of kaal.
  const re = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(window)) !== null) {
    const raw = m[0]
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/\./g, '')
    const n = Number(normalized)
    if (Number.isFinite(n)) out.add(n)
  }
  return out
}

/**
 * Staat dit bedrag letterlijk in het venster?
 *
 * De vergelijking loopt op centen (×100, afgerond) zodat 12345.67 en 12345.670
 * hetzelfde zijn. Daarnaast accepteren we de HELE-EURO-variant van een bedrag
 * met centen: de aangifte drukt soms "€ 3.450,00" af terwijl het model "3450"
 * teruggeeft. Dat is geen verzinsel maar dezelfde waarde.
 */
export function isAmountGrounded(amount: number, amounts: Set<number>): boolean {
  if (!Number.isFinite(amount)) return false
  const cents = Math.round(amount * 100)
  for (const candidate of amounts) {
    if (Math.round(candidate * 100) === cents) return true
    // "3.450,00" in de tekst ↔ 3450 uit het model (en andersom).
    if (Math.round(candidate) === Math.round(amount) && Number.isInteger(amount)) return true
  }
  return false
}

/**
 * Parse een bedrag zoals het model het teruggeeft. Accepteert een getal of een
 * string in NL- of EN-notatie. Geeft `null` bij alles wat niet ondubbelzinnig
 * een bedrag is — dan volgt sowieso verwerping.
 */
export function parseAangifteAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.abs(raw) : null
  if (typeof raw !== 'string') return null

  let s = raw.trim().replace(/[€\s]/g, '').replace(/^-/, '')
  if (!s) return null
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? Math.abs(n) : null
}

// ── Sanity-checks ───────────────────────────────────────────────────────────
//
// Grounding bewijst dat een getal in de tekst stond — niet dat het een
// plausibele waarde is voor het veld waar het in landt. Een paginanummer (3) is
// letterlijk aanwezig en zou als spaarsaldo van € 3 door de grounding glippen.
// Deze grenzen markeren zulke waarden als ONBEKEND (rij vervalt) in plaats van
// ze door te laten naar de rekenmotoren.

/** Onder- en bovengrens per veldsoort. Ruim gekozen: dit vangt onzin, niet nuance. */
export const SANITY_LIMITS = {
  /** Bezitting/schuld op peildatum. €25 ondergrens: daaronder is het ruis. */
  balance: { min: 25, max: 50_000_000 },
  /** Bruto Box 1-jaarbedrag. €100 ondergrens, €10 mln bovengrens. */
  annual: { min: 100, max: 10_000_000 },
  /** WOZ-waarde van een woning. */
  woz: { min: 10_000, max: 25_000_000 },
  /** Rentepercentage per jaar. */
  rate: { min: 0, max: 25 },
} as const

export function withinSanity(value: number, limit: { min: number; max: number }): boolean {
  return Number.isFinite(value) && value >= limit.min && value <= limit.max
}

// ── NEGEER-lijst: BSN, IBAN en namen mogen nooit in een naamveld landen ──────
//
// De cloud-prompt waarschuwt het model expliciet dat BSN/NAW/IBAN niet in velden
// mogen belanden, en `extractionSchema` is `.strict()` zodat er geen extra
// sleutels bijkomen. Maar `.strict()` bewaakt de SLEUTELS, niet de INHOUD: een
// model dat "ING Bank NL91ABNA0417164300" als naam teruggeeft, komt er zo
// doorheen. Vandaar deze extra zeef óp de uitgaande naamvelden, vóór ze de
// review-UI halen.

/** Negen aaneengesloten cijfers met woordgrenzen — de BSN-vorm (zie strip-bsn.ts). */
const BSN_RE = /\b\d{9}\b/g
/** IBAN: landcode + controlegetal + 10-30 alfanumerieke tekens. */
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi
/** Markers die de upstream-strip achterlaat. */
const MARKER_RE = /\[(?:BSN|NAAM)\]/g
/** Losse cijferreeksen van 6+ (rekeningnummer-resten, dossiernummers). */
const LONG_DIGITS_RE = /\b\d{6,}\b/g

/**
 * Maak een door het model geleverde naam veilig voor de review-UI.
 *
 * Verwijdert BSN-vormen, IBAN's, strip-markers en lange cijferreeksen, en kapt
 * af op 60 tekens. Blijft er te weinig over om iets te herkennen, dan geeft de
 * functie `null` terug en gebruikt de aanroeper een generiek label — een lege
 * naam in de review-stap is onbruikbaar, een verminkte naam misleidend.
 */
export function sanitizeExtractedName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .replace(MARKER_RE, ' ')
    .replace(IBAN_RE, ' ')
    .replace(BSN_RE, ' ')
    .replace(LONG_DIGITS_RE, ' ')
    // Losse leestekens die na het knippen overblijven.
    .replace(/[|;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–—,.:]+|[-–—,.:]+$/g, '')
    .trim()

  if (cleaned.length < 2) return null
  return cleaned.length > 60 ? cleaned.slice(0, 60).trim() : cleaned
}

/**
 * Bevat deze tekst nog een BSN- of IBAN-vorm? Gebruikt als eindcontrole in de
 * tests en als goedkope assertie vóór het resultaat de review-UI in gaat.
 */
export function containsIdentifier(text: string): boolean {
  BSN_RE.lastIndex = 0
  IBAN_RE.lastIndex = 0
  return BSN_RE.test(text) || IBAN_RE.test(text)
}
