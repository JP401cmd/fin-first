'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  step: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  passing: number
  total: number
  all_passing: boolean
  badge_count: number
  category_breakdown: Record<string, number>
  results: TestResult[]
}

export default function TestBadgeDefinitionsPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-badge-definitions')
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <h1 className="text-2xl font-bold mb-4">⏳ Loading badge definition tests...</h1>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <h1 className="text-2xl font-bold mb-4 text-red-400">❌ Error</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-2">
        Feature #246: Badge Definitions Complete
      </h1>
      <p className="text-gray-400 mb-6">
        Verify all 30+ badge definitions exist with correct criteria across all 8 categories.
      </p>

      {/* Summary */}
      <div className="mb-8 p-4 rounded-lg bg-gray-900 border border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-3xl font-bold ${data.all_passing ? 'text-emerald-400' : 'text-red-400'}`}>
            {data.passing}/{data.total}
          </span>
          <span className="text-gray-400">tests passing</span>
          <span className="text-2xl">{data.all_passing ? '✅' : '❌'}</span>
        </div>
        <div className="text-sm text-gray-400">
          Total badge count: <span className="text-white font-medium">{data.badge_count}</span>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Category Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(data.category_breakdown).map(([cat, count]) => (
            <div
              key={cat}
              className="p-3 rounded-lg bg-gray-900 border border-gray-800"
            >
              <div className="text-sm text-gray-400 capitalize">{cat.replace(/_/g, ' ')}</div>
              <div className="text-xl font-bold text-white">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Results */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold mb-3">Verification Steps</h2>
        {data.results.map((r, i) => (
          <div
            key={i}
            data-testid={`test-result-${i}`}
            className={`p-4 rounded-lg border ${
              r.pass
                ? 'bg-emerald-950/30 border-emerald-800'
                : 'bg-red-950/30 border-red-800'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg mt-0.5">{r.pass ? '✅' : '❌'}</span>
              <div>
                <div className="font-medium">{r.step}</div>
                <div className="text-sm text-gray-400 mt-1">{r.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Database Seed Section */}
      <div className="mt-8 p-4 rounded-lg bg-gray-900 border border-gray-800">
        <h2 className="text-lg font-semibold mb-2">Database Seeding</h2>
        <p className="text-sm text-gray-400 mb-3">
          Badge definitions are stored in <code className="text-amber-400">lib/badges.ts</code> and
          can be seeded to the database via <code className="text-amber-400">/api/badges/seed-public</code>.
        </p>
        <DatabaseSeedCheck />
      </div>
    </div>
  )
}

function DatabaseSeedCheck() {
  const [seedStatus, setSeedStatus] = useState<{
    count?: number
    expected?: number
    seeded?: boolean
    error?: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const checkStatus = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/badges/seed-public')
      const data = await res.json()
      setSeedStatus(data)
    } catch (err) {
      setSeedStatus({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
    setLoading(false)
  }

  const seedBadges = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/badges/seed-public', { method: 'POST' })
      const data = await res.json()
      setSeedStatus({
        count: data.total ?? data.existing_count,
        expected: data.expected,
        seeded: true,
        ...(data.error ? { error: data.error } : {}),
      })
      // Re-check status after seeding
      setTimeout(checkStatus, 500)
    } catch (err) {
      setSeedStatus({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
    setSeeding(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button
          onClick={checkStatus}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? 'Checking...' : 'Check Database'}
        </button>
        <button
          onClick={seedBadges}
          disabled={seeding}
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-sm"
        >
          {seeding ? 'Seeding...' : 'Seed Badges to DB'}
        </button>
      </div>

      {seedStatus && (
        <div className={`p-3 rounded text-sm ${
          seedStatus.error ? 'bg-red-950/30 text-red-300' : 'bg-gray-800 text-gray-300'
        }`}>
          {seedStatus.error ? (
            <div>Error: {seedStatus.error}</div>
          ) : (
            <div>
              <div>Badges in database: <span className="text-white font-bold">{seedStatus.count ?? 'unknown'}</span></div>
              {seedStatus.expected && (
                <div>Expected: <span className="text-white font-bold">{seedStatus.expected}</span></div>
              )}
              {seedStatus.seeded !== undefined && (
                <div>Status: {seedStatus.seeded ? '✅ Fully seeded' : '⚠️ Not fully seeded'}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
