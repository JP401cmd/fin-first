'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  passing: number
  total: number
  percentage: number
  results: TestResult[]
}

export default function TestNetworkErrorImport() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/verify-network-error-import')
        if (!res.ok) {
          setError(`HTTP ${res.status}`)
          setLoading(false)
          return
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(String(err))
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>
  if (!data) return null

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-bold">{data.feature}</h1>
      <div className={`mb-6 rounded-lg p-4 text-lg font-bold ${
        data.passing === data.total ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'
      }`}>
        {data.passing}/{data.total} tests passing ({data.percentage}%)
      </div>

      <div className="space-y-2">
        {data.results.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 ${
              r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-lg ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.pass ? '✅' : '❌'}
              </span>
              <span className="font-medium text-zinc-900">{r.test}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{r.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
