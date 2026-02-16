'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestDeletedHolding() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-deleted-holding')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-zinc-500">Verifying feature #146...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">{data?.feature}</h1>
      <p className={`mb-6 text-sm font-medium ${data?.allPassing ? 'text-green-600' : 'text-amber-600'}`}>
        {data?.summary}
      </p>

      <div className="space-y-3">
        {data?.results.map((r, i) => (
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
              <span className="text-sm font-medium text-zinc-800">{r.test}</span>
            </div>
            <p className="mt-1 pl-7 text-xs text-zinc-500">{r.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
