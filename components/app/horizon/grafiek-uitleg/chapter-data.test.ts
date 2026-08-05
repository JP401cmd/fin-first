import { describe, it, expect } from 'vitest'
import {
  deriveChapterData,
  unreachableMessageFor,
  closingSentenceFor,
  leadSentenceForWithdrawal,
} from './chapter-data'
import type { SimResult, SimRow, SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { UnifiedProjectionRow, AssetBucketDetail, DebtBalanceDetail } from '@/lib/unified-projection'

// ── Test fixtures ────────────────────────────────────────────────────────────

function accRow(age: number, start: number, growth: number, savings: number, end: number): SimRow {
  return {
    age,
    phase: 'accumulation',
    startPortfolio: start,
    growth,
    savings,
    withdrawal: 0,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: end,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
  }
}

function retRow(age: number, start: number, withdrawal: number, end: number): SimRow {
  return {
    age,
    phase: 'retirement',
    startPortfolio: start,
    growth: 0,
    savings: 0,
    withdrawal,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: end,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
  }
}

/**
 * Transition-rij (FIRE → AOW): onttrekt al uit het vermogen (withdrawal > 0) ÉN verdient nog
 * rendement (growth > 0), maar valt — net als toSimRow doet — in SimRow onder phase
 * 'accumulation'. Dit is precies de rij die FIX 2/3/4 vastpint.
 */
function transRow(age: number, start: number, growth: number, withdrawal: number, end: number): SimRow {
  return {
    age,
    phase: 'accumulation',
    startPortfolio: start,
    growth,
    savings: 0,
    withdrawal,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: end,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
  }
}

function makeResult(overrides: Partial<SimResult> = {}): SimResult {
  return {
    rows: [
      accRow(40, 100_000, 7_000, 18_000, 125_000),
      accRow(41, 125_000, 8_750, 18_000, 151_750),
      retRow(42, 151_750, 30_000, 130_000),
      retRow(43, 130_000, 30_000, 105_000),
    ],
    fireAge: 42,
    fireAgeFractional: 42.3,
    firePortfolioAtFire: 151_750,
    requiredFirePortfolio: 750_000,
    fireReachable: true,
    implicitWithdrawalRate: 0.04,
    classic25xTarget: 800_000,
    strategy: 'deplete',
    targetEndPortfolio: 0,
    displayEndAge: 90,
    ...overrides,
  }
}

const aowCashflow: SimCashflow = {
  id: 'aow-prefill',
  name: 'AOW',
  type: 'recurring',
  direction: 'income',
  amount: 1_400,
  fromAge: 67,
  toAge: null,
  indexed: true,
}

const oneTimeCashflow: SimCashflow = {
  id: 'le-inheritance',
  name: 'Erfenis',
  type: 'one_time',
  direction: 'income',
  amount: 50_000,
  fromAge: 70,
  toAge: 70,
  indexed: false,
}

// ── UnifiedProjectionRow fixtures ────────────────────────────────────────────

function bucket(over: Partial<AssetBucketDetail> = {}): AssetBucketDetail {
  return { startValue: 0, growth: 0, contributions: 0, box3Drag: 0, endValue: 0, ...over }
}

function debtDetail(over: Partial<DebtBalanceDetail> = {}): DebtBalanceDetail {
  return { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance: 0, ...over }
}

function uRow(over: Partial<UnifiedProjectionRow> = {}): UnifiedProjectionRow {
  return {
    year: 0,
    age: 40,
    phase: 'accumulation',
    assetBuckets: {},
    debtBalances: {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    // Mock-rij: volledig liquide (Prognose!J == I) tenzij een test `nettoLiquide` zet.
    nettoLiquide: 0,
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
    ...over,
  }
}

/**
 * Bouwt een set unifiedRows die past bij makeResult(): 2 opbouwjaren (40, 41), FIRE op 42,
 * 2 onttrekkingsjaren (42, 43). Bevat per-asset-type groei, een schuld die afgelost wordt,
 * withdrawalByType in de onttrekkingsfase, een oplopende cumulativeBox3 en inflationFactor.
 */
function makeUnifiedRows(): UnifiedProjectionRow[] {
  return [
    uRow({
      year: 0, age: 40, phase: 'accumulation',
      assetBuckets: {
        investment: bucket({ growth: 5_000 }),
        savings: bucket({ growth: 1_000 }),
      },
      debtBalances: { 'debt-1': debtDetail({ principalPaid: 2_000 }) },
      cumulativeBox3: 300, inflationFactor: 1,
    }),
    uRow({
      year: 1, age: 41, phase: 'accumulation',
      assetBuckets: {
        investment: bucket({ growth: 7_000 }),
        savings: bucket({ growth: 1_500 }),
      },
      debtBalances: { 'debt-1': debtDetail({ principalPaid: 3_000 }) },
      cumulativeBox3: 650, inflationFactor: 1.02,
    }),
    uRow({
      year: 2, age: 42, phase: 'withdrawal',
      assetBuckets: { investment: bucket({ growth: 6_000 }) },
      debtBalances: { 'debt-1': debtDetail() },
      withdrawal: 30_000,
      withdrawalByType: { cash: 10_000, savings: 20_000 },
      cumulativeBox3: 1_000, inflationFactor: 1.0404,
    }),
    uRow({
      year: 3, age: 43, phase: 'withdrawal',
      assetBuckets: { investment: bucket({ growth: 5_000 }) },
      debtBalances: { 'debt-1': debtDetail() },
      withdrawal: 30_000,
      withdrawalByType: { savings: 5_000, investment: 25_000 },
      cumulativeBox3: 1_400, inflationFactor: 1.0612,
    }),
  ]
}

/**
 * Scenario MÉT transition-fase (FIRE vóór AOW). Leeftijden:
 *   40, 41  → opbouw (accumulation)
 *   42, 43  → transition (FIRE → AOW): onttrekt al, valt in SimRow onder 'accumulation'
 *   44, 45  → withdrawal (vanaf AOW): SimRow 'retirement'
 * FIRE op leeftijd 42. De transition-jaren onttrekken (€25k) maar groeien óók nog (€6k/€5k);
 * de withdrawal-jaren onttrekken €30k zonder groei.
 */
function makeTransitionResult(overrides: Partial<SimResult> = {}): SimResult {
  return makeResult({
    rows: [
      accRow(40, 100_000, 7_000, 18_000, 125_000),
      accRow(41, 125_000, 8_750, 18_000, 151_750),
      transRow(42, 151_750, 6_000, 25_000, 132_750),
      transRow(43, 132_750, 5_000, 25_000, 112_750),
      retRow(44, 112_750, 30_000, 90_000),
      retRow(45, 90_000, 30_000, 65_000),
    ],
    fireAge: 42,
    fireAgeFractional: 42.4,
    firePortfolioAtFire: 151_750,
    ...overrides,
  })
}

/**
 * UnifiedRows die bij makeTransitionResult() passen: 2 opbouwjaren, 2 transition-jaren (met
 * groei én withdrawal), 2 withdrawal-jaren. De transition-rijen dragen `phase: 'transition'`,
 * `withdrawal > 0` en `assetBuckets[...].growth > 0` — exact wat FIX 4 (groei-fasedefinitie)
 * en FIX 2/3 (eerste-echte-onttrekking / vrije jaren) bewaken.
 */
function makeTransitionUnifiedRows(): UnifiedProjectionRow[] {
  // Per-rij is de som van de bucket-groei BEWUST gelijk aan SimRow.growth van makeTransitionResult
  // (toSimRow zet SimRow.growth = row.totalGrowth), zodat Σ assetTypeGrowth == cumulativeGrowth
  // reconcilieert over de opbouwfase INCL. transition:
  //   age40: 6_000+1_000 = 7_000 | age41: 7_250+1_500 = 8_750 | age42(trans): 6_000 | age43(trans): 5_000
  return [
    uRow({
      year: 0, age: 40, phase: 'accumulation',
      assetBuckets: { investment: bucket({ growth: 6_000 }), savings: bucket({ growth: 1_000 }) },
      debtBalances: { 'debt-1': debtDetail({ principalPaid: 2_000 }) },
      cumulativeBox3: 300, inflationFactor: 1,
    }),
    uRow({
      year: 1, age: 41, phase: 'accumulation',
      assetBuckets: { investment: bucket({ growth: 7_250 }), savings: bucket({ growth: 1_500 }) },
      debtBalances: { 'debt-1': debtDetail({ principalPaid: 3_000 }) },
      cumulativeBox3: 650, inflationFactor: 1.02,
    }),
    uRow({
      year: 2, age: 42, phase: 'transition',
      assetBuckets: { investment: bucket({ growth: 6_000 }) },
      debtBalances: { 'debt-1': debtDetail({ principalPaid: 1_000 }) },
      withdrawal: 25_000,
      withdrawalByType: { cash: 25_000 },
      cumulativeBox3: 1_000, inflationFactor: 1.0404,
    }),
    uRow({
      year: 3, age: 43, phase: 'transition',
      assetBuckets: { investment: bucket({ growth: 5_000 }) },
      debtBalances: { 'debt-1': debtDetail() },
      withdrawal: 25_000,
      withdrawalByType: { savings: 25_000 },
      cumulativeBox3: 1_400, inflationFactor: 1.0612,
    }),
    uRow({
      year: 4, age: 44, phase: 'withdrawal',
      assetBuckets: { investment: bucket({ growth: 2_000 }) },
      debtBalances: { 'debt-1': debtDetail() },
      withdrawal: 30_000,
      withdrawalByType: { investment: 30_000 },
      cumulativeBox3: 1_800, inflationFactor: 1.0824,
    }),
    uRow({
      year: 5, age: 45, phase: 'withdrawal',
      assetBuckets: { investment: bucket({ growth: 1_000 }) },
      debtBalances: { 'debt-1': debtDetail() },
      withdrawal: 30_000,
      withdrawalByType: { investment: 30_000 },
      cumulativeBox3: 2_200, inflationFactor: 1.1041,
    }),
  ]
}

// ── deriveChapterData — opbouw ──────────────────────────────────────────────

describe('deriveChapterData — opbouw', () => {
  it('derives start portfolio, yearly inleg (SimRow.savings is yearly — NO ×12), avg growth and opbouwjaren', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.opbouw.startPortfolio).toBe(100_000)
    // FIX 1: SimRow.savings is already a yearly amount; yearlyInleg takes it one-to-one (no ×12),
    // so it reconciles with cumulativeContributions (= Σ savings, also yearly).
    expect(data.opbouw.yearlyInleg).toBe(18_000)
    expect(data.opbouw.averageGrowth).toBeCloseTo((7_000 + 8_750) / 2)
    expect(data.opbouw.opbouwjaren).toBe(2)
    expect(data.opbouw.endOfAccumulation).toBe(151_750)
  })

  it('handles 0 accumulation years (already retired) without crashing', () => {
    const result = makeResult({
      rows: [retRow(67, 600_000, 30_000, 580_000), retRow(68, 580_000, 30_000, 560_000)],
      fireAge: 67,
      fireAgeFractional: 67,
    })
    const data = deriveChapterData(result, [])
    expect(data.opbouw.opbouwjaren).toBe(0)
    expect(data.opbouw.yearlyInleg).toBe(0)
    expect(data.opbouw.averageGrowth).toBe(0)
    // endOfAccumulation falls back to startPortfolio of first row
    expect(data.opbouw.endOfAccumulation).toBe(600_000)
    expect(data.opbouw.startPortfolio).toBe(600_000)
  })

  it('handles empty rows safely', () => {
    const data = deriveChapterData(makeResult({ rows: [] }), [])
    expect(data.opbouw.startPortfolio).toBe(0)
    expect(data.opbouw.endOfAccumulation).toBe(0)
    expect(data.opbouw.opbouwjaren).toBe(0)
  })

  it('cumulativeContributions sums savings YEARLY (no ×12) over accumulation rows', () => {
    // makeResult: two accumulation rows with savings 18_000 each.
    const data = deriveChapterData(makeResult(), [])
    expect(data.opbouw.cumulativeContributions).toBe(18_000 + 18_000)
    expect(data.opbouw.cumulativeGrowth).toBe(7_000 + 8_750)
  })

  it('cumulativeContributions/Growth are 0 with 0 accumulation years', () => {
    const result = makeResult({
      rows: [retRow(67, 600_000, 30_000, 580_000), retRow(68, 580_000, 30_000, 560_000)],
      fireAge: 67,
    })
    const data = deriveChapterData(result, [])
    expect(data.opbouw.cumulativeContributions).toBe(0)
    expect(data.opbouw.cumulativeGrowth).toBe(0)
  })

  it('unifiedRows-only opbouw fields are undefined WITHOUT unifiedRows', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.opbouw.assetTypeGrowth).toBeUndefined()
    expect(data.opbouw.debtPrincipalPaidDuringAccumulation).toBeUndefined()
  })

  it('empty unifiedRows array behaves like no unifiedRows (fields undefined)', () => {
    const data = deriveChapterData(makeResult(), [], [])
    expect(data.opbouw.assetTypeGrowth).toBeUndefined()
    expect(data.opbouw.debtPrincipalPaidDuringAccumulation).toBeUndefined()
  })

  it('WITH unifiedRows: assetTypeGrowth sums accumulation-phase growth per type, sorted desc', () => {
    const data = deriveChapterData(makeResult(), [], makeUnifiedRows())
    // Only accumulation rows count: investment 5_000+7_000=12_000, savings 1_000+1_500=2_500.
    expect(data.opbouw.assetTypeGrowth).toEqual([
      { type: 'investment', growth: 12_000 },
      { type: 'savings', growth: 2_500 },
    ])
  })

  it('WITH unifiedRows + debt: debtPrincipalPaidDuringAccumulation sums accumulation principal', () => {
    const data = deriveChapterData(makeResult(), [], makeUnifiedRows())
    // Only accumulation rows: 2_000 + 3_000 = 5_000 (withdrawal-phase rows have 0).
    expect(data.opbouw.debtPrincipalPaidDuringAccumulation).toBe(5_000)
  })

  it('WITH unifiedRows but NO debt principal: debtPrincipalPaidDuringAccumulation undefined', () => {
    const noDebtRows = makeUnifiedRows().map(r => ({ ...r, debtBalances: {} }))
    const data = deriveChapterData(makeResult(), [], noDebtRows)
    expect(data.opbouw.debtPrincipalPaidDuringAccumulation).toBeUndefined()
  })
})

