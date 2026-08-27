/**
 * Vrijheidstijd-teller voor INTAKE-flows (`/check`-wizard en `/onboarding`).
 *
 * Eén bron voor de "Al vrijgekocht · 1j 3m"-teller die tijdens het invullen
 * meeloopt. Vóór deze module bestond die teller alleen in `check-wizard.tsx`
 * (module-privaat) en had de ingelogde onboarding er géén — twintig schermen
 * lang geen enkel vrijheidsgetal, terwijl de publieke trechter ervóór het wél
 * toonde (bevinding H12, UX-testpanel 24-08-2026).
 *
 * ── Waarom een aparte module en niet gewoon `lib/format.ts` ────────────────
 * `calculateFreedomTime` + `dailyExpenseRate` zijn de CONVERSIE. Deze module
 * voegt het enige toe dat een teller nodig heeft en dat per oppervlak fout kan
 * gaan: de GRONDSLAG (welk vermogen deel je door het dagtarief?) en de GUARDS
 * (wanneer toon je liever niets dan een verzonnen getal). Die twee stonden
 * verspreid — de check-wizard had z'n eigen filter, `build-report.ts` z'n eigen
 * tekort-guard (module-privaat), en de onboarding had geen van beide.
 *
 * ── Grondslag volgt de woonstrategie (eigenaar-besluit 26-08-2026) ─────────
 * De grondslag is bewust GEEN vaste keuze:
 *   · `include_full` ("woning meetellen")            → netto vermogen
 *   · `exclude_from_fire` / `downsize` / `reverse_mortgage`
 *     ("uitsluiten" / "verkopen" / "opeethypotheek")  → FIRE-pot excl. woning
 *
 * Dit is bewust NIET `shouldFilterEigenHuisForFire` of `isHomeExcludedFromFire`
 * uit `lib/housing-strategy.ts`: die twee predicaten beantwoorden een andere
 * vraag (wat gaat er uit de PROJECTIE-invoer, resp. welke voortgangs-noemer) en
 * delen `reverse_mortgage` anders in dan het eigenaar-besluit voor deze teller.
 * De mapping hieronder is de letterlijke vertaling van dat besluit; verandert
 * het besluit, dan verandert deze ene functie.
 *
 * ── Monotonie ─────────────────────────────────────────────────────────────
 * Op de `fire_pot_excl_home`-grondslag KAN de teller niet dalen tijdens een
 * intake: bezittingen tellen op, de eigen woning telt niet mee, en schulden
 * gaan er niet af. Dat is precies waarom `/check` het zo doet — onder de
 * netto-vermogen-grondslag laat een huiseigenaar het getal met ~16 jaar
 * omhoog springen op het woning-scherm en ~14 jaar instorten op het
 * hypotheek-scherm, drie schermen later. Vergrendeld in
 * `lib/freedom-ticker.test.ts` (monotonie-invariant over elke invoervolgorde).
 *
 * ── Wat deze module NIET doet ─────────────────────────────────────────────
 * Geen vrijheids-PERCENTAGE: `computeFreedomProgress` vraagt een FIRE-doel
 * (`requiredPortfolio`), dat pas bestaat na het opslaan van het profiel + een
 * kernel-run. Tijdens een intake kan alleen de ABSOLUTE vrijheidstijd — en dat
 * is ook wat `/check` toont.
 */

import { calculateFreedomTime, dailyExpenseRate, formatFreedomTimeString } from '@/lib/format'
import type { FreedomTimeBreakdown } from '@/lib/format'
import type { HousingStrategyMode } from '@/lib/housing-strategy'

/** Welk vermogen de teller door het dagtarief deelt. */
export type FreedomTickerBasis =
  /** Alles behalve de eigen woning; schulden gaan er NIET af (monotoon). */
  | 'fire_pot_excl_home'
  /** Bezittingen minus schulden, eigen woning telt volledig mee. */
  | 'net_worth'

/**
 * Grondslag die bij een woonstrategie hoort (eigenaar-besluit 26-08-2026).
 * Alleen "woning meetellen" levert de netto-vermogen-grondslag; de drie
 * strategieën die de woning uiteindelijk uit de FIRE-pot halen of te gelde
 * maken, laten hem tijdens de intake buiten de teller.
 */
export function freedomTickerBasis(mode: HousingStrategyMode): FreedomTickerBasis {
  return mode === 'include_full' ? 'net_worth' : 'fire_pot_excl_home'
}

