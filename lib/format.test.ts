import { describe, it, expect } from 'vitest'
import {
  dailyExpenseRate,
  calculateFreedomTime,
  formatFreedomTimeString,
  formatWithFreedom,
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

describe('formatFreedomTimeString — includeDays:false liegt niet met "0 dagen" (sub-maand)', () => {
  // BUG: de tekort-lening-banner op /toekomst gaf `includeDays: false` mee. Bij een
  // POSITIEVE piek die minder dan één maand vrijheid vertegenwoordigt (bv. €3.342 ≈
  // 30 dagen) bleef `parts` leeg en viel de functie terug op "0 dagen" — een leugen,
  // want een positief bedrag = altijd > 0 dagen. `includeDays` mag alleen sub-maand-
  // dagen weglaten als er ánders óók een eenheid overblijft; hier zijn dagen de enige.
  it('long: 28 dagen met includeDays=false → "28 dagen" (niet "0 dagen")', () => {
    const bd = calculateFreedomTime(2800, 100) // 28 dagen exact
    expect(bd).toMatchObject({ years: 0, months: 0, days: 28 })
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('28 dagen')
  })

  it('short: 28 dagen met includeDays=false → "28d" (niet "0d")', () => {
    const bd = calculateFreedomTime(2800, 100)
    expect(formatFreedomTimeString(bd, 'short', false)).toBe('28d')
  })

  it('long: 1 dag met includeDays=false → "1 dag" (enkelvoud, niet "0 dagen")', () => {
    const bd = calculateFreedomTime(100, 100) // 1 dag
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('1 dag')
  })

  it('echt nul blijft "0 dagen" (0 euro = 0 dagen, geen regressie)', () => {
    const bd = calculateFreedomTime(0, 100)
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('0 dagen')
    expect(formatFreedomTimeString(bd, 'short', false)).toBe('0d')
  })

  it('≥1 maand blijft ongewijzigd door includeDays=false (dagen sowieso onderdrukt)', () => {
    const bd = calculateFreedomTime(9000, 100) // 90 dagen → 3 maanden
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('3 maanden')
  })
})

describe('formatWithFreedom — deficit-loan-banner scenario (includeDays:false)', () => {
  // Reproduceert de gemelde banner: piek €3.342, includeCurrency:false, includeDays:false.
  // Vóór de fix: "0 dagen". Ná de fix: het werkelijke aantal dagen vrijheid.
  it('positieve sub-maand-piek → dagen i.p.v. "0 dagen"', () => {
    // dagtarief zo gekozen dat €3.342 < 1 maand vrijheid is (dRate €120/dag → 27,85 dagen)
    const out = formatWithFreedom(3342, 120, {
      includeCurrency: false,
      format: 'long',
      includeDays: false,
    })
    expect(out).not.toBe('0 dagen')
    expect(out).toMatch(/dag/)
  })
})
