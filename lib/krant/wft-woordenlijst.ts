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
]

/** B2: woorden van de vrijheidstijd-vertaling die de Krant niet gebruikt. */
export const EURO_ONLY_VERBODEN: readonly RegExp[] = [/\bdagtarief\b/i, /\bvrijheidstijd\b/i, /\bvrijheidsdag(en)?\b/i, /\b\d+ dag(en)? (vrijheid|werk)\b/i]

export type WftOvertreding =
  | { soort: 'gebiedende-wijs'; patroon: string }
  | { soort: 'handelingskeuze'; patroon: string }
  | { soort: 'aanbieder'; naam: string }
  | { soort: 'euro-only'; patroon: string }

function aanbiederPatroon(naam: string): RegExp {
  const escaped = naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Korte afkortingen (ING, CZ, SNS, ASN) alleen als heel woord in hoofdletters;
  // de rest hoofdletterongevoelig als heel woord.
  return naam.length <= 4 && naam === naam.toUpperCase()
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
  return null
}
