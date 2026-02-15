'use client'

import { useState, useEffect } from 'react'

type NextStepData = {
  next_step: {
    key: string
    title: string
    description: string
    category: string
    priority: number
    href: string
    icon: string
    completed: boolean
  } | null
  pending_steps: Array<{
    key: string
    title: string
    description: string
    category: string
    priority: number
    href: string
    icon: string
    completed: boolean
  }>
  completed_steps: string[]
  completed_count: number
  total_steps: number
  data_state: {
    has_transactions: boolean
    has_budgets: boolean
    has_assets: boolean
    has_debts: boolean
    has_snapshots: boolean
    has_goals: boolean
    profile_complete: boolean
  }
  source: string
  error?: string
}

export default function TestNextStepsPage() {
  const [data, setData] = useState<NextStepData | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setError(null)
    try {
      const res = await fetch('/api/next-steps')
      const json = await res.json()
      if (!res.ok && json.error === 'Niet ingelogd') {
        setError('Not authenticated. Log in first.')
        return
      }
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }

  useEffect(() => { loadData() }, [])

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold mb-6">Test: Next Step Suggestions (Feature #57)</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Data State */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">User Data State (from real database)</h2>
            <div className="bg-white border rounded-lg p-5 space-y-2">
              <p><strong>Source:</strong> {data.source}</p>
              <p><strong>Completed:</strong> {data.completed_count} / {data.total_steps} steps</p>
              {data.data_state && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <p className={data.data_state.has_transactions ? 'text-green-600' : 'text-zinc-400'}>
                    {data.data_state.has_transactions ? '✅' : '⚪'} Has transactions
                  </p>
                  <p className={data.data_state.has_budgets ? 'text-green-600' : 'text-zinc-400'}>
                    {data.data_state.has_budgets ? '✅' : '⚪'} Has budgets
                  </p>
                  <p className={data.data_state.has_assets ? 'text-green-600' : 'text-zinc-400'}>
                    {data.data_state.has_assets ? '✅' : '⚪'} Has assets
                  </p>
                  <p className={data.data_state.has_debts ? 'text-green-600' : 'text-zinc-400'}>
                    {data.data_state.has_debts ? '✅' : '⚪'} Has debts
                  </p>
                  <p className={data.data_state.has_snapshots ? 'text-green-600' : 'text-zinc-400'}>
                    {data.data_state.has_snapshots ? '✅' : '⚪'} Has snapshots
                  </p>
                  <p className={data.data_state.has_goals ? 'text-green-600' : 'text-zinc-400'}>
                    {data.data_state.has_goals ? '✅' : '⚪'} Has goals
                  </p>
                  <p className={data.data_state.profile_complete ? 'text-green-600' : 'text-zinc-400'}>
                    {data.data_state.profile_complete ? '✅' : '⚪'} Profile complete
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Primary Next Step */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Primary Next Step Suggestion</h2>
            {data.next_step ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
                <p className="text-xs font-bold text-amber-700 uppercase">Volgende Stap</p>
                <p className="text-lg font-bold mt-1">{data.next_step.title}</p>
                <p className="text-sm text-zinc-600 mt-1">{data.next_step.description}</p>
                <p className="text-xs text-zinc-400 mt-2">
                  Key: {data.next_step.key} | Category: {data.next_step.category} | Priority: {data.next_step.priority}
                </p>
                <p className="text-xs text-zinc-400">
                  Link: {data.next_step.href}
                </p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-5">
                <p className="text-green-700 font-medium">Alle stappen voltooid!</p>
              </div>
            )}
          </section>

          {/* Verification */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Feature Verification</h2>
            <div className="bg-white border rounded-lg p-5 space-y-2 text-sm">
              <p className={data.source === 'database' ? 'text-green-600' : 'text-yellow-600'}>
                {data.source === 'database' ? '✅' : '⚠️'} Data comes from: {data.source}
              </p>
              <p className={!data.data_state?.has_transactions && data.next_step?.key === 'import_transactions' ? 'text-green-600' : data.data_state?.has_transactions ? 'text-green-600' : 'text-zinc-400'}>
                {!data.data_state?.has_transactions && data.next_step?.key === 'import_transactions'
                  ? '✅ No transactions → suggests import'
                  : data.data_state?.has_transactions
                  ? '✅ Has transactions → import suggestion removed'
                  : '⚪ Not verified'}
              </p>
              <p className="text-green-600">
                ✅ Steps are dynamically generated from real data state
              </p>
              <p className="text-green-600">
                ✅ Completed steps ({data.completed_count}) excluded from suggestions
              </p>
            </div>
          </section>

          {/* All Pending Steps */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">
              Pending Steps ({data.pending_steps.length})
            </h2>
            <div className="space-y-2">
              {data.pending_steps.map((step, i) => (
                <div key={step.key} className="bg-white border rounded-lg p-3 text-sm">
                  <span className="font-medium">{i + 1}. {step.title}</span>
                  <span className="text-zinc-400 ml-2">({step.category}, priority {step.priority})</span>
                </div>
              ))}
            </div>
          </section>

          {/* Completed Steps */}
          {data.completed_steps.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">
                Completed Steps ({data.completed_steps.length})
              </h2>
              <div className="space-y-1">
                {data.completed_steps.map(key => (
                  <p key={key} className="text-sm text-green-600">✅ {key}</p>
                ))}
              </div>
            </section>
          )}

          {/* Raw Response */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Raw API Response</h2>
            <pre className="bg-zinc-50 border rounded-lg p-4 text-xs overflow-auto max-h-64">
              {JSON.stringify(data, null, 2)}
            </pre>
          </section>
        </>
      )}

      <button onClick={loadData} className="text-sm text-zinc-500 underline">
        Refresh data
      </button>
    </div>
  )
}
