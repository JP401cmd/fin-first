import { describe, it, expect } from 'vitest'
import type { AssetBucketDetail, UnifiedProjectionRow } from '@/lib/unified-projection'
import { computeLaagsteBuffer } from './laagste-buffer'

function bucket(endValue: number): AssetBucketDetail {
  return { startValue: endValue, growth: 0, contributions: 0, box3Drag: 0, endValue }
}

/** Minimale rij met alleen de velden die `spendablePortfolio` leest (assetBuckets + age). */
function makeRow(
  age: number,
  buckets: Partial<Record<string, AssetBucketDetail>>,
): UnifiedProjectionRow {
  return {
    year: age - 40,
    age,
    phase: 'withdrawal',
    assetBuckets: buckets as UnifiedProjectionRow['assetBuckets'],
    debtBalances: {},
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
  }
}

describe('computeLaagsteBuffer', () => {
  it('lege rijen → null', () => {
    expect(computeLaagsteBuffer([])).toBeNull()
  })

  it('vindt het dieptepunt van het belegbaar vermogen + de leeftijd', () => {
    const rows = [
      makeRow(60, { investment: bucket(100_000), eigen_huis: bucket(300_000) }),
      makeRow(65, { investment: bucket(50_000), eigen_huis: bucket(320_000) }),
      makeRow(70, { investment: bucket(80_000) }),
    ]
    // eigen_huis is NON_SPENDABLE → telt niet mee; min belegbaar = 50k op leeftijd 65.
    expect(computeLaagsteBuffer(rows)).toEqual({ bedrag: 50_000, age: 65 })
  })

  it('negatief kan niet, maar €0-dieptepunt (uitgeput) wordt gevonden', () => {
    const rows = [
      makeRow(60, { investment: bucket(120_000) }),
      makeRow(90, { investment: bucket(0), eigen_huis: bucket(400_000) }),
    ]
    expect(computeLaagsteBuffer(rows)).toEqual({ bedrag: 0, age: 90 })
  })

  it('bij gelijke minima wint de laagste leeftijd (vroegste dieptepunt)', () => {
    const rows = [
      makeRow(60, { investment: bucket(90_000) }),
      makeRow(65, { investment: bucket(50_000) }),
      makeRow(70, { investment: bucket(50_000) }),
    ]
    expect(computeLaagsteBuffer(rows)).toEqual({ bedrag: 50_000, age: 65 })
  })

  it('één rij → die rij is het dieptepunt', () => {
    expect(computeLaagsteBuffer([makeRow(55, { cash: bucket(42_000) })])).toEqual({ bedrag: 42_000, age: 55 })
  })
})
