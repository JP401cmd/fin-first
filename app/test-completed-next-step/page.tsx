'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  test: string
  passed: boolean
  details: string
}

type VerifyResponse = {
  feature: string
  summary: string
  all_passing: boolean
  results: TestResult[]
}

export default function TestCompletedNextStep() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Interactive test state
  const [stepKey, setStepKey] = useState('create_snapshot')
  const [completeResult, setCompleteResult] = useState<string | null>(null)
  const [nextStepsResult, setNextStepsResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-completed-next-step')
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
        body: JSON.stringify({ step_key: stepKey }),
      })
      const json = await res.json()
      setCompleteResult(JSON.stringify(json, null, 2))
    } catch (err) {
      setCompleteResult(`Error: ${err}`)
    }
  }

  const handleRefresh = async () => {
    setNextStepsResult('Loading...')
    try {
      const res = await fetch('/api/next-steps')
      const json = await res.json()
      setNextStepsResult(JSON.stringify({
        pending_count: json.pending_steps?.length ?? 0,
        pending_keys: json.pending_steps?.map((s: { key: string }) => s.key) ?? [],
        completed_steps: json.completed_steps ?? [],
        dismissed_steps: json.dismissed_steps ?? [],
        completed_count: json.completed_count ?? 0,
      }, null, 2))
    } catch (err) {
      setNextStepsResult(`Error: ${err}`)
    }
  }

  if (loading) return <div className="p-8 text-center text-zinc-500">Verifying feature #164...</div>
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>
  if (!data) return <div className="p-8 text-center text-zinc-500">No data</div>

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">Feature #164: Completed Next Step Removed</h1>
        <p className="mb-6 text-zinc-600">{data.feature}</p>

        {/* Summary Badge */}
        <div className={`mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
          data.all_passing
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {data.all_passing ? '✅' : '⚠️'} {data.summary}
        </div>

        {/* Test Results */}
        <div className="mb-8 space-y-3">
          {data.results.map((result, i) => (
            <div
              key={i}
              data-testid={`test-result-${i}`}
              className={`rounded-lg border p-4 ${
                result.passed
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{result.passed ? '✅' : '❌'}</span>
                <span className="font-medium text-zinc-900">{result.test}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600">{result.details}</p>
            </div>
          ))}
        </div>

        {/* Interactive Testing */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Interactive Test</h2>
          <p className="mb-4 text-sm text-zinc-600">
            Test the complete flow: mark a step as completed, then refresh to verify it&apos;s removed from suggestions.
          </p>

          <div className="space-y-4">
            {/* Step 1: Select and complete */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Step Key</label>
              <select
                value={stepKey}
                onChange={(e) => setStepKey(e.target.value)}
                className="mb-2 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="import_transactions">import_transactions</option>
                <option value="set_budgets">set_budgets</option>
                <option value="add_assets">add_assets</option>
                <option value="register_debts">register_debts</option>
                <option value="complete_profile">complete_profile</option>
                <option value="create_snapshot">create_snapshot</option>
                <option value="set_goals">set_goals</option>
              </select>
              <button
                onClick={handleComplete}
                className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                Complete Step
              </button>
              {completeResult && (
                <pre className="mt-2 rounded bg-zinc-100 p-2 text-xs text-zinc-700 overflow-auto">{completeResult}</pre>
              )}
            </div>

            {/* Step 2: Refresh next steps */}
            <div>
              <button
                onClick={handleRefresh}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Refresh Next Steps
              </button>
              {nextStepsResult && (
                <pre className="mt-2 rounded bg-zinc-100 p-2 text-xs text-zinc-700 overflow-auto">{nextStepsResult}</pre>
              )}
            </div>
          </div>
        </div>

        {/* Architecture Explanation */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">How It Works</h2>
          <ol className="space-y-2 text-sm text-zinc-700">
            <li><strong>1. Dual completion detection:</strong> Steps can be completed by real data state (e.g., user actually imported transactions) OR explicitly via POST /api/next-steps/complete.</li>
            <li><strong>2. Database recording:</strong> POST /complete upserts into next_step_completions with dismissed=false. The unique constraint on (user_id, step_key) ensures idempotency.</li>
            <li><strong>3. Server-side filtering:</strong> GET /api/next-steps builds completedByDb set from next_step_completions where dismissed=false. Each step&apos;s completed flag is: dataState OR completedByDb.has(key).</li>
            <li><strong>4. Client-side filtering:</strong> NextStepSection loads both dismissed_steps and completed_steps from the API on mount. Visible steps exclude both sets.</li>
            <li><strong>5. Pending calculation:</strong> pendingSteps = steps.filter(s =&gt; !s.completed &amp;&amp; !s.dismissed). Completed steps never appear in suggestions.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
