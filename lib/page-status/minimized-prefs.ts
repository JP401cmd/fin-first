// lib/page-status/minimized-prefs.ts
//
// Lichte lezing van de "geminimaliseerd"-voorkeurenmap
// (`profiles.status_banner_minimized`, jsonb: sleutel → niveau).
//
// BESTAANSREDEN (aparte module): `lib/page-status/compute.ts` trekt de zware
// /overzicht-loaders binnen (dashboard, cashflow, lever-scores). Een pagina die
// alléén de voorkeur nodig heeft — bv. /toekomst voor de tekort-lening-melding —
// moet die module-graaf niet meeslepen. compute.ts consumeert deze helper zelf,
// zodat er ÉÉN lezing van de map blijft en geen tweede datapad ontstaat.
//
// RLS: single-row select op de EIGEN profielrij via de anon-client. Nooit een
// service-role-client.
//
// React-`cache()`: binnen één server-request halen meerdere blokken van
// /overzicht dezelfde map op (blok 1 voor de "gegevens verouderd"-melding, blok 2
// via `readMinimizedLevel` voor de status-banner). Zonder wrapper zijn dat twee
// identieke selects per bezoek; mét is het er één. Het gedrag blijft gelijk — de
// cache leeft per request, niet per gebruiker.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Leest de volledige "geminimaliseerd"-map van de eigen profielrij.
 * Waarden zijn heterogeen: /overzicht-routes dragen een stoplicht-niveau
 * (string), de tekort-lening-melding een piek (number). Smallen doet de caller
 * met de bijbehorende narrowing-helper.
 *
 * @returns de map, of een leeg object als er geen rij/waarde is.
 */
export const readMinimizedMap = cache(async function readMinimizedMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('status_banner_minimized')
    .eq('id', userId)
    .single()

  // Een RLS-/PostgREST-fout zou anders stil als "geen voorkeur" landen — en dus
  // als "melding tonen", zonder spoor. Het GEDRAG blijft bewust gelijk (falen =
  // tonen is de veilige kant), maar de fout is nu server-side grep-baar.
  if (error) {
    console.error('[page-status:readMinimizedMap]', error)
  }

  return (data?.status_banner_minimized ?? {}) as Record<string, unknown>
})
