'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  name: string
  passed: boolean
  details: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestAiRecommendationsPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-ai-recommendations')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
        <h1>Feature #126: AI Recommendations Based on Real Financial Context</h1>
        <p>Loading verification results...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
        <h1>Feature #126: AI Recommendations Based on Real Financial Context</h1>
        <p style={{ color: 'red' }}>Error: {error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>Feature #126: AI Recommendations Based on Real Financial Context</h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
        Verifies that the AI recommendation API sends real user context (not template data) and
        recommendations are personalized based on actual financial situation.
      </p>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          fontWeight: 600,
          fontSize: 18,
          background: data.allPassing ? '#d4edda' : '#f8d7da',
          color: data.allPassing ? '#155724' : '#721c24',
        }}
      >
        {data.allPassing ? '✅' : '❌'} {data.summary}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.results.map((r, i) => (
          <div
            key={i}
            style={{
              border: `1px solid ${r.passed ? '#c3e6cb' : '#f5c6cb'}`,
              borderRadius: 8,
              padding: '12px 16px',
              background: r.passed ? '#f8fff9' : '#fff5f5',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {r.passed ? '✅' : '❌'} {r.name}
            </div>
            <div style={{ fontSize: 13, color: '#555' }}>{r.details}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
