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

/** Expliciet ingevulde factor A (bekend). `0` hier = "geen werkgeverspensioen". */
const bekend = (waarde: number) => ({ pension_factor_a: waarde, pension_factor_a_source: 'upo' })
/** Niet ingevuld — NULL ≠ 0 (H23). */
const ONBEKEND = { pension_factor_a: null, pension_factor_a_source: null }

describe('computeJaarruimteFacts', () => {
  it('geeft hasData=false bij geen inkomen', () => {
    const f = computeJaarruimteFacts(0, bekend(0), 2026)
    expect(f).toEqual({
      hasData: false,
      onbenut: 0,
      besparing: 0,
      grossYearly: 0,
      factorAKnown: true,
    })
  })

  it('levert onbenutte ruimte + besparing bij een normaal inkomen (factor A 0 = zzp)', () => {
    const f = computeJaarruimteFacts(3400, bekend(0), 2026)
    expect(f.hasData).toBe(true)
    expect(f.onbenut).toBeGreaterThan(0)
    expect(f.besparing).toBeGreaterThan(0)
    // Besparing is de belasting over de inleg → altijd kleiner dan de inleg zelf.
    expect(f.besparing).toBeLessThan(f.onbenut)
    expect(f.grossYearly).toBeGreaterThan(0)
  })

  it('een hoge factor A (veel werkgeverspensioen) drukt de onbenutte ruimte', () => {
    const zzp = computeJaarruimteFacts(4000, bekend(0), 2026)
    const veelPensioen = computeJaarruimteFacts(4000, bekend(5000), 2026)
    expect(veelPensioen.onbenut).toBeLessThan(zzp.onbenut)
  })
})

/**
 * H23-vervolg — de kwalificatie hoort bij de FEITEN, niet bij elke consument.
 *
 * `resolvePensionFactorA` scheidt al "niet ingevuld" (isKnown false, factorA 0)
 * van "expliciet geen pensioen" (isKnown true, factorA 0). Drie AI-consumenten
 * trokken daar zélf `.factorA` uit en lieten `.isKnown` vallen, waardoor Fin een
 * BOVENGRENS als hard bedrag noemde terwijl de jaarruimte-kaart ernaast een
 * bereik + waarschuwing toonde. De resolutie zit daarom nu ín deze functie: het
 * profiel gaat erin, de vlag komt eruit.
 */
describe('computeJaarruimteFacts — factorAKnown (NULL ≠ 0)', () => {
  it('niet ingevuld → factorAKnown false, terwijl de motor gewoon zonder aftrek rekent', () => {
    const f = computeJaarruimteFacts(3400, ONBEKEND, 2026)
    expect(f.factorAKnown).toBe(false)
    expect(f.hasData).toBe(true)
    // Zelfde BEDRAGEN als een expliciete 0 — de vlag stuurt uitsluitend de weergave.
    const explicietNul = computeJaarruimteFacts(3400, bekend(0), 2026)
    expect(f.onbenut).toBe(explicietNul.onbenut)
    expect(f.besparing).toBe(explicietNul.besparing)
    expect(explicietNul.factorAKnown).toBe(true)
  })

  it('een ontbrekend profiel (null) telt als onbekend, niet als €0 aangroei', () => {
    expect(computeJaarruimteFacts(3400, null, 2026).factorAKnown).toBe(false)
    expect(computeJaarruimteFacts(3400, undefined, 2026).factorAKnown).toBe(false)
  })

  it('de vlag overleeft ook de geen-data-takken (0 inkomen)', () => {
    expect(computeJaarruimteFacts(0, ONBEKEND, 2026).factorAKnown).toBe(false)
  })
})
