/**
 * Tests for lib/lever-mapping.ts
 *
 * Verifies the mapping from recommendation type-tags to the 4 levers:
 *   - assets (bezittingen)
 *   - debts (schulden)
 *   - cashflow
 *   - tax (belasting)
 */
import { describe, it, expect } from 'vitest'
import { tagToLever, tagsToLevers, isLever, LEVER_LABELS } from '@/lib/lever-mapping'
import type { LeverId } from '@/lib/lever-mapping'

describe('lever-mapping', () => {
  describe('tagToLever — exact matches', () => {
    it('budget_optimization → cashflow', () => {
      expect(tagToLever('budget_optimization')).toBe('cashflow')
    })

    it('debt_acceleration → debts (schulden)', () => {
      expect(tagToLever('debt_acceleration')).toBe('debts')
    })

    it('asset_reallocation → assets (bezittingen)', () => {
      expect(tagToLever('asset_reallocation')).toBe('assets')
    })

    it('income_increase → cashflow', () => {
      expect(tagToLever('income_increase')).toBe('cashflow')
    })

    it('savings_boost → cashflow', () => {
      expect(tagToLever('savings_boost')).toBe('cashflow')
    })
  })

  describe('tagToLever — prefix matches (wildcard)', () => {
    it('investment_* → assets (bezittingen)', () => {
      expect(tagToLever('investment_diversificatie')).toBe('assets')
      expect(tagToLever('investment_xyz')).toBe('assets')
      expect(tagToLever('investment_rendement')).toBe('assets')
    })

    it('tax_* → tax (belasting)', () => {
      expect(tagToLever('tax_box3')).toBe('tax')
      expect(tagToLever('tax_optimalisatie')).toBe('tax')
      expect(tagToLever('tax_planning')).toBe('tax')
    })

    it('debt_* → debts (via prefix)', () => {
      expect(tagToLever('debt_consolidation')).toBe('debts')
      expect(tagToLever('debt_refinance')).toBe('debts')
    })

    it('budget_* → cashflow (via prefix)', () => {
      expect(tagToLever('budget_slash')).toBe('cashflow')
    })

    it('income_* → cashflow (via prefix)', () => {
      expect(tagToLever('income_side_hustle')).toBe('cashflow')
    })

    it('savings_* → cashflow (via prefix)', () => {
      expect(tagToLever('savings_automation')).toBe('cashflow')
    })
  })

  describe('tagToLever — fallback for unknown tags', () => {
    it('unknown tags fall back to cashflow', () => {
      expect(tagToLever('completely_unknown')).toBe('cashflow')
      expect(tagToLever('')).toBe('cashflow')
      expect(tagToLever('xyz')).toBe('cashflow')
    })
  })

  describe('tagsToLevers — batch unique mapping', () => {
    it('returns unique levers for multiple tags', () => {
      const result = tagsToLevers([
        'budget_optimization',
        'debt_acceleration',
        'income_increase', // same lever as budget_optimization
      ])
      expect(result).toEqual(['cashflow', 'debts'])
    })

    it('handles empty array', () => {
      expect(tagsToLevers([])).toEqual([])
    })
  })

  describe('isLever — type check', () => {
    it('returns true for matching lever', () => {
      expect(isLever('budget_optimization', 'cashflow')).toBe(true)
      expect(isLever('debt_acceleration', 'debts')).toBe(true)
      expect(isLever('tax_box3', 'tax')).toBe(true)
    })

    it('returns false for non-matching lever', () => {
      expect(isLever('budget_optimization', 'assets')).toBe(false)
      expect(isLever('debt_acceleration', 'cashflow')).toBe(false)
    })
  })

  describe('LEVER_LABELS — Dutch labels', () => {
    it('has labels for all 4 levers', () => {
      const levers: LeverId[] = ['assets', 'debts', 'cashflow', 'tax']
      for (const lever of levers) {
        expect(LEVER_LABELS[lever]).toBeDefined()
        expect(typeof LEVER_LABELS[lever]).toBe('string')
      }
    })

    it('labels are in Dutch', () => {
      expect(LEVER_LABELS.assets).toBe('Bezittingen')
      expect(LEVER_LABELS.debts).toBe('Schulden')
      expect(LEVER_LABELS.cashflow).toBe('Cashflow')
      expect(LEVER_LABELS.tax).toBe('Belasting')
    })
  })
})
