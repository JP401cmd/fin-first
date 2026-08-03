// ── Aangifte on-device: sectie-eigen micro-prompts ───────────────────────────
//
// De cloud-systeemprompt (lib/aangifte/system-prompt.ts) is ~7k tekens: kernregels,
// een NEGEER-lijst, vijf uitgeschreven herkenningsvoorbeelden, een volledige
// MAPPING-MATRIX en een kwaliteitschecklist. Daar bovenop komt lokaal nog de
// zod-`.describe()`-laag, want zonder constrained decoding moet het schema óók in
// de prompt. Samen past dat niet naast een aangiftetekst in 8192 tokens.
//
// Hier staat per DEELVRAAG een eigen mini-prompt met alleen het fragment van de
// mapping dat voor die vraag telt. Een venster met bankrekeningen krijgt de
// bezittingen-mapping en niets over Box 1-inkomen; het venster met schulden
// omgekeerd. Liever zes tot tien kleine, crash-vrije beurten dan één die het
// venster sloopt.
//
// WAT HET MODEL WEL EN NIET DOET. Het kiest per rij het LABEL en het TYPE. Het
// bedrag mag het overtypen, maar dat wordt daarna letterlijk tegen het
// bronvenster geverifieerd (lib/aangifte/local/grounding.ts) — een bedrag dat
// daar niet in staat wordt verworpen, niet gecorrigeerd. Peildatum en
// aangiftejaar komen helemaal niet uit het model: die zijn deterministisch uit de
// tekst te lezen (section-select.ts).
//
// GEEN ADMIN-OVERRIDE. De cloud-extractie leest `app_settings
// .aangifte_extraction_prompt`. Dat pad bestaat hier bewust niet: een uitgebreide
// override zou het gecondenseerde budget opblazen en de extractie stilzwijgend
// laten afkappen.
//
// Wóórding hoort bij `ai-specialist-prompt-dna`; dit bestand bezit de assemblage.

import type { AangifteSectionKind } from './section-select'

/**
 * Gedeelde systeem-DNA voor alle beurten (~0,7k tekens ≈ 180 tokens). Rol, de
 * NEGEER-regel in één zin, en het uitvoerformaat.
 */
export const LOCAL_AANGIFTE_DNA = `Je bent de data-extractor van TriFinity, een Nederlandse app voor financiële vrijheid. Je leest één blok uit een Nederlandse aangifte inkomstenbelasting en zet de rijen om in JSON.

REGELS: neem UITSLUITEND rijen over die letterlijk in het blok staan. Verzin nooit een bedrag en reken nooit iets uit. Neem NOOIT een BSN, adres, geboortedatum of rekeningnummer over in een naam — alleen de menselijke omschrijving. Weet je een type niet zeker, kies dan "other".

ANTWOORD ALTIJD met alleen JSON — geen uitleg, geen markdown-fences, geen \`\`\`.`

/** Bezittingen-mapping — het fragment van de MAPPING-MATRIX dat hier telt. */
const ASSET_MAPPING = `- betaal-/lopende rekening → cash
- spaarrekening, deposito → savings
- effectendepot, beleggingsfonds, aandelenportefeuille → investment
- eigen woning / hoofdverblijf (WOZ-waarde) → eigen_huis
- tweede woning, vakantiehuis, beleggingspand → real_estate
- cryptovaluta → crypto
- vordering op derden, uitgegeven lening → vordering
- aanmerkelijk belang, deelneming in een BV → deelneming`

/** Schulden-mapping — idem. */
const DEBT_MAPPING = `- eigenwoningschuld / hypotheek → mortgage
- studieschuld DUO → student_loan
- persoonlijke lening, consumptief krediet → personal_loan
- doorlopend krediet, roodstand → revolving_credit
- autolening, financial lease → car_loan
- creditcardschuld → credit_card
- belastingschuld (meerjaars) → belastingschuld
- familielening, onderhandse lening → familielening
- rekening-courant eigen BV → dga_schuld`

/** Box 1-mapping — idem. */
const BOX1_MAPPING = `- bruto loon werkgever → loon
- lopende pensioenuitkering → pensioen
- AOW-uitkering → aow
- WW, WIA, bijstand, Ziektewet → uitkering
- winst uit onderneming, resultaat overige werkzaamheden → winst`

/**
 * Bouw de gebruikersbeurt voor één venster.
 *
 * Het uitvoerskelet volgt het recept van `buildCategorizeUserPrompt`: letterlijk
 * JSON, "begin met [ en eindig met ]", geen fences. Het veld heet bewust
 * `bedrag` en niet `current_value` — hoe korter de sleutel, hoe minder tokens per
 * rij, en de mapping naar het schema doet TypeScript.
 */
export function buildAangifteWindowPrompt(kind: AangifteSectionKind, window: string): string {
  const blok = `BLOK UIT DE AANGIFTE:\n${window.trim()}\n`

  if (kind === 'debts') {
    return `${blok}
Zet elke SCHULD in dit blok om naar JSON.

TYPES:
${DEBT_MAPPING}

ANTWOORD: één JSON-array, begin met [ en eindig met ], geen andere tekst:
[{"label":"Studieschuld DUO","type":"student_loan","bedrag":"8.300"}]
- "label": de omschrijving zoals die in het blok staat, zonder rekeningnummers
- "type": exact één woord uit de lijst hierboven, of "other"
- "bedrag": het bedrag exact zoals het in het blok staat`
  }

  if (kind === 'box1') {
    return `${blok}
Zet elke INKOMENSBRON in dit blok om naar JSON. Elke bron krijgt een eigen regel — bundel nooit twee bedragen tot één.

SOORTEN:
${BOX1_MAPPING}

Laat loonheffing, arbeidskorting, heffingskortingen en aanslagbedragen weg: dat zijn geen inkomensbronnen.

ANTWOORD: één JSON-array, begin met [ en eindig met ], geen andere tekst:
[{"label":"Bruto loon werkgever","type":"loon","bedrag":"65.000"}]
- "label": de omschrijving zoals die in het blok staat
- "type": exact één woord uit de soortenlijst
- "bedrag": het BRUTO JAARbedrag exact zoals het in het blok staat`
  }

  return `${blok}
Zet elke BEZITTING in dit blok om naar JSON.

TYPES:
${ASSET_MAPPING}

ANTWOORD: één JSON-array, begin met [ en eindig met ], geen andere tekst:
[{"label":"ASN spaarrekening","type":"savings","bedrag":"18.200"}]
- "label": de omschrijving zoals die in het blok staat, zonder rekeningnummers
- "type": exact één woord uit de lijst hierboven, of "other"
- "bedrag": de waarde op 1 januari, exact zoals die in het blok staat`
}
