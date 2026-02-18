'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: Record<string, TestResult>
}

export default function TestSchemaPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-schema')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Feature #2: Database Schema Verification</h1>
        <p>Loading verification results...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Feature #2: Database Schema Verification</h1>
        <p className="text-red-600">Error: {error}</p>
      </div>
    )
  }

  if (!data) return null

  const entries = Object.entries(data.results)
  const passing = entries.filter(([, v]) => v.pass).length

  // Group results by category
  const tableResults = entries.filter(([k]) => k.startsWith('table_'))
  const columnResults = entries.filter(([k]) => k.startsWith('nws_col_'))
  const schemaResults = entries.filter(([k]) => k.endsWith('_columns'))
  const rlsResults = entries.filter(([k]) => k.startsWith('rls_'))

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Feature #2: Database Schema Verification</h1>
      <p className="text-lg mb-6">
        <span className={data.allPassing ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
          {data.summary}
        </span>
        {data.allPassing && ' ✓ ALL PASSING'}
      </p>

      <Section title="1. Required Tables Exist" results={tableResults} />
      <Section title="2. net_worth_snapshots New Columns" results={columnResults} />
      <Section title="3. Table Column Verification" results={schemaResults} />
      <Section title="4. RLS Active (Empty Results for Anon)" results={rlsResults} />
    </div>
  )
}

function Section({ title, results }: { title: string; results: [string, TestResult][] }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="space-y-1">
        {results.map(([key, result]) => (
          <div key={key} className="flex items-start gap-2 text-sm">
            <span className={result.pass ? 'text-green-600' : 'text-red-600'}>
              {result.pass ? '[PASS]' : '[FAIL]'}
            </span>
            <span>{result.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
