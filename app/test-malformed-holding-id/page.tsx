'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestMalformedHoldingId() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-malformed-holding-id')
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-zinc-500">Verifying...</div>
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>
  if (!data) return <div className="p-8 text-zinc-500">No data</div>

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900">{data.feature}</h1>
        <p className={`mt-2 text-lg font-semibold ${data.allPassing ? 'text-green-600' : 'text-red-600'}`}>
          {data.summary}
        </p>

        <div className="mt-6 space-y-3">
          {data.results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${r.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-lg ${r.pass ? 'text-green-600' : 'text-red-600'}`}>
                  {r.pass ? '✅' : '❌'}
                </span>
                <span className="font-medium text-zinc-800">{r.name}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">{r.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold text-zinc-800">Manual Test Links</h2>
          <ul className="space-y-1 text-sm">
            <li>
              <a href="/holdings/invalid-uuid-here" className="text-blue-600 hover:underline" target="_blank">
                /holdings/invalid-uuid-here
              </a>
              {' — should show 404'}
            </li>
            <li>
              <a href="/holdings/not-a-uuid" className="text-blue-600 hover:underline" target="_blank">
                /holdings/not-a-uuid
              </a>
              {' — should show 404'}
            </li>
            <li>
              <a href="/holdings/12345" className="text-blue-600 hover:underline" target="_blank">
                /holdings/12345
              </a>
              {' — should show 404'}
            </li>
            <li>
              <a href="/core/assets/holdings/bad-id" className="text-blue-600 hover:underline" target="_blank">
                /core/assets/holdings/bad-id
              </a>
              {' — should show 404 (auth required)'}
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
