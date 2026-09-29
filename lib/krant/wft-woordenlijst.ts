// ── Wft-woordenlijst: de grens in code, niet alleen in de prompt ─────────────
//
// ADR 0171 liet dit bewust open tot 1B/1C: "de Wft-woordenlijst (aanbieders,
// gebiedende wijs) in code toetsen, niet alleen in de prompt". Dit is die
// lijst. Ze toetst TEKST die de Krant zelf uitspreekt — in 1B de
// sjablooncatalogus (sjablonen.test.ts weigert een sjabloon dat 'm raakt) —
// en is herbruikbaar voor de samenvatting van de duiding zodra 1A fase 2 of
// 1C 'm daar inhaakt.
//
// De grens (compliance-check): inzicht mag, vergunningsplichtig advies niet.
// Advies in Wft-zin = een aanbeveling over een product aan een persoon. De
// drie manieren waarop een zin daar stiekem in glijdt:
//   1. gebiedende wijs richting de lezer ("vraag aan", "stap over", "los af");
//   2. een aanbieder of product bij naam;
//   3. de sparen-of-beleggen-keuze als handelingsperspectief.
// Plus B2 (alleen euro's): geen dagtarief, geen vrijheidstijd, geen dagen —
// die woorden horen in de Krant niet thuis, ook niet als vertaling.
//
// Dit is een VANGRAIL, geen bewijs: de lijst vangt de bekende vormen, de
// inhoudelijke toets blijft de compliance-check op de catalogus (attest).
//
// PUUR: alleen constanten en één functie — client-veilig.

/**
 * Gebiedende wijs richting de lezer. Als hele-woordpatronen, zodat "de
 * aanvraag moet vóór … binnen zijn" (beschrijvend) er niet op valt maar
 * "vraag aan vóór …" (aansporend) wel.
 */
export const GEBIEDENDE_WIJS: readonly RegExp[] = [
  /\bvraag (het |de |je |jouw )?\w* ?aan\b/i,
  /\bsluit (het |de |een )?\w* ?af\b/i,
  /\bstap over\b/i,
  /\bsluit over\b/i,
  /\blos (het |de |je |jouw )?\w* ?af\b/i,
  /\bzet (het |je |jouw )?\w* ?(om|vast|opzij)\b/i,
  /\bkies (voor|een)\b/i,
  /\bvergelijk\b/i,
  /\bbeleg\b/i,
  /\bspaar\b/i,
  /\bkoop\b/i,
  /\bverkoop\b/i,
  /\bregel (het|dit|dat)\b/i,
  /\bzorg (dat|ervoor)\b/i,
  /\bje (moet|zou moeten|kunt beter|doet er goed aan)\b/i,
  /\bhet is (verstandig|slim|raadzaam) om\b/i,
]

/**
 * Aansporing richting de lezer die GEBIEDENDE_WIJS te smal liet (compliance-
 * check 28 sep, §5). Aparte lijst en aparte `soort`, en bewust ná de
 * bestaande lijsten getoetst: zo blijft de uitkomst voor elke tekst die al
 * werd geweerd exact gelijk, en is aan de soort te zien dat deze aanvulling
 * een zin raakte.
 *
 * Werkwoorden waarvan de gebiedende wijs gelijk is aan de derde persoon
 * ("wacht", "check") alleen aan het begin van een zin — "de minister wacht
 * met een besluit" is nieuws, "Wacht met verkopen" is een aansporing. Waar de
 * derde persoon een -t krijgt ("overweegt", "kijkt", "maakt") volstaat de
 * woordgrens: die sluit de beschrijvende vorm vanzelf uit.
 */
export const AANSPORING: readonly RegExp[] = [
  /\boverweeg\b/i,
  /\bprofiteer\b/i,
  /\bkijk of\b/i,
  /\bmaak (\w+ )?gebruik van\b/i,
  /\bdoe er (goed|verstandig|slim) aan\b/i,
  /\bleg (\w+ ){0,2}in\b/i,
  /\bcheck (of|je|jouw|dan|nu|altijd|eerst|wat|hoe|welke)\b/i,
  /(^|[.!?:;]\s+)(wacht met|check)\b/i,
  /\bhet loont (om|de moeite)\b/i,
]

/**
 * Een aanbeveling of productrangorde in de mond van de Krant: "wij raden
 * aan", "aanrader", "Tip:", "de beste spaarrekening". Een superlatief telt
 * alleen vóór een productwoord — "het beste moment" of "de hoogste rente
 * sinds 2008" is geen rangorde van aanbieders.
 */
export const AANBEVELING: readonly RegExp[] = [
  /\b(wij|we|ik) (raad|raden) (je |jou |u )?(\w+ )?aan\b/i,
  /\baanrader\b/i,
  /\btip\s*:/i,
  /\b(beste|goedkoopste|voordeligste|scherpste) (\w+ )?\w*(rekening|hypotheek|hypotheken|verzekering|broker|bank|deposito|fonds|lening|creditcard|aanbieder|product|belegging)(en|s)?\b/i,
]

