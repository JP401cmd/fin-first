import { describe, it, expect } from 'vitest'
import { estimateGrossYearly, computeJaarruimteFacts } from './jaarruimte-facts'

describe('estimateGrossYearly', () => {
  it('geeft 0 bij geen of negatief inkomen', () => {
    expect(estimateGrossYearly(0)).toBe(0)
    expect(estimateGrossYearly(-100)).toBe(0)
  })

  it('schat bruto hoger dan netto (er zit belasting tussen)', () => {
    expect(estimateGrossYearly(3000)).toBeGreaterThan(3000 * 12)
  })

  it('is deterministisch (fixed-point convergeert stabiel)', () => {
    expect(estimateGrossYearly(3400)).toBe(estimateGrossYearly(3400))
  })
})

describe('computeJaarruimteFacts', () => {
  it('geeft hasData=false bij geen inkomen', () => {
    const f = computeJaarruimteFacts(0, 0, 2026)
    expect(f).toEqual({ hasData: false, onbenut: 0, besparing: 0, grossYearly: 0 })
  })

  it('levert onbenutte ruimte + besparing bij een normaal inkomen (factor A 0 = zzp)', () => {
    const f = computeJaarruimteFacts(3400, 0, 2026)
    expect(f.hasData).toBe(true)
    expect(f.onbenut).toBeGreaterThan(0)
    expect(f.besparing).toBeGreaterThan(0)
    // Besparing is de belasting over de inleg → altijd kleiner dan de inleg zelf.
    expect(f.besparing).toBeLessThan(f.onbenut)
    expect(f.grossYearly).toBeGreaterThan(0)
  })

  it('een hoge factor A (veel werkgeverspensioen) drukt de onbenutte ruimte', () => {
    const zzp = computeJaarruimteFacts(4000, 0, 2026)
    const veelPensioen = computeJaarruimteFacts(4000, 5000, 2026)
    expect(veelPensioen.onbenut).toBeLessThan(zzp.onbenut)
  })
})
