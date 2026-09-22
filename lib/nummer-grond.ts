// ── Nummer-grond: getallen met eenheid herkennen en aan een bron toetsen ────
//
// Neutrale, pure module (geen IO, client-veilig). Twee consumenten:
//
//  1. `lib/ai/local/local-news-guard.ts` — de nummer-guard op `personalImpact`
//     van de lokale nieuwseditie (ADR 0080). Die module re-exporteert alles
//     hieronder, zodat haar bestaande importeurs ongewijzigd blijven (B10).
//  2. `lib/krant/duiding-controles.ts` — de grondingstoets op de duiding van
//     een nieuwsartikel (ADR 0171): elk getal in de params en in de
//     samenvatting moet letterlijk in de brontekst staan.
//
// WAAROM EEN EIGEN TOKENIZER en niet `extractNumericTokens` uit de briefing-
// nummer-guard: die levert kale getallen zonder hun eenheid ('€', '%',
// 'procent'). Daarmee is een toets eenheid-blind en gront een verzonnen bedrag
// zich aan een willekeurig ander getal — "€2.026" op het jaartal 2026, "€25" op
// "spaarquote 25%", "85 procent" op een dagtarief van €85. Voor een herschrijving
// (de briefing) is dat een aanvaardbare tolerantie; voor een geldclaim niet.
//
// STRENG OP DE MATCH: geen deelstring-tolerantie (`s.includes(token)`) — dan
// zou een verzonnen "€45" worden goedgekeurd omdat de bron ergens "€450" bevat.
// We vergelijken op GENORMALISEERDE numerieke waarde, exact.
//
// UITBREIDINGEN VAN 1F FASE 2 (22-09-2026) — allebei ADDITIEF: `datumTokens`/
// `zonderDatums` (een datum als geheel in plaats van losse cijfers) en de
// opt-in `kaalStreng` op `isNumericGrounded`. Het bestaande gedrag van
// `isNumericGrounded` zonder opties is ongewijzigd, want consument (1)
// hierboven leunt erop (B10).

/**
 * Breng een numeriek token terug tot één vergelijkbare vorm.
 *
 * Nodig omdat dezelfde waarde in bron en uitvoer anders geschreven staat:
 * nl-NL ("€1.234", "3,4%"), en-US ("1,234") en een model dat uit zichzelf
 * normaliseert naar "1234". Zonder deze normalisatie zou een toets correcte
 * cijfers afkeuren.
 */
export function normalizeNumericToken(token: string): string {
  let value = token

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) {
    // nl-NL gegroepeerd: "1.234" / "1.234,56"
    value = value.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) {
    // en-US gegroepeerd: "1,234" / "1,234.56"
    value = value.replace(/,/g, '')
  } else if (/^\d+,\d+$/.test(value)) {
    // Decimale komma: "3,4"
    value = value.replace(',', '.')
  }

  // Numeriek normaliseren vangt de laatste varianten af ("3.40" ≡ "3.4",
  // "007" ≡ "7"). Lukt dat niet, dan telt de opgeschoonde string.
  const numeric = Number(value)
  return Number.isFinite(numeric) ? String(numeric) : value
}

/**
 * De EENHEID waarin een getal staat. Zonder dit onderscheid is een toets
 * eenheid-blind en gront een bedrag zich aan een willekeurig ander getal:
 * "€2.026" op het jaartal 2026, "€25" op "spaarquote 25%", "85 procent" op een
 * dagtarief van €85.
 */
export type NumericUnit = 'eur' | 'pct' | 'bare'

/**
 * Getal mét zijn eenheid. Herkent "€1.234", "1.234 euro", "3,4%", "0,5
 * procentpunt", "36 duizend euro", "1,5 miljard", "60k" en kale getallen. De
 * eenheid mag vóór (€) of ná (%, euro, procent) het getal staan; een
 * grootte-woord ertussen vermenigvuldigt de waarde. Zonder dat laatste zou
 * "36 duizend euro" als kaal `36` gelden en op "36 procent" gronden — precies
 * de eenheidsblinde route die deze module sluit.
 */
const NUMBER_WITH_UNIT =
  /(€\s*)?(\d+(?:[.,]\d+)*)(?:\s*(duizend|miljoen|miljard|mln|mld|k)\b)?\s*(%|procentpunt(?:en)?|procent|euro)?/gi

const GROOTTE: Record<string, number> = {
  duizend: 1_000,
  k: 1_000,
  miljoen: 1_000_000,
  mln: 1_000_000,
  miljard: 1_000_000_000,
  mld: 1_000_000_000,
}

