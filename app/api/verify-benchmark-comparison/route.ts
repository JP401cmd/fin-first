import { NextResponse } from 'next/server'
import {
  buildPortfolioHistory,
  compareToBenchmarks,
  calculateTimeWeightedReturn,
  normalizeToBase100,
  generateBenchmarkData,
  getAlphaDescription,
  BENCHMARKS,
  TIME_PERIODS,
  type HoldingSnapshot,
} from '@/lib/benchmark-comparison'

interface TestResult {
  name: string
  passed: boolean
  details: string
}

export async function GET() {
  const results: TestResult[] = []

  // ── Test 1: TWR calculation with simple growth ────────────
  try {
    const snapshots: HoldingSnapshot[] = [
      { date: '2024-01-01', totalValue: 10000, totalCost: 10000 },
      { date: '2024-02-01', totalValue: 10500, totalCost: 10000 },
      { date: '2024-03-01', totalValue: 11000, totalCost: 10000 },
    ]
    const twr = calculateTimeWeightedReturn(snapshots)
    results.push({
      name: 'TWR calculation - simple growth',
      passed: Math.abs(twr - 10) < 0.01,
      details: `TWR = ${twr.toFixed(2)}% (expected ~10%)`,
    })
  } catch (e) {
    results.push({ name: 'TWR calculation - simple growth', passed: false, details: String(e) })
  }

  // ── Test 2: TWR calculation with decline ────────────
  try {
    const snapshots: HoldingSnapshot[] = [
      { date: '2024-01-01', totalValue: 10000, totalCost: 10000 },
      { date: '2024-06-01', totalValue: 8500, totalCost: 10000 },
    ]
    const twr = calculateTimeWeightedReturn(snapshots)
    results.push({
      name: 'TWR calculation - decline',
      passed: twr < 0 && Math.abs(twr - (-15)) < 0.01,
      details: `TWR = ${twr.toFixed(2)}% (expected -15%)`,
    })
  } catch (e) {
    results.push({ name: 'TWR calculation - decline', passed: false, details: String(e) })
  }

  // ── Test 3: TWR with single snapshot returns 0 ────────────
  try {
    const snapshots: HoldingSnapshot[] = [
      { date: '2024-01-01', totalValue: 10000, totalCost: 10000 },
    ]
    const twr = calculateTimeWeightedReturn(snapshots)
    results.push({
      name: 'TWR with single snapshot returns 0',
      passed: twr === 0,
      details: `TWR = ${twr}`,
    })
  } catch (e) {
    results.push({ name: 'TWR with single snapshot returns 0', passed: false, details: String(e) })
  }

  // ── Test 4: Normalize to base 100 ────────────
  try {
    const snapshots: HoldingSnapshot[] = [
      { date: '2024-01-01', totalValue: 5000, totalCost: 5000 },
      { date: '2024-02-01', totalValue: 5500, totalCost: 5000 },
      { date: '2024-03-01', totalValue: 6000, totalCost: 5000 },
    ]
    const normalized = normalizeToBase100(snapshots)
    results.push({
      name: 'Normalize to base 100',
      passed:
        normalized.length === 3 &&
        normalized[0].value === 100 &&
        normalized[1].value === 110 &&
        normalized[2].value === 120,
      details: `Values: [${normalized.map(n => n.value).join(', ')}]`,
    })
  } catch (e) {
    results.push({ name: 'Normalize to base 100', passed: false, details: String(e) })
  }

  // ── Test 5: Benchmark data generation is deterministic ────────────
  try {
    const start = new Date('2024-01-01')
    const end = new Date('2024-06-01')
    const data1 = generateBenchmarkData(BENCHMARKS[0], start, end, 0)
    const data2 = generateBenchmarkData(BENCHMARKS[0], start, end, 0)
    const matching = data1.every((d, i) => d.value === data2[i]?.value && d.date === data2[i]?.date)
    results.push({
      name: 'Benchmark data generation is deterministic',
      passed: matching && data1.length > 0,
      details: `Generated ${data1.length} points, deterministic: ${matching}`,
    })
  } catch (e) {
    results.push({ name: 'Benchmark data generation is deterministic', passed: false, details: String(e) })
  }

  // ── Test 6: Different benchmarks produce different data ────────────
  try {
    const start = new Date('2024-01-01')
    const end = new Date('2024-12-01')
    const aex = generateBenchmarkData(BENCHMARKS[0], start, end, 0)
    const sp500 = generateBenchmarkData(BENCHMARKS[2], start, end, 2)
    const different = aex.some((d, i) => d.value !== sp500[i]?.value)
    results.push({
      name: 'Different benchmarks produce different data',
      passed: different,
      details: `AEX end: ${aex[aex.length - 1]?.value}, S&P 500 end: ${sp500[sp500.length - 1]?.value}`,
    })
  } catch (e) {
    results.push({ name: 'Different benchmarks produce different data', passed: false, details: String(e) })
  }

  // ── Test 7: Benchmark data starts at 100 ────────────
  try {
    const start = new Date('2024-01-01')
    const end = new Date('2024-12-01')
    const allStart100 = BENCHMARKS.every((bench, idx) => {
      const data = generateBenchmarkData(bench, start, end, idx)
      return data.length > 0 && data[0].value === 100
    })
    results.push({
      name: 'All benchmarks start at 100',
      passed: allStart100,
      details: `All start at 100: ${allStart100}`,
    })
  } catch (e) {
    results.push({ name: 'All benchmarks start at 100', passed: false, details: String(e) })
  }

  // ── Test 8: compareToBenchmarks produces valid result ────────────
  try {
    const snapshots: HoldingSnapshot[] = [
      { date: '2024-01-01', totalValue: 10000, totalCost: 10000 },
      { date: '2024-02-01', totalValue: 10300, totalCost: 10000 },
      { date: '2024-03-01', totalValue: 10500, totalCost: 10000 },
      { date: '2024-04-01', totalValue: 10800, totalCost: 10000 },
      { date: '2024-05-01', totalValue: 11000, totalCost: 10000 },
      { date: '2024-06-01', totalValue: 11200, totalCost: 10000 },
    ]
    const period = TIME_PERIODS.find(p => p.id === 'all')!
    const result = compareToBenchmarks(snapshots, period)
    results.push({
      name: 'compareToBenchmarks produces valid result',
      passed:
        result !== null &&
        result.portfolio.returnPct > 0 &&
        result.benchmarks.length === 3 &&
        result.portfolio.dataPoints.length > 0,
      details: result
        ? `Portfolio: ${result.portfolio.returnPct}%, Benchmarks: ${result.benchmarks.map(b => `${b.name}: ${b.returnPct}%`).join(', ')}`
        : 'null result',
    })
  } catch (e) {
    results.push({ name: 'compareToBenchmarks produces valid result', passed: false, details: String(e) })
  }

  // ── Test 9: Alpha calculation ────────────
  try {
    const snapshots: HoldingSnapshot[] = [
      { date: '2024-01-01', totalValue: 10000, totalCost: 10000 },
      { date: '2024-12-01', totalValue: 12000, totalCost: 10000 },
    ]
    const period = TIME_PERIODS.find(p => p.id === 'all')!
    const result = compareToBenchmarks(snapshots, period)
    const hasAlpha = result?.benchmarks.every(b => typeof b.alpha === 'number') ?? false
    // Alpha = portfolio return - benchmark return
    const portfolioReturn = result?.portfolio.returnPct ?? 0
    const alphaCheck = result?.benchmarks.every(b =>
      Math.abs(b.alpha - (portfolioReturn - b.returnPct)) < 0.1
    ) ?? false
    results.push({
      name: 'Alpha calculation is correct',
      passed: hasAlpha && alphaCheck,
      details: result
        ? `Portfolio: ${portfolioReturn}%, Alphas: ${result.benchmarks.map(b => `${b.name}: ${b.alpha}%`).join(', ')}`
        : 'no result',
    })
  } catch (e) {
    results.push({ name: 'Alpha calculation is correct', passed: false, details: String(e) })
  }

  // ── Test 10: getAlphaDescription positive ────────────
  try {
    const desc = getAlphaDescription(5.5)
    results.push({
      name: 'Alpha description - positive',
      passed: desc.color === 'text-emerald-600' && desc.text.includes('5.5%') && desc.text.includes('beter'),
      details: `${desc.text} (${desc.color})`,
    })
  } catch (e) {
    results.push({ name: 'Alpha description - positive', passed: false, details: String(e) })
  }

  // ── Test 11: getAlphaDescription negative ────────────
  try {
    const desc = getAlphaDescription(-3.2)
    results.push({
      name: 'Alpha description - negative',
      passed: desc.color === 'text-red-600' && desc.text.includes('3.2%') && desc.text.includes('slechter'),
      details: `${desc.text} (${desc.color})`,
    })
  } catch (e) {
    results.push({ name: 'Alpha description - negative', passed: false, details: String(e) })
  }

  // ── Test 12: getAlphaDescription zero ────────────
  try {
    const desc = getAlphaDescription(0)
    results.push({
      name: 'Alpha description - zero',
      passed: desc.color === 'text-zinc-600' && desc.text.includes('gelijk'),
      details: `${desc.text} (${desc.color})`,
    })
  } catch (e) {
    results.push({ name: 'Alpha description - zero', passed: false, details: String(e) })
  }

  // ── Test 13: Build portfolio history from holdings ────────────
  try {
    const holdings = [
      {
        id: 'h1',
        units: 10,
        avg_purchase_price: 100,
        current_price: 120,
        purchase_date: '2024-01-15',
        created_at: '2024-01-15T00:00:00Z',
      },
    ]
    const history = buildPortfolioHistory(holdings, [], [])
    results.push({
      name: 'Build portfolio history from holdings',
      passed: history.length > 0 && history[0].totalValue > 0,
      details: `Generated ${history.length} monthly snapshots, first: €${history[0]?.totalValue}`,
    })
  } catch (e) {
    results.push({ name: 'Build portfolio history from holdings', passed: false, details: String(e) })
  }

  // ── Test 14: Build portfolio history with transactions ────────────
  try {
    const holdings = [
      {
        id: 'h2',
        units: 20,
        avg_purchase_price: 50,
        current_price: 60,
        purchase_date: '2024-01-01',
        created_at: '2024-01-01T00:00:00Z',
      },
    ]
    const transactions = [
      { holding_id: 'h2', type: 'buy' as const, units: 10, price_per_unit: 50, date: '2024-01-15' },
      { holding_id: 'h2', type: 'buy' as const, units: 10, price_per_unit: 55, date: '2024-03-01' },
    ]
    const history = buildPortfolioHistory(holdings, [], transactions)
    results.push({
      name: 'Build portfolio history with transactions',
      passed: history.length >= 2,
      details: `Generated ${history.length} snapshots`,
    })
  } catch (e) {
    results.push({ name: 'Build portfolio history with transactions', passed: false, details: String(e) })
  }

  // ── Test 15: TIME_PERIODS includes all required periods ────────────
  try {
    const requiredIds = ['1m', '3m', '6m', '1y', 'ytd', 'all']
    const hasAll = requiredIds.every(id => TIME_PERIODS.some(p => p.id === id))
    results.push({
      name: 'TIME_PERIODS includes 1M, 3M, 6M, 1Y, YTD, All',
      passed: hasAll,
      details: `Periods: ${TIME_PERIODS.map(p => p.label).join(', ')}`,
    })
  } catch (e) {
    results.push({ name: 'TIME_PERIODS includes all required periods', passed: false, details: String(e) })
  }

  // ── Test 16: BENCHMARKS includes AEX, MSCI World, S&P 500 ────────────
  try {
    const hasAex = BENCHMARKS.some(b => b.id === 'aex')
    const hasMsci = BENCHMARKS.some(b => b.id === 'msci_world')
    const hasSp500 = BENCHMARKS.some(b => b.id === 'sp500')
    results.push({
      name: 'BENCHMARKS includes AEX, MSCI World, S&P 500',
      passed: hasAex && hasMsci && hasSp500,
      details: `AEX: ${hasAex}, MSCI World: ${hasMsci}, S&P 500: ${hasSp500}`,
    })
  } catch (e) {
    results.push({ name: 'BENCHMARKS includes AEX, MSCI World, S&P 500', passed: false, details: String(e) })
  }

  // ── Test 17: Empty holdings returns null comparison ────────────
  try {
    const history = buildPortfolioHistory([], [], [])
    const period = TIME_PERIODS.find(p => p.id === 'all')!
    const result = compareToBenchmarks(history, period)
    results.push({
      name: 'Empty holdings returns null comparison',
      passed: result === null,
      details: `Result: ${result}`,
    })
  } catch (e) {
    results.push({ name: 'Empty holdings returns null comparison', passed: false, details: String(e) })
  }

  // ── Test 18: YTD period calculation ────────────
  try {
    const now = new Date()
    const ytdStart = new Date(now.getFullYear(), 0, 1)
    const snapshots: HoldingSnapshot[] = []
    // Generate monthly snapshots from start of year
    let value = 10000
    const current = new Date(ytdStart)
    while (current <= now) {
      snapshots.push({
        date: current.toISOString().split('T')[0],
        totalValue: value,
        totalCost: 10000,
      })
      value += 200
      current.setMonth(current.getMonth() + 1)
    }

    const ytdPeriod = TIME_PERIODS.find(p => p.id === 'ytd')!
    const result = compareToBenchmarks(snapshots, ytdPeriod)
    results.push({
      name: 'YTD period calculation',
      passed: result !== null && result.portfolio.returnPct >= 0,
      details: result
        ? `YTD return: ${result.portfolio.returnPct}%`
        : 'null result (may be too early in the year)',
    })
  } catch (e) {
    results.push({ name: 'YTD period calculation', passed: false, details: String(e) })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    results,
  })
}
