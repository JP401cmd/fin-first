'use client'

import { useState, useMemo, useEffect } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import { Plus, Trash2, Check, X as XIcon } from 'lucide-react'
import PortfolioAllocationVisualization from '@/components/app/portfolio-allocation-chart'
import {
  type HoldingForAllocation,
  computeAllocationSlices,
  computeRebalancingSuggestions,
  ASSET_CLASS_LABELS,
  SECTOR_LABELS,
  GEOGRAPHY_LABELS,
  DEFAULT_TARGETS,
} from '@/lib/portfolio-allocation'

// ── Types ────────────────────────────────────────────────────

type TestResult = { name: string; pass: boolean; details: string }

// ── Demo holdings with full classification ────────────────────

const DEMO_HOLDINGS: HoldingForAllocation[] = [
  { id: '1', name: 'VWRL ETF', ticker: 'VWRL', value: 5000, asset_class: 'aandelen', sector: 'breed', geography: 'wereld' },
  { id: '2', name: 'iShares MSCI EM', ticker: 'IEMA', value: 2000, asset_class: 'aandelen', sector: 'breed', geography: 'opkomend' },
  { id: '3', name: 'iShares Euro Govt Bond', ticker: 'IBGL', value: 1500, asset_class: 'obligaties', sector: 'financials', geography: 'europa' },
  { id: '4', name: 'Bitcoin', ticker: 'BTC', value: 800, asset_class: 'crypto', sector: 'anders', geography: 'anders' },
  { id: '5', name: 'VanEck Real Estate', ticker: 'TRET', value: 700, asset_class: 'vastgoed', sector: 'vastgoed', geography: 'europa' },
]

const UNCLASSIFIED_HOLDINGS: HoldingForAllocation[] = [
  { id: 'u1', name: 'Unknown Fund', ticker: null, value: 1000 },
  { id: 'u2', name: 'Mystery ETF', ticker: null, value: 500 },
]

// ── Run verification tests ────────────────────────────────────

function runTests(): TestResult[] {
  const results: TestResult[] = []
  const totalValue = DEMO_HOLDINGS.reduce((s, h) => s + h.value, 0)

  // Test 1: Asset class slices
  const acSlices = computeAllocationSlices(DEMO_HOLDINGS, 'asset_class')
  results.push({
    name: 'Asset class view: groups by asset class',
    pass: acSlices.length === 4,
    details: `${acSlices.length} categories: ${acSlices.map(s => s.label).join(', ')}`,
  })

  // Test 2: Percentages sum to 100
  const pctSum = acSlices.reduce((s, sl) => s + sl.pct, 0)
  results.push({
    name: 'Percentages sum to 100%',
    pass: Math.abs(pctSum - 100) < 0.5,
    details: `Sum: ${pctSum.toFixed(2)}%`,
  })

  // Test 3: Sector view
  const sectorSlices = computeAllocationSlices(DEMO_HOLDINGS, 'sector')
  results.push({
    name: 'Sector view: groups holdings by sector',
    pass: sectorSlices.length >= 3,
    details: `${sectorSlices.length} sectors`,
  })

  // Test 4: Geography view
  const geoSlices = computeAllocationSlices(DEMO_HOLDINGS, 'geography')
  results.push({
    name: 'Geography view: groups by geography',
    pass: geoSlices.length >= 3,
    details: `${geoSlices.length} regions`,
  })

  // Test 5: Rebalancing suggestions
  const suggestions = computeRebalancingSuggestions(acSlices, DEFAULT_TARGETS.asset_class, totalValue)
  results.push({
    name: 'Rebalancing: generates suggestions from target drift',
    pass: suggestions.length > 0,
    details: `${suggestions.length} suggestions`,
  })

  // Test 6: Unclassified holdings
  const unclSlices = computeAllocationSlices(UNCLASSIFIED_HOLDINGS, 'asset_class')
  results.push({
    name: 'Unclassified holdings → "anders" category',
    pass: unclSlices.length === 1 && unclSlices[0].key === 'anders',
    details: `${unclSlices.length} slice(s), key=${unclSlices[0]?.key}`,
  })

  return results
}

// ── Editable holding form ────────────────────────────────────

