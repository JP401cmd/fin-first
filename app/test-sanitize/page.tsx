'use client'

import { useState, useEffect } from 'react'

/**
 * Test page for sanitizeForAI utility.
 * Calls /api/test-sanitize to run server-side tests.
 */
export default function TestSanitizePage() {
  const [results, setResults] = useState<{ name: string; pass: boolean; input: string; output: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/test-sanitize')
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8">Laden...</div>

  const passing = results.filter((r) => r.pass).length

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4">sanitizeForAI Tests</h1>
      <p className="mb-4 font-mono">{passing}/{results.length} passing</p>
      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={i} className={`p-3 rounded border ${r.pass ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <div className="font-semibold">{r.pass ? '✅' : '❌'} {r.name}</div>
            <div className="text-xs font-mono mt-1">Input: {r.input}</div>
            <div className="text-xs font-mono">Output: {r.output}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
