import { describe, it, expect } from 'vitest'
import { Parser } from './safe-eval'

const parser = new Parser()
const ev = (formula: string, scope: Record<string, unknown> = {}) =>
  parser.parse(formula).evaluate(scope)
const vars = (formula: string) => parser.parse(formula).variables({ withMembers: false })

describe('safe-eval — rekenkundige basis', () => {
  it('respecteert operator-precedentie en haakjes', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('10 - 2 - 3')).toBe(5) // links-assoc
    expect(ev('2 ^ 3 ^ 2')).toBe(512) // rechts-assoc
    expect(ev('-2 ^ 2')).toBe(-4) // unary minus losser dan ^
    expect(ev('7 % 3')).toBe(1)
  })

  it('verwerkt decimalen en wetenschappelijke notatie', () => {
    expect(ev('0.5 + .25')).toBe(0.75)
    expect(ev('1e3')).toBe(1000)
    expect(ev('2.5e-1')).toBe(0.25)
  })

  it('lost variabelen op uit de scope', () => {
    expect(ev('a * b + c', { a: 2, b: 3, c: 4 })).toBe(10)
  })

  it('kent constanten PI en E', () => {
    expect(ev('PI')).toBeCloseTo(Math.PI)
    expect(ev('E')).toBeCloseTo(Math.E)
  })
})

describe('safe-eval — vergelijkingen, logica, ternair', () => {
  it('vergelijkt strikt (===) op getallen en strings', () => {
    expect(ev('1 == 1')).toBe(true)
    expect(ev('1 != 2')).toBe(true)
    expect(ev('s == "beleggen"', { s: 'beleggen' })).toBe(true)
    expect(ev('s == "x"', { s: 'beleggen' })).toBe(false)
    expect(ev('3 <= 3')).toBe(true)
    expect(ev('4 > 5')).toBe(false)
  })

  it('and/or/not en symbolische varianten', () => {
    expect(ev('1 and 0')).toBe(false)
    expect(ev('1 or 0')).toBe(true)
    expect(ev('not 0')).toBe(true)
    expect(ev('1 && 1')).toBe(true)
    expect(ev('0 || 1')).toBe(true)
    expect(ev('!0')).toBe(true)
  })

  it('ternair ? : werkt en evalueert lui', () => {
    expect(ev('1 > 0 ? 10 : 20')).toBe(10)
    expect(ev('1 < 0 ? 10 : 20')).toBe(20)
    // niet-genomen tak met onbekende var mag niet crashen (lazy)
    expect(ev('1 > 0 ? 5 : onbekend')).toBe(5)
  })
})

describe('safe-eval — functies', () => {
  it('scope-functies (WHITELIST) winnen van built-ins', () => {
    const scope = {
      if: (c: number, a: number, b: number) => (c ? a : b),
      max: Math.max,
      x: 3,
    }
    expect(ev('if(x > 2, 100, 200)', scope)).toBe(100)
    expect(ev('max(x, 10)', scope)).toBe(10)
  })

  it('built-in log = natuurlijke logaritme (Math.log)', () => {
    expect(ev('log(E)')).toBeCloseTo(1)
    // change-of-base: ratio van twee logs is basis-onafhankelijk
    expect(ev('log(8) / log(2)')).toBeCloseTo(3)
    expect(ev('log10(1000)')).toBeCloseTo(3)
    expect(ev('sqrt(16)')).toBe(4)
    expect(ev('round(2.6)')).toBe(3)
  })

  it('gooit bij onbekende functie', () => {
    expect(() => ev('verzonnen(1)')).toThrow()
  })
})

describe('safe-eval — variables() sluit built-ins/consts uit', () => {
  it('telt gewone variabelen, niet built-in functies', () => {
    // log, max, if, pow zijn built-in → niet in variables; net_worth/inleg wel
    expect(vars('max(net_worth, inleg) + log(inleg)').sort()).toEqual(
      ['inleg', 'net_worth'].sort(),
    )
  })

  it('niet-built-in functienamen tellen WEL mee', () => {
    // compound is geen built-in (komt uit WHITELIST_FNS-scope) → moet erin
    expect(vars('compound(inleg, 0.05, 5)')).toContain('compound')
    expect(vars('compound(inleg, 0.05, 5)')).toContain('inleg')
  })

  it('PI/E tellen niet als variabele', () => {
    expect(vars('PI * r ^ 2')).toEqual(['r'])
  })
})

describe('safe-eval — veiligheid (sandbox-escape onmogelijk)', () => {
  it('member-access is een parse-fout', () => {
    expect(() => parser.parse('s.constructor.constructor("x")()')).toThrow()
    expect(() => parser.parse('s.constructor')).toThrow()
  })

  it('bracket-index is een parse-fout', () => {
    expect(() => parser.parse('s["constructor"]')).toThrow()
  })

  it('assignment is een parse-fout', () => {
    expect(() => parser.parse('x = 1')).toThrow()
  })

  it('overgeërfde namen resolven niet (hasOwnProperty-only)', () => {
    // constructor / __proto__ / toString zitten op Object.prototype, niet als
    // own-property → moeten "undefined variable/function" gooien.
    expect(() => ev('constructor', { s: 'x' })).toThrow()
    expect(() => ev('__proto__', { s: 'x' })).toThrow()
    expect(() => ev('toString()', { s: 'x' })).toThrow()
    expect(() => ev('hasOwnProperty("x")', { s: 'x' })).toThrow()
  })

  it('vervuilt het globale prototype niet', () => {
    try {
      ev('constructor("x")')
    } catch {
      /* verwacht: undefined function */
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