/** De sparen-of-beleggen-keuze als handelingsperspectief. */
export const HANDELINGSKEUZE: readonly RegExp[] = [/\bsparen of beleggen\b/i, /\bbeleggen of sparen\b/i, /\baflossen of beleggen\b/i]

/**
 * Aanbieders en producten die in een Krant-tekst nooit bij naam staan. Banken,
 * verzekeraars, brokers, fondshuizen, hypotheekverstrekkers. Geen uitputtende
 * lijst — een vangrail.
 */
export const AANBIEDERS: readonly string[] = [
  'ING',
  'Rabobank',
  'ABN AMRO',
  'SNS',
  'ASN',
  'RegioBank',
  'bunq',
  'Knab',
  'Triodos',
  'Van Lanschot',
  'NIBC',
  'LeasePlan Bank',
  'Openbank',
  'Trade Republic',
  'Revolut',
  'N26',
  'Meesman',
  'DEGIRO',
  'Brand New Day',
  'BinckBank',
  'Saxo',
  'Bux',
  'Scalable',
  'Peaks',
  'Semmie',
  'Nationale-Nederlanden',
  'Aegon',
  'a.s.r.',
  'Achmea',
  'Centraal Beheer',
  'Interpolis',
  'CZ',
  'VGZ',
  'Menzis',
  'Zilveren Kruis',
  'DSW',
  'Obvion',
  'Florius',
  'Bitvavo',
  'Coinbase',
  'Vanguard',
  'iShares',
  'Northern Trust',
  // Aanvulling compliance-check 28 sep (§5).
  'Nationale Nederlanden',
  'NN',
  'ASR',
  'Rabo',
  'Interactive Brokers',
  'IBKR',
  'eToro',
  'Lynx',
  'Flatex',
  'Kraken',
  'Binance',
  'Bitpanda',
  'ONVZ',
  'FBTO',
  'Ohra',
  'Univé',
  'Unive',
  'Zorg en Zekerheid',
  'Allianz',
  'Argenta',
  'Munt Hypotheken',
  'Tulp',
  'Venn',
]

/**
 * Namen die ook een gewoon Nederlands woord zijn ("kraken", "tulp", "zorg en
 * zekerheid") of te kort om los te staan ("Venn") — alleen met de hoofdletter
 * zoals de aanbieder zich schrijft. Korte hoofdletterafkortingen (NN, ASR,
 * IBKR, ONVZ, FBTO) zijn al vanzelf hoofdlettergevoelig.
 */
const HOOFDLETTERGEVOELIG: ReadonlySet<string> = new Set(['Kraken', 'Tulp', 'Venn', 'Zorg en Zekerheid'])

/** B2: woorden van de vrijheidstijd-vertaling die de Krant niet gebruikt. */
export const EURO_ONLY_VERBODEN: readonly RegExp[] = [/\bdagtarief\b/i, /\bvrijheidstijd\b/i, /\bvrijheidsdag(en)?\b/i, /\b\d+ dag(en)? (vrijheid|werk)\b/i]

export type WftOvertreding =
  | { soort: 'gebiedende-wijs'; patroon: string }
  | { soort: 'handelingskeuze'; patroon: string }
  | { soort: 'aanbieder'; naam: string }
  | { soort: 'euro-only'; patroon: string }
  | { soort: 'aansporing'; patroon: string }
  | { soort: 'aanbeveling'; patroon: string }

function aanbiederPatroon(naam: string): RegExp {
  const escaped = naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Korte afkortingen (ING, CZ, SNS, ASN) en namen die ook een gewoon woord
  // zijn alleen als heel woord met exact deze hoofdletters; de rest
  // hoofdletterongevoelig als heel woord.
  return (naam.length <= 4 && naam === naam.toUpperCase()) || HOOFDLETTERGEVOELIG.has(naam)
    ? new RegExp(`(^|[^A-Za-z])${escaped}(?![A-Za-z])`)
    : new RegExp(`(^|[^A-Za-z])${escaped}(?![A-Za-z])`, 'i')
}

const AANBIEDER_PATRONEN = AANBIEDERS.map((naam) => ({ naam, re: aanbiederPatroon(naam) }))

/** De eerste Wft-/B2-overtreding in een tekst, of null als de tekst schoon is. */
export function vindWftOvertreding(tekst: string): WftOvertreding | null {
  for (const re of GEBIEDENDE_WIJS) if (re.test(tekst)) return { soort: 'gebiedende-wijs', patroon: re.source }
  for (const re of HANDELINGSKEUZE) if (re.test(tekst)) return { soort: 'handelingskeuze', patroon: re.source }
  for (const { naam, re } of AANBIEDER_PATRONEN) if (re.test(tekst)) return { soort: 'aanbieder', naam }
  for (const re of EURO_ONLY_VERBODEN) if (re.test(tekst)) return { soort: 'euro-only', patroon: re.source }
  // Ná de bestaande lijsten: een tekst die al werd geweerd houdt zijn soort.
  for (const re of AANSPORING) if (re.test(tekst)) return { soort: 'aansporing', patroon: re.source }
  for (const re of AANBEVELING) if (re.test(tekst)) return { soort: 'aanbeveling', patroon: re.source }
  return null
}
