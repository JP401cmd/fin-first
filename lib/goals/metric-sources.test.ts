import { describe, it, expect } from 'vitest'
import { decimalYearFromIso, resolveDebtFreeDate, type DebtFreeDateInput } from './metric-sources'
import { splitDecimalYear, formatGoalValue } from '@/lib/goal-data'

/**
 * Tests voor de schuldenvrij-datum-bron (`resolveDebtFreeDate`) en de
 * decimaal-jaar-conversie (`decimalYearFromIso`) — de twee stukken pure logica
 * achter het `debt_free_date`-auto-sync-doel.
 */

function debt(over: Partial<DebtFreeDateInput> & { debt_type: DebtFreeDateInput['debt_type'] }): DebtFreeDateInput {
  return {
    start_date: '2020-01-01',
    end_date: null,
    is_active: true,
    ...over,
  }
}

describe('resolveDebtFreeDate', () => {
  const NOW = new Date('2026-09-01T12:00:00.000Z')

  it('geen actieve schulden → schuldenvrij NU, met provenance user_set (het is een feit, geen aanname)', () => {
    const result = resolveDebtFreeDate([], NOW)
    expect(result.decimalYear).toBeCloseTo(NOW.getFullYear() + NOW.getMonth() / 12, 6)
    expect(result.basis).toEqual({ kind: 'user_set' })
  })

  it('alle schulden inactief telt ook als "geen actieve schulden"', () => {
    const result = resolveDebtFreeDate(
      [debt({ debt_type: 'mortgage', end_date: '2050-01-01', is_active: false })],
      NOW,
    )
    expect(result.basis).toEqual({ kind: 'user_set' })
  })

  it('één actieve schuld zonder einddatum wint altijd (no_end_date), ongeacht de rest', () => {
    const result = resolveDebtFreeDate(
      [
        // credit_card heeft geen DEFAULT_TERM_YEARS_PER_TYPE → user_set zodra
        // end_date gezet is; hier bewust WEL een einddatum, ver in de toekomst.
        debt({ debt_type: 'credit_card', end_date: '2035-01-01' }),
        // Doorlopende schuld zonder einddatum.
        debt({ debt_type: 'revolving_credit', end_date: null }),
      ],
      NOW,
    )
    expect(result.basis).toEqual({ kind: 'no_end_date' })
    // De datum blijft de beste ondergrens (de laatste bekende einddatum),
    // maar het label moet "onbepaald" zeggen — vandaar de kind-override.
    expect(result.decimalYear).toBeCloseTo(2035, 6)
  })

  it('provenance volgt de schuld met de LAATSTE einddatum, niet de arrayvolgorde', () => {
    const laatEindigend = debt({
      // mortgage default = 30 jaar; start 2020-01-01 + 30 jaar = 2050-01-01 exact
      // → resolveDebtTermBasis herkent dit als de stille default.
      debt_type: 'mortgage',
      start_date: '2020-01-01',
      end_date: '2050-01-01',
    })
    const vroegEindigend = debt({
      // credit_card heeft geen default-looptijd → altijd user_set.
      debt_type: 'credit_card',
      end_date: '2028-06-01',
    })

    const volgorde1 = resolveDebtFreeDate([vroegEindigend, laatEindigend], NOW)
    const volgorde2 = resolveDebtFreeDate([laatEindigend, vroegEindigend], NOW)

    for (const result of [volgorde1, volgorde2]) {
      expect(result.decimalYear).toBeCloseTo(2050, 6)
      expect(result.basis).toEqual({ kind: 'default_term', termYears: 30 })
    }
  })

  it('meerdere schulden met einddatum, geen ontbrekende: basis = die van de laatst eindigende (user_set)', () => {
    const result = resolveDebtFreeDate(
      [
        debt({ debt_type: 'credit_card', end_date: '2027-01-01' }),
        debt({ debt_type: 'credit_card', end_date: '2032-03-01' }),
      ],
      NOW,
    )
    expect(result.decimalYear).toBeCloseTo(2032 + 2 / 12, 6)
    expect(result.basis).toEqual({ kind: 'user_set' })
  })
})

describe('decimalYearFromIso — inverse van splitDecimalYear, round-trip met formatGoalValue', () => {
  it('converteert een ISO-datum naar jaar + maand-fractie', () => {
    // Juli = maandindex 6 (0-based) → 2031 + 6/12 = 2031.5.
    expect(decimalYearFromIso('2031-07-14')).toBeCloseTo(2031.5, 6)
    expect(decimalYearFromIso('2031-01-01')).toBeCloseTo(2031, 6)
  })

  it('levert null bij een ontbrekende of onbruikbare datum', () => {
    expect(decimalYearFromIso(null)).toBeNull()
    expect(decimalYearFromIso(undefined)).toBeNull()
    expect(decimalYearFromIso('geen-datum')).toBeNull()
  })

  it('round-trip: decimalYearFromIso → splitDecimalYear → dezelfde maand/jaar', () => {
    const decimalYear = decimalYearFromIso('2031-07-14')!
    const { year, monthIndex } = splitDecimalYear(decimalYear)
    expect(year).toBe(2031)
    expect(monthIndex).toBe(6) // juli
  })

  it('round-trip eindigt in dezelfde weergavetekst als formatGoalValue voor "datum"', () => {
    const decimalYear = decimalYearFromIso('2031-07-14')!
    expect(formatGoalValue(decimalYear, 'debt_free_date')).toBe('juli 2031')
  })

  it('januari (maandindex 0) round-trip klopt ook op de grens', () => {
    const decimalYear = decimalYearFromIso('2031-01-05')!
    expect(formatGoalValue(decimalYear, 'debt_free_date')).toBe('januari 2031')
  })
})