// ── deriveChapterData — terugrekening ───────────────────────────────────────

describe('deriveChapterData — terugrekening', () => {
  it('anchors on requiredFirePortfolio + classic25x and detects income floor', () => {
    const data = deriveChapterData(makeResult(), [aowCashflow])
    expect(data.terugrekening.requiredFirePortfolio).toBe(750_000)
    expect(data.terugrekening.classic25xTarget).toBe(800_000)
    expect(data.terugrekening.hasIncomeFloor).toBe(true)
  })

  it('no income floor when there are no recurring income cashflows', () => {
    const data = deriveChapterData(makeResult(), [oneTimeCashflow])
    expect(data.terugrekening.hasIncomeFloor).toBe(false)
  })

  it('incomeFloorMonthly sums recurring income amounts (monthly); undefined without floor', () => {
    const pension: SimCashflow = { ...aowCashflow, id: 'le-pension', name: 'Pensioen', amount: 600 }
    const withFloor = deriveChapterData(makeResult(), [aowCashflow, pension, oneTimeCashflow])
    // 1_400 (AOW) + 600 (pensioen); one-time inheritance does NOT count.
    expect(withFloor.terugrekening.incomeFloorMonthly).toBe(2_000)

    const noFloor = deriveChapterData(makeResult(), [oneTimeCashflow])
    expect(noFloor.terugrekening.incomeFloorMonthly).toBeUndefined()
  })

  it('inflationFactorAtFire requires unifiedRows; picks the row at fireAge', () => {
    const without = deriveChapterData(makeResult(), [])
    expect(without.terugrekening.inflationFactorAtFire).toBeUndefined()

    // makeResult fireAge = 42 → matching unifiedRow has inflationFactor 1.0404.
    const withRows = deriveChapterData(makeResult(), [], makeUnifiedRows())
    expect(withRows.terugrekening.inflationFactorAtFire).toBeCloseTo(1.0404)
  })

  it('inflationFactorAtFire falls back to first row when fireAge is null', () => {
    const unreachable = makeResult({ fireReachable: false, fireAge: null, fireAgeFractional: null })
    const data = deriveChapterData(unreachable, [], makeUnifiedRows())
    expect(data.terugrekening.inflationFactorAtFire).toBe(1)
  })

  it('classic25xTarget field is preserved (UI hides display, data stays)', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.terugrekening.classic25xTarget).toBe(800_000)
  })
})

