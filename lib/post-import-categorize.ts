/**
 * Hulpstukken voor de categoriseerstap ná de bestandsimport
 * (`app/(app)/core/cash/import/page.tsx`, stap 4).
 *
 * De import zet de transacties eerst vast in de database; pas daarna wordt er
 * gecategoriseerd op de opgeslagen rijen. Deze module bepaalt WELKE rijen dat werk
 * vormen en hoe die verzameling meebeweegt — puur en zonder Supabase, zodat het
 * gedrag met een test vast te pinnen is in plaats van alleen met de hand na te lopen.
 *
 * Leidend principe: de verzameling wordt HERLEID uit wat er in de database staat,
 * nooit lokaal opgehoogd of afgetrokken. Het categoriseer-scherm schrijft namelijk
 * meer weg dan het toont (een opgeslagen regel wordt retroactief toegepast op álle
 * nog ongecategoriseerde treffers), dus elke lokale telling loopt onmiddellijk uit
 * de pas met de werkelijkheid.
 */

/**
 * Kolommen die het post-import categoriseer-scherm nodig heeft. Eén plek zodat de
 * eerste insert, de retry en de verversing niet uit elkaar kunnen lopen; de
 * server-route (`app/api/transactions/import/route.ts`) spiegelt deze lijst.
 */
export const POST_IMPORT_SELECT =
  'id, date, description, counterparty_name, counterparty_iban, amount, import_hash, budget_id, reference, transaction_type'

/** Vorm zoals `POST_IMPORT_SELECT` 'm teruggeeft (client- én serverpad). */
export type InsertedTxRow = {
  id: string
  date: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  /** PostgREST kan een numeric als string teruggeven; hier altijd genormaliseerd. */
  amount: number | string
  import_hash: string | null
  budget_id: string | null
  reference: string | null
  transaction_type: string | null
}

/**
 * Minimale transactievorm voor het post-import categoriseer-scherm
 * (AICategorizeSheet). Structureel compatibel met de interne Transaction van de
 * sheet; wordt gevuld uit de zojuist weggeschreven, nog ongecategoriseerde rijen.
 */
export type PostImportTx = {
  id: string
  date: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
  import_hash: string | null
  budget_id: string | null
  reference?: string | null
  account_id?: string | null
}

/**
 * Filtert de zojuist weggeschreven rijen tot het werk voor het categoriseer-scherm:
 * alles zonder budget dat geen overboeking is. Gedeeld door de eerste importronde en
 * de "opnieuw proberen"-ronde, zodat een pas-bij-de-retry geslaagde batch dezelfde
 * behandeling krijgt als de rest.
 *
 * Overboekingen vallen af omdat ze bij het parsen al aan het eigen-rekening-budget
 * zijn gehangen; ze horen niet als open werk op het scherm.
 */
export function pickUncategorized(
  rows: InsertedTxRow[],
  accountId: string | null,
): PostImportTx[] {
  const out: PostImportTx[] = []
  for (const r of rows) {
    if (r.budget_id === null && r.transaction_type !== 'transfer') {
      out.push({
        id: r.id,
        date: r.date,
        description: r.description,
        counterparty_name: r.counterparty_name,
        counterparty_iban: r.counterparty_iban,
        amount: Number(r.amount),
        import_hash: r.import_hash,
        budget_id: null,
        reference: r.reference,
        account_id: accountId,
      })
    }
  }
  return out
}

/**
 * Voegt pas-bij-de-retry geslaagde rijen toe aan de bestaande verzameling.
 * Aanvullen, niet vervangen — de rijen uit de eerste ronde staan er al. Dedup op id
 * zodat een tweede "opnieuw proberen" dezelfde rij niet dubbel aanbiedt.
 */
export function mergeUncategorized(
  prev: PostImportTx[],
  recovered: PostImportTx[],
): PostImportTx[] {
  if (recovered.length === 0) return prev
  const seen = new Set(prev.map((r) => r.id))
  const additions: PostImportTx[] = []
  for (const r of recovered) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    additions.push(r)
  }
  return additions.length === 0 ? prev : [...prev, ...additions]
}

/**
 * Houdt alleen de rijen over die volgens de database nog géén budget hebben.
 * `stillOpenIds` komt uit een verse lezing op `budget_id is null`; alles wat daar
 * niet meer in zit is inmiddels ingedeeld — door de gebruiker zelf óf retroactief
 * door een opgeslagen regel.
 */
export function retainStillOpen(
  prev: PostImportTx[],
  stillOpenIds: ReadonlySet<string>,
): PostImportTx[] {
  return prev.filter((r) => stillOpenIds.has(r.id))
}
