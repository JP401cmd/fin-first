'use client'

import { useState, useEffect } from 'react'

interface SchemaStatus {
  status: string
  tables: Record<string, boolean>
  columns: Record<string, boolean>
  all_tables_exist: boolean
  all_columns_exist: boolean
}

interface MigrationResult {
  status: string
  error?: string
  summary?: { total: number; success: number; skipped: number; errors: number }
  results?: Array<{ statement: string; status: string; message?: string }>
  tables?: string[]
}

export default function TestMigrationPage() {
  const [status, setStatus] = useState<SchemaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [result, setResult] = useState<MigrationResult | null>(null)

  useEffect(() => { checkStatus() }, [])

  async function checkStatus() {
    setLoading(true)
    try {
      const res = await fetch('/api/apply-migration')
      setStatus(await res.json())
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function runMigration() {
    if (!password) return
    setMigrating(true)
    try {
      const res = await fetch('/api/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_password: password }),
      })
      const data = await res.json()
      setResult(data)
      if (data.status === 'success') await checkStatus()
    } catch (e) {
      setResult({ status: 'error', error: String(e) })
    }
    setMigrating(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'monospace', padding: 20 }}>
      <h1 style={{ fontSize: 24 }}>Database Migration Status</h1>

      {loading ? (
        <p>Loading...</p>
      ) : status ? (
        <div>
          <h2 style={{ color: status.status === 'complete' ? 'green' : 'orange' }}>
            Status: {status.status}
          </h2>

          <h3>Tables</h3>
          <ul>
            {Object.entries(status.tables).map(([name, exists]) => (
              <li key={name} style={{ color: exists ? 'green' : 'red' }}>
                {exists ? '✓' : '✗'} {name}
              </li>
            ))}
          </ul>

          <h3>net_worth_snapshots Columns</h3>
          <ul>
            {Object.entries(status.columns).map(([name, exists]) => (
              <li key={name} style={{ color: exists ? 'green' : 'red' }}>
                {exists ? '✓' : '✗'} {name}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ color: 'red' }}>Failed to check schema</p>
      )}

      {status && status.status !== 'complete' && (
        <div style={{ marginTop: 30, padding: 20, border: '1px solid #ccc', borderRadius: 8 }}>
          <h3>Apply Migration</h3>
          <p>Enter your Supabase DB password (from Dashboard &gt; Settings &gt; Database)</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Database password"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
            />
            <button
              onClick={runMigration}
              disabled={migrating || !password}
              style={{ padding: '8px 20px', background: '#d97706', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              {migrating ? 'Running...' : 'Apply'}
            </button>
          </div>

          {result && (
            <div style={{ marginTop: 15, padding: 15, background: result.status === 'success' ? '#f0fdf4' : '#fef2f2', borderRadius: 8 }}>
              <strong>{result.status === 'success' ? 'Success!' : 'Error'}</strong>
              {result.error && <p>{result.error}</p>}
              {result.summary && (
                <p>{result.summary.success} applied, {result.summary.skipped} skipped, {result.summary.errors} errors</p>
              )}
              {result.results && (
                <ul style={{ fontSize: 12, marginTop: 10 }}>
                  {result.results.map((r, i) => (
                    <li key={i} style={{ color: r.status === 'ok' ? 'green' : r.status === 'skip' ? 'gray' : 'red' }}>
                      [{r.status}] {r.statement} {r.message ? `(${r.message})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 30 }}>
        <button onClick={checkStatus} style={{ padding: '6px 16px', cursor: 'pointer' }}>
          Refresh Status
        </button>
      </div>
    </div>
  )
}
