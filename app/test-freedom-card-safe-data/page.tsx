'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  id: number
  step: string
  test: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestFreedomCardSafeDataPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-freedom-card-safe-data')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="animate-pulse text-zinc-500">Verifying...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="rounded-lg bg-red-50 p-4 text-red-700">Error: {error}</div>
      </div>
    )
  }

  if (!data) return null

  // Group results by step
  const steps = new Map<string, TestResult[]>()
  for (const r of data.results) {
    const existing = steps.get(r.step) || []
    existing.push(r)
    steps.set(r.step, existing)
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-zinc-900">
            Feature #254: Freedom card uses only safe non-financial data
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Verify freedom card generator never exposes sensitive EUR amounts
          </p>
          <div className="mt-4 flex items-center gap-4">
            <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${
              data.allPassing ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              {data.summary}
            </span>
            <span className={`text-sm font-medium ${
              data.allPassing ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {data.allPassing ? '✅ All tests passing' : '⚠️ Some tests failing'}
            </span>
          </div>
        </div>

        {/* Results grouped by step */}
        {Array.from(steps.entries()).map(([step, results]) => (
          <div key={step} className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-zinc-700 uppercase tracking-wide">
              {step}
            </h2>
            <div className="space-y-2">
              {results.map(r => (
                <div
                  key={r.id}
                  className={`flex items-start gap-3 rounded-lg p-3 ${
                    r.pass ? 'bg-emerald-50' : 'bg-red-50'
                  }`}
                >
                  <span className="mt-0.5 text-lg">{r.pass ? '✅' : '❌'}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      r.pass ? 'text-emerald-800' : 'text-red-800'
                    }`}>
                      {r.test}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Philosophy note */}
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
          <h3 className="text-sm font-bold text-teal-800">Privacy-first Design</h3>
          <p className="mt-1 text-xs text-teal-700">
            The freedom card is designed to share <strong>time-based metrics only</strong> by default.
            Financial amounts (net worth, FIRE target) are never shown unless the user
            explicitly opts into &quot;Volledig&quot; privacy mode with a confirmation dialog.
            This ensures users can safely share their progress without revealing sensitive financial data.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-white p-2 text-center">
              <div className="font-bold text-zinc-700">Anoniem</div>
              <div className="text-zinc-500">% + tijd</div>
              <div className="text-zinc-400">Geen naam, geen €</div>
            </div>
            <div className="rounded-lg bg-white p-2 text-center">
              <div className="font-bold text-zinc-700">Met naam</div>
              <div className="text-zinc-500">% + tijd + naam</div>
              <div className="text-zinc-400">Geen €</div>
            </div>
            <div className="rounded-lg bg-white p-2 text-center">
              <div className="font-bold text-zinc-700">Volledig</div>
              <div className="text-zinc-500">% + tijd + naam + €</div>
              <div className="text-zinc-400">Opt-in vereist</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
