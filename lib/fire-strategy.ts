/**
 * FIRE Eindstrategie — types, defaults en labels.
 *
 * Vier modi:
 *  - deplete:   Portfolio → €0 op instelbare leeftijd (default 90)
 *  - legacy:    Portfolio → instelbaar bedrag op instelbare leeftijd
 *  - perpetual: Portfolio behoudt koopkracht, eeuwigdurend geïndexeerd
 *  - pensioen:  Opbouw tot AOW-leeftijd, daarna onttrekking
 *
 * Pure types, geen Supabase dependency.
 */

export type FireEndStrategy = 'perpetual' | 'legacy' | 'deplete' | 'pensioen'

export interface FireStrategyConfig {
  strategy: FireEndStrategy
  endAge: number        // 60–120, voor deplete/legacy; display-horizon voor perpetual
  legacyAmount: number  // in huidige euro's, alleen voor legacy
}

export const DEFAULT_FIRE_STRATEGY: FireStrategyConfig = {
  strategy: 'deplete',
  endAge: 90,
  legacyAmount: 0,
}

export const STRATEGY_LABELS: Record<FireEndStrategy, { name: string; subtitle: string }> = {
  deplete: {
    name: 'Portfolio opteren',
    subtitle: 'Vermogen wordt volledig opgemaakt',
  },
  legacy: {
    name: 'Erfenis',
    subtitle: 'Eindig met een gewenst bedrag',
  },
  perpetual: {
    name: 'Behouden van vermogen',
    subtitle: 'Koopkracht blijft intact, eeuwigdurend',
  },
  pensioen: {
    name: 'Pensioenleeftijd',
    subtitle: 'Opbouw tot AOW, vaste onttrekking, restant als nalatenschap',
  },
}

/** Parse profile data to FireStrategyConfig with safe defaults. */
export function parseFireStrategy(profile: {
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
}): FireStrategyConfig {
  return {
    strategy: (['perpetual', 'legacy', 'deplete', 'pensioen'].includes(profile.fire_end_strategy ?? '')
      ? profile.fire_end_strategy as FireEndStrategy
      : 'deplete'),
    endAge: profile.fire_end_age ?? 90,
    legacyAmount: Number(profile.fire_legacy_amount ?? 0),
  }
}

/**
 * Resolve the fire strategy with feature_preferences fallback.
 * When the DB CHECK constraint doesn't yet include 'pensioen', the fire-settings API
 * stores the strategy override in profiles.feature_preferences.fire_strategy_override.
 *
 * Use this on server-side (e.g. dashboard-data-loader) where you have the profile data.
 */
export function resolveFireStrategyWithOverride(
  profile: {
    fire_end_strategy?: string | null
    fire_end_age?: number | null
    fire_legacy_amount?: number | string | null
    feature_preferences?: Record<string, unknown> | null
  },
): FireStrategyConfig {
  const base = parseFireStrategy(profile)

  // If DB already has 'pensioen', no fallback needed
  if (base.strategy === 'pensioen') return base

  // Check feature_preferences for pensioen override
  const fp = profile.feature_preferences ?? {}
  if (fp.fire_strategy_override === 'pensioen') {
    return { ...base, strategy: 'pensioen' }
  }

  return base
}
