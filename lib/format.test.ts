import { describe, it, expect } from 'vitest'
import {
  dailyExpenseRate,
  calculateFreedomTime,
  formatFreedomTimeString,
} from './format'

describe('dailyExpenseRate — canonieke dagtarief-conversie', () => {
  it('rekent maanduitgaven × 12 / 365 (jaar/365-grondslag)', () => {
    // €3000/maand → €36.000/jaar → /365 = €98,63/dag
    expect(dailyExpenseRate(3000)).toBeCloseTo((3000 * 12) / 365, 10)
    expect(dailyExpenseRate(3000)).toBeCloseTo(98.6301, 3)
  })

  it('wijkt bewust af van de oude /30-basis (= jaar/360, ~1,4% té laag)', () => {
    const monthly = 3000
    const canonical = dailyExpenseRate(monthly) // €98,63/dag
    const oude30 = monthly / 30 // €100/dag (impliciet 360-dagenjaar)
    expect(canonical).toBeLessThan(oude30)
    // 365/360 − 1 ≈ 1,389% afwijking
    expect(oude30 / canonical - 1).toBeCloseTo(365 / 360 - 1, 6)
  })

  it('is gelijk aan jaaruitgaven / 365 (consistent met calculateFreedomTime-input)', () => {
    const monthly = 2500
    const yearly = monthly * 12
    expect(dailyExpenseRate(monthly)).toBeCloseTo(yearly / 365, 10)
  })

  it('geeft 0 voor niet-positieve of niet-eindige input', () => {
    expect(dailyExpenseRate(0)).toBe(0)
    expect(dailyExpenseRate(-100)).toBe(0)
    expect(dailyExpenseRate(NaN)).toBe(0)
    expect(dailyExpenseRate(Infinity)).toBe(0)
    // @ts-expect-error — runtime-safety voor undefined
    expect(dailyExpenseRate(undefined)).toBe(0)
  })

  it('voedt calculateFreedomTime zodat een maand vermogen ~30 vrijheidsdagen geeft', () => {
    // Vermogen = één maand uitgaven → ~30,4 dagen (jaar/365 ÷ 12 maanden)
    const monthly = 3000
    const rate = dailyExpenseRate(monthly)
    const bd = calculateFreedomTime(monthly, rate)
    // 3000 / 98,63 = 30,42 dagen → net over de 30-dagen-maandgrens
    expect(bd.totalDays).toBeCloseTo(30.4, 1)
    expect(formatFreedomTimeString(bd)).toBe('1 maand')
  })
})
