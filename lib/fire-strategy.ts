/**
 * FIRE Eindstrategie — types, defaults en labels.
 *
 * Drie modi:
 *  - deplete:   Portfolio → €0 op instelbare leeftijd (default 90)
 *  - legacy:    Portfolio → instelbaar bedrag op instelbare leeftijd
 *  - perpetual: Portfolio behoudt koopkracht, eeuwigdurend geïndexeerd
 *
 * Pure types, geen Supabase dependency.
 */

export type FireEndStrategy = 'perpetual' | 'legacy' | 'deplete'

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
}

/** Parse profile data to FireStrategyConfig with safe defaults. */
export function parseFireStrategy(profile: {
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
}): FireStrategyConfig {
  return {
    strategy: (['perpetual', 'legacy', 'deplete'].includes(profile.fire_end_strategy ?? '')
      ? profile.fire_end_strategy as FireEndStrategy
      : 'deplete'),
    endAge: profile.fire_end_age ?? 90,
    legacyAmount: Number(profile.fire_legacy_amount ?? 0),
  }
}
