'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  step: string
  pass: boolean
  detail: string
}

export default function TestHoldingsCrudMgmtPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState('')

  useEffect(() => {
    async function run() {
      try {
        const res = await fetch('/api/verify-holdings-crud-mgmt')
        const data = await res.json()
        setResults(data.results || [])
        setSummary(data.summary || '')
      } catch (err) {
        setResults([{ step: 'Fetch error', pass: false, detail: String(err) }])
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">Feature #227 — Holdings CRUD management</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Per investment asset: add individual holdings (positions). Fields: ticker/ISIN, name, units held,
        average purchase price, purchase date. Full CRUD operations. Aggregate syncs to parent asset.
      </p>

      {loading ? (
        <div className="mt-8 flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className={`mt-6 rounded-xl p-4 ${passing === total ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
            <p className={`text-lg font-bold ${passing === total ? 'text-emerald-700' : 'text-amber-700'}`}>
              {summary}
            </p>
          </div>

          <div className="mt-6 space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${
                  r.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{r.pass ? '✅' : '❌'}</span>
                  <span className="text-sm font-medium text-zinc-900">{r.step}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-zinc-500">{r.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
