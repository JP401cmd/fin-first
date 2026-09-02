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

import { guardFreedomAge } from '@/lib/horizon/outcome-guard'

/**
 * De vijf eindstrategieën. 'nu-stoppen' (ADR 0127): werken stopt vandaag — de kernel
 * kortsluit FIRE op de startleeftijd (maand 0) en toetst of het vermogen tot de eigen
 * eindleeftijd reikt (doel €0). Geen doelvermogen (D4), vrijheids-% = tijdsdekking (D5).
 */
export type FireEndStrategy = 'perpetual' | 'legacy' | 'deplete' | 'pensioen' | 'nu-stoppen'

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
  // ADR 0127 — RELEASE-SCHAKELAAR: de UI-pickers itereren over deze map, dus deze
  // entry maakt 'nu-stoppen' overal kiesbaar. Beschrijvend, nooit "je kunt stoppen"
  // (definitieve tekst gaat nog langs merkstem/compliance).
  'nu-stoppen': {
    name: 'Nu stoppen',
    subtitle: 'Werken stopt vandaag — zie tot welke leeftijd je vermogen reikt',
  },
}

/**
 * De canonieke allowlist — AFGELEID uit `STRATEGY_LABELS`, nooit een handmatige lijst
 * (ADR 0127 D9). Elke tweede lijst (parser, draft-persistentie, regressiesuites,
 * API-allowlist) leest hier, zodat een vijfde strategie niet stil naar 'deplete' vouwt.
 */
export const FIRE_END_STRATEGIES: readonly FireEndStrategy[] = Object.keys(
  STRATEGY_LABELS,
) as FireEndStrategy[]

/** Type-guard op de canonieke allowlist. */
export function isFireEndStrategy(value: unknown): value is FireEndStrategy {
  return typeof value === 'string' && (FIRE_END_STRATEGIES as readonly string[]).includes(value)
}

/**
 * Parse profile data to FireStrategyConfig with safe defaults.
 *
 * DE GEVAARLIJKSTE CONSUMENT (ADR 0127 D9): een onbekende waarde vouwt hier stil
 * naar 'deplete' — de DB zegt dan X en de hele app rekent een deplete-plan. Daarom
 * leest de allowlist uit `STRATEGY_LABELS` en niet uit een eigen `includes`-lijst.
 */
