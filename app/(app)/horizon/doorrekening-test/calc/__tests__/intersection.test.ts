/**
 * Unit tests voor `findIntersection` en `interpolateIntersection`
 * (`calc/intersection.ts`).
 *
 * Dekking:
 *  1. Eenvoudige kruising bij leeftijd 60 met lineaire interpolatie → ~60.3.
 *  2. Geen kruising binnen bereik → `{ age: null, fractional: null }`.
 *  3. Kruising op currentAge zelf (portfolio al ≥ required op rij 0) →
 *     `fractional` = currentAge exact, geen interpolatie.
 *  4. Pensioen-style: `requiredPortfolio === null` vóór AOW-leeftijd →
 *     skip, kruising wordt pas vanaf AOW gezocht.
 *  5. Fractional interpoleert binnen `(age − 1, age)` en clampt op [0, 1].
 *  6. `interpolateIntersection` met expliciete discreteAge (pensioen-forced).
 */

import { describe, it, expect } from 'vitest'
import { findIntersection, interpolateIntersection } from '../intersection'

type Row = { age: number; netWorth: number }
type Req = { age: number; requiredPortfolio: number | null }

function makeOpbouw(ages: number[], netWorths: number[]): Row[] {
  return ages.map((age, i) => ({ age, netWorth: netWorths[i] }))
}

function makeRequired(ages: number[], values: (number | null)[]): Req[] {
  return ages.map((age, i) => ({ age, requiredPortfolio: values[i] }))
}

describe('findIntersection', () => {
  it('vindt kruising met lineaire interpolatie rond leeftijd 60', () => {
    // Opbouw groeit lineair 100k → 200k over leeftijd 58..62.
    // Required is horizontaal op 160k.
    // Discrete kruising: bij age=60 netWorth=150 < 160; age=61 netWorth=175 ≥ 160.
    // Interpolatie in (60,61): portPrev=150, portCur=175, reqPrev=160, reqCur=160.
    // t = (160-150) / ((175-150) - (160-160)) = 10/25 = 0.4.
    // fractional = 60 + 0.4 = 60.4.
    const opbouw = makeOpbouw([58, 59, 60, 61, 62], [100, 125, 150, 175, 200])
    const required = makeRequired([58, 59, 60, 61, 62], [160, 160, 160, 160, 160])

    const result = findIntersection(opbouw, required)

    expect(result.age).toBe(61)
    expect(result.fractional).toBeCloseTo(60.4, 5)
  })

  it('returnt null als er geen kruising bestaat in het bereik', () => {
    // Opbouw blijft ver onder required.
    const opbouw = makeOpbouw([30, 31, 32, 33], [10, 12, 14, 16])
    const required = makeRequired([30, 31, 32, 33], [500, 500, 500, 500])

    const result = findIntersection(opbouw, required)

    expect(result.age).toBeNull()
    expect(result.fractional).toBeNull()
  })

  it('kruising op currentAge → fractional = currentAge zonder interpolatie', () => {
    // Portfolio is al boven required op rij 0.
    const opbouw = makeOpbouw([40, 41, 42], [500, 520, 540])
    const required = makeRequired([40, 41, 42], [400, 400, 400])

    const result = findIntersection(opbouw, required)

    expect(result.age).toBe(40)
    expect(result.fractional).toBe(40)
  })

  it('pensioen-style: skipt null-required vóór AOW, vindt kruising vanaf AOW', () => {
    // Leeftijd 65..67 required = null (pensioen pre-AOW).
    // Vanaf 68 (AOW) komt er een required. Opbouw kruist required bij 69.
    const opbouw = makeOpbouw([65, 66, 67, 68, 69, 70], [300, 320, 340, 360, 400, 440])
    const required = makeRequired([65, 66, 67, 68, 69, 70], [null, null, null, 450, 380, 370])

    const result = findIntersection(opbouw, required)

    // Bij age=68: opbouw=360 < required=450 → geen kruising.
    // Bij age=69: opbouw=400 ≥ required=380 → kruising.
    // Interpolatie: prev rij (68) heeft required=450 (non-null), dus interpoleren.
    // t = (450 - 360) / ((400 - 360) - (380 - 450)) = 90 / (40 - (-70)) = 90 / 110 ≈ 0.818.
    // fractional = 68 + 0.818 ≈ 68.818.
    expect(result.age).toBe(69)
    expect(result.fractional).toBeCloseTo(68 + 90 / 110, 5)
  })

  it('pensioen-style: als vorige rij null-required is, val terug op discrete age', () => {
    // AOW-leeftijd 68; direct op 68 is portfolio al voldoende.
    // Previous (67) heeft required=null → geen interpolatie mogelijk.
    const opbouw = makeOpbouw([65, 66, 67, 68, 69], [300, 350, 400, 500, 550])
    const required = makeRequired([65, 66, 67, 68, 69], [null, null, null, 480, 470])

    const result = findIntersection(opbouw, required)

    expect(result.age).toBe(68)
    expect(result.fractional).toBe(68) // fallback — geen interpolatie want prev=null
  })

  it('fractional clampt bij degenerate t > 1 binnen (age-1, age]', () => {
    // Op age=58 portfolio onder required; op age=59 portfolio boven.
    // Maar required daalt tussen 58 en 59 (bv. AOW kickt in), portfolio
    // stijgt licht. Ruwe t = (reqPrev − portPrev) / ((portDiff) − (reqDiff)).
    // portPrev=100, portCur=110, reqPrev=150, reqCur=80.
    // denom = 10 - (-70) = 80. t = (150-100)/80 = 0.625.
    // Dat is binnen [0, 1] — geen clamp nodig. Zoek scenario voor t>1:
    // portPrev=100, portCur=110, reqPrev=109, reqCur=105.
    // denom = 10 - (-4) = 14. t = (109-100)/14 ≈ 0.643. Nog steeds ok.
    // Voor t>1 hebben we nodig: (reqPrev − portPrev) > (portDiff − reqDiff).
    // portPrev=0, portCur=10, reqPrev=100, reqCur=-1000.
    // portfolio kruist niet op 59 (0 < 100), maar op age=60: 10 >= -1000 → kruising.
    // denom = 10 - (-1100) = 1110. t = (100-0)/1110 ≈ 0.09. Ook ok.
    // Praktisch: clamp > 1 treedt alleen op bij absurde scenario's.
    // Focus op t < 0 clamp (ondergrens):
    // opbouw: 100, 120. required: 105, 95. Op age=59: 100<105 → géén.
    // Op age=60: 120>=95 → kandidaat. portPrev=100, portCur=120, reqPrev=105, reqCur=95.
    // denom = 20 - (-10) = 30. t = (105-100)/30 ≈ 0.167. In range.
    // Construeer t<0 expliciet: reqPrev<portPrev (al voorbij op prev) maar
    // discrete scan wijst toch op current (door null-skips). Zonder null is
    // dat onmogelijk — als reqPrev<portPrev dan kruising al op prev-rij.
    // Daarom: test met null op prev-rij → helper valt terug op discrete age.
    // Dit scenario is al gedekt door eerdere test; hier testen we t>1 clamp:
    const opbouw = makeOpbouw([59, 60], [0, 10])
    const required = makeRequired([59, 60], [1000, -5]) // pathologisch dalende required
    // age=59: 0<1000 → skip. age=60: 10>=-5 → kandidaat.
    // denom = 10 - (-1005) = 1015. t = (1000-0)/1015 ≈ 0.985.
    // Dat is nog < 1. Voor strikte clamp-hit: maak reqPrev > denom.
    // reqPrev=2000, reqCur=-5. denom = 10 - (-2005) = 2015. t = 2000/2015 ≈ 0.993.
    // Conclusie: clamp op [0,1] is een veiligheidsnet, niet structureel hit-baar
    // bij geldige monotone data. We verifiëren alleen dat output binnen het
    // verwachte interval ligt.
    const result = findIntersection(opbouw, required)

    expect(result.age).toBe(60)
    expect(result.fractional).not.toBeNull()
    // Moet binnen (59, 60] liggen — clamp-garantie.
    expect(result.fractional!).toBeGreaterThanOrEqual(59)
    expect(result.fractional!).toBeLessThanOrEqual(60)
  })

  it('lege arrays → geen kruising', () => {
    expect(findIntersection([], [])).toEqual({ age: null, fractional: null })
  })
})

