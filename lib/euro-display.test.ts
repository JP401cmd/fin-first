/**
 * Tests voor de euro-weergave-presentatielaag (lib/euro-display.ts).
 *
 * Covers:
 *  1. deflate: identiteit in 'nominal', deling in 'real', factor 1.0 =
 *     identiteit (jaar-0-garantie), onbruikbare factoren laten het bedrag
 *     ongemoeid.
 *  2. buildFactorByAge: leeftijd → factor, onbruikbare factoren overslaan,
 *     lege input → lege map.
 *  3. factorAtAge: exacte leeftijd wint, anders dichtstbijzijnde rij, lege
 *     rijen/ontbrekende leeftijd → 1, FIRE-jaar- en AOW-jaar-scenario's.
 *  4. euroViewLabel: beide takken.
 *  5. deflateRowsByAge / deflatePoints / deflateSeriesByOffset: de drie
 *     feed-deflatoren — referentiegelijkheid in 'nominal', isolatie van de
 *     moneyFields, en de sleutelvorm per feed (leeftijd / expliciete keyOf /
 *     jaar-offset).
 *  6. buildFactorByOffset: index 0 = vandaag, volgorde blijft intact.
 *
 * De compile-gard tegen een TWEEDE omzetting (het InEuroView-merk) is geen
 * runtime-gedrag en staat daarom in `euro-display.type-test.ts`, dat meeloopt
 * in `npx tsc --noEmit`.
 */
import { describe, it, expect } from 'vitest'
import {
  deflate,
  buildFactorByAge,
  buildFactorByOffset,
  deflatePoints,
  deflateRowsByAge,
  deflateSeriesByOffset,
  factorAtAge,
  euroViewLabel,
  type FactorRow,
} from './euro-display'

describe('deflate', () => {
  it("'nominal' is exacte identiteit", () => {
    expect(deflate(1234.56, 1.5, 'nominal')).toBe(1234.56)
  })

  it("'nominal' is identiteit ook bij rare factoren (0, negatief, NaN, Infinity)", () => {
    expect(deflate(1000, 0, 'nominal')).toBe(1000)
    expect(deflate(1000, -2, 'nominal')).toBe(1000)
    expect(deflate(1000, NaN, 'nominal')).toBe(1000)
    expect(deflate(1000, Infinity, 'nominal')).toBe(1000)
  })

  it("'real' deelt door de factor", () => {
    expect(deflate(1200, 1.2, 'real')).toBeCloseTo(1000, 10)
    expect(deflate(100, 2, 'real')).toBe(50)
  })

  it('factor 1.0 is identiteit in \'real\' (jaar-0-garantie)', () => {
    expect(deflate(4242, 1.0, 'real')).toBe(4242)
  })

  it("'real' met factor 0 laat het bedrag ongemoeid (geen Infinity)", () => {
    expect(deflate(1000, 0, 'real')).toBe(1000)
  })

  it("'real' met negatieve factor laat het bedrag ongemoeid (geen negatief resultaat)", () => {
    expect(deflate(1000, -3, 'real')).toBe(1000)
  })

  it("'real' met NaN-factor laat het bedrag ongemoeid", () => {
    expect(deflate(1000, NaN, 'real')).toBe(1000)
  })

  it("'real' met Infinity-factor laat het bedrag ongemoeid (geen 0)", () => {
    expect(deflate(1000, Infinity, 'real')).toBe(1000)
  })
})

describe('buildFactorByAge', () => {
  it('mapt leeftijd naar factor', () => {
    const rows: FactorRow[] = [
      { age: 40, inflationFactor: 1.0 },
      { age: 41, inflationFactor: 1.02 },
      { age: 42, inflationFactor: 1.0404 },
    ]
    const map = buildFactorByAge(rows)
    expect(map.size).toBe(3)
    expect(map.get(40)).toBe(1.0)
    expect(map.get(41)).toBe(1.02)
    expect(map.get(42)).toBe(1.0404)
  })

  it('slaat onbruikbare factoren over (0, negatief, NaN, Infinity)', () => {
    const rows: FactorRow[] = [
      { age: 40, inflationFactor: 1.0 },
      { age: 41, inflationFactor: 0 },
      { age: 42, inflationFactor: -1 },
      { age: 43, inflationFactor: NaN },
      { age: 44, inflationFactor: Infinity },
      { age: 45, inflationFactor: 1.05 },
    ]
    const map = buildFactorByAge(rows)
    expect(map.size).toBe(2)
    expect(map.has(40)).toBe(true)
    expect(map.has(45)).toBe(true)
    expect(map.has(41)).toBe(false)
    expect(map.has(42)).toBe(false)
    expect(map.has(43)).toBe(false)
    expect(map.has(44)).toBe(false)
  })

  it('lege input geeft lege map', () => {
    const map = buildFactorByAge([])
    expect(map.size).toBe(0)
  })
})

