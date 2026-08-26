import { describe, it, expect } from 'vitest'
import { buildTaxOverview } from './tax-overview'

describe('buildTaxOverview — total & null-handling', () => {
  it('telt alleen niet-null box-taxes op', () => {
    const r = buildTaxOverview({ box1Tax: 10_000, box2Tax: null, box3Tax: 2_000 })
    expect(r.total).toBe(12_000)
    expect(r.box1Tax).toBe(10_000)
    expect(r.box2Tax).toBe(0)
    expect(r.box3Tax).toBe(2_000)
  })

  it('lege input → total 0, lege distributie', () => {
    const r = buildTaxOverview({ box1Tax: null, box2Tax: null, box3Tax: null })
    expect(r.total).toBe(0)
    expect(r.distribution).toEqual({ box1: 0, box2: 0, box3: 0 })
    expect(r.effectiveRate).toBeNull()
    expect(r.marginalRate).toBeNull()
    expect(r.freedomDays).toBe(0)
  })
})

describe('buildTaxOverview — distribution', () => {
  it('berekent aandeel per box als % van total (som ~100)', () => {
    const r = buildTaxOverview({ box1Tax: 5_000, box2Tax: 3_000, box3Tax: 2_000 })
    expect(r.distribution.box1).toBeCloseTo(50, 6)
    expect(r.distribution.box2).toBeCloseTo(30, 6)
    expect(r.distribution.box3).toBeCloseTo(20, 6)
    const sum = r.distribution.box1 + r.distribution.box2 + r.distribution.box3
    expect(sum).toBeCloseTo(100, 6)
  })

  it('distributie = 0 bij total 0', () => {
    const r = buildTaxOverview({ box1Tax: 0, box2Tax: 0, box3Tax: 0 })
    expect(r.distribution).toEqual({ box1: 0, box2: 0, box3: 0 })
  })
})

// Sinds bevinding C9 (26-08-2026) leidt de aggregator GEEN tarief meer af: hij
// geeft de twee percentages van `computeBox1Tax` door. De oude assertie
// (`effectiveRate = total / grossYearlyIncome`) legde precies de bug vast die
// C9 opheft — de Box 3-vermogensheffing in de teller van een inkomens-quotiënt —
// en is daarom vervangen, niet verplaatst. De grondslag-bewijzen staan in
// lib/tax-overview.hub-tarieven.test.ts.
describe('buildTaxOverview — effectiveRate & marginalRate (pass-through)', () => {
  it('geeft beide tarieven ongewijzigd door', () => {
    const r = buildTaxOverview({
      box1Tax: 20_000,
      box2Tax: null,
      box3Tax: 2_000,
      effectiveRate: 0.25,
      marginalRate: 0.4956,
    })
    expect(r.effectiveRate).toBeCloseTo(0.25, 10)
    expect(r.marginalRate).toBeCloseTo(0.4956, 10)
  })

  it('leidt GEEN tarief af uit total: box3 verandert het effectieve tarief niet', () => {
    const zonderBox3 = buildTaxOverview({
      box1Tax: 20_000,
      box2Tax: null,
      box3Tax: null,
      effectiveRate: 0.25,
    })
    const metBox3 = buildTaxOverview({
      box1Tax: 20_000,
      box2Tax: null,
      box3Tax: 9_999,
      effectiveRate: 0.25,
    })
    expect(metBox3.effectiveRate).toBe(zonderBox3.effectiveRate)
    // ... terwijl het TOTAAL wél meebeweegt: één rekening, twee grondslagen.
    expect(metBox3.total).toBe(29_999)
  })

  it('beide tarieven null zonder invoer — geen vuistregel-terugval (M4)', () => {
    const r = buildTaxOverview({ box1Tax: null, box2Tax: null, box3Tax: 600 })
    expect(r.effectiveRate).toBeNull()
    expect(r.marginalRate).toBeNull()
    expect(r.total).toBe(600)
  })
})

describe('buildTaxOverview — freedomDays', () => {
  it('freedomDays = round(total / dailyExpenses)', () => {
    const r = buildTaxOverview({
      box1Tax: 3_650,
      box2Tax: null,
      box3Tax: null,
      dailyExpenses: 100,
    })
    expect(r.freedomDays).toBe(37) // round(3650/100) = 37 (36.5 → 37)
  })

  it('freedomDays = 0 zonder dailyExpenses', () => {
    const r = buildTaxOverview({ box1Tax: 3_650, box2Tax: null, box3Tax: null })
    expect(r.freedomDays).toBe(0)
  })
})

// De kansen-tak is uit `buildTaxOverview` verwijderd (ADR 0086): de enige
// producent is `lib/tax-optimizer/opportunities.ts`. De dekking die hier stond
// (jaarruimte/tegenbewijs/partner-allocatie/DGA-signalen → sortering op
// savings) is dus geen verlies maar een VERHUIZING: `buildOpportunities` +
// `toTaxOpportunities` worden gedekt door lib/tax-optimizer/opportunities.test.ts
// (toelatingsregel netEffect > 0, sortering, routing/deadline per soort) en de
// samenstelling uit de secties door components/overview/belasting/
// optimizer-model.test.ts. Twee van de vier oude takken (tegenbewijs,
// DGA-leengrens) werden bovendien door geen enkele runtime-consument gevoed —
// die dekking bewaakte dode code.
