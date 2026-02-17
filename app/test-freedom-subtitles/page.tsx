'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  test: string
  passed: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestFreedomSubtitlesPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-freedom-subtitles')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8">Laden...</div>
  if (!data) return <div className="p-8 text-red-600">Fout bij laden verificatie</div>

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Feature #179: Freedom-time subtitles on Dashboard module cards</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that all three Dashboard module cards have freedom-time subtitles using real financial data.
      </p>

      <div className={`mb-6 rounded-lg p-4 ${data.allPassing ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <p className="font-semibold text-lg">
          {data.allPassing ? '✅' : '⚠️'} {data.summary}
        </p>
      </div>

      <div className="space-y-3">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${r.passed ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{r.passed ? '✅' : '❌'}</span>
              <div>
                <p className="font-medium text-sm">{r.test}</p>
                <p className="text-xs text-zinc-500 mt-1">{r.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t pt-6">
        <h2 className="font-bold mb-4">Preview: Expected Dashboard Freedom-Time Subtitles</h2>

        <div className="grid gap-4 md:grid-cols-3">
          {/* De Kern preview */}
          <div className="rounded-xl border border-amber-200 bg-white p-4">
            <h3 className="font-bold text-sm mb-3">De Kern</h3>
            <div className="space-y-2 border-t border-zinc-100 pt-3">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Netto vermogen</span>
                  <span className="font-semibold">€ 450.000</span>
                </div>
                <p className="mt-0.5 text-right text-xs text-amber-600/80">
                  12 jaar en 3 maanden vrijheid
                </p>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Vrijheid</span>
                <span className="font-semibold text-amber-600">36.0%</span>
              </div>
            </div>
          </div>

          {/* De Wil preview */}
          <div className="rounded-xl border border-teal-200 bg-white p-4">
            <h3 className="font-bold text-sm mb-3">De Wil</h3>
            <div className="space-y-2 border-t border-zinc-100 pt-3">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Open acties</span>
                <span className="font-semibold">5</span>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Vrijheid te winnen</span>
                  <span className="font-semibold text-teal-600">42 dagen</span>
                </div>
                <p className="mt-0.5 text-right text-xs text-teal-600/70">
                  via 5 open acties
                </p>
              </div>
            </div>
          </div>

          {/* De Horizon preview */}
          <div className="rounded-xl border border-purple-200 bg-white p-4">
            <h3 className="font-bold text-sm mb-3">De Horizon</h3>
            <div className="space-y-2 border-t border-zinc-100 pt-3">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">FIRE-leeftijd</span>
                <span className="font-semibold">52 jaar</span>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Naar volledige vrijheid</span>
                  <span className="font-semibold text-purple-600">15j 4mnd</span>
                </div>
                <p className="mt-0.5 text-right text-xs text-purple-600/70">
                  15 jaar naar volledige vrijheid
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
