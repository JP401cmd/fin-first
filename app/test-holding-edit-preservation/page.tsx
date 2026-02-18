'use client'

import { useEffect, useState } from 'react'

type TestResult = { name: string; pass: boolean; detail: string }

export default function TestHoldingEditPreservation() {
  const [results, setResults] = useState<TestResult[]>([])
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-holding-edit-preservation')
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || [])
        setSummary(data.summary || '')
      })
      .catch(() => setResults([{ name: 'fetch-error', pass: false, detail: 'Failed to fetch' }]))
      .finally(() => setLoading(false))
  }, [])

  const passing = results.filter((r) => r.pass).length

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Feature #136 — Holding Edit Form Preserves Data on Refresh
      </h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Verifies that the holding edit form warns about unsaved changes and preserves draft state.
      </p>

      {loading ? (
        <p>Loading tests...</p>
      ) : (
        <>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: passing === results.length ? '#dcfce7' : '#fef3c7',
              border: `1px solid ${passing === results.length ? '#86efac' : '#fcd34d'}`,
              marginBottom: 24,
            }}
          >
            <strong>{summary}</strong>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r) => (
              <div
                key={r.name}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${r.pass ? '#86efac' : '#fca5a5'}`,
                  background: r.pass ? '#f0fdf4' : '#fef2f2',
                }}
                data-testid={`test-${r.name}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{r.pass ? '✅' : '❌'}</span>
                  <strong style={{ fontSize: 14 }}>{r.name}</strong>
                </div>
                <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{r.detail}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 32, padding: 16, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Manual Test Steps</h2>
            <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
              <li>Navigate to <code>/core/assets/holdings</code></li>
              <li>Click edit on any holding to open the HoldingEditForm</li>
              <li>Change the name or other fields — observe the &quot;Onopgeslagen wijzigingen&quot; indicator</li>
              <li>Try closing the modal — you should see a confirmation dialog</li>
              <li>Click &quot;Verder bewerken&quot; to stay in the form</li>
              <li>Refresh the page (F5) — you should see a browser &quot;Leave site?&quot; warning</li>
              <li>If you confirm the refresh, reopen the edit form for the same holding</li>
              <li>You should see a &quot;Concept hersteld&quot; notice with your previous changes recovered</li>
              <li>Click &quot;Doorgaan met concept&quot; to keep changes or &quot;Origineel laden&quot; to discard</li>
            </ol>
          </div>
        </>
      )}
    </div>
  )
}
