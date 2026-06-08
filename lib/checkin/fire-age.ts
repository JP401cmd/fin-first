/**
 * Gedeelde FIRE-leeftijd-schatter. Eén bron voor zowel /api/checkin/overview
 * als /api/checkin/gespreksstarters (voorheen inline gedupliceerd).
 *
 * SWR = 0.04 (vaste veilige onttrekking). Simpele years-to-FIRE met
 * samengestelde groei; geeft null als er geen dob is, geen vermogen, geen
 * uitgaven of niet gespaard wordt.
 */
export interface FireAgeInput {
  dateOfBirth: string | null
  netWorth: number
  monthlyIncome: number
  monthlyExpenses: number
  expectedReturn: number | null
  now: Date
}

const SWR = 0.04

export function computeFireAge(input: FireAgeInput): number | null {
  const { dateOfBirth, netWorth, monthlyIncome, monthlyExpenses, now } = input
  if (!dateOfBirth || netWorth <= 0 || monthlyExpenses <= 0) return null

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses / SWR
  const annualSavings = (monthlyIncome - monthlyExpenses) * 12
  if (annualSavings <= 0) return null

  const expectedReturn = input.expectedReturn || 0.07
  const yearsToFire =
    Math.log((fireTarget * expectedReturn + annualSavings) / (netWorth * expectedReturn + annualSavings)) /
    Math.log(1 + expectedReturn)
  if (!isFinite(yearsToFire) || yearsToFire <= 0) return null

  const birthDate = new Date(dateOfBirth)
  const currentAge = (now.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return Math.round(currentAge + yearsToFire)
}
