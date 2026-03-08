'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import {
  Plus, Trash2, Edit3, X, TrendingUp, RefreshCw, Search, Loader2, BarChart3, ChevronDown, ChevronUp, Briefcase, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { OwnershipToggle, OwnershipBadge, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import {
  type Asset,
  type AssetType,
  type RiskProfile,
  type RetirementProviderType,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ICONS,
  ASSET_TYPE_COLORS,
  TYPICAL_RETURNS,
  ASSET_SUBTYPE_LABELS,
  ASSET_SUBTYPE_DEFAULTS,
  ASSET_TYPE_FIELDS,
  RISK_PROFILE_LABELS,
  RETIREMENT_PROVIDER_LABELS,
  getDefaultAssets,
  projectPortfolio,
} from '@/lib/asset-data'
import { FeatureGate } from '@/components/app/feature-gate'

type Mortgage = { id: string; name: string; current_balance: number; linked_asset_id: string | null }

export default function AssetsPage() {
  const router = useRouter()
  const [assets, setAssets] = useState<Asset[]>([])
  const [mortgages, setMortgages] = useState<Mortgage[]>([])
  const [linkedBankAccounts, setLinkedBankAccounts] = useState<Map<string, { id: string; linked_asset_id: string }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newAssetType, setNewAssetType] = useState<AssetType | null>(null)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [modalStep, setModalStep] = useState<'detail' | 'edit' | 'revalue'>('detail')
  const [projectionYears, setProjectionYears] = useState(10)
  const [valuations, setValuations] = useState<Record<string, Valuation[]>>({})
  const [dailyExpenses, setDailyExpenses] = useState(0)
  const seedingRef = useRef(false)
  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)

  function getMortgageForAsset(assetId: string): { name: string; balance: number } | null {
    const m = mortgages.find((m) => m.linked_asset_id === assetId)
    if (!m) return null
    return { name: m.name, balance: Number(m.current_balance) }
  }

  const loadAssets = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      let query = supabase
        .from('assets')
        .select('*')
      if (perspective === 'personal') {
        query = query.eq('ownership', 'personal')
      }
      const { data, error: fetchError } = await query
        .order('sort_order', { ascending: true })

      if (signal?.aborted) return // Discard stale results
      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        if (seedingRef.current) return
        seedingRef.current = true
        // Double-check: count to prevent race conditions
        const { count } = await supabase.from('assets').select('id', { count: 'exact', head: true })
        if (signal?.aborted) return
        if (count && count > 0) { seedingRef.current = false; await loadAssets(signal); return }
        await seedAssets(supabase)
        return
      }

      setAssets(data as Asset[])

      // Load linked mortgages + daily expenses for freedom-time + bank account links
      const { data: { user } } = await supabase.auth.getUser()
      if (signal?.aborted) return
      if (user) {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

        const [mortgageResult, txResult, bankLinksResult] = await Promise.all([
          supabase
            .from('debts')
            .select('id, name, current_balance, linked_asset_id')
            .eq('user_id', user.id)
            .eq('debt_type', 'mortgage')
            .eq('is_active', true),
          supabase
            .from('transactions')
            .select('amount')
            .gte('date', monthStart)
            .lt('date', monthEnd),
          supabase
            .from('bank_accounts')
            .select('id, linked_asset_id, balance')
            .not('linked_asset_id', 'is', null)
            .eq('is_active', true),
        ])

        if (signal?.aborted) return // Discard stale results after parallel queries

        if (mortgageResult.data) setMortgages(mortgageResult.data as Mortgage[])

        // Build linked bank account map (asset_id → bank_account)
        const linksMap = new Map<string, { id: string; linked_asset_id: string }>(
          (bankLinksResult.data ?? []).map((ba: { id: string; linked_asset_id: string; balance: number }) => [ba.linked_asset_id, ba])
        )
        setLinkedBankAccounts(linksMap)

        // Sync cash asset values with bank_account balances (bank_account is more up-to-date)
        if (bankLinksResult.data && bankLinksResult.data.length > 0) {
          const balanceMap = new Map(
            bankLinksResult.data.map((ba: { id: string; linked_asset_id: string; balance: number }) => [ba.linked_asset_id, Number(ba.balance)])
          )
          setAssets(prev => prev.map(a => {
            if (a.asset_type === 'cash' && balanceMap.has(a.id)) {
              return { ...a, current_value: balanceMap.get(a.id)! }
            }
            return a
          }))
        }

        // Calculate daily expenses from current month transactions
        const monthlyExpenses = (txResult.data ?? []).reduce((sum, t) => {
          const amt = Number(t.amount)
          return amt < 0 ? sum + Math.abs(amt) : sum
        }, 0)
        setDailyExpenses(monthlyExpenses > 0 ? monthlyExpenses / 30 : 0)
      }
    } catch (err) {
      console.error('Error loading assets:', err)
      if (!signal?.aborted) setError('Kon assets niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [perspective])

  async function seedAssets(supabase: ReturnType<typeof createClient>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const defaults = getDefaultAssets()
    const rows = defaults.map((a, i) => ({
      user_id: user.id,
      name: a.name,
      asset_type: a.asset_type,
      current_value: a.current_value,
      purchase_value: a.purchase_value,
      purchase_date: a.purchase_date,
      expected_return: a.expected_return,
      monthly_contribution: a.monthly_contribution,
      institution: a.institution || null,
      sort_order: i,
      subtype: a.subtype || null,
      risk_profile: a.risk_profile || null,
      tax_benefit: a.tax_benefit ?? null,
      is_liquid: a.is_liquid ?? null,
      lock_end_date: a.lock_end_date || null,
      ticker_symbol: a.ticker_symbol || null,
      rental_income: a.rental_income ?? null,
      woz_value: a.woz_value ?? null,
      retirement_provider_type: a.retirement_provider_type || null,
      depreciation_rate: a.depreciation_rate ?? null,
      address_postcode: a.address_postcode || null,
      address_house_number: a.address_house_number || null,
    }))

    await supabase.from('assets').insert(rows)
    await loadAssets()
  }

  const loadValuations = useCallback(async (assetId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_id', assetId)
      .eq('entity_type', 'asset')
      .order('valuation_date', { ascending: false })
    if (data) {
      setValuations((prev) => ({ ...prev, [assetId]: data as Valuation[] }))
    }
  }, [])

  // Load all valuations for sparklines on asset cards
  const loadAllValuations = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_type', 'asset')
      .order('valuation_date', { ascending: true })
    if (data) {
      const grouped: Record<string, Valuation[]> = {}
      for (const v of data as Valuation[]) {
        if (!grouped[v.entity_id]) grouped[v.entity_id] = []
        grouped[v.entity_id].push(v)
      }
      setValuations(grouped)
    }
  }, [])

  useEffect(() => {
    const signal = perspectiveSignal
    loadAssets(signal).then(() => { if (!signal.aborted) loadAllValuations() })
  }, [loadAssets, loadAllValuations, perspectiveSignal])

  const activeAssets = assets.filter((a) => a.is_active)
  const totalValue = activeAssets.reduce((s, a) => s + Number(a.current_value), 0)
  const totalPurchase = activeAssets.reduce((s, a) => s + Number(a.purchase_value), 0)
  const totalMonthlyContrib = activeAssets.reduce((s, a) => s + Number(a.monthly_contribution), 0)

  // Group by type
  const byType = useMemo(() => {
    const map = {} as Record<AssetType, { assets: Asset[]; total: number }>
    for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
      const typeAssets = activeAssets.filter((a) => a.asset_type === type)
      map[type] = {
        assets: typeAssets,
        total: typeAssets.reduce((s, a) => s + Number(a.current_value), 0),
      }
    }
    return map
  }, [activeAssets])

  // Portfolio projection
  const projection = useMemo(
    () => projectPortfolio(activeAssets, projectionYears * 12),
    [activeAssets, projectionYears],
  )
  const futureValue = projection.length > 0 ? projection[projection.length - 1].total : totalValue
  const projectedGrowth = futureValue - totalValue

  async function deleteAsset(id: string) {
    const supabase = createClient()
    await supabase.from('assets').delete().eq('id', id)
    setAssets((prev) => prev.filter((a) => a.id !== id))
    setSelectedAsset(null)
  }

  function openAssetModal(asset: Asset) {
    setSelectedAsset(asset)
    setModalStep('detail')
    loadValuations(asset.id)
  }

  function closeAssetModal() {
    setSelectedAsset(null)
    setModalStep('detail')
  }

  function handleAssetClick(asset: Asset) {
    if (asset.asset_type === 'cash') {
      const linkedBA = linkedBankAccounts.get(asset.id)
      if (linkedBA) {
        router.push(`/core/assets/cash/${linkedBA.id}`)
        return
      }
    }
    openAssetModal(asset)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadAssets() }} className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Header */}
      <section className="rounded-[var(--r-lg)] border border-kern-200 card-editorial p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--ink)]">Bezittingen</h1>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              {activeAssets.length} bezitting{activeAssets.length !== 1 ? 'en' : ''} — opgeslagen vrijheid
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/core/assets/holdings"
              className="inline-flex items-center gap-2 rounded-[var(--r)] border border-kern-200 px-4 py-2 text-sm font-medium text-kern-700 hover:bg-kern-50"
            >
              <BarChart3 className="h-4 w-4" />
              Holdings
            </Link>
            <Link
              href="/core/assets/revalue"
              className="inline-flex items-center gap-2 rounded-[var(--r)] border border-kern-200 px-4 py-2 text-sm font-medium text-kern-700 hover:bg-kern-50"
            >
              <RefreshCw className="h-4 w-4" />
              Herwaarderen
            </Link>
            <button
              onClick={() => { setEditAsset(null); setShowForm(true) }}
              className="inline-flex items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
            >
              <Plus className="h-4 w-4" />
              Asset toevoegen
            </button>
          </div>
        </div>

        <div className="mt-3 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Totale waarde</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalValue)}</p>
            {dailyExpenses > 0 && totalValue > 0 && (
              <p className="mt-0.5 text-xs text-kern-600/70" data-testid="total-value-freedom">
                {formatFreedomTimeString(calculateFreedomTime(totalValue, dailyExpenses), 'long')} vrijheid
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Maandelijkse inleg</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalMonthlyContrib)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Rendement (totaal)</p>
            {totalPurchase > 0 ? (
              <>
                <p className={`mt-1 text-xl font-bold ${totalValue >= totalPurchase ? 'text-emerald-600' : 'text-red-600'}`}>
                  {totalValue >= totalPurchase ? '+' : ''}{formatCurrency(totalValue - totalPurchase)}
                </p>
                {dailyExpenses > 0 && Math.abs(totalValue - totalPurchase) > 0 && (
                  <p className={`mt-0.5 text-xs ${totalValue >= totalPurchase ? 'text-emerald-500/70' : 'text-red-500/70'}`} data-testid="return-freedom">
                    {(() => {
                      const fd = calculateFreedomTime(Math.abs(totalValue - totalPurchase), dailyExpenses)
                      const fdStr = formatFreedomTimeString(fd, 'short', true)
                      return totalValue >= totalPurchase ? `${fdStr} vrijheid gewonnen` : `${fdStr} vrijheid verloren`
                    })()}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xl font-bold text-[var(--ink-3)]">-</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Waarde over {projectionYears} jaar</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(futureValue)}</p>
            {dailyExpenses > 0 && futureValue > 0 && (
              <p className="mt-0.5 text-xs text-emerald-500/70" data-testid="future-value-freedom">
                {formatFreedomTimeString(calculateFreedomTime(futureValue, dailyExpenses), 'long')} vrijheid
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Allocation + projection */}
      <div className="mt-3 sm:mt-6 grid gap-3 sm:gap-6 lg:grid-cols-2">
        {/* Allocation — gated by asset_allocatie */}
        <FeatureGate featureId="asset_allocatie" fallback="hidden">
          <section className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-[var(--ink-2)]">Verdeling</h2>
            <div className="mt-4 flex items-center gap-6">
              <AllocationPie byType={byType} total={totalValue} dailyExpenses={dailyExpenses} />
              <div className="flex-1 space-y-2">
                {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => {
                  const data = byType[type]
                  if (!data || data.total === 0) return null
                  const pct = totalValue > 0 ? (data.total / totalValue) * 100 : 0
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: ASSET_TYPE_COLORS[type] }}
                      />
                      <span className="flex-1 text-xs text-[var(--ink-2)]">{ASSET_TYPE_LABELS[type]}</span>
                      <span className="text-xs font-medium text-[var(--ink)]">{pct.toFixed(0)}%</span>
                      <span className="text-xs text-[var(--ink-3)]">{formatCurrency(data.total)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        </FeatureGate>

        {/* Projection chart */}
        <section className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6" data-testid="portfolio-projection-section">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--ink-2)]">Projectie</h2>
            <div className="flex items-center gap-1" data-testid="projection-year-buttons">
              {[5, 10, 20, 30].map((y) => (
                <button
                  key={y}
                  onClick={() => setProjectionYears(y)}
                  data-testid={`projection-year-${y}`}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    projectionYears === y
                      ? 'bg-kern-100 text-kern-700'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  {y}j
                </button>
              ))}
            </div>
          </div>
          <ProjectionChart data={projection} currentValue={totalValue} />
          <div className="mt-3 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[var(--ink-3)]">Verwachte groei:</span>
              <span className="font-medium text-emerald-600" data-testid="projected-growth">+{formatCurrency(projectedGrowth)}</span>
            </div>
          </div>
          {/* Contextual projection message */}
          {projection.length > 0 && (
            <p className="mt-3 text-xs text-[var(--ink-3)] leading-relaxed" data-testid="projection-context-message">
              {totalMonthlyContrib > 0
                ? `Met je huidige inleg van ${formatCurrency(totalMonthlyContrib)}/maand groeit je portfolio naar ${formatCurrency(futureValue)} in ${projectionYears} jaar`
                : `Zonder extra inleg groeit je portfolio naar ${formatCurrency(futureValue)} in ${projectionYears} jaar`}
              {dailyExpenses > 0 && futureValue > 0 && (
                <span className="text-emerald-600 font-medium">
                  {' — '}dat is {formatFreedomTimeString(calculateFreedomTime(futureValue, dailyExpenses), 'long')} vrijheid
                </span>
              )}
            </p>
          )}
        </section>
      </div>

      {/* Grouped asset list */}
      <section className="mt-3 sm:mt-6 space-y-1">
        {activeAssets.length === 0 && (
          <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center">
            <TrendingUp className="mx-auto h-8 w-8 text-kern-400" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-2)]">Geen bezittingen geregistreerd</p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">Voeg een asset toe om je vermogen te volgen.</p>
          </div>
        )}
        {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => {
          const group = byType[type]
          if (!group || group.assets.length === 0) return null
          const groupColor = ASSET_TYPE_COLORS[type]
          const groupIcon = ASSET_TYPE_ICONS[type]
          const isCash = type === 'cash'

          return (
            <div key={type}>
              {/* Group header */}
              <div className="flex items-center gap-2 pt-4 pb-1.5">
                <span style={{ color: groupColor }}><BudgetIcon name={groupIcon} className="h-4 w-4" /></span>
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {ASSET_TYPE_LABELS[type]}
                </h3>
                <span className="text-xs tabular-nums text-[var(--ink-3)]">
                  {formatCurrency(group.total)}
                </span>
              </div>

              {/* Asset cards */}
              <div className="space-y-2">
                {group.assets.map((asset) => {
                  const value = Number(asset.current_value)
                  const purchase = Number(asset.purchase_value)
                  const returnPct = purchase > 0 ? ((value - purchase) / purchase) * 100 : 0
                  const icon = ASSET_TYPE_ICONS[asset.asset_type] ?? 'Briefcase'
                  const color = ASSET_TYPE_COLORS[asset.asset_type]
                  const hasBudget = isCash && linkedBankAccounts.has(asset.id)

                  return (
                    <div
                      key={asset.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-colors ${
                        isCash ? 'hover:border-emerald-200 hover:bg-emerald-50/30' : 'hover:border-kern-200 hover:bg-kern-50/30'
                      }`}
                      onClick={() => handleAssetClick(asset)}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)]"
                        style={{ backgroundColor: color + '15' }}
                      >
                        <span style={{ color }}><BudgetIcon name={icon} className="h-4 w-4" /></span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ink)] flex items-center gap-1.5">
                          {asset.name}
                          <OwnershipBadge ownership={asset.ownership ?? 'personal'} />
                          {hasBudget && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 border border-emerald-200">
                              <BarChart3 className="h-2.5 w-2.5" /> Transacties
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-[var(--ink-3)]">
                          {isCash
                            ? [
                                asset.subtype && ASSET_SUBTYPE_LABELS.cash?.[asset.subtype],
                                asset.account_number,
                                asset.institution,
                              ].filter(Boolean).join(' \u2022 ') || 'Bankrekening'
                            : [
                                ASSET_TYPE_LABELS[asset.asset_type],
                                asset.subtype && ASSET_SUBTYPE_LABELS[asset.asset_type]?.[asset.subtype],
                                asset.institution,
                              ].filter(Boolean).join(' \u2022 ')
                          }
                        </p>
                        {(asset.net_worth_inclusion_pct ?? 100) < 100 && (
                          <span className="mt-0.5 inline-block rounded bg-kern-50 border border-kern-200 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-kern-600">
                            {asset.net_worth_inclusion_pct}% meegeteld
                          </span>
                        )}
                      </div>
                      {/* Mini sparkline for non-cash asset cards */}
                      {!isCash && (() => {
                        const assetVals = valuations[asset.id]
                        if (assetVals && assetVals.length >= 2) {
                          const sorted = [...assetVals].sort((a, b) => a.valuation_date.localeCompare(b.valuation_date))
                          return <MiniSparkline valuations={sorted} className="hidden sm:block" />
                        }
                        return null
                      })()}
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-[var(--ink)]">{formatCurrency(value)}</p>
                        {dailyExpenses > 0 && value > 0 && (
                          <p className={`text-[10px] ${isCash ? 'text-emerald-500/70' : 'text-kern-500/70'}`} data-testid="asset-card-freedom">
                            {formatFreedomTimeString(calculateFreedomTime(value, dailyExpenses), 'short', true)} vrijheid
                          </p>
                        )}
                        {!isCash && purchase > 0 && (
                          <p className={`text-xs font-medium ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* Asset detail modal */}
      {selectedAsset && modalStep === 'detail' && (
        <AssetDetailModal
          asset={selectedAsset}
          valuations={valuations[selectedAsset.id]}
          mortgage={getMortgageForAsset(selectedAsset.id)}
          dailyExpenses={dailyExpenses}
          onClose={closeAssetModal}
          onEdit={() => setModalStep('edit')}
          onRevalue={() => setModalStep('revalue')}
          onDelete={() => deleteAsset(selectedAsset.id)}
        />
      )}

      {/* Edit form modal */}
      {selectedAsset && modalStep === 'edit' && (
        <AssetForm
          asset={selectedAsset}
          linkedBankAccounts={linkedBankAccounts}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadAssets().then(() => {
              // Refresh selectedAsset with updated data
              const supabase = createClient()
              supabase.from('assets').select('*').eq('id', selectedAsset.id).single().then(({ data }) => {
                if (data) setSelectedAsset(data as Asset)
              })
            })
          }}
        />
      )}

      {/* Revaluation modal */}
      {selectedAsset && modalStep === 'revalue' && (
        <ValuationModal
          entityId={selectedAsset.id}
          entityType="asset"
          entityName={selectedAsset.name}
          currentValue={Number(selectedAsset.current_value)}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadAssets().then(() => {
              const supabase = createClient()
              supabase.from('assets').select('*').eq('id', selectedAsset.id).single().then(({ data }) => {
                if (data) setSelectedAsset(data as Asset)
              })
            })
            loadValuations(selectedAsset.id)
          }}
        />
      )}

      {/* New asset form */}
      {showForm && (
        <AssetForm
          asset={editAsset ?? undefined}
          defaultType={newAssetType ?? undefined}
          linkedBankAccounts={linkedBankAccounts}
          onClose={() => { setShowForm(false); setEditAsset(null); setNewAssetType(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditAsset(null)
            setNewAssetType(null)
            loadAssets()
          }}
        />
      )}
    </div>
  )
}

// ── Asset detail modal ───────────────────────────────────────

function AssetDetailModal({
  asset,
  valuations,
  mortgage,
  dailyExpenses,
  onClose,
  onEdit,
  onRevalue,
  onDelete,
}: {
  asset: Asset
  valuations: Valuation[] | undefined
  mortgage: { name: string; balance: number } | null
  dailyExpenses: number
  onClose: () => void
  onEdit: () => void
  onRevalue: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hasActiveHoldings, setHasActiveHoldings] = useState(false)
  const [holdingsCount, setHoldingsCount] = useState(0)
  const value = Number(asset.current_value)
  const purchase = Number(asset.purchase_value)
  const returnPct = purchase > 0 ? ((value - purchase) / purchase) * 100 : 0
  const icon = ASSET_TYPE_ICONS[asset.asset_type] ?? 'Briefcase'
  const color = ASSET_TYPE_COLORS[asset.asset_type]
  const isEigenHuis = asset.asset_type === 'eigen_huis'

  // Check if this asset has active holdings (portfolio tracker is source of truth)
  useEffect(() => {
    if (['investment', 'crypto', 'savings', 'retirement'].includes(asset.asset_type)) {
      fetch(`/api/assets/has-holdings?asset_id=${asset.id}`)
        .then(res => res.json())
        .then(data => {
          setHasActiveHoldings(data.has_holdings === true)
          setHoldingsCount(data.holdings_count || 0)
        })
        .catch(() => { /* non-critical */ })
    }
  }, [asset.id, asset.asset_type])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-ed)] px-6 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)]"
            style={{ backgroundColor: color + '15' }}
          >
            <BudgetIcon name={icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[var(--ink)]">{asset.name}</h2>
            <p className="text-xs text-[var(--ink-3)]">
              {ASSET_TYPE_LABELS[asset.asset_type]}
              {asset.subtype && ASSET_SUBTYPE_LABELS[asset.asset_type]?.[asset.subtype]
                ? ` \u2022 ${ASSET_SUBTYPE_LABELS[asset.asset_type]![asset.subtype]}`
                : ''}
              {asset.institution ? ` \u2022 ${asset.institution}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Value highlight */}
        <div className="border-b border-[var(--border-ed)] px-6 py-4 text-center">
          {isEigenHuis && <p className="mb-1 text-xs font-medium text-[var(--ink-3)] uppercase">Marktwaarde</p>}
          <p className="text-3xl font-bold text-[var(--ink)]">{formatCurrency(value)}</p>
          {dailyExpenses > 0 && value > 0 && (
            <p className="mt-0.5 text-xs text-kern-600/70" data-testid="detail-value-freedom">
              {formatFreedomTimeString(calculateFreedomTime(value, dailyExpenses), 'long')} vrijheid
            </p>
          )}
          {purchase > 0 && (
            <p className={`mt-1 text-sm font-medium ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% ({returnPct >= 0 ? '+' : ''}{formatCurrency(value - purchase)})
              {dailyExpenses > 0 && Math.abs(value - purchase) > 0 && (
                <span className={`ml-1 text-xs ${returnPct >= 0 ? 'text-emerald-500/60' : 'text-red-500/60'}`} data-testid="detail-return-freedom">
                  — {(() => {
                    const fd = calculateFreedomTime(Math.abs(value - purchase), dailyExpenses)
                    return formatFreedomTimeString(fd, 'short', true)
                  })()} {returnPct >= 0 ? 'gewonnen' : 'verloren'}
                </span>
              )}
            </p>
          )}
          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {asset.risk_profile && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                asset.risk_profile === 'laag' ? 'bg-emerald-100 text-emerald-700' :
                asset.risk_profile === 'middel' ? 'bg-kern-100 text-kern-700' :
                'bg-red-100 text-red-700'
              }`}>
                Risico: {RISK_PROFILE_LABELS[asset.risk_profile]}
              </span>
            )}
            {asset.is_liquid === true && (
              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Liquide</span>
            )}
            {asset.is_liquid === false && (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">Vastgezet</span>
            )}
            {asset.tax_benefit && (
              <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Fiscaal voordeel</span>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">{isEigenHuis ? 'Aankoopprijs' : 'Aankoopwaarde'}</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{purchase > 0 ? formatCurrency(purchase) : '-'}</p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Verwacht rendement</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{Number(asset.expected_return)}% p.j.</p>
            </div>
            {!isEigenHuis && (
              <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
                <p className="text-xs text-[var(--ink-3)]">Maandelijkse inleg</p>
                <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                  {Number(asset.monthly_contribution) > 0 ? formatCurrency(Number(asset.monthly_contribution)) : '-'}
                </p>
              </div>
            )}
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Aankoopdatum</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                {asset.purchase_date
                  ? new Date(asset.purchase_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '-'}
              </p>
            </div>
          </div>

          {/* Hypotheek + overwaarde (eigen woning) */}
          {isEigenHuis && (
            <div className="rounded-[var(--r)] border border-kern-200 bg-kern-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-kern-700/60 uppercase">Hypotheek</p>
              {mortgage ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--ink-2)]">{mortgage.name}</span>
                    <span className="text-sm font-medium text-[var(--ink)]">{formatCurrency(mortgage.balance)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-kern-200/60 pt-2">
                    <span className="text-xs font-medium text-[var(--ink-2)]">Overwaarde</span>
                    {(() => {
                      const overwaarde = value - mortgage.balance
                      return (
                        <span className={`text-sm font-bold ${overwaarde >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(overwaarde)}
                        </span>
                      )
                    })()}
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--ink-3)]">Geen hypotheek gekoppeld. Koppel een hypotheek via De Kern &gt; Schulden.</p>
              )}
            </div>
          )}

          {/* Type-specific details */}
          {(() => {
            const details: { label: string; value: string }[] = []
            if (asset.ticker_symbol) details.push({ label: 'Ticker / ISIN', value: asset.ticker_symbol })
            if (asset.address_postcode || asset.address_house_number) details.push({ label: 'Adres', value: `${asset.address_postcode ?? ''} ${asset.address_house_number ?? ''}`.trim() })
            if (asset.woz_value) details.push({ label: 'WOZ-waarde', value: formatCurrency(Number(asset.woz_value)) })
            if (asset.rental_income) details.push({ label: 'Huurinkomsten p/m', value: formatCurrency(Number(asset.rental_income)) })
            if (asset.retirement_provider_type) details.push({ label: 'Pensioenuitvoerder', value: RETIREMENT_PROVIDER_LABELS[asset.retirement_provider_type] })
            if (asset.depreciation_rate != null && asset.depreciation_rate !== 0) details.push({ label: 'Afschrijving p/j', value: `${asset.depreciation_rate}%` })
            if (asset.lock_end_date) details.push({ label: 'Vastgezet tot', value: new Date(asset.lock_end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) })
            if (details.length === 0) return null
            return (
              <div className="grid grid-cols-2 gap-3">
                {details.map((d) => (
                  <div key={d.label} className="rounded-[var(--r)] bg-kern-50/50 p-3">
                    <p className="text-xs text-kern-700/60">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{d.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {asset.notes && (
            <p className="text-xs text-[var(--ink-3)]">{asset.notes}</p>
          )}

          {/* Valuation history */}
          {valuations && valuations.length > 0 && (
            <ValuationTrendSection valuations={valuations} />
          )}
          {/* No valuation history message */}
          {(!valuations || valuations.length === 0) && (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4 text-center" data-testid="no-valuation-history">
              <p className="text-xs text-[var(--ink-3)]">Nog geen waardehistorie. Gebruik &ldquo;Herwaarderen&rdquo; om de waarde bij te werken.</p>
            </div>
          )}

          {/* Holdings per asset — shown for investment-like asset types */}
          {(['investment', 'crypto', 'savings', 'retirement'] as string[]).includes(asset.asset_type) && (
            <HoldingsList assetId={asset.id} assetName={asset.name} />
          )}
        </div>

        {/* Holdings source-of-truth banner */}
        {hasActiveHoldings && (
          <div className="mx-6 mb-0 mt-2 flex items-start gap-2 rounded-[var(--r)] bg-kern-50 border border-kern-200 px-3 py-2" data-testid="holdings-source-of-truth-banner">
            <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-600" />
            <p className="text-xs text-kern-700">
              <strong>Portfolio tracker actief</strong> ({holdingsCount} holding{holdingsCount !== 1 ? 's' : ''}): de waarde van deze asset wordt automatisch berekend uit de holdings. Handmatig herwaarderen is uitgeschakeld.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          <button
            onClick={hasActiveHoldings ? undefined : onRevalue}
            disabled={hasActiveHoldings}
            title={hasActiveHoldings ? 'Waarde wordt automatisch berekend uit holdings' : undefined}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] border px-3 py-2 text-xs font-medium ${
              hasActiveHoldings
                ? 'border-[var(--border-ed)] text-[var(--ink-3)] cursor-not-allowed bg-[var(--subtle)]'
                : 'border-kern-200 text-kern-700 hover:bg-kern-50'
            }`}
            data-testid="revalue-btn"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Herwaarderen
          </button>
          <button
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Bewerken
          </button>
          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Bevestigen
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Mini sparkline for asset cards ───────────────────────────

function MiniSparkline({
  valuations,
  className = '',
}: {
  valuations: Valuation[]
  className?: string
}) {
  if (valuations.length < 2) return null

  const values = valuations.map(v => Number(v.value))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 64
  const H = 24
  const PAD = 2

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  const trend = values[values.length - 1] >= values[0]
  const strokeColor = trend ? '#059669' : '#dc2626'

  // Create gradient fill
  const fillPoints = [
    `${PAD},${H - PAD}`,
    ...points,
    `${PAD + ((values.length - 1) / (values.length - 1)) * (W - PAD * 2)},${H - PAD}`,
  ]

  return (
    <div className={`shrink-0 ${className}`} data-testid="asset-card-sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} width={64} height={24} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`sparkFill-${trend ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={fillPoints.join(' ')}
          fill={`url(#sparkFill-${trend ? 'up' : 'down'})`}
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {(() => {
          const lastIdx = values.length - 1
          const x = PAD + (lastIdx / (values.length - 1)) * (W - PAD * 2)
          const y = H - PAD - ((values[lastIdx] - min) / range) * (H - PAD * 2)
          return <circle cx={x} cy={y} r="2" fill={strokeColor} />
        })()}
      </svg>
    </div>
  )
}

// ── Valuation trend section for detail modal ─────────────────

function ValuationTrendSection({ valuations }: { valuations: Valuation[] }) {
  const { ref: chartRef, hasEntered: chartEntered } = useInViewAnimation({ duration: 600 })
  const [showAll, setShowAll] = useState(false)
  const INITIAL_SHOW = 10

  const sorted = useMemo(
    () => [...valuations].sort((a, b) => a.valuation_date.localeCompare(b.valuation_date)),
    [valuations],
  )

  // Reverse sorted for history list (newest first)
  const historyList = useMemo(
    () => [...valuations].sort((a, b) => b.valuation_date.localeCompare(a.valuation_date)),
    [valuations],
  )

  const displayedHistory = showAll ? historyList : historyList.slice(0, INITIAL_SHOW)
  const hasMore = historyList.length > INITIAL_SHOW

  // Line chart dimensions
  const W = 380
  const H = 140
  const PAD = { top: 10, right: 10, bottom: 25, left: 55 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const values = sorted.map(v => Number(v.value))
  const min = Math.min(...values) * 0.95
  const max = Math.max(...values) * 1.05
  const range = max - min || 1

  function xPos(i: number) {
    return PAD.left + (sorted.length === 1 ? chartW / 2 : (i / (sorted.length - 1)) * chartW)
  }
  function yPos(val: number) {
    return PAD.top + chartH - ((val - min) / range) * chartH
  }

  const trend = values.length >= 2 && values[values.length - 1] >= values[0]
  const strokeColor = trend ? '#059669' : '#dc2626'
  const fillColor = trend ? '#059669' : '#dc2626'

  // Chart line path
  const linePath = sorted.length === 1
    ? ''
    : `M ${sorted.map((_, i) => `${xPos(i).toFixed(1)} ${yPos(values[i]).toFixed(1)}`).join(' L ')}`

  // Area fill path
  const areaPath = sorted.length === 1
    ? ''
    : `${linePath} L ${xPos(sorted.length - 1).toFixed(1)} ${(PAD.top + chartH).toFixed(1)} L ${xPos(0).toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => min + t * range)

  // X-axis labels (show max 5 labels)
  const labelStep = Math.max(1, Math.floor(sorted.length / 5))

  return (
    <div data-testid="valuation-trend-section">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Waardehistorie ({valuations.length} metingen)</p>

      {/* Line chart */}
      {sorted.length >= 2 ? (
        <div ref={chartRef} className="mb-3 rounded-[var(--r)] bg-[var(--subtle)] p-3" data-testid="valuation-line-chart">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines and Y labels */}
            {yTicks.map((val, i) => (
              <g key={i}>
                <line
                  x1={PAD.left}
                  y1={yPos(val)}
                  x2={W - PAD.right}
                  y2={yPos(val)}
                  stroke="#e4e4e7"
                  strokeWidth="0.5"
                />
                <text x={PAD.left - 6} y={yPos(val) + 3} textAnchor="end" fontSize="7" fill="#a1a1aa">
                  {val >= 1000 ? `€${(val / 1000).toFixed(0)}k` : `€${val.toFixed(0)}`}
                </text>
              </g>
            ))}

            {/* Area fill */}
            <path d={areaPath} fill={fillColor}
              style={{ opacity: chartEntered ? 0.08 : 0, transition: chartEntered ? 'opacity 250ms ease-out 455ms' : 'none' }} />

            {/* Line */}
            <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray={1}
              style={{ strokeDashoffset: chartEntered ? undefined : 1, animation: chartEntered ? 'drawPath 600ms cubic-bezier(.22,1,.36,1) both' : 'none' }} />

            {/* Data points */}
            {sorted.map((v, i) => (
              <circle
                key={v.id}
                cx={xPos(i)}
                cy={yPos(values[i])}
                r={sorted.length <= 20 ? 3 : 2}
                fill={i === sorted.length - 1 ? strokeColor : '#a1a1aa'}
                stroke="white"
                strokeWidth="1"
              />
            ))}

            {/* X-axis date labels */}
            {sorted.filter((_, i) => i % labelStep === 0 || i === sorted.length - 1).map((v, _, arr) => {
              const idx = sorted.indexOf(v)
              return (
                <text
                  key={v.id}
                  x={xPos(idx)}
                  y={H - 4}
                  textAnchor="middle"
                  fontSize="7"
                  fill="#a1a1aa"
                >
                  {new Date(v.valuation_date).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })}
                </text>
              )
            })}
          </svg>

          {/* Trend summary */}
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-[var(--ink-3)]">
              {new Date(sorted[0].valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' — '}
              {new Date(sorted[sorted.length - 1].valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {(() => {
              const first = values[0]
              const last = values[values.length - 1]
              const diff = last - first
              const pct = first > 0 ? ((last - first) / first) * 100 : 0
              return (
                <span className={`font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{formatCurrency(diff)} ({diff >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                </span>
              )
            })()}
          </div>
        </div>
      ) : sorted.length === 1 ? (
        <div className="mb-3 rounded-[var(--r)] bg-[var(--subtle)] p-3 text-center" data-testid="valuation-single-point">
          <p className="text-xs text-[var(--ink-3)]">
            {formatCurrency(Number(sorted[0].value))} op{' '}
            {new Date(sorted[0].valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="mt-1 text-[10px] text-[var(--ink-3)]">Voeg meer waarderingen toe voor een trendgrafiek.</p>
        </div>
      ) : null}

      {/* History list — full history, no limit */}
      <div className="space-y-1" data-testid="valuation-history-list">
        {displayedHistory.map((v) => {
          // Find previous valuation in chronological order
          const chronIdx = sorted.findIndex(s => s.id === v.id)
          const prev = chronIdx > 0 ? sorted[chronIdx - 1] : null
          const diff = prev ? Number(v.value) - Number(prev.value) : null
          return (
            <div key={v.id} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-[var(--ink-3)]">
                {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })}
              </span>
              <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(v.value))}</span>
              {diff !== null && (
                <span className={`text-[10px] font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                </span>
              )}
              {v.notes && (
                <span className="truncate text-[10px] text-[var(--ink-3)]">{v.notes}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Show more/less button */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-[var(--r)] py-1.5 text-xs font-medium text-kern-600 hover:bg-kern-50/50"
          data-testid="valuation-show-more"
        >
          {showAll ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Toon minder
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Toon alle {historyList.length} waarderingen
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ── Holdings list for asset detail modal ─────────────────────

type AssetHolding = {
  id: string
  user_id: string
  asset_id: string | null
  ticker: string | null
  isin: string | null
  name: string
  units: number
  avg_purchase_price: number
  current_price: number | null
  last_price_update: string | null
  purchase_date: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

function HoldingsList({ assetId, assetName }: { assetId: string; assetName: string }) {
  const [holdings, setHoldings] = useState<AssetHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editHolding, setEditHolding] = useState<AssetHolding | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTicker, setFormTicker] = useState('')
  const [formIsin, setFormIsin] = useState('')
  const [formUnits, setFormUnits] = useState('')
  const [formAvgPrice, setFormAvgPrice] = useState('')
  const [formPurchaseDate, setFormPurchaseDate] = useState('')

  const loadHoldings = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/holdings?asset_id=${assetId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHoldings(data.holdings || [])
    } catch {
      setError('Kon holdings niet laden')
    } finally {
      setLoading(false)
    }
  }, [assetId])

  useEffect(() => {
    loadHoldings()
  }, [loadHoldings])

  function resetForm() {
    setFormName('')
    setFormTicker('')
    setFormIsin('')
    setFormUnits('')
    setFormAvgPrice('')
    setFormPurchaseDate('')
    setFormError(null)
  }

  function openEditForm(h: AssetHolding) {
    setEditHolding(h)
    setFormName(h.name)
    setFormTicker(h.ticker || '')
    setFormIsin(h.isin || '')
    setFormUnits(String(h.units))
    setFormAvgPrice(String(h.avg_purchase_price))
    setFormPurchaseDate(h.purchase_date || '')
    setFormError(null)
    setShowForm(true)
  }

  function openCreateForm() {
    setEditHolding(null)
    resetForm()
    setShowForm(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      setFormError('Naam is verplicht')
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      if (editHolding) {
        // UPDATE
        const res = await fetch('/api/holdings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editHolding.id,
            name: formName.trim(),
            ticker: formTicker.trim() || null,
            units: Number(formUnits) || 1,
            avg_purchase_price: Number(formAvgPrice) || 0,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
      } else {
        // CREATE
        const res = await fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset_id: assetId,
            name: formName.trim(),
            ticker: formTicker.trim() || null,
            isin: formIsin.trim() || null,
            units: Number(formUnits) || 1,
            avg_purchase_price: Number(formAvgPrice) || 0,
            current_price: Number(formAvgPrice) || 0,
            purchase_date: formPurchaseDate || null,
            force_duplicate: true, // Allow same ticker on different assets
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || data.message || `HTTP ${res.status}`)
        }
      }

      setShowForm(false)
      setEditHolding(null)
      resetForm()
      loadHoldings()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (deleting) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/holdings?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Verwijderen mislukt')
      setHoldings((prev) => prev.filter((h) => h.id !== id))
      setDeleteConfirm(null)
    } catch {
      setError('Kon holding niet verwijderen')
    } finally {
      setDeleting(null)
    }
  }

  const totalValue = holdings.reduce((sum, h) => {
    const price = h.current_price ?? h.avg_purchase_price
    return sum + price * h.units
  }, 0)

  const totalCost = holdings.reduce((sum, h) => {
    return sum + h.avg_purchase_price * h.units
  }, 0)

  return (
    <div data-testid="holdings-list-section">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-[var(--r)] bg-kern-50/50 px-3 py-2 text-left hover:bg-kern-50"
        data-testid="holdings-toggle"
      >
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-kern-600" />
          <span className="text-xs font-semibold text-[var(--ink-2)]">
            Holdings ({loading ? '…' : holdings.length})
          </span>
          {!loading && holdings.length > 0 && (
            <span className="text-xs text-[var(--ink-3)]">
              — {formatCurrency(totalValue)}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2" data-testid="holdings-list-expanded">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-kern-500" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-[var(--r)] bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {!loading && holdings.length === 0 && !showForm && (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4 text-center" data-testid="no-holdings">
              <p className="text-xs text-[var(--ink-3)]">Nog geen holdings voor dit vermogensobject.</p>
              <button
                onClick={openCreateForm}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-kern-600 hover:text-kern-700"
                data-testid="add-first-holding-btn"
              >
                <Plus className="h-3 w-3" />
                Eerste holding toevoegen
              </button>
            </div>
          )}

          {/* Holdings list */}
          {!loading && holdings.length > 0 && (
            <div className="space-y-1.5">
              {holdings.map((h) => {
                const price = h.current_price ?? h.avg_purchase_price
                const value = price * h.units
                const cost = h.avg_purchase_price * h.units
                const returnPct = cost > 0 ? ((value - cost) / cost) * 100 : 0

                return (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
                    data-testid={`holding-item-${h.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-[var(--ink)] truncate">{h.name}</span>
                        {h.ticker && (
                          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-[var(--ink-3)]">
                            {h.ticker}
                          </span>
                        )}
                        {h.isin && !h.ticker && (
                          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-[var(--ink-3)]">
                            {h.isin}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--ink-3)]">
                        <span>{h.units} eenheden</span>
                        <span>·</span>
                        <span>Gem. {formatCurrency(h.avg_purchase_price)}</span>
                        {h.purchase_date && (
                          <>
                            <span>·</span>
                            <span>{new Date(h.purchase_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-medium text-[var(--ink)]">{formatCurrency(value)}</p>
                        <p className={`text-[10px] ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditForm(h) }}
                          className="rounded p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
                          title="Bewerken"
                          data-testid={`edit-holding-${h.id}`}
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        {deleteConfirm === h.id ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(h.id) }}
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            disabled={deleting === h.id}
                            data-testid={`confirm-delete-holding-${h.id}`}
                          >
                            {deleting === h.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <span className="text-[10px] font-medium">Ja</span>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(h.id) }}
                            className="rounded p-1 text-[var(--ink-3)] hover:bg-red-50 hover:text-red-600"
                            title="Verwijderen"
                            data-testid={`delete-holding-${h.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Summary row */}
              <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-1.5 px-3">
                <span className="text-[10px] font-medium text-[var(--ink-3)]">Totaal</span>
                <div className="text-right">
                  <span className="text-xs font-semibold text-[var(--ink)]">{formatCurrency(totalValue)}</span>
                  {totalCost > 0 && (
                    <span className={`ml-1.5 text-[10px] ${totalValue >= totalCost ? 'text-emerald-600' : 'text-red-600'}`}>
                      ({totalValue >= totalCost ? '+' : ''}{((totalValue - totalCost) / totalCost * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Add holding button */}
              <button
                onClick={openCreateForm}
                className="flex w-full items-center justify-center gap-1 rounded-[var(--r)] border border-dashed border-kern-200 py-1.5 text-xs font-medium text-kern-600 hover:bg-kern-50"
                data-testid="add-holding-btn"
              >
                <Plus className="h-3 w-3" />
                Holding toevoegen
              </button>
            </div>
          )}

          {/* Create / Edit form */}
          {showForm && (
            <div className="rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 space-y-2" data-testid="holding-form">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--ink-2)]">
                  {editHolding ? 'Holding bewerken' : 'Nieuwe holding'}
                </h4>
                <button
                  onClick={() => { setShowForm(false); setEditHolding(null); resetForm() }}
                  className="rounded p-0.5 text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Naam *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="bijv. Vanguard FTSE All-World"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-name-input"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Ticker</label>
                  <input
                    type="text"
                    value={formTicker}
                    onChange={(e) => setFormTicker(e.target.value.toUpperCase())}
                    placeholder="bijv. VWRL"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-ticker-input"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">ISIN</label>
                  <input
                    type="text"
                    value={formIsin}
                    onChange={(e) => setFormIsin(e.target.value.toUpperCase())}
                    placeholder="bijv. IE00B3RBWM25"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-isin-input"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Eenheden</label>
                  <input
                    type="number"
                    value={formUnits}
                    onChange={(e) => setFormUnits(e.target.value)}
                    placeholder="bijv. 50"
                    step="any"
                    min="0"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-units-input"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Gem. aankoopprijs (€)</label>
                  <input
                    type="number"
                    value={formAvgPrice}
                    onChange={(e) => setFormAvgPrice(e.target.value)}
                    placeholder="bijv. 80.00"
                    step="0.01"
                    min="0"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-avg-price-input"
                  />
                </div>
                {!editHolding && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-[var(--ink-3)]">Aankoopdatum</label>
                    <input
                      type="date"
                      value={formPurchaseDate}
                      onChange={(e) => setFormPurchaseDate(e.target.value)}
                      className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                      data-testid="holding-purchase-date-input"
                    />
                  </div>
                )}
              </div>

              {formError && (
                <div className="flex items-center gap-1 text-[10px] text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setShowForm(false); setEditHolding(null); resetForm() }}
                  className="rounded px-3 py-1 text-xs text-[var(--ink-3)] hover:bg-zinc-100"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="inline-flex items-center gap-1 rounded bg-kern-600 px-3 py-1 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                  data-testid="holding-save-btn"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  {editHolding ? 'Opslaan' : 'Toevoegen'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Allocation pie chart (SVG donut) ─────────────────────────

function AllocationPie({
  byType,
  total,
  dailyExpenses,
}: {
  byType: Record<AssetType, { assets: Asset[]; total: number }>
  total: number
  dailyExpenses: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = 45
  const strokeWidth = 22

  const segments: { type: string; pct: number; color: string }[] = []
  for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
    const pct = total > 0 ? byType[type].total / total : 0
    if (pct > 0) segments.push({ type, pct, color: ASSET_TYPE_COLORS[type] })
  }

  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div ref={ref} className="shrink-0">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const dash = seg.pct * circumference
        const gap = circumference - dash
        const currentOffset = offset
        offset += dash

        return (
          <circle
            key={seg.type}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={hasEntered ? `${dash} ${gap}` : `0 ${circumference}`}
            strokeDashoffset={-currentOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: hasEntered ? `stroke-dasharray 600ms cubic-bezier(.22,1,.36,1) ${i * 80}ms` : 'none' }}
          />
        )
      })}
      <text x={cx} y={dailyExpenses > 0 && total > 0 ? cy - 10 : cy - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#18181b">
        {formatCurrency(total)}
      </text>
      {dailyExpenses > 0 && total > 0 ? (
        <>
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="7" fill="#d97706" data-testid="donut-freedom">
            {formatFreedomTimeString(calculateFreedomTime(total, dailyExpenses), 'short', false)}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="7" fill="#a1a1aa">
            vrijheid
          </text>
        </>
      ) : (
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#a1a1aa">
          totaal
        </text>
      )}
    </svg>
    </div>
  )
}

// ── Projection chart ─────────────────────────────────────────

function ProjectionChart({
  data,
  currentValue,
}: {
  data: ReturnType<typeof projectPortfolio>
  currentValue: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  if (data.length === 0) return <div className="flex h-40 items-center justify-center text-xs text-[var(--ink-3)]">Geen data</div>

  const w = 400
  const h = 160
  const pad = { top: 10, right: 10, bottom: 25, left: 50 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const maxVal = Math.max(...data.map((d) => d.total), currentValue) * 1.05
  const maxMonth = data.length

  const step = Math.max(1, Math.floor(maxMonth / 60))
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  function x(month: number) { return pad.left + (month / maxMonth) * chartW }
  function y(val: number) { return pad.top + chartH - (val / maxVal) * chartH }

  const areaPath = `M ${x(0).toFixed(1)} ${y(currentValue).toFixed(1)} ` +
    sampled.map((d) => `L ${x(d.month).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ') +
    ` L ${x(maxMonth).toFixed(1)} ${(pad.top + chartH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.top + chartH).toFixed(1)} Z`

  const linePath = `M ${x(0).toFixed(1)} ${y(currentValue).toFixed(1)} ` +
    sampled.map((d) => `L ${x(d.month).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t))

  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-auto w-full" preserveAspectRatio="xMidYMid meet" data-testid="projection-area-chart">
      {yTicks.map((val) => (
        <g key={val}>
          <line x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)} stroke="#f4f4f5" strokeWidth="0.5" />
          <text x={pad.left - 6} y={y(val) + 3} textAnchor="end" fontSize="7" fill="#a1a1aa">
            {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
          </text>
        </g>
      ))}

      <line
        x1={pad.left} y1={y(currentValue)} x2={w - pad.right} y2={y(currentValue)}
        stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="3 3"
      />

      <path d={areaPath} fill="#10b981"
        style={{ opacity: hasEntered ? 0.12 : 0, transition: hasEntered ? 'opacity 250ms ease-out 455ms' : 'none' }} />
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth="1.5"
        pathLength={1} strokeDasharray={1}
        style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: hasEntered ? 'drawPath 600ms cubic-bezier(.22,1,.36,1) both' : 'none' }} />

      {sampled.filter((_, i) => i % Math.max(1, Math.floor(sampled.length / 5)) === 0).map((d) => (
        <text key={d.month} x={x(d.month)} y={h - 5} textAnchor="middle" fontSize="7" fill="#a1a1aa">
          {d.month >= 12 ? `${Math.floor(d.month / 12)}j` : `${d.month}m`}
        </text>
      ))}
    </svg>
    </div>
  )
}

// ── Asset form modal ─────────────────────────────────────────

function AssetForm({
  asset,
  defaultType,
  linkedBankAccounts,
  onClose,
  onSaved,
}: {
  asset?: Asset
  defaultType?: AssetType
  linkedBankAccounts: Map<string, { id: string; linked_asset_id: string }>
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!asset
  const [hasActiveHoldings, setHasActiveHoldings] = useState(false)
  const [holdingsCount, setHoldingsCount] = useState(0)

  const [name, setName] = useState(asset?.name ?? '')
  const [assetType, setAssetType] = useState<AssetType>(asset?.asset_type ?? defaultType ?? 'savings')
  const [hasBudgetTracking, setHasBudgetTracking] = useState(asset?.has_budget_tracking ?? false)
  const [iban, setIban] = useState(asset?.account_number ?? '')
  const [currentValue, setCurrentValue] = useState(String(asset?.current_value ?? ''))
  const [purchaseValue, setPurchaseValue] = useState(String(asset?.purchase_value ?? ''))

  // Check if editing an asset with active holdings
  useEffect(() => {
    if (isEdit && asset && ['investment', 'crypto', 'savings', 'retirement'].includes(asset.asset_type)) {
      fetch(`/api/assets/has-holdings?asset_id=${asset.id}`)
        .then(res => res.json())
        .then(data => {
          setHasActiveHoldings(data.has_holdings === true)
          setHoldingsCount(data.holdings_count || 0)
        })
        .catch(() => { /* non-critical */ })
    }
  }, [isEdit, asset])
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? '')
  const [expectedReturn, setExpectedReturn] = useState(String(asset?.expected_return ?? TYPICAL_RETURNS.savings))
  const [monthlyContribution, setMonthlyContribution] = useState(String(asset?.monthly_contribution ?? '0'))
  const [institution, setInstitution] = useState(asset?.institution ?? '')
  const [notes, setNotes] = useState(asset?.notes ?? '')
  const [netWorthInclusionPct, setNetWorthInclusionPct] = useState(asset?.net_worth_inclusion_pct ?? 100)
  const [saving, setSaving] = useState(false)
  // Type-specific state
  const [subtype, setSubtype] = useState(asset?.subtype ?? '')
  const [riskProfile, setRiskProfile] = useState<string>(asset?.risk_profile ?? '')
  const [taxBenefit, setTaxBenefit] = useState(asset?.tax_benefit ?? false)
  const [isLiquid, setIsLiquid] = useState(asset?.is_liquid ?? true)
  const [lockEndDate, setLockEndDate] = useState(asset?.lock_end_date ?? '')
  const [tickerSymbol, setTickerSymbol] = useState(asset?.ticker_symbol ?? '')
  const [rentalIncome, setRentalIncome] = useState(String(asset?.rental_income ?? ''))
  const [wozValue, setWozValue] = useState(String(asset?.woz_value ?? ''))
  const [retirementProviderType, setRetirementProviderType] = useState(asset?.retirement_provider_type ?? '')
  const [depreciationRate, setDepreciationRate] = useState(String(asset?.depreciation_rate ?? ''))
  const [addressPostcode, setAddressPostcode] = useState(asset?.address_postcode ?? '')
  const [addressHouseNumber, setAddressHouseNumber] = useState(asset?.address_house_number ?? '')
  const [wozLoading, setWozLoading] = useState(false)
  const [wozResult, setWozResult] = useState<{ peildatum: string; waarde: number }[] | null>(null)
  const [wozError, setWozError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(asset?.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()

  const subtypeOptions = ASSET_SUBTYPE_LABELS[assetType]
  const visibleFields = ASSET_TYPE_FIELDS[assetType]

  function handleTypeChange(type: AssetType) {
    setAssetType(type)
    setSubtype('')
    if (!isEdit) {
      setExpectedReturn(String(TYPICAL_RETURNS[type]))
      setRiskProfile('')
      setTaxBenefit(false)
      setIsLiquid(true)
    }
  }

  function handleSubtypeChange(st: string) {
    setSubtype(st)
    if (!isEdit && st) {
      const defaults = ASSET_SUBTYPE_DEFAULTS[st]
      if (defaults) {
        if (defaults.expected_return !== undefined) setExpectedReturn(String(defaults.expected_return))
        if (defaults.risk_profile) setRiskProfile(defaults.risk_profile)
        if (defaults.is_liquid !== undefined) setIsLiquid(defaults.is_liquid)
        if (defaults.tax_benefit !== undefined) setTaxBenefit(defaults.tax_benefit)
      }
    }
  }

  async function handleWozLookup() {
    if (!addressPostcode || !addressHouseNumber) return
    setWozLoading(true)
    setWozError(null)
    setWozResult(null)

    try {
      const supabase = createClient()

      const { data, error } = await supabase.functions.invoke('woz-lookup', {
        body: { postcode: addressPostcode, house_number: addressHouseNumber },
      })

      if (error) {
        // Extract actual error from response body if available
        let msg = 'WOZ-waarde kon niet worden opgehaald'
        try {
          const body = await (error as { context?: Response }).context?.json()
          if (body?.error) msg = body.error
        } catch { /* ignore parse errors */ }
        throw new Error(msg)
      }
      if (data.woz_values && data.woz_values.length > 0) {
        setWozResult(data.woz_values)
        // Auto-fill with most recent value
        setWozValue(String(data.woz_values[0].waarde))
      } else {
        setWozError(data.error || 'Geen WOZ-waarden gevonden voor dit adres')
      }
    } catch (err) {
      setWozError(err instanceof Error ? err.message : 'WOZ-waarde kon niet worden opgehaald')
    } finally {
      setWozLoading(false)
    }
  }

  async function handleSave() {
    if (!name || !currentValue) return
    setValidationError(null)

    // Validate no negative monetary values
    const numCurrentValue = Number(currentValue)
    const numPurchaseValue = Number(purchaseValue)
    const numMonthlyContribution = Number(monthlyContribution)

    if (numCurrentValue < 0) {
      setValidationError('Waarde mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (purchaseValue && numPurchaseValue < 0) {
      setValidationError('Aankoopwaarde mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (monthlyContribution && numMonthlyContribution < 0) {
      setValidationError('Maandelijkse inleg mag niet negatief zijn.')
      return
    }

    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const isCashType = assetType === 'cash'

    const row = {
      user_id: user.id,
      name,
      asset_type: assetType,
      current_value: Number(currentValue) || 0,
      purchase_value: isCashType ? Number(currentValue) || 0 : Number(purchaseValue) || 0,
      purchase_date: isCashType ? null : purchaseDate || null,
      expected_return: isCashType ? 0 : Number(expectedReturn) || 0,
      monthly_contribution: isCashType ? 0 : Number(monthlyContribution) || 0,
      institution: institution || null,
      account_number: isCashType ? (iban || null) : null,
      notes: notes || null,
      // Type-specific fields
      subtype: subtype || null,
      risk_profile: riskProfile || null,
      tax_benefit: visibleFields.includes('tax_benefit') ? taxBenefit : null,
      is_liquid: isCashType ? true : (visibleFields.includes('is_liquid') ? isLiquid : null),
      lock_end_date: lockEndDate || null,
      ticker_symbol: tickerSymbol || null,
      rental_income: rentalIncome ? Number(rentalIncome) : null,
      woz_value: wozValue ? Number(wozValue) : null,
      retirement_provider_type: retirementProviderType || null,
      depreciation_rate: depreciationRate ? Number(depreciationRate) : null,
      address_postcode: addressPostcode || null,
      address_house_number: addressHouseNumber || null,
      // Household fields
      ownership: ownership,
      household_id: ownership === 'shared' ? householdId : null,
      // Net worth inclusion
      net_worth_inclusion_pct: netWorthInclusionPct,
      // Budget tracking
      has_budget_tracking: isCashType ? hasBudgetTracking : false,
    }

    let assetId: string | undefined

    if (isEdit && asset) {
      await supabase.from('assets').update(row).eq('id', asset.id)
      assetId = asset.id

      // Auto-track valuation when current_value changes
      const newValue = Number(currentValue) || 0
      const oldValue = Number(asset.current_value)
      if (newValue !== oldValue && newValue > 0) {
        await supabase.from('valuations').upsert({
          user_id: user.id,
          entity_type: 'asset',
          entity_id: asset.id,
          valuation_date: new Date().toISOString().split('T')[0],
          value: newValue,
          notes: `Waarde bijgewerkt van ${oldValue} naar ${newValue}`,
        }, { onConflict: 'entity_id,valuation_date' })
      }
    } else {
      const { data: inserted } = await supabase.from('assets').insert(row).select('id').single()
      assetId = inserted?.id
    }

    // Create or sync linked bank_account for cash with budget tracking
    if (isCashType && hasBudgetTracking && assetId) {
      const { data: existingBA } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('linked_asset_id', assetId)
        .maybeSingle()

      if (!existingBA) {
        await supabase.from('bank_accounts').insert({
          user_id: user.id,
          name,
          iban: iban || null,
          bank_name: institution || null,
          account_type: subtype || 'checking',
          balance: Number(currentValue) || 0,
          linked_asset_id: assetId,
          ownership,
          household_id: ownership === 'shared' ? householdId : null,
        })
      } else {
        await supabase.from('bank_accounts').update({
          name,
          iban: iban || null,
          bank_name: institution || null,
          account_type: subtype || 'checking',
          balance: Number(currentValue) || 0,
        }).eq('id', existingBA.id)
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--ink)]">
            {isEdit ? 'Asset bewerken' : 'Nieuwe asset'}
          </h3>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="Spaarrekening"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
              <select
                value={assetType}
                onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              >
                {Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ownership toggle */}
          <OwnershipToggle
            value={ownership}
            onChange={setOwnership}
            hasHousehold={hasHousehold}
          />

          {/* Subtype dropdown (conditional) */}
          {subtypeOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Subtype</label>
              <select
                value={subtype}
                onChange={(e) => handleSubtypeChange(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              >
                <option value="">Selecteer subtype...</option>
                {Object.entries(subtypeOptions).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Warning when holdings are active */}
          {hasActiveHoldings && (
            <div className="flex items-start gap-2 rounded-[var(--r)] bg-kern-50 border border-kern-200 px-3 py-2" data-testid="asset-form-holdings-warning">
              <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-600" />
              <p className="text-xs text-kern-700">
                Deze asset heeft {holdingsCount} actieve holding{holdingsCount !== 1 ? 's' : ''}. De waarde wordt automatisch berekend uit de portfolio tracker. Het veld &ldquo;Huidige waarde&rdquo; kan niet handmatig worden gewijzigd.
              </p>
            </div>
          )}

          {/* Cash-specific: IBAN + Bank name */}
          {assetType === 'cash' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">IBAN</label>
                <input
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase())}
                  className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm uppercase"
                  placeholder="NL12 INGB 0001 2345 67"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Bank</label>
                <input
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  placeholder="ING, ABN AMRO, Rabobank..."
                />
              </div>
            </div>
          )}

          {/* Value fields */}
          {assetType === 'cash' ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidig saldo</label>
              <input
                type="number"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {assetType === 'eigen_huis' ? 'Marktwaarde' : 'Huidige waarde'}
                  </label>
                  <input
                    type="number"
                    value={currentValue}
                    onChange={(e) => !hasActiveHoldings && setCurrentValue(e.target.value)}
                    readOnly={hasActiveHoldings}
                    className={`w-full rounded-[var(--r)] border px-3 py-2 text-sm ${
                      hasActiveHoldings
                        ? 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-3)] cursor-not-allowed'
                        : 'border-[var(--border-ed)]'
                    }`}
                    title={hasActiveHoldings ? 'Waarde wordt automatisch berekend uit holdings' : undefined}
                  />
                  {hasActiveHoldings && (
                    <p className="mt-1 text-[10px] text-kern-600">Automatisch gesynchroniseerd vanuit holdings</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {assetType === 'eigen_huis' ? 'Aankoopprijs' : 'Aankoopwaarde'}
                  </label>
                  <input
                    type="number"
                    value={purchaseValue}
                    onChange={(e) => setPurchaseValue(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className={`grid ${assetType === 'eigen_huis' ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Rendement (% p.j.)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  />
                </div>
                {assetType !== 'eigen_huis' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Inleg p/m</label>
                    <input
                      type="number"
                      value={monthlyContribution}
                      onChange={(e) => setMonthlyContribution(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aankoopdatum</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {assetType !== 'eigen_huis' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Instelling</label>
                  <input
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                    placeholder="ABN AMRO, DEGIRO, ABP..."
                  />
                </div>
              )}
            </>
          )}

          {/* Budget tracking toggle (cash only) */}
          {assetType === 'cash' && (
            <label className="flex items-start gap-3 rounded-[var(--r)] border border-emerald-200 bg-emerald-50/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasBudgetTracking}
                onChange={(e) => setHasBudgetTracking(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-md)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--ink)]">Budgetten & transacties</span>
                <p className="text-xs text-[var(--ink-3)]">
                  Schakel in om transacties te importeren, budgetcategorieën te koppelen, en cashflow te voorspellen.
                </p>
              </div>
            </label>
          )}

          {/* Type-specific fields */}
          {visibleFields.length > 0 && visibleFields.some((f) => f !== 'subtype') && (
            <div className="space-y-3 rounded-[var(--r)] border border-kern-100 bg-kern-50/30 p-3">
              <p className="text-xs font-semibold text-kern-700/60 uppercase">Details</p>
              <div className="grid grid-cols-2 gap-3">
                {visibleFields.includes('risk_profile') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Risicoprofiel</label>
                    <select
                      value={riskProfile}
                      onChange={(e) => setRiskProfile(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {Object.entries(RISK_PROFILE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('ticker_symbol') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Ticker / ISIN</label>
                    <input
                      value={tickerSymbol}
                      onChange={(e) => setTickerSymbol(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      placeholder="VWRL, IWDA..."
                    />
                  </div>
                )}
                {visibleFields.includes('is_liquid') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={isLiquid}
                      onChange={(e) => setIsLiquid(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    Direct opneembaar
                  </label>
                )}
                {visibleFields.includes('lock_end_date') && !isLiquid && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Vastgezet tot</label>
                    <input
                      type="date"
                      value={lockEndDate}
                      onChange={(e) => setLockEndDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('tax_benefit') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={taxBenefit}
                      onChange={(e) => setTaxBenefit(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    Fiscaal voordeel
                  </label>
                )}
                {visibleFields.includes('retirement_provider_type') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Pensioenuitvoerder</label>
                    <select
                      value={retirementProviderType}
                      onChange={(e) => setRetirementProviderType(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {Object.entries(RETIREMENT_PROVIDER_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('address_postcode') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Postcode</label>
                    <input
                      value={addressPostcode}
                      onChange={(e) => setAddressPostcode(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      placeholder="1234 AB"
                    />
                  </div>
                )}
                {visibleFields.includes('address_house_number') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huisnummer</label>
                    <div className="flex gap-2">
                      <input
                        value={addressHouseNumber}
                        onChange={(e) => setAddressHouseNumber(e.target.value)}
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                        placeholder="42"
                      />
                      <button
                        type="button"
                        onClick={handleWozLookup}
                        disabled={wozLoading || !addressPostcode || !addressHouseNumber}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                      >
                        {wozLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        WOZ
                      </button>
                    </div>
                  </div>
                )}
                {wozResult && (
                  <div className="col-span-2 rounded-[var(--r)] border border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="mb-2 text-xs font-semibold text-emerald-700">WOZ-waarden gevonden</p>
                    <div className="space-y-1">
                      {wozResult.map((w) => (
                        <div key={w.peildatum} className="flex items-center justify-between text-xs">
                          <span className="text-[var(--ink-2)]">{new Date(w.peildatum).toLocaleDateString('nl-NL', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          <span className="font-medium text-[var(--ink)]">{formatCurrency(w.waarde)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {wozError && (
                  <div className="col-span-2 rounded-[var(--r)] border border-red-200 bg-red-50/50 p-2">
                    <p className="text-xs text-red-600">{wozError}</p>
                  </div>
                )}
                {visibleFields.includes('rental_income') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huurinkomsten p/m</label>
                    <input
                      type="number"
                      value={rentalIncome}
                      onChange={(e) => setRentalIncome(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('woz_value') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">WOZ-waarde</label>
                    <input
                      type="number"
                      value={wozValue}
                      onChange={(e) => setWozValue(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('depreciation_rate') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Afschrijving (% p.j.)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={depreciationRate}
                      onChange={(e) => setDepreciationRate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Opnemen in netto vermogen
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={5}
                value={netWorthInclusionPct}
                onChange={(e) => setNetWorthInclusionPct(Number(e.target.value))}
                className="flex-1 accent-kern-600"
              />
              <input
                type="number" min={0} max={100}
                value={netWorthInclusionPct}
                onChange={(e) => setNetWorthInclusionPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-16 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1.5 text-sm text-center tabular-nums"
              />
              <span className="text-sm text-[var(--ink-3)]">%</span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              Stel in welk percentage van deze asset in het netto vermogen wordt meegeteld.
            </p>
            {netWorthInclusionPct < 100 && Number(currentValue) > 0 && (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-kern-600">
                Effectieve waarde: {formatCurrency(Number(currentValue) * netWorthInclusionPct / 100)}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        {validationError && (
          <div className="mt-3 rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" data-testid="asset-validation-error">
            {validationError}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !currentValue}
            className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : isEdit ? 'Bijwerken' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared types & components for valuations ─────────────────

type Valuation = {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  valuation_date: string
  value: number
  notes: string | null
  created_at: string
}

function ValuationModal({
  entityId,
  entityType,
  entityName,
  currentValue,
  onClose,
  onSaved,
}: {
  entityId: string
  entityType: 'asset' | 'debt'
  entityName: string
  currentValue: number
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [value, setValue] = useState(String(currentValue))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [hasActiveHoldings, setHasActiveHoldings] = useState(false)
  const [holdingsCount, setHoldingsCount] = useState(0)

  // Check if asset has active holdings (blocks manual revaluation)
  useEffect(() => {
    if (entityType === 'asset') {
      fetch(`/api/assets/has-holdings?asset_id=${entityId}`)
        .then(res => res.json())
        .then(data => {
          setHasActiveHoldings(data.has_holdings === true)
          setHoldingsCount(data.holdings_count || 0)
        })
        .catch(() => { /* non-critical */ })
    }
  }, [entityId, entityType])

  async function handleSave() {
    if (!value || hasActiveHoldings) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Insert valuation record
    const { error: valError } = await supabase.from('valuations').upsert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      valuation_date: date,
      value: Number(value),
      notes: notes || null,
    }, { onConflict: 'entity_id,valuation_date' })

    if (valError) {
      console.error('Valuation error:', valError)
      setSaving(false)
      return
    }

    // Update the entity's current value
    const table = entityType === 'asset' ? 'assets' : 'debts'
    const column = entityType === 'asset' ? 'current_value' : 'current_balance'
    await supabase.from(table).update({ [column]: Number(value) }).eq('id', entityId)

    setSaving(false)
    onSaved()
  }

  const label = entityType === 'asset' ? 'Herwaarderen' : 'Saldo bijwerken'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--ink)]">{label}</h3>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-[var(--ink-3)]">{entityName}</p>

        {/* Warning when holdings are active */}
        {hasActiveHoldings && (
          <div className="mb-4 flex items-start gap-2 rounded-[var(--r)] bg-kern-50 border border-kern-200 px-3 py-2" data-testid="valuation-holdings-warning">
            <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-600" />
            <p className="text-xs text-kern-700">
              Deze asset heeft {holdingsCount} actieve holding{holdingsCount !== 1 ? 's' : ''}. De waarde wordt automatisch berekend uit de portfolio tracker. Handmatig herwaarderen is niet mogelijk.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              {entityType === 'asset' ? 'Nieuwe waarde' : 'Nieuw saldo'}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Huidige waarde: {formatCurrency(currentValue)}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notitie (optioneel)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="Reden van waardewijziging..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ValuationHistory({
  entityId,
  valuations,
  onLoad,
}: {
  entityId: string
  valuations: Valuation[] | undefined
  onLoad: () => void
}) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) {
      setLoaded(true)
      onLoad()
    }
  }, [loaded, onLoad])

  if (!valuations || valuations.length === 0) return null

  return (
    <div className="mt-4 border-t border-[var(--border-ed)] pt-3">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Waardehistorie</p>
      <div className="space-y-1">
        {valuations.map((v) => {
          const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
          const diff = prev ? Number(v.value) - Number(prev.value) : null
          return (
            <div key={v.id} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-[var(--ink-3)]">
                {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(v.value))}</span>
              {diff !== null && (
                <span className={`text-[10px] font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                </span>
              )}
              {v.notes && (
                <span className="truncate text-[var(--ink-3)]">{v.notes}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
