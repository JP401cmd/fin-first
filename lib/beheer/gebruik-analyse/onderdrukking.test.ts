import { describe, it, expect } from 'vitest'
import {
  GEBRUIK_K,
  aandeel,
  celTekst,
  onderdrukCel,
  onderdrukVerdeling,
  type Cel,
} from './onderdrukking'

const w = (n: number): Cel => ({ soort: 'waarde', n })
const KLEIN: Cel = { soort: 'klein' }
const VERBORGEN: Cel = { soort: 'verborgen' }

describe('onderdrukCel', () => {
  it('0 blijft 0, 1..k-1 wordt klein, k en meer blijft zichtbaar', () => {
    expect(onderdrukCel(0)).toEqual(w(0))
    for (let n = 1; n < GEBRUIK_K; n++) expect(onderdrukCel(n)).toEqual(KLEIN)
    expect(onderdrukCel(GEBRUIK_K)).toEqual(w(GEBRUIK_K))
    expect(onderdrukCel(120)).toEqual(w(120))
  })

  it('null uit de database (al onderdrukt) en onzin worden klein, nooit 0', () => {
    expect(onderdrukCel(null)).toEqual(KLEIN)
    expect(onderdrukCel(undefined)).toEqual(KLEIN)
    expect(onderdrukCel(-3)).toEqual(KLEIN)
    expect(onderdrukCel(Number.NaN)).toEqual(KLEIN)
  })

  it('k is de gedeelde constante 5', () => {
    expect(GEBRUIK_K).toBe(5)
  })
})

