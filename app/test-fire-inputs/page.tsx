'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  test: string
  passed: boolean
  details: string
}

export default function TestFireInputsPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-fire-inputs')
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setResults(data.results ?? [])
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40 }}>Loading tests...</div>
  if (error) return <div style={{ padding: 40, color: 'red' }}>Error: {error}</div>

  const passing = results.filter(r => r.passed).length

  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Feature #122: FIRE Projection Uses Real Financial Inputs</h1>
      <p style={{ marginTop: 8, color: '#666' }}>
        {passing}/{results.length} tests passing
      </p>

      <div style={{ marginTop: 24 }}>
        {results.map((r, i) => (
          <div key={i} style={{
            padding: 16,
            marginBottom: 8,
            borderRadius: 8,
            border: `1px solid ${r.passed ? '#bbf7d0' : '#fecaca'}`,
            backgroundColor: r.passed ? '#f0fdf4' : '#fef2f2',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{r.passed ? '\u2705' : '\u274c'}</span>
              <span style={{ fontWeight: 600 }}>{r.test}</span>
            </div>
            <p style={{ marginTop: 4, fontSize: 13, color: '#666' }}>{r.details}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 16, backgroundColor: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#5b21b6' }}>Manual Verification Steps</h2>
        <ol style={{ marginTop: 8, paddingLeft: 20, fontSize: 14, color: '#444', lineHeight: 1.8 }}>
          <li>Navigate to /horizon (requires auth)</li>
          <li>Verify FIRE projection chart renders at the bottom of the page</li>
          <li>Look for &quot;Projectie-invoer&quot; section showing income, expenses, assets, debts</li>
          <li>Click pencil icon next to &quot;Maandinkomen&quot;</li>
          <li>Type a new income amount (e.g., 5000) and press Enter</li>
          <li>Verify all KPIs and the projection chart update</li>
          <li>Check &quot;(aangepast)&quot; label appears next to overridden income</li>
          <li>Click &quot;Reset naar werkelijk&quot; to restore original values</li>
        </ol>
      </div>
    </div>
  )
}
