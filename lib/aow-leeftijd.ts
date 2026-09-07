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

// ── De formatteerlaag: ÉÉN schrijfwijze, één vastgelegde uitzondering ────────
//
// UR3-24: dezelfde AOW-leeftijd werd op negen manieren geschreven — "67",
// "67 jaar en 9 maanden", "67,8", "68", "67+9m", "67j + 9m" — omdat elk oppervlak
// zijn eigen `Math.round`/`Math.floor`/`toFixed`-uitdrukking of een generieke
// leeftijd-formatter (`formatPlanAge`/`formatStopAge`, bedoeld voor STOPleeftijden)
// gebruikte. Consume, don't recompute geldt óók voor weergave: er is precies één
// lopende-tekstvorm plus één uitzondering voor de grafiek-as.
//
//   • `formatAowAge`     → "67 jaar en 9 maanden" — ALLE lopende tekst en labels.
//   • `formatAowAgeKort` → "67+9m"                — de VASTGELEGDE UITZONDERING: krappe
//     annotaties waar alleen het getal past (de as-annotatie naast de AOW-stippellijn
//     in de tijdas-grafiek, de countdown-chip in de pensioenwidget). Draagt de maanden
//     dus wél — anders dan het oude `.years`-pad, dat ze stilzwijgend weggooide.
//
// Een nieuwe weergaveplek kiest verplicht één van deze twee; `lib/aow-format-
// consistency.test.ts` bewaakt dat er geen derde vorm bij komt.

/**
 * Een AOW-leeftijd als `AowAge`-struct óf als fractioneel getal (bv. 67.75).
 * Veel oppervlakken dragen alleen de fractionele waarde (kernelinvoer,
 * grafiekmarkering, bundelveld) — die mogen niet gedwongen worden zelf
 * jaren/maanden terug te rekenen.
 */
export type AowAgeLike = AowAge | number

/**
 * Normaliseer naar jaren + maanden. De fractionele vorm komt uit
 * `aow_years + aow_months / 12`, dus terugrekenen is exact zodra je op hele
 * maanden afrondt; 11,97 maanden telt door naar het volgende hele jaar.
 */
function toYearsMonths(age: AowAgeLike): { years: number; months: number } {
  if (typeof age !== 'number') return { years: age.years, months: age.months }
  if (!Number.isFinite(age)) return { years: 0, months: 0 }
  const years = Math.floor(age)
  const months = Math.round((age - years) * 12)
  return months === 12 ? { years: years + 1, months: 0 } : { years, months }
}

/**
 * DE weergave van een AOW-leeftijd in lopende tekst: "67 jaar" of
 * "67 jaar en 3 maanden". Gebruik deze overal — schermen, tooltips,
 * validatiemeldingen én de AI-context.
 */
export function formatAowAge(age: AowAgeLike): string {
  const { years, months } = toYearsMonths(age)
  if (months === 0) return `${years} jaar`
  return `${years} jaar en ${months} maanden`
}

/**
 * VASTGELEGDE UITZONDERING — "67" of "67+9m", uitsluitend voor krappe annotaties
 * waar de lopende-tekstvorm niet past: de as-annotatie naast de AOW-stippellijn
 * (7px monospace) en de countdown-chip "tot AOW (…)" in de pensioenwidget.
 * Kies in lopende tekst ALTIJD `formatAowAge`.
 */
export function formatAowAgeKort(age: AowAgeLike): string {
  const { years, months } = toYearsMonths(age)
  return months === 0 ? `${years}` : `${years}+${months}m`
}
