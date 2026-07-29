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
    name: 'Vermogen opeten',
    subtitle: 'Vermogen volledig opgemaakt — inflatiegecorrigeerd',
  },
  legacy: {
    name: 'Nalatenschap',
    subtitle: 'Eindig met een doelbedrag — onttrekkingen inflatiebestendig',
  },
  perpetual: {
    name: 'Eeuwigdurend',
    subtitle: 'Koopkracht blijft intact — alleen reëel rendement onttrekken',
  },
  pensioen: {
    name: 'Pensioenleeftijd',
    subtitle: 'Opbouw tot AOW, inflatiebestendige onttrekking, restant als nalatenschap',
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

// ── Afgeleide vrijheids-/pensioentoestand (consume-only, ADR 0009) ──────────
//
// Eén canonieke, GEDEELDE bron die hero, status-banner én AI consumeren, zodat
// er geen drift ontstaat ("UI zegt vrij, Fin zegt nog 8 jaar te gaan"). Deze
// helpers HERBEREKENEN niets: ze lezen reeds-berekende waarden (freedomPct uit
// computeFreedomProgress, currentAge/fireAge/aowAge uit de loaders/unified
// projection) en bevatten GEEN hardcoded leeftijden of forfaits — de AOW-leeftijd
// komt via `lib/aow-leeftijd.ts`/de loaders binnen als parameter.

export interface FreedomStateInput {
  /** Canonieke vrijheidsvoortgang 0–100 (computeFreedomProgress). Null = onbekend. */
  freedomPct: number | null
  /** Huidige leeftijd in jaren. Null = geen geboortedatum bekend. */
  currentAge: number | null
  /**
   * Vrijheids-/FIRE-leeftijd in jaren. Null = projectie kon niet draaien.
   *
   * GEEF DE FRACTIONELE WAARDE (`fireAgeFractional`), niet een afgeronde: dit veld
   * is een DREMPEL (`currentAge >= fireAge`), geen weergave. Afronden van bv. 44,92
   * naar 45 laat "financieel vrij" tot 6 maanden te vroeg triggeren bij een
   * currentAge van 45 (WF-CANON-03). Rond alléén af waar het getal als
   * vrijheidsleeftijd wordt getoond.
   */
  fireAge: number | null
  /** Gekozen eindstrategie — onderscheidt 'regulier pensioen' van 'vervroegde vrijheid'. */
  strategy?: FireEndStrategy
  /**
   * AOW-leeftijd in jaren (uit lib/aow-leeftijd.ts) — optioneel. Alleen gebruikt
   * voor precieze 'voorbij AOW'-detectie; ontbreekt 'ie, dan valt de logica terug
   * op `fireAge` (in pensioen-modus is `fireAge` ≡ de AOW-leeftijd).
   */
  aowAge?: number | null
}

/**
 * Reeds financieel vrij: de vrijheidsvoortgang staat op 100% OF de huidige
 * leeftijd is voorbij de vrijheidsleeftijd. Vanaf dit punt is "% op weg naar
 * vrijheid" niet meer de juiste framing — het beeld toont onttrekking, geen opbouw.
 */
export function isFinanciallyFree(input: FreedomStateInput): boolean {
  const { freedomPct, currentAge, fireAge } = input
  if (freedomPct != null && Number.isFinite(freedomPct) && freedomPct >= 100) return true
  if (currentAge != null && fireAge != null && currentAge >= fireAge) return true
  return false
}

/**
 * Onttrekkings-/pensioenbeeld van toepassing: de gebruiker is al financieel vrij,
 * OF heeft de pensioen-strategie gekozen en is voorbij de AOW-leeftijd (in
 * pensioen-modus is `fireAge` ≡ AOW). Dit is de trigger voor de "dit beeld toont
 * je onttrekking tot einde leven"-duiding.
 */
export function isRetiredView(input: FreedomStateInput): boolean {
  if (isFinanciallyFree(input)) return true
  if (input.strategy === 'pensioen') {
    const threshold = input.aowAge ?? input.fireAge
    if (input.currentAge != null && threshold != null && input.currentAge >= threshold) {
      return true
    }
  }
  return false
}

export type FreedomFraming = 'building' | 'free' | 'pensioen'

/**
 * Hero-/banner-woordkeuze in één afgeleide waarde:
 *  - 'building' — nog op weg ("X% op weg naar vrijheid"); de bestaande framing.
 *  - 'pensioen' — vrij rond de AOW-leeftijd: 'regulier pensioen' (strategy
 *    'pensioen', óf leeftijd/vrijheidsleeftijd op of voorbij AOW).
 *  - 'free'     — vrij vóór de AOW-leeftijd: 'vervroegde vrijheid'.
 *
 * Zonder `aowAge` (niet altijd geplumbd) leunt het pensioen-onderscheid op de
 * expliciete 'pensioen'-strategie — het canonieke "ik stop rond AOW"-signaal dat
 * ook de fasebalk al aanstuurt.
 */
export function resolveFreedomFraming(input: FreedomStateInput): FreedomFraming {
  if (!isFinanciallyFree(input)) return 'building'
  const atOrPastAow =
    input.aowAge != null && input.currentAge != null && input.currentAge >= input.aowAge
  const fireAtOrPastAow =
    input.aowAge != null && input.fireAge != null && input.fireAge >= input.aowAge
  if (input.strategy === 'pensioen' || atOrPastAow || fireAtOrPastAow) return 'pensioen'
  return 'free'
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
