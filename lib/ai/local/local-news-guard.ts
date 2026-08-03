// ── Nummer-guard op `personalImpact` (lokale nieuwseditie) ───────────────────
//
// `personalImpact` is het enige veld in de editie dat een CONCRETE uitspraak doet
// over het geld van deze gebruiker: "bespaart je €45 per maand — 1,2 vrijheids-
// dagen". Op het cloudpad staat daar een sterk model achter dat de cijfers uit een
// uitgebreid profiel haalt. On-device staat er een 2B-model, en die rekent graag
// zelf iets uit dat er plausibel uitziet en nergens op slaat.
//
// Deze guard is daarom hetzelfde soort post-hoc controle als
// `sanitizeRedactedText` (lib/briefing/nummer-guard.ts) bij de briefing-redactie:
// het model mag niet creatief zijn met cijfers.
//
// WAAROM EEN EIGEN TOKENIZER en niet diens `extractNumericTokens`: die levert
// kale getallen zonder hun eenheid ('€', '%', 'procent'). Daarmee is de guard
// eenheid-blind en gront een verzonnen bedrag zich aan een willekeurig ander
// getal — "€2.026" op het jaartal 2026, "€25" op "spaarquote 25%", "85 procent"
// op een dagtarief van €85. Voor een herschrijving (de briefing) is dat een
// aanvaardbare tolerantie; voor een nieuwe geldclaim niet.
//
// ÓÓN VERSCHIL met de briefing-guard, bewust: daar is de uitvoer een HERSCHRIJVING
// van een brontekst, dus geldt de eis in twee richtingen (elk bron-getal moet
// terugkomen én er mag niets bijkomen). Hier schrijft het model NIEUWE prose bij
// een artikel; het hoeft dus niet elk getal uit het artikel te noemen. Alleen de
// andere richting telt: elk getal dat het model NOEMT moet aantoonbaar uit het
// bronartikel of uit het financiële overzicht komen.
//
// STRENGER OP DE MATCH dan de briefing-guard: die accepteert een token dat een
// deelstring van een bron-token is (`s.includes(token)`). Voor een herschrijving
// is dat een redelijke tolerantie; voor een geldclaim niet — dan zou een verzonnen
// "€45" worden goedgekeurd omdat het overzicht ergens "€450" bevat. We vergelijken
// daarom op GENORMALISEERDE numerieke waarde, exact.
//
// PUUR (geen IO) → los unit-testbaar en veilig in de client-bundel.

/**
 * Breng een numeriek token terug tot één vergelijkbare vorm.
 *
 * Nodig omdat dezelfde waarde in bron en uitvoer anders geschreven staat:
 * het overzicht rendert nl-NL ("€1.234", "3,4%"), een bronartikel schrijft soms
 * en-US ("1,234") en een model normaliseert uit zichzelf naar "1234". Zonder deze
 * normalisatie zou de guard correcte cijfers afkeuren — en dan valt `personal-
 * Impact` structureel weg, wat de functie waardeloos maakt.
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
 * De EENHEID waarin een getal staat. Zonder dit onderscheid is de guard
 * eenheid-blind en gront een bedrag zich aan een willekeurig ander getal:
 * "€2.026" op het jaartal 2026, "€25" op "spaarquote 25%", "85 procent" op een
 * dagtarief van €85. Dat is precies de klasse verzinsels die dit veld niet mag
 * bevatten — het doet een concrete uitspraak over iemands geld.
 */
export type NumericUnit = 'eur' | 'pct' | 'bare'

/**
 * Getal mét zijn eenheid. Herkent "€1.234", "1.234 euro", "3,4%", "0,5
 * procentpunt" en kale getallen. De eenheid mag vóór (€) of ná (%, euro,
 * procent) het getal staan.
 */
const NUMBER_WITH_UNIT =
  /(€\s*)?(\d+(?:[.,]\d+)*)\s*(%|procentpunt(?:en)?|procent|euro)?/gi

/** Alle {waarde, eenheid}-paren in een tekst. */
export function numericUnitPairs(text: string): Array<{ value: string; unit: NumericUnit }> {
  const out: Array<{ value: string; unit: NumericUnit }> = []
  for (const match of text.matchAll(NUMBER_WITH_UNIT)) {
    const [, euroPrefix, digits, suffix] = match
    const suffixLower = (suffix ?? '').toLowerCase()
    const unit: NumericUnit = euroPrefix || suffixLower === 'euro'
      ? 'eur'
      : suffixLower.startsWith('%') || suffixLower.startsWith('procent')
        ? 'pct'
        : 'bare'
    out.push({ value: normalizeNumericToken(digits), unit })
  }
  return out
}

/**
 * Grondslag per eenheid. Een kaal bron-getal ('bare') gront elke claim — het kan
 * immers een aantal, een bedrag zonder teken of een percentage zonder teken zijn
 * — maar een expliciet percentage gront nooit een bedrag en andersom.
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
 *  - een KALE claim ("je maanduitgaven van 2550") doet geen uitspraak over de
 *    eenheid en mag daarom op elke bron steunen;
 *  - een claim MÉT eenheid ("€2.026", "85 procent") steunt uitsluitend op
 *    dezelfde eenheid — óók niet op een kaal bron-getal.
 *
 * Dat laatste is strenger dan het op het eerste gezicht hoeft, en dat is de
 * bedoeling: zou een kaal bron-getal een bedrag mogen gronden, dan gront het
 * jaartal 2026 de verzonnen claim "je bespaart €2.026 per jaar" — precies het
 * geval waarvoor deze guard bestaat. De prijs is een enkele terechte zin die
 * sneuvelt wanneer een artikel een percentage zónder teken schrijft ("de rente
 * gaat naar 3,25"). Die prijs is de goede kant op: een afgekeurde zin vervalt
 * stil en het bericht degradeert naar 'relevant', terwijl een doorgelaten
 * verzinsel als financiële uitspraak op het scherm komt.
 */
function isGrounded(
  grounded: Map<NumericUnit, Set<string>>,
  value: string,
  unit: NumericUnit,
): boolean {
  if (unit === 'bare') {
    return [...grounded.values()].some((set) => set.has(value))
  }
  return grounded.get(unit)!.has(value)
}

/**
 * Toets `personalImpact` tegen zijn grondslag.
 *
 * @param personalImpact De impactzin van het model (of null).
 * @param groundingTexts Alles waaruit een getal LEGITIEM mag komen: de tekst van
 *                       het bronartikel én het gerenderde financiële overzicht.
 * @returns De zin wanneer elk genoemd getal grondslag heeft; anders null.
 *
 * Null betekent voor de resolver: de impactzin VERVALT en het bericht degradeert
 * naar `impactType: 'relevant'` — het blijft dus wél staan, maar zonder de
 * ongefundeerde geldclaim. Dat is de fail-safe kant: liever een bericht zonder
 * belofte dan een bericht met een verzonnen bedrag.
 */
export function guardPersonalImpact(
  personalImpact: string | null | undefined,
  groundingTexts: string[],
): string | null {
  if (!personalImpact) return null
  const cleaned = personalImpact.trim()
  if (!cleaned) return null

  const claimed = numericUnitPairs(cleaned)
  // Geen enkel getal genoemd → niets te bewijzen, de zin mag blijven staan.
  if (claimed.length === 0) return cleaned

  const grounded = numericValueSet(groundingTexts.join('\n'))
  for (const { value, unit } of claimed) {
    if (!isGrounded(grounded, value, unit)) return null
  }
  return cleaned
}