// ── deriveChapterData — snijpunt (reachable + unreachable) ───────────────────

describe('deriveChapterData — snijpunt', () => {
  it('reachable: surfaces fractional fire age + portfolio + rate, no message', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.snijpunt.reachable).toBe(true)
    expect(data.snijpunt.fireAgeFractional).toBe(42.3)
    expect(data.snijpunt.firePortfolioAtFire).toBe(151_750)
    expect(data.snijpunt.implicitWithdrawalRate).toBe(0.04)
    expect(data.snijpunt.unreachableMessage).toBeNull()
  })

  it('unreachable: null fire age + honest message', () => {
    const result = makeResult({
      fireReachable: false,
      fireAge: null,
      fireAgeFractional: null,
    })
    const data = deriveChapterData(result, [])
    expect(data.snijpunt.reachable).toBe(false)
    expect(data.snijpunt.fireAgeFractional).toBeNull()
    expect(data.snijpunt.unreachableMessage).toBeTruthy()
    expect(data.snijpunt.unreachableMessage).toContain('90')
  })

  it('reachable: currentAge = rows[0].age and yearsFromNow = round(fireAge − currentAge)', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.snijpunt.currentAge).toBe(40)
    // fireAgeFractional 42.3 − 40 = 2.3 → round → 2
    expect(data.snijpunt.yearsFromNow).toBe(2)
  })

  it('unreachable: yearsFromNow is undefined, currentAge still derived', () => {
    const data = deriveChapterData(
      makeResult({ fireReachable: false, fireAge: null, fireAgeFractional: null }),
      [],
    )
    expect(data.snijpunt.yearsFromNow).toBeUndefined()
    expect(data.snijpunt.currentAge).toBe(40)
  })

  it('empty rows: currentAge falls back to 0, yearsFromNow undefined', () => {
    const data = deriveChapterData(
      makeResult({ rows: [], fireReachable: false, fireAge: null, fireAgeFractional: null }),
      [],
    )
    expect(data.snijpunt.currentAge).toBe(0)
    expect(data.snijpunt.yearsFromNow).toBeUndefined()
  })
})

