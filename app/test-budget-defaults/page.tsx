'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  passed: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestBudgetDefaultsPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch('/api/verify-budget-defaults')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          <p className="font-semibold">Error loading tests</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Feature #171: Budget form has sensible default values
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verifies that the budget creation form pre-fills with reasonable defaults
        </p>

        <div className={`mb-6 rounded-lg border p-4 ${
          data.allPassing
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}>
          <p className={`font-semibold ${data.allPassing ? 'text-green-700' : 'text-red-700'}`}>
            {data.summary}
          </p>
        </div>

        <div className="space-y-3">
          {data.results.map((result, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                result.passed
                  ? 'border-green-200 bg-white'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">
                  {result.passed ? '\u2705' : '\u274C'}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{result.test}</p>
                  <p className="mt-1 text-xs text-zinc-500">{result.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">Default Values Summary</h2>
          <div className="text-xs text-zinc-500 space-y-1">
            <p><strong>Name:</strong> Empty (user fills in)</p>
            <p><strong>Icon:</strong> Circle (generic default)</p>
            <p><strong>Type:</strong> Expense (most common)</p>
            <p><strong>Limit:</strong> Empty (user fills in)</p>
            <p><strong>Interval:</strong> Monthly (current month context)</p>
            <p><strong>Rollover:</strong> Reset (start fresh each period)</p>
            <p><strong>Limit type:</strong> Soft (warning, not blocking)</p>
            <p><strong>Alert threshold:</strong> 80% (sensible warning level)</p>
            <p><strong>Priority:</strong> 3 (middle of 1-5 scale)</p>
            <p><strong>Essential:</strong> No (non-essential by default)</p>
            <p><strong>Inflation-indexed:</strong> No (manual by default)</p>
            <p><strong>Category:</strong> &quot;Nieuwe categorie aanmaken&quot; placeholder</p>
          </div>
        </div>
      </div>
    </div>
  )
}
