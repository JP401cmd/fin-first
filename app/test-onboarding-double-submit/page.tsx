'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

interface VerifyResponse {
  summary: string
  passing: number
  total: number
  results: TestResult[]
}

export default function TestOnboardingDoubleSubmit() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-onboarding-double-submit')
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="rounded-lg bg-red-50 p-6 text-red-700">Error: {error}</div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Feature #154: Onboarding Double-Submit Protection
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verifies that clicking next rapidly in onboarding does not create duplicate records
        </p>

        {/* Summary */}
        <div
          className={`mb-6 rounded-lg p-4 text-center text-lg font-bold ${
            data.passing === data.total
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {data.summary}
        </div>

        {/* Results */}
        <div className="space-y-3">
          {data.results.map((result, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                result.passed
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{result.passed ? '✅' : '❌'}</span>
                <span className="font-medium text-zinc-800">{result.name}</span>
              </div>
              <p className="mt-1 ml-7 text-xs text-zinc-600">{result.detail}</p>
            </div>
          ))}
        </div>

        {/* Architecture explanation */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-800">
            How Double-Submit Protection Works
          </h2>
          <div className="space-y-4 text-sm text-zinc-600">
            <div>
              <h3 className="font-medium text-zinc-700">Layer 1: Client-side Guard</h3>
              <p>
                <code>handleSaveOwnData()</code> checks <code>if (saving) return</code> at
                the start. Even if two rapid clicks fire before React re-renders, only the
                first call proceeds. The <code>saving</code> flag is set synchronously with
                <code>setSaving(true)</code> before any async work.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-700">Layer 2: Disabled Buttons</h3>
              <p>
                The <code>saving</code> state is passed to <code>OnboardingBezittingen</code>,
                which sets <code>disabled=&#123;saving&#125;</code> op de &quot;Volgende&quot;-knop.
                Disabled buttons prevent further clicks at the HTML level and show visual
                feedback (opacity-50, cursor-not-allowed).
              </p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-700">Layer 3: Step Transition</h3>
              <p>
                The step immediately changes to <code>saving</code>, which replaces the
                entire extras form with a spinner UI. The buttons are removed from the DOM
                entirely, making it impossible to click them again.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-700">Layer 4: Server-side Idempotency</h3>
              <p>
                The <code>/api/onboarding/save-own-data</code> endpoint checks if
                <code>onboarding_completed</code> is already <code>true</code> before
                inserting any data. If it is, the API returns <code>&#123;success: true,
                alreadyCompleted: true&#125;</code> without creating duplicate records.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
