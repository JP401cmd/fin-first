/**
 * Gedeelde tegenpartij-normalisatie.
 *
 * Eén bron voor het strippen van betaaldienst-/terminal-ruis uit de tegenpartij-
 * tekst, met twee consumenten:
 *  - `normalizeCounterparty()` (deze module) — voedt de FUZZY-matching in
 *    `lib/parsers/categorize.ts` (frequentie-keys + lookup + keyword-searchText),
 *    zodat "ZETTLE_*Bakker", "CCV*BAKKER 12" en "Bakker" als dezelfde tegenpartij
 *    matchen.
 *  - `stripPspPrefix()` + `PSP_PREFIX_RE` — gebruikt door de DISPLAY-stripper
 *    `cleanMerchantName()` in `lib/transaction-display.ts`.
 *
 * Bewust géén derde kopie van de prefix-lijst: de display-stripper en de match-
 * normalisatie delen dezelfde patronen. Wat NIET gedeeld wordt is de
 * title-casing/merchant-herkenning — dat is puur presentatie en hoort bij display.
 */

/**
 * PSP-/terminal-prefix met sterretje of underscore: "BCK*", "CCV*", "PAY.nl*"
 * en de Zettle-vorm "Zettle_*". Letters/punt (2–10) gevolgd door één of meer
 * `*`/`_`-scheidingstekens, aan het begin. Eén bron voor zowel display als
 * matching; `[*_]+` dekt de dubbele "_*"-scheiding van Zettle.
 */
export const PSP_PREFIX_RE = /^[A-Za-z.]{2,10}[*_]+/

/**
 * Prefixen die met een spatie van de merchantnaam gescheiden zijn en die we als
 * ruis willen wegstrippen voor matching: "iZ ", "iZettle ", "SumUp ",
 * "PayPal ", "CCV " (zonder ster). Alleen aan het begin, woordgrens.
 * Bewust een korte, expliciete lijst i.p.v. een ruime heuristiek — vals-positief
 * strippen van een echte merchantnaam is erger dan één gemiste prefix.
 */
const SPACE_PREFIX_RE = /^(izettle|iz|sumup|paypal|ccv|bck|zettle)\s+/i

/** Trailing kassanummer/filiaalnummer: " 1032" of " 238 Arnhem" (cijfers eind). */
const TRAILING_STORE_RE = /\s+\d{2,5}(\s+[a-z0-9à-ÿ.'-]+)?$/i

/** Trailing rechtsvorm-suffix: " B.V.", " N.V.". */
const TRAILING_ENTITY_RE = /\s+(b\.?v\.?|n\.?v\.?)$/i

/**
 * Strip een PSP-prefix (sterretje of underscore) van een ruwe tegenpartij-string.
 * Gedeeld met de display-stripper zodat beide dezelfde patroonbron gebruiken.
 */
export function stripPspPrefix(s: string): string {
  return s.replace(PSP_PREFIX_RE, '')
}

/**
 * Normaliseer een tegenpartij-tekst voor FUZZY matching:
 *  1. lowercase + whitespace-collapse;
 *  2. strip PSP-/terminal-prefix (ster, underscore én spatie-variant);
 *  3. strip trailing kassanummer/filiaal en rechtsvorm-suffix;
 *  4. opnieuw whitespace-collapsen.
 *
 * Leeg-na-strippen → de oorspronkelijke (getrimde, lowercase) string, zodat een
 * tegenpartij die ENKEL uit ruis bestaat nooit een lege match-key oplevert.
 */
export function normalizeCounterparty(raw: string | null | undefined): string {
  const original = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!original) return ''

  let s = stripPspPrefix(original)
  s = s.replace(SPACE_PREFIX_RE, '')
  s = s.replace(TRAILING_STORE_RE, '')
  s = s.replace(TRAILING_ENTITY_RE, '')
  s = s.replace(/\s+/g, ' ').trim()

  return s || original
}