/**
 * Woonstrategie die de onboarding voor een NIEUWE gebruiker wegschrijft:
 * "verkopen wanneer nodig, op basis van marktwaarde".
 *
 * Bewust hier gespiegeld en niet uit de API-route geïmporteerd (die is
 * server-only): de teller draait in de browser en moet dezelfde lezing hebben
 * als wat de flow straks opslaat. De onboarding vraagt de woonstrategie
 * (nog) niet uit, dus dit IS de gekozen strategie op dat moment.
 * Bron: `app/api/onboarding/save-own-data/route.ts`
 * (`housing_strategy_config: { mode: 'downsize', … }`), vergrendeld door de
 * bron-assertie in `route.test.ts`. Gaat de onboarding de strategie ooit zélf
 * uitvragen, dan vervangt die keuze deze constante.
 */
export const ONBOARDING_HOUSING_MODE: HousingStrategyMode = 'downsize'

/**
 * Het dagtarief van een INTAKE-flow: de canonieke conversie (×12/365) op de
 * maanduitgaven die de gebruiker zojuist zélf typte.
 *
 * Bewust één gedeelde ingang in plaats van `dailyExpenseRate` in elk
 * intake-scherm: die tweede grondslag (naast het 12-maands rolling tarief uit
 * `lib/expense-rate.ts`) is legitiem — er is nog geen transactiehistorie — maar
 * hoort op één plek te staan die de gate kent, zodat "intake rekent op eigen
 * invoer" één gedocumenteerde uitzondering blijft en niet per scherm opnieuw
 * wordt uitgevonden. De CONVERSIE zelf is nooit een keuze; alleen het
 * maandbedrag dat je erin stopt.
 */
export function intakeDailyExpenseRate(monthlyExpenses: number): number {
  return dailyExpenseRate(monthlyExpenses)
}

/** Eén bezitting, gereduceerd tot wat de teller ervan hoeft te weten. */
export interface FreedomTickerAsset {
  /** Waarde in EUR. Niet-eindige/negatieve waarden tellen als 0. */
  value: number
  /** True voor een eigen woning (`asset_type === 'eigen_huis'`). */
  isHome: boolean
}

export interface FreedomTickerInput {
  /** Netto maandinkomen. ≤ 0 ⇒ geen teller (de intake is nog te leeg). */
  monthlyIncome: number
  /** Geschatte maanduitgaven — de noemer. ≤ 0 ⇒ geen teller. */
  monthlyExpenses: number
  /** Bezittingen tot nu toe. */
  assets: FreedomTickerAsset[]
  /** Totale schuldstand. Alleen gebruikt op de `net_worth`-grondslag. */
  debts?: number
  /** Grondslag — via `freedomTickerBasis(mode)`. */
  basis: FreedomTickerBasis
}

export interface FreedomTickerResult {
  /** Het bedrag dat gedeeld werd (op de gekozen grondslag). */
  amount: number
  /** Het canonieke dagtarief (×12/365) waarop gedeeld is. */
  dailyRate: number
  /** De volledige decompositie — voor tests en alternatieve formattering. */
  breakdown: FreedomTimeBreakdown
  /** Korte weergave, bv. "1j 3m 16d". */
  label: string
  /** Welke grondslag gebruikt is (voor de label-toelichting op het scherm). */
  basis: FreedomTickerBasis
}

/**
 * Bereken de intake-teller, of `null` wanneer er (nog) niets eerlijks te tonen
 * valt. De guards zijn de bewuste rem: liever niets dan een verzonnen getal.
 *
 * `null` bij:
 *   · geen inkomen of geen uitgaven ingevuld ("Later invullen"-pad)
 *   · dagtarief 0 (voorkomt de "∞"-tak van `calculateFreedomTime`)
 *   · niets (of niets liquides) op de gekozen grondslag
 *   · een tekort — een negatief vermogen koopt geen vrijheid
 *     (dezelfde lezing als `buildNetWorthFreedom` in het check-rapport)
 */
export function computeFreedomTicker(input: FreedomTickerInput): FreedomTickerResult | null {
  const { monthlyIncome, monthlyExpenses, assets, basis } = input

  if (!(monthlyIncome > 0) || !(monthlyExpenses > 0)) return null

  const assetTotal = assets.reduce((sum, asset) => {
    if (basis === 'fire_pot_excl_home' && asset.isHome) return sum
    const value = Number(asset.value)
    return Number.isFinite(value) && value > 0 ? sum + value : sum
  }, 0)

  const debts = Number(input.debts ?? 0)
  const amount =
    basis === 'net_worth' && Number.isFinite(debts) ? assetTotal - debts : assetTotal

  if (!(amount > 0)) return null

  const dailyRate = intakeDailyExpenseRate(monthlyExpenses)
  if (!(dailyRate > 0)) return null

  const breakdown = calculateFreedomTime(amount, dailyRate)
  if (breakdown.isDeficit || breakdown.isInfinite) return null

  return {
    amount,
    dailyRate,
    breakdown,
    label: formatFreedomTimeString(breakdown, 'short'),
    basis,
  }
}
