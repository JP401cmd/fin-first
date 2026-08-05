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

describe('buildTaxOverview — effectiveRate & marginalRate', () => {
  it('effectiveRate = total / grossYearlyIncome', () => {
    const r = buildTaxOverview({
      box1Tax: 20_000,
      box2Tax: null,
      box3Tax: null,
      grossYearlyIncome: 80_000,
    })
    expect(r.effectiveRate).toBeCloseTo(0.25, 6)
  })

  it('effectiveRate = null bij ontbrekend of nul inkomen', () => {
    const zonder = buildTaxOverview({ box1Tax: 20_000, box2Tax: null, box3Tax: null })
    expect(zonder.effectiveRate).toBeNull()
    const nul = buildTaxOverview({
      box1Tax: 20_000,
      box2Tax: null,
      box3Tax: null,
      grossYearlyIncome: 0,
    })
    expect(nul.effectiveRate).toBeNull()
  })

  it('marginalRate wordt doorgegeven', () => {
    const r = buildTaxOverview({
      box1Tax: 10_000,
      box2Tax: null,
      box3Tax: null,
      marginalRate: 0.4956,
    })
    expect(r.marginalRate).toBeCloseTo(0.4956, 6)
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
