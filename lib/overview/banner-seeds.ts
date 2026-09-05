import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side SEED voor de check-in-banner op /overzicht (perf fase 1).
 *
 * CheckinBanner fetchte zijn eerste payload client-side op mount
 * (`/api/monthly-checkin`). Deze helper berekent diezelfde payload al
 * server-side op de /overzicht-pagina, zodat de banner de eerste client-fetch
 * kan overslaan — exact het PageStatusSeed-patroon: de API-route blijft bestaan
 * voor interacties/her-fetches; de seed is enkel een server-side voorsprong,
 * geen tweede databron. Alle reads zijn defensief: een fout levert een veilige
 * default → de banner valt terug op fetchen.
 *
 * De welkomstgids-seed stond hier ooit naast. Die is met ADR 0130 verhuisd naar
 * `lib/welcome-guide-loader.ts`: de gids is geen /overzicht-banner meer maar een
 * weergave in Fin, en zijn seed wordt in de app-layout geladen.
 */

// ── CheckinBanner ────────────────────────────────────────────────────────────

export type CheckinBannerSeed = { enabled: boolean; completed: boolean }

function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Spiegelt GET /api/monthly-checkin: leest de per-user check-in-data + prefs uit
 * app_settings en bepaalt `enabled` (default true) + `completed` (huidige maand
 * in completedMonths).
 */
export async function loadCheckinBannerSeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<CheckinBannerSeed> {
  try {
    const [checkinRes, prefsRes] = await Promise.all([
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', `monthly_checkin_${userId}`)
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', `monthly_checkin_prefs_${userId}`)
        .maybeSingle(),
    ])

    const completedMonths: string[] = checkinRes.data?.value
      ? (JSON.parse(checkinRes.data.value).completedMonths ?? [])
      : []
    const enabled = prefsRes.data?.value
      ? JSON.parse(prefsRes.data.value).enabled !== false
      : true

    return { enabled, completed: completedMonths.includes(currentMonthKey()) }
  } catch {
    // Veilige default: enabled + niet-voltooid zou de banner tonen, maar de
    // client gate't nog op eerste-week + sessie-dismiss. Bij twijfel liever
    // "completed" (verberg) dan onterecht tonen.
    return { enabled: true, completed: true }
  }
}
