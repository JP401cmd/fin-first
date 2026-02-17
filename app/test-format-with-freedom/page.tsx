'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  all_passing: boolean
  results: TestResult[]
}

export default function TestFormatWithFreedom() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-format-with-freedom')
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading verification tests...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <h1 className="text-2xl font-bold text-red-400 mb-4">Error</h1>
        <p className="text-red-300">{error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2" data-testid="test-title">
          {data.feature}
        </h1>
        <p
          className={`text-lg font-semibold mb-6 ${
            data.all_passing ? 'text-green-400' : 'text-amber-400'
          }`}
          data-testid="test-summary"
        >
          {data.summary}
        </p>

        <div className="space-y-3">
          {data.results.map((result, i) => (
            <div
              key={i}
              className={`p-4 rounded-lg border ${
                result.pass
                  ? 'bg-green-950/30 border-green-700'
                  : 'bg-red-950/30 border-red-700'
              }`}
              data-testid={`test-result-${i}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{result.pass ? '✅' : '❌'}</span>
                <span className="font-medium">{result.name}</span>
              </div>
              <p className="text-sm text-gray-400 ml-7">{result.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-gray-900 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold mb-3">
            formatWithFreedom() — Live Examples
          </h2>
          <div className="space-y-2 text-sm font-mono">
            <p className="text-gray-300">
              These examples show the utility function in action:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>formatWithFreedom(450000, 100) → EUR + years/months</li>
              <li>formatWithFreedom(450000, 100, &#123; format: &quot;short&quot; &#125;) → EUR + Xj Ym</li>
              <li>formatWithFreedom(100000, 0) → EUR + ∞ vrijheid</li>
              <li>formatWithFreedom(-5000, 100) → negative + time</li>
              <li>formatWithFreedom(1500, 100) → EUR + 15 dagen</li>
              <li>formatWithFreedom(0, 100) → EUR + 0 dagen</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
