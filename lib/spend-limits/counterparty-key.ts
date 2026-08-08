/**
 * Genormaliseerde tegenpartij-zoeksleutel voor grenzenpotten.
 *
 * PARITY-CONTRACT MET SQL — dit is de TypeScript-helft van een paar. De andere
 * helft is `public.spend_limit_counterparty_key(text)` (migratie
 * 20260808110000_create_spend_limits.sql). Beide MOETEN exact hetzelfde
 * resultaat geven: de database bepaalt de SOM, deze functie bepaalt de UITLEG
 * ("waarom telt deze transactie mee?"). Lopen ze uiteen, dan toont de app een
 * bedrag dat niet strookt met de getoonde reden — precies het soort stille
 * drift dat een uitgavengrens onbetrouwbaar maakt.
 *
 * De regel is daarom bewust minimaal en letterlijk spiegelbaar:
 *   strip alles buiten [0-9A-Za-z]  →  hoofdletters.
 * Na het strippen is de invoer pure ASCII, dus `toUpperCase()` (JS) en `upper()`
 * (SQL, onder COLLATE "C") zijn hier per definitie identiek.
 *
 * BEWUST NIET `normalizeCounterparty()` uit lib/parsers/counterparty-normalize.ts:
 * die strip PSP-prefixen, kassanummers en rechtsvormen — waardevol voor fuzzy
 * categorisatie, maar niet in SQL na te bouwen zonder een tweede waarheid te
 * introduceren. Voor een grens die de gebruiker zélf instelt weegt "letterlijk
 * uitlegbaar" zwaarder dan "slim". Zie ADR 0089.
 *
 * BEPERKING, expliciet: `counterparty_name` is vrije tekst uit de bank. De match
 * is een CONTAINS op de genormaliseerde vorm, dus de sleutel "SHELL" matcht óók
 * "SHELLFISH BAR", en het weglaten van scheidingstekens kan over woordgrenzen
 * heen matchen ("BOL" in "MARBOLLINI"). Daarom toont de UI altijd wélke
 * tegenpartij-namen daadwerkelijk meetelden — de gebruiker kan de match zien in
 * plaats van hem te moeten geloven.
 */

/** Normaliseer een tegenpartij-tekst tot de zoeksleutel. Spiegel van de SQL-functie. */
export function spendLimitCounterpartyKey(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/**
 * Matcht een tegenpartij-tekst de sleutel? Normalised-contains, identiek aan het
 * `LIKE '%' || key || '%'`-predicaat in `tx_counterparty_month_aggregate`.
 * Een lege sleutel matcht bewust niets (anders zou hij álles matchen).
 */
export function counterpartyMatchesKey(raw: string | null | undefined, key: string): boolean {
  if (!key) return false
  return spendLimitCounterpartyKey(raw).includes(key)
}
