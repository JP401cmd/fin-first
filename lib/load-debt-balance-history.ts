// lib/load-debt-balance-history.ts
//
// OPENSTAAND SCHULDSALDO — MAANDHISTORIE (widgetreview Schuldtrend, Optie B)
// ───────────────────────────────────────────────────────────────────────────
// De Schuldtrend-widget (`trend_schulden`) toonde vroeger de som van débt-budget-
// TRANSACTIES per maand = maandelijkse AFLOSSINGEN. Dat botste met de widgetnaam en
// het filosofie-frame "schulden = vrijheid die je terugkoopt" (dat een DÁLEND
// openstaand saldo als "goed" leest). Optie B (gekozen door de gebruiker): toon het
// openstaand schuldSALDO over tijd. Een dalend saldo = goed → dankzij
// `goodWhenUp: false` op het debt-type kleurt de trend dan vanzelf correct.
//
// BRON: `balance_snapshots` (per-entiteit saldo per snapshot-datum, entity_type
// 'debt'), geconsumeerd via het RLS-veilige, egress-zuinige latest-per-maand
// aggregaat (`balance_snapshots_monthly_latest`, zie lib/server-data/snapshot-
// aggregates.ts). Dit is DEZELFDE bron als netto-vermogen-historie en de per-
// entiteit sparklines (lib/load-entity-sparklines.ts) — geen nieuwe schuldbron,
// geen schending van één-bron-van-waarheid.

import type { SnapshotMonthlyLatestRow } from '@/lib/server-data/snapshot-aggregates'

export interface DebtSaldoPoint {
  month: string
  value: number
}

/**
 * Bouw de openstaand-schuldsaldo-historie (Σ schuldSALDI per maand) uit het
 * latest-per-maand snapshot-aggregaat.
 *
 * - Alleen `entity_type === 'debt'`, gewogen met `net_worth_inclusion_pct` (zoals
 *   netto vermogen / sparklines).
 * - Per schuld-entiteit forward-fill over het 12-maands venster vanaf de eerste
 *   meting: een schuld die deze maand niet opnieuw gesnapshot is, telt mee met zijn
 *   laatst bekende saldo (anders zou het maandtotaal kunstmatig kelderen). Vóór de
 *   eerste meting draagt de entiteit niets bij (geen valse historie).
 * - Het venster wordt links afgekapt op de eerste maand waarin ÉNIGE schuld bestond,
 *   zodat er geen misleidende reeks €0-maanden vóór de eerste schuld verschijnt.
 *
 * `now` = referentiepunt voor het 12-maands venster (UTC-maandsleutels, identiek aan
 * lib/load-entity-sparklines.ts en de `twelveMonthsAgo`-grens in de loader).
 */
export function buildDebtSaldoHistory(
  rows: SnapshotMonthlyLatestRow[],
  now: Date = new Date(),
): DebtSaldoPoint[] {
  const monthKeys: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const monthIdx = new Map<string, number>(monthKeys.map((k, i) => [k, i]))

  // Per (entity_id, maand) → gewogen saldo. Het aggregaat levert al de laatste
  // snapshot per maand, dus geen extra reductie nodig — alleen de weging.
  const byEntityMonth = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (r.entity_type !== 'debt') continue
    if (!monthIdx.has(r.month)) continue
    const weight = Number(r.net_worth_inclusion_pct ?? 100) / 100
    let m = byEntityMonth.get(r.entity_id)
    if (!m) {
      m = new Map<string, number>()
      byEntityMonth.set(r.entity_id, m)
    }
    m.set(r.month, Number(r.balance) * weight)
  }

  if (byEntityMonth.size === 0) return []

  // Per entiteit een forward-gevulde reeks (null vóór de eerste meting), daarna
  // per maand optellen over alle schulden.
  const totals: (number | null)[] = monthKeys.map(() => null)
  for (const monthMap of byEntityMonth.values()) {
    let last: number | null = null
    for (let i = 0; i < monthKeys.length; i++) {
      const v = monthMap.get(monthKeys[i])
      if (v != null) last = v
      if (last == null) continue // vóór de eerste meting van deze schuld
      totals[i] = (totals[i] ?? 0) + last
    }
  }

  // Links afkappen op de eerste maand met een schuld.
  const firstIdx = totals.findIndex((v) => v != null)
  if (firstIdx === -1) return []
  return monthKeys.slice(firstIdx).map((month, j) => ({
    month,
    value: totals[firstIdx + j] ?? 0,
  }))
}
