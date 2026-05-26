import { describe, it, expect } from 'vitest'
import {
  evaluateCalculator,
  resolveInitialInputs,
  validateFormulas,
} from './evaluate'
import type { CalculatorDefinition } from './types'
import { PREFILL_KEY_SET } from './user-data-keys'

function def(overrides: Partial<CalculatorDefinition> = {}): CalculatorDefinition {
  return {
    name: 'Test',
    inputs: [{ key: 'inleg', label: 'Inleg', kind: 'euro', default: 1000 }],
    scenarios: [{ key: 'a', label: 'A' }],
    outputs: [
      { key: 'uit', label: 'Uitkomst', formula: 'inleg * 2', format: 'euro' },
    ],
    assumptions: [],
    ...overrides,
  }
}

describe('evaluateCalculator — basis', () => {
  it('evalueert simpele formule met input', () => {
    const r = evaluateCalculator(def(), { inleg: 1000 }, {})
    expect(r.values.a.uit).toBe(2000)
    expect(r.errors).toEqual([])
  })

  it('gebruikt prefill-waarden in formules', () => {
    const d = def({
      outputs: [{ key: 'uit', label: 'U', formula: 'net_worth + inleg', format: 'euro' }],
    })
    const r = evaluateCalculator(d, { inleg: 500 }, { net_worth: 200000 })
    expect(r.values.a.uit).toBe(200500)
  })

  it('whitelisted compound() werkt', () => {
    const d = def({
      outputs: [{ key: 'fv', label: 'FV', formula: 'compound(inleg, 0.07, 10)', format: 'euro' }],
    })
    const r = evaluateCalculator(d, { inleg: 1000 }, {})
    expect(Math.round(r.values.a.fv!)).toBe(1967)
  })

  it('annuity() berekent maandlast', () => {
    const d = def({
      outputs: [{ key: 'm', label: 'M', formula: 'annuity(200000, 0.04, 30)', format: 'euro' }],
    })
    const r = evaluateCalculator(d, {}, {})
    // €200k, 4%, 30 jaar ≈ €955/mnd
    expect(Math.round(r.values.a.m!)).toBeGreaterThan(940)
    expect(Math.round(r.values.a.m!)).toBeLessThan(970)
  })

  it('if(cond,a,b) en scenario-string werken', () => {
    const d = def({
      scenarios: [
        { key: 'aflossen', label: 'Aflossen' },
        { key: 'beleggen', label: 'Beleggen' },
      ],
      outputs: [
        {
          key: 'res',
          label: 'R',
          formula: 'if(scenario == "beleggen", compound(inleg, 0.07, 10), inleg)',
          format: 'euro',
        },
      ],
    })
    const r = evaluateCalculator(d, { inleg: 1000 }, {})
    expect(r.values.aflossen.res).toBe(1000)
    expect(Math.round(r.values.beleggen.res!)).toBe(1967)
  })
})

describe('evaluateCalculator — winnaar-bepaling', () => {
  it('kiest hoogste bij betterDirection higher', () => {
    const d = def({
      scenarios: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      outputs: [
        { key: 'uit', label: 'U', formula: 'if(scenario == "b", 2000, 1000)', format: 'euro' },
      ],
      compare: { outputKey: 'uit', betterDirection: 'higher' },
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.winner).toBe('b')
  })

  it('kiest laagste bij betterDirection lower', () => {
    const d = def({
      scenarios: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      outputs: [
        { key: 'kosten', label: 'K', formula: 'if(scenario == "a", 500, 800)', format: 'euro' },
      ],
      compare: { outputKey: 'kosten', betterDirection: 'lower' },
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.winner).toBe('a')
  })
})

describe('evaluateCalculator — veiligheid', () => {
  it('blokkeert toegang tot process/global', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'process', format: 'number' }],
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.values.a.x).toBeNull()
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('blokkeert constructor-escape', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'constructor', format: 'number' }],
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.values.a.x).toBeNull()
  })

  it('vangt onzin-formule netjes af', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'inleg +* 2', format: 'number' }],
    })
    const r = evaluateCalculator(d, { inleg: 1 }, {})
    expect(r.values.a.x).toBeNull()
    expect(r.errors.length).toBe(1)
  })

  it('NaN/Infinity → null met fout', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'inleg / 0', format: 'number' }],
    })
    const r = evaluateCalculator(d, { inleg: 1 }, {})
    expect(r.values.a.x).toBeNull()
  })
})

describe('resolveInitialInputs', () => {
  it('gebruikt prefill als beschikbaar, anders default', () => {
    const d = def({
      inputs: [
        { key: 'schuld', label: 'Schuld', kind: 'euro', default: 100000, prefill: 'mortgage_balance' },
        { key: 'rente', label: 'Rente', kind: 'percent', default: 0.04 },
      ],
    })
    const init = resolveInitialInputs(d, { mortgage_balance: 250000 })
    expect(init.schuld).toBe(250000)
    expect(init.rente).toBe(0.04)
  })

  it('valt terug op default als prefill-key ontbreekt in data', () => {
    const d = def({
      inputs: [
        { key: 'schuld', label: 'S', kind: 'euro', default: 100000, prefill: 'mortgage_balance' },
      ],
    })
    const init = resolveInitialInputs(d, {})
    expect(init.schuld).toBe(100000)
  })
})

describe('validateFormulas', () => {
  it('geen onbekende namen → leeg', () => {
    const d = def({
      outputs: [{ key: 'u', label: 'U', formula: 'inleg * net_worth', format: 'euro' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toEqual([])
  })

  it('detecteert onbekende variabele', () => {
    const d = def({
      outputs: [{ key: 'u', label: 'U', formula: 'inleg * verzonnen_key', format: 'euro' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toContain('verzonnen_key')
  })

  it('whitelisted fns + scenario tellen als bekend', () => {
    const d = def({
      outputs: [{ key: 'u', label: 'U', formula: 'if(scenario == "a", compound(inleg, 0.05, 5), 0)', format: 'euro' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toEqual([])
  })
})
