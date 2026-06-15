/**
 * Unit tests voor de Werk-strategie rekenmotor (lib/werk-strategie.ts).
 *
 * Dekt: salaryAt (groei, plafond, groei-stop, deeltijd, sprongen) en
 * werkMetadataToCashflows (delta-tekens, indexering, onlyWhileWorking,
 * nul-groei = inert, plafond-onder-basis = geen negatieve delta, samenvoegen).
 */
import { describe, it, expect } from 'vitest'
import { salaryAt, werkMetadataToCashflows } from '@/lib/werk-strategie'
import type { WerkMetadata } from '@/lib/horizon-data'

function meta(overrides: Partial<WerkMetadata> = {}): WerkMetadata {
  return {
    huidigNettoMaand: 3000,
    reeleGroeiPct: 0,
    faseStappen: [],
    sprongen: [],
    ...overrides,
  }
}

const ctx = { eventId: 'e1', name: 'Werk & inkomen', currentAge: 30 }

describe('salaryAt', () => {
  it('zonder groei/sprongen/deeltijd = vlak basisinkomen', () => {
    const m = meta()
    expect(salaryAt(m, 30, 30)).toBe(3000)
    expect(salaryAt(m, 30, 50)).toBe(3000)
  })

  it('reële groei compoundt jaarlijks', () => {
    const m = meta({ reeleGroeiPct: 0.02 })
    expect(salaryAt(m, 30, 40)).toBeCloseTo(3000 * Math.pow(1.02, 10), 2)
  })

  it('plafond capt het niveau (reëel)', () => {
    const m = meta({ reeleGroeiPct: 0.05, plafondNettoMaand: 3500 })
    expect(salaryAt(m, 30, 60)).toBe(3500)
  })

  it('plafond onder basisinkomen knipt nooit onder de basis', () => {
    const m = meta({ reeleGroeiPct: 0.03, plafondNettoMaand: 2000 })
    // cap = max(2000, 3000) = 3000 → blijft op de basis, daalt niet
    expect(salaryAt(m, 30, 60)).toBe(3000)
  })

  it('groei stopt op groeiTotLeeftijd', () => {
    const m = meta({ reeleGroeiPct: 0.02, groeiTotLeeftijd: 40 })
    const at40 = salaryAt(m, 30, 40)
    expect(salaryAt(m, 30, 55)).toBeCloseTo(at40, 5)
    expect(at40).toBeCloseTo(3000 * Math.pow(1.02, 10), 2)
  })

  it('deeltijd-stap verlaagt het niveau vanaf de leeftijd', () => {
    const m = meta({ faseStappen: [{ fromAge: 55, pct: 80 }] })
    expect(salaryAt(m, 50, 54)).toBe(3000)
    expect(salaryAt(m, 50, 55)).toBe(2400)
    expect(salaryAt(m, 50, 60)).toBe(2400)
  })

  it('gestapelde deeltijd-stappen composeren', () => {
    const m = meta({
      faseStappen: [
        { fromAge: 55, pct: 80 },
        { fromAge: 60, pct: 60 },
      ],
    })
    expect(salaryAt(m, 50, 56)).toBe(2400)
    expect(salaryAt(m, 50, 61)).toBe(1800)
  })

  it('promotie-sprong verhoogt het niveau op atAge', () => {
    const m = meta({ sprongen: [{ atAge: 40, deltaNettoMaand: 500 }] })
    expect(salaryAt(m, 30, 39)).toBe(3000)
    expect(salaryAt(m, 30, 40)).toBe(3500)
    expect(salaryAt(m, 30, 45)).toBe(3500)
  })
})

describe('werkMetadataToCashflows', () => {
  it('nul-groei / geen wijzigingen = geen kasstromen (inert)', () => {
    expect(werkMetadataToCashflows(meta(), ctx)).toEqual([])
  })

  it('geen basisinkomen = geen kasstromen', () => {
    expect(werkMetadataToCashflows(meta({ huidigNettoMaand: 0 }), ctx)).toEqual([])
  })

  it('reële groei → oplopende income-delta\'s, indexed + onlyWhileWorking', () => {
    const flows = werkMetadataToCashflows(meta({ reeleGroeiPct: 0.02 }), ctx)
    expect(flows.length).toBeGreaterThan(1)
    for (const f of flows) {
      expect(f.type).toBe('recurring')
      expect(f.direction).toBe('income')
      expect(f.amount).toBeGreaterThan(0)
      expect(f.indexed).toBe(true)
      expect(f.onlyWhileWorking).toBe(true)
    }
    // bedragen lopen op met de leeftijd (oplopende segmenten)
    for (let i = 1; i < flows.length; i++) {
      expect(flows[i]!.amount).toBeGreaterThan(flows[i - 1]!.amount)
      expect(flows[i]!.fromAge).toBeGreaterThan(flows[i - 1]!.fromAge)
    }
  })

  it('deeltijd → één expense-delta vanaf de stap-leeftijd (samengevoegd)', () => {
    const flows = werkMetadataToCashflows(meta({ faseStappen: [{ fromAge: 55, pct: 80 }] }), ctx)
    expect(flows).toHaveLength(1)
    const f = flows[0]!
    expect(f.direction).toBe('expense')
    expect(f.amount).toBe(600) // 20% van 3000
    expect(f.fromAge).toBe(55)
    expect(f.toAge).toBeNull()
    expect(f.indexed).toBe(true)
    expect(f.onlyWhileWorking).toBe(true)
  })

  it('promotie-sprong → income-delta vanaf atAge', () => {
    const flows = werkMetadataToCashflows(meta({ sprongen: [{ atAge: 40, deltaNettoMaand: 500 }] }), ctx)
    expect(flows).toHaveLength(1)
    const f = flows[0]!
    expect(f.direction).toBe('income')
    expect(f.amount).toBe(500)
    expect(f.fromAge).toBe(40)
    expect(f.onlyWhileWorking).toBe(true)
  })

  it('plafond onder basis → geen negatieve delta', () => {
    const flows = werkMetadataToCashflows(
      meta({ reeleGroeiPct: 0.03, plafondNettoMaand: 2000 }),
      ctx,
    )
    expect(flows).toEqual([])
  })

  it('groei + deeltijd: income vóór, expense ná de deeltijd-stap', () => {
    const flows = werkMetadataToCashflows(
      meta({ reeleGroeiPct: 0.02, faseStappen: [{ fromAge: 55, pct: 50 }] }),
      ctx,
    )
    expect(flows.some((f) => f.direction === 'income' && f.fromAge < 55)).toBe(true)
    expect(flows.some((f) => f.direction === 'expense' && f.fromAge >= 55)).toBe(true)
  })
})
