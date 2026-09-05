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
import { HOUSING_CHOICE_FALLBACK, housingChoiceToConfig } from '@/lib/housing-choice'
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
 * Woonstrategie die geldt wanneer de gebruiker de woning-vraag (nog) niet
 * beantwoordde: "verkopen wanneer nodig, op basis van marktwaarde".
 *
 * DIT IS NIET MEER DE ONBOARDING-KEUZE. Sinds ADR 0133 vraagt de onboarding de
 * woonstrategie zélf uit, en dat moment stond hier al aangekondigd ("gaat de
 * onboarding de strategie ooit zélf uitvragen, dan vervangt die keuze deze
 * constante"). De teller in `app/(onboarding)/onboarding/page.tsx` haalt z'n
 * mode daarom uit `housingChoiceToConfig(keuze).mode`; deze constante is
 * verschraald tot de TERUGVAL — afgeleid uit `HOUSING_CHOICE_FALLBACK`, zodat
 * er geen tweede literal naast de bron staat die stil uit elkaar kan lopen.
 *
 * Blijft bestaan omdat de UAT-controles (`lib/uat/acceptance/start-checks.ts`)
 * de tellerwaarden op deze terugval pinnen — de grondslag van een intake
 * zónder gemaakte keuze.
 */
export const ONBOARDING_HOUSING_MODE: HousingStrategyMode =
  housingChoiceToConfig(HOUSING_CHOICE_FALLBACK).mode

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

/** Wat één maand sparen aan vrijheid oplevert, plus het tarief waarop dat rust. */
export interface MonthlyFreedomBuildup {
  /** Maandelijks overschot (inkomen − uitgaven). */
  monthlySurplus: number
  /** Het canonieke intake-dagtarief (×12/365) op de maanduitgaven. */
  dailyRate: number
  /** Hele dagen vrijheid die dat overschot per maand oplevert (≥ 1). */
  daysPerMonth: number
}

/**
 * De OPBOUW-variant van de teller: niet "hoeveel vrijheid heb je al", maar
 * "hoeveel komt er per maand bij".
 *
 * Bestaat omdat de teller (`computeFreedomTicker`) een VERMOGEN deelt, en dat
 * is er aan het eind van de onboarding vaak niet — wie geen bezittingen invulde
 * kreeg dan alsnog geen enkel vrijheidsgetal te zien, precies het gat dat
 * UR3-05 dicht. Inkomen en uitgaven zijn op dat moment wél bekend (desnoods
 * geschat), en daarmee is deze uitspraak wél te doen.
 *
 * Dezelfde rem als de teller: `null` liever dan een verzonnen getal.
 *   · geen inkomen of geen uitgaven ingevuld
 *   · een tekort of precies quitte — dan bouw je geen vrijheid op
 *   · dagtarief 0 (voorkomt de "∞"-tak van `calculateFreedomTime`)
 *   · minder dan één hele dag per maand — "0 dagen" is geen aanmoediging
 *
 * GEEN EIGEN SOM: de conversie loopt via `intakeDailyExpenseRate` +
 * `calculateFreedomTime`, exact zoals de teller (CLAUDE.md, consume-don't-recompute).
 */
export function computeMonthlyFreedomBuildup(
  monthlyIncome: number,
  monthlyExpenses: number,
): MonthlyFreedomBuildup | null {
  if (!(monthlyIncome > 0) || !(monthlyExpenses > 0)) return null

  const monthlySurplus = monthlyIncome - monthlyExpenses
  if (!(monthlySurplus > 0)) return null

  const dailyRate = intakeDailyExpenseRate(monthlyExpenses)
  if (!(dailyRate > 0)) return null

  const breakdown = calculateFreedomTime(monthlySurplus, dailyRate)
  if (breakdown.isDeficit || breakdown.isInfinite) return null

  // Hele dagen: "je bouwt er 2,99 per maand bij" leest niet. `totalDays` staat
  // al op één decimaal (lib/format.ts), dus dit kan hooguit 0,05 dag naar boven
  // afwijken van de exacte deling — bewust naar beneden i.p.v. `round`, zodat de
  // uitspraak nooit méér belooft dan de conversie oplevert.
  const daysPerMonth = Math.floor(breakdown.totalDays)
  if (daysPerMonth < 1) return null

  return { monthlySurplus, dailyRate, daysPerMonth }
}
