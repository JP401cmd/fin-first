'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

export default function TestBackButtonPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState('')

  useEffect(() => {
    async function runTests() {
      try {
        const res = await fetch('/api/verify-back-button')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setResults(data.results || [])
        setSummary(data.summary || '')
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    runTests()
  }, [])

  if (loading) return <div className="p-8 text-center">Running verification tests...</div>
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Feature #139: Back Button After Form Submit</h1>
      <p className="mb-6 text-zinc-600">
        Verifies that pressing back after successful form submission does not duplicate data.
      </p>

      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span className={`text-3xl font-bold ${passing === total ? 'text-green-600' : 'text-amber-600'}`}>
            {passing}/{total}
          </span>
          <span className="text-zinc-500">tests passing</span>
          {passing === total && <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">✅ ALL PASS</span>}
        </div>
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-lg">{r.pass ? '✅' : '❌'}</span>
              <div>
                <p className={`font-medium ${r.pass ? 'text-green-800' : 'text-red-800'}`}>
                  {r.name}
                </p>
                <p className={`mt-1 text-xs ${r.pass ? 'text-green-600' : 'text-red-600'}`}>
                  {r.detail}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="mb-2 font-semibold text-blue-800">Back-Button Protection Architecture</h2>
        <ul className="space-y-1 text-sm text-blue-700">
          <li>• <strong>Modal pattern:</strong> Forms use overlay modals with fetch() — no browser POST caching</li>
          <li>• <strong>Idempotency key:</strong> Each form instance generates a unique UUID sent as X-Idempotency-Key header</li>
          <li>• <strong>Server-side cache:</strong> API caches responses by idempotency key, returns cached result on retry</li>
          <li>• <strong>Submitted flag:</strong> Form tracks submitted state to disable button after successful save</li>
          <li>• <strong>History management:</strong> Opening modal pushes history entry; back button closes modal via popstate</li>
          <li>• <strong>FormSubmitted marker:</strong> After save, history.replaceState marks state; checked on mount to prevent re-open</li>
        </ul>
      </div>
    </div>
  )
}
