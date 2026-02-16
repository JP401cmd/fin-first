'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  passed: boolean
  details: string
}

export default function TestMilestoneMarkers() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [passing, setPassing] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetch('/api/verify-milestone-markers')
      .then(r => r.json())
      .then(data => {
        setResults(data.results)
        setPassing(data.passing)
        setTotal(data.total)
      })
      .catch(err => {
        setResults([{ name: 'API Error', passed: false, details: err.message }])
        setTotal(1)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-center mt-4 text-zinc-500">Verifying milestone markers...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Feature #127: Net Worth Milestone Markers</h1>
      <p className="text-zinc-500 mb-6">Milestone markers on net worth chart use real snapshot dates</p>

      <div className="mb-6 p-4 rounded-xl border" style={{
        borderColor: passing === total ? '#10b981' : '#f59e0b',
        backgroundColor: passing === total ? '#ecfdf5' : '#fffbeb',
      }}>
        <span className="text-2xl font-bold" style={{ color: passing === total ? '#10b981' : '#f59e0b' }}>
          {passing}/{total}
        </span>
        <span className="ml-2 text-zinc-600">tests passing</span>
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100 bg-white">
            <span className={`mt-0.5 text-lg ${r.passed ? 'text-green-500' : 'text-red-500'}`}>
              {r.passed ? '✅' : '❌'}
            </span>
            <div>
              <p className="font-medium text-sm">{r.name}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{r.details}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
