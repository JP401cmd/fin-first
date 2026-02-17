'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  pass: boolean
  passing: number
  total: number
  results: TestResult[]
}

export default function TestDashboardPreviewMetrics() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-dashboard-preview-metrics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="p-8 text-zinc-500">Verifiëren...</div>
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>
  if (!data) return <div className="p-8 text-zinc-500">Geen data</div>

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Feature #187: Dashboard Preview Metrics</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Verifies that dashboard module cards show PREVIEW metrics that differ from module hero metrics.
      </p>

      {/* Summary */}
      <div className={`mb-6 rounded-lg p-4 ${data.pass ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <p className={`font-bold ${data.pass ? 'text-green-700' : 'text-red-700'}`}>
          {data.pass ? '✅ ALL TESTS PASSING' : '❌ SOME TESTS FAILING'}
          {' — '}{data.passing}/{data.total}
        </p>
      </div>

      {/* Expected Preview Metrics */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="mb-3 font-semibold text-zinc-900">Expected Preview Metrics</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="inline-block w-24 shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">De Kern</span>
            <span>Vermogensgroei deze maand: +€X (+Y dagen)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-block w-24 shrink-0 rounded bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">De Wil</span>
            <span>X acties open — Y dagen te winnen</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-block w-24 shrink-0 rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">De Horizon</span>
            <span>Countdown: X jaar, Y maanden</span>
          </div>
        </div>
      </div>

      {/* Test results */}
      <div className="space-y-2" data-testid="test-results">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-lg border p-3 ${r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
            data-testid={`test-${i}`}
          >
            <span className="mt-0.5 text-lg">{r.pass ? '✅' : '❌'}</span>
            <div>
              <p className={`font-medium ${r.pass ? 'text-green-800' : 'text-red-800'}`}>{r.name}</p>
              <p className="text-xs text-zinc-500">{r.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
