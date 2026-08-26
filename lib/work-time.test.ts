import { describe, it, expect } from 'vitest'
import {
  calculateWorkTime,
  formatWorkTimeString,
  EMPTY_WORK_TIME,
} from '@/lib/work-time'
import { dailyIncomeRate } from '@/lib/income-rate'
import { WORK_YEAR_MONTHS, WORK_TIME_DISPLAY_MAX_MONTHS } from '@/lib/constants'

/**
 * Bevinding C5 (UX-testpanel, 24-08-2026): /overzicht/belasting claimde
 * "9 maanden per jaar" en /overzicht/cashflow/vaste-lasten "9 maanden" — samen
 * ACHTTIEN maanden per jaar. Oorzaak: beide deelden op het UITGAVEN-dagtarief
 * (vrijheidstijd) terwijl de tekst een deel van het WERKJAAR beloofde.
 *
 * De cijfers hieronder komen uit de PDF-bevinding: bruto jaarinkomen afgeleid
 * uit de belasting (€34.144) bij een effectief tarief van 36,6% → €93.290.
 */
const GROSS_YEARLY = 93_290
const DAILY_INCOME = dailyIncomeRate(GROSS_YEARLY)
const BELASTING_PER_JAAR = 34_144
const VASTE_LASTEN_PER_JAAR = 34_628

describe('dailyIncomeRate — bruto jaarinkomen → €/dag', () => {
  it('deelt door 365, niet door 12×30', () => {
    expect(dailyIncomeRate(36_500)).toBeCloseTo(100, 6)
    // 12×30=360 zou 101,39 geven — ~1,4% te hoog.
    expect(dailyIncomeRate(36_500)).not.toBeCloseTo(36_500 / 360, 2)
  })

  it('geeft 0 voor elke niet-bruikbare noemer (geen basis, geen benadering)', () => {
    expect(dailyIncomeRate(0)).toBe(0)
    expect(dailyIncomeRate(-50_000)).toBe(0)
    expect(dailyIncomeRate(Number.NaN)).toBe(0)
    expect(dailyIncomeRate(Number.POSITIVE_INFINITY)).toBe(0)
    expect(dailyIncomeRate(undefined as unknown as number)).toBe(0)
  })
})

describe('calculateWorkTime — degeneraties', () => {
  it('zonder inkomen-basis: geen claim (hasBasis false)', () => {
    expect(calculateWorkTime(10_000, 0)).toEqual(EMPTY_WORK_TIME)
    expect(calculateWorkTime(10_000, -1)).toEqual(EMPTY_WORK_TIME)
    expect(calculateWorkTime(10_000, Number.NaN)).toEqual(EMPTY_WORK_TIME)
  })

  it('nul of negatief bedrag: wél een basis, maar nul werktijd', () => {
    for (const amount of [0, -1_000, Number.NaN]) {
      const wt = calculateWorkTime(amount, DAILY_INCOME)
      expect(wt.hasBasis).toBe(true)
      expect(wt.monthsPerYear).toBe(0)
      expect(wt.exceedsWorkYear).toBe(false)
    }
  })
})

