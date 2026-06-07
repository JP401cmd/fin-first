import { describe, it, expect } from 'vitest'
import {
  BOX2_PARAMS,
  DGA_LENING_DREMPEL,
  calculateBox2,
  type Box2Input,
} from './box2-data'

/**
 * Snapshot- en sanity-tests voor de Box 2 aanmerkelijk-belang motor.
 *
 * Doel: de gecorrigeerde 2026-constanten vastleggen zodat een toekomstige
 * onbedoelde wijziging hier breekt, plus een minimale sanity-check op de
 * staffel-belasting en de Wet excessief lenen DGA.
 */

function makeInput(overrides: Partial<Box2Input>): Box2Input {
  return {
    deelnemingen: [],
    year: 2026,
    hasPartner: false,
    dailyExpenses: 0,
    ...overrides,
  }
}

describe('BOX2_PARAMS — snapshot 2026-constanten', () => {
  it('legt de gecorrigeerde 2026-waarden vast', () => {
    expect(BOX2_PARAMS[2026]).toEqual({
      tariefLaag: 0.245,
      tariefHoog: 0.31,
      grens: 68_843,
      grensPartner: 137_686,
    })
  })

  it('grensPartner is exact het dubbele van de single-grens (2026)', () => {
    expect(BOX2_PARAMS[2026].grensPartner).toBe(BOX2_PARAMS[2026].grens * 2)
  })

  it('DGA_LENING_DREMPEL is de wettelijke €500.000', () => {
    expect(DGA_LENING_DREMPEL).toBe(500_000)
  })
})

describe('calculateBox2 — staffeltarief sanity', () => {
  it('dividend onder de grens → alleen laag tarief, geen hoog deel', () => {
    const r = calculateBox2(
      makeInput({
        deelnemingen: [{ name: 'Holding BV', annual_dividend: 50_000, disposal_gain: 0 }],
      }),
    )
    expect(r.totalIncome).toBe(50_000)
    expect(r.taxLow).toBeCloseTo(50_000 * 0.245, 2)
    expect(r.taxHigh).toBe(0)
    expect(r.totalTax).toBeCloseTo(50_000 * 0.245, 2)
    expect(r.dgaExcessTax).toBe(0)
  })

  it('dividend boven de grens → laag deel op grens + hoog deel daarboven', () => {
    const grens = BOX2_PARAMS[2026].grens // 68_843
    const income = 100_000
    const r = calculateBox2(
      makeInput({
        deelnemingen: [{ name: 'Holding BV', annual_dividend: income, disposal_gain: 0 }],
      }),
    )
    expect(r.totalIncome).toBe(income)
    // taxLow/taxHigh worden in de bron op 2 decimalen afgerond.
    expect(r.taxLow).toBe(Math.round(grens * 0.245 * 100) / 100)
    expect(r.taxHigh).toBeGreaterThan(0)
    expect(r.taxHigh).toBe(Math.round((income - grens) * 0.31 * 100) / 100)
    expect(r.totalTax).toBe(
      Math.round((grens * 0.245 + (income - grens) * 0.31) * 100) / 100,
    )
  })

  it('fiscaal partner verschuift het omslagpunt naar de verdubbelde grens', () => {
    const income = 100_000 // < grensPartner (137_686), > grens (68_843)
    const single = calculateBox2(
      makeInput({
        deelnemingen: [{ name: 'BV', annual_dividend: income, disposal_gain: 0 }],
      }),
    )
    const metPartner = calculateBox2(
      makeInput({
        hasPartner: true,
        deelnemingen: [{ name: 'BV', annual_dividend: income, disposal_gain: 0 }],
      }),
    )
    // Met partner valt alles in de lage schijf → geen hoog tarief, dus minder belasting.
    expect(metPartner.taxHigh).toBe(0)
    expect(single.taxHigh).toBeGreaterThan(0)
    expect(metPartner.totalTax).toBeLessThan(single.totalTax)
  })
})

describe('calculateBox2 — Wet excessief lenen DGA', () => {
  it('lening onder de drempel → geen excess en geen extra belasting', () => {
    const r = calculateBox2(
      makeInput({
        deelnemingen: [{ name: 'BV', annual_dividend: 10_000, disposal_gain: 0 }],
        dgaLeningenTotal: 400_000,
      }),
    )
    expect(r.dgaLeningenDrempel).toBe(DGA_LENING_DREMPEL)
    expect(r.dgaLeningenExcess).toBe(0)
    expect(r.dgaExcessTax).toBe(0)
    expect(r.totalTaxInclDga).toBeCloseTo(r.totalTax, 2)
  })

  it('lening > €500k → dgaExcessTax > 0 en verhoogt totalTaxInclDga', () => {
    const lening = 800_000
    const r = calculateBox2(
      makeInput({
        deelnemingen: [{ name: 'BV', annual_dividend: 0, disposal_gain: 0 }],
        dgaLeningenTotal: lening,
      }),
    )
    expect(r.dgaLeningenExcess).toBe(lening - DGA_LENING_DREMPEL) // 300_000
    expect(r.dgaExcessTax).toBeGreaterThan(0)
    expect(r.totalTaxInclDga).toBeCloseTo(r.totalTax + r.dgaExcessTax, 2)
    // Excess van 300k valt geheel binnen de lage schijf (< 68_843? nee, > grens):
    // grens 68_843 @ 24,5% + (300_000 - 68_843) @ 31%.
    const grens = BOX2_PARAMS[2026].grens
    const verwacht =
      Math.round((grens * 0.245 + (300_000 - grens) * 0.31) * 100) / 100
    expect(r.dgaExcessTax).toBeCloseTo(verwacht, 2)
  })
})
