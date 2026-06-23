/**
 * Pure prefill-helper voor de onboarding-stap "uitgaven na pensioen".
 *
 * Doel: een *suggestie* (tip) berekenen voor het jaarbedrag dat de gebruiker
 * straks na pensioen denkt nodig te hebben — gebaseerd op de net-ingevoerde
 * maanduitgaven, of (als die ontbreken) op het maandinkomen.
 *
 * **Consume-only / single source of truth:** dit is GEEN tweede rekenmotor.
 * Het FIRE-doel en de pensioenuitgave worden NIET hier berekend — die blijven
 * exclusief van `computeRetirementExpenses` (lib/budget-utils.ts) en de
 * horizon-engine. Deze helper levert alleen een UI-prefill (een bewerkbaar
 * startbedrag + de bijbehorende methode) zodat de tip testbaar is en niet
 * verstopt zit in de component.
 *
 * De 80%-vuistregel spiegelt bewust de impliciete default die de server al
 * hanteert in `resolveRetirementExpenseDefaults` (80% × jaaruitgaven): zo
 * ziet/bevestigt de gebruiker exact wat er anders impliciet zou gebeuren.
 */

/** De methode die de bevestigde keuze representeert — subset van `RetirementExpenseMethod`. */
export type RetirementPrefillMethod = 'custom_amount' | 'current_income'

export interface RetirementPrefillInput {
  /** Net-ingevoerde maanduitgaven (€/maand). 0/undefined = onbekend/uitgesteld. */
  monthlyExpenses?: number
  /** Netto maandinkomen (€/maand) — fallback-bron. 0/undefined = onbekend. */
  monthlyIncome?: number
}

export interface RetirementPrefill {
  /**
   * Voorgesteld jaarbedrag (€/jaar, prijspeil vandaag), afgerond op hele euro's.
   * `null` wanneer noch uitgaven noch inkomen bekend is — dan tonen we geen
   * hard bedrag (geen 0/garbage).
   */
  amount: number | null
  /** De bron waarop de prefill is gebaseerd — stuurt de tip-copy aan. */
  basis: 'expenses' | 'income' | 'none'
  /**
   * De methode die hoort bij accepteren van de prefill. Bij een bedrag is dat
   * altijd `custom_amount`; zonder bedrag default `current_income` (de
   * "zelfde als nu"-uitweg).
   */
  method: RetirementPrefillMethod
}

/**
 * Fractie van de huidige jaaruitgaven die mensen na pensioen gemiddeld nog
 * uitgeven (woon-werk + pensioenopbouw vallen weg). Spiegelt de server-default
 * in `resolveRetirementExpenseDefaults`.
 */
export const RETIREMENT_EXPENSE_FRACTION = 0.8

/**
 * Fractie van het netto JAARinkomen als ruwe schatting wanneer de uitgaven
 * onbekend zijn maar het inkomen wel. Bewust lager dan de uitgaven-fractie:
 * inkomen ligt doorgaans boven het uitgavenpatroon (er wordt gespaard), dus
 * 70% van het inkomen benadert het post-pensioen uitgavenniveau redelijker.
 */
export const RETIREMENT_INCOME_FRACTION = 0.7

function isPositive(n: number | undefined): n is number {
  return typeof n === 'number' && isFinite(n) && n > 0
}

/**
 * Bereken de prefill-suggestie.
 *
 * Volgorde:
 *  1. Maanduitgaven bekend → 80% × (maanduitgaven × 12), methode `custom_amount`.
 *  2. Anders inkomen bekend → 70% × (maandinkomen × 12), methode `custom_amount`.
 *  3. Beide onbekend → geen bedrag (`amount: null`), methode `current_income`.
 */
export function computeRetirementPrefill(
  input: RetirementPrefillInput,
): RetirementPrefill {
  if (isPositive(input.monthlyExpenses)) {
    return {
      amount: Math.round(input.monthlyExpenses * 12 * RETIREMENT_EXPENSE_FRACTION),
      basis: 'expenses',
      method: 'custom_amount',
    }
  }
  if (isPositive(input.monthlyIncome)) {
    return {
      amount: Math.round(input.monthlyIncome * 12 * RETIREMENT_INCOME_FRACTION),
      basis: 'income',
      method: 'custom_amount',
    }
  }
  return { amount: null, basis: 'none', method: 'current_income' }
}