/** Alle {waarde, eenheid}-paren in een tekst. */
export function numericUnitPairs(text: string): Array<{ value: string; unit: NumericUnit }> {
  const out: Array<{ value: string; unit: NumericUnit }> = []
  for (const match of text.matchAll(NUMBER_WITH_UNIT)) {
    const [, euroPrefix, digits, grootte, suffix] = match
    const suffixLower = (suffix ?? '').toLowerCase()
    const unit: NumericUnit = euroPrefix || suffixLower === 'euro'
      ? 'eur'
      : suffixLower.startsWith('%') || suffixLower.startsWith('procent')
        ? 'pct'
        : 'bare'
    let value = normalizeNumericToken(digits)
    const factor = grootte ? GROOTTE[grootte.toLowerCase()] : undefined
    if (factor !== undefined) {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) value = String(numeric * factor)
    }
    out.push({ value, unit })
  }
  return out
}

/**
 * Grondslag per eenheid. Een kaal bron-getal ('bare') gront elke kale claim —
 * het kan immers een aantal, een bedrag zonder teken of een percentage zonder
 * teken zijn — maar een expliciet percentage gront nooit een bedrag en andersom.
 */
export function numericValueSet(text: string): Map<NumericUnit, Set<string>> {
  const sets: Map<NumericUnit, Set<string>> = new Map([
    ['eur', new Set()],
    ['pct', new Set()],
    ['bare', new Set()],
  ])
  for (const { value, unit } of numericUnitPairs(text)) {
    sets.get(unit)!.add(value)
  }
  return sets
}

/**
 * Mag een claim in `unit` met waarde `value` steunen op deze grondslag?
 *
 * DE ASYMMETRIE IS BEWUST:
 *  - een KALE claim doet geen uitspraak over de eenheid en mag daarom op elke
 *    bron steunen;
 *  - een claim MÉT eenheid ("€2.026", "85 procent") steunt uitsluitend op
 *    dezelfde eenheid — óók niet op een kaal bron-getal.
 *
 * Dat laatste is strenger dan het op het eerste gezicht hoeft, en dat is de
 * bedoeling: zou een kaal bron-getal een bedrag mogen gronden, dan gront het
 * jaartal 2026 de verzonnen claim "je bespaart €2.026 per jaar". De prijs is
 * een enkele terechte zin of param die sneuvelt wanneer een artikel een
 * percentage zónder teken schrijft ("de rente gaat naar 3,25"). Die prijs is de
 * goede kant op: een afgekeurd getal vervalt stil, een doorgelaten verzinsel
 * komt als financiële uitspraak op het scherm.
 */
export function isNumericGrounded(
  grounded: Map<NumericUnit, Set<string>>,
  value: string,
  unit: NumericUnit,
  opties: NumericGrondOpties = {},
): boolean {
  if (unit === 'bare') {
    if (opties.kaalStreng) return grounded.get('bare')?.has(value) ?? false
    return [...grounded.values()].some((set) => set.has(value))
  }
  return grounded.get(unit)!.has(value)
}

/**
 * Opties op `isNumericGrounded`. Leeg (de default) = het gedrag hierboven,
 * byte-voor-byte zoals `lib/ai/local/local-news-guard.ts` het al gebruikte.
 */
export interface NumericGrondOpties {
  /**
   * STRENGER OP KALE CLAIMS (opt-in, Krant 1F fase 2). Zonder deze vlag gront
   * een kale claim op élke eenheid — ook op een € of % uit de bron. Dat is een
   * aanvaardbare tolerantie zolang de grondslag een hele pagina is: daar staan
   * genoeg kale getallen. Zodra de grondslag één bronfragment van een paar
   * regels is, draait die tolerantie om: het handvol getallen dat er staat is
   * meestal juist een percentage of bedrag, en dan gront "4,4" zich stil aan
   * "4,4 procent". Met `kaalStreng` steunt een kale claim uitsluitend op een
   * KAAL brongetal (een jaartal, een aantal); een € of % in de bron telt niet
   * mee. De tegenovergestelde asymmetrie (een claim MÉT eenheid steunt alleen
   * op dezelfde eenheid) blijft in beide modi gelden.
   */
  kaalStreng?: boolean
}

