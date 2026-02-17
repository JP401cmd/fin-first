'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

interface VerificationResponse {
  feature: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestBelastingFreedomTime() {
  const [data, setData] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-belasting-freedom-time')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8">Loading verification...</div>
  if (!data) return <div className="p-8 text-red-600">Failed to load verification</div>

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Feature #185: Freedom-time in Box 3 Tax Displays</h1>
      <p className="mb-6 text-zinc-500">
        Verifies that freedom-time labels appear on all Box 3 tax displays using formatWithFreedom().
      </p>

      <div className="mb-6 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <span className={`text-4xl font-bold ${data.allPassing ? 'text-emerald-600' : 'text-red-600'}`}>
            {data.passing}/{data.total}
          </span>
          <span className="text-zinc-500">tests passing</span>
        </div>
      </div>

      <div className="space-y-2">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            }`}
          >
            <span className="mt-0.5 text-lg">{r.pass ? '✅' : '❌'}</span>
            <div>
              <p className={`text-sm font-medium ${r.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                {r.name}
              </p>
              <p className={`text-xs ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
