'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  test: string
  passed: boolean
  details: string
}

export default function TestFireScenarioDefaultsPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-fire-scenario-defaults')
      .then(res => res.json())
      .then(data => {
        setResults(data.results ?? [])
        setSummary(data.summary ?? '')
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-8 text-center">Loading verification...</div>
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>

  const allPassed = results.every(r => r.passed)

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Feature #177: FIRE Scenario Defaults</h1>
      <p className="mb-6 text-zinc-500">
        Verifies that the FIRE calculator pre-fills with user actual financial data
      </p>

      <div className={`mb-6 rounded-xl p-4 text-center text-lg font-bold ${allPassed ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
        {summary} {allPassed ? ' - ALL PASSING' : ' - SOME FAILING'}
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.passed ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-lg ${r.passed ? 'text-green-600' : 'text-red-600'}`}>
                {r.passed ? '\u2705' : '\u274C'}
              </span>
              <span className="font-medium text-zinc-800">{r.test}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{r.details}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="mb-2 font-semibold text-zinc-700">Verification Steps</h2>
        <ol className="list-decimal pl-5 text-sm text-zinc-600 space-y-1">
          <li>Navigate to /horizon FIRE section</li>
          <li>Verify savings rate pre-filled from actual data</li>
          <li>Verify annual expenses pre-filled from budget data</li>
          <li>Verify current assets pre-filled from portfolio</li>
          <li>Verify user can modify parameters from defaults</li>
        </ol>
      </div>
    </div>
  )
}
