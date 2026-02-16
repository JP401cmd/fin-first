'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

interface VerifyResponse {
  summary: string
  allPassing: boolean
  results: TestResult[]
  error?: string
}

export default function TestAccountDeletionCascadePage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch('/api/verify-account-deletion-cascade')
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${res.status}`)
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    verify()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-zinc-600">Running cascade deletion tests...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-zinc-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const passing = data.results.filter(r => r.passed).length
  const total = data.results.length

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Feature #169: Account Deletion Cascade
        </h1>
        <p className="text-zinc-500 mb-6">
          Verifies that deleting a user account cascades removal of all related data:
          assets, debts, holdings, badges, streaks, and all other financial records.
        </p>

        <div
          className={`rounded-xl p-6 mb-8 ${
            data.allPassing
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
          data-testid="test-summary"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{data.allPassing ? '✅' : '❌'}</span>
            <div>
              <p className="text-lg font-semibold text-zinc-900">{data.summary}</p>
              <p className="text-sm text-zinc-500">
                {data.allPassing
                  ? 'All cascade deletion tests passing'
                  : 'Some tests failing - see details below'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {data.results.map((result, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-4 ${
                result.passed
                  ? 'border-green-200 bg-white'
                  : 'border-red-200 bg-red-50'
              }`}
              data-testid={`test-${idx + 1}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">{result.passed ? '✅' : '❌'}</span>
                <div className="flex-1">
                  <p className="font-medium text-zinc-900">{result.name}</p>
                  <p className="text-sm text-zinc-500 mt-1">{result.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">
            Cascade Architecture
          </h2>
          <div className="text-sm text-zinc-600 space-y-2">
            <p>
              <strong>Application-level:</strong> The <code>deleteAllUserData()</code> function
              in <code>lib/seed-persona.ts</code> deletes data from {total >= 16 ? '23' : 'all'} tables
              in FK-safe batch order.
            </p>
            <p>
              <strong>Database-level:</strong> Tables like <code>user_badges</code>,{' '}
              <code>user_streaks</code>, <code>holdings</code>, and{' '}
              <code>holding_transactions</code> have{' '}
              <code>ON DELETE CASCADE</code> foreign keys to <code>auth.users(id)</code>.
            </p>
            <p>
              <strong>Deletion order:</strong> holding_transactions → holdings →
              user_badges/streaks/visits/steps → leaf tables → mid-level → parent tables.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
