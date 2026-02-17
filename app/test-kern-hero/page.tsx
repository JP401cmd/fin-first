'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  test: string
  passes: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
  error?: string
}

export default function TestKernHeroPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-kern-hero')
      .then(res => res.json())
      .then(json => { setData(json); setLoading(false) })
      .catch(err => { console.error(err); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-red-600">Failed to load verification results</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">{data.feature}</h1>
      <p className="text-sm text-zinc-500 mb-6">
        {data.passing}/{data.total} tests passing
        {data.allPassing && ' ✅ All passing!'}
      </p>

      <div className="space-y-3">
        {data.results.map((result, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${
              result.passes
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{result.passes ? '✅' : '❌'}</span>
              <span className="font-medium text-zinc-900">{result.test}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600 ml-7">{result.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-bold text-amber-900 mb-3">Hero Section Changes Summary</h2>
        <ul className="space-y-2 text-sm text-amber-800">
          <li>✨ <strong>Net worth</strong> now shows &quot;dat is X jaar en Y maanden vrijheid&quot; subtitle</li>
          <li>🗑️ <strong>Verwachte FIRE</strong> removed from De Kern (belongs to Horizon only)</li>
          <li>🆕 <strong>Vrijheidstijd opgebouwd</strong> added as unique Kern metric</li>
          <li>📊 <strong>Autonomiescore</strong> replaces FIRE display with autonomy grade + free days</li>
          <li>🎨 <strong>Amber theme</strong> preserved throughout hero section</li>
          <li>📐 <strong>3-column grid</strong> layout maintained</li>
        </ul>
      </div>
    </div>
  )
}