describe('factorAtAge', () => {
  const rows: FactorRow[] = [
    { age: 40, inflationFactor: 1.0 },
    { age: 41, inflationFactor: 1.02 },
    { age: 45, inflationFactor: 1.104 },
    { age: 67, inflationFactor: 1.6 },
  ]

  it('exacte leeftijd wint', () => {
    expect(factorAtAge(rows, 41)).toBe(1.02)
    expect(factorAtAge(rows, 67)).toBe(1.6)
  })

  it('valt anders terug op de dichtstbijzijnde rij', () => {
    // 44 ligt dichter bij 45 (afstand 1) dan bij 41 (afstand 3).
    expect(factorAtAge(rows, 44)).toBe(1.104)
    // 60 ligt dichter bij 67 (afstand 7) dan bij 45 (afstand 15).
    expect(factorAtAge(rows, 60)).toBe(1.6)
  })

  it('lege rijen geven 1', () => {
    expect(factorAtAge([], 45)).toBe(1)
  })

  it('age null/undefined/NaN geeft 1', () => {
    expect(factorAtAge(rows, null)).toBe(1)
    expect(factorAtAge(rows, undefined)).toBe(1)
    expect(factorAtAge(rows, NaN)).toBe(1)
  })

  it('rijen met alleen onbruikbare factoren geven 1', () => {
    const unusable: FactorRow[] = [
      { age: 40, inflationFactor: 0 },
      { age: 41, inflationFactor: -1 },
      { age: 42, inflationFactor: NaN },
      { age: 43, inflationFactor: Infinity },
    ]
    expect(factorAtAge(unusable, 41)).toBe(1)
  })

  it('FIRE-jaar-scenario: doelbedrag op de FIRE-leeftijd', () => {
    const projection: FactorRow[] = [
      { age: 35, inflationFactor: 1.0 },
      { age: 36, inflationFactor: 1.02 },
      { age: 37, inflationFactor: 1.0404 },
      { age: 38, inflationFactor: 1.0612 }, // FIRE-leeftijd
      { age: 39, inflationFactor: 1.0824 },
    ]
    const fireAge = 38
    expect(factorAtAge(projection, fireAge)).toBe(1.0612)
  })

  it('AOW-jaar-scenario: puntbedrag op een latere leeftijd', () => {
    const projection: FactorRow[] = [
      { age: 60, inflationFactor: 1.5 },
      { age: 65, inflationFactor: 1.65 },
      { age: 67, inflationFactor: 1.72 }, // AOW-leeftijd
      { age: 70, inflationFactor: 1.85 },
    ]
    const aowAge = 67
    expect(factorAtAge(projection, aowAge)).toBe(1.72)
  })
})

describe('euroViewLabel', () => {
  it("'nominal' geeft \"Toekomstige euro's\"", () => {
    expect(euroViewLabel('nominal')).toBe("Toekomstige euro's")
  })

  it("'real' geeft \"Huidige euro's\"", () => {
    expect(euroViewLabel('real')).toBe("Huidige euro's")
  })
})

/** Rij-vorm met één teller (`age`), één label (`phase`), één ratio en twee
 *  geldvelden — genoeg om te bewijzen dat alleen `moneyFields` wordt geraakt. */
interface DemoRow {
  age: number
  phase: string
  swr: number
  startPortfolio: number
  endPortfolio: number
}

function demoRows(): DemoRow[] {
  return [
    { age: 40, phase: 'opbouw', swr: 0.04, startPortfolio: 1000, endPortfolio: 1100 },
    { age: 41, phase: 'opbouw', swr: 0.04, startPortfolio: 1100, endPortfolio: 2200 },
  ]
}

/** age 40 → factor 1.0 (vandaag), age 41 → factor 2.0 (rond getal, exacte deling). */
const demoFactorByAge = buildFactorByAge([
  { age: 40, inflationFactor: 1 },
  { age: 41, inflationFactor: 2 },
])

