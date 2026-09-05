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

/** Wat de server over de check-in zelf weet (prefs + voltooiing). */
export type CheckinBannerBase = { enabled: boolean; completed: boolean }

/** Wat de banner uiteindelijk krijgt: de basis plus de accountleeftijd-gate. */
export type CheckinBannerSeed = CheckinBannerBase & { eligible: boolean }

function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Mag de check-in-banner überhaupt verschijnen? (UR3-10, AC 3)
 *
 * De banner nodigt uit tot een TERUGBLIK op de vorige maand. Op dag één van een
 * vers account is er niets om op terug te blikken, en stond hij toch bovenaan —
 * naast de rondleiding, de coachmark en Fins tip. De gate is bewust op TIJD, niet
 * op data: "eerst boekingen hebben" zou functionaliteit verbergen op grond van
 * iemands financiële situatie, en dat is precies wat ADR 0001 uitsluit.
 *
 * De regel (optie C1, besluit eigenaar 5 sep 2026): het account moet zijn
 * aangemaakt vóór de 1e van de HUIDIGE maand. Een account van september ziet de
 * banner dus voor het eerst op 1–7 oktober.
 *
 * ONBEKEND IS GEEN NUL (ADR 0131): zonder bruikbare `created_at` kunnen we niet
 * vaststellen dát het account ouder is dan deze maand, dus luidt het antwoord
 * `false` — niet "dan maar tonen". Dat is een nudge die wegblijft, geen getal
 * dat verkeerd wordt.
 *
 * Tijdzone: de vergelijking draait op de lokale tijd van de server-render
 * (Europe/Amsterdam in productie). Een uur speling rond middernacht op de 1e
 * verschuift hooguit de dag waarop de nudge voor het eerst verschijnt.
 */
export function isCheckinBannerEligible(
  createdAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!createdAt) return false
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  return created.getTime() < firstOfThisMonth.getTime()
}

/**
 * Spiegelt GET /api/monthly-checkin: leest de per-user check-in-data + prefs uit
 * app_settings en bepaalt `enabled` (default true) + `completed` (huidige maand
 * in completedMonths).
 */
export async function loadCheckinBannerSeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<CheckinBannerBase> {
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
