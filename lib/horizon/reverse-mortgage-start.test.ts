import { describe, it, expect } from 'vitest'
import type { UnifiedProjectionRow, DebtBalanceDetail } from '@/lib/unified-projection'
import { detectReverseMortgageStartAge } from './reverse-mortgage-start'

function bal(endBalance: number): DebtBalanceDetail {
  return { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance }
}

function row(age: number, opeet?: number): UnifiedProjectionRow {
  return {
    age,
    debtBalances: opeet !== undefined ? { opeethypotheek: bal(opeet) } : {},
  } as unknown as UnifiedProjectionRow
}

describe('detectReverseMortgageStartAge', () => {
  it('geeft de eerste leeftijd waarop de opeethypotheek een saldo heeft', () => {
    expect(detectReverseMortgageStartAge([row(48), row(49, 0), row(50, 9_000), row(51, 20_000)])).toBe(50)
  })

  it('negeert sub-euro-ruis', () => {
    expect(detectReverseMortgageStartAge([row(50, 0.3), row(51, 4_000)])).toBe(51)
  })

  it('geen opeethypotheek-saldo in de rijen → null', () => {
    expect(detectReverseMortgageStartAge([row(50), row(51)])).toBeNull()
    expect(detectReverseMortgageStartAge([])).toBeNull()
    expect(detectReverseMortgageStartAge(null)).toBeNull()
  })
})
