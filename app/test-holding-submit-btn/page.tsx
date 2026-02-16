'use client'

import { useState, useEffect, useRef } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

export default function TestHoldingSubmitBtn() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Interactive demo state
  const [demoSaving, setDemoSaving] = useState(false)
  const [demoSubmitted, setDemoSubmitted] = useState(false)
  const [demoName, setDemoName] = useState('Test Holding')
  const [clickCount, setClickCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/verify-holding-submit-btn')
      .then((res) => res.json())
      .then((data) => {
        setResults(data.results || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Demo: simulate the saving flow
  function handleDemoClick() {
    if (demoSaving || demoSubmitted || !demoName) return

    setClickCount((c) => c + 1)
    setDemoSaving(true)

    // Simulate async save
    timerRef.current = setTimeout(() => {
      setDemoSaving(false)
      setDemoSubmitted(true)
    }, 2000)
  }

  function resetDemo() {
    setDemoSaving(false)
    setDemoSubmitted(false)
    setClickCount(0)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  if (loading) return <div className="p-8 text-center">Loading verification...</div>
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Feature #159: Submit Button Disabled During Holding Save
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verify that the submit button shows loading state and prevents re-submission
        </p>

        {/* Score */}
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className={`text-3xl font-bold ${passing === total ? 'text-green-600' : 'text-amber-600'}`}>
              {passing}/{total}
            </span>
            <span className="text-sm text-zinc-500">verification checks passing</span>
          </div>
        </div>

        {/* Test results */}
        <div className="mb-8 space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                r.pass
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <span className="mt-0.5 text-lg">{r.pass ? '✅' : '❌'}</span>
              <div>
                <p className={`text-sm font-medium ${r.pass ? 'text-green-800' : 'text-red-800'}`}>
                  {r.name}
                </p>
                <p className={`text-xs ${r.pass ? 'text-green-600' : 'text-red-600'}`}>
                  {r.detail}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive demo */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-zinc-900">Interactive Demo</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Simulates the submit button behavior from the HoldingForm component.
            Click the button to see loading state → disabled → success flow.
          </p>

          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm text-zinc-600">Name:</label>
            <input
              value={demoName}
              onChange={(e) => setDemoName(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
              placeholder="Enter name..."
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleDemoClick}
              disabled={demoSaving || demoSubmitted || !demoName}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              data-testid="demo-submit-btn"
            >
              {demoSubmitted ? 'Opgeslagen ✓' : demoSaving ? 'Opslaan...' : 'Toevoegen'}
            </button>

            <button
              onClick={resetDemo}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              Reset Demo
            </button>
          </div>

          <div className="mt-4 space-y-1">
            <p className="text-xs text-zinc-500">
              Button clicks registered: <strong data-testid="click-count">{clickCount}</strong>
            </p>
            <p className="text-xs text-zinc-500">
              State: <strong data-testid="demo-state">
                {demoSubmitted ? 'submitted' : demoSaving ? 'saving' : 'idle'}
              </strong>
            </p>
          </div>
        </div>

        {/* Implementation details */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-bold text-zinc-900">Implementation Details</h2>
          <ul className="space-y-2 text-xs text-zinc-600">
            <li>• <strong>saving state:</strong> Controls loading state (Opslaan... text + disabled)</li>
            <li>• <strong>submitted state:</strong> Prevents re-submission after success (Opgeslagen ✓)</li>
            <li>• <strong>disabled prop:</strong> {`disabled={saving || submitted || !name}`} blocks clicks</li>
            <li>• <strong>Guard clause:</strong> handleSave returns early if submitted or no name</li>
            <li>• <strong>finally block:</strong> setSaving(false) always runs, even on error</li>
            <li>• <strong>Visual feedback:</strong> disabled:opacity-50 dims the button</li>
            <li>• <strong>Idempotency key:</strong> X-Idempotency-Key header prevents server-side duplicates</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
