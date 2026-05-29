import { describe, it, expect } from 'vitest'
import {
  suggestPublicDefault,
  suggestAllPublicDefaults,
} from './suggest-public-default'
import type { CalculatorDefinition } from './types'

describe('suggestPublicDefault — euro', () => {
  it('rondt grote bedragen af op nice numbers (1/2/5 × 10^n)', () => {
    // 321500 ligt het dichtst bij 3×10^5 = 300_000 (niet 5×10^5 = 500_000).
    expect(suggestPublicDefault(321500, 'euro')).toBe(300000)
    // 1247 ligt het dichtst bij 1×10^3 = 1_000.
    expect(suggestPublicDefault(1247, 'euro')).toBe(1000)
    // 50892 ligt het dichtst bij 5×10^4 = 50_000.
    expect(suggestPublicDefault(50892, 'euro')).toBe(50000)
  })

  it('behandelt nul en kleine waarden', () => {
    expect(suggestPublicDefault(0, 'euro')).toBe(0)
    // 85 → mantissa 8.5 → Math.round → 9 → 9 × 10^1 = 90.
    // (Math.round in JS rondt .5 naar boven richting +∞ voor positieve waarden.)
    expect(suggestPublicDefault(85, 'euro')).toBe(90)
  })
})

describe('suggestPublicDefault — percent', () => {
  it('rondt fractie af op 1 decimaal van procent', () => {
    // 0.0213 → 2.13% → 2% → 0.02
    expect(suggestPublicDefault(0.0213, 'percent')).toBe(0.02)
    // 0.0567 → 5.67% → 6% → 0.06
    expect(suggestPublicDefault(0.0567, 'percent')).toBe(0.06)
  })
})

describe('suggestPublicDefault — years', () => {
  it('rondt af op veelvoud van 5', () => {
    expect(suggestPublicDefault(22, 'years')).toBe(20)
    expect(suggestPublicDefault(33, 'years')).toBe(35)
    expect(suggestPublicDefault(47, 'years')).toBe(45)
  })
})

describe('suggestPublicDefault — number', () => {
  it('rondt af op 1-2 significante cijfers', () => {
    // 123 → 1 sig fig → 100
    expect(suggestPublicDefault(123, 'number')).toBe(100)
    // 4.7 → 2 sig fig → 4.7 (al netjes)
    expect(suggestPublicDefault(4.7, 'number')).toBe(4.7)
  })
})

describe('suggestAllPublicDefaults', () => {
  it('mapt alle inputs naar suggesties', () => {
    const def: Pick<CalculatorDefinition, 'inputs'> = {
      inputs: [
        { key: 'saldo', label: 'Saldo', kind: 'euro', default: 321500 },
        { key: 'rente', label: 'Rente', kind: 'percent', default: 0.0213 },
        { key: 'looptijd', label: 'Looptijd', kind: 'years', default: 22 },
      ],
    }
    const out = suggestAllPublicDefaults(def)
    expect(out.saldo).toBe(300000)
    expect(out.rente).toBe(0.02)
    expect(out.looptijd).toBe(20)
  })
})
