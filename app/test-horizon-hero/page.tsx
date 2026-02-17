'use client'

import { useEffect, useState } from 'react'

type TestResult = { name: string; pass: boolean; details: string }

export default function TestHorizonHeroPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-horizon-hero')
      .then(r => r.json())
      .then(data => {
        setResults(data.results)
        setSummary(data.summary)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8">Loading...</div>

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold mb-2">Feature #189: De Horizon Unique Timeline and Future Lens</h1>
      <p className="text-lg mb-6 font-semibold" data-testid="test-summary">
        {summary}
      </p>
      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
            data-testid={`test-${i + 1}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
              <span className="font-medium">{r.name}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{r.details}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
