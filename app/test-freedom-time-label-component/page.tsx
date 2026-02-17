'use client'

import { useEffect, useState } from 'react'
import {
  FreedomTimeLabel,
  FreedomTimeBadge,
  DailyExpenseProvider,
  useDailyExpenseRate,
} from '@/components/app/freedom-time-label'

function TestContent() {
  const { dailyExpenseRate, loading, source, dataMonths } = useDailyExpenseRate()
  const [verifyData, setVerifyData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    fetch('/api/verify-freedom-time-label-component')
      .then(r => r.json())
      .then(setVerifyData)
      .catch(() => setVerifyData({ error: 'Failed to fetch' }))
  }, [])

  const testAmounts = [50, 99, 100, 500, 1000, 5000, 10000, 50000, 100000, 250000]

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold text-zinc-900">Feature #210 — FreedomTimeLabel Reusable Component</h1>
      <p className="text-sm text-zinc-500" data-testid="feature-description">
        Build FreedomTimeLabel as reusable component that shows EUR + freedom time side by side.
        Uses formatWithFreedom() utility internally. Subtle styling: text-sm, italic, font-normal, text-zinc-500.
      </p>

      {/* Context Status */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">Daily Expense Context</h2>
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
            <span className="font-mono font-semibold" data-testid="daily-rate">
              €{dailyExpenseRate.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Data Months:</span>{' '}
            <span className="font-mono">{dataMonths}</span>
          </div>
        </div>
      </section>

      {/* Test: Accepts dailyExpenses prop directly */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="direct-prop-test">
        <h2 className="font-semibold text-zinc-900 mb-4">Test: dailyExpenses as direct prop (€100/day)</h2>
        <p className="text-xs text-zinc-400 mb-3">
          These use dailyExpenses=100 prop instead of context, verifying the prop override works.
        </p>
        <div className="space-y-3">
          {testAmounts.map(amount => (
            <div key={amount} className="flex items-center justify-between border-b border-zinc-50 pb-2">
              <span className="text-sm text-zinc-500">€{amount.toLocaleString('nl-NL')}</span>
              <FreedomTimeLabel amount={amount} dailyExpenses={100} showIcon />
            </div>
          ))}
        </div>
      </section>

      {/* Test: Short vs Long format */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="format-test">
        <h2 className="font-semibold text-zinc-900 mb-4">Test: Short vs Long format</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-zinc-400 mb-1">Short format (default):</p>
            <FreedomTimeLabel amount={50000} dailyExpenses={100} format="short" showIcon />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Long format:</p>
            <FreedomTimeLabel amount={50000} dailyExpenses={100} format="long" showIcon />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Short format, large amount:</p>
            <FreedomTimeLabel amount={250000} dailyExpenses={100} format="short" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Long format, large amount:</p>
            <FreedomTimeLabel amount={250000} dailyExpenses={100} format="long" />
          </div>
        </div>
      </section>

      {/* Test: Styling verification */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="styling-test">
        <h2 className="font-semibold text-zinc-900 mb-4">Test: Subtle styling (text-sm, italic, font-normal, text-zinc-500)</h2>
        <p className="text-xs text-zinc-400 mb-3">
          The freedom time annotation should be: lighter weight (font-normal), smaller size (text-sm), muted color (zinc-500), italic.
        </p>
        <div className="space-y-4">
          <div className="bg-zinc-50 rounded-lg p-4">
            <p className="text-xs text-zinc-400 mb-1">Inline variant:</p>
            <FreedomTimeLabel amount={25000} dailyExpenses={100} showIcon />
          </div>
          <div className="bg-zinc-50 rounded-lg p-4">
            <p className="text-xs text-zinc-400 mb-1">Block variant:</p>
            <FreedomTimeLabel amount={25000} dailyExpenses={100} variant="block" showIcon />
          </div>
          <div className="bg-zinc-50 rounded-lg p-4">
            <p className="text-xs text-zinc-400 mb-1">Different sizes:</p>
            <div className="space-y-2">
              <div><span className="text-xs text-zinc-300 mr-2">xs:</span><FreedomTimeLabel amount={25000} dailyExpenses={100} size="xs" /></div>
              <div><span className="text-xs text-zinc-300 mr-2">sm:</span><FreedomTimeLabel amount={25000} dailyExpenses={100} size="sm" /></div>
              <div><span className="text-xs text-zinc-300 mr-2">base:</span><FreedomTimeLabel amount={25000} dailyExpenses={100} size="base" /></div>
            </div>
          </div>
        </div>
      </section>

      {/* Test: €100 threshold */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="threshold-test">
        <h2 className="font-semibold text-zinc-900 mb-4">Test: €100 threshold</h2>
        <p className="text-xs text-zinc-400 mb-3">
          Freedom time should only appear for amounts ≥ €100. Below that, only the EUR amount is shown.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-4 border-b border-zinc-50 pb-2">
            <span className="text-xs text-zinc-400 w-16">€50:</span>
            <FreedomTimeLabel amount={50} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show only EUR)</span>
          </div>
          <div className="flex items-center gap-4 border-b border-zinc-50 pb-2">
            <span className="text-xs text-zinc-400 w-16">€99:</span>
            <FreedomTimeLabel amount={99} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show only EUR)</span>
          </div>
          <div className="flex items-center gap-4 border-b border-zinc-50 pb-2">
            <span className="text-xs text-zinc-400 w-16">€100:</span>
            <FreedomTimeLabel amount={100} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show EUR + freedom time)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-400 w-16">€500:</span>
            <FreedomTimeLabel amount={500} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show EUR + freedom time)</span>
          </div>
        </div>
      </section>

      {/* Verification Tests */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="verification-tests">
        <h2 className="font-semibold text-zinc-900 mb-4">Feature #210 Verification Tests</h2>
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

export default function TestFreedomTimeLabelComponentPage() {
  return (
    <DailyExpenseProvider>
      <TestContent />
    </DailyExpenseProvider>
  )
}
