'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  step: number
  name: string
  passed: boolean
  details: string
}

interface VerificationResponse {
  feature: string
  passed: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestHouseholdFirePage() {
  const [verification, setVerification] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiResponse, setApiResponse] = useState<unknown>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    // Load verification results
    fetch('/api/verify-household-fire')
      .then(res => res.json())
      .then(data => setVerification(data))
      .catch(err => console.error('Verification fetch error:', err))
      .finally(() => setLoading(false))

    // Try to load household fire projections (will fail without auth, showing expected 401)
    fetch('/api/household/fire-projections')
      .then(res => {
        if (!res.ok) {
          setApiError(`Status ${res.status}: Expected 401 for unauthenticated access`)
          return res.json()
        }
        return res.json()
      })
      .then(data => setApiResponse(data))
      .catch(err => setApiError(`Fetch error: ${err.message}`))
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900">
        Feature #243: Household FIRE Projections
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Combined income, combined expenses. Shared FIRE target and individual FIRE targets. Partner comparison view.
      </p>

      {/* Verification Results */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-800">Verification Results</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            Loading verification...
          </div>
        ) : verification ? (
          <div>
            <div className={`mb-4 rounded-lg p-4 ${verification.allPassing ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
              <p className={`text-sm font-semibold ${verification.allPassing ? 'text-emerald-700' : 'text-amber-700'}`}>
                {verification.passed}/{verification.total} tests passing
                {verification.allPassing ? ' ✓ All tests pass!' : ''}
              </p>
            </div>
            <div className="space-y-2">
              {verification.results.map((result, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${result.passed ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${result.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                      {result.passed ? '✓' : '✗'}
                    </span>
                    <span className="text-xs font-medium text-zinc-400">Step {result.step}</span>
                    <span className="text-sm font-medium text-zinc-700">{result.name}</span>
                  </div>
                  <p className="mt-1 ml-5 text-xs text-zinc-500">{result.details}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-500">Failed to load verification results</p>
        )}
      </section>

      {/* API Response Preview */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-800">API Response Preview</h2>
        {apiError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {apiError}
          </div>
        )}
        {apiResponse != null ? (
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        ) : null}
      </section>

      {/* Feature Steps */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-800">Feature Steps</h2>
        <ol className="space-y-2 list-decimal pl-5">
          <li className="text-sm text-zinc-600">Calculate combined household income from both partners</li>
          <li className="text-sm text-zinc-600">Calculate combined household expenses</li>
          <li className="text-sm text-zinc-600">Compute shared FIRE target based on combined data</li>
          <li className="text-sm text-zinc-600">Compute individual FIRE targets per partner</li>
          <li className="text-sm text-zinc-600">Create partner comparison view showing side-by-side projections</li>
          <li className="text-sm text-zinc-600">Integrate with existing FIRE projection logic on /horizon</li>
        </ol>
      </section>
    </div>
  )
}
