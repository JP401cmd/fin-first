'use client'

import { useState, useEffect, useCallback } from 'react'

interface TestResult {
  test: string
  passed: boolean
  details: string
  data?: unknown
}

export default function TestCascadeDeletePage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{ passed: number; total: number } | null>(null)
  const [authStatus, setAuthStatus] = useState<string>('Checking...')
  const [mode, setMode] = useState<string>('')

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/session-info')
      const data = await res.json()
      if (data.user) {
        setAuthStatus(`Ingelogd als: ${data.user.email}`)
        return true
      }
    } catch { /* ignore */ }

    // Try dev-login
    try {
      const res = await fetch('/api/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'janpaul@gmail.com', password: 'test123456' }),
      })
      const data = await res.json()
      if (data.success) {
        setAuthStatus(`Ingelogd via dev-login: ${data.user?.email}`)
        return true
      }
      setAuthStatus(`Niet ingelogd (dev-login: ${data.error}). Code-verificatie modus.`)
    } catch {
      setAuthStatus('Niet ingelogd. Code-verificatie modus.')
    }
    return false
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  async function runTests() {
    setLoading(true)
    setResults([])
    setSummary(null)
    setMode('')

    // Try to authenticate first
    await checkAuth()

    try {
      const res = await fetch('/api/verify-cascade-delete')
      const data = await res.json()
      setResults(data.results || [])
      setSummary({ passed: data.passed, total: data.total })
      setMode(data.mode || 'integration')
    } catch (err) {
      setResults([{
        test: 'Fetch error',
        passed: false,
        details: err instanceof Error ? err.message : String(err),
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        Feature #160: Cascade Delete Verification
      </h1>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
        Verifies that deleting an asset automatically removes all related holdings
        via PostgreSQL ON DELETE CASCADE.
      </p>
      <p className="mb-6 text-xs text-gray-500 dark:text-gray-500" data-testid="auth-status">
        {authStatus}
      </p>

      <button
        onClick={runTests}
        disabled={loading}
        data-testid="run-tests-btn"
        className="mb-8 rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Tests uitvoeren...' : 'Tests uitvoeren'}
      </button>

      {mode && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          Modus: {mode === 'code_verification' ? 'Code & Schema Verificatie' : 'Volledige Integratie Test'}
        </div>
      )}

      {summary && (
        <div
          data-testid="test-summary"
          className={`mb-6 rounded-xl border p-4 text-center ${
            summary.passed === summary.total
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
          }`}
        >
          <span className="text-lg font-bold">
            {summary.passed}/{summary.total} tests geslaagd
          </span>
        </div>
      )}

      <div className="space-y-3" data-testid="test-results">
        {results.map((r, i) => (
          <div
            key={i}
            data-testid={`test-result-${i}`}
            className={`rounded-lg border p-4 ${
              r.passed
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{r.passed ? '\u2705' : '\u274C'}</span>
              <span className="font-medium text-gray-900 dark:text-white">{r.test}</span>
            </div>
            <p className="ml-8 mt-1 text-sm text-gray-600 dark:text-gray-400">{r.details}</p>
            {r.data != null ? (
              <pre className="ml-8 mt-2 max-h-32 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {JSON.stringify(r.data, null, 2)}
              </pre>
            ) : null}
          </div>
        ))}
      </div>

      {!loading && results.length === 0 && (
        <p className="text-sm text-gray-500">
          Klik op &quot;Tests uitvoeren&quot; om de cascade delete verificatie te starten.
        </p>
      )}
    </div>
  )
}
