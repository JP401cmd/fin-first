'use client'

import { useEffect, useState } from 'react'

type TestResult = { name: string; pass: boolean; detail: string }

export default function TestBudgetTrend() {
  const [results, setResults] = useState<TestResult[]>([])
  const [passing, setPassing] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-budget-trend')
      .then(r => r.json())
      .then(data => {
        setResults(data.tests ?? [])
        setPassing(data.passing ?? 0)
        setTotal(data.total ?? 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-zinc-500">Bezig met testen...</div>

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #124: Budget Spending Trend Verification
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Verifies that budget sparklines use real 12-month transaction data from Supabase
      </p>

      <div className={`mb-6 rounded-lg p-4 text-center font-bold ${
        passing === total ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
      }`}>
        {passing}/{total} tests passing
      </div>

      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={i} className={`rounded-lg border p-3 ${r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-lg ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.pass ? '✅' : '❌'}
              </span>
              <span className="font-medium text-zinc-800">{r.name}</span>
            </div>
            <p className="mt-1 ml-8 text-xs text-zinc-600">{r.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
