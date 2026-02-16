'use client'

import { useEffect, useState } from 'react'
import {
  FreedomTimeLabel,
  FreedomTimeBadge,
  DailyExpenseProvider,
  useDailyExpenseRate,
  eurToFreedomTime,
} from '@/components/app/freedom-time-label'

function TestContent() {
  const { dailyExpenseRate, loading, source, dataMonths } = useDailyExpenseRate()
  const [apiData, setApiData] = useState<Record<string, unknown> | null>(null)
  const [verifyData, setVerifyData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    fetch('/api/daily-expense-rate')
      .then(r => r.json())
      .then(setApiData)
      .catch(() => setApiData({ error: 'Failed to fetch' }))

    fetch('/api/verify-freedom-time-labels')
      .then(r => r.json())
      .then(setVerifyData)
      .catch(() => setVerifyData({ error: 'Failed to fetch' }))
  }, [])

  const testAmounts = [50, 100, 500, 1000, 5000, 10000, 50000, 100000, 250000]

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold text-zinc-900">Freedom Time Labels — Test Page</h1>
      <p className="text-sm text-zinc-500">
        Feature #115: FreedomTimeLabel component uses actual user daily expense data
      </p>

      {/* Context Status */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">Daily Expense Context Status</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Loading:</span>{' '}
            <span className={loading ? 'text-amber-600' : 'text-emerald-600'}>
              {loading ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Source:</span>{' '}
            <span className={source === 'transactions' ? 'text-emerald-600 font-semibold' : 'text-red-500'}>
              {source}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Daily Rate:</span>{' '}
            <span className="font-mono font-semibold">€{dailyExpenseRate.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Data Months:</span>{' '}
            <span className="font-mono">{dataMonths}</span>
          </div>
        </div>

        {/* Verification result */}
        <div className="mt-4 pt-4 border-t border-zinc-100">
          <h3 className="font-medium text-zinc-700 mb-2">Source Verification</h3>
          <div className={`rounded-lg p-3 text-sm ${
            source === 'transactions'
              ? 'bg-emerald-50 text-emerald-700'
              : loading
                ? 'bg-amber-50 text-amber-700'
                : 'bg-zinc-50 text-zinc-500'
          }`}>
            {loading
              ? '⏳ Loading expense data from Supabase...'
              : source === 'transactions'
                ? `✅ Using REAL transaction data (${dataMonths} months, €${dailyExpenseRate.toFixed(2)}/day)`
                : '⚠️ No transaction data available — freedom time labels hidden (graceful fallback)'
            }
          </div>
        </div>
      </section>

      {/* API Endpoint Test */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">API Endpoint: /api/daily-expense-rate</h2>
        {apiData ? (
          <pre className="rounded-lg bg-zinc-50 p-4 text-xs font-mono overflow-auto">
            {JSON.stringify(apiData, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-zinc-400">Loading...</p>
        )}
      </section>

      {/* FreedomTimeLabel Demos */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">FreedomTimeLabel Component</h2>
        <div className="space-y-3">
          {testAmounts.map(amount => (
            <div key={amount} className="flex items-center justify-between border-b border-zinc-50 pb-2">
              <span className="text-sm text-zinc-500">€{amount.toLocaleString('nl-NL')}</span>
              <FreedomTimeLabel amount={amount} showIcon />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Note: Amounts under €100 don&apos;t show freedom time (per spec).
        </p>
      </section>

      {/* FreedomTimeBadge Demos */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">FreedomTimeBadge Component</h2>
        <div className="flex flex-wrap gap-3">
          {testAmounts.filter(a => a >= 100).map(amount => (
            <div key={amount} className="text-center">
              <p className="text-xs text-zinc-400 mb-1">€{amount.toLocaleString('nl-NL')}</p>
              <FreedomTimeBadge amount={amount} />
            </div>
          ))}
        </div>
      </section>

      {/* FreedomTimeLabel Variants */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">FreedomTimeLabel Variants</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-zinc-400 mb-1">Inline (default):</p>
            <FreedomTimeLabel amount={25000} showIcon />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Block variant:</p>
            <FreedomTimeLabel amount={25000} variant="block" showIcon />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">No currency (time only via FreedomTimeBadge):</p>
            <FreedomTimeBadge amount={25000} />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Under €100 (should be hidden):</p>
            <FreedomTimeLabel amount={50} showIcon />
            <span className="text-xs text-zinc-300 ml-2">(no freedom time shown)</span>
          </div>
        </div>
      </section>

      {/* Manual Calculation Verification */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">Calculation Verification</h2>
        {dailyExpenseRate > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">
              Daily expense rate: <strong>€{dailyExpenseRate.toFixed(2)}</strong> (from {dataMonths} months of real transactions)
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-100">
                  <th className="py-2">Amount</th>
                  <th>Freedom Days</th>
                  <th>Formatted</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {testAmounts.filter(a => a >= 100).map(amount => {
                  const result = eurToFreedomTime(amount, dailyExpenseRate)
                  const expectedDays = amount / dailyExpenseRate
                  const matches = Math.abs(result.days - Math.round(expectedDays)) <= 1
                  return (
                    <tr key={amount} className="border-b border-zinc-50">
                      <td className="py-1.5">€{amount.toLocaleString('nl-NL')}</td>
                      <td>{result.days}d</td>
                      <td>{result.formatted}</td>
                      <td>{matches ? '✅' : '❌'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            No daily expense rate available — calculations verified via code review.
          </p>
        )}
      </section>

      {/* Verification Tests */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">Feature #115 Verification Tests</h2>
        {verifyData && 'results' in verifyData ? (
          <div className="space-y-2">
            {(verifyData.results as { test: string; passed: boolean; details: string }[]).map((r, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${r.passed ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  <span>{r.passed ? '✅' : '❌'}</span>
                  <span className={`font-medium ${r.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                    {r.test}
                  </span>
                </div>
                <p className={`mt-1 text-xs ${r.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                  {r.details}
                </p>
              </div>
            ))}
            <div className={`mt-4 rounded-lg p-4 text-center font-semibold ${
              verifyData.allPassing ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}>
              {verifyData.summary as string}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Loading verification tests...</p>
        )}
      </section>
    </div>
  )
}

export default function TestFreedomTimeLabelsPage() {
  return (
    <DailyExpenseProvider>
      <TestContent />
    </DailyExpenseProvider>
  )
}
