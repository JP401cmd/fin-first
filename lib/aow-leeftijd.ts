import { NL_AOW_AGE } from './constants'

export interface AowLeeftijdRow {
  id: string
  birth_date_from: string
  birth_date_through: string
  aow_years: number
  aow_months: number
  is_definitive: boolean
  source: string
}

export interface AowAge {
  years: number
  months: number
  /** Fractional age (e.g. 67.25 for 67 jaar + 3 maanden) */
  fractional: number
  isDefinitive: boolean
}

/**
 * Look up AOW age from a pre-fetched table of rows.
 * Falls back to NL_AOW_AGE (67) if no match found.
 */
export function lookupAowAge(
  rows: AowLeeftijdRow[],
  dateOfBirth: string | null,
): AowAge {
  const fallback: AowAge = { years: NL_AOW_AGE, months: 0, fractional: NL_AOW_AGE, isDefinitive: false }
  if (!dateOfBirth || rows.length === 0) return fallback

  const dob = dateOfBirth.split('T')[0] // normalize to YYYY-MM-DD

  for (const row of rows) {
    if (dob >= row.birth_date_from && dob <= row.birth_date_through) {
      return {
        years: row.aow_years,
        months: row.aow_months,
        fractional: row.aow_years + row.aow_months / 12,
        isDefinitive: row.is_definitive,
      }
    }
  }

  return fallback
}

/**
 * Format AOW age for display: "67 jaar" or "67 jaar en 3 maanden"
 */
export function formatAowAge(age: AowAge): string {
  if (age.months === 0) return `${age.years} jaar`
  return `${age.years} jaar en ${age.months} maanden`
}
