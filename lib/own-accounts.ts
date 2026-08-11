// lib/own-accounts.ts
// Generieke "mijn rekeningen"-identifiers waarmee onderlinge overboekingen tussen
// eigen rekeningen worden herkend — óók op rekeningen zonder bruikbare IBAN
// (bv. PayPal, een broker of exchange die op het bankafschrift met een naam
// i.p.v. je eigen IBAN verschijnt).
//
// Bron: tabel `user_own_ibans` (match_type 'iban' | 'name', match_value) gecombineerd
// met de IBANs van de eigen `bank_accounts`. Eén plek zodat de import-flow en de
// cash-view dezelfde set gebruiken.

export type OwnAccountRuleRow = {
  match_type?: string | null
  match_value?: string | null
  iban?: string | null
  label?: string | null
}

export type OwnAccountIdentifiers = {
  /** Genormaliseerd: geen spaties, uppercase. */
  ibans: Set<string>
  /** Lowercase substrings; een tegenpartij-naam die er één bevat is een eigen rekening. */
  namePatterns: string[]
}

export function normalizeIban(value: string): string {
  return value.replace(/\s/g, '').toUpperCase()
}

/**
 * Ondergrens voor een NAAM-patroon.
 *
 * Een naam-regel is een lowercase SUBSTRING-match (`name.includes(pattern)`), en
 * de match zet transacties op `transaction_type='transfer'` — ze verdwijnen dus
 * uit je uitgaven, en dat is niet terug te draaien. Een te kort patroon is
 * daarmee een stille massa-mutatie: `"ing"` vangt Booking.com, Parking,
 * Verzekeringen en Financiering, waarna de spaarquote en de FIRE-datum op valse
 * grond verbeteren.
 *
 * Deze grens is bewust GEDEELD: hij geldt zowel op `POST /api/own-accounts/rules`
 * als op het tweede schrijfpad in `lib/category-rules.ts` (scope `'rule'` vanuit
 * de sleepmodus). Stond hij maar op één plek, dan was de andere de achterdeur —
 * precies wat de securityreview van 11 aug aantrof.
 *
 * Drie is een ondergrens, geen garantie. De echte bescherming is dat de gebruiker
 * vóór opslaan ziet hoeveel tegenpartijen een regel raakt.
 */
export const MIN_OWN_ACCOUNT_NAME_LENGTH = 3

/**
 * Heeft deze gebruiker überhaupt identifiers? Zo niet, dan is elke matchronde een
 * no-op en kan de aanroeper het werk overslaan.
 *
 * Staat in deze module en niet in `own-accounts-server.ts`, omdat die laatste
 * `decryptField` meetrekt en dus server-only is; deze check is puur en wordt ook
 * client-side gebruikt.
 */
export function hasOwnAccountIdentifiers(ids: OwnAccountIdentifiers): boolean {
  return ids.ibans.size > 0 || ids.namePatterns.length > 0
}

/**
 * Bouw de gecombineerde identifier-set uit de regels (user_own_ibans) en de
 * IBANs van de eigen bankrekeningen.
 */
export function buildOwnAccountIdentifiers(
  ruleRows: OwnAccountRuleRow[] = [],
  bankIbans: (string | null | undefined)[] = [],
): OwnAccountIdentifiers {
  const ibans = new Set<string>()
  const namePatterns: string[] = []

  for (const b of bankIbans) {
    if (b && b.trim()) ibans.add(normalizeIban(b))
  }
  for (const r of ruleRows) {
    const type = (r.match_type ?? 'iban').toLowerCase()
    const raw = (r.match_value ?? r.iban ?? '').trim()
    if (!raw) continue
    if (type === 'name') {
      namePatterns.push(raw.toLowerCase())
    } else {
      ibans.add(normalizeIban(raw))
    }
  }
  return { ibans, namePatterns }
}
