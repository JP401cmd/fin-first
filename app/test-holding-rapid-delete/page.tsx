'use client'

import { useState, useEffect } from 'react'

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
 * Test page for Feature #153: Rapid delete clicks on holding only deletes once
 *
 * Demonstrates:
 * 1. Source-code verification of delete protection mechanisms
 * 2. Interactive rapid-click simulation showing button disabling
 */
export default function TestHoldingRapidDelete() {
  const [verification, setVerification] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Interactive demo state
  const [demoDeleting, setDemoDeleting] = useState(false)
  const [demoDeleted, setDemoDeleted] = useState(false)
  const [demoConfirm, setDemoConfirm] = useState(false)
  const [demoClickCount, setDemoClickCount] = useState(0)
  const [demoProcessedCount, setDemoProcessedCount] = useState(0)

  useEffect(() => {
    fetch('/api/verify-holding-rapid-delete')
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

  // Simulate the delete flow with idempotency protection
  async function handleDemoDelete() {
    setDemoClickCount((c) => c + 1)

    // Guard: already deleting? return immediately
    if (demoDeleting || demoDeleted) return

    setDemoDeleting(true)
    setDemoProcessedCount((c) => c + 1)

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setDemoDeleted(true)
    setDemoDeleting(false)
  }

  function resetDemo() {
    setDemoDeleting(false)
    setDemoDeleted(false)
    setDemoConfirm(false)
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
          Feature #153: Rapid Delete Protection
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verifies that rapid clicking the delete confirm button only deletes once (no errors)
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
                    ? 'All rapid-delete protection mechanisms verified'
                    : 'Some protection mechanisms missing'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Source Code Verification Results */}
        <div className="mb-8 space-y-2" data-testid="verification-results">
          <h2 className="mb-3 text-lg font-semibold text-zinc-800">
            Source Code Verification (10 checks)
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
            Interactive Rapid-Delete Demo
          </h2>
          <p className="mb-4 text-xs text-zinc-500">
            First click &quot;Verwijderen&quot; to show confirmation, then click &quot;Ja&quot; rapidly to simulate rapid delete.
          </p>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-zinc-50 p-3 text-center">
              <div className="text-2xl font-bold text-zinc-900" data-testid="click-count">
                {demoClickCount}
              </div>
              <div className="text-xs text-zinc-500">Klikken op &quot;Ja&quot;</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600" data-testid="processed-count">
                {demoProcessedCount}
              </div>
              <div className="text-xs text-zinc-500">Daadwerkelijk verwerkt</div>
            </div>
          </div>

          {/* Simulated holding row */}
          <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-800">Demo Holding</p>
                <p className="text-xs text-zinc-500">€1.000,00 — ter demonstratie</p>
              </div>
              <div className="flex gap-1">
                {demoDeleted ? (
                  <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700" data-testid="deleted-badge">
                    Verwijderd ✓
                  </span>
                ) : demoConfirm ? (
                  <div className="flex gap-1">
                    <button
                      onClick={handleDemoDelete}
                      disabled={demoDeleting}
                      className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="demo-confirm-btn"
                    >
                      {demoDeleting ? '...' : 'Ja'}
                    </button>
                    <button
                      onClick={() => setDemoConfirm(false)}
                      disabled={demoDeleting}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Nee
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDemoConfirm(true)}
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    data-testid="demo-delete-btn"
                  >
                    🗑️ Verwijderen
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={resetDemo}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            data-testid="demo-reset-btn"
          >
            Reset demo
          </button>

          {demoDeleted && demoClickCount > 1 && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3" data-testid="demo-success">
              <p className="text-sm text-emerald-700">
                ✅ {demoClickCount} klikken op &quot;Ja&quot;, maar slechts {demoProcessedCount} delete uitgevoerd — duplicaat voorkomen!
              </p>
            </div>
          )}
        </div>

        {/* Protection Architecture */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-zinc-800">Delete Protection Architecture</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">1</span>
              <div>
                <p className="font-medium text-zinc-800">Two-step confirmation</p>
                <p className="text-xs text-zinc-500">First click shows Ja/Nee, second click confirms — prevents accidental delete</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">2</span>
              <div>
                <p className="font-medium text-zinc-800">Early return guard</p>
                <p className="text-xs text-zinc-500">if (deleting) return — blocks all rapid clicks while first delete is processing</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">3</span>
              <div>
                <p className="font-medium text-zinc-800">Deleting state lock</p>
                <p className="text-xs text-zinc-500">setDeleting(id) before fetch — concurrent clicks are rejected</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">4</span>
              <div>
                <p className="font-medium text-zinc-800">Button disabled attribute</p>
                <p className="text-xs text-zinc-500">disabled=&#123;deleting === holding.id&#125; — UI prevents clicks during deletion</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">5</span>
              <div>
                <p className="font-medium text-zinc-800">Visual feedback</p>
                <p className="text-xs text-zinc-500">&quot;...&quot; loading text on button — user sees it&apos;s processing</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">6</span>
              <div>
                <p className="font-medium text-zinc-800">Optimistic UI removal</p>
                <p className="text-xs text-zinc-500">Holding removed from list immediately — second click has no target</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">7</span>
              <div>
                <p className="font-medium text-zinc-800">Idempotent API endpoint</p>
                <p className="text-xs text-zinc-500">DELETE returns success even if 0 rows deleted — no error on re-delete</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