describe('onderdrukVerdeling', () => {
  it('geen kleine cel: alles zichtbaar', () => {
    const r = onderdrukVerdeling([10, 6, 0], 16)
    expect(r.cellen).toEqual([w(10), w(6), w(0)])
    expect(r.totaal).toEqual(w(16))
  })

  it('één kleine cel: alle niet-nul cellen verborgen, nullen blijven, totaal blijft', () => {
    const r = onderdrukVerdeling([12, 5, 3, 0], 20)
    expect(r.cellen).toEqual([VERBORGEN, VERBORGEN, VERBORGEN, w(0)])
    expect(r.totaal).toEqual(w(20))
  })

  it('al door de database onderdrukt (null) werkt hetzelfde', () => {
    expect(onderdrukVerdeling([12, 5, null, 0], 20).cellen).toEqual([VERBORGEN, VERBORGEN, VERBORGEN, w(0)])
  })

  it('[0, 4, 4] van 8 — het patroon van "verbergen" verraadt niets meer', () => {
    // De klassieke aanpak (kleinste andere cel verbergen) gaf hier een uniek patroon.
    expect(onderdrukVerdeling([0, 4, 4], 8).cellen).toEqual([w(0), VERBORGEN, VERBORGEN])
    expect(onderdrukVerdeling([0, 3, 5], 8).cellen).toEqual([w(0), VERBORGEN, VERBORGEN])
    expect(onderdrukVerdeling([0, 1, 7], 8).cellen).toEqual([w(0), VERBORGEN, VERBORGEN])
  })

  it('totaal niet groter dan het aantal cellen: ook de nullen dicht', () => {
    // [1,1,1,1,1] van 5: met zichtbare "geen nullen" zou elke cel exact 1 zijn.
    expect(onderdrukVerdeling([1, 1, 1, 1, 1], 5).cellen).toEqual(Array(5).fill(VERBORGEN))
    expect(onderdrukVerdeling([0, 1, 1, 1, 2], 5).cellen).toEqual(Array(5).fill(VERBORGEN))
  })

  it('totaal onder k: élke cel klein, ook de nullen', () => {
    const r = onderdrukVerdeling([1, 1, 0, 1], 3)
    expect(r.totaal).toEqual(KLEIN)
    expect(r.cellen).toEqual([KLEIN, KLEIN, KLEIN, KLEIN])
    expect(onderdrukVerdeling([null, 0], null).cellen).toEqual([KLEIN, KLEIN])
  })

  it('totaal 0: alles 0', () => {
    expect(onderdrukVerdeling([0, 0], 0)).toEqual({ cellen: [w(0), w(0)], totaal: w(0) })
  })

  it('het totaal wordt nooit verborgen (het staat elders ook)', () => {
    for (const [cellen, totaal] of [[[0, 0, 0, 1, 5], 6], [[1, 5], 6], [[4, 4, 10], 18]] as const) {
      expect(onderdrukVerdeling(cellen, totaal).totaal).toEqual(w(totaal))
    }
  })

  it('lege verdeling', () => {
    expect(onderdrukVerdeling([], 0)).toEqual({ cellen: [], totaal: w(0) })
  })

  it('wijzigt de invoer niet', () => {
    const invoer = [12, 5, 3]
    onderdrukVerdeling(invoer, 20)
    expect(invoer).toEqual([12, 5, 3])
  })

  it('eigenschap: een lezer die het algoritme kent, kan uit wat zichtbaar is geen kleine cel exact bepalen', () => {
    // Voor elke invoer: groepeer alle invoeren die exact dezelfde uitvoer geven.
    // Voor elke echt-kleine cel (1..k-1) die niet zichtbaar is, moet die groep
    // minstens twee waarden voor die cel bevatten. Alleen totalen ≤ max, zodat
    // élke verdeling van dat totaal in de opsomming zit (geen afkapartefact).
    for (const [lengte, max] of [[1, 14], [2, 16], [3, 13], [4, 10], [5, 8]] as const) {
      const vectoren: number[][] = []
      const bouw = (pre: number[], rest: number) => {
        if (pre.length === lengte) return void vectoren.push(pre)
        for (let v = 0; v <= rest; v++) bouw([...pre, v], rest - v)
      }
      bouw([], max)
      const zicht = new Map<string, number[][]>()
      for (const v of vectoren) {
        const sleutel = JSON.stringify(onderdrukVerdeling(v, v.reduce((a, b) => a + b, 0)))
        zicht.set(sleutel, [...(zicht.get(sleutel) ?? []), v])
      }
      let getoetst = 0
      for (const [sleutel, groep] of zicht) {
        const uit = JSON.parse(sleutel) as { cellen: Cel[] }
        for (const echt of groep) {
          uit.cellen.forEach((cel, i) => {
            if (cel.soort === 'waarde') return void expect(cel.n).toBe(echt[i])
            if (echt[i] < 1 || echt[i] >= GEBRUIK_K) return
            expect(new Set(groep.map((g) => g[i])).size, `${echt.join(',')} cel ${i}`).toBeGreaterThan(1)
            getoetst++
          })
        }
      }
      if (lengte > 1) expect(getoetst).toBeGreaterThan(10)
    }
  })
})

describe('aandeel', () => {
  it('alleen met zichtbare teller en noemer, altijd met n', () => {
    expect(aandeel(w(10), w(50))).toEqual({ fractie: 0.2, noemer: 50, waarschuwing: false })
    expect(aandeel(KLEIN, w(50))).toBeNull()
    expect(aandeel(w(10), VERBORGEN)).toBeNull()
    expect(aandeel(w(0), w(0))).toBeNull()
  })

  it('waarschuwing onder 40', () => {
    expect(aandeel(w(10), w(39))?.waarschuwing).toBe(true)
    expect(aandeel(w(10), w(40))?.waarschuwing).toBe(false)
  })
})

describe('celTekst', () => {
  it('toont "< k" en "verborgen", nooit een 0 voor een onderdrukte cel', () => {
    expect(celTekst(w(1234))).toBe('1.234')
    expect(celTekst(KLEIN)).toBe('< 5')
    expect(celTekst(VERBORGEN)).toBe('verborgen')
  })
})