describe('deflateRowsByAge', () => {
  it("T1 — 'nominal' geeft exact dezelfde array-referentie terug", () => {
    const rows = demoRows()
    const result = deflateRowsByAge(rows, demoFactorByAge, ['endPortfolio'], 'nominal')
    // Referentiegelijkheid, niet deep-equal: memo's in horizon-client.tsx
    // vergelijken op identiteit en zouden bij een kopie per render opnieuw
    // afvuren.
    expect(result).toBe(rows)
    expect(result[0]).toBe(rows[0])
  })

  it("T1 — 'nominal' is ook identiek bij een lege rijenlijst", () => {
    const rows: DemoRow[] = []
    expect(deflateRowsByAge(rows, demoFactorByAge, ['endPortfolio'], 'nominal')).toBe(rows)
  })

  it("T2 — 'real' deelt alleen de opgegeven moneyFields", () => {
    const rows = demoRows()
    const result = deflateRowsByAge(rows, demoFactorByAge, ['endPortfolio'], 'real')

    // age 41 heeft factor 2: alleen endPortfolio halveert.
    expect(result[1].endPortfolio).toBe(1100)
    expect(result[1].startPortfolio).toBe(1100) // niet in moneyFields → ongemoeid
    expect(result[1].swr).toBe(0.04) // ratio (klasse R) → nooit delen
    expect(result[1].age).toBe(41) // teller → nooit delen
    expect(result[1].phase).toBe('opbouw') // label → ongemoeid
  })

  it("T2 — meerdere geldvelden tegelijk delen door dezelfde rij-factor", () => {
    const rows = demoRows()
    const result = deflateRowsByAge(
      rows,
      demoFactorByAge,
      ['startPortfolio', 'endPortfolio'],
      'real',
    )
    expect(result[1].startPortfolio).toBe(550)
    expect(result[1].endPortfolio).toBe(1100)
  })

  it("'real' laat de invoer ongemoeid (geen mutatie van de bronrijen)", () => {
    const rows = demoRows()
    deflateRowsByAge(rows, demoFactorByAge, ['endPortfolio'], 'real')
    expect(rows[1].endPortfolio).toBe(2200)
  })

  it('AC-A2 — leeftijd ontbreekt in de map: bedrag ongewijzigd (factor 1)', () => {
    const rows: DemoRow[] = [
      { age: 99, phase: 'onttrekking', swr: 0.04, startPortfolio: 500, endPortfolio: 1000 },
    ]
    const result = deflateRowsByAge(rows, demoFactorByAge, ['endPortfolio'], 'real')
    expect(result[0].endPortfolio).toBe(1000)
  })

  it('AC-A5 — onbruikbare factoren (0, negatief, NaN, Infinity) laten het bedrag ongemoeid', () => {
    const rows: DemoRow[] = [
      { age: 1, phase: 'opbouw', swr: 0.04, startPortfolio: 0, endPortfolio: 1000 },
      { age: 2, phase: 'opbouw', swr: 0.04, startPortfolio: 0, endPortfolio: 1000 },
      { age: 3, phase: 'opbouw', swr: 0.04, startPortfolio: 0, endPortfolio: 1000 },
      { age: 4, phase: 'opbouw', swr: 0.04, startPortfolio: 0, endPortfolio: 1000 },
    ]
    // Rauwe map: buildFactorByAge filtert onbruikbare factoren al weg, dus die
    // route zou dit pad nooit raken. De helper moet zelfstandig standhouden.
    const rawFactors = new Map<number, number>([
      [1, 0],
      [2, -2],
      [3, NaN],
      [4, Infinity],
    ])
    const result = deflateRowsByAge(rows, rawFactors, ['endPortfolio'], 'real')
    expect(result.map((r) => r.endPortfolio)).toEqual([1000, 1000, 1000, 1000])
  })

  it("moneyFields = [] levert in 'real' tóch nieuwe objecten op", () => {
    // Zou de helper hier de invoer teruggeven, dan was een omgezette feed niet
    // te onderscheiden van een nominale en werd het merk betekenisloos.
    const rows = demoRows()
    const result = deflateRowsByAge(rows, demoFactorByAge, [], 'real')
    expect(result).not.toBe(rows)
    expect(result[0]).not.toBe(rows[0])
    expect(result[0]).toEqual(rows[0])
  })
})

