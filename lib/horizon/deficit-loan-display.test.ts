import { describe, it, expect } from 'vitest'
import type { UnifiedProjectionRow, DebtBalanceDetail } from '@/lib/unified-projection'
import { detectDeficitLoanFromRows } from './deficit-loan-display'

/**
 * FIX 3 — V7-zichtbaarheid: detecteer de aangesproken tekort-lening uit de rijen
 * (eerste leeftijd + piek) zodat /toekomst er een stoplicht-melding bij kan tonen.
 */

function bal(endBalance: number): DebtBalanceDetail {
  return { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance }
}

function row(age: number, deficit?: number): UnifiedProjectionRow {
  return {
    year: age - 40,
    age,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: deficit !== undefined ? { 'tekort-lening': bal(deficit) } : {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
  } as UnifiedProjectionRow
}

describe('detectDeficitLoanFromRows', () => {
  it('leidt eerste leeftijd + piek af uit de rijen', () => {
    const rows = [row(40), row(41), row(42, 5_000), row(43, 12_000), row(44, 8_000)]
    const out = detectDeficitLoanFromRows(rows)
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(42)
    expect(out!.peak).toBe(12_000)
  })

  it('negeert 0-saldo-rijen (sleutel aanwezig maar niet aangesproken)', () => {
    const rows = [row(40, 0), row(41, 0), row(42, 3_000)]
    const out = detectDeficitLoanFromRows(rows)
    expect(out!.firstAge).toBe(42)
    expect(out!.peak).toBe(3_000)
  })

  it('geen tekort-lening in de rijen → null', () => {
    expect(detectDeficitLoanFromRows([row(40), row(41), row(42)])).toBeNull()
  })

  it('lege/afwezige rijen → null', () => {
    expect(detectDeficitLoanFromRows([])).toBeNull()
    expect(detectDeficitLoanFromRows(null)).toBeNull()
    expect(detectDeficitLoanFromRows(undefined)).toBeNull()
  })
})
