/**
 * Gedeelde FIRE-leeftijd-schatter. Eén bron voor zowel /api/checkin/overview
 * als /api/checkin/gespreksstarters (voorheen inline gedupliceerd).
 *
 * SWR-semantiek volgt de rest van de app (lib/fire-params.ts): de routes
 * geven de gepersonaliseerde `effectiveSwr` uit resolveFireParams() door;
 * zonder die input valt de schatter terug op NL_SWR — niet op de klassieke
 * 4%-regel, die hoort alleen bij expliciete "25× regel"-referenties.
 *
 * Simpele years-to-FIRE met samengestelde groei; geeft null als er geen dob
 * is, geen vermogen, geen uitgaven of niet gespaard wordt.
 */
import { DEFAULT_RETURN, NL_SWR } from '@/lib/constants'

export interface FireAgeInput {
  dateOfBirth: string | null
  netWorth: number
  monthlyIncome: number
  monthlyExpenses: number
  /** Bruto verwacht rendement — resolveFireParams(profile).grossReturn. */
  expectedReturn: number | null
  /** Gepersonaliseerde SWR — resolveFireParams(profile).effectiveSwr. Fallback: NL_SWR. */
  swr?: number | null
  now: Date
}

export function computeFireAge(input: FireAgeInput): number | null {
  const { dateOfBirth, netWorth, monthlyIncome, monthlyExpenses, now } = input
  if (!dateOfBirth || netWorth <= 0 || monthlyExpenses <= 0) return null

  const swr = input.swr || NL_SWR
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses / swr
  const annualSavings = (monthlyIncome - monthlyExpenses) * 12
  if (annualSavings <= 0) return null

  const expectedReturn = input.expectedReturn || DEFAULT_RETURN
  const yearsToFire =
    Math.log((fireTarget * expectedReturn + annualSavings) / (netWorth * expectedReturn + annualSavings)) /
    Math.log(1 + expectedReturn)
  if (!isFinite(yearsToFire) || yearsToFire <= 0) return null

  const birthDate = new Date(dateOfBirth)
  const currentAge = (now.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return Math.round(currentAge + yearsToFire)
}
