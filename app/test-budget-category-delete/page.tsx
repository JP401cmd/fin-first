'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  test: string
  passed: boolean
  details: string
  data?: unknown
}

interface VerifyResponse {
  feature: string
  summary: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestBudgetCategoryDeletePage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      try {
        const res = await fetch('/api/verify-budget-category-delete')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(`${err}`)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-zinc-900">Feature #165: Budget Category Delete</h1>
          <p className="mt-2 text-zinc-500">Running verification tests...</p>
          <div className="mt-4 h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-red-600">Error</h1>
          <p className="mt-2 text-zinc-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900">{data.feature}</h1>
        <p className={`mt-2 text-lg font-semibold ${data.allPassing ? 'text-emerald-600' : 'text-amber-600'}`}>
          {data.summary}
        </p>

        <div className="mt-6 space-y-3">
          {data.results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                r.passed
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-lg">{r.passed ? '✅' : '❌'}</span>
                <div className="flex-1">
                  <p className="font-medium text-zinc-900">{r.test}</p>
                  <p className="mt-1 text-sm text-zinc-600">{r.details}</p>
                  {r.data != null ? (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-800 p-2 text-xs text-zinc-200">
                      {JSON.stringify(r.data, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
