/**
 * Actie-suppressie voor de aandachtspunten-laag — server-side, faal-zacht.
 *
 * `loadActionedAandachtspuntIds(supabase)` levert de set `aandachtspunt_id`-
 * waarden waarvoor de gebruiker AL een actie heeft: elke OPEN actie én elke
 * recent AFGERONDE (≤ {@link ACTIONED_COMPLETED_WINDOW_MONTHS} mnd, zie
 * `collectActionedIds`). Dit is de CANONIEKE bron van de suppressie: zowel de
 * aandachtspunten-bus (`collectAandachtspunten`) als de AI-context-builders
 * (cloud tax-context) consumeren deze helper, zodat een tip die al als actie op
 * de lijst staat — bv. "benut je jaarruimte" — NERGENS meer als nieuwe suggestie
 * opduikt (voorheen leidde de tax-context de AI langs de suppressie heen).
 *
 * Bewust een lichte, losse module (alleen de actions-query + de pure
 * `collectActionedIds`): zo kan de cloud tax-context de suppressie consumeren
 * zonder de zware `aandachtspunten-loader` (loadHorizonData/NIBUD) in te laden.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { collectActionedIds, type ActionSuppressionRow } from './aandachtspunten'
import { getCachedUser } from './supabase/cached-user'

const EMPTY: ReadonlySet<string> = new Set<string>()

/**
 * Laad de set geactioneerde `aandachtspunt_id`-waarden voor de ingelogde
 * gebruiker. Faalt zacht → lege set (geen suppressie, huidig gedrag intact):
 * de suppressie mag nooit een context-build of de bus laten sneuvelen.
 *
 * RLS is de canonieke own-row-waarborg; het expliciete `user_id`-filter is
 * defense-in-depth (spiegelt het zusterpatroon in aandachtspunten-loader).
 */
export async function loadActionedAandachtspuntIds(
  supabase: SupabaseClient,
): Promise<ReadonlySet<string>> {
  try {
    const user = await getCachedUser(supabase)
    if (!user) return EMPTY
    const { data } = await supabase
      .from('actions')
      .select('metadata, status, completed_at')
      .eq('user_id', user.id)
      .in('status', ['open', 'completed'])
      .not('metadata->>aandachtspunt_id', 'is', null)
      // Ruim bemeten: de id-ruimte is klein (per aandachtspunt hooguit enkele
      // acties), dus 500 voorkomt dat de suppressie ooit fail-open gaat door
      // truncatie.
      .limit(500)
    return collectActionedIds((data ?? []) as ActionSuppressionRow[])
  } catch {
    return EMPTY
  }
}
