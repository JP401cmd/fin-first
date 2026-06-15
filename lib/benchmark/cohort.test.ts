import { describe, it, expect } from 'vitest'
import {
  ageToBand,
  bandMidAge,
  deriveCohort,
  AGE_BANDS,
  HOUSEHOLD_LABELS,
  type AgeBandKey,
} from '@/lib/benchmark/cohort'

// Fixed reference date — 2026-06-15 — for all deriveCohort tests.
const NOW = new Date('2026-06-15')

// ── ageToBand — boundaries ───────────────────────────────────

describe('ageToBand — leeftijdsband-grenzen', () => {
  it('leeftijd 24 → tot25', () => {
    expect(ageToBand(24).key).toBe('tot25')
  })

  it('leeftijd 0 → tot25', () => {
    expect(ageToBand(0).key).toBe('tot25')
  })

  it('leeftijd 25 → 25-35', () => {
    expect(ageToBand(25).key).toBe('25-35')
  })

  it('leeftijd 34 → 25-35', () => {
    expect(ageToBand(34).key).toBe('25-35')
  })

  it('leeftijd 35 → 35-45', () => {
    expect(ageToBand(35).key).toBe('35-45')
  })

  it('leeftijd 44 → 35-45', () => {
    expect(ageToBand(44).key).toBe('35-45')
  })

  it('leeftijd 45 → 45-55', () => {
    expect(ageToBand(45).key).toBe('45-55')
  })

  it('leeftijd 54 → 45-55', () => {
    expect(ageToBand(54).key).toBe('45-55')
  })

  it('leeftijd 55 → 55-65', () => {
    expect(ageToBand(55).key).toBe('55-65')
  })

  it('leeftijd 64 → 55-65', () => {
    expect(ageToBand(64).key).toBe('55-65')
  })

  it('leeftijd 65 → 65-75', () => {
    expect(ageToBand(65).key).toBe('65-75')
  })

  it('leeftijd 74 → 65-75', () => {
    expect(ageToBand(74).key).toBe('65-75')
  })

  it('leeftijd 75 → 75plus', () => {
    expect(ageToBand(75).key).toBe('75plus')
  })

  it('leeftijd 80 → 75plus', () => {
    expect(ageToBand(80).key).toBe('75plus')
  })

  it('leeftijd 120 → 75plus (val naar laatste band)', () => {
    expect(ageToBand(120).key).toBe('75plus')
  })
})

// ── AGE_BANDS — structuur-invarianten ──────────────────────

describe('AGE_BANDS — structuurcontrole', () => {
  it('bevat precies 7 banden', () => {
    expect(AGE_BANDS).toHaveLength(7)
  })

  it('alle bands hebben een mid binnen [min, max]', () => {
    for (const band of AGE_BANDS) {
      expect(band.mid).toBeGreaterThanOrEqual(band.min)
      expect(band.mid).toBeLessThanOrEqual(band.max)
    }
  })
})

// ── bandMidAge ────────────────────────────────────────────

describe('bandMidAge', () => {
  it.each([
    ['tot25', 22],
    ['25-35', 30],
    ['35-45', 40],
    ['45-55', 50],
    ['55-65', 60],
    ['65-75', 70],
    ['75plus', 80],
  ] as [AgeBandKey, number][])('%s → %i', (key, expected) => {
    expect(bandMidAge(key)).toBe(expected)
  })
})

// ── HOUSEHOLD_LABELS — aanwezigheid alle sleutels ──────────

describe('HOUSEHOLD_LABELS', () => {
  it('bevat labels voor alle vier huishoudtypes', () => {
    expect(HOUSEHOLD_LABELS.alleenstaand).toBeTruthy()
    expect(HOUSEHOLD_LABELS.paar).toBeTruthy()
    expect(HOUSEHOLD_LABELS.gezin_jong).toBeTruthy()
    expect(HOUSEHOLD_LABELS.gezin_tiener).toBeTruthy()
  })
})

// ── deriveCohort — ontbrekende invoer ────────────────────