describe('calculateWorkTime — de C5-cijfers', () => {
  it('belasting is ~4,4 van de 12 maanden (was: 9)', () => {
    const wt = calculateWorkTime(BELASTING_PER_JAAR, DAILY_INCOME)
    expect(wt.monthsPerYear).toBeCloseTo(4.4, 1)
    expect(wt.hasBasis).toBe(true)
    expect(wt.exceedsWorkYear).toBe(false)
  })

  it('vaste lasten zijn ~4,5 van de 12 maanden (was: 9)', () => {
    const wt = calculateWorkTime(VASTE_LASTEN_PER_JAAR, DAILY_INCOME)
    expect(wt.monthsPerYear).toBeCloseTo(4.5, 1)
  })

  it('DE BUG: de twee claims tellen niet meer op tot 18 maanden', () => {
    const belasting = calculateWorkTime(BELASTING_PER_JAAR, DAILY_INCOME)
    const vasteLasten = calculateWorkTime(VASTE_LASTEN_PER_JAAR, DAILY_INCOME)
    const som = belasting.monthsPerYear + vasteLasten.monthsPerYear
    expect(som).toBeLessThanOrEqual(WORK_YEAR_MONTHS)
    expect(som).toBeCloseTo(8.9, 1)
  })

  it('werktijd is per constructie het effectieve tarief × 12 — dus consistent met de "36,6%" ernaast', () => {
    const effectiefTarief = BELASTING_PER_JAAR / GROSS_YEARLY
    expect(Math.round(effectiefTarief * 1000) / 10).toBeCloseTo(36.6, 1)
    const wt = calculateWorkTime(BELASTING_PER_JAAR, DAILY_INCOME)
    expect(wt.shareOfWorkYear).toBeCloseTo(effectiefTarief, 10)
    expect(wt.monthsPerYear).toBeCloseTo(effectiefTarief * WORK_YEAR_MONTHS, 1)
  })
})

describe('calculateWorkTime — de invariant: één noemer, één taart', () => {
  it('bedragen die samen het bruto jaarinkomen niet overschrijden, blijven samen onder 12 maanden', () => {
    const gevallen: Array<[number, number[]]> = [
      [93_290, [34_144, 34_628, 10_000]],
      [50_000, [12_500, 12_500, 12_500, 12_499]],
      [120_000, [1, 119_999]],
      [30_000, [30_000]],
    ]
    for (const [gross, bedragen] of gevallen) {
      const rate = dailyIncomeRate(gross)
      const som = bedragen.reduce(
        (acc, bedrag) => acc + calculateWorkTime(bedrag, rate).shareOfWorkYear,
        0,
      )
      expect(som * WORK_YEAR_MONTHS).toBeLessThanOrEqual(WORK_YEAR_MONTHS + 1e-9)
    }
  })

  it('een bedrag boven het bruto jaarinkomen is een ALARM, geen stille afkap', () => {
    const rate = dailyIncomeRate(30_000)
    const wt = calculateWorkTime(45_000, rate)
    expect(wt.exceedsWorkYear).toBe(true)
    expect(wt.monthsPerYear).toBeCloseTo(18, 1)
    expect(wt.shareOfWorkYear).toBeCloseTo(1.5, 6)
  })

  it('afrondingsruis net boven het werkjaar telt niet als alarm', () => {
    const rate = dailyIncomeRate(50_000)
    const wt = calculateWorkTime(50_001, rate)
    expect(wt.exceedsWorkYear).toBe(false)
  })
})

describe('calculateWorkTime — display-cap', () => {
  it('kapt de GETOONDE maanden af, niet de meting', () => {
    const rate = dailyIncomeRate(100)
    const wt = calculateWorkTime(1_000_000, rate)
    expect(wt.monthsPerYear).toBe(WORK_TIME_DISPLAY_MAX_MONTHS)
    expect(wt.exceedsWorkYear).toBe(true)
    // De ruwe meting blijft ongeknipt beschikbaar.
    expect(wt.shareOfWorkYear).toBeCloseTo(10_000, 6)
    expect(wt.workDays).toBeGreaterThan(1_000_000)
  })
})

describe('formatWorkTimeString', () => {
  it('noemt de noemer expliciet — dát maakt twee claims leesbaar naast elkaar', () => {
    expect(formatWorkTimeString(calculateWorkTime(BELASTING_PER_JAAR, DAILY_INCOME))).toBe(
      '4,4 van de 12 maanden',
    )
  })

  it('geeft een lege string zonder basis, zodat het oppervlak niets kan tonen', () => {
    expect(formatWorkTimeString(EMPTY_WORK_TIME)).toBe('')
    expect(formatWorkTimeString(calculateWorkTime(1_000, 0))).toBe('')
  })

  it('gebruikt de Nederlandse decimaalkomma met één decimaal', () => {
    expect(formatWorkTimeString(calculateWorkTime(50_000, dailyIncomeRate(50_000)))).toBe(
      '12,0 van de 12 maanden',
    )
  })
})