// ── deriveChapterData — onttrekking (all strategies + cashflows) ─────────────

describe('deriveChapterData — onttrekking', () => {
  it('counts retirement years + carries strategy/displayEndAge', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.onttrekking.withdrawalYears).toBe(2)
    expect(data.onttrekking.strategy).toBe('deplete')
    expect(data.onttrekking.displayEndAge).toBe(90)
  })

  it('empty cashflows → no impacts (falls back to strategy-only text)', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.onttrekking.impacts).toHaveLength(0)
    expect(data.onttrekking.closingSentence).toBeTruthy()
  })

  it('includes AOW + one-time impacts active in the withdrawal phase', () => {
    const data = deriveChapterData(makeResult(), [aowCashflow, oneTimeCashflow])
    const ids = data.onttrekking.impacts.map(i => i.id)
    expect(ids).toContain('aow-prefill')
    expect(ids).toContain('le-inheritance')
    const aow = data.onttrekking.impacts.find(i => i.id === 'aow-prefill')!
    expect(aow.label).toBe('AOW (staatspensioen)')
    expect(aow.direction).toBe('income')
  })

  it('excludes one-time cashflows that occur before FIRE age', () => {
    const earlyOneTime: SimCashflow = { ...oneTimeCashflow, id: 'le-early', fromAge: 30, toAge: 30 }
    const data = deriveChapterData(makeResult(), [earlyOneTime])
    expect(data.onttrekking.impacts.map(i => i.id)).not.toContain('le-early')
  })

  const strategies: FireEndStrategy[] = ['deplete', 'perpetual', 'legacy', 'pensioen']
  it.each(strategies)('produces a closing sentence for strategy %s', (strategy) => {
    const data = deriveChapterData(
      makeResult({ strategy, targetEndPortfolio: strategy === 'legacy' ? 250_000 : 0 }),
      [],
    )
    expect(data.onttrekking.closingSentence.length).toBeGreaterThan(0)
  })

  it('endPortfolio reads the last row endPortfolio; 0 on empty rows', () => {
    expect(deriveChapterData(makeResult(), []).onttrekking.endPortfolio).toBe(105_000)
    expect(deriveChapterData(makeResult({ rows: [] }), []).onttrekking.endPortfolio).toBe(0)
  })

  it.each(['deplete', 'legacy', 'pensioen'] as FireEndStrategy[])(
    'firstYearWithdrawal = first retirement withdrawal for withdrawing strategy %s',
    (strategy) => {
      const data = deriveChapterData(makeResult({ strategy }), [])
      expect(data.onttrekking.firstYearWithdrawal).toBe(30_000)
    },
  )

  it('perpetual: firstYearWithdrawal undefined (strategy does not deplete)', () => {
    const data = deriveChapterData(makeResult({ strategy: 'perpetual' }), [])
    expect(data.onttrekking.firstYearWithdrawal).toBeUndefined()
  })

  it('firstYearWithdrawal undefined when there are no retirement rows', () => {
    const accOnly = makeResult({
      rows: [accRow(40, 100_000, 7_000, 18_000, 125_000)],
      fireReachable: false, fireAge: null, fireAgeFractional: null,
    })
    expect(deriveChapterData(accOnly, []).onttrekking.firstYearWithdrawal).toBeUndefined()
  })

  it('firstYearWithdrawal undefined when first retirement withdrawal is 0 (insignificant)', () => {
    const zeroDraw = makeResult({
      rows: [accRow(40, 100_000, 7_000, 18_000, 125_000), retRow(42, 151_750, 0, 151_750)],
    })
    expect(deriveChapterData(zeroDraw, []).onttrekking.firstYearWithdrawal).toBeUndefined()
  })

  it('unifiedRows-only onttrekking fields undefined WITHOUT unifiedRows', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.onttrekking.withdrawalOrder).toBeUndefined()
    expect(data.onttrekking.totalBox3).toBeUndefined()
  })

  it('WITH unifiedRows: withdrawalOrder is first-seen order of drained pots (>0 only)', () => {
    const data = deriveChapterData(makeResult(), [], makeUnifiedRows())
    // Row age42: cash, savings; row age43 adds investment. First-seen order:
    expect(data.onttrekking.withdrawalOrder).toEqual(['cash', 'savings', 'investment'])
  })

  it('withdrawalOrder undefined when no pot is actually drained', () => {
    const noDraw = makeUnifiedRows().map(r => ({ ...r, withdrawalByType: {} }))
    const data = deriveChapterData(makeResult(), [], noDraw)
    expect(data.onttrekking.withdrawalOrder).toBeUndefined()
  })

  it('WITH unifiedRows: totalBox3 = cumulativeBox3 of the last row', () => {
    const data = deriveChapterData(makeResult(), [], makeUnifiedRows())
    expect(data.onttrekking.totalBox3).toBe(1_400)
  })
})

