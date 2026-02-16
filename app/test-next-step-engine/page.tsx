'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  passing: number
  total: number
  all_pass: boolean
  results: TestResult[]
  data_state?: Record<string, boolean>
  authenticated?: boolean
  error?: string
}

export default function TestNextStepEnginePage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/verify-next-step-engine')
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold mb-2">Feature #120: Next Step Engine — Real Data Completeness</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that the next step API checks actual data state to generate suggestions.
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
          <span className="text-sm text-zinc-500">Running verification tests...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className={`rounded-lg border p-4 mb-6 ${data.all_pass ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className="flex items-center justify-between">
              <p className={`font-bold text-lg ${data.all_pass ? 'text-green-700' : 'text-yellow-700'}`}>
                {data.all_pass ? '✅ ALL TESTS PASSING' : `⚠️ ${data.passing}/${data.total} passing`}
              </p>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${data.all_pass ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {data.passing}/{data.total}
              </span>
            </div>
            {data.authenticated !== undefined && (
              <p className="text-xs text-zinc-500 mt-1">
                Auth: {data.authenticated ? 'authenticated' : 'unauthenticated (RLS applies)'}
              </p>
            )}
          </div>

          {/* Data State */}
          {data.data_state && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Real Database Data State</h2>
              <div className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(data.data_state).map(([key, val]) => (
                  <p key={key} className={val ? 'text-green-600' : 'text-zinc-400'}>
                    {val ? '✅' : '⚪'} {key.replace(/([A-Z])/g, ' $1').replace(/^has /, 'Has ').trim()}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Test Results */}
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Test Results</h2>
            <div className="space-y-2">
              {data.results.map((result, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${result.pass ? 'bg-white border-green-200' : 'bg-red-50 border-red-200'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{result.pass ? '✅' : '❌'}</span>
                    <span className="font-medium text-sm">{result.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 ml-7">{result.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Architecture Details */}
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Architecture Verification</h2>
            <div className="bg-zinc-50 border rounded-lg p-4 text-sm space-y-3">
              <div>
                <p className="font-medium text-zinc-700">API Endpoint</p>
                <p className="text-xs text-zinc-500">/api/next-steps — queries 8 tables in parallel via Promise.all()</p>
              </div>
              <div>
                <p className="font-medium text-zinc-700">Data Sources (Real Database)</p>
                <ul className="text-xs text-zinc-500 ml-4 list-disc space-y-0.5">
                  <li>transactions → hasTransactions (import suggestion)</li>
                  <li>budgets → hasBudgets (budget setup suggestion)</li>
                  <li>assets → hasAssets (asset registration suggestion)</li>
                  <li>debts → hasDebts (debt management suggestion)</li>
                  <li>net_worth_snapshots → hasSnapshots (snapshot suggestion)</li>
                  <li>profiles → profileComplete (profile completion suggestion)</li>
                  <li>goals → hasGoals (goal setting suggestion)</li>
                  <li>next_step_completions → dismissed/completed tracking</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-zinc-700">Module Pages (Real Data Flow)</p>
                <ul className="text-xs text-zinc-500 ml-4 list-disc space-y-0.5">
                  <li>/core → computeAllKernSteps() with live Supabase query results</li>
                  <li>/will → computeAllWilSteps() with live action/recommendation counts</li>
                  <li>/horizon → computeAllHorizonSteps() with live FIRE/event data</li>
                </ul>
              </div>
            </div>
          </section>

          <button
            onClick={loadData}
            className="text-sm text-zinc-500 underline hover:text-zinc-700"
          >
            Refresh
          </button>
        </>
      )}
    </div>
  )
}
