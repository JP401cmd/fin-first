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
// ÉÉN VERSCHIL met de briefing-guard, bewust: daar is de uitvoer een HERSCHRIJVING
// van een brontekst, dus geldt de eis in twee richtingen (elk bron-getal moet
// terugkomen én er mag niets bijkomen). Hier schrijft het model NIEUWE prose bij
// een artikel; het hoeft dus niet elk getal uit het artikel te noemen. Alleen de
// andere richting telt: elk getal dat het model NOEMT moet aantoonbaar uit het
// bronartikel of uit het financiële overzicht komen.
//
// De tokenizer, de eenheidsbewuste grondslag en de exacte match-regel (waaróm
// een eigen tokenizer, waarom geen deelstring-tolerantie) staan sinds ADR 0171
// in de neutrale module `lib/nummer-grond.ts`: de grondingstoets op de
// Krant-duiding heeft precies dezelfde regels nodig. Deze module re-exporteert
// ze, zodat `local-news-select.ts`, de resolver, de prompt en hun tests
// ongewijzigd blijven (B10: het lokale pad wordt niet gebroken). Alleen
// `guardPersonalImpact` — de toepassing op het impactveld — woont nog hier.
//
// PUUR (geen IO) → los unit-testbaar en veilig in de client-bundel.

import {
  isNumericGrounded,
  numericUnitPairs,
  numericValueSet,
} from '@/lib/nummer-grond'

export {
  normalizeNumericToken,
  numericUnitPairs,
  numericValueSet,
  type NumericUnit,
} from '@/lib/nummer-grond'

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
    if (!isNumericGrounded(grounded, value, unit)) return null
  }
  return cleaned
}
