/**
 * De beginnersvraag over de eigen woning — één bron voor kopij én mapping.
 *
 * De gebruiker kiest bij het TOEVOEGEN van zijn woning wat die woning voor zijn
 * vrijheid betekent. Twee keuzes, in gewone taal:
 *
 *   'sell'    — "Ik verkoop hem ooit."  → `downsize` / `on_depletion` / marktwaarde.
 *               De kernel houdt de woning niet-liquide tot de daadwerkelijke
 *               verkoopmaand; de overwaarde telt dus nooit als besteedbare
 *               vrijheid zolang de gebruiker erin woont.
 *   'exclude' — "Hij telt niet mee."    → `exclude_from_fire`.
 *               `isHomeExcludedFromFire` wordt true, waarmee vrijheidsvoortgang,
 *               doelbedrag en de /toekomst-hoofdlijn op de LIQUIDE grondslag (J)
 *               staan (ADR 0034 + ADR 0114).
 *
 * Dit is bewust een TWEEWEGS-FRONT op het bestaande veld
 * `profiles.housing_strategy_config` (JSONB) — géén nieuw datamodel, géén
 * rekenwijziging. De vier expert-modi blijven bestaan en blijven bereikbaar via
 * de strategie-modal in Voorkeuren; `include_full` ("je huis opeten") en
 * `reverse_mortgage` ("opeethypotheek") worden een beginner niet voorgelegd.
 *
 * Patroon: identiek aan `lib/horizon/plan-draft.ts` (ADR 0129) — alle kopij in
 * één lib-module, gedeeld door de onboarding, de quick-add-wizard en Voorkeuren,
 * zodat de gebruiker later exact dezelfde woorden terugziet.
 *
 * Toon (Wft): beschrijvend, nooit aansporend. "Ik verkoop hem ooit" is de
 * constatering van de gebruiker over zijn eigen plan, geen aanbeveling om te
 * verkopen. Geen enkele optie is als "beter" gemarkeerd.
 *
 * "Geld is opgeslagen tijd": deze keuze bepaalt of de stenen waarin je woont
 * meetellen als vrijheid die je kunt uitgeven, of pas op het moment dat je ze
 * verzilvert.
 *
 * @see docs/adr/0133-de-gebruiker-kiest-bij-het-toevoegen-van-zijn-woning.md
 */

import {
  DOWNSIZE_DEFAULT_SALES_COSTS_PCT,
} from '@/lib/constants'
import type { DownsizeConfig, HousingStrategyConfig } from '@/lib/housing-strategy'

/** De twee keuzes die een beginner krijgt voorgelegd. */
export type HousingChoice = 'sell' | 'exclude'

/** De vraag zelf — één formulering, overal. */
export const HOUSING_CHOICE_QUESTION = 'Telt je woning mee voor je vrijheid?'

/**
 * Toelichting onder de vraag. Benoemt de grondslag (criterium 4) zonder de
 * gebruiker een kant op te duwen.
 */
export const HOUSING_CHOICE_INTRO =
  'Je woont in je huis, dus je kunt de waarde niet uitgeven zolang je er blijft. Wat wil je dat de app doet?'

export interface HousingChoiceOption {
  choice: HousingChoice
  /** Korte naam op de tegel. */
  name: string
  /** Uitleg in beginnerstaal, op de tegel onder de naam. */
  subtitle: string
}

export const HOUSING_CHOICE_OPTIONS: readonly HousingChoiceOption[] = [
  {
    choice: 'sell',
    name: 'Ja — ik verkoop hem ooit',
    subtitle:
      'Tot die tijd kun je er niet van leven. De opbrengst telt pas mee op het moment dat je verkoopt.',
  },
  {
    choice: 'exclude',
    name: 'Nee — hij telt niet mee',
    subtitle: 'Je blijft er wonen. De app rekent je vrijheid uit zonder je huis.',
  },
] as const

