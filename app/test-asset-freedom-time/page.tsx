'use client'

import { useEffect, useState } from 'react'
import { calculateFreedomTime, formatFreedomTimeString, formatWithFreedom } from '@/lib/format'

type TestResult = {
  test: string
  passed: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  passed: boolean
  score: string
  results: TestResult[]
}

export default function TestAssetFreedomTimePage() {
  const [apiResults, setApiResults] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-asset-freedom-time')
      .then((r) => r.json())
      .then((data) => {
        setApiResults(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Demo calculations
  const dailyExpenses = 100 // EUR per day
  const assetValue = 145000
  const assetReturn = 12000
  const portfolioTotal = 350000

  const valueFreedom = calculateFreedomTime(assetValue, dailyExpenses)
  const returnFreedom = calculateFreedomTime(assetReturn, dailyExpenses)
  const portfolioFreedom = calculateFreedomTime(portfolioTotal, dailyExpenses)

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">
        Feature #183: Freedom-time in asset cards and detail
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Verifies that freedom-time labels appear on asset cards, detail views, KPIs, and the donut chart.
      </p>

      {/* Demo section */}
      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50/50 p-6">
        <h2 className="text-lg font-semibold text-zinc-800">Freedom-time Demo (dailyExpenses = EUR 100/day)</h2>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-white p-4 border border-zinc-200">
            <p className="text-xs font-medium text-zinc-500 uppercase">Asset waarde</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">EUR 145.000</p>
            <p className="mt-0.5 text-xs text-amber-600/70" data-testid="demo-value-freedom">
              {formatFreedomTimeString(valueFreedom, 'long')} vrijheid
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 border border-zinc-200">
            <p className="text-xs font-medium text-zinc-500 uppercase">Rendement</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">+EUR 12.000</p>
            <p className="mt-0.5 text-xs text-emerald-500/70" data-testid="demo-return-freedom">
              {formatFreedomTimeString(returnFreedom, 'short', true)} vrijheid gewonnen
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 border border-zinc-200">
            <p className="text-xs font-medium text-zinc-500 uppercase">Portfolio totaal</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">EUR 350.000</p>
            <p className="mt-0.5 text-xs text-amber-600/70" data-testid="demo-portfolio-freedom">
              {formatFreedomTimeString(portfolioFreedom, 'long')} vrijheid
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-sm text-zinc-700">
            <strong>Card short format:</strong> {formatFreedomTimeString(valueFreedom, 'short', true)} vrijheid
          </p>
          <p className="text-sm text-zinc-700">
            <strong>Full format with currency:</strong> {formatWithFreedom(assetValue, dailyExpenses)}
          </p>
          <p className="text-sm text-zinc-700">
            <strong>Return text:</strong> {formatFreedomTimeString(returnFreedom, 'short', true)} vrijheid gewonnen
          </p>
        </div>
      </section>

      {/* API verification results */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-800">Source Code Verification</h2>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            Verifying...
          </div>
        ) : apiResults ? (
          <div className="mt-4 space-y-2">
            <div className={`rounded-lg p-3 text-sm font-medium ${
              apiResults.passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {apiResults.passed ? '✅' : '❌'} Score: {apiResults.score}
            </div>
            {apiResults.results.map((r, i) => (
              <div key={i} className={`rounded-lg border p-3 ${r.passed ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
                <div className="flex items-center gap-2">
                  <span>{r.passed ? '✅' : '❌'}</span>
                  <span className="text-sm font-medium text-zinc-800">{r.test}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{r.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-red-600">Failed to load verification results</p>
        )}
      </section>
    </div>
  )
}
