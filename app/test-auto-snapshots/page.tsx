'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  all_passing: boolean
  tests: TestResult[]
}

type SnapshotResponse = {
  updated?: boolean
  snapshot?: Record<string, unknown>
  metrics?: Record<string, unknown>
  message?: string
  warning?: string
  error?: string
}

/**
 * Feature #211: Automatic Monthly Snapshots — Test Page
 *
 * Verifies:
 * 1. Cron/scheduled function for 1st of month
 * 2. Auto-capture net worth
 * 3. Auto-capture total assets + debts
 * 4. Auto-capture freedom_percentage
 * 5. Auto-capture fire_age
 * 6. Auto-capture sovereignty_level, savings_rate, resilience_score
 * 7. Enhanced net_worth_snapshots table
 * 8. No 24-record cap
 * 9. GET /api/snapshots/auto manual trigger
 */
export default function TestAutoSnapshots() {
  const [codeResults, setCodeResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [liveResult, setLiveResult] = useState<SnapshotResponse | null>(null)
  const [liveRunning, setLiveRunning] = useState(false)

  useEffect(() => {
    fetch('/api/verify-auto-snapshots')
      .then(r => r.json())
      .then((data: VerifyResponse) => {
        setCodeResults(data.tests)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function runLiveTest() {
    setLiveRunning(true)
    setLiveResult(null)
    try {
      const res = await fetch('/api/snapshots/auto')
      const data: SnapshotResponse = await res.json()
      setLiveResult(data)
    } catch (e) {
      setLiveResult({ error: String(e) })
    }
    setLiveRunning(false)
  }

  const passCount = codeResults.filter(t => t.pass).length
  const totalCount = codeResults.length

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
        Feature #211: Automatic Monthly Snapshots
      </h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        Auto-capture net worth, freedom %, FIRE age, sovereignty level, savings rate, and resilience score
        on the 1st of each month via cron + on every authenticated page load.
      </p>

      {/* ── Section 1: Code Verification ──────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>1. Code Verification (9 tests)</h2>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : (
          <>
            <div
              data-testid="verification-summary"
              style={{
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
                backgroundColor: passCount === totalCount ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${passCount === totalCount ? '#bbf7d0' : '#fecaca'}`,
                fontWeight: 600,
                color: passCount === totalCount ? '#166534' : '#991b1b',
              }}
            >
              {passCount}/{totalCount} tests passing {passCount === totalCount ? '✓' : '✗'}
            </div>

            {codeResults.map((t, i) => (
              <div
                key={i}
                data-testid={`test-${i + 1}`}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  marginBottom: 4,
                  backgroundColor: t.pass ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${t.pass ? '#dcfce7' : '#fee2e2'}`,
                }}
              >
                <div style={{
                  fontWeight: 500,
                  fontSize: 13,
                  color: t.pass ? '#166534' : '#991b1b',
                }}>
                  {t.pass ? '✓' : '✗'} {t.name}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{t.detail}</div>
              </div>
            ))}
          </>
        )}
      </section>

      {/* ── Section 2: Architecture Overview ────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>2. Architecture</h2>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 6, backgroundColor: '#f0fdf4', border: '1px solid #dcfce7' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#166534' }}>Client-side: AutoSnapshotTrigger</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Mounted in app layout → fires GET /api/snapshots/auto on every authenticated page load.
                Idempotent: creates snapshot only if none exists this month. Fire-and-forget.
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 6, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e40af' }}>Server-side: /api/snapshots/cron</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Protected by CRON_SECRET. Processes ALL users with completed onboarding.
                For use with Vercel Cron, pg_cron, or external cron service on 1st of each month.
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 6, backgroundColor: '#faf5ff', border: '1px solid #e9d5ff' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#6b21a8' }}>Manual: GET /api/snapshots/auto</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Authenticated endpoint. Creates a snapshot for the current user if none exists this month.
                Returns &#123; updated: true &#125; with full snapshot data after recompute + upsert.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Live Test ─────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>3. Live API Test</h2>
        <button
          onClick={runLiveTest}
          disabled={liveRunning}
          data-testid="run-live-test"
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: liveRunning ? '#94a3b8' : '#0ea5e9',
            color: 'white',
            fontWeight: 600,
            cursor: liveRunning ? 'wait' : 'pointer',
            marginBottom: 12,
          }}
        >
          {liveRunning ? 'Bezig...' : 'Trigger Auto-Snapshot'}
        </button>

        {liveResult && (
          <div data-testid="live-result" style={{ marginTop: 8 }}>
            {liveResult.error ? (
              <div style={{ padding: 12, borderRadius: 6, backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b' }}>
                Error: {liveResult.error}
              </div>
            ) : (
              <div style={{ padding: 12, borderRadius: 6, backgroundColor: '#f0fdf4', border: '1px solid #dcfce7' }}>
                <div style={{ fontWeight: 600, color: '#166534', marginBottom: 8 }}>
                  {liveResult.updated ? 'Snapshot geüpsert (recompute)' : 'Geen update-flag in response'}
                </div>
                {liveResult.snapshot && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                    {[
                      { label: 'Net Worth', value: `€${Number(liveResult.snapshot.net_worth ?? 0).toLocaleString('nl-NL')}` },
                      { label: 'Total Assets', value: `€${Number(liveResult.snapshot.total_assets ?? 0).toLocaleString('nl-NL')}` },
                      { label: 'Total Debts', value: `€${Number(liveResult.snapshot.total_debts ?? 0).toLocaleString('nl-NL')}` },
                      { label: 'Freedom %', value: `${liveResult.snapshot.freedom_percentage ?? 'N/A'}%` },
                      { label: 'FIRE Age', value: `${liveResult.snapshot.fire_age ?? 'N/A'}` },
                      { label: 'Sovereignty', value: `Level ${liveResult.snapshot.sovereignty_level ?? 'N/A'}` },
                      { label: 'Savings Rate', value: `${liveResult.snapshot.savings_rate ?? 'N/A'}%` },
                      { label: 'Resilience', value: `${liveResult.snapshot.resilience_score ?? 'N/A'}/100` },
                    ].map((m, i) => (
                      <div key={i} style={{ padding: 8, borderRadius: 4, backgroundColor: '#ecfdf5' }}>
                        <div style={{ fontSize: 11, color: '#666' }}>{m.label}</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666' }}>Raw API response</summary>
              <pre style={{ padding: 12, backgroundColor: '#1e293b', color: '#94a3b8', borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 300 }}>
                {JSON.stringify(liveResult, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* ── Section 4: Captured Metrics ──────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>4. Captured Metrics</h2>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {[
            { field: 'net_worth', desc: 'total_assets - total_debts', type: 'NUMERIC' },
            { field: 'total_assets', desc: 'Sum of active assets current_value', type: 'NUMERIC' },
            { field: 'total_debts', desc: 'Sum of active debts current_balance', type: 'NUMERIC' },
            { field: 'freedom_percentage', desc: '(net_worth / FIRE_target) × 100', type: 'NUMERIC' },
            { field: 'fire_age', desc: 'Age at FIRE via computeFireProjection(); null if no DOB', type: 'NUMERIC (nullable)' },
            { field: 'sovereignty_level', desc: 'Levels -2 to 6 via computeSovereigntyLevel()', type: 'INT' },
            { field: 'savings_rate', desc: '(monthly_savings / monthly_income) × 100', type: 'NUMERIC' },
            { field: 'resilience_score', desc: '0-100 composite score via computeResilienceScore()', type: 'INT' },
          ].map((m, i) => (
            <div key={i} style={{
              padding: '10px 16px',
              borderBottom: i < 7 ? '1px solid #f1f5f9' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <code style={{ fontWeight: 600, fontSize: 13, minWidth: 180, color: '#6b21a8' }}>{m.field}</code>
              <span style={{ fontSize: 12, color: '#666', flex: 1 }}>{m.desc}</span>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{m.type}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
