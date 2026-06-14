import { describe, it, expect } from 'vitest'
import {
  computeBox3TaxableInput,
  box3TaxStatus,
  BOX3_ASSET_TYPES,
  BOX3_VRIJSTELLING_SINGLE,
} from './box3-taxable-input'
import { computeLeverScores } from '@/components/app/shell/lever-scores'
import type { LeverageStatus } from '@/lib/leverage-status'

// ── computeBox3TaxableInput ────────────────────────────────────────────────────

describe('computeBox3TaxableInput — BOX3_ASSET_TYPES filter', () => {
  it('asset_type null is excluded from box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: null, current_value: 100_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('pension type does NOT count toward box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'pension', current_value: 500_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('eigen_huis type does NOT count toward box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'eigen_huis', current_value: 300_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('vehicle type does NOT count toward box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'vehicle', current_value: 30_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('savings type counts as box3 asset', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(true)
  })

  it('all BOX3_ASSET_TYPES are recognised', () => {
    for (const type of BOX3_ASSET_TYPES) {
      const result = computeBox3TaxableInput(
        [{ asset_type: type, current_value: 100_000 }],
        [],
      )
      expect(result.hasBox3Assets, `${type} should be hasBox3Assets=true`).toBe(true)
    }
  })

  it('mix: only the non-box3 type → hasBox3Assets false', () => {
    const result = computeBox3TaxableInput(
      [
        { asset_type: 'pension', current_value: 300_000 },
        { asset_type: 'vehicle', current_value: 20_000 },
      ],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })
})

describe('computeBox3TaxableInput — net_worth_inclusion_pct weighting', () => {
  it('50% inclusion_pct contributes half the value', () => {
    // 100000 × 0.5 = 50000 → below vrijstelling 57684 → above = 0
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000, net_worth_inclusion_pct: 50 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(0)
    expect(result.hasBox3Assets).toBe(true)
  })

  it('200% inclusion_pct doubles the value', () => {
    // 100000 × 2 = 200000 → above = 200000 − 57684 = 142316
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000, net_worth_inclusion_pct: 200 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(200_000 - BOX3_VRIJSTELLING_SINGLE)
  })

  it('debt with 50% inclusion_pct reduces box3 by half', () => {
    // asset savings 200000, debt 100000 at 50% → effectief 50000 → net 150000 → above = 150000 − 57684 = 92316
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [{ current_balance: 100_000, net_worth_inclusion_pct: 50 }],
    )
    expect(result.box3TaxableAboveThreshold).toBe(200_000 - 50_000 - BOX3_VRIJSTELLING_SINGLE)
  })
})

describe('computeBox3TaxableInput — threshold calculation', () => {
  it('savings 200000, no debts → above = 200000 − 57684 = 142316', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(142_316)
  })

  it('cash 50000, no debts → under threshold → above = 0', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'cash', current_value: 50_000 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(0)
    expect(result.hasBox3Assets).toBe(true)
  })

  it('debts reduce box3Net before threshold is applied', () => {
    // savings 100000 − debt 20000 = net 80000 → above = 80000 − 57684 = 22316
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000 }],
      [{ current_balance: 20_000 }],
    )
    expect(result.box3TaxableAboveThreshold).toBe(22_316)
  })

  it('debts cannot push threshold below 0 (above is always ≥ 0)', () => {
    // savings 100000 − debt 300000 → net would be negative → max(0, …) → above 0
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000 }],
      [{ current_balance: 300_000 }],
    )
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('empty arrays → no assets, above = 0', () => {
    const result = computeBox3TaxableInput([], [])
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })
})

describe('computeBox3TaxableInput — string current_value coercion', () => {
  it('current_value as string is coerced via Number()', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: '100000' }],
      [],
    )
    expect(result.hasBox3Assets).toBe(true)
    // 100000 < 57684? no, 100000 > 57684 → above = 100000 − 57684 = 42316
    expect(result.box3TaxableAboveThreshold).toBe(42_316)
  })

  it('current_balance as string on debt is coerced via Number()', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [{ current_balance: '50000' }],
    )
    // net = 200000 − 50000 = 150000 → above = 150000 − 57684 = 92316
    expect(result.box3TaxableAboveThreshold).toBe(92_316)
  })
})

describe('computeBox3TaxableInput — householdType passthrough', () => {
  it('passes householdType through to the result', () => {
    const result = computeBox3TaxableInput([], [], 'samen')
    expect(result.householdType).toBe('samen')
  })

  it('householdType undefined when not passed', () => {
    const result = computeBox3TaxableInput([], [])
    expect(result.householdType).toBeUndefined()
  })
})

// ── box3TaxStatus ──────────────────────────────────────────────────────────────

describe('box3TaxStatus — neutral branch', () => {
  it('returns neutral when hasBox3Assets is false', () => {
    expect(box3TaxStatus({ box3TaxableAboveThreshold: 999_999, hasBox3Assets: false })).toBe('neutral')
  })
})

describe('box3TaxStatus — good branch', () => {
  it('returns good when above <= 0 (under threshold)', () => {
    expect(box3TaxStatus({ box3TaxableAboveThreshold: 0, hasBox3Assets: true })).toBe('good')
  })

  it('returns good when above <= 100000 with partner (samen)', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 100_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('good')
  })

  it('returns good when above <= 100000 with gezin', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 50_000, hasBox3Assets: true, householdType: 'gezin' }),
    ).toBe('good')
  })
})

