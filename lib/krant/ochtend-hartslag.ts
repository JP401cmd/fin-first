// ── Krant-ochtendroutine: de hartslag ───────────────────────────────
//
// Zolang de Krant weinig lezers heeft, doet een Claude-sessie elke ochtend de
// duiding (ADR 0171) — de grootste AI-kostenpost van de ingest.
// Die sessie (skill /krant-ochtend) schrijft na afloop één rij in `job_runs`
// met job 'krant-ochtend'. Die rij is de hartslag.
//
// De news-ingest-cron leest de hartslag vóór hij begint:
//  - vers (≤ OCHTEND_HARTSLAG_MAX_UUR): de cron haalt op, kiest links,
//    categoriseert en slaat op, maar duidt NIET (wel de versie-bump); die
//    rijen staan op `wacht` voor de volgende sessie. De categorisatie blijft
//    in de cron: de live /nieuws-editie leest de summary (review 29 sep);
//  - ouder, of niet te lezen: de cron doet alles zelf via de API (vangnet).
//
// Fail-open naar de API: een leesfout betekent "doe het zelf". Liever een paar
// euro API-kosten dan een Krant die stil blijft staan.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Hoe lang een geslaagde ochtendsessie de AI-stappen van de cron overneemt. */
export const OCHTEND_HARTSLAG_MAX_UUR = 48

/** Klokverschil dat we accepteren voor een hartslag die "in de toekomst" ligt. */
const KLOK_TOLERANTIE_MS = 5 * 60 * 1000

export interface OchtendHartslag {
  /** `finished_at` van de laatste geslaagde ochtendsessie, of null. */
  laatste: string | null
  /** true = de cron laat duiding en categorisatie aan de sessie over. */
  vers: boolean
}

/** Puur: is de hartslag op `nu` nog vers? */
export function isHartslagVers(laatste: string | null, nu: Date): boolean {
  if (!laatste) return false
  const t = Date.parse(laatste)
  if (!Number.isFinite(t)) return false
  const leeftijd = nu.getTime() - t
  return leeftijd >= -KLOK_TOLERANTIE_MS && leeftijd <= OCHTEND_HARTSLAG_MAX_UUR * 60 * 60 * 1000
}

/** Leest de laatste geslaagde ochtendsessie. Werpt nooit; bij een fout: niet vers. */
export async function leesOchtendHartslag(service: SupabaseClient, nu: Date): Promise<OchtendHartslag> {
  try {
    const { data, error } = await service
      .from('job_runs')
      .select('finished_at')
      .eq('job', 'krant-ochtend')
      .eq('status', 'success')
      // Een rij "in de toekomst" (voorlopende klok) mag de echte laatste niet verdringen.
      .lte('finished_at', new Date(nu.getTime() + KLOK_TOLERANTIE_MS).toISOString())
      .order('finished_at', { ascending: false })
      .limit(1)
    if (error) return { laatste: null, vers: false }
    const laatste = (data?.[0]?.finished_at as string | undefined) ?? null
    return { laatste, vers: isHartslagVers(laatste, nu) }
  } catch {
    return { laatste: null, vers: false }
  }
}
