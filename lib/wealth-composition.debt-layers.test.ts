import { describe, it, expect } from 'vitest'
import type { UnifiedProjectionRow, DebtBalanceDetail } from '@/lib/unified-projection'
import type { DebtType } from '@/lib/debt-data'
import { DEBT_LAYERS, DEBT_LAYER_FIELD, unifiedRowsToStackedRows } from '@/lib/wealth-composition'

function bal(endBalance: number): DebtBalanceDetail {
  return { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance }
}

function row(debtBalances: Record<string, DebtBalanceDetail>): UnifiedProjectionRow {
  return { age: 60, assetBuckets: {}, debtBalances } as unknown as UnifiedProjectionRow
}

const TYPES = new Map<string, DebtType>([
  ['debt-hyp', 'mortgage'],
  ['debt-auto', 'car_loan'],
])

describe('unifiedRowsToStackedRows — schulden per soort', () => {
  // Given een jaar met hypotheek, autolening, opeethypotheek en tekort-lening,
  // When de rijen naar staven worden omgezet mét schuldsoorten,
  // Then krijgt elke soort een eigen (negatief) veld dat optelt tot `schulden`.
  it('splitst de schuld in hypotheek, overig, opeethypotheek en tekort-lening', () => {
    const [out] = unifiedRowsToStackedRows(
      [row({ 'debt-hyp': bal(200_000), 'debt-auto': bal(10_000), opeethypotheek: bal(50_000), 'tekort-lening': bal(30_000) })],
      TYPES,
    )
    expect(out.schulden).toBe(-290_000)
    expect(out.schuldHypotheek).toBe(-200_000)
    expect(out.schuldOverig).toBe(-10_000)
    expect(out.schuldOpeethypotheek).toBe(-50_000)
    expect(out.schuldTekortLening).toBe(-30_000)
    const som = DEBT_LAYERS.reduce((s, l) => s + (out[DEBT_LAYER_FIELD[l]] ?? 0), 0)
    expect(som).toBe(out.schulden)
  })

  it('onbekende schuld-id telt als overige schuld', () => {
    const [out] = unifiedRowsToStackedRows([row({ 'slot-4': bal(5_000) })], TYPES)
    expect(out.schuldOverig).toBe(-5_000)
  })

  it('zonder schuldsoorten blijft alleen het totaal gevuld (terugval op één laag)', () => {
    const [out] = unifiedRowsToStackedRows([row({ 'debt-hyp': bal(200_000) })])
    expect(out.schulden).toBe(-200_000)
    expect(out.schuldHypotheek).toBeUndefined()
  })
})
