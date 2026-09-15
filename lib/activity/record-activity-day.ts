import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Registreer dat deze gebruiker vandaag de app gebruikte — één rij per
 * (gebruiker, dag) in `user_activity_days` (ADR 0146). Geen inhoud: alleen dát
 * er activiteit was, zodat beheer actieve dagen en DAU/WAU/MAU kan tellen
 * zonder in iemands gegevens te kijken.
 *
 * - Sessie-client, eigen rij: de INSERT-policy dwingt `user_id = auth.uid()` en
 *   `day = vandaag (Amsterdam)` af; de dag zelf is een kolom-default, dus de
 *   client kan niet terugdateren.
 * - `ignoreDuplicates` = ON CONFLICT DO NOTHING: tweede open op dezelfde dag is
 *   een no-op, geen fout.
 * - Defensief: meten mag de app nooit breken. Elke fout (tabel nog niet
 *   uitgerold, netwerk) wordt ingeslikt.
 */
export async function recordActivityDay(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    await supabase
      .from('user_activity_days')
      .upsert({ user_id: userId }, { onConflict: 'user_id,day', ignoreDuplicates: true })
  } catch {
    // Meten is nooit kritiek.
  }
}
