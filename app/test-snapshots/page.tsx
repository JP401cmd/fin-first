'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type SnapshotData = {
  snapshots: Array<{
    id: string
    user_id: string
    snapshot_date: string
    total_assets: number
    total_debts: number
    net_worth: number
    net_worth_matches: boolean
    freedom_percentage: number
    fire_target: number
    yearly_expenses: number
    created_at: string
  }>
  count: number
  fire_target: number
  yearly_expenses: number
}

type AssetDebtData = {
  totalAssets: number
  totalDebts: number
  netWorth: number
  assetCount: number
  debtCount: number
}

export default function TestSnapshotsPage() {
  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null)
  const [assetDebtData, setAssetDebtData] = useState<AssetDebtData | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createResult, setCreateResult] = useState<Record<string, unknown> | null>(null)

  async function loadData() {
    setError(null)
    const supabase = createClient()

    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated. Use /api/dev-login first.')
      return
    }

    // Load current assets and debts directly
    const [assetsRes, debtsRes] = await Promise.all([
      supabase.from('assets').select('current_value').eq('user_id', user.id).eq('is_active', true),
      supabase.from('debts').select('current_balance').eq('user_id', user.id).eq('is_active', true),
    ])

    const totalAssets = (assetsRes.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
    const totalDebts = (debtsRes.data ?? []).reduce((s, d) => s + Number(d.current_balance), 0)
    setAssetDebtData({
      totalAssets,
      totalDebts,
      netWorth: totalAssets - totalDebts,
      assetCount: assetsRes.data?.length ?? 0,
      debtCount: debtsRes.data?.length ?? 0,
    })

    // Load snapshots via API
    const res = await fetch('/api/snapshots')
    if (res.ok) {
      const data = await res.json()
      setSnapshotData(data)
    } else {
      const err = await res.json()
      setError(err.error || 'Failed to load snapshots')
    }
  }

  async function createSnapshot() {
    setCreating(true)
    setCreateResult(null)
    try {
      const res = await fetch('/api/snapshots', { method: 'POST' })
      const data = await res.json()
      setCreateResult(data)
      // Reload data
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => { loadData() }, [])

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold mb-6">Test: Net Worth Snapshots (Feature #55)</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Current Asset/Debt State */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Step 1: Current Assets & Debts</h2>
        {assetDebtData ? (
          <div className="bg-white border rounded-lg p-5 space-y-2">
            <p><strong>Active Assets:</strong> {assetDebtData.assetCount} items, total: &euro;{assetDebtData.totalAssets.toFixed(2)}</p>
            <p><strong>Active Debts:</strong> {assetDebtData.debtCount} items, total: &euro;{assetDebtData.totalDebts.toFixed(2)}</p>
            <p><strong>Net Worth (assets - debts):</strong> &euro;{assetDebtData.netWorth.toFixed(2)}</p>
            <p className={`text-sm ${assetDebtData.assetCount > 0 || assetDebtData.debtCount > 0 ? 'text-green-600' : 'text-yellow-600'}`}>
              {assetDebtData.assetCount > 0 || assetDebtData.debtCount > 0
                ? '✅ User has assets and/or debts entered'
                : '⚠️ No assets or debts found'}
            </p>
          </div>
        ) : (
          <p className="text-zinc-500">Loading...</p>
        )}
      </section>

      {/* Create Snapshot */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Step 2: Create Snapshot (server-side calculation)</h2>
        <button
          onClick={createSnapshot}
          disabled={creating}
          className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Snapshot via POST /api/snapshots'}
        </button>
        {createResult && (
          <pre className="mt-3 bg-zinc-50 border rounded-lg p-4 text-xs overflow-auto max-h-64">
            {JSON.stringify(createResult, null, 2)}
          </pre>
        )}
      </section>

      {/* Snapshot Verification */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Step 3: Snapshot Verification</h2>
        {snapshotData ? (
          <div className="space-y-4">
            <p><strong>Total Snapshots:</strong> {snapshotData.count}</p>
            <p><strong>FIRE Target:</strong> &euro;{snapshotData.fire_target.toFixed(2)}</p>
            <p><strong>Yearly Expenses:</strong> &euro;{snapshotData.yearly_expenses.toFixed(2)}</p>

            {snapshotData.snapshots.length > 0 ? (
              <div className="space-y-3">
                {snapshotData.snapshots.map((s, i) => (
                  <div key={s.id || i} className="bg-white border rounded-lg p-4">
                    <p className="font-medium">{s.snapshot_date}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      <p>Total Assets: &euro;{Number(s.total_assets).toFixed(2)}</p>
                      <p>Total Debts: &euro;{Number(s.total_debts).toFixed(2)}</p>
                      <p>Net Worth: &euro;{Number(s.net_worth).toFixed(2)}</p>
                      <p>Freedom %: {s.freedom_percentage}%</p>
                    </div>
                    <div className="mt-2 text-sm">
                      <p className={s.net_worth_matches ? 'text-green-600' : 'text-red-600'}>
                        {s.net_worth_matches
                          ? '✅ net_worth = total_assets - total_debts (verified)'
                          : '❌ net_worth does NOT match total_assets - total_debts'}
                      </p>
                      <p className={s.freedom_percentage >= 0 ? 'text-green-600' : 'text-red-600'}>
                        ✅ freedom_percentage calculated from real data: {s.freedom_percentage}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500">No snapshots yet. Create one above.</p>
            )}
          </div>
        ) : (
          <p className="text-zinc-500">Loading...</p>
        )}
      </section>

      {/* Step 5: UI Match Verification */}
      {snapshotData && assetDebtData && snapshotData.snapshots.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Step 5: UI Match Verification</h2>
          <div className="bg-white border rounded-lg p-5 space-y-2">
            {(() => {
              const latest = snapshotData.snapshots[snapshotData.snapshots.length - 1]
              const snapshotAssets = Number(latest.total_assets)
              const snapshotDebts = Number(latest.total_debts)
              const snapshotNet = Number(latest.net_worth)
              const assetsMatch = Math.abs(snapshotAssets - assetDebtData.totalAssets) < 0.01
              const debtsMatch = Math.abs(snapshotDebts - assetDebtData.totalDebts) < 0.01
              const netMatch = Math.abs(snapshotNet - assetDebtData.netWorth) < 0.01

              return (
                <>
                  <p className={assetsMatch ? 'text-green-600' : 'text-yellow-600'}>
                    {assetsMatch ? '✅' : '⚠️'} Assets: Snapshot &euro;{snapshotAssets.toFixed(2)} vs Current &euro;{assetDebtData.totalAssets.toFixed(2)}
                    {!assetsMatch && ' (may differ if created at different time)'}
                  </p>
                  <p className={debtsMatch ? 'text-green-600' : 'text-yellow-600'}>
                    {debtsMatch ? '✅' : '⚠️'} Debts: Snapshot &euro;{snapshotDebts.toFixed(2)} vs Current &euro;{assetDebtData.totalDebts.toFixed(2)}
                    {!debtsMatch && ' (may differ if created at different time)'}
                  </p>
                  <p className={netMatch ? 'text-green-600' : 'text-yellow-600'}>
                    {netMatch ? '✅' : '⚠️'} Net Worth: Snapshot &euro;{snapshotNet.toFixed(2)} vs Current &euro;{assetDebtData.netWorth.toFixed(2)}
                    {!netMatch && ' (may differ if created at different time)'}
                  </p>
                </>
              )
            })()}
          </div>
        </section>
      )}

      <button onClick={loadData} className="text-sm text-zinc-500 underline">
        Refresh data
      </button>
    </div>
  )
}
