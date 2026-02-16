'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

export default function TestHoldingDefaults() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState('')

  useEffect(() => {
    fetch('/api/verify-holding-defaults')
      .then(res => res.json())
      .then(data => {
        setResults(data.results || [])
        setSummary(data.summary || '')
      })
      .catch(err => {
        setResults([{ name: 'API Error', pass: false, detail: String(err) }])
        setSummary('Error loading results')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center">Loading verification...</div>

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #172 — Holding Creation Form Defaults
      </h1>
      <p className="mb-6 text-zinc-500">{summary}</p>

      <div className={`mb-6 rounded-lg border p-4 ${
        passing === total
          ? 'border-green-300 bg-green-50'
          : 'border-amber-300 bg-amber-50'
      }`}>
        <span className="text-lg font-bold">
          {passing === total ? '✅' : '⚠️'} {passing}/{total} checks passing
        </span>
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 ${
              r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{r.pass ? '✅' : '❌'}</span>
              <span className="font-medium text-zinc-900">{r.name}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">{r.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
