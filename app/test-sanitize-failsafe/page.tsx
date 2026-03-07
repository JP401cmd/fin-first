'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

/**
 * Test page verifying fail-safe behavior:
 * When sanitizeForAI() fails, AI calls are blocked (not executed with unsanitized data).
 */
export default function TestSanitizeFailsafePage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/test-sanitize-failsafe')
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results ?? [])
        setSummary(data.summary ?? 'Fout bij laden')
        setLoading(false)
      })
      .catch(() => {
        setSummary('Fout bij laden')
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-8">Laden...</div>

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-2">Fail-safe Sanitisatie Tests</h1>
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Verifieert dat een fout in sanitizeForAI() de AI-call blokkeert (fail-safe principe).
      </p>
      <p className="mb-4 font-mono text-sm">{summary}</p>
      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className={`p-3 rounded border ${r.pass ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}
          >
            <div className="font-semibold text-sm">
              {r.pass ? '\u2705' : '\u274C'} {r.name}
            </div>
            <div className="text-xs font-mono mt-1 text-[var(--ink-3)]">{r.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
