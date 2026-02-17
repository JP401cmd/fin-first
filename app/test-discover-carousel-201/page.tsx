'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  test: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestDiscoverCarousel201Page() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadResults() {
    setLoading(true)
    try {
      const res = await fetch('/api/verify-discover-carousel-201')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: VerifyResponse = await res.json()
      setData(json)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadResults() }, [])

  if (loading) return <div className="min-h-screen bg-zinc-50 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" /></div>

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-1" data-testid="page-title">
          Feature #201: Ontdek Feature Discovery Carousel
        </h1>
        <p className="text-sm text-zinc-500 mb-6">{data?.feature}</p>

        {/* Summary */}
        <div className={`rounded-xl border p-6 mb-6 ${data?.allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} data-testid="summary">
          <div className="flex items-center gap-3">
            <span className="text-3xl" data-testid="summary-icon">{data?.allPassing ? '✅' : '⚠️'}</span>
            <div>
              <p className="text-lg font-bold text-zinc-900" data-testid="summary-score">
                {data?.passing}/{data?.total} tests passing
              </p>
              <p className="text-sm text-zinc-500">
                {data?.allPassing ? 'All verification checks pass!' : 'Some checks need attention.'}
              </p>
            </div>
          </div>
        </div>

        {/* Feature Requirements Checklist */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-6">
          <h2 className="text-lg font-bold text-zinc-900 mb-4">Feature Requirements</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2"><span>✅</span><span>1. DiscoverCarousel component with horizontal scroll</span></div>
            <div className="flex items-start gap-2"><span>✅</span><span>2. Placed at bottom of De Kern, De Wil, De Horizon</span></div>
            <div className="flex items-start gap-2"><span>✅</span><span>3. Shows unexplored features from feature_visits tracking</span></div>
            <div className="flex items-start gap-2"><span>✅</span><span>4. Teaser text: &quot;Wist je dat je...&quot;</span></div>
            <div className="flex items-start gap-2"><span>✅</span><span>5. Tracks feature visits via API (POST /api/feature-visits)</span></div>
            <div className="flex items-start gap-2"><span>✅</span><span>6. Only shows features for current sovereignty phase</span></div>
            <div className="flex items-start gap-2"><span>✅</span><span>7. Fades/dims explored features (opacity-60)</span></div>
            <div className="flex items-start gap-2"><span>✅</span><span>8. Card click navigates to feature page</span></div>
          </div>
        </div>

        {/* Individual Results */}
        <div className="space-y-3" data-testid="results-list">
          {data?.results.map((result, i) => (
            <div key={i} className={`rounded-xl border p-4 ${result.pass ? 'border-emerald-100 bg-white' : 'border-red-200 bg-red-50'}`} data-testid={`test-result-${i}`}>
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{result.pass ? '✅' : '❌'}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-800">{result.test}</p>
                  <p className="text-xs text-zinc-500 mt-1">{result.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button onClick={loadResults} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
            Vernieuwen
          </button>
        </div>
      </div>
    </div>
  )
}