describe('box3TaxStatus — warn branch', () => {
  it('returns warn when above <= 100000 without partner (solo)', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 50_000, hasBox3Assets: true, householdType: 'solo' }),
    ).toBe('warn')
  })

  it('returns warn when above <= 100000 without householdType (undefined)', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 80_000, hasBox3Assets: true }),
    ).toBe('warn')
  })

  it('returns warn when above <= 500000 with partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 300_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('warn')
  })

  it('returns warn when above exactly 500000 with partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 500_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('warn')
  })
})

describe('box3TaxStatus — bad branch', () => {
  it('returns bad when above <= 500000 without partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 200_000, hasBox3Assets: true, householdType: 'solo' }),
    ).toBe('bad')
  })

  it('returns bad when above exactly 500000 without partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 500_000, hasBox3Assets: true }),
    ).toBe('bad')
  })

  it('returns bad when above > 500000 with partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 600_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('bad')
  })

  it('returns bad when above > 500000 without partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 600_000, hasBox3Assets: true }),
    ).toBe('bad')
  })
})

// ── SSoT equivalence: box3TaxStatus == computeLeverScores.tax (mapped) ────────
//
// computeLeverScores returns LeverStatus (green/amber/red/neutral).
// The mapping in lever-scores.ts: good→green, warn→amber, bad→red, neutral→neutral.
// We verify that box3TaxStatus produces the same semantic result for each band.

function leverStatusToLeverageStatus(
  s: 'green' | 'amber' | 'red' | 'neutral',
): LeverageStatus {
  if (s === 'green') return 'good'
  if (s === 'amber') return 'warn'
  if (s === 'red') return 'bad'
  return 'neutral'
}

/** Minimal valid computeLeverScores input. */
function leverInput(override: {
  box3TaxableAboveThreshold: number
  hasBox3Assets: boolean
  householdType?: string
}) {
  return {
    totalAssets: 500_000,
    totalDebts: 0,
    assetTypeCount: 3,
    savingsRate: 20,
    box3TaxableAboveThreshold: override.box3TaxableAboveThreshold,
    hasBox3Assets: override.hasBox3Assets,
    householdType: override.householdType,
  }
}

describe('SSoT equivalence — computeLeverScores.tax.status matches box3TaxStatus', () => {
  it('neutral band: no box3 assets → both neutral', () => {
    const inp = { box3TaxableAboveThreshold: 0, hasBox3Assets: false }
    const leverageStatus = box3TaxStatus(inp)
    const leverScores = computeLeverScores(leverInput(inp))
    expect(leverStatusToLeverageStatus(leverScores.tax.status)).toBe(leverageStatus)
    expect(leverageStatus).toBe('neutral')
  })

  it('good band: above=0, has assets → both good/green', () => {
    const inp = { box3TaxableAboveThreshold: 0, hasBox3Assets: true }
    const leverageStatus = box3TaxStatus(inp)
    const leverScores = computeLeverScores(leverInput(inp))
    expect(leverStatusToLeverageStatus(leverScores.tax.status)).toBe(leverageStatus)
    expect(leverageStatus).toBe('good')
  })

  it('good band: above=50000 + partner → both good/green', () => {
    const inp = { box3TaxableAboveThreshold: 50_000, hasBox3Assets: true, householdType: 'samen' }
    const leverageStatus = box3TaxStatus(inp)
    const leverScores = computeLeverScores(leverInput(inp))
    expect(leverStatusToLeverageStatus(leverScores.tax.status)).toBe(leverageStatus)
    expect(leverageStatus).toBe('good')
  })

  it('warn band: above=50000, solo → both warn/amber', () => {
    const inp = { box3TaxableAboveThreshold: 50_000, hasBox3Assets: true, householdType: 'solo' }
    const leverageStatus = box3TaxStatus(inp)
    const leverScores = computeLeverScores(leverInput(inp))
    expect(leverStatusToLeverageStatus(leverScores.tax.status)).toBe(leverageStatus)
    expect(leverageStatus).toBe('warn')
  })

  it('warn band: above=300000 + partner → both warn/amber', () => {
    const inp = { box3TaxableAboveThreshold: 300_000, hasBox3Assets: true, householdType: 'samen' }
    const leverageStatus = box3TaxStatus(inp)
    const leverScores = computeLeverScores(leverInput(inp))
    expect(leverStatusToLeverageStatus(leverScores.tax.status)).toBe(leverageStatus)
    expect(leverageStatus).toBe('warn')
  })

  it('bad band: above=200000, solo → both bad/red', () => {
    const inp = { box3TaxableAboveThreshold: 200_000, hasBox3Assets: true, householdType: 'solo' }
    const leverageStatus = box3TaxStatus(inp)
    const leverScores = computeLeverScores(leverInput(inp))
    expect(leverStatusToLeverageStatus(leverScores.tax.status)).toBe(leverageStatus)
    expect(leverageStatus).toBe('bad')
  })

  it('bad band: above=600000 + partner → both bad/red', () => {
    const inp = { box3TaxableAboveThreshold: 600_000, hasBox3Assets: true, householdType: 'samen' }
    const leverageStatus = box3TaxStatus(inp)
    const leverScores = computeLeverScores(leverInput(inp))
    expect(leverStatusToLeverageStatus(leverScores.tax.status)).toBe(leverageStatus)
    expect(leverageStatus).toBe('bad')
  })
})
