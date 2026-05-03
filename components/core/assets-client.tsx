'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import {
  Plus, Trash2, Edit3, X, TrendingUp, RefreshCw, Search, Loader2, BarChart3, ChevronDown, ChevronUp, Briefcase, AlertCircle, AlertTriangle, LinkIcon, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { Kicker } from '@/components/editorial'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { OwnershipToggle, OwnershipBadge, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { usePartnerPrivacy, filterPartnerItems, PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
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
  projectPortfolio,
} from '@/lib/asset-data'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { EmptyState as QuickAddEmptyState } from '@/components/app/quick-add-wizard/empty-state'
import { AssetEditConnectionSection } from './asset-edit-connection-section'
import { CryptoHoldingCard } from '@/components/holdings/crypto-holding-card'
import { InvestmentHoldingCard } from '@/components/holdings/investment-holding-card'
import type { AssetsPageData } from '@/lib/assets-data-loader'

type Mortgage = { id: string; name: string; current_balance: number; linked_asset_id: string | null }

export default function AssetsPage({ initialAssetId, initialData }: { initialAssetId?: string; initialData?: AssetsPageData } = {}) {
  const router = useRouter()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [assets, setAssets] = useState<Asset[]>(() => {
    if (!initialData) return []
    const rawAssets = initialData.assets as unknown as Asset[]
    // Sync cash asset values with bank_account balances (bank_account is more up-to-date)
    if (initialData.linkedBankAccounts.length > 0) {
      const balanceMap = new Map(initialData.linkedBankAccounts.map(ba => [ba.linked_asset_id, Number(ba.balance)]))
      return rawAssets.map(a => {
        if (a.asset_type === 'cash' && balanceMap.has(a.id)) {
          return { ...a, current_value: balanceMap.get(a.id)! }
        }
        return a
      })
    }
    return rawAssets
  })
  const [mortgages, setMortgages] = useState<Mortgage[]>(initialData?.mortgages ?? [])
  const [linkedBankAccounts, setLinkedBankAccounts] = useState<Map<string, { id: string; linked_asset_id: string }>>(
    initialData
      ? new Map(initialData.linkedBankAccounts.map(ba => [ba.linked_asset_id, ba]))
      : new Map()
  )
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newAssetType, setNewAssetType] = useState<AssetType | null>(null)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [modalStep, setModalStep] = useState<'detail' | 'edit' | 'revalue'>('detail')
  const [projectionYears, setProjectionYears] = useState(10)
  const [insightOpen, setInsightOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('collapsible_assets-insight')
      if (stored !== null) return stored === 'true'
    }
    return false
  })
  const toggleInsight = () => {
    const next = !insightOpen
    setInsightOpen(next)
    try { localStorage.setItem('collapsible_assets-insight', String(next)) } catch { /* */ }
  }
  const [valuations, setValuations] = useState<Record<string, Valuation[]>>(initialData ? initialData.valuations as unknown as Record<string, Valuation[]> : {})
  const [dailyExpenses, setDailyExpenses] = useState(initialData?.dailyExpenses ?? 0)
  const [budgetingActive, setBudgetingActive] = useState(initialData?.budgetingActive ?? true)
  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const { partnerPrivacy, hiddenCategories } = usePartnerPrivacy()

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
        query = query.or('ownership.eq.personal,ownership.is.null')
      }
      const { data, error: fetchError } = await query
        .order('sort_order', { ascending: true })

      if (signal?.aborted) return // Discard stale results
      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        setAssets([])
        setLoading(false)
        return
      }

      // Apply privacy filtering in household mode (Feature #537)
      let filteredData = data as Asset[]
      const { data: { user } } = await supabase.auth.getUser()
      if (signal?.aborted) return
      if (perspective === 'household' && user) {
        try {
          const ppRes = await fetch('/api/household/partner-privacy')
          if (ppRes.ok) {
            const ppData = await ppRes.json()
            if (ppData.partnerPrivacy?.assets === 'hidden') {
              filteredData = filteredData.filter(
                a => a.user_id === user.id || a.ownership === 'shared'
              )
            }
          }
        } catch { /* non-critical */ }
      }
      setAssets(filteredData)

      // Load linked mortgages + daily expenses for freedom-time + bank account links
      if (signal?.aborted) return
      if (user) {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

        const [mortgageResult, txResult, bankLinksResult, profileBaResult] = await Promise.all([
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
          supabase
            .from('profiles')
            .select('budgeting_active')
            .single(),
        ])

        if (signal?.aborted) return // Discard stale results after parallel queries

        if (mortgageResult.data) setMortgages(mortgageResult.data as Mortgage[])
        setBudgetingActive(profileBaResult.data?.budgeting_active !== false)

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

  const activeAssets = assets.filter((a) => a.is_active !== false)
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
    // Check if this is a cash asset before deleting (for budgeting_active sync)
    const deletedAsset = assets.find(a => a.id === id)
    await supabase.from('assets').delete().eq('id', id)
    setAssets((prev) => prev.filter((a) => a.id !== id))
    setSelectedAsset(null)

    // After delete: sync budgeting_active if deleted asset was a cash type
    if (deletedAsset?.asset_type === 'cash') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: trackingAssets } = await supabase
          .from('assets')
          .select('id')
          .eq('asset_type', 'cash')
          .eq('has_budget_tracking', true)
          .eq('is_active', true)

        const hasAnyBudgetTracking = (trackingAssets?.length ?? 0) > 0
        await supabase
          .from('profiles')
          .update({ budgeting_active: hasAnyBudgetTracking })
          .eq('id', user.id)
      }
    }
  }

  // Open modal from initialAssetId prop (embedded in core page modal)
  useEffect(() => {
    if (!initialAssetId || loading || assets.length === 0) return
    const found = assets.find(a => a.id === initialAssetId)
    if (found) {
      setSelectedAsset(found)
      setModalStep('detail')
    }
  }, [initialAssetId, loading, assets])

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
    // Cash assets with active budget tracking deep-link to the cash-categorie
    // pagina (which exposes the Budgetteren tab). Other assets keep the
    // existing detail-modal — registratie zonder verdieping is fundament.
    if (asset.asset_type === 'cash' && budgetingActive && asset.has_budget_tracking) {
      router.push(`/core/assets/cash?asset=${asset.id}`)
      return
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
      {/* Editorial header — blueprint Type 2 (List) */}
      <header className="mb-5 space-y-2">
        {/* Kicker met 28×1px streep */}
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Bezittingen · {activeAssets.length} item{activeAssets.length !== 1 ? 's' : ''}
        </div>
        {/* Headline met italic-em "vrijheid" */}
        <h1
          className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Opgeslagen{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            vrijheid
          </em>
        </h1>
      </header>

      {/* Original section header (compact) */}
      <section className="rounded-[var(--r-lg)] border border-kern-200 card-editorial p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                aria-label="Bezitting toevoegen"
                title="Bezitting toevoegen"
                className="inline-flex min-h-[32px] items-center gap-1.5 border border-kern-200 bg-[var(--color-kern-50)] px-2.5 py-1 text-xs font-medium text-kern-700 transition-colors hover:bg-kern-100 hover:text-kern-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                Bezitting toevoegen
              </button>
            </div>
            <p
              className="mt-1 italic text-[12px] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {activeAssets.length} bezitting{activeAssets.length !== 1 ? 'en' : ''} — opgeslagen vrijheid
            </p>
            {perspective === 'household' && hiddenCategories.includes('assets') && (
              <PrivacyHiddenNotice hiddenCategories={hiddenCategories} forCategories={['assets']} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/core/assets/revalue"
              className="inline-flex items-center gap-2 rounded-[var(--r)] border border-kern-200 px-4 py-2 text-sm font-medium text-kern-700 hover:bg-kern-50"
            >
              <RefreshCw className="h-4 w-4" />
              Herwaarderen
            </Link>
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
                <p className={`mt-1 text-xl font-bold ${totalValue >= totalPurchase ? 'text-positive' : 'text-negative'}`}>
                  {totalValue >= totalPurchase ? '+' : ''}{formatCurrency(totalValue - totalPurchase)}
                </p>
                {dailyExpenses > 0 && Math.abs(totalValue - totalPurchase) > 0 && (
                  <p className={`mt-0.5 text-xs ${totalValue >= totalPurchase ? 'text-positive/70' : 'text-negative/70'}`} data-testid="return-freedom">
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

      {/* Allocation + projection — collapsible card */}
      <div className="mt-3 sm:mt-6 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
        {/* ── Accent bar ── */}
        <div className="h-[3px] w-full bg-kern-500" />

        {/* ── Header (clickable toggle) ── */}
        <button
          type="button"
          onClick={toggleInsight}
          aria-expanded={insightOpen}
          className="flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${insightOpen ? 'rotate-180' : ''}`} />
          <div className="flex min-w-0 flex-1 items-center justify-between">
            <Kicker>
              <BarChart3 className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden />
              Verdeling &amp; Projectie
            </Kicker>
            <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(totalValue)}
            </p>
          </div>
        </button>

        {/* ── Content ── */}
        {insightOpen && (
          <div className="grid gap-3 sm:gap-6 lg:grid-cols-2 p-4 sm:p-6">
            {/* Allocation donut */}
            <section>
              <Kicker>Verdeling</Kicker>
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

            {/* Projection chart */}
            <section data-testid="portfolio-projection-section">
              <div className="flex items-center justify-between">
                <Kicker>Projectie</Kicker>
                <div className="flex items-center gap-1" data-testid="projection-year-buttons">
                  {[5, 10, 20, 30].map((y) => (
                    <button
                      key={y}
                      onClick={(e) => { e.stopPropagation(); setProjectionYears(y) }}
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
        )}
      </div>

      {/* Grouped asset list */}
      <section className="mt-3 sm:mt-6 space-y-1">
        {activeAssets.length === 0 && (
          <QuickAddEmptyState intent="asset" onAdd={() => setQuickAddOpen(true)} />
        )}
        {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => {
          const group = byType[type]
          if (!group || group.assets.length === 0) return null
          const groupColor = ASSET_TYPE_COLORS[type]
          const groupIcon = ASSET_TYPE_ICONS[type]
          const isCash = type === 'cash'

          return (
            <div key={type}>
              {/* Group header — klikbaar bij cash zodat gebruikers naar de
                  categorie-pagina (incl. Budgetteren tab) navigeren. Voor
                  andere types blijft het een statische kicker. */}
              <div className="flex items-center gap-2 pt-4 pb-1.5">
                <span style={{ color: groupColor }}><BudgetIcon name={groupIcon} className="h-4 w-4" /></span>
                {isCash ? (
                  <Link
                    href="/core/assets/cash"
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] hover:text-kern-600 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
                  >
                    {ASSET_TYPE_LABELS[type]}
                  </Link>
                ) : (
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    {ASSET_TYPE_LABELS[type]}
                  </h3>
                )}
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
                  const hasBudget = isCash && budgetingActive && asset.has_budget_tracking && linkedBankAccounts.has(asset.id)

                  return (
                    <div
                      key={asset.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-colors ${
                        hasBudget ? 'hover:border-emerald-200 hover:bg-emerald-50/30' : 'hover:border-kern-200 hover:bg-kern-50/30'
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
                          {asset.has_holdings_tracking && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-kern-50 px-1.5 py-0.5 text-[9px] font-medium text-kern-700 border border-kern-200">
                              <TrendingUp className="h-2.5 w-2.5" /> Holdings
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-[var(--ink-3)]">
                          {hasBudget
                            ? [
                                asset.subtype && ASSET_SUBTYPE_LABELS.cash?.[asset.subtype],
                                asset.account_number,
                                asset.institution,
                              ].filter(Boolean).join(' \u2022 ') || (asset.subtype === 'contant_geld' ? 'Contant geld' : 'Bankrekening')
                            : [
                                ASSET_TYPE_LABELS[asset.asset_type],
                                asset.subtype && ASSET_SUBTYPE_LABELS[asset.asset_type]?.[asset.subtype],
                                asset.institution,
                                asset.asset_type === 'deelneming' && asset.ownership_percentage != null ? `${asset.ownership_percentage}% belang` : null,
                                asset.asset_type === 'levensverzekering' && asset.expiry_date ? (() => {
                                  const now = new Date()
                                  const end = new Date(asset.expiry_date!)
                                  const diffMs = end.getTime() - now.getTime()
                                  if (diffMs <= 0) return 'Verlopen'
                                  const diffYears = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
                                  const diffMonths = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
                                  if (diffYears > 0) return `Nog ${diffYears} jaar${diffMonths > 0 ? ` en ${diffMonths} mnd` : ''}`
                                  return `Nog ${diffMonths} maanden`
                                })() : null,
                                asset.asset_type === 'vordering' && asset.lock_end_date ? (() => {
                                  const now = new Date()
                                  const end = new Date(asset.lock_end_date!)
                                  const diffMs = end.getTime() - now.getTime()
                                  if (diffMs <= 0) return 'Afgelopen'
                                  const diffYears = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
                                  const diffMonths = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
                                  if (diffYears > 0) return `Nog ${diffYears} jaar${diffMonths > 0 ? ` en ${diffMonths} mnd` : ''}`
                                  return `Nog ${diffMonths} maanden`
                                })() : null,
                              ].filter(Boolean).join(' \u2022 ')
                          }
                        </p>
                        {asset.asset_type === 'deelneming' && asset.annual_dividend != null && asset.annual_dividend > 0 && (
                          <p className="text-[10px] text-teal-600/80">
                            Dividend: {formatCurrency(asset.annual_dividend)} p.j.
                          </p>
                        )}
                        {asset.asset_type === 'levensverzekering' && Number(asset.monthly_contribution) > 0 && (
                          <p className="text-[10px] text-purple-600/80">
                            Premie: {formatCurrency(Number(asset.monthly_contribution))} p/m
                          </p>
                        )}
                        {asset.asset_type === 'vordering' && (
                          <p className="text-[10px] text-sky-600/80">
                            {[
                              `Rente: ${Number(asset.expected_return)}% p.j.`,
                              Number(asset.monthly_contribution) > 0 ? `Aflossing: ${formatCurrency(Number(asset.monthly_contribution))} p/m` : null,
                            ].filter(Boolean).join(' \u2022 ')}
                          </p>
                        )}
                        {asset.asset_type === 'vordering' && asset.subtype === 'dga_lening' && asset.linked_asset_id && (() => {
                          const linked = assets.find(a => a.id === asset.linked_asset_id)
                          if (!linked) return null
                          return (
                            <p className="text-[10px] text-teal-600/80">
                              DGA-lening bij {linked.name}
                            </p>
                          )
                        })()}
                        {(asset.net_worth_inclusion_pct ?? 100) < 100 && (
                          <span className="mt-0.5 inline-block rounded bg-kern-50 border border-kern-200 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-kern-600">
                            {asset.net_worth_inclusion_pct}% meegeteld
                          </span>
                        )}
                      </div>
                      {/* Mini sparkline for non-cash asset cards */}
                      {!hasBudget && (() => {
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
                          <p className={`text-[10px] ${hasBudget ? 'text-emerald-500/70' : 'text-kern-500/70'}`} data-testid="asset-card-freedom">
                            {formatFreedomTimeString(calculateFreedomTime(value, dailyExpenses), 'short', true)} vrijheid
                          </p>
                        )}
                        {!hasBudget && purchase > 0 && (
                          <p className={`text-xs font-medium ${returnPct >= 0 ? 'text-positive' : 'text-negative'}`}>
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
          allAssets={assets}
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
          budgetingActive={budgetingActive}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadAssets().then(async () => {
              // Refresh selectedAsset with updated data
              const supabase = createClient()
              const [assetRes, profileRes] = await Promise.all([
                supabase.from('assets').select('*').eq('id', selectedAsset.id).single(),
                supabase.from('profiles').select('budgeting_active, net_monthly_income, estimated_monthly_expenses').single(),
              ])
              if (assetRes.data) setSelectedAsset(assetRes.data as Asset)
              const nowInactive = profileRes.data?.budgeting_active === false
              setBudgetingActive(!nowInactive)
              if (nowInactive && (!profileRes.data?.net_monthly_income || !profileRes.data?.estimated_monthly_expenses)) {
                router.push('/core?showEstimates=true')
              }
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
          budgetingActive={budgetingActive}
          onClose={() => { setShowForm(false); setEditAsset(null); setNewAssetType(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditAsset(null)
            setNewAssetType(null)
            loadAssets().then(async () => {
              const supabase = createClient()
              const { data } = await supabase.from('profiles').select('budgeting_active, net_monthly_income, estimated_monthly_expenses').single()
              const nowInactive = data?.budgeting_active === false
              setBudgetingActive(!nowInactive)
              if (nowInactive && (!data?.net_monthly_income || !data?.estimated_monthly_expenses)) {
                router.push('/core?showEstimates=true')
              }
            })
          }}
        />
      )}

      <QuickAddWizard
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        initialIntent="asset"
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

// ── Asset detail modal ───────────────────────────────────────

export function AssetDetailModal({
  asset,
  valuations,
  mortgage,
  dailyExpenses,
  allAssets,
  cryptoHoldings,
  investmentHoldings,
  onClose,
  onEdit,
  onRevalue,
  onDelete,
}: {
  asset: Asset
  valuations: Valuation[] | undefined
  mortgage: { name: string; balance: number } | null
  dailyExpenses: number
  allAssets?: Asset[]
  /**
   * Typed crypto-holdings die bij dit asset horen (R5). Geladen door
   * `<AssetDetailFlow />` via `loadCryptoHoldingsForAsset()`. Bij `undefined`
   * is de fetch nog niet gedaan; bij `[]` zijn er gewoon 0 holdings (legitiem
   * voor handmatig ingevoerde "Crypto-portfolio €X" zonder details).
   */
  cryptoHoldings?: import('@/lib/crypto-holdings-data').CryptoHoldingRow[]
  /**
   * Typed investment-holdings (R5). Zelfde semantiek als `cryptoHoldings`.
   */
  investmentHoldings?: import('@/lib/investment-holdings-data').InvestmentHoldingRow[]
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

  // DGA-lening tracking for deelneming assets
  const isDeelneming = asset.asset_type === 'deelneming'
  const [linkedDebts, setLinkedDebts] = useState<{ id: string; name: string; current_balance: number }[]>([])
  const [allDebts, setAllDebts] = useState<{ id: string; name: string; current_balance: number; linked_asset_id: string | null }[]>([])
  const [totalDgaLeningen, setTotalDgaLeningen] = useState(0)
  const [showLinkDropdown, setShowLinkDropdown] = useState(false)
  const WET_EXCESSIEF_LENEN_DREMPEL = 500_000
  const WET_EXCESSIEF_LENEN_WAARSCHUWING = 400_000

  useEffect(() => {
    if (!isDeelneming) return
    const sb = createClient()
    Promise.all([
      sb.from('debts').select('id, name, current_balance').eq('linked_asset_id', asset.id).eq('is_active', true),
      sb.from('debts').select('id, name, current_balance, linked_asset_id').eq('is_active', true),
      sb.from('assets').select('id').eq('asset_type', 'deelneming').eq('is_active', true),
    ]).then(([linkedRes, allRes, deelnemingRes]) => {
      setLinkedDebts(linkedRes.data ?? [])
      setAllDebts(allRes.data ?? [])
      const deelIds = new Set((deelnemingRes.data ?? []).map((a: { id: string }) => a.id))
      const tot = (allRes.data ?? [])
        .filter((d: { linked_asset_id: string | null }) => d.linked_asset_id && deelIds.has(d.linked_asset_id))
        .reduce((s: number, d: { current_balance: number }) => s + Number(d.current_balance), 0)
      setTotalDgaLeningen(tot)
    })
  }, [asset.id, isDeelneming])

  const linkDebt = async (debtId: string) => {
    const sb = createClient()
    await sb.from('debts').update({ linked_asset_id: asset.id }).eq('id', debtId)
    const { data } = await sb.from('debts').select('id, name, current_balance').eq('linked_asset_id', asset.id).eq('is_active', true)
    setLinkedDebts(data ?? [])
    setAllDebts(prev => prev.map(d => d.id === debtId ? { ...d, linked_asset_id: asset.id } : d))
    setTotalDgaLeningen(prev => prev + Number(allDebts.find(d => d.id === debtId)?.current_balance ?? 0))
    setShowLinkDropdown(false)
  }

  const unlinkDebt = async (debtId: string) => {
    const sb = createClient()
    await sb.from('debts').update({ linked_asset_id: null }).eq('id', debtId)
    const bal = Number(linkedDebts.find(d => d.id === debtId)?.current_balance ?? 0)
    setLinkedDebts(prev => prev.filter(d => d.id !== debtId))
    setAllDebts(prev => prev.map(d => d.id === debtId ? { ...d, linked_asset_id: null } : d))
    setTotalDgaLeningen(prev => prev - bal)
  }

  const availableDebts = allDebts.filter(d => !d.linked_asset_id)

  return (
    <BottomSheet open={true} onClose={onClose} title={asset.name} size="lg">
        {/* Subheader */}
        <div className="flex items-center gap-3 px-6 pb-2">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)]"
            style={{ backgroundColor: color + '15' }}
          >
            <BudgetIcon name={icon} className="h-5 w-5" />
          </div>
          <p className="text-xs text-[var(--ink-3)]">
            {ASSET_TYPE_LABELS[asset.asset_type]}
            {asset.subtype && ASSET_SUBTYPE_LABELS[asset.asset_type]?.[asset.subtype]
              ? ` \u2022 ${ASSET_SUBTYPE_LABELS[asset.asset_type]![asset.subtype]}`
              : ''}
            {asset.institution ? ` \u2022 ${asset.institution}` : ''}
          </p>
        </div>

        {/* Value highlight — editorial blueprint met HighlightMark */}
        <div className="border-b border-[var(--border-ed)] px-6 py-5 text-center">
          {(isEigenHuis || asset.asset_type === 'levensverzekering' || asset.asset_type === 'vordering') && (
            <div className="mb-2 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
              <span
                aria-hidden
                className="inline-block w-5 h-px"
                style={{ background: 'var(--module-active-500)' }}
              />
              {isEigenHuis && 'Marktwaarde'}
              {asset.asset_type === 'levensverzekering' && 'Afkoopwaarde'}
              {asset.asset_type === 'vordering' && 'Uitstaand bedrag'}
            </div>
          )}
          <p
            className="text-[32px] sm:text-[40px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            <span
              className="inline px-1"
              style={{
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
              }}
            >
              {formatCurrency(value)}
            </span>
          </p>
          {dailyExpenses > 0 && value > 0 && (
            <p
              className="mt-1.5 italic text-[12px] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              data-testid="detail-value-freedom"
            >
              {formatFreedomTimeString(calculateFreedomTime(value, dailyExpenses), 'long')} vrijheid
            </p>
          )}
          {purchase > 0 && (
            <p className={`mt-2 text-sm font-medium tabular-nums ${returnPct >= 0 ? 'text-positive' : 'text-negative'}`}>
              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% ({returnPct >= 0 ? '+' : ''}{formatCurrency(value - purchase)})
              {dailyExpenses > 0 && Math.abs(value - purchase) > 0 && (
                <span className={`ml-1 text-xs ${returnPct >= 0 ? 'text-positive/60' : 'text-negative/60'}`} data-testid="detail-return-freedom">
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
              <p className="text-xs text-[var(--ink-3)]">{isEigenHuis ? 'Aankoopprijs' : asset.asset_type === 'vordering' ? 'Oorspronkelijke hoofdsom' : 'Aankoopwaarde'}</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{purchase > 0 ? formatCurrency(purchase) : '-'}</p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">{asset.asset_type === 'vordering' ? 'Rentepercentage' : 'Verwacht rendement'}</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{Number(asset.expected_return)}% p.j.</p>
            </div>
            {!isEigenHuis && (
              <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
                <p className="text-xs text-[var(--ink-3)]">{asset.asset_type === 'vordering' ? 'Maandelijkse aflossing' : asset.asset_type === 'levensverzekering' ? 'Maandelijkse premie' : 'Maandelijkse inleg'}</p>
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
                        <span className={`text-sm font-bold ${overwaarde >= 0 ? 'text-positive' : 'text-negative'}`}>
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

          {/* DGA-lening section for deelneming assets */}
          {isDeelneming && (
            <div className="rounded-[var(--r)] border border-teal-200 bg-teal-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-700/80 uppercase">Gekoppelde DGA-lening</p>
                {availableDebts.length > 0 && (
                  <button
                    onClick={() => setShowLinkDropdown(!showLinkDropdown)}
                    className="flex items-center gap-1 rounded-[var(--r)] bg-teal-100 px-2 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-200 transition-colors"
                  >
                    <LinkIcon className="h-3 w-3" /> Koppel schuld
                  </button>
                )}
              </div>

              {/* Link dropdown */}
              {showLinkDropdown && availableDebts.length > 0 && (
                <div className="rounded-[var(--r)] border border-teal-200 bg-white p-2 space-y-1">
                  <p className="text-[10px] text-[var(--ink-3)] mb-1">Selecteer een schuld om te koppelen:</p>
                  {availableDebts.map(d => (
                    <button
                      key={d.id}
                      onClick={() => linkDebt(d.id)}
                      className="flex w-full items-center justify-between rounded-[var(--r)] px-2 py-1.5 text-xs hover:bg-teal-50 transition-colors"
                    >
                      <span className="text-[var(--ink)]">{d.name}</span>
                      <span className="font-mono tabular-nums text-[var(--ink-2)]">{formatCurrency(d.current_balance)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Linked debts list */}
              {linkedDebts.length > 0 ? (
                <div className="space-y-1.5">
                  {linkedDebts.map(d => (
                    <div key={d.id} className="flex items-center justify-between">
                      <span className="text-xs text-[var(--ink-2)]">{d.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-sm font-medium text-[var(--ink)]">{formatCurrency(d.current_balance)}</span>
                        <button
                          onClick={() => unlinkDebt(d.id)}
                          className="rounded p-0.5 text-[var(--ink-4)] hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Ontkoppel"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-3)]">
                  Geen DGA-lening gekoppeld. Koppel een schuld uit De Kern &gt; Schulden.
                </p>
              )}

              {/* Wet excessief lenen warnings */}
              {totalDgaLeningen > 0 && (
                <div className="border-t border-teal-200/60 pt-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-2)]">Totaal DGA-leningen</span>
                    <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{formatCurrency(totalDgaLeningen)}</span>
                  </div>

                  {totalDgaLeningen >= WET_EXCESSIEF_LENEN_DREMPEL && (
                    <div className="mt-2 flex items-start gap-2 rounded-[var(--r)] bg-red-50 border border-red-200 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                      <div>
                        <p className="text-xs font-medium text-red-700">
                          Wet excessief lenen: drempel overschreden
                        </p>
                        <p className="text-[10px] text-red-600 mt-0.5">
                          Uw totale DGA-leningen ({formatCurrency(totalDgaLeningen)}) overschrijden de drempel van {formatCurrency(WET_EXCESSIEF_LENEN_DREMPEL)}. Het meerdere wordt belast als fictief regulier voordeel in Box 2.
                        </p>
                        <a
                          href="https://www.belastingdienst.nl/wps/wcm/connect/nl/box-2/content/excessief-lenen"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[10px] font-medium text-red-700 underline hover:text-red-800"
                        >
                          Meer informatie over Wet excessief lenen →
                        </a>
                      </div>
                    </div>
                  )}

                  {totalDgaLeningen >= WET_EXCESSIEF_LENEN_WAARSCHUWING && totalDgaLeningen < WET_EXCESSIEF_LENEN_DREMPEL && (
                    <div className="mt-2 flex items-start gap-2 rounded-[var(--r)] bg-amber-50 border border-amber-200 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-xs font-medium text-amber-700">
                          Wet excessief lenen: nadert drempel
                        </p>
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          Uw totale DGA-leningen ({formatCurrency(totalDgaLeningen)}) naderen de drempel van {formatCurrency(WET_EXCESSIEF_LENEN_DREMPEL)}. Boven deze drempel wordt het meerdere belast als fictief regulier voordeel in Box 2.
                        </p>
                        <a
                          href="https://www.belastingdienst.nl/wps/wcm/connect/nl/box-2/content/excessief-lenen"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[10px] font-medium text-amber-700 underline hover:text-amber-800"
                        >
                          Meer informatie over Wet excessief lenen →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
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
            if (asset.lock_end_date) {
              const lockEnd = new Date(asset.lock_end_date)
              const formatted = lockEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
              if (asset.asset_type === 'vordering') {
                const diffMs = lockEnd.getTime() - Date.now()
                const remaining = diffMs <= 0 ? '(afgelopen)' : (() => {
                  const y = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
                  const m = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
                  if (y > 0) return `(nog ${y} jaar${m > 0 ? ` en ${m} mnd` : ''})`
                  return `(nog ${m} maanden)`
                })()
                details.push({ label: 'Einddatum lening', value: `${formatted} ${remaining}` })
              } else {
                details.push({ label: 'Vastgezet tot', value: formatted })
              }
            }
            // Levensverzekering-specific fields
            if (asset.expiry_date) {
              const endDate = new Date(asset.expiry_date)
              const formatted = endDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
              const diffMs = endDate.getTime() - Date.now()
              const remaining = diffMs <= 0 ? '(verlopen)' : (() => {
                const y = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
                const m = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
                if (y > 0) return `(nog ${y} jaar${m > 0 ? ` en ${m} mnd` : ''})`
                return `(nog ${m} maanden)`
              })()
              details.push({ label: 'Einddatum polis', value: `${formatted} ${remaining}` })
            }
            if (asset.beneficiary) details.push({ label: 'Begunstigde', value: asset.beneficiary })
            // Deelneming-specific fields
            if (asset.kvk_number) details.push({ label: 'KvK-nummer', value: asset.kvk_number })
            if (asset.ownership_percentage != null) details.push({ label: 'Belang', value: `${asset.ownership_percentage}%` })
            if (asset.annual_dividend != null && asset.annual_dividend > 0) details.push({ label: 'Jaarlijks dividend', value: formatCurrency(asset.annual_dividend) })
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

          {/* DGA-lening linked deelneming */}
          {asset.asset_type === 'vordering' && asset.subtype === 'dga_lening' && asset.linked_asset_id && (() => {
            const linked = allAssets?.find(a => a.id === asset.linked_asset_id)
            if (!linked) return null
            return (
              <div className="rounded-[var(--r)] border border-teal-200 bg-teal-50/50 p-3 space-y-1">
                <p className="text-xs font-semibold text-teal-700/60 uppercase">Gekoppelde deelneming</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--ink)]">{linked.name}</span>
                  <span className="text-sm text-[var(--ink-2)]">{formatCurrency(Number(linked.current_value))}</span>
                </div>
                {linked.ownership_percentage != null && (
                  <p className="text-xs text-teal-600/80">{linked.ownership_percentage}% belang</p>
                )}
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

          {/* Holdings per asset — typed lijst voor crypto/investment (R5),
              legacy fallback voor savings/retirement zolang die nog op de
              polymorfe holdings-API draaien. */}
          {asset.asset_type === 'crypto' && (
            <TypedHoldingsSection
              assetType="crypto"
              holdings={cryptoHoldings ?? []}
              loaded={cryptoHoldings !== undefined}
            />
          )}
          {asset.asset_type === 'investment' && (
            <TypedHoldingsSection
              assetType="investment"
              holdings={investmentHoldings ?? []}
              loaded={investmentHoldings !== undefined}
            />
          )}
          {(['savings', 'retirement'] as string[]).includes(asset.asset_type) && (
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
    </BottomSheet>
  )
}

// ── Typed holdings section (R5) ──────────────────────────────

/**
 * Compacte holdings-lijst binnen de asset-detail-sheet voor crypto/investment-
 * assets. Hergebruikt de typed holding-cards (CryptoHoldingCard /
 * InvestmentHoldingCard) in `compact`-vorm en biedt een deeplink naar de
 * Holdings-app verdiepingstab op de bijbehorende categoriepagina voor het
 * volle arsenaal (allocation, transacties, vergelijking).
 *
 * Bewuste keuze: cards renderen we hier zonder bron-badge — die is via de
 * detail-context (de asset zelf, met plug-indicator op de naam-regel) al
 * eenduidig. Cap op de eerste 12 entries om de bottom-sheet niet uit zijn
 * voegen te laten barsten; "Open holdings (N)" verwijst door naar het volle
 * overzicht.
 */
function TypedHoldingsSection({
  assetType,
  holdings,
  loaded,
}: {
  assetType: 'crypto' | 'investment'
  holdings:
    | import('@/lib/crypto-holdings-data').CryptoHoldingRow[]
    | import('@/lib/investment-holdings-data').InvestmentHoldingRow[]
  loaded: boolean
}) {
  const router = useRouter()
  const visible = holdings.slice(0, 12)
  const hasMore = holdings.length > visible.length
  const totalEur = holdings.reduce((sum, h) => sum + h.valueEur, 0)

  const headerLabel = assetType === 'crypto' ? 'Coins' : 'Posities'
  const deepenLink = `/core/assets/${assetType}?tab=holdings`

  // Loading-state: typed-holdings nog niet binnen. We tonen een lichte
  // skeleton-blokje in plaats van een spinner — past bij krant-stijl en
  // voorkomt layout-shift wanneer de data binnen ms binnenkomt.
  if (!loaded) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            {headerLabel}
          </p>
        </div>
        <div className="h-12 w-full bg-[var(--subtle)]/60" aria-hidden="true" />
        <div className="h-12 w-full bg-[var(--subtle)]/60" aria-hidden="true" />
      </div>
    )
  }

  if (holdings.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Geen {assetType === 'crypto' ? 'coins' : 'posities'} gekoppeld
        </p>
        <p className="mt-1 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Voeg holdings toe via een exchange-koppeling, wallet-adres of
          {assetType === 'investment' ? ' een CSV-import' : ' handmatige invoer'} om hier
          de detailsamenstelling te zien.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                assetType === 'crypto'
                  ? '/identity/koppelingen'
                  : '/core/assets/holdings/import',
              )
            }
            className="inline-flex h-9 items-center gap-1.5 border border-kern-300 bg-kern-50 px-3 text-[11px] font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {assetType === 'crypto' ? 'Koppel exchange' : 'Importeer holdings'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          {headerLabel}
          <span className="ml-1.5 text-[var(--ink-3)]">({holdings.length})</span>
        </p>
        <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
          {formatCurrency(totalEur)}
        </p>
      </div>

      <div className="space-y-1.5">
        {assetType === 'crypto'
          ? (visible as import('@/lib/crypto-holdings-data').CryptoHoldingRow[]).map(
              (h, idx) => (
                <CryptoHoldingCard
                  key={h.id}
                  holding={h}
                  staggerIndex={idx}
                  size="compact"
                  onClick={(holding) =>
                    router.push(`/core/assets/crypto/${holding.id}`)
                  }
                />
              ),
            )
          : (
              visible as import('@/lib/investment-holdings-data').InvestmentHoldingRow[]
            ).map((h, idx) => (
              <InvestmentHoldingCard
                key={h.id}
                holding={h}
                staggerIndex={idx}
                size="compact"
                onClick={(holding) =>
                  router.push(`/core/assets/investment/${holding.id}`)
                }
              />
            ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => router.push(deepenLink)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-kern-700 hover:text-kern-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          Open holdings
          {hasMore && <span className="text-[var(--ink-4)]">({holdings.length})</span>}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
        {hasMore && (
          <p className="text-[10px] tabular-nums text-[var(--ink-4)]">
            +{holdings.length - visible.length} meer
          </p>
        )}
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
                <span className={`font-medium ${diff >= 0 ? 'text-positive' : 'text-negative'}`}>
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
                <span className={`text-[10px] font-medium ${diff >= 0 ? 'text-positive' : 'text-negative'}`}>
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
                        <p className={`text-[10px] ${returnPct >= 0 ? 'text-positive' : 'text-negative'}`}>
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
                    <span className={`ml-1.5 text-[10px] ${totalValue >= totalCost ? 'text-positive' : 'text-negative'}`}>
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

export function AssetForm({
  asset,
  defaultType,
  linkedBankAccounts,
  onClose,
  onSaved,
  budgetingActive = true,
  initialConnection = null,
}: {
  asset?: Asset
  defaultType?: AssetType
  linkedBankAccounts: Map<string, { id: string; linked_asset_id: string }>
  onClose: () => void
  onSaved: () => void
  budgetingActive?: boolean
  /**
   * Initiële externe-koppeling voor de R2 "Externe koppeling"-sectie. Alleen
   * relevant voor crypto-assets — voor andere types is dit altijd `null` en
   * wordt de sectie niet gerenderd. Wordt door `<AssetDetailFlow />`
   * meegegeven uit de batch-fetch bij modal-open.
   */
  initialConnection?: import('@/lib/connections-data').AssetConnectionSummary | null
}) {
  const isEdit = !!asset
  const [hasActiveHoldings, setHasActiveHoldings] = useState(false)
  const [holdingsCount, setHoldingsCount] = useState(0)
  // Budget tracking confirmation state
  const [showBudgetConfirm, setShowBudgetConfirm] = useState(false)
  const [otherTrackingCount, setOtherTrackingCount] = useState<number | null>(null)

  const [name, setName] = useState(asset?.name ?? '')
  const [assetType, setAssetType] = useState<AssetType>(asset?.asset_type ?? defaultType ?? 'savings')
  const [hasBudgetTracking, setHasBudgetTracking] = useState(asset?.has_budget_tracking ?? false)
  const [hasHoldingsTracking, setHasHoldingsTracking] = useState(asset?.has_holdings_tracking ?? false)
  // App-koppeling per asset-type — Hypotheekplanner (eigen_huis) en Verhuurrendement (real_estate).
  // De boolean leeft op de asset zelf; geen aparte API-call nodig — de save-payload schrijft mee.
  const [hasWoonbalansTracking, setHasWoonbalansTracking] = useState(asset?.has_woonbalans_tracking ?? false)
  const [hasRentalTracking, setHasRentalTracking] = useState(asset?.has_rental_tracking ?? false)
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

  // Query how many OTHER cash assets have budget tracking (for last-account confirmation)
  useEffect(() => {
    if (isEdit && asset?.asset_type === 'cash' && asset.has_budget_tracking) {
      const supabase = createClient()
      supabase
        .from('assets')
        .select('id')
        .eq('asset_type', 'cash')
        .eq('has_budget_tracking', true)
        .eq('is_active', true)
        .neq('id', asset.id)
        .then(({ data }) => {
          setOtherTrackingCount(data?.length ?? 0)
        })
    }
  }, [isEdit, asset?.id, asset?.asset_type, asset?.has_budget_tracking])
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
  const [expiryDate, setExpiryDate] = useState(asset?.expiry_date ?? '')
  const [beneficiary, setBeneficiary] = useState(asset?.beneficiary ?? '')
  const [linkedAssetId, setLinkedAssetId] = useState(asset?.linked_asset_id ?? '')
  const [deelnemingOptions, setDeelnemingOptions] = useState<{ id: string; name: string }[]>([])
  const [dgaTotal, setDgaTotal] = useState(0)
  const [wozLoading, setWozLoading] = useState(false)
  const [wozResult, setWozResult] = useState<{ peildatum: string; waarde: number }[] | null>(null)
  const [wozError, setWozError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(asset?.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()

  const subtypeOptions = ASSET_SUBTYPE_LABELS[assetType]
  const visibleFields = ASSET_TYPE_FIELDS[assetType]

  // Load deelneming options + DGA total when subtype is dga_lening
  useEffect(() => {
    if (subtype !== 'dga_lening') {
      setDeelnemingOptions([])
      setDgaTotal(0)
      return
    }
    const supabase = createClient()
    // Fetch deelneming assets
    supabase.from('assets').select('id, name').eq('asset_type', 'deelneming').eq('is_active', true)
      .then(({ data }) => setDeelnemingOptions(data ?? []))
    // Fetch total DGA-leningen (excluding current asset if editing)
    supabase.from('assets').select('id, current_value').eq('asset_type', 'vordering').eq('is_active', true)
      .then(({ data }) => {
        const total = (data ?? [])
          .filter(a => a.id !== asset?.id)
          .reduce((sum, a) => sum + Number(a.current_value), 0)
        setDgaTotal(total)
      })
  }, [subtype, asset?.id])

  function handleTypeChange(type: AssetType) {
    setAssetType(type)
    setSubtype('')
    if (!isEdit) {
      setExpectedReturn(String(TYPICAL_RETURNS[type]))
      setRiskProfile('')
      setTaxBenefit(false)
      setIsLiquid(true)
      // Default depreciation for vehicle; clear for non-depreciating types
      if (type === 'vehicle') {
        setDepreciationRate('15')
        setExpectedReturn('0')
      } else if (type !== 'physical') {
        setDepreciationRate('')
      }
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
      expected_return: isCashType ? 0 : (depreciationRate && Number(depreciationRate) > 0 ? 0 : Number(expectedReturn) || 0),
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
      // Holdings tracking
      has_holdings_tracking: ['investment', 'crypto', 'savings', 'retirement'].includes(assetType) ? hasHoldingsTracking : false,
      // App-koppeling: Hypotheekplanner (eigen_huis) + Verhuurrendement (real_estate).
      // Voor andere asset-types gedwongen `false` zodat een type-wissel niet stilzwijgend
      // een verkeerde app-vlag laat staan.
      has_woonbalans_tracking: assetType === 'eigen_huis' ? hasWoonbalansTracking : false,
      has_rental_tracking: assetType === 'real_estate' ? hasRentalTracking : false,
      // Ensure new assets are visible
      is_active: true,
    }

    let assetId: string | undefined

    if (isEdit && asset) {
      const { error: updateErr } = await supabase.from('assets').update(row).eq('id', asset.id)
      if (updateErr) { console.error('ASSET UPDATE FAILED:', updateErr); setSaving(false); return }
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
      const { data: inserted, error: insertErr } = await supabase.from('assets').insert(row).select('id').single()
      if (insertErr) { console.error('ASSET INSERT FAILED:', insertErr); setValidationError('Opslaan mislukt: ' + insertErr.message); setSaving(false); return }
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

    // Cleanup linked bank_account when budget tracking is turned OFF
    if (isCashType && !hasBudgetTracking && isEdit && asset?.has_budget_tracking && assetId) {
      const { data: linkedBA } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('linked_asset_id', assetId)
        .maybeSingle()

      if (linkedBA) {
        const { count } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', linkedBA.id)

        if (count === 0) {
          await supabase.from('bank_accounts').delete().eq('id', linkedBA.id)
        } else {
          await supabase.from('bank_accounts').update({ linked_asset_id: null }).eq('id', linkedBA.id)
        }
      }
    }

    // After save: sync budgeting_active with has_budget_tracking status
    if (isCashType) {
      const { data: trackingAssets } = await supabase
        .from('assets')
        .select('id')
        .eq('asset_type', 'cash')
        .eq('has_budget_tracking', true)
        .eq('is_active', true)

      const hasAnyBudgetTracking = (trackingAssets?.length ?? 0) > 0
      await supabase
        .from('profiles')
        .update({ budgeting_active: hasAnyBudgetTracking })
        .eq('id', user.id)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <BottomSheet open={true} onClose={onClose} title={isEdit ? 'Asset bewerken' : 'Nieuwe asset'} size="lg">
        <div className="space-y-3 px-6">
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

          {/* Huishouden */}
          <OwnershipToggle
            value={ownership}
            onChange={setOwnership}
            hasHousehold={hasHousehold}
          />

          {/* Netto vermogen inclusie — logisch onder huishouden */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Neem dit % mee in netto vermogen en berekeningen naar de horizon
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
              Stel in welk percentage van deze asset wordt meegeteld in je netto vermogen en vrijheidsberekeningen.
            </p>
            {netWorthInclusionPct < 100 && Number(currentValue) > 0 && (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-kern-600">
                Effectieve waarde: {formatCurrency(Number(currentValue) * netWorthInclusionPct / 100)}
              </p>
            )}
          </div>

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

          {/* Cash-specific: IBAN + Bank name (hidden for contant geld) */}
          {assetType === 'cash' && subtype !== 'contant_geld' && (
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

          {/* Info text for contant geld */}
          {assetType === 'cash' && subtype === 'contant_geld' && (
            <p className="text-xs text-[var(--ink-3)] pl-1">
              Contant geld heeft geen IBAN of bank — vul alleen het bedrag in.
            </p>
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
                    {assetType === 'eigen_huis' ? 'Marktwaarde' : assetType === 'levensverzekering' ? 'Afkoopwaarde' : assetType === 'vordering' ? 'Uitstaand bedrag' : 'Huidige waarde'}
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
                    {assetType === 'eigen_huis' ? 'Aankoopprijs' : assetType === 'vordering' ? 'Oorspronkelijke hoofdsom' : 'Aankoopwaarde'}
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
                {!(visibleFields.includes('depreciation_rate') && depreciationRate && Number(depreciationRate) > 0) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">{assetType === 'vordering' ? 'Rente (% p.j.)' : 'Rendement (% p.j.)'}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  />
                </div>
                )}
                {assetType !== 'eigen_huis' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                      {assetType === 'levensverzekering' ? 'Premie p/m' : assetType === 'vordering' ? 'Aflossing p/m' : 'Inleg p/m'}
                    </label>
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
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {assetType === 'levensverzekering' ? 'Verzekeraar' : assetType === 'vordering' ? 'Debiteur / Tegenpartij' : 'Instelling'}
                  </label>
                  <input
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                    placeholder={assetType === 'levensverzekering' ? 'Nationale-Nederlanden, Aegon...' : assetType === 'vordering' ? 'Bijv. Jan Jansen, Mijn BV' : 'ABN AMRO, DEGIRO, ABP...'}
                  />
                </div>
              )}
            </>
          )}

          {/* Budget tracking toggle (cash only, hidden when budgetteren module is off) */}
          {assetType === 'cash' && budgetingActive && (
            <>
              <label className="flex items-start gap-3 rounded-[var(--r)] border border-emerald-200 bg-emerald-50/30 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBudgetTracking}
                  onChange={(e) => {
                    const wantsToDisable = !e.target.checked && hasBudgetTracking
                    // If disabling and this is the last tracking account, show confirmation
                    if (wantsToDisable && otherTrackingCount === 0) {
                      setShowBudgetConfirm(true)
                      return
                    }
                    setShowBudgetConfirm(false)
                    setHasBudgetTracking(e.target.checked)
                  }}
                  className="mt-0.5 rounded border-[var(--border-md)]"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--ink)]">Budgetten & transacties</span>
                  <p className="text-xs text-[var(--ink-3)]">
                    Schakel in om transacties te importeren, budgetcategorieën te koppelen, en cashflow te voorspellen.
                  </p>
                </div>
              </label>

              {/* Confirmation warning when disabling last budget tracking account */}
              {showBudgetConfirm && (
                <div className="rounded-[var(--r)] border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Weet je het zeker? Dit is je laatste rekening met budgetteren.
                      </p>
                      <p className="mt-1 text-xs text-amber-700">
                        Als je dit uitschakelt, worden budgetfuncties in de hele app gedeactiveerd. Je kunt dit altijd weer inschakelen.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setHasBudgetTracking(false)
                            setShowBudgetConfirm(false)
                          }}
                          className="rounded-[var(--r)] bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                        >
                          Ja, uitschakelen
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBudgetConfirm(false)}
                          className="rounded-[var(--r)] border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        >
                          Annuleer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Holdings tracking toggle (investment, crypto, savings, retirement) */}
          {['investment', 'crypto', 'savings', 'retirement'].includes(assetType) && (
            <>
              <label className="flex items-start gap-3 rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHoldingsTracking}
                  onChange={(e) => {
                    setHasHoldingsTracking(e.target.checked)
                  }}
                  className="mt-0.5 rounded border-[var(--border-md)]"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--ink)]">Holdings bijhouden</span>
                  <p className="text-xs text-[var(--ink-3)]">
                    Schakel in om individuele posities, transacties en portfolio-allocatie bij te houden.
                  </p>
                </div>
              </label>

              {/* Warning when disabling with active holdings */}
              {!hasHoldingsTracking && isEdit && asset?.has_holdings_tracking && hasActiveHoldings && (
                <div className="rounded-[var(--r)] border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Er zijn {holdingsCount} actieve holding{holdingsCount !== 1 ? 's' : ''} gekoppeld.
                      </p>
                      <p className="mt-1 text-xs text-amber-700">
                        Deze worden niet verwijderd maar verschijnen niet meer op de centrale holdings pagina.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Externe koppeling sectie (R2) — alleen voor crypto, en alleen
              wanneer we een bestaand asset bewerken: een connection vereist
              een persistente asset-ID die we via de POST kunnen meegeven. */}
          {isEdit && asset && assetType === 'crypto' && (
            <AssetEditConnectionSection
              assetId={asset.id}
              assetName={asset.name}
              initialConnection={initialConnection}
            />
          )}

          {/* Hypotheekplanner-app toggle (eigen_huis only) — patroon analoog aan budget/holdings hierboven. */}
          {assetType === 'eigen_huis' && (
            <label className="flex items-start gap-3 rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasWoonbalansTracking}
                onChange={(e) => setHasWoonbalansTracking(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-md)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--ink)]">Hypotheekplanner</span>
                <p className="text-xs text-[var(--ink-3)]">
                  Schakel in om je equity-opbouw, oversluit-scenario&apos;s en hypotheek-vs-beleggen te zien.
                </p>
              </div>
            </label>
          )}

          {/* Verhuurrendement-app toggle (real_estate only) — patroon analoog aan budget/holdings hierboven. */}
          {assetType === 'real_estate' && (
            <label className="flex items-start gap-3 rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasRentalTracking}
                onChange={(e) => setHasRentalTracking(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-md)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--ink)]">Verhuurrendement</span>
                <p className="text-xs text-[var(--ink-3)]">
                  Schakel in om netto rendement, cashflow en bezetting per object te zien.
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
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                      Vraag je actuele pensioenoverzicht op (DigiD vereist) en update je waarde handmatig.{' '}
                      <a
                        href="https://www.mijnpensioenoverzicht.nl/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--ink-2)] underline underline-offset-4 hover:text-[var(--ink)]"
                      >
                        Open mijnpensioenoverzicht.nl
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </p>
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
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                      Vraag de actuele WOZ-waarde gratis op bij het officiële waardeloket.{' '}
                      <a
                        href="https://www.wozwaardeloket.nl/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--ink-2)] underline underline-offset-4 hover:text-[var(--ink)]"
                      >
                        Open WOZ-waardeloket
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </p>
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
                {visibleFields.includes('expiry_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Einddatum polis</label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('beneficiary') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Begunstigde</label>
                    <input
                      value={beneficiary}
                      onChange={(e) => setBeneficiary(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      placeholder="Bijv. partner, kinderen"
                    />
                  </div>
                )}
                {/* DGA-lening: link to deelneming + warning */}
                {subtype === 'dga_lening' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Gekoppelde deelneming</label>
                      <select
                        value={linkedAssetId}
                        onChange={(e) => setLinkedAssetId(e.target.value)}
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      >
                        <option value="">— Geen koppeling —</option>
                        {deelnemingOptions.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      {deelnemingOptions.length === 0 && (
                        <p className="mt-1 text-[10px] text-[var(--ink-4)]">Voeg eerst een deelneming toe onder Bezittingen.</p>
                      )}
                    </div>
                    {(() => {
                      const totalDga = dgaTotal + (Number(currentValue) || 0)
                      if (totalDga > 500000) return (
                        <div className="rounded-[var(--r)] border border-red-300 bg-red-50 p-3">
                          <p className="text-xs font-medium text-red-800">Wet excessief lenen: totaal DGA-leningen &euro;{totalDga.toLocaleString('nl-NL')} overschrijdt de grens van &euro;500.000.</p>
                          <p className="mt-0.5 text-[10px] text-red-600">Het meerdere boven &euro;500.000 wordt belast als box 2-inkomen (aanmerkelijk belang).</p>
                        </div>
                      )
                      if (totalDga > 400000) return (
                        <div className="rounded-[var(--r)] border border-amber-300 bg-amber-50 p-3">
                          <p className="text-xs font-medium text-amber-800">Let op: totaal DGA-leningen &euro;{totalDga.toLocaleString('nl-NL')} nadert de grens van &euro;500.000 (Wet excessief lenen).</p>
                        </div>
                      )
                      return null
                    })()}
                  </>
                )}
              </div>
            </div>
          )}

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
          <div className="mx-6 mt-3 rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" data-testid="asset-validation-error">
            {validationError}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 px-6 pb-6">
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
    </BottomSheet>
  )
}

// ── Shared types & components for valuations ─────────────────

export type Valuation = {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  valuation_date: string
  value: number
  notes: string | null
  created_at: string
}

export function ValuationModal({
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
    <BottomSheet open={true} onClose={onClose} title={label} size="md">
        <div className="px-6">
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
    </BottomSheet>
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
                <span className={`text-[10px] font-medium ${diff >= 0 ? 'text-positive' : 'text-negative'}`}>
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
