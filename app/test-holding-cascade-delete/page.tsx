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
  all_pass: boolean
  results: TestResult[]
}

export default function TestHoldingCascadeDelete() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-holding-cascade-delete')
      .then(res => res.json())
      .then(json => {
        setData(json)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', background: '#0f0f0f', color: '#fff', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 24 }}>Running cascade delete verification...</h1>
        <p style={{ color: '#aaa' }}>Creating holding, adding transactions, deleting, verifying cleanup...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', background: '#0f0f0f', color: '#fff', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 24, color: '#f87171' }}>Error</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', background: '#0f0f0f', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>
        Feature #161: Deleting holding removes its transactions
      </h1>
      <p style={{ color: '#aaa', marginBottom: 24, fontSize: 14 }}>
        Verifies that ON DELETE CASCADE removes holding_transactions when a holding is deleted.
      </p>

      <div
        data-testid="summary-badge"
        style={{
          display: 'inline-block',
          padding: '8px 20px',
          borderRadius: 8,
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 24,
          background: data.all_pass ? '#065f46' : '#7f1d1d',
          color: data.all_pass ? '#6ee7b7' : '#fca5a5',
        }}
      >
        {data.summary} — {data.all_pass ? 'ALL PASS ✅' : 'SOME FAILING ❌'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.results.map((r, i) => (
          <div
            key={i}
            data-testid={`test-result-${i}`}
            style={{
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${r.pass ? '#065f46' : '#7f1d1d'}`,
              background: r.pass ? '#022c22' : '#1c0a0a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>{r.pass ? '✅' : '❌'}</span>
              <strong style={{ color: r.pass ? '#6ee7b7' : '#fca5a5' }}>{r.name}</strong>
            </div>
            <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{r.detail}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 20, background: '#1a1a2e', borderRadius: 8, border: '1px solid #334155' }}>
        <h2 style={{ fontSize: 18, marginBottom: 12, color: '#c4b5fd' }}>How Cascade Delete Works</h2>
        <ol style={{ color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 20 }}>
          <li><strong>Database FK constraint:</strong> <code>holding_transactions.holding_id REFERENCES holdings(id) ON DELETE CASCADE</code></li>
          <li><strong>Holding creation:</strong> INSERT into <code>holdings</code> table with user_id</li>
          <li><strong>Transaction recording:</strong> INSERT into <code>holding_transactions</code> with <code>holding_id</code> FK</li>
          <li><strong>Holding deletion:</strong> DELETE from <code>holdings</code> WHERE id = X</li>
          <li><strong>Automatic cleanup:</strong> PostgreSQL removes all <code>holding_transactions</code> rows where <code>holding_id = X</code></li>
        </ol>
      </div>
    </div>
  )
}
