import { describe, expect, it } from 'vitest'
import { buildPotBalances } from './pot-balances'

describe('buildPotBalances (TPR-15, pure move uit /toekomst/voorkeuren)', () => {
  it('telt actieve bezittingen per groep op en zet ongekoppeld spaargeld (niet negatief) bij spaargeld', () => {
    const saldi = buildPotBalances(
      [
        { asset_type: 'savings', current_value: 1000, is_active: true },
        { asset_type: 'investment', current_value: 2500, is_active: true },
        { asset_type: 'investment', current_value: 999, is_active: false },
      ] as never,
      300,
    )
    expect(saldi.spaargeld).toBe(1300)
    expect(saldi.beleggingen).toBe(2500)
    expect(buildPotBalances([], -50).spaargeld).toBe(0)
    expect(buildPotBalances(null, null)).toEqual({ spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0 })
  })
})
