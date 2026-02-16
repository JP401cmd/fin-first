'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  details: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestBookmarkBelasting() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-bookmark-belasting')
      .then(res => res.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading verification...</div>
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>
  if (!data) return null

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900">
        Feature #150: Bookmarked pages load correctly after session refresh
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Verifies that /core/belasting loads correctly when accessed as a deep link / bookmark.
      </p>

      <div className={`mt-6 rounded-xl border p-4 ${data.allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        <p className={`text-lg font-bold ${data.allPassing ? 'text-emerald-700' : 'text-red-700'}`}>
          {data.summary}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.pass ? 'border-emerald-200 bg-white' : 'border-red-200 bg-red-50'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-lg ${r.pass ? 'text-emerald-500' : 'text-red-500'}`}>
                {r.pass ? '✅' : '❌'}
              </span>
              <span className="text-sm font-medium text-zinc-900">{r.name}</span>
            </div>
            <p className="mt-1 ml-7 text-xs text-zinc-500">{r.details}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-900">How Bookmark Flow Works</h2>
        <ol className="mt-3 space-y-2 text-xs text-zinc-600 list-decimal pl-5">
          <li>User bookmarks <code className="bg-zinc-100 px-1 py-0.5 rounded">/core/belasting</code></li>
          <li>On next visit (no session), proxy middleware intercepts the request</li>
          <li>Redirects to <code className="bg-zinc-100 px-1 py-0.5 rounded">/login?redirectTo=/core/belasting</code></li>
          <li>If session was expired, adds <code className="bg-zinc-100 px-1 py-0.5 rounded">&expired=1</code> param</li>
          <li>Login page shows &quot;Sessie verlopen&quot; banner if expired</li>
          <li>After successful login, redirects to <code className="bg-zinc-100 px-1 py-0.5 rounded">/core/belasting</code></li>
          <li>Belasting page loads assets, debts, and transactions from Supabase</li>
          <li>Tax calculation displays: belasting amount, vrijheidsdagen, effectief tarief</li>
        </ol>
      </div>
    </div>
  )
}
