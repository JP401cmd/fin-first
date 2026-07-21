// lib/server-data/snapshot-aggregates.ts
//
// SNAPSHOT LATEST-PER-MAAND AGGREGAAT (FASE 2 · vervolg T2.2)
// ───────────────────────────────────────────────────────────────────────────
// Consumeer de SQL-functie `public.balance_snapshots_monthly_latest` (migratie
// 20260721120000) i.p.v. ALLE balance_snapshots over 12 maanden op te halen om er
// in JS de laatste snapshot per (entity_id, maand) uit te reduceren. Dat lost twee
// problemen op:
//   • EGRESS: opgehaald = entiteiten × snapshot-frequentie (≈ ×365 bij dagelijkse
//     snapshots) terwijl alleen entiteiten × 12 nodig is.
//   • STILLE AFKAP: PostgREST kapt elk antwoord af op `max_rows` (config.toml =
//     1000). Een power-user met veel entiteiten × dagelijkse snapshots kon >1000
//     rijen raken → sparklines stil afgekapt. Een latest-per-maand aggregaat
//     levert ≤ entiteiten × 12 rijen en kan niet afkappen.
//
// PARITY-CONTRACT
//   • De functie geeft één rij per (entity_id, kalendermaand 'YYYY-MM') met de
//     balance + net_worth_inclusion_pct van de LAATSTE snapshot in die maand —
//     identiek aan stap 1-2 van de vroegere JS-reductie (core-data-loader).
//   • De weging (× net_worth_inclusion_pct/100), het venster-filter op maand-keys
//     en de per-categorie backward/forward-fill blijven in JS (ongewijzigd).
//   • `buildLatestSnapshotsByMonthFromRows` reproduceert de SQL in TS zodat de
//     parity-test kan bewijzen: oude JS-reductie(ruwe rijen) ==
//     nieuwe reductie(aggregaat) — inclusief een >1000-rijen-getuige.
//
// RLS/BEVEILIGING: de functie is SECURITY INVOKER; ze MOET met de anon/
// authenticated RLS-client (createClient uit lib/supabase/server.ts) worden
// aangeroepen — nooit met getServiceClient(). balance_snapshots kent alleen een
// own-row SELECT-policy (geen household-share), dus de functie ziet exact dezelfde
// rijen als de vroegere `.from('balance_snapshots')`-query.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Één rij zoals `balance_snapshots_monthly_latest` teruggeeft. */
export interface SnapshotMonthlyLatestRow {
  entity_id: string
  entity_type: 'asset' | 'debt' | string
  entity_subtype: string | null
  /** Kalendermaand als 'YYYY-MM'. */
  month: string
  balance: number | string
  net_worth_inclusion_pct: number | string | null
}

/**
 * Haal het latest-per-maand snapshot-aggregaat op via de RLS-veilige RPC. `from`
 * als lokale datum-string ('YYYY-MM-DD'). Retourneert de rauwe PostgREST-vorm zodat
 * de consumer `.data ?? []` / `.error` ongewijzigd houdt.
 *
 * MOET met de authenticated/anon RLS-client worden aangeroepen (nooit
 * getServiceClient): de functie is SECURITY INVOKER en leunt op de own-row RLS van
 * `balance_snapshots`.
 */
export async function fetchLatestSnapshotsByMonth(
  supabase: SupabaseClient,
  from: string,
): Promise<{ data: SnapshotMonthlyLatestRow[] | null; error: unknown }> {
  const { data, error } = await supabase.rpc('balance_snapshots_monthly_latest', {
    p_from: from,
  })
  return { data: (data as SnapshotMonthlyLatestRow[] | null) ?? null, error }
}

// ── Test-hulp: reproduceer de SQL in TS ─────────────────────────────────────
/**
 * Bouw hetzelfde latest-per-(entity_id, maand) aggregaat als de SQL-functie uit
 * ruwe snapshot-rijen. Uitsluitend voor de parity-test: bewijst dat de aggregaat-
 * vorm genoeg informatie draagt om de oude JS-reductie byte-identiek te
 * reproduceren. `to_char(snapshot_date,'YYYY-MM')` == `snapshot_date.slice(0,7)`
 * voor 'YYYY-MM-DD'-strings.
 */
export function buildLatestSnapshotsByMonthFromRows(
  rawRows: {
    entity_id: string
    entity_type: string
    entity_subtype: string | null
    snapshot_date: string
    balance: number | string
    net_worth_inclusion_pct: number | string | null
  }[],
): SnapshotMonthlyLatestRow[] {
  // Per (entity_id, maand): bewaar de rij met de hoogste snapshot_date (DISTINCT
  // ON … ORDER BY snapshot_date DESC).
  const latest = new Map<string, (typeof rawRows)[number]>()
  for (const r of rawRows) {
    const month = r.snapshot_date.slice(0, 7)
    const key = `${r.entity_id}|${month}`
    const cur = latest.get(key)
    if (!cur || r.snapshot_date > cur.snapshot_date) latest.set(key, r)
  }
  return [...latest.entries()].map(([, r]) => ({
    entity_id: r.entity_id,
    entity_type: r.entity_type,
    entity_subtype: r.entity_subtype,
    month: r.snapshot_date.slice(0, 7),
    balance: r.balance,
    net_worth_inclusion_pct: r.net_worth_inclusion_pct,
  }))
}
