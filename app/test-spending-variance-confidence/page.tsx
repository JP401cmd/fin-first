'use client'

import { useEffect, useState } from 'react'
import {
  calculateSpendingVariance,
  SpendingConfidenceIndicator,
  SpendingConfidenceBadge,
  SpendingVarianceDetailPanel,
  getVarianceConfidenceLabel,
  type SpendingVarianceData,
} from '@/components/app/spending-confidence-indicator'

type TestResult = { id: number; name: string; pass: boolean; detail: string }
type VerifyResponse = { passing: number; total: number; percentage: number; results: TestResult[] }

export default function TestSpendingVarianceConfidencePage() {
  const [verifyResults, setVerifyResults] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-spending-variance-confidence')
      .then(r => r.json())
      .then(data => { setVerifyResults(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  // Example data for visual demos
  const highConfidence = calculateSpendingVariance(
    [420, 430, 410, 425, 415, 422, 418, 428, 412, 435, 410, 420],
    'Boodschappen'
  )
  const mediumConfidence = calculateSpendingVariance(
    [350, 520, 420, 380, 490, 445, 360, 510, 400, 470, 390, 440],
    'Vervoer'
  )
  const lowConfidence = calculateSpendingVariance(
    [150, 800, 250, 1200, 100, 600, 50, 950, 300, 1100, 200, 700],
    'Leuke dingen'
  )
  const insufficientData = calculateSpendingVariance(
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 120, 150],
    'Nieuwe categorie'
  )

  const demos: SpendingVarianceData[] = [highConfidence, mediumConfidence, lowConfidence, insufficientData]

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Feature #251: Spending Variance Confidence Indicator</h1>
          <p className="text-zinc-500 mt-1">
            Verifies: stdDev calculation, confidence mapping, visual components, forecast integration, insufficient data handling
          </p>
        </div>

        {/* API Verification Results */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Verification Tests</h2>
          {loading && <p className="text-zinc-400 italic">Loading verification results...</p>}
          {error && <p className="text-red-600">{error}</p>}
          {verifyResults && (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div className={`text-3xl font-bold ${verifyResults.passing === verifyResults.total ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {verifyResults.passing}/{verifyResults.total}
                </div>
                <div className="text-sm text-zinc-500">
                  {verifyResults.percentage}% passing
                </div>
              </div>
              <div className="space-y-1">
                {verifyResults.results.map(r => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${r.pass ? 'bg-emerald-50' : 'bg-red-50'}`}
                    data-testid={`test-result-${r.id}`}
                    data-pass={r.pass}
                  >
                    <span>{r.pass ? '✅' : '❌'}</span>
                    <span className={`font-medium ${r.pass ? 'text-emerald-700' : 'text-red-700'}`}>
                      #{r.id}: {r.name}
                    </span>
                    <span className="text-zinc-400 text-xs ml-auto">{r.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Visual Component Demos */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Visual Component Demos</h2>

          {/* Signal Bar Indicators */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-600 uppercase mb-3">SpendingConfidenceIndicator (Signal Bars)</h3>
            <div className="grid grid-cols-4 gap-4">
              {demos.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-zinc-50">
                  <SpendingConfidenceIndicator data={d} size="lg" showPercent showLabel />
                  <p className="text-xs text-zinc-500">{d.categoryName}</p>
                  <p className="text-[10px] text-zinc-400">
                    CV: {(d.cv * 100).toFixed(1)}% | Months: {d.monthsOfData}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Compact Badges */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-600 uppercase mb-3">SpendingConfidenceBadge (Compact Pill)</h3>
            <div className="flex flex-wrap gap-3">
              {demos.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <SpendingConfidenceBadge data={d} />
                  <span className="text-xs text-zinc-400">{d.categoryName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detail Panels */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-600 uppercase mb-3">SpendingVarianceDetailPanel (Full Breakdown)</h3>
            <div className="grid grid-cols-2 gap-4">
              {demos.map((d, i) => (
                <div key={i}>
                  <p className="text-xs text-zinc-500 mb-1">{d.categoryName}</p>
                  <SpendingVarianceDetailPanel data={d} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Data Verification */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Calculated Values</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Mean</th>
                  <th className="py-2 pr-4">StdDev (σ)</th>
                  <th className="py-2 pr-4">CV</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2 pr-4">Percent</th>
                  <th className="py-2 pr-4">Months</th>
                  <th className="py-2">Sufficient</th>
                </tr>
              </thead>
              <tbody>
                {demos.map((d, i) => (
                  <tr key={i} className="border-b border-zinc-100" data-testid={`data-row-${d.confidence}`}>
                    <td className="py-2 pr-4 font-medium">{d.categoryName}</td>
                    <td className="py-2 pr-4">€{d.mean.toFixed(2)}</td>
                    <td className="py-2 pr-4">€{d.stdDev.toFixed(2)}</td>
                    <td className="py-2 pr-4">{(d.cv * 100).toFixed(1)}%</td>
                    <td className="py-2 pr-4">{getVarianceConfidenceLabel(d.confidence)}</td>
                    <td className="py-2 pr-4">{d.confidencePercent}%</td>
                    <td className="py-2 pr-4">{d.monthsOfData}</td>
                    <td className="py-2">{d.hasSufficientData ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
