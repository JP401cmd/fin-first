'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  passes: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
  error?: string
}

export default function TestWilUniqueLens() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-wil-unique-lens')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <span className="text-zinc-600">Verifying De Wil unique lens...</span>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-red-600">Failed to load verification results</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #190: De Wil Unique Action &amp; Impact Lens
      </h1>
      <p className="mb-6 text-sm text-zinc-500">{data.feature}</p>

      <div className={`mb-6 rounded-lg p-4 ${data.allPassing ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <p className={`text-lg font-bold ${data.allPassing ? 'text-green-700' : 'text-red-700'}`}>
          {data.allPassing ? 'ALL TESTS PASSING' : 'SOME TESTS FAILING'}
        </p>
        <p className="text-sm text-zinc-600">
          {data.passing}/{data.total} tests passing
        </p>
      </div>

      <div className="space-y-3">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.passes ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{r.passes ? '\u2705' : '\u274C'}</span>
              <span className="font-medium text-zinc-900">{r.test}</span>
            </div>
            <p className="mt-1 pl-7 text-sm text-zinc-600">{r.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="mb-3 text-sm font-bold text-zinc-700">Feature Requirements Summary</h2>
        <ul className="space-y-1 text-sm text-zinc-600">
          <li><strong>Hero:</strong> &quot;Vrijheidsdagen gewonnen&quot; — action-based freedom days as primary metric</li>
          <li><strong>Unique:</strong> Only place where action-based freedom days appear as primary hero metric</li>
          <li><strong>KPI 1:</strong> Voltooide Acties — completed actions count with completion ratio</li>
          <li><strong>KPI 2:</strong> Open Potentieel — freedom days still available from pending actions</li>
          <li><strong>KPI 3:</strong> Doelvoortgang — average goal progress percentage</li>
          <li><strong>KPI 4:</strong> Wilskrachtscore — A-E grade based on action completion rate</li>
          <li><strong>Hero Sub-KPI:</strong> Beslissnelheid — average days from creation to completion</li>
          <li><strong>Theme:</strong> Consistent teal color throughout (teal-50 through teal-950)</li>
        </ul>
      </div>
    </div>
  )
}