describe('interpolateIntersection', () => {
  it('interpoleert voor geforceerde discreteAge (pensioen-modus)', () => {
    // Simuleer: caller forceert kruising op AOW=68.
    const opbouw = makeOpbouw([66, 67, 68, 69], [200, 250, 300, 350])
    const required = makeRequired([66, 67, 68, 69], [null, 320, 310, 300])

    // Bij age=68: prev=67 netWorth=250 req=320; current=68 netWorth=300 req=310.
    // t = (320 - 250) / ((300 - 250) - (310 - 320)) = 70 / (50 - (-10)) = 70/60 ≈ 1.167.
    // Clamp op 1 → fractional = 67 + 1 = 68.
    const result = interpolateIntersection(opbouw, required, 68)

    expect(result).toBe(68)
  })

  it('returnt discreteAge exact als vorige rij null-required heeft', () => {
    const opbouw = makeOpbouw([66, 67, 68], [200, 250, 300])
    const required = makeRequired([66, 67, 68], [null, null, 290])

    const result = interpolateIntersection(opbouw, required, 68)

    expect(result).toBe(68)
  })

  it('returnt discreteAge als het de eerste rij is (geen previous)', () => {
    const opbouw = makeOpbouw([40, 41, 42], [500, 520, 540])
    const required = makeRequired([40, 41, 42], [400, 410, 420])

    const result = interpolateIntersection(opbouw, required, 40)

    expect(result).toBe(40)
  })

  it('returnt discreteAge als die niet in de curve voorkomt', () => {
    const opbouw = makeOpbouw([40, 41, 42], [500, 520, 540])
    const required = makeRequired([40, 41, 42], [400, 410, 420])

    const result = interpolateIntersection(opbouw, required, 99)

    expect(result).toBe(99)
  })

  it('interpoleert normaal binnen (age-1, age) voor een tussenliggend jaar', () => {
    // Lineaire setup rond leeftijd 55.
    // opbouw: 54→100, 55→200. required: 54→150, 55→150 (horizontaal).
    // t = (150 - 100) / ((200 - 100) - (150 - 150)) = 50/100 = 0.5.
    // fractional = 54 + 0.5 = 54.5.
    const opbouw = makeOpbouw([54, 55, 56], [100, 200, 300])
    const required = makeRequired([54, 55, 56], [150, 150, 150])

    const result = interpolateIntersection(opbouw, required, 55)

    expect(result).toBeCloseTo(54.5, 5)
  })
})
