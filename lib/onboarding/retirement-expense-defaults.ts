/**
 * Server-resolutie van de pensioenuitgave-keuze uit de onboarding-payload.
 *
 * (Verhuisd uit `app/api/onboarding/save-own-data/route.ts` bij UR3-07 — een
 * route-bestand mag geen test-only helper exporteren, en dit contract verdiende
 * eindelijk een eigen test. De route roept 'm op beide paden aan; gedrag is
 * ongewijzigd behalve de expliciet gedocumenteerde guard hieronder.)
 *
 * Product-beslissing: standaard = 80% van de huidige jaaruitgaven
 * (`custom_amount`). Dit verving de vroegere default (`current_income`) zodat de
 * /toekomst-grafiek direct een realistische pensioenuitgave toont.
 *
 * HET CONTRACT: **de suggestie accepteren geeft hetzelfde antwoord als de stap
 * overslaan.** `lib/onboarding/retirement-prefill.ts` toont de gebruiker exact
 * de 80%-default die deze functie anders impliciet zou toepassen — dan mag
 * "ja, dat klopt" nooit een ánder bedrag opleveren dan "bepaal later".
 */

import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import { RETIREMENT_EXPENSE_FRACTION } from '@/lib/onboarding/retirement-prefill'

export interface RetirementExpenseDefaults {
  retirement_expense_method: RetirementExpenseMethod
  retirement_expense_custom_amount: number | null
}

/**
 * Bepaal `retirement_expense_method` + `retirement_expense_custom_amount` voor
 * het onboarding-profiel.
 *
 * Uitzondering: koos de gebruiker in de onboarding-UI expliciet een methode
 * (`horizonData.retirement_expense_method` aanwezig), dan respecteren we die.
 *
 * Guard 1: zijn de maanduitgaven onbekend (stap niet ingevuld / uitgesteld),
 * dan vallen we terug op `current_income` met `null` bedrag — geen 0 of garbage.
 *
 * Guard 2 (UR3-07 defect 2): `custom_amount` ZONDER bedrag is geen keuze maar
 * een lege hand. Die combinatie nam voorheen tóch de expliciete-keuze-tak en
 * schreef `null` weg, waarna `computeRetirementExpenses` terugviel op 100% van
 * de huidige uitgaven — een structureel ~25% te hoog FIRE-doel voor iedereen
 * die de ≈80%-suggestie accepteerde zonder het veld aan te raken (de
 * onboarding-stap stuurt de methode altijd mee, ook zonder bedrag). Zo'n
 * payload valt nu door naar dezelfde 80%-default als "overslaan".
 */
export function resolveRetirementExpenseDefaults(
  explicitMethod: RetirementExpenseMethod | undefined,
  explicitCustomAmount: number | undefined,
  identityMethod: RetirementExpenseMethod | undefined,
  estimatedMonthlyExpenses: number | undefined,
): RetirementExpenseDefaults {
  // Een methode is pas een KEUZE als ze compleet is: `custom_amount` heeft een
  // positief bedrag nodig, de andere twee rekenen op hun eigen bron.
  const usableAmount =
    explicitCustomAmount != null && Number.isFinite(explicitCustomAmount) && explicitCustomAmount > 0
      ? Math.round(explicitCustomAmount)
      : null
  const isComplete = (method: RetirementExpenseMethod | undefined): boolean =>
    method != null && (method !== 'custom_amount' || usableAmount != null)

  // Gebruiker koos expliciet een methode via de onboarding-UI → respecteer die keuze.
  if (explicitMethod != null && isComplete(explicitMethod)) {
    return {
      retirement_expense_method: explicitMethod,
      retirement_expense_custom_amount: usableAmount,
    }
  }
  // Legacy: identity bevat al een keuze (oudere clients).
  if (identityMethod != null && isComplete(identityMethod)) {
    return {
      retirement_expense_method: identityMethod,
      retirement_expense_custom_amount: usableAmount,
    }
  }
  // Default: 80% van de huidige jaaruitgaven — maar alleen als expenses bekend zijn.
  if (estimatedMonthlyExpenses != null && estimatedMonthlyExpenses > 0) {
    return {
      retirement_expense_method: 'custom_amount',
      // maand × 12 × fractie. De fractie komt uit `retirement-prefill.ts` —
      // dezelfde constante die de onboarding-suggestie toont, zodat scherm en
      // server niet uit elkaar kunnen lopen.
      retirement_expense_custom_amount: Math.round(
        estimatedMonthlyExpenses * 12 * RETIREMENT_EXPENSE_FRACTION,
      ),
    }
  }
  // Expenses onbekend (overgeslagen stap) → generieke fallback zonder garbage-waarde.
  return {
    retirement_expense_method: 'current_income',
    retirement_expense_custom_amount: null,
  }
}
