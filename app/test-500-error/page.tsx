'use client'

import { useState } from 'react'

/**
 * Test page for Feature #102: API 500 errors show user-friendly messages.
 *
 * This page tests:
 * 1. API 500 JSON errors → user-friendly message displayed
 * 2. API 500 with technical details → no stack trace shown to user
 * 3. Client-side render error → error boundary catches and shows friendly UI
 * 4. Retry and go-back options are provided
 */

type TestResult = {
  name: string
  status: 'pass' | 'fail' | 'pending'
  detail: string
}

function ErrorThrower() {
  // This component will throw when rendered, testing the error boundary
  throw new Error('Simulated render error for testing error boundary')
}

export default function Test500ErrorPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [showRenderError, setShowRenderError] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const addResult = (result: TestResult) => {
    setResults((prev) => {
      const existing = prev.findIndex((r) => r.name === result.name)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = result
        return next
      }
      return [...prev, result]
    })
  }

  // Test 1: API 500 returns user-friendly JSON error message
  async function testJsonError() {
    setIsLoading(true)
    setApiError(null)
    try {
      const res = await fetch('/api/test-500?type=json')
      const data = await res.json()

      if (res.status === 500 && data.error && typeof data.error === 'string') {
        setApiError(data.error)
        addResult({
          name: 'API 500 JSON error',
          status: 'pass',
          detail: `Got 500 with friendly message: "${data.error}"`,
        })
      } else {
        addResult({
          name: 'API 500 JSON error',
          status: 'fail',
          detail: `Expected 500 with error message, got ${res.status}`,
        })
      }
    } catch (err) {
      addResult({
        name: 'API 500 JSON error',
        status: 'fail',
        detail: `Unexpected fetch error: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Test 2: API 500 with technical details - verify no stack trace shown
  async function testNoStackTrace() {
    setIsLoading(true)
    setApiError(null)
    try {
      const res = await fetch('/api/test-500?type=details')
      const data = await res.json()

      // The friendly UI should only show data.error, NOT data.stack or data.detail
      const hasStack = !!data.stack
      const hasDetail = !!data.detail
      const hasError = !!data.error

      if (res.status === 500 && hasError) {
        // We show only the error message to the user, never stack/detail
        const userMessage = data.error
        const containsStackInfo =
          userMessage.includes('at ') ||
          userMessage.includes('node_modules') ||
          userMessage.includes('.js:') ||
          userMessage.includes('.ts:')

        if (!containsStackInfo) {
          setApiError(userMessage)
          addResult({
            name: 'No stack trace in user message',
            status: 'pass',
            detail: `Error message "${userMessage}" contains no technical details. Raw response has stack=${hasStack}, detail=${hasDetail} (hidden from user).`,
          })
        } else {
          setApiError(userMessage)
          addResult({
            name: 'No stack trace in user message',
            status: 'fail',
            detail: `Error message contains stack trace info: "${userMessage}"`,
          })
        }
      } else {
        addResult({
          name: 'No stack trace in user message',
          status: 'fail',
          detail: `Expected 500 with error field, got ${res.status}`,
        })
      }
    } catch (err) {
      addResult({
        name: 'No stack trace in user message',
        status: 'fail',
        detail: `Unexpected fetch error: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Test 3: Trigger client-side render error to test error boundary
  function testRenderError() {
    setShowRenderError(true)
  }

  const passing = results.filter((r) => r.status === 'pass').length
  const total = results.length

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Test: API 500 Error Handling
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Feature #102: API 500 errors show user-friendly messages
        </p>

        {/* Test buttons */}
        <div className="space-y-3 mb-8">
          <button
            onClick={testJsonError}
            disabled={isLoading}
            className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Test 1: API 500 JSON Error
          </button>
          <button
            onClick={testNoStackTrace}
            disabled={isLoading}
            className="w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-medium text-white hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            Test 2: API 500 with Technical Details (no stack shown)
          </button>
          <button
            onClick={testRenderError}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
          >
            Test 3: Trigger Render Error (tests error boundary)
          </button>
        </div>

        {/* User-friendly error display (simulating what the app would show) */}
        {apiError && (
          <div className="mb-8 rounded-xl border-2 border-red-200 bg-red-50 p-6" data-testid="error-display">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-800">Er ging iets mis</h3>
                <p className="mt-1 text-sm text-red-700">{apiError}</p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setApiError(null)}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                  >
                    Opnieuw proberen
                  </button>
                  <button
                    onClick={() => setApiError(null)}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Terug
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Render error trigger */}
        {showRenderError && <ErrorThrower />}

        {/* Test results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              Resultaten: {passing}/{total} geslaagd
            </h2>
            {results.map((r) => (
              <div
                key={r.name}
                className={`rounded-lg border p-4 ${
                  r.status === 'pass'
                    ? 'border-emerald-200 bg-emerald-50'
                    : r.status === 'fail'
                    ? 'border-red-200 bg-red-50'
                    : 'border-zinc-200 bg-zinc-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={r.status === 'pass' ? 'text-emerald-600' : 'text-red-600'}>
                    {r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏳'}
                  </span>
                  <span className="text-sm font-medium text-zinc-900">{r.name}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{r.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
