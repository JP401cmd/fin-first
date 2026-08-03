// ── Cijfer-guardrail voor lokale, vrije-tekst uitvoer ────────────────────────
//
// De tegenhanger van `resolveFinActionIntent` (parse-intent.ts) voor tekst die
// het model wél zelf mag formuleren. Waar de resolver getallen VERVANGT door de
// canonieke waarde, kan dat hier niet: een redactionele inleiding of een
// suggestie-uitleg is proza — je kunt er geen veld in overschrijven. Wat je wél
// kunt: nakijken of élk bedrag en élk percentage dat in de tekst staat ook
// werkelijk is meegegeven. Zo niet, dan heeft het model gerekend of verzonnen en
// verwerpen we het hele stuk tekst (fail-closed) in plaats van een plausibel
// ogend, fout cijfer aan de gebruiker te tonen.
//
// CONSUME, DON'T RECOMPUTE (harde regel, CLAUDE.md) geldt ook voor taal: het
// model mag de cijfers benoemen, niet bedenken.
//
// AFRONDING IS TOEGESTAAN, HERBEREKENING NIET. Een redacteur schrijft "ruim
// €123.000" waar de bron €123.456 zegt — dat is dezelfde waarheid, netter
// verteld. Daarom accepteren we een afwijking van 0,5% (met een ondergrens van
// 0,5 absoluut, zodat percentages als "12%" bij een bron van 12,3% doorkomen).
// Een verzonnen of doorgerekend getal ligt daar in de praktijk ruim buiten.
//
// Puur en los unit-testbaar; geen model, geen netwerk.

/** Relatieve marge voor "netjes afgerond" (0,5% van de canonieke waarde). */
const RELATIVE_TOLERANCE = 0.005
/** Absolute ondergrens van de marge — draagt de kleine getallen (percentages). */
const ABSOLUTE_TOLERANCE = 0.5

/**
 * €-bedragen: `€1.234`, `€ 1.234,56`, `1.234 euro`. De NL-notatie is bewust
 * expliciet (punt = duizendtal, komma = decimaal) — een naïeve `parseFloat`
 * leest "€85.000" als 85.
 */
const EURO_RE = /€\s*(-?\d[\d.]*(?:,\d+)?)|(-?\d[\d.]*(?:,\d+)?)\s*euro\b/gi
/** Percentages: `12%`, `+3,4 %`, `-0,5%`. */
const PERCENT_RE = /(-?\d[\d.]*(?:,\d+)?)\s*%/g

/** NL-genoteerd getal → number. Duizendpunten weg, decimale komma naar punt. */
function parseDutchNumber(raw: string): number | null {
  const cleaned = raw.replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Alle bedragen en percentages die in `text` genoemd worden, als absolute
 * getallen (het teken zit in de zin, niet in de waarde — "een daling van 3%"
 * noemt 3, niet −3).
 */
export function extractTextFigures(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(EURO_RE)) {
    const n = parseDutchNumber(m[1] ?? m[2] ?? '')
    if (n !== null) out.push(Math.abs(n))
  }
  for (const m of text.matchAll(PERCENT_RE)) {
    const n = parseDutchNumber(m[1])
    if (n !== null) out.push(Math.abs(n))
  }
  return out
}

/** Ligt `value` binnen de afrondingsmarge van één van de toegestane waarden? */
function isCovered(value: number, allowed: number[]): boolean {
  return allowed.some((a) => {
    const tolerance = Math.max(ABSOLUTE_TOLERANCE, Math.abs(a) * RELATIVE_TOLERANCE)
    return Math.abs(value - a) <= tolerance
  })
}

export interface FigureGuardResult {
  /** True wanneer élk genoemd cijfer terug te voeren is op de meegegeven bron. */
  ok: boolean
  /** De niet-herleidbare getallen — voor de console-kanarie bij een verwerping. */
  offending: number[]
}

/**
 * Toets de vrije tekst tegen de canonieke cijfers die aan het model zijn
 * meegegeven.
 *
 * `allowed` is de volledige set waarden uit de prompt (bedragen, percentages,
 * aantallen); waarden worden absoluut vergeleken. Een tekst zonder enkel cijfer
 * is per definitie in orde — er valt dan niets te verzinnen.
 */
export function guardFigures(text: string, allowed: number[]): FigureGuardResult {
  const finiteAllowed = allowed.filter((n) => Number.isFinite(n)).map((n) => Math.abs(n))
  const offending = extractTextFigures(text).filter((n) => !isCovered(n, finiteAllowed))
  return { ok: offending.length === 0, offending }
}
