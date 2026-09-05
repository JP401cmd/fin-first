// lib/parsers/iban.ts
// Eén plek voor "haal een IBAN uit vrije tekst" — met de rem erop.
//
// Aanleiding (UR3-02): bij een TrueLayer-sync komt de tegenrekening uitsluitend
// uit `meta.counter_party_iban`. Nederlandse xs2a-banken vullen dat veld notoir
// niet bij een overboeking tussen twee eigen rekeningen; de IBAN staat dan wél
// in de omschrijving. Zonder tegenrekening kan `isOwnAccountTransfer` niet
// grijpen, valt de rij door naar gewone keyword-categorisatie, en telt een
// spaarstorting als uitgave — op vier oppervlakken tegelijk.
//
// Waarom een eigen module en geen losse regex in de mapper: een afgeleide
// tegenrekening is GEEN cosmetisch veld. Hij bepaalt of een transactie op
// `transaction_type='transfer'` landt, en dat verwijdert 'm uit de uitgaven, de
// spaarquote en de budgetrealisatie. Een verkeerd geraden IBAN is dus net zo
// schadelijk als een gemiste — vandaar de twee remmen hieronder.

/**
 * IBAN-vorm: landcode (2) + controlegetal (2) + 10–30 alfanumerieke tekens.
 * Bewust ruimer dan het Nederlandse formaat: een buitenlandse tegenrekening is
 * net zo goed een eigen rekening.
 */
const IBAN_PATTERN = /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/g

/**
 * IBAN-controlegetal (ISO 13616 / mod-97-10).
 *
 * Dit is de eerste rem. Zonder deze toets matcht het patroon hierboven ook
 * ruis die toevallig zo begint — bv. een referentiecode of een productnummer in
 * de omschrijving. Een geldig controlegetal maakt een toevalstreffer ~1 op 97.
 */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false

  // Verplaats de eerste vier tekens naar achteren en vervang letters door
  // hun positie + 9 (A=10 … Z=35). Daarna: rest bij deling door 97 moet 1 zijn.
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0)
    const digits =
      code >= 65 && code <= 90
        ? String(code - 55) // A–Z → 10–35
        : ch
    for (const d of digits) {
      remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97
    }
  }
  return remainder === 1
}

/**
 * Haal de tegenrekening uit vrije tekst — of niets, als het niet éénduidig is.
 *
 * Dit is de tweede rem: staan er méér verschillende geldige IBANs in de tekst
 * (bv. zowel de eigen als de tegenrekening, of een doorbelasting), dan kunnen
 * wij niet weten welke de tegenpartij is. Dan geven we `null` terug en blijft
 * de bestaande situatie ongewijzigd: liever een gemiste herkenning (die de
 * gebruiker via de herstelbanner alsnog kan corrigeren) dan een verzonnen
 * tegenrekening die een echte uitgave stil uit de uitgaven laat verdwijnen.
 *
 * @param text vrije tekst (omschrijving/mededelingen) uit de bron
 * @param exclude IBANs die géén tegenpartij kunnen zijn — in de praktijk de
 *   rekening waarop de transactie zelf staat. Genormaliseerd vergeleken.
 */
export function extractIbanFromText(
  text: string | null | undefined,
  exclude: Iterable<string> = [],
): string | null {
  if (!text) return null

  const excluded = new Set<string>()
  for (const e of exclude) {
    if (e && e.trim()) excluded.add(e.replace(/\s/g, '').toUpperCase())
  }

  // Bewust alleen de AANEENGESCHREVEN vorm — dat is wat de TrueLayer-
  // omschrijving van de Nederlandse banken levert. Ook de gespatieerde vorm
  // ("NL20 INGB 0001 2345 67") willen herkennen vraagt om witruimte weggooien,
  // en dán plakt een omschrijving als "…0001 2345 67 spaarrekening" net zo
  // makkelijk het volgende woord aan de IBAN vast: het resultaat is een
  // GEMISTE herkenning die er als een bug uitziet, of erger, een geplakte
  // treffer. Blijft dit een gat in de praktijk, dan hoort daar een eigen,
  // getoetst formaat-patroon bij — geen `replace(/\s/g,'')` over de hele tekst.
  const found = new Set<string>()
  for (const match of text.toUpperCase().matchAll(IBAN_PATTERN)) {
    const candidate = match[1]
    if (!isValidIban(candidate)) continue
    if (excluded.has(candidate)) continue
    found.add(candidate)
  }

  if (found.size !== 1) return null
  return [...found][0]
}
