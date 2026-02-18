'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  step: number
  name: string
  pass: boolean
  details: string
}

type VerifyResponse = {
  feature: string
  passing: number
  total: number
  percentage: number
  results: TestResult[]
}

export default function TestHouseholdInvitePage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-household-invite')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Test: Household Partner Invitation</h1>
        <p className="mt-2 text-zinc-500">Loading verification tests...</p>
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Test: Household Partner Invitation</h1>
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-red-700">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">Test: Household Partner Invitation</h1>
      <p className="mt-1 text-sm text-zinc-500">Feature #240: Partner invitation and management</p>

      {/* Summary */}
      <div className={`mt-6 rounded-xl border-2 p-5 ${
        data?.percentage === 100
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">
              {data?.passing}/{data?.total} tests passing
            </p>
            <p className="text-sm text-zinc-600">{data?.percentage}% complete</p>
          </div>
          <div className={`text-4xl ${data?.percentage === 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
            {data?.percentage === 100 ? '✓' : '⚠'}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6 space-y-3">
        {data?.results.map((result) => (
          <div
            key={result.step}
            className={`rounded-lg border p-4 ${
              result.pass
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-red-200 bg-red-50/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`text-lg ${result.pass ? 'text-emerald-500' : 'text-red-500'}`}>
                {result.pass ? '✓' : '✗'}
              </span>
              <div>
                <p className="font-medium text-zinc-800">
                  Step {result.step}: {result.name}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{result.details}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="mt-8 rounded-lg border border-zinc-200 p-4">
        <h3 className="font-semibold text-zinc-700 mb-2">Quick Links</h3>
        <div className="flex flex-wrap gap-2">
          <a href="/identity" className="rounded-lg bg-teal-100 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-200">
            Identity Page (Household Section)
          </a>
          <a href="/api/household/status" className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200">
            /api/household/status
          </a>
          <a href="/api/household/invite" className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200">
            /api/household/invite
          </a>
          <a href="/test-household-schema" className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200">
            Schema Test
          </a>
        </div>
      </div>
    </div>
  )
}
