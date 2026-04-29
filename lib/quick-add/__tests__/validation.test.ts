/**
 * Unit tests voor de Zod-schemas in `lib/quick-add/validation.ts`.
 *
 * Dekt de boundary-checks die zowel client (blur/submit) als server action
 * delen: naam niet leeg, bedrag ≥ 0, asset_type in enum, en de discriminated
 * union op `kind`.
 */

import { describe, it, expect } from 'vitest'
import {
  AssetQuickInputSchema,
  QuickAddInputSchema,
} from '../validation'

describe('AssetQuickInputSchema', () => {
  it('parst een geldige input succesvol', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'savings',
      name: 'Spaarrekening',
      current_value: 1000,
      field3: 'ING',
    })
    expect(result.success).toBe(true)
  })

  it('weigert een lege naam', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'savings',
      name: '',
      current_value: 1000,
    })
    expect(result.success).toBe(false)
  })

  it('weigert een negatieve current_value', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'savings',
      name: 'Spaar',
      current_value: -10,
    })
    expect(result.success).toBe(false)
  })

  it('weigert een onbekend asset_type', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'unknown_type',
      name: 'X',
      current_value: 100,
    })
    expect(result.success).toBe(false)
  })
})

describe('QuickAddInputSchema', () => {
  it('weigert een ongeldige kind-waarde (discriminated union)', () => {
    const result = QuickAddInputSchema.safeParse({
      kind: 'nonsense',
      asset: { asset_type: 'savings', name: 'X', current_value: 100 },
    })
    expect(result.success).toBe(false)
  })
})
