/**
 * Cohort-afbakening voor de benchmark: profiel → (leeftijdsband × huishoudtype).
 *
 * Hergebruikt de bestaande huishoudtype-mapping van de Nibud-vergelijking
 * (`getNibudHouseholdType`) en de canonieke leeftijdsberekening (`ageAtDate`),
 * zodat de doelgroep consistent is met de rest van de app.
 */

import { getNibudHouseholdType } from '@/lib/nibud/reference-data'
import { ageAtDate } from '@/lib/horizon-data'
import type { NibudHouseholdType } from '@/lib/nibud/types'

export type AgeBandKey = 'tot25' | '25-35' | '35-45' | '45-55' | '55-65' | '65-75' | '75plus'
export type HouseholdKey = NibudHouseholdType // 'alleenstaand' | 'paar' | 'gezin_jong' | 'gezin_tiener'

export interface BenchmarkCohort {
  age: number | null
  ageBand: AgeBandKey | null
  ageBandLabel: string | null
  household: HouseholdKey | null
  householdLabel: string | null
  /** Zowel leeftijd als huishoudtype bekend. */
  complete: boolean
  /** Ontbrekende profielvelden (leesbaar), voor een nette CTA. */
  missing: string[]
}

interface AgeBandDef {
  key: AgeBandKey
  label: string
  min: number
  max: number
  /** Midden van de band — gebruikt voor de gemodelleerde referentie-peer. */
  mid: number
}

export const AGE_BANDS: AgeBandDef[] = [
  { key: 'tot25', label: 'tot 25 jaar', min: 0, max: 24, mid: 22 },
  { key: '25-35', label: '25–35 jaar', min: 25, max: 34, mid: 30 },
  { key: '35-45', label: '35–45 jaar', min: 35, max: 44, mid: 40 },
  { key: '45-55', label: '45–55 jaar', min: 45, max: 54, mid: 50 },
  { key: '55-65', label: '55–65 jaar', min: 55, max: 64, mid: 60 },
  { key: '65-75', label: '65–75 jaar', min: 65, max: 74, mid: 70 },
  { key: '75plus', label: '75 jaar en ouder', min: 75, max: 200, mid: 80 },
]

export const HOUSEHOLD_LABELS: Record<HouseholdKey, string> = {
  alleenstaand: 'Alleenstaand',
  paar: 'Paar zonder thuiswonende kinderen',
  gezin_jong: 'Gezin met jonge kinderen',
  gezin_tiener: 'Gezin met oudere kinderen',
}

/** Map een leeftijd naar zijn cohort-band. */
export function ageToBand(age: number): AgeBandDef {
  return AGE_BANDS.find(b => age >= b.min && age <= b.max) ?? AGE_BANDS[AGE_BANDS.length - 1]
}

/** Midden-leeftijd van een band (voor de gemodelleerde peer). */
export function bandMidAge(key: AgeBandKey): number {
  return (AGE_BANDS.find(b => b.key === key) ?? AGE_BANDS[2]).mid
}

export interface CohortProfileInput {
  date_of_birth?: string | null
  household_type?: string | null
  number_of_children?: number | null
  children_ages?: number[] | null
}

/**
 * Leid de doelgroep af uit het profiel. `now` is injecteerbaar voor
 * deterministische tests; in productie `new Date()`.
 */
export function deriveCohort(profile: CohortProfileInput, now: Date = new Date()): BenchmarkCohort {
  const missing: string[] = []

  let age: number | null = null
  let band: AgeBandDef | null = null
  if (profile.date_of_birth) {
    const a = ageAtDate(profile.date_of_birth, now)
    if (Number.isFinite(a) && a >= 0 && a < 130) {
      age = a
      band = ageToBand(a)
    }
  }
  if (band == null) missing.push('geboortedatum')

  // Huishoudtype: alleen bepalen als het in het profiel staat (geen stille default).
  let household: HouseholdKey | null = null
  if (profile.household_type) {
    household = getNibudHouseholdType({
      household_type: profile.household_type,
      number_of_children: profile.number_of_children,
      children_ages: profile.children_ages,
    })
  } else {
    missing.push('huishoudtype')
  }

  return {
    age,
    ageBand: band?.key ?? null,
    ageBandLabel: band?.label ?? null,
    household,
    householdLabel: household ? HOUSEHOLD_LABELS[household] : null,
    complete: band != null && household != null,
    missing,
  }
}
