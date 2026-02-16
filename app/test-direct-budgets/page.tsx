'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestDirectBudgetsPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/verify-direct-budgets')
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error || 'Failed to load'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900">Feature #143: Direct Access to /core/budgets</h1>
      <p className="mt-2 text-sm text-zinc-500">{data.feature}</p>

      <div className={`mt-6 rounded-xl border p-4 ${data.allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className={`text-lg font-bold ${data.allPassing ? 'text-emerald-700' : 'text-amber-700'}`}>
          {data.summary}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {data.allPassing ? 'All checks passing — direct URL access to /core/budgets works correctly' : 'Some checks need attention'}
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {data.results.map((result, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${
              result.pass
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">{result.pass ? '✅' : '❌'}</span>
              <div>
                <p className={`text-sm font-medium ${result.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                  {result.name}
                </p>
                <p className="mt-1 text-xs text-zinc-600">{result.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-900">How Direct URL Access Works</h2>
        <div className="mt-4 space-y-3 text-sm text-zinc-600">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-amber-600">1.</span>
            <p>User enters <code className="rounded bg-zinc-100 px-1">/core/budgets</code> directly in browser address bar</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-amber-600">2.</span>
            <p>Proxy middleware checks authentication via Supabase JWT cookies</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-amber-600">3a.</span>
            <p><strong>If not authenticated:</strong> Redirects to <code className="rounded bg-zinc-100 px-1">/login?redirectTo=/core/budgets</code></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-amber-600">3b.</span>
            <p><strong>If authenticated:</strong> App layout verifies session, loads feature access data, renders page</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-amber-600">4.</span>
            <p>Budget page (client component) mounts and fetches budgets via <code className="rounded bg-zinc-100 px-1">useEffect</code></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-amber-600">5.</span>
            <p>Loading spinner shows while data fetches, then budget tree/blob/sankey/donut renders</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-amber-600">6.</span>
            <p>If no budgets exist, auto-seeds default Dutch budget structure (Inkomen, Uitgaven, Sparen, Schulden)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
