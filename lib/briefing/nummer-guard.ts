// ── Nummer-guard voor de briefing-redactie (puur, isomorf) ───────────
//
// De briefjes worden DETERMINISTISCH gecomposeerd; de AI mag ze alleen
// HERSCHRIJVEN. Deze module bewaakt de enige harde eis daarbij: het model mag
// niet creatief zijn met cijfers. Elk getal uit de brontekst moet letterlijk
// terugkomen en er mag geen getal bijkomen — anders wordt de herschreven tekst
// afgekeurd en blijft het deterministische origineel staan.
//
// WAAROM EEN EIGEN BESTAND (en niet in redactie.ts): sinds de briefing-redactie
// óók on-device kan draaien (ADR 0043 — de gebruiker zet de groep 'briefing' op
// lokaal) heeft de BROWSER deze guard nodig, zodat de resolver een afgekeurd
// briefje meteen als "niet herschreven" kan tellen. `redactie.ts` importeert
// `getModel` en de `ai`-SDK en is dus server-only; die in een client-bundel
// trekken zou de hele provider-configuratie meenemen. Deze module is puur —
// geen IO, geen imports — en daarmee veilig aan beide kanten.
//
// De SERVER blijft de beslissende laag: de persist-stap van
// app/api/briefing/refresh draait deze guard opnieuw tegen zijn eigen,
// vers gerecomposeerde bronteksten. Client-uitkomsten zijn nooit gezaghebbend.

/** Maximale lengte van een geredigeerd briefje; langer → afgekeurd. */
export const MAX_REDACTED_TEXT_LENGTH = 240

/** Alle numerieke tokens in een tekst ("1.234,56", "12%", "8"). */
export function extractNumericTokens(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/g) ?? []
}

/**
 * Saneer een herschreven briefje-tekst tegen zijn bron. Retourneert null
 * (→ origineel behouden) bij: lege/te lange output, een bron-getal dat
 * ontbreekt, of een getal dat het model erbij heeft verzonnen.
 */
export function sanitizeRedactedText(
  raw: string | null | undefined,
  original: string,
): string | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim()
  if (!cleaned || cleaned.length > MAX_REDACTED_TEXT_LENGTH) return null

  const sourceTokens = extractNumericTokens(original)
  for (const token of sourceTokens) {
    if (!cleaned.includes(token)) return null
  }
  // Geen verzonnen getallen: elk token in de redactie moet uit de bron komen.
  const redactedTokens = extractNumericTokens(cleaned)
  for (const token of redactedTokens) {
    if (!sourceTokens.some((s) => s === token || s.includes(token) || token.includes(s))) {
      return null
    }
  }
  return cleaned
}