// ── Datums als geheel ────────────────────────────────────────────────────────
//
// Een datum is meer dan zijn losse getallen. "1 januari 2026" tokeniseert als
// `1` en `2026`, en die twee staan bijna altijd wel érgens in een bron — zo
// gront een verzonnen ingangs- of publicatiedatum zich op ruis. Daarom herkent
// deze module een datum ALS GEHEEL, ISO-genormaliseerd, zodat een toets kan
// eisen dat dezelfde dag in de bron staat (en niet: dezelfde losse cijfers).
//
// Bovendien wordt geregistreerd of de datum naast een PUBLICATIEWERKWOORD
// staat. Zo'n datum is een uitspraak over de bron zelf ("gepubliceerd op …"),
// niet over de regel — en die hoort tegen de bronmetadata te worden getoetst,
// niet tegen de tekst.

/** Woorden die van een datum een uitspraak over het VERSCHIJNEN van de bron maken. */
export const PUBLICATIE_WERKWOORDEN = [
  'gepubliceerd',
  'verschenen',
  'publicatie',
  'uitgebracht',
  'bekendgemaakt',
] as const

/**
 * Hoeveel tekens links en rechts van de datum meetellen voor het
 * publicatiewerkwoord. Ruim genoeg voor "op 1 januari 2026 het pakket
 * Belastingplan 2026 gepubliceerd", krap genoeg om niet de hele alinea te
 * vangen.
 */
export const PUBLICATIE_VENSTER_TEKENS = 60

const MAAND_NAMEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
] as const

export interface DatumToken {
  /** Genormaliseerd: YYYY-MM-DD. */
  iso: string
  /** Zoals de datum letterlijk in de tekst stond. */
  tekst: string
  start: number
  eind: number
  /** Staat er een publicatiewerkwoord binnen `PUBLICATIE_VENSTER_TEKENS`? */
  bijPublicatie: boolean
}

/** ISO (2026-01-01), d-m-Y (4-9-2026 · 01/01/2026) en d maand Y (1 januari 2026). */
const DATUM_PATRONEN: ReadonlyArray<{ re: RegExp; lees: (m: RegExpMatchArray) => [number, number, number] | null }> = [
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    lees: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  {
    re: /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g,
    lees: (m) => [Number(m[3]), Number(m[2]), Number(m[1])],
  },
  {
    re: new RegExp(`\\b(\\d{1,2})\\s+(${MAAND_NAMEN.join('|')})\\s+(\\d{4})\\b`, 'gi'),
    lees: (m) => {
      const maand = MAAND_NAMEN.indexOf(m[2].toLowerCase() as (typeof MAAND_NAMEN)[number])
      return maand < 0 ? null : [Number(m[3]), maand + 1, Number(m[1])]
    },
  },
]

function isEchteDatum(jaar: number, maand: number, dag: number): boolean {
  if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return false
  const d = new Date(Date.UTC(jaar, maand - 1, dag))
  return d.getUTCFullYear() === jaar && d.getUTCMonth() === maand - 1 && d.getUTCDate() === dag
}

/**
 * Alle datums in een tekst, ISO-genormaliseerd, op volgorde van voorkomen.
 * Een onmogelijke datum (31 februari, maand 13) is geen datum en valt weg;
 * overlappende treffers tellen één keer (de eerst herkende wint).
 */
export function datumTokens(text: string): DatumToken[] {
  const out: DatumToken[] = []
  for (const { re, lees } of DATUM_PATRONEN) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      const eind = start + m[0].length
      if (out.some((t) => start < t.eind && eind > t.start)) continue
      const delen = lees(m)
      if (!delen) continue
      const [jaar, maand, dag] = delen
      if (!isEchteDatum(jaar, maand, dag)) continue
      const venster = text
        .slice(Math.max(0, start - PUBLICATIE_VENSTER_TEKENS), eind + PUBLICATIE_VENSTER_TEKENS)
        .toLowerCase()
      out.push({
        iso: `${jaar}-${String(maand).padStart(2, '0')}-${String(dag).padStart(2, '0')}`,
        tekst: m[0],
        start,
        eind,
        bijPublicatie: PUBLICATIE_WERKWOORDEN.some((w) => venster.includes(w)),
      })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/**
 * Dezelfde tekst met elke datum weggehaald (vervangen door spaties, zodat
 * posities niet verschuiven). Voor een numerieke toets die de datums aan
 * `datumTokens` overlaat: `1` en `2026` uit "1 januari 2026" zijn geen losse
 * getalclaims, en als losse claims zouden ze op willekeurige ruis gronden.
 */
export function zonderDatums(text: string): string {
  let out = text
  for (const t of [...datumTokens(text)].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, t.start) + ' '.repeat(t.eind - t.start) + out.slice(t.eind)
  }
  return out
}
