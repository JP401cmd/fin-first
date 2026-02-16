'use client'

import { useEffect, useState } from 'react'

type TestResult = { test: string; pass: boolean; detail: string }
type VerifyResponse = { feature: string; summary: string; allPassing: boolean; results: TestResult[] }

export default function TestSpecialCharsUrl() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-special-chars-url')
      .then(res => res.json())
      .then(setData)
      .catch(err => console.error('Verify error:', err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-zinc-500">Running verification tests...</div>
  if (!data) return <div className="p-8 text-red-500">Failed to load verification results</div>

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">{data.feature}</h1>
        <p className={`text-lg font-semibold mb-6 ${data.allPassing ? 'text-green-600' : 'text-red-600'}`}>
          {data.summary} — {data.allPassing ? 'ALL PASSING' : 'SOME FAILING'}
        </p>

        <div className="space-y-3">
          {data.results.map((r, i) => (
            <div key={i} className={`rounded-lg border p-4 ${r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{r.pass ? '✅' : '❌'}</span>
                <div>
                  <p className="font-medium text-zinc-900">{r.test}</p>
                  <p className="text-sm text-zinc-600 mt-1">{r.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-900 mb-3">Security Architecture Summary</h2>
          <ul className="space-y-2 text-sm text-zinc-700">
            <li><strong>XSS Protection:</strong> React JSX auto-escapes all text content. No dangerouslySetInnerHTML used. URL parameters are not rendered as raw HTML.</li>
            <li><strong>SQL Injection Protection:</strong> All database queries use Supabase SDK parameterized methods (.eq(), .from(), .select()). No raw SQL string concatenation.</li>
            <li><strong>Auth Defense:</strong> Protected routes (/core/*) require authentication. Unauthenticated requests are redirected to /login before reaching page components.</li>
            <li><strong>Open Redirect Prevention:</strong> Login page validates redirectTo starts with / before using it for navigation.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
