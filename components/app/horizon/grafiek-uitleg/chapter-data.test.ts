import { describe, it, expect } from 'vitest'
import {
  deriveChapterData,
  unreachableMessageFor,
  closingSentenceFor,
  leadSentenceForWithdrawal,
} from './chapter-data'
import type { SimResult, SimRow, SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'

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

// ── deriveChapterData — opbouw ──────────────────────────────────────────────

describe('deriveChapterData — opbouw', () => {
  it('derives start portfolio, yearly inleg (×12), avg growth and opbouwjaren', () => {
    const data = deriveChapterData(makeResult(), [])
    expect(data.opbouw.startPortfolio).toBe(100_000)
    expect(data.opbouw.yearlyInleg).toBe(18_000 * 12)
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
