'use client'

import { useEffect, useState } from 'react'

type Result = { name: string; pass: boolean; detail: string }

export default function TestPortfolioDonut() {
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ total: 0, passing: 0 })

  useEffect(() => {
    fetch('/api/verify-portfolio-donut')
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || [])
        setSummary(data.summary || { total: 0, passing: 0 })
      })
      .catch((err) => {
        setResults([{ name: 'Fetch error', pass: false, detail: String(err) }])
        setSummary({ total: 1, passing: 0 })
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="mt-4 text-sm text-zinc-500">Verifying portfolio allocation donut...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6" data-testid="test-portfolio-donut">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold text-zinc-900 mb-2">
          Feature #128: Portfolio allocation donut uses real holding composition
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Verifies that the donut chart reflects actual holding weights from Supabase.
        </p>

        <div className="mb-4 rounded-lg border p-4 bg-white" data-testid="summary">
          <span className={`text-lg font-bold ${summary.passing === summary.total ? 'text-green-600' : 'text-red-600'}`}>
            {summary.passing}/{summary.total} tests passing
          </span>
        </div>

        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
              data-testid={`test-${i}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${r.pass ? 'text-green-700' : 'text-red-700'}`}>
                  {r.pass ? '✓' : '✗'} {r.name}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{r.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
