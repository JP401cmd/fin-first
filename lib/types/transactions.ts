// ── Transactie data-contracten ───────────────────────────
// Verhuisd uit components/app/transacties-feed.tsx zodat de import-richting
// UI→lib is. Zuiver type-only.

/**
 * Smalle rij-vorm die de geldstroom-weergaven gebruiken.
 *
 * Afnemers: `lib/cashflow-data-loader.ts` en
 * `components/overview/transacties-geldstroom.tsx`.
 */
export type TransactionRow = {
  id: string
  date: string // ISO yyyy-mm-dd
  description: string
  category?: string | null
  amount: number // negative = uitgave, positive = inkomst
  account_name?: string | null
}
