import { describe, it, expect } from 'vitest'
import { buildOwnAccountIdentifiers, normalizeIban } from './own-accounts'
import { resolveEigenRekeningBudgetId } from './budget-data'

describe('normalizeIban', () => {
  it('strips spaces and uppercases', () => {
    expect(normalizeIban('nl02 ingb 0001234567')).toBe('NL02INGB0001234567')
  })
})

describe('buildOwnAccountIdentifiers', () => {
  it('combines bank IBANs and rule IBANs into a normalized set', () => {
    const ids = buildOwnAccountIdentifiers(
      [{ match_type: 'iban', match_value: 'NL91ABNA0417164300', iban: 'NL91ABNA0417164300' }],
      ['nl02 ingb 0001234567', null, ''],
    )
    expect(ids.ibans.has('NL02INGB0001234567')).toBe(true)
    expect(ids.ibans.has('NL91ABNA0417164300')).toBe(true)
    expect(ids.ibans.size).toBe(2)
    expect(ids.namePatterns).toEqual([])
  })

  it('collects name rules as lowercase patterns', () => {
    const ids = buildOwnAccountIdentifiers(
      [
        { match_type: 'name', match_value: 'PayPal' },
        { match_type: 'name', match_value: 'Bitvavo' },
      ],
      [],
    )
    expect(ids.namePatterns).toEqual(['paypal', 'bitvavo'])
    expect(ids.ibans.size).toBe(0)
  })

  it('falls back to the iban column when match_value is absent', () => {
    const ids = buildOwnAccountIdentifiers([{ iban: 'NL02INGB0001234567' }], [])
    expect(ids.ibans.has('NL02INGB0001234567')).toBe(true)
  })

  it('ignores empty rule values', () => {
    const ids = buildOwnAccountIdentifiers([{ match_type: 'name', match_value: '   ' }], [])
    expect(ids.namePatterns).toEqual([])
  })
})

describe('resolveEigenRekeningBudgetId', () => {
  it('prefers the leaf sub-post', () => {
    const id = resolveEigenRekeningBudgetId([
      { id: 'parent', slug: 'eigen-rekening' },
      { id: 'sub', slug: 'eigen-rekening-sub' },
      { id: 'food', slug: 'boodschappen' },
    ])
    expect(id).toBe('sub')
  })

  it('falls back to the parent post when no sub exists', () => {
    const id = resolveEigenRekeningBudgetId([{ id: 'parent', slug: 'eigen-rekening' }])
    expect(id).toBe('parent')
  })

  it('returns null when no eigen-rekening post exists', () => {
    const id = resolveEigenRekeningBudgetId([{ id: 'food', slug: 'boodschappen' }])
    expect(id).toBeNull()
  })
})
