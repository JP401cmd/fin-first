'use client'

import { useEffect, useState } from 'react'

type TestResult = { test: string; pass: boolean; detail: string }

export default function TestMultiTabPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-multi-tab')
      .then(r => r.json())
      .then(data => {
        setResults(data.results ?? [])
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading tests...</div>
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>

  const passing = results.filter(r => r.pass).length

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-bold text-zinc-900 mb-2">
        Feature #138: Multi-tab behavior does not corrupt data
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that opening the app in multiple browser tabs works without data conflicts.
      </p>

      <div className={`mb-6 rounded-xl p-4 text-sm font-semibold ${
        passing === results.length ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
      }`}>
        {passing}/{results.length} tests passing
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={i} className={`rounded-lg border p-4 ${r.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
              <span className="text-sm font-medium text-zinc-900">{r.test}</span>
            </div>
            <p className="mt-1 ml-7 text-xs text-zinc-500">{r.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <h2 className="text-sm font-semibold text-blue-800 mb-2">Multi-Tab Architecture Explanation</h2>
        <ul className="space-y-1 text-xs text-blue-700">
          <li>• <strong>Dashboard (/dashboard)</strong>: Server-side rendered (SSR). Every page visit runs fresh Supabase queries — no client-side state to conflict.</li>
          <li>• <strong>Assets (/core/assets)</strong>: Client component with useEffect that loads data on mount. Each tab gets its own React state — no shared mutable state.</li>
          <li>• <strong>Supabase Client</strong>: Uses createBrowserClient() which creates per-tab instances. No singleton pattern means no cross-tab contamination.</li>
          <li>• <strong>Data Persistence</strong>: All CRUD operations go directly to Supabase PostgreSQL. No in-memory stores (globalThis, window.__) that could cause conflicts.</li>
          <li>• <strong>Refresh Behavior</strong>: Tab 1 refresh re-queries Supabase, instantly reflecting changes made in Tab 2.</li>
        </ul>
      </div>
    </div>
  )
}
