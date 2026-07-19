import { describe, it, expect } from 'vitest'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import {
  shouldSkipKernelContextFetch,
  keepRefIfEqual,
  deepEqual,
} from './kernel-context-sync'

/**
 * Task 1.3 — /toekomst kernel-context-dedupe.
 *
 * Bewaakt de twee beslissingen die de gegarandeerde tweede kernel-solve wegnemen:
 *  1. de skip-conditie (mount-fetch overslaan wanneer de server de volledige
 *     context al leverde);
 *  2. de referentie-behoudende gelijkheidsguard voor het fallback-pad — deep-equal
 *     input mag GEEN nieuwe referentie (en dus geen setState/re-solve) opleveren.
 */

const AOW_ROW: AowLeeftijdRow = {
  id: 'row-1',
  birth_date_from: '1960-01-01',
  birth_date_through: '1960-12-31',
  aow_years: 67,
  aow_months: 0,
  is_definitive: true,
  source: 'SVB',
}

function makeAowRows(): AowLeeftijdRow[] {
  return [
    { ...AOW_ROW },
    { ...AOW_ROW, id: 'row-2', birth_date_from: '1961-01-01', birth_date_through: '1961-12-31', aow_months: 3 },
  ]
}

function makeProfile(): ConvergentieRawProfileRow {
  return {
    date_of_birth: '1986-01-01',
    net_monthly_income: 4000,
    estimated_monthly_expenses: 2500,
    expected_return: 7,
    inflation_rate: 2,
    box3_method: 'forfaitair',
    fire_end_strategy: 'perpetual',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    withdrawal_strategy: 'static',
    // Geneste objecten — de guard moet ook diep vergelijken.
    housing_strategy_config: { mode: 'include_full' },
    retirement_expense_method: 'current_expenses',
    retirement_expense_custom_amount: null,
    yearly_essential_expenses: 24000,
  } as ConvergentieRawProfileRow
}

describe('shouldSkipKernelContextFetch', () => {
  it('slaat over wanneer rawProfile aanwezig is én de AOW-tabel gevuld is', () => {
    expect(
      shouldSkipKernelContextFetch({ rawProfile: makeProfile(), aowRows: makeAowRows() }),
    ).toBe(true)
  })

  it('slaat NIET over wanneer rawProfile null is (profiel-query faalde)', () => {
    expect(
      shouldSkipKernelContextFetch({ rawProfile: null, aowRows: makeAowRows() }),
    ).toBe(false)
  })

  it('slaat NIET over bij een lege AOW-tabel (legacy DB)', () => {
    expect(
      shouldSkipKernelContextFetch({ rawProfile: makeProfile(), aowRows: [] }),
    ).toBe(false)
  })

  it('slaat NIET over wanneer aowRows ontbreekt (undefined/null)', () => {
    expect(shouldSkipKernelContextFetch({ rawProfile: makeProfile(), aowRows: undefined })).toBe(false)
    expect(shouldSkipKernelContextFetch({ rawProfile: makeProfile(), aowRows: null })).toBe(false)
  })
})

describe('deepEqual', () => {
  it('vergelijkt primitieven en null correct', () => {
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual('a', 'a')).toBe(true)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(null, {})).toBe(false)
    expect(deepEqual(1, '1')).toBe(false)
  })

  it('vergelijkt geneste objecten en arrays structureel', () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toBe(true)
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 3] } })).toBe(false)
  })

  it('ziet verschillende key-sets als ongelijk', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
  })
})

describe('keepRefIfEqual — gelijkheidsguard', () => {
  it('behoudt de VORIGE referentie bij een deep-equal AOW-tabel (geen re-solve)', () => {
    const prev = makeAowRows()
    const next = makeAowRows() // structureel gelijk, andere referentie
    expect(next).not.toBe(prev)
    const result = keepRefIfEqual(prev, next)
    // Zelfde referentie terug → React bailt uit → memo herrekent niet.
    expect(result).toBe(prev)
  })

  it('geeft de NIEUWE referentie bij een gewijzigde AOW-tabel', () => {
    const prev = makeAowRows()
    const next = makeAowRows()
    next[0] = { ...next[0], aow_months: 6 } // echte wijziging
    const result = keepRefIfEqual(prev, next)
    expect(result).toBe(next)
  })

  it('behoudt de vorige referentie bij een deep-equal profielrij (incl. genest object)', () => {
    const prev = makeProfile()
    const next = makeProfile()
    expect(next).not.toBe(prev)
    expect(keepRefIfEqual(prev, next)).toBe(prev)
  })

  it('geeft de nieuwe referentie bij een gewijzigd profiel-veld', () => {
    const prev = makeProfile()
    const next: ConvergentieRawProfileRow = { ...makeProfile(), yearly_essential_expenses: 30000 }
    expect(keepRefIfEqual(prev, next)).toBe(next)
  })

  it('geeft de nieuwe referentie wanneer prev null is (fallback: geen seed)', () => {
    const next = makeProfile()
    expect(keepRefIfEqual<ConvergentieRawProfileRow | null>(null, next)).toBe(next)
  })

  it('behoudt de referentie wanneer beide lege AOW-tabellen zijn', () => {
    const prev: AowLeeftijdRow[] = []
    const next: AowLeeftijdRow[] = []
    expect(keepRefIfEqual(prev, next)).toBe(prev)
  })
})
