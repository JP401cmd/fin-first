'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerificationResponse = {
  feature: string
  summary: string
  passing: number
  total: number
  results: TestResult[]
}

export default function TestResilienceHistoryPage() {
  const [data, setData] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-resilience-history')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Loading verification...</h1>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold text-red-600">Failed to load verification</h1>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold" data-testid="test-title">
        {data.feature}
      </h1>
      <p className="mt-2 text-lg" data-testid="test-summary">
        <span className={data.passing === data.total ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
          {data.summary}
        </span>
      </p>

      <div className="mt-6 space-y-3">
        {data.results.map((result, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${
              result.pass
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
            data-testid={`test-${i}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{result.pass ? '\u2705' : '\u274c'}</span>
              <span className="font-medium">{result.name}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{result.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-purple-200 bg-purple-50 p-6">
        <h2 className="text-lg font-bold text-purple-900">Feature #219: Resilience score history chart</h2>
        <p className="mt-2 text-sm text-purple-700">
          Store monthly resilience scores in snapshots. Trend chart on De Horizon.
          Message: &quot;Je veerkracht is gestegen van 45 naar 68 in 6 maanden&quot;.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-purple-700">
          <li>1. Store resilience score in monthly snapshots via resilience_score column</li>
          <li>2. Create trend chart for resilience score history</li>
          <li>3. Display chart on De Horizon overview page</li>
          <li>4. Show contextual message about resilience improvement</li>
          <li>5. Handle missing historical data gracefully</li>
        </ul>
      </div>
    </div>
  )
}
