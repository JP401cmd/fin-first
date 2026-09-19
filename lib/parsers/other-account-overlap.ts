import {
  partitionCrossSourceDuplicates,
  type CrossSourceCandidate,
} from './cross-source-dedup'

/**
 * Overlap met een ANDERE eigen rekening — de waarschuwing bij een upload.
 *
 * De cross-bron-dedup (laag 2, `cross-source-dedup.ts`) is bewust gescoped op
 * `(user_id, account_id)`: dezelfde boeking mag op twee rekeningen naast elkaar
 * bestaan. Precies dáárdoor krijgt wie één export in twee rekeningen uploadt
 * (PayPal-export in "creditcard" én in "PayPal") geen enkel signaal — de
 * uitgaven tellen dubbel en de abonnementsdetectie raakt de weg kwijt.
 *
 * Eigenaarsbesluit (11-09-2026): WAARSCHUWEN, niet blokkeren en nooit zelf
 * verwijderen. "X regels staan al op rekening Y — toch importeren?" De
 * gebruiker beslist; dedup blijft uitsluitend INSERTs verhinderen binnen de
 * eigen rekening.
 *
 * ## Dezelfde sleutel als laag 2, per andere rekening
 *
 * Datum ±1 kalenderdag, bedrag exact op de cent, tegenpartij-IBAN exact of —
 * bij eenzijdig ontbrekende IBAN — de genormaliseerde naam. Geen eigen
 * matchregel: deze module roept `partitionCrossSourceDuplicates` aan per
 * rekening, zodat de waarschuwing precies datgene herkent wat laag 2 óók zou
 * herkennen als de rijen op dezelfde rekening stonden. Eén bestaande rij
 * absorbeert hooguit één kandidaat (twee echte €5-boekingen bij dezelfde bakker
 * tellen niet allebei als "staat er al").
 *
 * ## Transport-agnostisch
 *
 * Puur, geen Supabase-import. De ophaal van "wat staat er op mijn andere
 * rekeningen" woont in `lib/truelayer/existing-hashes.ts`
 * (`loadOtherOwnAccountCandidates`), naast de andere scope-loaders, en de
 * scoping op de EIGEN gebruiker is daar een privacy-control — partnerrijen
 * horen hier nooit in.
 */

/** Bestaande rijen van één andere eigen rekening. */
export type OtherAccountRows = {
  account_id: string
  rows: readonly CrossSourceCandidate[]
}

/** Per andere rekening: hoeveel kandidaten daar al staan. Alleen rekeningen met ≥1 treffer. */
export type OtherAccountOverlap = {
  account_id: string
  count: number
}

/**
 * Tel per andere eigen rekening hoeveel van de kandidaat-rijen daar al staan.
 * Rekeningen zonder treffer blijven weg; volgorde = aflopend op aantal, dan op
 * `account_id` (stabiel voor de weergave en voor tests).
 */
export function countOtherAccountOverlaps(
  candidates: readonly CrossSourceCandidate[],
  others: readonly OtherAccountRows[],
): OtherAccountOverlap[] {
  if (candidates.length === 0) return []
  const result: OtherAccountOverlap[] = []
  for (const other of others) {
    if (other.rows.length === 0) continue
    const decisions = partitionCrossSourceDuplicates(candidates, other.rows)
    let count = 0
    for (const d of decisions) if (d.reason) count++
    if (count > 0) result.push({ account_id: other.account_id, count })
  }
  return result.sort(
    (a, b) => b.count - a.count || (a.account_id < b.account_id ? -1 : a.account_id > b.account_id ? 1 : 0),
  )
}

/**
 * Groepeer een platte rijenlijst (zoals de loader 'm teruggeeft) per rekening.
 */
export function groupRowsByAccount<T extends CrossSourceCandidate & { account_id: string }>(
  rows: readonly T[],
): OtherAccountRows[] {
  const byAccount = new Map<string, T[]>()
  for (const row of rows) {
    const bucket = byAccount.get(row.account_id)
    if (bucket) bucket.push(row)
    else byAccount.set(row.account_id, [row])
  }
  return [...byAccount.entries()].map(([account_id, rows]) => ({ account_id, rows }))
}
