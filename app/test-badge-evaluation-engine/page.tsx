'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

type VerificationResult = {
  feature: string
  passing: number
  total: number
  all_passing: boolean
  results: TestResult[]
}

export default function TestBadgeEvaluationEngine() {
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [evalResult, setEvalResult] = useState<Record<string, unknown> | null>(null)
  const [evalLoading, setEvalLoading] = useState(false)

  useEffect(() => {
    fetch('/api/verify-badge-evaluation-engine')
      .then(r => r.json())
      .then(setResult)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function triggerEvaluation(trigger: string) {
    setEvalLoading(true)
    try {
      const res = await fetch('/api/badges/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger }),
      })
      const data = await res.json()
      setEvalResult(data)
    } catch (err) {
      setEvalResult({ error: String(err) })
    } finally {
      setEvalLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-2 text-3xl font-bold text-zinc-900">
        Feature #204: Badge Evaluation Engine
      </h1>
      <p className="mb-8 text-zinc-500">
        Tests badge evaluation triggers: login, action completion, bank file import, month close/snapshot
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : result ? (
        <div className="space-y-6">
          {/* Summary */}
          <div className={`rounded-xl border-2 p-6 ${result.all_passing ? 'border-emerald-500 bg-emerald-50' : 'border-amber-500 bg-amber-50'}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{result.all_passing ? '✅' : '⚠️'}</span>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">
                  {result.passing}/{result.total} tests passing
                </h2>
                <p className="text-sm text-zinc-600">{result.feature}</p>
              </div>
            </div>
          </div>

          {/* Individual tests */}
          <div className="space-y-3">
            {result.results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-4 ${r.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">{r.pass ? '✅' : '❌'}</span>
                  <div>
                    <p className="font-medium text-zinc-900">{r.test}</p>
                    <p className="mt-1 text-sm text-zinc-600">{r.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Manual trigger test */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-bold text-zinc-900">Manual Trigger Test</h3>
            <div className="flex flex-wrap gap-2">
              {['login', 'action_complete', 'import', 'month_close', 'page_load', 'manual'].map(trigger => (
                <button
                  key={trigger}
                  onClick={() => triggerEvaluation(trigger)}
                  disabled={evalLoading}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {trigger}
                </button>
              ))}
            </div>
            {evalResult && (
              <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-zinc-700">
                {JSON.stringify(evalResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ) : (
        <p className="text-red-500">Failed to load verification results</p>
      )}
    </div>
  )
}
