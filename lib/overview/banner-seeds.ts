import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WELCOME_GUIDE_SETTINGS_KEY,
  WELCOME_GUIDE_MODULE_KEY,
  parseWelcomeGuideConfig,
  parseWelcomeGuideState,
  reconcileCompleted,
  type WelcomeGuideConfig,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'

/**
 * Server-side SEEDS voor de /overzicht-banners (perf fase 1).
 *
 * CheckinBanner en WelcomeGuideBanner fetchten hun eerste payload client-side op
 * mount (`/api/monthly-checkin`, `/api/welcome-guide`). Deze helpers berekenen
 * diezelfde payload al server-side op de /overzicht-pagina, zodat de banner de
 * eerste client-fetch kan overslaan — exact het PageStatusSeed-patroon: de API-
 * routes blijven bestaan voor interacties/her-fetches; de seed is enkel een
 * server-side voorsprong, geen tweede databron. Alle reads zijn defensief: een
 * fout levert een veilige default (of null) → de banner valt terug op fetchen.
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

// ── WelcomeGuideBanner ───────────────────────────────────────────────────────

export type WelcomeGuideSeed = { config: WelcomeGuideConfig; state: WelcomeGuideState }

/**
 * Spiegelt GET /api/welcome-guide: gemergede config (app_settings) + per-user
 * staat (profiles.module_guide_state[welcome:guide]). Ontbreekt de kolom
 * (staging zonder migratie) of gaat er iets mis → null, zodat de banner
 * terugvalt op de route-fetch (die kent de feature_preferences-fallback).
 */
export async function loadWelcomeGuideSeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<WelcomeGuideSeed | null> {
  try {
    const [configRes, stateRes] = await Promise.all([
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', WELCOME_GUIDE_SETTINGS_KEY)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('module_guide_state')
        .eq('id', userId)
        .single(),
    ])

    // Kolom mist (42703 / "does not exist") → geen seed, banner fetcht met fallback.
    const err = stateRes.error as { code?: string; message?: string } | null
    if (err && (err.code === '42703' || err.message?.includes('does not exist'))) {
      return null
    }

    const config = parseWelcomeGuideConfig(configRes.data?.value)
    const map = (stateRes.data?.module_guide_state as Record<string, unknown>) ?? {}
    const state = parseWelcomeGuideState(map[WELCOME_GUIDE_MODULE_KEY], config)
    state.completedStepIds = reconcileCompleted(config, state.completedStepIds)

    return { config, state }
  } catch {
    return null
  }
}
