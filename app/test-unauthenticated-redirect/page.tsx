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

export default function TestUnauthenticatedRedirect() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [redirectTestResult, setRedirectTestResult] = useState<string | null>(null)
  const [redirectTestPass, setRedirectTestPass] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/verify-unauthenticated-redirect')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  async function testLiveRedirect() {
    setRedirectTestResult(null)
    setRedirectTestPass(null)
    try {
      // Test that accessing /core/debts without auth redirects to login
      // We use fetch with redirect: 'manual' to inspect the redirect response
      const resp = await fetch('/core/debts', { redirect: 'manual' })

      if (resp.status === 307 || resp.status === 308 || resp.status === 302 || resp.status === 301) {
        const location = resp.headers.get('location') || ''
        const hasLoginRedirect = location.includes('/login')
        const hasRedirectTo = location.includes('redirectTo')
        const hasDebtsPath = location.includes('/core/debts')

        if (hasLoginRedirect && hasRedirectTo && hasDebtsPath) {
          setRedirectTestResult(`✅ Redirect works! Location: ${location}`)
          setRedirectTestPass(true)
        } else {
          setRedirectTestResult(`⚠️ Redirect occurred but missing expected params. Location: ${location}`)
          setRedirectTestPass(false)
        }
      } else if (resp.status === 200) {
        // If we get 200, we might be authenticated
        setRedirectTestResult(`ℹ️ Got 200 OK - you may be authenticated. Log out first to test redirect.`)
        setRedirectTestPass(null)
      } else {
        setRedirectTestResult(`❌ Unexpected status: ${resp.status}`)
        setRedirectTestPass(false)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setRedirectTestResult(`❌ Error: ${msg}`)
      setRedirectTestPass(false)
    }
  }

  if (loading) return <div className="p-8">Loading tests...</div>
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>
  if (!data) return <div className="p-8">No data</div>

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">{data.feature}</h1>
        <p className={`text-lg font-semibold mb-6 ${data.allPassing ? 'text-green-600' : 'text-red-600'}`}>
          {data.summary}
        </p>

        <div className="space-y-3 mb-8">
          {data.results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                r.pass
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
                <span className="font-medium text-zinc-900">{r.test}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">{r.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h2 className="text-lg font-bold text-zinc-900 mb-3">Live Redirect Test</h2>
          <p className="text-sm text-zinc-600 mb-4">
            Click below to test that accessing /core/debts without authentication redirects to /login with redirectTo parameter.
            Make sure you are <strong>not logged in</strong> for this test.
          </p>
          <button
            onClick={testLiveRedirect}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Test Redirect to /core/debts
          </button>
          {redirectTestResult && (
            <div className={`mt-4 rounded-lg border p-3 ${
              redirectTestPass === true ? 'border-green-200 bg-green-50' :
              redirectTestPass === false ? 'border-red-200 bg-red-50' :
              'border-amber-200 bg-amber-50'
            }`}>
              <p className="text-sm">{redirectTestResult}</p>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-bold text-zinc-900 mb-3">How It Works</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-600">
            <li>User navigates directly to a protected URL like <code className="bg-zinc-100 px-1 rounded">/core/debts</code></li>
            <li>The proxy middleware checks authentication via Supabase session</li>
            <li>If no valid session exists, it redirects to <code className="bg-zinc-100 px-1 rounded">/login?redirectTo=/core/debts</code></li>
            <li>If the session was expired, it also adds <code className="bg-zinc-100 px-1 rounded">&expired=1</code> parameter</li>
            <li>The login page reads the <code className="bg-zinc-100 px-1 rounded">redirectTo</code> parameter</li>
            <li>After successful login, the user is redirected to the original URL</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
