'use client'

import { useEffect, useState } from 'react'
import DividendTracker from '@/components/app/dividend-tracker'

type TestResult = {
  step: string
  status: 'pass' | 'fail'
  detail: string
}

export default function TestDividendTrackerPage() {
  const [codeResults, setCodeResults] = useState<TestResult[]>([])
  const [codeLoading, setCodeLoading] = useState(true)
  const [codeAllPassed, setCodeAllPassed] = useState(false)
  const [codePassed, setCodePassed] = useState(0)
  const [codeTotal, setCodeTotal] = useState(0)

  const [authResults, setAuthResults] = useState<TestResult[]>([])
  const [authLoading, setAuthLoading] = useState(true)
  const [authAllPassed, setAuthAllPassed] = useState(false)
  const [authPassed, setAuthPassed] = useState(0)
  const [authTotal, setAuthTotal] = useState(0)

  useEffect(() => {
    // Run code analysis tests (no auth required)
    async function runCodeTests() {
      try {
        const res = await fetch('/api/verify-dividend-tracker-code')
        if (res.ok) {
          const data = await res.json()
          setCodeResults(data.results || [])
          setCodeAllPassed(data.allPassed || false)
          setCodePassed(data.passed || 0)
          setCodeTotal(data.total || 0)
        } else {
          setCodeResults([{
            step: 'Code Analysis API',
            status: 'fail',
            detail: `HTTP ${res.status}: ${res.statusText}`,
          }])
        }
      } catch (err) {
        setCodeResults([{
          step: 'Network',
          status: 'fail',
          detail: err instanceof Error ? err.message : 'Unknown error',
        }])
      } finally {
        setCodeLoading(false)
      }
    }

    // Run auth-required tests (may fail without login)
    async function runAuthTests() {
      try {
        const res = await fetch('/api/verify-dividend-tracker')
        if (res.ok) {
          const data = await res.json()
          setAuthResults(data.results || [])
          setAuthAllPassed(data.allPassed || false)
          setAuthPassed(data.passed || 0)
          setAuthTotal(data.total || 0)
        } else if (res.status === 401) {
          setAuthResults([{
            step: 'Authentication Required',
            status: 'fail',
            detail: 'Login required to run data-dependent tests. Code analysis tests above verify implementation.',
          }])
          setAuthTotal(1)
        } else {
          setAuthResults([{
            step: 'API Call',
            status: 'fail',
            detail: `HTTP ${res.status}: ${res.statusText}`,
          }])
          setAuthTotal(1)
        }
      } catch (err) {
        setAuthResults([{
          step: 'Network',
          status: 'fail',
          detail: err instanceof Error ? err.message : 'Unknown error',
        }])
        setAuthTotal(1)
      } finally {
        setAuthLoading(false)
      }
    }

    runCodeTests()
    runAuthTests()
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #232: Dividend Tracker
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verification tests for dividend tracking, yield, projected income, and FIRE integration.
      </p>

      {/* Code Analysis Tests (no auth required) */}
      <section className="mb-8" data-testid="code-analysis-section">
        <div className={`rounded-xl border p-4 ${codeAllPassed ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200 bg-white'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900" data-testid="code-analysis-title">
              Code Analysis: {codeLoading ? 'Bezig...' : `${codePassed}/${codeTotal} geslaagd`}
            </h2>
            {!codeLoading && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                codeAllPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`} data-testid="code-analysis-badge">
                {codeAllPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}
              </span>
            )}
          </div>

          {codeLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-2">
              {codeResults.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-3 py-2 ${
                    r.status === 'pass'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {r.status === 'pass' ? '✅' : '❌'}
                    </span>
                    <span className="text-sm font-medium text-zinc-800">{r.step}</span>
                  </div>
                  <p className="ml-6 text-xs text-zinc-600 mt-0.5">{r.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Auth-required data tests */}
      <section className="mb-8" data-testid="auth-tests-section">
        <div className={`rounded-xl border p-4 ${authAllPassed ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200 bg-white'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900" data-testid="auth-tests-title">
              Data Tests (auth required): {authLoading ? 'Bezig...' : `${authPassed}/${authTotal} geslaagd`}
            </h2>
            {!authLoading && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                authAllPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {authAllPassed ? '✅ ALL PASSED' : '🔒 REQUIRES LOGIN'}
              </span>
            )}
          </div>

          {authLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-2">
              {authResults.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-3 py-2 ${
                    r.status === 'pass'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {r.status === 'pass' ? '✅' : '🔒'}
                    </span>
                    <span className="text-sm font-medium text-zinc-800">{r.step}</span>
                  </div>
                  <p className="ml-6 text-xs text-zinc-600 mt-0.5">{r.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Live Component Demo */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          Component Preview
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          Live rendering van de DividendTracker component met echte data (als er dividenden zijn geregistreerd).
        </p>
        <DividendTracker />
      </section>
    </div>
  )
}