export function parseFireStrategy(profile: {
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
}): FireStrategyConfig {
  return {
    strategy: isFireEndStrategy(profile.fire_end_strategy) ? profile.fire_end_strategy : 'deplete',
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
  // ADR 0127 D5 — onder 'nu-stoppen' is `fireAge` per constructie de startleeftijd,
  // dus `currentAge >= fireAge` is triviaal waar en zegt niets over het geld. Alleen de
  // tijdsdekking (freedomPct = uitputtingsmaand ÷ eindmaand) mag hier "vrij" verklaren.
  if (input.strategy === 'nu-stoppen') return false
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

export type FreedomFraming = 'building' | 'free' | 'pensioen' | 'nu-stoppen'

/**
 * Hero-/banner-woordkeuze in één afgeleide waarde:
 *  - 'building'   — nog op weg ("X% op weg naar vrijheid"); de bestaande framing.
 *  - 'pensioen'   — vrij rond de AOW-leeftijd: 'regulier pensioen' (strategy
 *    'pensioen', óf leeftijd/vrijheidsleeftijd op of voorbij AOW).
 *  - 'free'       — vrij vóór de AOW-leeftijd: 'vervroegde vrijheid'.
 *  - 'nu-stoppen' — eindstrategie 'Nu stoppen' én het geld reikt tot de eindleeftijd
 *    (tijdsdekking 100%, ADR 0127 D5/D6): geen belofte over een moment maar een
 *    uitspraak over bereik ("als je nu stopt, reikt je vermogen tot je eindleeftijd").
 *
 * Zonder `aowAge` (niet altijd geplumbd) leunt het pensioen-onderscheid op de
 * expliciete 'pensioen'-strategie — het canonieke "ik stop rond AOW"-signaal dat
 * ook de fasebalk al aanstuurt.
 */
export function resolveFreedomFraming(input: FreedomStateInput): FreedomFraming {
  if (!isFinanciallyFree(input)) return 'building'
  if (input.strategy === 'nu-stoppen') return 'nu-stoppen'
  const atOrPastAow =
    input.aowAge != null && input.currentAge != null && input.currentAge >= input.aowAge
  const fireAtOrPastAow =
    input.aowAge != null && input.fireAge != null && input.fireAge >= input.aowAge
  if (input.strategy === 'pensioen' || atOrPastAow || fireAtOrPastAow) return 'pensioen'
  return 'free'
}

// ── Seam: DREMPEL vs. WEERGAVE van de vrijheidsleeftijd ────────────────────
//
// De vrijheidsleeftijd heeft twee rollen die makkelijk verwisseld raken:
//  - DREMPEL  — `currentAge >= fireAge` in `isFinanciallyFree`. Moet de
//               FRACTIONELE waarde zijn (`fireAgeFractional` uit de bundel).
//  - WEERGAVE — het getal dat als vrijheidsleeftijd op het scherm staat
//               (strip-label, grafiekmarker). Dat hoort afgerond.
//
// Ze zíjn verwisseld geweest (WF-CANON-03): een afgeronde 45,3 werd 45, en bij
// een currentAge van 45 sloeg "financieel vrij" daardoor tot zes maanden te
// vroeg om. De fix daarvan leefde in de AANROEPER en was daarmee onbewaakt —
// `fireAge: fireAge` is een compilerende, plausibel ogende shorthand die geen
// enkele test rood maakt.
//
// Daarom leiden aanroepers beide waarden af uit deze ene helper, die alléén de
// fractionele leeftijd als invoer accepteert. Rond in aanroepers niet zelf af.

/**
 * Vrijheidsleeftijd voor WEERGAVE: afgerond op hele jaren. Nooit als drempel
 * gebruiken — daarvoor is de fractionele waarde nodig (zie `FreedomStateInput`).
 */
export function fireAgeForDisplay(fireAgeFractional: number | null | undefined): number | null {
  if (fireAgeFractional == null || !Number.isFinite(fireAgeFractional)) return null
  // M6-vangrail: een leeftijd op/voorbij het horizonplafond is de parkeerstand van
  // de kernel-bisectie, geen antwoord — nooit als "vrijheidsleeftijd" tonen. Eén
  // guard (`lib/horizon/outcome-guard.ts`), zodat de /overzicht-strip én de
  // mini-vermogensgrafiek dezelfde grens hanteren als de /toekomst-hero.
  if (!guardFreedomAge(fireAgeFractional).ok) return null
  return Math.round(fireAgeFractional)
}

/** Invoer voor `resolveFreedomAgeView` — bewust ALLEEN de fractionele leeftijd. */
export interface FreedomAgeViewInput extends Omit<FreedomStateInput, 'fireAge'> {
  /** Fractionele vrijheids-/FIRE-leeftijd uit de bundel (`fireAgeFractional`). */
  fireAgeFractional: number | null
}

export interface FreedomAgeView {
  /** Afgerond — uitsluitend voor weergave. `null` óók bij een M6-vangrail-treffer. */
  fireAgeDisplay: number | null
  /** Framing, bepaald op de fractionele drempel. */
  framing: FreedomFraming
  /**
   * `true` ⇒ de motor gaf een leeftijd die niet kán kloppen (op/voorbij het
   * horizonplafond, bevinding M6). Het oppervlak toont dan een gegevensmelding
   * i.p.v. een aftelling — niet gewoon "geen aftelling", want dan verdwijnt het
   * probleem stilletjes uit beeld.
   */
  dataIssue: boolean
}

/**
 * Leidt de weergave-leeftijd én de framing af uit één fractionele invoer, zodat
 * een aanroeper de twee rollen niet meer kan verwisselen. Bewaakt door
 * `fire-strategy.test.ts` ("rondt af voor WEERGAVE maar toetst de DREMPEL
 * fractioneel").
 */
export function resolveFreedomAgeView({
  fireAgeFractional,
  ...rest
}: FreedomAgeViewInput): FreedomAgeView {
  // M6: een onmogelijke leeftijd mag ook de DREMPEL niet voeden — anders bepaalt
  // de parkeerstand (100) alsnog of iemand "financieel vrij" heet.
  const guard = guardFreedomAge(fireAgeFractional)
  const bruikbaar = guard.ok ? fireAgeFractional : null
  const state: FreedomStateInput = { ...rest, fireAge: bruikbaar }
  return {
    fireAgeDisplay: fireAgeForDisplay(bruikbaar),
    framing: resolveFreedomFraming(state),
    dataIssue: !guard.ok,
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

  // De kolom draagt een echte keuze (≠ de 'deplete'-parkeerwaarde van het
  // schaduwpad) → die wint; een override is dan hoogstens stale.
  if (base.strategy !== 'deplete') return base

  // Parkeerwaarde 'deplete' + een override → de override, mits die op de canonieke
  // allowlist staat (ADR 0127 D9: generiek, niet hardcoded op 'pensioen' — een
  // derde strategie loopt anders over dezelfde kabel). In de praktijk kan het
  // schaduwpad alleen nog 'pensioen' parkeren (zie app/api/fire-settings/route.ts).
  const fp = profile.feature_preferences ?? {}
  const override = fp.fire_strategy_override
  if (isFireEndStrategy(override) && override !== 'deplete') {
    return { ...base, strategy: override }
  }

  return base
}
