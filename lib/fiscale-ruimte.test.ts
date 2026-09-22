import { describe, it, expect } from 'vitest'
import {
  computeFiscaleRuimte,
  FISCALE_RUIMTE_GROEN_MAX,
  FISCALE_RUIMTE_ORANJE_MAX,
  type FiscaleRuimteInput,
} from './fiscale-ruimte'

/**
 * ADR 0177 — de hefboom Belasting oordeelt op ONBENUTTE RUIMTE als aandeel van
 * de eigen heffing (Box 1 + Box 3), niet op de hoogte van de heffing.
 *
 * De kern van de regel is schaalonafhankelijkheid: teller en noemer schalen
 * allebei mee met vermogen en inkomen, dus de uitkomst doet dat niet. De oude
 * regel (`box3TaxStatus`, euro-banden € 100k / € 500k boven de vrijstelling)
 * was monotoon dalend in vermogen en kon bij groot vermogen nooit groen worden.
 */

const LEEG: FiscaleRuimteInput = {
  partnerverdelingBesparing: null,
  jaarruimteBesparing: null,
  samenstellingNetEffect: null,
  box1Tax: null,
  box3Tax: null,
}

describe('computeFiscaleRuimte — geen gegevens', () => {
  it('geeft neutral wanneer er geen enkele fiscale bron is', () => {
    const r = computeFiscaleRuimte(LEEG)
    expect(r.status).toBe('neutral')
    expect(r.ratio).toBeNull()
    expect(r.score).toBeNull()
  })

  it('geeft neutral wanneer de heffing onbekend is maar er wel posten zijn', () => {
    // Een gefaalde bron levert null. Dat mag NOOIT als "niets te halen" lezen:
    // het verschil tussen "je bent in orde" en "we weten het niet" is precies
    // wat deze tak bewaakt (ADR 0177 D3).
    const r = computeFiscaleRuimte({ ...LEEG, jaarruimteBesparing: 2_960 })
    expect(r.status).toBe('neutral')
  })
})

describe('computeFiscaleRuimte — guard op de noemer', () => {
  it('geeft groen wanneer er heffing bekend is maar die nul is', () => {
    const r = computeFiscaleRuimte({ ...LEEG, box1Tax: 0, box3Tax: 0 })
    expect(r.status).toBe('good')
    expect(r.ratio).toBe(0)
  })
})

describe('computeFiscaleRuimte — de banden', () => {
  const metHeffing = (besparing: number): FiscaleRuimteInput => ({
    ...LEEG,
    jaarruimteBesparing: besparing,
    box1Tax: 8_000,
    box3Tax: 2_000, // noemer = 10.000
  })

  it('groen onder de 5%', () => {
    expect(computeFiscaleRuimte(metHeffing(499)).status).toBe('good')
  })

  it('oranje vanaf exact 5%', () => {
    const r = computeFiscaleRuimte(metHeffing(500))
    expect(r.ratio).toBeCloseTo(FISCALE_RUIMTE_GROEN_MAX, 10)
    expect(r.status).toBe('warn')
  })

  it('oranje tot onder de 15%', () => {
    expect(computeFiscaleRuimte(metHeffing(1_499)).status).toBe('warn')
  })

  it('rood vanaf exact 15%', () => {
    const r = computeFiscaleRuimte(metHeffing(1_500))
    expect(r.ratio).toBeCloseTo(FISCALE_RUIMTE_ORANJE_MAX, 10)
    expect(r.status).toBe('bad')
  })
})

