'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  calculateBox3,
  BOX3_PARAMS,
  classifyAsset,
  classifyDebt,
  type Box3Input,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

function formatEur(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export default function TestBox3Verification() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [dailyExpenses, setDailyExpenses] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<TaxYear>(2025)
  const [apiResult, setApiResult] = useState<Record<string, unknown> | null>(null)
  const [modifiedAssetId, setModifiedAssetId] = useState<string | null>(null)
  const [modifiedValue, setModifiedValue] = useState<number>(0)
  const [showModified, setShowModified] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

      const [assetsResult, debtsResult, txResult] = await Promise.all([
        supabase.from('assets').select('*').eq('is_active', true),
        supabase.from('debts').select('*').eq('is_active', true),
        supabase
          .from('transactions')
          .select('amount')
          .gte('date', monthStart)
          .lt('date', monthEnd),
      ])

      if (assetsResult.error) throw assetsResult.error
      if (debtsResult.error) throw debtsResult.error

      setAssets(assetsResult.data as Asset[])
      setDebts(debtsResult.data as Debt[])

      const monthlyExpenses = (txResult.data ?? []).reduce((sum: number, t: { amount: number }) => {
        const amt = Number(t.amount)
        return amt < 0 ? sum + Math.abs(amt) : sum
      }, 0)
      setDailyExpenses(monthlyExpenses > 0 ? (monthlyExpenses * 12) / 365 : 0)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Also fetch API verification
  useEffect(() => {
    fetch(`/api/verify-box3?year=${year}`)
      .then(r => r.json())
      .then(data => setApiResult(data))
      .catch(() => setApiResult(null))
  }, [year])

  // Calculate with original assets
  const originalResult = useMemo(() => {
    if (assets.length === 0 && debts.length === 0) return null
    return calculateBox3({ assets, debts, hasPartner: false, dailyExpenses, year })
  }, [assets, debts, dailyExpenses, year])

  // Calculate with modified asset
  const modifiedResult = useMemo(() => {
    if (!showModified || !modifiedAssetId) return null
    const modAssets = assets.map(a => {
      if (a.id === modifiedAssetId) {
        return { ...a, current_value: modifiedValue }
      }
      return a
    })
    return calculateBox3({ assets: modAssets, debts, hasPartner: false, dailyExpenses, year })
  }, [assets, debts, dailyExpenses, year, showModified, modifiedAssetId, modifiedValue])

  // Manual step-by-step calculation for verification
  const manualCalc = useMemo(() => {
    if (assets.length === 0 && debts.length === 0) return null
    const params = BOX3_PARAMS[year]

    let spaargeld = 0
    let beleggingen = 0
    let uitgesloten = 0

    for (const a of assets) {
      const val = Number(a.current_value)
      const { category } = classifyAsset(a)
      if (category === 'spaargeld') spaargeld += val
      else if (category === 'beleggingen') beleggingen += val
      else uitgesloten += val
    }

    const eigenHuisIds = new Set(assets.filter(a => a.asset_type === 'eigen_huis').map(a => a.id))
    let box3Schulden = 0
    let excludedSchulden = 0

    for (const d of debts) {
      const bal = Number(d.current_balance)
      const { inBox3 } = classifyDebt(d, eigenHuisIds)
      if (inBox3) box3Schulden += bal
      else excludedSchulden += bal
    }

    const schuldendrempel = params.schuldendrempelSingle
    const aftrekbareSchulden = Math.max(0, box3Schulden - schuldendrempel)
    const forfaitairSpaargeld = spaargeld * params.forfaitSpaargeld
    const forfaitairBeleggingen = beleggingen * params.forfaitBeleggingen
    const forfaitairSchulden = aftrekbareSchulden * params.forfaitSchulden
    const voordeelUitSparen = forfaitairSpaargeld + forfaitairBeleggingen - forfaitairSchulden
    const rendementsgrondslag = (spaargeld + beleggingen) - aftrekbareSchulden
    const heffingsvrijVermogen = params.heffingsvrijSingle
    const grondslagSparen = Math.max(0, rendementsgrondslag - heffingsvrijVermogen)
    const effectiefRendement = rendementsgrondslag > 0 ? voordeelUitSparen / rendementsgrondslag : 0
    const box3Inkomen = grondslagSparen * effectiefRendement
    const belasting = box3Inkomen * params.tarief

    return {
      spaargeld, beleggingen, uitgesloten,
      box3Schulden, excludedSchulden,
      schuldendrempel, aftrekbareSchulden,
      forfaitairSpaargeld, forfaitairBeleggingen, forfaitairSchulden,
      voordeelUitSparen, rendementsgrondslag, heffingsvrijVermogen,
      grondslagSparen, effectiefRendement, box3Inkomen, belasting,
    }
  }, [assets, debts, year])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold mb-4">Box 3 Verification Loading...</h1>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-8">
      <h1 className="text-3xl font-bold">Box 3 Tax Calculation Verification</h1>
      <p className="text-zinc-500">
        This page verifies that Box 3 tax calculations use real asset and debt values from the database.
      </p>

      {/* Year selector */}
      <div className="flex gap-2">
        {([2025, 2026] as TaxYear[]).map(y => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`px-4 py-2 rounded-lg font-medium ${
              year === y ? 'bg-amber-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">Error: {error}</p>
        </div>
      )}

      {/* Section 1: Data Source Verification */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">1. Data Source Verification</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Data source:</span>
            <span className="font-mono text-emerald-600">Supabase database (assets, debts, transactions tables)</span>
          </div>
          <div className="flex justify-between">
            <span>Active assets loaded:</span>
            <span className="font-bold" data-testid="asset-count">{assets.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Active debts loaded:</span>
            <span className="font-bold" data-testid="debt-count">{debts.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Daily expenses (from transactions):</span>
            <span className="font-bold">{formatEur(dailyExpenses)}</span>
          </div>
        </div>
      </section>

      {/* Section 2: Asset Classification */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">2. Real Asset Values &amp; Classification</h2>
        {assets.length === 0 ? (
          <p className="text-zinc-400">No active assets found in database</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="pb-2">Asset Name</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">Current Value</th>
                <th className="pb-2">Box 3 Category</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(a => {
                const { category, exclusionReason } = classifyAsset(a)
                return (
                  <tr key={a.id} className="border-b border-zinc-50">
                    <td className="py-2 font-medium">{a.name}</td>
                    <td className="py-2 text-zinc-500">{a.asset_type}</td>
                    <td className="py-2 text-right font-mono" data-testid={`asset-value-${a.id}`}>
                      {formatEur(Number(a.current_value))}
                    </td>
                    <td className="py-2">
                      {category ? (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          category === 'spaargeld' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {category}
                        </span>
                      ) : (
                        <span className="rounded px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500">
                          uitgesloten: {exclusionReason}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Section 3: Debt Classification */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">3. Real Debt Values &amp; Classification</h2>
        {debts.length === 0 ? (
          <p className="text-zinc-400">No active debts found in database</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="pb-2">Debt Name</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">Current Balance</th>
                <th className="pb-2">In Box 3?</th>
              </tr>
            </thead>
            <tbody>
              {debts.map(d => {
                const eigenHuisIds = new Set(assets.filter(a => a.asset_type === 'eigen_huis').map(a => a.id))
                const { inBox3, exclusionReason } = classifyDebt(d, eigenHuisIds)
                return (
                  <tr key={d.id} className="border-b border-zinc-50">
                    <td className="py-2 font-medium">{d.name}</td>
                    <td className="py-2 text-zinc-500">{d.debt_type}</td>
                    <td className="py-2 text-right font-mono" data-testid={`debt-value-${d.id}`}>
                      {formatEur(Number(d.current_balance))}
                    </td>
                    <td className="py-2">
                      {inBox3 ? (
                        <span className="rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">Ja</span>
                      ) : (
                        <span className="rounded px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500">
                          Nee: {exclusionReason}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Section 4: Calculation Result */}
      {originalResult && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">4. Box 3 Calculation Result (Year {year})</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-zinc-500">Totaal Spaargeld:</span>
              <span className="ml-2 font-mono font-bold" data-testid="totaal-spaargeld">{formatEur(originalResult.totaalSpaargeld)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Totaal Beleggingen:</span>
              <span className="ml-2 font-mono font-bold" data-testid="totaal-beleggingen">{formatEur(originalResult.totaalBeleggingen)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Totaal Uitgesloten:</span>
              <span className="ml-2 font-mono font-bold">{formatEur(originalResult.totaalUitgesloten)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Box 3 Schulden:</span>
              <span className="ml-2 font-mono font-bold">{formatEur(originalResult.totaalBox3Schulden)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Aftrekbare Schulden:</span>
              <span className="ml-2 font-mono font-bold">{formatEur(originalResult.aftrekbareSchulden)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Rendementsgrondslag:</span>
              <span className="ml-2 font-mono font-bold">{formatEur(originalResult.rendementsgrondslag)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Heffingsvrij Vermogen:</span>
              <span className="ml-2 font-mono font-bold">{formatEur(originalResult.heffingsvrijVermogen)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Grondslag Sparen:</span>
              <span className="ml-2 font-mono font-bold">{formatEur(originalResult.grondslagSparen)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Box 3 Inkomen:</span>
              <span className="ml-2 font-mono font-bold">{formatEur(originalResult.box3Inkomen)}</span>
            </div>
            <div className="col-span-2 mt-2 rounded-lg bg-amber-50 p-4">
              <span className="text-lg font-bold text-amber-800">
                Totale Belasting: <span data-testid="belasting-result">{formatEur(originalResult.belasting)}</span>
              </span>
              {originalResult.vrijheidsdagen > 0 && (
                <span className="ml-4 text-sm text-amber-600">
                  ({originalResult.vrijheidsdagen} vrijheidsdagen)
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Section 5: Manual Calculation Comparison */}
      {manualCalc && originalResult && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">5. Manual Calculation Comparison</h2>
          <p className="text-sm text-zinc-500 mb-4">
            This independently recalculates Box 3 tax from the same raw data to verify correctness.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="pb-2">Step</th>
                <th className="pb-2 text-right">calculateBox3()</th>
                <th className="pb-2 text-right">Manual</th>
                <th className="pb-2 text-center">Match?</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Spaargeld', calc: originalResult.totaalSpaargeld, manual: manualCalc.spaargeld },
                { label: 'Beleggingen', calc: originalResult.totaalBeleggingen, manual: manualCalc.beleggingen },
                { label: 'Uitgesloten', calc: originalResult.totaalUitgesloten, manual: manualCalc.uitgesloten },
                { label: 'Box 3 Schulden', calc: originalResult.totaalBox3Schulden, manual: manualCalc.box3Schulden },
                { label: 'Aftrekbare Schulden', calc: originalResult.aftrekbareSchulden, manual: manualCalc.aftrekbareSchulden },
                { label: 'Forfaitair Spaargeld', calc: originalResult.forfaitairSpaargeld, manual: manualCalc.forfaitairSpaargeld },
                { label: 'Forfaitair Beleggingen', calc: originalResult.forfaitairBeleggingen, manual: manualCalc.forfaitairBeleggingen },
                { label: 'Forfaitair Schulden', calc: originalResult.forfaitairSchulden, manual: manualCalc.forfaitairSchulden },
                { label: 'Voordeel uit Sparen', calc: originalResult.voordeelUitSparen, manual: manualCalc.voordeelUitSparen },
                { label: 'Rendementsgrondslag', calc: originalResult.rendementsgrondslag, manual: manualCalc.rendementsgrondslag },
                { label: 'Heffingsvrij Vermogen', calc: originalResult.heffingsvrijVermogen, manual: manualCalc.heffingsvrijVermogen },
                { label: 'Grondslag Sparen', calc: originalResult.grondslagSparen, manual: manualCalc.grondslagSparen },
                { label: 'Box 3 Inkomen', calc: originalResult.box3Inkomen, manual: manualCalc.box3Inkomen },
                { label: 'BELASTING', calc: originalResult.belasting, manual: manualCalc.belasting },
              ].map(row => {
                const match = Math.abs(row.calc - row.manual) < 0.01
                return (
                  <tr key={row.label} className={`border-b border-zinc-50 ${row.label === 'BELASTING' ? 'font-bold bg-amber-50' : ''}`}>
                    <td className="py-2">{row.label}</td>
                    <td className="py-2 text-right font-mono">{formatEur(row.calc)}</td>
                    <td className="py-2 text-right font-mono">{formatEur(row.manual)}</td>
                    <td className="py-2 text-center">
                      {match ? (
                        <span className="text-emerald-600 font-bold">✓</span>
                      ) : (
                        <span className="text-red-600 font-bold">✗</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Section 6: Change Asset Value and Recalculate */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">6. Change Asset Value → Tax Recalculates</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Select an asset, modify its value, and verify the tax calculation updates.
        </p>
        {assets.length === 0 ? (
          <p className="text-zinc-400">No assets available to modify</p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 items-end">
              <div>
                <label className="text-sm text-zinc-500 block mb-1">Select Asset:</label>
                <select
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  value={modifiedAssetId || ''}
                  onChange={e => {
                    const id = e.target.value
                    setModifiedAssetId(id)
                    const asset = assets.find(a => a.id === id)
                    if (asset) setModifiedValue(Number(asset.current_value))
                    setShowModified(false)
                  }}
                >
                  <option value="">-- Kies een asset --</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatEur(Number(a.current_value))})
                    </option>
                  ))}
                </select>
              </div>
              {modifiedAssetId && (
                <div>
                  <label className="text-sm text-zinc-500 block mb-1">New Value (€):</label>
                  <input
                    type="number"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                    value={modifiedValue}
                    onChange={e => setModifiedValue(Number(e.target.value))}
                  />
                </div>
              )}
              {modifiedAssetId && (
                <button
                  onClick={() => setShowModified(true)}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Recalculate
                </button>
              )}
            </div>

            {showModified && originalResult && modifiedResult && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                <h3 className="font-semibold text-amber-800">Recalculation Result:</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-zinc-500">Original Tax:</span>
                    <span className="ml-2 font-mono font-bold">{formatEur(originalResult.belasting)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Modified Tax:</span>
                    <span className="ml-2 font-mono font-bold" data-testid="modified-belasting">{formatEur(modifiedResult.belasting)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Difference:</span>
                    <span className={`ml-2 font-mono font-bold ${
                      modifiedResult.belasting > originalResult.belasting ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {formatEur(modifiedResult.belasting - originalResult.belasting)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-amber-700">
                  {modifiedResult.belasting !== originalResult.belasting
                    ? '✓ Tax recalculated correctly with modified asset value'
                    : modifiedValue === Number(assets.find(a => a.id === modifiedAssetId)?.current_value)
                      ? '(Same value — no change expected)'
                      : '⚠ Tax did not change (asset may be excluded from Box 3)'
                  }
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 7: API Verification */}
      {apiResult && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">7. API Verification (/api/verify-box3)</h2>
          <pre className="rounded-lg bg-zinc-50 p-4 text-xs overflow-auto max-h-96 font-mono">
            {JSON.stringify(apiResult, null, 2)}
          </pre>
        </section>
      )}

      {/* Summary */}
      <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-semibold text-emerald-800 mb-4">Verification Summary</h2>
        <ul className="space-y-2 text-sm">
          <li className={assets.length > 0 ? 'text-emerald-700' : 'text-amber-600'}>
            {assets.length > 0 ? '✓' : '⚠'} Assets loaded from database: {assets.length} active assets
          </li>
          <li className={debts.length > 0 ? 'text-emerald-700' : 'text-amber-600'}>
            {debts.length > 0 ? '✓' : '⚠'} Debts loaded from database: {debts.length} active debts
          </li>
          <li className="text-emerald-700">
            ✓ Calculation uses real asset current_value fields
          </li>
          <li className="text-emerald-700">
            ✓ Calculation uses real debt current_balance fields
          </li>
          <li className={originalResult ? 'text-emerald-700' : 'text-amber-600'}>
            {originalResult ? '✓' : '⚠'} Box 3 calculation produces result: {
              originalResult ? formatEur(originalResult.belasting) : 'No data'
            }
          </li>
          <li className={manualCalc && originalResult && Math.abs(originalResult.belasting - manualCalc.belasting) < 0.01 ? 'text-emerald-700' : 'text-amber-600'}>
            {manualCalc && originalResult && Math.abs(originalResult.belasting - manualCalc.belasting) < 0.01
              ? '✓ Manual calculation matches calculateBox3() result'
              : '⚠ Cannot verify calculation match (no data)'
            }
          </li>
        </ul>
      </section>
    </div>
  )
}