// ── deriveChapterData — per-strategie regressie (met/zonder unifiedRows) ──────

describe('deriveChapterData — per-strategy parity (with/without unifiedRows)', () => {
  const strategies: FireEndStrategy[] = ['deplete', 'perpetual', 'legacy', 'pensioen']

  it.each(strategies)('strategy %s: base output stable regardless of unifiedRows presence', (strategy) => {
    const result = makeResult({ strategy, targetEndPortfolio: strategy === 'legacy' ? 250_000 : 0 })
    const withoutRows = deriveChapterData(result, [aowCashflow])
    const withRows = deriveChapterData(result, [aowCashflow], makeUnifiedRows())

    // Base (non-unified) fields must be identical with or without unifiedRows.
    expect(withRows.opbouw.cumulativeContributions).toBe(withoutRows.opbouw.cumulativeContributions)
    expect(withRows.snijpunt.yearsFromNow).toBe(withoutRows.snijpunt.yearsFromNow)
    expect(withRows.onttrekking.firstYearWithdrawal).toBe(withoutRows.onttrekking.firstYearWithdrawal)
    expect(withRows.onttrekking.endPortfolio).toBe(withoutRows.onttrekking.endPortfolio)
    expect(withRows.terugrekening.incomeFloorMonthly).toBe(withoutRows.terugrekening.incomeFloorMonthly)

    // unified-only fields present ONLY when rows are given.
    expect(withoutRows.onttrekking.totalBox3).toBeUndefined()
    expect(withRows.onttrekking.totalBox3).toBe(1_400)
  })
})

