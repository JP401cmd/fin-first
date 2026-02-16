'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerificationResponse = {
  title: string
  summary: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

/**
 * Test page for Feature #152: Double-click on holding create button does not create duplicates
 *
 * Demonstrates:
 * 1. Source-code verification of 8 protection mechanisms
 * 2. Interactive double-click simulation showing button disabling
 */
export default function TestHoldingDoubleClick() {
  const [verification, setVerification] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Interactive demo state
  const [demoSaving, setDemoSaving] = useState(false)
  const [demoSubmitted, setDemoSubmitted] = useState(false)
  const [demoClickCount, setDemoClickCount] = useState(0)
  const [demoProcessedCount, setDemoProcessedCount] = useState(0)
  const demoNameRef = useRef('Demo Holding')

  useEffect(() => {
    fetch('/api/verify-holding-double-click')
      .then((res) => res.json())
      .then((data) => {
        setVerification(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Simulate the same handleSave logic from the real HoldingForm
  const handleDemoSave = useCallback(async () => {
    if (!demoNameRef.current || demoSubmitted) return
    setDemoClickCount((c) => c + 1)

    // This guard mirrors the real form: once saving or submitted, exit early
    if (demoSaving || demoSubmitted) return

    setDemoSaving(true)
    setDemoProcessedCount((c) => c + 1)

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setDemoSubmitted(true)
    setDemoSaving(false)
  }, [demoSaving, demoSubmitted])

  const resetDemo = () => {
    setDemoSaving(false)
    setDemoSubmitted(false)
    setDemoClickCount(0)
    setDemoProcessedCount(0)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
        <div className="animate-pulse text-zinc-400">Verificatie laden...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Feature #152: Double-Click Protection
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verifies that rapid clicking the holding creation submit button does not create duplicates
        </p>

        {/* Summary */}
        {verification && (
          <div
            className={`mb-6 rounded-xl border p-4 ${
              verification.allPassing
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
            data-testid="summary-badge"
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl">{verification.allPassing ? '✅' : '❌'}</span>
              <div>
                <p className="font-semibold text-zinc-900">{verification.summary}</p>
                <p className="text-xs text-zinc-500">
                  {verification.allPassing
                    ? 'All double-click protection mechanisms verified'
                    : 'Some protection mechanisms missing'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Source Code Verification Results */}
        <div className="mb-8 space-y-2" data-testid="verification-results">
          <h2 className="mb-3 text-lg font-semibold text-zinc-800">
            Source Code Verification (8 layers of protection)
          </h2>
          {verification?.results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                r.pass ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'
              }`}
              data-testid={`test-${i}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-sm">{r.pass ? '✅' : '❌'}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-800">{r.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{r.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive Demo */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-zinc-800">
            Interactive Double-Click Demo
          </h2>
          <p className="mb-4 text-xs text-zinc-500">
            Click the button rapidly to see how the protection works. Only one &quot;save&quot; will process.
          </p>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-zinc-50 p-3 text-center">
              <div className="text-2xl font-bold text-zinc-900" data-testid="click-count">
                {demoClickCount}
              </div>
              <div className="text-xs text-zinc-500">Klikken geregistreerd</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600" data-testid="processed-count">
                {demoProcessedCount}
              </div>
              <div className="text-xs text-zinc-500">Daadwerkelijk verwerkt</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDemoSave}
              disabled={demoSaving || demoSubmitted || !demoNameRef.current}
              className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="demo-submit-btn"
            >
              {demoSubmitted ? 'Opgeslagen ✓' : demoSaving ? 'Opslaan...' : 'Toevoegen'}
            </button>
            <button
              onClick={resetDemo}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              data-testid="demo-reset-btn"
            >
              Reset demo
            </button>
          </div>

          {demoSubmitted && demoClickCount > 1 && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3" data-testid="demo-success">
              <p className="text-sm text-emerald-700">
                ✅ {demoClickCount} klikken, maar slechts {demoProcessedCount} verwerkt — duplicaten voorkomen!
              </p>
            </div>
          )}
        </div>

        {/* Protection Architecture */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-zinc-800">Protection Architecture</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">1</span>
              <div>
                <p className="font-medium text-zinc-800">Early return guard</p>
                <p className="text-xs text-zinc-500">if (!name || submitted) return — blocks all calls after first success</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">2</span>
              <div>
                <p className="font-medium text-zinc-800">Saving state lock</p>
                <p className="text-xs text-zinc-500">setSaving(true) before fetch — blocks concurrent calls</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">3</span>
              <div>
                <p className="font-medium text-zinc-800">Button disabled attribute</p>
                <p className="text-xs text-zinc-500">disabled=&#123;saving || submitted || !name&#125; — UI-level block</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">4</span>
              <div>
                <p className="font-medium text-zinc-800">Visual feedback</p>
                <p className="text-xs text-zinc-500">&quot;Opslaan...&quot; → &quot;Opgeslagen ✓&quot; — user sees processing state</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">5</span>
              <div>
                <p className="font-medium text-zinc-800">Submitted flag</p>
                <p className="text-xs text-zinc-500">setSubmitted(true) after success — permanently blocks re-submission</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">6</span>
              <div>
                <p className="font-medium text-zinc-800">Idempotency key</p>
                <p className="text-xs text-zinc-500">crypto.randomUUID() + X-Idempotency-Key header — server deduplication</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">7</span>
              <div>
                <p className="font-medium text-zinc-800">Server-side cache</p>
                <p className="text-xs text-zinc-500">5-minute idempotency cache — cached response returned for duplicate keys</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">8</span>
              <div>
                <p className="font-medium text-zinc-800">History state protection</p>
                <p className="text-xs text-zinc-500">window.history.replaceState — back button cannot re-trigger form</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
