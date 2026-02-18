'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  id: string
  name: string
  passed: boolean
  details: string
}

type VerifyResponse = {
  feature: string
  summary: string
  allPassing: boolean
  dashboardRole: string
  tests: TestResult[]
  error?: string
}

export default function TestKpiDeduplicationPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-kpi-deduplication')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="animate-pulse text-zinc-400">Loading verification tests...</div>
      </div>
    )
  }

  if (!data || data.error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-red-700">Error: {data?.error ?? 'Failed to load'}</p>
        </div>
      </div>
    )
  }

  const passingCount = data.tests.filter(t => t.passed).length
  const totalCount = data.tests.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #245: KPI Deduplication Verification
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        {data.feature}
      </p>

      {/* Summary */}
      <div className={`mb-8 rounded-xl border p-6 ${data.allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{data.allPassing ? '✅' : '❌'}</span>
          <div>
            <p className="text-lg font-bold" data-testid="summary-result">
              {data.summary}
            </p>
            <p className="text-sm text-zinc-600">
              Dashboard role: {data.dashboardRole}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Ownership Map */}
      <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          KPI Ownership Map
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-700 mb-2">De Kern (Amber)</p>
            <ul className="text-xs text-amber-800 space-y-1">
              <li>- Freedom % (hero)</li>
              <li>- Autonomie Score</li>
              <li>- Spaarquote</li>
              <li>- Dagen Gewonnen</li>
              <li>- Vrije Dagen/Jaar</li>
              <li>- Vermogensgroei</li>
            </ul>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
            <p className="text-xs font-bold text-teal-700 mb-2">De Wil (Teal)</p>
            <ul className="text-xs text-teal-800 space-y-1">
              <li>- Freedom days won (hero)</li>
              <li>- Voltooide Acties</li>
              <li>- Open Potentieel</li>
              <li>- Doelvoortgang</li>
              <li>- Wilskrachtscore</li>
            </ul>
          </div>
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
            <p className="text-xs font-bold text-purple-700 mb-2">De Horizon (Purple)</p>
            <ul className="text-xs text-purple-800 space-y-1">
              <li>- FIRE age (hero)</li>
              <li>- Countdown</li>
              <li>- FIRE Doelbedrag</li>
              <li>- Veerkracht</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Individual Tests */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Test Results ({passingCount}/{totalCount})
        </h2>
        {data.tests.map((test) => (
          <div
            key={test.id}
            data-testid={`test-${test.id}`}
            className={`rounded-lg border p-4 ${test.passed ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg mt-0.5">
                {test.passed ? '✅' : '❌'}
              </span>
              <div>
                <p className="font-medium text-zinc-900 text-sm">
                  {test.name}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {test.details}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
