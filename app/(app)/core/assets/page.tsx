'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Plus, Trash2, Edit3, X, TrendingUp, RefreshCw, Search, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
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

type Mortgage = { id: string; name: string; current_balance: number; linked_asset_id: string | null }

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [mortgages, setMortgages] = useState<Mortgage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [modalStep, setModalStep] = useState<'detail' | 'edit' | 'revalue'>('detail')
  const [projectionYears, setProjectionYears] = useState(10)
  const [valuations, setValuations] = useState<Record<string, Valuation[]>>({})
  const seedingRef = useRef(false)

  function getMortgageForAsset(assetId: string): { name: string; balance: number } | null {
    const m = mortgages.find((m) => m.linked_asset_id === assetId)
    if (!m) return null
    return { name: m.name, balance: Number(m.current_balance) }
  }

  const loadAssets = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('assets')
        .select('*')
        .order('sort_order', { ascending: true })

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        if (seedingRef.current) return
        seedingRef.current = true
        // Double-check: count to prevent race conditions
        const { count } = await supabase.from('assets').select('id', { count: 'exact', head: true })
        if (count && count > 0) { seedingRef.current = false; await loadAssets(); return }
        await seedAssets(supabase)
        return
      }

      setAssets(data as Asset[])

      // Load linked mortgages
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: mortgageData } = await supabase
          .from('debts')
          .select('id, name, current_balance, linked_asset_id')
          .eq('user_id', user.id)
          .eq('debt_type', 'mortgage')
          .eq('is_active', true)
        if (mortgageData) setMortgages(mortgageData as Mortgage[])
      }
    } catch (err) {
      console.error('Error loading assets:', err)
      setError('Kon assets niet laden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

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
      .limit(20)
    if (data) {
      setValuations((prev) => ({ ...prev, [assetId]: data as Valuation[] }))
    }
  }, [])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadAssets() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Assets</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {activeAssets.length} actieve asset{activeAssets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditAsset(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" />
            Asset toevoegen
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Totale waarde</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalValue)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Maandelijkse inleg</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalMonthlyContrib)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Rendement (totaal)</p>
            {totalPurchase > 0 ? (
              <p className={`mt-1 text-xl font-bold ${totalValue >= totalPurchase ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalValue >= totalPurchase ? '+' : ''}{formatCurrency(totalValue - totalPurchase)}
              </p>
            ) : (
              <p className="mt-1 text-xl font-bold text-zinc-400">-</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Waarde over {projectionYears} jaar</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(futureValue)}</p>
          </div>
        </div>
      </section>

      {/* Allocation + projection */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Allocation */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-700">Verdeling</h2>
          <div className="mt-4 flex items-center gap-6">
            <AllocationPie byType={byType} total={totalValue} />
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
                    <span className="flex-1 text-xs text-zinc-600">{ASSET_TYPE_LABELS[type]}</span>
                    <span className="text-xs font-medium text-zinc-900">{pct.toFixed(0)}%</span>
                    <span className="text-xs text-zinc-400">{formatCurrency(data.total)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Projection chart */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700">Projectie</h2>
            <div className="flex items-center gap-1">
              {[5, 10, 20, 30].map((y) => (
                <button
                  key={y}
                  onClick={() => setProjectionYears(y)}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    projectionYears === y
                      ? 'bg-amber-100 text-amber-700'
                      : 'text-zinc-400 hover:text-zinc-600'
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
              <span className="text-zinc-500">Verwachte groei:</span>
              <span className="font-medium text-emerald-600">+{formatCurrency(projectedGrowth)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Asset list */}
      <section className="mt-6 space-y-2">
        {assets.map((asset) => {
          const value = Number(asset.current_value)
          const purchase = Number(asset.purchase_value)
          const returnPct = purchase > 0 ? ((value - purchase) / purchase) * 100 : 0
          const icon = ASSET_TYPE_ICONS[asset.asset_type] ?? 'Briefcase'
          const color = ASSET_TYPE_COLORS[asset.asset_type]

          return (
            <div
              key={asset.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-amber-200 hover:bg-amber-50/30"
              onClick={() => openAssetModal(asset)}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: color + '15' }}
              >
                <BudgetIcon name={icon} className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{asset.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {ASSET_TYPE_LABELS[asset.asset_type]}
                  {asset.subtype && ASSET_SUBTYPE_LABELS[asset.asset_type]?.[asset.subtype]
                    ? ` \u2022 ${ASSET_SUBTYPE_LABELS[asset.asset_type]![asset.subtype]}`
                    : ''}
                  {asset.institution ? ` \u2022 ${asset.institution}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-zinc-900">{formatCurrency(value)}</p>
                {purchase > 0 && (
                  <p className={`text-xs font-medium ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                  </p>
                )}
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
          onClose={() => { setShowForm(false); setEditAsset(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditAsset(null)
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
  onClose,
  onEdit,
  onRevalue,
  onDelete,
}: {
  asset: Asset
  valuations: Valuation[] | undefined
  mortgage: { name: string; balance: number } | null
  onClose: () => void
  onEdit: () => void
  onRevalue: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const value = Number(asset.current_value)
  const purchase = Number(asset.purchase_value)
  const returnPct = purchase > 0 ? ((value - purchase) / purchase) * 100 : 0
  const icon = ASSET_TYPE_ICONS[asset.asset_type] ?? 'Briefcase'
  const color = ASSET_TYPE_COLORS[asset.asset_type]
  const isEigenHuis = asset.asset_type === 'eigen_huis'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: color + '15' }}
          >
            <BudgetIcon name={icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-zinc-900">{asset.name}</h2>
            <p className="text-xs text-zinc-500">
              {ASSET_TYPE_LABELS[asset.asset_type]}
              {asset.subtype && ASSET_SUBTYPE_LABELS[asset.asset_type]?.[asset.subtype]
                ? ` \u2022 ${ASSET_SUBTYPE_LABELS[asset.asset_type]![asset.subtype]}`
                : ''}
              {asset.institution ? ` \u2022 ${asset.institution}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Value highlight */}
        <div className="border-b border-zinc-100 px-6 py-4 text-center">
          {isEigenHuis && <p className="mb-1 text-xs font-medium text-zinc-500 uppercase">Marktwaarde</p>}
          <p className="text-3xl font-bold text-zinc-900">{formatCurrency(value)}</p>
          {purchase > 0 && (
            <p className={`mt-1 text-sm font-medium ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% ({returnPct >= 0 ? '+' : ''}{formatCurrency(value - purchase)})
            </p>
          )}
          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {asset.risk_profile && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                asset.risk_profile === 'laag' ? 'bg-emerald-100 text-emerald-700' :
                asset.risk_profile === 'middel' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                Risico: {RISK_PROFILE_LABELS[asset.risk_profile]}
              </span>
            )}
            {asset.is_liquid === true && (
              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Liquide</span>
            )}
            {asset.is_liquid === false && (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">Vastgezet</span>
            )}
            {asset.tax_benefit && (
              <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Fiscaal voordeel</span>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">{isEigenHuis ? 'Aankoopprijs' : 'Aankoopwaarde'}</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">{purchase > 0 ? formatCurrency(purchase) : '-'}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Verwacht rendement</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">{Number(asset.expected_return)}% p.j.</p>
            </div>
            {!isEigenHuis && (
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="text-xs text-zinc-500">Maandelijkse inleg</p>
                <p className="mt-0.5 text-sm font-medium text-zinc-900">
                  {Number(asset.monthly_contribution) > 0 ? formatCurrency(Number(asset.monthly_contribution)) : '-'}
                </p>
              </div>
            )}
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Aankoopdatum</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">
                {asset.purchase_date
                  ? new Date(asset.purchase_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '-'}
              </p>
            </div>
          </div>

          {/* Hypotheek + overwaarde (eigen woning) */}
          {isEigenHuis && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-700/60 uppercase">Hypotheek</p>
              {mortgage ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-600">{mortgage.name}</span>
                    <span className="text-sm font-medium text-zinc-900">{formatCurrency(mortgage.balance)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-amber-200/60 pt-2">
                    <span className="text-xs font-medium text-zinc-700">Overwaarde</span>
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
                <p className="text-xs text-zinc-500">Geen hypotheek gekoppeld. Koppel een hypotheek via De Kern &gt; Schulden.</p>
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
                  <div key={d.label} className="rounded-lg bg-amber-50/50 p-3">
                    <p className="text-xs text-amber-700/60">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-900">{d.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {asset.notes && (
            <p className="text-xs text-zinc-500">{asset.notes}</p>
          )}

          {/* Valuation history */}
          {valuations && valuations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Waardehistorie</p>
              <div className="space-y-1">
                {valuations.slice(0, 5).map((v) => {
                  const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
                  const diff = prev ? Number(v.value) - Number(prev.value) : null
                  return (
                    <div key={v.id} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-zinc-400">
                        {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="font-medium text-zinc-700">{formatCurrency(Number(v.value))}</span>
                      {diff !== null && (
                        <span className={`text-[10px] font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-zinc-200 px-6 py-4">
          <button
            onClick={onRevalue}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Herwaarderen
          </button>
          <button
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Bewerken
          </button>
          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Bevestigen
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Allocation pie chart (SVG donut) ─────────────────────────

function AllocationPie({
  byType,
  total,
}: {
  byType: Record<AssetType, { assets: Asset[]; total: number }>
  total: number
}) {
  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = 45
  const strokeWidth = 22

  const segments: { type: AssetType; pct: number; color: string }[] = []
  for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
    const pct = total > 0 ? byType[type].total / total : 0
    if (pct > 0) segments.push({ type, pct, color: ASSET_TYPE_COLORS[type] })
  }

  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {segments.map((seg) => {
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
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-currentOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#18181b">
        {formatCurrency(total)}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#a1a1aa">
        totaal
      </text>
    </svg>
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
  if (data.length === 0) return <div className="flex h-40 items-center justify-center text-xs text-zinc-400">Geen data</div>

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
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-auto w-full" preserveAspectRatio="xMidYMid meet">
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

      <path d={areaPath} fill="#10b981" fillOpacity="0.12" />
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth="1.5" />

      {sampled.filter((_, i) => i % Math.max(1, Math.floor(sampled.length / 5)) === 0).map((d) => (
        <text key={d.month} x={x(d.month)} y={h - 5} textAnchor="middle" fontSize="7" fill="#a1a1aa">
          {d.month >= 12 ? `${Math.floor(d.month / 12)}j` : `${d.month}m`}
        </text>
      ))}
    </svg>
  )
}

// ── Asset form modal ─────────────────────────────────────────

function AssetForm({
  asset,
  onClose,
  onSaved,
}: {
  asset?: Asset
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!asset

  const [name, setName] = useState(asset?.name ?? '')
  const [assetType, setAssetType] = useState<AssetType>(asset?.asset_type ?? 'savings')
  const [currentValue, setCurrentValue] = useState(String(asset?.current_value ?? ''))
  const [purchaseValue, setPurchaseValue] = useState(String(asset?.purchase_value ?? ''))
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? '')
  const [expectedReturn, setExpectedReturn] = useState(String(asset?.expected_return ?? TYPICAL_RETURNS.savings))
  const [monthlyContribution, setMonthlyContribution] = useState(String(asset?.monthly_contribution ?? '0'))
  const [institution, setInstitution] = useState(asset?.institution ?? '')
  const [notes, setNotes] = useState(asset?.notes ?? '')
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
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const row = {
      user_id: user.id,
      name,
      asset_type: assetType,
      current_value: Number(currentValue) || 0,
      purchase_value: Number(purchaseValue) || 0,
      purchase_date: purchaseDate || null,
      expected_return: Number(expectedReturn) || 0,
      monthly_contribution: Number(monthlyContribution) || 0,
      institution: institution || null,
      notes: notes || null,
      // Type-specific fields
      subtype: subtype || null,
      risk_profile: riskProfile || null,
      tax_benefit: visibleFields.includes('tax_benefit') ? taxBenefit : null,
      is_liquid: visibleFields.includes('is_liquid') ? isLiquid : null,
      lock_end_date: lockEndDate || null,
      ticker_symbol: tickerSymbol || null,
      rental_income: rentalIncome ? Number(rentalIncome) : null,
      woz_value: wozValue ? Number(wozValue) : null,
      retirement_provider_type: retirementProviderType || null,
      depreciation_rate: depreciationRate ? Number(depreciationRate) : null,
      address_postcode: addressPostcode || null,
      address_house_number: addressHouseNumber || null,
    }

    if (isEdit && asset) {
      await supabase.from('assets').update(row).eq('id', asset.id)
    } else {
      await supabase.from('assets').insert(row)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">
            {isEdit ? 'Asset bewerken' : 'Nieuwe asset'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Naam</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Spaarrekening"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
              <select
                value={assetType}
                onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subtype dropdown (conditional) */}
          {subtypeOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Subtype</label>
              <select
                value={subtype}
                onChange={(e) => handleSubtypeChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">Selecteer subtype...</option>
                {Object.entries(subtypeOptions).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {assetType === 'eigen_huis' ? 'Marktwaarde' : 'Huidige waarde'}
              </label>
              <input
                type="number"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {assetType === 'eigen_huis' ? 'Aankoopprijs' : 'Aankoopwaarde'}
              </label>
              <input
                type="number"
                value={purchaseValue}
                onChange={(e) => setPurchaseValue(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className={`grid ${assetType === 'eigen_huis' ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Rendement (% p.j.)</label>
              <input
                type="number"
                step="0.1"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            {assetType !== 'eigen_huis' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Inleg p/m</label>
                <input
                  type="number"
                  value={monthlyContribution}
                  onChange={(e) => setMonthlyContribution(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Aankoopdatum</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {assetType !== 'eigen_huis' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Instelling</label>
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="ABN AMRO, DEGIRO, ABP..."
              />
            </div>
          )}

          {/* Type-specific fields */}
          {visibleFields.length > 0 && visibleFields.some((f) => f !== 'subtype') && (
            <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/30 p-3">
              <p className="text-xs font-semibold text-amber-700/60 uppercase">Details</p>
              <div className="grid grid-cols-2 gap-3">
                {visibleFields.includes('risk_profile') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Risicoprofiel</label>
                    <select
                      value={riskProfile}
                      onChange={(e) => setRiskProfile(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Ticker / ISIN</label>
                    <input
                      value={tickerSymbol}
                      onChange={(e) => setTickerSymbol(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder="VWRL, IWDA..."
                    />
                  </div>
                )}
                {visibleFields.includes('is_liquid') && (
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={isLiquid}
                      onChange={(e) => setIsLiquid(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    Direct opneembaar
                  </label>
                )}
                {visibleFields.includes('lock_end_date') && !isLiquid && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Vastgezet tot</label>
                    <input
                      type="date"
                      value={lockEndDate}
                      onChange={(e) => setLockEndDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('tax_benefit') && (
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={taxBenefit}
                      onChange={(e) => setTaxBenefit(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    Fiscaal voordeel
                  </label>
                )}
                {visibleFields.includes('retirement_provider_type') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Pensioenuitvoerder</label>
                    <select
                      value={retirementProviderType}
                      onChange={(e) => setRetirementProviderType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Postcode</label>
                    <input
                      value={addressPostcode}
                      onChange={(e) => setAddressPostcode(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder="1234 AB"
                    />
                  </div>
                )}
                {visibleFields.includes('address_house_number') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Huisnummer</label>
                    <div className="flex gap-2">
                      <input
                        value={addressHouseNumber}
                        onChange={(e) => setAddressHouseNumber(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="42"
                      />
                      <button
                        type="button"
                        onClick={handleWozLookup}
                        disabled={wozLoading || !addressPostcode || !addressHouseNumber}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {wozLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        WOZ
                      </button>
                    </div>
                  </div>
                )}
                {wozResult && (
                  <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="mb-2 text-xs font-semibold text-emerald-700">WOZ-waarden gevonden</p>
                    <div className="space-y-1">
                      {wozResult.map((w) => (
                        <div key={w.peildatum} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-600">{new Date(w.peildatum).toLocaleDateString('nl-NL', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          <span className="font-medium text-zinc-900">{formatCurrency(w.waarde)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {wozError && (
                  <div className="col-span-2 rounded-lg border border-red-200 bg-red-50/50 p-2">
                    <p className="text-xs text-red-600">{wozError}</p>
                  </div>
                )}
                {visibleFields.includes('rental_income') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Huurinkomsten p/m</label>
                    <input
                      type="number"
                      value={rentalIncome}
                      onChange={(e) => setRentalIncome(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('woz_value') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">WOZ-waarde</label>
                    <input
                      type="number"
                      value={wozValue}
                      onChange={(e) => setWozValue(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('depreciation_rate') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Afschrijving (% p.j.)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={depreciationRate}
                      onChange={(e) => setDepreciationRate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !currentValue}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
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

  async function handleSave() {
    if (!value) return
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
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">{label}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-500">{entityName}</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              {entityType === 'asset' ? 'Nieuwe waarde' : 'Nieuw saldo'}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-zinc-400">
              Huidige waarde: {formatCurrency(currentValue)}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notitie (optioneel)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Reden van waardewijziging..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
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
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Waardehistorie</p>
      <div className="space-y-1">
        {valuations.map((v) => {
          const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
          const diff = prev ? Number(v.value) - Number(prev.value) : null
          return (
            <div key={v.id} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-zinc-400">
                {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="font-medium text-zinc-700">{formatCurrency(Number(v.value))}</span>
              {diff !== null && (
                <span className={`text-[10px] font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                </span>
              )}
              {v.notes && (
                <span className="truncate text-zinc-400">{v.notes}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
