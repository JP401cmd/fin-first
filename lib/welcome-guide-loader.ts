import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WELCOME_GUIDE_SETTINGS_KEY,
  WELCOME_GUIDE_MODULE_KEY,
  parseWelcomeGuideConfig,
  parseWelcomeGuideState,
  reconcileCompleted,
  deriveGuideStates,
  type GuideDerivedStates,
  type WelcomeGuideConfig,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'
import { loadAccountStatus } from '@/lib/account-status'

/**
 * Server-side SEED voor de welkomstgids (ADR 0130).
 *
 * De gids woonde tot dat besluit als banner op /overzicht; zijn seed stond
 * daarom in `lib/overview/banner-seeds.ts`. Sinds de gids in Fin woont (een
 * vierde icoon in de chat-kop) laadt de APP-LAYOUT deze seed en geeft hem aan
 * `WelcomeGuideProvider`, zodat de eerste client-fetch vervalt.
 *
 * Server-only: dit bestand raakt de Supabase-serverclient en hoort nooit in een
 * `'use client'`-boom. Het is een voorsprong, geen tweede databron —
 * `/api/welcome-guide` blijft het enige mutatie- en her-fetch-pad.
 */

export type WelcomeGuideSeed = {
  config: WelcomeGuideConfig
  state: WelcomeGuideState
  /**
   * Afgeleide stap-toestand uit de accountstatus (M1). Bewust NAAST `state`:
   * `state.completedStepIds` blijft de gebruikersintentie, de afleiding wordt
   * per render berekend en nooit weggeschreven.
   */
  derived: GuideDerivedStates
}

/**
 * Spiegelt GET /api/welcome-guide: gemergede config (app_settings) + per-user
 * staat (profiles.module_guide_state[welcome:guide]) + de afgeleide stap-
 * toestand. Ontbreekt de kolom (staging zonder migratie) of gaat er iets mis →
 * null, zodat de provider terugvalt op de route-fetch (die kent de
 * feature_preferences-fallback).
 */
export async function loadWelcomeGuideSeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<WelcomeGuideSeed | null> {
  try {
    const [configRes, stateRes, accountStatus] = await Promise.all([
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
      // `cache()`-gedeeld met de shell-layout (die de core-variant al draait) —
      // de gids-seed voegt daarmee geen accountstatus-load toe.
      loadAccountStatus(supabase, userId),
    ])

    // Kolom mist (42703 / "does not exist") → geen seed, provider fetcht met fallback.
    const err = stateRes.error as { code?: string; message?: string } | null
    if (err && (err.code === '42703' || err.message?.includes('does not exist'))) {
      return null
    }

    const config = parseWelcomeGuideConfig(configRes.data?.value)
    const map = (stateRes.data?.module_guide_state as Record<string, unknown>) ?? {}
    const state = parseWelcomeGuideState(map[WELCOME_GUIDE_MODULE_KEY], config)
    state.completedStepIds = reconcileCompleted(config, state.completedStepIds)

    return { config, state, derived: deriveGuideStates(config, accountStatus) }
  } catch {
    return null
  }
}
