'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  test: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestBeheerRedirect() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-beheer-admin-redirect')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-zinc-500">Loading tests...</div>
  if (!data) return <div className="p-8 text-red-500">Failed to load test results</div>

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #147: Non-admin /beheer redirect
      </h1>
      <p className="mb-6 text-sm text-zinc-500">{data.feature}</p>

      <div className={`mb-6 rounded-lg p-4 ${data.allPassing ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
        <span className="text-lg font-semibold">{data.summary}</span>
        {data.allPassing && <span className="ml-2">✅ All tests passing</span>}
      </div>

      <div className="space-y-3">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
              <span className="font-medium text-zinc-900">{r.test}</span>
            </div>
            <p className="mt-1 ml-7 text-sm text-zinc-600">{r.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="font-semibold text-zinc-900">How This Protection Works</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm text-zinc-600">
          <li>
            <strong>Proxy middleware</strong> checks if user is authenticated.
            Unauthenticated access to /beheer redirects to /login.
          </li>
          <li>
            <strong>Beheer layout (server component)</strong> calls <code>isSuperAdmin()</code> which
            queries the profiles table for <code>role === &apos;superadmin&apos;</code>.
          </li>
          <li>
            If the user is not a superadmin, <code>redirect(&apos;/dashboard&apos;)</code> is called
            <strong> server-side before any JSX renders</strong> — no admin content flash.
          </li>
          <li>
            Only after passing both checks does the admin UI (BeheerNav, page content) render.
          </li>
        </ol>
      </div>
    </div>
  )
}
