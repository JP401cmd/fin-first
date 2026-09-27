/**
 * De recentste netto-vermogen-snapshots van de ingelogde gebruiker — de reeks
 * van `loadCoreData` (lib/core-data-loader.ts).
 *
 * VENSTER. De laatste `RECENT_SNAPSHOT_LIMIT` rijen op `snapshot_date`, oplopend
 * teruggegeven. De query sorteert aflopend en kapt af, zodat bij meer rijen de
 * RECENTE kant blijft; een `order(asc).limit(n)` levert de oudste n en laat
 * precies weg wat de consumenten lezen. Geen maand-dedupe: de consumenten zijn
 * rij-gebaseerd (groei-pijltje uit de laatste twee rijen, snapshot-FIRE-leeftijd
 * uit de laatste rij met `fire_age`, net-vermogen-delta-spaarquote uit de eerste
 * en de laatste rij) en niet maand-gebaseerd.
 *
 * SCOPING. Expliciet `.eq('user_id', <eigen id>)`. De SELECT-policy op
 * `net_worth_snapshots` is huishoud-gedeeld
 * (`auth.uid() = user_id OR (ownership = 'shared' AND household_id = user_household_id())`)
 * en `ownership` is door de gebruiker zelf schrijfbaar; de reeks is persoonlijk
 * en leunt dus niet op RLS. Zonder sessie een lege reeks en geen query
 * (fail-closed), zoals `lib/server-data/base.ts#getNetWorthSnapshots12m`.
 *
 * Wordt gelezen door `loadCoreData` → `CorePageData.snapshots`,
 * `assetGrowthDirection`, de /core-terugval voor de FIRE-leeftijd en de
 * `net_worth_delta`-tak van de spaarquote.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import { getCachedUser } from '@/lib/supabase/cached-user'

/** Hoeveel recente rijen de reeks draagt. */
export const RECENT_SNAPSHOT_LIMIT = 24

const RECENT_SNAPSHOT_COLUMNS =
  'snapshot_date, total_assets, total_debts, net_worth, freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score, fire_portfolio_required'

export async function fetchRecentNetWorthSnapshots(
  supabase: SupabaseClient,
): Promise<{ data: NetWorthSnapshot[] | null; error: PostgrestError | null }> {
  const user = await getCachedUser(supabase)
  if (!user) return { data: [], error: null }

  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .select(RECENT_SNAPSHOT_COLUMNS)
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .limit(RECENT_SNAPSHOT_LIMIT)

  if (error) return { data: null, error }
  // Aflopend opgehaald om de recente kant te houden; oplopend teruggegeven omdat
  // de consumenten `[length - 1]` als de recentste rij lezen.
  return { data: ((data ?? []) as NetWorthSnapshot[]).reverse(), error: null }
}
