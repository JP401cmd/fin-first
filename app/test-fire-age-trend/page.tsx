'use client'

import { useState } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

export default function TestFireAgeTrend() {
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')

  async function runTests() {
    setLoading(true)
    try {
      const res = await fetch('/api/verify-fire-age-trend')
      const data = await res.json()
      setResults(data.results)
      setSummary(data.summary)
    } catch (e) {
      setResults([{ name: 'API Error', pass: false, detail: String(e) }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #215: FIRE-age history tracking and chart
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Verifies that FIRE age is stored in snapshots, a trend chart is rendered on De Horizon,
        and contextual progress messages are shown.
      </p>

      <button
        onClick={runTests}
        disabled={loading}
        className="mb-8 rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        data-testid="run-tests"
      >
        {loading ? 'Testen uitvoeren...' : 'Verificatie uitvoeren'}
      </button>

      {summary && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
          <p className="text-sm font-semibold text-purple-800" data-testid="test-summary">
            {summary}
          </p>
        </div>
      )}

      {results && (
        <div className="space-y-3" data-testid="test-results">
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                r.pass
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
              data-testid={`test-result-${i}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.pass ? '\u2705' : '\u274C'}</span>
                <span className={`text-sm font-medium ${r.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                  {r.name}
                </span>
              </div>
              <p className="mt-1 pl-7 text-xs text-zinc-500">{r.detail}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-zinc-900">Feature Description</h2>
        <ul className="space-y-2 text-sm text-zinc-600">
          <li><strong>1.</strong> Store FIRE age in monthly snapshots via fire_age column</li>
          <li><strong>2.</strong> Create &quot;Je FIRE-leeftijd over tijd&quot; line chart</li>
          <li><strong>3.</strong> Display chart on De Horizon overview page</li>
          <li><strong>4.</strong> Show contextual message: &quot;In [maand] was je FIRE-leeftijd X, nu Y&quot;</li>
          <li><strong>5.</strong> Highlight improvements in FIRE age over time</li>
          <li><strong>6.</strong> Handle missing historical data gracefully</li>
        </ul>
      </div>
    </div>
  )
}
