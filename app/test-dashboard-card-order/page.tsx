'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  test: string
  passed: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

/**
 * Test page for Feature #137: Dashboard module card order persists
 *
 * Verifies that the dashboard consistently shows module cards in order:
 * 1. De Kern (amber) → /core
 * 2. De Wil (teal) → /will
 * 3. De Horizon (purple) → /horizon
 */
export default function TestDashboardCardOrder() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-dashboard-card-order')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading verification...</div>
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>
  if (!data) return <div className="p-8 text-center text-zinc-500">No data</div>

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #137: Dashboard Module Card Order
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Verifies that module cards always appear in order: Kern → Wil → Horizon
      </p>

      {/* Summary */}
      <div
        className={`mb-8 rounded-lg border p-4 ${
          data.allPassing
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}
      >
        <p className={`font-semibold ${data.allPassing ? 'text-green-800' : 'text-red-800'}`}>
          {data.allPassing ? '✅ ALL TESTS PASSING' : '❌ SOME TESTS FAILING'}
        </p>
        <p className={`mt-1 text-sm ${data.allPassing ? 'text-green-600' : 'text-red-600'}`}>
          {data.summary}
        </p>
      </div>

      {/* Test Results */}
      <div className="space-y-3">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${
              r.passed ? 'border-green-200 bg-white' : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{r.passed ? '✅' : '❌'}</span>
              <div>
                <p className="font-medium text-zinc-900">{r.test}</p>
                <p className="mt-1 text-xs text-zinc-500">{r.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Visual card order demonstration */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold text-zinc-900">Visual Card Order Preview</h2>
        <p className="mb-4 text-sm text-zinc-500">
          This shows the expected card order on the dashboard. The order is statically defined in
          the JSX and does not change between sessions, navigations, or login cycles.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Card 1: De Kern */}
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
            <div className="mb-2 text-xs font-bold uppercase text-amber-600">Card #1</div>
            <h3 className="text-lg font-bold text-zinc-900">De Kern</h3>
            <p className="text-sm text-amber-600">Waar sta je echt?</p>
            <p className="mt-2 text-xs text-zinc-400">Route: /core</p>
            <p className="text-xs text-zinc-400">Color: amber</p>
            <p className="text-xs text-zinc-400">Avatar: FhinAvatar</p>
          </div>

          {/* Card 2: De Wil */}
          <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-5">
            <div className="mb-2 text-xs font-bold uppercase text-teal-600">Card #2</div>
            <h3 className="text-lg font-bold text-zinc-900">De Wil</h3>
            <p className="text-sm text-teal-600">Wat ga je doen?</p>
            <p className="mt-2 text-xs text-zinc-400">Route: /will</p>
            <p className="text-xs text-zinc-400">Color: teal</p>
            <p className="text-xs text-zinc-400">Avatar: FinnAvatar</p>
          </div>

          {/* Card 3: De Horizon */}
          <div className="rounded-2xl border-2 border-purple-300 bg-purple-50 p-5">
            <div className="mb-2 text-xs font-bold uppercase text-purple-600">Card #3</div>
            <h3 className="text-lg font-bold text-zinc-900">De Horizon</h3>
            <p className="text-sm text-purple-600">Waar ga je naartoe?</p>
            <p className="mt-2 text-xs text-zinc-400">Route: /horizon</p>
            <p className="text-xs text-zinc-400">Color: purple</p>
            <p className="text-xs text-zinc-400">Avatar: FfinAvatar</p>
          </div>
        </div>
      </section>

      {/* Persistence explanation */}
      <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
        <h3 className="font-semibold text-zinc-900">Why the order persists</h3>
        <ul className="mt-2 space-y-1 text-sm text-zinc-600">
          <li>• Card order is <strong>statically hardcoded</strong> in the dashboard JSX</li>
          <li>• No dynamic rendering (.map/.forEach) is used for the card section</li>
          <li>• The grid uses CSS <code>md:grid-cols-3</code> — cards render left to right</li>
          <li>• No user preference or localStorage affects card positioning</li>
          <li>• Navigation away/back renders the same server component</li>
          <li>• Login/logout reloads the page, but the JSX order is identical</li>
        </ul>
      </section>
    </div>
  )
}
