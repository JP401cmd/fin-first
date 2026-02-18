'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  all_pass: boolean
  authenticated: boolean
  results: TestResult[]
  timestamp: string
}

export default function TestNextStepCompletionTracking() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Interactive test state
  const [completeResult, setCompleteResult] = useState<string | null>(null)
  const [dismissResult, setDismissResult] = useState<string | null>(null)
  const [nextStepsResult, setNextStepsResult] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState('create_snapshot')

  useEffect(() => {
    fetch('/api/verify-next-step-completion-tracking')
      .then(res => res.json())
      .then(json => {
        setData(json)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const handleComplete = async () => {
    setCompleteResult('Completing...')
    try {
      const res = await fetch('/api/next-steps/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: selectedKey }),
      })
      const json = await res.json()
      setCompleteResult(JSON.stringify(json, null, 2))
    } catch (err) {
      setCompleteResult(`Error: ${err}`)
    }
  }

  const handleDismiss = async () => {
    setDismissResult('Dismissing...')
    try {
      const res = await fetch('/api/next-steps/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: selectedKey }),
      })
      const json = await res.json()
      setDismissResult(JSON.stringify(json, null, 2))
    } catch (err) {
      setDismissResult(`Error: ${err}`)
    }
  }

  const handleGetNextSteps = async () => {
    setNextStepsResult('Loading...')
    try {
      const res = await fetch('/api/next-steps')
      const json = await res.json()
      setNextStepsResult(JSON.stringify({
        next_step: json.next_step?.key ?? null,
        pending_count: json.pending_steps?.length ?? 0,
        pending_keys: json.pending_steps?.map((s: { key: string }) => s.key) ?? [],
        completed_steps: json.completed_steps ?? [],
        dismissed_steps: json.dismissed_steps ?? [],
        completed_count: json.completed_count ?? 0,
        dismissed_count: json.dismissed_count ?? 0,
        total_steps: json.total_steps ?? 0,
        source: json.source ?? 'unknown',
      }, null, 2))
    } catch (err) {
      setNextStepsResult(`Error: ${err}`)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-zinc-50 text-zinc-500">Verifying feature #247...</div>
  if (error) return <div className="flex items-center justify-center min-h-screen bg-zinc-50 text-red-500">Error: {error}</div>
  if (!data) return <div className="flex items-center justify-center min-h-screen bg-zinc-50 text-zinc-500">No data</div>

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">Feature #247: NextStepCard Completion Tracking</h1>
        <p className="mb-2 text-zinc-600">{data.feature}</p>
        <p className="mb-6 text-xs text-zinc-400">Auth: {data.authenticated ? 'Authenticated' : 'Not authenticated'} | {data.timestamp}</p>

        {/* Summary Badge */}
        <div className={`mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
          data.all_pass
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {data.all_pass ? '✅' : '⚠️'} {data.summary}
        </div>

        {/* Test Results */}
        <div className="mb-8 space-y-3">
          {data.results.map((result, i) => (
            <div
              key={i}
              data-testid={`test-result-${i}`}
              className={`rounded-lg border p-4 ${
                result.pass
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{result.pass ? '✅' : '❌'}</span>
                <span className="font-medium text-zinc-900">{result.test}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600">{result.detail}</p>
            </div>
          ))}
        </div>

        {/* Interactive Testing */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Interactive API Testing</h2>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Step Key</label>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="import_transactions">import_transactions</option>
              <option value="set_budgets">set_budgets</option>
              <option value="add_assets">add_assets</option>
              <option value="register_debts">register_debts</option>
              <option value="complete_profile">complete_profile</option>
              <option value="create_snapshot">create_snapshot</option>
              <option value="set_goals">set_goals</option>
            </select>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={handleComplete}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              Complete Step
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Dismiss Step
            </button>
            <button
              onClick={handleGetNextSteps}
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Get Next Steps
            </button>
          </div>

          {completeResult && (
            <div className="mb-3">
              <div className="text-xs font-bold text-zinc-500 mb-1">Complete Result:</div>
              <pre className="rounded bg-zinc-100 p-2 text-xs text-zinc-700 overflow-auto max-h-40">{completeResult}</pre>
            </div>
          )}
          {dismissResult && (
            <div className="mb-3">
              <div className="text-xs font-bold text-zinc-500 mb-1">Dismiss Result:</div>
              <pre className="rounded bg-zinc-100 p-2 text-xs text-zinc-700 overflow-auto max-h-40">{dismissResult}</pre>
            </div>
          )}
          {nextStepsResult && (
            <div className="mb-3">
              <div className="text-xs font-bold text-zinc-500 mb-1">Next Steps Result:</div>
              <pre className="rounded bg-zinc-100 p-2 text-xs text-zinc-700 overflow-auto max-h-40">{nextStepsResult}</pre>
            </div>
          )}
        </div>

        {/* Architecture */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">Architecture</h2>
          <div className="space-y-3 text-sm text-zinc-700">
            <div>
              <strong className="text-zinc-900">Database Table:</strong>
              <pre className="mt-1 rounded bg-zinc-100 p-2 text-xs">
{`next_step_completions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, step_key)
)`}
              </pre>
            </div>
            <div>
              <strong className="text-zinc-900">API Endpoints:</strong>
              <ul className="mt-1 ml-4 space-y-1 list-disc">
                <li><code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">POST /api/next-steps/complete</code> — Marks step as completed (dismissed=false)</li>
                <li><code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">POST /api/next-steps/dismiss</code> — Marks step as dismissed (dismissed=true)</li>
                <li><code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">GET /api/next-steps</code> — Returns pending, completed, and dismissed steps</li>
              </ul>
            </div>
            <div>
              <strong className="text-zinc-900">Security:</strong>
              <ul className="mt-1 ml-4 space-y-1 list-disc">
                <li>RLS: users can only access own rows (auth.uid() = user_id)</li>
                <li>Auth required on all endpoints (401 for unauthenticated)</li>
                <li>Unique constraint prevents duplicate entries per user+step</li>
              </ul>
            </div>
            <div>
              <strong className="text-zinc-900">Dual Completion Logic:</strong>
              <p className="mt-1">A step is &quot;completed&quot; if EITHER the real data state shows it (e.g., user has transactions for import_transactions) OR it was explicitly marked via POST /api/next-steps/complete.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
