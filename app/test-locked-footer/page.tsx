'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  total: number
  passing: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestLockedFooterPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-locked-footer')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center">Loading…</div>
  if (!data) return <div className="p-8 text-center text-red-600">Failed to load</div>

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold text-zinc-900 mb-1" data-testid="page-title">
          Feature #196: Meer functies beschikbaar footer
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Verifies that gated pages show a subtle footer with locked feature count
        </p>

        {/* Score badge */}
        <div
          className={`mb-6 rounded-xl border p-4 ${
            data.allPassing
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
          data-testid="score-badge"
        >
          <p className={`text-lg font-bold ${data.allPassing ? 'text-emerald-700' : 'text-amber-700'}`}>
            {data.passing}/{data.total} tests passing
          </p>
          <p className="text-xs text-zinc-500">{data.feature}</p>
        </div>

        {/* Test results */}
        <div className="space-y-2">
          {data.results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${r.pass ? 'border-emerald-100 bg-white' : 'border-red-100 bg-red-50'}`}
              data-testid={`test-${i}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-lg ${r.pass ? 'text-emerald-500' : 'text-red-500'}`}>
                  {r.pass ? '✅' : '❌'}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-800">{r.name}</p>
                  <p className="text-xs text-zinc-500">{r.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
