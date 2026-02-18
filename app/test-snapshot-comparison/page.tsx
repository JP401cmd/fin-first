'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestSnapshotComparison() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-snapshot-comparison')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p className="text-zinc-500">Verificatie laden...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-lg font-bold text-red-800">Fout bij laden</h1>
          <p className="mt-2 text-sm text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const passing = data.results.filter(r => r.pass).length
  const total = data.results.length

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h1 className="text-xl font-bold text-zinc-800">
            Feature #259: Snapshot Comparison View
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Vergelijk twee maandelijkse snapshots naast elkaar met delta-indicatoren
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
              data.allPassing
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {passing}/{total} tests passing
            </div>
            {data.allPassing && (
              <span className="text-emerald-600 font-medium text-sm">
                ALL TESTS PASSING
              </span>
            )}
          </div>
        </div>

        {/* Test Results */}
        <div className="space-y-3">
          {data.results.map((result, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                result.pass
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg" role="img" aria-label={result.pass ? 'pass' : 'fail'}>
                  {result.pass ? '✅' : '❌'}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold ${result.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                    {result.name}
                  </h3>
                  <p className={`mt-1 text-xs ${result.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                    {result.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Feature Steps Coverage */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">
            Feature Steps Coverage
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={data.results[0]?.pass ? 'text-emerald-600' : 'text-red-500'}>
                {data.results[0]?.pass ? '✅' : '❌'}
              </span>
              <span>Create snapshot comparison UI allowing selection of two months</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={data.results[1]?.pass ? 'text-emerald-600' : 'text-red-500'}>
                {data.results[1]?.pass ? '✅' : '❌'}
              </span>
              <span>Show side-by-side comparison of all snapshot metrics</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={data.results[2]?.pass ? 'text-emerald-600' : 'text-red-500'}>
                {data.results[2]?.pass ? '✅' : '❌'}
              </span>
              <span>Calculate and display delta for each metric</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={data.results[3]?.pass ? 'text-emerald-600' : 'text-red-500'}>
                {data.results[3]?.pass ? '✅' : '❌'}
              </span>
              <span>Highlight improvements in green</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={data.results[4]?.pass ? 'text-emerald-600' : 'text-red-500'}>
                {data.results[4]?.pass ? '✅' : '❌'}
              </span>
              <span>Highlight regressions in red</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={data.results[5]?.pass ? 'text-emerald-600' : 'text-red-500'}>
                {data.results[5]?.pass ? '✅' : '❌'}
              </span>
              <span>Show on De Kern or Horizon overview as collapsible section</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
