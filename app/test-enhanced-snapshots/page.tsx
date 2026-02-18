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

type MigrationStatus = {
  status: string
  columns: Record<string, boolean>
  all_columns_exist: boolean
}

export default function TestEnhancedSnapshots() {
  const [verifyResults, setVerifyResults] = useState<VerifyResponse | null>(null)
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      setLoading(true)
      try {
        // Fetch verification results
        const verifyRes = await fetch('/api/verify-enhanced-snapshots')
        if (verifyRes.ok) {
          setVerifyResults(await verifyRes.json())
        } else {
          setError(`Verify API returned ${verifyRes.status}`)
        }

        // Check migration status
        const migRes = await fetch('/api/apply-migration')
        if (migRes.ok) {
          setMigrationStatus(await migRes.json())
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Verifying enhanced snapshots...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold">Feature #248: Enhanced net_worth_snapshots Columns</h1>
        <p className="text-zinc-400">
          Verifies that freedom_percentage, fire_age, sovereignty_level, savings_rate,
          and resilience_score columns are properly defined and populated.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-300">
            Error: {error}
          </div>
        )}

        {/* Migration Status */}
        {migrationStatus && (
          <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-4">
              Database Column Status
              <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                migrationStatus.all_columns_exist
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {migrationStatus.all_columns_exist ? 'All Present' : 'Migration Needed'}
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {migrationStatus.columns && Object.entries(migrationStatus.columns).map(([col, exists]) => (
                <div key={col} className="flex items-center gap-2 text-sm">
                  <span className={exists ? 'text-emerald-400' : 'text-red-400'}>
                    {exists ? '✓' : '✗'}
                  </span>
                  <code className="text-zinc-300">{col}</code>
                  <span className="text-zinc-500">
                    {col === 'freedom_percentage' || col === 'fire_age' || col === 'savings_rate'
                      ? 'NUMERIC'
                      : 'INT'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification Results */}
        {verifyResults && (
          <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-2">
              Verification: {verifyResults.summary}
              <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                verifyResults.all_passing
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {verifyResults.all_passing ? 'ALL PASS' : 'FAILING'}
              </span>
            </h2>
            <p className="text-zinc-500 text-sm mb-4">{verifyResults.feature}</p>

            <div className="space-y-3">
              {verifyResults.tests.map((test, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 border ${
                    test.pass
                      ? 'bg-emerald-900/10 border-emerald-900/30'
                      : 'bg-red-900/10 border-red-900/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${test.pass ? 'text-emerald-400' : 'text-red-400'}`}>
                      {test.pass ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className="font-medium text-sm">{test.name}</p>
                      <p className="text-xs text-zinc-400 mt-1">{test.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Architecture Overview */}
        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
          <h2 className="text-lg font-semibold mb-4">Architecture Overview</h2>
          <div className="space-y-3 text-sm text-zinc-400">
            <div>
              <span className="text-amber-400 font-mono">net_worth_snapshots</span> table enhanced with 5 new columns:
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-1 text-zinc-300">Column</th>
                  <th className="py-1 text-zinc-300">Type</th>
                  <th className="py-1 text-zinc-300">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1"><code className="text-teal-400">freedom_percentage</code></td>
                  <td className="py-1">NUMERIC</td>
                  <td className="py-1">(netWorth / fireTarget) * 100, clamped 0-100</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1"><code className="text-teal-400">fire_age</code></td>
                  <td className="py-1">NUMERIC</td>
                  <td className="py-1">Projected age at FIRE; null if no DOB</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1"><code className="text-teal-400">sovereignty_level</code></td>
                  <td className="py-1">INT</td>
                  <td className="py-1">-2 to 6; computed from net worth, expenses, freedom%</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-1"><code className="text-teal-400">savings_rate</code></td>
                  <td className="py-1">NUMERIC</td>
                  <td className="py-1">(income - expenses) / income * 100</td>
                </tr>
                <tr>
                  <td className="py-1"><code className="text-teal-400">resilience_score</code></td>
                  <td className="py-1">INT</td>
                  <td className="py-1">0-100; composite of emergency, diversification, debt, savings</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 pt-3 border-t border-zinc-800">
              <p className="text-zinc-300 font-medium mb-2">Populated by 3 snapshot creation endpoints:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><code>POST /api/snapshots</code> — Manual snapshot creation</li>
                <li><code>GET /api/snapshots/auto</code> — Auto monthly (on dashboard load)</li>
                <li><code>GET /api/snapshots/cron</code> — Bulk cron for all users</li>
              </ul>
            </div>

            <div className="mt-3 pt-3 border-t border-zinc-800">
              <p className="text-zinc-300 font-medium mb-2">Backward compatibility:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>All columns use <code>IF NOT EXISTS</code> — safe repeated application</li>
                <li>All columns nullable — existing rows get NULL</li>
                <li>All endpoints gracefully fall back to basic fields if columns missing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
