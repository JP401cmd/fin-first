/**
 * net_worth_history helper — legt één tijdstip-gekeyd netto-vermogen-punt vast.
 *
 * I.t.t. captureBalanceSnapshots (DATE-gekeyd, upsert, 1/dag) is dit bewust
 * APPEND-ONLY: elke prijs-sync = een nieuw punt op de intraday vermogenscurve.
 * De aanroeper levert het reeds CANONIEK berekende net_worth + totalen aan
 * (uit snapshot-math / de snapshot-route) — hier wordt niets herberekend.
 *
 * Faalt stil bij de aanroeper (fire-and-forget): een mislukte, niet-kritieke
 * insert mag de sync-/snapshot-flow nooit breken (spiegelt balance-snapshot.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Herkomst van een history-punt (puur informatief/analytisch). */
export type NetWorthHistorySource = 'daily-open' | 'manual' | 'sync'

export interface NetWorthHistoryPoint {
  /** Canoniek net_worth (incl. niet-liquide assets) — nooit een liquide grootheid. */
  netWorth: number
  totalAssets: number
  totalDebts: number
  source?: NetWorthHistorySource
}

/**
 * Voeg één netto-vermogen-historiepunt toe (met server-side `captured_at`-default).
 * @returns `{ error }` — `null` bij succes; de string bij een fout (voor logging).
 */
export async function captureNetWorthHistory(
  supabase: SupabaseClient,
  userId: string,
  point: NetWorthHistoryPoint,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('net_worth_history').insert({
    user_id: userId,
    total_assets: point.totalAssets,
    total_debts: point.totalDebts,
    net_worth: point.netWorth,
    source: point.source ?? 'sync',
  })
  return { error: error ? error.message : null }
}