describe('deriveCohort — ontbrekende velden', () => {
  it('geen date_of_birth → complete:false, missing bevat "geboortedatum"', () => {
    const result = deriveCohort({ household_type: 'solo' }, NOW)
    expect(result.complete).toBe(false)
    expect(result.missing).toContain('geboortedatum')
    expect(result.ageBand).toBeNull()
    expect(result.age).toBeNull()
  })

  it('geen household_type → complete:false, missing bevat "huishoudtype"', () => {
    const result = deriveCohort({ date_of_birth: '1986-06-15' }, NOW)
    expect(result.complete).toBe(false)
    expect(result.missing).toContain('huishoudtype')
    expect(result.household).toBeNull()
    expect(result.householdLabel).toBeNull()
  })

  it('beide aanwezig → complete:true, geen missing', () => {
    const result = deriveCohort(
      { date_of_birth: '1986-06-15', household_type: 'solo' },
      NOW,
    )
    expect(result.complete).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('lege string date_of_birth → complete:false (ageAtDate geeft NaN of negatief)', () => {
    const result = deriveCohort({ date_of_birth: '', household_type: 'solo' }, NOW)
    expect(result.complete).toBe(false)
    expect(result.missing).toContain('geboortedatum')
  })

  it('null voor beide → complete:false, twee missing-items', () => {
    const result = deriveCohort({ date_of_birth: null, household_type: null }, NOW)
    expect(result.complete).toBe(false)
    expect(result.missing).toContain('geboortedatum')
    expect(result.missing).toContain('huishoudtype')
  })
})

// ── deriveCohort — correcte leeftijden en banden ──────────

describe('deriveCohort — leeftijdsbepaling via geboortedatum', () => {
  // NOW = 2026-06-15 → exact 40 jaar
  it('40 jaar → band 35-45', () => {
    const result = deriveCohort(
      { date_of_birth: '1986-06-15', household_type: 'solo' },
      NOW,
    )
    expect(result.age).toBe(40)
    expect(result.ageBand).toBe('35-45')
  })

  // 24 jaar (verjaardag nog niet geweest dit jaar of precies gelijk)
  it('24 jaar → band tot25', () => {
    const result = deriveCohort(
      { date_of_birth: '2002-06-15', household_type: 'solo' },
      NOW,
    )
    expect(result.ageBand).toBe('tot25')
  })

  // 25 jaar
  it('25 jaar → band 25-35', () => {
    const result = deriveCohort(
      { date_of_birth: '2001-06-15', household_type: 'solo' },
      NOW,
    )
    expect(result.ageBand).toBe('25-35')
    expect(result.ageBandLabel).toBeTruthy()
  })

  // 65 jaar
  it('65 jaar → band 65-75', () => {
    const result = deriveCohort(
      { date_of_birth: '1961-06-15', household_type: 'solo' },
      NOW,
    )
    expect(result.ageBand).toBe('65-75')
  })
})

// ── deriveCohort — huishoudtype-mapping ──────────────────

describe('deriveCohort — huishoudtype-mapping', () => {
  const dob = '1986-06-15' // 40 jaar op NOW

  it('solo → alleenstaand', () => {
    const r = deriveCohort({ date_of_birth: dob, household_type: 'solo' }, NOW)
    expect(r.household).toBe('alleenstaand')
    expect(r.householdLabel).toBe('Alleenstaand')
  })

  it('samen zonder kinderen → paar', () => {
    const r = deriveCohort(
      { date_of_birth: dob, household_type: 'samen', number_of_children: 0 },
      NOW,
    )
    expect(r.household).toBe('paar')
  })

  it('gezin met jonge kinderen → gezin_jong', () => {
    const r = deriveCohort(
      {
        date_of_birth: dob,
        household_type: 'samen',
        number_of_children: 2,
        children_ages: [4, 7],
      },
      NOW,
    )
    expect(r.household).toBe('gezin_jong')
  })

  it('gezin met tieners → gezin_tiener', () => {
    const r = deriveCohort(
      {
        date_of_birth: dob,
        household_type: 'samen',
        number_of_children: 2,
        children_ages: [13, 16],
      },
      NOW,
    )
    expect(r.household).toBe('gezin_tiener')
  })

  it('householdLabel overeenkomt met HOUSEHOLD_LABELS', () => {
    const r = deriveCohort({ date_of_birth: dob, household_type: 'solo' }, NOW)
    expect(r.householdLabel).toBe(HOUSEHOLD_LABELS['alleenstaand'])
  })
})
