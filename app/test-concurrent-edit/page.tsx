'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

export default function TestConcurrentEditPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function runTests() {
      try {
        const res = await fetch('/api/verify-concurrent-edit')
        const data = await res.json()
        setResults(data.results || [])
        if (data.error) setError(data.error)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run tests')
      } finally {
        setLoading(false)
      }
    }
    runTests()
  }, [])

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-bold mb-2">Feature #111: Concurrent Edit Conflict Handling</h1>
      <p className="text-sm text-gray-600 mb-6">
        Tests that two simultaneous edits to the same holding are handled properly
        via optimistic concurrency control (expected_updated_at check).
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-gray-500">Running tests...</span>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className={`mb-6 rounded-lg p-4 ${
            passing === total
              ? 'bg-green-50 border border-green-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <p className={`text-sm font-bold ${passing === total ? 'text-green-700' : 'text-amber-700'}`}>
              {passing}/{total} tests passing
            </p>
          </div>

          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${
                  r.pass ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'
                }`}
                data-testid={`test-result-${i}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${r.pass ? 'text-green-600' : 'text-red-600'}`}>
                    {r.pass ? '✅' : '❌'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{r.name}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500 ml-6">{r.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
