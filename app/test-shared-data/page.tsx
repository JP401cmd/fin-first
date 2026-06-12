'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type TestResult = { step: string; pass: boolean; details: string }

export default function TestSharedData() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [passing, setPassing] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    async function run() {
      try {
        const res = await fetch('/api/verify-shared-data')
        const data = await res.json()
        setResults(data.results)
        setPassing(data.passing)
        setTotal(data.total)
      } catch (e) {
        setResults([{ step: 'API fetch failed', pass: false, details: String(e) }])
      }
      setLoading(false)
    }
    run()
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #242: Shared vs Personal Data Management
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Verification of personal/shared toggle, cost splitting, combined and individual views, and net worth per perspective.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          Verificatie laden...
        </div>
      ) : (
        <>
          <div className={`mb-6 rounded-xl p-4 ${passing === total ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
            <p className={`text-lg font-bold ${passing === total ? 'text-emerald-700' : 'text-amber-700'}`}>
              {passing}/{total} tests passing
            </p>
          </div>

          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 text-sm ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${r.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                      {r.step}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">{r.details}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Quick Links</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/core/assets" className="rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50">
                Assets Page (ownership toggle)
              </Link>
              <Link href="/core/debts" className="rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50">
                Debts Page (ownership toggle)
              </Link>
              <Link href="/core/budgets" className="rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50">
                Budgets Page (ownership toggle)
              </Link>
              <a href="/identity" className="rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50">
                Identity (household section)
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
