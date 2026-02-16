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
  error?: string
}

export default function TestOnboardingRedirect() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-onboarding-redirect')
      .then(r => r.json())
      .then(setData)
      .catch(err => setData({ feature: 'Error', summary: err.message, allPassing: false, results: [] }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  if (!data) return <div className="p-8 text-red-600">Failed to load test results</div>

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Feature #151: Onboarding Redirect Test
        </h1>
        <p className="mb-6 text-zinc-600">
          Verifies that onboarded users visiting /onboarding are redirected to /dashboard
        </p>

        {/* Summary banner */}
        <div className={`mb-6 rounded-xl p-4 ${data.allPassing ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{data.allPassing ? '✅' : '⚠️'}</span>
            <div>
              <p className="font-semibold text-zinc-900">{data.summary}</p>
              <p className="text-sm text-zinc-600">{data.feature}</p>
            </div>
          </div>
        </div>

        {/* Test results */}
        <div className="space-y-3">
          {data.results.map((result, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${result.pass ? 'border-green-200 bg-white' : 'border-red-200 bg-red-50'}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">{result.pass ? '✅' : '❌'}</span>
                <div>
                  <p className="font-medium text-zinc-900">{result.name}</p>
                  <p className="text-sm text-zinc-500">{result.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Architecture explanation */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">How It Works</h2>
          <div className="space-y-4 text-sm text-zinc-600">
            <div>
              <h3 className="font-medium text-zinc-800">1. Middleware (proxy.ts)</h3>
              <p>/onboarding is a protected route — unauthenticated users are redirected to /login</p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-800">2. Layout (server-side)</h3>
              <p>The onboarding layout checks auth and redirects to /login if not authenticated</p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-800">3. Page (client-side)</h3>
              <p>On mount, the page queries profiles.onboarding_completed. If true, it calls router.replace(&apos;/dashboard&apos;) and returns before rendering any onboarding UI</p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-800">4. API Protection</h3>
              <p>POST /api/onboarding/seed returns 403 if onboarding_completed=true, preventing re-seeding</p>
            </div>
          </div>
        </div>

        {/* Flow diagram */}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">Redirect Flow</h2>
          <pre className="overflow-x-auto text-xs text-zinc-600 font-mono leading-relaxed">
{`User visits /onboarding
    │
    ├─ Not authenticated?
    │   └─ Middleware → redirect to /login
    │
    ├─ Authenticated, onboarding_completed = false?
    │   └─ Show onboarding flow (intro → choose → ...)
    │
    └─ Authenticated, onboarding_completed = true?
        └─ router.replace('/dashboard') ← NO onboarding UI shown
           (loading spinner during check prevents flash)`}
          </pre>
        </div>
      </div>
    </div>
  )
}