describe('deflatePoints', () => {
  const points: [number, number][] = [
    [40, 1000],
    [41, 1000],
  ]

  it("T1 — 'nominal' geeft exact dezelfde array-referentie terug", () => {
    const input: [number, number][] = [[40, 1000]]
    const result = deflatePoints(input, demoFactorByAge, 'nominal')
    expect(result).toBe(input)
    expect(result[0]).toBe(input[0])
  })

  it("'real' deelt de waarde en laat de x-as ongemoeid", () => {
    const result = deflatePoints(points, demoFactorByAge, 'real')
    expect(result[0]).toEqual([40, 1000]) // factor 1.0
    expect(result[1]).toEqual([41, 500]) // factor 2.0
  })

  it('keyOf verschuift de sleutel naar het bronjaar (liquide-lijn plot op age + 1)', () => {
    // De liquide-vermogenslijn plot de waarde van leeftijd 40 op x = 41. Zonder
    // expliciete sleutel pakt de helper de factor van 41 en deflateert de lijn
    // een jaar te ver — het bedrag oogt plausibel, dus alleen deze test vangt
    // het verschil.
    const plotted: [number, number][] = [[41, 1000]]

    const metSleutel = deflatePoints(plotted, demoFactorByAge, 'real', (x) => x - 1)
    expect(metSleutel[0]).toEqual([41, 1000]) // factor van leeftijd 40 = 1.0

    const zonderSleutel = deflatePoints(plotted, demoFactorByAge, 'real')
    expect(zonderSleutel[0]).toEqual([41, 500]) // factor van leeftijd 41 = 2.0
  })

  it('ontbrekende of onbruikbare factor laat de waarde ongemoeid', () => {
    const rawFactors = new Map<number, number>([[50, 0]])
    const result = deflatePoints(
      [
        [50, 1000],
        [99, 1000],
      ],
      rawFactors,
      'real',
    )
    expect(result[0]).toEqual([50, 1000]) // factor 0 → ongemoeid
    expect(result[1]).toEqual([99, 1000]) // geen factor → ongemoeid
  })

  it("'real' levert nieuwe tupels op (invoer blijft ongemoeid)", () => {
    const input: [number, number][] = [[41, 1000]]
    const result = deflatePoints(input, demoFactorByAge, 'real')
    expect(result).not.toBe(input)
    expect(result[0]).not.toBe(input[0])
    expect(input[0]).toEqual([41, 1000])
  })
})

describe('deflateSeriesByOffset', () => {
  // Index = jaar-offset: 0 = vandaag (1.0), 1 = één jaar verder (2.0).
  const factorByOffset = [1, 2, 4]

  it("T1 — 'nominal' geeft exact dezelfde array-referentie terug", () => {
    const series = [1000, 2000, 4000]
    expect(deflateSeriesByOffset(series, factorByOffset, 'nominal')).toBe(series)
  })

  it("'real' deelt per index, niet per leeftijd", () => {
    const result = deflateSeriesByOffset([1000, 2000, 4000], factorByOffset, 'real')
    expect(result).toEqual([1000, 1000, 1000])
  })

  it('index 0 blijft gelijk (factor van vandaag is 1.0)', () => {
    const result = deflateSeriesByOffset([1234.56], factorByOffset, 'real')
    expect(result[0]).toBe(1234.56)
  })

  it('een kortere factorlijst laat de resterende waarden ongemoeid', () => {
    const result = deflateSeriesByOffset([1000, 2000, 4000], [1, 2], 'real')
    expect(result).toEqual([1000, 1000, 4000])
  })

  it('onbruikbare factor op een index laat alleen die waarde ongemoeid', () => {
    const result = deflateSeriesByOffset([1000, 2000, 4000], [1, 0, 4], 'real')
    expect(result).toEqual([1000, 2000, 1000])
  })
})

describe('buildFactorByOffset', () => {
  it('leest de factoren op volgorde; index 0 is vandaag (1.0)', () => {
    const rows: FactorRow[] = [
      { age: 40, inflationFactor: 1.0 },
      { age: 41, inflationFactor: 1.02 },
      { age: 42, inflationFactor: 1.0404 },
    ]
    const factors = buildFactorByOffset(rows)
    expect(factors).toEqual([1.0, 1.02, 1.0404])
    expect(factors[0]).toBe(1.0)
  })

  it('werkt ook wanneer de leeftijden niet die van de gebruiker zijn (partnerlijn)', () => {
    // Een partner van 32 heeft dezelfde jaar-offsets als een gebruiker van 40;
    // dát is precies waarom deze feeds op offset lopen en niet op leeftijd.
    const partnerRows: FactorRow[] = [
      { age: 32, inflationFactor: 1.0 },
      { age: 33, inflationFactor: 1.02 },
    ]
    expect(buildFactorByOffset(partnerRows)).toEqual([1.0, 1.02])
  })

  it('vervangt een onbruikbare factor door 1 zonder de index op te schuiven', () => {
    const rows: FactorRow[] = [
      { age: 40, inflationFactor: 1.0 },
      { age: 41, inflationFactor: 0 },
      { age: 42, inflationFactor: 1.0404 },
    ]
    // Wegfilteren zou jaar 42 op offset 1 zetten en de hele reeks stil een jaar
    // verkeerd deflateren.
    expect(buildFactorByOffset(rows)).toEqual([1.0, 1, 1.0404])
  })

  it('lege input geeft een lege lijst', () => {
    expect(buildFactorByOffset([])).toEqual([])
  })
})