// ── deriveChapterData — transition-fase (FIX 2/3/4: FIRE vóór AOW) ───────────

describe('deriveChapterData — transition-fase (FIRE < AOW)', () => {
  // FIX 2: de eerste ECHTE onttrekking is het transition-jaar (€25k op leeftijd 42), NIET de
  // latere withdrawal-fase-opname (€30k op AOW). retirementRows[0] zou €30k geven.
  it('FIX 2: firstYearWithdrawal = the transition draw (not the later withdrawal-phase draw)', () => {
    const data = deriveChapterData(makeTransitionResult(), [])
    expect(data.onttrekking.firstYearWithdrawal).toBe(25_000)
  })

  // FIX 3: vrije jaren tellen transition + withdrawal: ages 42,43,44,45 = 4. retirementRows.length
  // (alleen 44,45) zou 2 geven en zo de twee transition-jaren missen.
  it('FIX 3: withdrawalYears counts transition + withdrawal years from FIRE onward', () => {
    const data = deriveChapterData(makeTransitionResult(), [])
    expect(data.onttrekking.withdrawalYears).toBe(4)
  })

  // FIX 4: assetTypeGrowth gebruikt nu DEZELFDE fase-definitie als cumulativeGrowth
  // (phase !== 'withdrawal', incl. transition), zodat ze reconciliëren.
  it('FIX 4: assetTypeGrowth uses phase !== withdrawal (incl. transition) and reconciles with cumulativeGrowth', () => {
    const data = deriveChapterData(makeTransitionResult(), [], makeTransitionUnifiedRows())
    const assetTypeGrowth = data.opbouw.assetTypeGrowth!
    // investment: 6_000+7_250+6_000+5_000 = 24_250 ; savings: 1_000+1_500 = 2_500
    expect(assetTypeGrowth).toEqual([
      { type: 'investment', growth: 24_250 },
      { type: 'savings', growth: 2_500 },
    ])
    const sumAssetGrowth = assetTypeGrowth.reduce((s, g) => s + g.growth, 0)
    // cumulativeGrowth = Σ SimRow.growth over SimRow-accumulation (40,41,42,43) = 26_750.
    expect(data.opbouw.cumulativeGrowth).toBe(7_000 + 8_750 + 6_000 + 5_000)
    // Reconciliatie: per-asset-type-som == cumulativeGrowth over de opbouwfase incl. transition.
    expect(sumAssetGrowth).toBe(data.opbouw.cumulativeGrowth)
  })

  // FIX 4 (schuld): aflossing telt óók de transition-jaren mee (phase !== 'withdrawal').
  it('FIX 4: debtPrincipalPaidDuringAccumulation includes transition-phase principal', () => {
    const data = deriveChapterData(makeTransitionResult(), [], makeTransitionUnifiedRows())
    // age40: 2_000, age41: 3_000, age42(trans): 1_000 → 6_000 (withdrawal-rijen hebben 0).
    expect(data.opbouw.debtPrincipalPaidDuringAccumulation).toBe(6_000)
  })

  // Consume-only baseline: contributions/yearlyInleg ongewijzigd door transition (savings = 0 daar).
  it('cumulativeContributions ignores transition rows (savings 0 there); yearlyInleg unchanged', () => {
    const data = deriveChapterData(makeTransitionResult(), [])
    expect(data.opbouw.cumulativeContributions).toBe(18_000 + 18_000)
    expect(data.opbouw.yearlyInleg).toBe(18_000)
  })

  // Perpetual blijft uitgesloten van firstYearWithdrawal, óók met een transition-fase.
  it('perpetual still yields undefined firstYearWithdrawal even with a transition phase', () => {
    const data = deriveChapterData(makeTransitionResult({ strategy: 'perpetual' }), [])
    expect(data.onttrekking.firstYearWithdrawal).toBeUndefined()
    // withdrawalYears (= behoudjaren vanaf FIRE) telt nog steeds 4.
    expect(data.onttrekking.withdrawalYears).toBe(4)
  })

  // Per-strategie regressie over de transition-fase (reachable, met/zonder unifiedRows).
  const strategies: FireEndStrategy[] = ['deplete', 'perpetual', 'legacy', 'pensioen']
  it.each(strategies)('transition scenario — strategy %s: FIX 2/3 stable with/without unifiedRows', (strategy) => {
    const result = makeTransitionResult({ strategy, targetEndPortfolio: strategy === 'legacy' ? 250_000 : 0 })
    const withoutRows = deriveChapterData(result, [aowCashflow])
    const withRows = deriveChapterData(result, [aowCashflow], makeTransitionUnifiedRows())

    // FIX 3 robust across all strategies: 4 free years from FIRE (transition + withdrawal).
    expect(withoutRows.onttrekking.withdrawalYears).toBe(4)
    expect(withRows.onttrekking.withdrawalYears).toBe(4)

    // FIX 2: non-perpetual draws first at the transition year (€25k); perpetual → undefined.
    if (strategy === 'perpetual') {
      expect(withoutRows.onttrekking.firstYearWithdrawal).toBeUndefined()
    } else {
      expect(withoutRows.onttrekking.firstYearWithdrawal).toBe(25_000)
    }
    expect(withRows.onttrekking.firstYearWithdrawal).toBe(withoutRows.onttrekking.firstYearWithdrawal)
  })

  // Unreachable + transition-shaped rows: FIX 3 guards on fireReachable/fireAge → 0 free years.
  it('unreachable: withdrawalYears falls back to 0 even if rows carry withdrawals', () => {
    const unreachable = makeTransitionResult({
      fireReachable: false, fireAge: null, fireAgeFractional: null,
    })
    const data = deriveChapterData(unreachable, [])
    expect(data.onttrekking.withdrawalYears).toBe(0)
    // firstYearWithdrawal still finds the first drawing row regardless of reachability.
    expect(data.onttrekking.firstYearWithdrawal).toBe(25_000)
  })
})

