/**
 * Unit tests for fund-alternatives.ts
 *
 * Feature #386 — Goedkopere alternatieven database
 */
import { describe, it, expect } from 'vitest'
import {
  FUND_MAPPINGS,
  LAATST_BIJGEWERKT,
  FUND_ALTERNATIVES_DISCLAIMER,
  findAlternatives,
  findByCategory,
  berekenJaarlijkseBesparing,
  type FundMapping,
  type Alternative,
} from '@/lib/fund-alternatives'

describe('fund-alternatives', () => {
  describe('FUND_MAPPINGS data', () => {
    it('bevat minstens 20 fondsen', () => {
      expect(FUND_MAPPINGS.length).toBeGreaterThanOrEqual(20)
    })

    it('elk fonds heeft geldige structuur', () => {
      for (const fund of FUND_MAPPINGS) {
        expect(fund.isin).toBeTruthy()
        expect(fund.name).toBeTruthy()
        expect(fund.ter).toBeGreaterThan(0)
        expect(fund.category).toBeTruthy()
        expect(fund.alternatives.length).toBeGreaterThanOrEqual(1)

        for (const alt of fund.alternatives) {
          expect(alt.isin).toBeTruthy()
          expect(alt.name).toBeTruthy()
          expect(alt.ter).toBeGreaterThan(0)
          expect(alt.provider).toBeTruthy()
          expect(alt.note).toBeTruthy()
        }
      }
    })

    it('alternatieven zijn goedkoper dan het origineel', () => {
      for (const fund of FUND_MAPPINGS) {
        for (const alt of fund.alternatives) {
          expect(alt.ter).toBeLessThan(fund.ter)
        }
      }
    })

    it('bevat fondsen uit alle vereiste categorieën', () => {
      const categories = new Set(FUND_MAPPINGS.map((f) => f.category))
      expect(categories.has('wereld-aandelen')).toBe(true)
      expect(categories.has('europa-aandelen')).toBe(true)
      expect(categories.has('obligaties')).toBe(true)
      expect(categories.has('vastgoed')).toBe(true)
      expect(categories.has('opkomende-markten')).toBe(true)
    })
  })

  describe('constants', () => {
    it('LAATST_BIJGEWERKT is een datum string', () => {
      expect(LAATST_BIJGEWERKT).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('FUND_ALTERNATIVES_DISCLAIMER bevat waarschuwing', () => {
      expect(FUND_ALTERNATIVES_DISCLAIMER).toContain('geen beleggingsadvies')
      expect(FUND_ALTERNATIVES_DISCLAIMER).toContain(LAATST_BIJGEWERKT)
    })
  })

  describe('findAlternatives()', () => {
    it('vindt fonds op exacte ISIN', () => {
      const results = findAlternatives({ isin: 'NL0006311771' })
      expect(results).toHaveLength(1)
      expect(results[0].fund.name).toBe('ABN AMRO Wereld Aandelen Fonds')
      expect(results[0].alternatives.length).toBeGreaterThanOrEqual(1)
    })

    it('ISIN match is case-insensitive', () => {
      const results = findAlternatives({ isin: 'nl0006311771' })
      expect(results).toHaveLength(1)
      expect(results[0].fund.name).toBe('ABN AMRO Wereld Aandelen Fonds')
    })

    it('vindt fonds op naam (fuzzy/includes)', () => {
      const results = findAlternatives({ name: 'ABN AMRO Wereld' })
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].fund.name).toContain('ABN AMRO')
    })

    it('naam match is case-insensitive', () => {
      const results = findAlternatives({ name: 'abn amro wereld' })
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('retourneert lege array als niets gevonden', () => {
      const results = findAlternatives({ isin: 'XX0000000000' })
      expect(results).toHaveLength(0)
    })

    it('retourneert lege array bij lege input', () => {
      const results = findAlternatives({})
      expect(results).toHaveLength(0)
    })

    it('besparingBps is correct berekend', () => {
      const results = findAlternatives({ isin: 'NL0006311771' })
      expect(results).toHaveLength(1)
      // ABN Wereld = 1.15%, goedkoopste alt = 0.15% NT → verschil = 100 bps
      expect(results[0].besparingBps).toBe(100)
    })
  })

  describe('findByCategory()', () => {
    it('retourneert fondsen in een categorie', () => {
      const results = findByCategory('obligaties')
      expect(results.length).toBeGreaterThanOrEqual(1)
      for (const fund of results) {
        expect(fund.category).toBe('obligaties')
      }
    })

    it('retourneert lege array voor onbekende categorie', () => {
      const results = findByCategory('nonexistent' as any)
      expect(results).toHaveLength(0)
    })
  })

  describe('berekenJaarlijkseBesparing()', () => {
    it('berekent besparing correct', () => {
      // 1.15% - 0.15% = 1.00% verschil op €100.000 = €1.000
      const besparing = berekenJaarlijkseBesparing(1.15, 0.15, 100000)
      expect(besparing).toBe(1000)
    })

    it('retourneert 0 als alternatief duurder is', () => {
      const besparing = berekenJaarlijkseBesparing(0.10, 0.20, 100000)
      expect(besparing).toBe(0)
    })

    it('retourneert 0 als TER gelijk is', () => {
      const besparing = berekenJaarlijkseBesparing(0.20, 0.20, 100000)
      expect(besparing).toBe(0)
    })
  })
})
