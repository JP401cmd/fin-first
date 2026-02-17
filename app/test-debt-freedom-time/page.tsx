'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

export default function TestDebtFreedomTime() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [passCount, setPassCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    fetch('/api/verify-debt-freedom-time')
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || [])
        setPassCount(data.passCount || 0)
        setTotalCount(data.totalCount || 0)
      })
      .catch((err) => {
        console.error('Error loading test results:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900">
        Feature #184: Freedom-time in debt displays
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Verifies that debt displays include freedom-time framing consistent with
        the TriFinity philosophy &quot;Geld is opgeslagen tijd&quot;.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Test Results</h2>
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ${
              passCount === totalCount
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {passCount}/{totalCount} passing
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                r.pass
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
                <span className="text-sm font-medium text-zinc-900">{r.name}</span>
              </div>
              <p className="mt-1 pl-7 text-xs text-zinc-500">{r.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          Freedom-time Framing Examples
        </h2>
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-700">Debt Balance</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">€ 89.000</p>
            <p className="mt-0.5 text-sm text-amber-600">
              je koopt deze tijd terug in 7 jaar en 5 maanden
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-700">Monthly Payment</p>
            <p className="mt-1 text-lg font-bold text-zinc-900">€ 650/mnd</p>
            <p className="mt-0.5 text-xs text-amber-600/80">
              je wint 22 dagen per maand terug
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-700">Payoff Timeline</p>
            <p className="mt-1 text-lg font-bold text-zinc-900">38 maanden</p>
            <p className="mt-0.5 text-xs text-amber-600">
              Schuldenvrij in 2031 — dan verdien je 100% voor jezelf
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