// ── pure helpers ────────────────────────────────────────────────────────────

describe('unreachableMessageFor', () => {
  it('returns a strategy-specific message containing the end age', () => {
    expect(unreachableMessageFor('legacy', 95)).toContain('nalatenschap')
    expect(unreachableMessageFor('perpetual', 95)).toContain('blijvend')
    expect(unreachableMessageFor('deplete', 95)).toContain('95')
    expect(unreachableMessageFor('pensioen', 95)).toContain('95')
  })
})

describe('closingSentenceFor', () => {
  it('deplete mentions afbouw + end age', () => {
    expect(closingSentenceFor('deplete', 90, 0)).toContain('90')
  })
  it('perpetual mentions koopkracht', () => {
    expect(closingSentenceFor('perpetual', 90, 0)).toContain('koopkracht')
  })
  it('legacy mentions nalatenschap with amount', () => {
    expect(closingSentenceFor('legacy', 90, 250_000)).toContain('nalatenschap')
  })
  it('pensioen with target mentions nalatenschap; without target mentions vast bedrag', () => {
    expect(closingSentenceFor('pensioen', 90, 100_000)).toContain('nalatenschap')
    expect(closingSentenceFor('pensioen', 90, 0)).toContain('vast bedrag')
  })
})

describe('leadSentenceForWithdrawal', () => {
  it('perpetual speaks of preserving (behoud), not teren', () => {
    const lead = leadSentenceForWithdrawal('perpetual')
    expect(lead).toContain('op peil')
    expect(lead).toContain('teert niet in')
  })
  it('deplete/legacy/pensioen keep the onttrekking wording', () => {
    for (const strategy of ['deplete', 'legacy', 'pensioen'] as const) {
      expect(leadSentenceForWithdrawal(strategy)).toContain('onttrekt')
    }
  })
})
