import { NextResponse } from 'next/server'
import {
  computeAllocationSlices,
  computeRebalancingSuggestions,
  type HoldingForAllocation,
  type TargetAllocation,
} from '@/lib/portfolio-allocation'

type TestResult = { name: string; pass: boolean; details: string }

export async function GET() {
  const results: TestResult[] = []

  // ── Test holdings data ──────────────────────────────────
  const testHoldings: HoldingForAllocation[] = [
    { id: '1', name: 'VWRL ETF', ticker: 'VWRL', value: 5000, asset_class: 'aandelen', sector: 'breed', geography: 'wereld' },
    { id: '2', name: 'iShares MSCI EM', ticker: 'IEMA', value: 2000, asset_class: 'aandelen', sector: 'breed', geography: 'opkomend' },
    { id: '3', name: 'iShares Euro Govt Bond', ticker: 'IBGL', value: 1500, asset_class: 'obligaties', sector: 'financials', geography: 'europa' },
    { id: '4', name: 'Bitcoin', ticker: 'BTC', value: 800, asset_class: 'crypto', sector: 'anders', geography: 'anders' },
    { id: '5', name: 'VanEck Real Estate', ticker: 'TRET', value: 700, asset_class: 'vastgoed', sector: 'vastgoed', geography: 'europa' },
  ]
  const totalValue = testHoldings.reduce((s, h) => s + h.value, 0)

  // ── Test 1: Donut chart - allocation by asset class ────
  const assetClassSlices = computeAllocationSlices(testHoldings, 'asset_class')
  results.push({
    name: 'Donut chart: allocation by asset class computed correctly',
    pass: assetClassSlices.length === 4 && assetClassSlices.every(s => s.pct > 0),
    details: `${assetClassSlices.length} categories: ${assetClassSlices.map(s => `${s.label} ${s.pct.toFixed(1)}%`).join(', ')}`,
  })

  // ── Test 2: Percentages sum to 100 ──────────────────────
  const pctSum = assetClassSlices.reduce((s, sl) => s + sl.pct, 0)
  results.push({
    name: 'Percentages sum to 100%',
    pass: Math.abs(pctSum - 100) < 0.5,
    details: `Sum: ${pctSum.toFixed(2)}%`,
  })

  // ── Test 3: Sorted by value descending ────────────────
  const isSorted = assetClassSlices.every((s, i) =>
    i === 0 || assetClassSlices[i - 1].value >= s.value,
  )
  results.push({
    name: 'Slices sorted by value descending',
    pass: isSorted,
    details: assetClassSlices.map(s => `${s.label}: ${s.value}`).join(' > '),
  })

  // ── Test 4: Sector view mode ──────────────────────────
  const sectorSlices = computeAllocationSlices(testHoldings, 'sector')
  results.push({
    name: 'Sector view: groups holdings by sector',
    pass: sectorSlices.length >= 3,
    details: `${sectorSlices.length} sectors: ${sectorSlices.map(s => s.label).join(', ')}`,
  })

  // ── Test 5: Geography view mode ───────────────────────
  const geoSlices = computeAllocationSlices(testHoldings, 'geography')
  results.push({
    name: 'Geography view: groups holdings by geography',
    pass: geoSlices.length >= 3,
    details: `${geoSlices.length} regions: ${geoSlices.map(s => s.label).join(', ')}`,
  })

  // ── Test 6: Asset class - aandelen is 70% (5000+2000 / 10000) ──
  const aandelenSlice = assetClassSlices.find(s => s.key === 'aandelen')
  results.push({
    name: 'Asset class: aandelen = 70% (7000/10000)',
    pass: !!aandelenSlice && Math.abs(aandelenSlice.pct - 70) < 0.5,
    details: `aandelen pct: ${aandelenSlice?.pct.toFixed(1)}%`,
  })

  // ── Test 7: Holding count per slice ────────────────────
  results.push({
    name: 'Holding count tracked per slice',
    pass: !!aandelenSlice && aandelenSlice.holdingCount === 2,
    details: `aandelen holdingCount: ${aandelenSlice?.holdingCount}`,
  })

  // ── Test 8: Empty holdings handled ────────────────────
  const emptySlices = computeAllocationSlices([], 'asset_class')
  results.push({
    name: 'Empty holdings returns empty slices',
    pass: emptySlices.length === 0,
    details: `slices: ${emptySlices.length}`,
  })

  // ── Test 9: Unclassified holdings → "anders" ──────────
  const unclassifiedHoldings: HoldingForAllocation[] = [
    { id: 'u1', name: 'Unknown Fund', ticker: null, value: 1000 },
    { id: 'u2', name: 'Mystery ETF', ticker: null, value: 500 },
  ]
  const unclassifiedSlices = computeAllocationSlices(unclassifiedHoldings, 'asset_class')
  results.push({
    name: 'Unclassified holdings grouped as "anders"',
    pass: unclassifiedSlices.length === 1 && unclassifiedSlices[0].key === 'anders',
    details: `key: ${unclassifiedSlices[0]?.key}, count: ${unclassifiedSlices[0]?.holdingCount}`,
  })

  // ── Test 10: Current vs target comparison ─────────────
  const targets: TargetAllocation[] = [
    { category: 'aandelen', target_pct: 60 },
    { category: 'obligaties', target_pct: 20 },
    { category: 'vastgoed', target_pct: 10 },
    { category: 'crypto', target_pct: 5 },
    { category: 'cash', target_pct: 5 },
  ]
  const suggestions = computeRebalancingSuggestions(assetClassSlices, targets, totalValue)
  results.push({
    name: 'Current vs target: generates rebalancing suggestions',
    pass: suggestions.length > 0,
    details: `${suggestions.length} suggestions: ${suggestions.map(s => `${s.label} ${s.action} ${s.drift > 0 ? '+' : ''}${s.drift}%`).join(', ')}`,
  })

  // ── Test 11: Rebalancing detects aandelen overweight ──
  // Aandelen is 70% but target is 60%, so should suggest sell
  const aandelenSuggestion = suggestions.find(s => s.category === 'aandelen')
  results.push({
    name: 'Rebalancing: aandelen overweight → sell suggestion',
    pass: !!aandelenSuggestion && aandelenSuggestion.action === 'sell' && aandelenSuggestion.drift > 0,
    details: `aandelen: ${aandelenSuggestion?.action}, drift: ${aandelenSuggestion?.drift}%`,
  })

  // ── Test 12: Rebalancing detects obligaties underweight ──
  // Obligaties is 15% but target is 20%, so should suggest buy
  const obligatiesSuggestion = suggestions.find(s => s.category === 'obligaties')
  results.push({
    name: 'Rebalancing: obligaties underweight → buy suggestion',
    pass: !!obligatiesSuggestion && obligatiesSuggestion.action === 'buy' && obligatiesSuggestion.drift < 0,
    details: `obligaties: ${obligatiesSuggestion?.action}, drift: ${obligatiesSuggestion?.drift}%`,
  })

  // ── Test 13: Rebalancing "hold" when within 2% threshold ──
  const cashSuggestion = suggestions.find(s => s.category === 'cash')
  // Cash has 0% allocation and target 5%, drift is -5%, so it should be "buy"
  results.push({
    name: 'Rebalancing: cash missing entirely → buy suggestion',
    pass: !!cashSuggestion && cashSuggestion.action === 'buy',
    details: `cash: ${cashSuggestion?.action}, drift: ${cashSuggestion?.drift}%`,
  })

  // ── Test 14: Rebalancing amount calculation ───────────
  // aandelen is 70% target 60% = 10% drift * 10000 = 1000
  results.push({
    name: 'Rebalancing: amount correctly computed from drift',
    pass: !!aandelenSuggestion && aandelenSuggestion.amount === 1000,
    details: `aandelen amount: ${aandelenSuggestion?.amount} (expected 1000)`,
  })

  // ── Test 15: No suggestions when no targets ───────────
  const noTargetSuggestions = computeRebalancingSuggestions(assetClassSlices, [], totalValue)
  results.push({
    name: 'No suggestions when no targets defined',
    pass: noTargetSuggestions.length === 0,
    details: `suggestions: ${noTargetSuggestions.length}`,
  })

  // ── Test 16: Each slice has unique color ──────────────
  const colors = assetClassSlices.map(s => s.color)
  const uniqueColors = new Set(colors)
  results.push({
    name: 'Each allocation slice gets a unique color',
    pass: uniqueColors.size === assetClassSlices.length,
    details: `${uniqueColors.size} unique colors for ${assetClassSlices.length} slices`,
  })

  const allPass = results.every((r) => r.pass)

  return NextResponse.json({
    feature: '#230 Portfolio allocation visualization',
    all_pass: allPass,
    passing: results.filter((r) => r.pass).length,
    total: results.length,
    results,
  })
}