function HoldingEditor({
  holdings,
  setHoldings,
}: {
  holdings: HoldingForAllocation[]
  setHoldings: (h: HoldingForAllocation[]) => void
}) {
  const [nextId, setNextId] = useState(100)

  function addHolding() {
    const id = String(nextId)
    setNextId(nextId + 1)
    setHoldings([
      ...holdings,
      {
        id,
        name: `New Holding ${id}`,
        ticker: `NH${id}`,
        value: 1000,
        asset_class: 'aandelen',
        sector: 'breed',
        geography: 'wereld',
      },
    ])
  }

  function removeHolding(id: string) {
    setHoldings(holdings.filter((h) => h.id !== id))
  }

  function updateHolding(id: string, field: keyof HoldingForAllocation, value: string | number) {
    setHoldings(
      holdings.map((h) =>
        h.id === id ? { ...h, [field]: value } : h,
      ),
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-700">Holdings bewerken</h2>
        <button
          onClick={addHolding}
          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          data-testid="add-holding"
        >
          <Plus className="h-3.5 w-3.5" /> Toevoegen
        </button>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {holdings.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 p-2.5">
            <div className="flex-1 grid grid-cols-5 gap-2">
              <input
                value={h.name}
                onChange={(e) => updateHolding(h.id, 'name', e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs"
                placeholder="Naam"
              />
              <input
                type="number"
                value={h.value}
                onChange={(e) => updateHolding(h.id, 'value', Number(e.target.value))}
                className="rounded border border-zinc-200 px-2 py-1 text-xs"
                placeholder="Waarde"
              />
              <select
                value={h.asset_class || 'anders'}
                onChange={(e) => updateHolding(h.id, 'asset_class', e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs"
              >
                {Object.entries(ASSET_CLASS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={h.sector || 'anders'}
                onChange={(e) => updateHolding(h.id, 'sector', e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs"
              >
                {Object.entries(SECTOR_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={h.geography || 'anders'}
                onChange={(e) => updateHolding(h.id, 'geography', e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs"
              >
                {Object.entries(GEOGRAPHY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => removeHolding(h.id)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Test Page ───────────────────────────────────────────

export default function TestPortfolioAllocation() {
  const [holdings, setHoldings] = useState<HoldingForAllocation[]>(DEMO_HOLDINGS)
  const totalValue = holdings.reduce((s, h) => s + h.value, 0)

  const testResults = useMemo(() => runTests(), [])
  const allPass = testResults.every((t) => t.pass)

  // API verification results
  const [apiResults, setApiResults] = useState<{ all_pass: boolean; passing: number; total: number; results: TestResult[] } | null>(null)
  const [apiLoading, setApiLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-portfolio-allocation-viz')
      .then((r) => r.json())
      .then((data) => setApiResults(data))
      .catch(() => setApiResults(null))
      .finally(() => setApiLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900 mb-2">Feature #230: Portfolio Allocation Visualization</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Donut chart with allocation by sector, geography, asset class. Current vs target comparison. Rebalancing suggestions.
      </p>

      {/* Client-side test results */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          Client Tests: {allPass ? '✅ ALL PASS' : '❌ SOME FAILING'}
        </h2>
        <div className="space-y-2" data-testid="test-results">
          {testResults.map((t, i) => (
            <div key={i} className="flex items-center gap-2" data-testid={`test-${i}`} data-pass={t.pass}>
              {t.pass ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <XIcon className="h-4 w-4 text-red-600 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-700">{t.name}</span>
              <span className="text-xs text-zinc-400 ml-auto">{t.details}</span>
            </div>
          ))}
        </div>
      </section>

      {/* API verification results */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          API Tests: {apiLoading ? '⏳ Loading...' : apiResults?.all_pass ? '✅ ALL PASS' : '❌ SOME FAILING'}
        </h2>
        {apiResults && (
          <>
            <p className="text-xs text-zinc-500 mb-3">
              {apiResults.passing}/{apiResults.total} passing
            </p>
            <div className="space-y-2">
              {apiResults.results.map((t, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`api-test-${i}`} data-pass={t.pass}>
                  {t.pass ? (
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XIcon className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span className="text-xs font-medium text-zinc-700">{t.name}</span>
                  <span className="text-xs text-zinc-400 ml-auto truncate max-w-xs">{t.details}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-3 rounded-lg p-2 text-center text-sm font-semibold" data-testid="all-pass" data-value={allPass && apiResults?.all_pass}>
          {allPass && apiResults?.all_pass ? (
            <span className="text-emerald-700 bg-emerald-50 rounded-lg px-4 py-2 inline-block">
              all_pass: true — Portfolio allocation visualization works correctly
            </span>
          ) : (
            <span className="text-red-700 bg-red-50 rounded-lg px-4 py-2 inline-block">
              all_pass: false — Some tests failing
            </span>
          )}
        </div>
      </section>

      {/* Live interactive visualization */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Live Portfolio Allocation Chart</h2>
        <PortfolioAllocationVisualization
          holdings={holdings}
          totalValue={totalValue}
        />
      </section>

      {/* Holdings editor */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 mb-6">
        <HoldingEditor holdings={holdings} setHoldings={setHoldings} />
      </section>

      {/* Scenario: Unclassified holdings */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Scenario: Onge­classificeerde holdings</h2>
        <PortfolioAllocationVisualization
          holdings={UNCLASSIFIED_HOLDINGS}
          totalValue={UNCLASSIFIED_HOLDINGS.reduce((s, h) => s + h.value, 0)}
        />
      </section>

      {/* Scenario: Empty state */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Scenario: Lege portfolio</h2>
        <PortfolioAllocationVisualization
          holdings={[]}
          totalValue={0}
        />
      </section>
    </div>
  )
}
