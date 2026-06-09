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
