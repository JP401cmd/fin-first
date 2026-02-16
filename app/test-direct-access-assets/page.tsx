'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestDirectAccessAssets() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-direct-access-assets')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-zinc-500">Verifying feature #142...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-xl font-bold text-zinc-900">Feature #142 Verification</h1>
      <p className="mt-1 text-sm text-zinc-500">{data.feature}</p>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
            data.allPassing ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {data.allPassing ? '✓' : '✗'}
          </span>
          <span className="text-lg font-semibold text-zinc-900">{data.summary}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {data.results.map((r, i) => (
          <div key={i} className={`rounded-xl border p-3 ${
            r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}>
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 text-sm font-bold ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.pass ? '✓' : '✗'}
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-900">{r.test}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{r.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-800">Flow Verification</h2>
        <div className="mt-2 space-y-1 text-xs text-amber-700">
          <p>1. User navigates directly to <code className="rounded bg-amber-100 px-1">/core/assets</code></p>
          <p>2. If not authenticated: Proxy redirects to <code className="rounded bg-amber-100 px-1">/login?redirectTo=/core/assets</code></p>
          <p>3. User logs in on the login page</p>
          <p>4. After successful login, router.push navigates to <code className="rounded bg-amber-100 px-1">/core/assets</code> (from redirectTo param)</p>
          <p>5. App layout verifies user session and renders the page</p>
          <p>6. Assets page loads real data from Supabase and displays portfolio</p>
        </div>
      </div>
    </div>
  )
}
