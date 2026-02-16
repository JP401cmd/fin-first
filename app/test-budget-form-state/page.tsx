'use client'

import { useState, useEffect } from 'react'

/**
 * Test page for Feature #135: Budget form state survives accidental navigation
 * Tests that the budget form (BudgetForm + BudgetEditModal) properly:
 * 1. Tracks isDirty state when fields change
 * 2. Shows unsaved changes warning on navigation attempts
 * 3. Allows cancelling navigation (keeping form data intact)
 * 4. Allows confirming navigation (discarding changes)
 * 5. Shows dirty indicator
 * 6. Auto-saves draft to localStorage
 * 7. Recovers draft from localStorage
 * 8. Adds beforeunload event listener when dirty
 */

type TestResult = { name: string; status: 'pass' | 'fail' | 'pending'; detail?: string }

export default function TestBudgetFormStatePage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)

  async function runTests() {
    setRunning(true)
    const tests: TestResult[] = []

    // Test 1: BudgetForm has isDirty computed via useMemo
    try {
      const res = await fetch('/api/verify-budget-form-state')
      const data = await res.json()
      if (data.tests) {
        tests.push(...data.tests)
      }
    } catch (err) {
      tests.push({ name: 'API Tests', status: 'fail', detail: String(err) })
    }

    setResults(tests)
    setRunning(false)
  }

  useEffect(() => { runTests() }, [])

  const passCount = results.filter(r => r.status === 'pass').length
  const failCount = results.filter(r => r.status === 'fail').length

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #135: Budget Form State Survives Navigation
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Tests unsaved changes warning, dirty tracking, localStorage draft, and beforeunload protection
      </p>

      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={runTests}
          disabled={running}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Re-run Tests'}
        </button>
        <span className="text-sm text-zinc-600">
          {passCount}/{results.length} passing
          {failCount > 0 && <span className="ml-2 text-red-600">({failCount} failing)</span>}
        </span>
      </div>

      <div className="space-y-2">
        {results.map((t, i) => (
          <div key={i} className={`rounded-lg border p-3 ${
            t.status === 'pass' ? 'border-green-200 bg-green-50' :
            t.status === 'fail' ? 'border-red-200 bg-red-50' :
            'border-zinc-200 bg-zinc-50'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${
                t.status === 'pass' ? 'text-green-700' :
                t.status === 'fail' ? 'text-red-700' :
                'text-zinc-700'
              }`}>
                {t.status === 'pass' ? '✅' : t.status === 'fail' ? '❌' : '⏳'} {t.name}
              </span>
            </div>
            {t.detail && (
              <p className="mt-1 text-xs text-zinc-600">{t.detail}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
