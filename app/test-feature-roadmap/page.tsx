'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

type ApiResponse = {
  pass: boolean
  passing: number
  total: number
  results: TestResult[]
  featurePhaseMapping: Record<string, string>
  featuresPerPhase: Record<string, number>
}

export default function TestFeatureRoadmap() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-feature-roadmap')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-red-600">Failed to load test results</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #197: Feature Roadmap View
      </h1>
      <p className="text-zinc-500 mb-6">
        Verifies that the Chronology Scale on /identity shows per-phase feature unlock information
      </p>

      {/* Summary */}
      <div className={`mb-6 rounded-xl border p-4 ${data.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        <p className={`text-lg font-bold ${data.pass ? 'text-emerald-700' : 'text-red-700'}`}>
          {data.pass ? '✅ All tests passing' : '❌ Some tests failing'}
        </p>
        <p className="text-sm text-zinc-600">
          {data.passing}/{data.total} tests passed
        </p>
      </div>

      {/* Test results */}
      <div className="space-y-2 mb-8">
        {data.results.map((r, i) => (
          <div key={i} className={`rounded-lg border p-3 ${r.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm">{r.pass ? '✅' : '❌'}</span>
              <span className="text-sm font-medium text-zinc-700">{r.test}</span>
            </div>
            <p className="ml-6 text-xs text-zinc-500">{r.detail}</p>
          </div>
        ))}
      </div>

      {/* Feature Phase Mapping */}
      <h2 className="text-lg font-bold text-zinc-900 mb-3">Feature Phase Mapping</h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 mb-6">
        <div className="space-y-1">
          {Object.entries(data.featurePhaseMapping).map(([featureId, phaseId]) => (
            <div key={featureId} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs text-zinc-400 w-48 truncate">{featureId}</span>
              <span className="text-xs text-zinc-300">→</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                phaseId === 'recovery' ? 'bg-rose-50 text-rose-700' :
                phaseId === 'stability' ? 'bg-blue-50 text-blue-700' :
                phaseId === 'momentum' ? 'bg-teal-50 text-teal-700' :
                'bg-amber-50 text-amber-700'
              }`}>
                {phaseId}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution */}
      <h2 className="text-lg font-bold text-zinc-900 mb-3">Features per Phase</h2>
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(data.featuresPerPhase).map(([phase, count]) => (
          <div key={phase} className={`rounded-xl border p-3 text-center ${
            phase === 'recovery' ? 'border-rose-200 bg-rose-50' :
            phase === 'stability' ? 'border-blue-200 bg-blue-50' :
            phase === 'momentum' ? 'border-teal-200 bg-teal-50' :
            'border-amber-200 bg-amber-50'
          }`}>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-xs font-medium capitalize">{phase}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
