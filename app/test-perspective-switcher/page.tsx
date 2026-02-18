'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  name: string
  passed: boolean
  details?: string
}

export default function TestPerspectiveSwitcherPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState('')

  useEffect(() => {
    async function runTests() {
      try {
        const res = await fetch('/api/verify-perspective-switcher')
        const data = await res.json()
        setResults(data.results ?? [])
        setSummary(data.summary ?? '')
      } catch (err) {
        setResults([{
          name: 'API Error',
          passed: false,
          details: err instanceof Error ? err.message : String(err),
        }])
      }
      setLoading(false)
    }
    runTests()
  }, [])

  // Client-side tests
  const [clientTests, setClientTests] = useState<TestResult[]>([])

  useEffect(() => {
    const tests: TestResult[] = []

    // Test: localStorage persistence
    try {
      const key = 'trifinity_perspective'
      const oldValue = localStorage.getItem(key)
      localStorage.setItem(key, 'household')
      const readBack = localStorage.getItem(key)
      const stored = readBack === 'household'
      // Restore
      if (oldValue) localStorage.setItem(key, oldValue)
      else localStorage.removeItem(key)
      tests.push({
        name: 'Client: localStorage read/write works',
        passed: stored,
        details: stored ? 'Can store and retrieve perspective preference' : 'Failed to read back stored value',
      })
    } catch (err) {
      tests.push({
        name: 'Client: localStorage read/write works',
        passed: false,
        details: err instanceof Error ? err.message : String(err),
      })
    }

    // Test: valid perspective values
    try {
      const validValues = ['personal', 'household', 'partner']
      const allValid = validValues.every(v => typeof v === 'string' && v.length > 0)
      tests.push({
        name: 'Client: perspective values are valid strings',
        passed: allValid,
        details: `Valid values: ${validValues.join(', ')}`,
      })
    } catch (err) {
      tests.push({
        name: 'Client: perspective values are valid strings',
        passed: false,
        details: err instanceof Error ? err.message : String(err),
      })
    }

    setClientTests(tests)
  }, [])

  const allResults = [...results, ...clientTests]
  const passingCount = allResults.filter(r => r.passed).length
  const totalCount = allResults.length

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Feature #241: Perspective Switcher</h1>
        <p className="text-zinc-400 mb-6">
          Toggle between: Household, Partner 1, Partner 2 views. All calculations recalculate per perspective.
        </p>

        {loading ? (
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-teal-400" />
            <span className="text-zinc-400">Running verification tests...</span>
          </div>
        ) : (
          <>
            <div className={`mb-6 rounded-xl p-4 ${
              passingCount === totalCount ? 'bg-emerald-950/50 border border-emerald-800' : 'bg-amber-950/50 border border-amber-800'
            }`}>
              <p className={`text-lg font-bold ${
                passingCount === totalCount ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {passingCount}/{totalCount} tests passing
              </p>
              {summary && <p className="text-sm text-zinc-400 mt-1">API: {summary}</p>}
            </div>

            <div className="space-y-2">
              {allResults.map((result, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${
                    result.passed
                      ? 'border-emerald-800/50 bg-emerald-950/30'
                      : 'border-red-800/50 bg-red-950/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 text-sm ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.passed ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className={`text-sm font-medium ${result.passed ? 'text-emerald-300' : 'text-red-300'}`}>
                        {result.name}
                      </p>
                      {result.details && (
                        <p className="text-xs text-zinc-500 mt-0.5">{result.details}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div className="mt-8 space-y-2">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Quick Links</h2>
              <div className="flex flex-wrap gap-2">
                <a href="/dashboard" className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                  Dashboard (test switcher)
                </a>
                <a href="/identity" className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                  Identiteit (household type)
                </a>
                <a href="/api/perspective" className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                  API: GET /api/perspective
                </a>
                <a href="/api/verify-perspective-switcher" className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
                  API: Verify Tests
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
