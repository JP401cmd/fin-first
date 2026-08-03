import { describe, it, expect } from 'vitest'
import { extractTextFigures, guardFigures } from './figure-guard'

describe('extractTextFigures', () => {
  it('leest NL-genoteerde bedragen (duizendpunt, decimale komma)', () => {
    expect(extractTextFigures('Je vermogen groeide naar €85.000 en je legde €1.234,50 in.')).toEqual([
      85000, 1234.5,
    ])
  })

  it('leest "euro"-suffix en percentages', () => {
    expect(extractTextFigures('Je zette 2.500 euro opzij, een spaarquote van 23,4%.')).toEqual([
      2500, 23.4,
    ])
  })

  it('geeft een lege lijst bij tekst zonder cijfers', () => {
    expect(extractTextFigures('Je zette een mooie stap richting vrijheid.')).toEqual([])
  })
})

describe('guardFigures', () => {
  const allowed = [85000, 3.4, 23.4, 2500]

  it('laat exacte cijfers door', () => {
    expect(guardFigures('Je vermogen staat op €85.000 (+3,4%).', allowed).ok).toBe(true)
  })

  it('laat netjes afgeronde cijfers door (0,5%-marge)', () => {
    // €85.000 → "ruim €85.000"; 23,4% → "23%"
    expect(guardFigures('Ruim €85.000 en een spaarquote van 23%.', allowed).ok).toBe(true)
  })

  it('VERWERPT een verzonnen bedrag', () => {
    const res = guardFigures('Je vermogen groeide naar €120.000 dit jaar.', allowed)
    expect(res.ok).toBe(false)
    expect(res.offending).toEqual([120000])
  })

  it('VERWERPT een doorgerekend getal dat niet is meegegeven', () => {
    // 85.000 − 2.500 = 82.500: plausibel, maar nergens meegegeven.
    const res = guardFigures('Er bleef €82.500 over.', allowed)
    expect(res.ok).toBe(false)
    expect(res.offending).toEqual([82500])
  })

  it('is teken-ongevoelig: een daling van 3,4% telt als 3,4', () => {
    expect(guardFigures('Een daling van -3,4% deze periode.', allowed).ok).toBe(true)
  })

  it('accepteert tekst zonder cijfers', () => {
    expect(guardFigures('Een stevige stap richting vrijheid.', allowed).ok).toBe(true)
  })
})
