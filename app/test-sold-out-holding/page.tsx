'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

export default function TestSoldOutHoldingPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-sold-out-holding')
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || [])
        setSummary(data.summary || '')
      })
      .catch(() => setSummary('Error loading tests'))
      .finally(() => setLoading(false))
  }, [])

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900">
        Feature #166: Sold-out Holding Shows Zero Units
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Verification that selling all units of a holding results in 0 units, not negative values.
      </p>

      {loading ? (
        <div className="mt-8 flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className={`mt-6 rounded-xl border p-4 ${
            passing === total
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}>
            <p className={`text-lg font-bold ${
              passing === total ? 'text-emerald-700' : 'text-red-700'
            }`}>
              {summary}
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${
                  r.pass
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-red-200 bg-red-50/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 text-lg ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.pass ? '✅' : '❌'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${
                      r.pass ? 'text-emerald-800' : 'text-red-800'
                    }`}>
                      {r.test}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">{r.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-lg font-bold text-zinc-900">What This Feature Verifies</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5">1.</span>
                <span>Backend sell logic uses <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">Math.max(0, currentUnits - numUnits)</code> to prevent negative units</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">2.</span>
                <span>Frontend preview also clamps to 0 with <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">Math.max(0, ...)</code></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">3.</span>
                <span>Sold-out holdings display &quot;0 eenheden&quot; text and &quot;Uitverkocht&quot; badge</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">4.</span>
                <span>Sell form validates: cannot sell more than owned, cannot sell from 0-unit holding</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">5.</span>
                <span>Holdings with 0 units can still be deleted or used for buy transactions</span>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