/**
 * De grondslag-zin die bij een keuze hoort — voor het eindscherm van de
 * onboarding en overal waar een bedrag of doelbedrag getoond wordt dat de
 * woning bevat of uitsluit (acceptatiecriterium 4).
 */
export const HOUSING_CHOICE_BASIS_SENTENCE: Record<HousingChoice, string> = {
  sell: 'Je woning telt pas mee als je hem verkoopt; je schulden tellen hier nog niet mee.',
  exclude: 'Je woning telt niet mee; je schulden ook nog niet.',
}

/** Korte grondslag-markering achter een bedrag, bv. "€ 425.000 — mét je huis". */
export const HOUSING_BASIS_LABEL = {
  inclHome: 'mét je huis',
  exclHome: 'zonder je huis',
} as const

/**
 * De woonstrategie die de onboarding voor een NIEUWE gebruiker wegschrijft bij
 * 'sell': "verkopen wanneer nodig, op basis van marktwaarde".
 *
 * Dit was tot ADR 0133 een stille default in
 * `app/api/onboarding/save-own-data/route.ts` (twee keer hard-gecodeerd) plus een
 * spiegel-constante in `lib/freedom-ticker.ts`. Nu is het één literal, die de
 * gebruiker zélf kiest.
 *
 * `trigger: 'on_depletion'` = "wanneer nodig": de kernel verkoopt pas zodra het
 * liquide vermogen onder de behoefte-buffer zakt. Bewust geen vaste leeftijd —
 * dat zou een aanname over het leven van de gebruiker zijn.
 */
export const HOUSING_CHOICE_SELL_CONFIG: DownsizeConfig = {
  mode: 'downsize',
  trigger: 'on_depletion',
  triggerAge: 67,
  depletionThresholdYears: 0,
  salePricePct: 1.0,
  salesCostsPct: DOWNSIZE_DEFAULT_SALES_COSTS_PCT,
  newMonthlyHousingCost: null,
  saleValuationBasis: 'market',
}

/**
 * Keuze → configuratie. Dit is de ENIGE plek waar de beginnersvraag een
 * `housing_strategy_config` wordt; de save-route en de quick-add-actie
 * consumeren 'm en schrijven nergens een eigen literal.
 */
export function housingChoiceToConfig(choice: HousingChoice): HousingStrategyConfig {
  return choice === 'exclude' ? { mode: 'exclude_from_fire' } : HOUSING_CHOICE_SELL_CONFIG
}

/**
 * Configuratie → keuze, voor het terugtonen van een eerder gemaakte keuze.
 *
 * `downsize` én `reverse_mortgage` lezen terug als 'sell': beide verzilveren de
 * woning uiteindelijk, dus het antwoord op "telt hij mee?" is bij beide ja.
 * `include_full` levert bewust `null` — dat is de DB-default "je huis opeten",
 * niet te onderscheiden van een keuze die nooit gemaakt is. Wie `null`
 * terugkrijgt heeft de vraag dus nog niet beantwoord.
 */
export function housingChoiceFromConfig(config: HousingStrategyConfig): HousingChoice | null {
  switch (config.mode) {
    case 'exclude_from_fire':
      return 'exclude'
    case 'downsize':
    case 'reverse_mortgage':
      return 'sell'
    case 'include_full':
      return null
  }
}

/**
 * De keuze die geldt wanneer de gebruiker er (nog) geen maakte — bv. een oude
 * onboarding-draft zonder het veld, of een flow zonder eigen woning.
 *
 * Bewust 'sell' en nooit 'exclude': 'sell' is exact het gedrag dat nieuwe
 * gebruikers vóór ADR 0133 al stilzwijgend kregen, dus dit verandert geen enkel
 * bestaand getal. 'exclude' afleiden zou de FIRE-grondslag stil verschuiven.
 */
export const HOUSING_CHOICE_FALLBACK: HousingChoice = 'sell'

/** Type-guard voor waarden uit een draft, een request-body of de DB. */
export function isHousingChoice(value: unknown): value is HousingChoice {
  return value === 'sell' || value === 'exclude'
}