describe('computeFiscaleRuimte — posten', () => {
  it('sorteert aflopend op besparing zodat de melding de grootste post noemt', () => {
    const r = computeFiscaleRuimte({
      partnerverdelingBesparing: 400,
      jaarruimteBesparing: 2_960,
      samenstellingNetEffect: 120,
      box1Tax: 12_000,
      box3Tax: 2_606,
    })
    expect(r.posten.map((p) => p.cause)).toEqual([
      'jaarruimte',
      'partnerverdeling',
      'samenstelling',
    ])
    expect(r.posten[0].besparing).toBe(2_960)
  })

  it('laat posten zonder positieve besparing weg', () => {
    const r = computeFiscaleRuimte({
      partnerverdelingBesparing: 0,
      jaarruimteBesparing: null,
      samenstellingNetEffect: -800, // per saldo verliesgevend — telt niet mee
      box1Tax: 10_000,
      box3Tax: 5_000,
    })
    expect(r.posten).toEqual([])
    expect(r.status).toBe('good')
    expect(r.ratio).toBe(0)
  })
})

describe('computeFiscaleRuimte — schaalonafhankelijk (de kern van ADR 0177)', () => {
  it('geeft dezelfde uitkomst wanneer vermogen én inkomen verdubbelen', () => {
    const klein = computeFiscaleRuimte({
      ...LEEG,
      jaarruimteBesparing: 1_000,
      box1Tax: 8_000,
      box3Tax: 2_000,
    })
    const groot = computeFiscaleRuimte({
      ...LEEG,
      jaarruimteBesparing: 2_000,
      box1Tax: 16_000,
      box3Tax: 4_000,
    })
    expect(groot.ratio).toBeCloseTo(klein.ratio!, 10)
    expect(groot.status).toBe(klein.status)
  })

  it('alleenstaande met € 2M belegd en niets te optimaliseren staat GROEN', () => {
    // Oude regel: box3TaxableAboveThreshold ≈ € 1,94M > € 500k → altijd 'bad'.
    // Er was geen handeling die dat groen kon maken behalve minder vermogen.
    const r = computeFiscaleRuimte({
      partnerverdelingBesparing: null, // alleenstaand
      jaarruimteBesparing: 0,
      samenstellingNetEffect: -11_400, // verschuiven kost per saldo rendement
      box1Tax: 30_000,
      box3Tax: 41_918, // canonieke forfait-keten bij € 2M 100% beleggen, 2026
    })
    expect(r.status).toBe('good')
    expect(r.ratio).toBe(0)
  })

  it('stel met € 700k waar alleen € 400 partnerverdeling te halen is, staat GROEN', () => {
    // Oude regel: above = 700.000 − 59.357 = € 640.643 > € 500k → 'bad'.
    const r = computeFiscaleRuimte({
      partnerverdelingBesparing: 400,
      jaarruimteBesparing: 0,
      samenstellingNetEffect: null,
      box1Tax: 25_000,
      box3Tax: 12_556,
    })
    expect(r.status).toBe('good')
    expect(r.ratio!).toBeLessThan(FISCALE_RUIMTE_GROEN_MAX)
  })

  it('alleenstaande met € 180k en € 8.000 onbenutte jaarruimte staat ROOD', () => {
    // Bescheiden vermogen, maar er ligt echt geld: ratio ≈ 20%.
    const r = computeFiscaleRuimte({
      partnerverdelingBesparing: null,
      jaarruimteBesparing: 2_960,
      samenstellingNetEffect: null,
      box1Tax: 12_000,
      box3Tax: 2_606,
    })
    expect(r.status).toBe('bad')
    expect(r.posten[0].cause).toBe('jaarruimte')
  })
})

describe('computeFiscaleRuimte — score voor de ring', () => {
  it('loopt mee met de band: 0% → 100, 5% → 80, 15% → 40', () => {
    const scoreBij = (ratio: number) =>
      computeFiscaleRuimte({
        ...LEEG,
        jaarruimteBesparing: ratio * 10_000,
        box1Tax: 10_000,
        box3Tax: 0,
      }).score
    expect(scoreBij(0)).toBe(100)
    expect(scoreBij(0.05)).toBe(80)
    expect(scoreBij(0.15)).toBe(40)
  })

  it('klemt op 0 bij extreem hoge onbenutte ruimte', () => {
    const r = computeFiscaleRuimte({
      ...LEEG,
      jaarruimteBesparing: 9_000,
      box1Tax: 10_000,
      box3Tax: 0,
    })
    expect(r.score).toBe(0)
  })
})
