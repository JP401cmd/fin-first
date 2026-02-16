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
  allPassing: boolean
  results: TestResult[]
}

export default function TestDirectIdentityPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-direct-identity')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="p-8 text-center">Loading verification...</div>
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>
  if (!data) return <div className="p-8 text-center">No data</div>

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold mb-2">Feature #149: Direct URL to /identity loads profile data</h1>
      <p className={`text-lg font-semibold mb-6 ${data.allPassing ? 'text-emerald-600' : 'text-red-600'}`}>
        {data.summary} — {data.allPassing ? '✅ ALL PASSING' : '❌ SOME FAILING'}
      </p>

      <div className="space-y-3">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
              <div>
                <p className={`font-medium ${r.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                  {i + 1}. {r.test}
                </p>
                <p className={`text-sm mt-1 ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                  {r.detail}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="font-semibold text-zinc-700 mb-2">How Direct /identity Access Works</h2>
        <ol className="list-decimal list-inside text-sm text-zinc-600 space-y-1">
          <li>User enters <code className="bg-zinc-200 px-1 rounded">/identity</code> in URL bar</li>
          <li>Proxy middleware checks for authentication (proxy.ts — /identity in protectedPrefixes)</li>
          <li>If unauthenticated → redirect to <code className="bg-zinc-200 px-1 rounded">/login?redirectTo=/identity</code></li>
          <li>If authenticated → App layout runs (getUser + FeatureAccessProvider)</li>
          <li>Identity page loads: client component fetches profile, assets, debts, transactions</li>
          <li>Profile data populates form fields; sovereignty level computed from financial data</li>
          <li>Chronology Scale shows current level; BadgeGrid renders earned badges</li>
        </ol>
      </div>
    </div>
  )
}
