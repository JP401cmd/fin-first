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
): boolean {
  if (unit === 'bare') {
    return [...grounded.values()].some((set) => set.has(value))
  }
  return grounded.get(unit)!.has(value)
}
