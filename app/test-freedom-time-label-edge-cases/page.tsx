'use client'

import { useEffect, useState } from 'react'
import {
  FreedomTimeLabel,
  DailyExpenseProvider,
} from '@/components/app/freedom-time-label'

function TestContent() {
  const [verifyData, setVerifyData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    fetch('/api/verify-freedom-time-label-edge-cases')
      .then(r => r.json())
      .then(setVerifyData)
      .catch(() => setVerifyData({ error: 'Failed to fetch' }))
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold text-zinc-900">
        Feature #244 — FreedomTimeLabel Edge Cases
      </h1>
      <p className="text-sm text-zinc-500" data-testid="feature-description">
        Verify formatWithFreedom() handles all edge cases: zero daily expenses, negative net worth,
        amounts under €100, very large amounts, and NaN/undefined inputs.
      </p>

      {/* Edge Case 1: Zero daily expenses */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="zero-expenses-test">
        <h2 className="font-semibold text-zinc-900 mb-4">
          1. Zero Daily Expenses — should show &quot;∞ vrijheid&quot;
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€100.000, expenses=0:</span>
            <FreedomTimeLabel amount={100000} dailyExpenses={0} showIcon data-testid="zero-exp-100k" />
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€500, expenses=0:</span>
            <FreedomTimeLabel amount={500} dailyExpenses={0} showIcon />
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€0, expenses=0:</span>
            <FreedomTimeLabel amount={0} dailyExpenses={0} showIcon />
          </div>
        </div>
      </section>

      {/* Edge Case 2: Negative amounts (deficit) */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="negative-amounts-test">
        <h2 className="font-semibold text-zinc-900 mb-4">
          2. Negative Amounts — should show &quot;X dagen achter&quot; (deficit framing)
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">-€5.000, expenses=100:</span>
            <FreedomTimeLabel amount={-5000} dailyExpenses={100} showIcon format="long" />
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">-€50.000, expenses=100:</span>
            <FreedomTimeLabel amount={-50000} dailyExpenses={100} showIcon format="long" />
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">-€500, expenses=100 (short):</span>
            <FreedomTimeLabel amount={-500} dailyExpenses={100} showIcon format="short" />
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">-€50, expenses=100 (under €100):</span>
            <FreedomTimeLabel amount={-50} dailyExpenses={100} showIcon />
            <span className="text-xs text-zinc-300">(should not show freedom time)</span>
          </div>
        </div>
      </section>

      {/* Edge Case 3: Under €100 threshold */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="under-100-test">
        <h2 className="font-semibold text-zinc-900 mb-4">
          3. Under €100 — should NOT show freedom time
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€10:</span>
            <FreedomTimeLabel amount={10} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(EUR only)</span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€50:</span>
            <FreedomTimeLabel amount={50} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(EUR only)</span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€99:</span>
            <FreedomTimeLabel amount={99} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(EUR only)</span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€100:</span>
            <FreedomTimeLabel amount={100} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show freedom time)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">€101:</span>
            <FreedomTimeLabel amount={101} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show freedom time)</span>
          </div>
        </div>
      </section>

      {/* Edge Case 4: Very large amounts */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="large-amounts-test">
        <h2 className="font-semibold text-zinc-900 mb-4">
          4. Very Large Amounts — should cap at 9999 years
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€50M:</span>
            <FreedomTimeLabel amount={50000000} dailyExpenses={100} showIcon format="long" />
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">€500M:</span>
            <FreedomTimeLabel amount={500000000} dailyExpenses={100} showIcon format="long" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">€500M (short):</span>
            <FreedomTimeLabel amount={500000000} dailyExpenses={100} showIcon format="short" />
          </div>
        </div>
      </section>

      {/* Edge Case 5: NaN/undefined inputs */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="nan-undefined-test">
        <h2 className="font-semibold text-zinc-900 mb-4">
          5. NaN/Undefined Inputs — should NOT crash
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">NaN amount:</span>
            <FreedomTimeLabel amount={NaN} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show €0)</span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">NaN expenses:</span>
            <FreedomTimeLabel amount={5000} dailyExpenses={NaN} />
            <span className="text-xs text-zinc-300">(should show EUR only)</span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">Infinity amount:</span>
            <FreedomTimeLabel amount={Infinity} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show €0)</span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-50 pb-2">
            <span className="text-sm text-zinc-500">-Infinity amount:</span>
            <FreedomTimeLabel amount={-Infinity} dailyExpenses={100} />
            <span className="text-xs text-zinc-300">(should show €0)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Both NaN:</span>
            <FreedomTimeLabel amount={NaN} dailyExpenses={NaN} />
            <span className="text-xs text-zinc-300">(should show €0)</span>
          </div>
        </div>
      </section>

      {/* Verification Tests */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6" data-testid="verification-tests">
        <h2 className="font-semibold text-zinc-900 mb-4">Feature #244 Verification Tests</h2>
        {verifyData && 'results' in verifyData ? (
          <div className="space-y-2">
            {(verifyData.results as { name: string; pass: boolean; detail: string }[]).map((r, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${r.pass ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  <span>{r.pass ? '✅' : '❌'}</span>
                  <span className={`font-medium ${r.pass ? 'text-emerald-700' : 'text-red-700'}`}>
                    {r.name}
                  </span>
                </div>
                <p className={`mt-1 text-xs ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                  {r.detail}
                </p>
              </div>
            ))}
            <div className={`mt-4 rounded-lg p-4 text-center font-semibold ${
              verifyData.all_passing ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`} data-testid="verification-summary">
              {verifyData.summary as string}
            </div>
          </div>
        ) : verifyData && 'error' in verifyData ? (
          <p className="text-sm text-red-500">Error: {String(verifyData.error)}</p>
        ) : (
          <p className="text-sm text-zinc-400">Loading verification tests...</p>
        )}
      </section>
    </div>
  )
}

export default function TestFreedomTimeLabelEdgeCasesPage() {
  return (
    <DailyExpenseProvider>
      <TestContent />
    </DailyExpenseProvider>
  )
}
