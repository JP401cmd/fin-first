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

  it('lege input → total 0, lege opportunities, lege distributie', () => {
    const r = buildTaxOverview({ box1Tax: null, box2Tax: null, box3Tax: null })
    expect(r.total).toBe(0)
    expect(r.opportunities).toEqual([])
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

describe('buildTaxOverview — opportunities', () => {
  it('genereert kansen uit signalen met juiste box/href/deadline', () => {
    const r = buildTaxOverview({
      box1Tax: 10_000,
      box2Tax: null,
      box3Tax: 2_000,
      dailyExpenses: 100,
      jaarruimte: { amount: 4_000, savings: 1_500 },
      tegenbewijs: { savings: 800 },
      partnerAllocatie: { savings: 300 },
    })
    const byId = Object.fromEntries(r.opportunities.map(o => [o.id, o]))

    expect(byId.jaarruimte).toMatchObject({
      box: 1,
      savings: 1_500,
      deadline: '31 dec',
      href: '/overzicht/belasting/box1',
      freedomDays: 15,
    })
    expect(byId.tegenbewijs).toMatchObject({
      box: 3,
      savings: 800,
      href: '/overzicht/belasting/box3',
    })
    expect(byId['partner-allocatie']).toMatchObject({
      box: 3,
      savings: 300,
      href: '/overzicht/belasting/box3',
    })
  })

  it('sorteert opportunities op savings desc', () => {
    const r = buildTaxOverview({
      box1Tax: 10_000,
      box2Tax: null,
      box3Tax: 2_000,
      jaarruimte: { amount: 4_000, savings: 1_500 },
      tegenbewijs: { savings: 800 },
      partnerAllocatie: { savings: 300 },
    })
    const savings = r.opportunities.map(o => o.savings)
    expect(savings).toEqual([...savings].sort((a, b) => b - a))
    expect(savings).toEqual([1_500, 800, 300])
  })

  it('negeert signalen zonder betekenisvolle savings (>0)', () => {
    const r = buildTaxOverview({
      box1Tax: 10_000,
      box2Tax: null,
      box3Tax: null,
      jaarruimte: { amount: 0, savings: 0 },
      tegenbewijs: { savings: 0 },
      partnerAllocatie: { savings: 0 },
    })
    expect(r.opportunities).toEqual([])
  })

  it('toont DGA-leengrens als box-2 waarschuwing (savings 0) onderaan', () => {
    const r = buildTaxOverview({
      box1Tax: 10_000,
      box2Tax: 5_000,
      box3Tax: null,
      jaarruimte: { amount: 4_000, savings: 1_500 },
      dgaLeningExcess: 120_000,
    })
    const dga = r.opportunities.find(o => o.id === 'dga-leengrens')
    expect(dga).toMatchObject({
      box: 2,
      savings: 0,
      freedomDays: 0,
      deadline: '31 dec',
      href: '/overzicht/belasting/box2',
    })
    // savings 0 → sorteert achter de jaarruimte-kans.
    expect(r.opportunities[r.opportunities.length - 1].id).toBe('dga-leengrens')
  })

  it('toont DGA-leengrens niet bij excess ≤ 0 of ontbrekend', () => {
    const geen = buildTaxOverview({
      box1Tax: 10_000,
      box2Tax: 5_000,
      box3Tax: null,
      dgaLeningExcess: 0,
    })
    expect(geen.opportunities.find(o => o.id === 'dga-leengrens')).toBeUndefined()

    const ontbreekt = buildTaxOverview({ box1Tax: 10_000, box2Tax: 5_000, box3Tax: null })
    expect(ontbreekt.opportunities.find(o => o.id === 'dga-leengrens')).toBeUndefined()
  })
})
