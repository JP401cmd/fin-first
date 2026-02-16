'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

export default function TestDismissPersistPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState('')

  useEffect(() => {
    async function run() {
      try {
        const res = await fetch('/api/verify-dismissed-next-step')
        if (res.ok) {
          const data = await res.json()
          setResults(data.results || [])
          setSummary(data.summary || '')
        } else {
          setResults([{ test: 'API call', pass: false, detail: `HTTP ${res.status}` }])
          setSummary('API error')
        }
      } catch (err) {
        setResults([{ test: 'API call', pass: false, detail: err instanceof Error ? err.message : 'Unknown error' }])
        setSummary('Fetch error')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Feature #140: Dismissed Next Step Persists Across Sessions</h1>
      <p className="text-sm text-zinc-500">
        Verifies that dismissed suggestions stay dismissed after logout/login.
        Tests database persistence, API behavior, and component initialization.
      </p>

      {loading ? (
        <div className="text-zinc-400 animate-pulse">Running verification tests...</div>
      ) : (
        <>
          <div className="text-lg font-semibold">
            {summary} {results.every(r => r.pass) ? '✅' : '⚠️'}
          </div>

          <div className="space-y-3">
            {results.map((r, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border ${
                  r.pass
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
                  <span className="font-medium text-sm">{r.test}</span>
                </div>
                <p className="text-xs text-zinc-600 mt-1 ml-7">{r.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
