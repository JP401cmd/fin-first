'use client'

import { useEffect, useState } from 'react'
import { BudgetSparkline, SparklineWithLabel, calculateTrend, type SparklineDataPoint } from '@/components/app/budget-sparkline'

type TestResult = { name: string; pass: boolean; detail: string }

export default function TestBudgetSparklines212() {
  const [results, setResults] = useState<TestResult[]>([])
  const [passing, setPassing] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-budget-sparklines-212')
      .then(r => r.json())
      .then(data => {
        setResults(data.tests ?? [])
        setPassing(data.passing ?? 0)
        setTotal(data.total ?? 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Sample data for visual demos
  const risingData: SparklineDataPoint[] = [
    { month: '2025-03-01', label: 'mrt', spent: 100 },
    { month: '2025-04-01', label: 'apr', spent: 120 },
    { month: '2025-05-01', label: 'mei', spent: 130 },
    { month: '2025-06-01', label: 'jun', spent: 150 },
    { month: '2025-07-01', label: 'jul', spent: 180 },
    { month: '2025-08-01', label: 'aug', spent: 200 },
    { month: '2025-09-01', label: 'sep', spent: 220 },
    { month: '2025-10-01', label: 'okt', spent: 260 },
    { month: '2025-11-01', label: 'nov', spent: 280 },
    { month: '2025-12-01', label: 'dec', spent: 310 },
    { month: '2026-01-01', label: 'jan', spent: 340 },
    { month: '2026-02-01', label: 'feb', spent: 380 },
  ]

  const fallingData: SparklineDataPoint[] = risingData.map((d, i) => ({
    ...d,
    spent: 380 - (i * 25),
  }))

  const flatData: SparklineDataPoint[] = risingData.map((d, i) => ({
    ...d,
    spent: 200 + [2, -1, 3, -2, 1, -3, 2, 0, -1, 3, -2, 1][i],
  }))

  const sparseData: SparklineDataPoint[] = [
    { month: '2026-01-01', label: 'jan', spent: 150 },
    { month: '2026-02-01', label: 'feb', spent: 200 },
  ]

  const emptyData: SparklineDataPoint[] = []
  const singlePoint: SparklineDataPoint[] = [
    { month: '2026-02-01', label: 'feb', spent: 100 },
  ]

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #212: 12-month budget spending trend sparklines
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Visual test page and verification results
      </p>

      {/* API Verification Results */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-800 mb-3">Verification Tests</h2>
        {loading ? (
          <div className="animate-pulse bg-zinc-100 rounded-lg p-4">Loading...</div>
        ) : (
          <>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium mb-4 ${
              passing === total ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {passing}/{total} tests passing
            </div>
            <div className="space-y-1">
              {results.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                  r.pass ? 'bg-emerald-50' : 'bg-red-50'
                }`}>
                  <span className="shrink-0 text-base">{r.pass ? '✅' : '❌'}</span>
                  <div>
                    <p className="font-medium text-zinc-800">{r.name}</p>
                    <p className="text-zinc-500">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Visual Demo Section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-800 mb-3">Visual Demos</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Rising trend (expenses) - should be RED */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="demo-rising-expense">
            <p className="text-xs font-medium text-zinc-500 mb-2">Rising Expense (should be RED)</p>
            <div className="flex items-center gap-3">
              <BudgetSparkline data={risingData} width={120} height={32} showDots testId="demo-rising-sparkline" />
              <SparklineWithLabel data={risingData} width={80} height={24} testId="demo-rising-label" />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              Trend: {calculateTrend(risingData.map(d => d.spent))} — 12 data points
            </p>
          </div>

          {/* Falling trend (expenses) - should be GREEN */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="demo-falling-expense">
            <p className="text-xs font-medium text-zinc-500 mb-2">Falling Expense (should be GREEN)</p>
            <div className="flex items-center gap-3">
              <BudgetSparkline data={fallingData} width={120} height={32} showDots testId="demo-falling-sparkline" />
              <SparklineWithLabel data={fallingData} width={80} height={24} testId="demo-falling-label" />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              Trend: {calculateTrend(fallingData.map(d => d.spent))} — 12 data points
            </p>
          </div>

          {/* Rising trend (income) - should be GREEN */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="demo-rising-income">
            <p className="text-xs font-medium text-zinc-500 mb-2">Rising Income (should be GREEN)</p>
            <div className="flex items-center gap-3">
              <BudgetSparkline data={risingData} width={120} height={32} isIncome showDots testId="demo-income-sparkline" />
              <SparklineWithLabel data={risingData} width={80} height={24} isIncome testId="demo-income-label" />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              isIncome=true, trend: {calculateTrend(risingData.map(d => d.spent))}
            </p>
          </div>

          {/* Flat trend - should be GRAY */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="demo-flat">
            <p className="text-xs font-medium text-zinc-500 mb-2">Flat Trend (should be GRAY)</p>
            <div className="flex items-center gap-3">
              <BudgetSparkline data={flatData} width={120} height={32} showDots testId="demo-flat-sparkline" />
              <SparklineWithLabel data={flatData} width={80} height={24} testId="demo-flat-label" />
            </div>
          </div>

          {/* Sparse data (2 months) */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="demo-sparse">
            <p className="text-xs font-medium text-zinc-500 mb-2">Sparse Data (2 months)</p>
            <div className="flex items-center gap-3">
              <BudgetSparkline data={sparseData} width={120} height={32} showDots testId="demo-sparse-sparkline" />
              <SparklineWithLabel data={sparseData} width={80} height={24} testId="demo-sparse-label" />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Only 2 data points — still renders</p>
          </div>

          {/* No data (graceful fallback) */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="demo-no-data">
            <p className="text-xs font-medium text-zinc-500 mb-2">No Data (graceful fallback)</p>
            <div className="flex items-center gap-3">
              <BudgetSparkline data={emptyData} width={120} height={32} testId="demo-empty-sparkline" />
              <BudgetSparkline data={singlePoint} width={120} height={32} testId="demo-single-sparkline" />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Empty + single point — shows dashed line</p>
          </div>
        </div>
      </section>
    </div>
  )
}
